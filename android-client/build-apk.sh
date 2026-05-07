#!/usr/bin/env bash
# Build script for THE GRID native Android worker APK (v1.2.6).
# Honest CLI-only pipeline — no Gradle, no Android Studio.
set -euo pipefail

cd "$(dirname "$0")/wrapper"

SDK=/opt/android-sdk
# Debian-packaged tools are native arm64 binaries; Google's downloaded d8.jar
# is pure-Java so it runs on any arch. android.jar is data-only.
DEB_BT=/usr/lib/android-sdk/build-tools/debian
PLATFORM=$SDK/platforms/android-34/android.jar
D8_JAR=$SDK/build-tools/34.0.0/lib/d8.jar
VERSION="${VERSION:-1.2.6}"
OUT_NAME="grid-worker-v${VERSION}.apk"
OUT_DEST="/app/frontend/public/${OUT_NAME}"

rm -rf build/classes build/gen build/grid-*.apk build/classes.dex
mkdir -p build/classes build/gen

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
echo "Size   : $SIZE bytes"
echo "SHA-256: $SHA"
