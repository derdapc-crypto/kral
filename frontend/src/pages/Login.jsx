import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Hexagon, ArrowRight, Terminal, Lock } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const r = await login(email, password);
    setLoading(false);
    if (r.ok) {
      if (r.user.role === "admin") nav("/admin");
      else if (r.user.role === "customer") nav("/customer");
      else nav("/dashboard");
    } else setErr(r.error);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center px-6 py-12 cyber-bg cyber-scanlines relative overflow-hidden">
      <div className="absolute inset-0 cyber-grid opacity-50 pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <Hexagon className="w-7 h-7 cyan-text" />
          <div className="font-mono-cyber font-black text-xl">
            <span className="cyan-text">SANCTARA</span>{" "}
            <span className="matrix-text">NETWORK</span>
          </div>
        </div>
        <div className="cyber-card-strong rounded-3xl p-10" data-testid="login-form">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.4em] uppercase font-mono-term cyan-text mb-3">
            <Terminal className="w-3 h-3" /> ./auth · classified
          </div>
          <h1 className="font-mono-cyber text-3xl font-black tracking-tight">
            <span className="cyan-text">enter_sanctara</span><span className="text-white/30">()</span>
          </h1>
          <p className="text-xs text-white/55 mt-2 font-mono-term tracking-wider caret-blink">
            biometric handshake required
          </p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label className="text-[9px] uppercase tracking-[0.4em] text-[#00ffe1]/70 font-mono-term">EMAIL</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
                data-testid="login-email-input"
                className="mt-2 w-full bg-black/55 border border-[#00ffe1]/15 rounded-xl px-4 py-3 text-white font-mono-cyber focus:border-[#00ffe1] focus:outline-none focus:cyan-glow" />
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-[0.4em] text-[#00ffe1]/70 font-mono-term">PASSWORD</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
                data-testid="login-password-input"
                className="mt-2 w-full bg-black/55 border border-[#00ffe1]/15 rounded-xl px-4 py-3 text-white font-mono-cyber focus:border-[#00ffe1] focus:outline-none focus:cyan-glow" />
            </div>
            {err && <div className="text-xs text-red-400 font-mono-cyber" data-testid="login-error">{">"} {err}</div>}
            <button type="submit" disabled={loading} data-testid="login-submit-btn"
              className="w-full mt-4 px-6 py-3 rounded-xl bg-gradient-to-r from-[#00ffe1] via-[#00ddc7] to-[#39ff14] text-black font-mono-cyber font-black text-sm tracking-[0.3em] uppercase cyan-glow hover:cyan-glow-strong transition disabled:opacity-50 inline-flex items-center justify-center gap-2 neural-pulse">
              <Lock className="w-3.5 h-3.5" />
              {loading ? "decrypting…" : "ESTABLISH LINK"} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
          <div className="mt-6 text-[10px] text-white/50 font-mono-term tracking-wider">
            no_clearance? <Link to="/register" className="cyan-text hover:underline" data-testid="login-register-link">claim_a_node →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
