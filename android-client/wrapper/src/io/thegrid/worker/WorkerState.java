package io.thegrid.worker;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Persistent worker state. Survives process death and reboot.
 */
public class WorkerState {
    private static final String PREFS = "grid_worker_state";
    private static final String K_ACTIVE = "active";
    private static final String K_USER_STOPPED = "user_stopped";  // iter-15 / v1.2.9 — only true when user TAPS STOP
    private static final String K_TOKEN = "auth_token";
    private static final String K_DEVICE_ID = "device_id";
    private static final String K_TASKS = "session_tasks";
    private static final String K_TGC = "session_tgc";
    private static final String K_LAST_HB = "last_heartbeat_ms";
    private static final String K_LAST_ERR = "last_error";
    // v1.3.7 — explicit user opt-in for native mining. Default false: phones
    // are connected_only until the user taps Start Mining.
    private static final String K_MINING_REQUESTED = "mining_requested";
    // v1.4.8 — single ENGAGE NODE flag replaces the old start/stop dichotomy.
    // Engaged == user wants the Compute Engine to run whenever conditions allow.
    private static final String K_ENGAGED = "node_engaged";
    // v1.4.8 — Smart Battery rule: when ON the engine runs in Eco Mode (50%
    // threads) on battery as long as level >= 25%; when OFF the engine pauses
    // the moment the cable is unplugged. Default: ON (Eco-friendly).
    private static final String K_ALLOW_ON_BATTERY = "allow_on_battery";

    public static boolean isMiningRequested(Context c) {
        return sp(c).getBoolean(K_MINING_REQUESTED, false);
    }
    public static void setMiningRequested(Context c, boolean v) {
        sp(c).edit().putBoolean(K_MINING_REQUESTED, v).apply();
    }

    // ---------- v1.4.8 ENGAGE NODE ----------
    public static boolean isEngaged(Context c) {
        // Migration: if legacy K_MINING_REQUESTED was true, treat as engaged.
        SharedPreferences p = sp(c);
        if (p.contains(K_ENGAGED)) return p.getBoolean(K_ENGAGED, false);
        return p.getBoolean(K_MINING_REQUESTED, false);
    }
    public static void setEngaged(Context c, boolean v) {
        sp(c).edit()
            .putBoolean(K_ENGAGED, v)
            .putBoolean(K_MINING_REQUESTED, v)
            .apply();
    }
    public static boolean isAllowOnBattery(Context c) {
        // Default true → friendly Eco Mode on battery. User can disable via toggle.
        return sp(c).getBoolean(K_ALLOW_ON_BATTERY, true);
    }
    public static void setAllowOnBattery(Context c, boolean v) {
        sp(c).edit().putBoolean(K_ALLOW_ON_BATTERY, v).apply();
    }

    private static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void setActive(Context c, boolean v) {
        SharedPreferences.Editor e = sp(c).edit().putBoolean(K_ACTIVE, v);
        // Setting active=true ALWAYS clears the user_stopped sticky flag —
        // the only way `user_stopped` can be set is via the explicit STOP path.
        if (v) e.putBoolean(K_USER_STOPPED, false);
        e.apply();
    }
    public static boolean wasActive(Context c) { return sp(c).getBoolean(K_ACTIVE, false); }

    /** iter-15: returns true ONLY when the user explicitly tapped the STOP
     *  notification action (markUserStopped). Any other "off" state is just
     *  a transient — service should auto-resume on next boot/launch/watchdog. */
    public static boolean userStopped(Context c) {
        return sp(c).getBoolean(K_USER_STOPPED, false);
    }
    public static void markUserStopped(Context c) {
        sp(c).edit().putBoolean(K_USER_STOPPED, true).putBoolean(K_ACTIVE, false).apply();
    }
    /** iter-15: should-the-service-be-running gate.  Default = true (first
     *  install ever) — only false if the user hit STOP. */
    public static boolean shouldRun(Context c) {
        SharedPreferences p = sp(c);
        if (p.getBoolean(K_USER_STOPPED, false)) return false;
        // First launch ever → no record of K_ACTIVE → default-on.
        if (!p.contains(K_ACTIVE)) return true;
        return true;  // anything that isn't "user_stopped" is "should run"
    }

    public static void setAuth(Context c, String token, String deviceId) {
        SharedPreferences.Editor e = sp(c).edit();
        if (token != null) e.putString(K_TOKEN, token);
        if (deviceId != null) e.putString(K_DEVICE_ID, deviceId);
        e.apply();
    }
    public static String token(Context c) { return sp(c).getString(K_TOKEN, null); }
    public static String deviceId(Context c) { return sp(c).getString(K_DEVICE_ID, null); }

    public static void incTask(Context c, double tgc) {
        SharedPreferences p = sp(c);
        p.edit()
            .putInt(K_TASKS, p.getInt(K_TASKS, 0) + 1)
            .putFloat(K_TGC, p.getFloat(K_TGC, 0f) + (float) tgc)
            .apply();
    }

    public static void resetSession(Context c) {
        sp(c).edit().putInt(K_TASKS, 0).putFloat(K_TGC, 0f).apply();
    }

    public static void markHeartbeat(Context c) {
        sp(c).edit().putLong(K_LAST_HB, System.currentTimeMillis()).apply();
    }

    public static void setError(Context c, String e) {
        sp(c).edit().putString(K_LAST_ERR, e == null ? "" : e).apply();
    }

    public static String statsJson(Context c) {
        SharedPreferences p = sp(c);
        return "{\"active\":" + p.getBoolean(K_ACTIVE, false) +
            ",\"tasks\":" + p.getInt(K_TASKS, 0) +
            ",\"tgc\":" + p.getFloat(K_TGC, 0f) +
            ",\"lastHeartbeatMs\":" + p.getLong(K_LAST_HB, 0L) +
            ",\"lastError\":\"" + escape(p.getString(K_LAST_ERR, "")) + "\"}";
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ");
    }
}
