/*
 * DualClientDownload — v1.7.5 store-safe LIGHT vs direct NODE PRO selector.
 *
 * Compliant copy only: never promises higher yield, never compares earnings
 * between clients. Light is shown FIRST (default), Node Pro is the advanced
 * opt-in alternative.
 */
import React, { useEffect, useState } from "react";
import { Smartphone, ShieldCheck, Download, ArrowRight, Cpu } from "lucide-react";

const LIGHT_BASENAME   = "sanctara-light.apk";
const NODEPRO_BASENAME = "sanctara-node-pro.apk";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";

// Fire-and-forget download counter — runs alongside the native browser download.
function trackDownload(flavor) {
  try {
    if (typeof fetch === "function" && BACKEND) {
      fetch(`${BACKEND}/api/apk/track-download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flavor }),
        keepalive: true,
      }).catch(() => {});
    }
  } catch { /* never block the user's download */ }
}

// Read the live APK metadata (version, size_bytes, native_lib_embedded) directly
// from the file on disk on the backend — guarantees the front shows the truth
// even if a stale CDN copy is cached somewhere.
function useApkMeta(url) {
  const [meta, setMeta] = useState({ size: 0, version: "" });
  useEffect(() => {
    let aborted = false;
    fetch(url, { method: "HEAD" }).then(r => {
      if (aborted) return;
      const sz = Number(r.headers.get("content-length") || 0);
      setMeta(m => ({ ...m, size: sz }));
    }).catch(() => {});
    if (BACKEND) {
      fetch(`${BACKEND}/api/apk/version`).then(r => r.json()).then(d => {
        if (aborted) return;
        setMeta(m => ({ ...m, version: d?.version || "" }));
      }).catch(() => {});
    }
    return () => { aborted = true; };
  }, [url]);
  return meta;
}

const fmtSize = (b) => {
  if (!b) return "—";
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
};

export default function DualClientDownload({ origin = "" }) {
  const lightUrl   = (origin || "") + "/" + LIGHT_BASENAME;
  const nodeproUrl = (origin || "") + "/" + NODEPRO_BASENAME;
  const lightMeta  = useApkMeta(lightUrl);
  const proMeta    = useApkMeta(nodeproUrl);

  return (
    <section className="relative py-16 px-6 lg:px-8 border-t border-white/[0.06]"
             id="clients" data-testid="dual-client-download">
      <div className="max-w-[1240px] mx-auto">
        <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#ff8800]/85 mb-3">
          // network.client_matrix
        </div>
        <h2 className="font-display text-white"
            style={{ fontSize: "clamp(28px, 3.2vw, 48px)", letterSpacing: "-0.04em", fontWeight: 600, lineHeight: 0.96 }}>
          Two clients. <span className="text-white/55">Same network.</span>
        </h2>

        <div className="mt-10 grid lg:grid-cols-2 gap-px bg-white/[0.08]">
          {/* ====== LIGHT ====== */}
          <div className="bg-black p-7 relative" data-testid="light-panel">
            <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.3em] font-mono">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-[#ff3838]" />
                <span className="text-[#ff3838]">store_safe · official cloud client</span>
              </div>
              <div className="text-[#ffe000] tabular-nums">
                v{lightMeta.version || "—"} · {fmtSize(lightMeta.size)}
              </div>
            </div>
            <h3 className="mt-4 font-display font-bold text-white"
                style={{ fontSize: "clamp(24px, 2.4vw, 34px)", letterSpacing: "-0.03em" }}>
              SANCTARA Light
            </h3>
            <p className="mt-3 text-white/55 leading-relaxed text-[13px] max-w-md">
              Store-safe dashboard, ledger, calibration and participation
              client. <span className="text-white">No device-side cryptocurrency mining.</span>
              No CPU-intensive background compute.
            </p>
            <ul className="mt-5 space-y-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/55">
              <li>{`> contribution ledger viewer`}</li>
              <li>{`> daily grid calibration (ad-gated)`}</li>
              <li>{`> contributor drops + buyback status`}</li>
              <li>{`> snapshot readiness notifications`}</li>
              <li className="text-[#ff3838]">{`> google play / app store compliant`}</li>
            </ul>
            <a href={lightUrl} download
               data-testid="light-cta"
               onClick={() => trackDownload("light")}
               className="mt-7 inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[#ff3838] text-black font-mono font-bold uppercase tracking-[0.3em] text-[11px]
                          shadow-[0_0_36px_-8px_rgba(255,56,56,0.7)] hover:shadow-[0_0_56px_-8px_rgba(255,56,56,1)] transition-all">
              <Download className="w-3.5 h-3.5" />
              get light client
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.3em] text-white/35">
              io.sanctara.light · android · arm64
            </div>
          </div>

          {/* ====== NODE PRO ====== */}
          <div className="bg-black p-7 relative" data-testid="nodepro-panel">
            <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.3em] font-mono">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-[#ff8800]" />
                <span className="text-[#ff8800]">direct download · advanced client</span>
              </div>
              <div className={`tabular-nums font-bold ${proMeta.size > 500_000 ? "text-[#ff8800]" : "text-[#ff3838]"}`}>
                v{proMeta.version || "—"} · {fmtSize(proMeta.size)}
                {proMeta.size > 0 && proMeta.size < 500_000 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-[#ff3838]/20 text-[#ff3838] text-[8px]">⚠ STALE</span>
                )}
              </div>
            </div>
            <h3 className="mt-4 font-display font-bold text-white"
                style={{ fontSize: "clamp(24px, 2.4vw, 34px)", letterSpacing: "-0.03em" }}>
              SANCTARA Node Pro
            </h3>
            <p className="mt-3 text-white/55 leading-relaxed text-[13px] max-w-md">
              Advanced client for users who <span className="text-white">explicitly opt into device-side workloads</span>.
              May use device compute resources while active. Includes battery
              and thermal safeguards. Stop anytime.
            </p>
            <ul className="mt-5 space-y-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/55">
              <li>{`> explicit opt-in resource disclosure`}</li>
              <li>{`> battery & thermal guards (admin-tunable)`}</li>
              <li>{`> foreground service notification`}</li>
              <li>{`> stop node anytime, one tap`}</li>
              <li className="text-amber-300">{`> may use device cpu / battery`}</li>
            </ul>
            <a href={nodeproUrl} download
               data-testid="nodepro-cta"
               onClick={() => trackDownload("node_pro")}
               className="mt-7 inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[#ff8800] text-black font-mono font-bold uppercase tracking-[0.3em] text-[11px]
                          shadow-[0_0_36px_-8px_rgba(255,136,0,0.7)] hover:shadow-[0_0_56px_-8px_rgba(255,136,0,1)] transition-all">
              <Download className="w-3.5 h-3.5" />
              download node pro
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.3em] text-white/35">
              io.sanctara.nodepro · android · arm64 · direct download only
            </div>
          </div>
        </div>

        <p className="mt-6 text-[11px] text-white/35 font-mono uppercase tracking-[0.2em]">
          // both clients run on the same backend and share the same contribution ledger.
          additional contribution receipts may be available when optional
          device-side workloads are active and verified.
        </p>
      </div>
    </section>
  );
}
