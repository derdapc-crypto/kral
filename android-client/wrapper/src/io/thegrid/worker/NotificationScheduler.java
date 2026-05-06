package io.thegrid.worker;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Schedules daily retention notifications via AlarmManager + a tiny
 * BroadcastReceiver. The receiver pulls /api/notifications/digest and
 * posts the user-facing message: today's task count, TGC earned, and
 * the Power-Up expiry countdown. Also fires a separate warning when
 * Power-Up is about to expire.
 */
public class NotificationScheduler extends BroadcastReceiver {

    public static final String CHANNEL_ID = "grid_digest_v1";
    private static final int NOTIF_DIGEST = 0xC0DE;
    private static final int NOTIF_POWERUP = 0xC0DF;
    private static final int REQ_DAILY = 7301;
    private static final long DAILY_INTERVAL_MS = AlarmManager.INTERVAL_DAY;
    public static final String ACTION_FIRE = "io.thegrid.worker.NOTIFY_DIGEST";

    public static void scheduleDaily(Context ctx) {
        ensureChannel(ctx);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(ctx, NotificationScheduler.class).setAction(ACTION_FIRE);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ_DAILY, i,
            PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        long firstFire = System.currentTimeMillis() + 6 * 60 * 60 * 1000L; // first digest in 6h
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, firstFire, DAILY_INTERVAL_MS, pi);
    }

    public static void cancel(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(ctx, NotificationScheduler.class).setAction(ACTION_FIRE);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ_DAILY, i,
            PendingIntent.FLAG_NO_CREATE |
            (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        if (pi != null) am.cancel(pi);
    }

    @Override
    public void onReceive(final Context ctx, Intent intent) {
        if (intent == null || !ACTION_FIRE.equals(intent.getAction())) return;
        // Run the network call off the main thread; alarm receivers have ~10s wall budget.
        new Thread(() -> {
            try {
                String json = GridApi.get(ctx, "/api/notifications/digest");
                String digest = GridApi.pluckObject(json, "digest");
                String warn = GridApi.pluckObject(json, "power_up_warning");
                if (digest != null) {
                    String title = GridApi.pluck(digest, "title");
                    String body = GridApi.pluck(digest, "body");
                    if (title != null && body != null) postNotification(ctx, NOTIF_DIGEST, title, body);
                }
                if (warn != null && !"null".equals(warn)) {
                    String title = GridApi.pluck(warn, "title");
                    String body = GridApi.pluck(warn, "body");
                    if (title != null && body != null) postNotification(ctx, NOTIF_POWERUP, title, body);
                }
            } catch (Exception ignored) { /* offline / not logged-in — silent */ }
        }, "grid-digest-fetch").start();
    }

    private static void postNotification(Context ctx, int id, String title, String body) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannel(ctx);
        Intent open = new Intent(ctx, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(ctx, CHANNEL_ID);
        } else {
            b = new Notification.Builder(ctx);
        }
        Notification n = b.setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build();
        nm.notify(id, n);
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Daily digest", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Daily compute summary + Power-Up reminders");
            nm.createNotificationChannel(ch);
        }
    }
}
