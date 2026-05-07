import React, { useEffect, useState } from "react";
import axios from "axios";
import { Radio, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Live Pool Connection — public landing badge.
 * Honest by contract:
 *   - configured=false  → amber "Pool offline · honest" (we never fake)
 *   - enabled=false     → amber "Pool standby"
 *   - connected=false   → amber "Reconnecting"
 *   - connected=true    → gold "Live · N workers"
 *
 * Why public/unauth: investors and operators can verify from the landing page
 * that the platform is actually wired to a real upstream pool, not just claiming so.
 * The endpoint exposes ONLY: configured/enabled/connected/workers_registered/account_masked/message.
 * No URL, no full account, no shares, no errors leak to the public surface.
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

  const live = s.connected;
  const standby = s.configured && !s.enabled;
  const offline = !s.configured;
  const tone = live ? "gold" : "amber";
  const Icon = live ? CheckCircle2 : AlertTriangle;

  const label = live
    ? `Live · ${s.workers_registered} worker${s.workers_registered === 1 ? "" : "s"}`
    : standby
    ? "Pool · Standby"
    : offline
    ? "Pool · Offline (honest)"
    : "Pool · Reconnecting";

  const sub = live
    ? `Binance Pool · RVN${s.account_masked ? " · " + s.account_masked : ""}`
    : s.message;

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
          {sub}
        </div>
      </div>
    </div>
  );
}
