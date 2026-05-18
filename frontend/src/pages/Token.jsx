/*
 * THE GRID — TGC Token Page (v1.5.4 "Absolute Authority")
 *
 * Date-based countdown narrative is RETIRED. New narrative is
 * milestone-driven, centred on the 1,000,000 verified active node target
 * (NETWORK SCARCITY PROGRESS).  Snapshot Readiness, audit, governance and
 * mainnet candidacy are framed as conditional phases — never guaranteed.
 *
 * Surfaces added:
 *   1. Hero  — "THE GRID is not a coin."
 *   2. Compute-Time Receipt philosophy (3 cards)
 *   3. Network Scarcity Progress (live, real backend data, no inflation)
 *   4. Foundation Buyback Program (config-driven, never guaranteed)
 *   5. Tokenomics (70/15/15, marked PLANNED · DRAFT)
 *   6. Milestone-based Roadmap (no dates)
 *   7. Tokenomics Simulator (slider widget)
 *   8. Risk / Clarity disclaimer
 */
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Cpu, Layers, Sparkles, Globe, ShieldCheck, Activity,
  TrendingUp, Share2, ChevronRight, Lock, Wallet, AlertTriangle,
} from "lucide-react";
import { api } from "../lib/api";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";

const tokenomics = [
  { label: "Public Compute Reserve",   pct: 70, color: "#00ff88", note: "Earned exclusively by contributing real compute time. Distributed to verified edge nodes during the pre-mainnet phase." },
  { label: "Operator Reserve",         pct: 15, color: "#00d9ff", note: "24-month vesting cliff. Funds infrastructure scaling, independent review and ecosystem readiness." },
  { label: "Ecosystem Treasury (DAO)", pct: 15, color: "#a78bfa", note: "Multi-sig governance vault. Bounty programs, integrations, conditional buyback liquidity." },
];

const milestones = [
  { id: 1, title: "Verified Node Growth",        desc: "Pre-mainnet contribution ledger expands as new edge nodes come online and pass verification." },
  { id: 2, title: "Snapshot Readiness Review",   desc: "When the network reaches 1,000,000 verified active nodes, the ledger may be reviewed for sealing. Conditional on community, legal, technical and ecosystem readiness." },
  { id: 3, title: "Independent Review / Audit",  desc: "Tier-1 firm audit of the token contract candidate, ledger integrity and treasury controls." },
  { id: 4, title: "Community Governance",        desc: "DAO contracts deployed; multi-sig handover; conditional buyback windows opened by treasury vote." },
  { id: 5, title: "Mainnet Candidate",           desc: "If all readiness gates are satisfied, a mainnet candidate may be proposed. Listing and liquidity are subject to market and regulatory conditions." },
];

