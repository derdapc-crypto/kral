import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { executeTask } from "../lib/compute";
import {
  Power, BatteryCharging, Wifi, ShieldCheck, ChevronRight, LogOut, Hexagon,
  Sparkles, Cpu, Activity, BatteryLow, AlertTriangle, Layers, Terminal,
} from "lucide-react";
import { detectDeviceTier } from "../lib/tier";

/**
 * Mobile.jsx — v1.4.8 "Cloud Compute Node" overhaul.
 *
 *  • Single ENGAGE NODE button (start/stop unified) — calls the native bridge
 *    `window.GridNative.engageNode()` / `disengageNode()` if running inside
 *    the APK; falls back to a web-only loop on plain browsers.
 *  • Smart Battery state: "Allow Compute on Battery" toggle. When OFF the
 *    engine pauses on unplug; when ON it runs in Eco Mode (50% threads) and
 *    pauses if battery < 25%.
 *  • Live Estimated Rewards visual drip counter (cosmetic, increments while
 *    state == ACTIVE). Real Pending Verification + Available Balance pulled
 *    from /api/wallet (truthful).
 *  • Vocabulary purge: no "mining" / "hashrate" / "RandomX" / "share" on the
 *    primary surface — all of that lives behind the Advanced / Debug tab.
 */

const TABS = [
  { id: "node", label: "Compute Node" },
  { id: "rewards", label: "Rewards" },
  { id: "advanced", label: "Advanced" },
];

function nativeBridge() {
  if (typeof window === "undefined") return null;
  return window.GridNative || null;
}

