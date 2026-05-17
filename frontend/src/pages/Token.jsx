/*
 * THE GRID — TGC Token Whitepaper Page (/token)
 * v1.5.2 — "Distributed Compute Reserve" narrative
 *
 * Strategy: position $TGC NOT as "next bitcoin / next altcoin", but as a
 * *post-currency* unit — a record of contributed compute time on the world's
 * largest distributed supercomputer. Scarcity is enforced at the daily-emission
 * layer (0.05–0.30 TGC/day per phone). Pre-mainnet snapshot freezes circulating
 * supply, and IDO listing provides the sole liquidity venue.
 *
 * No price guarantees. No "buy now" rhetoric. Pure compute-time receipt theme.
 */
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Cpu, Lock, Calendar, Globe, Layers, Sparkles, Zap, ChevronRight, TrendingUp, Share2 } from "lucide-react";

const tokenomics = [
  { label: "Public Compute Reserve",   pct: 70, color: "#00ff88", note: "Distributed to phones, PCs and validators contributing real compute time during the pre-mainnet window. Earned, never sold." },
  { label: "Operator Reserve",         pct: 15, color: "#00d9ff", note: "Locked 24-month vesting. Funds infrastructure scaling, exchange liquidity, audits, legal." },
  { label: "Ecosystem Treasury (DAO)", pct: 15, color: "#a78bfa", note: "Multi-sig governance vault. Bounty programs, integrations, on-chain proposals voted by token holders." },
];

const milestones = [
  { q: "Q4 2026", title: "Snapshot Freeze",  desc: "Pre-mainnet ledger frozen. Every TGC accumulated until this moment is locked into the airdrop set. Snapshot date announced 30 days in advance." },
  { q: "Q1 2027", title: "Smart Contract Audit", desc: "Token contract deployed on selected chain (BSC / Solana TBA based on community vote). Independent audit by tier-1 firm." },
  { q: "Q2 2027", title: "Whitelist & Vesting Plan", desc: "KYC for treasury / operator wallets. Vesting cliff confirmed. DAO governance contracts deployed." },
  { q: "Q3 2027", title: "$TGC Mainnet Launch", desc: "1:1 airdrop executed. DEX listing on the chosen chain. Initial liquidity seeded by operator + treasury. Trading opens." },
];

