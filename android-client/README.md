# THE GRID — Android Worker (real signed APK)

The production-grade Android worker for THE GRID. This is a thin native shell that wraps the existing `/mobile` React PWA inside a hardware-accelerated WebView, with cookie/JWT auth, dark-mode chrome, and a stable launcher icon.

## Output

- File: `/app/frontend/public/grid-worker-v1.1.0.apk`
- Size: **17.4 KB** (17,466 bytes)
- Package: `io.thegrid.worker`
- VersionCode: 2 · VersionName: 1.1.0
- minSdk: 24 (Android 7.0+) · targetSdk: 34 (Android 14)
- Signed: **APK Signature Scheme v2 + v3** (verified via `apksigner verify`)
- SHA-256: `81ff3b78a00781b42aff0b5d1ae53bf29441d6a9ae26e95acac7f12011beb13a`
- Download URL: <https://grid-supercomputer.preview.emergentagent.com/grid-worker-v1.1.0.apk>

## What it does

1. Launches `MainActivity`.
2. Loads `https://grid-supercomputer.preview.emergentagent.com/mobile` in a WebView.
3. The /mobile React page (already built) handles:
   - Login (`worker@thegrid.io / Worker@2026` or any Grid account)
   - Auto-registers the device with the detected tier (flagship/mid/budget)
   - Heartbeats every 5s (`/api/devices/heartbeat`)
   - Polls `/api/mining/config` for tasking
   - Requests + executes + submits compute tasks (`/api/tasks/request`, `/api/tasks/submit`)
   - Displays TGC balance, Power-Up button, Tier Forecast, withdrawal threshold (200 TGC = $10)

JavaScript, DOM storage, cookies, and third-party cookies are all enabled so the existing JWT auth (httpOnly cookies + `localStorage` token fallback) works identically to a desktop browser.

## Why a WebView wrapper rather than a fat-native APK?

The `/mobile` page is already a complete bank-grade Pi-style worker UI built in React. Re-implementing the full TGC counter, power-up flow, tier forecasting, login, heartbeat, and task pipeline in Kotlin/Java would be a multi-week effort that produces no behaviour the React page doesn't already deliver. The wrapper is the same architecture used by Twitter Lite, Trivago, and most "lite" apps. A fat-native rewrite is on the P2 backlog (Kotlin/RN/Flutter) once the simulated mining loop is replaced with a real Stratum native client.

## Build pipeline (reproducible inside the sandbox, arm64)

The Debian apt toolchain works on aarch64 — no x86_64 emulation is required.

```bash
apt-get install -y openjdk-17-jdk-headless aapt aapt2 apksigner zipalign \
  android-sdk android-sdk-build-tools

# android.jar (API 34 stubs) for compilation
curl -L https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar \
  -o /opt/android-sdk/platforms/android-34/android.jar

# d8.jar (pure-Java DEX compiler, arm64-compatible)
curl -L https://dl.google.com/android/repository/build-tools_r34-linux.zip -o /tmp/bt.zip
unzip -j /tmp/bt.zip "android-14/lib/d8.jar" -d /opt/android-sdk/build-tools/

# 1) compile resources + generate R.java
cd wrapper
aapt package -f -M AndroidManifest.xml -S res \
    -I /opt/android-sdk/platforms/android-34/android.jar \
    -F build/grid-unaligned.apk -J gen
mkdir -p gen/io/thegrid/worker && mv gen/R.java gen/io/thegrid/worker/

# 2) compile Java
javac -source 1.8 -target 1.8 -d build/classes \
      -cp /opt/android-sdk/platforms/android-34/android.jar \
      src/io/thegrid/worker/MainActivity.java gen/io/thegrid/worker/R.java

# 3) DEX
java -cp /opt/android-sdk/build-tools/d8.jar com.android.tools.r8.D8 \
     --release --min-api 24 \
     --lib /opt/android-sdk/platforms/android-34/android.jar \
     --output build/ $(find build/classes -name "*.class")

# 4) zip the dex into the APK, align, sign
cd build && cp grid-unaligned.apk grid-with-dex.apk
zip -j grid-with-dex.apk classes.dex
zipalign -p -f 4 grid-with-dex.apk grid-aligned.apk

keytool -genkeypair -keystore debug.keystore -alias androiddebugkey \
  -storepass android -keypass android -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=THE GRID, O=Emergent Labs, C=US"

apksigner sign --ks debug.keystore --ks-key-alias androiddebugkey \
  --ks-pass pass:android --key-pass pass:android \
  --v2-signing-enabled true --v3-signing-enabled true \
  --out grid-worker-signed.apk grid-aligned.apk

apksigner verify -v grid-worker-signed.apk

# 5) deploy
cp grid-worker-signed.apk /app/frontend/public/grid-worker-v1.1.0.apk
```

## Limitations / honest disclosures

- **WebView shell** — the on-device compute loop (`crypto.subtle` SHA-256) runs inside the WebView, identical to a Chrome tab on the same phone. Real native PoW would require a Stratum client (P2 backlog).
- **Debug keystore** — APK is signed with a self-signed debug certificate. For Play Store distribution you'd swap in a release keystore (the build pipeline above is identical otherwise).
- **No Foreground Service yet** — the manifest declares INTERNET / NETWORK_STATE / WAKE_LOCK only. A long-running mining service is on the backlog.
- **No background heartbeat when WebView is paused** — Android will pause WebView timers when backgrounded. A native heartbeat thread is on the backlog. For now, keep the app foregrounded while mining.

## Older Manifest+Gradle stubs

The `app/AndroidManifest.xml` and `app/build.gradle` files in the parent directory are scaffolding for a future fat-native client (declares `GridComputeService`, `TelemetryService`, `BootReceiver`). They are NOT used by the current real APK build — they remain as a reference target for the next iteration.
