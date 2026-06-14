import React, { useState, useRef, useEffect } from "react";
import { useWitness } from "../contexts/WitnessContext.jsx";
import {
  Radio, Send, CheckCircle, XCircle, ChevronDown, Maximize2, Minimize2, LogOut, Loader,
} from "lucide-react";

const QUICK_REPLIES = [
  "Yes, absolutely!",
  "In my experience, yes.",
  "Hmm, it depends.",
  "I'd say no, actually.",
];

export default function WitnessToast() {
  const {
    witnessInfo, incomingRequest, activeRoom, chatMessages,
    acceptChat, declineChat, sendMessage, endChat, goOffline,
  } = useWitness();

  const [input, setInput] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-open on new request or chat
  useEffect(() => { if (incomingRequest) setMinimized(false); }, [incomingRequest]);
  useEffect(() => { if (activeRoom) { setMinimized(false); setTimeout(() => inputRef.current?.focus(), 100); } }, [activeRoom]);
  useEffect(() => {
    if (!minimized) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, minimized]);

  const handleSend = (text) => {
    const msg = text || input.trim();
    if (!msg) return;
    setInput("");
    sendMessage(msg);
  };

  if (!witnessInfo) return null;

  const panelW = expanded ? "w-[560px]" : "w-80";

  // ── Waiting pill ────────────────────────────────────────────────────────────
  if (!incomingRequest && !activeRoom) {
    return (
      <div className="fixed bottom-4 right-4 z-[9998] bg-white border border-green-200 rounded-2xl shadow-md px-4 py-2.5 flex items-center gap-3">
        <Radio size={13} className="text-green-600 animate-pulse flex-shrink-0" />
        <div>
          <p className="text-xs font-bold text-[#0F1111] leading-tight">Witness Live · {witnessInfo.name}</p>
          <p className="text-[10px] text-[#565959] leading-tight">Waiting for shoppers…</p>
        </div>
        <button
          onClick={goOffline}
          className="flex items-center gap-1 text-[11px] text-[#CC0C39] border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-full transition-colors ml-1 font-medium flex-shrink-0"
        >
          <LogOut size={11} /> End Witness
        </button>
      </div>
    );
  }

  // ── Incoming request panel ──────────────────────────────────────────────────
  if (incomingRequest) {
    return (
      <div className={`fixed bottom-4 right-4 z-[9998] ${panelW} bg-white rounded-2xl shadow-2xl border-2 border-[#FF9900] flex flex-col max-h-[520px]`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#131921] to-[#232F3E] flex items-center justify-center text-white font-bold text-sm">
              {witnessInfo.avatar}
            </div>
            <div>
              <p className="font-bold text-[#0F1111] text-sm leading-tight">Someone wants to chat!</p>
              <p className="text-[10px] text-[#565959]">WitnessPanel™ request</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setExpanded((e) => !e)} className="text-gray-400 hover:text-gray-600 p-1">
              {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>

        {/* Request body */}
        <div className="px-4 py-4 flex-1">
          <p className="text-sm text-[#0F1111] mb-1">
            <strong>{incomingRequest.buyerName}</strong> is asking about your{" "}
            <span className="text-[#007185] font-medium">{witnessInfo.productName?.slice(0, 45)}</span>
          </p>
          <p className="text-xs text-[#565959] mb-5">They want your honest take as a real owner.</p>
          <div className="flex gap-2">
            <button
              onClick={declineChat}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-gray-300 rounded-full text-sm text-[#565959] hover:border-gray-400 transition-colors"
            >
              <XCircle size={14} /> Decline
            </button>
            <button
              onClick={acceptChat}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#131921] text-white rounded-full text-sm font-bold hover:bg-[#232F3E] transition-colors"
            >
              <CheckCircle size={14} /> Accept
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active chat ─────────────────────────────────────────────────────────────

  // Minimized pill
  if (minimized) {
    return (
      <div
        className="fixed bottom-4 right-4 z-[9998] flex items-center gap-2 bg-white border border-green-200 rounded-2xl shadow-lg px-4 py-2.5 cursor-pointer hover:shadow-xl transition-shadow"
        onClick={() => setMinimized(false)}
      >
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#131921] to-[#232F3E] flex items-center justify-center text-white text-xs font-bold">
            {witnessInfo.avatar}
          </div>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white animate-pulse" />
        </div>
        <div>
          <p className="text-xs font-semibold text-[#0F1111] leading-tight">Live Chat</p>
          <p className="text-[10px] text-[#565959] leading-tight">{activeRoom.buyerName} · tap to open</p>
        </div>
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse ml-1" />
      </div>
    );
  }

  // Full panel
  return (
    <div className={`fixed bottom-4 right-4 z-[9998] ${panelW} bg-white rounded-2xl shadow-2xl border border-green-200 flex flex-col max-h-[520px]`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#131921] to-[#232F3E] flex items-center justify-center text-white font-bold text-sm">
              {witnessInfo.avatar}
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white animate-pulse" />
          </div>
          <div>
            <p className="font-bold text-[#0F1111] text-sm leading-tight">Live Chat</p>
            <div className="flex items-center gap-1">
              <Radio size={9} className="text-green-600 animate-pulse" />
              <p className="text-[10px] text-green-600 font-medium">{activeRoom.buyerName}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setExpanded((e) => !e)} className="text-gray-400 hover:text-gray-600 p-1" title={expanded ? "Collapse" : "Expand"}>
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button onClick={() => setMinimized(true)} className="text-gray-400 hover:text-gray-600 p-1" title="Minimise">
            <ChevronDown size={17} />
          </button>
          <button
            onClick={endChat}
            className="text-[11px] text-[#CC0C39] border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-full ml-1 font-medium transition-colors"
          >
            End
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {chatMessages.map((msg, i) => {
          if (msg.from === "system") {
            return <div key={i} className="text-center text-[10px] text-[#999] py-1">{msg.text}</div>;
          }
          const isMe = msg.from === "witness";
          return (
            <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              {!isMe && (
                <div className="w-6 h-6 rounded-full bg-[#007185] flex items-center justify-center text-white text-[9px] font-bold mr-1.5 flex-shrink-0 mt-0.5">
                  {activeRoom.buyerName?.[0]?.toUpperCase() || "S"}
                </div>
              )}
              <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                isMe
                  ? "bg-[#131921] text-white rounded-br-sm"
                  : "bg-gray-100 text-[#0F1111] rounded-bl-sm"
              }`}>
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      <div className="px-4 pb-2 flex flex-wrap gap-1.5">
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            onClick={() => handleSend(q)}
            className="text-[10px] bg-gray-50 border border-gray-200 text-[#565959] hover:border-[#FF9900] hover:text-[#C45500] px-2.5 py-1 rounded-full transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2 rounded-full border bg-gray-50 border-gray-200 px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Share your experience…"
            className="flex-1 bg-transparent text-xs text-[#0F1111] outline-none placeholder-gray-400"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="text-[#131921] hover:text-[#FF9900] disabled:text-gray-300 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
