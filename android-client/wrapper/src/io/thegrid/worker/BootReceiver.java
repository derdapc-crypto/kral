package io.thegrid.worker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Restores the foreground worker after a device reboot, IF the user had
 * START active prior to the reboot. The Golden Rule (charging / Wi-Fi /
 * permission / temperature) is re-checked inside {@link GridWorkerService}
 * before any task work begins, so a reboot under unsafe conditions just
 * lands the worker in the paused state — never running unsupervised.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (action == null) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {
            if (WorkerState.wasActive(context)) {
                GridWorkerService.start(context);
                NotificationScheduler.scheduleDaily(context);
            }
        }
    }
}
