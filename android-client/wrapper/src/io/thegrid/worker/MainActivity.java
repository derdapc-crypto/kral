package io.thegrid.worker;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
        s.setUserAgentString(s.getUserAgentString() + " GridWorker/1.3.1 Android");

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

        webView.loadUrl(GRID_URL);
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
            return "{\"version\":\"1.3.1\",\"native\":true,\"manufacturer\":\"" +
                Build.MANUFACTURER + "\",\"model\":\"" + Build.MODEL +
                "\",\"androidVersion\":\"" + Build.VERSION.RELEASE + "\",\"sdk\":" +
                Build.VERSION.SDK_INT + "}";
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
