import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Award, Smartphone } from "lucide-react";

/**
 * HonorPodium — investor-grade live podium pinned next to the Live Operator
 * Console. Subscribes to the SAME /api/admin/console/ws stream and surfaces
 * the most recent ACCEPTED shares in a vertical card stack with a phone icon
 * and the worker_id. New shares slide in, fade older ones down.
 *
 * Shares the existing console contract → no new backend work.
 *   ev.level === "share"  AND  ev.src in {"rx","sha256","device"}
 */
export default function HonorPodium({ height = 300 }) {
  const [shares, setShares] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    const base = process.env.REACT_APP_BACKEND_URL || "";
    let cancelled = false;
    let reconnectT = null;

    const open = () => {
      if (cancelled) return;
      const token = (typeof localStorage !== "undefined" && localStorage.getItem("grid_token")) || "";
      const url = base.replace(/^http/, "ws") + "/api/admin/console/ws?token=" + encodeURIComponent(token);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev.level !== "share") return;
          // Only count "accepted" — backend emits "share" for both
          // submission and acceptance. Heuristic: msg contains "ACCEPTED"
          // or share count phrasing; otherwise still surface the most recent
          // share submission (still investor-relevant signal).
          const accepted =
            /accept/i.test(ev.msg || "") ||
            /\baccepted\b/i.test(ev.msg || "") ||
            /\#\d+\b/.test(ev.msg || "");
          const worker = matchWorker(ev.msg);
          setShares((prev) => {
            const next = [
              { id: `${ev.ts}-${Math.random().toString(36).slice(2, 6)}`,
                ts: ev.ts, src: ev.src, msg: ev.msg, worker, accepted },
              ...prev,
            ].slice(0, 5);
            return next;
          });
        } catch {}
      };
      ws.onclose = (ev) => {
        if (cancelled) return;
        if (ev && (ev.code === 4401 || ev.code === 4403)) return; // auth issue handled by main console
        reconnectT = setTimeout(open, 2500);
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    };
    open();
    return () => {
      cancelled = true;
      clearTimeout(reconnectT);
      try { wsRef.current && wsRef.current.close(); } catch {}
    };
  }, []);

  return (
    <div className="cyber-card rounded-3xl overflow-hidden" data-testid="honor-podium">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#00ffe1]/15 bg-black/40">
        <div className="flex items-center gap-2 font-mono-cyber">
          <Award className="w-4 h-4" style={{ color: "var(--neon-green)" }} />
          <span className="text-sm font-bold neon-green-text">honor_podium</span>
          <span className="text-[10px] text-white/40">/ accepted_shares</span>
        </div>
        <span className="cyber-pill" data-testid="podium-count">{shares.length}/5</span>
      </div>
      <div className="bg-black/85 px-4 py-3 font-mono-cyber overflow-auto"
           style={{ maxHeight: height, minHeight: height }} data-testid="podium-stream">
        {shares.length === 0 && (
          <div className="text-[#00ffe1]/40 caret-blink text-[11px] py-4">
            waiting for first share…
          </div>
        )}
        <AnimatePresence initial={false}>
          {shares.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1 - i * 0.18, x: 0, scale: 1 - i * 0.03 }}
              exit={{ opacity: 0, x: -24, scale: 0.92 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="rounded-xl px-3 py-2.5 mb-2 border border-[#00ff88]/15 bg-[#00ff88]/5"
              data-testid={`podium-row-${i}`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0"
                     style={{ background: "rgba(0,255,136,0.10)", border: "1px solid rgba(0,255,136,0.35)" }}>
                  <Smartphone className="w-4 h-4" style={{ color: "var(--neon-green)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] neon-green-text font-bold truncate" data-testid={`podium-worker-${i}`}>
                    {s.worker || tagFromSrc(s.src)}
                  </div>
                  <div className="text-[10px] text-white/55 truncate">
                    {s.msg}
                  </div>
                </div>
                <div className="text-[9px] tracking-widest uppercase shrink-0"
                     style={{ color: s.accepted ? "var(--neon-green)" : "rgba(255,255,255,0.4)" }}>
                  {s.accepted ? "ACCEPTED" : "SHARE"}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function tagFromSrc(s) {
  return ({ rx: "RX_BACKEND", sha256: "SHA256_BACKEND", device: "DEVICE_NODE" }[s] || "WORKER");
}

function matchWorker(msg) {
  if (!msg) return null;
  const m1 = msg.match(/GRID_M_[a-f0-9]{4,}/i);
  if (m1) return m1[0];
  const m2 = msg.match(/THEGRID_WEAPON/i);
  if (m2) return "RX_BACKEND";
  const m3 = msg.match(/(?:on|from)\s+([a-zA-Z0-9-]{4,12})/);
  if (m3) return m3[1];
  return null;
}
