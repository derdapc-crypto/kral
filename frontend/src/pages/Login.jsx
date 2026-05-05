import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Hexagon, ArrowRight } from "lucide-react";

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
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center px-6 py-12 grid-bg">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <Hexagon className="w-7 h-7 text-[#D4AF37]" />
          <div className="font-display font-black text-xl">THE <span className="gold-text">GRID</span></div>
        </div>
        <div className="glass-strong rounded-3xl p-10">
          <h1 className="font-display text-3xl font-black tracking-tighter">Enter the grid.</h1>
          <p className="text-sm text-white/50 mt-2">Access your nodes, wallet and compute telemetry.</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
                data-testid="login-email-input"
                className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Password</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
                data-testid="login-password-input"
                className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none" />
            </div>
            {err && <div className="text-sm text-red-400" data-testid="login-error">{err}</div>}
            <button type="submit" disabled={loading} data-testid="login-submit-btn"
              className="w-full mt-4 px-6 py-3 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-sm hover:shadow-[0_0_30px_rgba(242,201,76,0.6)] transition-shadow disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {loading ? "Authenticating..." : "Sign in"} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
          <div className="mt-6 text-xs text-white/50">
            No account? <Link to="/register" className="text-[#F2C94C] hover:underline" data-testid="login-register-link">Claim a node</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
