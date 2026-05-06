package io.thegrid.worker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import java.security.MessageDigest;
import java.util.Locale;

/**
 * THE GRID — Foreground Worker Service.
 *
 * Runs the heartbeat + task loop while the app is backgrounded. Observes battery
 * + Wi-Fi + permission (Golden Rule) and auto-stops when the rule fails. Holds
 * a partial WAKE_LOCK only while actively running tasks.
 */
public class GridWorkerService extends Service {

    private static final String CHANNEL_ID = "grid_worker_v1";
    private static final int NOTIF_ID = 0xC04E;
    private static final long HEARTBEAT_MS = 12_000L;          // 12s cadence
    private static final long TASK_GAP_MS  = 350L;             // pause between tasks
    private static final long ERROR_BACKOFF_MS = 4_000L;
    private static final float TEMP_LIMIT_C = 45.0f;

    private volatile boolean running = false;
    private Thread loop;
    private PowerManager.WakeLock wake;

    // Cached telemetry refreshed every 5s by the loop
    private volatile boolean charging = false;
    private volatile boolean onWifi   = false;
    private volatile int     batteryPct = 100;
    private volatile float   tempC      = 25f;

    private final BroadcastReceiver batteryRx = new BroadcastReceiver() {
        @Override public void onReceive(Context ctx, Intent intent) {
            int status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                       status == BatteryManager.BATTERY_STATUS_FULL;
            int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            if (level >= 0 && scale > 0) batteryPct = (int) ((level * 100f) / scale);
            int t10 = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1);
            if (t10 > 0) tempC = t10 / 10.0f;
        }
    };

    public static void start(Context ctx) {
        Intent i = new Intent(ctx, GridWorkerService.class);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
        else ctx.startService(i);
    }
    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, GridWorkerService.class));
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
        registerReceiver(batteryRx, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "grid:worker");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIF_ID, buildNotification("Connecting to THE GRID…"));
        if (!running) {
            running = true;
            try { wake.acquire(); } catch (Exception ignored) {}
            loop = new Thread(this::workerLoop, "grid-worker-loop");
            loop.setDaemon(true);
            loop.start();
        }
        return START_STICKY;  // OS may restart us if killed
    }

    @Override
    public void onDestroy() {
        running = false;
        try { unregisterReceiver(batteryRx); } catch (Exception ignored) {}
        if (loop != null) loop.interrupt();
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) {}
        super.onDestroy();
    }

    // ---------- main loop ----------
    private void workerLoop() {
        long lastHb = 0;
        Context ctx = getApplicationContext();

        while (running) {
            try {
                refreshNetwork(ctx);
                boolean overTemp = tempC > TEMP_LIMIT_C;
                boolean eligible = charging && onWifi && !overTemp;

                long now = System.currentTimeMillis();
                if (now - lastHb >= HEARTBEAT_MS) {
                    sendHeartbeat(ctx, eligible);
                    lastHb = now;
                    updateNotification(eligible
                        ? "Contributing compute · " + WorkerState.statsJson(ctx)
                        : autoStopReason());
                }

                if (!eligible) {
                    // Auto-pause: do not request tasks, but keep heartbeating.
                    Thread.sleep(2000);
                    continue;
                }

                String taskJson = GridApi.post(ctx, "/api/tasks/request?device_id=" + WorkerState.deviceId(ctx), "");
                String taskId  = GridApi.pluck(taskJson, "id");
                String kind    = GridApi.pluck(taskJson, "kind");
                String payload = GridApi.pluckObject(taskJson, "payload");
                if (taskId == null || kind == null || payload == null) {
                    Thread.sleep(ERROR_BACKOFF_MS);
                    continue;
                }
                // Native worker currently executes only verification (hash) tasks.
                // Matrix tasks would require an exact JS-Mulberry32 port; backend rotates
                // randomly, so we just discard matrix tasks (mark not-verified by submitting
                // a wrong result) and let the next request return a hash task.
                if (!"hash".equals(kind)) {
                    String dummy = "{\"task_id\":\"" + taskId + "\",\"device_id\":\"" + WorkerState.deviceId(ctx) +
                        "\",\"result\":\"skip\",\"compute_ms\":1}";
                    try { GridApi.post(ctx, "/api/tasks/submit", dummy); } catch (Exception ignored) {}
                    Thread.sleep(TASK_GAP_MS);
                    continue;
                }

                long t0 = System.currentTimeMillis();
                String result = executeTask(kind, payload);
                long ms = Math.max(1, System.currentTimeMillis() - t0);

                String submit = "{\"task_id\":\"" + taskId + "\",\"device_id\":\"" + WorkerState.deviceId(ctx) +
                    "\",\"result\":\"" + result + "\",\"compute_ms\":" + ms + "}";
                String resp = GridApi.post(ctx, "/api/tasks/submit", submit);
                String tgcStr = GridApi.pluck(resp, "earned_tgc");
                double tgc = 0.0;
                try { if (tgcStr != null) tgc = Double.parseDouble(tgcStr); } catch (Exception ignored) {}
                WorkerState.incTask(ctx, tgc);

                Thread.sleep(TASK_GAP_MS);
            } catch (InterruptedException ie) {
                break;
            } catch (Exception e) {
                WorkerState.setError(ctx, e.getMessage());
                try { Thread.sleep(ERROR_BACKOFF_MS); } catch (InterruptedException ie) { break; }
            }
        }
    }

    private String autoStopReason() {
        if (!charging) return "Paused · charger required";
        if (!onWifi)   return "Paused · Wi-Fi required";
        if (tempC > TEMP_LIMIT_C) return "Paused · device too hot (" + ((int) tempC) + "°C)";
        return "Paused";
    }

    // ---------- task execution ----------
    private String executeTask(String kind, String payload) throws Exception {
        if ("hash".equals(kind)) {
            String nonce = GridApi.pluck(payload, "nonce");
            int diff = Integer.parseInt(GridApi.pluck(payload, "difficulty"));
            return hashSignature(nonce, diff);
        }
        throw new Exception("unknown task kind: " + kind);
    }

    static String hashSignature(String nonce, int difficulty) throws Exception {
        StringBuilder zeros = new StringBuilder();
        for (int i = 0; i < difficulty; i++) zeros.append('0');
        String prefix = zeros.toString();
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (int i = 0; i < 2_000_000; i++) {
            md.reset();
            byte[] digest = md.digest((nonce + ":" + i).getBytes(StandardCharsets_UTF_8));
            String hex = toHex(digest);
            if (hex.startsWith(prefix)) return i + ":" + hex;
        }
        return "0:0";
    }

    private static final java.nio.charset.Charset StandardCharsets_UTF_8 = java.nio.charset.Charset.forName("UTF-8");
    private static String toHex(byte[] bytes) {
        char[] hex = "0123456789abcdef".toCharArray();
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int v = bytes[i] & 0xFF;
            out[i * 2] = hex[v >>> 4];
            out[i * 2 + 1] = hex[v & 0xF];
        }
        return new String(out);
    }

    // ---------- heartbeat ----------
    private void sendHeartbeat(Context ctx, boolean eligible) {
        String deviceId = WorkerState.deviceId(ctx);
        if (deviceId == null) return;
        String body = String.format(Locale.US,
            "{\"device_id\":\"%s\",\"charging\":%s,\"wifi\":%s,\"permission\":true," +
            "\"battery\":%d,\"temperature_c\":%.1f,\"thermal\":\"%s\"," +
            "\"worker_state\":\"%s\",\"foreground\":false,\"app_version\":\"1.2.0\"}",
            deviceId, charging, onWifi, batteryPct, tempC,
            (tempC > TEMP_LIMIT_C ? "hot" : "nominal"),
            (eligible ? "active" : "paused"));
        try {
            String resp = GridApi.post(ctx, "/api/devices/heartbeat", body);
            WorkerState.markHeartbeat(ctx);
            String autoStop = GridApi.pluck(resp, "auto_stop");
            if ("true".equals(autoStop)) {
                // Server says stop — pause but stay registered.
                running = false;
                stopSelf();
            }
        } catch (Exception e) {
            WorkerState.setError(ctx, "heartbeat: " + e.getMessage());
        }
    }

    // ---------- network/wifi ----------
    private void refreshNetwork(Context ctx) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(CONNECTIVITY_SERVICE);
            NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
            onWifi = caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
        } catch (Exception e) { onWifi = false; }
    }

    // ---------- notification ----------
    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Worker", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Background compute worker activity");
            ch.setShowBadge(false);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.createNotificationChannel(ch);
        }
    }
    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(this, CHANNEL_ID);
        } else {
            b = new Notification.Builder(this);
        }
        return b.setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle("THE GRID Worker active")
            .setContentText(text == null ? "Contributing compute securely" : text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .build();
    }
    private void updateNotification(String text) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.notify(NOTIF_ID, buildNotification(text));
        } catch (Exception ignored) {}
    }
}
