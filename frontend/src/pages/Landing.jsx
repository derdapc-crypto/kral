/*
 * THE GRID — Landing (vNext "Immersive Authority Surface")
 *
 * Total rewrite per /app/design_guidelines.json:
 * 8 sections, each its own visual language. No card-stacked dashboard.
 *   1. Cinematic Hero (full-viewport split)
 *   2. Live Network Command Panel (full-width telemetry ribbon)
 *   3. Compute-Time Receipt Manifesto (split-screen)
 *   4. Scarcity Progress Console (massive 1M neon bar)
 *   5. Premium APK Deployment Module (VERIFIED BUILD console)
 *   6. Foundation Buyback Policy Panel (rigid swiss grid)
 *   7. B2B SaaS Compute Surface Preview (parallax mockup)
 *   8. Final CTA Wall (massive trigger)
 *
 * Backend bindings preserved: /api/network/scarcity-progress,
 * /api/apk/version, /api/token/launch, /api/foundation/buyback-status
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Cpu, Activity, ArrowRight, ArrowUpRight, Download, Server,
  ShieldCheck, Lock, FileCheck2, Terminal, Globe2, Sparkles,
  Briefcase, ChevronRight, Layers,
} from "lucide-react";
import QRCode from "qrcode";
import NetworkTopology from "../components/NetworkTopology";
import TotalTgcCounter from "../components/TotalTgcCounter";
import DualClientDownload from "../components/DualClientDownload";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";

/* ============================================================ */
/*  PAGE                                                        */
/* ============================================================ */
export default function Landing() {
  const [scarcity, setScarcity] = useState(null);
  const [apk, setApk] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const s = await fetch(`${BACKEND}/api/network/scarcity-progress`).then(r => r.json());
        setScarcity(s);
      } catch {}
      try {
        const a = await fetch(`${BACKEND}/api/apk/version`).then(r => r.json());
        setApk(a);
      } catch {}
    };
    load();
    const t = setInterval(load, 25_000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="bg-black text-white antialiased selection:bg-[#00ff88] selection:text-black overflow-x-hidden" data-testid="landing-page">
      <BackgroundSystem />
      <NavBar apk={apk} />
      <Hero scarcity={scarcity} apk={apk} />
      <LiveCommandPanel scarcity={scarcity} />
      <ManifestoSection />
      <ScarcityConsole scarcity={scarcity} />
      <DeploymentModule />
      <DualClientDownload origin={typeof window !== "undefined" ? window.location.origin : ""} />
      <BuybackPolicyPanel />
      <B2BPreview />
      <FinalCTA apk={apk} />
      <FooterStrip apk={apk} />
    </main>
  );
}

/* ============================================================ */
/*  Background System — 5 layered cinematic ambient layers      */
/* ============================================================ */
function BackgroundSystem() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {/* layer 1 — pure black floor */}
      <div className="absolute inset-0 bg-black" />

      {/* layer 2 — circuit grid (SVG repeating, soft fade) */}
      <div className="absolute inset-0 opacity-[0.4]"
           style={{
             backgroundImage:
               "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), " +
               "linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
             backgroundSize: "44px 44px",
             maskImage: "radial-gradient(ellipse at 50% 30%, black 35%, transparent 78%)",
             WebkitMaskImage: "radial-gradient(ellipse at 50% 30%, black 35%, transparent 78%)",
           }} />

      {/* layer 3 — radial neon glows */}
      <div className="absolute -top-32 -left-32 w-[720px] h-[720px] rounded-full blur-[140px] opacity-[0.16]"
           style={{ background: "radial-gradient(circle, #00ff88 0%, transparent 60%)" }} />
      <div className="absolute top-1/3 -right-40 w-[640px] h-[640px] rounded-full blur-[140px] opacity-[0.14]"
           style={{ background: "radial-gradient(circle, #00d9ff 0%, transparent 60%)" }} />
      <div className="absolute bottom-0 left-1/4 w-[800px] h-[420px] rounded-full blur-[160px] opacity-[0.10]"
           style={{ background: "radial-gradient(circle, #6c7bff 0%, transparent 60%)" }} />

      {/* layer 4 — slow moving beams */}
      <motion.div className="absolute top-[18%] -left-[10%] w-[60%] h-px"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(0,217,255,0.4), transparent)" }}
                  animate={{ x: ["0%", "180%"] }}
                  transition={{ duration: 14, repeat: Infinity, ease: "linear" }} />
      <motion.div className="absolute top-[62%] -left-[10%] w-[55%] h-px"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(0,255,136,0.35), transparent)" }}
                  animate={{ x: ["0%", "180%"] }}
                  transition={{ duration: 18, repeat: Infinity, ease: "linear", delay: 4 }} />

      {/* layer 5 — scanline + grain */}
      <div className="absolute inset-0"
           style={{
             backgroundImage:
               "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)",
             mixBlendMode: "multiply", opacity: 0.5,
           }} />
      <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
           style={{
             backgroundImage:
               "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
           }} />
    </div>
  );
}

