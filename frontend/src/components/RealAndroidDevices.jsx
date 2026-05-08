import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Smartphone, Wifi, BatteryCharging, Thermometer, ShieldAlert, RefreshCw, Filter, Trash2, Link2, Unlink } from "lucide-react";
import ApkQrCard from "./ApkQrCard";
import PoolStatusPanel from "./PoolStatusPanel";
import FirstRealWorkerCard from "./FirstRealWorkerCard";

function relSec(s) {
  if (s == null) return "—";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

function StateBadge({ state, online }) {
  const isActive = state === "active" && online;
  const cls = isActive
    ? "bg-[#F2C94C]/15 border-[#F2C94C]/40 text-[#F2C94C]"
    : state === "paused"
    ? "bg-amber-500/10 border-amber-400/30 text-amber-300"
    : online
    ? "bg-white/5 border-white/15 text-white/60"
    : "bg-white/[0.02] border-white/10 text-white/30";
  const label = !online ? "OFFLINE" : (state || "idle").toUpperCase();
  return (
    <span className={`text-[9px] tracking-widest uppercase font-semibold px-2 py-1 rounded-full border ${cls}`}>
      {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#F2C94C] mr-1.5 dot-pulse align-middle" />}
      {label}
    </span>
  );
}

function StratumBadge({ linked }) {
  if (linked) {
    return (
      <span data-testid="pool-active-badge"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] tracking-widest uppercase font-semibold border border-emerald-400/50 text-emerald-300 bg-emerald-400/10 shadow-[0_0_12px_rgba(52,211,153,0.35)]">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dot-pulse" />
        POOL ACTIVE
      </span>
    );
  }
  return (
    <span data-testid="stratum-local-only-badge"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] tracking-widest uppercase font-semibold border border-white/15 text-white/45">
      <Unlink className="w-2.5 h-2.5" />
      LOCAL ONLY
    </span>
  );
}

