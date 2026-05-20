package io.thegrid.worker;

import android.app.Activity;
import android.content.Context;
import android.util.Log;
import android.webkit.WebView;
import org.json.JSONObject;

/**
 * RewardedAdManager — v1.7.5 (THE GRID LIGHT only)
 *
 * Wraps Google AdMob Rewarded Ads via REFLECTION so this Java file compiles
 * even when the Google Play Services Ads SDK is NOT on the classpath. This
 * matters because:
 *   - The Light APK build pipeline can optionally bundle the AdMob SDK JAR.
 *   - The Node Pro APK MUST NOT bundle any AdMob SDK — see build-apk.sh.
 *
 * When the SDK is bundled and BuildConfig.ADMOB_ENABLED=true, this class:
 *   1. Calls MobileAds.initialize(context, ...)
 *   2. Calls RewardedAd.load(...) with the runtime ad unit ID
 *   3. Shows the ad, listens for onUserEarnedReward / dismissal / failure
 *   4. Dispatches a window CustomEvent back to the React DailyCalibration UI:
 *        - grid:rewarded_ad_completed
 *        - grid:rewarded_ad_failed
 *        - grid:rewarded_ad_closed_without_reward
 *
 * When the SDK is NOT bundled (e.g. Node Pro build, or Light build without
 * the AAR), or when BuildConfig.ADMOB_ENABLED=false, every entry point
 * is a hard NO-OP that immediately dispatches grid:rewarded_ad_failed.
 *
 * Test-mode fallback:
 *   If ADMOB_TEST_MODE=true at the backend AND the SDK is missing, we still
 *   dispatch a *completed* event after ~1.5s so the QA flow on the preview
 *   build (which is just a WebView shell without GMS) works end-to-end.
 *   This is the only place where "fake completion" is allowed, and it is
 *   gated entirely on the backend-returned ad_mode='test' signal.
 */
public final class RewardedAdManager {

    private static final String TAG = "GridAdMob";

    private RewardedAdManager() {}

    /** Dispatch a CustomEvent on the WebView's window. Called from any thread. */
    private static void fire(final Activity host, final WebView webView, final String eventName) {
        if (host == null || webView == null) return;
        host.runOnUiThread(new Runnable() {
            @Override public void run() {
                String js =
                    "(function(){try{window.dispatchEvent(new CustomEvent('" + eventName + "'));}catch(e){}})();";
                webView.evaluateJavascript(js, null);
            }
        });
    }

    /** Reflection probe — returns true if Google Play Services Ads SDK is on the classpath. */
    public static boolean sdkPresent() {
        try {
            Class.forName("com.google.android.gms.ads.MobileAds");
            return true;
        } catch (ClassNotFoundException e) {
            return false;
        }
    }

