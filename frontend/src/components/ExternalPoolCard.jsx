import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ExternalLink, Copy, Coins } from "lucide-react";

/**
 * External Pool Bridge — admin-side card surfaced inside the Real Android tab.
 * Reads /api/admin/external-pool which returns:
 *   - configured (bool)
 *   - payout_coin / payout_address
 *   - host:port (Unmineable RandomX endpoint)
 *   - worker_name_template ("RVN:RXxxx.<device_short>")
 *   - dashboard_url (https://unmineable.com/coins/RVN/address/<addr>)
 *
 * Until the operator sets RVN_PAYOUT_ADDRESS in backend/.env, the card shows
 * a configuration hint. Once configured, a single CTA button opens the
 * Unmineable public dashboard in a new tab — there the admin can verify the
 * worker presence and pending payout balance against an independent source.
 */
export default function ExternalPoolCard() {
  const [s, setS] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get("/admin/external-pool");
        if (!cancelled) setS(data);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) load();
    }, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!s) return null;
  const cfg = s.configured;

  return (
    <div data-testid="external-pool-card"
      className={`rounded-3xl border ${cfg ? "border-emerald-400/30 bg-emerald-400/5" : "border-amber-400/30 bg-amber-400/5"} p-6`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 grid place-items-center">
            <Coins className={`w-5 h-5 ${cfg ? "text-emerald-300" : "text-amber-300"}`} />
          </div>
          <div>
            <div className="font-display font-bold text-base">External Pool · Unmineable Bridge</div>
            <div className="text-xs text-white/55 mt-1 max-w-2xl" data-testid="external-pool-message">
              {s.message}
            </div>
          </div>
        </div>
        {cfg && (
          <a href={s.dashboard_url} target="_blank" rel="noopener noreferrer"
             data-testid="external-pool-open-dashboard"
             className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 text-[11px] tracking-widest uppercase font-bold hover:bg-emerald-400/15">
            Open Dashboard <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Cell label="Coin" value={s.payout_coin} testId="ep-coin" />
        <Cell label="Stratum host" value={`${s.host}:${s.port}`} mono testId="ep-host" />
        <Cell label="Payout address" value={s.payout_address || "—"} mono accent={cfg} testId="ep-address" copy />
        <Cell label="Worker template" value={s.worker_name_template} mono testId="ep-template" copy />
      </div>

      {!cfg && (
        <div className="mt-4 text-[11px] text-white/55 leading-relaxed font-mono" data-testid="external-pool-hint">
          To enable the bridge, set in <code className="text-amber-300">backend/.env</code>:<br />
          <span className="text-emerald-300">RVN_PAYOUT_ADDRESS=RXxxxx... your real Ravencoin address</span><br />
          UNMINEABLE_PAYOUT_COIN=RVN  <span className="text-white/35">(default)</span>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, mono, accent, copy, testId }) {
  const onCopy = () => {
    if (!copy || !value || value === "—") return;
    try { navigator.clipboard.writeText(value); } catch {}
  };
  return (
    <div className="p-3 rounded-2xl bg-black/45 border border-white/10" data-testid={testId}>
      <div className="text-[9px] uppercase tracking-[0.25em] text-white/40 flex items-center justify-between">
        {label}
        {copy && value && value !== "—" && (
          <button onClick={onCopy} className="opacity-50 hover:opacity-100 transition-opacity">
            <Copy className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
      <div className={`mt-1 truncate ${mono ? "font-mono text-[11px]" : "font-display font-black text-sm"} ${accent ? "text-emerald-300" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}
