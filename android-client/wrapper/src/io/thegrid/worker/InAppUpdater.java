package io.thegrid.worker;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * v1.7.12 — In-app update checker (no Play Store dependency).
 *
 * Fires once on app launch (delayed 3s so the WebView gets to render first).
 * Hits /api/apk/dual-version on the configured backend, compares against
 * BuildConfig.VERSION_NAME, and if a newer build is available shows a
 * non-blocking dialog with a [GÜNCELLE] button that opens the APK URL in
 * the system browser → user gets the standard Android "Update?" prompt
 * with a single tap.
 *
 * Failure modes: any network/parse error is swallowed — we NEVER block
 * launch and NEVER show an error to the user.  Worst case: silently skip
 * this launch and try again next time.
 */
public final class InAppUpdater {

    private static final String TAG = "InAppUpdater";
    private static volatile boolean checking = false;

    /** Public entry-point. Call from MainActivity.onCreate. */
    public static void checkAsync(final Activity activity) {
        if (checking) return;
        checking = true;
        new Thread(() -> {
            try {
                runCheck(activity);
            } catch (Throwable t) {
                Log.w(TAG, "update check failed: " + t.getMessage());
            } finally {
                checking = false;
            }
        }, "in-app-update-check").start();
    }

    private static void runCheck(final Activity activity) throws Exception {
        String base = GridApi.base(activity);
        // strip "api." subdomain to get bare host... no wait, we WANT api here
        URL url = new URL(base + "/api/apk/dual-version");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(6000);
        conn.setReadTimeout(6000);
        conn.setRequestProperty("User-Agent", "SanctaraNodePro/" + BuildConfig.VERSION_NAME);
        if (conn.getResponseCode() != 200) return;
        BufferedReader r = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        StringBuilder sb = new StringBuilder();
        String line; while ((line = r.readLine()) != null) sb.append(line);
        r.close();

        JSONObject root = new JSONObject(sb.toString());
        String serverVersion = root.optString("version", "0.0.0");
        String currentVersion = BuildConfig.VERSION_NAME;

        // Flavor-specific download URL
        String flavorKey = BuildConfig.NATIVE_MINING ? "node_pro" : "light";
        JSONObject flavor = root.optJSONObject(flavorKey);
        String filename = flavor != null ? flavor.optString("filename", "sanctara-node-pro.apk")
                                         : "sanctara-node-pro.apk";

        // Web host = backend host with "api." stripped
        String webHost = base.replace("://api.", "://");
        final String downloadUrl = webHost + "/" + filename;

        if (compareVersions(serverVersion, currentVersion) > 0) {
            new Handler(Looper.getMainLooper()).post(() ->
                showUpdateDialog(activity, currentVersion, serverVersion, downloadUrl));
        }
    }

    /** Returns 1 if a > b, -1 if a < b, 0 if equal.  Handles N-part semver. */
    private static int compareVersions(String a, String b) {
        try {
            String[] pa = a.split("\\."); String[] pb = b.split("\\.");
            int n = Math.max(pa.length, pb.length);
            for (int i = 0; i < n; i++) {
                int va = i < pa.length ? Integer.parseInt(pa[i].replaceAll("[^0-9]","0")) : 0;
                int vb = i < pb.length ? Integer.parseInt(pb[i].replaceAll("[^0-9]","0")) : 0;
                if (va != vb) return Integer.compare(va, vb);
            }
            return 0;
        } catch (Throwable t) { return 0; }
    }

    private static void showUpdateDialog(Activity activity, String current, String latest, String url) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        try {
            new AlertDialog.Builder(activity)
                .setTitle("🆕 Yeni Sürüm Mevcut")
                .setMessage(
                    "Sanctara Node Pro'nun yeni bir sürümü yayınlandı.\n\n" +
                    "  Mevcut sürüm: " + current + "\n" +
                    "  Yeni sürüm:   " + latest + "\n\n" +
                    "Performans iyileştirmeleri ve hata düzeltmeleri içeriyor. " +
                    "Güncellemek ister misiniz?")
                .setPositiveButton("GÜNCELLE", (d, w) -> {
                    try {
                        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        activity.startActivity(i);
                    } catch (Throwable t) {
                        Log.w(TAG, "open browser failed: " + t.getMessage());
                    }
                })
                .setNegativeButton("Şimdi Değil", null)
                .setCancelable(true)
                .show();
        } catch (Throwable ignored) {}
    }
}
