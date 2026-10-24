# VASTRENIX — Implementation & Verification Checklist

> **Goal:** Complete stabilization, root cause fixes, and multi-device release verification for VASTRENIX clothing business management platform.

---

## Phase Status Summary

- [x] **Phase 1 — Diagnose the APK (Find Root Causes):** COMPLETE
- [x] **Phase 2 — Android Compatibility & Multi-Device Builds:** COMPLETE
- [ ] **Phase 3 — Auth & Staff Approval Flow:** READY TO START
- [ ] **Phase 4 — App Shell & Screens (Adaptive Layouts, Multi-Language):** NOT STARTED
- [ ] **Phase 5 — POS, Double-Sale Lock & Cash Shift Reconciliation:** NOT STARTED
- [ ] **Phase 6 — B2B Dealer Lifecycle & Concurrency Guards:** NOT STARTED
- [ ] **Phase 7 — Expenses, Team Screen, Invoices & Offline Queue:** NOT STARTED
- [ ] **Phase 8 — Quality Gates & Smoke Test Run:** NOT STARTED

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
- [ ] Verify auth state transitions: Sign In, Owner Signup, Staff Signup.
- [ ] Verify HTTP 403 response on unapproved staff login with message.
- [ ] Verify Store Admin pending approval queue & 1-click Approve/Reject.
- [ ] Verify backend tenant isolation and cross-store access denial tests.

### Phase 4: App Shell & Responsive Screens
- [ ] Responsive navigation: Bottom nav on mobile (< 960px), Navigation rail / luxury sidebar on tablet & desktop.
- [ ] Prominent store identity and staff badge.
- [ ] Language toggle: EN, हिन्दी (Hindi), ગુજરાતી (Gujarati) with bundled fonts.
- [ ] Role-based access control (RBAC): Hide financial metrics/profit from sales/cashier roles.

### Phase 5: POS & Cash Shift Reconciliation
- [ ] Cashier shift open (opening float prompt) and close (counted vs expected reconciliation).
- [ ] Database row-locking (`with_for_update`) to prevent concurrent double-sale of last garment unit.
- [ ] Idempotency key protection on `/pos/sale`.
- [ ] Manual UPI verification step before finalizing sale.
- [ ] PDF auto-open and retry fallback.

### Phase 6: B2B Dealer Network Concurrency
- [ ] Atomic stock reservation on Order Accept.
- [ ] Staff assignment for picking/packing.
- [ ] Dispatch with LR number and transporter details.
- [ ] Delivery receipt automatically incrementing buyer inventory.
- [ ] Concurrency tests: double-accept, double-dispatch, cross-tenant access.

### Phase 7: Other Modules & Offline Sync
- [ ] Store Expenses category management and financial reporting integration.
- [ ] Team management screen (role updates, deactivation, session revocation).
- [ ] 6 Invoice Themes verified with long names, GST details, 80mm thermal, and A4.
- [ ] Offline queue for draft operations with sync indicators.

### Phase 8: Quality Gates & Deliverables
- [ ] All `pytest` suites pass (including concurrency, permissions, and shifts).
- [ ] Multi-device emulator/device verification (small phone 360dp, mid phone, large phone, tablet).
- [ ] Signed release artifacts generated (`vastrenix-universal.apk`, per-ABI APKs, `app-release.aab`).
- [ ] Deliverables: `DIAGNOSIS.md`, `CHECKLIST.md`, `BUILD.md`, `TESTING.md`.
