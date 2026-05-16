/*
 * THE GRID — MobileBridgeClient.java (v1.5.0)
 *
 * Replaces the legacy v1.2.6 Binance/RVN StratumClient with the v1.3.8
 * Mobile Mining Bridge — a WebSocket-based stratum proxy that forwards
 * RandomX shares from the device to pool.supportxmr.com via the operator's
 * backend.  No pool credentials ever live on the device.
 *
 * Flow per ENGAGE:
 *   1. HTTP POST /api/mobile-mining/config?device_id=...  → session_nonce + signature + worker_id
 *   2. WSS /api/mobile-mining/worker/ws?token=&device_id=&nonce=&signature=
 *   3. Receive {"type":"job","params":{"job_id","blob","target","seed_hash",...}}
 *   4. Feed job into RandomXBridge.setMiningJob(...) → native hash loop starts
 *   5. Poll RandomXBridge.pollShareCandidate() at ~2s cadence; on hit, send
 *      {"type":"submit","job_id","nonce","result"} over the WS
 *   6. Backend forwards to pool, echoes {"type":"submit_result","ok":bool,...}
 *
 * Threading: one daemon thread per connection.  linked() is volatile-safe,
 * called by GridWorkerService to attach `stratum_linked` to heartbeat.
 *
 * Fail-soft: if librandomx.so is missing or session issue fails, the client
 * silently logs and retries with exponential backoff — never crashes the
 * foreground service.
 */
package io.thegrid.worker;

import android.content.Context;
import android.util.Log;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Random;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import java.net.Socket;

public class MobileBridgeClient {
    private static final String TAG = "GridBridge";
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final long RECONNECT_BASE_MS = 3_000L;
    private static final long RECONNECT_MAX_MS  = 60_000L;
    private static final long SHARE_POLL_MS     = 2_000L;
    private static final long PING_INTERVAL_MS  = 25_000L;

    private final Context ctx;
    private final String  apkPath;

    private volatile boolean stop = false;
    private volatile boolean connected  = false;
    private volatile boolean authorized = false;
    private volatile String  lastError  = null;
    private volatile String  workerId   = null;
    private volatile String  currentJobId = null;
    private Thread thread;
    private Socket socket;
    private OutputStream out;
    private BufferedReader in;
    private long lastShareCheck = 0;
    private long lastPing       = 0;

    public MobileBridgeClient(Context ctx, String apkPath) {
        this.ctx = ctx.getApplicationContext();
        this.apkPath = apkPath;
    }

    public void start() {
        if (thread != null && thread.isAlive()) return;
        stop = false;
        thread = new Thread(this::run, "grid-bridge");
        thread.setDaemon(true);
        thread.start();
    }

    public void stop() {
        stop = true;
        try { if (socket != null) socket.close(); } catch (Exception ignored) {}
        if (thread != null) thread.interrupt();
        try { RandomXBridge.stopMining(); } catch (Exception ignored) {}
    }

    public boolean linked()      { return connected && authorized; }
    public boolean isConnected() { return connected; }
    public String  lastError()   { return lastError; }
    public String  workerId()    { return workerId; }

    // ============================================================
    // Main loop — issue session, connect WS, pump job/submit frames.
    // ============================================================
    private void run() {
        long backoff = RECONNECT_BASE_MS;
        while (!stop) {
            try {
                runOnce();
            } catch (Exception e) {
                lastError = e.getClass().getSimpleName() + ": " + e.getMessage();
                Log.w(TAG, "bridge error: " + lastError);
            } finally {
                connected = false;
                authorized = false;
                try { if (socket != null) socket.close(); } catch (Exception ignored) {}
                try { RandomXBridge.stopMining(); } catch (Exception ignored) {}
            }
            if (stop) break;
            try { Thread.sleep(backoff); } catch (InterruptedException ie) { break; }
            backoff = Math.min(RECONNECT_MAX_MS, (long) (backoff * 1.5));
        }
    }

