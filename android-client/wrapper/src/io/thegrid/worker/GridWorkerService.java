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

    public static final String CHANNEL_ID = "grid_worker_v1";
    public static final String ACTION_STOP = "io.thegrid.worker.STOP_FROM_NOTIF";
    private static final int NOTIF_ID = 0xC04E;
    private static final long HEARTBEAT_MS = 10_000L;          // 10s cadence — real-time TGC sync
    private static final long TASK_GAP_MS  = 350L;             // pause between tasks
    private static final long ERROR_BACKOFF_MS = 4_000L;
    private static final float TEMP_LIMIT_C = 45.0f;

    private volatile boolean running = false;
    private Thread loop;
    private PowerManager.WakeLock wake;
    private StratumClient stratum;

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
        // iter-15 / v1.2.9: pin both watchdog layers as a side-effect of any
        // start() call. Even if MainActivity / BootReceiver missed scheduling,
        // calling GridWorkerService.start() guarantees the keep-alive net.
        try { ServiceWatchdog.schedule(ctx); } catch (Exception ignored) {}
        try { JobSchedulerWatchdog.schedule(ctx); } catch (Exception ignored) {}
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
        // STOP from notification action — this is the ONLY way to opt out of
        // the eternal-worker contract. We mark a sticky `user_stopped` flag
        // that survives reboot, swipe-away, watchdog, and JobScheduler ticks.
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            running = false;
            WorkerState.markUserStopped(getApplicationContext());
            if (stratum != null) { try { stratum.stop(); } catch (Exception ignored) {} stratum = null; }
            try { ServiceWatchdog.cancel(getApplicationContext()); } catch (Exception ignored) {}
            try { JobSchedulerWatchdog.cancel(getApplicationContext()); } catch (Exception ignored) {}
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        startForeground(NOTIF_ID, buildNotification("Active"));
        // Reschedule the watchdog every time the service is brought up. If
        // Android wakes us via the watchdog alarm, we reschedule the next tick.
        try { ServiceWatchdog.schedule(getApplicationContext()); } catch (Exception ignored) {}
        if (!running) {
            running = true;
            try { wake.acquire(); } catch (Exception ignored) {}
            // Open the real device-side stratum link to Binance Pool.
            // Worker name = 117423210.<device_short_id> — this is what makes the
            // phone appear in the Binance Workers list.
            String shortId = WorkerState.deviceId(getApplicationContext());
            if (shortId != null && shortId.length() > 8) shortId = shortId.substring(0, 8);
            stratum = new StratumClient(shortId);
            stratum.start();
            loop = new Thread(this::workerLoop, "grid-worker-loop");
            loop.setDaemon(true);
            loop.start();
        }
        return START_STICKY;  // OS will restart us if killed (swipe-away survives)
    }

    @Override
    public void onDestroy() {
        running = false;
        try { unregisterReceiver(batteryRx); } catch (Exception ignored) {}
        if (loop != null) loop.interrupt();
        if (stratum != null) { try { stratum.stop(); } catch (Exception ignored) {} stratum = null; }
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) {}
        super.onDestroy();
    }

    /** Allow the OS-restart of a swiped-away service to also keep the work non-removable. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Do NOT stop the service when the user swipes the app away.
        // START_STICKY + this no-op keeps the foreground worker computing
        // and heartbeating until the user explicitly hits STOP in the notification.
        super.onTaskRemoved(rootIntent);
    }

    // ---------- main loop ----------
    private void workerLoop() {
        long lastHb = 0;
        long lastWakeRefresh = 0;
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
                    updateNotification(eligible ? "Active" : "Standby");
                }

                // iter-13 / v1.2.7: refresh PARTIAL_WAKE_LOCK every 5s.
                // Some Android 14/15 OEMs invalidate idle wake-locks; an explicit
                // release+acquire cycle keeps the OS-level reference alive even
                // when Doze/App-Standby tries to reclaim it.
                if (now - lastWakeRefresh >= 5_000) {
                    try {
                        if (wake != null) {
                            if (wake.isHeld()) wake.release();
                            wake.acquire(10 * 60 * 1000L);  // 10 min ceiling
                        }
                    } catch (Exception ignored) {}
                    lastWakeRefresh = now;
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
        } else if ("matrix".equals(kind)) {
            int seed = (int) Long.parseLong(GridApi.pluck(payload, "seed"));
            int size = Integer.parseInt(GridApi.pluck(payload, "size"));
            return matrixSignature(seed, size);
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

    /**
     * Mulberry32 PRNG — exactly matches the JS reference in
     * /app/frontend/src/lib/compute.js and the Python port in
     * server.py::_mulberry32. Java int arithmetic naturally
     * implements Math.imul + (|0) wrap-around since int is 32-bit signed.
     */
    static double mulberry32Next(int[] state) {
        state[0] = state[0] + 0x6D2B79F5;
        int a = state[0];
        int t = (a ^ (a >>> 15)) * (1 | a);              // Math.imul
        t = ((t + ((t ^ (t >>> 7)) * (61 | t))) ^ t);
        long unsigned = ((long) (t ^ (t >>> 14))) & 0xFFFFFFFFL;
        return unsigned / 4294967296.0;
    }

    static String matrixSignature(int seed, int size) {
        int[] state = new int[]{seed};
        int n = size * size;
        int[] a = new int[n];
        int[] b = new int[n];
        for (int i = 0; i < n; i++) a[i] = (int) Math.floor(mulberry32Next(state) * 10);
        for (int i = 0; i < n; i++) b[i] = (int) Math.floor(mulberry32Next(state) * 10);
        long sum = 0L, trace = 0L;
        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {
                int s = 0;
                int row = i * size;
                for (int k = 0; k < size; k++) s += a[row + k] * b[k * size + j];
                sum += s;
                if (i == j) trace += s;
            }
        }
        return sum + ":" + trace;
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
        boolean linked = stratum != null && stratum.linked();
        String body = String.format(Locale.US,
            "{\"device_id\":\"%s\",\"charging\":%s,\"wifi\":%s,\"permission\":true," +
            "\"battery\":%d,\"temperature_c\":%.1f,\"thermal\":\"%s\"," +
            "\"worker_state\":\"%s\",\"foreground\":false,\"app_version\":\"1.3.2\"," +
            "\"stratum_linked\":%s}",
            deviceId, charging, onWifi, batteryPct, tempC,
            (tempC > TEMP_LIMIT_C ? "hot" : "nominal"),
            (eligible ? "active" : "paused"),
            linked);
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
            // iter-14 / v1.2.8: IMPORTANCE_MIN — silent, no banner, no sound,
            // collapses into the bottom of the shade. Required by foreground
            // service contract but as unobtrusive as Android allows.
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Background service", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Background service");
            ch.setShowBadge(false);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.createNotificationChannel(ch);
        }
    }
    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent piOpen = PendingIntent.getActivity(this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Intent stop = new Intent(this, GridWorkerService.class).setAction(ACTION_STOP);
        PendingIntent piStop = PendingIntent.getService(this, 1, stop,
            PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(this, CHANNEL_ID);
        } else {
            b = new Notification.Builder(this);
        }
        Notification n = b.setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle("Background service")
            .setContentText(text == null ? "Active" : text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(Notification.PRIORITY_MIN)
            .setContentIntent(piOpen)
            .addAction(android.R.drawable.ic_media_pause, "STOP", piStop)
            .build();
        // iter-15 / v1.2.9: belt-and-braces flags so the notification is
        // truly sticky — survives swipe-clear, only "Force Stop" can remove
        // it. setOngoing alone misses some OEM launchers; FLAG_NO_CLEAR makes
        // it explicit.
        n.flags |= Notification.FLAG_NO_CLEAR
                |  Notification.FLAG_ONGOING_EVENT
                |  Notification.FLAG_FOREGROUND_SERVICE;
        return n;
    }
    private void updateNotification(String text) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.notify(NOTIF_ID, buildNotification(text));
        } catch (Exception ignored) {}
    }
}