/* ============================================================ */
/*  NavBar — minimal, command-bar style                         */
/* ============================================================ */
function NavBar({ apk }) {
  return (
    <header className="fixed top-0 inset-x-0 z-40 border-b border-white/[0.06] bg-black/55 backdrop-blur-xl"
            data-testid="nav-bar">
      <div className="max-w-[1240px] mx-auto px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5" data-testid="nav-home">
          <div className="w-7 h-7 rounded-md border border-[#00ff88]/40 grid place-items-center bg-black">
            <Cpu className="w-3.5 h-3.5 text-[#00ff88]" />
          </div>
          <div className="font-mono uppercase tracking-[0.3em] text-[11px] text-white">the.grid</div>
          <span className="hidden sm:inline-block text-[9px] uppercase tracking-[0.3em] text-white/35 border-l border-white/10 pl-2.5 ml-1">
            distributed compute · pre-mainnet
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-[11px] uppercase tracking-[0.25em] text-white/65">
          <a href="#network"  className="hover:text-white transition">network</a>
          <a href="#protocol" className="hover:text-white transition">protocol</a>
          <a href="#deploy"   className="hover:text-white transition">deploy</a>
          <Link to="/token"   className="hover:text-white transition">tgc</Link>
          <Link to="/customer"className="hover:text-white transition">enterprise</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="text-[11px] uppercase tracking-[0.25em] text-white/55 hover:text-white px-2.5 py-1.5"
                data-testid="nav-signin">sign in</Link>
          <a href={apk?.download_url || "#deploy"}
             data-testid="nav-deploy"
             className="text-[10px] font-mono uppercase tracking-[0.3em] px-3 py-1.5 rounded-md bg-[#00ff88] text-black font-bold
                        shadow-[0_0_24px_-4px_rgba(0,255,136,0.55)] hover:shadow-[0_0_36px_-4px_rgba(0,255,136,0.85)] transition">
            deploy node
          </a>
        </div>
      </div>
    </header>
  );
}