    private void runOnce() throws Exception {
        if (!RandomXBridge.available()) {
            throw new Exception("librandomx.so missing — bridge needs native RandomX engine");
        }
        String deviceId = WorkerState.deviceId(ctx);
        String token    = WorkerState.token(ctx);
        if (deviceId == null || token == null) {
            throw new Exception("auth not set — call setAuthToken first");
        }

        // -------- 1. POST /api/mobile-mining/config → session --------
        String sessionJson = httpPostConfig(deviceId, token);
        String nonce       = pluckString(sessionJson, "session_nonce");
        String signature   = pluckString(sessionJson, "signature");
        String myWorker    = pluckString(sessionJson, "worker_id");
        if (nonce == null || signature == null || myWorker == null) {
            throw new Exception("config response missing fields: " + sessionJson);
        }
        this.workerId = myWorker;
        Log.i(TAG, "session issued worker_id=" + myWorker);

        // -------- 2. Open WSS to backend bridge --------
        openWebSocket(deviceId, token, nonce, signature);
        connected = true;
        authorized = true;

        // -------- 3. Start the native RandomX engine (job-driven mode) --------
        // We pass pool="bridge" + user=worker_id so the native side knows it
        // is in WS-bridge mode (no direct pool socket). Actual jobs arrive via
        // setMiningJob() on each pool 'job' frame.
        // v1.5.5 — operator decree "Snapdragon 8 Gen 3 max": expand thread
        // budget so flagship phones (8-core Snapdragon, A17 Pro, etc.) hit
        // their real RandomX ceiling (~100-200 H/s).  Was capped at 4; now
        // capped at 8 (still leaves half the cores for UI / system).
        // BatteryExempt + foreground guarantees Doze-survival.
        int cores   = Math.max(1, Runtime.getRuntime().availableProcessors());
        int threads = Math.max(2, Math.min(8, cores - 2));
        RandomXBridge.startMining("bridge", myWorker, "x", threads);

        // -------- 4. Pump frames --------
        long backoffPump = 100;
        while (!stop) {
            // 4a. read incoming pool frames (job, submit_result, error)
            socket.setSoTimeout(500);  // short read so we can interleave share polling
            String line = null;
            try { line = readWsFrame(); }
            catch (java.net.SocketTimeoutException ste) { /* fall through to share poll */ }

            if (line != null) {
                handleServerFrame(line);
                backoffPump = 100;
            }

            // 4b. poll for share candidate, submit if found
            long now = System.currentTimeMillis();
            if (now - lastShareCheck >= SHARE_POLL_MS) {
                lastShareCheck = now;
                String cand = RandomXBridge.pollShareCandidate();
                if (cand != null) {
                    String jobId = pluckString(cand, "job_id");
                    String snc   = pluckString(cand, "nonce");
                    String res   = pluckString(cand, "result");
                    if (jobId != null && snc != null && res != null) {
                        sendSubmit(jobId, snc, res);
                    }
                }
            }

            // 4c. heartbeat ping every 25s to keep the WS alive across NAT
            if (now - lastPing >= PING_INTERVAL_MS) {
                lastPing = now;
                try { sendWsText("{\"type\":\"ping\"}"); } catch (Exception ignored) {}
            }

            if (line == null) {
                // idle — small sleep to avoid busy loop
                try { Thread.sleep(backoffPump); } catch (InterruptedException ie) { break; }
                backoffPump = Math.min(500, backoffPump + 50);
            }
        }
    }

