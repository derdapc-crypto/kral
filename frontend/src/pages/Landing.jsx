import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ArrowRight, Cpu, Globe2, Zap, Shield, Lock, Sparkles, Smartphone, BatteryCharging, Wifi, CheckCircle2, Download, Briefcase } from "lucide-react";
import ApkSetupModal from "../components/ApkSetupModal";

const HERO_BG = "https://static.prod-images.emergentagent.com/jobs/99f915a9-0229-4059-88a8-b7701782fb0c/images/de66970575fd0c962a0ae5998fbd3ca1fb71b7d5fc3bbccec837805a15b80cb7.png";
const DATA_BG = "https://static.prod-images.emergentagent.com/jobs/99f915a9-0229-4059-88a8-b7701782fb0c/images/afc45ee0b1fdae2ca04542c03ce5be366b443995c096e2a8e9ea99bd842fd4ad.png";

const MODEL_TIERS = [
  { id: "flagship", label: "Flagship (iPhone 15 Pro / S24 Ultra)", mult: 3.0, base: 0.42 },
  { id: "mid", label: "Mid-Range (Pixel 7 / iPhone 13)", mult: 1.8, base: 0.25 },
  { id: "budget", label: "Budget (Moto G / A-series)", mult: 1.0, base: 0.14 },
];

function Counter({ value, decimals = 0, suffix = "" }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = display;
    const end = Number(value) || 0;
    const dur = 900;
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + (end - start) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line
  }, [value]);
  return (
    <span className="font-mono-num">
      {display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

function HeroOrb() {
  return (
    <div className="relative w-[460px] h-[460px] max-w-full mx-auto">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#D4AF37]/20 via-transparent to-transparent blur-3xl" />
      <div className="absolute inset-8 rounded-full border gold-border opacity-40 spin-slow" />
      <div className="absolute inset-16 rounded-full border border-white/10 spin-reverse" />
      <div className="absolute inset-24 rounded-full border gold-border opacity-30 spin-slow" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="w-40 h-40 rounded-full bg-gradient-to-br from-[#F2C94C] via-[#D4AF37] to-[#6B4E0E] gold-glow-strong grid place-items-center">
          <Cpu className="w-14 h-14 text-black" strokeWidth={1.8} />
        </div>
      </div>
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const r = 200;
        const x = Math.cos(angle) * r + 230;
        const y = Math.sin(angle) * r + 230;
        return (
          <div key={i} className="absolute w-2.5 h-2.5 rounded-full bg-[#F2C94C] dot-pulse"
            style={{ left: x - 5, top: y - 5, animationDelay: `${i * 0.3}s`, boxShadow: "0 0 20px rgba(242,201,76,0.9)" }} />
        );
      })}
    </div>
  );
}

function WorldDots({ count = 44 }) {
  const dots = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        left: Math.random() * 92 + 4,
        top: Math.random() * 70 + 12,
        delay: Math.random() * 3,
      });
    }
    return arr;
  }, [count]);
  return (
    <div className="relative w-full aspect-[2/1] rounded-2xl overflow-hidden border border-white/10"
      style={{ backgroundImage: `url(${DATA_BG})`, backgroundSize: "cover", backgroundPosition: "center" }}>
      <div className="absolute inset-0 bg-black/55" />
      {dots.map((d, i) => (
        <div key={i} className="absolute w-1.5 h-1.5 rounded-full bg-[#F2C94C] dot-pulse"
          style={{ left: `${d.left}%`, top: `${d.top}%`, animationDelay: `${d.delay}s`,
            boxShadow: "0 0 14px rgba(242,201,76,0.9)" }} />
      ))}
    </div>
  );
}

