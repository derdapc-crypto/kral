import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Hexagon, LogOut, Shield, Download, Briefcase } from "lucide-react";
import ApkSetupModal from "./ApkSetupModal";

export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [apkOpen, setApkOpen] = useState(false);

  const linkCls = (path) =>
    `text-sm tracking-widest uppercase transition-colors ${
      loc.pathname === path ? "text-[#F2C94C]" : "text-white/60 hover:text-white"
    }`;

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/70 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group" data-testid="nav-logo">
          <div className="relative">
            <Hexagon className="w-7 h-7 text-[#D4AF37]" strokeWidth={1.6} />
            <div className="absolute inset-0 blur-lg bg-[#D4AF37]/40 rounded-full" />
          </div>
          <span className="font-display font-black text-lg tracking-tight">
            THE <span className="gold-text">GRID</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link to="/" className={linkCls("/")} data-testid="nav-home">Mission</Link>
          {!user && (
            <Link to="/register?role=customer" className="text-sm tracking-widest uppercase text-white/60 hover:text-white transition-colors inline-flex items-center gap-1.5" data-testid="nav-customer-portal">
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
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border gold-border text-[#F2C94C] text-[11px] tracking-widest uppercase hover:bg-[#F2C94C]/10 transition-colors">
              <Download className="w-3.5 h-3.5" /> APK
            </button>
          )}
          {user ? (
            <>
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">{user.role}</span>
                <span className="text-sm text-white">{user.name}</span>
              </div>
              <button
                onClick={async () => { await logout(); nav("/"); }}
                data-testid="nav-logout-btn"
                className="p-2 rounded-full border border-white/10 hover:border-[#D4AF37] hover:text-[#F2C94C] text-white/70 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" data-testid="nav-login" className="text-sm text-white/70 hover:text-white tracking-wider">Sign in</Link>
              <Link to="/register" data-testid="nav-register"
                className="px-4 py-2 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-sm hover:shadow-[0_0_30px_rgba(242,201,76,0.6)] transition-shadow">
                Join the Grid
              </Link>
            </>
          )}
        </div>
      </div>
      <ApkSetupModal open={apkOpen} onClose={() => setApkOpen(false)} />
    </header>
  );
}
