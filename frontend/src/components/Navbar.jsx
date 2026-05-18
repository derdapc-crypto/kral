import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { LogOut, Shield, Download, Briefcase, Cpu } from "lucide-react";
import ApkSetupModal from "./ApkSetupModal";

/**
 * Premium SaaS navbar (v1.4.0) — investor-facing surface. Restrained neon,
 * monospace tags only where they read as technical labels, white CTA pill.
 */
export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [apkOpen, setApkOpen] = useState(false);

  // vNext — public marketing surfaces (Landing, Token) ship their own
  // bespoke navbar baked into the page. Hide the legacy global navbar there.
  if (loc.pathname === "/" || loc.pathname === "/token" || loc.pathname === "/launch") {
    return null;
  }

  const linkCls = (path) =>
    `text-[13px] font-medium font-sans-saas transition-colors ${
      loc.pathname === path ? "text-white" : "text-white/55 hover:text-white"
    }`;

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#02040a]/80 border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group" data-testid="nav-logo">
          <div className="relative w-7 h-7 rounded-lg grid place-items-center"
               style={{ background: "linear-gradient(135deg, #00ffe1, #00d4ff)" }}>
            <Cpu className="w-4 h-4 text-black" strokeWidth={2.4} />
          </div>
          <span className="font-grotesk font-bold text-[17px] tracking-tight text-white">
            THE GRID
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          <Link to="/" className={linkCls("/")} data-testid="nav-home">Platform</Link>
          <Link to="/token" className={linkCls("/token")} data-testid="nav-token">$TGC Token</Link>
          <a href="/#how" className="text-[13px] font-medium font-sans-saas text-white/55 hover:text-white transition-colors" data-testid="nav-how">How it works</a>
          <a href="/#pillars" className="text-[13px] font-medium font-sans-saas text-white/55 hover:text-white transition-colors" data-testid="nav-pillars">Product</a>
          <a href="/#safety" className="text-[13px] font-medium font-sans-saas text-white/55 hover:text-white transition-colors" data-testid="nav-safety">Safety</a>
          {!user && (
            <Link to="/register?role=customer" className="text-[13px] font-medium font-sans-saas text-white/55 hover:text-white transition-colors inline-flex items-center gap-1.5" data-testid="nav-customer-portal">
              <Briefcase className="w-3.5 h-3.5" /> Customer Portal
            </Link>
          )}
          {user && user.role === "customer" && (
            <Link to="/customer" className={linkCls("/customer")} data-testid="nav-customer">
              <span className="inline-flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Workloads</span>
            </Link>
          )}
          {user && user.role === "user" && (
            <>
              <Link to="/dashboard" className={linkCls("/dashboard")} data-testid="nav-dashboard">Dashboard</Link>
              <Link to="/device" className={linkCls("/device")} data-testid="nav-device">Node</Link>
              <Link to="/referrals" className={linkCls("/referrals")} data-testid="nav-referrals">Referrals</Link>
            </>
          )}
          {user && user.role === "admin" && (
            <>
              <Link to="/dashboard" className={linkCls("/dashboard")} data-testid="nav-dashboard">Dashboard</Link>
              <Link to="/admin" className={linkCls("/admin")} data-testid="nav-admin">
                <span className="inline-flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Command</span>
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {!user && (
            <button onClick={() => setApkOpen(true)} data-testid="nav-apk-btn"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/12 text-white/75 text-[12px] font-medium hover:border-[#00ffe1]/40 hover:text-[#00ffe1] transition-colors">
              <Download className="w-3.5 h-3.5" /> Download Node
            </button>
          )}
          {user ? (
            <>
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-mono-tech">{user.role}</span>
                <span className="text-[13px] text-white font-medium">{user.name}</span>
              </div>
              <button
                onClick={async () => { await logout(); nav("/"); }}
                data-testid="nav-logout-btn"
                className="p-2 rounded-full border border-white/10 hover:border-white/30 text-white/70 hover:text-white transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" data-testid="nav-login" className="text-[13px] text-white/70 hover:text-white font-medium font-sans-saas">Sign in</Link>
              <Link to="/register" data-testid="nav-register" className="landing-cta-primary text-[13px]">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
      <ApkSetupModal open={apkOpen} onClose={() => setApkOpen(false)} />
    </header>
  );
}
