import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Radio, AlertTriangle, CheckCircle2, XCircle, Zap, ShieldAlert } from "lucide-react";

function fmtTime(unix) {
  if (!unix) return "—";
  const d = new Date(unix * 1000);
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

/**
 * Pool Broadcast — live multi-class Binance Pool stratum proxy state (admin-only).
 * iter-11: Per-class TCP connection grid. Honest counters. NATIVE PoW PENDING banner.
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
  const allArmed = !!s?.all_armed;
  const partiallyArmed = (s?.armed_count ?? 0) > 0 && !allArmed;
  const tone = notConfigured || disabled ? "amber" : allArmed ? "gold" : partiallyArmed ? "lime" : "red";
  const toneCls = {
    gold:  "border-[#F2C94C]/40 bg-[#F2C94C]/5",
    lime:  "border-emerald-400/30 bg-emerald-400/5",
    red:   "border-red-400/30 bg-red-500/5",
    amber: "border-amber-400/30 bg-amber-400/5",
  }[tone];

  const Icon = notConfigured || disabled ? AlertTriangle : allArmed ? CheckCircle2 : partiallyArmed ? Zap : XCircle;
  const iconCls = notConfigured || disabled ? "text-amber-300" : allArmed ? "text-[#F2C94C]" : partiallyArmed ? "text-emerald-300" : "text-red-400";

  return (
    <div className={`rounded-3xl border ${toneCls} p-6`} data-testid="pool-status-panel">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 grid place-items-center">
            <Radio className="w-5 h-5 text-[#F2C94C]" />
          </div>
          <div>
            <div className="font-display font-bold text-base">Pool Broadcast · Multi-Class Stratum Proxy</div>
            <div className="text-xs text-white/55 mt-1 max-w-2xl" data-testid="pool-status-message">
              {s?.message}
            </div>
            {s?.pool_account && (
              <div className="mt-1 text-[10px] tracking-widest uppercase text-white/40 font-mono" data-testid="pool-account-id">
                Master account: {s.pool_account} · Worker format: {s.pool_account}.&lt;device_short_id&gt;
              </div>
            )}
          </div>
        </div>
        <span className={`text-[10px] uppercase tracking-widest font-semibold px-3 py-1.5 rounded-full border inline-flex items-center gap-1.5 ${
          tone === "gold" ? "border-[#F2C94C] text-[#F2C94C]" :
          tone === "lime" ? "border-emerald-400 text-emerald-300" :
          tone === "red"  ? "border-red-400 text-red-300" :
                            "border-amber-400 text-amber-300"
        }`} data-testid="pool-status-badge">
          <Icon className={`w-3 h-3 ${iconCls}`} />
          {notConfigured ? "Not configured" : disabled ? "Disabled" : allArmed ? `Live · ${s.armed_count}/${s.total_classes} armed` : partiallyArmed ? `Partial · ${s.armed_count}/${s.total_classes}` : "Disconnected"}
        </span>
      </div>

      {/* NATIVE PoW PENDING warning — surfaced PROMINENTLY when pool live */}
      {(allArmed || partiallyArmed) && s?.pow_status === "native_pow_pending" && (
        <div className="mt-5 p-4 rounded-2xl border border-amber-400/30 bg-amber-400/5" data-testid="pow-pending-warning">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-amber-200">Workers registered ✓ · Accepted shares = 0</div>
              <div className="text-xs text-white/65 mt-1 leading-relaxed max-w-3xl">
                {s.pow_status_note}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aggregate counters */}
      {!notConfigured && (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Cell label="Classes Armed" value={`${s.armed_count}/${s.total_classes}`} testId="pool-armed-count" accent={allArmed} />
          <Cell label="Workers Registered" value={s.workers_registered ?? 0} testId="pool-workers" accent />
          <Cell label="Accepted Shares" value={s.accepted_shares ?? 0} testId="pool-accepted" />
          <Cell label="Rejected Shares" value={s.rejected_shares ?? 0} testId="pool-rejected" />
        </div>
      )}

      {/* Per-class grid */}
      {!notConfigured && Array.isArray(s?.classes) && s.classes.length > 0 && (
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-3">Per-Class Connection State</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5" data-testid="pool-class-grid">
            {s.classes.map((c) => {
              const okay = c.connected && c.authorized;
              return (
                <div key={c.coin}
                  data-testid={`pool-class-${c.coin}`}
                  className={`p-3 rounded-xl border ${
                    okay ? "border-[#F2C94C]/35 bg-[#F2C94C]/5"
                         : "border-white/10 bg-black/30"
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-display font-black text-sm ${okay ? "gold-text" : "text-white/50"}`}>{c.coin}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${okay ? "bg-[#F2C94C] dot-pulse" : "bg-white/20"}`} />
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mt-1">{c.algo}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`text-[10px] uppercase tracking-widest ${okay ? "text-[#F2C94C]" : "text-white/40"}`}>
                      {okay ? "ARMED" : c.connected ? "CONNECTING" : "DISCONNECTED"}
                    </span>
                    <span className="text-[9px] text-white/40 font-mono">#{c.attempts}</span>
                  </div>
                  {c.last_share_at && (
                    <div className="text-[9px] text-white/35 mt-1 font-mono">share {fmtTime(c.last_share_at)}</div>
                  )}
                  {c.last_error && !okay && (
                    <div className="text-[9px] text-red-400/70 mt-1 truncate" title={c.last_error}>{c.last_error}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {notConfigured && (
        <div className="mt-4 text-[11px] text-white/55 leading-relaxed font-mono" data-testid="pool-config-hint">
          Set the following in <code className="text-[#F2C94C]">backend/.env</code>:<br />
          ENABLE_REAL_POOL=true<br />
          RVN_POOL_ACCOUNT=&lt;binance-account-id&gt;<br />
          RVN_POOL_PASSWORD=x<br />
          RVN_WORKER_PREFIX=  <span className="text-white/30">(empty for strict format)</span>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, accent, testId }) {
  return (
    <div className="p-3 rounded-xl bg-black/40 border border-white/10" data-testid={testId}>
      <div className="text-[9px] uppercase tracking-[0.25em] text-white/40">{label}</div>
      <div className={`mt-1 font-display font-black ${accent ? "gold-text" : "text-white"}`}>{value}</div>
    </div>
  );
}
