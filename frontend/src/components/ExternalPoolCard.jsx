import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ExternalLink, Copy, Coins, Terminal, CheckCircle2 } from "lucide-react";

/**
 * External Pool Bridge — admin-side card surfaced inside the Real Android tab.
 *
 * Iter-17 / v1.3.2 highlights:
 *  - PROXIES Unmineable's public REST API for live balance + payment-threshold
 *  - "Open Dashboard" CTA opens https://www.unmineable.com/coins/USDT/address/<addr>
 *  - "Show miner command" reveals an xmrig CLI snippet ready to paste into a
 *    VPS / laptop — operator-side hardware, container does NOT run the miner.
 */
export default function ExternalPoolCard() {
  const [s, setS] = useState(null);
  const [snippet, setSnippet] = useState(null);
  const [showSnippet, setShowSnippet] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const loadSnippet = async () => {
    try {
      const { data } = await api.get("/admin/external-pool/miner-snippet");
      setSnippet(data);
      setShowSnippet(true);
    } catch (e) { /* ignore */ }
  };

  const copyText = (txt) => {
    try { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  if (!s) return null;
  const cfg = s.configured;
  const live = s.live_stats;
  const live_ok = !!live;

  return (
    <div data-testid="external-pool-card"
      className={`rounded-3xl border ${cfg && live_ok ? "border-emerald-400/40 bg-gradient-to-br from-emerald-400/8 via-black/30 to-black/30"
                                       : cfg ? "border-emerald-400/30 bg-emerald-400/5"
                                       : "border-amber-400/30 bg-amber-400/5"} p-6`}>
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
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={loadSnippet} data-testid="external-pool-show-miner"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-white/15 text-white/80 text-[10px] tracking-widest uppercase hover:border-emerald-400 hover:text-emerald-300">
              <Terminal className="w-3 h-3" /> Miner CLI
            </button>
            <a href={s.dashboard_url} target="_blank" rel="noopener noreferrer"
               data-testid="external-pool-open-dashboard"
               className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 text-[11px] tracking-widest uppercase font-bold hover:bg-emerald-400/15">
              View Pool <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* Live stats from Unmineable public API */}
      {cfg && live_ok && (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs" data-testid="external-pool-live-stats">
          <Cell label="Current Balance" value={`${live.balance.toFixed(6)} ${s.payout_coin}`} accent testId="ep-balance" />
          <Cell label="Payable Balance" value={`${live.balance_payable.toFixed(6)} ${s.payout_coin}`} testId="ep-payable" />
          <Cell label="Threshold" value={`${live.payment_threshold} ${s.payout_coin}`} testId="ep-threshold" />
          <Cell label="Network" value={`${live.network} · ${(live.mining_fee_pct * 100).toFixed(0)}% fee`} testId="ep-network" />
        </div>
      )}

      {/* Configuration grid */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Cell label="Coin" value={s.payout_coin} testId="ep-coin" />
        <Cell label="Stratum host" value={`${s.host}:${s.port}`} mono testId="ep-host" />
        <Cell label="Payout address" value={s.payout_address || "—"} mono accent={cfg} testId="ep-address" copy onCopy={copyText} />
        <Cell label="Worker template" value={s.worker_name_template} mono testId="ep-template" copy onCopy={copyText} />
      </div>

      {/* xmrig CLI snippet */}
      {showSnippet && snippet?.command && (
        <div className="mt-5 p-4 rounded-2xl border border-emerald-400/25 bg-black/60" data-testid="miner-snippet-block">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.25em] text-emerald-300/80 flex items-center gap-1.5">
              <Terminal className="w-3 h-3" /> xmrig CLI · run on YOUR hardware
            </div>
            <button onClick={() => copyText(snippet.command)}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/70 hover:text-emerald-300">
              {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="text-[10px] font-mono text-emerald-300/90 overflow-x-auto whitespace-pre-wrap break-all" data-testid="miner-command">{snippet.command}</pre>
          <ol className="mt-3 text-[10px] text-white/55 space-y-1 list-decimal list-inside">
            {(snippet.instructions || []).map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <div className="mt-2 text-[9px] uppercase tracking-widest text-amber-300/70">
            ⚠ Container miner intentionally OFF — burns credits non-stop. Run xmrig on your VPS / laptop.
          </div>
        </div>
      )}

      {!cfg && (
        <div className="mt-4 text-[11px] text-white/55 leading-relaxed font-mono" data-testid="external-pool-hint">
          To enable the bridge, set in <code className="text-amber-300">backend/.env</code>:<br />
          <span className="text-emerald-300">RVN_PAYOUT_ADDRESS=0x... your real BEP20 address</span><br />
          UNMINEABLE_PAYOUT_COIN=USDT
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, mono, accent, copy, onCopy, testId }) {
  return (
    <div className="p-3 rounded-2xl bg-black/45 border border-white/10" data-testid={testId}>
      <div className="text-[9px] uppercase tracking-[0.25em] text-white/40 flex items-center justify-between">
        {label}
        {copy && value && value !== "—" && (
          <button onClick={() => onCopy && onCopy(value)} className="opacity-50 hover:opacity-100">
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
