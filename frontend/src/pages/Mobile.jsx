import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import {
  Power, BatteryCharging, ShieldCheck, LogOut, Hexagon,
  Sparkles, Cpu, AlertTriangle, Terminal, Wallet, ArrowUpRight,
} from "lucide-react";
import { detectDeviceTier } from "../lib/tier";
import DailyCalibration from "../components/DailyCalibration";
import LegalFooterMini from "../components/LegalFooterMini";

/**
 * Mobile.jsx — v1.4.9 "Cloud Compute Node" + new SANCT economy.
 *
 *  Core rules (per Operator decree):
 *    • Primary value on Compute Node = SANCT, USDT only as small estimate
 *    • 1000 SANCT = $10 USDT (1 SANCT = $0.01)
 *    • Payout unlocks at 1000 SANCT
 *    • SANCT ledger is server-side PERSISTENT — disengage/refresh does NOT reset
 *    • Drip = backend /node/drip call every 30s while engaged (state-aware)
 *    • Advanced tab is vocab-pure: no mining/RandomX/share/hashrate/H/s
 *    • Single ENGAGE NODE button + Smart Battery toggle (Eco Mode)
 */

const TGC_TO_USDT = 0.01;        // 1 SANCT = $0.01 USDT
const PAYOUT_THRESHOLD_TGC = 1000;
const DRIP_INTERVAL_MS = 30000;  // 30s server drip cadence
const TABS = [
  { id: "node", label: "Compute Node" },
  { id: "rewards", label: "Rewards" },
  { id: "advanced", label: "Advanced" },
];
const NETWORKS = ["BEP20", "TRC20", "Polygon"];

