/*
 * DailyCalibration — v1.6.2 cyber calibration reactor (NOT a wheel of fortune).
 *
 * Visual concept:
 *   • Concentric neon ring scanner
 *   • Rotating segmented protocol ring (24 ticks)
 *   • Central node core that pulses brighter during sync
 *   • "SYNCING NODE…" → "CALIBRATION COMPLETE" → reward reveal flow
 *   • Reward shown with 5-decimal precision, terminal-style
 *
 * Vocabulary: "calibration", "node sync", "contribution receipt bonus".
 * Never: "wheel", "spin", "win", "jackpot", "lottery", "prize", "casino".
 *
 * Auth-protected: contributor must be logged in. Component degrades to a
 * locked state if /daily-calibration/status returns 401.
 */
import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Zap, Lock, CheckCircle2 } from "lucide-react";
import { api, formatApiError } from "../lib/api";

function fmtCountdown(secs) {
  const s = Math.max(0, Math.floor(secs || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}H ${m.toString().padStart(2, "0")}M`;
}

function ProtocolRing({ phase }) {
  // 24 small ticks around a 200x200 dial
  const ticks = Array.from({ length: 24 }, (_, i) => i);
  const ringRotate = phase === "syncing" ? 360 : 0;
  return (
    <div className="relative w-[240px] h-[240px] mx-auto select-none" data-testid="calibration-dial">
      {/* outer scanner ring */}
      <motion.div
        className="absolute inset-0 rounded-full border border-[#00ff88]/30"
        animate={{ rotate: ringRotate }}
        transition={{ duration: phase === "syncing" ? 3 : 0.001, repeat: phase === "syncing" ? Infinity : 0, ease: "linear" }}
      >
        {/* a single bright beacon riding the ring */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#00ff88]"
             style={{ boxShadow: "0 0 14px 3px rgba(0,255,136,0.85)" }} />
      </motion.div>

      {/* segmented mid ring */}
      <motion.div className="absolute inset-3 rounded-full"
                  animate={{ rotate: phase === "syncing" ? -360 : 0 }}
                  transition={{ duration: phase === "syncing" ? 6 : 0.001, repeat: phase === "syncing" ? Infinity : 0, ease: "linear" }}>
        <svg viewBox="0 0 200 200" className="w-full h-full">
          {ticks.map((i) => {
            const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
            const x1 = 100 + Math.cos(a) * 88;
            const y1 = 100 + Math.sin(a) * 88;
            const x2 = 100 + Math.cos(a) * 96;
            const y2 = 100 + Math.sin(a) * 96;
            const active = phase === "complete" || (phase === "syncing" && (Date.now() / 50 + i) % 24 < 6);
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={active ? "#00ff88" : "rgba(255,255,255,0.18)"}
                    strokeWidth="2"
                    style={{ filter: active ? "drop-shadow(0 0 4px rgba(0,255,136,0.8))" : "none" }} />
            );
          })}
          {/* inner data tick ring */}
          <circle cx="100" cy="100" r="74" stroke="rgba(0,217,255,0.18)" strokeWidth="1" fill="none" strokeDasharray="2 4" />
        </svg>
      </motion.div>

      {/* core */}
      <motion.div
        className="absolute inset-12 rounded-full"
        animate={{
          boxShadow: phase === "complete"
            ? "0 0 80px 8px rgba(0,255,136,0.7), inset 0 0 50px rgba(0,255,136,0.5)"
            : phase === "syncing"
              ? ["0 0 30px 4px rgba(0,217,255,0.45)", "0 0 60px 8px rgba(0,255,136,0.65)", "0 0 30px 4px rgba(0,217,255,0.45)"]
              : "0 0 22px 2px rgba(0,217,255,0.3)",
        }}
        transition={{ duration: 1.4, repeat: phase === "syncing" ? Infinity : 0, ease: "easeInOut" }}
        style={{
          background: "radial-gradient(circle, rgba(0,255,136,0.18) 0%, rgba(0,0,0,0.92) 70%)",
          border: "1px solid rgba(0,255,136,0.35)",
        }}>
        <div className="absolute inset-0 grid place-items-center font-mono uppercase tracking-[0.35em] text-[10px]">
          {phase === "idle"     && <span className="text-white/70">node_core</span>}
          {phase === "syncing"  && <span className="text-[#00d9ff] motion-telemetry-blink">syncing…</span>}
          {phase === "complete" && <span className="text-[#00ff88]">sync_ok</span>}
          {phase === "locked"   && <span className="text-amber-300">claimed</span>}
        </div>
      </motion.div>

      {/* corner crosshairs */}
      {["top-0 left-0", "top-0 right-0 rotate-90", "bottom-0 left-0 -rotate-90", "bottom-0 right-0 rotate-180"].map((c, i) => (
        <span key={i} className={`absolute ${c} w-3 h-3 border-l border-t border-[#00ff88]/60 m-1`} />
      ))}
    </div>
  );
}

