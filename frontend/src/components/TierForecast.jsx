import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { detectDeviceTier, TIER_LABEL } from "../lib/tier";
import { Cpu, TrendingUp, Sparkles } from "lucide-react";

/**
 * Dynamic Tier Forecasting card. Detects device hardware tier on launch and
 * shows the user "Estimated Daily Rewards" (USD) for their tier, plus a
 * comparison bar across all three tiers. NO mining/share vocabulary on
 * surface; backend "tgc" units are translated to USD on the user side.
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
    <div className="landing-glass p-6 relative overflow-hidden" data-testid="tier-forecast-card">
      <div className="absolute -left-16 -bottom-16 w-48 h-48 rounded-full blur-3xl"
           style={{ background: "rgba(0,255,136,0.10)" }} />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <div className="landing-pill info mb-2"><Cpu className="w-3 h-3" /> Node Tier · Auto-Detected</div>
            <h3 className="font-grotesk font-bold text-white text-[20px] mt-1" data-testid="tier-detected-label">
              {tier ? TIER_LABEL[tier] : "Detecting…"}
            </h3>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono-tech">Est. Daily Rewards</div>
            <div className="mt-1 flex items-baseline gap-1.5 justify-end">
              <span className="text-2xl font-grotesk font-bold text-[#00ff88] font-mono-tech" data-testid="tier-daily-tgc">
                {forecast ? `$${forecast.daily_usdt.toFixed(2)}` : "—"}
              </span>
            </div>
            <div className="text-[10px] text-white/40 mt-0.5 font-mono-tech" data-testid="tier-daily-usdt">
              USDT · payout currency
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
                <div className={`w-20 text-[10px] tracking-[0.2em] uppercase font-mono-tech ${isMine ? "text-[#00ff88]" : "text-white/40"}`}>
                  {TIER_LABEL[t]}
                </div>
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full transition-all ${isMine ? "" : "bg-white/15"}`}
                       style={{ width: `${pct}%`,
                                background: isMine ? "linear-gradient(90deg, #00ff88, #00d4ff)" : undefined }} />
                </div>
                <div className={`w-24 text-right text-[12px] font-mono-tech ${isMine ? "text-[#00ff88]" : "text-white/55"}`}>
                  ${v.daily_usdt.toFixed(2)}/d
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="bento-card p-3.5">
            <span className="accent-bar" />
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 inline-flex items-center gap-1 font-mono-tech">
              <TrendingUp className="w-3 h-3" style={{ color: "#00ff88" }} /> Monthly
            </div>
            <div className="mt-1 text-lg font-grotesk font-bold text-[#00ff88] font-mono-tech">
              {forecast ? `$${forecast.monthly_usdt.toFixed(2)}` : "—"}
            </div>
            <div className="text-[10px] text-white/40 font-mono-tech">USDT estimate</div>
          </div>
          <div className="bento-card p-3.5">
            <span className="accent-bar" />
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 inline-flex items-center gap-1 font-mono-tech">
              <Sparkles className="w-3 h-3" style={{ color: "#00d4ff" }} /> Payout Threshold
            </div>
            <div className="mt-1 text-lg font-grotesk font-bold text-white font-mono-tech">
              {forecast
                ? `$${(forecast.withdraw_threshold_usdt
                    ?? (forecast.withdraw_threshold_tgc * (forecast.tgc_value_usdt || 0.05))
                    ?? 10).toFixed(2)}`
                : "—"}
            </div>
            <div className="text-[10px] text-white/40 font-mono-tech">request payout above this</div>
          </div>
        </div>
      </div>
    </div>
  );
}
