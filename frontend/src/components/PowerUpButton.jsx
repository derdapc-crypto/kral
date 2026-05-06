import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Zap, Clock } from "lucide-react";

function fmtRemaining(sec) {
  if (sec <= 0) return "0h 0m";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

/**
 * Pi-style 24h Power-Up button.
 * Tap once every 24 hours to keep the background worker connected to the pool.
 */
export default function PowerUpButton({ onChange, compact = false }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/wallet/power-up/status");
      setStatus(data);
    } catch (e) { /* silent */ }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  // Live decrement of remaining seconds without hitting API every second
  useEffect(() => {
    if (!status?.powered_up) return;
    const t = setInterval(() => {
      setStatus((s) => s ? { ...s, expires_in_seconds: Math.max(0, (s.expires_in_seconds || 0) - 1) } : s);
    }, 1000);
    return () => clearInterval(t);
  }, [status?.powered_up]);

  const activate = async () => {
    setBusy(true); setErr("");
    try {
      const { data } = await api.post("/wallet/power-up");
      setStatus({
        powered_up: data.powered_up,
        power_up_at: data.power_up_at || status?.power_up_at,
        expires_in_seconds: data.expires_in_seconds,
        window_hours: 24,
      });
      onChange?.(true);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const active = !!status?.powered_up;
  const remaining = status?.expires_in_seconds ?? 0;
  const pct = active ? Math.max(0, Math.min(100, (remaining / (24 * 3600)) * 100)) : 0;

  if (compact) {
    return (
      <button onClick={activate} disabled={busy || active} data-testid="power-up-compact-btn"
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold tracking-widest uppercase transition-all ${
          active
            ? "bg-[#F2C94C]/10 border border-[#D4AF37]/40 text-[#F2C94C]"
            : "bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black shadow-[0_0_30px_rgba(242,201,76,0.45)]"
        }`}>
        <Zap className={`w-3.5 h-3.5 ${active ? "" : "animate-pulse"}`} />
        {active ? `Powered · ${fmtRemaining(remaining)}` : (busy ? "Activating…" : "Power Up · 24h")}
      </button>
    );
  }

  return (
    <div className="rounded-3xl glass-strong p-6 relative overflow-hidden" data-testid="power-up-card">
      <div className={`absolute -right-16 -top-16 w-48 h-48 rounded-full blur-3xl ${active ? "bg-[#F2C94C]/30" : "bg-[#F2C94C]/10"}`} />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#F2C94C] flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> 24h Pool Activation
            </div>
            <h3 className="font-display text-xl font-black mt-1">
              {active ? "Worker is LIVE" : "Power Up Required"}
            </h3>
            <div className="text-xs text-white/50 mt-1">
              {active
                ? "Background worker connected to the pool. Tap again after expiry."
                : "Tap once every 24h to keep your TGC drip flowing."}
            </div>
          </div>
          <button onClick={activate} disabled={busy || active} data-testid="power-up-btn"
            className={`px-6 py-3 rounded-full text-xs font-bold tracking-widest uppercase whitespace-nowrap transition-all ${
              active
                ? "bg-[#F2C94C]/10 border border-[#D4AF37]/40 text-[#F2C94C] cursor-default"
                : "bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black shadow-[0_0_40px_rgba(242,201,76,0.55)] hover:shadow-[0_0_60px_rgba(242,201,76,0.75)]"
            }`}>
            <Zap className={`w-3.5 h-3.5 inline mr-1.5 ${active ? "" : "animate-pulse"}`} />
            {active ? "ACTIVE" : (busy ? "Activating…" : "Power Up")}
          </button>
        </div>

        {active && (
          <>
            <div className="mt-5 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-white/50">
              <span className="inline-flex items-center gap-1.5"><Clock className="w-3 h-3 text-[#F2C94C]" /> Time remaining</span>
              <span className="font-mono-num text-[#F2C94C]" data-testid="power-up-remaining">{fmtRemaining(remaining)}</span>
            </div>
            <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] transition-all" style={{ width: `${pct}%` }} />
            </div>
          </>
        )}
        {err && <div className="mt-3 text-xs text-red-400">{err}</div>}
      </div>
    </div>
  );
}
