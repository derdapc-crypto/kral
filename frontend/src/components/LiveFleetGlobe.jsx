import React, { useEffect, useMemo, useRef, useState } from "react";
import { Globe2 } from "lucide-react";

/**
 * LiveFleetGlobe — investor-grade rotating globe of every verified active
 * edge compute node on the operator's account.  Pure SVG (no three.js);
 * ships in <12kB and runs on any device including modest Android phones.
 *
 * Dots are colored by node state:
 *   gray  = idle
 *   cyan  = connected (heartbeat fresh)
 *   green = processing (native engine engaged on a verified compute unit)
 *   red   = attention (flagged)
 *
 * When a node transitions to "processing" we draw a green arc from the dot
 * toward the globe centre — represents verified compute unit flow back to
 * the grid HQ.  v1.5.4: no fake inflation.  If the operator has zero real
 * nodes the globe shows an explicit "AWAITING VERIFIED NODES" overlay.
 */

const W = 520, H = 520, CX = W / 2, CY = H / 2, R = 200;

function deterministicLatLng(id) {
  // Hash device id → lat/lng so dots stay stable across renders.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const lat = (((h % 140) - 70)); // -70..+69
  const lng = ((((h >> 8) % 360)) - 180); // -180..+179
  return { lat, lng };
}

function project(lat, lng, rotDeg) {
  // Orthographic projection, sphere rotated around Y by rotDeg degrees.
  const phi   = (lat * Math.PI) / 180;
  const theta = ((lng + rotDeg) * Math.PI) / 180;
  const x = Math.cos(phi) * Math.sin(theta);
  const y = -Math.sin(phi);
  const z = Math.cos(phi) * Math.cos(theta); // > 0 → front face
  return { x: CX + x * R, y: CY + y * R, visible: z > 0, z };
}

function deviceState(d) {
  if (d.flagged) return "attention";
  if (d.thermal === "warm" || d.thermal === "hot") return "paused";
  if (d.native_pow || d.mining_status === "mining") return "processing";
  if (d.status === "active") return "connected";
  return "idle";
}

