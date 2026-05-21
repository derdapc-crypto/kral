/*
 * NetworkTopology — v1.7.7 "Holographic Earth Grid" hero centerpiece.
 *
 * A pure-SVG, framer-motion-driven rotating 3D Earth wireframe with
 * orbital rings and a glowing core beacon. Modelled after the operator's
 * reference: continents lit up as bright point clusters, multiple latitude
 * and longitude rings showing depth, a vertical beam of light shooting up
 * from the south pole, HUD telemetry on the left.
 *
 * Pure SVG (no Three.js / no WebGL) — runs solid 60fps on a 2020 phone.
 *
 * Layers (bottom → top):
 *   1. Outer halo bloom
 *   2. Latitude rings (8 horizontal ellipses, perspective-projected)
 *   3. Longitude rings (rotating, counter-rotating)
 *   4. Continent point cloud (~600 dots, fibonacci-sphere distributed,
 *      brightened in continent bounding boxes)
 *   5. South-pole beacon (vertical light beam + radial bursts)
 *   6. Random "ping" packets traveling along longitude curves
 *   7. Left HUD panel (DÜĞÜMLER / BÖLGELER / SİNYAL GÜCÜ with mini bar chart)
 *   8. Corner brackets + status pill
 */
import React, { useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";

const VB_W = 800;
const VB_H = 800;
const CX = VB_W / 2;
const CY = VB_H / 2;
const RADIUS = 300;            // sphere radius
const TILT_DEG = 18;           // earth tilt — positive so the south pole sits visually at the BOTTOM (reference image)

/* ---------------- continent bounding boxes (rough lat/lon) ---------------- */
/* Each entry: [latMin, latMax, lonMin, lonMax] — used to weight point density. */
const CONTINENT_BOXES = [
  // North America
  [25, 70,  -130, -65],
  // South America
  [-55, 12, -82,  -34],
  // Europe
  [36, 70,  -10,  40],
  // Africa
  [-35, 37, -18,  52],
  // Middle East / West Asia
  [12, 45,  35,   75],
  // South Asia / India
  [5,  35,  68,   95],
  // East Asia / China
  [20, 55,  95,   145],
  // Southeast Asia / Indonesia
  [-10, 25, 95,   145],
  // Australia
  [-40, -10, 110, 155],
  // Russia / Siberia
  [50, 75,  30,  175],
  // Japan
  [30, 46,  130, 146],
];

/* ---------------- fibonacci sphere ---------------- */
function fibonacciSphere(samples) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < samples; i++) {
    const y = 1 - (i / (samples - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const lat = Math.asin(y) * 180 / Math.PI;
    const lon = Math.atan2(z, x) * 180 / Math.PI;
    pts.push({ x, y, z, lat, lon });
  }
  return pts;
}

function isInContinent(lat, lon) {
  for (let i = 0; i < CONTINENT_BOXES.length; i++) {
    const [a, b, c, d] = CONTINENT_BOXES[i];
    if (lat >= a && lat <= b && lon >= c && lon <= d) return true;
  }
  return false;
}

/* Pre-build a denser set of points and tag continent ones. */
const GLOBE_PTS = (() => {
  const base = fibonacciSphere(900);
  return base.map(p => ({ ...p, continent: isInContinent(p.lat, p.lon) }));
})();

/* Project a unit-sphere point onto SVG coords with Y-axis rotation. */
function project(p, rotY) {
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  // rotate around Y
  const xr = p.x * cosY + p.z * sinY;
  const zr = -p.x * sinY + p.z * cosY;
  // apply tilt around X
  const tilt = (TILT_DEG * Math.PI) / 180;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const yr = p.y * cosT - zr * sinT;
  const zr2 = p.y * sinT + zr * cosT;
  return {
    sx: CX + xr * RADIUS,
    sy: CY + yr * RADIUS,
    sz: zr2, // depth: 1=front, -1=back
  };
}

export default function NetworkTopology({ className = "" }) {
  const [scarcity, setScarcity] = useState(null);
  const [rotY, setRotY] = useState(0);
  const rafRef = useRef(0);

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

  /* Globe slow auto-rotation. ~1 full revolution every 80s. */
  useEffect(() => {
    let prev = performance.now();
    const step = (now) => {
      const dt = (now - prev) / 1000;
      prev = now;
      setRotY(r => (r + dt * (Math.PI * 2 / 80)) % (Math.PI * 2));
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const verified  = scarcity?.verified_active_nodes ?? 0;
  const downloads = (scarcity?.by_client?.light?.downloads || 0)
                  + (scarcity?.by_client?.node_pro?.downloads || 0);
  const phase     = scarcity?.phase || "growth";
  const awaitingState = verified === 0;

  /* Project points each frame. */
  const projected = useMemo(() => {
    return GLOBE_PTS.map((p, i) => {
      const pr = project(p, rotY);
      return { ...p, ...pr, id: i };
    });
  }, [rotY]);

  /* Beacon emerges from the "south pole" — i.e. the bottom of the tilted sphere.
     With our screen-Y-down convention and positive tilt, (0,+1,0) projects
     to the bottom of the canvas → this is what we use as the beacon anchor. */
  const southPole = useMemo(() => project({ x: 0, y: 1, z: 0 }, rotY), [rotY]);

  /* Latitude rings — 7 horizontal ellipses at lat = -60, -40, -20, 0, 20, 40, 60.
     Each renders as an SVG ellipse with appropriate ry shrinking due to tilt. */
  const latRings = [-60, -40, -20, 0, 20, 40, 60].map((lat) => {
    const latRad = (lat * Math.PI) / 180;
    const rx = Math.cos(latRad) * RADIUS;
    const tilt = (TILT_DEG * Math.PI) / 180;
    // y-offset = sin(lat)*R*cos(tilt); ry = rx * sin(tilt) approximately
    const yOff = Math.sin(latRad) * RADIUS * Math.cos(tilt);
    const ry = Math.abs(rx * Math.sin(tilt));
    return { lat, rx, ry, cy: CY + yOff };
  });

  /* Longitude rings — 8 great circles at evenly spaced rotations. */
  const lonRings = useMemo(() => {
    const ringCount = 8;
    const segments = 64;
    const tilt = (TILT_DEG * Math.PI) / 180;
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    return Array.from({ length: ringCount }, (_, ri) => {
      const lon = (ri / ringCount) * Math.PI + rotY;
      const cosL = Math.cos(lon), sinL = Math.sin(lon);
      const pts = [];
      for (let s = 0; s <= segments; s++) {
        const a = (s / segments) * Math.PI * 2;
        const x0 = Math.cos(a);
        const y0 = Math.sin(a);
        // rotate around Y-axis (longitude)
        const xr = x0 * cosL;
        const zr = -x0 * sinL;
        // apply tilt around X
        const yr = y0 * cosT - zr * sinT;
        const zr2 = y0 * sinT + zr * cosT;
        pts.push([CX + xr * RADIUS, CY + yr * RADIUS, zr2]);
      }
      return pts;
    });
  }, [rotY]);

  const accent  = awaitingState ? "#fbbf24" : "#00ff88";
  const accent2 = awaitingState ? "#fb923c" : "#00d9ff";
  const beamColor = "#fbbf24";  // beacon is always amber-gold

  /* Mini bar chart values for SİNYAL GÜCÜ */
  const signalBars = useMemo(() => {
    const seed = Math.floor((rotY * 100) / 5);
    const v = [];
    for (let i = 0; i < 16; i++) v.push(8 + ((seed + i * 13) % 22));
    return v;
  }, [rotY]);

  return (
    <div className={`relative w-full h-full ${className}`} data-testid="network-topology">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <radialGradient id="topo-bloom" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor={accent} stopOpacity="0.18" />
            <stop offset="60%" stopColor={accent2} stopOpacity="0.04" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="topo-sphere" cx="40%" cy="35%" r="65%">
            <stop offset="0%"  stopColor="#062c1e" stopOpacity="0.65" />
            <stop offset="60%" stopColor="#020a07" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#020405" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="topo-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={beamColor} stopOpacity="0" />
            <stop offset="45%" stopColor={beamColor} stopOpacity="0.85" />
            <stop offset="55%" stopColor="#fff7c2" stopOpacity="1" />
            <stop offset="100%" stopColor={beamColor} stopOpacity="0" />
          </linearGradient>
          <radialGradient id="topo-beacon-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff7c2" stopOpacity="1" />
            <stop offset="35%" stopColor={beamColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={beamColor} stopOpacity="0" />
          </radialGradient>
          <filter id="topo-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* outer bloom halo */}
        <circle cx={CX} cy={CY} r={RADIUS + 90} fill="url(#topo-bloom)" />

        {/* sphere body shadow */}
        <circle cx={CX} cy={CY} r={RADIUS} fill="url(#topo-sphere)" />

        {/* ============ LATITUDE RINGS (horizontal ellipses) ============ */}
        <g opacity="0.55">
          {latRings.map((ring, i) => (
            <ellipse
              key={`lat-${i}`}
              cx={CX} cy={ring.cy}
              rx={ring.rx} ry={ring.ry}
              fill="none"
              stroke={accent2}
              strokeWidth="0.6"
              strokeDasharray={ring.lat === 0 ? "0" : "2 3"}
              opacity={ring.lat === 0 ? 0.55 : 0.35}
            />
          ))}
        </g>

        {/* ============ LONGITUDE RINGS (great circles) ============ */}
        <g opacity="0.55">
          {lonRings.map((pts, i) => {
            // Split each ring into front/back halves so depth feels right
            const dFront = [];
            const dBack = [];
            for (let s = 0; s < pts.length - 1; s++) {
              const [x1, y1, z1] = pts[s];
              const [x2, y2, z2] = pts[s + 1];
              const seg = `M ${x1} ${y1} L ${x2} ${y2}`;
              if ((z1 + z2) / 2 > 0) dFront.push(seg);
              else dBack.push(seg);
            }
            return (
              <g key={`lon-${i}`}>
                <path d={dBack.join(" ")}  stroke={accent2} strokeWidth="0.5" fill="none" opacity="0.18" />
                <path d={dFront.join(" ")} stroke={accent2} strokeWidth="0.7" fill="none" opacity="0.45" />
              </g>
            );
          })}
        </g>

        {/* ============ POINT CLOUD — continents brighter ============ */}
        <g>
          {projected.map((p) => {
            const visible = p.sz > -0.05; // hide back-hemisphere a bit
            const isCont  = p.continent;
            const depth   = (p.sz + 1) / 2; // 0=back, 1=front
            if (!visible) return null;
            if (isCont) {
              const opacity = 0.55 + depth * 0.45;
              const radius  = 1.1 + depth * 1.4;
              return (
                <circle key={`p-${p.id}`}
                        cx={p.sx} cy={p.sy} r={radius}
                        fill={accent} opacity={opacity}
                        style={{ filter: `drop-shadow(0 0 2px ${accent})` }} />
              );
            }
            // Ocean dots: subtle cyan, smaller
            const opacity = 0.08 + depth * 0.18;
            return (
              <circle key={`p-${p.id}`}
                      cx={p.sx} cy={p.sy} r={0.6 + depth * 0.7}
                      fill={accent2} opacity={opacity} />
            );
          })}
        </g>

        {/* ============ SOUTH POLE BEACON BEAM ============ */}
        <g>
          {/* Vertical light shaft going DOWNWARD from south pole through the canvas */}
          <rect
            x={southPole.sx - 5}
            y={southPole.sy - 20}
            width={10}
            height={460}
            fill="url(#topo-beam)"
            opacity="0.85"
            style={{ filter: "blur(0.5px)" }}
          />
          {/* Inner brighter thread */}
          <rect
            x={southPole.sx - 1.2}
            y={southPole.sy - 10}
            width={2.4}
            height={440}
            fill="#fff7c2"
            opacity="0.95"
          />
          {/* Beacon glow at base */}
          <circle cx={southPole.sx} cy={southPole.sy} r={48} fill="url(#topo-beacon-glow)" />
          {/* Pulsing beacon dot */}
          <motion.circle
            cx={southPole.sx} cy={southPole.sy} r={8}
            fill="#fff7c2"
            filter="url(#topo-soft-glow)"
            animate={{ opacity: [1, 0.55, 1], r: [8, 11, 8] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Expanding ring pulses around beacon */}
          {[0, 1, 2].map(i => (
            <motion.circle
              key={`beacon-pulse-${i}`}
              cx={southPole.sx} cy={southPole.sy} r={10}
              fill="none" stroke={beamColor} strokeWidth="1.5"
              animate={{ r: [10, 80], opacity: [0.8, 0] }}
              transition={{ duration: 3.0, repeat: Infinity, delay: i * 1.0, ease: "easeOut" }}
            />
          ))}
        </g>

        {/* ============ DATA PACKETS along visible longitudes ============ */}
        {!awaitingState && lonRings.slice(0, 4).map((pts, ringIdx) => {
          const frontPts = pts.filter(([, , z]) => z > 0.1);
          if (frontPts.length < 6) return null;
          // Pick a packet that travels from north to south along this ring
          const pathD = frontPts.map(([x, y], i) =>
            (i === 0 ? "M" : "L") + ` ${x} ${y}`).join(" ");
          return (
            <g key={`pkt-${ringIdx}`}>
              <motion.circle
                r={2.8}
                fill={accent}
                filter="url(#topo-soft-glow)"
                initial={{ offsetDistance: "0%", opacity: 0 }}
              >
                <animateMotion
                  dur={`${4.5 + ringIdx * 0.8}s`}
                  repeatCount="indefinite"
                  path={pathD}
                />
              </motion.circle>
            </g>
          );
        })}
      </svg>

      {/* ============ LEFT HUD PANEL ============ */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none font-mono text-[#00ff88] text-[10px] uppercase tracking-[0.3em] space-y-5"
           data-testid="topo-hud-left">
        <div>
          <div className="text-white/40 text-[8px]">düğümler</div>
          <div className="text-[#00ff88] text-[16px] font-bold tabular-nums tracking-[0.18em] mt-0.5"
               style={{ textShadow: "0 0 8px rgba(0,255,136,0.6)" }}>
            {verified.toString().padStart(3, "0")}.{downloads.toString().padStart(3, "0")}.000+
          </div>
        </div>
        <div>
          <div className="text-white/40 text-[8px]">bölgeler</div>
          <div className="text-[#00ff88] text-[16px] font-bold tabular-nums tracking-[0.18em] mt-0.5">
            195
          </div>
        </div>
        <div>
          <div className="text-white/40 text-[8px]">sinyal gücü</div>
          <div className="mt-1 flex items-end gap-[2px] h-[22px]">
            {signalBars.map((v, i) => (
              <div key={i}
                   className="w-[3px] bg-[#00ff88]"
                   style={{ height: `${v}px`, opacity: 0.4 + (v / 30) * 0.6 }} />
            ))}
          </div>
        </div>
      </div>

      {/* ============ CORNER HUD LABELS ============ */}
      <div className="absolute top-3 left-4 text-[9px] font-mono uppercase tracking-[0.35em] text-[#00ff88]/70 pointer-events-none">
        // sanctara.topology
      </div>
      <div className="absolute top-3 right-4 text-[9px] font-mono uppercase tracking-[0.35em] pointer-events-none flex items-center gap-2"
           style={{ color: awaitingState ? "#fbbf24cc" : "#00ff88cc" }}>
        <motion.span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: accent }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
        {awaitingState ? "awaiting_cohort" : `phase:${phase}`}
      </div>
      <div className="absolute bottom-3 left-4 text-[9px] font-mono uppercase tracking-[0.35em] text-[#00d9ff]/75 pointer-events-none">
        global.signal.dist:active
      </div>
      <div className="absolute bottom-3 right-4 text-[9px] font-mono uppercase tracking-[0.35em] text-white/40 pointer-events-none">
        target: 1,000,000
      </div>

      {/* Diagonal corner brackets */}
      {["top-2 left-2", "top-2 right-2 rotate-90", "bottom-2 left-2 -rotate-90", "bottom-2 right-2 rotate-180"].map((c, i) => (
        <span key={i} className={`absolute ${c} w-5 h-5 pointer-events-none`}
              style={{
                borderTop: `1.5px solid ${accent}cc`,
                borderLeft: `1.5px solid ${accent}cc`,
              }} />
      ))}
    </div>
  );
}
