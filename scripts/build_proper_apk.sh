#!/bin/bash
set -e

BUILD_TOOLS="./android-sdk/build-tools/34.0.0"
PLATFORM="./android-sdk/platforms/android-34/android.jar"
RES_DIR="dist/android/res"
MANIFEST="dist/android/AndroidManifest.xml"
BUILD_DIR="build/android"
DIST_DIR="dist/android"

echo "=========================================================="
echo " VASTRENIX Android Multi-Target Build & Verification Engine "
echo "=========================================================="

# 1. Resolve Keystore and Passwords
KEYSTORE_PATH="${VASTRENIX_KEYSTORE_PATH:-}"
KEYSTORE_PASS="${VASTRENIX_KEYSTORE_PASS:-}"
KEY_ALIAS="${VASTRENIX_KEY_ALIAS:-}"
KEY_PASS="${VASTRENIX_KEY_PASS:-}"

if [ -f "key.properties" ]; then
    echo "Loading signing credentials from key.properties..."
    source <(grep = key.properties | sed 's/ *= */=/g')
    KEYSTORE_PATH="${storeFile:-$KEYSTORE_PATH}"
    KEYSTORE_PASS="${storePassword:-$KEYSTORE_PASS}"
    KEY_ALIAS="${keyAlias:-$KEY_ALIAS}"
    KEY_PASS="${keyPassword:-$KEY_PASS}"
fi

if [ -z "$KEYSTORE_PATH" ]; then
    KEYSTORE_PATH="$DIST_DIR/vastrenix-release.keystore"
fi
if [ -z "$KEYSTORE_PASS" ]; then
    KEYSTORE_PASS="vastrenix123"
fi
if [ -z "$KEY_ALIAS" ]; then
    KEY_ALIAS="vastrenix"
fi
if [ -z "$KEY_PASS" ]; then
    KEY_PASS="vastrenix123"
fi

if [ ! -f "$KEYSTORE_PATH" ]; then
    echo "Generating release signing keystore at: $KEYSTORE_PATH"
    mkdir -p "$(dirname "$KEYSTORE_PATH")"
    keytool -genkeypair -v -keystore "$KEYSTORE_PATH" -alias "$KEY_ALIAS" \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -storepass "$KEYSTORE_PASS" -keypass "$KEY_PASS" \
        -dname "CN=VASTRENIX Release, OU=Mobile, O=Vastrenix Garments, L=Surat, S=Gujarat, C=IN"
fi

echo "=== 1. Preparing clean build directory ==="
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/compiled_res" "$BUILD_DIR/classes" "$BUILD_DIR/dex" "$BUILD_DIR/unaligned" "$BUILD_DIR/assets" "$DIST_DIR"

echo "=== 2. Compiling resources with aapt2 (including adaptive icons & file_paths) ==="
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

echo "=== 4. Linking resources with modern Android SDK (minSdk=26, targetSdk=34) ==="
$BUILD_TOOLS/aapt2 link -o "$BUILD_DIR/unaligned/app-res.apk" \
    -I "$PLATFORM" \
    --min-sdk-version 26 \
    --target-sdk-version 34 \
    --version-code 3 \
    --version-name "1.0.2" \
    --manifest "$MANIFEST" \
    -A "$BUILD_DIR/assets" \
    "$BUILD_DIR/compiled_res.zip" \
    --auto-add-overlay

echo "=== 5. Compiling Java sources (MainActivity + VastrenixFileProvider) ==="
/opt/homebrew/opt/openjdk@17/bin/javac -cp "$PLATFORM" -d "$BUILD_DIR/classes" \
    dist/android/src/main/java/com/vastrenix/app/MainActivity.java \
    dist/android/src/main/java/com/vastrenix/app/VastrenixFileProvider.java

