import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import {
  Cpu, Wallet, Plus, ShieldCheck, Radio, Hand, BatteryCharging,
  Wifi, Thermometer, PowerOff, CheckCircle2, AlertTriangle, Activity, Sparkles,
} from "lucide-react";
import PowerUpButton from "../components/PowerUpButton";
import TierForecast from "../components/TierForecast";
import CyberWealthFlow from "../components/CyberWealthFlow";
import LiveFleetGlobe from "../components/LiveFleetGlobe";
import DailyCalibration from "../components/DailyCalibration";
import TotalTgcCounter from "../components/TotalTgcCounter";
import LegalFooterMini from "../components/LegalFooterMini";

function StatCard({ label, value, suffix = "", testId, tone = "white" }) {
  const toneCls = tone === "ok" ? "text-[#00ff88]" : tone === "info" ? "text-[#00d4ff]" : "text-white";
  return (
    <div className="landing-glass p-6" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono-tech">{label}</div>
      <div className={`mt-3 font-grotesk font-bold ${toneCls}`} style={{ fontSize: "clamp(22px, 2.6vw, 32px)" }}>
        {typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : value}{suffix}
      </div>
    </div>
  );
}

// vNext — cockpit cell used by the new Dashboard header strip
function CockpitCell({ k, v, tone }) {
  const color = tone === "matrix" ? "#00ff88"
              : tone === "cyan"   ? "#00d9ff"
              : tone === "violet" ? "#6c7bff"
              : tone === "amber"  ? "#fbbf24"
              : "#f5f7fa";
  return (
    <div className="bg-black px-4 py-3.5">
      <div className="font-mono uppercase tracking-[0.25em] text-[9px] text-white/40">{k}</div>
      <div className="font-mono font-bold text-[18px] mt-1 tabular-nums truncate" style={{ color }}>{v}</div>
    </div>
  );
}

/** Normalize a backend hashrate value into a user-facing "Processing Rate". */
function processingRate(d) {
  // Hide raw H/s. Show a soft "Processing throughput" score (work units / min equivalent).
  // 1 work unit ~= 60s of verified compute on a baseline device.
  const tasks = Number(d?.tasks_completed || 0);
  return tasks;
}

/** Normalize a device into a user-facing node state (no "mining" surface). */
function nodeState(d) {
  if (!d) return "offline";
  if (d.flagged) return "attention";
  // Throttled: present, online, but paused by safety guard
  if (d.thermal === "warm" || d.thermal === "hot") return "paused";
  if (d.native_pow || d.mining_status === "mining") return "processing";
  if (d.status === "active") return "connected";
  return "idle";
}

const STATE_META = {
  offline:    { label: "Offline",                color: "rgba(160,180,200,0.55)" },
  idle:       { label: "Idle",                   color: "rgba(160,180,200,0.85)" },
  connected:  { label: "Connected",              color: "#00d4ff" },
  processing: { label: "Processing",             color: "#00ff88" },
  paused:     { label: "Paused by Safety Guard", color: "#ff7a18" },
  attention:  { label: "Attention needed",       color: "#ff5152" },
};

