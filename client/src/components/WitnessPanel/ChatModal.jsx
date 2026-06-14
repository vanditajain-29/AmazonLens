import React, { useState, useRef, useEffect } from "react";
import { X, Send, Loader, Radio, ChevronDown, MessageCircle, Maximize2, Minimize2 } from "lucide-react";
import axios from "axios";
import { API } from "../../utils/format.js";
import { getSocket } from "../../utils/socket.js";

const QUICK_QUESTIONS = [
  "Is the picture quality good?",
  "Any issues after long-term use?",
  "How's the sound?",
  "Worth the price?",
];

export default function ChatModal({ witness, product, onClose }) {
  const isLive = !!witness.isLive;

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: isLive
        ? `Connecting to ${witness.name}…`
        : `Hi! I'm ${witness.name} from ${witness.city}. I've had this ${product.name.split(" ").slice(0, 4).join(" ")} for ${witness.monthsOwned} months. What would you like to know?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [liveStatus, setLiveStatus] = useState(isLive ? "connecting" : "ai");
  const [roomId] = useState(() => `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!minimized) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, minimized]);

  // Auto-expand when witness accepts
  useEffect(() => {
    if (liveStatus === "active") {
      setMinimized(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [liveStatus]);

  useEffect(() => {
    if (!isLive) {
      inputRef.current?.focus();
      return;
    }

    const socket = getSocket();
    socketRef.current = socket;

    socket.emit("chat:start", {
      productId: product.id,
      witnessSocketId: witness.socketId,
      roomId,
      buyerName: "A shopper",
    });
    setLiveStatus("waiting");

    socket.on("chat:accepted", ({ roomId: rid }) => {
      if (rid !== roomId) return;
      setLiveStatus("active");
      setMessages([{ role: "assistant", content: `${witness.name} accepted! Ask anything — they're live.` }]);
    });

    socket.on("chat:declined", ({ roomId: rid }) => {
      if (rid !== roomId) return;
      setLiveStatus("declined");
      setMessages([{
        role: "assistant",
        content: `${witness.name} isn't available right now. Switching to AI simulation — same persona, based on their real ownership data.`,
      }]);
      setTimeout(() => setLiveStatus("ai"), 2000);
    });

    socket.on("chat:timeout", ({ roomId: rid }) => {
      if (rid !== roomId) return;
      setLiveStatus("timeout");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `${witness.name} didn't respond. Switching to AI simulation.` },
      ]);
      setTimeout(() => setLiveStatus("ai"), 2000);
    });

    socket.on("chat:message", ({ roomId: rid, text, from }) => {
      if (rid !== roomId || from !== "witness") return;
      setMessages((prev) => [...prev, { role: "assistant", content: text }]);
      setMinimized(false); // pop open when witness replies
    });

    socket.on("chat:ended", ({ roomId: rid }) => {
      if (rid !== roomId) return;
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `${witness.name} ended the chat.` },
      ]);
      setLiveStatus("ended");
    });

    return () => {
      socket.off("chat:accepted");
      socket.off("chat:declined");
      socket.off("chat:timeout");
      socket.off("chat:message");
      socket.off("chat:ended");
    };
  }, [isLive]);

  const handleClose = () => {
    if (isLive && (liveStatus === "active" || liveStatus === "waiting")) {
      socketRef.current?.emit("chat:end", { roomId });
    }
    onClose();
  };

  const sendMessage = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);

    if (liveStatus === "active") {
      socketRef.current.emit("chat:message", { roomId, text: userMsg });
      return;
    }

    setLoading(true);
    try {
      const history = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));
      const { data } = await axios.post(`${API}/api/witness/chat`, {
        productId: product.id,
        witnessId: witness.id || `live_${witness.socketId}`,
        message: userMsg,
        history,
        witnessContext: isLive ? {
          name: witness.name,
          city: witness.city,
          monthsOwned: witness.monthsOwned,
          wouldBuyAgain: witness.wouldBuyAgain,
        } : null,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Having a bit of trouble — try again in a moment!" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const canSend = liveStatus === "active" || liveStatus === "ai";
  const isConnecting = liveStatus === "connecting" || liveStatus === "waiting";

  // ── Minimized pill ─────────────────────────────────────────────────────────
  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2 bg-white border border-gray-200 rounded-2xl shadow-lg px-4 py-2.5 cursor-pointer hover:shadow-xl transition-shadow"
        onClick={() => setMinimized(false)}>
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#131921] to-[#232F3E] flex items-center justify-center text-white text-xs font-bold">
            {witness.avatar}
          </div>
          {liveStatus === "active" && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white animate-pulse" />
          )}
          {isConnecting && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-yellow-400 rounded-full border-2 border-white animate-pulse" />
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-[#0F1111] leading-tight">{witness.name}</p>
          <p className="text-[10px] text-[#565959] leading-tight">
            {isConnecting ? "Waiting for response…" : liveStatus === "active" ? "Live chat active" : "Tap to open"}
          </p>
        </div>
        <MessageCircle size={14} className="text-[#007185] ml-1" />
      </div>
    );
  }

  // ── Full panel ─────────────────────────────────────────────────────────────
  const panelW = expanded ? "w-[560px]" : "w-80";
  return (
    <div className={`fixed bottom-4 right-4 z-[9999] ${panelW} bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[520px]`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#131921] to-[#232F3E] flex items-center justify-center text-white font-bold text-sm">
              {witness.avatar}
            </div>
            {liveStatus === "active" && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
            )}
          </div>
          <div>
            <p className="font-bold text-[#0F1111] text-sm leading-tight">{witness.name}</p>
            <div className="flex items-center gap-1">
              {liveStatus === "active" && (
                <>
                  <Radio size={9} className="text-green-600 animate-pulse" />
                  <p className="text-[10px] text-green-600 font-medium">Live</p>
                </>
              )}
              {isConnecting && (
                <>
                  <Loader size={9} className="animate-spin text-[#007185]" />
                  <p className="text-[10px] text-[#007185]">Connecting…</p>
                </>
              )}
              {(liveStatus === "ai" || !isLive) && (
                <p className="text-[10px] text-[#565959]">{witness.monthsOwned}mo · {witness.city}</p>
              )}
              {liveStatus === "ended" && (
                <p className="text-[10px] text-[#999]">Chat ended</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setExpanded((e) => !e)} className="text-gray-400 hover:text-gray-600 p-1" title={expanded ? "Collapse" : "Expand"}>
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            onClick={() => setMinimized(true)}
            className="text-gray-400 hover:text-gray-600 p-1"
            title="Minimise — keep chat open"
          >
            <ChevronDown size={17} />
          </button>
          {isLive && (liveStatus === "active" || isConnecting) ? (
            <button
              onClick={handleClose}
              className="text-[11px] text-[#CC0C39] border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-full ml-1 font-medium transition-colors"
            >
              End
            </button>
          ) : (
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 p-1" title="Close">
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Waiting banner — shown when connecting so buyer knows they can minimize */}
      {isConnecting && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-2">
          <Loader size={12} className="animate-spin text-amber-500 flex-shrink-0" />
          <p className="text-[11px] text-amber-700">
            Waiting for {witness.name.split(" ")[0]} to accept…{" "}
            <button onClick={() => setMinimized(true)} className="underline font-medium">Browse freely</button>
            {" "}— we'll pop this open when they reply.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {messages.map((msg, i) => {
          if (msg.role === "system") {
            return <div key={i} className="text-center text-[10px] text-[#999] py-1">{msg.content}</div>;
          }
          return (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#131921] to-[#232F3E] flex items-center justify-center text-white text-[9px] font-bold mr-1.5 flex-shrink-0 mt-0.5">
                  {witness.avatar}
                </div>
              )}
              <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#131921] text-white rounded-br-sm"
                  : "bg-gray-100 text-[#0F1111] rounded-bl-sm"
              }`}>
                {msg.content}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#131921] to-[#232F3E] flex items-center justify-center text-white text-[9px] font-bold">
              {witness.avatar}
            </div>
            <div className="bg-gray-100 px-3 py-2 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
              <Loader size={12} className="animate-spin" />
              <span className="text-xs text-[#565959]">Typing…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick questions */}
      {(liveStatus === "ai" || !isLive) && messages.length <= 2 && (
        <div className="px-4 pb-2">
          <p className="text-[10px] text-[#565959] mb-1.5">Quick questions:</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="text-[10px] bg-blue-50 border border-blue-200 text-[#007185] hover:bg-blue-100 px-2 py-0.5 rounded-full transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
        <div className={`flex items-center gap-2 rounded-full border px-3 py-2 ${
          canSend ? "bg-gray-50 border-gray-200" : "bg-gray-100 border-gray-100"
        }`}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={isConnecting ? "Waiting for witness…" : `Ask ${witness.name.split(" ")[0]}…`}
            disabled={!canSend}
            className="flex-1 bg-transparent text-xs text-[#0F1111] outline-none placeholder-gray-400 disabled:cursor-not-allowed"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || !canSend || loading}
            className="text-[#131921] hover:text-[#FF9900] disabled:text-gray-300 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
