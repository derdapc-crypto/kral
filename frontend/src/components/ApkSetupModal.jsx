import React, { useEffect, useState } from "react";
import { X, Download, Shield, Wifi, BatteryCharging, Cpu } from "lucide-react";
import { api } from "../lib/api";

export default function ApkSetupModal({ open, onClose }) {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    if (!open) return;
    (async () => {
      try { const { data } = await api.get("/apk/version"); setMeta(data); } catch {}
    })();
  }, [open]);

  if (!open) return null;

  const onDownload = async () => {
    try { await api.post("/apk/track-download"); } catch {}
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85 backdrop-blur-md p-4" onClick={onClose} data-testid="apk-modal">
      <div className="w-full max-w-xl rounded-3xl glass-strong p-8 relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-[#D4AF37]/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#F2C94C]">/ android worker</div>
              <h3 className="font-display text-2xl font-bold mt-1">Install in 3 steps.</h3>
              {meta && <div className="text-[10px] tracking-[0.25em] uppercase text-white/50 mt-1.5">v{meta.version} · min Android {meta.min_android} · {meta.abi.join(" · ")}</div>}
            </div>
            <button onClick={onClose} data-testid="apk-modal-close" className="p-2 rounded-full hover:bg-white/5 text-white/60">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            {[
              { n: "01", icon: Download, title: "Download the APK", desc: `Tap below. Allow installs from unknown sources if prompted. Real signed APK · v2+v3 schemes · min Android ${meta?.min_android || "7.0"}+.` },
              { n: "02", icon: Shield, title: "Install & Authorize", desc: "Open the file. Grant compute permission — required for Golden Rule compliance." },
              { n: "03", icon: BatteryCharging, title: "Connect While Charging", desc: "Plug in. Connect Wi-Fi. Sign in with your Grid credentials. Your device starts earning SANCT immediately." },
            ].map((s) => (
              <div key={s.n} className="flex gap-4 p-4 rounded-2xl bg-black/40 border border-white/10">
                <div className="font-display font-black text-2xl gold-text font-mono-num w-12">{s.n}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <s.icon className="w-4 h-4 text-[#F2C94C]" />
                    <div className="font-display font-bold">{s.title}</div>
                  </div>
                  <p className="text-xs text-white/60 mt-1.5 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {meta?.release_notes && (
            <div className="mt-4 p-3 rounded-xl border border-[#F2C94C]/20 bg-[#F2C94C]/5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#F2C94C] mb-1">v{meta.version} release notes</div>
              <div className="text-xs text-white/70">{meta.release_notes}</div>
              {meta.sha256 && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-white/50">
                  <div><span className="text-white/30 uppercase tracking-widest">Size</span> · <span className="text-white font-mono-num">{(meta.size_bytes/1024).toFixed(1)} KB</span></div>
                  <div><span className="text-white/30 uppercase tracking-widest">Sigs</span> · <span className="text-[#F2C94C] font-mono">{(meta.signature_schemes||[]).join(" + ")}</span></div>
                  <div className="col-span-2 truncate font-mono text-[9px] text-white/40" title={meta.sha256}>SHA-256 · {meta.sha256.slice(0,32)}…</div>
                </div>
              )}
            </div>
          )}

          <a
            href={meta?.download_url || "/grid-worker-v1.2.0.apk"}
            download={`grid-worker-v${meta?.version || "1.2.0"}.apk`}
            onClick={onDownload}
            data-testid="apk-download-btn"
            className="mt-6 w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-sm hover:shadow-[0_0_40px_rgba(242,201,76,0.6)] transition-shadow"
          >
            <Download className="w-4 h-4" /> Download grid-worker-v{meta?.version || "1.2.0"}.apk
          </a>
          <div className="mt-4 flex justify-center gap-6 text-[10px] uppercase tracking-[0.25em] text-white/40">
            <span className="flex items-center gap-1.5"><BatteryCharging className="w-3 h-3" /> Charging only</span>
            <span className="flex items-center gap-1.5"><Wifi className="w-3 h-3" /> Wi-Fi only</span>
            <span className="flex items-center gap-1.5"><Cpu className="w-3 h-3" /> {meta?.abi?.length || 2} ABIs</span>
          </div>
        </div>
      </div>
    </div>
  );
}
