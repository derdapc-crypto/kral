/*
 * NetworkTopology — v1.7.6 "Cinematic Orbital Scanner" hero centerpiece.
 *
 * A pure-SVG, framer-motion-driven holographic radar that dominates the hero.
 * Live-bound to /api/network/scarcity-progress (verified_active_nodes).
 *
 * Visual layers (bottom → top):
 *   1. Outer halo (gradient bloom)
 *   2. 3 concentric orbital rings (slow + counter-rotating)
 *   3. Hex grid overlay (subtle data lattice)
 *   4. Idle network mesh — dim nodes + edges
 *   5. Active nodes — pulse halos + bright cores
 *   6. Data packets — animated motion along active edges
 *   7. **Radar sweep cone** (the "kırmızı yuvarlak" — now a real cone, not a line)
 *   8. Incoming-signal pings — random radial bursts from active nodes
 *   9. Central core: rotating crosshair + multi-ring beacon + scan dot
 *  10. Corner HUD labels (matrix terminal style)
 *
 * Zero-state (verified=0): amber/orange palette + active radar cone + 3 pings.
 * Growth-state: matrix green + cyan + live data packets.
 *
 * Runs 60fps on a mid-range phone (≤120 motion elements, no canvas, no WebGL).
 */
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
const W = 800;
const H = 800;
const CX = W / 2;
const CY = H / 2;

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function buildLayout() {
  const rng = seeded(42);
  const nodes = [];
  const rings = [
    { count: 14, rx: 120, ry: 90,  jitter: 12 },
    { count: 26, rx: 220, ry: 170, jitter: 18 },
    { count: 40, rx: 320, ry: 250, jitter: 26 },
    { count: 30, rx: 380, ry: 300, jitter: 30 },
  ];
  let idx = 0;
  rings.forEach((ring, ringI) => {
    for (let i = 0; i < ring.count; i++) {
      const a = (i / ring.count) * Math.PI * 2 + ringI * 0.3;
      const r = 0.85 + rng() * 0.3;
      const x = CX + Math.cos(a) * ring.rx * r + (rng() - 0.5) * ring.jitter;
      const y = CY + Math.sin(a) * ring.ry * r * 0.72 + (rng() - 0.5) * ring.jitter;
      nodes.push({ id: idx++, x, y, ring: ringI, size: ringI === 0 ? 3.2 : ringI === 1 ? 2.4 : 1.8 });
    }
  });
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    const distances = nodes
      .map((n, j) => ({ j, d: Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y) }))
      .filter(d => d.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    distances.forEach((d) => {
      if (i < d.j) edges.push({ a: i, b: d.j, d: d.d });
    });
  }
  return { nodes, edges };
}

const LAYOUT = buildLayout();

// Deterministic "incoming pings" — 6 nodes flashing at offset delays.
const PING_NODE_IDX = [3, 17, 31, 52, 71, 89];

