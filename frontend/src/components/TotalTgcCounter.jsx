/*
 * TotalTgcCounter — v1.6.2 public ledger counter.
 *
 * Premium monospace count-up. Real backend data only. No fake inflation.
 * Used on Landing, Token, Dashboard, Admin surfaces.
 *
 * Props:
 *   value         current target total (number, in TGC, can have decimals)
 *   subValues     optional { circulating, burned } pair shown below
 *   variant       "mega" | "default" | "compact"
 *   label         override the default label
 *   tone          "matrix" (green) | "cyan" | "violet" — default "matrix"
 *   testId
 */
import React, { useEffect, useRef, useState } from "react";

function useCountUp(target, durationMs = 1400) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  const startRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    fromRef.current = val;
    startRef.current = null;
    const animate = (t) => {
      if (startRef.current == null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      const next = fromRef.current + (target - fromRef.current) * eased;
      setVal(next);
      if (p < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return val;
}

function formatTgc(n, decimals = 5) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const TONE = {
  matrix: { color: "#00ff88", shadow: "0 0 36px -8px rgba(0,255,136,0.55)" },
  cyan:   { color: "#00d9ff", shadow: "0 0 36px -8px rgba(0,217,255,0.55)" },
  violet: { color: "#6c7bff", shadow: "0 0 36px -8px rgba(108,123,255,0.55)" },
};

export default function TotalTgcCounter({
  value = 0,
  subValues = null,
  variant = "default",
  label = "TOTAL_TGC_RECEIPTS_ISSUED",
  tone = "matrix",
  testId = "total-tgc-counter",
}) {
  const animated = useCountUp(Number(value) || 0);
  const t = TONE[tone] || TONE.matrix;

  const valueSize =
    variant === "mega"     ? "clamp(40px, 5.6vw, 84px)"
  : variant === "compact"  ? "clamp(16px, 1.6vw, 22px)"
  :                          "clamp(24px, 3vw, 40px)";

  return (
    <div className="font-mono" data-testid={testId}>
      <div className="font-mono uppercase tracking-[0.3em] text-[9px] text-white/45">
        // {label}
      </div>
      <div className="mt-1 tabular-nums font-bold"
           style={{
             fontSize: valueSize,
             color: t.color,
             textShadow: t.shadow,
             letterSpacing: "-0.02em",
             lineHeight: 1.05,
           }}>
        {formatTgc(animated)} <span className="text-white/35 text-[0.45em] font-mono tracking-[0.25em] uppercase">tgc</span>
      </div>
      <div className="mt-1.5 font-mono uppercase tracking-[0.25em] text-[9px] text-white/30">
        ledger_total · real_data_only · no_fake_inflation
      </div>
      {subValues && (
        <div className="mt-3 flex gap-5 flex-wrap text-[10px] font-mono uppercase tracking-[0.2em]">
          <div className="flex items-baseline gap-2">
            <span className="text-white/35">circulating</span>
            <span className="tabular-nums" style={{ color: TONE.cyan.color }}>{formatTgc(subValues.circulating)}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-white/35">burned</span>
            <span className="tabular-nums text-amber-300">{formatTgc(subValues.burned)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