/* ============================================================ */
/*  1. Cinematic Hero — full viewport split                     */
/* ============================================================ */
function Hero({ scarcity, apk }) {
  const verified = scarcity?.verified_active_nodes ?? 0;
  const phase    = (scarcity?.phase || "growth").toUpperCase();

  return (
    <section className="relative min-h-[88vh] flex items-center pt-20 pb-12 px-6 lg:px-8" data-testid="hero">
      <div className="max-w-[1240px] mx-auto w-full grid lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-12 items-center">

        {/* LEFT — Brutalist headline */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
          {/* eyebrow */}
          <div className="flex items-center gap-3 mb-8">
            <span className="inline-block w-2 h-2 rounded-full bg-[#00ff88] shadow-[0_0_10px_2px_rgba(0,255,136,0.65)]" />
            <span className="font-mono uppercase tracking-[0.4em] text-[10px] text-white/65">
              global.distributed.compute / pre-mainnet
            </span>
          </div>

          <h1 className="font-display text-white break-words"
              style={{
                fontSize: "clamp(38px, 5.6vw, 84px)",
                lineHeight: "0.94",
                letterSpacing: "-0.045em",
                fontWeight: 600,
              }}>
            Idle&nbsp;devices.<br/>
            <span style={{
              background: "linear-gradient(96deg, #00ff88 0%, #00d9ff 55%, #6c7bff 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>Verified&nbsp;compute.</span><br/>
            <span className="text-white/65">Global&nbsp;scale.</span>
          </h1>

          <p className="mt-7 text-[15px] leading-relaxed text-white/55 max-w-[500px]">
            THE GRID transforms ordinary phones into a verified distributed compute layer.
            Every cycle is recorded as a <span className="text-[#00ff88]">compute-time receipt</span> —
            a pre-mainnet protocol bound to <em className="not-italic text-white">verified network growth</em>,
            not an arbitrary countdown.
          </p>

          {/* CTA */}
          <div className="mt-8 flex flex-wrap gap-3 items-center">
            <a href={apk?.download_url || "#deploy"}
               data-testid="hero-cta-primary"
               className="group inline-flex items-center gap-3 px-5 py-3 rounded-md bg-[#00ff88] text-black font-mono font-bold text-[11px] uppercase tracking-[0.3em]
                          shadow-[0_0_48px_-12px_rgba(0,255,136,0.7)] hover:shadow-[0_0_64px_-12px_rgba(0,255,136,1)] transition-all">
              <Download className="w-4 h-4" />
              deploy node client
              <ArrowRight className="w-4 h-4 -mr-1 group-hover:translate-x-1 transition-transform" />
            </a>
            <Link to="/token"
                  data-testid="hero-cta-protocol"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-white/15 hover:border-white/40 text-white/85 hover:text-white
                             font-mono text-[11px] uppercase tracking-[0.3em] transition-colors">
              read protocol
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>

          {/* tiny telemetry foot */}
          <div className="mt-10 grid grid-cols-3 gap-px bg-white/[0.06] max-w-[480px]" data-testid="hero-telemetry-strip">
            <FootMetric label="VERIFIED NODES"  value={verified.toLocaleString()} tone="matrix" />
            <FootMetric label="TGC RECEIPTS"    value={Number(scarcity?.total_tgc_issued || 0).toLocaleString(undefined,{minimumFractionDigits:5,maximumFractionDigits:5})} tone="cyan" />
            <FootMetric label="PHASE"           value={phase}                     tone="violet" />
          </div>
        </motion.div>

        {/* RIGHT — Topology centerpiece */}
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                    className="relative aspect-square w-full max-w-[460px] lg:max-w-[520px] mx-auto"
                    style={{ maxHeight: "min(64vh, 520px)" }}>
          {/* black bordered window */}
          <div className="absolute inset-0 border border-white/[0.08] rounded-lg bg-black/55 overflow-hidden">
            <NetworkTopology className="w-full h-full" />
          </div>
          {/* corner crosshair marks */}
          {["top-0 left-0", "top-0 right-0 rotate-90", "bottom-0 left-0 -rotate-90", "bottom-0 right-0 rotate-180"].map((c, i) => (
            <span key={i} className={`absolute ${c} w-3 h-3 border-l border-t border-[#00ff88]/65 m-2`} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function FootMetric({ label, value, tone }) {
  const color = tone === "matrix" ? "#00ff88" : tone === "cyan" ? "#00d9ff" : "#6c7bff";
  return (
    <div className="bg-black px-3 py-2.5" data-testid={`foot-${label.toLowerCase().replace(/\s/g,'-')}`}>
      <div className="font-mono uppercase tracking-[0.25em] text-[9px] text-white/40">{label}</div>
      <div className="font-mono font-bold text-[16px] mt-1 tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

/* ============================================================ */
/*  2. Live Network Command Panel — full-width ribbon           */
/* ============================================================ */
function LiveCommandPanel({ scarcity }) {
  const verified = scarcity?.verified_active_nodes ?? 0;
  const target   = scarcity?.target_active_nodes ?? 1_000_000;
  const pct      = scarcity?.progress_pct ?? 0;

  return (
    <section className="relative py-5 border-y border-white/[0.06] bg-black/80 backdrop-blur" id="network" data-testid="live-command-panel">
      {/* sweeping vertical beam */}
      <motion.div className="absolute top-0 bottom-0 w-px"
                  style={{ background: "linear-gradient(180deg, transparent, rgba(0,255,136,0.55), transparent)" }}
                  animate={{ x: [0, 1240] }}
                  transition={{ duration: 9, repeat: Infinity, ease: "linear" }} />
      <div className="max-w-[1240px] mx-auto px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="motion-telemetry-blink w-2 h-2 rounded-full bg-[#00ff88]" />
          <span className="font-mono uppercase tracking-[0.4em] text-[9px] text-white/45">
            // live.command.feed — verified telemetry only
          </span>
          <span className="ml-auto font-mono uppercase tracking-[0.25em] text-[10px] text-white/45 tabular-nums">
            t-{(Date.now()/1000).toFixed(0)}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-px bg-white/[0.05]">
          <RibbonCell label="VERIFIED_NODES"     value={verified.toLocaleString()}                           tone="matrix" />
          <RibbonCell label="NETWORK_TARGET"     value={target.toLocaleString()} />
          <RibbonCell label="PROGRESS"           value={`${pct.toFixed(4)}%`}                                tone="cyan" />
          <RibbonCell label="PHASE"              value={(scarcity?.phase || "growth").toUpperCase()}         tone="violet" />
          <RibbonCell label="LEDGER"             value="SEALED · PRE-MAINNET"                                tone="amber" />
          <RibbonCell label="BUYBACK_WINDOW"     value="CLOSED"                                              tone="amber" />
        </div>
      </div>
    </section>
  );
}

function RibbonCell({ label, value, tone }) {
  const color = tone === "matrix" ? "#00ff88"
              : tone === "cyan"   ? "#00d9ff"
              : tone === "violet" ? "#6c7bff"
              : tone === "amber"  ? "#fbbf24"
              : "#f5f7fa";
  return (
    <div className="bg-black px-4 py-4">
      <div className="font-mono uppercase tracking-[0.25em] text-[9px] text-white/35">{label}</div>
      <div className="font-mono font-bold text-[16px] md:text-[18px] mt-1 tabular-nums truncate" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

/* ============================================================ */
/*  3. Compute-Time Receipt Manifesto — split screen            */
/* ============================================================ */
function ManifestoSection() {
  return (
    <section className="relative py-20 px-6 lg:px-8" id="protocol" data-testid="manifesto">
      <div className="max-w-[1240px] mx-auto grid lg:grid-cols-[1fr_1fr] gap-12 items-center">
        <motion.div initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
          <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#00ff88]/85 mb-5">
            // protocol.thesis
          </div>
          <h2 className="font-display text-white"
              style={{ fontSize: "clamp(30px, 3.6vw, 54px)", lineHeight: 0.96, letterSpacing: "-0.04em", fontWeight: 600 }}>
            Useful compute,<br/>
            <span style={{ background:"linear-gradient(96deg, #00ff88, #00d9ff)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              recorded as contribution.
            </span>
          </h2>
          <div className="mt-8 space-y-4 text-white/55 leading-relaxed text-[14px] max-w-xl">
            <p>$TGC is <span className="text-white">not a coin</span>. It is the cryptographic receipt of every verified compute cycle the network has consumed.</p>
            <p>Each edge node submits proof of useful work — small, signed, deterministic packets. The protocol seals them into an immutable contribution ledger.</p>
            <p>At <span className="text-[#00ff88]">1,000,000 verified active nodes</span>, the ledger may enter Snapshot Readiness. The roadmap is conditional, never automatic.</p>
          </div>
          <Link to="/token"
                data-testid="manifesto-cta"
                className="mt-10 inline-flex items-center gap-2 text-white/80 hover:text-[#00ff88] font-mono uppercase tracking-[0.3em] text-[11px] transition-colors">
            read the full protocol page <ChevronRight className="w-3 h-3" />
          </Link>
        </motion.div>

        {/* receipt visual */}
        <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                    className="relative">
          <Receipt />
        </motion.div>
      </div>
    </section>
  );
}

function Receipt() {
  const lines = [
    ["device_id",        "edge-node-04a9bf"],
    ["verified_work",    "0x8c7a…f3b1"],
    ["timestamp_utc",    "2026-02-14T18:07:42Z"],
    ["signature",        "ed25519:9e21…0a7d"],
    ["contribution_ms",  "42,810 ms"],
    ["receipt_hash",     "0x4b2d8e…3a1c"],
    ["ledger_seq",       "#001,839,204"],
    ["status",           "VERIFIED"],
  ];
  return (
    <div className="font-mono text-[12px] relative">
      {/* paper background */}
      <div className="bg-[#06090d] border border-white/[0.08] p-6 lg:p-7 relative overflow-hidden"
           style={{ clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)" }}>
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
          <span className="text-[#00ff88] uppercase tracking-[0.3em] text-[10px]">// compute-time receipt</span>
          <span className="text-white/35 text-[10px]">v0.4</span>
        </div>
        <div className="space-y-2.5">
          {lines.map(([k, v], i) => (
            <motion.div key={k} className="grid grid-cols-[1fr_1.4fr] gap-3"
                        initial={{ opacity: 0, x: -6 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: i * 0.08 }}>
              <span className="text-white/40 uppercase tracking-[0.2em] text-[10px]">{k}</span>
              <span className={`tabular-nums ${k === "status" ? "text-[#00ff88]" : "text-white/85"}`}>{v}</span>
            </motion.div>
          ))}
        </div>
        <div className="mt-5 pt-3 border-t border-dashed border-white/[0.12] text-[10px] text-white/35 uppercase tracking-[0.3em]">
          // sealed · pre-mainnet · contribution ledger
        </div>
      </div>
      {/* glow */}
      <div className="absolute -inset-8 -z-10 bg-[#00ff88]/10 blur-3xl rounded-full" />
    </div>
  );
}

/* ============================================================ */
/*  4. Scarcity Progress Console — massive 1M bar               */
/* ============================================================ */
function ScarcityConsole({ scarcity }) {
  const verified = scarcity?.verified_active_nodes ?? 0;
  const target   = scarcity?.target_active_nodes ?? 1_000_000;
  const pct      = scarcity?.progress_pct ?? 0;
  const phase    = (scarcity?.phase || "growth").toUpperCase();
  const phases = ["GROWTH", "SNAPSHOT_REVIEW", "AUDIT", "GOVERNANCE", "MAINNET_CANDIDATE"];

  return (
    <section className="relative py-20 px-6 lg:px-8 border-t border-white/[0.06]"
             data-testid="scarcity-console">
      <div className="max-w-[1240px] mx-auto">
        {/* console header */}
        <div className="flex items-baseline justify-between flex-wrap gap-4 border-b border-white/[0.08] pb-4 mb-8">
          <div>
            <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#00ff88]/85 mb-2">
              // network.scarcity_progress
            </div>
            <h2 className="font-display text-white"
                style={{ fontSize: "clamp(28px, 3vw, 46px)", letterSpacing: "-0.04em", fontWeight: 600, lineHeight: 1 }}>
              The clock does not exist.<br/>
              <span className="text-white/55">Only the network does.</span>
            </h2>
          </div>
          <div className="text-right">
            <div className="font-mono uppercase tracking-[0.3em] text-[10px] text-white/40">target</div>
            <div className="font-display font-bold text-[32px] lg:text-[44px] tabular-nums text-[#00d9ff]" style={{ letterSpacing: "-0.04em" }}>
              1,000,000
            </div>
          </div>
        </div>

        {/* phase pipeline */}
        <div className="grid grid-cols-5 gap-2 mb-10" data-testid="phase-pipeline">
          {phases.map((p) => {
            const active = p === phase;
            return (
              <div key={p}
                   className={`px-3 py-2.5 border ${active ? "border-[#00ff88]/70 bg-[#00ff88]/[0.06]" : "border-white/[0.08] bg-black/30"}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-[#00ff88]" : "bg-white/20"}`}
                        style={active ? { boxShadow: "0 0 8px 1px #00ff88" } : {}} />
                  <span className={`font-mono uppercase tracking-[0.2em] text-[9px] ${active ? "text-[#00ff88]" : "text-white/35"} truncate`}>
                    {p.replace("_", " ")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* gigantic verified count */}
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-end mb-6">
          <div>
            <div className="font-mono uppercase tracking-[0.3em] text-[10px] text-white/45 mb-2">
              verified_active_nodes
            </div>
            <div className="font-display tabular-nums leading-none"
                 style={{
                   fontSize: "clamp(56px, 8vw, 112px)",
                   letterSpacing: "-0.06em", fontWeight: 700,
                   background: "linear-gradient(180deg, #00ff88 0%, #00d9ff 100%)",
                   WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                 }}
                 data-testid="scarcity-mega-count">
              {verified.toLocaleString()}
            </div>
          </div>
          <div className="space-y-3 text-white/55 text-[13px] leading-relaxed">
            <p>
              Pre-mainnet contribution accumulation is tied to <span className="text-white">real verified network growth</span>,
              not a calendar. When the count reaches <span className="text-[#00ff88]">1,000,000</span>, the ledger may enter
              Snapshot Readiness review.
            </p>
            <p className="text-amber-300/85 text-[12px] font-mono uppercase tracking-[0.2em]">
              // roadmap progression is subject to community, legal,
              <br/>technical and ecosystem conditions
            </p>
          </div>
        </div>

        {/* v1.6.2 — total TGC receipts ledger counter */}
        <div className="mb-10 border-t border-white/[0.06] pt-7">
          <TotalTgcCounter
            variant="mega"
            value={scarcity?.total_tgc_issued || 0}
            subValues={{
              circulating: scarcity?.circulating_tgc || 0,
              burned:      scarcity?.total_tgc_burned || 0,
            }}
            testId="landing-total-tgc-counter"
          />
        </div>

        {/* neon progress bar */}
        <div className="relative" data-testid="scarcity-bar">
          <div className="flex items-baseline justify-between mb-3">
            <span className="font-mono uppercase tracking-[0.3em] text-[10px] text-white/45">
              0
            </span>
            <span className="font-mono uppercase tracking-[0.3em] text-[10px] text-white/45">
              {target.toLocaleString()}
            </span>
          </div>
          <div className="relative h-4 bg-white/[0.03] border border-white/[0.08] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0.4, pct)}%` }}
              transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
              className="absolute top-0 bottom-0 left-0"
              style={{
                background: "linear-gradient(90deg, #00ff88, #00d9ff)",
                boxShadow: "0 0 40px 4px rgba(0,255,136,0.5)",
              }}
            />
            <motion.div className="absolute top-0 bottom-0 w-32"
                        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)" }}
                        animate={{ x: ["-100%", "1400%"] }}
                        transition={{ duration: 6, repeat: Infinity, ease: "linear" }} />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/35">
              // no fake inflation
            </span>
            <span className="font-mono font-bold text-[15px] text-[#00ff88] tabular-nums">
              {pct.toFixed(4)}%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  5. Premium Dual-APK Deployment Module (v1.7.5)              */
/* ============================================================ */
function DeploymentModule() {
  const [dual, setDual] = useState(null);
  const [qrLight, setQrLight]     = useState(null);
  const [qrNodePro, setQrNodePro] = useState(null);

  // Pull dual-APK metadata from backend (size + sha256 + availability).
  useEffect(() => {
    fetch(`${BACKEND}/api/apk/dual-version`).then(r => r.json()).then(setDual).catch(() => {});
  }, []);

  // Render QR codes once URLs resolve.
  useEffect(() => {
    if (!dual) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const make = (path) => {
      const full = path.startsWith("http") ? path : origin + path;
      return QRCode.toDataURL(full, { width: 320, margin: 0,
        color: { dark: "#00ff88", light: "#00000000" } });
    };
    make(dual.light?.download_url    || "/grid-worker-light.apk").then(setQrLight);
    make(dual.node_pro?.download_url || "/grid-worker-nodepro.apk").then(setQrNodePro);
  }, [dual]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const lightUrl   = origin + (dual?.light?.download_url    || "/grid-worker-light.apk");
  const nodeproUrl = origin + (dual?.node_pro?.download_url || "/grid-worker-nodepro.apk");

  return (
    <section className="relative py-20 px-6 lg:px-8 border-t border-white/[0.06]" id="deploy" data-testid="deploy-module">
      <div className="max-w-[1240px] mx-auto">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#00ff88]/85 mb-3">
              // deploy_node_client.exec
            </div>
            <h2 className="font-display text-white"
                style={{ fontSize: "clamp(28px, 3.2vw, 48px)", letterSpacing: "-0.04em", fontWeight: 600, lineHeight: 0.96 }}>
              Two installers. <span className="text-[#00ff88]">Both verified binaries</span>,<br/>
              not app-store badges.
            </h2>
          </div>
          <div className="font-mono uppercase tracking-[0.3em] text-[10px] text-[#00ff88]">
            <span className="inline-block w-2 h-2 rounded-full bg-[#00ff88] mr-2 align-middle motion-telemetry-blink" />
            signed v2 + v3
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* ---------- LIGHT installer ---------- */}
          <DeploymentInstaller
            data={dual?.light}
            qr={qrLight}
            apkUrl={lightUrl}
            accent="cyan"
            testId="deploy-light"
            badge="STORE_SAFE · NO DEVICE-SIDE MINING"
            badgeSub="AdMob rewarded ads · cloud-only"
            ctaLabel="LIGHT · direct download"
          />
          {/* ---------- NODE PRO installer ---------- */}
          <DeploymentInstaller
            data={dual?.node_pro}
            qr={qrNodePro}
            apkUrl={nodeproUrl}
            accent="matrix"
            testId="deploy-nodepro"
            badge="DIRECT INFRA · OPT-IN COMPUTE"
            badgeSub="No AdMob · explicit consent required"
            ctaLabel="NODE PRO · direct download"
          />
        </div>

        <div className="mt-6 px-5 py-3 border border-white/[0.06] bg-black/40 font-mono text-[11px] uppercase tracking-[0.25em] text-white/45 leading-relaxed">
          // both clients share the SAME backend, SAME user account, SAME contribution ledger.
          <br />// daily grid calibration receipts are available on BOTH (light watches a rewarded ad first; node pro is ad-free).
        </div>
      </div>
    </section>
  );
}

function DeploymentInstaller({ data, qr, apkUrl, accent, testId, badge, badgeSub, ctaLabel }) {
  const accentColor   = accent === "matrix" ? "#00ff88" : "#00d9ff";
  const ctaBg         = accent === "matrix" ? "bg-[#00ff88]" : "bg-[#00d9ff]";
  const ctaShadow     = accent === "matrix"
    ? "shadow-[0_0_60px_-12px_rgba(0,255,136,0.7)] hover:shadow-[0_0_80px_-12px_rgba(0,255,136,1)]"
    : "shadow-[0_0_60px_-12px_rgba(0,217,255,0.7)] hover:shadow-[0_0_80px_-12px_rgba(0,217,255,1)]";
  const qrShadow      = accent === "matrix"
    ? "0 0 60px -10px rgba(0,255,136,0.55), inset 0 0 30px -10px rgba(0,255,136,0.3)"
    : "0 0 60px -10px rgba(0,217,255,0.55), inset 0 0 30px -10px rgba(0,217,255,0.3)";

  return (
    <div className="border border-white/[0.08] bg-black/70 backdrop-blur-xl" data-testid={testId}>
      {/* console top bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.08] text-[10px] font-mono uppercase tracking-[0.3em] text-white/55">
        <span className="w-2.5 h-2.5 rounded-full bg-[#00ff88]/85" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#00d9ff]/55" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/55" />
        <span className="ml-3 truncate font-bold" style={{ color: accentColor }}>{data?.label || "—"}</span>
        <span className="ml-auto" style={{ color: accentColor }}>{data?.available ? "OK" : "PENDING"}</span>
      </div>

      <div className="px-6 pt-5">
        <div className="font-mono uppercase tracking-[0.3em] text-[9px]" style={{ color: accentColor }}>{badge}</div>
        <div className="mt-1 text-[11px] text-white/45 font-mono uppercase tracking-[0.22em]">{badgeSub}</div>
      </div>

      <div className="grid sm:grid-cols-[1fr_auto] gap-0">
        {/* specs */}
        <div className="p-6 lg:p-7">
          <div className="space-y-3 font-mono text-[12px]">
            <SpecLine k="package"        v={data?.package || "—"} />
            <SpecLine k="version"        v={data?.label ? `v${data?.version || "—"}` : "—"} />
            <SpecLine k="size"           v={`${((data?.size_bytes || 0) / 1024).toFixed(0)} KB`} />
            <SpecLine k="abi"            v={(data?.abi && data.abi[0]) || "arm64-v8a"} />
            <SpecLine k="device_side_mining"
                      v={data?.device_side_mining ? "ENABLED · opt-in" : "DISABLED"}
                      tone={data?.device_side_mining ? "amber" : "matrix"} />
            <SpecLine k="admob"
                      v={data?.admob_enabled ? "rewarded_ads" : "none"}
                      tone={data?.admob_enabled ? "cyan" : "matrix"} />
            <SpecLine k="sha256"         v={`${(data?.sha256 || "").slice(0, 22)}…`} tone="cyan" mono />
          </div>
          <div className="mt-7">
            <a href={apkUrl} download
               data-testid={`${testId}-direct-download`}
               className={`inline-flex items-center gap-3 px-5 py-3 rounded-md ${ctaBg} text-black font-mono font-bold text-[11px] uppercase tracking-[0.32em] ${ctaShadow} transition`}>
              <Download className="w-4 h-4" /> {ctaLabel}
            </a>
            <button onClick={() => navigator.clipboard?.writeText(apkUrl)}
                    data-testid={`${testId}-copy-url`}
                    className="ml-2 inline-flex items-center gap-2 px-4 py-3 rounded-md border border-white/15 text-white/75 hover:border-white/40 hover:text-white font-mono text-[11px] uppercase tracking-[0.3em] transition">
              copy url
            </button>
          </div>
        </div>

        {/* QR */}
        <div className="p-6 lg:p-7 grid place-items-center bg-[#020405] border-t sm:border-t-0 sm:border-l border-white/[0.08]">
          <div className="text-center">
            <div className="font-mono uppercase tracking-[0.3em] text-[10px] text-white/45 mb-3">
              scan_to_install
            </div>
            <div className="relative inline-block p-3 border"
                 style={{ borderColor: `${accentColor}80`, boxShadow: qrShadow }}>
              {qr ? (
                <img src={qr} alt={`${data?.label || "apk"} qr`} className="w-44 h-44" data-testid={`${testId}-qr-image`} />
              ) : (
                <div className="w-44 h-44 grid place-items-center text-white/30">…</div>
              )}
              <span className="absolute -top-2 -right-2 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-[0.3em] text-black"
                    style={{ background: accentColor }}>
                v{data?.version || "—"}
              </span>
            </div>
            <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
              android · arm64-v8a
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-white/[0.08] font-mono text-[10px] text-white/35 break-all" data-testid={`${testId}-apk-url`}>
        // {apkUrl}
      </div>
    </div>
  );
}

function SpecLine({ k, v, tone, mono }) {
  const color = tone === "matrix" ? "#00ff88"
              : tone === "cyan"   ? "#00d9ff"
              : tone === "amber"  ? "#fbbf24"
              : "#f5f7fa";
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-3 border-b border-white/[0.05] pb-2">
      <span className="uppercase tracking-[0.25em] text-[10px] text-white/35">{k}</span>
      <span className={`tabular-nums ${mono ? "break-all" : "truncate"} font-bold`} style={{ color }}>{v}</span>
    </div>
  );
}

/* ============================================================ */
/*  6. Foundation Buyback Policy Panel — swiss grid             */
/* ============================================================ */
function BuybackPolicyPanel() {
  return (
    <section className="relative py-20 px-6 lg:px-8 border-t border-white/[0.06]" data-testid="buyback-panel">
      <div className="max-w-[1240px] mx-auto grid lg:grid-cols-[0.9fr_1.1fr] gap-10">
        <motion.div initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
          <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#6c7bff] mb-4">
            // foundation.buyback_program
          </div>
          <h2 className="font-display text-white"
              style={{ fontSize: "clamp(28px, 3.2vw, 48px)", letterSpacing: "-0.04em", fontWeight: 600, lineHeight: 0.95 }}>
            A policy.<br/>Not a promise.
          </h2>
          <p className="mt-6 text-white/55 leading-relaxed max-w-md text-[14px]">
            Contributors who reach <span className="text-white">100 TGC</span> may apply to a Foundation Buyback
            Window when it is opened by the Ecosystem Treasury — subject to
            verification, regional eligibility and treasury liquidity.
          </p>
          <p className="mt-4 text-amber-300/80 font-mono text-[11px] uppercase tracking-[0.2em] leading-relaxed">
            // no guaranteed price · no guaranteed listing
            <br/>// no instant cashout · indicative only
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                    className="border border-white/[0.08]">
          {[
            ["window_status",    "CLOSED",                    "amber"],
            ["eligibility",      "100 TGC required",          "white"],
            ["current_program",  "up to $300 USDT",           "cyan"],
            ["risk_review",      "required",                  "white"],
            ["regional_check",   "subject to jurisdiction",   "white"],
            ["treasury_state",   "policy-based liquidity",    "violet"],
          ].map(([k, v, tone]) => (
            <div key={k} className="grid grid-cols-[1fr_1.2fr] gap-6 px-6 py-5 border-b border-white/[0.06] last:border-b-0">
              <div className="font-mono uppercase tracking-[0.25em] text-[11px] text-white/45">{k}</div>
              <div className={`font-mono uppercase tracking-[0.2em] text-[13px] tabular-nums font-bold ${
                tone === "amber"  ? "text-amber-300" :
                tone === "cyan"   ? "text-[#00d9ff]" :
                tone === "violet" ? "text-[#6c7bff]" : "text-white"
              }`}>{v}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  7. B2B SaaS Compute Surface Preview                         */
/* ============================================================ */
function B2BPreview() {
  return (
    <section className="relative py-20 px-6 lg:px-8 border-t border-white/[0.06] overflow-hidden" data-testid="b2b-preview">
      <div className="max-w-[1240px] mx-auto">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#00d9ff]/85 mb-3">
              // enterprise.compute_surface
            </div>
            <h2 className="font-display text-white"
                style={{ fontSize: "clamp(28px, 3.2vw, 48px)", letterSpacing: "-0.04em", fontWeight: 600, lineHeight: 0.96 }}>
              Compute throughput<br/>
              <span className="text-white/55">priced as infrastructure.</span>
            </h2>
          </div>
          <Link to="/customer"
                data-testid="b2b-cta"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-md border border-[#00d9ff]/40 text-[#00d9ff] hover:bg-[#00d9ff]/10 font-mono text-[11px] uppercase tracking-[0.3em] transition">
            <Briefcase className="w-4 h-4" /> open enterprise portal
          </Link>
        </div>

        <div className="relative border border-white/[0.08] bg-black/55 backdrop-blur-xl p-5 lg:p-7">
          {/* simulated dashboard */}
          <div className="flex items-center gap-2 mb-5 font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00ff88]/85" />
            <span>customer · enterprise · ACME-CORP</span>
            <span className="ml-auto">region · global · routed</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <PreviewMetric k="Compute Credit Balance"      v="$ 12,480.00"  tone="cyan" />
            <PreviewMetric k="Workload Queue"              v="14"           tone="white" />
            <PreviewMetric k="Active Workloads"            v="9"            tone="matrix" />
            <PreviewMetric k="Verified Output / hr"        v="1,284,902"    tone="cyan" />
          </div>
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
            <div className="border border-white/[0.06] p-4">
              <div className="font-mono uppercase tracking-[0.25em] text-[10px] text-white/45 mb-3">workload_throughput · 24h</div>
              <SparkBars />
              <div className="flex items-baseline justify-between mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/35">
                <span>00:00</span><span>12:00</span><span>24:00</span>
              </div>
            </div>
            <div className="border border-white/[0.06] p-4">
              <div className="font-mono uppercase tracking-[0.25em] text-[10px] text-white/45 mb-3">routing_layer · status</div>
              <div className="space-y-2.5 font-mono text-[11px]">
                {[
                  ["edge_compute_node fleet", "running"],
                  ["compute_routing_layer", "nominal"],
                  ["network_latency_opt",   "p99 32ms"],
                  ["verified_output ratio", "99.84%"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between border-b border-white/[0.05] pb-1.5">
                    <span className="text-white/45 uppercase tracking-[0.2em] text-[10px]">{k}</span>
                    <span className="text-[#00ff88] tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* outer glow */}
          <div className="absolute -inset-px -z-10"
               style={{ background: "linear-gradient(90deg, rgba(0,217,255,0.18), transparent 50%, rgba(0,255,136,0.12))",
                        filter: "blur(40px)", opacity: 0.45 }} />
        </div>
      </div>
    </section>
  );
}

function PreviewMetric({ k, v, tone }) {
  const color = tone === "matrix" ? "#00ff88" : tone === "cyan" ? "#00d9ff" : "#f5f7fa";
  return (
    <div className="border border-white/[0.06] px-4 py-3">
      <div className="font-mono uppercase tracking-[0.22em] text-[9px] text-white/40">{k}</div>
      <div className="font-mono font-bold text-[20px] mt-1 tabular-nums" style={{ color }}>{v}</div>
    </div>
  );
}

function SparkBars() {
  const data = [22, 38, 31, 49, 62, 70, 55, 64, 78, 88, 72, 91, 85, 96, 80, 74, 62, 70, 88, 95, 84, 78, 66, 72];
  return (
    <div className="flex items-end gap-[3px] h-20">
      {data.map((d, i) => (
        <div key={i} className="flex-1 bg-[#00d9ff]/40 hover:bg-[#00d9ff]" style={{ height: `${d}%` }} />
      ))}
    </div>
  );
}

/* ============================================================ */
/*  8. Final CTA Wall                                           */
/* ============================================================ */
function FinalCTA({ apk }) {
  return (
    <section className="relative min-h-[60vh] grid place-items-center px-6 lg:px-8 py-24 border-t border-white/[0.06]" data-testid="final-cta">
      {/* heavy radial glow */}
      <div className="absolute inset-0 -z-0 pointer-events-none">
        <div className="absolute inset-0 bg-black" />
        <motion.div className="absolute inset-0"
                    style={{
                      background: "radial-gradient(circle at 50% 50%, rgba(0,255,136,0.12) 0%, transparent 55%)",
                    }}
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  className="relative text-center max-w-2xl">
        <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#00ff88] mb-6">
          // initialize.computation
        </div>
        <h2 className="font-display text-white break-words"
            style={{ fontSize: "clamp(34px, 5vw, 80px)", letterSpacing: "-0.045em", fontWeight: 600, lineHeight: 0.94 }}>
          Join the<br/>
          <span style={{
            background: "linear-gradient(96deg, #00ff88, #00d9ff)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>verified&nbsp;compute&nbsp;layer.</span>
        </h2>
        <p className="mt-6 text-white/55 text-[14px] max-w-lg mx-auto">
          One installer. One ENGAGE NODE. Your device becomes a verified edge node
          on a global, milestone-driven compute network.
        </p>
        <a href={apk?.download_url || "#deploy"}
           data-testid="final-cta-btn"
           className="group mt-9 inline-flex items-center gap-3 px-7 py-4 rounded-md bg-[#00ff88] text-black font-mono font-bold text-[11px] uppercase tracking-[0.4em]
                      shadow-[0_0_60px_-12px_rgba(0,255,136,0.9)] hover:shadow-[0_0_90px_-12px_rgba(0,255,136,1)] transition-all">
          <Download className="w-4 h-4" />
          deploy node client
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </a>
        <div className="mt-5 font-mono uppercase tracking-[0.3em] text-[10px] text-white/30">
          // v{apk?.version || "—"} · arm64-v8a · signed v2+v3 · 60fps verified
        </div>
      </motion.div>
    </section>
  );
}

/* ============================================================ */
/*  Footer strip                                                */
/* ============================================================ */
function FooterStrip({ apk }) {
  return (
    <footer className="border-t border-white/[0.06] px-6 lg:px-8 py-8 text-[10px] font-mono uppercase tracking-[0.3em] text-white/30"
            data-testid="footer-strip">
      <div className="max-w-[1240px] mx-auto flex flex-wrap items-center justify-between gap-3">
        <span>// the.grid · distributed compute · pre-mainnet</span>
        <span>v{apk?.version || "—"} · build verified · arm64-v8a</span>
        <span>tgc · contribution receipt · no price guarantee</span>
      </div>
    </footer>
  );
}
