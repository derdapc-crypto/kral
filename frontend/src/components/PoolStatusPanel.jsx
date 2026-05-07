import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Radio, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

function fmtTime(unix) {
  if (!unix) return "—";
  const d = new Date(unix * 1000);
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

/**
 * Real-time Binance Pool / RVN stratum proxy status.
 * - Reflects honest connection state from the backend's TCP socket — never fakes.
 * - When credentials are missing, says "Pool not configured" loud and clear.
 * - Auto-refreshes every 5s; visibility-paused.
 */
export default function PoolStatusPanel() {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/pool/status");
      setS(data); setLoading(false);
    } catch { setLoading(false); }
  };

  useEffect(() => {
    load();
    let cancelled = false;
    const tick = () => { if (!cancelled && (typeof document === "undefined" || !document.hidden)) load(); };
    const t = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (loading) return null;

  const notConfigured = !s?.configured;
  const disabled = s?.configured && !s?.enabled;
  const connected = !!s?.connected;
  const tone = notConfigured ? "amber" : disabled ? "amber" : connected ? "gold" : "red";
  const toneCls = {
    gold:  "border-[#F2C94C]/40 bg-[#F2C94C]/5",
    red:   "border-red-400/30 bg-red-500/5",
    amber: "border-amber-400/30 bg-amber-400/5",
  }[tone];

  const Icon = notConfigured || disabled ? AlertTriangle : connected ? CheckCircle2 : XCircle;
  const iconCls = notConfigured || disabled ? "text-amber-300" : connected ? "text-[#F2C94C]" : "text-red-400";

  return (
    <div className={`rounded-3xl border ${toneCls} p-6`} data-testid="pool-status-panel">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 grid place-items-center">
            <Radio className="w-5 h-5 text-[#F2C94C]" />
          </div>
          <div>
            <div className="font-display font-bold text-base">Binance Pool · RVN Stratum Proxy</div>
            <div className="text-xs text-white/55 mt-1 max-w-xl" data-testid="pool-status-message">{s?.message}</div>
          </div>
        </div>
        <span className={`text-[10px] uppercase tracking-widest font-semibold px-3 py-1.5 rounded-full border inline-flex items-center gap-1.5 ${
          tone === "gold" ? "border-[#F2C94C] text-[#F2C94C]" : tone === "red" ? "border-red-400 text-red-300" : "border-amber-400 text-amber-300"
        }`} data-testid="pool-status-badge">
          <Icon className={`w-3 h-3 ${iconCls}`} />
          {notConfigured ? "Not configured" : disabled ? "Disabled" : connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Detail grid — only when configured */}
      {!notConfigured && (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Cell label="Stratum URL" value={s.stratum_url || "—"} mono testId="pool-stratum-url" />
          <Cell label="Pool Account" value={s.pool_account || "—"} mono testId="pool-account" />
          <Cell label="Worker Prefix" value={s.worker_prefix || "—"} mono testId="pool-worker-prefix" />
          <Cell label="Workers Registered" value={s.workers_registered ?? 0} testId="pool-workers" accent />
          <Cell label="Accepted Shares" value={s.accepted_shares ?? 0} testId="pool-accepted" accent />
          <Cell label="Rejected Shares" value={s.rejected_shares ?? 0} testId="pool-rejected" />
          <Cell label="Last Share" value={fmtTime(s.last_share_at)} testId="pool-last-share" />
          <Cell label="Last Job" value={fmtTime(s.last_job_at)} testId="pool-last-job" />
        </div>
      )}

      {notConfigured && (
        <div className="mt-4 text-[11px] text-white/55 leading-relaxed font-mono" data-testid="pool-config-hint">
          Set the following in <code className="text-[#F2C94C]">backend/.env</code>:<br />
          RVN_STRATUM_URL=stratum+tcp://rvn.pool.binance.com:3334<br />
          RVN_POOL_ACCOUNT=&lt;binance-account&gt;<br />
          RVN_POOL_PASSWORD=x<br />
          RVN_WORKER_PREFIX=THEGRID<br />
          ENABLE_REAL_POOL=true
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, mono, accent, testId }) {
  return (
    <div className="p-3 rounded-xl bg-black/40 border border-white/10" data-testid={testId}>
      <div className="text-[9px] uppercase tracking-[0.25em] text-white/40">{label}</div>
      <div className={`mt-1 truncate ${mono ? "font-mono text-[11px]" : "font-display font-black"} ${accent ? "gold-text" : "text-white"}`}>{value}</div>
    </div>
  );
}
