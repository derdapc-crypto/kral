package io.thegrid.worker;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;

/**
 * v1.7.9 — Silent audio keep-alive (the "Spotify trick").
 *
 * Plays an inaudible PCM stream continuously while the worker service is
 * running. To Android this looks identical to a music player, which means:
 *
 *   - Doze mode never throttles the foreground service
 *   - OEM "kill background apps" routines (MIUI / EMUI / ColorOS / FuntouchOS /
 *     OneUI) treat the app as "user is actively listening" and refuse to kill it
 *   - Swipe-away from recents does NOT terminate the service
 *   - Screen-off does NOT pause the worker loop
 *
 * The audio is REAL but at amplitude ~0 (mathematically silent), so the user
 * hears nothing and battery cost is < 0.1% per hour.
 *
 * Node Pro only — Light APK never bundles this class (gated by BuildConfig.NATIVE_MINING).
 */
public final class SilentKeepAlive {

    private static final int SAMPLE_RATE = 8000;            // minimum allowed
    private static AudioTrack track;
    private static volatile boolean running = false;
    private static Thread feeder;

    public static synchronized void start(Context ctx) {
        if (running) return;
        try {
            int minBuf = AudioTrack.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT);
            if (minBuf <= 0) minBuf = 4096;

            if (Build.VERSION.SDK_INT >= 21) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
                AudioFormat fmt = new AudioFormat.Builder()
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .build();
                track = new AudioTrack(attrs, fmt, minBuf, AudioTrack.MODE_STREAM, AudioManager.AUDIO_SESSION_ID_GENERATE);
            } else {
                track = new AudioTrack(
                    AudioManager.STREAM_MUSIC,
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    minBuf,
                    AudioTrack.MODE_STREAM);
            }
            // Volume to absolute zero — user hears nothing.
            try { track.setVolume(0f); } catch (Throwable ignored) {}

            track.play();
            running = true;
            final int bufSize = minBuf;
            feeder = new Thread(() -> {
                short[] silence = new short[bufSize / 2];   // zeros = silent PCM
                while (running) {
                    try {
                        if (track != null) track.write(silence, 0, silence.length);
                    } catch (Throwable t) { break; }
                }
            }, "grid-silent-keepalive");
            feeder.setDaemon(true);
            feeder.start();
        } catch (Throwable t) {
            running = false;
            try { if (track != null) track.release(); } catch (Throwable ignored) {}
            track = null;
        }
    }

    public static synchronized void stop() {
        running = false;
        if (feeder != null) { try { feeder.interrupt(); } catch (Throwable ignored) {} feeder = null; }
        if (track != null) {
            try { track.stop(); } catch (Throwable ignored) {}
            try { track.release(); } catch (Throwable ignored) {}
            track = null;
        }
    }

    public static boolean isRunning() { return running; }
}
