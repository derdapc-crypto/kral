package io.thegrid.worker;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * THE GRID - Mobile Worker Node.
 * Thin Kotlin/Java native shell wrapping the production /mobile React PWA.
 * Loads https://grid-supercomputer.preview.emergentagent.com/mobile
 * - Cookies enabled (JWT auth via httpOnly cookies)
 * - JavaScript + DOM storage (localStorage fallback token)
 * - Hardware acceleration for crypto.subtle SHA-256 task execution
 * - Edge-to-edge dark theme matching cyber-gold/obsidian aesthetic
 */
public class MainActivity extends Activity {

    private static final String GRID_URL =
        "https://grid-supercomputer.preview.emergentagent.com/mobile";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Edge-to-edge obsidian black status bar.
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#070707"));
        window.setNavigationBarColor(Color.parseColor("#070707"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.getDecorView().setSystemUiVisibility(0);
        }

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
        s.setUserAgentString(s.getUserAgentString() + " GridWorker/1.1.0 Android");

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url == null) return false;
                // Keep auth + grid host in-app; spawn external browser for everything else.
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
        });
        webView.setWebChromeClient(new WebChromeClient());

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT);
        root.addView(webView, lp);
        setContentView(root);

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
}
