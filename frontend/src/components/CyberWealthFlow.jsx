import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, TrendingUp } from "lucide-react";

/**
 * CyberWealthFlow — replaces the static "TheGrid Coin Wallet 0.0" panel with
 * an investor-grade neon counter. The number itself glows + breathes; the
 * USDT equivalent flows under it like a stock-ticker ribbon. A radial ring
 * orbits the counter showing distance to withdrawal threshold.
 *
 * Pure visual upgrade — wallet data still comes from /api/wallet via parent.
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
  tgcBalance = 0,
  tgcUsdt = 0,
  threshold = 200,
  thresholdUsdt = 10,
  children, // withdraw form rendered inside the panel
  testId = "cyber-wealth-flow",
}) {
  const tgc = useTickToValue(Number(tgcBalance) || 0);
  const usdt = useTickToValue(Number(tgcUsdt) || 0);
  const pct = Math.min(100, (tgcBalance / (threshold || 1)) * 100);

  // SVG radial ring config
  const size = 220, stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;

  return (
    <div className="hud-card p-8 relative overflow-hidden" data-testid={testId}>
      <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full blur-3xl"
           style={{ background: "rgba(0,255,136,0.18)" }} />
      <div className="absolute -left-20 -bottom-24 w-72 h-72 rounded-full blur-3xl"
           style={{ background: "rgba(0,212,255,0.12)" }} />

      <div className="relative">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/45 font-mono-cyber">
          <Wallet className="w-3.5 h-3.5" style={{ color: "var(--neon-green)" }} />
          <span className="neon-green-text">/ siber_servet_akışı</span>
          <span className="text-white/30">·</span>
          <span className="text-white/40">1 TGC = $0.05</span>
        </div>

        <div className="mt-7 grid grid-cols-[1fr_auto] gap-6 items-center">
          {/* Counter + ribbon */}
          <div className="min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex items-baseline gap-3">
              <div className="font-display font-black wealth-glow leading-none"
                   style={{ fontSize: "clamp(56px, 8vw, 84px)" }}>
                {tgc.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </div>
              <div className="text-white/55 text-base font-mono-cyber tracking-widest">TGC</div>
            </motion.div>
            <div className="mt-2 flex items-center gap-2 text-sm font-mono-cyber" data-testid="wealth-usdt">
              <TrendingUp className="w-3.5 h-3.5 cyber-blue-text" />
              <span className="usdt-ribbon font-bold tracking-wider">
                ≈ ${usdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
              </span>
            </div>
          </div>

          {/* Threshold radial ring */}
          <div className="relative grid place-items-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90 absolute inset-0">
              <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
              <circle cx={size / 2} cy={size / 2} r={r} className="ring-progress"
                      strokeWidth={stroke} fill="none" strokeLinecap="round"
                      strokeDasharray={c} strokeDashoffset={off} />
            </svg>
            <div className="text-center">
              <div className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-mono-cyber">Threshold</div>
              <div className="text-2xl font-display font-black neon-green-text mt-1" data-testid="wealth-progress-pct">
                {pct.toFixed(0)}%
              </div>
              <div className="text-[10px] text-white/45 mt-1 font-mono-cyber">
                {threshold.toFixed(0)} TGC · ${thresholdUsdt.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Withdraw form / msg — caller-supplied */}
        {children}
      </div>
    </div>
  );
}
