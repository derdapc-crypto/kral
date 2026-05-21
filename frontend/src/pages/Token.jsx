/*
 * THE GRID — /token (vNext "Immersive Authority Surface")
 *
 * Total rewrite per /app/design_guidelines.json — 7 sections, manifesto style.
 *   1. Brutalist Hero  "TGC is not a coin"
 *   2. Compute-Time Receipt  technical flow diagram
 *   3. Network Scarcity     locked-slot grid
 *   4. Radical Scarcity     drip curve graph
 *   5. Foundation Buyback   terminal status panel
 *   6. Milestone Roadmap    vertical timeline
 *   7. Risk Clarity         multi-column legal
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Cpu, ArrowRight, ChevronRight, ShieldCheck, AlertTriangle } from "lucide-react";
import NetworkTopology from "../components/NetworkTopology";
import TotalTgcCounter from "../components/TotalTgcCounter";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";

export default function TokenPage() {
  const [scarcity, setScarcity] = useState(null);
  useEffect(() => {
    fetch(`${BACKEND}/api/network/scarcity-progress`).then(r => r.json()).then(setScarcity).catch(()=>{});
  }, []);
  return (
    <main className="bg-black text-white antialiased selection:bg-[#00ff88] selection:text-black" data-testid="token-page">
      <SharedBg />
      <TokenNav />
      <BrutalistHero />
      <ReceiptFlow />
      <SlotScarcity scarcity={scarcity} />
      <DripCurve />
      <BuybackTerminal />
      <RoadmapTimeline />
      <RiskClarity />
      <FooterStrip />
    </main>
  );
}

function SharedBg() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-black" />
      <div className="absolute inset-0 opacity-[0.35]"
           style={{
             backgroundImage:
               "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
             backgroundSize: "44px 44px",
             maskImage: "radial-gradient(ellipse at 50% 20%, black 40%, transparent 80%)",
             WebkitMaskImage: "radial-gradient(ellipse at 50% 20%, black 40%, transparent 80%)",
           }} />
      <div className="absolute -top-32 left-1/3 w-[600px] h-[600px] rounded-full blur-[140px] opacity-[0.14]"
           style={{ background: "radial-gradient(circle, #00ff88 0%, transparent 60%)" }} />
      <div className="absolute bottom-1/4 right-0 w-[600px] h-[600px] rounded-full blur-[140px] opacity-[0.12]"
           style={{ background: "radial-gradient(circle, #6c7bff 0%, transparent 60%)" }} />
      <div className="absolute inset-0"
           style={{
             backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)",
             mixBlendMode: "multiply", opacity: 0.5,
           }} />
    </div>
  );
}

function TokenNav() {
  return (
    <header className="border-b border-white/[0.06] bg-black/55 backdrop-blur-xl sticky top-0 z-30" data-testid="token-nav">
      <div className="max-w-[1240px] mx-auto px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md border border-[#00ff88]/40 grid place-items-center bg-black">
            <Cpu className="w-3.5 h-3.5 text-[#00ff88]" />
          </div>
          <div className="font-mono uppercase tracking-[0.3em] text-[11px]">the.grid <span className="text-white/40">/ tgc.protocol</span></div>
        </Link>
        <Link to="/" className="font-mono uppercase tracking-[0.3em] text-[10px] text-white/55 hover:text-white">← back to overview</Link>
      </div>
    </header>
  );
}

/* ============================================================ */
/*  1. Brutalist Hero                                           */
/* ============================================================ */
function BrutalistHero() {
  return (
    <section className="relative min-h-[86vh] flex items-center px-6 lg:px-8 pt-20 pb-16" data-testid="token-hero">
      <div className="max-w-[1240px] mx-auto w-full grid lg:grid-cols-[1.3fr_1fr] gap-10 items-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#00ff88] mb-6">
            // tgc.protocol_thesis · pre-mainnet
          </div>
          <h1 className="font-display text-white"
              style={{ fontSize: "clamp(40px, 6vw, 96px)", letterSpacing: "-0.05em", lineHeight: 0.9, fontWeight: 700 }}>
            TGC is<br/>
            <span className="text-white/35">not a coin.</span><br/>
            <span style={{
              background:"linear-gradient(96deg, #00ff88, #00d9ff)",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
            }}>It is a record</span><br/>
            <span className="text-white/65">of useful compute.</span>
          </h1>
          <p className="mt-8 text-white/55 text-[14px] leading-relaxed max-w-[480px]">
            A pre-mainnet contribution receipt. Cryptographically sealed.
            Conditional on verified network growth. Subject to community, legal,
            technical and ecosystem readiness — never to a calendar.
          </p>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.9, delay: 0.15 }}
                    className="relative aspect-square w-full max-w-[420px] lg:max-w-[480px] mx-auto border border-white/[0.08]"
                    style={{ maxHeight: "min(60vh, 480px)" }}>
          <NetworkTopology className="w-full h-full" />
        </motion.div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  2. Compute-Time Receipt — flow diagram                      */
