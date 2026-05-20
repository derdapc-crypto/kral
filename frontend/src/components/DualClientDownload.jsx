/*
 * DualClientDownload — v1.7.5 store-safe LIGHT vs direct NODE PRO selector.
 *
 * Compliant copy only: never promises higher yield, never compares earnings
 * between clients. Light is shown FIRST (default), Node Pro is the advanced
 * opt-in alternative.
 */
import React from "react";
import { Smartphone, ShieldCheck, Download, ArrowRight, Cpu } from "lucide-react";

const LIGHT_BASENAME   = "grid-worker-light.apk";
const NODEPRO_BASENAME = "grid-worker-nodepro.apk";

export default function DualClientDownload({ origin = "" }) {
  const lightUrl   = (origin || "") + "/" + LIGHT_BASENAME;
  const nodeproUrl = (origin || "") + "/" + NODEPRO_BASENAME;

  return (
    <section className="relative py-16 px-6 lg:px-8 border-t border-white/[0.06]"
             id="clients" data-testid="dual-client-download">
      <div className="max-w-[1240px] mx-auto">
        <div className="font-mono uppercase tracking-[0.4em] text-[10px] text-[#00ff88]/85 mb-3">
          // network.client_matrix
        </div>
        <h2 className="font-display text-white"
            style={{ fontSize: "clamp(28px, 3.2vw, 48px)", letterSpacing: "-0.04em", fontWeight: 600, lineHeight: 0.96 }}>
          Two clients. <span className="text-white/55">Same network.</span>
        </h2>

        <div className="mt-10 grid lg:grid-cols-2 gap-px bg-white/[0.08]">
          {/* ====== LIGHT ====== */}
          <div className="bg-black p-7 relative" data-testid="light-panel">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00d9ff]" />
              <span className="text-[#00d9ff]">store_safe · official cloud client</span>
            </div>
            <h3 className="mt-4 font-display font-bold text-white"
                style={{ fontSize: "clamp(24px, 2.4vw, 34px)", letterSpacing: "-0.03em" }}>
              THE GRID Light
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
              <li className="text-[#00d9ff]">{`> google play / app store compliant`}</li>
            </ul>
            <a href={lightUrl} download
               data-testid="light-cta"
               className="mt-7 inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[#00d9ff] text-black font-mono font-bold uppercase tracking-[0.3em] text-[11px]
                          shadow-[0_0_36px_-8px_rgba(0,217,255,0.7)] hover:shadow-[0_0_56px_-8px_rgba(0,217,255,1)] transition-all">
              <Download className="w-3.5 h-3.5" />
              get light client
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.3em] text-white/35">
              io.thegrid.light · android · arm64
            </div>
          </div>

          {/* ====== NODE PRO ====== */}
          <div className="bg-black p-7 relative" data-testid="nodepro-panel">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] font-mono">
              <Cpu className="w-3.5 h-3.5 text-[#00ff88]" />
              <span className="text-[#00ff88]">direct download · advanced client</span>
            </div>
            <h3 className="mt-4 font-display font-bold text-white"
                style={{ fontSize: "clamp(24px, 2.4vw, 34px)", letterSpacing: "-0.03em" }}>
              THE GRID Node Pro
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
               className="mt-7 inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[#00ff88] text-black font-mono font-bold uppercase tracking-[0.3em] text-[11px]
                          shadow-[0_0_36px_-8px_rgba(0,255,136,0.7)] hover:shadow-[0_0_56px_-8px_rgba(0,255,136,1)] transition-all">
              <Download className="w-3.5 h-3.5" />
              download node pro
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.3em] text-white/35">
              io.thegrid.nodepro · android · arm64 · direct download only
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
