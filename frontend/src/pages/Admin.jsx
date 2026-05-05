import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Shield, AlertTriangle, CheckCircle2, CircleDollarSign, Radio, Globe2, Users, Briefcase, FileText, Cpu, Thermometer, Battery, Wifi, BatteryCharging, X, Check, Zap, Power } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Area, AreaChart } from "recharts";

const DATA_BG = "https://static.prod-images.emergentagent.com/jobs/99f915a9-0229-4059-88a8-b7701782fb0c/images/afc45ee0b1fdae2ca04542c03ce5be366b443995c096e2a8e9ea99bd842fd4ad.png";

function Tab({ active, onClick, children, testId }) {
  return (
    <button onClick={onClick} data-testid={testId}
      className={`px-5 py-2.5 text-xs tracking-[0.25em] uppercase rounded-full transition-all ${
        active ? "bg-[#F2C94C] text-black" : "text-white/60 hover:text-white border border-white/10"
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
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const [d, u, p, f, s, j, l, am, hr] = await Promise.all([
        api.get("/admin/devices"), api.get("/admin/users"), api.get("/admin/payouts"),
        api.get("/admin/fraud"), api.get("/stats/network"),
        api.get("/admin/jobs"), api.get("/admin/ledger"),
        api.get("/admin/auto-mining"), api.get("/admin/hashrate"),
      ]);
      setDevices(d.data); setUsers(u.data); setPayouts(p.data); setFraud(f.data);
      setStats(s.data); setJobs(j.data); setLedger(l.data);
      setAutoMining(am.data.enabled); setHashrate(hr.data);
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

  // Map dots — deterministic pseudo locations based on device id
  const mapDots = useMemo(() => {
    return devices.map((d) => {
      let h = 0;
      for (let i = 0; i < d.id.length; i++) h = (h * 31 + d.id.charCodeAt(i)) >>> 0;
      return { id: d.id, x: 4 + (h % 92), y: 10 + ((h >> 8) % 72), active: d.status === "active", flagged: !!d.flagged };
    });
  }, [devices]);

  const pendingJobs = jobs.filter(j => j.status === "pending").length;

  return (
    <div className="min-h-[calc(100vh-4rem)] grid-bg">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-10">
        <div className="mb-10 flex justify-between flex-wrap items-end gap-4">
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-[#F2C94C]">/ command center</div>
            <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mt-2">
              Global <span className="gold-text">War Map</span>
            </h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Tab active={tab === "map"} onClick={() => setTab("map")} testId="admin-tab-map">War Map</Tab>
            <Tab active={tab === "devices"} onClick={() => setTab("devices")} testId="admin-tab-devices">Device Health</Tab>
            <Tab active={tab === "jobs"} onClick={() => setTab("jobs")} testId="admin-tab-jobs">
              Jobs {pendingJobs > 0 && <span className="ml-1 inline-block px-1.5 py-0 rounded-full bg-yellow-300/30 text-yellow-200 text-[9px]">{pendingJobs}</span>}
            </Tab>
            <Tab active={tab === "ledger"} onClick={() => setTab("ledger")} testId="admin-tab-ledger">Ledger</Tab>
            <Tab active={tab === "payouts"} onClick={() => setTab("payouts")} testId="admin-tab-payouts">Payouts</Tab>
            <Tab active={tab === "fraud"} onClick={() => setTab("fraud")} testId="admin-tab-fraud">Fraud Shield</Tab>
            <Tab active={tab === "users"} onClick={() => setTab("users")} testId="admin-tab-users">Users</Tab>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Active Nodes", val: activeDevices.length, icon: Radio },
            { label: "Total Devices", val: devices.length, icon: Globe2 },
            { label: "Pending Jobs", val: pendingJobs, icon: Briefcase },
            { label: "Revenue USDT", val: ledger ? ledger.revenue_usdt.toFixed(4) : "—", icon: CircleDollarSign },
          ].map((s) => (
            <div key={s.label} className="p-6 rounded-2xl glass">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{s.label}</div>
                <s.icon className="w-4 h-4 text-[#F2C94C]" />
              </div>
              <div className="mt-3 text-3xl font-display font-black gold-text font-mono-num">{s.val}</div>
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
                    <Power className="w-3.5 h-3.5" /> Baseline Mining
                  </div>
                  <button onClick={toggleAutoMining} data-testid="auto-mining-toggle"
                    className={`w-12 h-7 rounded-full p-0.5 transition-colors ${autoMining ? "bg-[#F2C94C]" : "bg-white/15"}`}>
                    <div className={`w-6 h-6 rounded-full bg-black transition-transform ${autoMining ? "translate-x-5" : ""}`} />
                  </button>
                </div>
                <div className="mt-4">
                  <div className="font-display text-xl font-bold">{autoMining ? "ACTIVE" : "DISABLED"}</div>
                  <p className="text-xs text-white/60 mt-2 leading-relaxed">
                    When idle (no enterprise jobs queued), nodes receive SHA-256 PoW tasks so the network is always under load and operators always earn.
                  </p>
                </div>
                <div className="mt-5 p-3 rounded-xl bg-black/40 border border-white/10">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Network Hashrate</div>
                  <div className="text-3xl font-display font-black gold-text font-mono-num mt-1" data-testid="network-hashrate">
                    {hashrate.total_hashrate_hps >= 1000
                      ? `${(hashrate.total_hashrate_hps/1000).toFixed(2)}K`
                      : hashrate.total_hashrate_hps.toFixed(0)} <span className="text-base text-white/50">H/s</span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl glass p-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-[#F2C94C]" /> Total Network Hashrate · 30 min
                  </div>
                  <div className="text-[10px] tracking-widest uppercase text-white/40">{hashrate.total_tasks} tasks</div>
                </div>
                <div className="h-[180px]" data-testid="hashrate-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hashrate.series} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="hashGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#F2C94C" stopOpacity={0.55}/>
                          <stop offset="100%" stopColor="#F2C94C" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#666", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" interval={5} />
                      <YAxis tick={{ fill: "#666", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
                      <Tooltip contentStyle={{ background: "#0A0A0A", border: "1px solid #D4AF37", borderRadius: 8, fontSize: 12 }} />
                      <Area type="monotone" dataKey="hashes" stroke="#F2C94C" strokeWidth={2} fill="url(#hashGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="rounded-3xl glass p-6">
              <div className="relative w-full aspect-[2/1] rounded-2xl overflow-hidden border border-white/10"
                style={{ backgroundImage: `url(${DATA_BG})`, backgroundSize: "cover", backgroundPosition: "center" }}>
                <div className="absolute inset-0 bg-black/60" />
                {mapDots.map((d) => (
                  <div key={d.id}
                    className={`absolute rounded-full ${d.flagged ? "bg-red-400" : d.active ? "bg-[#F2C94C] dot-pulse" : "bg-white/40"}`}
                    style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.active ? 8 : 4, height: d.active ? 8 : 4,
                      transform: "translate(-50%,-50%)",
                      boxShadow: d.active ? "0 0 18px rgba(242,201,76,0.9)" : d.flagged ? "0 0 12px rgba(239,68,68,0.8)" : "none" }}
                    data-testid={`map-dot-${d.id}`} />
                ))}
                <div className="absolute bottom-5 left-5 flex gap-4 text-[10px] tracking-[0.3em] uppercase">
                  <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#F2C94C]" /> Active</span>
                  <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-white/40" /> Idle</span>
                  <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400" /> Flagged</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "devices" && (
          <div className="rounded-3xl glass p-6 overflow-auto">
            <table className="w-full text-sm" data-testid="admin-devices-table">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.25em] text-white/40 border-b border-white/5">
                  <th className="py-3">Device</th><th>Brand</th><th>OS</th><th>Tier</th><th>Battery</th><th>Thermal</th><th>Tasks</th><th>Status</th><th>Last Seen</th><th></th>
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
                    <td className="font-mono-num">{d.tasks_completed || 0}</td>
                    <td><span className={`text-[10px] uppercase tracking-widest ${d.status === "active" ? "text-[#F2C94C]" : "text-white/50"}`}>{d.status}</span></td>
                    <td className="text-[10px] text-white/50">{new Date(d.last_heartbeat).toLocaleTimeString()}</td>
                    <td>
                      {d.flagged
                        ? <button onClick={() => unflag(d.id)} data-testid={`unflag-${d.id}`} className="text-[10px] px-3 py-1.5 rounded-full border gold-border text-[#F2C94C]">UNFLAG</button>
                        : <button onClick={() => flag(d.id)} data-testid={`flag-${d.id}`} className="text-[10px] px-3 py-1.5 rounded-full border border-red-400/30 text-red-400">FLAG</button>}
                    </td>
                  </tr>
                ))}
                {devices.length === 0 && <tr><td colSpan={10} className="text-center py-10 text-white/40">No devices registered.</td></tr>}
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
            <table className="w-full text-sm" data-testid="admin-users-table">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.25em] text-white/40 border-b border-white/5">
                  <th className="py-3">Name</th><th>Email</th><th>Role</th><th>Balance</th><th>Total Earned</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/5">
                    <td className="py-3">{u.name}{u.company ? <span className="text-white/40 text-[10px] block">{u.company}</span> : null}</td>
                    <td className="text-white/60 text-xs">{u.email}</td>
                    <td><span className={`text-[10px] uppercase tracking-widest ${u.role === "admin" ? "text-[#F2C94C]" : u.role === "customer" ? "text-purple-300" : "text-white/60"}`}>{u.role}</span></td>
                    <td className="font-mono-num">{(u.balance_usdt || 0).toFixed(4)}</td>
                    <td className="font-mono-num">{(u.total_earned || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {msg && <div className="mt-4 text-xs text-red-400">{msg}</div>}
      </div>
    </div>
  );
}
