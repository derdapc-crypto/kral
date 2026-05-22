package io.thegrid.worker;

import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

/**
 * v1.7.10 — OEM-aware AutoStart helper.
 *
 * Many Chinese-OEM Android forks (MIUI / EMUI / ColorOS / FuntouchOS / OneUI
 * Pro) kill background services on swipe-away even when START_STICKY +
 * foreground notification + battery whitelist are all granted. The ONLY
 * universal fix is the user toggling that OEM's hidden "AutoStart" /
 * "Background activity protection" switch.
 *
 * We detect the manufacturer once on first launch and deep-link straight to
 * the right settings page so the user is one tap away from enabling it.
 * After the user confirms, we never bother them again.
 */
public final class OemAutoStartHelper {

    private static final String PREF = "oem_autostart";
    private static final String KEY_DONE = "shown_v2";

    public static boolean alreadyShown(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        return sp.getBoolean(KEY_DONE, false);
    }

    public static void markShown(Context ctx) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putBoolean(KEY_DONE, true).apply();
    }

    /** Detect manufacturer + return the friendliest deep-link intent we have. */
    public static Intent intentForCurrentDevice(Context ctx) {
        String m = (Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        String brand = (Build.BRAND == null ? "" : Build.BRAND.toLowerCase());
        try {
            // ----- Xiaomi / Redmi / POCO (MIUI) -----
            if (m.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco")) {
                Intent i = new Intent();
                i.setComponent(new ComponentName(
                    "com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity"));
                return i;
            }
            // ----- Huawei / Honor (EMUI / MagicOS) -----
            if (m.contains("huawei") || m.contains("honor")) {
                Intent i = new Intent();
                i.setComponent(new ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"));
                return i;
            }
            // ----- Oppo / Realme / OnePlus (ColorOS) -----
            if (m.contains("oppo") || m.contains("realme") || brand.contains("oneplus")) {
                Intent i = new Intent();
                i.setComponent(new ComponentName(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.permission.startup.StartupAppListActivity"));
                return i;
            }
            // ----- Vivo / iQOO (FuntouchOS / OriginOS) -----
            if (m.contains("vivo") || brand.contains("iqoo")) {
                Intent i = new Intent();
                i.setComponent(new ComponentName(
                    "com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"));
                return i;
            }
            // ----- Samsung (OneUI) — device care -----
            if (m.contains("samsung")) {
                Intent i = new Intent();
                i.setComponent(new ComponentName(
                    "com.samsung.android.lool",
                    "com.samsung.android.sm.ui.battery.BatteryActivity"));
                return i;
            }
            // ----- Asus -----
            if (m.contains("asus")) {
                Intent i = new Intent();
                i.setComponent(new ComponentName(
                    "com.asus.mobilemanager",
                    "com.asus.mobilemanager.autostart.AutoStartActivity"));
                return i;
            }
            // ----- Letv / Leeco -----
            if (m.contains("letv")) {
                Intent i = new Intent();
                i.setComponent(new ComponentName(
                    "com.letv.android.letvsafe",
                    "com.letv.android.letvsafe.AutobootManageActivity"));
                return i;
            }
        } catch (Throwable ignored) {}
        // Fallback — open generic battery optimization settings page so the
        // user can manually mark Sanctara as "unrestricted".
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                return i;
            }
        } catch (Throwable ignored) {}
        return null;
    }

    public static String tipForCurrentDevice() {
        String m = (Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        String brand = (Build.BRAND == null ? "" : Build.BRAND.toLowerCase());
        if (m.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco")) {
            return "Açılan listede 'Sanctara Node Pro'yu bul ve AUTOSTART'ı AÇ. " +
                   "Sonra Ayarlar → Pil → Sanctara → 'Sınırlama yok' seç.";
        }
        if (m.contains("huawei") || m.contains("honor")) {
            return "Açılan listede 'Sanctara Node Pro'yu bul → 'Manuel olarak yönet' AÇ → " +
                   "'Otomatik başlat', 'İkincil başlatma', 'Arka planda çalış' hepsini AÇ.";
        }
        if (m.contains("oppo") || m.contains("realme") || brand.contains("oneplus")) {
            return "'Sanctara Node Pro'yu bul → 'Otomatik başlatmaya izin ver' AÇ.";
        }
        if (m.contains("vivo") || brand.contains("iqoo")) {
            return "'Sanctara Node Pro'yu bul → 'Yüksek arka plan güç tüketimine izin ver' AÇ.";
        }
        if (m.contains("samsung")) {
            return "'Pil' altında 'Arka plan kullanımı sınırlamaları' → 'Hiç uyumayan uygulamalar' → " +
                   "'Sanctara Node Pro'yu EKLE.";
        }
        return "Sanctara Node Pro için pil optimizasyonunu 'sınırsız / kısıtlamasız' seç.";
    }

    /**
     * v1.7.13 — Direct deep-link, no dialog.  The unified onboarding dialog
     * in MainActivity already explained why the AutoStart page is opening,
     * so we just fire the intent.  Falls back silently if the OEM-specific
     * page isn't available.
     */
    public static void maybeShow(android.app.Activity activity) {
        if (alreadyShown(activity)) return;
        final Intent intent = intentForCurrentDevice(activity);
        if (intent == null) {
            markShown(activity);
            return;
        }
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
            markShown(activity);
        } catch (Throwable t) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + activity.getPackageName()));
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(fallback);
                markShown(activity);
            } catch (Throwable ignored) {}
        }
    }
}
