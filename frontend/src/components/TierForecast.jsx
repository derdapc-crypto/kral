import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { detectDeviceTier, TIER_LABEL } from "../lib/tier";
import { Cpu, TrendingUp, Sparkles } from "lucide-react";

/**
 * Dynamic Tier Forecasting card. Detects device hardware tier on launch and
 * shows the user "Potential Daily Earnings" in TGC for their tier, plus a
 * comparison bar across all three tiers.
 */
export default function TierForecast({ onTierDetected }) {
  const [forecast, setForecast] = useState(null);
  const [tier, setTier] = useState(null);

  useEffect(() => {
    const detected = detectDeviceTier();
    setTier(detected);
    onTierDetected?.(detected);
    (async () => {
      try {
        const { data } = await api.get(`/tier/forecast?tier=${detected}`);
        setForecast(data);
      } catch { /* silent */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allTiers = forecast?.tiers || {};
  const max = Math.max(0.001, ...Object.values(allTiers).map((t) => t.daily_tgc || 0));

  return (
    <div className="rounded-3xl glass-strong p-6 relative overflow-hidden" data-testid="tier-forecast-card">
      <div className="absolute -left-16 -bottom-16 w-48 h-48 rounded-full bg-[#F2C94C]/15 blur-3xl" />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#F2C94C] flex items-center gap-1.5">
              <Cpu className="w-3 h-3" /> Device Tier · Auto-Detected
            </div>
            <h3 className="font-display text-2xl font-black mt-1" data-testid="tier-detected-label">
              {tier ? TIER_LABEL[tier] : "Detecting…"}
            </h3>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Est. Daily</div>
            <div className="mt-1 flex items-baseline gap-1.5 justify-end">
              <span className="text-3xl font-display font-black gold-text font-mono-num" data-testid="tier-daily-tgc">
                {forecast ? forecast.daily_tgc.toFixed(1) : "—"}
              </span>
              <span className="text-xs text-white/60">TGC</span>
            </div>
            <div className="text-[10px] text-white/40 mt-0.5" data-testid="tier-daily-usdt">
              ≈ ${forecast ? forecast.daily_usdt.toFixed(2) : "—"} USDT
            </div>
          </div>
        </div>

        {/* Tier comparison bars */}
        <div className="mt-5 space-y-2.5">
          {Object.entries(allTiers).map(([t, v]) => {
            const pct = (v.daily_tgc / max) * 100;
            const isMine = t === tier;
            return (
              <div key={t} className="flex items-center gap-3" data-testid={`tier-row-${t}`}>
                <div className={`w-20 text-[10px] tracking-[0.25em] uppercase ${isMine ? "text-[#F2C94C]" : "text-white/40"}`}>
                  {TIER_LABEL[t]}
                </div>
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full transition-all ${isMine ? "bg-gradient-to-r from-[#F2C94C] to-[#B8860B]" : "bg-white/20"}`}
                       style={{ width: `${pct}%` }} />
                </div>
                <div className={`w-24 text-right text-xs font-mono-num ${isMine ? "text-[#F2C94C]" : "text-white/60"}`}>
                  {v.daily_tgc.toFixed(1)} TGC/d
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-black/40 border border-white/10">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 inline-flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-[#F2C94C]" /> Monthly
            </div>
            <div className="mt-1 text-lg font-display font-black gold-text font-mono-num">
              {forecast ? `${forecast.monthly_tgc.toFixed(0)} TGC` : "—"}
            </div>
            <div className="text-[10px] text-white/40">≈ ${forecast ? forecast.monthly_usdt.toFixed(2) : "—"}</div>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/10">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#F2C94C]" /> 1 TGC
            </div>
            <div className="mt-1 text-lg font-display font-black gold-text font-mono-num">
              ${forecast ? forecast.tgc_value_usdt.toFixed(2) : "0.05"}
            </div>
            <div className="text-[10px] text-white/40">Withdraw at {forecast ? forecast.withdraw_threshold_tgc.toFixed(0) : 200} TGC</div>
          </div>
        </div>
      </div>
    </div>
  );
}
