#!/bin/bash
set -e

BUILD_TOOLS="./android-sdk/build-tools/34.0.0"
PLATFORM="./android-sdk/platforms/android-34/android.jar"
RES_DIR="dist/android/res"
MANIFEST="dist/android/AndroidManifest.xml"
BUILD_DIR="build/android"
DIST_DIR="dist/android"

echo "=== 1. Preparing directories ==="
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/compiled_res" "$BUILD_DIR/classes" "$BUILD_DIR/dex" "$BUILD_DIR/unaligned" "$BUILD_DIR/assets"

echo "=== 2. Compiling resources with aapt2 ==="
$BUILD_TOOLS/aapt2 compile --dir "$RES_DIR" -o "$BUILD_DIR/compiled_res.zip"

echo "=== 3. Packaging web assets & Google Services ==="
mkdir -p "$BUILD_DIR/assets/web"
cp -r frontend/web/* "$BUILD_DIR/assets/web/"
cp frontend/web/index.html "$BUILD_DIR/assets/"
cp -r frontend/web/static "$BUILD_DIR/assets/"
cp -r brand "$BUILD_DIR/assets/"
if [ -f "google-services.json" ]; then
    cp google-services.json "$BUILD_DIR/assets/"
fi

echo "=== 4. Linking resources with modern Android 14/15 SDK targets (minSdk=26, targetSdk=34) ==="
$BUILD_TOOLS/aapt2 link -o "$BUILD_DIR/unaligned/app-res.apk" \
    -I "$PLATFORM" \
    --min-sdk-version 26 \
    --target-sdk-version 34 \
    --version-code 2 \
    --version-name "1.0.1" \
    --manifest "$MANIFEST" \
    -A "$BUILD_DIR/assets" \
    "$BUILD_DIR/compiled_res.zip" \
    --auto-add-overlay

echo "=== 5. Compiling Java sources ==="
javac -cp "$PLATFORM" -d "$BUILD_DIR/classes" dist/android/src/main/java/com/vastrenix/app/MainActivity.java

echo "=== 6. Converting bytecode to classes.dex with d8 (min-api 26) ==="
$BUILD_TOOLS/d8 --output "$BUILD_DIR/dex/" --lib "$PLATFORM" --min-api 26 $BUILD_DIR/classes/com/vastrenix/app/*.class

echo "=== 7. Adding classes.dex to APK ==="
zip -u -j "$BUILD_DIR/unaligned/app-res.apk" "$BUILD_DIR/dex/classes.dex"

echo "=== 8. Zipalign APK to 4-byte boundaries ==="
$BUILD_TOOLS/zipalign -v -p 4 "$BUILD_DIR/unaligned/app-res.apk" "$BUILD_DIR/app-aligned.apk"

echo "=== 9. Signing APK with v2 and v3 schemes ==="
KEYSTORE="$DIST_DIR/vastrenix-release.keystore"
if [ ! -f "$KEYSTORE" ]; then
    keytool -genkeypair -v -keystore "$KEYSTORE" -alias vastrenix \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -storepass vastrenix123 -keypass vastrenix123 \
        -dname "CN=Vastrenix, OU=Mobile, O=Vastrenix Garments, L=Surat, S=Gujarat, C=IN"
fi

$BUILD_TOOLS/apksigner sign --ks "$KEYSTORE" \
    --ks-pass pass:vastrenix123 \
    --ks-key-alias vastrenix \
    --key-pass pass:vastrenix123 \
    --min-sdk-version 26 \
    --out "$DIST_DIR/vastrenix-release.apk" \
    "$BUILD_DIR/app-aligned.apk"

echo "=== 10. Verifying APK with apksigner ==="
$BUILD_TOOLS/apksigner verify --verbose "$DIST_DIR/vastrenix-release.apk"

echo "=== 11. Dumping badging to verify Android 14 & Android 15 compatibility ==="
$BUILD_TOOLS/aapt2 dump badging "$DIST_DIR/vastrenix-release.apk"

echo "SUCCESS: Installable Android APK compatible with Android 8 to Android 15+ built at: $DIST_DIR/vastrenix-release.apk"
ls -lh "$DIST_DIR/vastrenix-release.apk"
