# THE GRID — Native Android Worker Client

Build deliverables for the **real signed APK** that fixes the "parsing error"
seen with the placeholder build.

## Why the placeholder fails on real devices

The web/preview build at `/grid-worker-v1.0.0.apk` is a metadata-only zip used
to validate the download flow. It is **not signed**, contains no real DEX, and
is not packaged for `arm64-v8a` / `armeabi-v7a`. Android 8+ rejects it with a
"package parsing error" — that is the expected behaviour.

To produce an installable APK you need an Android Studio toolchain plus your
release keystore. The files in this folder are the exact production-ready
inputs.

## Files

- `app/build.gradle` — Gradle module. Pinned `minSdk 26` (Android 8.0),
  `targetSdk 34` (Android 14), `abiFilters arm64-v8a, armeabi-v7a`,
  v1+v2+v3+v4 signing schemes, splits + universal APK.
- `app/src/main/AndroidManifest.xml` — Permissions for INTERNET,
  FOREGROUND_SERVICE, WAKE_LOCK, ACCESS_NETWORK_STATE, POST_NOTIFICATIONS,
  ACCESS_COARSE_LOCATION (optional). Declares `GridComputeService`,
  `TelemetryService`, and `BootReceiver`.

## Hard-coded server config

`buildConfigField` in Gradle pins the backend so end users never configure
anything:

```
GRID_API_BASE = "https://grid-supercomputer.preview.emergentagent.com/api"
GRID_WS_URL   = "wss://grid-supercomputer.preview.emergentagent.com/api/ws"
GRID_MASTER_ID = "117423210"
```

## Build instructions (CI or local)

1. Install Android Studio (latest stable) + Android SDK 34.
2. Generate a release keystore once:
   ```
   keytool -genkeypair -v -keystore release.keystore \
       -alias thegrid -keyalg RSA -keysize 4096 -validity 10000
   ```
3. Export credentials so Gradle can sign:
   ```
   export GRID_KEYSTORE=$(pwd)/release.keystore
   export GRID_KEYSTORE_PASSWORD='<store-pw>'
   export GRID_KEY_ALIAS=thegrid
   export GRID_KEY_PASSWORD='<key-pw>'
   ```
4. Build:
   ```
   ./gradlew assembleRelease
   ```
5. Upload `app/build/outputs/apk/release/app-universal-release.apk` (or the
   per-ABI variants) to your CDN and bump `/api/apk/version` to match.

## Mining client expected behaviour

On every 5 second tick, the worker calls:

```
GET /api/mining/config?device_id=<uuid>
Authorization: Bearer <user_jwt>
```

Response includes `mode`, `coin`, `algo`, `stratum_url`, `port`, `worker_id`.
The client routes accordingly:

| `mode`            | Action                                                    |
|-------------------|-----------------------------------------------------------|
| `enterprise_job`  | Fetch a unit from `POST /api/tasks/request`. Run it.      |
| `baseline_mining` | Open Stratum to `stratum_url:port`, login as `worker_id`. |
| `idle`            | Park the worker. Heartbeat only. Kill switch is engaged.  |

The client must **stop immediately** when `current_mode` flips to `idle` so
the kill switch is honoured network-wide.

## Realtime telemetry

`TelemetryService` opens a single WebSocket to:

```
wss://grid-supercomputer.preview.emergentagent.com/api/ws/admin/telemetry?token=<admin_token>
```

(Worker reporting WS is the same pattern but lives at
`/api/ws/worker/heartbeat` — implement when you replace the polling-based
`/api/devices/heartbeat`.)

## Note

Source code for the Activities / Services is **not** included here. The
existing browser implementation in `/app/frontend/src/pages/Mobile.jsx` is the
behavioural reference: poll `/mining/config`, send heartbeats with hashrate +
algo + thermal + location, run the same compute-task loop. Port that loop to
Kotlin + your preferred miner SDK to ship a competitive PoW client.
