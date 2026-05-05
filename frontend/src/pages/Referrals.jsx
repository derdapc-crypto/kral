import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api, formatApiError } from "../lib/api";
import { Share2, Copy, Users, Sparkles, ArrowRight } from "lucide-react";

export default function Referrals() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState("");
  const [err, setErr] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      try { const r = await api.get("/referrals"); setData(r.data); }
      catch (e) { setErr(formatApiError(e)); }
    })();
  }, []);

  const link = data ? `${origin}/register?ref=${data.referral_code || ""}` : "";
  const cardSrc = `${process.env.REACT_APP_BACKEND_URL}/api/referrals/share-card?u=${user?.id || ""}`;

  const copy = (val, label) => {
    navigator.clipboard.writeText(val);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid-bg">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-10">
        <div className="mb-10">
          <div className="text-[11px] tracking-[0.3em] uppercase text-[#F2C94C]">/ viral growth</div>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mt-2">
            Refer & <span className="gold-text">Earn 10%</span>
          </h1>
          <p className="text-white/60 mt-3 max-w-xl text-sm">
            Every node you invite pays you 10% lifetime commission on their earnings — without reducing what they make.
          </p>
        </div>

        {err && <div className="text-sm text-red-400 mb-4">{err}</div>}

        {data && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
              <div className="p-6 rounded-2xl glass-strong" data-testid="ref-stat-code">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Your Code</div>
                <div className="mt-3 text-3xl font-display font-black gold-text font-mono-num">{data.referral_code}</div>
              </div>
              <div className="p-6 rounded-2xl glass" data-testid="ref-stat-count">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Referred Nodes</div>
                <div className="mt-3 text-3xl font-display font-black text-white font-mono-num">{data.referrals.length}</div>
              </div>
              <div className="p-6 rounded-2xl glass" data-testid="ref-stat-earnings">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Commission Earned</div>
                <div className="mt-3 text-3xl font-display font-black gold-text font-mono-num">{(data.referral_earnings || 0).toFixed(4)}</div>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
              {/* Link block */}
              <div className="rounded-3xl glass-strong p-8">
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">/ your link</div>
                <h3 className="font-display text-2xl font-bold mt-1">Share & earn forever</h3>

                <div className="mt-6 flex gap-2 p-3 rounded-2xl bg-black/50 border border-white/10">
                  <div className="flex-1 truncate text-sm font-mono text-white/80" data-testid="ref-link-display">{link}</div>
                  <button onClick={() => copy(link, "link")} data-testid="ref-copy-link"
                    className="px-3 py-1.5 rounded-full bg-[#F2C94C] text-black text-[10px] tracking-widest uppercase font-semibold inline-flex items-center gap-1.5">
                    <Copy className="w-3 h-3" /> {copied === "link" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="mt-3 flex gap-2 p-3 rounded-2xl bg-black/50 border border-white/10">
                  <div className="flex-1 truncate text-sm font-mono text-white/80">{data.referral_code}</div>
                  <button onClick={() => copy(data.referral_code, "code")} data-testid="ref-copy-code"
                    className="px-3 py-1.5 rounded-full border gold-border text-[#F2C94C] text-[10px] tracking-widest uppercase inline-flex items-center gap-1.5">
                    <Copy className="w-3 h-3" /> {copied === "code" ? "Copied!" : "Code"}
                  </button>
                </div>

                <div className="mt-8 p-5 rounded-2xl bg-gradient-to-r from-[#F2C94C]/10 to-transparent border border-[#F2C94C]/20">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-[#F2C94C] flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-display font-bold">10% lifetime — forever.</div>
                      <p className="text-xs text-white/60 mt-1.5">When your invitees verify a task, you earn 10% on top. They keep 100% of their reward. Stack referrals to build passive USDT income.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Share Card */}
              <div className="rounded-3xl glass p-6 flex flex-col">
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-3">/ proof of earning</div>
                <div className="rounded-2xl overflow-hidden bg-[#0A0A0A] border border-white/10">
                  <img src={cardSrc} alt="Proof of Earning"
                    className="w-full h-auto" data-testid="ref-share-card" />
                </div>
                <div className="mt-4 flex gap-2">
                  <a href={cardSrc} download={`grid-card-${data.referral_code}.svg`} data-testid="ref-card-download"
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-xs tracking-wide">
                    <Share2 className="w-3.5 h-3.5" /> Download Card
                  </a>
                  <a href={`https://twitter.com/intent/tweet?text=I'm earning USDT on THE GRID. Use my code ${data.referral_code} to join.&url=${encodeURIComponent(link)}`}
                    target="_blank" rel="noreferrer" data-testid="ref-share-twitter"
                    className="px-4 py-2.5 rounded-full border gold-border text-[#F2C94C] text-xs tracking-wide">
                    Tweet
                  </a>
                </div>
              </div>
            </div>

            {/* Referred nodes table */}
            <div className="mt-10 rounded-3xl glass p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-[#F2C94C]" />
                <div className="font-display text-lg font-bold">Referred Operators</div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm" data-testid="ref-table">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[0.25em] text-white/40 border-b border-white/5">
                      <th className="py-3">Name</th><th>Email</th><th>Total Earned</th><th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.referrals.length === 0 && (
                      <tr><td colSpan={4} className="py-10 text-center text-white/40 text-sm">No referrals yet — share your code to start earning commissions.</td></tr>
                    )}
                    {data.referrals.map((r) => (
                      <tr key={r.id} className="border-b border-white/5">
                        <td className="py-2.5">{r.name}</td>
                        <td className="text-white/60 text-xs">{r.email}</td>
                        <td className="font-mono-num">{(r.total_earned || 0).toFixed(4)}</td>
                        <td className="text-xs text-white/50">{new Date(r.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
