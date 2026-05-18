import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Upload, Plus, Briefcase, FileText, Cpu, X, CheckCircle2, Clock, XCircle, Download, Key, RefreshCw, Copy, Zap } from "lucide-react";

const WORKLOADS = [
  { id: "federated_learning", label: "Federated Learning" },
  { id: "matrix_compute", label: "Matrix Compute" },
  { id: "verified_compute", label: "Verified Compute Throughput" },
  { id: "mixed", label: "Mixed Workload" },
];

const PRIORITIES = [
  { id: "economy", label: "Economy", desc: "0.7× — Best value", mult: 0.7 },
  { id: "standard", label: "Standard", desc: "1.0× — Balanced", mult: 1.0 },
  { id: "instant", label: "Instant", desc: "2.5× — Top of the queue", mult: 2.5 },
];

function StatusPill({ status }) {
  const map = {
    pending: { color: "text-yellow-300 border-yellow-300/40 bg-yellow-300/5", icon: Clock, label: "PENDING REVIEW" },
    running: { color: "text-[#F2C94C] border-[#F2C94C]/40 bg-[#F2C94C]/10", icon: Cpu, label: "PROCESSING" },
    completed: { color: "text-green-400 border-green-400/40 bg-green-400/5", icon: CheckCircle2, label: "COMPLETED" },
    rejected: { color: "text-red-400 border-red-400/40 bg-red-400/5", icon: XCircle, label: "REJECTED" },
  };
  const m = map[status] || map.pending;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] tracking-[0.2em] uppercase ${m.color}`}>
      <Icon className="w-3 h-3" /> {m.label}
    </span>
  );
}

export default function CustomerPortal() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [desc, setDesc] = useState("");
  const [units, setUnits] = useState(50);
  const [budget, setBudget] = useState(25);
  const [maxNodes, setMaxNodes] = useState(20);
  const [workload, setWorkload] = useState("federated_learning");
  const [priority, setPriority] = useState("standard");
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyCopied, setKeyCopied] = useState(false);
  const nav = useNavigate();

  const load = async () => {
    try { const { data } = await api.get("/jobs"); setJobs(data); } catch {}
  };

  const loadKey = async () => {
    try { const { data } = await api.get("/customer/api-key"); setApiKey(data.api_key); } catch {}
  };

  const regenerateKey = async () => {
    if (!window.confirm("Regenerate API key? Existing automations using the old key will break.")) return;
    try { const { data } = await api.post("/customer/api-key/regenerate"); setApiKey(data.api_key); }
    catch (e) { setErr(formatApiError(e)); }
  };

  const copyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000);
  };

  useEffect(() => {
    if (user && user.role !== "customer" && user.role !== "admin") { nav("/dashboard"); return; }
    load();
    loadKey();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [user, nav]);

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) { setErr("Please select a workload file."); return; }
    setSubmitting(true); setErr("");
    try {
      await api.post("/jobs", {
        name,
        file_name: file.name,
        file_size: file.size,
        description: desc,
        total_units: Number(units),
        budget_usdt: Number(budget),
        max_nodes: Number(maxNodes),
        workload_type: workload,
      });
      setOpen(false);
      setName(""); setFile(null); setDesc(""); setUnits(50); setBudget(25); setMaxNodes(20);
      await load();
    } catch (er) { setErr(formatApiError(er)); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid-bg">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-10">
        <div className="flex flex-wrap justify-between items-end gap-4 mb-10">
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-[#F2C94C]">/ enterprise console</div>
            <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mt-2">
              Customer <span className="gold-text">Portal</span>
            </h1>
            <p className="text-white/60 mt-3 max-w-xl text-sm">
              Upload AI workloads. Allocate a Compute Credit Budget. Watch the
              distributed Edge Compute Node fleet resolve them in real time at 80% the cost of AWS.
            </p>
          </div>
          <button onClick={() => setOpen(true)} data-testid="customer-new-job-btn"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-sm hover:shadow-[0_0_30px_rgba(242,201,76,0.6)] transition-shadow">
            <Plus className="w-4 h-4" /> New Workload
          </button>
        </div>

        {/* API Key panel */}
        <div className="mb-8 p-6 rounded-3xl glass-strong">
          <div className="flex justify-between items-start gap-4 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#F2C94C] flex items-center gap-1.5">
                <Key className="w-3 h-3" /> Programmatic Access
              </div>
              <div className="font-display font-bold text-lg mt-1">API Key</div>
              <p className="text-xs text-white/50 mt-1">Use <code className="text-[#F2C94C]">X-API-Key</code> header to automate workload uploads from your CI/CD.</p>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <div className="px-3 py-2 rounded-xl bg-black/50 border border-white/10 font-mono text-xs text-white/80 max-w-[420px] truncate" data-testid="api-key-display">{apiKey || "Loading…"}</div>
              <button onClick={copyKey} data-testid="api-key-copy"
                className="px-3 py-2 rounded-full bg-[#F2C94C] text-black text-[10px] tracking-widest uppercase font-semibold inline-flex items-center gap-1.5">
                <Copy className="w-3 h-3" /> {keyCopied ? "Copied!" : "Copy"}
              </button>
              <button onClick={regenerateKey} data-testid="api-key-regen"
                className="px-3 py-2 rounded-full border border-red-400/30 text-red-400 text-[10px] tracking-widest uppercase inline-flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3" /> Rotate
              </button>
            </div>
          </div>
        </div>

        {/* Stats — v1.5.4 strict B2B SaaS vocabulary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Workload Queue", value: jobs.length },
            { label: "Active Workloads", value: jobs.filter(j => j.status === "running").length },
            { label: "Completed Dataset Batches", value: jobs.filter(j => j.status === "completed").length },
            {
              label: "Compute Credits Used",
              value: jobs.reduce((s, j) => s + (j.spent_usdt || 0), 0).toFixed(4),
            },
          ].map((s) => (
            <div key={s.label} className="p-6 rounded-2xl glass" data-testid={`customer-stat-${s.label.toLowerCase().replace(/\s/g,'-')}`}>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{s.label}</div>
              <div className="mt-3 text-3xl font-display font-black gold-text font-mono-num">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Jobs list */}
        <div className="rounded-3xl glass p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">/ your workloads</div>
              <h2 className="font-display text-2xl font-bold mt-1">Workloads</h2>
            </div>
          </div>
          <div className="space-y-4" data-testid="customer-jobs-list">
            {jobs.length === 0 && (
              <div className="text-center py-12 text-white/40 text-sm">No workloads yet — upload your first compute job.</div>
            )}
            {jobs.map((j) => {
              const pct = Math.min(100, Math.round((j.processed_units / Math.max(1, j.total_units)) * 100));
              return (
                <div key={j.id} className="p-6 rounded-2xl bg-black/40 border border-white/10 hover:border-[#D4AF37] transition-colors" data-testid={`customer-job-${j.id}`}>
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Briefcase className="w-4 h-4 text-[#F2C94C]" />
                        <h3 className="font-display text-lg font-bold">{j.name}</h3>
                        <StatusPill status={j.status} />
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-white/50">
                        <FileText className="w-3 h-3" /> {j.file_name} · {(j.file_size / 1024).toFixed(1)} KB
                        <span className="text-white/30">·</span>
                        <span className="uppercase tracking-widest text-[10px]">{(j.workload_type || "mixed").replace("_"," ")}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Compute Credit Budget</div>
                      <div className="font-mono-num text-[#F2C94C] text-xl">{j.budget_usdt.toFixed(2)} CC</div>
                      <div className="text-[10px] text-white/40 mt-0.5">used {j.spent_usdt?.toFixed(4) || "0.0000"} CC</div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="flex justify-between text-[10px] uppercase tracking-[0.25em] text-white/40 mb-2">
                      <span>Verified Output Progress</span>
                      <span className="text-[#F2C94C] font-mono-num">{j.processed_units}/{j.total_units} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                    <div className="text-white/50">Max Edge Nodes <span className="text-white">{j.max_nodes}</span></div>
                    <div className="text-white/50">Rate / Verified Unit <span className="text-white font-mono-num">{j.rate_per_unit?.toFixed(6)}</span></div>
                    <div className="text-white/50">Dispatched <span className="text-white">{new Date(j.created_at).toLocaleString()}</span></div>
                  </div>
                  {/* Priority + Export buttons */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border ${
                      j.priority === "instant" ? "border-[#F2C94C]/60 text-[#F2C94C] bg-[#F2C94C]/5" :
                      j.priority === "economy" ? "border-white/20 text-white/50" :
                      "border-white/30 text-white/70"
                    }`}><Zap className="w-3 h-3 inline mr-1" />{(j.priority || "standard").toUpperCase()} TIER</span>
                    {j.processed_units > 0 && (
                      <div className="flex gap-2">
                        <a href={`${process.env.REACT_APP_BACKEND_URL}/api/jobs/${j.id}/results.json`} target="_blank" rel="noreferrer" data-testid={`export-json-${j.id}`}
                          className="text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full border gold-border text-[#F2C94C] inline-flex items-center gap-1.5">
                          <Download className="w-3 h-3" /> JSON
                        </a>
                        <a href={`${process.env.REACT_APP_BACKEND_URL}/api/jobs/${j.id}/results.csv`} target="_blank" rel="noreferrer" data-testid={`export-csv-${j.id}`}
                          className="text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full border border-white/15 text-white/70 inline-flex items-center gap-1.5">
                          <Download className="w-3 h-3" /> CSV
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setOpen(false)} data-testid="new-job-modal">
          <div className="w-full max-w-2xl rounded-3xl glass-strong p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-[#F2C94C]">/ new workload</div>
                <h3 className="font-display text-2xl font-bold mt-1">Upload to the Grid</h3>
              </div>
              <button onClick={() => setOpen(false)} data-testid="new-job-close-btn" className="p-2 rounded-full hover:bg-white/5 text-white/60"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Workload Name</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} data-testid="new-job-name"
                  placeholder="e.g. ResNet50 Federated Round 27"
                  className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none" />
              </div>

              <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)} onDrop={onDrop} data-testid="new-job-dropzone"
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
                  drag ? "border-[#F2C94C] bg-[#F2C94C]/5" : "border-white/15 hover:border-[#D4AF37]"
                }`}>
                <Upload className="w-8 h-8 mx-auto text-[#F2C94C]" />
                {file ? (
                  <div className="mt-3">
                    <div className="text-sm text-white">{file.name}</div>
                    <div className="text-[10px] text-white/40">{(file.size / 1024).toFixed(1)} KB · {file.type || "binary"}</div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-white/60">Drop AI model script or dataset · or click to browse</div>
                )}
                <input type="file" onChange={(e) => setFile(e.target.files?.[0])} data-testid="new-job-file"
                  className="mt-3 block mx-auto text-xs text-white/60 file:bg-[#F2C94C] file:text-black file:border-0 file:px-3 file:py-1.5 file:rounded-full file:font-semibold file:cursor-pointer" />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Workload Type</label>
                  <select value={workload} onChange={(e) => setWorkload(e.target.value)} data-testid="new-job-type"
                    className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none">
                    {WORKLOADS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Max Edge Compute Nodes</label>
                  <input type="number" min={1} max={10000} required value={maxNodes} onChange={(e) => setMaxNodes(e.target.value)} data-testid="new-job-max-nodes"
                    className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Total Verified Compute Units</label>
                  <input type="number" min={1} max={10000} required value={units} onChange={(e) => setUnits(e.target.value)} data-testid="new-job-units"
                    className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Compute Credit Budget (1 CC = 1 USDT)</label>
                  <input type="number" step="0.01" min={1} required value={budget} onChange={(e) => setBudget(e.target.value)} data-testid="new-job-budget"
                    className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Priority Tier</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {PRIORITIES.map((p) => (
                    <button type="button" key={p.id} onClick={() => setPriority(p.id)} data-testid={`new-job-priority-${p.id}`}
                      className={`p-3 rounded-xl text-left transition-all ${
                        priority === p.id
                          ? p.id === "instant" ? "bg-gradient-to-br from-[#F2C94C] to-[#B8860B] text-black shadow-[0_0_30px_rgba(242,201,76,0.4)]" : "bg-[#F2C94C] text-black"
                          : "border border-white/10 text-white/70 hover:border-[#D4AF37]"
                      }`}>
                      <div className="font-display font-bold text-sm">{p.label}</div>
                      <div className={`text-[10px] mt-1 ${priority === p.id ? "opacity-80" : "text-white/40"}`}>{p.desc}</div>
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-white/40 mt-1.5">Higher tiers = priority routing on the Compute Routing Layer.</div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Description (optional)</label>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} data-testid="new-job-desc"
                  placeholder="Describe the dataset or compute objective for the edge node fleet…"
                  className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-[#D4AF37] focus:outline-none" />
              </div>

              {err && <div className="text-sm text-red-400" data-testid="new-job-error">{err}</div>}

              <button type="submit" disabled={submitting} data-testid="new-job-submit"
                className="w-full px-6 py-3 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#B8860B] text-black font-semibold text-sm hover:shadow-[0_0_30px_rgba(242,201,76,0.6)] transition-shadow disabled:opacity-50">
                {submitting ? "Dispatching…" : "Submit for Review"}
              </button>
              <div className="text-[10px] text-white/40 text-center">All workloads require operator approval before dispatch to the edge node fleet.</div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