/* ============================================================ */
function ReceiptFlow() {
  const steps = [
    { k: "01", t: "ENERGY",        s: "Idle device battery + CPU cycles otherwise wasted." },
    { k: "02", t: "COMPUTE",       s: "Native engine resolves a verified cloud-task sequence." },
    { k: "03", t: "TELEMETRY",     s: "Output is signed, deterministic, replay-protected." },
    { k: "04", t: "RECEIPT",       s: "Sealed into the immutable contribution ledger." },
  ];
  return (
    <section className="relative py-20 px-6 lg:px-8 border-t border-white/[0.06]" data-testid="receipt-flow">
      <div className="max-w-[1240px] mx-auto">
        <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#00ff88]/85 mb-5">
          // compute_time_receipt.flow
        </div>
        <h2 className="font-display text-white max-w-[820px]"
            style={{ fontSize: "clamp(28px, 3.6vw, 56px)", letterSpacing:"-0.04em", lineHeight: 0.95, fontWeight: 600 }}>
          Four stages. <span className="text-white/55">One sealed receipt.</span>
        </h2>
        <div className="mt-10 grid md:grid-cols-4 gap-px bg-white/[0.06]" data-testid="flow-steps">
          {steps.map((s, i) => (
            <motion.div key={s.k}
                        initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}
                        className="relative bg-black p-5 group">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00d9ff]/55">{s.k}</div>
              <div className="mt-4 font-display font-bold text-[20px] text-white" style={{ letterSpacing: "-0.02em" }}>{s.t}</div>
              <p className="mt-2 text-[12px] text-white/55 leading-relaxed">{s.s}</p>
              {i < steps.length - 1 && (
                <ArrowRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#00ff88]/55 z-10 bg-black p-0.5 rounded-full border border-white/[0.06]" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  3. Network Scarcity — locked-slot grid                      */
/* ============================================================ */
function SlotScarcity({ scarcity }) {
  const verified = scarcity?.verified_active_nodes ?? 0;
  const target   = 1_000_000;
  const taken    = verified;
  const slots    = Array.from({ length: 240 }, (_, i) => i);
  return (
    <section className="relative py-20 px-6 lg:px-8 border-t border-white/[0.06]" data-testid="slot-scarcity">
      <div className="max-w-[1240px] mx-auto grid lg:grid-cols-[0.95fr_1.05fr] gap-10">
        <div>
          <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-amber-300/85 mb-5">
            // network.scarcity
          </div>
          <h2 className="font-display text-white"
              style={{ fontSize: "clamp(28px, 3.6vw, 56px)", letterSpacing:"-0.04em", lineHeight: 0.95, fontWeight: 600 }}>
            Slots are <span className="text-amber-300">finite</span>.<br/>
            Inflation is <span className="text-white/55">forbidden</span>.
          </h2>
          <div className="mt-8 grid grid-cols-3 gap-px bg-white/[0.06] max-w-[420px]" data-testid="scarcity-stats">
            <StatCell k="VERIFIED"  v={verified.toLocaleString()} tone="matrix" />
            <StatCell k="TARGET"    v={target.toLocaleString()}    tone="cyan" />
            <StatCell k="REMAINING" v={(target - taken).toLocaleString()} tone="amber" />
          </div>
          <p className="mt-6 text-white/55 max-w-[420px] leading-relaxed text-[13px]">
            Each lit cell represents a verified active edge node.
            The protocol never inflates supply ahead of real network growth.
          </p>
          <div className="mt-7 border-t border-white/[0.06] pt-5 max-w-[420px]">
            <TotalTgcCounter
              variant="default"
              value={scarcity?.total_tgc_issued || 0}
              subValues={{
                circulating: scarcity?.circulating_tgc || 0,
                burned:      scarcity?.total_tgc_burned || 0,
              }}
              tone="cyan"
              testId="token-total-tgc-counter"
            />
          </div>
        </div>
        {/* slot grid */}
        <div className="grid grid-cols-20 gap-[3px] p-3 border border-white/[0.06] bg-black/40"
             style={{ gridTemplateColumns: "repeat(20, minmax(0,1fr))" }}
             data-testid="scarcity-grid">
          {slots.map((i) => {
            const lit = i < Math.min(taken, slots.length);
            return (
              <div key={i}
                   className="aspect-square"
                   style={{
                     background: lit ? "#00ff88" : "rgba(255,255,255,0.05)",
                     boxShadow:  lit ? "0 0 10px 1px rgba(0,255,136,0.6)" : "none",
                   }} />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatCell({ k, v, tone }) {
  const color = tone === "matrix" ? "#00ff88" : tone === "cyan" ? "#00d9ff" : tone === "amber" ? "#fbbf24" : "#f5f7fa";
  return (
    <div className="bg-black px-3 py-2.5">
      <div className="font-mono uppercase tracking-[0.25em] text-[9px] text-white/40">{k}</div>
      <div className="font-mono font-bold text-[15px] mt-1 tabular-nums" style={{ color }}>{v}</div>
    </div>
  );
}

/* ============================================================ */
/*  4. Radical Scarcity — drip curve graph                      */
/* ============================================================ */
function DripCurve() {
  // synthetic illustrative drip curve — labelled as illustrative
  const W = 800, H = 260;
  const pts = Array.from({ length: 100 }, (_, i) => {
    const x = (i / 99) * W;
    // logarithmic decay
    const y = H - (Math.pow(0.96, i) * H * 0.85) - 14;
    return [x, y];
  });
  const path = "M " + pts.map(p => p.join(" ")).join(" L ");
  return (
    <section className="relative py-20 px-6 lg:px-8 border-t border-white/[0.06]" data-testid="drip-curve">
      <div className="max-w-[1240px] mx-auto">
        <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#6c7bff] mb-5">
          // radical.scarcity_curve
        </div>
        <h2 className="font-display text-white max-w-[820px]"
            style={{ fontSize: "clamp(28px, 3.6vw, 56px)", letterSpacing:"-0.04em", lineHeight: 0.95, fontWeight: 600 }}>
          Drip per node decays as the network grows.
        </h2>
        <p className="mt-5 text-white/55 max-w-[560px] text-[14px]">
          Per-device daily contribution is capped between
          <span className="text-white"> 0.05 – 0.30 TGC</span>. As the network expands, the curve
          tightens — radical scarcity by design.
        </p>
        <div className="mt-10 border border-white/[0.08] p-5 bg-black/40">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
            {/* grid lines */}
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1="0" y1={H*g} x2={W} y2={H*g} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            ))}
            {/* fill under curve */}
            <motion.path
              d={`${path} L ${W} ${H} L 0 ${H} Z`}
              fill="url(#dripFill)" opacity="0.4"
              initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }}
              viewport={{ once: true }} transition={{ duration: 1.4 }}
            />
            <motion.path
              d={path} fill="none"
              stroke="#00ff88" strokeWidth="2.5"
              initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }}
              viewport={{ once: true }} transition={{ duration: 1.6, ease: "easeOut" }}
            />
            <defs>
              <linearGradient id="dripFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00ff88" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#00ff88" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* axes labels */}
            <text x="0" y={H-2} fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="JetBrains Mono">network_size →</text>
            <text x={W-110} y={H-2} fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="JetBrains Mono">1,000,000 cap</text>
          </svg>
          <div className="mt-3 font-mono uppercase tracking-[0.3em] text-[10px] text-amber-300/80">
            // illustrative · actual drip rates are determined by the protocol
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  5. Foundation Buyback — terminal status panel               */
/* ============================================================ */
function BuybackTerminal() {
  return (
    <section className="relative py-20 px-6 lg:px-8 border-t border-white/[0.06]" data-testid="buyback-terminal">
      <div className="max-w-[1240px] mx-auto">
        <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#6c7bff] mb-5">
          // foundation.buyback_program
        </div>
        <h2 className="font-display text-white max-w-[820px]"
            style={{ fontSize: "clamp(28px, 3.6vw, 56px)", letterSpacing:"-0.04em", lineHeight: 0.95, fontWeight: 600 }}>
          A policy window. <span className="text-white/55">Not a price guarantee.</span>
        </h2>

        <div className="mt-10 border border-white/[0.08] bg-black/70 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.08] font-mono uppercase text-[10px] tracking-[0.3em] text-white/55">
            <span className="w-2 h-2 rounded-full bg-amber-300 motion-telemetry-blink" />
            <span>foundation.buyback_window · status feed</span>
            <span className="ml-auto text-amber-300/85">CLOSED</span>
          </div>
          <div className="grid lg:grid-cols-2 gap-px bg-white/[0.06]">
            {[
              ["window_status",   "CLOSED",                       "amber"],
              ["eligibility",     "100 TGC required",             "white"],
              ["current_program", "up to $300 USDT",              "cyan"],
              ["risk_review",     "required",                     "white"],
              ["regional_check",  "subject to jurisdiction",      "white"],
              ["treasury_state",  "policy-based liquidity",       "violet"],
              ["fraud_screen",    "automated + manual",           "white"],
              ["payout_form",     "manual · case-by-case",        "amber"],
            ].map(([k, v, tone]) => (
              <div key={k} className="bg-black px-5 py-4 flex items-baseline justify-between gap-4">
                <span className="font-mono uppercase tracking-[0.25em] text-[10px] text-white/45">{k}</span>
                <span className={`font-mono font-bold uppercase tracking-[0.2em] text-[12px] tabular-nums ${
                  tone === "amber"  ? "text-amber-300" :
                  tone === "cyan"   ? "text-[#00d9ff]" :
                  tone === "violet" ? "text-[#6c7bff]" : "text-white"
                }`}>{v}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-white/[0.08] font-mono text-[10px] text-white/40 uppercase tracking-[0.25em]">
            // subject to treasury availability · verification · risk review · regional eligibility
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  6. Milestone Roadmap — vertical timeline                    */
/* ============================================================ */
function RoadmapTimeline() {
  const phases = [
    { k: "01", t: "VERIFIED NODE GROWTH",        s: "Edge node fleet grows. Contribution ledger expands.",        state: "active" },
    { k: "02", t: "SNAPSHOT READINESS REVIEW",   s: "Ledger considered for sealing at 1M verified nodes.",         state: "pending" },
    { k: "03", t: "INDEPENDENT REVIEW / AUDIT",  s: "Tier-1 firm audit of contracts, ledger and treasury.",        state: "pending" },
    { k: "04", t: "COMMUNITY GOVERNANCE",        s: "DAO contracts deployed. Multi-sig handover.",                 state: "pending" },
    { k: "05", t: "MAINNET CANDIDATE",           s: "Conditional on all readiness gates being satisfied.",         state: "pending" },
  ];
  return (
    <section className="relative py-20 px-6 lg:px-8 border-t border-white/[0.06]" data-testid="roadmap-timeline">
      <div className="max-w-[1240px] mx-auto">
        <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#00d9ff]/85 mb-5">
          // protocol.milestone_roadmap
        </div>
        <h2 className="font-display text-white max-w-[820px]"
            style={{ fontSize: "clamp(28px, 3.6vw, 56px)", letterSpacing:"-0.04em", lineHeight: 0.95, fontWeight: 600 }}>
          Milestones, not dates.
        </h2>

        <div className="mt-10 relative pl-8 border-l border-white/[0.08]">
          {phases.map((p, i) => {
            const active = p.state === "active";
            return (
              <motion.div key={p.k}
                          initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}
                          className="relative pb-14 last:pb-0">
                {/* node */}
                <div className={`absolute -left-[46px] top-1 w-5 h-5 ${active ? "bg-[#00ff88]" : "bg-black border border-white/20"}`}
                     style={active ? { boxShadow: "0 0 18px 2px rgba(0,255,136,0.7)" } : {}} />
                <div className="font-mono uppercase tracking-[0.35em] text-[10px] text-[#00d9ff]/55">{p.k}</div>
                <div className={`mt-2 font-display font-bold text-[28px] ${active ? "text-[#00ff88]" : "text-white"}`}
                     style={{ letterSpacing:"-0.02em" }}>{p.t}</div>
                <p className="mt-2 text-white/55 leading-relaxed max-w-xl">{p.s}</p>
                <div className="mt-3 font-mono uppercase tracking-[0.3em] text-[10px]"
                     style={{ color: active ? "#00ff88" : "rgba(255,255,255,0.3)" }}>
                  {active ? "IN PROGRESS" : "PENDING · conditional"}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  7. Risk Clarity — monochrome legal                          */
/* ============================================================ */
function RiskClarity() {
  const clauses = [
    "TGC is not currently a cryptocurrency.",
    "TGC is a pre-mainnet contribution receipt.",
    "Future market value of TGC is not guaranteed.",
    "Buyback windows are conditional and may be closed at any time.",
    "Mainnet candidacy is conditional on community, legal, technical and ecosystem readiness.",
    "No guaranteed exchange listing.",
    "No guaranteed token price.",
    "Subject to verification, treasury availability, risk review and regional eligibility.",
  ];
  return (
    <section className="relative py-20 px-6 lg:px-8 border-t border-white/[0.06]" data-testid="risk-clarity">
      <div className="max-w-[1240px] mx-auto">
        <div className="flex items-center gap-3 font-mono uppercase tracking-[0.4em] text-[10px] text-amber-300 mb-5">
          <AlertTriangle className="w-3 h-3" /> // risk.clarity.note
        </div>
        <h2 className="font-display text-white"
            style={{ fontSize: "clamp(26px, 3vw, 44px)", letterSpacing:"-0.04em", lineHeight: 0.95, fontWeight: 600 }}>
          Read this section before participating.
        </h2>
        <div className="mt-8 grid md:grid-cols-2 gap-px bg-white/[0.06]">
          {clauses.map((c, i) => (
            <div key={i} className="bg-black px-4 py-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white/60 leading-relaxed">
              <span className="text-amber-300/75 mr-2">{(i+1).toString().padStart(2,"0")}.</span>
              {c}
            </div>
          ))}
        </div>
        <p className="mt-8 font-mono uppercase tracking-[0.3em] text-[10px] text-white/35 max-w-2xl">
          // this document is informational only.
          <br/>// it is not financial advice, an offering, or a securities solicitation.
        </p>
      </div>
    </section>
  );
}

function FooterStrip() {
  return (
    <footer className="border-t border-white/[0.06] px-6 lg:px-8 py-8 text-[10px] font-mono uppercase tracking-[0.3em] text-white/30">
      <div className="max-w-[1240px] mx-auto flex flex-wrap items-center justify-between gap-3">
        <span>// tgc.protocol · pre-mainnet contribution phase</span>
        <div className="flex flex-wrap items-center gap-5">
          <Link to="/privacy" className="hover:text-[#00ff88] transition" data-testid="token-footer-privacy">privacy</Link>
          <Link to="/terms"   className="hover:text-[#00ff88] transition" data-testid="token-footer-terms">terms</Link>
          <Link to="/" className="hover:text-white">return to overview <ChevronRight className="inline w-3 h-3" /></Link>
        </div>
      </div>
    </footer>
  );
}
