/*
 * ChernobylReactor — Sanctara hero centerpiece.
 *
 * Visual metaphor:
 *  · A nuclear reactor at criticality. Continuous core pulse = network alive.
 *  · Every halving (verified-node milestone) triggers a small detonation flash.
 *  · At 1,000,000 verified nodes the reactor goes FULL DETONATION.
 *
 * No external assets — pure SVG + CSS animations so it renders instantly
 * with zero network round-trips.
 */
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Halving thresholds (must match backend tokenomics phases)
const HALVING_NODES = [10_000, 50_000, 200_000, 500_000, 1_000_000];

export default function ChernobylReactor({ verifiedNodes = 0 }) {
  // % progress toward final criticality (1M nodes)
  const pct = Math.min(100, (verifiedNodes / 1_000_000) * 100);
  const phase = useMemo(() => {
    for (let i = HALVING_NODES.length - 1; i >= 0; i--) {
      if (verifiedNodes >= HALVING_NODES[i]) return i + 1;
    }
    return 0;
  }, [verifiedNodes]);
  const isFinalDetonation = verifiedNodes >= 1_000_000;

  // Trigger a quick "shock" flash whenever phase changes
  const [shockKey, setShockKey] = useState(0);
  useEffect(() => { setShockKey(k => k + 1); }, [phase]);

  return (
    <div className="absolute inset-0 rounded-lg overflow-hidden bg-black"
         data-testid="chernobyl-reactor">
      {/* outer reactor housing */}
      <div className="absolute inset-0 border border-[#ff3838]/25 rounded-lg"
           style={{ boxShadow: "inset 0 0 80px rgba(255,56,56,0.18), 0 0 60px -10px rgba(255,56,56,0.4)" }} />

      {/* scanlines overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-40"
           style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.45) 2px, rgba(0,0,0,0.45) 3px)" }} />

      {/* ambient radiation glow background */}
      <motion.div className="absolute inset-0"
                  style={{ background: "radial-gradient(circle at 50% 55%, rgba(255,136,0,0.35), rgba(255,56,56,0.18) 35%, transparent 70%)" }}
                  animate={{ opacity: [0.55, 0.85, 0.55] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }} />

      {/* SVG reactor diagram */}
      <svg viewBox="0 0 400 400" className="absolute inset-0 w-full h-full">
        {/* containment dome — outer arc */}
        <defs>
          <radialGradient id="core" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#ffee00" />
            <stop offset="35%"  stopColor="#ff8800" />
            <stop offset="70%"  stopColor="#ff3838" />
            <stop offset="100%" stopColor="#1a0000" />
          </radialGradient>
          <radialGradient id="coreHot" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#ffffff" />
            <stop offset="25%"  stopColor="#ffe000" />
            <stop offset="55%"  stopColor="#ff3838" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* reactor vessel frame */}
        <rect x="40" y="120" width="320" height="200" fill="none" stroke="#ff3838" strokeWidth="1.5" opacity="0.5" />
        <rect x="58" y="138" width="284" height="164" fill="none" stroke="#ff8800" strokeWidth="0.8" opacity="0.35" strokeDasharray="4 4" />

        {/* control rods (vertical lines into core) */}
        {[...Array(11)].map((_, i) => {
          const x = 80 + i * 24;
          // Insert rods proportional to how far from criticality (more rods = safer)
          const insertion = 50 - (pct / 100) * 50;
          return (
            <line key={i} x1={x} y1={40} x2={x} y2={140 + insertion} stroke="#888" strokeWidth="2" opacity="0.55" />
          );
        })}

        {/* core — pulsing animated */}
        <motion.circle cx="200" cy="220" r="62"
                       fill={isFinalDetonation ? "url(#coreHot)" : "url(#core)"}
                       filter="url(#glow)"
                       animate={{
                         r: isFinalDetonation ? [62, 90, 62] : [60, 68, 60],
                         opacity: [0.85, 1, 0.85],
                       }}
                       transition={{ duration: isFinalDetonation ? 0.7 : 1.6, repeat: Infinity, ease: "easeInOut" }} />

        {/* core fissure cracks (more visible as criticality nears) */}
        {pct > 30 && [...Array(6)].map((_, i) => {
          const a = (i / 6) * Math.PI * 2;
          const x1 = 200 + Math.cos(a) * 25;
          const y1 = 220 + Math.sin(a) * 25;
          const x2 = 200 + Math.cos(a) * (55 + (pct/100)*15);
          const y2 = 220 + Math.sin(a) * (55 + (pct/100)*15);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffe000" strokeWidth="0.8" opacity={pct/120} />;
        })}

        {/* coolant pipes */}
        <path d="M 40 220 L 20 220 L 20 360 L 380 360 L 380 220 L 360 220"
              fill="none" stroke="#ff8800" strokeWidth="1.5" opacity="0.55" />
        {/* glowing pulse traveling through coolant pipe */}
        <circle r="3" fill="#ffe000">
          <animateMotion dur="4s" repeatCount="indefinite"
                         path="M 40 220 L 20 220 L 20 360 L 380 360 L 380 220 L 360 220" />
        </circle>

        {/* cooling tower silhouettes (left + right) */}
        <path d="M 18 380 L 28 240 Q 28 230 38 230 Q 48 230 48 240 L 58 380 Z" fill="#1a1a1a" stroke="#ff3838" strokeWidth="0.5" opacity="0.5" />
        <path d="M 342 380 L 352 240 Q 352 230 362 230 Q 372 230 372 240 L 382 380 Z" fill="#1a1a1a" stroke="#ff3838" strokeWidth="0.5" opacity="0.5" />
        {/* steam from cooling towers */}
        <motion.circle cx="38" cy="225" r="12" fill="#ffffff" opacity="0.12"
                       animate={{ cy: [225, 180, 140], opacity: [0.12, 0.06, 0], r: [12, 18, 24] }}
                       transition={{ duration: 4, repeat: Infinity }} />
        <motion.circle cx="362" cy="225" r="12" fill="#ffffff" opacity="0.12"
                       animate={{ cy: [225, 180, 140], opacity: [0.12, 0.06, 0], r: [12, 18, 24] }}
                       transition={{ duration: 4, repeat: Infinity, delay: 2 }} />

        {/* HUD readouts */}
        <g fontFamily="ui-monospace, monospace" fontSize="9" fill="#ff8800">
          <text x="48" y="115">REACTOR · UNIT_04</text>
          <text x="48" y="334">CORE_TEMP: {(800 + pct * 14).toFixed(0)}°C</text>
          <text x="220" y="334">FLUX: {(verifiedNodes / 1000).toFixed(1)}k</text>
          <text x="280" y="115" fill="#ff3838">PHASE {phase}/5</text>
        </g>

        {/* danger criticality meter (bottom bar) */}
        <rect x="40" y="345" width="320" height="6" fill="#220000" stroke="#ff3838" strokeWidth="0.5" />
        <rect x="40" y="345" width={3.2 * pct} height="6" fill={pct > 80 ? "#ffe000" : pct > 50 ? "#ff8800" : "#ff3838"}>
          {pct > 80 && <animate attributeName="opacity" values="1;0.4;1" dur="0.5s" repeatCount="indefinite" />}
        </rect>
      </svg>

      {/* shock-wave flash on phase change */}
      <AnimatePresence>
        <motion.div key={shockKey} className="absolute inset-0 pointer-events-none"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: [0, 0.9, 0], scale: [0.5, 2.5, 3] }}
                    transition={{ duration: 1.4, ease: "easeOut" }}
                    style={{ background: "radial-gradient(circle, rgba(255,224,0,0.7) 0%, rgba(255,56,56,0.4) 40%, transparent 70%)" }} />
      </AnimatePresence>

      {/* full detonation overlay (1M nodes) */}
      {isFinalDetonation && (
        <motion.div className="absolute inset-0 pointer-events-none"
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 0.4, repeat: Infinity }}
                    style={{ background: "radial-gradient(circle, rgba(255,255,255,0.9), rgba(255,224,0,0.5) 40%, transparent 80%)" }} />
      )}

      {/* corner reactor labels */}
      <div className="absolute top-2 left-3 font-mono text-[9px] uppercase tracking-[0.25em] text-[#ff3838]/85" data-testid="reactor-label-top">
        ⚠ SANCTARA_CORE
      </div>
      <div className="absolute top-2 right-3 font-mono text-[9px] uppercase tracking-[0.25em] text-[#ffe000]/75" data-testid="reactor-label-criticality">
        {pct.toFixed(2)}% CRIT
      </div>
      <div className="absolute bottom-2 left-3 font-mono text-[9px] uppercase tracking-[0.25em] text-white/45">
        {verifiedNodes.toLocaleString()} verified nodes
      </div>
      <div className="absolute bottom-2 right-3 font-mono text-[9px] uppercase tracking-[0.25em] text-[#ff8800]/85">
        {isFinalDetonation ? "🔥 DETONATION" : `${(1_000_000 - verifiedNodes).toLocaleString()} TO CRIT`}
      </div>
    </div>
  );
}
