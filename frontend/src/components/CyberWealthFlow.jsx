import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, TrendingUp } from "lucide-react";

/**
 * CyberWealthFlow (rename: RewardBalancePanel) — professional payout ledger
 * surface for contributors. NO mining/hash/pool/share vocabulary on the
 * user-facing surface. Backend wallet data still arrives via /api/wallet,
 * but the labels speak the language of a cloud-compute reward ledger.
 */

function useTickToValue(target, dur = 1100) {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const start = fromRef.current;
    if (Math.abs(target - start) < 1e-9) return;
    let raf;
    const t0 = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(start + (target - start) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return shown;
}

export default function CyberWealthFlow({
  tgcBalance = 0,           // raw internal unit (kept for back-compat — NOT shown to user)
  tgcUsdt = 0,              // USD value of available rewards (PRIMARY user-facing number)
  threshold = 200,          // internal payout threshold (work units) — kept for back-compat
  thresholdUsdt = 10,       // USD payout threshold — PRIMARY user-facing
  pendingRewardsUsdt = 0,
  children,                  // payout form rendered inside the panel
  testId = "reward-balance-panel",
}) {
  const available = useTickToValue(Number(tgcUsdt) || 0);
  const pending = useTickToValue(Number(pendingRewardsUsdt) || 0);
  const pct = thresholdUsdt > 0 ? Math.min(100, (tgcUsdt / thresholdUsdt) * 100) : 0;

  // SVG radial ring config
  const size = 220, stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;

  return (
    <div className="landing-glass-strong p-8 relative overflow-hidden" data-testid={testId}>
      <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full blur-3xl"
           style={{ background: "rgba(0,255,136,0.10)" }} />
      <div className="absolute -left-20 -bottom-24 w-72 h-72 rounded-full blur-3xl"
           style={{ background: "rgba(0,212,255,0.08)" }} />

      <div className="relative">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45 font-mono-tech">
          <Wallet className="w-3.5 h-3.5" style={{ color: "#00ff88" }} />
          <span className="text-[#00ff88]">/ reward_balance</span>
          <span className="text-white/30">·</span>
          <span className="text-white/40">payout currency: USD (USDT)</span>
        </div>

        <div className="mt-7 grid grid-cols-[1fr_auto] gap-6 items-center">
          {/* Primary counter */}
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-mono-tech mb-1">Available Rewards</div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="flex items-baseline gap-3">
              <div className="font-grotesk font-bold wealth-glow leading-none"
                   style={{ fontSize: "clamp(48px, 7vw, 72px)", color: "#00ff88" }}>
                ${available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-white/50 text-base font-mono-tech tracking-wider">USDT</div>
            </motion.div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-mono-tech" data-testid="reward-pending">
              <span className="text-white/45 inline-flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" style={{ color: "#00d4ff" }} />
                Pending verification
                <span className="text-white/70">${pending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </span>
              <span className="text-white/30">·</span>
              <span className="text-white/45">Contribution score
                <span className="text-white/70 ml-1.5">{Math.min(100, pct).toFixed(0)} pts</span>
              </span>
            </div>
          </div>

          {/* Payout threshold radial ring */}
          <div className="relative grid place-items-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90 absolute inset-0">
              <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
              <circle cx={size / 2} cy={size / 2} r={r} className="ring-progress"
                      strokeWidth={stroke} fill="none" strokeLinecap="round"
                      strokeDasharray={c} strokeDashoffset={off} />
            </svg>
            <div className="text-center">
              <div className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-mono-tech">Payout Progress</div>
              <div className="font-grotesk font-bold text-[#00ff88] mt-1"
                   data-testid="wealth-progress-pct" style={{ fontSize: "26px" }}>
                {pct.toFixed(0)}%
              </div>
              <div className="text-[10.5px] text-white/45 mt-1 font-mono-tech">
                next payout at ${thresholdUsdt.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Withdraw form / msg — caller-supplied */}
        {children}

        {/* Back-compat hidden numeric for legacy selectors */}
        <span className="hidden">{Number(tgcBalance).toFixed(1)} · {threshold.toFixed(0)}</span>
      </div>
    </div>
  );
}
