/**
 * AmazonLens – Co-Planner v2 (Production-Ready)
 * Shared goal shopping planner with:
 * - Invite links with expiration
 * - Roles (owner/admin/member)
 * - Expense splitting
 * - Wishlist/checklist with statuses
 * - Duplicate prevention (fuzzy matching)
 * - Activity feed
 * - Timeline planning
 * - Budget tracking (spent/planned/remaining)
 * - Plan health score
 * - Smart recommendations
 * - Archive support
 */

import { Router } from "express";
import { products } from "../data/mockData.js";
import crypto from "crypto";

const router = Router();

// ─── In-memory store ─────────────────────────────────────────────────────────
const plans = new Map();
const invites = new Map(); // token -> { planId, expiresAt, createdBy, usedCount }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateId() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

function now() {
  return new Date().toISOString();
}

function getProduct(id) {
  const p = products.find((pr) => pr.id === id);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    originalPrice: p.originalPrice,
    image: p.images?.[0] || p.thumbnail,
    category: p.category,
    trustScore: p.trustScore,
    rating: p.rating,
    reviewCount: p.reviewCount,
  };
}

function fuzzyMatch(a, b) {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Word overlap
  const wordsA = a.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const wordsB = b.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const overlap = wordsA.filter((w) => wordsB.some((wb) => wb.includes(w) || w.includes(wb)));
  return overlap.length >= Math.min(2, Math.max(1, Math.floor(wordsA.length * 0.5)));
}

function calculateHealthScore(plan) {
  let score = 100;
  const stats = getPlanStats(plan);

  // Budget adherence (-20 if over budget)
  if (stats.totalSpent > plan.budget) score -= 20;
  else if (stats.totalSpent + stats.totalPlanned > plan.budget) score -= 10;

  // Completion rate (reward progress)
  const purchased = plan.items.filter((i) => i.status === "purchased" || i.status === "delivered").length;
  const total = plan.items.length;
  if (total > 0) {
    const completionPct = purchased / total;
    score -= Math.round((1 - completionPct) * 15);
  }

  // Unassigned items penalty
  const unassigned = plan.items.filter((i) => !i.assignedTo && i.status !== "purchased" && i.status !== "delivered").length;
  if (total > 0 && unassigned / total > 0.5) score -= 10;

  // Overdue items
  const overdue = plan.items.filter((i) => i.neededBy && new Date(i.neededBy) < new Date() && i.status !== "purchased" && i.status !== "delivered").length;
  score -= overdue * 5;

  return Math.max(0, Math.min(100, score));
}

function getPlanStats(plan) {
  const enrichedItems = plan.items.map((item) => ({ ...item, product: getProduct(item.productId) }));
  const totalSpent = enrichedItems
    .filter((i) => i.status === "purchased" || i.status === "delivered")
    .reduce((s, i) => s + (i.product?.price || 0), 0);
  const totalPlanned = enrichedItems
    .filter((i) => i.status !== "purchased" && i.status !== "delivered")
    .reduce((s, i) => s + (i.product?.price || 0), 0);
  const remaining = plan.budget - totalSpent - totalPlanned;

  const memberSpending = {};
  plan.members.forEach((m) => { memberSpending[m.name] = 0; });
  enrichedItems.forEach((i) => {
    if (i.assignedTo && memberSpending[i.assignedTo] !== undefined) {
      memberSpending[i.assignedTo] += i.product?.price || 0;
    }
  });

  return {
    totalSpent,
    totalPlanned,
    remaining: Math.max(0, plan.budget - totalSpent),
    itemCount: plan.items.length,
    purchasedCount: plan.items.filter((i) => i.status === "purchased" || i.status === "delivered").length,
    assignedCount: plan.items.filter((i) => i.assignedTo).length,
    overBudget: totalSpent > plan.budget,
    perMemberBudget: plan.members.length > 0 ? Math.round(plan.budget / plan.members.length) : plan.budget,
    memberSpending,
    pendingCount: plan.items.filter((i) => i.status === "need_to_buy").length,
  };
}

function enrichPlan(plan) {
  const enrichedItems = plan.items.map((item) => ({
    ...item,
    product: getProduct(item.productId),
  }));

  const stats = getPlanStats(plan);
  const health = calculateHealthScore(plan);

  return {
    ...plan,
    items: enrichedItems,
    stats,
    health,
  };
}

function addActivity(plan, action, by, meta = {}) {
  plan.activity.unshift({ id: generateId(), action, by, at: now(), ...meta });
  if (plan.activity.length > 100) plan.activity.length = 100;
}