export default function RealAndroidDevices() {
  const [data, setData] = useState({ devices: [], counters: {} });
  const [tel, setTel] = useState(null);
  const [filter, setFilter] = useState({ state: "all", real_only: true, show_demo: false, app_version: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true); setErr("");
    try {
      const params = new URLSearchParams();
      if (filter.state && filter.state !== "all") params.set("state", filter.state);
      if (filter.real_only) params.set("real_only", "true");
      if (filter.show_demo) params.set("show_demo", "true");
      if (filter.app_version) params.set("app_version", filter.app_version);
      const [d, t] = await Promise.all([
        api.get(`/admin/devices/live?${params.toString()}`),
        api.get(`/admin/telemetry${filter.show_demo ? "?show_demo=true" : ""}`),
      ]);
      setData(d.data); setTel(t.data);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    load();
    let cancelled = false;
    const tick = () => { if (cancelled) return; if (typeof document === "undefined" || !document.hidden) load(); };
    const t = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line
  }, [filter.state, filter.real_only, filter.show_demo, filter.app_version]);

  const c = data.counters || {};
  const stats = [
    { label: "Real Android · Total", val: tel?.real_android_total ?? c.real_android ?? 0 },
    { label: "Real Android · Online", val: tel?.real_android_online ?? c.online ?? 0, accent: true },
    { label: "Pool Active", val: tel?.stratum_linked_online ?? c.stratum_linked ?? 0, accent: true, testId: "stat-stratum-linked" },
    { label: "Local Only", val: tel?.local_only_online ?? c.local_only ?? 0, testId: "stat-local-only" },
  ];

  const wipeDemo = async () => {
    if (!window.confirm("Wipe ALL demo/seeded devices? Real physical devices are NOT touched. This cannot be undone.")) return;
    try {
      const { data: r } = await api.post("/admin/devices/wipe-demo");
      alert(`${r.deleted} demo device(s) deleted.`);
      load();
    } catch (e) { setErr(formatApiError(e)); }
  };

  const totalPurge = async () => {
    if (!window.confirm(
      "TOTAL PURGE — wipe every demo, seeded, and outdated device. " +
      "Devices with stratum_first_linked_at OR app_version >= 1.2.5 SURVIVE. " +
      "This cannot be undone. Proceed?"
    )) return;
    try {
      const { data: r } = await api.post("/admin/devices/wipe-all-fake");
      alert(`Total Purge complete · ${r.deleted} device(s) deleted.`);
      load();
    } catch (e) { setErr(formatApiError(e)); }
  };

  const assignClass = async (deviceId, coin) => {
    try {
      await api.post(`/admin/devices/${deviceId}/assign-class`, { coin });
      load();
    } catch (e) { alert(formatApiError(e)); }
  };

  return (
    <div className="space-y-6" data-testid="real-android-section">
      {/* "First Real Worker" — historic milestone card. Awaiting state by default;
          flips to celebratory state the moment the first physical device achieves
          a real Binance Pool stratum link. */}
      <FirstRealWorkerCard />

      {/* Live Binance Pool status — honest connection state, never fakes */}
      <PoolStatusPanel />

      {/* Hardware-farm deployment QR */}
      <ApkQrCard size={170} testId="admin-apk-qr" />

      {/* Header + counters */}
      <div className="grid md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} data-testid={s.testId}
            className={`p-5 rounded-2xl border ${s.danger ? "border-red-400/30 bg-red-500/5" : s.accent ? "border-[#F2C94C]/30 bg-gradient-to-br from-[#F2C94C]/10 to-transparent" : "border-white/10 bg-black/30"}`}>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{s.label}</div>
            <div className={`mt-2 text-3xl font-display font-black font-mono-num ${s.danger ? "text-red-300" : "gold-text"}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl glass" data-testid="android-filters">
        <span className="text-[10px] uppercase tracking-[0.25em] text-white/40 inline-flex items-center gap-1.5">
          <Filter className="w-3 h-3" /> Filter
        </span>
        {["all", "active", "offline", "flagged"].map((s) => (
          <button key={s} onClick={() => setFilter((f) => ({ ...f, state: s }))}
            data-testid={`android-filter-${s}`}
            className={`px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest border transition-colors ${
              filter.state === s
                ? "border-[#F2C94C] text-[#F2C94C] bg-[#F2C94C]/10"
                : "border-white/10 text-white/60 hover:border-white/30"
            }`}>
            {s}
          </button>
        ))}
        <label className="ml-2 inline-flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/60 cursor-pointer">
          <input type="checkbox" checked={filter.real_only}
            onChange={(e) => setFilter((f) => ({ ...f, real_only: e.target.checked }))}
            data-testid="android-real-only"
            className="accent-[#F2C94C]" />
          Real APK only
        </label>
        <label className="ml-2 inline-flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/60 cursor-pointer">
          <input type="checkbox" checked={filter.show_demo}
            onChange={(e) => setFilter((f) => ({ ...f, show_demo: e.target.checked }))}
            data-testid="android-show-demo"
            className="accent-[#F2C94C]" />
          Show demo / seeded
        </label>
        <input type="text" placeholder="App version filter (e.g. 1.2.0)"
          value={filter.app_version}
          onChange={(e) => setFilter((f) => ({ ...f, app_version: e.target.value }))}
          data-testid="android-app-version-filter"
          className="ml-2 bg-black/40 border border-white/10 rounded-full px-3 py-1.5 text-[11px] focus:border-[#D4AF37] focus:outline-none w-48" />
        <button onClick={load} disabled={busy} data-testid="android-refresh-btn"
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 text-white/70 text-[10px] uppercase tracking-widest hover:border-[#D4AF37]">
          <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} /> Refresh
        </button>
        <button onClick={wipeDemo} data-testid="wipe-demo-btn"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-400/30 text-amber-300/80 text-[10px] uppercase tracking-widest hover:border-amber-400 hover:text-amber-300 hover:bg-amber-500/5">
          <Trash2 className="w-3 h-3" /> Wipe Demo
        </button>
        <button onClick={totalPurge} data-testid="total-purge-btn"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-red-500/40 text-red-300 text-[10px] uppercase tracking-widest hover:border-red-400 hover:bg-red-500/10 font-bold">
          <Trash2 className="w-3 h-3" /> Total Purge
        </button>
      </div>

      {err && <div className="text-xs text-red-400" data-testid="android-error">{err}</div>}

      {/* Table */}
      <div className="rounded-3xl glass p-4 overflow-auto" data-testid="android-table-wrap">
        <table className="w-full text-sm" data-testid="android-devices-table">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.25em] text-white/40 border-b border-white/5">
              <th className="py-3 pl-2">ID · User</th>
              <th>Model</th>
              <th>App ver</th>
              <th>Android</th>
              <th>State</th>
              <th>Stratum</th>
              <th>Class</th>
              <th>Tasks · TGC</th>
              <th>Battery</th>
              <th>Temp</th>
              <th>Conn</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {(data.devices || []).length === 0 && (
              <tr><td colSpan={12} className="text-center py-10 text-white/40">No physical devices yet · awaiting installer.</td></tr>
            )}
            {(data.devices || []).map((d) => (
              <tr key={d.id} className={`border-b border-white/5 ${d.flagged ? "bg-red-500/5" : ""}`} data-testid={`android-row-${d.id_short}`}>
                <td className="py-3 pl-2">
                  <div className="font-mono text-[11px] text-white/70">{d.id_short}</div>
                  <div className="text-[10px] text-white/50 truncate max-w-[180px]">{d.user_email || "—"}</div>
                </td>
                <td>
                  <div className="text-white text-xs flex items-center gap-1.5"><Smartphone className="w-3 h-3 text-white/40" /> {d.manufacturer || d.brand || "—"}</div>
                  <div className="text-[10px] uppercase tracking-widest text-white/40">{d.tier || d.model}</div>
                </td>
                <td className="text-[11px] font-mono text-white/70">{d.app_version || "—"}</td>
                <td className="text-[11px] text-white/60">{d.android_version || d.os_version || "—"}</td>
                <td><StateBadge state={d.worker_state} online={d.online} /></td>
                <td><StratumBadge linked={d.stratum_linked} /></td>
                <td>
                  <select
                    data-testid={`assign-class-${d.id_short}`}
                    value={d.assigned_coin || "AUTO"}
                    onChange={(e) => assignClass(d.id, e.target.value)}
                    className="bg-black/40 border border-white/10 hover:border-[#F2C94C]/40 text-[10px] uppercase tracking-widest text-white/80 px-2 py-1 rounded-full font-mono cursor-pointer focus:outline-none focus:border-[#F2C94C]">
                    <option value="AUTO">AUTO</option>
                    <option value="RVN">RVN</option>
                    <option value="BTC">BTC</option>
                    <option value="LTC">LTC</option>
                    <option value="DASH">DASH</option>
                    <option value="KAS">KAS</option>
                    <option value="ETC">ETC</option>
                    <option value="ZEC">ZEC</option>
                    <option value="BCH">BCH</option>
                    <option value="CFX">CFX</option>
                    <option value="CKB">CKB</option>
                    <option value="ETHW">ETHW</option>
                  </select>
                </td>
                <td className="text-xs">
                  <div className="font-mono-num text-white">{d.session_tasks ?? 0}</div>
                  <div className="font-mono-num text-[#F2C94C] text-[10px]">+{(d.session_tgc || 0).toFixed(2)} TGC</div>
                </td>
                <td className="text-xs text-white/70">
                  <span className="inline-flex items-center gap-1">
                    {d.charging && <BatteryCharging className="w-3 h-3 text-[#F2C94C]" />}
                    {d.battery ?? "—"}%
                  </span>
                </td>
                <td className="text-xs">
                  {d.temperature_c != null ? (
                    <span className={`inline-flex items-center gap-1 ${d.temperature_c > 45 ? "text-red-400" : "text-white/70"}`}>
                      <Thermometer className="w-3 h-3" /> {d.temperature_c.toFixed(1)}°C
                    </span>
                  ) : <span className="text-white/40">—</span>}
                </td>
                <td className="text-xs text-white/70">
                  <span className="inline-flex items-center gap-1">
                    <Wifi className={`w-3 h-3 ${d.wifi ? "text-[#F2C94C]" : "text-white/30"}`} />
                    {d.country || "—"}
                  </span>
                </td>
                <td className="text-[11px] text-white/60">
                  {relSec(d.last_seen_seconds)}
                  {d.suspicious_heartbeat && (
                    <ShieldAlert className="w-3 h-3 text-red-400 inline ml-1" title="Suspicious heartbeat frequency" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-white/40 text-center">
        Auto-refreshing every 5s · cutoff: {data.offline_cutoff_seconds || 45}s
      </div>
    </div>
  );
}
