import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Shield, AlertTriangle, CheckCircle2, CircleDollarSign, Radio, Globe2, Users } from "lucide-react";

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

export default function Admin() {
  const [tab, setTab] = useState("map");
  const [devices, setDevices] = useState([]);
  const [users, setUsers] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [fraud, setFraud] = useState({ flagged_devices: [], rejected_tasks: 0 });
  const [stats, setStats] = useState({});
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const [d, u, p, f, s] = await Promise.all([
        api.get("/admin/devices"), api.get("/admin/users"), api.get("/admin/payouts"),
        api.get("/admin/fraud"), api.get("/stats/network"),
      ]);
      setDevices(d.data); setUsers(u.data); setPayouts(p.data); setFraud(f.data); setStats(s.data);
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

  // Map dots — deterministic pseudo locations based on device id
  const mapDots = useMemo(() => {
    return devices.map((d) => {
      let h = 0;
      for (let i = 0; i < d.id.length; i++) h = (h * 31 + d.id.charCodeAt(i)) >>> 0;
      return { id: d.id, x: 4 + (h % 92), y: 10 + ((h >> 8) % 72), active: d.status === "active", flagged: !!d.flagged };
    });
  }, [devices]);

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
            { label: "Users", val: stats.total_users || users.length, icon: Users },
            { label: "Rejected Tasks", val: fraud.rejected_tasks, icon: AlertTriangle },
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

            <div className="mt-8 overflow-auto max-h-[360px]">
              <table className="w-full text-sm" data-testid="admin-devices-table">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.25em] text-white/40 border-b border-white/5">
                    <th className="py-3">Device</th><th>Model</th><th>Status</th><th>Tasks</th><th>Last Seen</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-3"><div className="text-white">{d.name}</div><div className="text-[10px] text-white/40 font-mono">{d.id.slice(0, 8)}</div></td>
                      <td className="uppercase text-xs text-white/60">{d.model}</td>
                      <td><span className={`text-[10px] uppercase tracking-widest ${d.status === "active" ? "text-[#F2C94C]" : "text-white/50"}`}>{d.status}</span></td>
                      <td className="font-mono-num">{d.tasks_completed || 0}</td>
                      <td className="text-xs text-white/50">{new Date(d.last_heartbeat).toLocaleTimeString()}</td>
                      <td>
                        {d.flagged
                          ? <button onClick={() => unflag(d.id)} data-testid={`unflag-${d.id}`} className="text-[10px] px-3 py-1.5 rounded-full border gold-border text-[#F2C94C]">UNFLAG</button>
                          : <button onClick={() => flag(d.id)} data-testid={`flag-${d.id}`} className="text-[10px] px-3 py-1.5 rounded-full border border-red-400/30 text-red-400">FLAG</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "payouts" && (
          <div className="rounded-3xl glass p-6">
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
          <div className="rounded-3xl glass p-6">
            <table className="w-full text-sm" data-testid="admin-users-table">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.25em] text-white/40 border-b border-white/5">
                  <th className="py-3">Name</th><th>Email</th><th>Role</th><th>Balance</th><th>Total Earned</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/5">
                    <td className="py-3">{u.name}</td>
                    <td className="text-white/60 text-xs">{u.email}</td>
                    <td><span className={`text-[10px] uppercase tracking-widest ${u.role === "admin" ? "text-[#F2C94C]" : "text-white/60"}`}>{u.role}</span></td>
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