export default function TokenPage() {
  const [launch, setLaunch] = useState(null);

  useEffect(() => {
    const url = (process.env.REACT_APP_BACKEND_URL || "") + "/api/token/launch";
    fetch(url).then(r => r.json()).then(setLaunch).catch(() => {});
  }, []);

  // Countdown to Q3 2027 (use July 1 as anchor)
  const [delta, setDelta] = useState({ d: 0, h: 0, m: 0, s: 0 });
  useEffect(() => {
    const target = new Date("2027-07-01T00:00:00Z").getTime();
    const tick = () => {
      const now = Date.now();
      let diff = Math.max(0, Math.floor((target - now) / 1000));
      const d = Math.floor(diff / 86400); diff -= d * 86400;
      const h = Math.floor(diff / 3600);  diff -= h * 3600;
      const m = Math.floor(diff / 60);    diff -= m * 60;
      const s = diff;
      setDelta({ d, h, m, s });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen text-white" data-testid="token-page" style={{ background: "radial-gradient(ellipse at top, rgba(0,255,136,0.08), transparent 60%), #050608" }}>
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
      <section className="px-6 lg:px-12 pt-16 pb-20 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-amber-300/80 font-mono-term border border-amber-300/25 rounded-full px-3 py-1.5">
            <Lock className="w-3 h-3" />
            Pre-Mainnet · Token Launch Q3 2027
          </span>

          <h1 className="font-mono-cyber font-black mt-6 text-5xl sm:text-6xl lg:text-7xl tracking-tighter leading-[0.95]">
            <span className="text-white">$TGC nedir,</span><br/>
            <span className="bg-gradient-to-r from-[#00ff88] via-[#00d9ff] to-[#a78bfa] bg-clip-text text-transparent">neden farklı?</span>
          </h1>

          <p className="mt-7 max-w-2xl text-white/65 leading-relaxed text-lg">
            $TGC bir kripto para birimi <span className="text-white/40 line-through">değil</span>.
            <br/>
            $TGC, dünyanın en büyük dağıtık süperbilgisayarına katkıda bulunan her telefonun, her kullanıcının
            <span className="text-[#00ff88] font-semibold"> compute-time makbuzudur</span> —
            bir altcoin değil, bir <span className="text-[#00d9ff] font-semibold">katılım kanıtı</span>.
          </p>
        </motion.div>

        {/* Countdown */}
        <div className="mt-12 grid grid-cols-4 gap-3 max-w-2xl" data-testid="token-countdown">
          {[
            { label: "Days",    val: delta.d },
            { label: "Hours",   val: delta.h },
            { label: "Minutes", val: delta.m },
            { label: "Seconds", val: delta.s },
          ].map((b, i) => (
            <div key={i} className="rounded-2xl border border-[#00ff88]/15 bg-black/50 backdrop-blur p-4 text-center"
                 data-testid={`countdown-${b.label.toLowerCase()}`}>
              <div className="font-mono-cyber font-black text-3xl sm:text-4xl text-[#00ff88]">
                {String(b.val).padStart(2, "0")}
              </div>
              <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 mt-1">{b.label}</div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-white/40 mt-3 font-mono-term">
          // Q3 2027 mainnet airdrop window opens
        </div>
      </section>

      {/* PHILOSOPHY — neden farklı */}
      <section className="px-6 lg:px-12 py-16 max-w-6xl mx-auto border-t border-white/[0.05]">
        <div className="text-[10px] uppercase tracking-[0.4em] text-[#00d9ff]/85 font-mono-term mb-2">// philosophy</div>
        <h2 className="font-mono-cyber font-black text-3xl sm:text-4xl tracking-tight mb-10">
          $TGC neden bir <span className="text-white/40 italic">"crypto"</span> değil?
        </h2>

        <div className="grid lg:grid-cols-3 gap-6">
          <PhilCard testId="phil-receipt" icon={<Layers className="w-5 h-5" />} title="Compute-Time Receipt"
            body="Bitcoin enerji harcayarak kanıt üretir. $TGC, gerçek bilimsel/AI compute işi tamamlandığında üretilir. Her token, ağa verilen X saniyelik CPU saatinin makbuzudur — boşa harcanmış enerji değil." />
          <PhilCard testId="phil-scarcity" icon={<Sparkles className="w-5 h-5" />} title="Radical Scarcity"
            body="Günde sadece 0.05–0.30 TGC üretilir telefon başına. 1 yıllık tam aktif kullanım = ~110 TGC. Pi Network'ün 10 milyar+ token arzına karşı $TGC'nin 1 yılda dolaşıma girecek max arzı 50–200M arasında." />
          <PhilCard testId="phil-non-currency" icon={<Globe className="w-5 h-5" />} title="Post-Currency Unit"
            body="$TGC dolardan, bitcoin'den, başka bir altcoin'den daha iyi olmaya çalışmıyor. O bir para değil; ölçülebilir compute katkısının dijital sertifikası. Sahip olmak = ağı erkenden ayakta tutanlar arasında olmak demek." />
        </div>
      </section>

      {/* TOKENOMICS */}
      <section className="px-6 lg:px-12 py-16 max-w-6xl mx-auto border-t border-white/[0.05]">
        <div className="text-[10px] uppercase tracking-[0.4em] text-[#a78bfa]/85 font-mono-term mb-2">// tokenomics</div>
        <h2 className="font-mono-cyber font-black text-3xl sm:text-4xl tracking-tight mb-3">
          Arz <span className="text-[#00ff88]">küçük</span>, dağılım <span className="text-[#00d9ff]">adil</span>.
        </h2>
        <p className="text-white/55 max-w-2xl mb-10 text-sm leading-relaxed">
          Mainnet açılışında dolaşıma giren toplam arz, snapshot anındaki birikmiş TGC'ye eşittir.
          Bu sayı önceden belirlenmiş bir hedef değil — kullanıcı topluluğunun gerçek boyutunu yansıtır.
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

      {/* TOKENOMICS SIMULATOR — v1.5.7 viral interactive widget */}
      <TokenomicsSimulator />

      {/* ROADMAP */}
      <section className="px-6 lg:px-12 py-16 max-w-6xl mx-auto border-t border-white/[0.05]">
        <div className="text-[10px] uppercase tracking-[0.4em] text-amber-300/85 font-mono-term mb-2">// roadmap</div>
        <h2 className="font-mono-cyber font-black text-3xl sm:text-4xl tracking-tight mb-10">
          Mainnet'e <span className="text-amber-300">geri sayım</span>.
        </h2>

        <div className="space-y-4">
          {milestones.map((m, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.07] bg-black/40 p-5 flex gap-5 items-start"
                 data-testid={`milestone-${i}`}>
              <div className="shrink-0 w-20 text-center">
                <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300/85 font-mono-term">{m.q}</div>
              </div>
              <div className="flex-1">
                <div className="font-mono-cyber font-black text-lg text-white">{m.title}</div>
                <p className="text-[13px] text-white/60 mt-1 leading-relaxed">{m.desc}</p>
              </div>
              <Calendar className="w-5 h-5 text-white/30 shrink-0 mt-1" />
            </div>
          ))}
        </div>
      </section>

      {/* CALL TO ACTION */}
      <section className="px-6 lg:px-12 py-16 max-w-6xl mx-auto border-t border-white/[0.05]">
        <div className="rounded-3xl border border-[#00ff88]/25 bg-gradient-to-br from-[#00ff88]/[0.05] to-[#00d9ff]/[0.04] p-10 text-center" data-testid="token-cta-card">
          <Zap className="w-10 h-10 mx-auto text-[#00ff88]" />
          <h3 className="font-mono-cyber font-black text-2xl sm:text-3xl mt-4 mb-3">
            Erken katıl, <span className="text-[#00ff88]">snapshot'ta yer al</span>.
          </h3>
          <p className="text-white/55 max-w-xl mx-auto text-sm leading-relaxed mb-7">
            $TGC dağıtımı, Q4 2026 snapshot anındaki cüzdan bakiyelerine göre yapılacak. Bugün bir saat önce başlayan kullanıcı,
            altı ay sonra başlayandan 6x fazla token alır. Erken katılım = doğal birikim.
          </p>
          <Link to="/mobile" data-testid="token-cta-engage"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-[#00ff88] text-black font-mono-cyber font-black tracking-wide shadow-[0_0_40px_rgba(0,255,136,0.4)] hover:shadow-[0_0_60px_rgba(0,255,136,0.6)] transition-all">
            ENGAGE NODE
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <footer className="px-6 lg:px-12 py-10 text-center text-[11px] text-white/35 font-mono-term">
        // {launch?.label || "TGC Mainnet · Token Launch Q3 2027"} · No price guarantee · Compute-time receipt theme
      </footer>
    </div>
  );
}

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

// ============================================================================
// Tokenomics Simulator — v1.5.7
// Drag sliders, see your projected TGC haul at Q3 2027 mainnet snapshot.
// Daily drip range per device: 0.05 – 0.30 TGC (matches Mobile.jsx economy).
// ============================================================================
function TokenomicsSimulator() {
  const [days, setDays] = useState(365);          // 1 → 730 (Q4 2026 snapshot ~2yr away)
  const [dripDaily, setDripDaily] = useState(0.18); // 0.05 → 0.30
  const [devices, setDevices] = useState(1);       // 1 → 5 (phones + tablets)
  const [copied, setCopied] = useState(false);

  const totalTgc = useMemo(() => days * dripDaily * devices, [days, dripDaily, devices]);

  // illustrative implied snapshot value range (NOT a price guarantee)
  // assumes mainnet listing at $0.10 – $1.00 (totally hypothetical, for the
  // viral shareable feel — explicit "indicative only" copy stays visible)
  const implLow  = totalTgc * 0.10;
  const implHigh = totalTgc * 1.00;

  const shareText = `THE GRID · ${devices} cihaz × ${days} gün × ${dripDaily.toFixed(2)} TGC/gün → ${totalTgc.toFixed(2)} $TGC Q3 2027 snapshot · join: ${typeof window !== "undefined" ? window.location.origin : "thegrid.io"}/token`;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "THE GRID — my $TGC projection", text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch { /* user cancelled or unsupported */ }
  };

  return (
    <section className="px-6 lg:px-12 py-16 max-w-6xl mx-auto border-t border-white/[0.05]" data-testid="tokenomics-simulator-section">
      <div className="text-[10px] uppercase tracking-[0.4em] text-[#00ff88]/85 font-mono-term mb-2">// simulator</div>
      <h2 className="font-mono-cyber font-black text-3xl sm:text-4xl tracking-tight mb-3">
        Sen ne kadar <span className="text-[#00ff88]">$TGC</span> biriktirirsin?
      </h2>
      <p className="text-white/55 max-w-2xl mb-10 text-sm leading-relaxed">
        Aşağıdaki kaydırıcılarla kendi senaryonu kur. Hesaplama gerçek protokol drip oranlarını kullanır
        (cihaz başına günlük 0.05 – 0.30 TGC, uptime ve compute katkısına göre). <span className="text-amber-300/85">Hiçbir fiyat garantisi değildir</span>;
        bu yalnızca snapshot anında elinde olacak miktarı modellemen için bir simülasyondur.
      </p>

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        {/* Left: sliders */}
        <div className="rounded-3xl border border-white/[0.07] bg-black/50 backdrop-blur p-7 space-y-7" data-testid="simulator-controls">
          <SliderRow
            testId="sim-days"
            label="Aktif Gün Sayısı"
            sublabel="snapshot'a kadar"
            value={days}
            min={1} max={730} step={1}
            display={`${days} gün`}
            color="#00ff88"
            onChange={setDays}
          />
          <SliderRow
            testId="sim-drip"
            label="Günlük Drip Oranı"
            sublabel="cihaz başı · TGC/gün"
            value={dripDaily}
            min={0.05} max={0.30} step={0.01}
            display={`${dripDaily.toFixed(2)} TGC`}
            color="#00d9ff"
            onChange={setDripDaily}
          />
          <SliderRow
            testId="sim-devices"
            label="Cihaz Sayısı"
            sublabel="telefon + tablet"
            value={devices}
            min={1} max={5} step={1}
            display={`${devices} cihaz`}
            color="#a78bfa"
            onChange={setDevices}
          />

          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/[0.05]">
            {[
              { lbl: "Casual",  d: 180, r: 0.10 },
              { lbl: "Reguler", d: 365, r: 0.18 },
              { lbl: "Power",   d: 600, r: 0.28 },
            ].map((p) => (
              <button
                key={p.lbl}
                data-testid={`sim-preset-${p.lbl.toLowerCase()}`}
                onClick={() => { setDays(p.d); setDripDaily(p.r); }}
                className="text-[11px] uppercase tracking-[0.2em] font-mono-term py-2 rounded-lg border border-white/[0.08] text-white/65 hover:border-[#00ff88]/40 hover:text-white transition"
              >
                {p.lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Right: result */}
        <div className="rounded-3xl border border-[#00ff88]/25 bg-gradient-to-br from-[#00ff88]/[0.06] to-[#00d9ff]/[0.03] p-7" data-testid="simulator-output">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-[#00ff88]/80 font-mono-term">
            <TrendingUp className="w-3 h-3" /> projected Q3 2027 holding
          </div>

          <motion.div
            key={totalTgc.toFixed(2)}
            initial={{ opacity: 0.55, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="font-mono-cyber font-black text-5xl sm:text-6xl tracking-tighter mt-4"
            data-testid="sim-total-tgc"
          >
            <span className="bg-gradient-to-r from-[#00ff88] to-[#00d9ff] bg-clip-text text-transparent">
              {totalTgc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-white/45 text-2xl font-mono-term ml-2">$TGC</span>
          </motion.div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-[12px]">
            <div className="rounded-xl border border-white/[0.06] bg-black/40 p-3">
              <div className="text-white/40 uppercase tracking-[0.2em] text-[9px]">@ $0.10 listing</div>
              <div className="font-mono-cyber font-black text-lg text-white mt-1" data-testid="sim-implied-low">
                ${implLow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/40 p-3">
              <div className="text-white/40 uppercase tracking-[0.2em] text-[9px]">@ $1.00 listing</div>
              <div className="font-mono-cyber font-black text-lg text-[#00ff88] mt-1" data-testid="sim-implied-high">
                ${implHigh.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-amber-300/75 leading-relaxed mt-4 font-mono-term">
            // indicative range only · mainnet liquidity / listing price is not guaranteed
            <br/>// real distribution = pre-mainnet drip × uptime × compute proof
          </p>

          <button
            onClick={handleShare}
            data-testid="sim-share-btn"
            className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-[#00d9ff]/40 bg-[#00d9ff]/10 hover:bg-[#00d9ff]/20 text-[#00d9ff] font-mono-cyber font-bold text-sm tracking-wide transition"
          >
            <Share2 className="w-4 h-4" />
            {copied ? "linked copied · paste anywhere" : "Share my projection"}
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
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        data-testid={`${testId}-input`}
        className="grid-slider w-full"
        style={{ accentColor: color }}
      />
    </div>
  );
}
