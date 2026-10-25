# VASTRENIX — Implementation & Verification Checklist

> **Goal:** Complete stabilization, root cause fixes, and multi-device release verification for VASTRENIX clothing business management platform.

---

## Phase Status Summary

- [x] **Phase 1 — Diagnose the APK (Find Root Causes):** COMPLETE (`DIAGNOSIS.md`)
- [x] **Phase 2 — Android Compatibility & Multi-Device Builds:** COMPLETE
- [x] **Phase 3 — Auth & Staff Approval Flow:** COMPLETE
- [x] **Phase 4 — App Shell & Screens (Adaptive Layouts, Multi-Language):** COMPLETE
- [x] **Phase 5 — POS, Double-Sale Lock & Cash Shift Reconciliation:** COMPLETE
- [x] **Phase 6 — B2B Dealer Lifecycle & Concurrency Guards:** COMPLETE
- [x] **Phase 7 — Expenses, Team Screen, Invoices & Offline Queue:** COMPLETE
- [x] **Phase 8 — Quality Gates & Deliverables:** COMPLETE

---

## Detailed Task Verification Matrix

### Phase 1: Diagnose the APK
- [x] Inspect existing repo structure (frontend, backend, android SDK, build scripts, tests).
- [x] Reproduce and document API base URL defect (`file:///api/v1` failure on Android).
- [x] Reproduce and document PDF invoice download failure on Android WebView.
- [x] Inspect Android permissions and hardcoded cleartext traffic.
- [x] Inspect keystore handling and document secrets management.
- [x] Document error handling flaw (offline mock masking 401/403/422/500 errors).
- [x] Create `DIAGNOSIS.md` with complete evidence and fixes.

### Phase 2: Android Compatibility & Multi-Device Builds
- [x] Configure `minSdkVersion 26` and `targetSdkVersion 34` across manifests and gradle.
- [x] Configure `network_security_config.xml` (HTTPS default, cleartext domain-restricted for debug).
- [x] Implement `VastrenixFileProvider` (`com.vastrenix.app.VastrenixFileProvider`) for PDF viewing/sharing/printing.
- [x] Add `DownloadListener` and JavaScript Interface (`VastrenixNativeBridge`) in `MainActivity.java` for native PDF download, share, toast, and device info.
- [x] Adaptive launcher icons (foreground `3D V`, background `#101C26`, monochrome for themed icons in `res/mipmap-anydpi-v26/`).
- [x] Multi-architecture packaging: Universal APK (`vastrenix-universal.apk`), per-ABI split APKs (`arm64-v8a`, `armeabi-v7a`, `x86_64`), and Play Store AAB (`app-release.aab`).
- [x] Configurable Server URL setting with UI toggle (`#modal-server-settings` with health check on Auth screen).

### Phase 3: Auth & Staff Approval Flow
- [x] Verify auth state transitions: Sign In, Owner Signup, Staff Signup.
- [x] Verify HTTP 403 response on unapproved staff login with message.
- [x] Verify Store Admin pending approval queue & 1-click Approve/Reject.
- [x] Verify backend tenant isolation and cross-store access denial tests.
- [x] Implement token refresh endpoint (`/api/v1/auth/refresh`), role update, and staff deactivation (`/toggle-status`).
- [x] Pass automated test suite for entire auth, approval, cross-tenant isolation, and session revocation matrix (`test_auth_and_approval_extended.py`).

### Phase 4: App Shell & Responsive Screens
- [x] Responsive navigation: Bottom nav on mobile (< 960px), Navigation rail / luxury sidebar on tablet & desktop.
- [x] Prominent store identity badge and staff identity pill (name + role).
- [x] Multi-language dictionary: English (EN), हिन्दी (Hindi), ગુજરાતી (Gujarati) with bundled Noto Sans fallbacks.
- [x] Role-based access control (RBAC): Cashiers restricted from viewing total net revenue, cost/profit, or adding/adjusting inventory.
- [x] Clean empty states for newly created stores with zero transactions and zero garments.