export default function Landing() {
  const [stats, setStats] = useState({ active_devices: 0, live_petaflops: 0, total_tasks: 0, total_users: 0 });
  const [tier, setTier] = useState("flagship");
  const [hours, setHours] = useState(6);
  const [apkOpen, setApkOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try { const { data } = await api.get("/stats/network"); setStats(data); } catch {}
    };
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  const earnings = useMemo(() => {
    const m = MODEL_TIERS.find(x => x.id === tier) || MODEL_TIERS[1];
    const daily = m.base * (hours / 8);
    return { daily, monthly: daily * 30, yearly: daily * 365, mult: m.mult };
  }, [tier, hours]);

  return (
    <div className="relative">
      {/* HERO */}
      <section className="relative min-h-[92vh] overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundImage: `url(${HERO_BG})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/75 to-[#0A0A0A]" />
        <div className="absolute inset-0 grid-lines opacity-60" />

        <div className="relative max-w-7xl mx-auto px-6 sm:px-10 pt-20 pb-28 grid lg:grid-cols-[1.2fr_1fr] gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border gold-border text-[11px] tracking-[0.25em] uppercase text-[#F2C94C] mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F2C94C] dot-pulse" />
              Series-A Class Infrastructure · Live
            </div>
            <h1 className="font-display font-black text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tighter">
              Own a Piece of the
              <br />
              <span className="gold-text">Global Supercomputer.</span>
            </h1>
            <p className="mt-8 text-base sm:text-lg text-white/70 max-w-xl leading-relaxed">
              A decentralized compute grid of one million smartphones. 80% cheaper than AWS, 100% sovereign. Your idle device becomes
              a paid node powering frontier AI.
            </p>
            <div className="mt-10 flex flex-wrap gap-4 items-center">
              <button onClick={() => setApkOpen(true)} data-testid="hero-apk-btn"
                className="group inline-flex items-center gap-3 px-7 py-4 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-sm tracking-wide hover:shadow-[0_0_40px_rgba(242,201,76,0.6)] transition-all">
                <Download className="w-4 h-4" />
                Download APK
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <Link to="/register" data-testid="hero-cta-join"
                className="px-7 py-4 rounded-full border gold-border text-[#F2C94C] text-sm tracking-wide hover:bg-[#F2C94C]/10 transition-colors">
                Claim Your Node
              </Link>
              <Link to="/register?role=customer" data-testid="hero-cta-customer"
                className="px-7 py-4 rounded-full border border-white/15 text-white/90 text-sm tracking-wide hover:border-[#D4AF37] hover:text-[#F2C94C] transition-colors inline-flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Customer Portal
              </Link>
            </div>

            <div className="mt-16 grid grid-cols-3 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/10">
              {[
                { label: "Live PetaFLOPS", value: stats.live_petaflops, dec: 4, suffix: "" },
                { label: "Active Nodes", value: stats.active_devices, dec: 0, suffix: "" },
                { label: "Tasks Solved", value: stats.total_tasks, dec: 0, suffix: "" },
              ].map((s) => (
                <div key={s.label} className="bg-[#0B0B0B] px-5 py-5" data-testid={`hero-stat-${s.label.toLowerCase().replace(/\s/g, "-")}`}>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-2">{s.label}</div>
                  <div className="text-2xl sm:text-3xl text-[#F2C94C]">
                    <Counter value={s.value} decimals={s.dec} suffix={s.suffix} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden lg:block"><HeroOrb /></div>
        </div>

        {/* ticker */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/5 bg-black/60 backdrop-blur-md overflow-hidden">
          <div className="flex gap-16 py-4 ticker-track whitespace-nowrap">
            {[...Array(2)].map((_, r) => (
              <div className="flex gap-16" key={r}>
                {["Federated Learning", "USDT TRC-20 Payouts", "Edge AI Ready", "Golden Rule Compliant", "Zero Trust Fraud Shield", "1M Node Capacity"].map((t) => (
                  <span key={t + r} className="text-[11px] tracking-[0.3em] uppercase text-white/50 flex items-center gap-3">
                    <span className="w-1 h-1 rounded-full bg-[#F2C94C]" /> {t}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="relative py-28 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 sm:px-10">
          <div className="grid lg:grid-cols-[1fr_1.2fr] gap-14 items-start">
            <div>
              <div className="text-[11px] tracking-[0.3em] uppercase text-[#F2C94C] mb-4">/ the why</div>
              <h2 className="font-display text-4xl sm:text-5xl font-black tracking-tighter leading-[1]">
                We don't rent <span className="gold-text">servers.</span>
                <br />We rent <span className="gold-text">humanity.</span>
              </h2>
              <p className="mt-6 text-white/70 max-w-lg leading-relaxed">
                Hyperscalers burn $200B/yr on datacenters. We route that spend directly to the people whose phones already exist — earning
                them yield while delivering compute at a fraction of the cost.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { tag: "AWS EC2", price: "$0.108", note: "t3.medium /hr", bad: true },
                { tag: "GCP Compute", price: "$0.094", note: "e2-medium /hr", bad: true },
                { tag: "THE GRID", price: "$0.018", note: "per compute-hr", bad: false },
              ].map((c) => (
                <div key={c.tag} className={`relative p-7 rounded-2xl ${c.bad ? "glass" : "glass-strong gold-glow"}`} data-testid={`compare-${c.tag.toLowerCase().replace(/\s/g, "-")}`}>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{c.tag}</div>
                  <div className={`mt-6 text-4xl font-display font-black ${c.bad ? "text-white/70" : "gold-text"}`}>{c.price}</div>
                  <div className="mt-2 text-xs text-white/50">{c.note}</div>
                  {!c.bad && (
                    <div className="mt-6 text-xs text-[#F2C94C] tracking-widest uppercase flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 80% Cheaper · Decentralized
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CALCULATOR */}
      <section id="calculator" className="relative py-28 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-[#F2C94C] mb-4">/ income transparency</div>
            <h2 className="font-display text-4xl sm:text-5xl font-black tracking-tighter leading-[1]">
              Your phone,<br /><span className="gold-text">quietly earning.</span>
            </h2>
            <p className="mt-5 text-white/70 max-w-md">Real USDT (TRC-20) flows based on compute contributed while charging. Estimates below use live network rates.</p>
            <div className="mt-10 space-y-7">
              <div>
                <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Device Tier</label>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {MODEL_TIERS.map((t) => (
                    <button key={t.id} onClick={() => setTier(t.id)} data-testid={`calc-tier-${t.id}`}
                      className={`px-3 py-3 rounded-xl text-xs font-medium tracking-wide transition-all ${
                        tier === t.id ? "bg-[#F2C94C] text-black border border-[#F2C94C] shadow-[0_0_30px_rgba(242,201,76,0.4)]"
                          : "border border-white/10 text-white/70 hover:border-[#D4AF37]"
                      }`}>
                      {t.id === "flagship" ? "FLAGSHIP" : t.id === "mid" ? "MID" : "BUDGET"}
                      <div className="text-[9px] mt-1 opacity-70">{t.mult}x yield</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Hours Charging / Day</label>
                  <span className="font-mono-num text-[#F2C94C]">{hours} h</span>
                </div>
                <input type="range" min={1} max={12} value={hours} onChange={(e) => setHours(Number(e.target.value))}
                  data-testid="calc-hours-range"
                  className="mt-3 w-full accent-[#D4AF37]" />
              </div>
            </div>
          </div>

          <div className="relative p-10 rounded-3xl glass-strong gold-glow">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Projected Yield</div>
            <div className="mt-4 flex items-baseline gap-3">
              <div className="text-6xl sm:text-7xl font-display font-black gold-text">
                <Counter value={earnings.monthly} decimals={2} />
              </div>
              <div className="text-xl text-white/50">USDT / mo</div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-black/50 border border-white/5" data-testid="calc-daily">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Daily</div>
                <div className="text-2xl text-white mt-2 font-mono-num"><Counter value={earnings.daily} decimals={3} /></div>
              </div>
              <div className="p-5 rounded-2xl bg-black/50 border border-white/5" data-testid="calc-yearly">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Yearly</div>
                <div className="text-2xl text-white mt-2 font-mono-num"><Counter value={earnings.yearly} decimals={0} /></div>
              </div>
            </div>
            <div className="mt-8 flex items-center gap-3 text-xs text-white/50">
              <Sparkles className="w-4 h-4 text-[#F2C94C]" /> Payouts unlock at $5 · No fees on TRC-20
            </div>
            <Link to="/register" data-testid="calc-cta-start"
              className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-sm hover:shadow-[0_0_30px_rgba(242,201,76,0.6)] transition-shadow">
              Start Earning <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* POWER MAP */}
      <section className="relative py-28 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 sm:px-10">
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="text-[11px] tracking-[0.3em] uppercase text-[#F2C94C] mb-3">/ live network</div>
              <h2 className="font-display text-4xl sm:text-5xl font-black tracking-tighter">Every dot is a node, working.</h2>
            </div>
            <div className="hidden sm:block text-right">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Petaflops Online</div>
              <div className="text-4xl font-display font-black gold-text font-mono-num">
                <Counter value={stats.live_petaflops} decimals={4} />
              </div>
            </div>
          </div>
          <WorldDots count={60} />
        </div>
      </section>

      {/* GOLDEN RULE */}
      <section className="relative py-28 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 sm:px-10">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: BatteryCharging, title: "Only While Charging", desc: "Zero battery impact. We never steal power — compute waits for the wall." },
              { icon: Wifi, title: "Wi-Fi Required", desc: "Never burns mobile data. All task transport is Wi-Fi only, encrypted." },
              { icon: Lock, title: "Explicit Permission", desc: "User toggles grid mode. No hidden background jobs. No shady SDKs." },
            ].map((f) => (
              <div key={f.title} className="p-8 rounded-2xl glass hover:border-[#D4AF37] transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#F2C94C]/10 border gold-border grid place-items-center">
                  <f.icon className="w-6 h-6 text-[#F2C94C]" />
                </div>
                <h3 className="mt-5 font-display text-xl font-bold">{f.title}</h3>
                <p className="mt-2 text-sm text-white/60 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 p-8 rounded-2xl border gold-border bg-gradient-to-r from-[#F2C94C]/5 to-transparent flex flex-wrap gap-6 items-center justify-between">
            <div className="flex items-center gap-4">
              <Shield className="w-8 h-8 text-[#F2C94C]" />
              <div>
                <div className="font-display font-bold text-lg">The Golden Rule</div>
                <div className="text-sm text-white/60">Compute starts ONLY when all three conditions are green.</div>
              </div>
            </div>
            <Link to="/register" data-testid="golden-cta"
              className="px-6 py-3 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-sm">
              Launch My Node
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-10 border-t border-white/5 text-center text-xs text-white/40 tracking-[0.25em] uppercase">
        © 2026 THE GRID · Sovereign Compute Protocol
      </footer>
      <ApkSetupModal open={apkOpen} onClose={() => setApkOpen(false)} />
    </div>
  );
}
