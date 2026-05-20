/*
 * THE GRID — RandomXBridge.java (v1.3.7)
 *
 * JNI bridge to librandomx.so packaged in jniLibs/arm64-v8a/. Every method
 * is fail-soft: if the .so is missing or System.loadLibrary throws,
 * `available()` returns false and the service falls back to "connected_only"
 * mode without crashing.
 *
 * IMPORTANT: This bridge talks to a thin C++ wrapper around RandomX (see
 * /app/android-client/jni/randomx_jni.cpp) which:
 *   1. allocates a RandomX cache (light mode, ~256MB) keyed on the current
 *      Monero "key" (epoch seed),
 *   2. spins one VM per requested thread,
 *   3. drives a hash loop and submits shares directly to a pool socket OR
 *      hands hashes back to the Java side via callbacks (current build:
 *      hash-loop only — share submission is staged in v1.3.8 over WS).
 *
 * For v1.3.7 we report local hashrate honestly. accepted_shares may stay 0
 * until the pool stratum integration ships in v1.3.8 — UI clearly labels
 * that delta.
 */
package io.thegrid.worker;

public final class RandomXBridge {

    private static volatile boolean LOADED = false;
    private static volatile String  LOAD_ERROR = null;
    private static volatile boolean RUNNING = false;

    static {
        // v1.7.5 — skip native lib load entirely in Light flavor.  Light APK
        // ships without librandomx.so and must never call System.loadLibrary,
        // because Play Console policy bars any device-side mining engine.
        if (!BuildConfig.NATIVE_MINING) {
            LOADED = false;
            LOAD_ERROR = "disabled_in_light_build";
        } else {
            try {
                System.loadLibrary("randomx");
                LOADED = true;
            } catch (Throwable t) {
                LOADED = false;
                LOAD_ERROR = t.getClass().getSimpleName() + ": " + t.getMessage();
            }
        }
    }

    /** True only when librandomx.so was loaded successfully and JNI is wired. */
    public static boolean available() { return LOADED; }
    public static String  loadError()  { return LOAD_ERROR; }
    public static boolean running()    { return LOADED && RUNNING; }

    // ---- native entry points (resolved via /system/lib64/libdl + librandomx.so) ----
    public static synchronized boolean startMining(String poolUrl, String user, String pass, int threads) {
        if (!LOADED) return false;
        try {
            boolean ok = nativeStartMining(poolUrl == null ? "" : poolUrl,
                                           user == null ? "" : user,
                                           pass == null ? "x" : pass,
                                           Math.max(1, threads));
            RUNNING = ok;
            return ok;
        } catch (Throwable t) {
            LOAD_ERROR = "startMining: " + t.getMessage();
            RUNNING = false;
            return false;
        }
    }

    public static synchronized boolean stopMining() {
        if (!LOADED) { RUNNING = false; return true; }
        try {
            nativeStopMining();
        } catch (Throwable ignored) {}
        RUNNING = false;
        return true;
    }

    /** Current mining hashrate in H/s. 0 if not mining or .so unavailable. */
    public static double getHashrate() {
        if (!LOADED || !RUNNING) return 0.0;
        try { return nativeGetHashrate(); } catch (Throwable ignored) { return 0.0; }
    }

    public static int getAcceptedShares() {
        if (!LOADED) return 0;
        try { return nativeGetAcceptedShares(); } catch (Throwable ignored) { return 0; }
    }

    public static int getRejectedShares() {
        if (!LOADED) return 0;
        try { return nativeGetRejectedShares(); } catch (Throwable ignored) { return 0; }
    }

    /** "running" | "stopped" | "unavailable". Strings, never null. */
    public static String getMiningStatus() {
        if (!LOADED) return "unavailable";
        if (!RUNNING) return "stopped";
        try { return nativeGetMiningStatus(); } catch (Throwable ignored) { return "running"; }
    }

    // v1.3.8 — backend-bridge job pipeline.
    /** Tell the JNI hash loop the current mining job (blob/seed/target). */
    public static synchronized boolean setMiningJob(String jobId, String blobHex,
                                                    String seedHex, long target) {
        if (!LOADED) return false;
        try {
            return nativeSetMiningJob(jobId == null ? "" : jobId,
                                      blobHex == null ? "" : blobHex,
                                      seedHex == null ? "" : seedHex,
                                      target);
        } catch (Throwable t) {
            LOAD_ERROR = "setMiningJob: " + t.getMessage();
            return false;
        }
    }

    /** Returns next candidate share found by the hash loop, or null if none yet.
     *  Called by GridWorkerService at heartbeat cadence; the share is then
     *  forwarded over the backend WebSocket (no pool credentials on device). */
    public static String pollShareCandidate() {
        if (!LOADED || !RUNNING) return null;
        try { return nativePollShareCandidate(); } catch (Throwable ignored) { return null; }
    }

    public static int getSubmittedShares() {
        if (!LOADED) return 0;
        try { return nativeGetSubmittedShares(); } catch (Throwable ignored) { return 0; }
    }

    /** Get the SHA-256 of the loaded librandomx.so (anti-spoof attestation). */
    public static String getNativeLibSha256(String apkPath) {
        if (!LOADED || apkPath == null) return null;
        try { return nativeGetNativeLibSha256(apkPath); } catch (Throwable ignored) { return null; }
    }

    // ---- native ----
    private static native boolean nativeStartMining(String pool, String user, String pass, int threads);
    private static native void    nativeStopMining();
    private static native double  nativeGetHashrate();
    private static native int     nativeGetAcceptedShares();
    private static native int     nativeGetRejectedShares();
    private static native String  nativeGetMiningStatus();
    private static native boolean nativeSetMiningJob(String jobId, String blob, String seed, long target);
    private static native String  nativePollShareCandidate();
    private static native int     nativeGetSubmittedShares();
    private static native String  nativeGetNativeLibSha256(String apkPath);
}