export default function LiveFleetGlobe({ devices = [], testId = "live-fleet-globe" }) {
  const [rot, setRot] = useState(0);
  const rafRef = useRef();
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const tick = () => {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      setRot((elapsed * 6) % 360); // 60 sec per full revolution
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const dots = useMemo(() => devices.map((d) => {
    const ll = deterministicLatLng(d.id || d._id || String(d.name || "x"));
    return { id: d.id || d._id || d.name, lat: ll.lat, lng: ll.lng,
             state: deviceState(d), name: d.name || d.id };
  }), [devices]);

  const counts = dots.reduce((a, d) => { a[d.state] = (a[d.state] || 0) + 1; return a; }, {});

  return (
    <div className="landing-glass-strong p-6 relative overflow-hidden" data-testid={testId}>
      <div className="absolute -inset-1 pointer-events-none"
           style={{ background: "radial-gradient(circle at 50% 30%, rgba(0,212,255,0.06), transparent 60%)" }} />
      <div className="relative flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <div className="landing-pill info mb-2"><Globe2 className="w-3 h-3" /> Live Network</div>
          <h2 className="font-grotesk font-semibold text-white text-[20px]">Live Compute Fleet</h2>
          <p className="text-[12.5px] text-white/45 mt-1 font-sans-saas max-w-md">
            Your devices are connected to THE GRID's distributed compute layer.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10.5px] tracking-widest uppercase font-mono-tech">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background:"#00ff88", boxShadow:"0 0 6px #00ff88"}}/> processing {counts.processing || 0}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background:"#00d4ff", boxShadow:"0 0 6px #00d4ff"}}/> connected {counts.connected || 0}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white/40"/> idle {counts.idle || 0}</span>
          {counts.paused ? <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background:"#ff7a18"}}/> paused {counts.paused}</span> : null}
          {counts.attention ? <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400"/> attention {counts.attention}</span> : null}
        </div>
      </div>

      <div className="relative grid place-items-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[520px] aspect-square">
          <defs>
            <radialGradient id="globeFill" cx="35%" cy="30%" r="80%">
              <stop offset="0%"  stopColor="#0a3a4a" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#03171f" stopOpacity="1" />
              <stop offset="100%" stopColor="#01080c" stopOpacity="1" />
            </radialGradient>
            <radialGradient id="globeAtmos" cx="50%" cy="50%" r="55%">
              <stop offset="80%"  stopColor="rgba(0,212,255,0)" />
              <stop offset="98%"  stopColor="rgba(0,212,255,0.45)" />
              <stop offset="100%" stopColor="rgba(0,212,255,0)" />
            </radialGradient>
          </defs>

          {/* atmosphere */}
          <circle cx={CX} cy={CY} r={R + 14} fill="url(#globeAtmos)" />
          {/* sphere */}
          <circle cx={CX} cy={CY} r={R} fill="url(#globeFill)"
                  stroke="rgba(0,212,255,0.45)" strokeWidth="1" />

          {/* meridians + parallels (rotating) */}
          <g style={{ transformOrigin: `${CX}px ${CY}px`, transform: `rotate(${rot * 0.5}deg)` }}>
            {[-60, -30, 0, 30, 60].map((lat) => (
              <ellipse key={`p${lat}`} cx={CX} cy={CY + Math.sin(lat * Math.PI / 180) * R * 0.35}
                       rx={R * Math.cos(lat * Math.PI / 180)}
                       ry={R * Math.cos(lat * Math.PI / 180) * 0.18}
                       fill="none" stroke="rgba(0,255,225,0.13)" strokeWidth="0.5" />
            ))}
            {[0, 30, 60, 90, 120, 150].map((lng) => (
              <ellipse key={`m${lng}`} cx={CX} cy={CY}
                       rx={R * Math.abs(Math.sin((lng + rot * 0.4) * Math.PI / 180))}
                       ry={R}
                       fill="none" stroke="rgba(0,255,225,0.10)" strokeWidth="0.5" />
            ))}
          </g>

          {/* HQ pulse at centre */}
          <circle cx={CX} cy={CY} r="3.5" fill="var(--neon-green)"
                  style={{ filter: "drop-shadow(0 0 8px var(--neon-green))" }} />
          <circle cx={CX} cy={CY} r="3.5" fill="none" stroke="var(--neon-green)" strokeWidth="1">
            <animate attributeName="r" values="3.5;22;3.5" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0;1" dur="2.6s" repeatCount="indefinite" />
          </circle>

          {/* device dots + arcs */}
          {dots.map((d) => {
            const p = project(d.lat, d.lng, rot);
            if (!p.visible) return null;
            const cls = `fleet-dot ${d.state}`;
            const isProcessing = d.state === "processing";
            const r = isProcessing ? 4.5 : d.state === "connected" ? 3.2 : 2.4;
            return (
              <g key={d.id}>
                {isProcessing && (
                  <path d={`M ${p.x} ${p.y} Q ${(p.x + CX) / 2} ${(p.y + CY) / 2 - 40} ${CX} ${CY}`}
                        className="fleet-arc" />
                )}
                <circle cx={p.x} cy={p.y} r={r} className={cls}
                        data-testid={`fleet-dot-${d.id}`}>
                  <title>{d.name} · {d.state}</title>
                </circle>
              </g>
            );
          })}

          {/* v1.5.4 — awaiting state when there is zero real device data */}
          {dots.length === 0 && (
            <g data-testid="globe-awaiting-overlay">
              <rect x={CX - 130} y={CY + R + 22} width="260" height="32" rx="14"
                    fill="rgba(0,0,0,0.55)" stroke="rgba(0,217,255,0.3)" strokeWidth="0.5" />
              <text x={CX} y={CY + R + 42} textAnchor="middle"
                    style={{ fill: "#00d9ff", letterSpacing: "0.3em",
                             fontFamily: "var(--font-mono, monospace)", fontSize: 10 }}>
                AWAITING VERIFIED NODES
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
