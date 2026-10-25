# VASTRENIX — Build & Release Engineering Guide

## 1. System Overview & Architecture
VASTRENIX ("Your Business, Beautifully in Sync.") is a mission-critical clothing business ERP system supporting point-of-sale counter operations, garment inventory tracking with Fabric/Color/Size variants, multi-theme GST invoices, B2B wholesale dealer order pipelines, and multi-lingual UI (English, हिन्दी, ગુજરાતી).

The application is deployed across:
1. **FastAPI Backend**: Python 3.9+ / 3.11+, SQLAlchemy ORM with row-level locks (`with_for_update`), Decimal arithmetic, JWT authentication, and automated database migrations.
2. **Offline-First Responsive Web Frontend**: HTML5/CSS3/ES6+ client embedded directly inside the Android application shell as well as accessible via modern web browsers.
3. **Android Application (API 26–34+)**: Native Java/Android wrapper providing edge-to-edge layout, `VastrenixFileProvider` for scoped-storage-compliant PDF invoice viewing, hardware barcode keyboard & camera scanning, and offline-durable transaction synchronization.

---

## 2. Prerequisites & Toolchain Setup

### 2.1 Backend Dependencies
- **Python**: Python 3.9+ or Python 3.11+
- **Virtual Environment**: `.venv`
- **Required Libraries**:
  ```bash
  pip install fastapi uvicorn sqlalchemy reportlab qrcode pydantic pydantic-settings python-jose[cryptography] passlib[bcrypt] python-multipart pytest
  ```

### 2.2 Android Build Prerequisites
- **Android SDK**: API Level 26 (Android 8.0 Oreo) through API Level 34 (Android 14) / 35 (Android 15).
  - Environment variable: `ANDROID_HOME` or `ANDROID_SDK_ROOT` set to Android SDK path (e.g. `/Users/<user>/Library/Android/sdk`).
- **Build Tools**: Version `34.0.0` or newer:
  - `aapt2`: Android Asset Packaging Tool 2
  - `d8`: Dex compiler (min-api 26)
  - `zipalign`: 4-byte archive boundary alignment
  - `apksigner`: APK Signature Scheme v2 & v3 signing
- **Java Development Kit**: OpenJDK 17 or JDK 21 (`javac`, `keytool`, `jar`).

---

## 3. Production Keystore Generation

> **IMPORTANT SECURITY RULE**: Production keystores, private keys, and passwords must NEVER be checked into the source repository. All keystores are stored outside the source tree, and credentials are provided via environment variables or git-ignored configuration.

To generate a new release signing keystore:
```bash
keytool -genkeypair -v \
  -keystore ~/.android/vastrenix-release.keystore \
  -alias vastrenix \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=Vastrenix ERP, OU=Release Eng, O=Vastrenix, L=Surat, ST=Gujarat, C=IN"
```

Configure build environment variables:
```bash
export VASTRENIX_KEYSTORE_PATH="$HOME/.android/vastrenix-release.keystore"
export VASTRENIX_KEYSTORE_PASS="your-secure-keystore-password"
export VASTRENIX_KEY_ALIAS="vastrenix"
export VASTRENIX_KEY_PASS="your-secure-key-password"
```

---

## 4. Building the Application

### 4.1 Running Backend Locally
```bash
# Start backend server with SQLite or PostgreSQL
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4.2 Automated Android Multi-Target Build
Execute the multi-device build automation engine:
```bash
bash scripts/build_proper_apk.sh
```

### 4.3 Build Pipeline Steps Executed:
1. **Resource Compilation (`aapt2 compile`)**:
   Compiles adaptive launcher icons (`res/mipmap-anydpi-v26/ic_launcher.xml`), `ic_launcher_monochrome.xml`, `file_paths.xml`, and `network_security_config.xml`.
2. **Asset Packaging**:
   Bundles web client, brand SVG assets (3D teal chiseled 'V' with gold ribbon), and Firebase configuration into `assets/`.
3. **Resource Linking (`aapt2 link`)**:
   Links resources against `android.jar` (API 34) enforcing `minSdkVersion: 26` and `targetSdkVersion: 34`.
4. **Bytecode Compilation (`javac`)**:
   Compiles `MainActivity.java` and `VastrenixFileProvider.java` into Java class bytecode.
5. **DEX Compilation (`d8`)**:
   Transforms `.class` files into optimized `classes.dex` targeting `min-api 26`.
6. **Universal APK Packaging & Alignment (`zipalign -p 4`)**:
   Assembles `vastrenix-universal.apk` and `vastrenix-release.apk` for universal device sideloading.
7. **Per-ABI Split APKs**:
   Assembles architecture-optimized APKs for `arm64-v8a`, `armeabi-v7a`, and `x86_64` (emulator).
8. **Android App Bundle (`aab`)**:
   Constructs Google Play Store submission package `app-release.aab`.
9. **Cryptographic Signing (`apksigner`)**:
   Signs all packages using APK Signature Scheme v2 and v3.
10. **AAPT Verification (`aapt dump badging`)**:
    Validates manifest package `com.vastrenix.app`, target SDK 34, permissions, and ContentProvider declarations.

---

## 5. Output Artifacts Directory (`dist/android/`)

| Artifact Name | Target Architecture | Purpose | Size |
|---|---|---|---|
| `vastrenix-release.apk` | Universal (all ABIs) | Primary release sideload APK | ~127 KB |
| `vastrenix-universal.apk` | Universal (all ABIs) | Universal device installer | ~127 KB |
| `vastrenix-arm64-v8a.apk` | 64-bit ARM | Modern Android smartphones (Android 9–15) | ~131 KB |
| `vastrenix-armeabi-v7a.apk` | 32-bit ARM | Legacy budget Android devices (Android 8.0+) | ~131 KB |
| `vastrenix-x86_64.apk` | 64-bit x86 | Android Studio emulators & ChromeOS | ~131 KB |
| `app-release.aab` | Google Play Dynamic | Google Play Store publication bundle | ~117 KB |

---

## 6. Device Sideloading & Verification

### Install on Connected Device or Emulator:
```bash
# For modern 64-bit Android phone:
adb install -r dist/android/vastrenix-arm64-v8a.apk

# For generic testing:
adb install -r dist/android/vastrenix-release.apk
```

### Inspect Live Logcat:
```bash
adb logcat -s VastrenixNative:V Chromium:V
```
