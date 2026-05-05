import React, { useEffect, useRef, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { executeTask } from "../lib/compute";
import { BatteryCharging, Wifi, Lock, Power, Cpu, Activity, Coins } from "lucide-react";

function Toggle({ label, icon: Icon, value, onChange, testId }) {
  return (
    <button onClick={() => onChange(!value)} data-testid={testId}
      className={`flex items-center justify-between w-full p-4 rounded-xl border transition-colors ${
        value ? "border-[#D4AF37] bg-[#F2C94C]/5" : "border-white/10 bg-black/30"
      }`}>
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${value ? "text-[#F2C94C]" : "text-white/40"}`} />
        <span className={`text-sm ${value ? "text-white" : "text-white/60"}`}>{label}</span>
      </div>
      <div className={`w-10 h-6 rounded-full p-0.5 transition-colors ${value ? "bg-[#F2C94C]" : "bg-white/10"}`}>
        <div className={`w-5 h-5 rounded-full bg-black transition-transform ${value ? "translate-x-4" : ""}`} />
      </div>
    </button>
  );
}

export default function Device() {
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState("");
  const [charging, setCharging] = useState(false);
  const [wifi, setWifi] = useState(false);
  const [permission, setPermission] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [earned, setEarned] = useState(0);
  const [tasksDone, setTasksDone] = useState(0);
  const [err, setErr] = useState("");
  const [miningCfg, setMiningCfg] = useState(null);
  const runningRef = useRef(false);
  const selectedRef = useRef("");

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/devices");
      setDevices(data);
      if (data.length && !selected) {
        setSelected(data[0].id);
        selectedRef.current = data[0].id;
      }
    })();
  }, []);

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const eligible = charging && wifi && permission && !!selected;

  // Heartbeat every 4s regardless of running state
  useEffect(() => {
    if (!selected) return;
    const ua = navigator.userAgent;
    const brand = /iPhone|iPad|Mac/i.test(ua) ? "Apple" : /Samsung/i.test(ua) ? "Samsung" : /Pixel/i.test(ua) ? "Google" : "Generic";
    const os_version = /iPhone OS ([\d_]+)/.test(ua) ? `iOS ${RegExp.$1.replace(/_/g, ".")}` :
                       /Android ([\d.]+)/.test(ua) ? `Android ${RegExp.$1}` :
                       /Mac OS X ([\d_]+)/.test(ua) ? `macOS ${RegExp.$1.replace(/_/g, ".")}` : "Unknown";
    const thermals = ["nominal", "nominal", "nominal", "warm"];
    const hb = async () => {
      try {
        // Pull the current mining config from the orchestrator
        let cfg = miningCfg;
        try {
          const { data } = await api.get(`/mining/config?device_id=${selected}`);
          cfg = data;
          setMiningCfg(data);
        } catch {}
        // Simulated hashrate reported while active (jitter ±10%)
        const activeNow = charging && wifi && permission;
        const baseHps = cfg?.expected_hashrate_hps || 0;
        const reportedHps = activeNow ? baseHps * (0.9 + Math.random() * 0.2) : 0;

        await api.post("/devices/heartbeat", {
          device_id: selected, charging, wifi, permission, battery: 92,
          thermal: thermals[Math.floor(Math.random() * thermals.length)],
          brand, os_version,
          hashrate: reportedHps,
          algo: cfg?.algo || null,
        });
      } catch {}
    };
    hb();
    const t = setInterval(hb, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [selected, charging, wifi, permission]);

  const pushLog = (entry) => setLog((prev) => [entry, ...prev].slice(0, 50));

  const runLoop = async () => {
    while (runningRef.current) {
      if (!selectedRef.current) { await new Promise(r => setTimeout(r, 500)); continue; }
      try {
        const { data: task } = await api.post(`/tasks/request?device_id=${selectedRef.current}`);
        pushLog({ id: task.id, status: "assigned", kind: task.kind, ts: Date.now() });
        const { result, compute_ms } = await executeTask(task);
        const { data: sub } = await api.post("/tasks/submit", {
          task_id: task.id, device_id: selectedRef.current, result, compute_ms,
        });
        pushLog({ id: task.id, status: sub.verified ? "verified" : "rejected", kind: task.kind, ts: Date.now(), earned: sub.earned_usdt });
        if (sub.verified) {
          setEarned((p) => p + sub.earned_usdt);
          setTasksDone((p) => p + 1);
        }
      } catch (e) {
        pushLog({ id: "error", status: "error", kind: formatApiError(e), ts: Date.now() });
        await new Promise(r => setTimeout(r, 1500));
      }
      await new Promise(r => setTimeout(r, 300));
    }
  };

  const toggleRun = async () => {
    setErr("");
    if (!eligible) { setErr("Golden Rule not satisfied. Enable Charging, Wi-Fi and Permission."); return; }
    if (running) {
      runningRef.current = false;
      setRunning(false);
      return;
    }
    runningRef.current = true;
    setRunning(true);
    runLoop();
  };

  useEffect(() => () => { runningRef.current = false; }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] grid-bg">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-10">
        <div className="mb-10">
          <div className="text-[11px] tracking-[0.3em] uppercase text-[#F2C94C]">/ node terminal</div>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mt-2">
            Browser-Native <span className="gold-text">Compute Node</span>
          </h1>
          <p className="text-white/60 mt-3 max-w-xl text-sm">This tab becomes a real grid node. It requests signed tasks, runs them on your CPU, and submits results for verification.</p>
        </div>

        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
          {/* Left — control deck */}
          <div className="rounded-3xl glass-strong p-10 relative overflow-hidden">
            <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-[#D4AF37]/15 blur-3xl" />

            <div className="relative">
              <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Active Device</label>
              <select value={selected} onChange={(e) => setSelected(e.target.value)} data-testid="device-select"
                className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none">
                {devices.length === 0 && <option value="">No devices — add one from Dashboard</option>}
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.model}</option>)}
              </select>

              {miningCfg && (
                <div className="mt-5 p-4 rounded-2xl bg-gradient-to-r from-[#F2C94C]/10 to-transparent border border-[#F2C94C]/25" data-testid="mining-banner">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[#F2C94C]">
                      <Coins className="w-3 h-3" /> Baseline Mining · {miningCfg.coin}
                    </div>
                    <span className="text-[10px] tracking-widest uppercase text-white/50">{miningCfg.algo}</span>
                  </div>
                  <div className="mt-2 font-mono text-xs text-white/80 break-all">{miningCfg.stratum_url}</div>
                  <div className="mt-1 font-mono text-[10px] text-white/50 truncate" data-testid="mining-worker-id">{miningCfg.worker_id}</div>
                </div>
              )}

              <div className="mt-6 grid gap-3" data-testid="golden-rule-panel">
                <Toggle label="Charging" icon={BatteryCharging} value={charging} onChange={setCharging} testId="toggle-charging" />
                <Toggle label="On Wi-Fi" icon={Wifi} value={wifi} onChange={setWifi} testId="toggle-wifi" />
                <Toggle label="Permission Granted" icon={Lock} value={permission} onChange={setPermission} testId="toggle-permission" />
              </div>

              <div className="mt-10 flex flex-col items-center">
                <button
                  onClick={toggleRun}
                  disabled={!selected}
                  data-testid="grid-start-btn"
                  className={`relative w-44 h-44 rounded-full grid place-items-center transition-all ${
                    running
                      ? "bg-gradient-to-br from-[#F2C94C] to-[#B8860B] text-black grid-pulse"
                      : eligible
                      ? "bg-gradient-to-br from-[#F2C94C] to-[#B8860B] text-black shadow-[0_0_60px_rgba(242,201,76,0.45)]"
                      : "bg-white/5 text-white/30 border border-white/10"
                  }`}>
                  <div className="flex flex-col items-center">
                    <Power className="w-10 h-10" strokeWidth={1.6} />
                    <span className="mt-2 font-display font-black text-sm tracking-[0.25em]">
                      {running ? "RUNNING" : "START"}
                    </span>
                  </div>
                </button>
                {err && <div className="mt-4 text-xs text-red-400" data-testid="golden-rule-error">{err}</div>}
                {!err && <div className="mt-4 text-[10px] tracking-[0.3em] uppercase text-white/40">
                  {eligible ? "Grid connection ready" : "Golden Rule · 3 conditions required"}
                </div>}
              </div>
            </div>
          </div>

          {/* Right — metrics + stream */}
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 rounded-2xl glass" data-testid="session-tasks">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Session Tasks</div>
                <div className="mt-3 text-4xl font-display font-black gold-text font-mono-num">{tasksDone}</div>
              </div>
              <div className="p-6 rounded-2xl glass" data-testid="session-earned">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Session USDT</div>
                <div className="mt-3 text-4xl font-display font-black gold-text font-mono-num">{earned.toFixed(5)}</div>
              </div>
            </div>

            <div className="rounded-3xl glass p-6 h-[440px] flex flex-col relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/40">
                  <Activity className="w-3.5 h-3.5" /> Data Stream
                </div>
                {running && <span className="text-[10px] tracking-[0.25em] uppercase text-[#F2C94C] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F2C94C] dot-pulse" /> SOLVING
                </span>}
              </div>

              {/* streams */}
              <div className="absolute inset-0 pointer-events-none opacity-40">
                {running && [...Array(8)].map((_, i) => (
                  <div key={i} className="absolute top-0 w-px h-20 bg-gradient-to-b from-[#F2C94C] to-transparent stream-line"
                    style={{ left: `${(i + 1) * 11}%`, animationDelay: `${i * 0.25}s` }} />
                ))}
              </div>

              <div className="flex-1 overflow-auto relative z-10 pr-2" data-testid="stream-log">
                {log.length === 0 && <div className="text-sm text-white/40 text-center py-16">No packets yet. Press START to begin solving.</div>}
                {log.map((l, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1.5 text-xs border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        l.status === "verified" ? "bg-[#F2C94C]" :
                        l.status === "rejected" || l.status === "error" ? "bg-red-400" : "bg-white/40"
                      }`} />
                      <span className="text-white/70 font-mono truncate w-[90px]">{String(l.id).slice(0, 10)}</span>
                      <span className="uppercase tracking-widest text-[9px] text-white/40">{l.kind}</span>
                    </div>
                    <div className="text-right">
                      <div className={`text-[10px] uppercase tracking-widest ${l.status === "verified" ? "text-[#F2C94C]" : "text-white/50"}`}>{l.status}</div>
                      {l.earned > 0 && <div className="text-[9px] text-white/40">+{l.earned.toFixed(5)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
