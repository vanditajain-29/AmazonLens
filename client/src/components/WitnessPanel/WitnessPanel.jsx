import React, { useState, useEffect, useRef } from "react";
import { MessageCircle, ThumbsUp, ThumbsDown, Users, Radio, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import ChatModal from "./ChatModal.jsx";
import { getSocket } from "../../utils/socket.js";

export default function WitnessPanel({ product }) {
  const [activeWitness, setActiveWitness] = useState(null);
  const [liveWitnesses, setLiveWitnesses] = useState([]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("witnesses:subscribe", { productId: product.id });
    socket.on("witnesses:list", (list) => setLiveWitnesses(list));
    socket.on("witnesses:updated", (list) => setLiveWitnesses(list));
    return () => {
      socket.off("witnesses:list");
      socket.off("witnesses:updated");
    };
  }, [product.id]);

  return (
    <div className="mt-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-[#131921]" />
          <div>
            <h2 className="font-bold text-[#0F1111] text-base">WitnessPanel™</h2>
            <p className="text-xs text-[#565959]">Chat live with real owners of this product</p>
          </div>
        </div>
        {liveWitnesses.length > 0 && (
          <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
            <Radio size={12} className="text-green-600 animate-pulse" />
            <span className="text-xs font-semibold text-green-700">
              {liveWitnesses.length} live now
            </span>
          </div>
        )}
      </div>

      {/* Live witness cards */}
      {liveWitnesses.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {liveWitnesses.map((witness) => (
            <div
              key={witness.socketId}
              className="border border-green-200 rounded-xl p-4 hover:shadow-sm hover:border-green-400 transition-all bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#131921] to-[#232F3E] flex items-center justify-center text-white font-bold text-sm">
                      {witness.avatar}
                    </div>
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white animate-pulse" />
                  </div>

                  {/* Info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-[#0F1111] text-sm">{witness.name}</h4>
                      <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <Radio size={8} className="animate-pulse" /> LIVE
                      </span>
                    </div>
                    <p className="text-xs text-[#565959]">
                      {witness.monthsOwned} months owned
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-xs bg-gray-100 text-[#565959] px-2 py-0.5 rounded-full">
                        📍 {witness.city}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                        witness.wouldBuyAgain
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}>
                        {witness.wouldBuyAgain
                          ? <><ThumbsUp size={10} /> Would buy again</>
                          : <><ThumbsDown size={10} /> Would not buy again</>}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setActiveWitness(witness)}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-2 rounded-full flex-shrink-0 transition-colors"
                >
                  <MessageCircle size={13} />
                  Chat Live
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="text-center py-6 px-4">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Users size={22} className="text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-[#0F1111] mb-1">No live witnesses right now</p>
          <p className="text-xs text-[#565959] mb-4 max-w-xs mx-auto">
            Real owners can go live to answer questions. Own this product?
          </p>
          <Link
            to="/witness"
            className="inline-flex items-center gap-1.5 bg-[#FF9900] hover:bg-[#F7CA00] text-[#131921] font-bold text-xs px-4 py-2 rounded-full transition-colors"
          >
            <UserPlus size={13} />
            Be a Witness · Earn ₹50 cashback
          </Link>
        </div>
      )}

      {activeWitness && (
        <ChatModal
          witness={{ ...activeWitness, isLive: true }}
          product={product}
          onClose={() => setActiveWitness(null)}
        />
      )}
    </div>
  );
}
