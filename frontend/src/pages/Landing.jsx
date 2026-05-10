import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone, Cpu, ShieldCheck, BatteryCharging, Wifi, Thermometer,
  Hand, PowerOff, Layers, Server, Wallet, Terminal, ArrowRight,
  Check, Activity, Globe2, Briefcase, Download, FileCheck2,
  Lock, AlertTriangle, ArrowUpRight,
} from "lucide-react";
import { api } from "../lib/api";

/* ----------------------------- helpers ----------------------------- */
function useReveal() {
  const ref = React.useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setShown(true); },
      { threshold: 0.12 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return [ref, shown];
}

function useCountUp(target, dur = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = 0;
    const t0 = Date.now();
    let raf;
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(start + (Number(target) - start) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

/* ----------------------------- HERO ----------------------------- */
function HeroStatusPill({ tone = "info", flash = false, children, testId }) {
  return (
    <span className={`landing-pill ${tone} ${flash ? "pill-flash" : ""}`} data-testid={testId}>
      <span className="dot" /> {children}
    </span>
  );
}

function ComputeCoreVisual() {
  // SVG beams from satellites to nucleus center (relative to 460x460 viewBox)
  const beams = [
    { x: 60, y: 60 },   // top-left
    { x: 400, y: 60 },  // top-right
    { x: 30, y: 380 },  // bottom-left
    { x: 420, y: 410 }, // bottom-right
    { x: 470, y: 230 }, // right
  ];
  return (
    <div className="compute-core" data-testid="hero-compute-core">
      <span className="core-ring" />
      <span className="core-ring" />
      <span className="core-ring" />
      {/* beams */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 460 460">
        <defs>
          <linearGradient id="beamGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stopColor="rgba(0,212,255,0.0)" />
            <stop offset="55%" stopColor="rgba(0,255,225,0.55)" />
            <stop offset="100%" stopColor="rgba(0,255,225,0.0)" />
          </linearGradient>
        </defs>
        {beams.map((b, i) => (
          <line key={i} x1={b.x} y1={b.y} x2={230} y2={230}
                stroke="url(#beamGrad)" strokeWidth="1.2" className="beam-line"
                style={{ animationDelay: `${i * 0.7}s` }} />
        ))}
      </svg>
      <span className="core-nucleus" />
      <div className="node-sat sat-1"><Smartphone className="w-5 h-5" /></div>
      <div className="node-sat sat-2"><Smartphone className="w-5 h-5" /></div>
      <div className="node-sat sat-3"><Smartphone className="w-5 h-5" /></div>
      <div className="node-sat sat-4"><Smartphone className="w-5 h-5" /></div>
      <div className="node-sat sat-5"><Smartphone className="w-5 h-5" /></div>
    </div>
  );
}

function Hero({ stats, apk }) {
  // Detect when an important live signal changes and pulse the matching pill.
  const [flashNodes, setFlashNodes] = useState(false);
  const [flashShares, setFlashShares] = useState(false);
  const prevNodes = useRef(null);
  const prevShares = useRef(null);

  useEffect(() => {
    if (!stats) return;
    const newNodes = stats.mining_devices ?? 0;
    const newShares = stats.accepted_shares_total ?? 0;
    if (prevNodes.current !== null && newNodes !== prevNodes.current) {
      setFlashNodes(true);
      const t = setTimeout(() => setFlashNodes(false), 1200);
      return () => clearTimeout(t);
    }
    if (prevShares.current !== null && newShares > prevShares.current) {
      setFlashShares(true);
      const t = setTimeout(() => setFlashShares(false), 1200);
      return () => clearTimeout(t);
    }
  }, [stats?.mining_devices, stats?.accepted_shares_total]);

  useEffect(() => {
    if (stats) {
      prevNodes.current = stats.mining_devices ?? 0;
      prevShares.current = stats.accepted_shares_total ?? 0;
    }
  }, [stats]);

  return (
    <section className="relative pt-20 pb-28 md:pt-28 md:pb-36 px-6 sm:px-10 overflow-hidden" data-testid="hero">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-[1.15fr_1fr] gap-12 lg:gap-16 items-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <div className="flex flex-wrap gap-2 mb-7">
            <HeroStatusPill tone={apk == null ? "info" : apk?.native_lib_embedded ? "ok" : "warn"} testId="hero-status-pill">
              {apk == null ? "Loading status…" :
               apk?.native_lib_embedded ? `Native Engine v${apk.version} Ready` : "Native Engine Pending"}
            </HeroStatusPill>
            <HeroStatusPill tone={stats == null ? "info" : stats?.payout_wallet_verified ? "ok" : "warn"}>
              {stats == null ? "Checking wallet…" :
               stats?.payout_wallet_verified ? "Payout Wallet Verified" : "Payout Wallet Pending"}
            </HeroStatusPill>
            <HeroStatusPill tone={stats == null ? "info" : stats?.mining_devices > 0 ? "ok" : "info"}
                            flash={flashNodes} testId="pill-active-nodes">
              {stats == null ? "Checking network…" :
               stats?.mining_devices > 0
                ? `${stats.mining_devices} Active Compute Node${stats.mining_devices === 1 ? "" : "s"}`
                : "Awaiting first verified output"}
            </HeroStatusPill>
            {(stats?.accepted_shares_total ?? 0) > 0 && (
              <HeroStatusPill tone="gold" flash={flashShares} testId="pill-verified-outputs">
                {stats.accepted_shares_total} Verified Output{stats.accepted_shares_total === 1 ? "" : "s"}
              </HeroStatusPill>
            )}
          </div>
          <h1 className="font-grotesk font-bold leading-[1.02] text-white"
              style={{ fontSize: "clamp(40px, 6vw, 72px)", letterSpacing: "-0.025em" }}>
            Turn idle smartphones into a&nbsp;
            <span style={{
              background: "linear-gradient(90deg, #00ffe1 0%, #00d4ff 50%, #00ff88 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>verified compute network.</span>
          </h1>
          <p className="mt-7 text-[17px] leading-relaxed text-white/70 max-w-2xl font-sans-saas">
            THE GRID connects Android devices into a distributed compute layer
            for AI preprocessing, document workloads and verified micro-tasks.
            Devices opt in, run only under safe conditions, and contributors
            earn from verified compute output.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href={apk?.download_url || "/grid-worker-v1.3.8.apk"}
               className="landing-cta-primary inline-flex items-center gap-2"
               data-testid="hero-cta-download">
              <Download className="w-4 h-4" /> Download Android Node
            </a>
            <a href="#network" className="landing-cta-secondary inline-flex items-center gap-2"
               data-testid="hero-cta-network">
              <Activity className="w-4 h-4" /> View Live Network
            </a>
            <Link to="/register?role=customer" className="landing-cta-secondary inline-flex items-center gap-2"
                  data-testid="hero-cta-portal">
              <Briefcase className="w-4 h-4" /> Open Customer Portal
            </Link>
          </div>
          <div className="mt-6 text-[12px] text-white/40 font-mono-tech">
            {apk?.version
              ? `APK · v${apk.version} · ${(apk.size_bytes / 1024 / 1024).toFixed(2)} MB · signed v2+v3 · arm64-v8a`
              : "APK metadata loading…"}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.9, delay: 0.1 }}
                    className="relative grid place-items-center">
          <ComputeCoreVisual />
        </motion.div>
      </div>
    </section>
  );
}

/* ----------------------------- TRUST METRICS ----------------------------- */
function MetricCard({ label, value, sublabel, tone = "white", testId }) {
  // Render value either as a number (count-up) or as a raw label string
  const isNum = typeof value === "number";
  const animated = useCountUp(isNum ? value : 0);
  const [flash, setFlash] = useState(false);
  const prevRef = useRef(value);
  useEffect(() => {
    const changed = isNum
      ? Number(value) !== Number(prevRef.current)
      : String(value) !== String(prevRef.current);
    if (changed && prevRef.current !== undefined) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1100);
      prevRef.current = value;
      return () => clearTimeout(t);
    }
    prevRef.current = value;
  }, [value, isNum]);
  const toneCls = tone === "ok" ? "text-[#00ff88]" : tone === "warn" ? "text-[#ff7a18]" : tone === "info" ? "text-[#00d4ff]" : "text-white";
  return (
    <div className={`landing-glass p-6 sm:p-7 transition-all ${flash ? "metric-flash" : ""}`} data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono-tech mb-3">{label}</div>
      <div className={`font-grotesk font-bold leading-none ${toneCls}`} style={{ fontSize: "clamp(28px, 3.6vw, 40px)" }}>
        {isNum
          ? Number(animated).toLocaleString(undefined, { maximumFractionDigits: 0 })
          : value}
      </div>
      {sublabel && <div className="mt-3 text-[12px] text-white/45 font-mono-tech">{sublabel}</div>}
    </div>
  );
}

function TrustMetrics({ stats }) {
  const [ref, shown] = useReveal();
  const safe = stats || {};
  return (
    <section ref={ref} className={`px-6 sm:px-10 py-12 ${shown ? "" : "opacity-0"}`} data-testid="trust-metrics">
      <div className="max-w-7xl mx-auto">
        <div className="text-[11px] uppercase tracking-[0.3em] text-white/40 font-mono-tech mb-6 inline-flex items-center gap-2">
          <span className="dot w-1.5 h-1.5 rounded-full bg-[#00ff88]" style={{ boxShadow: "0 0 6px #00ff88" }} />
          Live · as of {safe.as_of ? new Date(safe.as_of).toLocaleTimeString() : "—"}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard label="Connected Devices" value={safe.connected_devices ?? 0}
                      sublabel="registered nodes" testId="metric-devices" />
          <MetricCard label="Active Compute Nodes" value={safe.mining_devices ?? 0}
                      sublabel={(safe.mining_devices ?? 0) === 0 ? "awaiting first cycle" : "processing now"}
                      tone={(safe.mining_devices ?? 0) > 0 ? "ok" : "white"}
                      testId="metric-active" />
          <MetricCard label="Verified Compute Rate"
                      value={safe.mobile_native_hashrate_label ?? "Waiting for verified output"}
                      sublabel="aggregated from verified nodes"
                      tone={(safe.mobile_native_hashrate_hps ?? 0) > 0 ? "ok" : "warn"}
                      testId="metric-hashrate" />
          <MetricCard label="Verified Outputs"
                      value={safe.accepted_shares_label ?? "Waiting for verified output"}
                      sublabel="checked by verification layer"
                      tone={(safe.accepted_shares_total ?? 0) > 0 ? "ok" : "warn"}
                      testId="metric-shares" />
          <MetricCard label="Backend Compute Engine"
                      value={safe.backend_miner?.status_label || "Core engine pending"}
                      sublabel="core processing layer"
                      tone={safe.backend_miner?.running ? "ok" : "warn"}
                      testId="metric-status" />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- HOW IT WORKS ----------------------------- */
function HowItWorks() {
  const steps = [
    { n: "01", title: "Install the Android Node", desc: "Users download the signed APK, opt in and accept the safety contract.",
      icon: Download, accent: "#00d4ff" },
    { n: "02", title: "Device Joins the Grid", desc: "Phone announces itself, sends heartbeat, health and availability signals.",
      icon: Wifi, accent: "#00ffe1" },
    { n: "03", title: "Safe Compute Starts", desc: "Compute begins only when the user permits and every safety rule passes.",
      icon: ShieldCheck, accent: "#00ff88" },
    { n: "04", title: "Verified Contribution Pays", desc: "Rewards are based on verified compute output — every work unit cleared by the verification layer.",
      icon: Wallet, accent: "#facc15" },
  ];
  return (
    <section id="how" className="px-6 sm:px-10 py-24 md:py-32" data-testid="how-it-works">
      <div className="max-w-7xl mx-auto">
        <div className="mb-14 max-w-3xl">
          <div className="landing-pill info mb-5"><span className="dot" /> Workflow</div>
          <h2 className="font-grotesk font-bold text-white" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
            How THE GRID works
          </h2>
          <p className="mt-4 text-white/60 text-[16px] font-sans-saas">
            From a phone in a desk drawer to a verified payout — every step is consent-driven and observable.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s, i) => (
            <motion.div key={s.n} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}
                        className="bento-card p-7 relative overflow-hidden" data-testid={`how-step-${i + 1}`}>
              <span className="accent-bar" />
              <div className="text-[11px] font-mono-tech mb-4" style={{ color: s.accent, opacity: 0.85 }}>{s.n} / step</div>
              <div className="w-11 h-11 rounded-xl grid place-items-center mb-5"
                   style={{ background: `${s.accent}15`, border: `1px solid ${s.accent}40` }}>
                <s.icon className="w-5 h-5" style={{ color: s.accent }} strokeWidth={1.6} />
              </div>
              <div className="font-grotesk font-semibold text-white text-[18px] mb-2">{s.title}</div>
              <div className="text-white/55 text-[14px] leading-relaxed font-sans-saas">{s.desc}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- PRODUCT PILLARS ----------------------------- */
function ProductPillars() {
  const pillars = [
    { icon: Layers,    title: "Mobile Compute Network",
      desc: "Distributed across Android devices in pockets, drawers and shelves — a verified compute layer that scales horizontally.",
      tech: "REST + WebSocket · device heartbeat & job scheduling", accent: "#00d4ff" },
    { icon: Cpu,       title: "Native Compute Engine",
      desc: "An NDK r28 native compute layer runs on arm64 phones — not a JavaScript proxy. Real on-device work, supervised by the safety contract.",
      tech: "native engine · light mode · 1–4 threads · v2+v3 signed", accent: "#00ffe1" },
    { icon: FileCheck2, title: "Verified Reward Ledger",
      desc: "Every contribution, every work unit and every payout is reconciled by the verification layer. No phantom credits.",
      tech: "audit chain · verification ACK reconciliation", accent: "#00ff88" },
    { icon: Terminal,  title: "Operator Command Center",
      desc: "Live observability for the entire fleet — gauges, console, contribution podium and device-health risk signals.",
      tech: "WebSocket streams · sub-second event latency", accent: "#facc15" },
  ];
  return (
    <section id="pillars" className="px-6 sm:px-10 py-24 md:py-32 border-t border-white/[0.04]" data-testid="product-pillars">
      <div className="max-w-7xl mx-auto">
        <div className="mb-14 max-w-3xl">
          <div className="landing-pill ok mb-5"><span className="dot" /> Platform</div>
          <h2 className="font-grotesk font-bold text-white" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
            The infrastructure behind THE GRID
          </h2>
          <p className="mt-4 text-white/60 text-[16px] font-sans-saas">
            Four independent layers — designed to compose, observable end-to-end, and built to be audited.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {pillars.map((p, i) => (
            <motion.div key={p.title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }} transition={{ duration: 0.55, delay: i * 0.08 }}
                        className="bento-card p-8" data-testid={`pillar-${i}`}>
              <span className="accent-bar" />
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 rounded-xl grid place-items-center shrink-0"
                     style={{ background: `${p.accent}10`, border: `1px solid ${p.accent}30` }}>
                  <p.icon className="w-5 h-5" style={{ color: p.accent }} strokeWidth={1.6} />
                </div>
                <div className="min-w-0">
                  <div className="font-grotesk font-semibold text-white text-[20px] mb-2.5">{p.title}</div>
                  <p className="text-white/60 text-[14.5px] leading-relaxed font-sans-saas">{p.desc}</p>
                  <div className="mt-4 text-[11.5px] font-mono-tech text-white/40">{p.tech}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- SAFETY & CONSENT ----------------------------- */
function SafetyConsent() {
  const cards = [
    { icon: Hand,            title: "Explicit user permission",  desc: "Compute never starts unless the device owner approves on every install." },
    { icon: BatteryCharging, title: "Charging-only mode",        desc: "Workloads pause whenever the device is on battery to protect daily use." },
    { icon: Wifi,            title: "Wi-Fi-only transport",      desc: "No cellular data spend — heartbeat and uploads gate on Wi-Fi connectivity." },
    { icon: Thermometer,     title: "Thermal guard",             desc: "Throttles automatically when CPU temperature crosses a safe threshold." },
    { icon: BatteryCharging, title: "Battery threshold",         desc: "Idle below 30% battery — the phone is yours first, the grid second." },
    { icon: PowerOff,        title: "Stop anytime",              desc: "One tap pauses compute. One uninstall removes everything cleanly." },
  ];
  return (
    <section id="safety" className="px-6 sm:px-10 py-24 md:py-32" data-testid="safety">
      <div className="max-w-7xl mx-auto">
        <div className="mb-14 max-w-3xl">
          <div className="landing-pill warn mb-5"><span className="dot" /> Safety</div>
          <h2 className="font-grotesk font-bold text-white" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
            Compute only when conditions are safe.
          </h2>
          <p className="mt-4 text-white/60 text-[16px] font-sans-saas">
            Six guards check every cycle before a single hash leaves the device.
            The user keeps the controls — always.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c, i) => (
            <motion.div key={c.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.05 }}
                        className="landing-glass p-6" data-testid={`safety-${i}`}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg grid place-items-center shrink-0"
                     style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.22)" }}>
                  <c.icon className="w-4.5 h-4.5" style={{ color: "#00ff88" }} strokeWidth={1.6} />
                </div>
                <div>
                  <div className="font-grotesk font-semibold text-white text-[16px]">{c.title}</div>
                  <div className="text-white/55 text-[13.5px] mt-1.5 leading-relaxed font-sans-saas">{c.desc}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- LIVE NETWORK ----------------------------- */
function NodeMesh({ stats }) {
  // Lightweight abstract mesh — 24 deterministic dots with light edges.
  const W = 540, H = 360;
  const nodes = React.useMemo(() => {
    const ns = [];
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const r = 90 + (i % 3) * 50;
      ns.push({
        id: i,
        x: W / 2 + Math.cos(angle) * r + Math.sin(i * 0.7) * 18,
        y: H / 2 + Math.sin(angle) * r * 0.85 + Math.cos(i * 0.5) * 14,
      });
    }
    return ns;
  }, []);
  const mining = stats?.mining_devices || 0;
  const active = stats?.active_devices || 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      <defs>
        <radialGradient id="meshCore" cx="50%" cy="50%" r="40%">
          <stop offset="0%" stopColor="rgba(0,255,225,0.9)" />
          <stop offset="60%" stopColor="rgba(0,212,255,0.25)" />
          <stop offset="100%" stopColor="rgba(0,212,255,0)" />
        </radialGradient>
      </defs>
      <circle cx={W / 2} cy={H / 2} r="90" fill="url(#meshCore)" opacity="0.5" />
      {nodes.map((n) => (
        <line key={`e${n.id}`} x1={W / 2} y1={H / 2} x2={n.x} y2={n.y}
              stroke="rgba(0,255,225,0.10)" strokeWidth="0.7" />
      ))}
      {nodes.map((n, i) => {
        // Color logic: first `mining` count = green, next `active-mining` count = blue, rest gray
        let color = "rgba(160,180,200,0.55)";
        if (i < mining) color = "#00ff88";
        else if (i < (active)) color = "#00d4ff";
        else if (i > 20) color = "rgba(255,122,24,0.85)";
        const r = (i < mining) ? 3.6 : 2.4;
        return (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={r} fill={color}
                    style={{ filter: i < (active) ? `drop-shadow(0 0 4px ${color})` : "none" }} />
          </g>
        );
      })}
      <circle cx={W / 2} cy={H / 2} r="4" fill="#fff" />
      <circle cx={W / 2} cy={H / 2} r="4" fill="none" stroke="#00ffe1" strokeWidth="1">
        <animate attributeName="r" values="4;20;4" dur="2.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0;1" dur="2.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

const SYNTHETIC_FEED = [
  { t: 0,    src: "node", lvl: "info", msg: "device · connected · NODE_a3f9b2" },
  { t: 1500, src: "node", lvl: "info", msg: "native engine · loaded · safety contract accepted" },
  { t: 3000, src: "core", lvl: "ok",   msg: "compute session · engaged · 4 threads" },
  { t: 4500, src: "core", lvl: "ok",   msg: "work unit · submitted to verification layer" },
  { t: 6000, src: "core", lvl: "ok",   msg: "output VERIFIED · credited to reward ledger" },
  { t: 7500, src: "node", lvl: "info", msg: "heartbeat · device 412e · battery 78% · charging" },
  { t: 9000, src: "node", lvl: "warn", msg: "thermal guard · throttling 2/4 cores · 41°C" },
  { t: 10500,src: "node", lvl: "ok",   msg: "thermal recovered · resuming · 36°C" },
];

function LiveNetwork({ stats }) {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      const ev = SYNTHETIC_FEED[i % SYNTHETIC_FEED.length];
      setEvents((p) => [{ ...ev, ts: new Date().toLocaleTimeString(), id: `${Date.now()}-${i}` }, ...p].slice(0, 8));
      i++;
    }, 1500);
    return () => clearInterval(id);
  }, []);
  return (
    <section id="network" className="px-6 sm:px-10 py-24 md:py-32 border-t border-white/[0.04]" data-testid="live-network">
      <div className="max-w-7xl mx-auto">
        <div className="mb-14 max-w-3xl">
          <div className="landing-pill info mb-5"><span className="dot" /> Observability</div>
          <h2 className="font-grotesk font-bold text-white" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
            Watch the network breathe.
          </h2>
          <p className="mt-4 text-white/60 text-[16px] font-sans-saas">
            Live event feed from connected nodes — every join, every verified output, every safety event surfaces in the operator console.
          </p>
        </div>
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
          <div className="landing-glass p-6 sm:p-8" data-testid="live-network-mesh">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45 font-mono-tech">
                <Globe2 className="w-3.5 h-3.5" /> Network topology · live preview
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono-tech text-white/45">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" /> processing</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff]" /> online</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-white/40" /> idle</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#ff7a18]" /> throttled</span>
              </div>
            </div>
            <div className="aspect-[3/2]">
              <NodeMesh stats={stats} />
            </div>
          </div>
          <div className="landing-glass p-5" data-testid="live-network-feed">
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45 font-mono-tech">
                <Terminal className="w-3.5 h-3.5" /> Operator feed · simulation
              </div>
              <span className="landing-pill info"><span className="dot" /> live</span>
            </div>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {events.map((ev) => (
                  <motion.div key={ev.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
                              className={`feed-row ${ev.lvl === "ok" ? "ok" : ev.lvl === "warn" ? "warn" : "info"}`}>
                    <span className="ts">[{ev.ts}]</span>&nbsp; <span className="text-white/45">{ev.src}</span>&nbsp; {ev.msg}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="mt-4 text-[10.5px] font-mono-tech text-white/35 px-2">
              · simulated for preview · production feed available in operator console
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- REVENUE FLOW ----------------------------- */
function RevenueFlow({ stats, apk }) {
  const steps = [
    { label: "Customer workload", sub: "or verified compute task", icon: Briefcase, accent: "#00d4ff" },
    { label: "Distribution layer", sub: "splits into small work units", icon: Layers, accent: "#00ffe1" },
    { label: "Verification layer", sub: "validates each output", icon: ShieldCheck, accent: "#00ffe1" },
    { label: "Contributor reward", sub: "weighted by verified output", icon: Layers, accent: "#00ff88" },
    { label: "User wallet",       sub: "threshold-gated payout", icon: Wallet, accent: "#facc15" },
  ];
  return (
    <section className="px-6 sm:px-10 py-24 md:py-32 border-t border-white/[0.04]" data-testid="revenue-flow">
      <div className="max-w-7xl mx-auto">
        <div className="mb-14 max-w-3xl">
          <div className="landing-pill gold mb-5"><span className="dot" /> Rewards</div>
          <h2 className="font-grotesk font-bold text-white" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
            From verified compute to user rewards.
          </h2>
          <p className="mt-4 text-white/60 text-[16px] font-sans-saas">
            Every reward originates from a verification-layer ACK or a verified customer workload — never from extrapolated estimates.
          </p>
        </div>
        <div className="landing-glass-strong p-6 sm:p-10">
          <div className="flex flex-col md:flex-row md:items-stretch md:gap-2 gap-4">
            {steps.map((s, i) => (
              <React.Fragment key={s.label}>
                <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.08 }}
                            className="bento-card p-6 flex-1 min-w-0">
                  <span className="accent-bar" />
                  <div className="w-10 h-10 rounded-xl grid place-items-center mb-4"
                       style={{ background: `${s.accent}12`, border: `1px solid ${s.accent}35` }}>
                    <s.icon className="w-4.5 h-4.5" style={{ color: s.accent }} strokeWidth={1.6} />
                  </div>
                  <div className="text-[10px] font-mono-tech mb-1" style={{ color: s.accent, opacity: 0.85 }}>
                    {String(i + 1).padStart(2, "0")} / phase
                  </div>
                  <div className="font-grotesk font-semibold text-white text-[16px]">{s.label}</div>
                  <div className="mt-2 text-white/50 text-[13px] font-sans-saas">{s.sub}</div>
                </motion.div>
                {i < steps.length - 1 && (
                  <div className="hidden md:flex items-center justify-center text-white/25 px-1 shrink-0">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-8 pt-6 border-t border-white/[0.06] flex flex-wrap gap-2">
            <span className="landing-pill ok"><Check className="w-3 h-3" />payout wallet {stats?.payout_wallet_verified ? "verified" : "pending"}</span>
            <span className="landing-pill info"><span className="dot" />verification layer reconciliation</span>
            <span className="landing-pill info"><span className="dot" />reward = verified outputs × tier weight</span>
            <span className="landing-pill warn"><span className="dot" />minimum payout threshold</span>
            <span className="landing-pill gold"><span className="dot" />contribution score per user</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- COMMAND CENTER PREVIEW ----------------------------- */
function CommandCenterPreview() {
  return (
    <section className="px-6 sm:px-10 py-24 md:py-32 border-t border-white/[0.04]" data-testid="command-preview">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-[1fr_1.15fr] gap-12 items-center">
        <div>
          <div className="landing-pill info mb-5"><span className="dot" /> Operator</div>
          <h2 className="font-grotesk font-bold text-white" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
            Grid Command Center
          </h2>
          <p className="mt-4 text-white/60 text-[16px] font-sans-saas max-w-xl">
            A purpose-built console for the team running the fleet — gauges, live operator feed, verified-output podium and risk signals. Built for visibility and response, not for spectacle.
          </p>
          <ul className="mt-7 space-y-3 text-[14.5px] text-white/70 font-sans-saas">
            <li className="flex items-start gap-3"><Check className="w-4 h-4 mt-0.5 text-[#00ff88] shrink-0" /> Active nodes, processing devices, compute throughput at-a-glance</li>
            <li className="flex items-start gap-3"><Check className="w-4 h-4 mt-0.5 text-[#00ff88] shrink-0" /> Live operator feed with verified-output highlights</li>
            <li className="flex items-start gap-3"><Check className="w-4 h-4 mt-0.5 text-[#00ff88] shrink-0" /> Device health, risk signals, payout queue</li>
            <li className="flex items-start gap-3"><Check className="w-4 h-4 mt-0.5 text-[#00ff88] shrink-0" /> WebSocket-streamed, sub-second latency</li>
          </ul>
          <Link to="/admin" className="mt-8 landing-cta-secondary inline-flex items-center gap-2" data-testid="cmd-preview-cta">
            Open command center <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="landing-glass-strong p-6 sm:p-8">
          {/* mini HUD mockup */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { l: "Active Nodes",    v: "—", c: "#00ff88" },
              { l: "Total Compute",   v: "—",  c: "#00d4ff" },
              { l: "Mobile Native",   v: "Pending", c: "#00ff88" },
              { l: "Accepted · 24h",  v: "—", c: "#facc15" },
            ].map((m) => (
              <div key={m.l} className="bento-card p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono-tech">{m.l}</div>
                <div className="mt-2 font-grotesk font-bold text-[24px]" style={{ color: m.c }}>{m.v}</div>
                <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full" style={{ width: "32%", background: m.c, opacity: 0.7 }} />
                </div>
              </div>
            ))}
          </div>
          <div className="bento-card p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono-tech inline-flex items-center gap-2">
                <Terminal className="w-3 h-3" /> live operator feed
              </div>
              <span className="landing-pill ok"><span className="dot" /> live</span>
            </div>
            <div className="space-y-1.5">
              <div className="feed-row ok">[—] core · work unit VERIFIED · credited to ledger</div>
              <div className="feed-row info">[—] node · NODE_a3f9b2 · heartbeat · battery 78%</div>
              <div className="feed-row info">[—] core · new work unit assigned</div>
              <div className="feed-row warn">[—] node · thermal guard · throttle 2/4</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- DUAL CTA ----------------------------- */
function DualCTA({ apk }) {
  return (
    <section className="px-6 sm:px-10 py-24 md:py-32 border-t border-white/[0.04]" data-testid="dual-cta">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-5">
        <div className="landing-glass-strong p-10" data-testid="cta-contributor">
          <div className="landing-pill ok mb-5"><Smartphone className="w-3 h-3" /> For Contributors</div>
          <h3 className="font-grotesk font-bold text-white text-[28px] leading-tight">
            Install the Android Node. Earn from verified contribution.
          </h3>
          <p className="mt-4 text-white/60 font-sans-saas">
            Opt in once. Compute runs only when your phone is plugged in, cool and on Wi-Fi. Rewards are reconciled against verified compute output.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href={apk?.download_url || "/grid-worker-v1.3.8.apk"} className="landing-cta-primary inline-flex items-center gap-2"
               data-testid="cta-contributor-download">
              <Download className="w-4 h-4" /> Download Node v{apk?.version || "1.3.8"}
            </a>
            <Link to="/register" className="landing-cta-secondary inline-flex items-center gap-2">
              Create contributor account <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        <div className="landing-glass-strong p-10" data-testid="cta-customer">
          <div className="landing-pill info mb-5"><Briefcase className="w-3 h-3" /> For Customers</div>
          <h3 className="font-grotesk font-bold text-white text-[28px] leading-tight">
            Route workloads to distributed mobile compute.
          </h3>
          <p className="mt-4 text-white/60 font-sans-saas">
            Submit verified compute jobs against the network. Pay for accepted output. Observe execution end-to-end through the customer portal.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/register?role=customer" className="landing-cta-primary inline-flex items-center gap-2"
                  data-testid="cta-customer-portal">
              <Briefcase className="w-4 h-4" /> Open Customer Portal
            </Link>
            <Link to="/dashboard" className="landing-cta-secondary inline-flex items-center gap-2">
              Operator dashboard <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- FOOTER ----------------------------- */
function Footer({ apk }) {
  return (
    <footer className="px-6 sm:px-10 pt-16 pb-10 border-t border-white/[0.06] mt-12" data-testid="footer">
      <div className="max-w-7xl mx-auto grid md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-10">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 rounded-lg grid place-items-center"
                 style={{ background: "linear-gradient(135deg, #00ffe1, #00d4ff)" }}>
              <Cpu className="w-4 h-4 text-black" strokeWidth={2.4} />
            </div>
            <span className="font-grotesk font-bold text-white text-[17px]">THE GRID</span>
          </div>
          <p className="text-[13.5px] text-white/45 leading-relaxed font-sans-saas max-w-sm">
            Distributed mobile compute, designed for safety, observability and verification-layer rewards.
          </p>
          <div className="mt-5 text-[11px] font-mono-tech text-white/30">
            APK v{apk?.version} · sha256 {apk?.sha256?.slice(0, 12) || "—"}…
          </div>
        </div>
        <FooterCol title="Product" links={[
          ["Mobile Node", "#how"], ["Engine", "#pillars"], ["Safety", "#safety"], ["Network", "#network"],
        ]} />
        <FooterCol title="Network" links={[
          ["Live status", "#network"], ["Command center", "/admin"], ["Operator dashboard", "/dashboard"],
        ]} />
        <FooterCol title="Rewards" links={[
          ["Reward model", "/#rewards"], ["Payout threshold", "/#rewards"], ["Contribution score", "/#rewards"],
        ]} />
        <FooterCol title="Company" links={[
          ["Docs", "#"], ["Privacy", "#"], ["Terms", "#"], ["Contact", "mailto:hello@thegrid.io"],
        ]} testId="footer-company" />
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-white/[0.05] flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] text-white/35 font-sans-saas">© THE GRID · All rights reserved.</div>
        <div className="flex items-center gap-2 text-[11px] font-mono-tech text-white/35">
          <Lock className="w-3 h-3" /> consent-driven · audit-logged · verification-backed
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links, testId }) {
  return (
    <div data-testid={testId}>
      <div className="font-grotesk font-semibold text-white text-[13px] mb-4">{title}</div>
      <ul className="space-y-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-[13px] text-white/50 hover:text-white transition-colors font-sans-saas">{label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------- WHY REWARDS ----------------------------- */
function WhyRewards() {
  return (
    <section className="px-6 sm:px-10 pt-8 pb-20" data-testid="why-rewards">
      <div className="max-w-7xl mx-auto landing-glass-strong p-8 sm:p-12 grid lg:grid-cols-[1fr_1.4fr] gap-10 items-start">
        <div>
          <div className="landing-pill gold mb-5"><span className="dot" /> Why this earns rewards</div>
          <h2 className="font-grotesk font-bold text-white" style={{ fontSize: "clamp(26px, 3.4vw, 38px)" }}>
            Idle device power, turned into verifiable work units.
          </h2>
        </div>
        <div className="text-white/65 text-[15.5px] leading-relaxed font-sans-saas space-y-4">
          <p>
            THE GRID converts unused device capacity into <span className="text-white">verifiable work units</span>.
            When a device joins the network, it only runs with the user's explicit permission and only when battery,
            thermal and network conditions are safe.
          </p>
          <p>
            Completed work passes through the <span className="text-white">verification layer</span>. Outputs that
            fail validation are excluded from rewards. Verified contributions are added to the user's
            <span className="text-white"> reward balance</span>.
          </p>
          <p>
            Technical compute engines run quietly in the background. On the user side, the only metrics that
            matter are <span className="text-[#00ff88]">Verified Work Units</span> and
            <span className="text-[#00ff88]"> Reward Balance</span>.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- REVENUE FLOW DETAIL ----------------------------- */
function RevenueFlowDetail() {
  const phases = [
    {
      n: "01", t: "Work source",
      d: "A customer workload or a verifiable compute task enters the system.",
      icon: Briefcase, accent: "#00d4ff",
    },
    {
      n: "02", t: "Distribution layer",
      d: "Tasks are split into small work units and routed to suitable devices.",
      icon: Layers, accent: "#00ffe1",
    },
    {
      n: "03", t: "Verification layer",
      d: "Outputs are checked. Fake or failed results never reach reward calculation.",
      icon: ShieldCheck, accent: "#00ff88",
    },
    {
      n: "04", t: "Reward layer",
      d: "Verified contributions land in the user's Reward Balance. Payouts run once the threshold is met.",
      icon: Wallet, accent: "#facc15",
    },
  ];
  return (
    <section className="px-6 sm:px-10 py-24 md:py-28 border-t border-white/[0.04]" data-testid="revenue-flow-detail">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12 max-w-3xl">
          <div className="landing-pill info mb-5"><span className="dot" /> Revenue flow</div>
          <h2 className="font-grotesk font-bold text-white" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
            How revenue flows through the network.
          </h2>
          <p className="mt-4 text-white/60 text-[16px] font-sans-saas">
            Four explicit phases, every one independently observable. No estimated metrics — only what the verification layer accepts.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {phases.map((p, i) => (
            <motion.div key={p.n} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.08 }}
                        className="bento-card p-7" data-testid={`phase-${i + 1}`}>
              <span className="accent-bar" />
              <div className="text-[10px] font-mono-tech mb-3" style={{ color: p.accent, opacity: 0.85 }}>{p.n} / phase</div>
              <div className="w-11 h-11 rounded-xl grid place-items-center mb-4"
                   style={{ background: `${p.accent}15`, border: `1px solid ${p.accent}40` }}>
                <p.icon className="w-5 h-5" style={{ color: p.accent }} strokeWidth={1.6} />
              </div>
              <div className="font-grotesk font-semibold text-white text-[17px] mb-2">{p.t}</div>
              <div className="text-white/55 text-[13.5px] leading-relaxed font-sans-saas">{p.d}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================== ROOT ============================== */
export default function Landing() {
  const [stats, setStats] = useState(null);
  const [apk, setApk] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [s, a] = await Promise.all([
          api.get("/stats/public").catch(() => ({ data: null })),
          api.get("/apk/version").catch(() => ({ data: null })),
        ]);
        if (!mounted) return;
        setStats(s.data || {});
        setApk(a.data || {});
      } catch {}
    };
    load();
    const id = setInterval(load, 12000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return (
    <main className="landing-root font-sans-saas" data-testid="landing-page">
      <Hero stats={stats} apk={apk} />
      <TrustMetrics stats={stats} />
      <WhyRewards />
      <HowItWorks />
      <RevenueFlowDetail />
      <ProductPillars />
      <SafetyConsent />
      <LiveNetwork stats={stats} />
      <RevenueFlow stats={stats} apk={apk} />
      <CommandCenterPreview />
      <DualCTA apk={apk} />
      <Footer apk={apk} />
    </main>
  );
}
