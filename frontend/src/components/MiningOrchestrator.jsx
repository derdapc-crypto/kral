import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Zap, Cpu, Coins, Radio, AlertCircle, TrendingUp, Copy } from "lucide-react";

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

  const load = async () => {
    try {
      const [p, a, s, r] = await Promise.all([
        api.get("/mining/profiles"),
        api.get("/mining/active"),
        api.get("/admin/mining/stats"),
        api.get("/admin/mining/revenue"),
      ]);
      setProfiles(p.data.profiles);
      setMasterId(p.data.master_id);
      setActive(a.data);
      setStats(s.data);
      setRevenue(r.data);
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

  const copy = (val, label) => {
    navigator.clipboard.writeText(val);
    setCopied(label); setTimeout(() => setCopied(""), 1500);
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
    </div>
  );
}
