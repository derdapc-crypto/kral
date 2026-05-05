import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api, formatApiError } from "../lib/api";
import { executeTask } from "../lib/compute";
import { Power, BatteryCharging, Wifi, Lock, Coins, ArrowUpRight, Hexagon, LogOut, Activity, ShieldCheck } from "lucide-react";

function StatCell({ label, value, accent = false }) {
  return (
    <div className={`flex-1 p-4 rounded-2xl ${accent ? "bg-gradient-to-br from-[#F2C94C]/15 to-transparent border border-[#F2C94C]/30" : "bg-black/40 border border-white/10"}`}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{label}</div>
      <div className={`mt-1.5 text-xl font-display font-black font-mono-num ${accent ? "gold-text" : "text-white"}`}>{value}</div>
    </div>
  );
}

function Toggle({ label, icon: Icon, value, onChange, testId }) {
  return (
    <button onClick={() => onChange(!value)} data-testid={testId}
      className={`flex items-center justify-between w-full p-3 rounded-xl border transition-colors ${
        value ? "border-[#D4AF37] bg-[#F2C94C]/8" : "border-white/10 bg-black/30"
      }`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${value ? "text-[#F2C94C]" : "text-white/40"}`} />
        <span className={`text-xs ${value ? "text-white" : "text-white/60"}`}>{label}</span>
      </div>
      <div className={`w-9 h-5 rounded-full p-0.5 transition-colors ${value ? "bg-[#F2C94C]" : "bg-white/10"}`}>
        <div className={`w-4 h-4 rounded-full bg-black transition-transform ${value ? "translate-x-4" : ""}`} />
      </div>
    </button>
  );
}

export default function Mobile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [device, setDevice] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [miningCfg, setMiningCfg] = useState(null);
  const [running, setRunning] = useState(false);
  const [charging, setCharging] = useState(true);
  const [wifi, setWifi] = useState(true);
  const [permission, setPermission] = useState(true);
  const [tasksDone, setTasksDone] = useState(0);
  const [sessionEarned, setSessionEarned] = useState(0);
  const [err, setErr] = useState("");
  const runningRef = useRef(false);

  useEffect(() => {
    if (!user) { nav("/login"); return; }
    if (user.role === "admin") { nav("/admin"); return; }
    if (user.role === "customer") { nav("/customer"); return; }
    (async () => {
      try {
        const { data } = await api.get("/devices");
        if (!data.length) {
          // Auto-register a device for first-time mobile users
          const ua = navigator.userAgent;
          const brand = /iPhone|iPad/i.test(ua) ? "Apple" : /Samsung/i.test(ua) ? "Samsung" : /Pixel/i.test(ua) ? "Google" : "Mobile";
          const { data: dev } = await api.post("/devices/register", { name: `${brand} Mobile`, model: "mid", platform: "mobile", brand });
          setDevice(dev);
        } else {
          setDevice(data[0]);
        }
      } catch {}
    })();
    refreshWallet();
    const t = setInterval(refreshWallet, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [user]);

  const refreshWallet = async () => {
    try { const { data } = await api.get("/wallet"); setWallet(data); } catch {}
  };

  // Heartbeat + mining-config poll loop (5s)
  useEffect(() => {
    if (!device) return;
    const ua = navigator.userAgent;
    const brand = /iPhone|iPad|Mac/i.test(ua) ? "Apple" : /Samsung/i.test(ua) ? "Samsung" : /Pixel/i.test(ua) ? "Google" : "Mobile";
    const os_version = /iPhone OS ([\d_]+)/.test(ua) ? `iOS ${RegExp.$1.replace(/_/g, ".")}` :
                       /Android ([\d.]+)/.test(ua) ? `Android ${RegExp.$1}` : "Mobile OS";
    const tick = async () => {
      try {
        const { data: cfg } = await api.get(`/mining/config?device_id=${device.id}`);
        setMiningCfg(cfg);
        const eligibleNow = charging && wifi && permission;
        const reportedHps = eligibleNow ? cfg.expected_hashrate_hps * (0.92 + Math.random() * 0.16) : 0;
        await api.post("/devices/heartbeat", {
          device_id: device.id, charging, wifi, permission, battery: 88,
          thermal: "nominal", brand, os_version,
          hashrate: reportedHps, algo: cfg.algo,
          country: "US",
          current_mode: eligibleNow ? cfg.mode : "idle",
        });
      } catch {}
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [device, charging, wifi, permission]);

  const runLoop = async () => {
    while (runningRef.current && device) {
      try {
        const { data: task } = await api.post(`/tasks/request?device_id=${device.id}`);
        const { result, compute_ms } = await executeTask(task);
        const { data: sub } = await api.post("/tasks/submit", {
          task_id: task.id, device_id: device.id, result, compute_ms,
        });
        if (sub.verified) {
          setSessionEarned((p) => p + sub.earned_usdt);
          setTasksDone((p) => p + 1);
          await refreshWallet();
        }
      } catch (e) {
        await new Promise(r => setTimeout(r, 2000));
      }
      await new Promise(r => setTimeout(r, 250));
    }
  };

  const toggle = () => {
    setErr("");
    const eligible = charging && wifi && permission && !!device;
    if (!eligible) { setErr("Enable Charging, Wi-Fi, Permission first."); return; }
    if (running) { runningRef.current = false; setRunning(false); return; }
    runningRef.current = true; setRunning(true); runLoop();
  };

  useEffect(() => () => { runningRef.current = false; }, []);

  const eligible = charging && wifi && permission && !!device;
  const mode = miningCfg?.mode || "idle";
  const modeBadge = mode === "enterprise_job" ? "AI / ENTERPRISE" : mode === "baseline_mining" ? `MINING ${miningCfg?.coin}` : "STANDBY";

  return (
    <div className="min-h-screen grid-bg pb-20" data-testid="mobile-screen">
      {/* Top bar */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hexagon className="w-6 h-6 text-[#D4AF37]" />
          <div className="font-display font-black text-base">THE <span className="gold-text">GRID</span></div>
        </div>
        <button onClick={async () => { await logout(); nav("/"); }} data-testid="mobile-logout"
          className="p-2 rounded-full border border-white/10 text-white/60">
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-5">
        {/* Greeting */}
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#F2C94C]">/ operator</div>
          <h1 className="font-display text-2xl font-black tracking-tighter mt-1" data-testid="mobile-greeting">Hi, {user?.name?.split(" ")[0] || "Operator"}</h1>
        </div>

        {/* Live earnings card */}
        <div className="mt-5 rounded-3xl glass-strong p-6 relative overflow-hidden" data-testid="mobile-earnings-card">
          <div className="absolute -right-16 -top-16 w-44 h-44 rounded-full bg-[#D4AF37]/20 blur-3xl" />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Live Earnings</div>
            <div className="mt-2 flex items-baseline gap-2">
              <div className="text-5xl font-display font-black gold-text font-mono-num">{(wallet?.balance_usdt ?? 0).toFixed(4)}</div>
              <div className="text-white/50 text-sm">USDT</div>
            </div>
            <div className="text-[10px] text-white/40 mt-0.5">Lifetime · {(wallet?.total_earned ?? 0).toFixed(4)}</div>
            {wallet?.can_withdraw && (
              <Link to="/dashboard" data-testid="mobile-withdraw-cta"
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-xs">
                Withdraw USDT <ArrowUpRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Mode badge */}
        {miningCfg && (
          <div className="mt-4 p-3 rounded-2xl bg-black/40 border border-[#F2C94C]/15 flex items-center justify-between" data-testid="mobile-mode-badge">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-[#F2C94C] dot-pulse" : "bg-white/30"}`} />
              <span className="text-[10px] uppercase tracking-[0.25em] text-white/50">Mode</span>
              <span className="text-xs font-semibold text-[#F2C94C]">{modeBadge}</span>
            </div>
            <span className="text-[9px] tracking-widest uppercase text-white/40">{miningCfg.algo}</span>
          </div>
        )}

        {/* Big START button */}
        <div className="mt-7 grid place-items-center">
          <button onClick={toggle} disabled={!device} data-testid="mobile-start-btn"
            className={`relative w-56 h-56 rounded-full grid place-items-center transition-all ${
              running ? "bg-gradient-to-br from-[#F2C94C] to-[#B8860B] text-black grid-pulse"
              : eligible ? "bg-gradient-to-br from-[#F2C94C] to-[#B8860B] text-black shadow-[0_0_60px_rgba(242,201,76,0.45)]"
              : "bg-white/5 text-white/30 border border-white/10"
            }`}>
            <div className="flex flex-col items-center">
              <Power className="w-14 h-14" strokeWidth={1.6} />
              <span className="mt-2 font-display font-black text-base tracking-[0.25em]">
                {running ? "EARNING" : "START EARNING"}
              </span>
            </div>
          </button>
          {err && <div className="mt-3 text-xs text-red-400" data-testid="mobile-err">{err}</div>}
          {!err && !running && eligible && <div className="mt-3 text-[10px] tracking-[0.3em] uppercase text-white/40">Tap to connect to the grid</div>}
        </div>

        {/* Session stats */}
        <div className="mt-7 flex gap-3">
          <StatCell label="Session Tasks" value={tasksDone} />
          <StatCell label="Session USDT" value={sessionEarned.toFixed(5)} accent />
        </div>

        {/* Golden Rule */}
        <div className="mt-5 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-[#F2C94C]" /> Golden Rule</div>
          <Toggle label="Charging" icon={BatteryCharging} value={charging} onChange={setCharging} testId="mobile-toggle-charging" />
          <Toggle label="Wi-Fi" icon={Wifi} value={wifi} onChange={setWifi} testId="mobile-toggle-wifi" />
          <Toggle label="Permission" icon={Lock} value={permission} onChange={setPermission} testId="mobile-toggle-permission" />
        </div>

        {/* Device card */}
        {device && (
          <div className="mt-5 p-4 rounded-2xl bg-black/40 border border-white/10" data-testid="mobile-device-card">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#F2C94C]" />
                <div>
                  <div className="text-sm text-white">{device.name}</div>
                  <div className="text-[10px] text-white/40 uppercase tracking-widest">{device.model} · {device.brand || "Mobile"}</div>
                </div>
              </div>
              <div className="text-[10px] tracking-widest uppercase text-[#F2C94C]">{device.status || "idle"}</div>
            </div>
            {miningCfg?.device_worker_id && (
              <div className="mt-3 pt-3 border-t border-white/5 text-[10px] font-mono text-white/40 truncate">
                {miningCfg.device_worker_id}
              </div>
            )}
          </div>
        )}

        {/* Footer link */}
        <div className="mt-8 text-center">
          <Link to="/dashboard" data-testid="mobile-to-desktop" className="text-[10px] tracking-[0.3em] uppercase text-white/40 hover:text-[#F2C94C]">
            Open Full Dashboard →
          </Link>
        </div>
      </div>
    </div>
  );
}
