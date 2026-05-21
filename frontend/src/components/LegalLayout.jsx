import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * LegalLayout — shared scaffolding for /privacy and /terms.
 *
 * Visual contract:
 *  - Cyber terminal aesthetic (matches the rest of the app)
 *  - HIGH legibility for legal copy — body text white/85, line-height 1.7,
 *    max-width ~ 760px so paragraphs read like a real legal document
 *  - Mobile-friendly: heading clamps + responsive padding
 *  - One subtle scanline at top so it still feels like SANCTARA
 */
export default function LegalLayout({ title, lastUpdated, children }) {
  return (
    <div className="min-h-screen bg-black text-white" data-testid="legal-layout">
      {/* top scanline so it still feels like SANCTARA */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#00ff88]/60 to-transparent" />

      <header className="border-b border-white/[0.06] px-6 lg:px-8 py-5">
        <div className="max-w-[820px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <Link to="/"
                data-testid="legal-back-home"
                className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-white/55 hover:text-[#00ff88] transition">
            <ArrowLeft className="w-3.5 h-3.5" /> back to grid
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/35">
            // legal · public.disclosure
          </span>
        </div>
      </header>

      <main className="px-6 lg:px-8 py-12">
        <article className="max-w-[820px] mx-auto" data-testid="legal-article">
          <div className="font-mono uppercase tracking-[0.35em] text-[10px] text-[#00ff88]/80">
            // {title.toLowerCase().replace(/[^a-z0-9]+/g, ".")}
          </div>
          <h1 className="mt-3 font-display font-bold text-white leading-[1.05]"
              style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.03em" }}>
            {title}
          </h1>
          <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.25em] text-white/45">
            last updated · {lastUpdated}
          </div>
          <div className="mt-2 h-px bg-gradient-to-r from-[#00ff88]/40 via-[#00d9ff]/20 to-transparent" />

          <div className="legal-prose mt-10 text-[14px] leading-[1.75] text-white/85"
               style={{ wordBreak: "break-word" }}>
            {children}
          </div>
        </article>
      </main>

      <footer className="border-t border-white/[0.06] px-6 lg:px-8 py-8 text-[10px] font-mono uppercase tracking-[0.3em] text-white/35">
        <div className="max-w-[820px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <span>© 2026 sanctara.network network</span>
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-[#00ff88] transition" data-testid="legal-footer-privacy">privacy policy</Link>
            <Link to="/terms" className="hover:text-[#00ff88] transition" data-testid="legal-footer-terms">terms of service</Link>
            <Link to="/" className="hover:text-[#00ff88] transition" data-testid="legal-footer-home">grid</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Section — h2 + body wrapper used inside the legal pages.
 * Numbers headings 1. 2. 3. … for legal navigability.
 */
export function Section({ n, title, children }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="font-display font-bold text-white text-[18px] sm:text-[20px] tracking-tight leading-tight">
        <span className="text-[#00ff88]/80 mr-2 font-mono text-[14px]">{String(n).padStart(2, "0")} ·</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** Highlighted callout box for compliance-critical disclosures. */
export function Callout({ tone = "matrix", children }) {
  const cls = tone === "amber"
    ? "border-amber-400/30 bg-amber-400/[0.04] text-amber-200/90"
    : "border-[#00ff88]/30 bg-[#00ff88]/[0.04] text-[#00ff88]/90";
  return (
    <div className={`my-5 px-5 py-4 border-l-2 ${cls} font-mono text-[12px] leading-[1.7] tracking-[0.02em]`}>
      {children}
    </div>
  );
}
