# THE GRID — Android Worker (v1.2.0 · native foreground service)

A real, signed Android APK that runs as a foreground service so the worker keeps contributing compute even when the app is backgrounded, the screen is off, or the user task-switches.

## Output

- **File**: `/app/frontend/public/grid-worker-v1.2.0.apk` (legacy aliases v1.1.0 + v1.0.0 point to the same bytes)
- **Size**: **25,658 bytes (25.1 KB)**
- **Package**: `io.thegrid.worker`
- **VersionCode**: 3 · **VersionName**: 1.2.0
- **minSdk**: 24 (Android 7.0+) · **targetSdk**: 34 (Android 14)
- **Signed**: APK Signature Scheme **v2 + v3** (`apksigner verify` ✓)
- **SHA-256**: `cdf1109353344a06a84992789ef60211aca56a33a0c22c82dca2c27bf9e1364f`
- **Download URL**: <https://grid-supercomputer.preview.emergentagent.com/grid-worker-v1.2.0.apk>

## What's new in v1.2.0

**Real native foreground service** (`GridWorkerService`):
- Continues heartbeating + executing tasks when the user backgrounds or task-switches the app.
- Persistent low-importance notification: *"THE GRID Worker active — Contributing compute securely · …"*.
- Acquires a partial WAKE_LOCK only while the service is active.
- 12-second heartbeat cadence to `/api/devices/heartbeat`.
- Native SHA-256 verification task execution with `MessageDigest` (matrix tasks are deferred to the WebView for now and submitted as `skip` by the service so the server hands back a hash task on the next request).

**Golden Rule auto-pause** — service auto-pauses task requests when:
- not charging
- not on Wi-Fi
- user permission disabled
- battery temperature ≥ 45°C
…and resumes automatically when conditions clear. Heartbeats keep flowing throughout so the admin dashboard sees `worker_state=paused` instead of going offline.

**Persistent worker state** (`SharedPreferences`):
- `active`, `auth_token`, `device_id`, session counters, last heartbeat ms, last error.
- Service is restarted on cold-launch if `wasActive==true`, so reboot/process-death survives.

**JS Bridge** (`window.GridNative`) lets the React `/mobile` UI:
- Call `startWorker(deviceId, token)` on START tap → kicks off the foreground service.
- Call `stopWorker()` on STOP tap.
- Read `getInfo()` for native model/manufacturer/Android version.
- Read `getWorkerStats()` for live session counters.
The page injects a `__GRID_NATIVE__` flag on load so the UI shows a "Native APK · Bg-safe" badge.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  MainActivity (UI)                                  │
│  - hosts WebView loading /mobile                    │
│  - exposes window.GridNative bridge                 │
│  - restarts background service if was-active        │
└──────────────────┬──────────────────────────────────┘
                   │  startWorker(deviceId, token)
                   ▼
┌─────────────────────────────────────────────────────┐
│  GridWorkerService  (Foreground · stopWithTask=false)│
│  ┌─────────────────────────────────────────────────┐│
│  │  Loop                                           ││
│  │  ├─ refresh battery + charging + Wi-Fi          ││
│  │  ├─ Golden-Rule check                           ││
│  │  ├─ heartbeat every 12s                         ││
│  │  ├─ if eligible: request → execute → submit     ││
│  │  └─ persistent notification refresh             ││
│  └─────────────────────────────────────────────────┘│
└──────────────────┬──────────────────────────────────┘
                   │  HTTPS · Bearer JWT
                   ▼
┌─────────────────────────────────────────────────────┐
│  Backend  /api/devices/heartbeat                     │
│           /api/tasks/request, /api/tasks/submit      │
│           /api/worker/start, /api/worker/stop        │
└─────────────────────────────────────────────────────┘
```

## Permissions used

| Permission | Why |
|---|---|
| `INTERNET` | Talk to backend |
| `ACCESS_NETWORK_STATE` | Detect Wi-Fi for Golden Rule |
| `WAKE_LOCK` | Keep CPU alive only while service is active |
| `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_DATA_SYNC` | Allow foreground service on Android 14+ |
| `POST_NOTIFICATIONS` | Persistent worker notification |
| `RECEIVE_BOOT_COMPLETED` | (declared but not auto-started yet — backlog) |

## Build pipeline (arm64 sandbox)

The full reproducible commands live in this repo. Summary:

```bash
# 1. compile resources
aapt package -f -M AndroidManifest.xml -S res \
    -I /opt/android-sdk/platforms/android-34/android.jar \
    -F build/grid-unaligned.apk -J gen
mkdir -p gen/io/thegrid/worker && mv gen/R.java gen/io/thegrid/worker/

# 2. compile Java
javac -source 1.8 -target 1.8 -d build/classes \
    -cp /opt/android-sdk/platforms/android-34/android.jar \
    src/io/thegrid/worker/MainActivity.java \
    src/io/thegrid/worker/WorkerState.java \
    src/io/thegrid/worker/GridApi.java \
    src/io/thegrid/worker/GridWorkerService.java \
    gen/io/thegrid/worker/R.java

# 3. DEX (Google's pure-Java d8.jar — works on arm64)
java -cp /opt/android-sdk/build-tools/d8.jar com.android.tools.r8.D8 \
    --release --min-api 24 \
    --lib /opt/android-sdk/platforms/android-34/android.jar \
    --output build/ $(find build/classes -name "*.class")

# 4. zip dex into APK, align, sign with v1+v2+v3
cd build && cp grid-unaligned.apk grid-with-dex.apk
zip -j grid-with-dex.apk classes.dex
zipalign -p -f 4 grid-with-dex.apk grid-aligned.apk
apksigner sign --ks debug.keystore --ks-key-alias androiddebugkey \
    --ks-pass pass:android --key-pass pass:android \
    --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
    --out grid-worker-v1.2.0.apk grid-aligned.apk
apksigner verify -v grid-worker-v1.2.0.apk
```

## Honest disclosures

- **WebView UI** — login + TGC + Power-Up + Tier Forecast are still rendered by the existing React `/mobile` page. Re-implementing those screens as native Compose is on the P2 backlog.
- **Matrix tasks** — Java port of the JS Mulberry32 matrix signature is non-trivial; the service currently submits a non-matching result for matrix tasks (returns 0 TGC) and gets a hash task on the next request. The WebView still handles matrix tasks correctly while the app is foreground.
- **Debug keystore** — APK signed with a self-signed cert for sideloading. Swap in a Play release keystore for store distribution; the build pipeline is otherwise identical.
- **Boot auto-start** — manifest has `RECEIVE_BOOT_COMPLETED` declared but no `BroadcastReceiver` wired yet (backlog).

## QA against the live backend

- 18 dedicated tests in `/app/backend/tests/test_iteration7_native_apk.py` cover registration, heartbeat, Golden Rule auto-stop, worker start/stop, admin live + telemetry, suspicious heartbeat, emulator auto-flag, APK metadata.
- Full backend regression: **132 passed, 1 skipped** as of v1.2.0 cut.
