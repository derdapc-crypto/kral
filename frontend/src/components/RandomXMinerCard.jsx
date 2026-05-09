import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Cpu, RefreshCw, CheckCircle2, XCircle, Activity, Hash, Zap, AlertTriangle } from "lucide-react";

/**
 * RandomXMinerCard — Plan A xmrig RandomX miner status (v1.3.5).
 * Polls /api/admin/randomx-miner/status every 5s.
 */
export default function RandomXMinerCard() {
  const [s, setS] = useState(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get("/admin/randomx-miner/status");
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
    try { await api.post("/admin/randomx-miner/restart"); } catch {}
    setRestarting(false);
  };

  if (!s) return null;

  const live = s.running && s.available && s.hashrate_hps > 0;
  const fmtH = (h) => {
    if (!h) return "0 H/s";
    if (h >= 1e6) return `${(h/1e6).toFixed(2)} MH/s`;
    if (h >= 1e3) return `${(h/1e3).toFixed(2)} KH/s`;
    return `${h.toFixed(1)} H/s`;
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
    if (sec < 3600) return `${Math.floor(sec/60)}m`;
    return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}m`;
  };

  return (
    <div data-testid="randomx-miner-card"
         className={`rounded-3xl p-6 cyber-card ${live ? "cyber-card-strong" : ""}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#00ffe1]/8 border border-[#00ffe1]/30 grid place-items-center cyan-glow">
            <Cpu className={`w-5 h-5 ${live ? "matrix-text" : "cyan-text"}`} />
          </div>
          <div>
            <div className="font-mono-cyber font-bold text-base flex items-center gap-2">
              <span className="cyan-text">randomx_engine</span>
              <span className="text-white/40">·</span>
              <span className="text-white/80">PLAN A</span>
              <span data-testid="randomx-miner-state-badge"
                    className={`cyber-pill ${live ? "matrix-pill" : ""}`}>
                {live ? "● MINING" : s.running ? "● RECONNECTING" : "● STOPPED"}
              </span>
            </div>
            <div className="text-xs text-white/55 mt-1 max-w-2xl font-mono-term" data-testid="randomx-miner-note">
              {s.note}
            </div>
          </div>
        </div>
        <button onClick={restart} data-testid="randomx-miner-restart"
          className="cyber-pill hover:cyan-glow transition" disabled={restarting}>
          <RefreshCw className={`w-3 h-3 ${restarting ? "animate-spin" : ""}`} />
          {restarting ? "restarting…" : "RESTART"}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs" data-testid="randomx-miner-stats">
        <Cell icon={<Activity className="w-3 h-3" />} label="HASHRATE" value={fmtH(s.hashrate_hps)} accent="matrix" testId="rx-hashrate" />
        <Cell icon={<Hash className="w-3 h-3" />}     label="POOL DIFF" value={s.current_difficulty ? s.current_difficulty.toLocaleString() : "—"} testId="rx-difficulty" />
        <Cell icon={<CheckCircle2 className="w-3 h-3" />} label="ACCEPTED" value={s.accepted_shares} accent={s.accepted_shares > 0 ? "matrix" : "cyan"} testId="rx-accepted" />
        <Cell icon={<XCircle className="w-3 h-3" />}      label="REJECTED" value={s.rejected_shares} testId="rx-rejected" />
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Cell icon={<Zap className="w-3 h-3" />} label="POOL"      value={s.pool} mono testId="rx-pool" />
        <Cell label="ALGO"     value={(s.algorithm || "rx/0").toUpperCase()} accent="cyan" testId="rx-algo" />
        <Cell label="THREADS"  value={s.threads} testId="rx-threads" />
        <Cell label="UPTIME"   value={fmtUptime(s.uptime_sec)} testId="rx-uptime" />
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <Cell label="WORKER"  value={s.worker} mono testId="rx-worker" />
        <Cell label="LAST SHARE" value={fmtAge(s.last_share_at)} testId="rx-lastshare" />
      </div>

      {s.last_error && (
        <div className="mt-4 p-3 rounded-2xl border border-red-400/30 bg-red-400/5 text-[11px] text-red-200/90 flex items-start gap-2 font-mono-cyber" data-testid="randomx-miner-error">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-bold uppercase tracking-widest text-[9px] text-red-300/80">LAST_ERROR</div>
            <div className="break-all">{s.last_error}</div>
          </div>
        </div>
      )}

      <div className="mt-3 text-[10px] text-white/45 leading-relaxed font-mono-term">
        <span className="cyan-text">{">"}</span>{" "}{s.last_message}
      </div>
    </div>
  );
}

function Cell({ icon, label, value, mono, accent, testId }) {
  const accentCls = accent === "matrix" ? "matrix-text" : accent === "cyan" ? "cyan-text" : "text-white";
  return (
    <div className="p-3 rounded-2xl bg-black/55 border border-[#00ffe1]/12 hover:border-[#00ffe1]/30 transition" data-testid={testId}>
      <div className="text-[9px] uppercase tracking-[0.28em] text-[#00ffe1]/60 flex items-center gap-1 font-mono-term">
        {icon}{label}
      </div>
      <div className={`mt-1 truncate ${mono ? "font-mono-cyber text-[11px]" : "font-mono-cyber font-black text-sm"} ${accentCls}`}>
        {value}
      </div>
    </div>
  );
}