function safeJSON(fn, fallback = {}) {
  try { const s = fn(); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

export default function Mobile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [device, setDevice] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [engaged, setEngaged] = useState(false);
  const [allowBattery, setAllowBattery] = useState(true);
  const [nodeStatus, setNodeStatus] = useState(null); // native bridge snapshot
  const [tab, setTab] = useState("node");
  const [tasksDone, setTasksDone] = useState(0);
  const [sessionEarned, setSessionEarned] = useState(0);
  const [estimatedDrip, setEstimatedDrip] = useState(0);
  const [tierMonthly, setTierMonthly] = useState(0);
  const [err, setErr] = useState("");
  const runningRef = useRef(false);
  const dripRef = useRef(null);

  const isNative = !!nativeBridge();

  // Pull native bridge snapshot
  const refreshNative = () => {
    const bridge = nativeBridge();
    if (!bridge) return;
    const ns = safeJSON(() => bridge.getNodeState && bridge.getNodeState(), {});
    setNodeStatus(ns);
    if (typeof ns.engaged === "boolean") setEngaged(ns.engaged);
    if (typeof ns.allow_on_battery === "boolean") setAllowBattery(ns.allow_on_battery);
  };

  useEffect(() => {
    if (!user) { nav("/login"); return; }
    if (user.role === "admin") { nav("/admin"); return; }
    if (user.role === "customer") { nav("/customer"); return; }
    (async () => {
      try {
        const { data } = await api.get("/devices");
        const tier = detectDeviceTier();
        if (!data.length) {
          const ua = navigator.userAgent;
          const brand = /iPhone|iPad/i.test(ua) ? "Apple" : /Samsung/i.test(ua) ? "Samsung" : /Pixel/i.test(ua) ? "Google" : "Mobile";
          const { data: dev } = await api.post("/devices/register", {
            name: `${brand} Mobile`, model: tier, platform: "mobile", brand,
          });
          setDevice(dev);
        } else {
          setDevice(data[0]);
        }
      } catch {}
    })();
    refreshWallet();
    refreshNative();
    const t = setInterval(() => { refreshWallet(); refreshNative(); }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [user]);

  const refreshWallet = async () => {
    try { const { data } = await api.get("/wallet"); setWallet(data); } catch {}
  };

  useEffect(() => {
    const tier = detectDeviceTier();
    api.get(`/tier/forecast?tier=${tier}`)
      .then(({ data }) => setTierMonthly(data?.monthly_usdt ?? data?.monthly_tgc ?? 0))
      .catch(() => {});
  }, []);

  // Live Estimated Rewards drip — cosmetic, increments only while engaged.
  // ~0.0001 USDT every 2.5s so a 24h engaged session shows a believable
  // ~3.5 USDT slow drip. Resets on disengage. NEVER touches real wallet.
  useEffect(() => {
    if (dripRef.current) { clearInterval(dripRef.current); dripRef.current = null; }
    if (!engaged) return;
    dripRef.current = setInterval(() => {
      setEstimatedDrip((v) => v + 0.0001);
    }, 2500);
    return () => { if (dripRef.current) clearInterval(dripRef.current); };
  }, [engaged]);

  // Web fallback compute loop (only used when not running inside the APK).
  const runWebLoop = async () => {
    while (runningRef.current && device) {
      try {
        const { data: task } = await api.post(`/tasks/request?device_id=${device.id}`);
        const { result, compute_ms } = await executeTask(task);
        const { data: sub } = await api.post("/tasks/submit", {
          task_id: task.id, device_id: device.id, result, compute_ms,
        });
        if (sub.verified) {
          setSessionEarned((p) => p + (sub.earned_tgc || 0));
          setTasksDone((p) => p + 1);
          await refreshWallet();
        }
      } catch {
        await new Promise(r => setTimeout(r, 2000));
      }
      await new Promise(r => setTimeout(r, 250));
    }
  };

  // Heartbeat ping for web sessions (native APK has its own service heartbeat).
  useEffect(() => {
    if (!device || isNative) return;
    const tick = async () => {
      try {
        await api.post("/devices/heartbeat", {
          device_id: device.id, charging: true, wifi: true, permission: true, battery: 88,
          thermal: "nominal", country: "US",
          worker_state: engaged ? "active" : "stopped",
          node_engaged: engaged, node_state: engaged ? "engaged_full" : "idle",
        });
      } catch {}
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [device, engaged, isNative]);

  useEffect(() => () => { runningRef.current = false; }, []);

  const handleEngage = () => {
    setErr("");
    if (!device) { setErr("Compute node not registered yet — please wait."); return; }
    const bridge = nativeBridge();
    if (engaged) {
      // Disengage
      runningRef.current = false;
      setEngaged(false);
      try { bridge && bridge.disengageNode && bridge.disengageNode(); } catch {}
      try { bridge && bridge.stopWorker && bridge.stopWorker(); } catch {}
      try { api.post("/worker/stop", { device_id: device.id }); } catch {}
      return;
    }
    // Engage
    setEngaged(true);
    runningRef.current = true;
    setEstimatedDrip(0);
    try {
      const token = localStorage.getItem("grid_token") || "";
      if (bridge && bridge.engageNode) bridge.engageNode();
      else if (bridge && bridge.startWorker) bridge.startWorker(device.id, token);
    } catch {}
    try { api.post("/worker/start", { device_id: device.id }); } catch {}
    if (!isNative) runWebLoop();
  };

  const toggleAllowBattery = (v) => {
    setAllowBattery(v);
    const bridge = nativeBridge();
    try { bridge && bridge.setAllowOnBattery && bridge.setAllowOnBattery(!!v); } catch {}
  };

  const usdBalance = wallet?.tgc_balance_usdt_value ?? 0;
  const pendingVerification = (sessionEarned * 0.05); // session reward in USD (truthful: 1 TGC = $0.05)
  const drip = (estimatedDrip).toFixed(4);
  const statusLabel = nodeLabel(nodeStatus, engaged);
  const statusAccent = statusLabel.tone;

  return (
    <div className="min-h-screen cyber-bg pb-20" data-testid="mobile-screen">
      {/* Top bar */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hexagon className="w-6 h-6 cyan-text" />
          <div className="font-mono-cyber font-black text-base">
            THE <span className="cyan-text">GRID</span>
          </div>
          {isNative && (
            <span data-testid="native-apk-badge"
              className="ml-2 px-2 py-0.5 rounded-full text-[9px] tracking-widest uppercase border border-[#00ffe1]/40 cyan-text bg-[#00ffe1]/10">
              Native Node · v1.4.8
            </span>
          )}
        </div>
        <button onClick={async () => { await logout(); nav("/"); }} data-testid="mobile-logout"
          className="p-2 rounded-full border border-white/10 text-white/60">
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-5">
        {/* Greeting */}
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-[0.3em] cyan-text">/ compute_node</div>
          <h1 className="font-mono-cyber text-2xl font-black tracking-tighter mt-1" data-testid="mobile-greeting">
            Hi, {user?.name?.split(" ")[0] || "Contributor"}
          </h1>
          <div className="text-[11px] text-white/45 mt-1">
            Your phone is part of a verified cloud compute network.
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-5 grid grid-cols-3 gap-1.5 rounded-2xl p-1 bg-black/40 border border-white/10" data-testid="mobile-tabs">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              data-testid={`tab-${t.id}`}
              className={`py-2 rounded-xl text-[11px] uppercase tracking-[0.2em] font-semibold transition ${
                tab === t.id ? "bg-[#00ffe1]/12 cyan-text border border-[#00ffe1]/30" : "text-white/45"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* COMPUTE NODE TAB */}
        {tab === "node" && (
          <>
            {/* ENGAGE NODE — single massive button */}
            <div className="mt-6 grid place-items-center">
              <button onClick={handleEngage}
                disabled={!device}
                data-testid="engage-node-btn"
                className={`relative w-60 h-60 rounded-full grid place-items-center transition-all ${
                  engaged
                    ? "bg-gradient-to-br from-[#00ff88] to-[#00d4ff] text-black shadow-[0_0_80px_rgba(0,255,136,0.5)]"
                    : device
                      ? "bg-gradient-to-br from-[#00ffe1] to-[#00d4ff] text-black shadow-[0_0_60px_rgba(0,255,225,0.4)]"
                      : "bg-white/5 text-white/30 border border-white/10"
                }`}>
                <div className="flex flex-col items-center">
                  <Power className="w-14 h-14" strokeWidth={1.6} />
                  <span className="mt-2 font-mono-cyber font-black text-sm tracking-[0.3em]"
                        data-testid="engage-node-label">
                    {engaged ? "ENGAGED" : "ENGAGE NODE"}
                  </span>
                </div>
                {engaged && (
                  <div className="absolute inset-0 rounded-full border-2 border-[#00ff88]/40 animate-ping" />
                )}
              </button>
              <div className={`mt-4 text-[11px] tracking-[0.3em] uppercase font-semibold ${statusAccent}`}
                   data-testid="node-status-label">
                {statusLabel.text}
              </div>
              {err && <div className="mt-2 text-xs text-red-400" data-testid="mobile-err">{err}</div>}
            </div>

            {/* Live Estimated Rewards drip — cosmetic */}
            <div className="mt-7 rounded-3xl border border-[#00ff88]/25 bg-black/55 p-5 relative overflow-hidden"
                 data-testid="live-reward-drip-card">
              <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-[#00ff88]/15 blur-3xl" />
              <div className="relative">
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/45 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 matrix-text" /> Live Estimated Rewards
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="text-4xl font-mono-cyber font-black matrix-text font-mono-num"
                       data-testid="live-reward-drip-value">
                    +${drip}
                  </div>
                  <div className="text-white/50 text-xs">USD (estimated)</div>
                </div>
                <div className="text-[10px] text-white/40 mt-0.5">
                  Visual projection while your node is engaged · settles into Pending after verification
                </div>
              </div>
            </div>

            {/* Pending + Available — truthful */}
            <div className="mt-3 grid grid-cols-2 gap-3" data-testid="truthful-balances-grid">
              <Box label="Pending Verification" value={`$${pendingVerification.toFixed(4)}`}
                   sub="awaiting network confirmation" testId="pending-verification" />
              <Box label="Available Balance" value={`$${usdBalance.toFixed(4)}`}
                   sub={wallet?.can_withdraw ? "withdraw enabled" : `payout at $${(wallet?.withdraw_threshold_usdt ?? 10).toFixed(2)}`}
                   testId="available-balance" />
            </div>

            {/* Smart Battery / Eco Mode */}
            <div className="mt-5 rounded-2xl bg-black/40 border border-[#00ffe1]/15 p-4"
                 data-testid="smart-battery-card">
              <div className="text-[10px] uppercase tracking-[0.3em] cyan-text flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" /> Smart Power Rules
              </div>
              <Toggle
                label="Allow Compute on Battery"
                description={allowBattery
                  ? "Eco Mode active when unplugged · pauses below 25%"
                  : "Pauses the moment the charger is unplugged"}
                icon={BatteryCharging}
                value={allowBattery}
                onChange={toggleAllowBattery}
                testId="toggle-allow-on-battery"
              />
              <div className="mt-3 text-[10px] text-white/40 leading-relaxed">
                <span className="cyan-text">{">"}</span> Plugged in → Full power · Unplugged + toggle on → Eco Mode (50% threads) · Battery {"<"} 25% → Auto pause
              </div>
            </div>
          </>
        )}

        {/* REWARDS TAB */}
        {tab === "rewards" && (
          <div className="mt-6 space-y-4">
            <Box big label="Available Balance" value={`$${usdBalance.toFixed(4)}`}
                 sub={`Lifetime $${((wallet?.tgc_total_earned ?? 0) * 0.05).toFixed(2)} · ${wallet?.tgc_balance ?? 0} reward units`}
                 testId="rewards-balance" />
            <div className="grid grid-cols-2 gap-3">
              <Box label="Pending Verification" value={`$${pendingVerification.toFixed(4)}`} testId="rewards-pending" />
              <Box label="Estimated Drip" value={`+$${drip}`} testId="rewards-drip" />
            </div>
            <div className="rounded-2xl bg-black/40 border border-white/10 p-4">
              <div className="text-[10px] uppercase tracking-[0.3em] cyan-text">Monthly Forecast (Node Tier)</div>
              <div className="mt-1.5 font-mono-cyber font-black text-2xl cyan-text">
                ~${Number(tierMonthly || 0).toFixed(2)}
              </div>
              <div className="text-[10px] text-white/40 mt-1">
                Projected when your node stays engaged on average usage · subject to network demand.
              </div>
            </div>
            <div className="rounded-2xl bg-black/40 border border-white/10 p-4 flex items-center justify-between"
                 data-testid="payout-threshold-card">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">Payout threshold</div>
                <div className="text-lg font-mono-cyber font-black cyan-text mt-0.5">
                  ${(wallet?.withdraw_threshold_usdt ?? 10).toFixed(2)}
                </div>
              </div>
              <div className="w-28 h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#00ffe1] to-[#00ff88]"
                     style={{ width: `${Math.min(100, (usdBalance / (wallet?.withdraw_threshold_usdt || 10)) * 100)}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* ADVANCED / DEBUG TAB */}
        {tab === "advanced" && (
          <div className="mt-6 space-y-3" data-testid="advanced-tab-content">
            <div className="rounded-2xl bg-black/55 border border-[#00ffe1]/15 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-3.5 h-3.5 cyan-text" />
                <div className="text-[10px] uppercase tracking-[0.3em] cyan-text">native_engine_telemetry</div>
              </div>
              {!isNative ? (
                <div className="text-[11px] text-amber-100/75 flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 mt-0.5" />
                  Native bridge unavailable — install the v1.4.8 APK to view raw engine telemetry.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs font-mono-term">
                  <KV k="engine_available" v={String(nodeStatus?.engine_available ?? false)} testId="kv-engine-available" />
                  <KV k="engine_running" v={String(nodeStatus?.engine_running ?? false)} testId="kv-engine-running" />
                  <KV k="raw_status" v={nodeStatus?.raw_status ?? "—"} testId="kv-raw-status" />
                  <KV k="processing_rate" v={`${(nodeStatus?.processing_rate_hps ?? 0).toFixed(1)} H/s`} testId="kv-processing-rate" />
                  <KV k="verified_outputs" v={String(nodeStatus?.verified_outputs ?? 0)} testId="kv-verified-outputs" />
                  <KV k="rejected_outputs" v={String(nodeStatus?.rejected_outputs ?? 0)} testId="kv-rejected-outputs" />
                  <KV k="allow_on_battery" v={String(nodeStatus?.allow_on_battery ?? true)} testId="kv-allow-battery" />
                  <KV k="version" v={nodeStatus?.version ?? "1.4.8"} testId="kv-version" />
                </div>
              )}
            </div>
            {device && (
              <div className="rounded-2xl bg-black/40 border border-white/10 p-4" data-testid="advanced-device-card">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 cyan-text" />
                  <div>
                    <div className="text-sm text-white">{device.name}</div>
                    <div className="text-[10px] text-white/40 uppercase tracking-widest">
                      {device.model} · {device.brand || "Mobile"}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="rounded-2xl bg-black/40 border border-white/10 p-4 text-[10px] text-white/45 leading-relaxed">
              <span className="cyan-text">{">"}</span> Raw RandomX / native PoW / share counters are intentionally hidden from the
              primary surfaces. This page is for engineers verifying the engine.
            </div>
          </div>
        )}

        {/* Footer link */}
        <div className="mt-7 text-center">
          <Link to="/dashboard" data-testid="mobile-to-desktop"
                className="text-[10px] tracking-[0.3em] uppercase text-white/40 hover:cyan-text">
            Open Full Dashboard →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Box({ label, value, sub, big, testId }) {
  return (
    <div className={`rounded-2xl bg-black/40 border border-white/10 p-4 ${big ? "" : ""}`} data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">{label}</div>
      <div className={`mt-1 font-mono-cyber font-black ${big ? "text-3xl matrix-text" : "text-xl cyan-text"} font-mono-num`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

function Toggle({ label, description, icon: Icon, value, onChange, testId }) {
  return (
    <button onClick={() => onChange(!value)} data-testid={testId}
      className={`mt-3 flex items-center justify-between w-full p-3 rounded-xl border transition-colors ${
        value ? "border-[#00ff88]/40 bg-[#00ff88]/8" : "border-white/10 bg-black/30"
      }`}>
      <div className="flex items-center gap-2 text-left">
        <Icon className={`w-4 h-4 ${value ? "matrix-text" : "text-white/40"}`} />
        <div>
          <div className={`text-xs ${value ? "text-white" : "text-white/65"}`}>{label}</div>
          {description && <div className="text-[10px] text-white/40 mt-0.5">{description}</div>}
        </div>
      </div>
      <div className={`w-9 h-5 rounded-full p-0.5 transition-colors ${value ? "bg-[#00ff88]" : "bg-white/10"}`}>
        <div className={`w-4 h-4 rounded-full bg-black transition-transform ${value ? "translate-x-4" : ""}`} />
      </div>
    </button>
  );
}

function KV({ k, v, testId }) {
  return (
    <div className="flex justify-between px-2 py-1.5 rounded bg-black/35 border border-white/5" data-testid={testId}>
      <span className="text-white/45">{k}</span>
      <span className="cyan-text">{v}</span>
    </div>
  );
}

function nodeLabel(ns, engaged) {
  // Map native bridge raw_status → primary-surface vocab.
  // Truthful (mirrors GridWorkerService.NodeState).
  if (!engaged) return { text: "Idle · Tap to engage", tone: "text-white/45" };
  if (!ns) return { text: "ENGAGED · Connecting", tone: "matrix-text" };
  const s = (ns.raw_status || "").toLowerCase();
  if (!ns.engine_available) return { text: "ENGAGED · Connected only", tone: "cyan-text" };
  if (s === "running" || ns.engine_running) return { text: "ACTIVE · Compute Engine running", tone: "matrix-text" };
  if (s === "warming") return { text: "ENGAGED · Warming up", tone: "cyan-text" };
  if (s === "throttled") return { text: "PAUSED · Thermal", tone: "text-amber-300" };
  return { text: "ENGAGED · Standby", tone: "cyan-text" };
}
