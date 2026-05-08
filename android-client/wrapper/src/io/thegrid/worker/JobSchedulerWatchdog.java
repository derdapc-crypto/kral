package io.thegrid.worker;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.util.Log;

/**
 * WorkManager-equivalent — uses Android's built-in JobScheduler so the OS
 * itself reliably ticks every ~15 minutes (the system minimum interval) and
 * revives {@link GridWorkerService} if it has been killed. This is the
 * second layer of defence on top of {@link ServiceWatchdog} (AlarmManager,
 * 5 min) — JobScheduler is more resilient to Doze + App-Standby + restart
 * because the OS itself owns the schedule.
 *
 * Why JobScheduler instead of AndroidX WorkManager: our build pipeline is
 * pure CLI (aapt + javac + d8 + apksigner) without Gradle, so we cannot pull
 * in androidx.work transitively. JobScheduler is API 21+ built-in, identical
 * semantics for our use case (periodic restart of a foreground service).
 */
public class JobSchedulerWatchdog extends JobService {

    private static final String TAG = "GridJobWatchdog";
    private static final int JOB_ID = 0x6717;          // same family as ServiceWatchdog REQ_CODE
    private static final long INTERVAL_MS = 15 * 60 * 1000L;  // 15 min — Android system minimum

    /** Schedule (or update) the recurring job. Idempotent. */
    public static void schedule(Context ctx) {
        if (Build.VERSION.SDK_INT < 21) return;
        try {
            JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            ComponentName comp = new ComponentName(ctx, JobSchedulerWatchdog.class);
            JobInfo.Builder b = new JobInfo.Builder(JOB_ID, comp)
                .setPeriodic(INTERVAL_MS)
                .setPersisted(true)                   // survives reboot
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY);
            // Android 7+ supports .setRequiredNetworkType(); older API ignores it.
            int result = js.schedule(b.build());
            if (result != JobScheduler.RESULT_SUCCESS) {
                Log.w(TAG, "schedule returned " + result);
            }
        } catch (Exception e) {
            Log.w(TAG, "schedule failed: " + e);
        }
    }

    /** Cancel the periodic job (called when user taps STOP). */
    public static void cancel(Context ctx) {
        if (Build.VERSION.SDK_INT < 21) return;
        try {
            JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js != null) js.cancel(JOB_ID);
        } catch (Exception ignored) {}
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        // The OS just woke us up. If the user wants the worker active and the
        // service is not running, start it. start() is idempotent.
        try {
            if (WorkerState.shouldRun(this)) {
                WorkerState.setActive(this, true);
                GridWorkerService.start(this);
            }
        } catch (Exception e) {
            Log.w(TAG, "onStartJob: " + e);
        }
        // Return false → no async work, finish immediately.
        return false;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        // Reschedule when killed. Returning true asks the OS to retry later.
        return true;
    }
}