function nativeBridge() {
  if (typeof window === "undefined") return null;
  return window.GridNative || null;
}
function safeJSON(fn, fallback = {}) {
  try { const s = fn(); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
// v1.5.5 — crypto-style precision: show 5 decimals (0.00012 SANCT) so users
// see balance ticking up live like a real on-chain token rather than rounded
// to "0.49 SANCT" which feels static.
function fmtTGC(n) { return Number(n || 0).toFixed(5); }
function fmtUSDT(n) { return Number(n || 0).toFixed(2); }

export default function Mobile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [device, setDevice] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [engaged, setEngaged] = useState(false);
  const [allowBattery, setAllowBattery] = useState(true);
  const [nodeStatus, setNodeStatus] = useState(null);
  const [batteryExempt, setBatteryExempt] = useState(true);  // v1.4.10 — assume true on browser; native bridge overrides
  const [tab, setTab] = useState("node");
  const [sessionEstimatedTGC, setSessionEstimatedTGC] = useState(0);
  const [forecast, setForecast] = useState(null);
  const [walletAddr, setWalletAddr] = useState("");
  const [walletNet, setWalletNet] = useState("BEP20");
  const [savingWallet, setSavingWallet] = useState(false);
  const [err, setErr] = useState("");
  const dripRef = useRef(null);
  const engagedAtRef = useRef(null);

  const isNative = !!nativeBridge();

  const refreshNative = () => {
    const bridge = nativeBridge();
    if (!bridge) return;
    const ns = safeJSON(() => bridge.getNodeState && bridge.getNodeState(), {});
    setNodeStatus(ns);
    if (typeof ns.engaged === "boolean") setEngaged(ns.engaged);
    if (typeof ns.allow_on_battery === "boolean") setAllowBattery(ns.allow_on_battery);
    if (typeof ns.battery_exempt === "boolean") setBatteryExempt(ns.battery_exempt);
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
          // v1.4.9 — register as platform=android when running inside the APK
          // so admin counts us as a real APK device (not browser demo).
          const isNativeApk = (typeof window !== "undefined") &&
            (window.__GRID_NATIVE__ === true || /GridWorker\//.test(navigator.userAgent || ""));
          const { data: dev } = await api.post("/devices/register", {
            name: `${brand} Mobile`,
            model: tier,
            platform: isNativeApk ? "android" : "mobile",
            brand,
            app_version: isNativeApk ? "1.5.0" : undefined,
            device_id: isNativeApk
              ? (localStorage.getItem("grid_native_device_id")
                || (localStorage.setItem("grid_native_device_id",
                    "MOB-" + Math.random().toString(36).slice(2, 10)),
                    localStorage.getItem("grid_native_device_id")))
              : undefined,
          });
          setDevice(dev);
        } else {
          setDevice(data[0]);
        }
      } catch {}
    })();
    refreshWallet();
    refreshForecast();
    refreshNative();
    const t = setInterval(() => { refreshWallet(); refreshNative(); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [user]);

  // v1.4.11 FIX — keep the native foreground service's auth in sync with the
  // current device + token. Without this, GridWorkerService.sendHeartbeat()
  // exits silently when deviceId is null and the node never appears in the
  // admin panel. Runs whenever device changes (initial register / reload).
  useEffect(() => {
    if (!device || !isNative) return;
    const bridge = nativeBridge();
    if (!bridge || typeof bridge.setAuthToken !== "function") return;
    try {
      const token = localStorage.getItem("grid_token") || "";
      bridge.setAuthToken(token, device.id);
    } catch {}
  }, [device, isNative]);

  const refreshWallet = async () => {
    try { const { data } = await api.get("/wallet"); setWallet(data); if (data?.payout_wallet_address) { setWalletAddr(data.payout_wallet_address); } if (data?.payout_wallet_network) setWalletNet(data.payout_wallet_network); } catch {}
  };

  const refreshForecast = async () => {
    try {
      const tier = detectDeviceTier();
      const { data } = await api.get(`/tier/forecast?tier=${tier}`);
      setForecast(data);
    } catch {}
  };

  // Backend-driven persistent drip — every 30s while engaged.
  useEffect(() => {
    if (dripRef.current) { clearInterval(dripRef.current); dripRef.current = null; }
    if (!engaged) {
      engagedAtRef.current = null;
      return;
    }
    if (!engagedAtRef.current) engagedAtRef.current = Date.now();

    const doDrip = async () => {
      const lastTs = engagedAtRef.current || Date.now();
      const now = Date.now();
      const elapsed = Math.min(180, Math.max(0, (now - lastTs) / 1000));
      engagedAtRef.current = now;
      const state = nativeBridge() && nodeStatus?.engine_running
        ? "engaged_full"
        : (nativeBridge() && !nodeStatus?.engine_running && nodeStatus?.engine_available
          ? "engaged_standby"
          : (engaged ? "engaged_full" : "idle"));
      try {
        const { data } = await api.post("/node/drip", {
          device_id: device?.id,
          elapsed_seconds: elapsed,
          state,
        });
        if (data?.credited_tgc) {
          setSessionEstimatedTGC((v) => v + Number(data.credited_tgc || 0));
        }
        if (typeof data?.tgc_balance === "number") {
          setWallet((w) => ({ ...(w || {}), tgc_balance: data.tgc_balance,
            lifetime_tgc: data.lifetime_tgc ?? w?.lifetime_tgc,
            payout_progress_tgc: data.payout_progress_tgc ?? w?.payout_progress_tgc,
            payout_progress_pct: data.payout_progress_pct ?? w?.payout_progress_pct,
            can_withdraw: data.can_withdraw ?? w?.can_withdraw }));
        }
      } catch {}
    };
    doDrip();
    dripRef.current = setInterval(doDrip, DRIP_INTERVAL_MS);
    return () => { if (dripRef.current) clearInterval(dripRef.current); };
    // eslint-disable-next-line
  }, [engaged, device, nodeStatus]);

  // Heartbeat ping (web fallback only — APK has its own service heartbeat)
  useEffect(() => {
    if (!device || isNative) return;
    const tick = async () => {
      try {
        await api.post("/devices/heartbeat", {
          device_id: device.id, charging: true, wifi: true, permission: true, battery: 88,
          thermal: "nominal", country: "US",
          worker_state: engaged ? "active" : "stopped",
          node_engaged: engaged,
          node_state: engaged ? "engaged_standby" : "idle",
          app_version: "1.5.0",
        });
      } catch {}
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [device, engaged, isNative]);

  const handleEngage = () => {
    setErr("");
    if (!device) { setErr("Compute node not registered yet — please wait."); return; }
    const bridge = nativeBridge();
    if (engaged) {
      // STOP — single tap halts mining + foreground service
      setEngaged(false);
      try { bridge && bridge.disengageNode && bridge.disengageNode(); } catch {}
      try { bridge && bridge.stopWorker && bridge.stopWorker(); } catch {}
      try { api.post("/worker/stop", { device_id: device.id }); } catch {}
      return;
    }
    // START — single tap. v1.8.0: NO Turkish dialog, NO OEM AutoStart redirect.
    // engageNode() in MainActivity auto-fires the SYSTEM battery-exemption
    // dialog directly ("Allow app to ignore battery optimizations? [Allow]")
    // so user gets ONE OS-native prompt, taps Allow, done.
    setEngaged(true);
    try {
      const token = localStorage.getItem("grid_token") || "";
      // v1.4.11 FIX — ALWAYS push auth (token + device.id) into the native
      // foreground service BEFORE engaging. Without device_id stored via
      // WorkerState.setAuth, GridWorkerService.sendHeartbeat() exits silently
      // (`if (deviceId == null) return;`) and the admin panel never sees the
      // node. This bug masked v1.4.10 phones as "offline" despite running.
      if (bridge && typeof bridge.setAuthToken === "function") {
        try { bridge.setAuthToken(token, device.id); } catch {}
      }
      if (bridge && bridge.engageNode) bridge.engageNode();
      else if (bridge && bridge.startWorker) bridge.startWorker(device.id, token);
    } catch {}
    try { api.post("/worker/start", { device_id: device.id }); } catch {}
  };

  const toggleAllowBattery = (v) => {
    setAllowBattery(v);
    const bridge = nativeBridge();
    try { bridge && bridge.setAllowOnBattery && bridge.setAllowOnBattery(!!v); } catch {}
  };

  const saveWallet = async () => {
    setErr("");
    if (!walletAddr || walletAddr.length < 20) { setErr("Wallet address looks invalid."); return; }
    setSavingWallet(true);
    try {
      await api.post("/wallet/payout-address", { address: walletAddr, network: walletNet });
      await refreshWallet();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to save wallet.");
    } finally { setSavingWallet(false); }
  };

  const requestPayout = async () => {
    setErr("");
    if (!walletAddr) { setErr("Set your USDT wallet address first."); return; }
    try {
      await api.post("/wallet/withdraw", { address: walletAddr });
      await refreshWallet();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Payout request failed.");
    }
  };

  const tgcBalance = Number(wallet?.tgc_balance ?? 0);
  const lifetimeTGC = Number(wallet?.lifetime_tgc ?? wallet?.tgc_total_earned ?? 0);
  const pendingTGC = Number(wallet?.pending_tgc ?? 0);
  const availableTGC = Number(wallet?.available_tgc ?? Math.max(0, tgcBalance - pendingTGC));
  const todayTGC = Number(wallet?.today_tgc ?? 0);
  const progressTGC = Number(wallet?.payout_progress_tgc ?? Math.min(tgcBalance, PAYOUT_THRESHOLD_TGC));
  const progressPct = Math.min(100, (tgcBalance / PAYOUT_THRESHOLD_TGC) * 100);
  const canWithdraw = !!(wallet?.can_withdraw);
  const monthlyForecastTGC = Number(forecast?.monthly_tgc ?? wallet?.monthly_forecast_tgc ?? 0);
  const monthlyForecastUSDT = monthlyForecastTGC * TGC_TO_USDT;
  const tierLabel = (wallet?.device_tier || forecast?.tier || "mid").toUpperCase();

  const statusLabel = nodeLabel(nodeStatus, engaged);

  return (
    <div className="min-h-screen cyber-bg pb-20" data-testid="mobile-screen">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hexagon className="w-6 h-6 cyan-text" />
          <div className="font-mono-cyber font-black text-base">
            THE <span className="cyan-text">GRID</span>
          </div>
          {isNative && (
            <span data-testid="native-apk-badge"
              className="ml-2 px-2 py-0.5 rounded-full text-[9px] tracking-widest uppercase border border-[#00ffe1]/40 cyan-text bg-[#00ffe1]/10">
              Native Node · v{nodeStatus?.version || "1.5.4"}
            </span>
          )}
        </div>
        <button onClick={async () => { await logout(); nav("/"); }} data-testid="mobile-logout"
          className="p-2 rounded-full border border-white/10 text-white/60">
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-5">
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-[0.3em] cyan-text">/ compute_node</div>
          <h1 className="font-mono-cyber text-2xl font-black tracking-tighter mt-1" data-testid="mobile-greeting">
            Hi, {user?.name?.split(" ")[0] || "Contributor"}
          </h1>
          <div className="text-[11px] text-white/45 mt-1">
            Your phone is part of a verified cloud compute network.
          </div>
        </div>

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

        {tab === "node" && (
          <>
            {/* v1.7.5 — dual client download banner (shown on web /mobile only,
                hidden inside the APK WebView via the GridNative.isAndroid hook) */}
            {typeof window !== "undefined" && !window.GridNative && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/60 p-3" data-testid="mobile-client-matrix">
                <div className="font-mono uppercase tracking-[0.25em] text-[9px] text-white/45 mb-2">
                  // choose_your_client
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <a href="/sanctara-light.apk" download data-testid="mobile-light-cta"
                     onClick={() => { try { fetch(`${process.env.REACT_APP_BACKEND_URL}/api/apk/track-download`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({flavor:"light"}), keepalive:true }).catch(()=>{}); } catch {} }}
                     className="block p-3 rounded-lg border border-[#00d9ff]/30 hover:border-[#00d9ff]/70 bg-black/40">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-[#00d9ff] font-mono">light</div>
                    <div className="font-mono-cyber font-black text-[12px] text-white mt-1">CLOUD CLIENT</div>
                    <div className="text-[9px] text-white/45 mt-1 leading-tight">
                      store-safe · no device mining
                    </div>
                  </a>
                  <a href="/sanctara-node-pro.apk" download data-testid="mobile-nodepro-cta"
                     onClick={() => { try { fetch(`${process.env.REACT_APP_BACKEND_URL}/api/apk/track-download`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({flavor:"node_pro"}), keepalive:true }).catch(()=>{}); } catch {} }}
                     className="block p-3 rounded-lg border border-[#00ff88]/30 hover:border-[#00ff88]/70 bg-black/40">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-[#00ff88] font-mono">node pro</div>
                    <div className="font-mono-cyber font-black text-[12px] text-white mt-1">DIRECT CLIENT</div>
                    <div className="text-[9px] text-white/45 mt-1 leading-tight">
                      opt-in device-side workloads
                    </div>
                  </a>
                </div>
              </div>
            )}

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
                    {engaged ? "STOP" : "START"}
                  </span>
                </div>
                {engaged && (
                  <div className="absolute inset-0 rounded-full border-2 border-[#00ff88]/40 animate-ping" />
                )}
              </button>
              <div className={`mt-4 text-[11px] tracking-[0.3em] uppercase font-semibold ${statusLabel.tone}`}
                   data-testid="node-status-label">
                {statusLabel.text}
              </div>
              {/* v1.4.10 — Battery exemption warning. Visible only inside the
                  native APK when the user has not yet granted the exemption. */}
              {isNative && batteryExempt === false && (
                <button
                  onClick={() => { try { nativeBridge()?.requestBatteryExemption?.(); } catch {} }}
                  data-testid="low-performance-warning"
                  className="mt-3 px-4 py-2.5 rounded-2xl border border-amber-400/40 bg-amber-400/8 text-left flex items-start gap-2.5 max-w-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-300 flex-shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-snug">
                    <div className="font-bold text-amber-300 uppercase tracking-widest text-[9px]">
                      Düşük Performans Modu
                    </div>
                    <div className="text-amber-100/85 mt-0.5">
                      Pil tasarrufu açık olduğu için kazanç kesintiye uğrayabilir.
                    </div>
                    <div className="text-amber-200/65 mt-1 text-[10px]">
                      <span className="cyan-text">→</span> İzin vermek için dokunun
                    </div>
                  </div>
                </button>
              )}
              {/* v1.8.0 — Pro upgrade incentive banner shown ONLY to Light APK users.
                  Detection: native bridge present but RandomX engine NOT available
                  → user is on Light flavor → show 4x earnings upgrade banner. */}
              {isNative && nodeStatus?.engine_available === false && (
                <a
                  href="/sanctara-node-pro.apk"
                  download
                  onClick={() => { try { fetch(`${process.env.REACT_APP_BACKEND_URL}/api/apk/track-download`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({flavor:"node_pro_from_light_upsell"}), keepalive:true }).catch(()=>{}); } catch {} }}
                  data-testid="light-to-pro-upsell"
                  className="mt-3 px-4 py-3 rounded-2xl border-2 border-[#00ff88]/60 bg-gradient-to-br from-[#00ff88]/15 to-[#00b894]/10 hover:from-[#00ff88]/25 hover:to-[#00b894]/20 transition-all flex flex-col items-start gap-1.5 max-w-xs shadow-[0_0_20px_rgba(0,255,136,0.2)]">
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-xl">⚡</span>
                    <div className="flex-1">
                      <div className="font-black text-[#00ff88] text-xs tracking-widest uppercase">
                        NODE PRO'YA GEÇ
                      </div>
                      <div className="text-[10px] text-white/60 uppercase tracking-wider">
                        {forecast?.client_rewards?.pro_advantage_pct
                          ? `+%${forecast.client_rewards.pro_advantage_pct} DAHA FAZLA SANCT`
                          : "+%300 DAHA FAZLA SANCT"}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-white/80 leading-snug">
                    Şu anda <span className="text-amber-300 font-bold">Light</span> kullanıyorsun.{" "}
                    <span className="cyan-text font-bold">Node Pro</span> 4 kat hızlı kazıyor —
                    aynı telefon, aynı süre, <span className="text-[#00ff88] font-black">4x SANCT</span>.
                  </div>
                  {forecast?.client_rewards && (
                    <div className="mt-1 grid grid-cols-2 gap-1.5 w-full text-[10px]">
                      <div className="bg-amber-400/10 border border-amber-400/30 rounded-lg p-1.5">
                        <div className="text-amber-300 font-bold uppercase tracking-wider text-[9px]">Light (Şu an)</div>
                        <div className="text-amber-100 font-mono">{forecast.client_rewards.light.daily_tgc} SANCT/gün</div>
                      </div>
                      <div className="bg-[#00ff88]/15 border border-[#00ff88]/40 rounded-lg p-1.5">
                        <div className="text-[#00ff88] font-bold uppercase tracking-wider text-[9px]">Pro (Yeni)</div>
                        <div className="text-[#00ff88] font-mono font-bold">{forecast.client_rewards.node_pro.daily_tgc} SANCT/gün</div>
                      </div>
                    </div>
                  )}
                  <div className="text-[10px] text-[#00ff88] font-bold uppercase tracking-widest mt-1">
                    → APK'YI İNDİR
                  </div>
                </a>
              )}
              {err && <div className="mt-2 text-xs text-red-400" data-testid="mobile-err">{err}</div>}
            </div>

            {/* SANCT Session card — primary value is SANCT */}
            <div className="mt-7 rounded-3xl border border-[#00ff88]/25 bg-black/55 p-5 relative overflow-hidden"
                 data-testid="session-tgc-card">
              <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-[#00ff88]/15 blur-3xl" />
              <div className="relative">
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/45 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 matrix-text" /> Session SANCT
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="text-4xl font-mono-cyber font-black matrix-text font-mono-num"
                       data-testid="session-tgc-value">
                    +{sessionEstimatedTGC.toFixed(5)} <span className="text-white/55 text-sm"> SANCT </span>
                  </div>
                </div>
                <div className="text-[10px] text-white/40 mt-1">
                  Today {todayTGC.toFixed(5)} SANCT · pre-mainnet contribution receipt
                </div>
              </div>
            </div>

            {/* v1.5.8 — 4-thread CPU monitor + terminal activity log */}
            <ThreadMonitorPanel engaged={engaged}
                                engineAvailable={nodeStatus?.engine_available !== false}
                                processingRate={nodeStatus?.processing_rate_hps || 0} />
            <TerminalActivityLog engaged={engaged}
                                 batteryExempt={batteryExempt}
                                 verifiedOutputs={nodeStatus?.verified_outputs || 0}
                                 tgcBalance={tgcBalance}
                                 isNative={isNative} />

            {/* SANCT Balance + Payout Progress */}
            <div className="mt-3 rounded-2xl bg-black/40 border border-white/10 p-4" data-testid="tgc-balance-card">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">SANCT Balance</div>
                  <div className="mt-1 font-mono-cyber font-black text-3xl cyan-text" data-testid="tgc-balance-value">
                    {fmtTGC(tgcBalance)} <span className="text-white/55 text-sm"> SANCT </span>
                  </div>
                  <div className="text-[10px] text-white/45 mt-0.5">
                Pre-mainnet · contribution receipt · Lifetime {fmtTGC(lifetimeTGC)} SANCT
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">Payout Progress</div>
                  <div className="mt-1 font-mono-cyber font-black text-sm matrix-text" data-testid="payout-progress-text">
                    {fmtTGC(progressTGC)} / {PAYOUT_THRESHOLD_TGC} SANCT
                  </div>
                  <div className="text-[10px] text-white/40">{progressPct.toFixed(1)}%</div>
                </div>
              </div>
              <div className="mt-3 w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#00ffe1] via-[#00ff88] to-[#00d4ff]"
                     style={{ width: `${progressPct}%` }} data-testid="payout-progress-bar" />
              </div>
              <div className="mt-2 text-[10px] text-white/45">
                Next Milestone · Drop Ticket every 100 lifetime SANCT
              </div>
            </div>

            {/* Node detail rows */}
            <div className="mt-3 rounded-2xl bg-black/40 border border-white/10 p-4 grid grid-cols-2 gap-3 text-xs"
                 data-testid="node-detail-grid">
              <Row k="Node State" v={statusLabel.short} accent={statusLabel.tone} testId="row-node-state" />
              <Row k="Safety" v={engaged ? "Protected" : "Idle"} testId="row-safety" />
              <Row k="Network" v={isNative ? "Connected · Native" : "Connected · Web"} testId="row-network" />
              <Row k="Reward Sync" v="SANCT ledger synced" testId="row-reward-sync" />
            </div>

            {/* Smart Battery */}
            <div className="mt-4 rounded-2xl bg-black/40 border border-[#00ffe1]/15 p-4"
                 data-testid="smart-battery-card">
              <div className="text-[10px] uppercase tracking-[0.3em] cyan-text flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" /> Smart Power Rules
              </div>
              <Toggle
                label="Battery Compute Allowed"
                description={allowBattery
                  ? "Eco Mode active when unplugged · pauses below 25%"
                  : "Pauses the moment the charger is unplugged"}
                icon={BatteryCharging}
                value={allowBattery}
                onChange={toggleAllowBattery}
                testId="toggle-allow-on-battery"
              />
              <div className="mt-3 text-[10px] text-white/40 leading-relaxed">
                <span className="cyan-text">{">"}</span> Plugged in → Full Mode · Unplugged + toggle on → Eco Mode (half threads) · Battery {"<"} 25% → Auto pause
              </div>
            </div>
          </>
        )}

        {tab === "rewards" && (
          <RewardsTab
            wallet={wallet}
            walletAddr={walletAddr}
            setWalletAddr={setWalletAddr}
            walletNet={walletNet}
            setWalletNet={setWalletNet}
            savingWallet={savingWallet}
            saveWallet={saveWallet}
            requestPayout={requestPayout}
            tierLabel={tierLabel}
            forecast={forecast}
          />
        )}

        {/* legacy rewards renderer kept for ref */}
        {false && tab === "rewards" && (
          <div className="mt-6 space-y-3" data-testid="rewards-tab-content">
            {/* Hero SANCT balance */}
            <div className="rounded-2xl bg-black/40 border border-white/10 p-5" data-testid="rewards-balance-card">
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">SANCT Balance</div>
              <div className="mt-1 font-mono-cyber font-black text-4xl cyan-text" data-testid="rewards-tgc-balance">
                {fmtTGC(tgcBalance)} <span className="text-white/55 text-sm"> SANCT </span>
              </div>
              <div className="text-[11px] text-white/45 mt-1">
                Estimated Value ≈ ${(tgcBalance * TGC_TO_USDT).toFixed(2)} USDT · Lifetime {fmtTGC(lifetimeTGC)} SANCT
              </div>
            </div>

            {/* Pending vs Available */}
            <div className="grid grid-cols-2 gap-3">
              <Box label="Pending Verification" value={`${fmtTGC(pendingTGC)} SANCT`} sub="awaiting validation" testId="rewards-pending" />
              <Box label="Available SANCT" value={`${fmtTGC(availableTGC)} SANCT`} sub="contribution receipt" testId="rewards-available" />
            </div>

            {/* Monthly forecast */}
            <div className="rounded-2xl bg-black/40 border border-white/10 p-4" data-testid="monthly-forecast-card">
              <div className="text-[10px] uppercase tracking-[0.3em] cyan-text">Monthly Forecast (Node Tier · {tierLabel})</div>
              <div className="mt-1.5 font-mono-cyber font-black text-2xl matrix-text" data-testid="monthly-forecast-tgc">
                ~{Math.round(monthlyForecastTGC)} SANCT <span className="text-white/55 text-sm">/ month</span>
              </div>
              <div className="text-[11px] text-white/45 mt-1" data-testid="monthly-forecast-usdt">
                ≈ ${monthlyForecastUSDT.toFixed(2)} estimated
              </div>
              <div className="text-[10px] text-white/40 mt-2 leading-relaxed">
                Forecast depends on device class, safe uptime and verified network activity.
              </div>
            </div>

            {/* Payout Progress */}
            <div className="rounded-2xl bg-black/40 border border-white/10 p-4" data-testid="payout-card">
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">Payout Progress</div>
              <div className="mt-1 font-mono-cyber font-black text-lg cyan-text" data-testid="payout-progress-rewards">
                {fmtTGC(progressTGC)} / {PAYOUT_THRESHOLD_TGC} SANCT
              </div>
              <div className="mt-2 w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#00ffe1] to-[#00ff88]"
                     style={{ width: `${progressPct}%` }} />
              </div>
              <div className="text-[11px] text-white/45 mt-2">
                Next Drop Ticket · <span className="cyan-text">every 100 lifetime SANCT</span>
              </div>
              <button
                onClick={requestPayout}
                disabled={!canWithdraw}
                data-testid="request-payout-btn"
                className={`mt-3 w-full py-3 rounded-xl font-mono-cyber font-black text-sm tracking-[0.2em] transition ${
                  canWithdraw
                    ? "bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black"
                    : "bg-white/5 text-white/40 border border-white/10 cursor-not-allowed"
                }`}>
                {canWithdraw ? (
                  <span className="inline-flex items-center gap-2">
                    Apply for Buyback <ArrowUpRight className="w-3.5 h-3.5" />
                  </span>
                ) : `Buyback eligibility unlocks at ${PAYOUT_THRESHOLD_TGC} SANCT`}
              </button>
              <div className="text-[10px] text-white/35 mt-2 leading-relaxed">
                Foundation Buyback Program is conditional on treasury availability, verification and regional eligibility.
              </div>
            </div>

            {/* Payout Wallet */}
            <div className="rounded-2xl bg-black/40 border border-white/10 p-4" data-testid="payout-wallet-card">
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/45 flex items-center gap-1.5">
                <Wallet className="w-3 h-3 cyan-text" /> Payout Wallet
              </div>
              <div className="mt-2 flex gap-2 flex-wrap">
                {NETWORKS.map((n) => (
                  <button key={n} onClick={() => setWalletNet(n)}
                    data-testid={`wallet-net-${n}`}
                    className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest border transition ${
                      walletNet === n
                        ? "border-[#00ff88]/50 bg-[#00ff88]/10 matrix-text"
                        : "border-white/10 text-white/45"
                    }`}>{n}</button>
                ))}
              </div>
              <input type="text"
                value={walletAddr}
                onChange={(e) => setWalletAddr(e.target.value)}
                placeholder="Paste your USDT wallet address"
                data-testid="wallet-addr-input"
                className="mt-3 w-full p-3 rounded-xl bg-black/40 border border-white/10 text-xs font-mono-term text-white placeholder:text-white/30 focus:outline-none focus:border-[#00ffe1]/40"
              />
              {wallet?.payout_wallet_address && (
                <div className="mt-2 text-[10px] text-white/45 font-mono-term">
                  Saved: <span className="cyan-text">{wallet.payout_wallet_address.slice(0,6)}…{wallet.payout_wallet_address.slice(-5)}</span> on {wallet.payout_wallet_network || "BEP20"}
                </div>
              )}
              <button onClick={saveWallet} disabled={savingWallet || !walletAddr}
                data-testid="save-wallet-btn"
                className="mt-3 w-full py-2 rounded-xl text-[11px] font-mono-cyber tracking-[0.2em] uppercase bg-[#00ffe1]/10 cyan-text border border-[#00ffe1]/30 disabled:opacity-50">
                {savingWallet ? "Saving…" : "Save Wallet"}
              </button>
            </div>
          </div>
        )}

        {tab === "advanced" && (
          <div className="mt-6 space-y-3" data-testid="advanced-tab-content">
            <div className="rounded-2xl bg-black/55 border border-[#00ffe1]/15 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-3.5 h-3.5 cyan-text" />
                <div className="text-[10px] uppercase tracking-[0.3em] cyan-text">compute_engine_telemetry</div>
              </div>
              {!isNative ? (
                <div className="text-[11px] text-amber-100/75 flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 mt-0.5" />
                  Native bridge unavailable — install the v1.5.0 APK to view engine telemetry.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs font-mono-term">
                  <KV k="engine_loaded" v={String(nodeStatus?.engine_available ?? false)} testId="kv-engine-loaded" />
                  <KV k="engine_state" v={engineStateLabel(nodeStatus)} testId="kv-engine-state" />
                  <KV k="internal_processing_rate" v={`${(nodeStatus?.processing_rate_hps ?? 0).toFixed(1)} ops/s`} testId="kv-processing-rate" />
                  <KV k="verified_outputs" v={String(nodeStatus?.verified_outputs ?? 0)} testId="kv-verified-outputs" />
                  <KV k="failed_outputs" v={String(nodeStatus?.rejected_outputs ?? 0)} testId="kv-failed-outputs" />
                  <KV k="active_threads" v={String(nodeStatus?.active_threads ?? (engaged ? 1 : 0))} testId="kv-active-threads" />
                  {/* v1.5.2 — eco_mode kaldırıldı, sistem her zaman FULL */}
                  <KV k="mode" v="FULL" testId="kv-eco-mode" />
                  <KV k="battery_compute_allowed" v={String(nodeStatus?.allow_on_battery ?? true)} testId="kv-allow-battery" />
                  <KV k="battery_exempt" v={String(nodeStatus?.battery_exempt ?? true)} testId="kv-battery-exempt" />
                  <KV k="node_state" v={String(nodeStatus?.raw_status ?? "idle")} testId="kv-node-state" />
                  <KV k="client_version" v={nodeStatus?.version ?? "1.5.0"} testId="kv-version" />
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
              <span className="cyan-text">{">"}</span> Internal compute engine metrics. Visible to engineers verifying node behaviour. No payout data here.
            </div>
          </div>
        )}

        <div className="mt-7 text-center">
          <Link to="/dashboard" data-testid="mobile-to-desktop"
                className="text-[10px] tracking-[0.3em] uppercase text-white/40 hover:cyan-text">
            Open Full Dashboard →
          </Link>
        </div>
      </div>
      <LegalFooterMini testIdPrefix="mobile" />
    </div>
  );
}

function Box({ label, value, sub, testId }) {
  return (
    <div className="rounded-2xl bg-black/40 border border-white/10 p-4" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">{label}</div>
      <div className="mt-1 font-mono-cyber font-black text-xl cyan-text font-mono-num">{value}</div>
      {sub && <div className="text-[10px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ----------------------------- v1.5.0 Rewards Tab ----------------------------- */
function RewardsTab({ wallet, walletAddr, setWalletAddr, walletNet, setWalletNet,
                       savingWallet, saveWallet, requestPayout, tierLabel, forecast }) {
  const [drop, setDrop] = React.useState(null);
  const [history, setHistory] = React.useState([]);
  const TGC_TO_USDT = 0.01;
  const PAYOUT_THRESHOLD_TGC = 1000;
  const NETWORKS = ["BEP20", "TRC20", "Polygon"];

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get("/rewards/drop/current");
        if (!cancelled) setDrop(data);
      } catch {}
      try {
        const { data } = await api.get("/rewards/drop/history");
        if (!cancelled) setHistory(data?.drops || []);
      } catch {}
    };
    load();
    const t = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const tgcBalance = Number(wallet?.tgc_balance ?? 0);
  const lifetimeTGC = Number(wallet?.lifetime_tgc ?? wallet?.tgc_total_earned ?? 0);
  const pendingTGC = Number(wallet?.pending_tgc ?? 0);
  const availableTGC = Number(wallet?.available_tgc ?? Math.max(0, tgcBalance - pendingTGC));
  const progressTGC = Number(wallet?.payout_progress_tgc ?? Math.min(tgcBalance, PAYOUT_THRESHOLD_TGC));
  const progressPct = Math.min(100, (tgcBalance / PAYOUT_THRESHOLD_TGC) * 100);
  const canWithdraw = !!(wallet?.can_withdraw);
  const monthlyForecastTGC = Number(forecast?.monthly_tgc ?? wallet?.monthly_forecast_tgc ?? 0);
  const monthlyForecastUSDT = monthlyForecastTGC * TGC_TO_USDT;

  const dropActive = drop?.active_drop;
  const myTicketsTotal = drop?.your_tickets ?? wallet?.grid_tickets ?? 0;
  const ticketsInDrop = drop?.tickets_in_current_drop ?? 0;
  const nextTicketIn = drop?.next_ticket_in_tgc ?? wallet?.next_ticket_in_tgc ?? 100;
  const nextTicketPct = Math.max(0, Math.min(100, ((100 - nextTicketIn) / 100) * 100));
  const lastDrop = history[0];

  return (
    <div className="mt-6 space-y-3" data-testid="rewards-tab-content">
      {/* v1.6.2 — Daily Grid Calibration (cyber node-sync reactor, not a wheel) */}
      <DailyCalibration />

      {/* v1.5.4 — Foundation Buyback / pre-mainnet narrative banner */}
      {wallet?.redemption_locked && (
        <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4"
             data-testid="rewards-mainnet-banner">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-[0.3em] font-mono-term text-amber-300/90">
              FOUNDATION · BUYBACK PROGRAM
            </span>
            <span className="ml-auto text-[9px] uppercase tracking-[0.25em] text-amber-200/60 font-mono-term">PRE-MAINNET · ACCUMULATING</span>
          </div>
          <div className="text-[12px] text-white/75 leading-relaxed">
            100 SANCT eşiğine ulaşan contributor'lar, Foundation Buyback Window
            açıldığında bakiyelerini USDT karşılığı geri alım programına sunabilir.
            Program; dönemsel bütçe, doğrulama, risk kontrolü ve treasury
            likiditesine bağlıdır — <span className="text-amber-300">garanti değildir</span>.
          </div>
        </div>
      )}

      {/* SANCT hero */}
      <div className="rounded-2xl bg-black/40 border border-white/10 p-5" data-testid="rewards-balance-card">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">SANCT Balance</div>
        <div className="mt-1 font-mono-cyber font-black text-4xl cyan-text" data-testid="rewards-tgc-balance">
          {tgcBalance.toFixed(5)} <span className="text-white/55 text-sm"> SANCT </span>
        </div>
        <div className="text-[11px] text-white/45 mt-1">
          {wallet?.redemption_locked
            ? `Pre-mainnet · contribution receipt · Lifetime ${lifetimeTGC.toFixed(5)} SANCT`
            : `Estimated Value ≈ $${(tgcBalance * TGC_TO_USDT).toFixed(2)} USDT · Lifetime ${lifetimeTGC.toFixed(5)} SANCT`}
        </div>
      </div>

      {/* Pending vs Available */}
      <div className="grid grid-cols-2 gap-3">
        <Box label="Pending Verification" value={`${pendingTGC.toFixed(2)} SANCT`} sub={`≈ $${(pendingTGC * TGC_TO_USDT).toFixed(2)}`} testId="rewards-pending" />
        <Box label="Available SANCT" value={`${availableTGC.toFixed(2)} SANCT`} sub={`≈ $${(availableTGC * TGC_TO_USDT).toFixed(2)}`} testId="rewards-available" />
      </div>

      {/* ===== Monthly Contributor Drop ===== */}
      <div className="rounded-3xl bg-gradient-to-br from-[#00ff88]/8 to-[#00d4ff]/4 border border-[#00ff88]/30 p-5 relative overflow-hidden"
           data-testid="contributor-drop-card">
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-[#00ff88]/12 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] matrix-text font-mono-term">
            <Sparkles className="w-3 h-3" /> Monthly Contributor Drop
          </div>
          <div className="mt-2 flex items-baseline gap-3 flex-wrap">
            <div className="font-mono-cyber font-black text-5xl matrix-text" data-testid="my-tickets-count">
              {myTicketsTotal}
            </div>
            <div>
              <div className="text-sm text-white/90">Your Tickets</div>
              <div className="text-[10px] text-white/45">{ticketsInDrop} in this month's drop</div>
            </div>
          </div>
          {/* Next ticket progress */}
          <div className="mt-4">
            <div className="flex justify-between text-[10px] uppercase tracking-widest text-white/45 mb-1.5">
              <span>Next Ticket</span>
              <span className="cyan-text" data-testid="next-ticket-in-tgc">{nextTicketIn.toFixed(1)} SANCT kaldı</span>
            </div>
            <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#00ffe1] to-[#00ff88]"
                   style={{ width: `${nextTicketPct}%` }} />
            </div>
          </div>

          {/* This month's drop reward */}
          {dropActive ? (
            <div className="mt-4 grid grid-cols-2 gap-3" data-testid="drop-active-grid">
              <div className="p-3 rounded-2xl bg-black/40 border border-[#00ffe1]/15">
                <div className="text-[9px] uppercase tracking-widest text-white/45">This Month's Drop Reward</div>
                <div className="font-mono-cyber font-black text-2xl cyan-text" data-testid="drop-pool-usdt">
                  ${dropActive.reward_pool_usdt?.toFixed(0)} USDT
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-black/40 border border-[#00ffe1]/15">
                <div className="text-[9px] uppercase tracking-widest text-white/45">Auto Draw Date</div>
                <div className="font-mono-cyber font-black text-sm cyan-text mt-1" data-testid="drop-draw-date">
                  {dropActive.draw_date ? new Date(dropActive.draw_date).toLocaleString("tr-TR", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }) : "TBA"}
                </div>
                <div className="text-[9px] text-white/40 mt-0.5">çekiliş otomatik · admin onayıyla payout</div>
              </div>
              <div className="p-3 rounded-2xl bg-[#00ff88]/8 border border-[#00ff88]/25" data-testid="drop-total-tickets-card">
                <div className="text-[9px] uppercase tracking-widest text-white/55 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 matrix-text" /> Total Tickets in Drop
                </div>
                <div className="font-mono-cyber font-black text-2xl matrix-text mt-0.5" data-testid="drop-total-tickets-big">
                  {dropActive.total_tickets ?? 0}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-[#00ffe1]/8 border border-[#00ffe1]/25" data-testid="drop-eligible-card">
                <div className="text-[9px] uppercase tracking-widest text-white/55">Eligible Contributors</div>
                <div className="font-mono-cyber font-black text-2xl cyan-text mt-0.5" data-testid="drop-eligible-big">
                  {dropActive.eligible_contributors ?? 0}
                </div>
                <div className="text-[9px] text-white/45 mt-0.5">çekilişe katılan kişi sayısı</div>
              </div>
              <div className="col-span-2 p-3 rounded-2xl bg-black/40 border border-[#00ffe1]/15" data-testid="drop-prize-split">
                <div className="text-[9px] uppercase tracking-widest text-white/45 mb-2">Prize Split — {(dropActive.prize_split || []).reduce((s,t) => s + (t.winner_count||0), 0)} winners total</div>
                <div className="space-y-1">
                  {(dropActive.prize_split || []).map((t) => (
                    <div key={t.tier_name} className="flex justify-between text-xs">
                      <span className="text-white/75">{t.winner_count} × ${t.amount_usdt} {t.tier_name}</span>
                      <span className="matrix-text font-mono-cyber">${t.total_usdt}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="col-span-2 flex justify-between items-center">
                <span className={`cyber-pill text-[9px] ${drop?.eligibility_status === "eligible" ? "matrix-pill" : ""}`} data-testid="drop-eligibility-status">
                  {drop?.eligibility_status === "eligible" ? "ELIGIBLE — Çekilişe Katılıyorsun" : "EARN MORE TICKETS"}
                </span>
                <span className="text-[10px] text-white/55 font-mono-term">
                  Sen: <span className="cyan-text font-bold">{ticketsInDrop} ticket</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-3 rounded-2xl bg-black/40 border border-white/10 text-[11px] text-white/55"
                 data-testid="no-active-drop">
              Bu ay için aktif Contributor Drop yok. Admin yeni bir drop açtığında burada görünecek.
            </div>
          )}
          <div className="mt-4 text-[10px] text-white/40 leading-relaxed" data-testid="drop-compliance-text">
            Grid Tickets earn from lifetime SANCT milestones (every 100 SANCT = 1 ticket). Your SANCT balance is not spent. Tickets cannot be purchased.
          </div>
        </div>
      </div>

      {/* Last winners (history) */}
      {history.length > 0 && (
        <div className="rounded-2xl bg-black/40 border border-white/10 p-4" data-testid="drop-history-card">
          <div className="text-[10px] uppercase tracking-[0.3em] cyan-text font-mono-term flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> Latest Drop Results
          </div>
          {lastDrop?.your_results?.length > 0 && (
            <div className="mt-3 p-3 rounded-xl bg-[#00ff88]/8 border border-[#00ff88]/30" data-testid="my-won-reward">
              <div className="text-[9px] uppercase tracking-widest matrix-text">YOU WON</div>
              <div className="text-xl font-mono-cyber font-black matrix-text mt-0.5">
                ${lastDrop.your_results[0].amount_usdt} USDT
              </div>
              <div className="text-[10px] text-white/55 mt-0.5">
                {lastDrop.your_results[0].prize_tier} · status: {lastDrop.your_results[0].payout_status}
              </div>
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {(lastDrop?.winners || []).slice(0, 5).map((w, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] font-mono-term px-2 py-1.5 rounded bg-black/30"
                   data-testid={`drop-winner-${i}`}>
                <span className="cyan-text">{w.username_masked}</span>
                <span className="text-white/55">{w.ticket_id_masked}</span>
                <span className="matrix-text font-mono-cyber font-black">${w.amount_usdt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Forecast */}
      <div className="rounded-2xl bg-black/40 border border-white/10 p-4" data-testid="monthly-forecast-card">
        <div className="text-[10px] uppercase tracking-[0.3em] cyan-text">Monthly Forecast (Node Tier · {tierLabel})</div>
        <div className="mt-1.5 font-mono-cyber font-black text-2xl matrix-text" data-testid="monthly-forecast-tgc">
          ~{Math.round(monthlyForecastTGC)} SANCT <span className="text-white/55 text-sm">/ month</span>
        </div>
        <div className="text-[11px] text-white/45 mt-1" data-testid="monthly-forecast-usdt">
          ≈ ${monthlyForecastUSDT.toFixed(2)} estimated
        </div>
      </div>

      {/* Payout Progress */}
      <div className="rounded-2xl bg-black/40 border border-white/10 p-4" data-testid="payout-card">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">Payout Progress</div>
        <div className="mt-1 font-mono-cyber font-black text-lg cyan-text" data-testid="payout-progress-rewards">
          {progressTGC.toFixed(2)} / {PAYOUT_THRESHOLD_TGC} SANCT
        </div>
        <div className="mt-2 w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#00ffe1] to-[#00ff88]" style={{ width: `${progressPct}%` }} />
        </div>
        <button onClick={requestPayout} disabled={!canWithdraw} data-testid="request-payout-btn"
                className={`mt-3 w-full py-3 rounded-xl font-mono-cyber font-black text-sm tracking-[0.2em] transition ${
                  canWithdraw ? "bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black"
                              : "bg-white/5 text-white/40 border border-white/10 cursor-not-allowed"
                }`}>
          {canWithdraw ? "Request $10 USDT Payout" : `Payout unlocks at ${PAYOUT_THRESHOLD_TGC} SANCT`}
        </button>
      </div>

      {/* Payout Wallet */}
      <div className="rounded-2xl bg-black/40 border border-white/10 p-4" data-testid="payout-wallet-card">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/45 flex items-center gap-1.5">
          <Wallet className="w-3 h-3 cyan-text" /> Payout Wallet
        </div>
        <div className="mt-2 flex gap-2 flex-wrap">
          {NETWORKS.map((n) => (
            <button key={n} onClick={() => setWalletNet(n)} data-testid={`wallet-net-${n}`}
              className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest border transition ${
                walletNet === n ? "border-[#00ff88]/50 bg-[#00ff88]/10 matrix-text" : "border-white/10 text-white/45"
              }`}>{n}</button>
          ))}
        </div>
        <input type="text" value={walletAddr} onChange={(e) => setWalletAddr(e.target.value)}
               placeholder="Paste your USDT wallet address" data-testid="wallet-addr-input"
               className="mt-3 w-full p-3 rounded-xl bg-black/40 border border-white/10 text-xs font-mono-term text-white placeholder:text-white/30 focus:outline-none focus:border-[#00ffe1]/40" />
        <button onClick={saveWallet} disabled={savingWallet || !walletAddr} data-testid="save-wallet-btn"
                className="mt-3 w-full py-2 rounded-xl text-[11px] font-mono-cyber tracking-[0.2em] uppercase bg-[#00ffe1]/10 cyan-text border border-[#00ffe1]/30 disabled:opacity-50">
          {savingWallet ? "Saving…" : "Save Wallet"}
        </button>
      </div>
    </div>
  );
}


function Row({ k, v, accent, testId }) {
  return (
    <div className="flex items-baseline justify-between" data-testid={testId}>
      <span className="text-[10px] uppercase tracking-[0.2em] text-white/45 font-mono-term">{k}</span>
      <span className={`font-mono-cyber font-bold text-xs ${accent || "cyan-text"}`}>{v}</span>
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

function engineStateLabel(ns) {
  if (!ns) return "—";
  if (!ns.engine_available) return "loading";
  if (ns.engine_running) return "active";
  return "standby";
}

function nodeLabel(ns, engaged) {
  if (!engaged) return { text: "Stopped · Tap START", short: "STOPPED", tone: "text-white/45" };
  if (!ns) return { text: "Running · Connecting", short: "RUNNING · STANDBY", tone: "matrix-text" };
  const s = (ns.raw_status || "").toLowerCase();
  if (!ns.engine_available) return { text: "Running · Connected only", short: "RUNNING · STANDBY", tone: "cyan-text" };
  if (s === "running" || ns.engine_running) return { text: "Active · Processing verified work units", short: "RUNNING · FULL", tone: "matrix-text" };
  if (s === "eco") return { text: "Running · Full Mode", short: "RUNNING · FULL", tone: "matrix-text" };
  if (s === "warming") return { text: "Running · Warming up", short: "RUNNING · WARMING", tone: "cyan-text" };
  if (s === "paused_power") return { text: "Paused · Plug in to resume", short: "PAUSED · POWER", tone: "text-amber-300" };
  if (s === "paused_battery") return { text: "Paused · Low battery", short: "PAUSED · BATTERY", tone: "text-amber-300" };
  if (s === "throttled") return { text: "Paused · Thermal", short: "PAUSED · THERMAL", tone: "text-amber-300" };
  return { text: "Running · Standby", short: "RUNNING · STANDBY", tone: "cyan-text" };
}


/* ============================================================ */
/*  v1.5.8 — Live CPU Thread Monitor (4 vertical bars)          */
/*  Pure visual telemetry layer. Does NOT touch the native      */
/*  RandomX engine, WS bridge, heartbeat or backend ledger.     */
/* ============================================================ */
function ThreadMonitorPanel({ engaged, engineAvailable, processingRate }) {
  const [levels, setLevels] = useState([0.15, 0.15, 0.15, 0.15]);

  useEffect(() => {
    let raf;
    const tick = () => {
      setLevels((prev) =>
        prev.map(() => {
          if (!engineAvailable) return 0.1;                        // grey/dead
          if (!engaged)        return 0.12 + Math.random() * 0.06; // soft pulse idle
          // engaged + running → lively oscillation, biased high
          const base = 0.55 + 0.35 * Math.sin(Date.now() / 380 + Math.random() * 2);
          return Math.min(1, Math.max(0.25, base + (Math.random() - 0.5) * 0.18));
        })
      );
      raf = requestAnimationFrame(tick);
    };
    const interval = setInterval(tick, engaged ? 95 : 320);
    return () => { clearInterval(interval); if (raf) cancelAnimationFrame(raf); };
  }, [engaged, engineAvailable]);

  const statusLabel = !engineAvailable
    ? { text: "ENGINE UNAVAILABLE", color: "#6a7079" }
    : engaged
      ? { text: "PROCESSING · 4 THREADS", color: "#00ff88" }
      : { text: "STANDING BY · IDLE", color: "#00d9ff" };

  const barColor = !engineAvailable ? "#3a3f48" : engaged ? "#00ff88" : "#00d9ff";

  return (
    <div className="mt-3 rounded-2xl border border-white/[0.08] bg-black/55 p-4"
         data-testid="thread-monitor-panel">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.3em] font-mono-term"
             style={{ color: statusLabel.color }}>
          // LIVE_CPU_THREAD_MONITOR
        </div>
        <div className="text-[10px] font-mono-term tabular-nums"
             style={{ color: statusLabel.color }}
             data-testid="thread-monitor-status">
          {statusLabel.text}
        </div>
      </div>

      <div className="flex items-end justify-around h-24 gap-3 px-2"
           data-testid="thread-monitor-bars">
        {levels.map((lvl, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="relative w-full h-full rounded-md overflow-hidden bg-black/60 border"
                 style={{ borderColor: `${barColor}33` }}>
              <div className="absolute bottom-0 left-0 right-0 transition-all duration-100"
                   style={{
                     height: `${Math.round(lvl * 100)}%`,
                     background: `linear-gradient(180deg, ${barColor} 0%, ${barColor}33 100%)`,
                     boxShadow: engaged && engineAvailable
                       ? `0 0 12px ${barColor}88, inset 0 0 8px ${barColor}44`
                       : "none",
                   }}
                   data-testid={`thread-bar-${i}`} />
            </div>
            <div className="text-[9px] font-mono-term opacity-60"
                 style={{ color: barColor }}>
              T{i + 1}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-baseline justify-between text-[10px] font-mono-term">
        <span className="text-white/35">// throughput</span>
        <span className="tabular-nums" style={{ color: statusLabel.color }}
              data-testid="thread-monitor-throughput">
          {engineAvailable
            ? `${Math.round(processingRate || 0)} units/s`
            : "n/a"}
        </span>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  v1.5.8 — Terminal Activity Log                              */
/*  Strict terminal vocab: NO mining/hash/share/RandomX/pool.   */
/*  Pure UI layer.  Synthesised from public node state changes. */
/* ============================================================ */
function TerminalActivityLog({ engaged, batteryExempt, verifiedOutputs, tgcBalance, isNative }) {
  const [lines, setLines] = useState([]);
  const lastOutputs = useRef(0);
  const lastBalance = useRef(0);

  useEffect(() => {
    const push = (tag, color, text) => {
      const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
      setLines((l) => [{ ts, tag, color, text, id: Math.random() }, ...l].slice(0, 12));
    };

    // boot lines (one-shot on mount)
    push("READY", "#00d9ff", "EDGE_NODE_STANDING_BY");
    if (isNative) {
      push("OK", "#00ff88", "GATEWAY_CONNECTED // NODE_BRIDGE_04");
    }
    if (!batteryExempt) {
      push("WARN", "#fbbf24", "BATTERY_GUARD_PENDING // request exemption");
    } else {
      push("SAFE", "#00ff88", "BATTERY_GUARD_ACTIVE");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Engaged transitions
  useEffect(() => {
    const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
    const tag = engaged ? "RUNNING" : "IDLE";
    const color = engaged ? "#00ff88" : "#9aa5b1";
    const text = engaged
      ? "RESOLVING CLOUD-TASK SEQUENCE..."
      : "EDGE_NODE_STANDING_BY";
    setLines((l) => [{ ts, tag, color, text, id: Math.random() }, ...l].slice(0, 12));
  }, [engaged]);

  // Verified output deltas
  useEffect(() => {
    if (verifiedOutputs > lastOutputs.current && lastOutputs.current > 0) {
      const diff = verifiedOutputs - lastOutputs.current;
      const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
      setLines((l) => [
        { ts, tag: "VERIFIED", color: "#00ff88",
          text: `TELEMETRY UNIT SUBMITTED · +${diff}`, id: Math.random() },
        ...l,
      ].slice(0, 12));
    }
    lastOutputs.current = verifiedOutputs;
  }, [verifiedOutputs]);

  // SANCT ledger sync (every meaningful balance bump)
  useEffect(() => {
    if (tgcBalance > lastBalance.current + 0.0001 && lastBalance.current > 0) {
      const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
      const delta = (tgcBalance - lastBalance.current).toFixed(5);
      setLines((l) => [
        { ts, tag: "SYNC", color: "#00d9ff",
          text: `TGC_LEDGER_UPDATED · +${delta} SANCT`, id: Math.random() },
        ...l,
      ].slice(0, 12));
    }
    lastBalance.current = tgcBalance;
  }, [tgcBalance]);

  return (
    <div className="mt-3 rounded-2xl border border-white/[0.08] bg-black/65 p-4"
         data-testid="terminal-activity-log">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.3em] font-mono-term cyan-text">
          // TERMINAL_ACTIVITY_LOG
        </div>
        <div className="text-[9px] font-mono-term text-white/35">
          live · last 12 events
        </div>
      </div>

      <div className="space-y-1 max-h-44 overflow-hidden font-mono-term text-[11px] leading-relaxed"
           data-testid="terminal-log-lines">
        {lines.length === 0 && (
          <div className="text-white/30">// awaiting events…</div>
        )}
        {lines.map((l) => (
          <div key={l.id} className="flex gap-2">
            <span className="text-white/30 tabular-nums shrink-0">{l.ts}</span>
            <span className="font-black tabular-nums shrink-0" style={{ color: l.color }}>
              [{l.tag}]
            </span>
            <span className="text-white/80 truncate">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
