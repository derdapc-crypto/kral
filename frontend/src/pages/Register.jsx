import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Hexagon, ArrowRight, Briefcase, User } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get("role") === "customer" ? "customer" : "user");
  const refCode = params.get("ref") || "";
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const r = params.get("role");
    if (r === "customer") setRole("customer");
  }, [params]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const r = await register(email, password, name, role, company, refCode);
    setLoading(false);
    if (r.ok) {
      if (r.user.role === "customer") nav("/customer");
      else if (r.user.role === "admin") nav("/admin");
      else nav("/dashboard");
    } else setErr(r.error);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center px-6 py-12 grid-bg">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <Hexagon className="w-7 h-7 text-[#D4AF37]" />
          <div className="font-display font-black text-xl">SANCT<span className="gold-text" style={{ color: "#ff8800" }}>ARA</span></div>
        </div>
        <div className="glass-strong rounded-3xl p-10">
          <div className="grid grid-cols-2 gap-2 mb-7 p-1 bg-black/40 rounded-full border border-white/5">
            <button onClick={() => setRole("user")} data-testid="register-role-user"
              className={`px-3 py-2 rounded-full text-xs tracking-wide flex items-center justify-center gap-2 transition-all ${
                role === "user" ? "bg-[#F2C94C] text-black font-semibold" : "text-white/60 hover:text-white"
              }`}>
              <User className="w-3.5 h-3.5" /> Worker / Node
            </button>
            <button onClick={() => setRole("customer")} data-testid="register-role-customer"
              className={`px-3 py-2 rounded-full text-xs tracking-wide flex items-center justify-center gap-2 transition-all ${
                role === "customer" ? "bg-[#F2C94C] text-black font-semibold" : "text-white/60 hover:text-white"
              }`}>
              <Briefcase className="w-3.5 h-3.5" /> Enterprise
            </button>
          </div>

          <h1 className="font-display text-3xl font-black tracking-tighter">
            {role === "customer" ? "Rent the reactor." : "Claim your node."}
          </h1>
          <p className="text-sm text-white/50 mt-2">
            {role === "customer" ? "Upload AI workloads. Pay only for compute solved." : "One minute to start earning USDT from idle compute."}
          </p>
          {refCode && (
            <div className="mt-4 px-3 py-2 rounded-xl border border-[#F2C94C]/30 bg-[#F2C94C]/5 text-xs text-[#F2C94C]" data-testid="register-ref-banner">
              ✦ Joining with referral code <span className="font-mono font-bold">{refCode}</span> — your inviter earns 10% lifetime commission.
            </div>
          )}
          <form onSubmit={submit} className="mt-8 space-y-5">
            {role === "customer" && (
              <div>
                <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Company</label>
                <input value={company} onChange={(e) => setCompany(e.target.value)} required
                  data-testid="register-company-input"
                  className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none" />
              </div>
            )}
            <div>
              <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">{role === "customer" ? "Contact Name" : "Name"}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required
                data-testid="register-name-input"
                className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
                data-testid="register-email-input"
                className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Password</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6}
                data-testid="register-password-input"
                className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none" />
            </div>
            {err && <div className="text-sm text-red-400" data-testid="register-error">{err}</div>}
            <button type="submit" disabled={loading} data-testid="register-submit-btn"
              className="w-full mt-4 px-6 py-3 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-sm hover:shadow-[0_0_30px_rgba(242,201,76,0.6)] transition-shadow disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {loading ? "Activating..." : role === "customer" ? "Open Customer Portal" : "Create Account"} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
          <div className="mt-6 text-xs text-white/50">
            Already here? <Link to="/login" className="text-[#F2C94C] hover:underline" data-testid="register-login-link">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
