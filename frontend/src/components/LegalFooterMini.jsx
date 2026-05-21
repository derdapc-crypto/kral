import React from "react";
import { Link } from "react-router-dom";

/**
 * LegalFooterMini — slim, one-line legal strip used by inner public pages
 * (Token, Mobile, Dashboard) so every public exit point exposes Privacy +
 * Terms links. Visually quieter than the Landing footer.
 */
export default function LegalFooterMini({ testIdPrefix = "" }) {
  const p = testIdPrefix ? `${testIdPrefix}-` : "";
  return (
    <div className="border-t border-white/[0.06] px-6 lg:px-8 py-5"
         data-testid={`${p}legal-footer-mini`}>
      <div className="max-w-[1240px] mx-auto flex flex-wrap items-center justify-between gap-3
                      font-mono text-[10px] uppercase tracking-[0.3em] text-white/35">
        <span>// sanctara.network · pre-mainnet</span>
        <div className="flex flex-wrap items-center gap-5">
          <Link to="/privacy" className="hover:text-[#00ff88] transition"
                data-testid={`${p}legal-privacy-link`}>privacy</Link>
          <Link to="/terms" className="hover:text-[#00ff88] transition"
                data-testid={`${p}legal-terms-link`}>terms</Link>
          <Link to="/" className="hover:text-[#00ff88] transition"
                data-testid={`${p}legal-home-link`}>sanctara</Link>
        </div>
      </div>
    </div>
  );
}
