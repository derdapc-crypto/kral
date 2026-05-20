import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Shield, AlertTriangle, CheckCircle2, CircleDollarSign, Radio, Globe2, Users, Briefcase, FileText, Cpu, Thermometer, Battery, Wifi, BatteryCharging, X, Check, Zap, Power, Coins, Terminal, Ban, RotateCcw, Gift } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Area, AreaChart } from "recharts";
import RealAndroidDevices from "../components/RealAndroidDevices";
import BootSequence from "../components/BootSequence";
import LiveOperatorConsole from "../components/LiveOperatorConsole";
import WarRoomHUD from "../components/WarRoomHUD";
import HonorPodium from "../components/HonorPodium";
import ContributorDropsTab from "../components/ContributorDropsTab";
import TotalTgcCounter from "../components/TotalTgcCounter";
import AdminMiningConfig from "../components/AdminMiningConfig";

const DATA_BG = "https://static.prod-images.emergentagent.com/jobs/99f915a9-0229-4059-88a8-b7701782fb0c/images/afc45ee0b1fdae2ca04542c03ce5be366b443995c096e2a8e9ea99bd842fd4ad.png";

function Tab({ active, onClick, children, testId }) {
  return (
    <button onClick={onClick} data-testid={testId}
      className={`px-5 py-2.5 text-[10px] tracking-[0.3em] uppercase rounded-full transition-all font-mono-cyber ${
        active
          ? "bg-[#00ffe1] text-black cyan-glow font-bold"
          : "text-white/55 hover:text-[#00ffe1] border border-[#00ffe1]/15 hover:border-[#00ffe1]/40"
      }`}>
      {children}
    </button>
  );
}

function ThermalBadge({ value }) {
  const map = {
    nominal: "text-green-400 bg-green-400/5 border-green-400/30",
    warm: "text-yellow-300 bg-yellow-300/5 border-yellow-300/30",
    hot: "text-orange-400 bg-orange-400/5 border-orange-400/30",
    critical: "text-red-400 bg-red-400/5 border-red-400/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] tracking-widest uppercase ${map[value] || map.nominal}`}>
      <Thermometer className="w-3 h-3" /> {value || "nominal"}
    </span>
  );
}