    // ============================================================
    // HTTP — /api/mobile-mining/config
    // ============================================================
    private String httpPostConfig(String deviceId, String token) throws Exception {
        String url = GridApi.BASE + "/api/mobile-mining/config?device_id="
                   + URLEncoder.encode(deviceId, "UTF-8");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setRequestMethod("POST");
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Content-Type", "application/json");
            c.setConnectTimeout(15000);
            c.setReadTimeout(15000);
            c.setDoOutput(true);
            c.getOutputStream().write("{}".getBytes(UTF8));
            int code = c.getResponseCode();
            if (code != 200) throw new Exception("config http " + code);
            java.io.InputStream is = c.getInputStream();
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096]; int n;
            while ((n = is.read(buf)) > 0) baos.write(buf, 0, n);
            return baos.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    // ============================================================
    // WebSocket — RFC 6455 minimal client (text frames only)
    // ============================================================
    private void openWebSocket(String deviceId, String token, String nonce, String sig) throws Exception {
        URI u = new URI(GridApi.BASE);
        String host = u.getHost();
        int port    = u.getPort() > 0 ? u.getPort()
                    : ("https".equalsIgnoreCase(u.getScheme()) ? 443 : 80);
        boolean tls = "https".equalsIgnoreCase(u.getScheme());

        String path = "/api/mobile-mining/worker/ws"
                    + "?token="     + URLEncoder.encode(token,     "UTF-8")
                    + "&device_id=" + URLEncoder.encode(deviceId,  "UTF-8")
                    + "&nonce="     + URLEncoder.encode(nonce,     "UTF-8")
                    + "&signature=" + URLEncoder.encode(sig,       "UTF-8");

        Socket s = tls
            ? ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(host, port)
            : new Socket(host, port);
        if (s instanceof SSLSocket) {
            ((SSLSocket) s).startHandshake();
        }
        s.setSoTimeout(30000);
        this.socket = s;
        this.out    = s.getOutputStream();
        this.in     = new BufferedReader(new InputStreamReader(s.getInputStream(), UTF8));

        // Sec-WebSocket-Key: random 16 bytes b64
        byte[] keyBytes = new byte[16];
        new Random().nextBytes(keyBytes);
        String wsKey = Base64.getEncoder().encodeToString(keyBytes);

        String req = "GET " + path + " HTTP/1.1\r\n"
                   + "Host: " + host + "\r\n"
                   + "Upgrade: websocket\r\n"
                   + "Connection: Upgrade\r\n"
                   + "Sec-WebSocket-Key: " + wsKey + "\r\n"
                   + "Sec-WebSocket-Version: 13\r\n"
                   + "User-Agent: GridWorker/1.5.5\r\n"
                   + "\r\n";
        out.write(req.getBytes(UTF8));
        out.flush();

        // Read HTTP response headers until empty line
        String statusLine = in.readLine();
        if (statusLine == null || !statusLine.contains("101")) {
            throw new Exception("ws upgrade failed: " + statusLine);
        }
        String hl;
        while ((hl = in.readLine()) != null && !hl.isEmpty()) { /* drain headers */ }
        Log.i(TAG, "ws upgraded");
    }

    // Read one server-to-client text frame (unmasked per RFC 6455)
    private String readWsFrame() throws Exception {
        java.io.InputStream raw = socket.getInputStream();
        int b1 = raw.read();
        if (b1 < 0) throw new Exception("ws eof");
        int b2 = raw.read();
        if (b2 < 0) throw new Exception("ws eof");
        int opcode = b1 & 0x0F;
        int payloadLen = b2 & 0x7F;
        long len;
        if (payloadLen < 126) {
            len = payloadLen;
        } else if (payloadLen == 126) {
            len = ((raw.read() & 0xFF) << 8) | (raw.read() & 0xFF);
        } else {
            len = 0;
            for (int i = 0; i < 8; i++) len = (len << 8) | (raw.read() & 0xFF);
        }
        boolean masked = (b2 & 0x80) != 0;
        byte[] mask = new byte[4];
        if (masked) {
            for (int i = 0; i < 4; i++) mask[i] = (byte) raw.read();
        }
        byte[] payload = new byte[(int) len];
        int read = 0;
        while (read < len) {
            int n = raw.read(payload, read, (int) (len - read));
            if (n < 0) throw new Exception("ws eof in payload");
            read += n;
        }
        if (masked) {
            for (int i = 0; i < payload.length; i++) payload[i] = (byte) (payload[i] ^ mask[i & 3]);
        }
        if (opcode == 0x8) throw new Exception("ws close");   // close frame
        if (opcode == 0x9) { sendWsPong(payload); return null; } // ping
        if (opcode == 0xA) return null;                        // pong
        if (opcode != 0x1) return null;                        // not text
        return new String(payload, UTF8);
    }

    // Client-to-server frames MUST be masked (RFC 6455 §5.3)
    private synchronized void sendWsText(String text) throws Exception {
        byte[] payload = text.getBytes(UTF8);
        java.io.ByteArrayOutputStream f = new java.io.ByteArrayOutputStream();
        f.write(0x81);  // FIN + text
        int len = payload.length;
        if (len < 126) {
            f.write(0x80 | len);
        } else if (len < 65536) {
            f.write(0x80 | 126);
            f.write((len >> 8) & 0xFF);
            f.write(len & 0xFF);
        } else {
            f.write(0x80 | 127);
            for (int i = 7; i >= 0; i--) f.write((int) ((long) len >> (i * 8)) & 0xFF);
        }
        byte[] mask = new byte[4];
        new Random().nextBytes(mask);
        f.write(mask);
        for (int i = 0; i < payload.length; i++) f.write(payload[i] ^ mask[i & 3]);
        out.write(f.toByteArray());
        out.flush();
    }

