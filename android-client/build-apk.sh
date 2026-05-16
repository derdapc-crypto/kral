#!/usr/bin/env bash
# Build script for THE GRID native Android worker APK (v1.3.7).
# Honest CLI-only pipeline — no Gradle, no Android Studio.
set -euo pipefail

cd "$(dirname "$0")/wrapper"

SDK=/opt/android-sdk
DEB_BT=/usr/bin
PLATFORM=$SDK/platforms/android-34/android.jar
D8_JAR=$SDK/build-tools/34.0.0/lib/d8.jar
VERSION="${VERSION:-1.4.10}"
OUT_NAME="grid-worker-v${VERSION}.apk"
OUT_DEST="/app/frontend/public/${OUT_NAME}"

# v1.3.7 — bundle librandomx.so when the GitHub Actions artifact is present.
# Path: /app/android-client/wrapper/jniLibs/arm64-v8a/librandomx.so
JNI_DIR="$(pwd)/jniLibs"
NATIVE_LIB="${JNI_DIR}/arm64-v8a/librandomx.so"

rm -rf build/classes build/gen build/grid-*.apk build/classes.dex
mkdir -p build/classes build/gen

# v1.5.4 — auto-sync AndroidManifest.xml versionName/versionCode with the
# VERSION env var so Settings → Apps → Grid Worker shows the correct version
# (Android installer reads versionName from manifest, not from filename).
VERSION_CODE="$(echo "$VERSION" | awk -F. '{ printf "%d%02d%02d", $1, $2, $3 }')"
sed -i -E "s|android:versionCode=\"[0-9]+\"|android:versionCode=\"${VERSION_CODE}\"|" AndroidManifest.xml
sed -i -E "s|android:versionName=\"[^\"]+\"|android:versionName=\"${VERSION}\"|"     AndroidManifest.xml
echo "[+] manifest versionName=${VERSION} versionCode=${VERSION_CODE}"

# 1. compile resources
$DEB_BT/aapt package -f -M AndroidManifest.xml -S res \
    -I "$PLATFORM" \
    -F build/grid-unaligned.apk -J build/gen
mkdir -p build/gen/io/thegrid/worker
[ -f build/gen/R.java ] && mv build/gen/R.java build/gen/io/thegrid/worker/R.java || true

# 2. compile Java
javac -source 1.8 -target 1.8 -d build/classes \
    -cp "$PLATFORM" \
    src/io/thegrid/worker/*.java \
    build/gen/io/thegrid/worker/R.java

# 3. DEX (pure Java tool — runs on any arch)
java -cp "$D8_JAR" com.android.tools.r8.D8 \
    --release --min-api 24 \
    --lib "$PLATFORM" \
    --output build/ $(find build/classes -name "*.class")

# 4. Add classes.dex to APK
cp build/grid-unaligned.apk build/grid-with-dex.apk
( cd build && zip -j -q grid-with-dex.apk classes.dex )

# 4b. v1.3.7 — bundle native library if present.
# v1.3.8 contract: librandomx.so is REQUIRED. The release named "Real Mobile
# Mining Worker" cannot ship a wrapper that has no native engine — that is
# the operator's explicit constitution. So we hard-fail when missing.
if [ ! -f "$NATIVE_LIB" ]; then
    cat <<EOF >&2

[FATAL] v1.3.8 build aborted — librandomx.so missing.

Expected path:
    $NATIVE_LIB

How to produce it:
    1. Push this repo to GitHub (Save to Github in chat input).
    2. Open the repo on github.com -> Actions tab.
    3. Run "build-librandomx-android-arm64" workflow.
    4. ~5-7 minutes later download the librandomx-arm64-v8a artifact.
    5. Unzip and drop librandomx.so at the path above.
    6. Re-run this build script.

This release ("Real Mobile Mining Worker") will NOT produce a connected-only
APK; that path was already shipped in v1.3.7. v1.3.8 is constitutionally
gated on the native engine being embedded.
EOF
    exit 99
fi

echo "[+] embedding librandomx.so ($(stat --format=%s "$NATIVE_LIB") bytes)"
rm -rf build/lib
mkdir -p build/lib/arm64-v8a
cp "$NATIVE_LIB" build/lib/arm64-v8a/librandomx.so
( cd build && zip -r -q grid-with-dex.apk lib )
NATIVE_FLAG="ON"
NATIVE_SHA=$(sha256sum build/lib/arm64-v8a/librandomx.so | cut -d' ' -f1)
echo "[+] native lib SHA-256: $NATIVE_SHA"

# 5. Align
$DEB_BT/zipalign -p -f 4 build/grid-with-dex.apk build/grid-aligned.apk

# 6. Sign with debug keystore (create if missing)
KS=build/debug.keystore
if [ ! -f "$KS" ]; then
    keytool -genkey -v \
        -keystore "$KS" \
        -storepass android -keypass android \
        -alias androiddebugkey -dname "CN=Android Debug,O=Android,C=US" \
        -keyalg RSA -keysize 2048 -validity 10000 >/dev/null 2>&1
fi

$DEB_BT/apksigner sign \
    --ks "$KS" --ks-key-alias androiddebugkey \
    --ks-pass pass:android --key-pass pass:android \
    --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
    --out "build/${OUT_NAME}" build/grid-aligned.apk

$DEB_BT/apksigner verify -v "build/${OUT_NAME}" >/dev/null
cp -f "build/${OUT_NAME}" "$OUT_DEST"

# Report
SIZE=$(stat --format=%s "$OUT_DEST")
SHA=$(sha256sum "$OUT_DEST" | cut -d' ' -f1)
echo
echo "=== APK BUILD OK ==="
echo "File   : $OUT_DEST"
echo "Version: $VERSION"
echo "Native : $NATIVE_FLAG"
echo "Size   : $SIZE bytes"
echo "SHA-256: $SHA"
