import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Cpu, RefreshCw, CheckCircle2, XCircle, Activity, Hash, Zap, AlertTriangle } from "lucide-react";

/**
 * Backend Miner (Plan B) Card — v1.3.4.
 *
 * Surfaces the live status of the in-process Python SHA-256 stratum miner
 * that connects to sha256.unmineable.com:3333 under the operator's USDT
 * BEP20 payout address. Polls /api/admin/backend-miner/status every 5s
 * (visibility-aware pause). "Restart" button re-spawns the miner thread.
 *
 * Honest disclosure: CPU SHA-256 is statistical against pool vardiff;
 * the surface clearly displays current pool diff so the operator can
 * audit expected share cadence.
 */
export default function BackendMinerCard() {
  const [s, setS] = useState(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get("/admin/backend-miner/status");
        if (!cancelled) setS(data);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) load();
    }, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const restart = async () => {
    setRestarting(true);
    try {
      await api.post("/admin/backend-miner/restart");
    } catch { /* ignore */ }
    setRestarting(false);
  };

  if (!s || s.available === false) return null;

  const live = s.connected && s.authorized && s.running;
  const accent = live ? "border-cyan-400/40 bg-gradient-to-br from-cyan-400/8 via-black/30 to-black/30"
                      : s.running ? "border-amber-400/30 bg-amber-400/5"
                                  : "border-white/10 bg-black/30";

  const fmtH = (h) => {
    if (!h) return "0 H/s";
    if (h >= 1e6) return `${(h/1e6).toFixed(2)} MH/s`;
    if (h >= 1e3) return `${(h/1e3).toFixed(2)} KH/s`;
    return `${h.toFixed(0)} H/s`;
  };
  const fmtAge = (iso) => {
    if (!iso) return "—";
    try {
      const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime())/1000));
      if (sec < 60) return `${sec}s ago`;
      if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
      return `${Math.floor(sec/3600)}h ago`;
    } catch { return "—"; }
  };
  const fmtUptime = (sec) => {
    if (!sec) return "—";
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec/60)}m ${sec%60}s`;
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
    return `${h}h ${m}m`;
  };

  return (
    <div data-testid="backend-miner-card" className={`rounded-3xl border ${accent} p-6`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 grid place-items-center">
            <Cpu className={`w-5 h-5 ${live ? "text-cyan-300" : "text-amber-300"}`} />
          </div>
          <div>
            <div className="font-display font-bold text-base flex items-center gap-2">
              Backend Miner · Plan B
              <span data-testid="backend-miner-state-badge"
                className={`text-[9px] tracking-widest uppercase font-semibold px-2 py-0.5 rounded-full border
                ${live ? "bg-cyan-400/15 border-cyan-400/40 text-cyan-300"
                       : s.running ? "bg-amber-400/10 border-amber-400/30 text-amber-300"
                                   : "bg-white/5 border-white/15 text-white/50"}`}>
                {live ? "LIVE" : s.running ? "RECONNECTING" : "STOPPED"}
              </span>
            </div>
            <div className="text-xs text-white/55 mt-1 max-w-2xl" data-testid="backend-miner-note">
              {s.note}
            </div>
          </div>
        </div>
        <button onClick={restart} data-testid="backend-miner-restart"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-white/15 text-white/80 text-[10px] tracking-widest uppercase hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-50"
          disabled={restarting}>
          <RefreshCw className={`w-3 h-3 ${restarting ? "animate-spin" : ""}`} />
          {restarting ? "Restarting…" : "Restart"}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs" data-testid="backend-miner-stats">
        <Cell icon={<Activity className="w-3 h-3" />} label="Hashrate"
              value={fmtH(s.hashrate_hps)} accent testId="bm-hashrate" />
        <Cell icon={<Hash className="w-3 h-3" />} label="Pool Difficulty"
              value={s.current_difficulty ? s.current_difficulty.toLocaleString() : "—"}
              testId="bm-difficulty" />
        <Cell icon={<CheckCircle2 className="w-3 h-3" />} label="Accepted Shares"
              value={s.accepted_shares} accent={s.accepted_shares > 0} testId="bm-accepted" />
        <Cell icon={<XCircle className="w-3 h-3" />} label="Rejected"
              value={s.rejected_shares} testId="bm-rejected" />
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Cell icon={<Zap className="w-3 h-3" />} label="Pool"
              value={s.pool} mono testId="bm-pool" />
        <Cell label="Worker" value={s.worker} mono testId="bm-worker" />
        <Cell label="Submitted" value={s.submitted_shares} testId="bm-submitted" />
        <Cell label="Uptime" value={fmtUptime(s.uptime_sec)} testId="bm-uptime" />
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <Cell label="Stratum User" value={s.user} mono testId="bm-user" />
        <Cell label="Last Job" value={fmtAge(s.last_job_at)} testId="bm-lastjob" />
      </div>

      {s.last_error && (
        <div className="mt-4 p-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 text-[11px] text-amber-200/90 flex items-start gap-2"
             data-testid="backend-miner-error">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold uppercase tracking-widest text-[9px] text-amber-300/80">Last Error</div>
            <div className="font-mono break-all">{s.last_error}</div>
          </div>
        </div>
      )}

      <div className="mt-3 text-[10px] text-white/45 leading-relaxed">
        <span className="text-cyan-300/80">{s.last_message}</span>
      </div>
    </div>
  );
}

function Cell({ icon, label, value, mono, accent, testId }) {
  return (
    <div className="p-3 rounded-2xl bg-black/45 border border-white/10" data-testid={testId}>
      <div className="text-[9px] uppercase tracking-[0.25em] text-white/40 flex items-center gap-1">
        {icon}{label}
      </div>
      <div className={`mt-1 truncate ${mono ? "font-mono text-[11px]" : "font-display font-black text-sm"} ${accent ? "text-cyan-300" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}
