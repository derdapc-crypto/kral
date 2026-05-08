import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart } from "recharts";
import { TrendingUp } from "lucide-react";

/**
 * Live Revenue Chart — admin-side. Pulls from /api/admin/external-pool/history
 * which returns the last 48 Unmineable balance snapshots (one every 60s, so
 * ~48 minutes of history; longer once persisted).
 *
 * Chart shows the on-chain balance growing over time. Until the operator
 * actually starts mining (via the xmrig CLI from MINER CLI button), the
 * line stays at 0 — honest baseline, no fake animation.
 */
export default function LiveRevenueChart() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: r } = await api.get("/admin/external-pool/history");
        if (cancelled) return;
        const points = (r.points || []).map((p) => ({
          t: new Date(p.at).getTime(),
          tLabel: new Date(p.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          balance: Number(p.balance || 0),
          payable: Number(p.balance_payable || 0),
          paid: Number(p.paid || 0),
        }));
        setData(points);
        setLoading(false);
      } catch { setLoading(false); }
    };
    load();
    const t = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) load();
    }, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const last = data[data.length - 1];
  const first = data[0];
  const delta = last && first ? (last.balance - first.balance) : 0;

  return (
    <div data-testid="live-revenue-chart"
      className="rounded-3xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/[0.03] via-black/30 to-black/30 p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 grid place-items-center">
            <TrendingUp className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <div className="font-display font-bold text-base">Live Revenue · Unmineable USDT</div>
            <div className="text-xs text-white/55 mt-1">
              On-chain balance polled every 60s · {data.length} samples
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-widest text-white/40">Current Balance</div>
          <div className="font-display font-black text-2xl text-emerald-300 font-mono-num" data-testid="live-revenue-current">
            {last ? last.balance.toFixed(6) : "—"}
          </div>
          <div className={`text-[10px] font-mono-num ${delta > 0 ? "text-emerald-300" : "text-white/40"}`}>
            {delta > 0 ? `+${delta.toFixed(6)}` : delta < 0 ? delta.toFixed(6) : "no change"} USDT
          </div>
        </div>
      </div>

      <div className="h-48">
        {loading || data.length === 0 ? (
          <div className="h-full grid place-items-center text-xs text-white/40" data-testid="live-revenue-empty">
            {loading ? "Loading…" : "Awaiting first snapshot · run the MINER CLI to start earning"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="tLabel" tick={{ fontSize: 10, fill: "#ffffff66" }} stroke="#ffffff22" />
              <YAxis tick={{ fontSize: 10, fill: "#ffffff66" }} stroke="#ffffff22"
                     domain={["auto", "auto"]} tickFormatter={(v) => v.toFixed(4)} />
              <Tooltip
                contentStyle={{ background: "#0b0d0e", border: "1px solid #34d39955", borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: "#34d399" }}
                formatter={(v) => [`${Number(v).toFixed(6)} USDT`, ""]}
              />
              <Area type="monotone" dataKey="balance" stroke="#34d399" strokeWidth={2}
                    fill="url(#balanceGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