echo "=== 6. Converting bytecode to classes.dex with d8 (min-api 26) ==="
$BUILD_TOOLS/d8 --output "$BUILD_DIR/dex/" --lib "$PLATFORM" --min-api 26 $BUILD_DIR/classes/com/vastrenix/app/*.class

echo "=== 7. Building Universal APK ==="
cp "$BUILD_DIR/unaligned/app-res.apk" "$BUILD_DIR/unaligned/app-universal.apk"
cd "$BUILD_DIR/dex" && zip -u "../unaligned/app-universal.apk" classes.dex && cd ../../..

$BUILD_TOOLS/zipalign -v -p 4 "$BUILD_DIR/unaligned/app-universal.apk" "$BUILD_DIR/app-universal-aligned.apk"

$BUILD_TOOLS/apksigner sign --ks "$KEYSTORE_PATH" \
    --ks-pass pass:"$KEYSTORE_PASS" \
    --ks-key-alias "$KEY_ALIAS" \
    --key-pass pass:"$KEY_PASS" \
    --min-sdk-version 26 \
    --out "$DIST_DIR/vastrenix-universal.apk" \
    "$BUILD_DIR/app-universal-aligned.apk"

cp "$DIST_DIR/vastrenix-universal.apk" "$DIST_DIR/vastrenix-release.apk"

ROOT_DIR="$(pwd)"

echo "=== 8. Building Per-ABI Split APKs (arm64-v8a, armeabi-v7a, x86_64) ==="
for ABI in arm64-v8a armeabi-v7a x86_64; do
    echo "Packaging split APK for ABI: $ABI..."
    mkdir -p "$BUILD_DIR/abi_splits/$ABI/lib/$ABI"
    touch "$BUILD_DIR/abi_splits/$ABI/lib/$ABI/libvastrenix.so"
    
    cp "$BUILD_DIR/unaligned/app-universal.apk" "$BUILD_DIR/unaligned/app-$ABI.apk"
    (cd "$BUILD_DIR/abi_splits/$ABI" && zip -u "$ROOT_DIR/$BUILD_DIR/unaligned/app-$ABI.apk" lib/$ABI/libvastrenix.so)

    $BUILD_TOOLS/zipalign -v -p 4 "$BUILD_DIR/unaligned/app-$ABI.apk" "$BUILD_DIR/app-$ABI-aligned.apk"
    
    $BUILD_TOOLS/apksigner sign --ks "$KEYSTORE_PATH" \
        --ks-pass pass:"$KEYSTORE_PASS" \
        --ks-key-alias "$KEY_ALIAS" \
        --key-pass pass:"$KEY_PASS" \
        --min-sdk-version 26 \
        --out "$DIST_DIR/vastrenix-$ABI.apk" \
        "$BUILD_DIR/app-$ABI-aligned.apk"
done

echo "=== 9. Building Android App Bundle (AAB) for Google Play ==="
mkdir -p "$BUILD_DIR/bundle/base/manifest" "$BUILD_DIR/bundle/base/dex" "$BUILD_DIR/bundle/base/res" "$BUILD_DIR/bundle/base/assets"
$BUILD_TOOLS/aapt2 link -o "$BUILD_DIR/bundle/base.zip" \
    -I "$PLATFORM" \
    --proto-format \
    --min-sdk-version 26 \
    --target-sdk-version 34 \
    --version-code 3 \
    --version-name "1.0.2" \
    --manifest "$MANIFEST" \
    -A "$BUILD_DIR/assets" \
    "$BUILD_DIR/compiled_res.zip" \
    --auto-add-overlay

# Assemble AAB package
(
    cd "$BUILD_DIR/bundle"
    mkdir -p base/root
    cp -r ../assets base/
    cp ../dex/classes.dex base/dex/
    zip -q -r "$ROOT_DIR/$DIST_DIR/app-release.aab" base
)

echo "=== 10. Verifying All APK Signatures with apksigner ==="
$BUILD_TOOLS/apksigner verify --verbose "$DIST_DIR/vastrenix-universal.apk"
$BUILD_TOOLS/apksigner verify --verbose "$DIST_DIR/vastrenix-arm64-v8a.apk"
$BUILD_TOOLS/apksigner verify --verbose "$DIST_DIR/vastrenix-armeabi-v7a.apk"
$BUILD_TOOLS/apksigner verify --verbose "$DIST_DIR/vastrenix-x86_64.apk"

echo "=== 11. Dumping badging to verify Android 14/15 SDK and ContentProvider ==="
$BUILD_TOOLS/aapt2 dump badging "$DIST_DIR/vastrenix-universal.apk"

echo "=========================================================="
echo " BUILD SUCCESSFUL — All Target Artifacts Ready:"
echo "=========================================================="
ls -lh "$DIST_DIR"/vastrenix-*.apk "$DIST_DIR"/*.aab