export default function DailyCalibration({ onClaimed }) {
  const [status, setStatus] = useState(null);
  const [phase, setPhase]   = useState("idle");        // idle | syncing | complete | locked | unauth | error
  const [reward, setReward] = useState(null);          // { reward_tgc, reward_tier }
  const [err, setErr]       = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const lockSeenRef = useRef(false);

  const loadStatus = async () => {
    try {
      const { data } = await api.get("/daily-calibration/status");
      setStatus(data);
      setSecondsLeft(data.seconds_until_next || 0);
      if (data.already_claimed_today) {
        setPhase("locked");
        if (data.today_claim) {
          setReward({
            reward_tgc: data.today_claim.reward_tgc,
            reward_tier: data.today_claim.reward_tier,
          });
        }
      } else {
        setPhase("idle");
      }
    } catch (e) {
      if (e?.response?.status === 401) setPhase("unauth");
      else { setErr(formatApiError(e)); setPhase("error"); }
    }
  };

  useEffect(() => { loadStatus(); }, []);

  // Live countdown
  useEffect(() => {
    if (phase !== "locked") return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { loadStatus(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  const calibrate = async () => {
    if (phase === "syncing" || phase === "locked") return;
    if (status && !status.eligible && !status.already_claimed_today) {
      setErr(
        status.reason === "account_suspended" ? "Account suspended."
      : status.reason === "risk_flagged_account" ? "Risk review required."
      : status.reason === "no_recent_heartbeat" ? "No edge node heartbeat in the last 24h. Engage your node first."
      : "Calibration not available right now."
      );
      return;
    }
    setErr("");
    setPhase("syncing");
    const startedAt = Date.now();
    try {
      const { data } = await api.post("/daily-calibration/claim", {});
      // Keep the dial spinning for at least 1.6s so the UX has weight
      const elapsed = Date.now() - startedAt;
      await new Promise((r) => setTimeout(r, Math.max(0, 1600 - elapsed)));
      setReward({ reward_tgc: data.reward_tgc, reward_tier: data.reward_tier });
      setPhase("complete");
      setSecondsLeft(data.seconds_until_next || 0);
      // Reveal flourish, then transition to locked
      setTimeout(() => { setPhase("locked"); onClaimed?.(data); }, 2200);
    } catch (e) {
      setErr(formatApiError(e));
      setPhase("idle");
    }
  };

  return (
    <div className="relative border border-white/[0.08] bg-black/70 backdrop-blur-xl rounded-lg overflow-hidden"
         data-testid="daily-calibration-panel">
      {/* header strip */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.08]
                      font-mono uppercase text-[10px] tracking-[0.3em] text-white/55">
        <span className={`w-2 h-2 rounded-full ${phase === "complete" || phase === "locked" ? "bg-[#00ff88]" : "bg-[#00d9ff] motion-telemetry-blink"}`} />
        <span>daily_grid_calibration · node_sync_module</span>
        <span className="ml-auto text-[#00ff88]/85">
          {phase === "locked" ? "CLAIMED" : phase === "syncing" ? "SYNCING" : phase === "complete" ? "SYNC OK" : "READY"}
        </span>
      </div>

      <div className="px-6 py-7">
        <div className="font-display text-white" style={{ fontSize: "clamp(22px, 2.4vw, 32px)", letterSpacing: "-0.03em", fontWeight: 700 }}>
          DAILY GRID CALIBRATION
        </div>
        <p className="mt-2 text-[13px] text-white/55 leading-relaxed max-w-md">
          Synchronize your node once per day and receive a small contribution
          receipt bonus.
        </p>

        <div className="mt-7 grid md:grid-cols-[auto_1fr] gap-7 items-center">
          <ProtocolRing phase={phase === "error" ? "idle" : phase === "unauth" ? "locked" : phase} />

          <div className="space-y-4">
            {/* Reward / state display */}
            {phase === "idle" && (
              <div data-testid="calibration-state-idle">
                <div className="font-mono uppercase tracking-[0.3em] text-[10px] text-white/45">// status</div>
                <div className="mt-1 font-mono font-bold text-[16px] text-[#00d9ff]">READY · AWAITING CALIBRATION</div>
                <div className="mt-4 grid grid-cols-2 gap-px bg-white/[0.06] max-w-sm">
                  <div className="bg-black px-3 py-2.5">
                    <div className="font-mono uppercase tracking-[0.25em] text-[9px] text-white/40">heartbeat</div>
                    <div className="font-mono font-bold text-[13px] mt-0.5 text-white tabular-nums">
                      {status?.eligible || status?.already_claimed_today ? "OK · 24H" : "MISSING"}
                    </div>
                  </div>
                  <div className="bg-black px-3 py-2.5">
                    <div className="font-mono uppercase tracking-[0.25em] text-[9px] text-white/40">window</div>
                    <div className="font-mono font-bold text-[13px] mt-0.5 text-[#00ff88]">OPEN</div>
                  </div>
                </div>
              </div>
            )}

            {phase === "syncing" && (
              <div data-testid="calibration-state-syncing">
                <div className="font-mono uppercase tracking-[0.3em] text-[10px] text-[#00d9ff]">// sync_protocol_in_progress</div>
                <div className="mt-1 font-mono font-bold text-[18px] text-[#00d9ff] motion-telemetry-blink">SYNCING NODE…</div>
                <div className="mt-3 space-y-1 font-mono text-[11px] uppercase tracking-[0.2em] text-white/55">
                  <div>{`> handshake_initiated`}</div>
                  <div>{`> protocol_ring_aligned`}</div>
                  <div className="text-[#00ff88]">{`> sealing contribution receipt…`}</div>
                </div>
              </div>
            )}

            {(phase === "complete" || phase === "locked") && reward && (
              <div data-testid={`calibration-state-${phase}`}>
                <div className="font-mono uppercase tracking-[0.3em] text-[10px] text-[#00ff88]">
                  [ {phase === "complete" ? "SYNC COMPLETE" : "ALREADY CALIBRATED"} ]
                </div>
                <div className="mt-1 font-display font-bold tabular-nums" data-testid="calibration-reward-amount"
                     style={{ fontSize: "clamp(26px, 3vw, 42px)",
                              color: "#00ff88",
                              textShadow: "0 0 30px rgba(0,255,136,0.6)",
                              letterSpacing: "-0.03em" }}>
                  +{Number(reward.reward_tgc || 0).toFixed(5)} <span className="text-[0.55em] text-white/45 font-mono uppercase tracking-[0.3em]">TGC</span>
                </div>
                <div className="mt-2 text-[12px] text-white/55 leading-relaxed max-w-md">
                  Daily calibration receipt added to your contribution ledger.
                </div>
                <div className="mt-3 font-mono uppercase tracking-[0.25em] text-[10px] text-white/40">
                  tier · <span className="text-[#00d9ff]">{(reward.reward_tier || "—").replace(/_/g, " ")}</span>
                </div>
                {phase === "locked" && (
                  <div className="mt-4 font-mono uppercase tracking-[0.3em] text-[11px] text-amber-300/90"
                       data-testid="calibration-next-window">
                    next calibration in {fmtCountdown(secondsLeft)}
                  </div>
                )}
              </div>
            )}

            {phase === "unauth" && (
              <div data-testid="calibration-state-unauth">
                <Lock className="w-4 h-4 inline mr-2 text-white/40" />
                <span className="font-mono uppercase tracking-[0.25em] text-[11px] text-white/55">
                  sign in as a contributor to access calibration
                </span>
              </div>
            )}

            {err && (
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-300/85" data-testid="calibration-error">
                // {err}
              </div>
            )}

            {/* Action button */}
            {phase !== "unauth" && (
              <button
                onClick={calibrate}
                disabled={phase === "syncing" || phase === "locked" || phase === "complete"}
                data-testid="calibration-claim-btn"
                className={`mt-2 inline-flex items-center gap-2 px-6 py-3 rounded-md font-mono font-bold uppercase tracking-[0.3em] text-[11px] transition-all ${
                  phase === "locked" || phase === "complete"
                    ? "bg-white/5 text-white/35 cursor-not-allowed border border-white/10"
                    : phase === "syncing"
                      ? "bg-[#00d9ff]/20 text-[#00d9ff] border border-[#00d9ff]/40 cursor-wait"
                      : "bg-[#00ff88] text-black shadow-[0_0_36px_-8px_rgba(0,255,136,0.7)] hover:shadow-[0_0_60px_-8px_rgba(0,255,136,1)]"
                }`}>
                {phase === "locked" || phase === "complete"
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> calibrated</>
                  : phase === "syncing"
                    ? <><Activity className="w-3.5 h-3.5 motion-telemetry-blink" /> syncing node</>
                    : <><Zap className="w-3.5 h-3.5" /> calibrate node</>}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-white/[0.08]
                      font-mono uppercase tracking-[0.25em] text-[10px] text-white/35">
        // calibration_window resets at UTC 00:00 · weighted server-side reward · no fake inflation
      </div>
    </div>
  );
}
