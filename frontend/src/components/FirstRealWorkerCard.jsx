import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import {
  Trophy, Radio, Zap, Globe2, Smartphone, BatteryCharging, Wifi, Thermometer, Clock, Hash, MapPin
} from "lucide-react";

function relTime(seconds) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function fmtAbs(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return iso; }
}

/**
 * "First Real Worker" telemetry card — celebrates the very first physical
 * device to ever achieve a real Binance Pool stratum link.
 *
 * AWAITING state: pulsing gold radar, "Awaiting first physical worker…" message.
 * DISCOVERED state: confetti gold burst, full device profile, milestone badge.
 *
 * Polls /api/admin/first-real-worker every 5s. The discovery flips from
 * awaiting=true → awaiting=false; the underlying device.stratum_first_linked_at
 * is set via $min so it never moves once captured.
 */
export default function FirstRealWorkerCard() {
  const [data, setData] = useState(null);
  const [discovered, setDiscovered] = useState(false);
  const [justDiscovered, setJustDiscovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: r } = await api.get("/admin/first-real-worker");
        if (cancelled) return;
        const isDiscovered = !r.awaiting && r.first_worker;
        // Detect the moment of discovery to pulse the celebration animation
        if (isDiscovered && !discovered) {
          setJustDiscovered(true);
          setTimeout(() => setJustDiscovered(false), 6000);
        }
        setDiscovered(isDiscovered);
        setData(r);
      } catch { /* keep last known state */ }
    };
    load();
    const t = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) load();
    }, 5000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line
  }, [discovered]);

  if (!data) return null;

  if (data.awaiting) {
    return (
      <div data-testid="first-real-worker-awaiting"
        className="relative rounded-3xl border border-[#F2C94C]/25 bg-gradient-to-br from-[#F2C94C]/[0.03] via-black/30 to-black/30 p-6 overflow-hidden">
        {/* radar sweep */}
        <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full border border-[#F2C94C]/20 animate-ping" />
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full border border-[#F2C94C]/30" style={{ animation: "ping 2s infinite" }} />
        <div className="absolute right-8 top-8 w-24 h-24 rounded-full bg-[#F2C94C]/10 blur-2xl" />

        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl border border-[#F2C94C]/40 bg-black/50 grid place-items-center">
            <Radio className="w-6 h-6 text-[#F2C94C] dot-pulse" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#F2C94C]/80">/ historic milestone</div>
            <h3 className="font-display font-black text-2xl tracking-tighter mt-1">
              Awaiting <span className="gold-text">First Real Worker</span>
            </h3>
            <p className="text-sm text-white/60 mt-2 max-w-2xl leading-relaxed">
              The next physical device to install <code className="text-[#F2C94C] font-mono">v1.2.6</code>,
              tap <span className="text-[#F2C94C] font-semibold">START</span>, and complete a real
              Binance Pool stratum handshake will be immortalised here.
            </p>
            <div className="mt-4 flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-widest text-white/40">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10">
                <BatteryCharging className="w-3 h-3" /> Charger
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10">
                <Wifi className="w-3 h-3" /> Wi-Fi
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10">
                <Radio className="w-3 h-3" /> TCP 9000
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest text-white/40">Linked ever</div>
            <div className="font-display font-black text-3xl gold-text font-mono-num" data-testid="first-worker-linked-ever">
              {data.total_linked_ever ?? 0}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const w = data.first_worker;
  return (
    <div data-testid="first-real-worker-card"
      className={`relative rounded-3xl border ${justDiscovered ? "border-[#F2C94C] grid-pulse" : "border-[#F2C94C]/40"} bg-gradient-to-br from-[#F2C94C]/15 via-[#F2C94C]/5 to-black/40 p-6 overflow-hidden`}>
      {/* confetti glow */}
      <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-[#F2C94C]/20 blur-3xl" />
      <div className="absolute -left-10 -bottom-10 w-60 h-60 rounded-full bg-[#B8860B]/10 blur-3xl" />

      <div className="relative">
        {/* Header — milestone badge */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl border-2 border-[#F2C94C] bg-gradient-to-br from-[#F2C94C] to-[#B8860B] grid place-items-center shadow-[0_0_30px_rgba(242,201,76,0.6)]">
              <Trophy className="w-7 h-7 text-black" strokeWidth={2.4} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#F2C94C]" data-testid="first-worker-tagline">
                / historic milestone · captured
              </div>
              <h3 className="font-display font-black text-2xl tracking-tighter mt-1">
                The <span className="gold-text">First Real Worker</span>
              </h3>
              <div className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#F2C94C] bg-black/40 text-[10px] tracking-widest uppercase text-[#F2C94C] font-bold"
                data-testid="first-worker-badge">
                <Zap className="w-3 h-3" /> #1 · LINKED
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest text-white/40">First linked</div>
            <div className="font-display font-black text-lg gold-text font-mono-num" data-testid="first-worker-time">
              {relTime(w.seconds_since_first_link)}
            </div>
            <div className="text-[10px] text-white/40 font-mono mt-0.5" data-testid="first-worker-time-abs">
              {fmtAbs(w.stratum_first_linked_at)}
            </div>
            <div className="mt-1.5 text-[9px] uppercase tracking-widest">
              {w.stratum_linked_now ? (
                <span className="text-[#F2C94C] inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#F2C94C] dot-pulse" /> still linked</span>
              ) : (
                <span className="text-white/40">offline now</span>
              )}
            </div>
          </div>
        </div>

        {/* Device profile grid */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Cell icon={Smartphone} label="Device" value={`${w.manufacturer || w.brand || "—"} · ${w.model || "—"}`} testId="first-worker-device" />
          <Cell icon={Hash}       label="ID"     value={w.id_short} mono accent testId="first-worker-id" />
          <Cell icon={Globe2}     label="Country / Tier" value={`${w.country || "—"} · ${w.tier || "—"}`} testId="first-worker-geo" />
          <Cell icon={Radio}      label="Worker name" value={w.binance_worker_name || "—"} mono testId="first-worker-name" />
          <Cell icon={Clock}      label="App"    value={`v${w.app_version || "?"} · ${w.android_version || "Android"}`} testId="first-worker-app" />
          <Cell icon={BatteryCharging} label="Battery" value={`${w.battery ?? "—"}% ${w.charging ? "· chrg" : ""}`} testId="first-worker-batt" />
          <Cell icon={Thermometer} label="Temp"  value={w.temperature_c != null ? `${w.temperature_c.toFixed(1)}°C` : "—"} testId="first-worker-temp" />
          <Cell icon={Wifi}       label="Net"    value={w.wifi ? "Wi-Fi" : "Cellular"} testId="first-worker-net" />
        </div>

        {/* Operator footer */}
        <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="text-white/55">
            Operator: <span className="text-white/80">{w.user_email || "anonymous"}</span>
            {w.user_name && <span className="text-white/40"> · {w.user_name}</span>}
          </div>
          <div className="flex items-center gap-3 text-[10px] tracking-widest uppercase">
            <span className="text-white/40">Session</span>
            <span className="font-display font-black gold-text font-mono-num" data-testid="first-worker-tasks">
              {w.session_tasks ?? 0} tasks
            </span>
            <span className="font-display font-black gold-text font-mono-num" data-testid="first-worker-tgc">
              +{(w.session_tgc ?? 0).toFixed(5)} SANCT
            </span>
          </div>
        </div>
        {data.total_linked_ever > 1 && (
          <div className="mt-3 text-[10px] uppercase tracking-widest text-white/35">
            <span className="text-[#F2C94C] font-mono">{data.total_linked_ever}</span> physical workers have linked since.
          </div>
        )}
      </div>
    </div>
  );
}

function Cell({ icon: Icon, label, value, mono, accent, testId }) {
  return (
    <div className="p-3 rounded-2xl bg-black/45 border border-white/10 hover:border-[#F2C94C]/30 transition-colors" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.25em] text-white/40">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`mt-1 truncate ${mono ? "font-mono text-[11px]" : "font-display font-black text-sm"} ${accent ? "gold-text" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}