// ─── CATEGORY SUGGESTIONS ────────────────────────────────────────────────────
const CATEGORY_RECOMMENDATIONS = {
  "Electronics > Televisions": ["p002", "p008", "p009"],
  "Electronics > Audio": ["p008", "p009"],
  "Home & Kitchen": ["p005"],
  "Grocery": ["p007"],
};

const FORGOTTEN_ITEMS = {
  tv: ["p009", "p008", "p002"],
  audio: ["p009"],
  kitchen: ["p005"],
  bedroom: ["p007"],
};

// ─── POST /api/co-planner/create ─────────────────────────────────────────────
router.post("/create", (req, res) => {
  const { name, description, budget, targetDate, category, createdBy } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: "Goal name is required" });

  const plan = {
    id: generateId(),
    name: name.trim(),
    description: description?.trim() || "",
    budget: budget || 50000,
    targetDate: targetDate || null,
    category: category || "general",
    status: "active", // active | completed | archived
    members: [{ name: createdBy || "You", role: "owner", color: "#FF9900", joinedAt: now() }],
    items: [],
    activity: [{ id: generateId(), action: "Plan created", by: createdBy || "You", at: now() }],
    expenses: [], // { id, productId, amount, splitType, splits: [{member, amount, paid}] }
    notifications: [],
    createdAt: now(),
  };

  plans.set(plan.id, plan);
  res.json({ plan: enrichPlan(plan) });
});

// ─── GET /api/co-planner/:planId ─────────────────────────────────────────────
router.get("/:planId", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  res.json({ plan: enrichPlan(plan) });
});

// ─── POST /api/co-planner/:planId/invite ─────────────────────────────────────
router.post("/:planId/invite", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const { expiration, createdBy } = req.body; // "never" | "24h" | "7d"
  const token = generateToken();

  let expiresAt = null;
  if (expiration === "24h") expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  else if (expiration === "7d") expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const invite = {
    token,
    planId: plan.id,
    planName: plan.name,
    expiresAt,
    createdBy: createdBy || "You",
    createdAt: now(),
    usedCount: 0,
    revoked: false,
  };

  invites.set(token, invite);
  addActivity(plan, "Invite link created", createdBy || "You");

  res.json({ invite });
});

// ─── POST /api/co-planner/join/:token ────────────────────────────────────────
router.post("/join/:token", (req, res) => {
  const invite = invites.get(req.params.token);
  if (!invite) return res.status(404).json({ error: "Invalid invite link" });
  if (invite.revoked) return res.status(410).json({ error: "This invite has been revoked" });
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return res.status(410).json({ error: "This invite has expired" });
  }

  const plan = plans.get(invite.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const { memberName } = req.body;
  const name = memberName?.trim() || "Guest";

  if (plan.members.some((m) => m.name === name)) {
    return res.status(409).json({ error: "You're already in this plan" });
  }

  const colors = ["#007185", "#CC0C39", "#1B5E20", "#6366f1", "#db2777", "#0891b2", "#7c3aed"];
  const color = colors[plan.members.length % colors.length];

  plan.members.push({ name, role: "member", color, joinedAt: now() });
  invite.usedCount++;
  addActivity(plan, `${name} joined via invite`, name);

  res.json({ plan: enrichPlan(plan) });
});

// ─── POST /api/co-planner/:planId/revoke-invite ──────────────────────────────
router.post("/:planId/revoke-invite", (req, res) => {
  const { token } = req.body;
  const invite = invites.get(token);
  if (!invite) return res.status(404).json({ error: "Invite not found" });
  invite.revoked = true;
  res.json({ success: true });
});

// ─── POST /api/co-planner/:planId/add-item ───────────────────────────────────
router.post("/:planId/add-item", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const { productId, memberName, priority, neededBy } = req.body;
  const product = getProduct(productId);
  if (!product) return res.status(404).json({ error: "Product not found" });

  // Duplicate check (exact)
  if (plan.items.some((i) => i.productId === productId)) {
    const existing = plan.items.find((i) => i.productId === productId);
    return res.status(409).json({
      error: "duplicate",
      message: `Already added by ${existing.addedBy}`,
      existingItem: { ...existing, product: getProduct(existing.productId) },
    });
  }

  // Fuzzy duplicate check
  const fuzzyDup = plan.items.find((i) => {
    const p = getProduct(i.productId);
    return p && fuzzyMatch(p.name, product.name) && p.id !== productId;
  });
  if (fuzzyDup) {
    const dupProduct = getProduct(fuzzyDup.productId);
    return res.status(409).json({
      error: "similar_exists",
      message: `Similar item "${dupProduct?.name}" already added by ${fuzzyDup.addedBy}`,
      existingItem: { ...fuzzyDup, product: dupProduct },
      allowOverride: true,
    });
  }

  plan.items.push({
    productId,
    status: "need_to_buy",
    assignedTo: null,
    addedBy: memberName || "Anonymous",
    addedAt: now(),
    priority: priority || "important",
    neededBy: neededBy || null,
    comments: [],
    votes: 0,
    split: null,
  });

  addActivity(plan, `Added "${product.name}"`, memberName || "Anonymous", { productId });
  res.json({ plan: enrichPlan(plan) });
});

