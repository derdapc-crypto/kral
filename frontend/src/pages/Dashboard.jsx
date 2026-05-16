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

  const loadAll = async () => {
    try {
      const [d, w, s, r] = await Promise.all([
        api.get("/devices"),
        api.get("/wallet"),
        api.get("/stats/network"),
        api.get("/tasks/recent"),
      ]);
      setDevices(d.data); setWallet(w.data); setStats(s.data); setRecent(r.data);
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
    <div className="min-h-[calc(100vh-4rem)] landing-root font-sans-saas">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-10">

        {/* Header */}
        <div className="flex flex-wrap justify-between items-end gap-4 mb-10">
          <div>
            <div className="landing-pill info mb-3"><span className="dot" /> / compute network</div>
            <h1 className="font-grotesk font-bold tracking-tight text-white" style={{ fontSize: "clamp(28px, 3.6vw, 44px)" }}>
              Welcome back, <span style={{
                background: "linear-gradient(90deg, #00ffe1, #00d4ff 50%, #00ff88)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>{user?.name || "Contributor"}</span>
            </h1>
            <p className="text-white/55 mt-2 text-sm font-sans-saas">
              Your distributed compute footprint at a glance — verified, observable, payout-tracked.
            </p>
          </div>
          <Link to="/device" data-testid="dashboard-to-device-link" className="landing-cta-primary inline-flex items-center gap-2">
            <Radio className="w-4 h-4" /> Open Compute Node
          </Link>
        </div>

        {/* Stats — cloud-compute terminology only. v1.5.5: TGC balance with
             5-decimal precision (crypto-style ticking) instead of $USDT
             estimate, since redemption is locked until mainnet (Q3 2027). */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <StatCard label="Reward Balance"      value={`${(wallet?.tgc_balance ?? 0).toFixed(5)} TGC`}
                    testId="stat-balance" tone="ok" />
          <StatCard label="Lifetime TGC"        value={`${(wallet?.tgc_total_earned ?? 0).toFixed(5)} TGC`}
                    testId="stat-earned" />
          <StatCard label="Compute Nodes"       value={devices.length}
                    testId="stat-devices" tone="info" />
          <StatCard label="Network Contribution"
                    value={totalWorkUnits === 0 ? "Pending" : `${contributionScore}%`}
                    testId="stat-contribution"
                    tone={totalWorkUnits === 0 ? "white" : "ok"} />
        </div>

        {/* Power-Up + Tier Forecast (still visible — they reflect contribution velocity) */}
        <div className="grid lg:grid-cols-2 gap-6 mb-10">
          <PowerUpButton onChange={loadAll} />
          <TierForecast />
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
                  ? "Token launch için cüzdan adresini şimdi kaydet (örn. BSC 0x… veya TRC-20 T…)"
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
                {wallet?.redemption_locked ? "🔒 Pre-Mainnet · Locked" : "Request Payout"}
              </button>
            </div>
            {wallet?.redemption_locked && (
              <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.04] px-4 py-3"
                   data-testid="dashboard-mainnet-banner">
                <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300/85 font-mono-term mb-1">
                  {wallet?.token_launch_label || "TGC Mainnet · Token Launch Q3 2026"}
                </div>
                <div className="text-[12px] text-white/70 leading-relaxed">
                  Bugün biriktirdiğin her TGC, mainnet launch günü canlı <span className="text-amber-300 font-semibold">$TGC</span> token'a
                  <span className="text-amber-300 font-semibold"> 1:1 airdrop</span> edilecek. Cüzdan adresini şimdi kaydet — snapshot bilgisi token launch öncesi e-posta ile bildirilecek.
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
    </div>
  );
}

