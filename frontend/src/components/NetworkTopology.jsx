/*
 * NetworkTopology — vNext "Immersive Authority Surface" hero centerpiece.
 *
 * A pure-SVG, framer-motion-driven network web that dominates ≥40% of the
 * cinematic hero. No Three.js, no canvas — runs solid 60fps on a 2020 phone.
 *
 * Geometry: isometric-stylized point cloud with ~110 nodes connected by
 * weighted edges. The number of nodes that LIGHT UP is bound directly to
 * /api/network/scarcity-progress (verified_active_nodes).  Idle nodes are
 * dim gray; verified nodes pulse matrix-green; data packets travel along
 * the brightest active edges.
 *
 * Zero-state: when verified_active_nodes === 0, the web turns amber/gray,
 * pulses slow, and a scanning radar sweep animates across — "AWAITING
 * VERIFIED NODES".
 */
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
const W = 800;   // viewBox width
const H = 800;   // viewBox height
const CX = W / 2;
const CY = H / 2;

// Deterministic pseudo-random for stable node layout
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
  // 3 concentric clusters around an isometric ellipse
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

  // Build edges — each node connects to nearest 2-3 neighbours
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

  // Determine which nodes are "active" — never more than reality.
  const activeMap = useMemo(() => {
    const m = new Set();
    for (let i = 0; i < Math.min(verified, LAYOUT.nodes.length); i++) m.add(i);
    return m;
  }, [verified]);

  const accent = awaitingState ? "#fbbf24" : "#00ff88";
  const accent2 = awaitingState ? "#fb923c" : "#00d9ff";

  // Pick ~12 packet-animated edges — only along edges that touch active nodes
  const packetEdges = useMemo(() => {
    if (awaitingState) return [];
    const active = LAYOUT.edges.filter(e => activeMap.has(e.a) || activeMap.has(e.b));
    return active.slice(0, 14);
  }, [activeMap, awaitingState]);

  return (
    <div className={`relative w-full h-full ${className}`} data-testid="network-topology">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <radialGradient id="topo-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor={accent}  stopOpacity="0.22" />
            <stop offset="55%" stopColor={accent2} stopOpacity="0.06" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="topo-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor={accent}  stopOpacity="0.85" />
            <stop offset="60%" stopColor={accent2} stopOpacity="0.25" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="topo-blur"><feGaussianBlur stdDeviation="2.2" /></filter>
        </defs>

        {/* outer glow halo */}
        <circle cx={CX} cy={CY} r={380} fill="url(#topo-glow)" />

        {/* edges base layer (very dim) */}
        <g opacity={awaitingState ? 0.18 : 0.22}>
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

        {/* highlighted active edges */}
        <g>
          {packetEdges.map((e, i) => {
            const a = LAYOUT.nodes[e.a];
            const b = LAYOUT.nodes[e.b];
            return (
              <line key={`he-${i}`}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={accent} strokeWidth="1.1" opacity="0.4"
                    strokeLinecap="round" />
            );
          })}
        </g>

        {/* data packets — animate motion along active edges */}
        {packetEdges.map((e, i) => {
          const a = LAYOUT.nodes[e.a];
          const b = LAYOUT.nodes[e.b];
          return (
            <motion.circle key={`pk-${i}`}
              r={2.6}
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

        {/* nodes — idle (dim) under, active (bright glow) over */}
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
                    animate={{ r: [n.size + 2, n.size + 7, n.size + 2], opacity: [0.18, 0.05, 0.18] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: (n.id % 7) * 0.18 }}
                  />
                )}
                <circle cx={n.x} cy={n.y} r={n.size} fill={dotColor} opacity={isActive ? 1 : 0.55} />
              </g>
            );
          })}
        </g>

        {/* central core */}
        <circle cx={CX} cy={CY} r={62} fill="url(#topo-core)" />
        <circle cx={CX} cy={CY} r={6} fill={accent} />
        <motion.circle
          cx={CX} cy={CY} r={6}
          fill={accent} opacity={0.4}
          animate={{ r: [6, 18, 6], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut" }}
        />

        {/* scanning radar sweep — extra dramatic in awaiting state */}
        {awaitingState && (
          <motion.line
            x1={CX} y1={CY} x2={CX + 360} y2={CY}
            stroke={accent} strokeWidth="1.5" opacity="0.45"
            style={{ transformOrigin: `${CX}px ${CY}px` }}
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          />
        )}
      </svg>

      {/* corner micro-labels */}
      <div className="absolute top-3 left-4 text-[9px] font-mono uppercase tracking-[0.35em] text-[#00d9ff]/55 pointer-events-none">
        // grid.topology
      </div>
      <div className="absolute top-3 right-4 text-[9px] font-mono uppercase tracking-[0.35em] pointer-events-none"
           style={{ color: awaitingState ? "#fbbf24aa" : "#00ff88aa" }}>
        {awaitingState ? "awaiting_cohort" : `phase:${phase}`}
      </div>
      <div className="absolute bottom-3 left-4 text-[9px] font-mono uppercase tracking-[0.35em] text-white/35 pointer-events-none">
        verified_nodes: {verified.toString().padStart(7, "0")}
      </div>
      <div className="absolute bottom-3 right-4 text-[9px] font-mono uppercase tracking-[0.35em] text-white/35 pointer-events-none">
        target: 1,000,000
      </div>
    </div>
  );
}