    private void sendWsPong(byte[] payload) {
        try {
            java.io.ByteArrayOutputStream f = new java.io.ByteArrayOutputStream();
            f.write(0x8A);  // FIN + pong
            f.write(0x80 | payload.length);
            byte[] mask = new byte[4];
            new Random().nextBytes(mask);
            f.write(mask);
            for (int i = 0; i < payload.length; i++) f.write(payload[i] ^ mask[i & 3]);
            out.write(f.toByteArray()); out.flush();
        } catch (Exception ignored) {}
    }

    // ============================================================
    // Frame handlers
    // ============================================================
    private void handleServerFrame(String json) {
        String t = pluckString(json, "type");
        if ("job".equals(t)) {
            String params  = pluckObject(json, "params");
            String jobId   = pluckString(params, "job_id");
            String blob    = pluckString(params, "blob");
            String seed    = pluckString(params, "seed_hash");
            String target  = pluckString(params, "target");
            if (jobId != null && blob != null) {
                long tgt = parseTarget(target);
                boolean ok = RandomXBridge.setMiningJob(jobId, blob, seed == null ? "" : seed, tgt);
                if (ok) currentJobId = jobId;
                Log.i(TAG, "job " + jobId + " (" + (ok ? "applied" : "REJECTED") + ")");
            }
        } else if ("submit_result".equals(t)) {
            boolean ok = "true".equals(pluckString(json, "ok"));
            Log.i(TAG, "share " + (ok ? "ACCEPTED" : "REJECTED"));
        } else if ("error".equals(t)) {
            lastError = "server: " + pluckString(json, "msg");
            Log.w(TAG, lastError);
        }
    }

    private void sendSubmit(String jobId, String nonce, String result) {
        try {
            String json = "{\"type\":\"submit\",\"job_id\":\"" + jobId + "\","
                        + "\"nonce\":\"" + nonce + "\",\"result\":\"" + result + "\"}";
            sendWsText(json);
        } catch (Exception e) {
            Log.w(TAG, "submit send fail: " + e.getMessage());
        }
    }

    private long parseTarget(String hex) {
        if (hex == null || hex.isEmpty()) return 0xFFFFFFFFL;
        try {
            String h = hex.toLowerCase();
            if (h.startsWith("0x")) h = h.substring(2);
            if (h.length() > 16) h = h.substring(0, 16);
            return Long.parseUnsignedLong(h, 16);
        } catch (Exception e) { return 0xFFFFFFFFL; }
    }

    // ============================================================
    // Minimal JSON pluckers (avoid bundling a heavy JSON lib in the APK)
    // Same convention used by GridApi.pluck/pluckObject.
    // ============================================================
    private static String pluckString(String json, String key) {
        if (json == null) return null;
        String needle = "\"" + key + "\"";
        int i = json.indexOf(needle);
        if (i < 0) return null;
        int colon = json.indexOf(':', i + needle.length());
        if (colon < 0) return null;
        int j = colon + 1;
        while (j < json.length() && Character.isWhitespace(json.charAt(j))) j++;
        if (j >= json.length()) return null;
        char ch = json.charAt(j);
        if (ch == '"') {
            int end = json.indexOf('"', j + 1);
            if (end < 0) return null;
            return json.substring(j + 1, end);
        }
        // number / bool / null literal
        int end = j;
        while (end < json.length() &&
               "0123456789.-eEtrufalsnull".indexOf(json.charAt(end)) >= 0) end++;
        return json.substring(j, end);
    }

    private static String pluckObject(String json, String key) {
        if (json == null) return null;
        String needle = "\"" + key + "\"";
        int i = json.indexOf(needle);
        if (i < 0) return null;
        int colon = json.indexOf(':', i + needle.length());
        if (colon < 0) return null;
        int j = colon + 1;
        while (j < json.length() && Character.isWhitespace(json.charAt(j))) j++;
        if (j >= json.length() || json.charAt(j) != '{') return null;
        int depth = 0;
        for (int k = j; k < json.length(); k++) {
            char ch = json.charAt(k);
            if (ch == '{') depth++;
            else if (ch == '}') { depth--; if (depth == 0) return json.substring(j, k + 1); }
        }
        return null;
    }
}
