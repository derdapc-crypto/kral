import React, { useEffect, useRef, useState } from "react";

/**
 * High-quality TGC counter that ticks UP slowly but steadily toward `value`.
 * Emphasises the high value of each unit by displaying 1 decimal place by default.
 */
export default function TGCCounter({ value = 0, decimals = 1, className = "", testId = "tgc-counter" }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    fromRef.current = shown;
    startedAtRef.current = Date.now();
    const target = value;
    const start = fromRef.current;
    if (Math.abs(target - start) < 1e-9) {
      setShown(target);
      return;
    }
    const duration = 900; // ms — slow steady tick
    let raf;
    const step = () => {
      const t = Math.min(1, (Date.now() - startedAtRef.current) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const v = start + (target - start) * eased;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const formatted = shown.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={`font-mono-num tabular-nums ${className}`} data-testid={testId}>
      {formatted}
    </span>
  );
}
