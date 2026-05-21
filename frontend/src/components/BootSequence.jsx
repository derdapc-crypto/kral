import React, { useEffect, useState } from "react";
import { Terminal, ShieldCheck, Cpu, Network, Lock, Zap } from "lucide-react";

/**
 * BootSequence — full-screen cyber-cyan boot animation.
 *
 * Shows a sequence of "System Decrypting…", "Neural Link Established"-style
 * lines, then fades out and reveals children. Used on first paint of /admin
 * and /login.
 */
const STAGES = [
  { ms: 350,  icon: Terminal,    label: "INITIALIZING TERMINAL",       sub: "/dev/grid/0",                tone: "cyan" },
  { ms: 480,  icon: Lock,        label: "DECRYPTING SESSION KEYS",     sub: "AES-256-GCM · ECDH-P521",     tone: "matrix" },
  { ms: 520,  icon: Network,     label: "ESTABLISHING NEURAL LINK",    sub: "11 compute pool nodes · armed", tone: "cyan" },
  { ms: 480,  icon: Cpu,         label: "ENGAGING COMPUTE ENGINE",     sub: "node rx/0 · grid mesh · live", tone: "matrix" },
  { ms: 380,  icon: ShieldCheck, label: "BIOMETRIC HANDSHAKE OK",      sub: "operator: GRID · clearance Σ", tone: "cyan" },
  { ms: 320,  icon: Zap,         label: "GRID ARMED · STANDING BY",    sub: "v1.5.7 · sanctara.network",           tone: "matrix" },
];

export default function BootSequence({ children, skip = false, persistKey = "grid_boot_seen" }) {
  const [stage, setStage] = useState(0);
  const [done, setDone] = useState(skip);

  useEffect(() => {
    if (skip) return;
    if (typeof window !== "undefined" && sessionStorage.getItem(persistKey) === "1") {
      setDone(true);
      return;
    }
    let cancelled = false;
    let t = 0;
    let acc = 0;
    const advance = () => {
      if (cancelled) return;
      if (t < STAGES.length) {
        acc += STAGES[t].ms;
        setTimeout(() => {
          if (cancelled) return;
          setStage(t + 1);
          t += 1;
          advance();
        }, STAGES[t].ms);
      } else {
        setTimeout(() => {
          if (cancelled) return;
          setDone(true);
          try { sessionStorage.setItem(persistKey, "1"); } catch {}
        }, 380);
      }
    };
    advance();
    return () => { cancelled = true; };
  }, [skip, persistKey]);

  if (done) return children;

  return (
    <div className="fixed inset-0 z-[9999] cyber-bg cyber-scanlines crt-flicker grid place-items-center overflow-hidden"
         data-testid="boot-sequence">
      <div className="absolute inset-0 cyber-grid opacity-60" />
      <div className="relative w-full max-w-2xl px-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-3 h-3 rounded-full bg-[#00ffe1] cyan-glow neural-pulse" />
          <div className="font-mono-term text-[11px] tracking-[0.4em] text-[#00ffe1]/80 uppercase">
            SANCTARA · BOOT SEQUENCE · v1.3.5
          </div>
        </div>

        <div className="cyber-card rounded-2xl p-6 cyan-glow font-mono-cyber text-sm">
          {STAGES.slice(0, stage).map((s, i) => {
            const Icon = s.icon;
            const tone = s.tone === "matrix" ? "matrix-text" : "cyan-text";
            return (
              <div key={i} className="flex items-center gap-3 py-1.5 type-in" data-testid={`boot-stage-${i}`}>
                <Icon className={`w-4 h-4 ${tone}`} />
                <div className="flex-1 flex items-baseline justify-between gap-3">
                  <span className={`${tone} font-bold tracking-wider`}>{s.label}</span>
                  <span className="text-[10px] text-white/45 font-mono-term truncate">{s.sub}</span>
                </div>
                <span className="matrix-text text-[10px]">[OK]</span>
              </div>
            );
          })}
          {stage < STAGES.length && (
            <div className="flex items-center gap-3 py-1.5">
              <div className="w-4 h-4 rounded-full border-2 border-[#00ffe1] border-t-transparent animate-spin" />
              <div className="flex-1 cyan-text font-bold tracking-wider caret-blink">
                {STAGES[stage]?.label || "..."}
              </div>
            </div>
          )}
          <div className="mt-4 h-[2px] bg-[#00ffe1]/10 overflow-hidden rounded-full">
            <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[#00ffe1] to-transparent scan-bar" />
          </div>
          <div className="mt-3 text-[10px] text-white/30 font-mono-term tracking-widest">
            {stage}/{STAGES.length} stages complete · awaiting confirmation…
          </div>
        </div>

        <div className="mt-6 text-center text-[9px] tracking-[0.4em] uppercase text-white/30 font-mono-term">
          encrypted_compute · stealth_mode · operator_only
        </div>
      </div>
    </div>
  );
}
