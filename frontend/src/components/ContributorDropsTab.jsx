import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Sparkles, Play, Lock, CheckCircle2, Send, X, Plus, RefreshCw, Trophy } from "lucide-react";

/**
 * Admin Contributor Drops tab — v1.5.0.
 *
 * Create monthly Contributor Drops, freeze entries, run draws (cryptographic
 * random winner selection across prize tiers), approve winners, mark paid.
 * Strictly contribution-reward language — no mining/coin/gambling vocab.
 */
export default function ContributorDropsTab() {
  const [drops, setDrops] = useState([]);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [createForm, setCreateForm] = useState({ reward_pool_usdt: 500, title: "" });

  const loadDrops = async () => {
    try {
      const { data } = await api.get("/admin/drops");
      setDrops(data?.drops || []);
      if (selected && data?.drops) {
        const fresh = data.drops.find((d) => d.draw_id === selected);
        if (fresh) loadDetails(selected);
      }
    } catch (e) { setErr(e?.response?.data?.detail || "Failed to load drops"); }
  };
  const loadDetails = async (drawId) => {
    try {
      const { data } = await api.get(`/admin/drops/${drawId}`);
      setDetails(data);
    } catch {}
  };
  useEffect(() => { loadDrops(); const t = setInterval(loadDrops, 8000); return () => clearInterval(t); }, []);

  const createDrop = async () => {
    setBusy(true); setErr("");
    try {
      await api.post("/admin/drops/create", {
        reward_pool_usdt: Number(createForm.reward_pool_usdt),
        title: createForm.title || undefined,
      });
      await loadDrops();
    } catch (e) { setErr(e?.response?.data?.detail || "Create failed"); }
    finally { setBusy(false); }
  };
  const action = async (path) => {
    if (!selected) return;
    setBusy(true); setErr("");
    try {
      await api.post(`/admin/drops/${selected}/${path}`);
      await loadDetails(selected);
      await loadDrops();
    } catch (e) { setErr(e?.response?.data?.detail || `${path} failed`); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="contributor-drops-tab">
      {/* Create new drop */}
      <div className="rounded-3xl glass p-6" data-testid="create-drop-card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#F2C94C] font-mono-term">
              / contributor_drops · admin
            </div>
            <h2 className="font-mono-cyber text-2xl font-black mt-1 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#F2C94C]" />
              Monthly Contributor Drop
            </h2>
          </div>
          <button onClick={loadDrops} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs"
                  data-testid="refresh-drops-btn">
            <RefreshCw className="w-3 h-3 inline mr-1" />Refresh
          </button>
        </div>
        <div className="mt-4 grid sm:grid-cols-[1fr_2fr_auto] gap-3">
          <input type="number" min="50" max="100000" value={createForm.reward_pool_usdt}
                 onChange={(e) => setCreateForm({ ...createForm, reward_pool_usdt: e.target.value })}
                 data-testid="create-pool-input"
                 placeholder="Reward Pool USDT"
                 className="p-3 rounded-xl bg-black/40 border border-white/10 text-sm font-mono-cyber text-white" />
          <input type="text" value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                 data-testid="create-title-input"
                 placeholder="Title (optional)"
                 className="p-3 rounded-xl bg-black/40 border border-white/10 text-sm font-mono-cyber text-white" />
          <button onClick={createDrop} disabled={busy}
                  data-testid="create-drop-btn"
                  className="px-5 py-3 rounded-xl bg-[#F2C94C] text-black font-mono-cyber font-black text-sm tracking-widest uppercase disabled:opacity-50">
            <Plus className="w-3.5 h-3.5 inline mr-1" />Create
          </button>
        </div>
        {err && <div className="mt-3 text-xs text-red-400" data-testid="drops-err">{err}</div>}
      </div>

      {/* Drops list */}
      <div className="rounded-3xl glass p-6" data-testid="drops-list-card">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/45 mb-3 font-mono-term">
          drop_history ({drops.length})
        </div>
        {drops.length === 0 ? (
          <div className="text-sm text-white/40">No drops yet — create one above.</div>
        ) : (
          <div className="space-y-2">
            {drops.map((d) => (
              <button key={d.draw_id}
                onClick={() => { setSelected(d.draw_id); loadDetails(d.draw_id); }}
                data-testid={`drop-row-${d.draw_id}`}
                className={`w-full text-left p-3 rounded-2xl border transition flex items-center gap-3 ${
                  selected === d.draw_id ? "border-[#F2C94C]/50 bg-[#F2C94C]/8"
                                          : "border-white/10 bg-black/40 hover:border-white/25"
                }`}>
                <div className={`w-2 h-2 rounded-full ${
                  d.status === "active" ? "bg-[#00ff88]" :
                  d.status === "entries_closed" ? "bg-[#00ffe1]" :
                  d.status === "completed" || d.status === "paid" ? "bg-[#F2C94C]" :
                  "bg-white/30"
                }`}/>
                <div className="flex-1">
                  <div className="font-mono-cyber text-sm">{d.title}</div>
                  <div className="text-[10px] text-white/45 font-mono-term">
                    {d.month} · ${d.reward_pool_usdt} pool · {d.draw_id}
                  </div>
                </div>
                <span className="text-[9px] uppercase tracking-widest text-white/55 px-2 py-1 rounded-full border border-white/10">
                  {d.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Drop details + actions */}
      {details && (
        <div className="rounded-3xl glass p-6" data-testid="drop-details-card">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#F2C94C] font-mono-term">{details.draw_id}</div>
              <h3 className="font-mono-cyber text-xl font-black mt-0.5">{details.title}</h3>
              <div className="text-[10px] text-white/45 mt-1">
                Draw Date: {new Date(details.draw_date).toLocaleString("tr-TR")}
              </div>
            </div>
            <span className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full border border-[#F2C94C]/40 text-[#F2C94C]" data-testid="drop-details-status">
              {details.status}
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Stat label="Reward Pool" value={`$${details.reward_pool_usdt}`} testId="dd-pool" />
            <Stat label="Total Tickets" value={details.total_tickets} testId="dd-tickets" />
            <Stat label="Eligible Users" value={details.eligible_users} testId="dd-eligible" />
            <Stat label="Risk Flagged" value={details.risk_flagged_tickets} testId="dd-risk" warn />
          </div>

          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/45 mb-2 font-mono-term">prize_split</div>
            <div className="grid grid-cols-3 gap-2">
              {(details.prize_split || []).map((t) => (
                <div key={t.tier_name} className="p-3 rounded-2xl bg-black/40 border border-white/10" data-testid={`prize-tier-${t.tier_name.replace(/\s/g, "")}`}>
                  <div className="text-[10px] uppercase tracking-widest text-white/45">{t.tier_name}</div>
                  <div className="font-mono-cyber font-black text-lg mt-1 text-[#F2C94C]">
                    {t.winner_count} × ${t.amount_usdt}
                  </div>
                  <div className="text-[10px] text-white/55">= ${t.total_usdt}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            {details.status === "active" && (
              <ActionBtn onClick={() => action("freeze")} icon={Lock} label="Freeze Entries" testId="freeze-btn" disabled={busy} />
            )}
            {(details.status === "active" || details.status === "entries_closed") && (
              <ActionBtn onClick={() => action("run")} icon={Play} label="Run Draw" testId="run-btn" disabled={busy} primary />
            )}
            {details.status === "completed" && (
              <ActionBtn onClick={() => action("approve-winners")} icon={CheckCircle2} label="Approve Winners" testId="approve-btn" disabled={busy} primary />
            )}
            {details.status === "payout_review" && (
              <ActionBtn onClick={() => action("mark-paid")} icon={Send} label="Mark Paid" testId="paid-btn" disabled={busy} primary />
            )}
            {(details.status === "draft" || details.status === "active" || details.status === "entries_closed") && (
              <ActionBtn onClick={() => action("cancel")} icon={X} label="Cancel" testId="cancel-btn" disabled={busy} danger />
            )}
          </div>

          {/* Winners table */}
          {details.winners && details.winners.length > 0 && (
            <div className="rounded-2xl bg-black/40 border border-white/10 p-4 overflow-auto" data-testid="winners-table">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/45 mb-2 font-mono-term">
                winners ({details.winners.length})
              </div>
              <table className="w-full text-xs">
                <thead className="text-[9px] uppercase tracking-widest text-white/40 text-left">
                  <tr><th className="py-2">Username</th><th>Tier</th><th>Amount</th><th>Ticket</th><th>Payout Status</th><th>Wallet</th></tr>
                </thead>
                <tbody>
                  {details.winners.map((w, i) => (
                    <tr key={w.winner_id} className="border-t border-white/5" data-testid={`winner-row-${i}`}>
                      <td className="py-2 font-mono-cyber text-[#00ffe1]">{w.username_masked}</td>
                      <td>{w.prize_tier}</td>
                      <td className="font-mono-cyber font-black text-[#F2C94C]">${w.amount_usdt}</td>
                      <td className="text-white/55 font-mono-term">{w.ticket_id}</td>
                      <td className={`text-[10px] uppercase tracking-widest ${
                        w.payout_status === "sent" || w.payout_status === "paid" ? "text-[#00ff88]" :
                        w.payout_status === "approved" ? "text-[#00ffe1]" :
                        "text-white/55"}`}>{w.payout_status}</td>
                      <td className="text-white/55 font-mono-term">{w.wallet_address_masked || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn, testId }) {
  return (
    <div className="p-3 rounded-2xl bg-black/40 border border-white/10" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-widest text-white/45">{label}</div>
      <div className={`mt-1 font-mono-cyber font-black text-xl ${warn ? "text-amber-400" : "text-[#F2C94C]"}`}>{value}</div>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, disabled, primary, danger, testId }) {
  return (
    <button onClick={onClick} disabled={disabled} data-testid={testId}
      className={`px-4 py-2.5 rounded-xl text-[11px] font-mono-cyber tracking-widest uppercase border transition disabled:opacity-50 ${
        primary ? "bg-[#F2C94C] text-black border-[#F2C94C]" :
        danger ? "bg-red-500/10 text-red-300 border-red-500/30" :
        "bg-white/5 text-white/80 border-white/15"
      }`}>
      <Icon className="w-3.5 h-3.5 inline mr-1.5" />{label}
    </button>
  );
}
