import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Cpu, Wallet, Plus, Smartphone, Zap, ArrowUpRight, ShieldCheck, Radio } from "lucide-react";
import TGCCounter from "../components/TGCCounter";
import PowerUpButton from "../components/PowerUpButton";
import TierForecast from "../components/TierForecast";
import CyberWealthFlow from "../components/CyberWealthFlow";
import LiveFleetGlobe from "../components/LiveFleetGlobe";

function StatCard({ label, value, suffix = "", testId }) {
  return (
    <div className="p-6 rounded-2xl glass border-white/5" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{label}</div>
      <div className="mt-3 text-3xl font-display font-black gold-text font-mono-num">
        {typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : value}{suffix}
      </div>
    </div>
  );
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
      setMsg(`Withdrawal queued: ${data.amount_tgc.toFixed(1)} TGC ($${data.amount_usdt.toFixed(2)} USDT) → ${data.address.slice(0, 12)}…`);
      setWithdrawAddr("");
      await loadAll();
      await refresh();
    } catch (err) { setMsg(formatApiError(err)); }
  };

  const canWithdraw = wallet && wallet.can_withdraw;
  const progress = wallet ? Math.min(100, ((wallet.tgc_balance ?? 0) / (wallet.withdraw_threshold_tgc || 200)) * 100) : 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] grid-bg">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-10">

        {/* Header */}
        <div className="flex flex-wrap justify-between items-end gap-4 mb-10">
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-[#F2C94C]">/ operator console</div>
            <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mt-2">
              Welcome back, <span className="gold-text">{user?.name || "Operator"}</span>
            </h1>
          </div>
          <Link to="/device" data-testid="dashboard-to-device-link"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-sm hover:shadow-[0_0_30px_rgba(242,201,76,0.6)] transition-shadow">
            <Radio className="w-4 h-4" /> Open Node Terminal
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <StatCard label="Balance TGC" value={wallet?.tgc_balance ?? 0} testId="stat-balance" />
          <StatCard label="Lifetime TGC" value={wallet?.tgc_total_earned ?? 0} testId="stat-earned" />
          <StatCard label="Your Devices" value={devices.length} testId="stat-devices" />
          <StatCard label="Network PetaFLOPS" value={stats.live_petaflops ?? 0} testId="stat-petaflops" />
        </div>

        {/* Power-Up + Tier Forecast */}
        <div className="grid lg:grid-cols-2 gap-6 mb-10">
          <PowerUpButton onChange={loadAll} />
          <TierForecast />
        </div>

        {/* Wallet + Devices */}
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 mb-10">
          {/* Wallet · Cyber Wealth Flow (v1.3.9 investor-grade) */}
          <CyberWealthFlow
            tgcBalance={wallet?.tgc_balance ?? 0}
            tgcUsdt={wallet?.tgc_balance_usdt_value ?? 0}
            threshold={wallet?.withdraw_threshold_tgc ?? 200}
            thresholdUsdt={wallet?.withdraw_threshold_usdt ?? 10}
            testId="dashboard-wealth-flow">
            <div className="mt-7 flex gap-3">
                <input
                  placeholder="TRC-20 address (e.g. TXYZ…)"
                  value={withdrawAddr}
                  onChange={(e) => setWithdrawAddr(e.target.value)}
                  data-testid="withdraw-address-input"
                  className="flex-1 bg-black/40 border border-[#00ffe1]/15 rounded-xl px-4 py-3 text-sm text-white focus:border-[#00ff88] focus:outline-none font-mono-cyber" />
                <button
                  onClick={withdraw}
                  disabled={!canWithdraw}
                  data-testid="withdraw-btn"
                  className={`px-6 py-3 rounded-xl font-semibold text-sm whitespace-nowrap transition-all inline-flex items-center gap-2 font-mono-cyber tracking-wider ${
                    canWithdraw
                      ? "bg-[#00ff88] text-black shadow-[0_0_30px_rgba(0,255,136,0.55)] hover:shadow-[0_0_50px_rgba(0,255,136,0.8)]"
                      : "bg-white/5 text-white/30 cursor-not-allowed"
                  }`}>
                  Withdraw TGC <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
              {/* Hidden legacy testid for backward-compat selectors */}
              <span className="hidden" data-testid="dashboard-tgc-balance">{(wallet?.tgc_balance ?? 0).toFixed(1)}</span>
              <span className="hidden" data-testid="dashboard-tgc-usdt-value">{(wallet?.tgc_balance_usdt_value ?? 0).toFixed(2)}</span>
              {msg && <div className="mt-4 text-xs neon-green-text font-mono-cyber" data-testid="wallet-msg">{msg}</div>}
          </CyberWealthFlow>

          {/* Recent Tasks */}
          <div className="p-6 rounded-3xl glass overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">/ compute log</div>
              <span className="text-xs text-white/40">Latest 25</span>
            </div>
            <div className="max-h-[280px] overflow-auto" data-testid="recent-tasks-list">
              {recent.length === 0 && <div className="text-sm text-white/40 py-10 text-center">No tasks yet. Open your Node terminal to contribute.</div>}
              {recent.map((t) => (
                <div key={t.id} className="flex justify-between items-center py-2.5 border-b border-white/5 text-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full ${t.status === "verified" ? "bg-[#F2C94C]" : t.status === "rejected" ? "bg-red-400" : "bg-white/30"}`} />
                    <span className="font-mono text-xs text-white/60 truncate w-[100px]">{t.id.slice(0, 8)}</span>
                    <span className="uppercase text-[10px] tracking-widest text-white/40">{t.kind}</span>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs font-semibold ${t.status === "verified" ? "text-[#F2C94C]" : "text-white/50"}`}>{t.status}</div>
                    {(t.earned_tgc > 0 || t.earned_usdt > 0) && (
                      <div className="text-[10px] text-white/40">
                        {t.earned_tgc > 0 ? `+${t.earned_tgc.toFixed(3)} TGC` : `+${t.earned_usdt.toFixed(5)}`}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live Fleet Globe — investor-grade rotating fleet view (v1.3.9) */}
        <div className="mb-10">
          <LiveFleetGlobe devices={devices} />
        </div>

        {/* Devices */}
        <div className="rounded-3xl glass p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">/ your nodes</div>
              <h2 className="font-display text-2xl font-bold mt-1">Registered Devices</h2>
            </div>
            <button onClick={() => setAddOpen((v) => !v)} data-testid="add-device-btn"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border gold-border text-[#F2C94C] text-xs tracking-widest uppercase hover:bg-[#F2C94C]/10 transition-colors">
              <Plus className="w-4 h-4" /> Add Device
            </button>
          </div>

          {addOpen && (
            <form onSubmit={addDevice} className="mb-6 p-5 rounded-2xl bg-black/40 border border-white/10 grid md:grid-cols-[2fr_1fr_auto] gap-3 items-end" data-testid="add-device-form">
              <div>
                <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Name</label>
                <input required value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. My iPhone 15 Pro" data-testid="add-device-name"
                  className="mt-2 w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-[#D4AF37] focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Tier</label>
                <select value={newModel} onChange={(e) => setNewModel(e.target.value)} data-testid="add-device-model"
                  className="mt-2 w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-[#D4AF37] focus:outline-none">
                  <option value="flagship">Flagship (3x)</option>
                  <option value="mid">Mid (1.8x)</option>
                  <option value="budget">Budget (1x)</option>
                </select>
              </div>
              <button type="submit" data-testid="add-device-submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-sm">
                Register
              </button>
            </form>
          )}

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="devices-list">
            {devices.length === 0 && (
              <div className="col-span-full py-12 text-center text-white/40 text-sm">No devices yet — register your first node above.</div>
            )}
            {devices.map((d) => (
              <div key={d.id} className="p-5 rounded-2xl bg-black/40 border border-white/10 hover:border-[#D4AF37] transition-colors" data-testid={`device-card-${d.id}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-white/40">{d.model}</div>
                    <div className="font-display font-bold text-lg mt-1">{d.name}</div>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${d.status === "active" ? "bg-[#F2C94C] dot-pulse" : "bg-white/20"}`} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="text-white/40">Tasks</div>
                  <div className="text-right text-white font-mono-num">{d.tasks_completed || 0}</div>
                  <div className="text-white/40">FLOPS</div>
                  <div className="text-right text-white font-mono-num">{(d.total_flops || 0).toLocaleString()}</div>
                  <div className="text-white/40">Status</div>
                  <div className="text-right uppercase tracking-widest text-[10px] text-[#F2C94C]">{d.status}</div>
                </div>
                {d.flagged && (
                  <div className="mt-3 text-[10px] uppercase tracking-widest text-red-400">⚠ Flagged by Fraud Shield</div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
