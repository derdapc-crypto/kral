package io.thegrid.worker;

import android.content.Context;

import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Minimal HTTP client for THE GRID backend. Uses HttpsURLConnection (no extra deps).
 * Returns raw JSON strings; callers parse with the tiny in-class JSON helpers.
 *
 * v1.6.5 — backend URL is now configurable at runtime. First-launch picker
 * lets the user point the app at any deployment (own VPS, preview env, etc.).
 * Default falls back to the live preview environment so a freshly downloaded
 * APK keeps working without configuration.
 */
public class GridApi {
    /** Hard-coded fallback if no override has been saved yet. */
    public static final String DEFAULT_BASE = "https://grid-supercomputer.preview.emergentagent.com";
    /** Legacy constant kept for compatibility with old call sites — prefer {@link #base(Context)}. */
    public static final String BASE = DEFAULT_BASE;
    private static final String PREF_KEY = "grid_backend_base";

    /** Returns the currently-configured backend URL (no trailing slash). */
    public static String base(Context ctx) {
        try {
            String s = ctx.getSharedPreferences("grid_prefs", Context.MODE_PRIVATE)
                          .getString(PREF_KEY, null);
            if (s == null || s.length() < 8) return DEFAULT_BASE;
            return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
        } catch (Exception ignored) { return DEFAULT_BASE; }
    }

    /** Persist a new backend URL (e.g. user typed it on the first-launch picker). */
    public static void setBase(Context ctx, String url) {
        if (url == null) return;
        url = url.trim();
        if (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }
        ctx.getSharedPreferences("grid_prefs", Context.MODE_PRIVATE)
           .edit().putString(PREF_KEY, url).apply();
    }

    public static String post(Context ctx, String path, String body) throws Exception {
        return request(ctx, "POST", path, body);
    }
    public static String get(Context ctx, String path) throws Exception {
        return request(ctx, "GET", path, null);
    }

    private static String request(Context ctx, String method, String path, String body) throws Exception {
        URL url = new URL(base(ctx) + path);
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("User-Agent", "GridWorker/1.2.0 Android");
        String token = WorkerState.token(ctx);
        if (token != null && !token.isEmpty()) {
            c.setRequestProperty("Authorization", "Bearer " + token);
        }
        if (body != null) {
            c.setRequestProperty("Content-Type", "application/json");
            c.setDoOutput(true);
            try (DataOutputStream out = new DataOutputStream(c.getOutputStream())) {
                out.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int code = c.getResponseCode();
        InputStream is = (code >= 200 && code < 300) ? c.getInputStream() : c.getErrorStream();
        StringBuilder sb = new StringBuilder();
        if (is != null) {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }
        }
        if (code < 200 || code >= 300) {
            throw new Exception("HTTP " + code + ": " + sb);
        }
        return sb.toString();
    }

    /** Tiny single-key JSON extractor — avoids pulling in org.json. */
    public static String pluck(String json, String key) {
        if (json == null) return null;
        String needle = "\"" + key + "\"";
        int i = json.indexOf(needle);
        if (i < 0) return null;
        i = json.indexOf(":", i);
        if (i < 0) return null;
        i++;
        // skip whitespace
        while (i < json.length() && Character.isWhitespace(json.charAt(i))) i++;
        if (i >= json.length()) return null;
        char ch = json.charAt(i);
        if (ch == '"') {
            int end = json.indexOf('"', i + 1);
            return end < 0 ? null : json.substring(i + 1, end);
        }
        // numeric / bool / null until comma or brace
        int end = i;
        while (end < json.length() && ",}]\n\r ".indexOf(json.charAt(end)) < 0) end++;
        return json.substring(i, end);
    }

    /** Pull a nested JSON sub-object value (best-effort, single level). */
    public static String pluckObject(String json, String key) {
        if (json == null) return null;
        String needle = "\"" + key + "\"";
        int i = json.indexOf(needle);
        if (i < 0) return null;
        i = json.indexOf("{", i);
        if (i < 0) return null;
        int depth = 1, j = i + 1;
        while (j < json.length() && depth > 0) {
            char c = json.charAt(j++);
            if (c == '{') depth++;
            else if (c == '}') depth--;
        }
        return json.substring(i, j);
    }
}
