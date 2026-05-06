package io.thegrid.worker;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Persistent worker state. Survives process death and reboot.
 */
public class WorkerState {
    private static final String PREFS = "grid_worker_state";
    private static final String K_ACTIVE = "active";
    private static final String K_TOKEN = "auth_token";
    private static final String K_DEVICE_ID = "device_id";
    private static final String K_TASKS = "session_tasks";
    private static final String K_TGC = "session_tgc";
    private static final String K_LAST_HB = "last_heartbeat_ms";
    private static final String K_LAST_ERR = "last_error";

    private static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void setActive(Context c, boolean v) { sp(c).edit().putBoolean(K_ACTIVE, v).apply(); }
    public static boolean wasActive(Context c) { return sp(c).getBoolean(K_ACTIVE, false); }

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
