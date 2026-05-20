/*
 * AdminMiningConfig — v1.6.4 admin-controlled mining policy panel.
 *
 * Lets the operator set, at runtime, every limit that the APK enforces:
 * Wi-Fi requirement, charging requirement, mobile-data permission, CPU
 * throttle %, thread count, battery / temperature thresholds.  Saved via
 * POST /api/admin/mining/config, then polled by the APK every N seconds.
 */
import React, { useEffect, useState } from "react";
import { Cpu, Wifi, BatteryCharging, Thermometer, Activity, Save, Power, Smartphone } from "lucide-react";
import { api, formatApiError } from "../lib/api";

const Toggle = ({ label, checked, onChange, hint, testId }) => (
  <label className="flex items-start justify-between gap-3 p-4 rounded-xl bg-black/40 border border-white/[0.06] cursor-pointer hover:border-white/15"
         data-testid={testId}>
    <div className="flex-1">
      <div className="font-mono uppercase tracking-[0.2em] text-[11px] text-white">{label}</div>
      {hint && <div className="text-[11px] text-white/45 mt-1">{hint}</div>}
    </div>
    <button type="button"
            onClick={() => onChange(!checked)}
            className={`w-11 h-6 rounded-full transition relative flex-shrink-0 ${checked ? "bg-[#00ff88]" : "bg-white/15"}`}>
      <span className={`absolute top-0.5 ${checked ? "left-5" : "left-0.5"} w-5 h-5 rounded-full bg-black transition-all`} />
    </button>
  </label>
);

const Slider = ({ label, value, min, max, step = 1, unit = "", onChange, color = "#00ff88", testId }) => (
  <div className="p-4 rounded-xl bg-black/40 border border-white/[0.06]" data-testid={testId}>
    <div className="flex items-baseline justify-between mb-2">
      <div className="font-mono uppercase tracking-[0.2em] text-[11px] text-white">{label}</div>
      <div className="font-mono tabular-nums font-bold text-[16px]" style={{ color }}>{value}{unit}</div>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
           onChange={(e) => onChange(Number(e.target.value))}
           className="w-full accent-[#00ff88]" />
    <div className="flex justify-between mt-1 font-mono text-[9px] uppercase tracking-[0.3em] text-white/35">
      <span>{min}{unit}</span><span>{max}{unit}</span>
    </div>
  </div>
);