export default function TokenPage() {
  const [launch, setLaunch] = useState(null);
  const [scarcity, setScarcity] = useState(null);
  const [buyback, setBuyback] = useState(null);

  useEffect(() => {
    fetch(`${BACKEND}/api/token/launch`).then(r => r.json()).then(setLaunch).catch(() => {});
    fetch(`${BACKEND}/api/network/scarcity-progress`).then(r => r.json()).then(setScarcity).catch(() => {});
    api.get("/foundation/buyback-status").then(r => setBuyback(r.data)).catch(() => setBuyback(null));
  }, []);

  return (
    <div className="min-h-screen text-white" data-testid="token-page"
         style={{ background: "radial-gradient(ellipse at top, rgba(0,255,136,0.06), transparent 60%), #050608" }}>

      {/* nav */}
      <nav className="px-6 lg:px-12 py-6 flex items-center justify-between border-b border-white/[0.05]">
        <Link to="/" className="flex items-center gap-3" data-testid="token-home-link">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#00ff88] to-[#00d9ff] flex items-center justify-center">
            <Cpu className="w-5 h-5 text-black" />
          </div>
          <span className="font-mono-cyber font-black tracking-tight">THE GRID</span>
        </Link>
        <Link to="/" className="text-xs uppercase tracking-[0.3em] text-white/45 hover:text-white/85 transition" data-testid="token-back-link">
          ← back to home
        </Link>
      </nav>

      {/* HERO */}
      <section className="px-6 lg:px-12 pt-16 pb-12 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-[#00ff88]/85 font-mono-term border border-[#00ff88]/20 rounded-full px-3 py-1.5">
            <Lock className="w-3 h-3" />
            Pre-Mainnet Contribution Phase
          </span>

          <h1 className="font-mono-cyber font-black mt-6 text-5xl sm:text-6xl lg:text-7xl tracking-tighter leading-[0.95]">
            <span className="text-white">THE GRID is not a coin.</span><br/>
            <span className="bg-gradient-to-r from-[#00ff88] via-[#00d9ff] to-[#a78bfa] bg-clip-text text-transparent">
              It is a record of useful compute.
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-white/65 leading-relaxed text-lg">
            $TGC, ağa katkıda bulunan her edge compute node'un pre-mainnet katkı defteridir.
            Bir altcoin değil, bir <span className="text-[#00ff88] font-semibold">compute-time receipt</span> —
            ölçülebilir hesaplama katkısının dijital sertifikası.
          </p>
        </motion.div>
      </section>

      {/* COMPUTE-TIME RECEIPT */}
      <section className="px-6 lg:px-12 py-12 max-w-6xl mx-auto border-t border-white/[0.05]">
        <div className="text-[10px] uppercase tracking-[0.4em] text-[#00d9ff]/85 font-mono-term mb-2">// philosophy</div>
        <h2 className="font-mono-cyber font-black text-3xl sm:text-4xl tracking-tight mb-10">
          Compute-Time <span className="text-[#00ff88]">Receipt</span>.
        </h2>
        <div className="grid lg:grid-cols-3 gap-6">
          <PhilCard testId="phil-receipt" icon={<Layers className="w-5 h-5" />} title="Useful Compute"
            body="Sadece gerçek compute katkısı sırasında TGC üretilir. Atıl cihazlar ya da sahte tıklamalar üretmez — her TGC, ağa verilmiş ölçülebilir CPU saatinin makbuzudur." />
          <PhilCard testId="phil-scarcity" icon={<Sparkles className="w-5 h-5" />} title="Radical Scarcity"
            body="Günlük drip cihaz başına 0.05–0.30 TGC arasında kalır. Üretim, milyarlarca arz şişiremez — ölçek yalnızca yeni doğrulanmış cihazlar geldikçe büyür." />
          <PhilCard testId="phil-non-currency" icon={<Globe className="w-5 h-5" />} title="Post-Currency Unit"
            body="$TGC bugün bir kripto para birimi değildir; gelecekteki mainnet aşaması koşullara bağlıdır. Sahip olmak = ağı erken aşamada ayakta tutanlar arasında olmak demektir." />
        </div>
      </section>

      {/* NETWORK SCARCITY PROGRESS */}
      <NetworkScarcityProgress scarcity={scarcity} />

      {/* FOUNDATION BUYBACK PROGRAM */}
      <FoundationBuybackCard buyback={buyback} onApplied={() => {
        api.get("/foundation/buyback-status").then(r => setBuyback(r.data)).catch(() => {});
      }} />

      {/* TOKENOMICS */}
      <section className="px-6 lg:px-12 py-12 max-w-6xl mx-auto border-t border-white/[0.05]">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-2">
          <div className="text-[10px] uppercase tracking-[0.4em] text-[#a78bfa]/85 font-mono-term">// tokenomics</div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-amber-300/85 font-mono-term border border-amber-300/25 rounded-full px-2.5 py-1">
            planned · draft
          </span>
        </div>
        <h2 className="font-mono-cyber font-black text-3xl sm:text-4xl tracking-tight mb-3">
          Dağılım <span className="text-[#00ff88]">küçük</span>, kontrol <span className="text-[#00d9ff]">adil</span>.
        </h2>
        <p className="text-white/55 max-w-2xl mb-10 text-sm leading-relaxed">
          Aşağıdaki dağılım yapısı pre-mainnet planlamasıdır. Snapshot Readiness aşamasında
          kesinleştirilir; bağımsız denetim ve topluluk yönetişimi onayına tabidir.
        </p>
        <div className="space-y-4">
          {tokenomics.map((t, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.07] bg-black/40 p-5" data-testid={`tkn-row-${i}`}>
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-mono-term text-sm text-white/85">{t.label}</span>
                <span className="font-mono-cyber font-black text-2xl" style={{ color: t.color }}>{t.pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${t.pct}%`, background: t.color }} />
              </div>
              <p className="text-[12px] text-white/55 mt-3 leading-relaxed">{t.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TOKENOMICS SIMULATOR */}
      <TokenomicsSimulator />

      {/* MILESTONE ROADMAP (no dates) */}
      <section className="px-6 lg:px-12 py-12 max-w-6xl mx-auto border-t border-white/[0.05]">
        <div className="text-[10px] uppercase tracking-[0.4em] text-amber-300/85 font-mono-term mb-2">// milestones</div>
        <h2 className="font-mono-cyber font-black text-3xl sm:text-4xl tracking-tight mb-10">
          Tarih değil, <span className="text-amber-300">milestone</span>.
        </h2>
        <div className="space-y-4">
          {milestones.map((m) => (
            <div key={m.id} className="rounded-2xl border border-white/[0.07] bg-black/40 p-5 flex gap-5 items-start"
                 data-testid={`milestone-${m.id}`}>
              <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-amber-300/15 to-amber-300/5 flex items-center justify-center">
                <span className="font-mono-cyber font-black text-amber-300 text-lg">{m.id}</span>
              </div>
              <div className="flex-1">
                <div className="font-mono-cyber font-black text-lg text-white">{m.title}</div>
                <p className="text-[13px] text-white/60 mt-1 leading-relaxed">{m.desc}</p>
              </div>
              <Activity className="w-5 h-5 text-white/25 shrink-0 mt-1" />
            </div>
          ))}
        </div>
      </section>

      {/* RISK / CLARITY NOTE */}
      <section className="px-6 lg:px-12 py-12 max-w-6xl mx-auto border-t border-white/[0.05]">
        <div className="rounded-3xl border border-amber-300/25 bg-amber-300/[0.04] p-7" data-testid="token-risk-note">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-amber-300/85 font-mono-term mb-3">
            <AlertTriangle className="w-3 h-3" /> Risk / Clarity Note
          </div>
          <ul className="space-y-2 text-sm text-white/70 leading-relaxed">
            <li>• TGC bugün bir kripto para birimi değildir.</li>
            <li>• TGC'nin gelecekteki piyasa değeri garanti edilmez.</li>
            <li>• Mainnet, snapshot, token launch, buyback windows ve likidite programları
              topluluk, hukuki, teknik ve ekosistem koşullarına bağlıdır.</li>
            <li>• Bu sayfadaki tüm rakamlar yalnızca <span className="text-amber-300">indicative</span>'dir;
              ileride değişebilir veya iptal edilebilir.</li>
          </ul>
        </div>
      </section>

      <footer className="px-6 lg:px-12 py-10 text-center text-[11px] text-white/35 font-mono-term">
        // {launch?.label || "TGC · Pre-Mainnet Contribution Phase"} ·
        no price guarantee · milestone-driven roadmap
      </footer>
    </div>
  );
}

/* ============================================================ */
/*  Components                                                  */
/* ============================================================ */

function PhilCard({ icon, title, body, testId }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/40 p-6" data-testid={testId}>
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00ff88]/15 to-[#00d9ff]/10 flex items-center justify-center text-[#00ff88]">
        {icon}
      </div>
      <h3 className="font-mono-cyber font-black text-xl mt-4">{title}</h3>
      <p className="text-[13px] text-white/60 leading-relaxed mt-2">{body}</p>
    </div>
  );
}

function NetworkScarcityProgress({ scarcity }) {
  const verified = scarcity?.verified_active_nodes ?? 0;
  const target   = scarcity?.target_active_nodes ?? 1_000_000;
  const pct      = scarcity?.progress_pct ?? 0;
  const phase    = scarcity?.phase || "growth";

  return (
    <section className="px-6 lg:px-12 py-12 max-w-6xl mx-auto border-t border-white/[0.05]"
             data-testid="network-scarcity-section">
      <div className="text-[10px] uppercase tracking-[0.4em] text-[#00ff88]/85 font-mono-term mb-2">// network scarcity</div>
      <h2 className="font-mono-cyber font-black text-3xl sm:text-4xl tracking-tight mb-3">
        NETWORK SCARCITY <span className="text-[#00ff88]">PROGRESS</span>.
      </h2>
      <p className="text-white/55 max-w-2xl mb-8 text-sm leading-relaxed">
        Ağ <span className="text-white">1,000,000 doğrulanmış aktif cihaza</span> ulaştığında,
        pre-mainnet katkı dönemi Snapshot Readiness incelemesine girebilir. Bu aşama topluluk,
        hukuki, teknik ve ekosistem koşullarına bağlıdır.
      </p>

      <div className="rounded-3xl border border-[#00ff88]/25 bg-gradient-to-br from-[#00ff88]/[0.05] to-[#00d9ff]/[0.03] p-8"
           data-testid="scarcity-progress-card">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-4">
          <div className="font-mono-cyber font-black text-5xl sm:text-6xl tabular-nums tracking-tighter">
            <span className="bg-gradient-to-r from-[#00ff88] to-[#00d9ff] bg-clip-text text-transparent"
                  data-testid="scarcity-verified-count">
              {verified.toLocaleString()}
            </span>
            <span className="text-white/40 text-2xl ml-3 font-mono-term">/ {target.toLocaleString()}</span>
          </div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-[#00ff88]/85 font-mono-term border border-[#00ff88]/25 rounded-full px-3 py-1.5">
            phase · {phase.replace("_", " ")}
          </span>
        </div>

        <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden border border-white/[0.04]" data-testid="scarcity-bar">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0.15, pct)}%` }}
            transition={{ duration: 1.0, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #00ff88, #00d9ff)", boxShadow: "0 0 24px rgba(0,255,136,0.45)" }}
          />
        </div>

        <div className="flex items-baseline justify-between flex-wrap gap-3 mt-4">
          <div className="text-[11px] text-white/50 font-mono-term">
            // verified active nodes · live · no fake inflation
          </div>
          <div className="font-mono-cyber font-black text-base text-[#00ff88]" data-testid="scarcity-pct">
            {pct.toFixed(4)} %
          </div>
        </div>

        <p className="text-[11px] text-amber-300/80 font-mono-term mt-5 leading-relaxed">
          // {scarcity?.subtitle_long || "Roadmap progression is subject to community, legal, technical and ecosystem conditions."}
        </p>
      </div>
    </section>
  );
}

function FoundationBuybackCard({ buyback, onApplied }) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const windowOpen = buyback?.window_status === "open";
  const eligible   = !!buyback?.user_is_eligible;

  const handleApply = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      const r = await api.post("/foundation/buyback-apply", {});
      setResult({ ok: true, msg: r.data?.status === "already_submitted"
        ? "Application already on file. Status is being reviewed."
        : "Application submitted. You'll be notified after review." });
      onApplied && onApplied();
    } catch (e) {
      const detail = e?.response?.data?.detail || "unknown_error";
      setResult({ ok: false, msg: `Cannot submit: ${detail}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="px-6 lg:px-12 py-12 max-w-6xl mx-auto border-t border-white/[0.05]"
             data-testid="foundation-buyback-section">
      <div className="text-[10px] uppercase tracking-[0.4em] text-[#00d9ff]/85 font-mono-term mb-2">// foundation</div>
      <h2 className="font-mono-cyber font-black text-3xl sm:text-4xl tracking-tight mb-3">
        THE GRID FOUNDATION // <span className="text-[#00d9ff]">BUYBACK PROGRAM</span>
      </h2>
      <p className="text-white/55 max-w-3xl mb-8 text-sm leading-relaxed">
        {buyback?.target_tgc ?? 100} TGC'ye ulaşan contributor'lar, Foundation Buyback Window
        açıldığında bakiyelerini USDT karşılığı geri alım programına sunabilir. Program;
        dönemsel bütçe, kullanıcı doğrulaması, fraud/risk kontrolü, bölgesel uygunluk
        ve Ecosystem Treasury likiditesine bağlıdır.
      </p>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-white/[0.07] bg-black/45 p-7 space-y-4" data-testid="buyback-status-card">
          <StatusRow label="Window Status"
                     value={(buyback?.window_status || "closed").toUpperCase()}
                     tone={windowOpen ? "ok" : "amber"}
                     testId="bb-window-status" />
          <StatusRow label="Eligibility"
                     value={buyback?.eligibility_label || "100 TGC required"}
                     tone="info"
                     testId="bb-eligibility" />
          <StatusRow label="Current Program"
                     value={buyback?.current_program_label || "Up to $300 USDT"}
                     tone="info"
                     testId="bb-program" />
          <StatusRow label="Your TGC Balance"
                     value={`${(buyback?.user_tgc_balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })} TGC`}
                     tone={eligible ? "ok" : "muted"}
                     testId="bb-user-balance" />
          <p className="text-[11px] text-amber-300/80 font-mono-term leading-relaxed pt-2 border-t border-white/[0.05]">
            // {buyback?.terms || "subject to treasury availability, verification, risk review and regional eligibility"}
          </p>
        </div>

        <div className="rounded-3xl border border-[#00d9ff]/20 bg-gradient-to-br from-[#00d9ff]/[0.05] to-[#a78bfa]/[0.03] p-7 flex flex-col"
             data-testid="buyback-action-card">
          <div className="text-[10px] uppercase tracking-[0.4em] text-[#00d9ff]/85 font-mono-term mb-3">// action</div>
          <h3 className="font-mono-cyber font-black text-2xl tracking-tight mb-2">
            Apply for Buyback
          </h3>
          <p className="text-[13px] text-white/55 leading-relaxed mb-5">
            Eligible contributor'lar, açık bir Buyback Window olduğunda bu butondan
            başvurularını gönderebilir. Onaylanan başvurular Ecosystem Treasury
            likiditesine ve doğrulama sürecine tabidir.
          </p>

          <button
            onClick={handleApply}
            disabled={!eligible || submitting}
            data-testid="buyback-apply-btn"
            className={`mt-auto w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-mono-cyber font-black tracking-wide text-sm transition-all
              ${eligible
                ? "bg-[#00d9ff] text-black shadow-[0_0_40px_rgba(0,217,255,0.35)] hover:shadow-[0_0_60px_rgba(0,217,255,0.55)]"
                : "bg-white/[0.05] text-white/30 cursor-not-allowed"}`}
          >
            <Wallet className="w-4 h-4" />
            {submitting ? "SUBMITTING…" : (eligible ? "APPLY FOR BUYBACK" : "NOT ELIGIBLE YET")}
          </button>

          {!eligible && (
            <p className="text-[11px] text-white/40 font-mono-term mt-3 text-center">
              {!windowOpen
                ? "// window is currently closed"
                : (buyback?.risk_flagged
                    ? "// account under review"
                    : `// reach ${buyback?.target_tgc ?? 100} TGC to unlock`)}
            </p>
          )}

          {result && (
            <p className={`text-[12px] mt-4 font-mono-term ${result.ok ? "text-[#00ff88]" : "text-amber-300"}`}
               data-testid="buyback-result">
              // {result.msg}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusRow({ label, value, tone = "muted", testId }) {
  const colorMap = {
    ok: "text-[#00ff88]",
    info: "text-[#00d9ff]",
    amber: "text-amber-300",
    muted: "text-white/55",
  };
  return (
    <div className="flex items-baseline justify-between" data-testid={testId}>
      <span className="text-[11px] uppercase tracking-[0.2em] text-white/45 font-mono-term">{label}</span>
      <span className={`font-mono-cyber font-bold text-sm tabular-nums ${colorMap[tone]}`}>{value}</span>
    </div>
  );
}

/* ============================================================ */
/*  Tokenomics Simulator (preserved from v1.5.3)                */
/* ============================================================ */
function TokenomicsSimulator() {
  const [days, setDays] = useState(365);
  const [dripDaily, setDripDaily] = useState(0.18);
  const [devices, setDevices] = useState(1);
  const [copied, setCopied] = useState(false);

  const totalTgc = useMemo(() => days * dripDaily * devices, [days, dripDaily, devices]);

  const shareText = `THE GRID · ${devices} edge node × ${days} day × ${dripDaily.toFixed(2)} TGC/day → ${totalTgc.toFixed(2)} $TGC contribution receipt · ${typeof window !== "undefined" ? window.location.origin : "thegrid.io"}/token`;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "THE GRID — my TGC contribution projection", text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch { /* user cancelled */ }
  };

  return (
    <section className="px-6 lg:px-12 py-12 max-w-6xl mx-auto border-t border-white/[0.05]"
             data-testid="tokenomics-simulator-section">
      <div className="text-[10px] uppercase tracking-[0.4em] text-[#00ff88]/85 font-mono-term mb-2">// simulator</div>
      <h2 className="font-mono-cyber font-black text-3xl sm:text-4xl tracking-tight mb-3">
        Senin contribution defterin <span className="text-[#00ff88]">ne kadar büyür</span>?
      </h2>
      <p className="text-white/55 max-w-2xl mb-10 text-sm leading-relaxed">
        Aşağıdaki kaydırıcılarla kendi senaryonu modelle. Hesaplama protokol drip
        oranlarını kullanır (edge node başına günlük 0.05 – 0.30 TGC).
        <span className="text-amber-300/85"> Hiçbir fiyat veya piyasa değeri garantisi değildir.</span>
      </p>

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        <div className="rounded-3xl border border-white/[0.07] bg-black/50 backdrop-blur p-7 space-y-7" data-testid="simulator-controls">
          <SliderRow testId="sim-days" label="Aktif Gün Sayısı" sublabel="contribution defterindeki gün"
                     value={days} min={1} max={730} step={1} display={`${days} gün`} color="#00ff88"
                     onChange={setDays} />
          <SliderRow testId="sim-drip" label="Günlük Drip Oranı" sublabel="edge node başı · TGC/gün"
                     value={dripDaily} min={0.05} max={0.30} step={0.01}
                     display={`${dripDaily.toFixed(2)} TGC`} color="#00d9ff"
                     onChange={setDripDaily} />
          <SliderRow testId="sim-devices" label="Edge Node Sayısı" sublabel="telefon + tablet"
                     value={devices} min={1} max={5} step={1} display={`${devices} node`} color="#a78bfa"
                     onChange={setDevices} />
          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/[0.05]">
            {[
              { lbl: "Casual",  d: 180, r: 0.10 },
              { lbl: "Reguler", d: 365, r: 0.18 },
              { lbl: "Power",   d: 600, r: 0.28 },
            ].map((p) => (
              <button key={p.lbl} data-testid={`sim-preset-${p.lbl.toLowerCase()}`}
                      onClick={() => { setDays(p.d); setDripDaily(p.r); }}
                      className="text-[11px] uppercase tracking-[0.2em] font-mono-term py-2 rounded-lg border border-white/[0.08] text-white/65 hover:border-[#00ff88]/40 hover:text-white transition">
                {p.lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-[#00ff88]/25 bg-gradient-to-br from-[#00ff88]/[0.06] to-[#00d9ff]/[0.03] p-7" data-testid="simulator-output">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-[#00ff88]/80 font-mono-term">
            <TrendingUp className="w-3 h-3" /> projected contribution receipt
          </div>
          <motion.div key={totalTgc.toFixed(2)}
                      initial={{ opacity: 0.55, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className="font-mono-cyber font-black text-5xl sm:text-6xl tracking-tighter mt-4"
                      data-testid="sim-total-tgc">
            <span className="bg-gradient-to-r from-[#00ff88] to-[#00d9ff] bg-clip-text text-transparent">
              {totalTgc.toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })}
            </span>
            <span className="text-white/45 text-2xl font-mono-term ml-2">$TGC</span>
          </motion.div>

          <p className="text-[11px] text-amber-300/75 leading-relaxed mt-4 font-mono-term">
            // contribution receipt only · no market price · no listing guarantee
            <br/>// real distribution = drip × verified compute × uptime
          </p>

          <button onClick={handleShare} data-testid="sim-share-btn"
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-[#00d9ff]/40 bg-[#00d9ff]/10 hover:bg-[#00d9ff]/20 text-[#00d9ff] font-mono-cyber font-bold text-sm tracking-wide transition">
            <Share2 className="w-4 h-4" />
            {copied ? "link copied · paste anywhere" : "Share my projection"}
          </button>
        </div>
      </div>
    </section>
  );
}

function SliderRow({ label, sublabel, value, min, max, step, display, color, onChange, testId }) {
  return (
    <div data-testid={testId}>
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className="font-mono-cyber font-bold text-sm text-white/90">{label}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/35 font-mono-term mt-0.5">{sublabel}</div>
        </div>
        <div className="font-mono-cyber font-black text-2xl tabular-nums" style={{ color }}>{display}</div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(parseFloat(e.target.value))}
             data-testid={`${testId}-input`}
             className="grid-slider w-full"
             style={{ accentColor: color }} />
    </div>
  );
}
