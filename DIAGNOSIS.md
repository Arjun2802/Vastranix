# VASTRENIX — System Diagnosis & Root Cause Analysis

**Date:** 2026-10-24  
**Project:** VASTRENIX (Clothing Business ERP, Inventory, Billing & Commerce)  
**Scope:** APK Stability, Multi-Device Compatibility, Network & Native WebView Integration  

---

## 1. Executive Summary

A comprehensive forensic inspection of the codebase, compiled APK bytecode (`classes.dex`), Android manifest, and client JavaScript runtime was conducted. 

While the backend architecture and unit tests are robust, the compiled Android APK was critically compromised by five foundational defects:
1. **Unreachable API URL on Native Devices:** The client frontend defaulted to relative path `/api/v1`, resolving to `file:///api/v1` on Android, failing all network traffic.
2. **Error Masking via Offline Mock:** Network and HTTP errors (401, 403, 422, 500) were silently trapped by a fallback mock, preventing real staff authentication, server-side tenant isolation, and approval error alerts from reaching the user.
3. **No PDF Download or Intent Handling in WebView:** Invoices could not be opened, downloaded, or shared on Android devices due to missing `DownloadListener`, missing `FileProvider`, and relative URL invocation on `<a target="_blank">`.
4. **Hardcoded Keystore & Insecure Cleartext Traffic:** Signing credentials were hardcoded in shell scripts and stored directly in repository paths, while `usesCleartextTraffic="true"` lacked a production-grade `network_security_config`.
5. **Missing Multi-Architecture & Adaptive Device Support:** The build produced only an un-split APK without adaptive icons, ProGuard keep rules, or ABI-optimized splits.

---

## 2. Root Cause Findings & Technical Evidence

### Issue 1: API Base URL Resolution on Android Devices
* **Evidence:** In `frontend/web/static/js/vastrenix.js` (Lines 3–5):
  ```javascript
  const API_BASE = (window.location.protocol === "file:" || !window.location.host) 
    ? "/api/v1" 
    : "/api/v1";
  ```
* **Impact:** When the app runs inside Android WebView from `file:///android_asset/web/index.html`, every API call resolves to `file:///api/v1/...`. Android WebView cannot resolve `file://` network endpoints and throws `ERR_FILE_NOT_FOUND`. Furthermore, the user had no mechanism to specify a LAN IP (`http://192.168.1.X:8000`) or production HTTPS endpoint.
* **Fix Applied:**
  - Introduce configurable `API_BASE` that checks `localStorage.getItem("vastrenix_server_url")`.
  - Provide an "Advanced / Server Settings" modal accessible on the login screen.
  - Support environment build-time injection defaulting to production HTTPS (`https://api.vastrenix.com/api/v1`) or configurable dev/staging endpoints.

---

### Issue 2: Offline Mock Masking Authentication & Permission Errors
* **Evidence:** In `frontend/web/static/js/vastrenix.js` (Lines 180–198):
  ```javascript
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, ...);
    ...
  } catch (err) {
    console.warn("API request fallback to offline mock for:", endpoint);
    return handleOfflineMock(endpoint, options);
  }
  ```
* **Impact:** Any failed network request or HTTP 403 / 422 response silently dropped into `handleOfflineMock()`. The mock returned a dummy token and auto-logged in as "Ramesh Patel (Store Owner)". Consequently:
  - Unapproved staff never saw HTTP 403 `"Your account is pending approval by the Store Administrator."`
  - Real tenant isolation errors and schema validation errors were masked.
* **Fix Applied:**
  - Clearly distinguish between genuine network offline state (e.g. `!navigator.onLine` or fetch connection refusal) and HTTP server response errors (401, 403, 422, 500).
  - Explicitly propagate HTTP error messages (`err.detail`) to user-facing modals/toasts.
  - Restrict offline mock exclusively to a safe read-only preview mode when explicitly enabled.

---

### Issue 3: Inability to Download, View, or Share PDF Invoices
* **Evidence:** Bytecode analysis via `apkanalyzer dex packages dist/android/vastrenix-release.apk` confirmed that `classes.dex` only contained:
  - `com.vastrenix.app.MainActivity`
  - `com.vastrenix.app.MainActivity$1` (WebChromeClient console logger)
  - `com.vastrenix.app.MainActivity$2` (WebViewClient page logger)
* **Missing Components:**
  - No `android.webkit.DownloadListener`.
  - No `androidx.core.content.FileProvider` or custom ContentProvider.
  - In `vastrenix.js`, invoice links used `<a href="/api/v1/pos/invoices/${inv.id}/pdf" target="_blank">` and `window.open(..., "_blank")`, which fail silently in standard Android WebView without multi-window support.
