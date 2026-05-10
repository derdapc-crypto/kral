import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Cpu, Smartphone, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";

/**
 * WarRoomHUD — investor-grade cockpit gauges sat above the Admin "War Map" tab.
 * Pulls already-existing endpoints (no new backend work):
 *   • /api/admin/hashrate        — total compute rate + series
 *   • /api/admin/telemetry?show_demo=false — active node count
 *   • /api/admin/mobile-mining/metrics     — mobile native H/s + accepted shares
 *
 * Each gauge: pulsing neon dot + animated number + sparkline / radial ring.
 * Designed to be read at-a-glance from across a boardroom.
 */

function Spark({ data = [], color = "var(--neon-green)" }) {
  // Mini pulse-line; data = array of numbers (newest last).
  if (!data || data.length < 2) {
    return <div className="h-6 w-full opacity-30 text-[10px] flex items-center font-mono-cyber">-- standby --</div>;
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const w = 120, h = 24;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => {
    const y = h - ((v - min) / (max - min || 1)) * h;
    return `${(i * step).toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const lastY = h - ((data[data.length - 1] - min) / (max - min || 1)) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-6">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill="url(#sparkGrad)" stroke="none" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
                style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
      <circle cx={w} cy={lastY} r="2.5" fill={color}
              style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  );
}

function RadialRing({ pct = 0, size = 56, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-progress"
              strokeWidth={stroke} fill="none" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={off} />
    </svg>
  );
}

function AnimatedNumber({ value, decimals = 0, className = "" }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const start = fromRef.current;
    const target = value;
    if (Math.abs(target - start) < 1e-9) return;
    let raf;
    const t0 = Date.now();
    const dur = 700;
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(start + (target - start) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className={`tabular-nums ${className}`}>
      {Number(shown).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}

function Gauge({ icon: Icon, label, value, decimals = 0, suffix = "", spark, ringPct, color, testId }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="hud-card p-4 sm:p-5 flex items-stretch gap-4" data-testid={testId}>
      <div className="flex flex-col items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="hud-pulse-dot" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
          {Icon && <Icon className="w-4 h-4" style={{ color }} />}
        </div>
        {ringPct !== undefined && (
          <div className="mt-2 relative">
            <RadialRing pct={ringPct} />
            <div className="absolute inset-0 grid place-items-center text-[9px] font-mono-cyber"
                 style={{ color }}>{Math.round(ringPct)}%</div>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/45 font-mono-cyber">{label}</div>
        <div className="mt-1 text-[28px] sm:text-[34px] font-display font-black leading-none"
             style={{ color, textShadow: `0 0 12px ${color}66` }}>
          <AnimatedNumber value={value} decimals={decimals} />
          {suffix && <span className="text-base text-white/50 ml-1.5 font-mono-cyber">{suffix}</span>}
        </div>
        <div className="mt-2"><Spark data={spark || []} color={color} /></div>
      </div>
    </motion.div>
  );
}

export default function WarRoomHUD() {
  const [activeNodes, setActiveNodes] = useState(0);
  const [activeNodesSeries, setActiveNodesSeries] = useState([]);
  const [totalHps, setTotalHps] = useState(0);
  const [totalSeries, setTotalSeries] = useState([]);
  const [mobileHps, setMobileHps] = useState(0);
  const [mobileSeries, setMobileSeries] = useState([]);
  const [acceptedToday, setAcceptedToday] = useState(0);
  const [acceptedSeries, setAcceptedSeries] = useState([]);

  const tick = async () => {
    try {
      const [tel, hr, mob] = await Promise.all([
        api.get("/admin/telemetry?show_demo=false"),
        api.get("/admin/hashrate"),
        api.get("/admin/mobile-mining/metrics").catch(() => ({ data: {} })),
      ]);
      const an = tel.data?.active_nodes ?? 0;
      const t  = hr.data?.total_hashrate_hps ?? 0;
      const m  = mob.data?.mobile_native_hashrate_hps ?? 0;
      const a  = (mob.data?.mobile_accepted_shares ?? 0)
               + (mob.data?.server_accepted_shares ?? 0);
      setActiveNodes(an);
      setTotalHps(t);
      setMobileHps(m);
      setAcceptedToday(a);
      setActiveNodesSeries((p) => [...p, an].slice(-30));
      setTotalSeries((p) => [...p, t].slice(-30));
      setMobileSeries((p) => [...p, m].slice(-30));
      setAcceptedSeries((p) => [...p, a].slice(-30));
    } catch {}
  };

  useEffect(() => {
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Soft thresholds for the radial rings — gives the cockpit a "% to next milestone" feel.
  const nodesRingPct = Math.min(100, (activeNodes / 50) * 100);
  const totalRingPct = Math.min(100, (totalHps / 100000) * 100);
  const mobileRingPct = Math.min(100, (mobileHps / 5000) * 100);
  const acceptedRingPct = Math.min(100, (acceptedToday / 100) * 100);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" data-testid="war-room-hud">
      <Gauge icon={Activity}      label="Active Nodes"           value={activeNodes}    decimals={0}
             color="#00ff88" spark={activeNodesSeries} ringPct={nodesRingPct} testId="hud-active-nodes" />
      <Gauge icon={Cpu}           label="Total Compute Rate"     value={totalHps}       decimals={0} suffix="H/s"
             color="#00d4ff" spark={totalSeries} ringPct={totalRingPct} testId="hud-total-compute" />
      <Gauge icon={Smartphone}    label="Mobile Native H/s"      value={mobileHps}      decimals={0} suffix="H/s"
             color="#00ff88" spark={mobileSeries} ringPct={mobileRingPct} testId="hud-mobile-native" />
      <Gauge icon={CheckCircle2}  label="Accepted Shares · 24h"  value={acceptedToday}  decimals={0}
             color="#ff7a18" spark={acceptedSeries} ringPct={acceptedRingPct} testId="hud-accepted-today" />
    </div>
  );
}