function JobStatus({ status }) {
  const map = {
    pending: "text-yellow-300 border-yellow-300/40",
    running: "text-[#F2C94C] border-[#F2C94C]/40",
    completed: "text-green-400 border-green-400/40",
    rejected: "text-red-400 border-red-400/40",
  };
  return <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${map[status] || map.pending}`}>{status}</span>;
}

export default function Admin() {
  const [tab, setTab] = useState("map");
  const [devices, setDevices] = useState([]);
  const [users, setUsers] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [fraud, setFraud] = useState({ flagged_devices: [], rejected_tasks: 0 });
  const [stats, setStats] = useState({});
  const [jobs, setJobs] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [autoMining, setAutoMining] = useState(true);
  const [hashrate, setHashrate] = useState({ series: [], total_hashrate_hps: 0, total_tasks: 0 });
  const [buybacks, setBuybacks] = useState([]);
  const [ledgerTotals, setLedgerTotals] = useState(null);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const [d, u, p, f, s, j, l, am, hr, bb, pub] = await Promise.all([
        api.get("/admin/devices"), api.get("/admin/users"), api.get("/admin/payouts"),
        api.get("/admin/fraud"), api.get("/stats/network"),
        api.get("/admin/jobs"), api.get("/admin/ledger"),
        api.get("/admin/auto-mining"), api.get("/admin/hashrate"),
        api.get("/admin/buybacks"),
        api.get("/stats/public"),
      ]);
      setDevices(d.data); setUsers(u.data); setPayouts(p.data); setFraud(f.data);
      setStats(s.data); setJobs(j.data); setLedger(l.data);
      setAutoMining(am.data.enabled); setHashrate(hr.data);
      setBuybacks(bb.data || []);
      setLedgerTotals(pub.data);
    } catch (e) { setMsg(formatApiError(e)); }
  };

  const toggleAutoMining = async () => {
    try {
      const next = !autoMining;
      await api.post("/admin/auto-mining", { enabled: next });
      setAutoMining(next);
    } catch (e) { setMsg(formatApiError(e)); }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const activeDevices = useMemo(() => devices.filter((d) => d.status === "active"), [devices]);

  const approve = async (id) => { await api.post(`/admin/payouts/${id}/approve`); load(); };
  const flag = async (id) => { await api.post(`/admin/devices/${id}/flag`); load(); };
  const unflag = async (id) => { await api.post(`/admin/devices/${id}/unflag`); load(); };
  const approveJob = async (id) => { await api.post(`/admin/jobs/${id}/approve`); load(); };
  const rejectJob = async (id) => { await api.post(`/admin/jobs/${id}/reject`); load(); };
  const banUser = async (id, email) => {
    if (!window.confirm(`Suspend ${email}?\nThe account will no longer be able to log in or submit verified output.`)) return;
    try { await api.post(`/admin/users/${id}/ban`); load(); }
    catch (e) { setMsg(formatApiError(e)); }
  };
  const unbanUser = async (id) => {
    try { await api.post(`/admin/users/${id}/unban`); load(); }
    catch (e) { setMsg(formatApiError(e)); }
  };
  const approveBuyback = async (id, tgc) => {
    if (!window.confirm(`Approve buyback?\n${Number(tgc || 0).toFixed(2)} TGC will be PERMANENTLY burned from the contributor's ledger.`)) return;
    try { await api.post(`/admin/buybacks/${id}/approve`); load(); }
    catch (e) { setMsg(formatApiError(e)); }
  };
  const rejectBuyback = async (id) => {
    if (!window.confirm("Reject this buyback application? No TGC will be deducted.")) return;
    try { await api.post(`/admin/buybacks/${id}/reject`); load(); }
    catch (e) { setMsg(formatApiError(e)); }
  };

  // Map dots — deterministic pseudo locations based on device id
  const mapDots = useMemo(() => {
    return devices.map((d) => {
      let h = 0;
      for (let i = 0; i < d.id.length; i++) h = (h * 31 + d.id.charCodeAt(i)) >>> 0;
      return { id: d.id, x: 4 + (h % 92), y: 10 + ((h >> 8) % 72), active: d.status === "active", flagged: !!d.flagged };
    });
  }, [devices]);

  const pendingJobs = jobs.filter(j => j.status === "pending").length;
  const pendingBuybacks = buybacks.filter(b => b.status === "pending").length;

  return (
    <BootSequence>
    <div className="min-h-screen bg-black text-white relative">
      {/* vNext immersive operations background */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 opacity-[0.4]"
             style={{
               backgroundImage:
                 "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
               backgroundSize: "44px 44px",
               maskImage: "radial-gradient(ellipse at 50% 20%, black 35%, transparent 80%)",
               WebkitMaskImage: "radial-gradient(ellipse at 50% 20%, black 35%, transparent 80%)",
             }} />
        <div className="absolute -top-32 -left-32 w-[700px] h-[700px] rounded-full blur-[140px] opacity-[0.14]"
             style={{ background: "radial-gradient(circle, #00ff88 0%, transparent 60%)" }} />
        <div className="absolute top-1/2 -right-40 w-[640px] h-[640px] rounded-full blur-[140px] opacity-[0.12]"
             style={{ background: "radial-gradient(circle, #00d9ff 0%, transparent 60%)" }} />
        <div className="absolute inset-0"
             style={{
               backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)",
               mixBlendMode: "multiply", opacity: 0.5,
             }} />
      </div>

      <div className="relative max-w-[1500px] mx-auto px-6 lg:px-10 pt-12 pb-20">
        {/* vNext Command Center Header */}
        <div className="border-b border-white/[0.08] pb-7 mb-8">
          <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#00ff88] mb-4 flex items-center gap-2">
            <Terminal className="w-3 h-3" /> // operator.command_center · operations_layer
          </div>
          <div className="flex flex-wrap justify-between items-end gap-4">
            <h1 className="font-display text-white"
                style={{ fontSize: "clamp(36px, 5vw, 72px)", letterSpacing: "-0.04em", lineHeight: 0.95, fontWeight: 600 }}>
              GRID //{" "}
              <span style={{
                background: "linear-gradient(96deg, #00ff88, #00d9ff)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>COMMAND_CENTER</span>
            </h1>
          </div>
          <div className="mt-6 flex gap-2 flex-wrap">
            <Tab active={tab === "map"} onClick={() => setTab("map")} testId="admin-tab-map">Command Center</Tab>
            <Tab active={tab === "android"} onClick={() => setTab("android")} testId="admin-tab-android">
              <span className="inline-flex items-center gap-1.5"><Cpu className="w-3 h-3" /> Real Android</span>
            </Tab>
            <Tab active={tab === "devices"} onClick={() => setTab("devices")} testId="admin-tab-devices">Device Health</Tab>
            <Tab active={tab === "jobs"} onClick={() => setTab("jobs")} testId="admin-tab-jobs">
              Jobs {pendingJobs > 0 && <span className="ml-1 inline-block px-1.5 py-0 rounded-full bg-[#39ff14]/30 text-[#39ff14] text-[9px] font-bold">{pendingJobs}</span>}
            </Tab>
            <Tab active={tab === "ledger"} onClick={() => setTab("ledger")} testId="admin-tab-ledger">Ledger</Tab>
            <Tab active={tab === "payouts"} onClick={() => setTab("payouts")} testId="admin-tab-payouts">Payouts</Tab>
            <Tab active={tab === "fraud"} onClick={() => setTab("fraud")} testId="admin-tab-fraud">Fraud Shield</Tab>
            <Tab active={tab === "users"} onClick={() => setTab("users")} testId="admin-tab-users">Users</Tab>
            <Tab active={tab === "buybacks"} onClick={() => setTab("buybacks")} testId="admin-tab-buybacks">
              <span className="inline-flex items-center gap-1.5"><Gift className="w-3 h-3" /> Buybacks
                {pendingBuybacks > 0 && <span className="ml-1 inline-block px-1.5 py-0 rounded-full bg-[#39ff14]/30 text-[#39ff14] text-[9px] font-bold">{pendingBuybacks}</span>}
              </span>
            </Tab>
            <Tab active={tab === "mining-config"} onClick={() => setTab("mining-config")} testId="admin-tab-mining-config">
              <span className="inline-flex items-center gap-1.5"><Cpu className="w-3 h-3" /> Mining Config</span>
            </Tab>
            <Tab active={tab === "drops"} onClick={() => setTab("drops")} testId="admin-tab-drops">Contributor Drops</Tab>
          </div>
        </div>

        {/* Telemetry Wall — ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.06] mb-10">
          {[
            { label: "VERIFIED_ACTIVE_NODES", val: activeDevices.length,                                          tone: "matrix", testId: "stat-active-nodes" },
            { label: "TOTAL_REGISTERED",       val: devices.length,                                                tone: "cyan",   testId: "stat-total-devices" },
            { label: "PENDING_WORKLOADS",      val: pendingJobs,                                                   tone: "amber",  testId: "stat-pending-jobs" },
            { label: "TREASURY_OWED·USDT",     val: ledger ? ledger.worker_owed_usdt.toFixed(4) : "—",
              sub: ledger?.rvn_payout_address ? "USDT BEP20 linked" : "no payout linked",                          tone: "white",  testId: "stat-real-wallet" },
          ].map((s) => (
            <div key={s.label} className="bg-black px-5 py-4" data-testid={s.testId}>
              <div className="font-mono uppercase tracking-[0.3em] text-[9px] text-white/40">{s.label}</div>
              <div className={`font-mono font-bold text-[24px] mt-1 tabular-nums ${
                s.tone === "matrix" ? "text-[#00ff88]" :
                s.tone === "cyan"   ? "text-[#00d9ff]" :
                s.tone === "amber"  ? "text-amber-300" : "text-white"
              }`}>{s.val}</div>
              {s.sub && <div className="mt-1 font-mono uppercase tracking-[0.2em] text-[9px] text-white/30">{s.sub}</div>}
            </div>
          ))}
        </div>

        {tab === "map" && (
          <div className="space-y-6">
            {/* Auto-mining + hashrate panel */}
            <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
              <div className={`rounded-3xl p-6 border transition-all ${autoMining ? "border-[#F2C94C]/40 bg-gradient-to-br from-[#F2C94C]/10 to-transparent" : "border-white/10 bg-black/40"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/40">
                    <Power className="w-3.5 h-3.5" /> Baseline Compute
                  </div>
                  <button onClick={toggleAutoMining} data-testid="auto-mining-toggle"
                    className={`w-12 h-7 rounded-full p-0.5 transition-colors ${autoMining ? "bg-[#F2C94C]" : "bg-white/15"}`}>
                    <div className={`w-6 h-6 rounded-full bg-black transition-transform ${autoMining ? "translate-x-5" : ""}`} />
                  </button>
                </div>
                <div className="mt-4">
                  <div className="font-display text-xl font-bold">{autoMining ? "ACTIVE" : "DISABLED"}</div>
                  <p className="text-xs text-white/60 mt-2 leading-relaxed">
                    When idle (no enterprise jobs queued), nodes receive verification tasks so the network is always under load and operators always earn.
                  </p>
                </div>
                <div className="mt-5 p-3 rounded-xl bg-black/40 border border-white/10">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Network Compute Rate</div>
                  <div className="text-3xl font-display font-black gold-text font-mono-num mt-1" data-testid="network-hashrate">
                    {hashrate.total_hashrate_hps >= 1000
                      ? `${(hashrate.total_hashrate_hps/1000).toFixed(2)}K`
                      : hashrate.total_hashrate_hps.toFixed(0)} <span className="text-base text-white/50">ops/s</span>
                  </div>
                </div>
              </div>

              <div className="hud-card p-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/45 flex items-center gap-2 font-mono-cyber">
                    <Zap className="w-3.5 h-3.5" style={{ color: "var(--neon-green)" }} /> Total Compute Rate · 30 min
                  </div>
                  <div className="text-[10px] tracking-widest uppercase text-white/40">{hashrate.total_tasks} tasks</div>
                </div>
                <div className="h-[180px]" data-testid="hashrate-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hashrate.series} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="hashGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00ff88" stopOpacity={0.7}/>
                          <stop offset="55%" stopColor="#00d4ff" stopOpacity={0.35}/>
                          <stop offset="100%" stopColor="#00d4ff" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(0,255,225,0.06)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#5a8e95", fontSize: 10 }} stroke="rgba(0,255,225,0.10)" interval={5} />
                      <YAxis tick={{ fill: "#5a8e95", fontSize: 10 }} stroke="rgba(0,255,225,0.10)" />
                      <Tooltip contentStyle={{ background: "#040912", border: "1px solid #00ff88", borderRadius: 10, fontSize: 12, color: "#00ff88" }} />
                      <Area type="monotone" dataKey="hashes" stroke="#00ff88" strokeWidth={2} fill="url(#hashGrad)"
                            style={{ filter: "drop-shadow(0 0 6px rgba(0,255,136,0.55))" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* WAR MAP — flat backdrop with rotating fleet dots (deterministic) */}
            <div className="hud-card p-6">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/45 flex items-center gap-2 font-mono-cyber mb-4">
                <Globe2 className="w-3.5 h-3.5 cyber-blue-text" /> grid_command_center · operations view
              </div>
              <div className="relative w-full aspect-[2/1] rounded-2xl overflow-hidden border border-[#00ffe1]/15"
                style={{ backgroundImage: `url(${DATA_BG})`, backgroundSize: "cover", backgroundPosition: "center" }}>
                <div className="absolute inset-0 bg-[#040912]/75" />
                {mapDots.map((d) => (
                  <div key={d.id}
                    className={`absolute rounded-full ${d.flagged ? "fleet-dot flagged" : d.active ? "fleet-dot mining" : "fleet-dot idle"}`}
                    style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.active ? 8 : 4, height: d.active ? 8 : 4,
                      transform: "translate(-50%,-50%)" }}
                    data-testid={`map-dot-${d.id}`} />
                ))}
                <div className="absolute bottom-5 left-5 flex gap-4 text-[10px] tracking-[0.3em] uppercase font-mono-cyber">
                  <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{background:"var(--neon-green)", boxShadow:"0 0 6px var(--neon-green)"}}/> mining</span>
                  <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-white/40"/> idle</span>
                  <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400"/> flagged</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "android" && <RealAndroidDevices />}

        {tab === "devices" && (
          <div className="rounded-3xl glass p-6 overflow-auto">
            <table className="w-full text-sm" data-testid="admin-devices-table">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.25em] text-white/40 border-b border-white/5">
                  <th className="py-3">Device</th><th>Brand</th><th>OS</th><th>Tier</th><th>Battery</th><th>Thermal</th><th>Loc</th><th>Mode</th><th>Tasks</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-3"><div className="text-white">{d.name}</div><div className="text-[10px] text-white/40 font-mono">{d.id.slice(0, 8)}</div></td>
                    <td className="text-white/80 text-xs">{d.brand || "—"}</td>
                    <td className="text-white/60 text-xs">{d.os_version || "—"}</td>
                    <td className="uppercase text-xs text-white/60">{d.model}</td>
                    <td className="text-xs"><span className="inline-flex items-center gap-1 text-white/70"><Battery className="w-3 h-3" />{d.battery || 0}%</span></td>
                    <td><ThermalBadge value={d.thermal} /></td>
                    <td className="text-xs text-white/70 font-mono uppercase">{d.country || "—"}</td>
                    <td><span className={`text-[10px] uppercase tracking-widest ${d.current_mode === "enterprise_job" ? "text-[#F2C94C]" : (d.current_mode === "baseline_compute" || d.current_mode === "baseline_mining") ? "text-white/80" : "text-white/40"}`}>{(d.current_mode || "—").replace("_", " ").replace("baseline mining", "baseline compute")}</span></td>
                    <td className="font-mono-num">{d.tasks_completed || 0}</td>
                    <td><span className={`text-[10px] uppercase tracking-widest ${d.status === "active" ? "text-[#F2C94C]" : "text-white/50"}`}>{d.status}</span></td>
                    <td>
                      {d.flagged
                        ? <button onClick={() => unflag(d.id)} data-testid={`unflag-${d.id}`} className="text-[10px] px-3 py-1.5 rounded-full border gold-border text-[#F2C94C]">UNFLAG</button>
                        : <button onClick={() => flag(d.id)} data-testid={`flag-${d.id}`} className="text-[10px] px-3 py-1.5 rounded-full border border-red-400/30 text-red-400">FLAG</button>}
                    </td>
                  </tr>
                ))}
                {devices.length === 0 && <tr><td colSpan={11} className="text-center py-10 text-white/40">No devices registered.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "jobs" && (
          <div className="rounded-3xl glass p-6">
            <div className="space-y-4" data-testid="admin-jobs-list">
              {jobs.length === 0 && <div className="text-center py-12 text-white/40 text-sm">No customer workloads yet.</div>}
              {jobs.map((j) => {
                const pct = Math.min(100, Math.round((j.processed_units / Math.max(1, j.total_units)) * 100));
                return (
                  <div key={j.id} className="p-5 rounded-2xl bg-black/40 border border-white/10" data-testid={`admin-job-${j.id}`}>
                    <div className="flex flex-wrap justify-between gap-3">
                      <div className="flex-1 min-w-[260px]">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Briefcase className="w-4 h-4 text-[#F2C94C]" />
                          <div className="font-display font-bold text-base">{j.name}</div>
                          <JobStatus status={j.status} />
                          <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                            j.priority === "instant" ? "border-[#F2C94C]/60 text-[#F2C94C]" :
                            j.priority === "economy" ? "border-white/20 text-white/50" :
                            "border-white/30 text-white/70"
                          }`}>{j.priority || "standard"}</span>
                        </div>
                        <div className="mt-1 text-xs text-white/50 flex items-center gap-2 flex-wrap">
                          <FileText className="w-3 h-3" /> {j.file_name} · {(j.file_size/1024).toFixed(1)} KB
                          <span>·</span><span>{j.customer_name || j.customer_email}</span>
                          <span>·</span><span className="uppercase tracking-widest text-[10px]">{(j.workload_type || "mixed").replace("_"," ")}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Budget</div>
                        <div className="font-mono-num text-[#F2C94C] text-lg">{j.budget_usdt.toFixed(2)}</div>
                        <div className="text-[10px] text-white/40">spent {j.spent_usdt?.toFixed(4) || "0.0000"}</div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="flex justify-between text-[10px] uppercase tracking-[0.25em] text-white/40 mb-1">
                        <span>Progress</span><span className="text-[#F2C94C]">{j.processed_units}/{j.total_units} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {j.status === "pending" && (
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => approveJob(j.id)} data-testid={`job-approve-${j.id}`}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-xs">
                          <Check className="w-3.5 h-3.5" /> Approve & Dispatch
                        </button>
                        <button onClick={() => rejectJob(j.id)} data-testid={`job-reject-${j.id}`}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-red-400/30 text-red-400 text-xs">
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "ledger" && ledger && (
          <div className="space-y-6">
            {/* v1.6.2 — Public TGC Ledger Health (real aggregations) */}
            <div className="rounded-3xl glass-strong p-8 border border-[#00ff88]/[0.18]" data-testid="admin-ledger-health">
              <div className="font-mono uppercase tracking-[0.3em] text-[10px] text-[#00ff88]/85 mb-3">
                // tgc_ledger_health · network_wide_aggregations
              </div>
              <TotalTgcCounter
                variant="mega"
                value={ledgerTotals?.total_tgc_issued || 0}
                subValues={{
                  circulating: ledgerTotals?.circulating_tgc || 0,
                  burned:      ledgerTotals?.total_tgc_burned || 0,
                }}
                tone="matrix"
                testId="admin-total-tgc-counter"
              />
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.06]">
                {[
                  ["compute_drip",         ledgerTotals?.total_compute_tgc,           "matrix"],
                  ["daily_calibration",    ledgerTotals?.total_daily_calibration_tgc, "cyan"],
                  ["contributor_drops",    ledgerTotals?.total_drop_tgc,              "violet"],
                  ["buyback_burned",       ledgerTotals?.total_buyback_burned_tgc,    "amber"],
                ].map(([k, v, tone]) => {
                  const color = tone === "matrix" ? "#00ff88" : tone === "cyan" ? "#00d9ff" : tone === "violet" ? "#6c7bff" : "#fbbf24";
                  return (
                    <div key={k} className="bg-black px-4 py-3.5">
                      <div className="font-mono uppercase tracking-[0.25em] text-[9px] text-white/40">{k}</div>
                      <div className="font-mono font-bold text-[15px] mt-1 tabular-nums" style={{ color }}>
                        {Number(v || 0).toFixed(5)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-3xl glass-strong p-8 relative overflow-hidden">
              <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-[#D4AF37]/15 blur-3xl" />
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 relative">Customer Revenue</div>
              <div className="mt-3 text-5xl font-display font-black gold-text font-mono-num relative" data-testid="ledger-revenue">{ledger.revenue_usdt.toFixed(4)}</div>
              <div className="text-sm text-white/50 mt-1">USDT — collected from approved workloads</div>

              <div className="mt-8 grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Platform Margin</div>
                  <div className="mt-2 text-xl font-mono-num text-[#F2C94C]" data-testid="ledger-margin">{ledger.platform_margin_usdt.toFixed(4)}</div>
                </div>
                <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Pending Withdrawals</div>
                  <div className="mt-2 text-xl font-mono-num text-white">{ledger.pending_withdrawals_usdt.toFixed(4)}</div>
                </div>
              </div>
            </div>
            <div className="rounded-3xl glass p-8">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Worker Payouts</div>
              <div className="mt-3 text-5xl font-display font-black text-white font-mono-num" data-testid="ledger-owed">{ledger.worker_owed_usdt.toFixed(4)}</div>
              <div className="text-sm text-white/50 mt-1">USDT — currently owed to operators</div>

              <div className="mt-8 grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Total Earned (lifetime)</div>
                  <div className="mt-2 text-xl font-mono-num text-white">{ledger.worker_total_earned_usdt.toFixed(4)}</div>
                </div>
                <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Paid Out</div>
                  <div className="mt-2 text-xl font-mono-num text-green-400">{ledger.worker_paid_usdt.toFixed(4)}</div>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}

        {tab === "payouts" && (
          <div className="rounded-3xl glass p-6 overflow-auto">
            <table className="w-full text-sm" data-testid="admin-payouts-table">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.25em] text-white/40 border-b border-white/5">
                  <th className="py-3">ID</th><th>User</th><th>Amount</th><th>Address</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {payouts.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-white/40">No payouts yet.</td></tr>}
                {payouts.map((p) => (
                  <tr key={p.id} className="border-b border-white/5">
                    <td className="py-3 font-mono text-xs text-white/60">{p.id.slice(0, 8)}</td>
                    <td className="text-xs text-white/60">{p.user_id.slice(0, 8)}</td>
                    <td className="font-mono-num text-[#F2C94C]">{p.amount_usdt.toFixed(4)}</td>
                    <td className="font-mono text-xs text-white/50">{p.address}</td>
                    <td><span className={`text-[10px] uppercase tracking-widest ${p.status === "completed" ? "text-[#F2C94C]" : "text-white/60"}`}>{p.status}</span></td>
                    <td>{p.status !== "completed" && <button onClick={() => approve(p.id)} data-testid={`approve-${p.id}`} className="text-[10px] px-3 py-1.5 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold">APPROVE</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "fraud" && (
          <div className="rounded-3xl glass p-8">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-6 h-6 text-[#F2C94C]" />
              <div>
                <div className="font-display text-xl font-bold">Fraud Shield</div>
                <div className="text-sm text-white/50">Auto-flags devices posting impossible compute times or rejected results.</div>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-black/40 border border-white/10">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Flagged Devices</div>
                <div className="mt-2 text-4xl font-display font-black gold-text font-mono-num">{fraud.flagged_devices.length}</div>
              </div>
              <div className="p-5 rounded-2xl bg-black/40 border border-white/10">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Rejected Tasks</div>
                <div className="mt-2 text-4xl font-display font-black gold-text font-mono-num">{fraud.rejected_tasks}</div>
              </div>
            </div>
            <div className="mt-6 space-y-2" data-testid="fraud-list">
              {fraud.flagged_devices.length === 0 && <div className="text-sm text-white/40 py-8 text-center">No flagged devices — network clean.</div>}
              {fraud.flagged_devices.map((d) => (
                <div key={d.id} className="flex justify-between items-center p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                  <div>
                    <div className="text-white">{d.name}</div>
                    <div className="text-[10px] text-white/40 font-mono">{d.id}</div>
                  </div>
                  <button onClick={() => unflag(d.id)} data-testid={`fraud-unflag-${d.id}`}
                    className="text-[10px] tracking-widest uppercase px-4 py-2 rounded-full border gold-border text-[#F2C94C]">UNFLAG</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "users" && (
          <div className="rounded-3xl glass p-6 overflow-auto">
            <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
              <div className="font-mono uppercase tracking-[0.3em] text-[10px] text-white/45 flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-[#00ff88]" /> contributor_ledger · {users.length} accounts
              </div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-mono">
                {users.filter(u => u.is_banned).length} suspended
              </div>
            </div>
            <table className="w-full text-sm min-w-[820px]" data-testid="admin-users-table">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.25em] text-white/40 border-b border-white/5">
                  <th className="py-3">Name</th><th>Email</th><th>Role</th>
                  <th className="text-right">TGC Balance</th>
                  <th className="text-right">USDT Balance</th>
                  <th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={`border-b border-white/5 ${u.is_banned ? "bg-red-500/[0.04]" : ""}`} data-testid={`admin-user-row-${u.id}`}>
                    <td className="py-3">
                      <div className="text-white">{u.name}</div>
                      {u.company ? <span className="text-white/40 text-[10px] block">{u.company}</span> : null}
                    </td>
                    <td className="text-white/60 text-xs font-mono">{u.email}</td>
                    <td>
                      <span className={`text-[10px] uppercase tracking-widest ${u.role === "admin" ? "text-[#F2C94C]" : u.role === "customer" ? "text-purple-300" : "text-white/60"}`}>{u.role || "user"}</span>
                    </td>
                    <td className="text-right font-mono-num text-[#00ff88]" data-testid={`user-tgc-${u.id}`}>{(u.tgc_balance || 0).toFixed(4)}</td>
                    <td className="text-right font-mono-num text-white/80">{(u.balance_usdt || 0).toFixed(4)}</td>
                    <td>
                      {u.is_banned
                        ? <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-red-400/40 text-red-400 inline-flex items-center gap-1"><Ban className="w-3 h-3" /> suspended</span>
                        : <span className="text-[10px] uppercase tracking-widest text-[#00ff88]">active</span>}
                    </td>
                    <td className="text-right">
                      {u.role === "admin" ? (
                        <span className="text-[10px] uppercase tracking-widest text-white/30">—</span>
                      ) : u.is_banned ? (
                        <button onClick={() => unbanUser(u.id)} data-testid={`unban-${u.id}`}
                          className="inline-flex items-center gap-1.5 text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full border border-[#00ff88]/40 text-[#00ff88] hover:bg-[#00ff88]/10 transition">
                          <RotateCcw className="w-3 h-3" /> reinstate
                        </button>
                      ) : (
                        <button onClick={() => banUser(u.id, u.email)} data-testid={`ban-${u.id}`}
                          className="inline-flex items-center gap-1.5 text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full border border-red-400/40 text-red-400 hover:bg-red-400/10 transition">
                          <Ban className="w-3 h-3" /> suspend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-white/40">No contributors registered.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "mining-config" && <AdminMiningConfig />}

        {tab === "buybacks" && (
          <div className="rounded-3xl glass p-6">
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <Gift className="w-6 h-6 text-[#00ff88]" />
              <div className="flex-1 min-w-[240px]">
                <div className="font-display text-xl font-bold">Foundation · Buyback Approvals</div>
                <div className="text-sm text-white/50">Approving an application <span className="text-red-400">permanently burns</span> the contributor's eligibility TGC. Settlement is off-platform.</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Pending</div>
                <div className="text-2xl font-mono-num text-[#00ff88]" data-testid="buyback-pending-count">{pendingBuybacks}</div>
              </div>
            </div>
            <div className="space-y-3" data-testid="admin-buyback-list">
              {buybacks.length === 0 && <div className="text-center py-12 text-white/40 text-sm">No buyback applications yet.</div>}
              {buybacks.map((b) => {
                const isPending = b.status === "pending" || b.status === "reviewing";
                const statusColor = b.status === "approved" ? "text-[#00ff88] border-[#00ff88]/40"
                  : b.status === "rejected" ? "text-red-400 border-red-400/40"
                  : "text-yellow-300 border-yellow-300/40";
                return (
                  <div key={b.id} className="p-5 rounded-2xl bg-black/40 border border-white/10" data-testid={`buyback-${b.id}`}>
                    <div className="flex flex-wrap justify-between gap-3">
                      <div className="flex-1 min-w-[260px]">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="font-display font-bold text-base text-white">{b.user_email || b.user_id?.slice(0, 8)}</div>
                          <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${statusColor}`}>{b.status}</span>
                          <span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">{b.window_label}</span>
                        </div>
                        <div className="mt-1 text-xs text-white/50 flex items-center gap-3 flex-wrap font-mono">
                          <span>{b.payout_network || "—"}</span>
                          <span className="text-white/30">·</span>
                          <span className="text-white/40 truncate max-w-[280px]">{b.payout_wallet || "no wallet"}</span>
                          {b.notes ? <><span className="text-white/30">·</span><span className="italic">"{b.notes}"</span></> : null}
                        </div>
                        <div className="mt-1 text-[10px] text-white/35 font-mono">
                          submitted {b.created_at?.slice(0, 19).replace("T", " ")}
                          {b.approved_at ? ` · approved ${b.approved_at.slice(0, 19).replace("T", " ")}` : ""}
                          {b.rejected_at ? ` · rejected ${b.rejected_at.slice(0, 19).replace("T", " ")}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">TGC at apply</div>
                        <div className="font-mono-num text-[#00ff88] text-lg">{Number(b.tgc_balance_at_apply || 0).toFixed(2)}</div>
                        <div className="text-[10px] text-white/40">burn on approve: <span className="text-red-300">−{Number(b.target_tgc || 0).toFixed(0)} TGC</span></div>
                        {b.burned_tgc ? <div className="text-[10px] text-red-300 mt-1">burned: {Number(b.burned_tgc).toFixed(2)} TGC</div> : null}
                      </div>
                    </div>
                    {isPending && (
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => approveBuyback(b.id, b.target_tgc)} data-testid={`buyback-approve-${b.id}`}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d9ff] text-black font-semibold text-xs">
                          <Check className="w-3.5 h-3.5" /> Approve &amp; Burn TGC
                        </button>
                        <button onClick={() => rejectBuyback(b.id)} data-testid={`buyback-reject-${b.id}`}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-red-400/30 text-red-400 text-xs hover:bg-red-400/10">
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "drops" && <ContributorDropsTab />}

        {msg && <div className="mt-4 text-xs text-red-400 font-mono-cyber">{msg}</div>}

        {/* v1.3.6: Live Operator Console — visible across every admin tab */}
        {/* v1.3.9: HonorPodium pinned next to console (investor demo mode) */}
        <div className="mt-10 grid lg:grid-cols-[2fr_1fr] gap-4">
          <LiveOperatorConsole height={300} />
          <HonorPodium height={300} />
        </div>
      </div>
    </div>
    </BootSequence>
  );
}
