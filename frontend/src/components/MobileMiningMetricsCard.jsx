import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Smartphone, Cpu, Activity, CheckCircle2, AlertTriangle, Server, Hash, ChevronRight, Layers } from "lucide-react";

/**
 * MobileMiningMetricsCard — v1.4.8.
 *
 * Explicit Backend Compute / Mobile Compute / Total Compute split for the
 * operator panel. Polls /api/admin/mobile-mining/metrics every 8s.
 * Proxy/keepalive hashrate is NEVER counted; phones in connected_only mode
 * contribute 0.
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
    if (h >= 1e6) return `${(h / 1e6).toFixed(2)} MH/s`;
    if (h >= 1e3) return `${(h / 1e3).toFixed(2)} KH/s`;
    return `${h.toFixed(1)} H/s`;
  };

  const bc = m.backend_compute || {};
  const mc = m.mobile_compute || {};
  const tc = m.total_compute || {};

  return (
    <div className="cyber-card rounded-3xl p-6" data-testid="mobile-mining-metrics-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#00ffe1]/8 border border-[#00ffe1]/30 grid place-items-center">
            <Layers className="w-5 h-5 cyan-text" />
          </div>
          <div>
            <div className="font-mono-cyber font-bold text-base flex items-center gap-2">
              <span className="cyan-text">compute_split_ledger</span>
              <span className="text-white/40">·</span>
              <span className="text-white/80">v1.4.8</span>
            </div>
            <div className="text-[11px] text-white/55 font-mono-term mt-1 max-w-3xl">
              backend compute (server xmrig/sha256) and mobile compute (phone-native randomx)
              are reconciled honestly · proxy/keepalive hashrate is never counted ·
              phones in connected_only mode contribute 0
            </div>
          </div>
        </div>
        <span className="cyber-pill" data-testid="mmm-asof">
          as_of {(m.as_of || "").slice(11, 19)}
        </span>
      </div>

      {/* THREE EXPLICIT COMPUTE LANES — Backend / Mobile / Total */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* BACKEND COMPUTE */}
        <Lane
          title="BACKEND COMPUTE"
          icon={<Server className="w-4 h-4" />}
          accent={bc.active ? "matrix" : "cyan"}
          active={bc.active}
          testId="lane-backend-compute"
          rows={[
            { label: "Processing Rate", value: fmtH(bc.hashrate_hps), accent: bc.hashrate_hps > 0 ? "matrix" : "cyan", testId: "lane-backend-hashrate" },
            { label: "Verified Outputs", value: bc.accepted_outputs ?? 0, accent: (bc.accepted_outputs ?? 0) > 0 ? "matrix" : "cyan", testId: "lane-backend-accepted" },
            { label: "RandomX Engine", value: bc.randomx_running ? "ACTIVE" : "IDLE", accent: bc.randomx_running ? "matrix" : "cyan", testId: "lane-backend-rx" },
            { label: "SHA-256 Engine", value: bc.sha256_running ? "ACTIVE" : "IDLE", accent: bc.sha256_running ? "matrix" : "cyan", testId: "lane-backend-sha" },
          ]}
        />

        {/* MOBILE COMPUTE */}
        <Lane
          title="MOBILE COMPUTE"
          icon={<Smartphone className="w-4 h-4" />}
          accent={mc.active ? "matrix" : "cyan"}
          active={mc.active}
          testId="lane-mobile-compute"
          rows={[
            { label: "Connected Phones", value: mc.connected_phones ?? 0, accent: (mc.connected_phones ?? 0) > 0 ? "matrix" : "cyan", testId: "lane-mobile-connected" },
            { label: "Engaged Phones", value: mc.engaged_phones ?? 0, accent: (mc.engaged_phones ?? 0) > 0 ? "matrix" : "cyan", testId: "lane-mobile-engaged" },
            { label: "Engine Active", value: mc.engine_active_phones ?? 0, accent: (mc.engine_active_phones ?? 0) > 0 ? "matrix" : "cyan", testId: "lane-mobile-engine-active" },
            { label: "Processing Rate", value: fmtH(mc.hashrate_hps), accent: mc.hashrate_hps > 0 ? "matrix" : "cyan", testId: "lane-mobile-hashrate" },
            { label: "Verified Outputs", value: mc.accepted_outputs ?? 0, accent: (mc.accepted_outputs ?? 0) > 0 ? "matrix" : "cyan", testId: "lane-mobile-accepted" },
          ]}
        />

        {/* TOTAL COMPUTE */}
        <Lane
          title="TOTAL COMPUTE"
          icon={<Activity className="w-4 h-4" />}
          accent={tc.hashrate_hps > 0 ? "matrix" : "cyan"}
          active={tc.hashrate_hps > 0}
          testId="lane-total-compute"
          rows={[
            { label: "Aggregate Rate", value: fmtH(tc.hashrate_hps), accent: tc.hashrate_hps > 0 ? "matrix" : "cyan", testId: "lane-total-hashrate" },
            { label: "Verified Outputs", value: tc.accepted_outputs ?? 0, accent: (tc.accepted_outputs ?? 0) > 0 ? "matrix" : "cyan", testId: "lane-total-accepted" },
            { label: "Active Workers", value: tc.active_workers ?? 0, accent: (tc.active_workers ?? 0) > 0 ? "matrix" : "cyan", testId: "lane-total-workers" },
            { label: "Split", value: `B${bc.hashrate_hps > 0 ? "•" : "○"}  M${mc.hashrate_hps > 0 ? "•" : "○"}`, accent: "cyan", testId: "lane-total-split" },
          ]}
        />
      </div>

      {m.bridge && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs"
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

      {m.mining_phones === 0 && !m.recently_engaged_phones && (
        <div className="mt-4 p-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 text-[11px] text-amber-100/85 font-mono-term flex items-start gap-2"
             data-testid="mmm-no-mining-phones">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-bold uppercase tracking-widest text-[9px] text-amber-300/80">
              NO ENGAGED MOBILE NODES YET
            </div>
            <div className="mt-1">
              {m.connected_phones === 0
                ? "No phones connected — install the v1.4.9 APK and tap ENGAGE NODE."
                : `${m.connected_phones} phone${m.connected_phones > 1 ? "s" : ""} connected but in idle / connected_only mode (operator hasn't tapped ENGAGE NODE yet).`}
            </div>
          </div>
        </div>
      )}

      {m.recently_engaged_phones > 0 && m.engaged_phones === 0 && (
        <div className="mt-4 p-3 rounded-2xl border border-yellow-400/30 bg-yellow-400/8 text-[11px] text-yellow-100/85 font-mono-term flex items-start gap-2"
             data-testid="mmm-recently-engaged">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-bold uppercase tracking-widest text-[9px] text-yellow-300/90">
              {m.recently_engaged_phones} PHONE{m.recently_engaged_phones > 1 ? "S" : ""} ENGAGED RECENTLY — HEARTBEAT STALE
            </div>
            <div className="mt-1">
              Foreground service likely killed by Android Doze / battery optimisation.
              Ask the operator to re-open the APK and tap ENGAGE NODE again.
            </div>
            {(m.recently_engaged || []).slice(0, 3).map((d) => (
              <div key={d.device_id} className="mt-1 text-[10px] text-yellow-200/60 font-mono-term"
                   data-testid={`mmm-recent-${d.device_id}`}>
                <span className="cyan-text">{d.name || d.device_id}</span> ·{" "}
                v{d.app_version || "?"} · last heartbeat {fmtAge(d.last_heartbeat)}
              </div>
            ))}
          </div>
        </div>
      )}

      {m.miners && m.miners.length > 0 && (
        <div className="mt-4 cyber-card rounded-2xl p-3" data-testid="mmm-miners-table">
          <div className="text-[9px] uppercase tracking-[0.3em] text-[#00ffe1]/60 font-mono-term mb-2 px-2">
            ENGAGED MOBILE NODES
          </div>
          <div className="space-y-1">
            {m.miners.map((d) => (
              <div key={d.device_id}
                   className="flex items-center gap-3 px-3 py-2 rounded-lg bg-black/40 border border-[#00ffe1]/8 hover:border-[#00ffe1]/25 transition text-[11px] font-mono-cyber"
                   data-testid={`mmm-miner-${d.device_id}`}>
                <ChevronRight className="w-3 h-3 cyan-text flex-shrink-0" />
                <span className="cyan-text w-32 truncate">{d.name || d.device_id}</span>
                <span className="text-white/55 w-32 truncate">{d.model || "—"}</span>
                <span className={`w-32 truncate text-[10px] uppercase tracking-widest ${d.engine_active ? "matrix-text" : "text-white/55"}`}>
                  {(d.node_state || "engaged_standby").replace(/_/g, " ")}
                </span>
                <span className="matrix-text w-24">{fmtH(d.hashrate_hps)}</span>
                <span className="text-white/65 w-20">acc:{d.accepted}</span>
                <span className="text-white/45 w-20">bat:{d.battery ?? "?"}%</span>
                <span className="text-white/45">{d.network || ""}</span>
                {d.engine_active && <span className="cyber-pill matrix-pill text-[8px]">● ENGINE</span>}
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

function Lane({ title, icon, accent, active, rows, testId }) {
  const borderCls = active
    ? "border-[#00ff88]/35 bg-[#00ff88]/5"
    : "border-[#00ffe1]/15 bg-black/45";
  const titleCls = active ? "matrix-text" : "cyan-text";
  return (
    <div className={`rounded-2xl border ${borderCls} p-4 transition`} data-testid={testId}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-lg grid place-items-center border ${active ? "border-[#00ff88]/40 bg-[#00ff88]/10" : "border-[#00ffe1]/25 bg-[#00ffe1]/5"}`}>
          {icon}
        </div>
        <div className={`font-mono-cyber font-bold text-xs tracking-[0.2em] ${titleCls}`}>
          {title}
        </div>
        <span className={`ml-auto text-[8px] uppercase tracking-widest ${active ? "matrix-text" : "text-white/35"}`}>
          {active ? "live" : "idle"}
        </span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-2" data-testid={r.testId}>
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/45 font-mono-term">
              {r.label}
            </span>
            <span className={`font-mono-cyber font-black text-sm ${r.accent === "matrix" ? "matrix-text" : "cyan-text"}`}>
              {r.value}
            </span>
          </div>
        ))}
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

function fmtAge(iso) {
  if (!iso) return "—";
  try {
    const t = new Date(iso).getTime();
    const ageS = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (ageS < 60) return `${ageS}s ago`;
    if (ageS < 3600) return `${Math.floor(ageS / 60)}m ago`;
    return `${Math.floor(ageS / 3600)}h ago`;
  } catch { return "—"; }
}