    /**
     * Entry point called from the JS bridge — runs the full Rewarded Ad lifecycle.
     *
     * @param host       Activity that owns the WebView.
     * @param webView    WebView used to dispatch JS CustomEvents.
     * @param adUnitId   AdMob rewarded ad unit ID (test ID OR real ID from .env).
     * @param testMode   true when backend ad_mode='test' (used for soft-fallback when SDK missing).
     */
    public static void requestAndShow(final Activity host, final WebView webView,
                                       final String adUnitId, final boolean testMode) {
        if (host == null || webView == null) {
            Log.w(TAG, "host/webView null, ad request aborted");
            return;
        }
        if (!BuildConfig.ADMOB_ENABLED) {
            Log.i(TAG, "AdMob disabled in BuildConfig (Node Pro flavor) — firing failed");
            fire(host, webView, "grid:rewarded_ad_failed");
            return;
        }
        if (adUnitId == null || adUnitId.isEmpty()) {
            Log.w(TAG, "Empty ad unit id — firing failed");
            fire(host, webView, "grid:rewarded_ad_failed");
            return;
        }

        if (!sdkPresent()) {
            // SDK missing from the APK (preview builds, debug builds without AAR).
            // In test mode we soft-complete so the QA loop continues; in production
            // we fail hard.
            if (testMode) {
                Log.i(TAG, "AdMob SDK missing + test_mode=true → soft-completing");
                webView.postDelayed(new Runnable() {
                    @Override public void run() {
                        fire(host, webView, "grid:rewarded_ad_completed");
                    }
                }, 1500);
            } else {
                Log.w(TAG, "AdMob SDK missing + test_mode=false → failed");
                fire(host, webView, "grid:rewarded_ad_failed");
            }
            return;
        }

        // SDK present — drive it via reflection.
        host.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    Class<?> mobileAdsCls = Class.forName("com.google.android.gms.ads.MobileAds");
                    mobileAdsCls.getMethod("initialize", Context.class,
                        Class.forName("com.google.android.gms.ads.initialization.OnInitializationCompleteListener"))
                        .invoke(null, host.getApplicationContext(), null);

                    Class<?> rewardedCls = Class.forName("com.google.android.gms.ads.rewarded.RewardedAd");
                    Class<?> adRequestBuilderCls = Class.forName("com.google.android.gms.ads.AdRequest$Builder");
                    Object adRequest = adRequestBuilderCls.getDeclaredConstructor().newInstance();
                    Object built = adRequestBuilderCls.getMethod("build").invoke(adRequest);

                    Class<?> loadCallbackCls = Class.forName("com.google.android.gms.ads.rewarded.RewardedAdLoadCallback");
                    Object loadCallback = java.lang.reflect.Proxy.newProxyInstance(
                        loadCallbackCls.getClassLoader(),
                        new Class<?>[]{loadCallbackCls},
                        new java.lang.reflect.InvocationHandler() {
                            @Override
                            public Object invoke(Object proxy, java.lang.reflect.Method method, Object[] args) {
                                String name = method.getName();
                                if ("onAdLoaded".equals(name) && args != null && args.length > 0) {
                                    // show immediately + attach reward listener
                                    Object rewardedAd = args[0];
                                    attachRewardListener(host, webView, rewardedAd);
                                } else if ("onAdFailedToLoad".equals(name)) {
                                    Log.w(TAG, "onAdFailedToLoad → failed");
                                    fire(host, webView, "grid:rewarded_ad_failed");
                                }
                                return null;
                            }
                        });

                    rewardedCls.getMethod("load", Context.class, String.class,
                        built.getClass().getSuperclass() != null ? built.getClass().getSuperclass() : built.getClass(),
                        loadCallbackCls)
                        .invoke(null, host, adUnitId, built, loadCallback);

                } catch (Throwable t) {
                    Log.w(TAG, "Reflection AdMob path failed: " + t.getMessage());
                    if (testMode) {
                        webView.postDelayed(new Runnable() {
                            @Override public void run() { fire(host, webView, "grid:rewarded_ad_completed"); }
                        }, 1500);
                    } else {
                        fire(host, webView, "grid:rewarded_ad_failed");
                    }
                }
            }
        });
    }

    /** Show the loaded RewardedAd and listen for reward / dismissal. */
    private static void attachRewardListener(final Activity host, final WebView webView, final Object rewardedAd) {
        try {
            Class<?> userEarnedCls = Class.forName("com.google.android.gms.ads.OnUserEarnedRewardListener");

            final boolean[] rewarded = new boolean[]{false};

            Object onReward = java.lang.reflect.Proxy.newProxyInstance(
                userEarnedCls.getClassLoader(),
                new Class<?>[]{userEarnedCls},
                new java.lang.reflect.InvocationHandler() {
                    @Override public Object invoke(Object proxy, java.lang.reflect.Method method, Object[] args) {
                        rewarded[0] = true;
                        fire(host, webView, "grid:rewarded_ad_completed");
                        return null;
                    }
                });

            // Attach a FullScreenContentCallback so we can detect dismissal without reward.
            Class<?> fsccCls = Class.forName("com.google.android.gms.ads.FullScreenContentCallback");
            Object fscc = java.lang.reflect.Proxy.newProxyInstance(
                fsccCls.getClassLoader(),
                new Class<?>[]{fsccCls},
                new java.lang.reflect.InvocationHandler() {
                    @Override public Object invoke(Object proxy, java.lang.reflect.Method method, Object[] args) {
                        String n = method.getName();
                        if ("onAdDismissedFullScreenContent".equals(n) && !rewarded[0]) {
                            fire(host, webView, "grid:rewarded_ad_closed_without_reward");
                        } else if ("onAdFailedToShowFullScreenContent".equals(n)) {
                            fire(host, webView, "grid:rewarded_ad_failed");
                        }
                        return null;
                    }
                });

            // Don't crash if the setter doesn't exist on older SDKs.
            try {
                rewardedAd.getClass().getMethod("setFullScreenContentCallback", fsccCls).invoke(rewardedAd, fscc);
            } catch (Throwable ignored) {}

            rewardedAd.getClass()
                .getMethod("show", Activity.class, userEarnedCls)
                .invoke(rewardedAd, host, onReward);

        } catch (Throwable t) {
            Log.w(TAG, "attachRewardListener failed: " + t.getMessage());
            fire(host, webView, "grid:rewarded_ad_failed");
        }
    }
}
