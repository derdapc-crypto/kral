import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Send, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * TelegramSignalCard — admin-only signal-line status (v1.3.5).
 * Shows whether Telegram bot is configured + Test button.
 */
export default function TelegramSignalCard() {
  const [s, setS] = useState(null);
  const [testing, setTesting] = useState(false);
  const [last, setLast] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get("/admin/telegram/status");
        if (!cancelled) setS(data);
      } catch {}
    };
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const test = async () => {
    setTesting(true);
    try {
      const { data } = await api.post("/admin/telegram/test");
      setLast(data?.sent ? "✓ test signal SENT" : "✗ test signal FAILED");
    } catch { setLast("✗ test failed"); }
    setTesting(false);
    setTimeout(() => setLast(null), 4000);
  };

  if (!s) return null;
  const ok = s.enabled;

  return (
    <div className={`rounded-3xl p-5 cyber-card ${ok ? "cyber-card-strong" : ""}`} data-testid="telegram-signal-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00ffe1]/8 border border-[#00ffe1]/30 grid place-items-center">
            <Send className={`w-4 h-4 ${ok ? "matrix-text" : "cyan-text"}`} />
          </div>
          <div>
            <div className="font-mono-cyber font-bold text-sm flex items-center gap-2">
              <span className="cyan-text">telegram_signal_line</span>
              <span data-testid="telegram-state-badge" className={`cyber-pill ${ok ? "matrix-pill" : ""}`}>
                {ok ? "● ARMED" : "● OFFLINE"}
              </span>
            </div>
            <div className="text-[11px] text-white/55 mt-1 font-mono-term">
              fires "Sistem Kar Üretti: +{s.step_usdt} USDT" every {s.step_usdt} USDT delta
            </div>
          </div>
        </div>
        {ok && (
          <button onClick={test} className="cyber-pill" data-testid="telegram-test-btn" disabled={testing}>
            <RefreshCw className={`w-3 h-3 ${testing ? "animate-spin" : ""}`} />
            {testing ? "sending…" : "TEST SIGNAL"}
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="p-3 rounded-2xl bg-black/55 border border-[#00ffe1]/12" data-testid="telegram-token-cell">
          <div className="text-[9px] uppercase tracking-[0.28em] text-[#00ffe1]/60 font-mono-term">BOT_TOKEN</div>
          <div className="mt-1 font-mono-cyber text-[11px]">{s.token_set ? <span className="matrix-text">SET</span> : <span className="text-amber-300">missing</span>}</div>
        </div>
        <div className="p-3 rounded-2xl bg-black/55 border border-[#00ffe1]/12" data-testid="telegram-chat-cell">
          <div className="text-[9px] uppercase tracking-[0.28em] text-[#00ffe1]/60 font-mono-term">CHAT_ID</div>
          <div className="mt-1 font-mono-cyber text-[11px]">{s.chat_set ? <span className="matrix-text">SET</span> : <span className="text-amber-300">missing</span>}</div>
        </div>
      </div>

      {last && (
        <div className="mt-3 text-[10px] font-mono-term tracking-wider matrix-text" data-testid="telegram-test-result">
          {last}
        </div>
      )}

      {!ok && (
        <div className="mt-4 p-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 text-[10px] text-amber-100/85 font-mono-term" data-testid="telegram-setup-instructions">
          <div className="flex items-center gap-1.5 text-amber-300/90 font-bold mb-1.5 tracking-widest">
            <AlertTriangle className="w-3 h-3" /> SETUP REQUIRED
          </div>
          <ol className="space-y-1 list-decimal list-inside">
            {(s.instructions || []).map((line, i) => <li key={i}>{line}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}
