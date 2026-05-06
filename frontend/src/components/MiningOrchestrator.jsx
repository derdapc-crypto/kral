import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Zap, Cpu, Coins, Radio, AlertCircle, TrendingUp, Copy, Power, ShieldOff, ShieldCheck as ShieldCheckIcon } from "lucide-react";

function fmtHashrate(hps, unit, unit_div) {
  const v = hps / (unit_div || 1);
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit || "H/s"}`;
}

export default function MiningOrchestrator() {
  const [profiles, setProfiles] = useState([]);
  const [active, setActive] = useState(null);
  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [masterId, setMasterId] = useState("");
  const [err, setErr] = useState("");
  const [switching, setSwitching] = useState(false);
  const [copied, setCopied] = useState("");
  const [killing, setKilling] = useState(false);
  const [killStatus, setKillStatus] = useState(null);
  const [shield, setShield] = useState(null);
  const [shieldFactor, setShieldFactor] = useState("1.0");
  const [shieldSaving, setShieldSaving] = useState(false);

  const load = async () => {
    try {
      const [p, a, s, r, sh] = await Promise.all([
        api.get("/mining/profiles"),
        api.get("/mining/active"),
        api.get("/admin/mining/stats"),
        api.get("/admin/mining/revenue"),
        api.get("/admin/shield"),
      ]);
      setProfiles(p.data.profiles);
      setMasterId(p.data.master_id);
      setActive(a.data);
      setStats(s.data);
      setRevenue(r.data);
      setShield(sh.data);
      setShieldFactor(String(sh.data.difficulty_factor ?? "1.0"));
    } catch (e) { setErr(formatApiError(e)); }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const switchTo = async (coin) => {
    if (active?.coin === coin) return;
    setSwitching(true); setErr("");
    try { await api.post("/admin/mining/select", { coin }); await load(); }
    catch (e) { setErr(formatApiError(e)); }
    finally { setSwitching(false); }
  };

  const killAll = async () => {
    if (!window.confirm("KILL SWITCH: Stop mining on every device immediately?")) return;
    setKilling(true);
    try {
      const { data } = await api.post("/admin/mining/kill");
      setKillStatus({ killed: true, affected: data.active_devices_affected });
    } catch (e) { setErr(formatApiError(e)); }
    finally { setKilling(false); }
  };

  const resumeAll = async () => {
    setKilling(true);
    try {
      await api.post("/admin/mining/resume");
      setKillStatus({ killed: false });
    } catch (e) { setErr(formatApiError(e)); }
    finally { setKilling(false); }
  };

  const copy = (val, label) => {
    navigator.clipboard.writeText(val);
    setCopied(label); setTimeout(() => setCopied(""), 1500);
  };

  const saveShield = async () => {
    setShieldSaving(true); setErr("");
    try {
      await api.post("/admin/shield", { difficulty_factor: Number(shieldFactor) });
      await load();
    } catch (e) { setErr(formatApiError(e)); }
    finally { setShieldSaving(false); }
  };

  const activeProfile = active?.profile;

  return (
    <div className="space-y-6" data-testid="mining-orchestrator">
      {/* Dropdown + Active coin */}
      <div className="grid lg:grid-cols-[1.2fr_1.8fr] gap-6">
        <div className="rounded-3xl glass-strong p-7 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-[#D4AF37]/20 blur-3xl" />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#F2C94C] flex items-center gap-1.5">
              <Coins className="w-3 h-3" /> Active Network Mining Goal
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <h3 className="font-display text-4xl font-black gold-text" data-testid="mining-active-coin">{active?.coin || "—"}</h3>
              <span className="text-white/60 text-sm">{activeProfile?.name}</span>
            </div>
            <div className="mt-1 text-xs tracking-widest uppercase text-white/40">{activeProfile?.algo}</div>

            <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-4">
              {profiles.map((p) => (
                <button key={p.coin} onClick={() => switchTo(p.coin)} disabled={switching}
                  data-testid={`mining-select-${p.coin}`}
                  className={`p-3 rounded-xl text-left transition-all ${
                    active?.coin === p.coin
                      ? "bg-[#F2C94C] text-black shadow-[0_0_30px_rgba(242,201,76,0.45)]"
                      : "border border-white/10 text-white/80 hover:border-[#D4AF37]"
                  }`}>
                  <div className="font-display font-black text-lg">{p.coin}</div>
                  <div className={`text-[10px] tracking-widest uppercase mt-0.5 ${active?.coin === p.coin ? "text-black/70" : "text-white/40"}`}>{p.algo}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-3xl glass p-6">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">/ stratum broadcast · live</div>
          <div className="mt-3 p-4 rounded-2xl bg-black/60 border border-white/10 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Stratum URL</div>
                <div className="font-mono text-[#F2C94C] text-sm break-all mt-1" data-testid="mining-stratum-url">{activeProfile?.stratum_url || "—"}</div>
              </div>
              <button onClick={() => copy(activeProfile?.stratum_url || "", "url")} data-testid="mining-copy-url"
                className="text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full border gold-border text-[#F2C94C] inline-flex items-center gap-1.5 whitespace-nowrap">
                <Copy className="w-3 h-3" /> {copied === "url" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Master Worker ID</div>
                <div className="font-mono text-white text-sm mt-1" data-testid="mining-master-id">{masterId}.<span className="text-white/50">[device_id]</span></div>
              </div>
              <button onClick={() => copy(masterId, "id")} data-testid="mining-copy-id"
                className="text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full border border-white/15 text-white/70 inline-flex items-center gap-1.5">
                <Copy className="w-3 h-3" /> {copied === "id" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div><div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Port</div><div className="text-white mt-1 font-mono-num">{activeProfile?.port || "—"}</div></div>
              <div><div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Algo</div><div className="text-white mt-1">{activeProfile?.algo || "—"}</div></div>
              <div><div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Unit</div><div className="text-white mt-1">{activeProfile?.unit || "H/s"}</div></div>
            </div>
          </div>
          {err && <div className="mt-3 text-xs text-red-400" data-testid="mining-error">{err}</div>}
        </div>
      </div>

      {/* Aggregate Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="p-6 rounded-2xl glass" data-testid="mining-stat-nodes">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Active Miners</div>
            <Radio className="w-4 h-4 text-[#F2C94C]" />
          </div>
          <div className="mt-3 text-3xl font-display font-black gold-text font-mono-num">{stats?.active_nodes ?? 0}</div>
        </div>
        <div className="p-6 rounded-2xl glass-strong col-span-2" data-testid="mining-stat-hashrate">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Aggregate Hashrate · {active?.coin}</div>
            <Zap className="w-4 h-4 text-[#F2C94C]" />
          </div>
          <div className="mt-3 text-4xl font-display font-black gold-text font-mono-num">
            {stats ? fmtHashrate(stats.total_hashrate_hps, stats.unit, stats.unit_div) : "—"}
          </div>
          <div className="text-[10px] mt-1 text-white/40">from {stats?.contributing_nodes || 0} contributing nodes</div>
        </div>
        <div className="p-6 rounded-2xl glass" data-testid="mining-stat-revenue">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Est. Daily USDT</div>
            <TrendingUp className="w-4 h-4 text-[#F2C94C]" />
          </div>
          <div className="mt-3 text-3xl font-display font-black gold-text font-mono-num">
            {revenue ? `$${revenue.daily_usdt.toFixed(4)}` : "—"}
          </div>
          <div className="text-[10px] mt-1 text-white/40" data-testid="mining-daily-symbol">{revenue?.daily_symbol_display || ""}</div>
        </div>
      </div>

      {/* Per-device */}
      <div className="rounded-3xl glass p-6">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-3 flex items-center gap-2">
          <Cpu className="w-3 h-3 text-[#F2C94C]" /> Node-level Mining Speed · {active?.coin}
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm" data-testid="mining-devices-table">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.25em] text-white/40 border-b border-white/5">
                <th className="py-3">Device</th><th>Tier</th><th>Hashrate</th><th>Algo</th><th>Thermal</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.devices || []).length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-white/40">No active nodes — waiting for heartbeats.</td></tr>
              )}
              {(stats?.devices || []).map((d) => {
                // Fallback: estimate if device hasn't reported
                const tierMult = d.model === "flagship" ? 3 : d.model === "mid" ? 1.8 : 1;
                const hr = d.hashrate_hps ?? (activeProfile?.base_hashrate_hps || 0) * tierMult;
                return (
                  <tr key={d.id} className="border-b border-white/5">
                    <td className="py-2.5">
                      <div className="text-white">{d.name}</div>
                      <div className="text-[10px] text-white/40 font-mono">{(d.id || "").slice(0, 8)}</div>
                    </td>
                    <td className="uppercase text-xs text-white/60">{d.model}</td>
                    <td className="font-mono-num text-[#F2C94C]">{fmtHashrate(hr, stats?.unit, stats?.unit_div)}</td>
                    <td className="text-xs text-white/70">{d.algo || activeProfile?.algo || "—"}</td>
                    <td className="text-xs text-white/60 uppercase tracking-widest">{d.thermal || "nominal"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl border border-white/10 bg-white/[0.02]">
        <AlertCircle className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-white/50 leading-relaxed">
          Stratum broadcast reaches every connected node. Real production clients (signed native APK) would open a raw socket to the selected pool.
          Browser-based nodes in this preview <span className="text-white/80">simulate</span> hashrate per algo based on device tier.
        </p>
      </div>

      {/* Admin Shield · TGC Drip Throttle */}
      <div className="rounded-3xl glass p-6" data-testid="admin-shield-panel">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F2C94C]/10 border border-[#D4AF37]/30 grid place-items-center">
              <ShieldCheckIcon className="w-5 h-5 text-[#F2C94C]" />
            </div>
            <div>
              <div className="font-display font-bold text-base">Admin Shield · TGC Drip Throttle</div>
              <div className="text-xs text-white/50 mt-0.5 max-w-lg">
                Auto-throttles TGC drip rate when real-world mining difficulty rises. Preserves the 30% admin profit margin via the 7:5 arbitrage rule (Binance ID {shield?.admin_binance_id}).
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number" step="0.01" min="0.5" max="50"
              value={shieldFactor}
              onChange={(e) => setShieldFactor(e.target.value)}
              data-testid="shield-factor-input"
              className="w-24 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono-num focus:border-[#D4AF37] focus:outline-none"
            />
            <button onClick={saveShield} disabled={shieldSaving} data-testid="shield-save-btn"
              className="px-4 py-2 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black text-xs tracking-widest uppercase font-semibold disabled:opacity-50">
              {shieldSaving ? "Saving…" : "Apply"}
            </button>
            {shield?.margin_below_floor && shield?.suggested_difficulty_factor && (
              <button onClick={() => { setShieldFactor(String(shield.suggested_difficulty_factor)); }}
                data-testid="shield-suggest-btn"
                className="px-3 py-2 rounded-full border border-red-400/40 text-red-300 text-[10px] tracking-widest uppercase font-semibold">
                Use ×{shield.suggested_difficulty_factor.toFixed(2)}
              </button>
            )}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-black/40 border border-white/10">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Difficulty Factor</div>
            <div className="mt-1 text-xl font-display font-black gold-text font-mono-num" data-testid="shield-factor-value">
              ×{shield ? shield.difficulty_factor.toFixed(2) : "—"}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/10">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Current Margin</div>
            <div className={`mt-1 text-xl font-display font-black font-mono-num ${shield?.margin_below_floor ? "text-red-400" : "gold-text"}`}
                 data-testid="shield-margin-value">
              {shield ? `${(shield.current_margin * 100).toFixed(1)}%` : "—"}
              {shield?.margin_below_floor && <span className="ml-2 text-[10px] uppercase tracking-widest text-red-400/80">below floor</span>}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/10">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">User TGC Paid · USDT</div>
            <div className="mt-1 text-xl font-display font-black text-white font-mono-num">
              ${shield ? shield.tgc_paid_to_users_usdt.toFixed(4) : "—"}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/10">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Implied Real Mined · USDT</div>
            <div className="mt-1 text-xl font-display font-black text-white font-mono-num">
              ${shield ? shield.implied_real_mined_usdt.toFixed(4) : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Kill switch */}
      <div className={`rounded-3xl p-6 border ${killStatus?.killed ? "border-red-400/40 bg-red-500/5" : "border-white/10 bg-black/30"}`}>
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <ShieldOff className={`w-5 h-5 ${killStatus?.killed ? "text-red-400" : "text-white/50"}`} />
            <div>
              <div className="font-display font-bold text-base">Global Kill Switch</div>
              <div className="text-xs text-white/50 mt-0.5">Halts mining on all devices on next 5s poll. Enterprise jobs unaffected.</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={killAll} disabled={killing} data-testid="kill-switch-btn"
              className="px-5 py-2.5 rounded-full bg-red-500/15 border border-red-400/40 text-red-300 text-xs tracking-widest uppercase font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-50">
              <Power className="w-3.5 h-3.5 inline mr-1.5" /> Stop All Mining
            </button>
            <button onClick={resumeAll} disabled={killing} data-testid="resume-mining-btn"
              className="px-5 py-2.5 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black text-xs tracking-widest uppercase font-semibold disabled:opacity-50">
              Resume
            </button>
          </div>
        </div>
        {killStatus?.killed && (
          <div className="mt-3 text-xs text-red-300" data-testid="kill-status">
            Kill switch ENGAGED · {killStatus.affected} active device{killStatus.affected === 1 ? "" : "s"} stopping…
          </div>
        )}
      </div>
    </div>
  );
}