// ─── POST /api/co-planner/:planId/add-item-force ─────────────────────────────
// Bypasses fuzzy duplicate check
router.post("/:planId/add-item-force", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const { productId, memberName, priority, neededBy } = req.body;
  const product = getProduct(productId);
  if (!product) return res.status(404).json({ error: "Product not found" });

  if (plan.items.some((i) => i.productId === productId)) {
    return res.status(409).json({ error: "duplicate", message: "Exact duplicate exists" });
  }

  plan.items.push({
    productId,
    status: "need_to_buy",
    assignedTo: null,
    addedBy: memberName || "Anonymous",
    addedAt: now(),
    priority: priority || "important",
    neededBy: neededBy || null,
    comments: [],
    votes: 0,
    split: null,
  });

  addActivity(plan, `Added "${product.name}" (override)`, memberName || "Anonymous", { productId });
  res.json({ plan: enrichPlan(plan) });
});

// ─── POST /api/co-planner/:planId/assign ─────────────────────────────────────
router.post("/:planId/assign", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const { productId, assignTo } = req.body;
  const item = plan.items.find((i) => i.productId === productId);
  if (!item) return res.status(404).json({ error: "Item not in plan" });

  const prevAssigned = item.assignedTo;
  item.assignedTo = assignTo || null;
  item.status = assignTo ? "assigned" : "need_to_buy";

  const product = getProduct(productId);
  addActivity(plan, assignTo ? `Assigned "${product?.name}" to ${assignTo}` : `Unassigned "${product?.name}"`, "System", { productId });

  res.json({ plan: enrichPlan(plan) });
});

// ─── POST /api/co-planner/:planId/update-status ──────────────────────────────
router.post("/:planId/update-status", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const { productId, status, memberName } = req.body;
  const item = plan.items.find((i) => i.productId === productId);
  if (!item) return res.status(404).json({ error: "Item not in plan" });

  const validStatuses = ["need_to_buy", "assigned", "purchased", "delivered"];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

  item.status = status;
  const product = getProduct(productId);
  addActivity(plan, `Marked "${product?.name}" as ${status.replace(/_/g, " ")}`, memberName || "System", { productId });

  res.json({ plan: enrichPlan(plan) });
});

// ─── POST /api/co-planner/:planId/remove-item ────────────────────────────────
router.post("/:planId/remove-item", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const { productId, memberName } = req.body;
  const product = getProduct(productId);
  plan.items = plan.items.filter((i) => i.productId !== productId);
  addActivity(plan, `Removed "${product?.name}"`, memberName || "User", { productId });

  res.json({ plan: enrichPlan(plan) });
});

// ─── POST /api/co-planner/:planId/split-expense ──────────────────────────────
router.post("/:planId/split-expense", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const { productId, splitType, splits } = req.body;
  // splitType: "equal" | "percentage" | "amount" | "single_buyer"
  // splits: [{ member, amount, percentage, paid }]

  const item = plan.items.find((i) => i.productId === productId);
  if (!item) return res.status(404).json({ error: "Item not in plan" });

  const product = getProduct(productId);
  const price = product?.price || 0;

  let computedSplits;
  if (splitType === "equal") {
    const perPerson = Math.round(price / plan.members.length);
    computedSplits = plan.members.map((m) => ({ member: m.name, amount: perPerson, paid: false }));
  } else if (splitType === "percentage" && splits) {
    computedSplits = splits.map((s) => ({ member: s.member, amount: Math.round(price * (s.percentage || 0) / 100), paid: false }));
  } else if (splitType === "amount" && splits) {
    computedSplits = splits.map((s) => ({ member: s.member, amount: s.amount || 0, paid: false }));
  } else {
    computedSplits = [{ member: item.assignedTo || plan.members[0]?.name, amount: price, paid: false }];
  }

  item.split = { type: splitType, splits: computedSplits };

  const expenseEntry = { id: generateId(), productId, amount: price, splitType, splits: computedSplits, createdAt: now() };
  plan.expenses.push(expenseEntry);

  addActivity(plan, `Split expense for "${product?.name}" (${splitType})`, "System", { productId });
  res.json({ plan: enrichPlan(plan) });
});

