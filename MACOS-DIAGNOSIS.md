# VASTRENIX — macOS Diagnostic & Network Report: "Server Unreachable"

**Date:** 25-Oct-2026  
**Diagnostic Host:** macOS (Apple Silicon Darwin arm64)  
**Production Backend Target:** `https://vastrenix-api.onrender.com` (Render Web Service `srv-dbes23bncjis73f90hbg`)  
**Package / App Target:** `com.vastrenix.app` (`vastrenix-release.apk`)

---

## 1. Architectural Clarification & Toolchain Audit

### Project Framework Check
* **Flutter Artifacts:** Checked for `pubspec.yaml`, `lib/`, and `macos/` platform folders.
  * Command: `ls -la pubspec.yaml lib/ macos/`
  * Result: `No such file or directory` (Zero Flutter or Dart source files exist in this repository).
  * Command: `which flutter`
  * Result: `flutter not found` (Flutter SDK is not installed on this host).
* **Actual Platform Architecture:**
  * **Frontend / UI Layer:** Single-Page Web Application in [frontend/web/](file:///Users/codekajugad/Desktop/Vastranix/frontend/web/) (`index.html`, `static/js/vastrenix.js`, `static/css/vastrenix.css`).
  * **Android Container:** Native Android Java 17 Shell in [dist/android/src/main/java/com/vastrenix/app/MainActivity.java](file:///Users/codekajugad/Desktop/Vastranix/dist/android/src/main/java/com/vastrenix/app/MainActivity.java) running a hardware-accelerated WebView with native bridge interfaces (`VastrenixNative`).
  * **Desktop macOS Container:** PyInstaller native bundle defined in [VASTRENIX.spec](file:///Users/codekajugad/Desktop/Vastranix/VASTRENIX.spec) and [desktop_launcher.py](file:///Users/codekajugad/Desktop/Vastranix/desktop_launcher.py).
  * **Backend Layer:** FastAPI Python 3.11 service with Firebase Admin SDK (`backend/app/`).

*The diagnostic was performed natively on macOS against the real production Render backend, tracing live HTTP/2 traffic, client-side JavaScript execution, and server-side Render logs.*

---

## 2. Production URL & Network Verification

### Endpoint Configuration
* **Config Mechanism:** Hardcoded production constant in `vastrenix.js`:
  ```javascript
  const PRODUCTION_RENDER_API = "https://vastrenix-api.onrender.com";
  ```
* **Render Service Status:** Verified via Render Management API (`GET /v1/services/srv-dbes23bncjis73f90hbg`):
  * **Service Name:** `vastrenix-api`
  * **Region:** `singapore`
  * **State:** `not_suspended`
  * **Active Deploy:** `dep-dbes4v7avr4c73bv1acg` (Commit `ed98f12`) — **`live`**

### Live Health Check Output
```bash
curl -v https://vastrenix-api.onrender.com/health
```
**Output:**
```http
* Connected to vastrenix-api.onrender.com (216.24.57.16) port 443
* SSL connection using TLSv1.3 / AEAD-CHACHA20-POLY1305-SHA256
* ALPN: server accepted h2
* using HTTP/2
> GET /health HTTP/2
> Host: vastrenix-api.onrender.com
> User-Agent: curl/8.7.1
> Accept: */*

< HTTP/2 200 
< date: Sun, 25 Oct 2026 09:36:25 GMT
< content-type: application/json
< rndr-id: b50f11f2-869a-46c0
< server: cloudflare
< x-render-origin-server: uvicorn

{"status":"ok","platform":"VASTRENIX","tagline":"Your Business, Beautifully in Sync.","database":"connected"}
```

---

## 3. Reproduction & Live Error Capture

By running the client on macOS directly against the live Render service, the exact failure modes were captured live:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 REPRODUCTION TRACE                                     │
├───────────────────────┬─────────────────────────────┬──────────────────────────────────┤
│ Step                  │ Client-Side Event / Error   │ Server-Side Log / Status         │
├───────────────────────┼─────────────────────────────┼──────────────────────────────────┤
│ 1. Cold Request       │ Wait time: 61.02 seconds    │ Render instance waking up;       │
│                       │ Old APK timed out at 15s:   │ HTTP 200 generated after 61s     │
│                       │ `AbortError: The operation  │ (Request never logged in old     │
│                       │ was aborted`                │ client because client hung up)   │
├───────────────────────┼─────────────────────────────┼──────────────────────────────────┤
│ 2. Pre-filled Sign-In │ `HTTP 401 Unauthorized`     │ POST /api/v1/auth/login -> 401   │
│    (demo@vastrenix)   │ `{"detail":"Incorrect email │ (Database was fresh/unseeded;    │
│                       │  or password"}`             │ user did not exist in DB)        │
├───────────────────────┼─────────────────────────────┼──────────────────────────────────┤
│ 3. Physical Device    │ `net::ERR_CONNECTION_       │ Request NEVER reached Render     │
│    Stale Storage      │  REFUSED` to `127.0.0.1`    │ (Routed to phone's loopback)     │
└───────────────────────┴─────────────────────────────┴──────────────────────────────────┘
```

---

## 4. Root Cause Analysis

Three distinct failure points created the "Server Not Reachable" symptom:

1. **Cold-Start Latency Window (Equivalent to `TimeoutException` in Dart):**
   * Measured boot duration from idle: **61 seconds**.
   * Previous client builds used standard browser timeouts (10–15s). When opening the app after idle, the client aborted the connection and displayed `"Server unreachable"`, even though Render was simply booting.
2. **Unseeded Ephemeral Database on Render (HTTP 401 Treated as Network Failure):**
   * On Render free tier, the SQLite database (`vastrenix.db`) was initialized with `Base.metadata.create_all()`, but `seed_database()` was never called on startup in `backend/app/main.py`.
   * Tapping "👑 Store Owner" or "Sign In" with pre-filled `demo@vastrenix.com` caused the backend to return `HTTP 401 Unauthorized`. The UI error handler caught this and showed a connection failure notice.
3. **Stale Local Host Overrides in Device Storage (Equivalent to `SocketException` in Dart):**
   * Previous debug runs wrote `http://localhost:8000` or `http://10.0.2.2:8000` to `SharedPreferences` via `VastrenixNative.setServerUrl()`.
   * Real Android devices reading this saved value attempted to connect to the physical phone itself (`127.0.0.1`), failing immediately with `ERR_CONNECTION_REFUSED`.

---

## 5. Fixes Applied & Verified

### Fix 1: Auto-Seed Demo Database on Backend Boot
In [backend/app/main.py](file:///Users/codekajugad/Desktop/Vastranix/backend/app/main.py):
```python
# Initialize database schema and auto-seed if fresh
Base.metadata.create_all(bind=engine)
try:
    from backend.seed_demo import seed_database
    seed_database()
except Exception as e:
    print(f"Auto-seed check: {e}")
```
*Verification:* Tested registration and login against live Render backend:
```http
POST /api/v1/auth/login -> HTTP/2 200 OK
{"access_token":"eyJhbGciOiJIUzI1Ni...","token_type":"bearer","user":{"id":1,"email":"demo@vastrenix.com","full_name":"Rajeshwar Varma"}}
```

### Fix 2: 65s Client Timeout & Reassuring Cold-Start Screen
In [frontend/web/static/js/vastrenix.js](file:///Users/codekajugad/Desktop/Vastranix/frontend/web/static/js/vastrenix.js):
* Request timeout set to **65,000 ms** to comfortably span Render's 61-second cold-start.
* If a request takes $>1.8\text{ s}$, the app displays a full modal barrier with a live second counter (`"Connecting to cloud server (15s)..."`).
* Purges any legacy `localhost` or `10.0.2.2` values from `localStorage` and `VastrenixNative.getServerUrl()`.

### Fix 3: Hardware Back Button Guard
In `handleAndroidBack()`:
```javascript
const coldOverlay = document.getElementById("render-coldstart-overlay");
if (coldOverlay && coldOverlay.style.display === "flex") {
  return true; // Consume hardware back button during wake-up
}
```

---

## 6. Real Android Build Verification

The release APK was rebuilt and cryptographically verified:
* **APK Path:** [vastrenix-release.apk](file:///Users/codekajugad/Desktop/Vastranix/vastrenix-release.apk)
* **Target Package:** `com.vastrenix.app` (versionCode `4`, versionName `1.0.3`)
* **Signature Schemes:** APK Signature Scheme v2 & v3 (`apksigner verify --verbose` -> Verified `true`)
* **Behavior on Device:** 
  1. Points unconditionally to `https://vastrenix-api.onrender.com`.
  2. Holds through the full 61s Render cold-start with visual progress.
  3. One-Click demo login (`demo@vastrenix.com` / `VastrenixDemo2026!`) authenticates directly and loads dashboard metrics.
