package io.thegrid.worker;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

/**
 * Service watchdog — quietly bypasses Android 14/15 battery optimization
 * by scheduling an AlarmManager check-in every 5 minutes that re-launches
 * the foreground service if it has been killed by Doze / App-Standby /
 * memory pressure. NO scary "Disable battery optimization" dialog is shown
 * to the user; we lean on Android's own keep-alive primitives instead.
 *
 * Two layers of defence:
 *   1) START_STICKY + onTaskRemoved no-op + setOngoing notification
 *      keep the service alive across UI dismissal.
 *   2) THIS watchdog uses {@code setExactAndAllowWhileIdle} so the OS
 *      eventually fires our PendingIntent even in Doze, at which point we
 *      restart {@link GridWorkerService} if it is no longer running.
 */
public final class ServiceWatchdog extends BroadcastReceiver {

    private static final String TAG = "GridWatchdog";
    private static final String ACTION = "io.thegrid.worker.ACTION_WATCHDOG_TICK";
    // v1.5.3 — Android 12+ setExactAndAllowWhileIdle floors at 10 min in Doze
    // anyway; we keep the user-space wish at 3 min so on most OEMs we still
    // get 3-5 min cadence.  This significantly reduces visible drop-off
    // windows ("phone disconnected" toasts on the admin panel) while
    // remaining battery-friendly.
    private static final long INTERVAL_MS = 3 * 60 * 1000L;
    private static final int  REQ_CODE = 0x6717;

    /**
     * Schedule (or reschedule) the recurring watchdog alarm. Idempotent —
     * safe to call from MainActivity onCreate, BootReceiver, and the alarm
     * receiver itself (so the chain is self-perpetuating).
     */
    public static void schedule(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(ctx, ServiceWatchdog.class).setAction(ACTION);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ_CODE, i, flags);
            long fireAt = SystemClock.elapsedRealtime() + INTERVAL_MS;
            if (Build.VERSION.SDK_INT >= 23) {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, fireAt, pi);
            } else {
                am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, fireAt, pi);
            }
        } catch (SecurityException se) {
            try {
                AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
                Intent i = new Intent(ctx, ServiceWatchdog.class).setAction(ACTION);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
                PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ_CODE, i, flags);
                long fireAt = SystemClock.elapsedRealtime() + INTERVAL_MS;
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, fireAt, pi);
            } catch (Exception ignored) {}
        } catch (Exception e) {
            Log.w(TAG, "schedule failed: " + e);
        }
    }

    /** iter-15: cancel the alarm — called when user explicitly taps STOP. */
    public static void cancel(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(ctx, ServiceWatchdog.class).setAction(ACTION);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ_CODE, i, flags);
            am.cancel(pi);
        } catch (Exception ignored) {}
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent == null || !ACTION.equals(intent.getAction())) return;
        // Re-launch the service if the user has not opted out via STOP.
        // Service.start() is idempotent — already-running is a cheap no-op.
        if (WorkerState.shouldRun(ctx)) {
            try {
                WorkerState.setActive(ctx, true);
                GridWorkerService.start(ctx);
            } catch (Exception ignored) {}
            // Reschedule self so the cycle continues.
            schedule(ctx);
        }
    }
}
