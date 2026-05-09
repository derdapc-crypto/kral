import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Smartphone, Cpu, Activity, CheckCircle2, AlertTriangle, Server, Hash, ChevronRight } from "lucide-react";

/**
 * MobileMiningMetricsCard — v1.3.7.
 *
 * Honest split between server-side miner numbers and mobile native mining
 * numbers. Polls /api/admin/mobile-mining/metrics every 8s. NEVER displays
 * proxy/keepalive hashrate; phones stuck in connected_only contribute 0.
 */
export default function MobileMiningMetricsCard() {
  const [m, setM] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get("/admin/mobile-mining/metrics");
        if (!cancelled) setM(data);
      } catch {}
    };
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 8000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!m) return null;

  const fmtH = (h) => {
    if (!h) return "0 H/s";
    if (h >= 1e6) return `${(h/1e6).toFixed(2)} MH/s`;
    if (h >= 1e3) return `${(h/1e3).toFixed(2)} KH/s`;
    return `${h.toFixed(1)} H/s`;
  };

  return (
    <div className="cyber-card rounded-3xl p-6" data-testid="mobile-mining-metrics-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#00ffe1]/8 border border-[#00ffe1]/30 grid place-items-center">
            <Smartphone className="w-5 h-5 cyan-text" />
          </div>
          <div>
            <div className="font-mono-cyber font-bold text-base flex items-center gap-2">
              <span className="cyan-text">mobile_mining_ledger</span>
              <span className="text-white/40">·</span>
              <span className="text-white/80">v1.3.8</span>
            </div>
            <div className="text-[11px] text-white/55 font-mono-term mt-1 max-w-3xl">
              honest split: server xmrig vs phone-native randomx · proxy/keepalive
              hashrate is never counted · phones in connected_only contribute 0 ·
              backend ws bridge forwards real shares to pool
            </div>
          </div>
        </div>
        <span className="cyber-pill" data-testid="mmm-asof">
          as_of {(m.as_of || "").slice(11, 19)}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Big icon={<Smartphone className="w-3 h-3" />} label="CONNECTED PHONES"
             value={m.connected_phones} accent="cyan" testId="mmm-connected-phones" />
        <Big icon={<Cpu className="w-3 h-3" />} label="MINING PHONES"
             value={m.mining_phones} accent={m.mining_phones > 0 ? "matrix" : "cyan"} testId="mmm-mining-phones" />
        <Big icon={<Activity className="w-3 h-3" />} label="MOBILE NATIVE H/s"
             value={fmtH(m.mobile_native_hashrate_hps)}
             accent={m.mobile_native_hashrate_hps > 0 ? "matrix" : "cyan"} testId="mmm-mobile-hashrate" />
        <Big icon={<Hash className="w-3 h-3" />} label="MOBILE SUBMITTED"
             value={m.mobile_submitted_shares ?? 0}
             accent={(m.mobile_submitted_shares ?? 0) > 0 ? "matrix" : "cyan"}
             testId="mmm-mobile-submitted" />
        <Big icon={<CheckCircle2 className="w-3 h-3" />} label="MOBILE ACCEPTED"
             value={m.mobile_accepted_shares}
             accent={m.mobile_accepted_shares > 0 ? "matrix" : "cyan"} testId="mmm-mobile-accepted" />
        <Big icon={<Server className="w-3 h-3" />} label="SERVER MINER H/s"
             value={fmtH(m.server_miner_hashrate_hps)} accent="cyan" testId="mmm-server-hashrate" />
        <Big icon={<Hash className="w-3 h-3" />} label="SERVER ACCEPTED"
             value={m.server_accepted_shares} accent="cyan" testId="mmm-server-accepted" />
        <Big icon={<Activity className="w-3 h-3" />} label="TOTAL ACTIVE WORKERS"
             value={m.total_active_workers ?? 0}
             accent={(m.total_active_workers ?? 0) > 0 ? "matrix" : "cyan"}
             testId="mmm-total-workers" />
      </div>

      {m.bridge && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs"
             data-testid="mmm-bridge-row">
          <Big label="BRIDGE WORKERS" value={m.bridge.bridge_active_workers ?? 0}
               accent={(m.bridge.bridge_active_workers ?? 0) > 0 ? "matrix" : "cyan"}
               testId="mmm-bridge-workers" />
          <Big label="BRIDGE SUBMITTED" value={m.bridge.bridge_submitted_shares ?? 0}
               testId="mmm-bridge-submitted" />
          <Big label="BRIDGE ACCEPTED" value={m.bridge.bridge_accepted_shares ?? 0}
               accent={(m.bridge.bridge_accepted_shares ?? 0) > 0 ? "matrix" : "cyan"}
               testId="mmm-bridge-accepted" />
          <Big label="BRIDGE REJECTED" value={m.bridge.bridge_rejected_shares ?? 0}
               testId="mmm-bridge-rejected" />
        </div>
      )}

      {m.mining_phones === 0 && (
        <div className="mt-4 p-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 text-[11px] text-amber-100/85 font-mono-term flex items-start gap-2"
             data-testid="mmm-no-mining-phones">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-bold uppercase tracking-widest text-[9px] text-amber-300/80">
              NO MOBILE MINERS YET
            </div>
            <div className="mt-1">
              {m.connected_phones === 0
                ? "No phones connected — install the v1.3.7 APK and tap Start Mining."
                : `${m.connected_phones} phone${m.connected_phones > 1 ? "s" : ""} connected but in connected_only mode (librandomx.so missing or operator hasn't tapped Start Mining yet).`}
            </div>
          </div>
        </div>
      )}

      {m.miners && m.miners.length > 0 && (
        <div className="mt-4 cyber-card rounded-2xl p-3" data-testid="mmm-miners-table">
          <div className="text-[9px] uppercase tracking-[0.3em] text-[#00ffe1]/60 font-mono-term mb-2 px-2">
            ACTIVE MOBILE MINERS
          </div>
          <div className="space-y-1">
            {m.miners.map((d) => (
              <div key={d.device_id}
                   className="flex items-center gap-3 px-3 py-2 rounded-lg bg-black/40 border border-[#00ffe1]/8 hover:border-[#00ffe1]/25 transition text-[11px] font-mono-cyber"
                   data-testid={`mmm-miner-${d.device_id}`}>
                <ChevronRight className="w-3 h-3 cyan-text flex-shrink-0" />
                <span className="cyan-text w-32 truncate">{d.name || d.device_id}</span>
                <span className="text-white/55 w-32 truncate">{d.model || "—"}</span>
                <span className="matrix-text w-24">{fmtH(d.hashrate_hps)}</span>
                <span className="text-white/65 w-20">sub:{d.submitted ?? 0}</span>
                <span className="text-white/65 w-20">acc:{d.accepted}</span>
                <span className="text-white/45 w-20">bat:{d.battery ?? "?"}%</span>
                <span className="text-white/45">{d.network || ""}</span>
                {d.verified && <span className="cyber-pill matrix-pill text-[8px]">✓ VERIFIED</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 text-[10px] text-white/40 font-mono-term leading-relaxed"
           data-testid="mmm-honest-disclosure">
        <span className="cyan-text">{">"}</span>{" "}{m.honest_disclosure}
      </div>
    </div>
  );
}

function Big({ icon, label, value, accent, testId }) {
  const cls = accent === "matrix" ? "matrix-text" : "cyan-text";
  return (
    <div className="p-4 rounded-2xl bg-black/55 border border-[#00ffe1]/12 hover:border-[#00ffe1]/30 transition" data-testid={testId}>
      <div className="text-[9px] uppercase tracking-[0.3em] text-[#00ffe1]/60 flex items-center gap-1 font-mono-term">
        {icon}{label}
      </div>
      <div className={`mt-1.5 font-mono-cyber font-black text-2xl ${cls}`}>{value}</div>
    </div>
  );
}