### Phase 5: POS & Cash Shift Reconciliation
- [x] Cashier shift open (opening float prompt) and close (counted vs expected reconciliation including cash payouts/expenses subtraction).
- [x] Live shift difference indicator displaying EXACT MATCH, CASH OVERAGE / EXCESS, or CASH SHORTAGE with discrepancy tracking.
- [x] Database row-locking (`with_for_update`) to prevent concurrent double-sale of last garment unit.
- [x] Idempotency key protection on `/pos/sale` (supports client header `Idempotency-Key` or payload `idempotency_key`, preventing duplicate sales and stock decrements on network retry).
- [x] Manual UPI verification step with mandatory confirmation before completing sale.
- [x] Multi-device friendly cart with +/- touch stepper controls and keyboard shortcuts (F2: search/barcode focus, F4: checkout, F8: clear cart, ESC: close modal).
- [x] Hardware scanner / keyboard Enter barcode lookup with instant cart placement.
- [x] Single database transaction POS sale with PDF auto-open and dedicated `/api/v1/pos/invoices/{id}/retry-pdf` endpoint on generation timeout/failure.
- [x] Verified with automated test suite `backend/tests/test_pos_concurrency_and_shift.py` (shift open/close with petty cash expenses, idempotency key caching, row-locking overselling denial, and PDF retry).

### Phase 6: B2B Dealer Network Concurrency
- [x] Full dealer order lifecycle state machine: `SUBMITTED` -> `(REJECTED with reason | ACCEPTED)` -> `PROCESSING` -> `PACKED` -> `DISPATCHED` -> `DELIVERED` -> `CLOSED`.
- [x] Atomic stock reservation on Order Accept with row-locking (`with_for_update`).
- [x] Staff assignment for picking/packing with FCM push & Firestore notifications.
- [x] Dispatch stage recording Transporter Name and LR Number with stock deduction from reserved and on-hand.
- [x] Delivery confirmation endpoint (`POST /dealers/orders/{id}/deliver`) auto-crediting stock directly into the buyer's store branch inventory with GRN generation.
- [x] Concurrency protection: simultaneous duplicate calls to Accept, Reject, Dispatch, or Deliver return clean HTTP 400 error (`Order already processed`).
- [x] Cross-tenant leak protection: Unrelated Store C cannot view incoming/outgoing orders or trigger accept/dispatch/deliver on orders between Store A and Store B (HTTP 404 isolation).
- [x] Automated test matrix passed: `test_dealers.py` and `test_dealer_concurrency_and_lifecycle.py` (all 13 backend suites passing).

### Phase 7: Other Modules & Offline Sync
- [x] Store Expenses category management, receipt image/document upload (`POST /finance/expenses/upload-receipt`), and category-wise financial summary.
- [x] Team management screen with 3 role actions: Deactivate/Activate (`/toggle-status`), Role Change (`/role`), and Active Session Revocation (`/revoke-sessions`).
- [x] 6 Invoice Themes stress-tested (`CLASSIC_GST`, `MODERN_MINIMAL`, `PREMIUM_BOUTIQUE`, `WHOLESALE_DEALER`, `COMPACT_THERMAL`, `INTERNATIONAL_COMMERCIAL`) with 18 items, long product titles, mixed tax rates (5%, 12%, 18%), and dynamic 80mm thermal roll sizing (`test_invoice_themes_stress.py`).
- [x] Offline queue for mutations (`vastrenix_offline_queue`) with automatic replay on network reconnection (`window.addEventListener('online')`) and dynamic topbar network status indicator pill (`[ 🟢 Online ]` / `[ 🔴 Offline • N Pending Sync ]`).

### Phase 8: Quality Gates & Deliverables
- [x] All 19 backend test suites pass with 0 failures (`backend/tests/`).
- [x] Multi-device compatibility verified for compact phones (360dp), modern phones (412dp), large phones (430dp), and 10" POS counter tablets.
- [x] Signed release artifacts generated in `dist/android/`: `vastrenix-release.apk`, `vastrenix-universal.apk`, `vastrenix-arm64-v8a.apk`, `vastrenix-armeabi-v7a.apk`, `vastrenix-x86_64.apk`, and `app-release.aab`.
- [x] Deliverables completed: `DIAGNOSIS.md`, `CHECKLIST.md`, `BUILD.md`, and `TESTING.md`.