* **Fix Applied:**
  - Implement a native Android JavascriptInterface (`VastrenixNativeBridge`) in `MainActivity.java` equipped with `downloadAndOpenPdf(String pdfUrl, String fileName)`.
  - Register an Android `FileProvider` in `AndroidManifest.xml` with `res/xml/file_paths.xml` granting secure content URIs (`content://com.vastrenix.app.fileprovider/...`).
  - Trigger `Intent.ACTION_VIEW` and `Intent.ACTION_SEND` with `FLAG_GRANT_READ_URI_PERMISSION` so invoices open in any standard PDF viewer (Google Drive PDF viewer, Acrobat) or share via WhatsApp/Email.

---

### Issue 4: Android Manifest, Cleartext Security & Keystore Management
* **Evidence:**
  - `dist/android/AndroidManifest.xml` hardcoded `android:usesCleartextTraffic="true"` without a `networkSecurityConfig`.
  - `scripts/build_proper_apk.sh` generated a keystore inside the working directory with hardcoded password `vastrenix123`.
* **Fix Applied:**
  - Create `dist/android/res/xml/network_security_config.xml` permitting cleartext only for local debugging IPs (`10.0.2.2`, `127.0.0.1`, and configurable local subnets), enforcing strict HTTPS for all remote domains.
  - Remove hardcoded keystore credentials. Read keystore path and passwords from environment variables (`VASTRENIX_KEYSTORE_PATH`, `VASTRENIX_KEYSTORE_PASS`, `VASTRENIX_KEY_ALIAS`) or a git-ignored `key.properties`.

---

### Issue 5: Device Resolution, Adaptive Icons & Build Outputs
* **Evidence:**
  - Launcher icon was only defined as a single `drawable/ic_launcher.xml` rather than adaptive mipmaps.
  - Build script produced a single monolithic APK with no architecture splits (arm64-v8a, armeabi-v7a, x86_64) and no Android App Bundle (`.aab`).
* **Fix Applied:**
  - Configure adaptive icons with foreground (`3D V`), background (`#101C26`), and monochrome layer.
  - Implement build pipelines for:
    1. `dist/android/vastrenix-universal.apk` (universal sideloadable)
    2. Per-ABI split packages (`arm64-v8a`, `armeabi-v7a`, `x86_64`)
    3. Production Android App Bundle (`app-release.aab`)

---

## 8. Root Cause: APK Stuck on Initial Launch Screen ("Initializing business workspace...")

### Evidence & Diagnosis:
1. **JavaScript Syntax Error in `vastrenix.js`:**
   Running JavaScriptCore CLI on `frontend/web/static/js/vastrenix.js` revealed:
   ```
   SyntaxError: Unexpected identifier 'value' at frontend/web/static/js/vastrenix.js:2058
   ```
   **Cause:** Duplicate closure and template string termination at line 2046–2049 (`\`; } \`; }`). Because this syntax error halted parsing inside the Android WebView, the JavaScript engine never executed `renderApp()`. The WebView displayed only the static HTML splash fallback inside `<div id="app">` ("*Initializing business workspace...*").

2. **Blocking Startup Network Call:**
   `renderApp()` had `await loadPublicStores();` blocking `root.innerHTML` rendering before the Sign-In screen appeared. When running on a standalone mobile device with no backend reachable at startup, this blocked UI rendering indefinitely.

3. **Unhandled WebView Dialog Freezes:**
   `MainActivity.java` did not implement `onJsAlert` and `onJsConfirm` in `WebChromeClient`. In Android WebViews, unhandled JS alerts can freeze the UI rendering thread.

### Solution Applied:
1. Fixed the duplicate template literal closing tags in `frontend/web/static/js/vastrenix.js`. Verified 100% syntax and execution cleanliness across all 2300+ lines using headless JavaScriptCore.
2. Refactored `renderApp()` to render the Auth Hub instantly using local defaults (`offlineDB.stores`), deferring `loadPublicStores()` to an asynchronous background task.
3. Added `document.readyState` check (`complete` / `interactive`) so `renderApp()` runs immediately even if `DOMContentLoaded` already fired before the script finished.
4. Overrode `onJsAlert` and `onJsConfirm` in `MainActivity.java` with native `AlertDialog.Builder` to prevent any dialog locking.
5. Rebuilt and re-signed the single universal release APK (`vastrenix-release.apk`) and all ABI targets via `scripts/build_proper_apk.sh`.

