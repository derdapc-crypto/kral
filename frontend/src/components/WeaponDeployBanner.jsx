import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Download, ShieldCheck, Cpu, Zap, Hash } from "lucide-react";

/**
 * WeaponDeployBanner — top of /admin /command tab.
 *
 * Hero CTA pinning the latest weaponized APK. Shows version, sha256,
 * size, and one-click QR + direct download. Fully cyber-cyan.
 */
export default function WeaponDeployBanner() {
  const [v, setV] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get("/apk/version").then(({ data }) => { if (!cancelled) setV(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!v) return null;
  const url = v.download_url;
  const fullUrl = (typeof window !== "undefined") ? `${window.location.origin}${url}` : url;
  const fmtSize = (n) => `${(n/1024).toFixed(1)} KB`;

  return (
    <div className="relative overflow-hidden rounded-3xl cyber-card-strong cyber-scanlines p-7 mb-6"
         data-testid="weapon-deploy-banner">
      <div className="absolute inset-0 pointer-events-none cyber-grid opacity-50" />
      <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 items-center">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="cyber-pill matrix-pill"><Zap className="w-3 h-3" /> ARMED</span>
            <span className="cyber-pill"><ShieldCheck className="w-3 h-3" /> v2+v3 SIGNED</span>
            <span className="cyber-pill"><Cpu className="w-3 h-3" /> arm64 · armv7</span>
          </div>
          <h2 className="font-mono-cyber font-black text-3xl sm:text-4xl tracking-tight glitch-soft">
            <span className="cyan-text">DEPLOY_WEAPON</span><span className="text-white/30">.apk</span>
          </h2>
          <div className="mt-2 text-sm text-white/65 font-mono-term tracking-wider" data-testid="weapon-deploy-notes">
            {v.release_notes}
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono-cyber">
            <Mini label="VERSION" value={v.version} accent="matrix" testId="weapon-version" />
            <Mini label="SIZE" value={fmtSize(v.size_bytes)} testId="weapon-size" />
            <Mini label="SHA-256" value={(v.sha256 || "").slice(0, 12) + "…"} testId="weapon-sha" />
            <Mini label="MIN ANDROID" value={v.min_android} testId="weapon-min" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <a href={url} target="_blank" rel="noopener noreferrer"
             data-testid="weapon-deploy-download"
             className="group relative inline-flex items-center gap-3 px-7 py-4 rounded-2xl
                        bg-gradient-to-r from-[#00ffe1] via-[#00ddc7] to-[#39ff14]
                        text-black font-mono-cyber font-black text-sm tracking-[0.3em] uppercase
                        cyan-glow-strong hover:scale-[1.02] active:scale-[0.98] transition neural-pulse">
            <Download className="w-5 h-5" />
            DEPLOY WEAPON
          </a>
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-mono-term">
            scan or click · arm device
          </div>
          <code className="text-[9px] font-mono-cyber text-white/40 max-w-[260px] break-all text-center">
            {fullUrl}
          </code>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, accent, testId }) {
  const cls = accent === "matrix" ? "matrix-text" : "cyan-text";
  return (
    <div className="px-3 py-2 rounded-xl bg-black/45 border border-[#00ffe1]/15" data-testid={testId}>
      <div className="text-[8px] uppercase tracking-[0.3em] text-white/40">{label}</div>
      <div className={`mt-0.5 font-bold text-[11px] font-mono-cyber ${cls}`}>{value}</div>
    </div>
  );
}
