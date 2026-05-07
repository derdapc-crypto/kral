import React, { useEffect, useState } from "react";
import axios from "axios";
import { Radio, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Live Compute Network — public landing badge (STEALTH).
 *
 * iter-11 contract: NEVER discloses pool/algo/coin names to the public surface.
 * Backend /api/pool/health intentionally omits class data; this badge only
 * shows two states:
 *   - network_live=true   → gold "Compute Network · Live"
 *   - network_live=false  → amber "Compute Network · Standby"
 *
 * Operators see the per-class detail in the Admin → Real Android tab; the
 * landing visitor only knows the network is alive.
 */
export default function LivePoolBadge({ compact = false }) {
  const [s, setS] = useState(null);

  useEffect(() => {
    const base = process.env.REACT_APP_BACKEND_URL;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await axios.get(`${base}/api/pool/health`, { withCredentials: false });
        if (!cancelled) setS(r.data);
      } catch {/* silent — badge stays empty rather than lying */ }
    };
    load();
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load();
    }, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!s) return null;

  const live = !!s.network_live;
  const tone = live ? "gold" : "amber";
  const Icon = live ? CheckCircle2 : AlertTriangle;
  const label = live ? "Compute Network · Live" : "Compute Network · Standby";

  if (compact) {
    return (
      <span data-testid="live-pool-badge-compact"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest border ${
          tone === "gold" ? "border-[#F2C94C]/50 text-[#F2C94C] bg-[#F2C94C]/8" : "border-amber-400/40 text-amber-300 bg-amber-400/5"
        }`}>
        <Icon className="w-3 h-3" />
        {label}
      </span>
    );
  }

  return (
    <div data-testid="live-pool-badge"
      className={`inline-flex items-center gap-3 px-4 py-2.5 rounded-full border backdrop-blur-md transition-colors ${
        tone === "gold"
          ? "border-[#F2C94C]/40 bg-[#F2C94C]/5 hover:bg-[#F2C94C]/10"
          : "border-amber-400/30 bg-amber-400/5"
      }`}>
      <div className="relative">
        <Radio className={`w-4 h-4 ${tone === "gold" ? "text-[#F2C94C]" : "text-amber-300"}`} />
        {live && <span className="absolute -inset-1 rounded-full border border-[#F2C94C]/40 animate-ping" />}
      </div>
      <div className="text-left">
        <div className={`text-[11px] uppercase tracking-[0.25em] font-semibold ${tone === "gold" ? "text-[#F2C94C]" : "text-amber-300"}`}>
          {label}
        </div>
        <div className="text-[10px] text-white/55 max-w-[280px] truncate" data-testid="live-pool-badge-sub">
          {live ? "Distributed verification mesh online" : "Standby · awaiting operator activation"}
        </div>
      </div>
    </div>
  );
}
