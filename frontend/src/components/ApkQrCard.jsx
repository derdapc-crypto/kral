import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../lib/api";
import { Smartphone, Download, ShieldCheck } from "lucide-react";

/**
 * High-quality QR code that points directly to the latest signed APK.
 * Pulls metadata from /api/apk/version so the QR auto-rotates on each
 * release (no hardcoded URL drift).
 */
export default function ApkQrCard({ size = 200, compact = false, testId = "apk-qr-card" }) {
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/apk/version");
        setMeta(data);
      } catch { /* silent */ }
    })();
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = origin + (meta?.download_url || "/grid-worker-v1.2.1.apk");

  if (compact) {
    return (
      <div className="inline-flex items-center gap-3 p-3 rounded-2xl bg-black/40 border border-[#F2C94C]/25" data-testid={testId}>
        <div className="bg-white p-1.5 rounded-md">
          <QRCodeSVG value={url} size={72} level="M" includeMargin={false} fgColor="#070707" bgColor="#ffffff" data-testid={`${testId}-svg`} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#F2C94C]">Scan to install</div>
          <div className="text-xs text-white/80 mt-0.5">v{meta?.version || "1.2.1"}</div>
          <div className="text-[10px] text-white/40">{meta ? `${(meta.size_bytes/1024).toFixed(1)} KB · v2+v3 signed` : ""}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl glass-strong p-6 relative overflow-hidden" data-testid={testId}>
      <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-[#F2C94C]/15 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[#F2C94C]">
          <Smartphone className="w-3 h-3" /> Hardware Farm Deployment
        </div>
        <h3 className="font-display text-xl font-black mt-1.5">Scan to install on Android</h3>
        <p className="text-xs text-white/55 mt-1.5 max-w-sm">
          Point your phone camera at this code. Each scan downloads the latest signed APK directly — no app store, no Play registration.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-6">
          <div className="bg-white p-3 rounded-2xl shadow-[0_0_40px_rgba(242,201,76,0.25)]">
            <QRCodeSVG
              value={url}
              size={size}
              level="H"
              includeMargin={false}
              fgColor="#070707"
              bgColor="#ffffff"
              imageSettings={{
                src: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12,3 21,7.5 21,16.5 12,21 3,16.5 3,7.5" fill="%23F2C94C"/><polygon points="12,8 17,10.5 17,13.5 12,16 7,13.5 7,10.5" fill="%23070707"/></svg>'),
                height: 36,
                width: 36,
                excavate: true,
              }}
              data-testid={`${testId}-svg`}
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Version</div>
            <div className="font-display text-2xl font-black gold-text font-mono-num">v{meta?.version || "—"}</div>
            <div className="mt-3 grid gap-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 text-white/70">
                <Download className="w-3 h-3 text-[#F2C94C]" />
                <span className="font-mono-num">{meta ? `${(meta.size_bytes / 1024).toFixed(1)} KB` : "—"}</span>
                <span className="text-white/40">·</span>
                <span className="text-white/50">min Android {meta?.min_android || "7.0"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-white/70">
                <ShieldCheck className="w-3 h-3 text-[#F2C94C]" />
                <span>Signed {(meta?.signature_schemes || []).join(" + ") || "v2+v3"}</span>
              </div>
              {meta?.sha256 && (
                <div className="font-mono text-[9px] text-white/35 break-all" title={meta.sha256}>
                  sha256 · {meta.sha256.slice(0, 24)}…
                </div>
              )}
            </div>
            <a href={meta?.download_url || "/grid-worker-v1.2.1.apk"}
               download={`grid-worker-v${meta?.version || "1.2.1"}.apk`}
               data-testid={`${testId}-download-link`}
               className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#F2C94C]/10 border border-[#D4AF37]/40 text-[#F2C94C] text-[11px] tracking-widest uppercase font-semibold hover:bg-[#F2C94C]/20">
              <Download className="w-3 h-3" /> Direct download
            </a>
          </div>
        </div>

        <div className="mt-5 font-mono text-[10px] text-white/40 break-all" data-testid={`${testId}-url`}>
          {url}
        </div>
      </div>
    </div>
  );
}