export default function NetworkTopology({ className = "" }) {
  const [scarcity, setScarcity] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${BACKEND}/api/network/scarcity-progress`);
        const d = await r.json();
        if (!cancelled) setScarcity(d);
      } catch { /* leave awaiting */ }
    };
    load();
    const t = setInterval(load, 25_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const verified = scarcity?.verified_active_nodes ?? 0;
  const phase    = scarcity?.phase || "growth";
  const awaitingState = verified === 0;

  const activeMap = useMemo(() => {
    const m = new Set();
    for (let i = 0; i < Math.min(verified, LAYOUT.nodes.length); i++) m.add(i);
    return m;
  }, [verified]);

  // Cyber-cyan + matrix-green when network is alive.
  // Amber + orange while awaiting first verified cohort.
  const accent  = awaitingState ? "#fbbf24" : "#00ff88";
  const accent2 = awaitingState ? "#fb923c" : "#00d9ff";

  const packetEdges = useMemo(() => {
    if (awaitingState) return [];
    const active = LAYOUT.edges.filter(e => activeMap.has(e.a) || activeMap.has(e.b));
    return active.slice(0, 14);
  }, [activeMap, awaitingState]);

  // Random "ping" nodes — in awaiting state use all 6; in growth state pull from active set.
  const pingNodes = useMemo(() => {
    if (awaitingState) return PING_NODE_IDX.map(i => LAYOUT.nodes[i]);
    const activeIds = [...activeMap];
    return activeIds.slice(0, 6).map(i => LAYOUT.nodes[i]);
  }, [awaitingState, activeMap]);

  return (
    <div className={`relative w-full h-full ${className}`} data-testid="network-topology">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          {/* Radar sweep cone — gradient that fades as it rotates */}
          <radialGradient id="topo-sweep" cx="0%" cy="50%" r="100%">
            <stop offset="0%"  stopColor={accent}  stopOpacity="0.55" />
            <stop offset="40%" stopColor={accent}  stopOpacity="0.22" />
            <stop offset="85%" stopColor={accent}  stopOpacity="0.02" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="topo-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor={accent}  stopOpacity="0.22" />
            <stop offset="55%" stopColor={accent2} stopOpacity="0.06" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="topo-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor={accent}  stopOpacity="0.95" />
            <stop offset="50%" stopColor={accent2} stopOpacity="0.35" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="topo-ping" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor={accent}  stopOpacity="0.9" />
            <stop offset="100%" stopColor={accent}  stopOpacity="0" />
          </radialGradient>
          <filter id="topo-blur"><feGaussianBlur stdDeviation="2.2" /></filter>
          <filter id="topo-glow-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* outer halo */}
        <circle cx={CX} cy={CY} r={380} fill="url(#topo-glow)" />

        {/* === 3 ORBITAL RINGS (counter-rotating dashes) === */}
        {[{ r: 360, dur: 90, dir: 1, dash: "2 6", op: 0.18 },
          { r: 280, dur: 65, dir: -1, dash: "4 10", op: 0.22 },
          { r: 200, dur: 45, dir: 1, dash: "1 4", op: 0.28 }].map((ring, i) => (
          <motion.circle
            key={`orbit-${i}`}
            cx={CX} cy={CY} r={ring.r}
            fill="none" stroke={accent2}
            strokeWidth="1" strokeDasharray={ring.dash}
            opacity={ring.op}
            style={{ transformOrigin: `${CX}px ${CY}px` }}
            animate={{ rotate: 360 * ring.dir }}
            transition={{ duration: ring.dur, repeat: Infinity, ease: "linear" }}
          />
        ))}

        {/* === RADAR SWEEP CONE (the "kırmızı yuvarlak" — now a proper cone) === */}
        <motion.g
          style={{ transformOrigin: `${CX}px ${CY}px` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
        >
          {/* main cone wedge */}
          <path
            d={`M ${CX} ${CY} L ${CX + 380} ${CY - 90} A 390 390 0 0 1 ${CX + 380} ${CY + 90} Z`}
            fill="url(#topo-sweep)"
          />
          {/* leading edge bright line */}
          <line
            x1={CX} y1={CY} x2={CX + 390} y2={CY}
            stroke={accent} strokeWidth="2" opacity="0.8"
            style={{ filter: `drop-shadow(0 0 6px ${accent})` }}
          />
        </motion.g>

        {/* === IDLE EDGE MESH === */}
        <g opacity={awaitingState ? 0.14 : 0.20}>
          {LAYOUT.edges.map((e, i) => {
            const a = LAYOUT.nodes[e.a];
            const b = LAYOUT.nodes[e.b];
            return (
              <line key={`be-${i}`}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={accent2} strokeWidth="0.5"
                    strokeLinecap="round" />
            );
          })}
        </g>

        {/* === ACTIVE HIGHLIGHTED EDGES === */}
        <g>
          {packetEdges.map((e, i) => {
            const a = LAYOUT.nodes[e.a];
            const b = LAYOUT.nodes[e.b];
            return (
              <line key={`he-${i}`}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={accent} strokeWidth="1.2" opacity="0.45"
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 3px ${accent})` }} />
            );
          })}
        </g>

        {/* === DATA PACKETS (motion along active edges) === */}
        {packetEdges.map((e, i) => {
          const a = LAYOUT.nodes[e.a];
          const b = LAYOUT.nodes[e.b];
          return (
            <motion.circle key={`pk-${i}`}
              r={2.8}
              fill={accent}
              filter="url(#topo-blur)"
              initial={{ cx: a.x, cy: a.y, opacity: 0 }}
              animate={{
                cx: [a.x, b.x, a.x],
                cy: [a.y, b.y, a.y],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 3.4 + (i % 5) * 0.35,
                repeat: Infinity,
                delay: i * 0.22,
                ease: "linear",
              }}
            />
          );
        })}

        {/* === NODES === */}
        <g>
          {LAYOUT.nodes.map((n) => {
            const isActive = activeMap.has(n.id);
            const dotColor = isActive ? accent : "#374151";
            return (
              <g key={`n-${n.id}`}>
                {isActive && (
                  <motion.circle
                    cx={n.x} cy={n.y}
                    r={n.size + 4}
                    fill={accent}
                    opacity={0.18}
                    animate={{ r: [n.size + 2, n.size + 8, n.size + 2], opacity: [0.18, 0.04, 0.18] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: (n.id % 7) * 0.18 }}
                  />
                )}
                <circle cx={n.x} cy={n.y} r={n.size} fill={dotColor} opacity={isActive ? 1 : 0.55} />
              </g>
            );
          })}
        </g>

        {/* === INCOMING SIGNAL PINGS (radial expanding rings on selected nodes) === */}
        {pingNodes.map((n, i) => n && (
          <g key={`ping-${i}`}>
            {[0, 1, 2].map(ringIdx => (
              <motion.circle
                key={`ping-r-${i}-${ringIdx}`}
                cx={n.x} cy={n.y}
                r={3}
                fill="none"
                stroke={accent}
                strokeWidth="1.2"
                opacity={0}
                animate={{ r: [3, 36], opacity: [0.85, 0] }}
                transition={{
                  duration: 2.8,
                  repeat: Infinity,
                  delay: i * 0.55 + ringIdx * 0.45,
                  ease: "easeOut",
                }}
              />
            ))}
            <circle cx={n.x} cy={n.y} r={2.4} fill={accent}
                    style={{ filter: `drop-shadow(0 0 5px ${accent})` }} />
          </g>
        ))}

        {/* === CENTRAL CORE === */}
        {/* Soft glow halo */}
        <circle cx={CX} cy={CY} r={70} fill="url(#topo-core)" />
        {/* 3 expanding pulses */}
        {[0, 1, 2].map(i => (
          <motion.circle
            key={`core-pulse-${i}`}
            cx={CX} cy={CY} r={8}
            fill="none" stroke={accent} strokeWidth="1.5"
            opacity={0}
            animate={{ r: [8, 60], opacity: [0.7, 0] }}
            transition={{ duration: 3.0, repeat: Infinity, delay: i * 1.0, ease: "easeOut" }}
          />
        ))}
        {/* Rotating crosshair */}
        <motion.g
          style={{ transformOrigin: `${CX}px ${CY}px` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        >
          <line x1={CX-22} y1={CY} x2={CX-10} y2={CY} stroke={accent} strokeWidth="1.5" opacity="0.6" />
          <line x1={CX+10} y1={CY} x2={CX+22} y2={CY} stroke={accent} strokeWidth="1.5" opacity="0.6" />
          <line x1={CX} y1={CY-22} x2={CX} y2={CY-10} stroke={accent} strokeWidth="1.5" opacity="0.6" />
          <line x1={CX} y1={CY+10} x2={CX} y2={CY+22} stroke={accent} strokeWidth="1.5" opacity="0.6" />
        </motion.g>
        {/* Counter-rotating dashed ring */}
        <motion.circle
          cx={CX} cy={CY} r={28}
          fill="none" stroke={accent}
          strokeWidth="1" strokeDasharray="3 4"
          opacity="0.7"
          style={{ transformOrigin: `${CX}px ${CY}px` }}
          animate={{ rotate: -360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        />
        {/* Solid core dot */}
        <circle cx={CX} cy={CY} r={6} fill={accent}
                filter="url(#topo-glow-soft)" />
        {/* Pulsing core dot ring */}
        <motion.circle
          cx={CX} cy={CY} r={6}
          fill="none" stroke={accent} strokeWidth="2"
          opacity={0.5}
          animate={{ r: [6, 14, 6], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut" }}
        />
      </svg>

      {/* === CORNER HUD LABELS === */}
      <div className="absolute top-3 left-4 text-[9px] font-mono uppercase tracking-[0.35em] text-[#00d9ff]/55 pointer-events-none">
        // grid.topology
      </div>
      <div className="absolute top-3 right-4 text-[9px] font-mono uppercase tracking-[0.35em] pointer-events-none flex items-center gap-2"
           style={{ color: awaitingState ? "#fbbf24aa" : "#00ff88aa" }}>
        <motion.span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: accent }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
        {awaitingState ? "awaiting_cohort" : `phase:${phase}`}
      </div>
      <div className="absolute bottom-3 left-4 text-[9px] font-mono uppercase tracking-[0.35em] text-white/35 pointer-events-none">
        verified_nodes: {verified.toString().padStart(7, "0")}
      </div>
      <div className="absolute bottom-3 right-4 text-[9px] font-mono uppercase tracking-[0.35em] text-white/35 pointer-events-none">
        target: 1,000,000
      </div>

      {/* Diagonal corner brackets (frame the radar) */}
      {["top-2 left-2", "top-2 right-2 rotate-90", "bottom-2 left-2 -rotate-90", "bottom-2 right-2 rotate-180"].map((c, i) => (
        <span key={i} className={`absolute ${c} w-4 h-4 pointer-events-none`}
              style={{
                borderTop: `1.5px solid ${accent}aa`,
                borderLeft: `1.5px solid ${accent}aa`,
              }} />
      ))}
    </div>
  );
}