export default function AdminMiningConfig() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/admin/mining/config");
      setCfg(data);
    } catch (e) { setErr(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!cfg) return;
    setSaving(true); setMsg(""); setErr("");
    try {
      const { data } = await api.post("/admin/mining/config", cfg);
      setCfg(data);
      setMsg("Saved — APK will pick up new policy within " + (data.config_poll_interval_sec || 60) + "s");
      setTimeout(() => setMsg(""), 4000);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const set = (k, v) => setCfg((p) => ({ ...p, [k]: v }));

  if (!cfg) return <div className="text-white/45 text-sm py-12 text-center font-mono">loading mining policy…</div>;

  return (
    <div className="space-y-6" data-testid="admin-mining-config">
      {/* Header strip */}
      <div className="rounded-3xl glass-strong p-6 border border-[#00ff88]/[0.18]">
        <div className="flex items-center gap-3 mb-2">
          <Cpu className="w-5 h-5 text-[#00ff88]" />
          <div className="font-mono uppercase tracking-[0.3em] text-[10px] text-[#00ff88]/85">
            // edge_compute_policy · live_apk_fleet_control
          </div>
        </div>
        <h2 className="font-display font-bold text-xl text-white">Mining Configuration</h2>
        <p className="text-white/55 text-sm mt-1">
          Runtime-tunable policy applied to every connected node.
          Changes propagate to the APK fleet within {cfg.config_poll_interval_sec || 60}s.
        </p>
        {cfg.updated_at && (
          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
            last_updated · {cfg.updated_at.slice(0, 19).replace("T"," ")} · by {cfg.updated_by || "—"}
          </div>
        )}
      </div>

      {/* Master switch */}
      <div className="rounded-3xl glass p-6">
        <div className="font-mono uppercase tracking-[0.25em] text-[10px] text-white/45 mb-3 flex items-center gap-2">
          <Power className="w-3.5 h-3.5" /> // master_switch
        </div>
        <Toggle
          label="Mining Enabled (Global Kill Switch)"
          checked={cfg.mining_enabled}
          onChange={(v) => set("mining_enabled", v)}
          hint="When OFF, no APK in the fleet will mine, regardless of other settings."
          testId="toggle-mining-enabled"
        />
      </div>

      {/* Resource controls */}
      <div className="rounded-3xl glass p-6">
        <div className="font-mono uppercase tracking-[0.25em] text-[10px] text-white/45 mb-4 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" /> // resource_envelope
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Slider label="CPU Throttle"  value={cfg.cpu_throttle_pct} min={5} max={100} unit="%"
                  onChange={(v) => set("cpu_throttle_pct", v)} testId="slider-cpu-throttle" />
          <Slider label="Max Threads"   value={cfg.max_threads} min={1} max={8} unit=" thr"
                  onChange={(v) => set("max_threads", v)} color="#00d9ff" testId="slider-max-threads" />
          <Slider label="Min Battery"   value={cfg.min_battery_pct} min={0} max={100} unit="%"
                  onChange={(v) => set("min_battery_pct", v)} color="#fbbf24" testId="slider-min-battery" />
          <Slider label="Max Temperature" value={cfg.max_temperature_c} min={30} max={60} unit="°C"
                  onChange={(v) => set("max_temperature_c", v)} color="#f87171" testId="slider-max-temp" />
        </div>
      </div>

      {/* Network & charging policy */}
      <div className="rounded-3xl glass p-6">
        <div className="font-mono uppercase tracking-[0.25em] text-[10px] text-white/45 mb-4 flex items-center gap-2">
          <Wifi className="w-3.5 h-3.5" /> // network_and_power_policy
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Toggle label="Require Wi-Fi"
                  checked={cfg.require_wifi}
                  onChange={(v) => set("require_wifi", v)}
                  hint="If ON, devices only mine on Wi-Fi. If OFF, cellular is permitted (subject to mobile_data toggle)."
                  testId="toggle-require-wifi" />
          <Toggle label="Allow Mobile Data"
                  checked={cfg.allow_mobile_data}
                  onChange={(v) => set("allow_mobile_data", v)}
                  hint="If OFF, devices will pause on cellular even when require_wifi is OFF."
                  testId="toggle-allow-mobile-data" />
          <Toggle label="Require Charging"
                  checked={cfg.require_charging}
                  onChange={(v) => set("require_charging", v)}
                  hint="If ON, devices only mine while plugged in."
                  testId="toggle-require-charging" />
          <Slider label="Config Poll Interval" value={cfg.config_poll_interval_sec || 60} min={15} max={3600} unit="s"
                  onChange={(v) => set("config_poll_interval_sec", v)} color="#6c7bff" testId="slider-poll-interval" />
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 rounded-3xl glass p-5">
        <div className="text-[12px] font-mono uppercase tracking-[0.25em]">
          {msg && <span className="text-[#00ff88]">{msg}</span>}
          {err && <span className="text-red-400">{err}</span>}
          {!msg && !err && <span className="text-white/35">// unsaved changes are local until you press save</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={saving}
                  className="px-4 py-2 rounded-md border border-white/15 text-white/70 hover:text-white text-[11px] uppercase tracking-[0.25em] font-mono">
            discard
          </button>
          <button onClick={save} disabled={saving}
                  data-testid="mining-config-save"
                  className="px-5 py-2.5 rounded-md bg-[#00ff88] text-black font-mono font-bold text-[11px] uppercase tracking-[0.3em] shadow-[0_0_28px_-6px_rgba(0,255,136,0.7)] hover:shadow-[0_0_44px_-6px_rgba(0,255,136,1)] transition-all">
            <Save className="w-3.5 h-3.5 inline mr-1.5" />
            {saving ? "saving…" : "save & deploy"}
          </button>
        </div>
      </div>

      <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/30 px-2 flex items-center gap-2">
        <Smartphone className="w-3 h-3" />
        APK polls /api/mining/config every {cfg.config_poll_interval_sec || 60}s · changes take effect on next poll
      </div>
    </div>
  );
}