// ─── POST /api/co-planner/:planId/leave ──────────────────────────────────────
router.post("/:planId/leave", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const { memberName } = req.body;
  const memberIdx = plan.members.findIndex((m) => m.name === memberName);
  if (memberIdx === -1) return res.status(404).json({ error: "Member not found" });

  const member = plan.members[memberIdx];

  if (plan.members.length === 1) {
    // Last member — archive
    plan.status = "archived";
    plan.members = [];
    addActivity(plan, `${memberName} left. Plan archived.`, memberName);
  } else if (member.role === "owner") {
    // Transfer ownership
    plan.members.splice(memberIdx, 1);
    plan.members[0].role = "owner";
    addActivity(plan, `${memberName} left. Ownership transferred to ${plan.members[0].name}`, memberName);
  } else {
    plan.members.splice(memberIdx, 1);
    addActivity(plan, `${memberName} left the plan`, memberName);
  }

  // Unassign their items
  plan.items.forEach((item) => {
    if (item.assignedTo === memberName) {
      item.assignedTo = null;
      item.status = "need_to_buy";
    }
  });

  res.json({ plan: enrichPlan(plan) });
});

// ─── POST /api/co-planner/:planId/comment ────────────────────────────────────
router.post("/:planId/comment", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const { productId, memberName, text } = req.body;
  const item = plan.items.find((i) => i.productId === productId);
  if (!item) return res.status(404).json({ error: "Item not in plan" });

  item.comments.push({ id: generateId(), by: memberName || "Anonymous", text, at: now() });
  const product = getProduct(productId);
  addActivity(plan, `Commented on "${product?.name}"`, memberName || "Anonymous", { productId });

  res.json({ plan: enrichPlan(plan) });
});

// ─── POST /api/co-planner/:planId/vote ───────────────────────────────────────
router.post("/:planId/vote", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const { productId, direction } = req.body;
  const item = plan.items.find((i) => i.productId === productId);
  if (!item) return res.status(404).json({ error: "Item not in plan" });

  if (direction === "down") {
    item.downvotes = (item.downvotes || 0) + 1;
  } else {
    item.votes = (item.votes || 0) + 1;
  }
  res.json({ plan: enrichPlan(plan) });
});

// ─── GET /api/co-planner/:planId/recommendations ─────────────────────────────
router.get("/:planId/recommendations", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const existingIds = new Set(plan.items.map((i) => i.productId));
  const existingCategories = plan.items
    .map((i) => getProduct(i.productId)?.category)
    .filter(Boolean);

  const remaining = plan.budget - getPlanStats(plan).totalSpent;

  // Find related products based on existing categories
  const recommended = products
    .filter((p) => !existingIds.has(p.id))
    .filter((p) => p.price <= remaining)
    .filter((p) => {
      return existingCategories.some((cat) => p.category === cat || p.category.split(" > ")[0] === cat.split(" > ")[0]);
    })
    .sort((a, b) => b.trustScore - a.trustScore)
    .slice(0, 6)
    .map((p) => getProduct(p.id));

  // Frequently forgotten items (based on what's already in plan)
  const forgotten = products
    .filter((p) => !existingIds.has(p.id))
    .filter((p) => p.price <= remaining)
    .filter((p) => p.price < 5000) // accessories/small items
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 4)
    .map((p) => getProduct(p.id));

  res.json({ recommended, forgotten, remainingBudget: remaining });
});

// ─── GET /api/co-planner/:planId/timeline ────────────────────────────────────
router.get("/:planId/timeline", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const today = new Date();
  const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthEnd = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const groups = { thisWeek: [], thisMonth: [], later: [], noDueDate: [] };

  plan.items.forEach((item) => {
    const enriched = { ...item, product: getProduct(item.productId) };
    if (!item.neededBy) {
      groups.noDueDate.push(enriched);
    } else {
      const due = new Date(item.neededBy);
      if (due <= weekEnd) groups.thisWeek.push(enriched);
      else if (due <= monthEnd) groups.thisMonth.push(enriched);
      else groups.later.push(enriched);
    }
  });

  res.json(groups);
});

// ─── POST /api/co-planner/:planId/archive ────────────────────────────────────
router.post("/:planId/archive", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  plan.status = "archived";
  addActivity(plan, "Plan archived", req.body.memberName || "System");
  res.json({ plan: enrichPlan(plan) });
});

// ─── GET /api/co-planner/:planId/expenses-summary ────────────────────────────
router.get("/:planId/expenses-summary", (req, res) => {
  const plan = plans.get(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const balances = {};
  plan.members.forEach((m) => { balances[m.name] = { owes: 0, owed: 0 }; });

  plan.expenses.forEach((exp) => {
    exp.splits.forEach((s) => {
      if (balances[s.member]) {
        if (!s.paid) balances[s.member].owes += s.amount;
        else balances[s.member].owed += s.amount;
      }
    });
  });

  res.json({ balances, totalExpenses: plan.expenses.length });
});

export default router;
