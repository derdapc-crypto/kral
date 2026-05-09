import React, { useEffect, useRef, useState } from "react";
import { Terminal, Activity } from "lucide-react";

/**
 * LiveOperatorConsole — admin-only WebSocket terminal.
 * Subscribes to /api/admin/console/ws, replays last ~60 events on connect,
 * then streams real-time mining + system events. Each line is colored by
 * level: share=matrix-green, info=cyan, warn=amber, error=red.
 */
export default function LiveOperatorConsole({ height = 280 }) {
  const [events, setEvents] = useState([]);
  const [state, setState] = useState("connecting");
  const wsRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const base = process.env.REACT_APP_BACKEND_URL || "";
    const token = (typeof localStorage !== "undefined" && localStorage.getItem("grid_token")) || "";
    const wsUrl = base.replace(/^http/, "ws") + "/api/admin/console/ws?token=" + encodeURIComponent(token);

    let cancelled = false;
    let reconnectT = null;
    const open = () => {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setState("connecting");
      ws.onopen = () => setState("live");
      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          setEvents((prev) => {
            const next = [...prev, ev];
            return next.length > 200 ? next.slice(next.length - 200) : next;
          });
        } catch {}
      };
      ws.onclose = () => {
        if (cancelled) return;
        setState("reconnecting");
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

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const fmt = (ev) => {
    try {
      const d = new Date(ev.ts);
      return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}:${String(d.getUTCSeconds()).padStart(2,"0")}`;
    } catch { return "--:--:--"; }
  };
  const color = (lv) => ({
    share: "matrix-text",
    info:  "text-[#00ddc7]",
    warn:  "text-amber-300",
    error: "text-red-400",
  }[lv] || "text-white/70");
  const srcTag = (s) => ({ rx:"RX  ", sha256:"S256", device:"DEV ", system:"SYS " }[s] || (s||"???").slice(0,4).padEnd(4));

  return (
    <div className="cyber-card rounded-3xl overflow-hidden cyber-scanlines" data-testid="live-operator-console">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#00ffe1]/15 bg-black/40">
        <div className="flex items-center gap-2 font-mono-cyber">
          <Terminal className="w-4 h-4 cyan-text" />
          <span className="cyan-text text-sm font-bold">live_operator_console</span>
          <span className="text-[10px] text-white/40">/var/log/the.grid</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="cyber-pill" data-testid="console-state">
            <Activity className="w-3 h-3" />
            {state === "live" ? "LIVE" : state === "reconnecting" ? "RECONNECTING" : "CONNECTING"}
          </span>
          <span className="text-[10px] text-white/40 font-mono-term">{events.length} events</span>
        </div>
      </div>
      <div ref={scrollRef}
        className="bg-black/85 px-5 py-3 font-mono-cyber text-[11px] leading-[1.55] overflow-auto"
        style={{ maxHeight: height, minHeight: height }}
        data-testid="console-stream">
        {events.length === 0 && (
          <div className="text-[#00ffe1]/40 caret-blink">awaiting first event…</div>
        )}
        {events.map((ev, i) => (
          <div key={i} className={`flex gap-3 ${ev.level === "share" ? "type-in" : ""}`}
               data-testid={`console-event-${i}`}>
            <span className="text-white/35 select-none">[{fmt(ev)}]</span>
            <span className="cyan-text w-12 select-none opacity-70">{srcTag(ev.src)}</span>
            <span className={color(ev.level) + " flex-1 break-all"}>
              {ev.level === "share" ? "+ " : ev.level === "warn" ? "! " : ev.level === "error" ? "x " : "> "}
              {ev.msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
