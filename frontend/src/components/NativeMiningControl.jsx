import React, { useEffect, useState } from "react";
import { Cpu, Play, Square, AlertTriangle } from "lucide-react";

/**
 * NativeMiningControl — v1.3.7 mobile-page Start/Stop Mining UI.
 *
 * Detects the JS bridge installed by the v1.3.7 APK (window.GridNative).
 * Tapping Start Mining calls GridNative.startMining() which:
 *   1. flips WorkerState.miningRequested = true
 *   2. fires ACTION_START_MINING intent at GridWorkerService
 *   3. service calls RandomXBridge.startMining() — IFF librandomx.so loaded
 *
 * If running in a normal mobile browser (no native bridge) the card shows
 * a clear "install the APK first" message — never fakes a Start button.
 */
export default function NativeMiningControl() {
  const [bridge, setBridge] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const detect = () => {
      const g = (typeof window !== "undefined") ? window.GridNative : null;
      if (!g) { setBridge(null); return; }
      setBridge(g);
      try {
        const info = JSON.parse(g.getInfo());
        const ms = JSON.parse(g.getMiningStatus());
        setStatus({ info, ms });
      } catch {}
    };
    detect();
    window.addEventListener("grid-native-ready", detect);
    const t = setInterval(() => {
      const g = (typeof window !== "undefined") ? window.GridNative : null;
      if (!g) return;
      try { setStatus({ info: JSON.parse(g.getInfo()), ms: JSON.parse(g.getMiningStatus()) }); } catch {}
    }, 4000);
    return () => { clearInterval(t); window.removeEventListener("grid-native-ready", detect); };
  }, []);

  const start = () => {
    if (!bridge) return;
    setBusy(true);
    try { bridge.startMining(); } catch {}
    setTimeout(() => setBusy(false), 1000);
  };
  const stop = () => {
    if (!bridge) return;
    setBusy(true);
    try { bridge.stopMining(); } catch {}
    setTimeout(() => setBusy(false), 1000);
  };

  // Browser fallback — visible on /mobile when accessed from a desktop / non-APK.
  if (!bridge) {
    return (
      <div className="cyber-card rounded-2xl p-5 mt-4" data-testid="native-mining-control-fallback">
        <div className="flex items-center gap-2 text-xs font-mono-cyber cyan-text">
          <Cpu className="w-4 h-4" /> NATIVE_MINING
        </div>
        <div className="mt-2 text-[11px] text-white/55 font-mono-term">
          Native RandomX mining is only available inside the v1.3.7 APK.
          Install the APK and re-open this screen to see Start / Stop.
        </div>
      </div>
    );
  }

  const ms = status?.ms || {};
  const available = !!ms.available;
  const running = !!ms.running;
  const requested = !!ms.requested;
  const hashrate = ms.hashrate_hps || 0;

  return (
    <div className="cyber-card rounded-2xl p-5 mt-4" data-testid="native-mining-control">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Cpu className={`w-4 h-4 ${running ? "matrix-text" : "cyan-text"}`} />
          <div className="font-mono-cyber font-bold cyan-text text-sm">native_mining</div>
          <span className={`cyber-pill ${running ? "matrix-pill" : ""}`} data-testid="nmc-state">
            {running ? "MINING" : requested ? (available ? "WARMING" : "UNAVAILABLE") : "STOPPED"}
          </span>
        </div>
        <div className="text-[11px] font-mono-cyber" data-testid="nmc-hashrate">
          <span className="text-white/40">H/s:</span>{" "}
          <span className="matrix-text">{hashrate.toFixed(1)}</span>
        </div>
      </div>

      {!available && (
        <div className="mt-3 p-2.5 rounded-xl border border-amber-400/25 bg-amber-400/5 text-[10px] font-mono-term text-amber-200/80 flex items-start gap-2"
             data-testid="nmc-unavailable-notice">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>librandomx.so missing in this APK build — phone stays in connected_only mode. Pending v1.3.7 release with native lib bundled.</span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={start} disabled={busy || running}
                className="px-4 py-3 rounded-xl bg-gradient-to-r from-[#00ffe1] via-[#00ddc7] to-[#39ff14] text-black font-mono-cyber font-black text-[11px] tracking-[0.2em] uppercase disabled:opacity-40 transition cyan-glow inline-flex items-center justify-center gap-1.5"
                data-testid="nmc-start-btn">
          <Play className="w-3 h-3" /> Start Mining
        </button>
        <button onClick={stop} disabled={busy || (!running && !requested)}
                className="px-4 py-3 rounded-xl border border-[#00ffe1]/30 text-[#00ffe1] font-mono-cyber font-bold text-[11px] tracking-[0.2em] uppercase disabled:opacity-40 transition hover:cyan-glow inline-flex items-center justify-center gap-1.5"
                data-testid="nmc-stop-btn">
          <Square className="w-3 h-3" /> Stop Mining
        </button>
      </div>

      <div className="mt-3 text-[10px] text-white/40 font-mono-term">
        accepted: {ms.accepted_shares ?? 0} · rejected: {ms.rejected_shares ?? 0} · status: {ms.status || "—"}
      </div>
    </div>
  );
}
