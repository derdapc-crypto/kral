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
 */
public class GridApi {
    public static final String BASE = "https://grid-supercomputer.preview.emergentagent.com";

    public static String post(Context ctx, String path, String body) throws Exception {
        return request(ctx, "POST", path, body);
    }
    public static String get(Context ctx, String path) throws Exception {
        return request(ctx, "GET", path, null);
    }

    private static String request(Context ctx, String method, String path, String body) throws Exception {
        URL url = new URL(BASE + path);
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
