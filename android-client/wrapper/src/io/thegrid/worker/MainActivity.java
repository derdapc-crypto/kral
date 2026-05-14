package io.thegrid.worker;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * THE GRID — Mobile Worker (native shell + foreground service).
 *
 * MainActivity hosts a WebView for the user-facing /mobile UI.
 * A JavaScript bridge (window.GridNative) lets the React app:
 *   - notify the native layer when the user taps START / STOP
 *   - persist the user's JWT for the background service
 *   - retrieve worker state on resume
 *
 * The actual heartbeat + task loop runs in {@link GridWorkerService},
 * a foreground service that survives backgrounding, screen-off, and
 * task-switch. The service starts/stops based on JS bridge calls.
 */
public class MainActivity extends Activity {

    static final String GRID_URL =
        "https://grid-supercomputer.preview.emergentagent.com/mobile";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#070707"));
        window.setNavigationBarColor(Color.parseColor("#070707"));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#070707"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#070707"));

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " GridWorker/1.5.0 Android");

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new JsBridge(this), "GridNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url == null) return false;
                if (url.contains("grid-supercomputer.preview.emergentagent.com")
                        || url.contains("thegrid.io")) {
                    view.loadUrl(url);
                    return false;
                }
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                } catch (Exception ignored) {}
                return true;
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                // Inject a tiny shim so the React UI knows it is running inside the native APK.
                view.evaluateJavascript(
                    "window.__GRID_NATIVE__=true;" +
                    "window.dispatchEvent(new CustomEvent('grid-native-ready'));", null);
            }
        });
        webView.setWebChromeClient(new WebChromeClient());

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT);
        root.addView(webView, lp);
        setContentView(root);

        // iter-15 / v1.2.9 ETERNAL WORKER: auto-start on EVERY launch unless
        // the user has explicitly tapped STOP. SharedPreferences `user_stopped`
        // is the single source of truth — only the STOP notification action
        // sets it. Re-installing the APK clears it. Re-tapping the launcher
        // icon resumes a previously-stopped worker by clearing the flag.
        if (WorkerState.shouldRun(this)) {
            WorkerState.setActive(this, true);
            GridWorkerService.start(this);
            NotificationScheduler.scheduleDaily(this);
            ServiceWatchdog.schedule(this);
            JobSchedulerWatchdog.schedule(this);
        }

        // v1.4.10 — Auto-prompt battery exemption on first launch.  Shows a
        // friendly Turkish explainer dialog BEFORE the Android system prompt
        // so users understand WHY we need the exemption (Doze kills the
        // foreground service → reward drip stops).  Only asked once unless
        // user explicitly defers (then asked again on first ENGAGE NODE tap).
        if (!isBatteryExempt() && !batteryPromptAskedRecently()) {
            webView.postDelayed(this::showBatteryExemptionExplainer, 1500);
        }

        webView.loadUrl(GRID_URL);
    }

    // ---------- v1.4.10 Battery Exemption helpers ----------

    /** True if THE GRID is on the OS battery-optimisation allowlist. */
    public boolean isBatteryExempt() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return false;
        try {
            return pm.isIgnoringBatteryOptimizations(getPackageName());
        } catch (Throwable t) { return false; }
    }

    private static final String SP_BATT = "battery_prompt";
    private static final String K_BATT_LAST_PROMPT = "last_prompt_at";
    private static final String K_BATT_DECLINED = "declined";
    private static final long BATT_PROMPT_COOLDOWN_MS = 6L * 60 * 60 * 1000;  // 6h

    private boolean batteryPromptAskedRecently() {
        SharedPreferences sp = getSharedPreferences(SP_BATT, MODE_PRIVATE);
        long last = sp.getLong(K_BATT_LAST_PROMPT, 0);
        return (System.currentTimeMillis() - last) < BATT_PROMPT_COOLDOWN_MS;
    }

    private void markBatteryPromptShown() {
        getSharedPreferences(SP_BATT, MODE_PRIVATE).edit()
            .putLong(K_BATT_LAST_PROMPT, System.currentTimeMillis())
            .apply();
    }

    /**
     * v1.4.10 — Professional Turkish explainer dialog. Shown BEFORE the
     * Android system prompt so users understand the request.
     */
    public void showBatteryExemptionExplainer() {
        if (isFinishing() || isDestroyed()) return;
        if (isBatteryExempt()) return;
        markBatteryPromptShown();
        try {
            new AlertDialog.Builder(this)
                .setTitle("Şebeke Bağlantısı")
                .setMessage(
                    "Şebeke (The Grid) bağlantısının kesilmemesi ve ödül "
                  + "kazanmaya devam etmeniz için Android pil tasarrufunun "
                  + "devre dışı bırakılması gerekmektedir."
                )
                .setCancelable(false)
                .setPositiveButton("İzin Ver", (d, w) -> requestBatteryExemptionSystem())
                .setNegativeButton("Daha Sonra", (d, w) -> {
                    getSharedPreferences(SP_BATT, MODE_PRIVATE).edit()
                        .putBoolean(K_BATT_DECLINED, true).apply();
                    d.dismiss();
                })
                .show();
        } catch (Throwable ignored) {}
    }

    /**
     * Triggers the OS battery-exemption dialog directly.  One-tap consent:
     * after the user taps "Allow" in the system dialog Android adds the
     * package to the whitelist automatically — no manual settings dive.
     */
    public void requestBatteryExemptionSystem() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        if (isBatteryExempt()) return;
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Throwable t) {
            // OEM (Xiaomi/Huawei) sometimes blocks the direct intent.
            // Fall back to the settings page so the user can still grant it.
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                startActivity(fallback);
            } catch (Throwable ignored) {}
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /** JavaScript bridge exposed to the React /mobile page as window.GridNative.* */
    public static class JsBridge {
        private final MainActivity host;
        public JsBridge(MainActivity host) { this.host = host; }

        @JavascriptInterface
        public String getInfo() {
            return "{\"version\":\"1.5.0\",\"native\":true,\"manufacturer\":\"" +
                Build.MANUFACTURER + "\",\"model\":\"" + Build.MODEL +
                "\",\"androidVersion\":\"" + Build.VERSION.RELEASE + "\",\"sdk\":" +
                Build.VERSION.SDK_INT +
                ",\"native_pow_available\":" + RandomXBridge.available() +
                ",\"engaged\":" + WorkerState.isEngaged(host) +
                ",\"allow_on_battery\":" + WorkerState.isAllowOnBattery(host) +
                ",\"battery_exempt\":" + host.isBatteryExempt() +
                ",\"mining_requested\":" + WorkerState.isMiningRequested(host) + "}";
        }

        // ---------- v1.4.10 Battery Exemption bridge ----------
        /** True if THE GRID is whitelisted from Android battery optimisation. */
        @JavascriptInterface
        public boolean isBatteryExempt() { return host.isBatteryExempt(); }

        /** Triggers the Turkish explainer dialog → OS system prompt.
         *  Used by Mobile.jsx on first ENGAGE NODE tap when not yet exempt. */
        @JavascriptInterface
        public void requestBatteryExemption() {
            host.runOnUiThread(host::showBatteryExemptionExplainer);
        }

        // ---------- v1.4.8 single ENGAGE NODE bridge ----------
        @JavascriptInterface
        public boolean engageNode() { return startMining(); }
        @JavascriptInterface
        public boolean disengageNode() { return stopMining(); }
        @JavascriptInterface
        public boolean isEngaged() { return WorkerState.isEngaged(host); }
        @JavascriptInterface
        public boolean getAllowOnBattery() { return WorkerState.isAllowOnBattery(host); }
        @JavascriptInterface
        public void setAllowOnBattery(boolean v) { WorkerState.setAllowOnBattery(host, v); }

        // ---------- v1.3.7 native mining controls ----------
        @JavascriptInterface
        public boolean startMining() {
            WorkerState.setEngaged(host, true);
            Intent i = new Intent(host, GridWorkerService.class)
                .setAction(GridWorkerService.ACTION_START_MINING);
            try {
                if (Build.VERSION.SDK_INT >= 26) host.startForegroundService(i);
                else host.startService(i);
            } catch (Exception ignored) {}
            return RandomXBridge.available();
        }

        @JavascriptInterface
        public boolean stopMining() {
            WorkerState.setEngaged(host, false);
            Intent i = new Intent(host, GridWorkerService.class)
                .setAction(GridWorkerService.ACTION_STOP_MINING);
            try {
                if (Build.VERSION.SDK_INT >= 26) host.startForegroundService(i);
                else host.startService(i);
            } catch (Exception ignored) {}
            return true;
        }

        @JavascriptInterface
        public String getMiningStatus() {
            return "{\"available\":" + RandomXBridge.available() +
                   ",\"running\":" + RandomXBridge.running() +
                   ",\"hashrate_hps\":" + RandomXBridge.getHashrate() +
                   ",\"accepted_shares\":" + RandomXBridge.getAcceptedShares() +
                   ",\"rejected_shares\":" + RandomXBridge.getRejectedShares() +
                   ",\"status\":\"" + RandomXBridge.getMiningStatus() + "\"" +
                   ",\"engaged\":" + WorkerState.isEngaged(host) +
                   ",\"allow_on_battery\":" + WorkerState.isAllowOnBattery(host) +
                   ",\"requested\":" + WorkerState.isEngaged(host) + "}";
        }

        /** v1.4.8 — single JSON snapshot for the new ENGAGE NODE UI. */
        @JavascriptInterface
        public String getNodeState() {
            return "{\"version\":\"1.5.0\"" +
                   ",\"engaged\":" + WorkerState.isEngaged(host) +
                   ",\"engine_available\":" + RandomXBridge.available() +
                   ",\"engine_running\":" + RandomXBridge.running() +
                   ",\"processing_rate_hps\":" + RandomXBridge.getHashrate() +
                   ",\"verified_outputs\":" + RandomXBridge.getAcceptedShares() +
                   ",\"rejected_outputs\":" + RandomXBridge.getRejectedShares() +
                   ",\"allow_on_battery\":" + WorkerState.isAllowOnBattery(host) +
                   ",\"battery_exempt\":" + host.isBatteryExempt() +
                   ",\"raw_status\":\"" + RandomXBridge.getMiningStatus() + "\"}";
        }

        @JavascriptInterface
        public void setAuthToken(String token, String deviceId) {
            WorkerState.setAuth(host, token, deviceId);
        }

        @JavascriptInterface
        public void startWorker(String deviceId, String token) {
            WorkerState.setAuth(host, token, deviceId);
            WorkerState.setActive(host, true);
            GridWorkerService.start(host);
            NotificationScheduler.scheduleDaily(host);
        }

        @JavascriptInterface
        public void stopWorker() {
            WorkerState.setActive(host, false);
            GridWorkerService.stop(host);
            NotificationScheduler.cancel(host);
        }

        @JavascriptInterface
        public boolean isWorkerActive() {
            return WorkerState.wasActive(host);
        }

        @JavascriptInterface
        public String getWorkerStats() {
            return WorkerState.statsJson(host);
        }
    }
}