/** Map a recent task row into a cloud-task activity entry (no share/hash dialect). */
function activityEntry(t) {
  const kind = (t.kind || "compute").toLowerCase();
  const ts = new Date(t.created_at || t.ts || Date.now());
  if (t.status === "verified") {
    return {
      key: t.id, ts,
      title: "Output verified",
      sub: `Work unit · ${kind}`,
      reward: (t.earned_usdt || 0),
      level: "ok",
    };
  }
  if (t.status === "rejected") {
    return {
      key: t.id, ts,
      title: "Output rejected",
      sub: `Work unit · ${kind}`,
      reward: 0,
      level: "warn",
    };
  }
  return {
    key: t.id, ts,
    title: "Compute session active",
    sub: `Work unit · ${kind}`,
    reward: 0,
    level: "info",
  };
}

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [devices, setDevices] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [stats, setStats] = useState({});
  const [recent, setRecent] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("flagship");
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [msg, setMsg] = useState("");
  const [ledgerTotals, setLedgerTotals] = useState(null);

  const loadAll = async () => {
    try {
      const [d, w, s, r, p] = await Promise.all([
        api.get("/devices"),
        api.get("/wallet"),
        api.get("/stats/network"),
        api.get("/tasks/recent"),
        api.get("/stats/public"),
      ]);
      setDevices(d.data); setWallet(w.data); setStats(s.data); setRecent(r.data);
      setLedgerTotals(p.data);
    } catch {}
  };

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 5000);
    return () => clearInterval(t);
  }, []);

  const addDevice = async (e) => {
    e.preventDefault();
    try {
      await api.post("/devices/register", { name: newName, model: newModel, platform: "web" });
      setAddOpen(false); setNewName(""); setNewModel("flagship");
      await loadAll();
    } catch (err) { setMsg(formatApiError(err)); }
  };

  const withdraw = async () => {
    setMsg("");
    try {
      const { data } = await api.post("/wallet/withdraw", { address: withdrawAddr || "TRC20-PENDING-ADDR" });
      setMsg(`Payout queued: $${data.amount_usdt.toFixed(2)} → ${data.address.slice(0, 12)}…`);
      setWithdrawAddr("");
      await loadAll();
      await refresh();
    } catch (err) { setMsg(formatApiError(err)); }
  };

  const canWithdraw = wallet && wallet.can_withdraw;

  // Aggregate metrics in user-facing language
  const connectedCount = devices.filter((d) => nodeState(d) !== "offline" && nodeState(d) !== "idle").length;
  const processingCount = devices.filter((d) => nodeState(d) === "processing").length;
  const totalWorkUnits = devices.reduce((a, d) => a + (d.tasks_completed || 0), 0);
  const contributionScore = Math.min(100, Math.round(((wallet?.tgc_total_earned ?? 0) / 1000) * 100));

  return (
    <div className="min-h-screen bg-black text-white font-sans-saas relative">
      {/* vNext immersive background — matches Landing/Token */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 opacity-[0.35]"
             style={{
               backgroundImage:
                 "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
               backgroundSize: "44px 44px",
               maskImage: "radial-gradient(ellipse at 50% 20%, black 40%, transparent 80%)",
               WebkitMaskImage: "radial-gradient(ellipse at 50% 20%, black 40%, transparent 80%)",
             }} />
        <div className="absolute -top-32 left-1/4 w-[600px] h-[600px] rounded-full blur-[140px] opacity-[0.14]"
             style={{ background: "radial-gradient(circle, #00ff88 0%, transparent 60%)" }} />
        <div className="absolute bottom-1/4 right-0 w-[600px] h-[600px] rounded-full blur-[140px] opacity-[0.10]"
             style={{ background: "radial-gradient(circle, #00d9ff 0%, transparent 60%)" }} />
        <div className="absolute inset-0"
             style={{
               backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)",
               mixBlendMode: "multiply", opacity: 0.5,
             }} />
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 pt-16 pb-20">
        {/* vNext Cockpit Header */}
        <div className="border-b border-white/[0.08] pb-8 mb-10">
          <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#00ff88] mb-4">
            // edge_compute_node_operator · cockpit
          </div>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h1 className="font-display text-white"
                style={{ fontSize: "clamp(40px, 5.5vw, 84px)", letterSpacing: "-0.04em", lineHeight: 0.95, fontWeight: 600 }}>
              <span className="text-white/35">operator //</span><br/>
              <span style={{
                background: "linear-gradient(96deg, #00ff88, #00d9ff)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>{user?.name || "anonymous"}</span>
            </h1>
            <Link to="/device" data-testid="dashboard-to-device-link"
                  className="inline-flex items-center gap-3 px-6 py-3.5 rounded-md bg-[#00ff88] text-black font-mono font-bold text-[11px] uppercase tracking-[0.35em]
                             shadow-[0_0_60px_-12px_rgba(0,255,136,0.7)] hover:shadow-[0_0_80px_-12px_rgba(0,255,136,1)] transition">
              <Radio className="w-4 h-4" /> manage edge node
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-px bg-white/[0.06]">
            <CockpitCell k="VERIFIED_BALANCE"      v={`${(wallet?.tgc_balance ?? 0).toFixed(5)} TGC`} tone="matrix" />
            <CockpitCell k="LIFETIME_LEDGER"       v={`${(wallet?.tgc_total_earned ?? 0).toFixed(5)} TGC`} />
            <CockpitCell k="EDGE_NODES"            v={devices.length}                                  tone="cyan" />
            <CockpitCell k="CONTRIBUTION"          v={totalWorkUnits === 0 ? "PENDING" : `${contributionScore}%`}
                         tone={totalWorkUnits === 0 ? "amber" : "matrix"} />
            <CockpitCell k="SNAPSHOT_READINESS"    v="PRE-MAINNET · ACCUMULATING" tone="violet" />
          </div>

          {/* v1.7.5 — active client badge (derived from the first device's client_type) */}
          {devices.length > 0 && (
            <div className="mt-4 inline-flex items-center gap-3 px-4 py-2 border border-white/10 rounded-md bg-black/40"
                 data-testid="dashboard-active-client">
              <span className="font-mono uppercase tracking-[0.3em] text-[9px] text-white/45">active_client</span>
              {(() => {
                const ct = devices[0]?.client_type || "unknown";
                const isLight = ct === "light";
                const isNode  = ct === "node_pro";
                const label = isLight ? "LIGHT_CLOUD" : isNode ? "NODE_PRO_DIRECT" : "LEGACY";
                const tone  = isLight ? "text-[#00d9ff]" : isNode ? "text-[#00ff88]" : "text-white/55";
                const sub   = isLight
                  ? "Official cloud client · no device-side workloads"
                  : isNode
                    ? "Direct infrastructure client · device-side workloads enabled by user opt-in"
                    : "Unidentified client · upgrade recommended";
                return (
                  <>
                    <span className={`font-mono-cyber font-black text-[12px] tracking-[0.2em] ${tone}`}>{label}</span>
                    <span className="text-[10px] text-white/45 hidden md:inline">· {sub}</span>
                  </>
                );
              })()}
            </div>
          )}

          {/* v1.7.5 — Light → Node Pro upgrade banner.
              Compliance-safe copy: never promises higher yield. Only states that
              "additional contribution receipts may be available when optional
              device-side workloads are active and verified." */}
          {(() => {
            const ct = (typeof window !== "undefined" && window.__GRID_CLIENT_TYPE__) || devices[0]?.client_type;
            if (ct !== "light") return null;
            return (
              <div className="mt-4 relative overflow-hidden rounded-lg border border-[#00ff88]/30 bg-gradient-to-r from-black/70 via-[#001a10]/60 to-black/70 backdrop-blur-xl"
                   data-testid="dashboard-pro-upsell">
                <div className="absolute inset-0 pointer-events-none"
                     style={{ background: "radial-gradient(60% 100% at 95% 50%, rgba(0,255,136,0.10), transparent 70%)" }} />
                <div className="relative px-5 py-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-[260px]">
                    <div className="font-mono uppercase tracking-[0.3em] text-[9px] text-[#00ff88]">
                      // optional · direct_infrastructure_client
                    </div>
                    <div className="mt-1 font-display font-bold text-white text-[15px] sm:text-[17px]">
                      Looking for more contribution receipts?
                    </div>
                    <p className="mt-1 text-[12px] text-white/60 leading-relaxed max-w-xl">
                      Additional contribution receipts may be available when optional
                      device-side workloads are active and verified. THE GRID Node Pro
                      is the direct-download advanced client for users who explicitly
                      opt into device-side compute. Battery and thermal safeguards apply;
                      stop anytime.
                    </p>
                  </div>
                  <a href="/grid-worker-nodepro.apk" download
                     data-testid="dashboard-nodepro-cta"
                     onClick={() => { try { fetch(`${process.env.REACT_APP_BACKEND_URL}/api/apk/track-download`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({flavor:"node_pro"}), keepalive:true }).catch(()=>{}); } catch {} }}
                     className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[#00ff88] text-black font-mono font-bold uppercase tracking-[0.3em] text-[11px]
                                shadow-[0_0_36px_-8px_rgba(0,255,136,0.7)] hover:shadow-[0_0_60px_-8px_rgba(0,255,136,1)] transition">
                    download node pro →
                  </a>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Power-Up + Tier Forecast (still visible — they reflect contribution velocity) */}
        <div className="grid lg:grid-cols-2 gap-6 mb-10">
          <PowerUpButton onChange={loadAll} />
          <TierForecast />
        </div>

        {/* v1.6.2 — Daily Grid Calibration + Network Contribution Ledger */}
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 mb-10">
          <DailyCalibration onClaimed={loadAll} />
          <div className="border border-white/[0.08] bg-black/55 backdrop-blur-xl rounded-lg p-6 flex flex-col justify-between"
               data-testid="dashboard-ledger-totals">
            <div>
              <div className="font-mono uppercase tracking-[0.3em] text-[10px] text-white/45 mb-3">
                // network.contribution_ledger
              </div>
              <TotalTgcCounter
                variant="default"
                value={ledgerTotals?.total_tgc_issued || 0}
                subValues={{
                  circulating: ledgerTotals?.circulating_tgc || 0,
                  burned:      ledgerTotals?.total_tgc_burned || 0,
                }}
                tone="matrix"
                testId="dashboard-total-tgc-counter"
              />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-px bg-white/[0.06]">
              <div className="bg-black px-3 py-2.5">
                <div className="font-mono uppercase tracking-[0.25em] text-[9px] text-white/40">compute</div>
                <div className="font-mono font-bold text-[13px] text-white tabular-nums">
                  {Number(ledgerTotals?.total_compute_tgc || 0).toFixed(5)}
                </div>
              </div>
              <div className="bg-black px-3 py-2.5">
                <div className="font-mono uppercase tracking-[0.25em] text-[9px] text-white/40">calibration</div>
                <div className="font-mono font-bold text-[13px] text-[#00d9ff] tabular-nums">
                  {Number(ledgerTotals?.total_daily_calibration_tgc || 0).toFixed(5)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reward Balance panel + Activity Feed */}
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 mb-10">
          <CyberWealthFlow
            tgcBalance={wallet?.tgc_balance ?? 0}
            tgcUsdt={wallet?.tgc_balance_usdt_value ?? 0}
            threshold={wallet?.withdraw_threshold_tgc ?? 200}
            thresholdUsdt={wallet?.withdraw_threshold_usdt ?? 10}
            testId="dashboard-reward-balance">
            <div className="mt-7 flex gap-3">
              <input
                placeholder={wallet?.redemption_locked
                  ? "Foundation Buyback Window için cüzdan adresini şimdi kaydet (örn. BSC 0x… veya TRC-20 T…)"
                  : "Linked payout address (e.g. TRC-20 TXYZ…)"}
                value={withdrawAddr}
                onChange={(e) => setWithdrawAddr(e.target.value)}
                data-testid="withdraw-address-input"
                className="flex-1 bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:border-[#00ff88] focus:outline-none font-mono-tech" />
              <button
                onClick={withdraw}
                disabled={!canWithdraw}
                data-testid="withdraw-btn"
                className={`px-6 py-3 rounded-xl font-semibold text-sm whitespace-nowrap transition-all inline-flex items-center gap-2 tracking-wide ${
                  canWithdraw
                    ? "bg-[#00ff88] text-black shadow-[0_0_30px_rgba(0,255,136,0.45)] hover:shadow-[0_0_50px_rgba(0,255,136,0.7)]"
                    : "bg-white/5 text-white/30 cursor-not-allowed"
                }`}>
                {wallet?.redemption_locked ? "Pre-Mainnet · Buyback Closed" : "Request Payout"}
              </button>
            </div>
            {wallet?.redemption_locked && (
              <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.04] px-4 py-3"
                   data-testid="dashboard-mainnet-banner">
                <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300/85 font-mono-term mb-1">
                  FOUNDATION · BUYBACK PROGRAM
                </div>
                <div className="text-[12px] text-white/70 leading-relaxed">
                  100 TGC eşiğine ulaşan contributor'lar, Foundation Buyback Window
                  açıldığında bakiyelerini USDT karşılığı geri alım programına sunabilir.
                  Program; dönemsel bütçe, doğrulama, risk kontrolü ve treasury likiditesine
                  bağlıdır — garanti değildir. Cüzdan adresini şimdi kaydet.
                </div>
              </div>
            )}
            {/* Backward-compat hidden testids (kept for existing tests) */}
            <span className="hidden" data-testid="dashboard-tgc-balance">{(wallet?.tgc_balance ?? 0).toFixed(1)}</span>
            <span className="hidden" data-testid="dashboard-tgc-usdt-value">{(wallet?.tgc_balance_usdt_value ?? 0).toFixed(2)}</span>
            {msg && <div className="mt-4 text-xs text-[#00ff88] font-mono-tech" data-testid="wallet-msg">{msg}</div>}
          </CyberWealthFlow>

          {/* Activity Feed — cloud task language only */}
          <div className="landing-glass p-6 overflow-hidden" data-testid="activity-feed">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45 font-mono-tech">
                <Activity className="w-3.5 h-3.5" /> / activity feed
              </div>
              <span className="text-[11px] text-white/40 font-mono-tech">Latest 25</span>
            </div>
            <div className="max-h-[300px] overflow-auto pr-1" data-testid="recent-tasks-list">
              {recent.length === 0 && (
                <div className="text-sm text-white/40 py-10 text-center font-sans-saas">
                  Waiting for first verified output. Open your Compute Node to contribute.
                </div>
              )}
              {recent.map((t) => {
                const a = activityEntry(t);
                const tone = a.level === "ok" ? "ok" : a.level === "warn" ? "warn" : "info";
                return (
                  <div key={a.key} className={`feed-row ${tone} mb-1.5 flex items-center justify-between`}>
                    <div className="min-w-0">
                      <div className="text-white/85 text-[12px] font-medium truncate">{a.title}</div>
                      <div className="text-white/40 text-[10.5px]">{a.sub}</div>
                    </div>
                    <div className="text-right shrink-0 pl-3">
                      <div className="text-[10px] text-white/35 font-mono-tech">
                        {a.ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      {a.reward > 0 && (
                        <div className="text-[10.5px] text-[#00ff88] font-mono-tech">+ ${a.reward.toFixed(4)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Compute Fleet (rotating globe view) */}
        <div className="mb-10">
          <LiveFleetGlobe devices={devices} />
        </div>

        {/* Safe Compute Rules */}
        <div className="landing-glass p-7 mb-10" data-testid="safe-compute-rules">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
            <div>
              <div className="landing-pill ok mb-2"><ShieldCheck className="w-3 h-3" /> Safety</div>
              <h2 className="font-grotesk font-semibold text-white text-[20px]">Safe Compute Rules</h2>
            </div>
            <span className="text-[11px] text-white/45 font-mono-tech">six guards · enforced per cycle</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { icon: Hand,            t: "User permission required",   d: "Compute starts only after the device owner approves." },
              { icon: BatteryCharging, t: "Charging-only mode",         d: "Pauses on battery to protect daily use." },
              { icon: Wifi,            t: "Wi-Fi only transport",       d: "No cellular data spend — Wi-Fi gates everything." },
              { icon: Thermometer,     t: "Thermal protection",         d: "Auto-throttles when CPU temperature is high." },
              { icon: BatteryCharging, t: "Battery threshold",          d: "Idles below 30% — phone first, network second." },
              { icon: PowerOff,        t: "Stop anytime",               d: "Pause or remove the node with a single tap." },
            ].map((r, i) => (
              <div key={r.t} className="bento-card p-4 flex items-start gap-3" data-testid={`rule-${i}`}>
                <span className="accent-bar" />
                <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0"
                     style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.25)" }}>
                  <r.icon className="w-4 h-4" style={{ color: "#00ff88" }} strokeWidth={1.6} />
                </div>
                <div>
                  <div className="text-white text-[13.5px] font-semibold font-grotesk">{r.t}</div>
                  <div className="text-white/55 text-[12px] mt-1 font-sans-saas">{r.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Compute Nodes — your devices */}
        <div className="landing-glass-strong p-8">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
            <div>
              <div className="landing-pill info mb-2"><Cpu className="w-3 h-3" /> / your nodes</div>
              <h2 className="font-grotesk font-semibold text-white text-[22px]">Compute Nodes</h2>
            </div>
            <button onClick={() => setAddOpen((v) => !v)} data-testid="add-device-btn"
              className="landing-cta-secondary inline-flex items-center gap-2 text-[12px]">
              <Plus className="w-4 h-4" /> Add Node
            </button>
          </div>

          {addOpen && (
            <form onSubmit={addDevice} className="mb-6 p-5 rounded-2xl bg-black/40 border border-white/[0.06] grid md:grid-cols-[2fr_1fr_auto] gap-3 items-end" data-testid="add-device-form">
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono-tech">Node name</label>
                <input required value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. iPhone 15 Pro · living room" data-testid="add-device-name"
                  className="mt-2 w-full bg-black/60 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:border-[#00ff88] focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono-tech">Tier</label>
                <select value={newModel} onChange={(e) => setNewModel(e.target.value)} data-testid="add-device-model"
                  className="mt-2 w-full bg-black/60 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:border-[#00ff88] focus:outline-none">
                  <option value="flagship">Flagship (3.0× contribution)</option>
                  <option value="mid">Mid (1.8× contribution)</option>
                  <option value="budget">Budget (1.0× contribution)</option>
                </select>
              </div>
              <button type="submit" data-testid="add-device-submit" className="landing-cta-primary text-[13px]">
                Register
              </button>
            </form>
          )}

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="devices-list">
            {devices.length === 0 && (
              <div className="col-span-full py-12 text-center text-white/40 text-sm font-sans-saas">
                No compute nodes yet — register your first device above.
              </div>
            )}
            {devices.map((d) => {
              const st = nodeState(d);
              const meta = STATE_META[st];
              return (
                <div key={d.id} className="bento-card p-5 hover:border-[#00ff88]/30" data-testid={`device-card-${d.id}`}>
                  <span className="accent-bar" />
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono-tech">{d.model}</div>
                      <div className="font-grotesk font-semibold text-white text-[16px] mt-0.5">{d.name}</div>
                    </div>
                    <span className="landing-pill" style={{ color: meta.color, borderColor: meta.color + "55" }}>
                      <span className="dot" /> {meta.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[12.5px] font-sans-saas">
                    <div className="text-white/45">Verified Work Units</div>
                    <div className="text-right text-white font-mono-tech">{processingRate(d).toLocaleString()}</div>
                    <div className="text-white/45">Processing Power</div>
                    <div className="text-right text-white font-mono-tech">{(d.total_flops || 0).toLocaleString()}</div>
                    <div className="text-white/45">Node Status</div>
                    <div className="text-right uppercase tracking-widest text-[10px]" style={{ color: meta.color }}>{st}</div>
                  </div>
                  {d.flagged && (
                    <div className="mt-3 flex items-center gap-1.5 text-[10.5px] uppercase tracking-widest text-[#ff5152] font-mono-tech">
                      <AlertTriangle className="w-3 h-3" /> Attention needed · flagged by risk shield
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
      <LegalFooterMini testIdPrefix="dashboard" />
    </div>
  );
}

