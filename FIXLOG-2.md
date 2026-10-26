# VASTRENIX — CONNECTION STABILITY, POS REDESIGN, PAYMENTS & INVOICE FIXLOG (PART 1–9)

**Date**: 25-Oct-2026  
**Build Status**: Verified Release Universal APK Built (`vastrenix-release.apk`, Version Code 4, Version Name 1.0.3)  
**Signing Status**: Cryptographically signed & verified using Android v2 & v3 Signature Schemes (`apksigner verify --verbose`)  
**Backend Test Suite**: 24/24 Tests Passing (100% pytest suite, SQLite/PostgreSQL compliant)  

---

## Executive Summary of Deliverables

| Part | Issue / Feature Area | Classification | Root Cause / Architecture Decision | Status |
|---|---|---|---|---|
| **Part 1** | Stop Continuous Reconnection on Tab/App Switch | Bug Fix | Strict 1.8s timeout in `api()` unconditionally invoked `showColdStartOverlay()`. No lifecycle pausing was handled when the app backgrounded, creating retry cascades. | **RESOLVED** |
| **Part 2** | Proper Refresh on Invoices Screen | Feature Build | Invoices list lacked an explicit user-facing refresh trigger and had no error recovery state when network lagged. | **RESOLVED** |
| **Part 3** | Remove Dummy/Seed Data Bug | Bug Fix | Offline fallback `handleOfflineMock` returned `offlineDB.inventory` (containing demo Silk Sarees) unconditionally whenever network failed or on offline mode. Backend branch resolution also defaulted to demo branch 1 if tenant had no branch. | **RESOLVED** |
| **Part 4** | POS Screen Redesign (Billing-First Flow) | Feature Build | Previous POS placed Customer inputs and Theme selectors below the cart items, slowing down counter checkout. Theme selector was a bulky vertical select. | **RESOLVED** |
| **Part 5** | Items Catalog: Debounced Search & Inline Steppers | Feature Build | Cashiers had to navigate back and forth to add or adjust quantities. Search was triggered on every keystroke without debouncing. | **RESOLVED** |
| **Part 6** | UPI Payment Flow (QR → Paid → UTR Capture) | Feature Build | POS sale with UPI lacked dynamic merchant QR generation and optional UTR/reconciliation number capture before invoice generation. | **RESOLVED** |
| **Part 7** | In-App PDF Viewing & Native Sharing | Bug Fix & Feature Build | Clicking PDF attempted to launch external Android apps via `Intent.ACTION_VIEW` without `<queries>` package visibility in Android 11+, crashing or failing silently on devices without a dedicated PDF viewer app. | **RESOLVED** |
| **Part 8** | Store Credit: Customer Details & Month-End Reminder | Feature Build & Bug Fix | Cashiers could post Store Credit without attaching customer records. Receivables were untracked for month-end reconciliation. | **RESOLVED** |
| **Part 9** | Custom Ad-Hoc Item Showing ₹0 Line Total | Bug Fix | Cart line rows lacked explicit subtotal calculation display and custom items lacked a dedicated modal/input handler, leading to ₹0 fallthrough. | **RESOLVED** |

---

## Detailed Part-by-Part Analysis & Implementation

### PART 1 — Stop Continuous Reconnection on Tab/App Switch
- **Root Cause**:
  1. `api()` had a rigid 1.8s timer that unconditionally popped up the cold-start modal overlay (`showColdStartOverlay()`) even when the Render backend was already warm (`isServerWarm = true`), causing repeated flicker when switching tabs.
  2. The Android `MainActivity` did not implement `onPause()` or `onResume()` on the native Activity or WebView. When the user switched away to another app and returned, timers and fetch requests continued unabated or fired simultaneously upon return.
- **Fix Implemented**:
  1. **Native Android Lifecycle**: Added `onPause()` and `onResume()` in [`MainActivity.java`](file:///Users/codekajugad/Desktop/Vastranix/dist/android/src/main/java/com/vastrenix/app/MainActivity.java#L248-L268). Calls `webView.onPause()`/`webView.onResume()` and evaluates `window.onAppBackground()` / `window.onAppResume()`.
  2. **JavaScript Lifecycle & Exponential Backoff**: In [`vastrenix.js`](file:///Users/codekajugad/Desktop/Vastranix/frontend/web/static/js/vastrenix.js#L80-L150), added `visibilitychange` listener and `isAppInBackground` state. Backgrounding instantly cancels cold start timers and pauses polling. Resuming throttles refresh requests (only checks if >30s elapsed) and applies exponential backoff ($2\text{s} \times 2^n$, capped at 60s) if the connection test fails.
  3. **Cold Start Overlay Suppression**: In `api()`, cold-start banner display is suppressed when `isServerWarm === true` or when `options.silent === true`.
- **Verification**:
  - Rapidly switched tabs (Dashboard → POS → Invoices → Inventory → POS) 15+ times; zero cold-start flickers, requests resume cleanly.

---

### PART 2 — Proper Refresh on Invoices Screen
- **Root Cause**:
  - Invoices view only had a "+ New POS Sale" button in the header. If an invoice had just been posted or synced in the background, users had no way to trigger a re-fetch without reloading the entire app.
- **Fix Implemented**:
  1. Added `↻ Refresh Invoices` button in the Invoices header in [`vastrenix.js`](file:///Users/codekajugad/Desktop/Vastranix/frontend/web/static/js/vastrenix.js).
  2. Implemented `refreshInvoices(force)` which displays the table skeleton loader while querying `GET /api/v1/pos/invoices`.
  3. Added an error state banner with a "Retry Fetch" button in case of network timeout.
- **Verification**:
  - Verified `refreshInvoices()` re-fetches records from `/pos/invoices` and displays skeleton loading state during transit.

---

### PART 3 — Remove Dummy/Seed Data Bug
- **Root Cause**:
  1. In [`frontend/web/static/js/vastrenix.js`](file:///Users/codekajugad/Desktop/Vastranix/frontend/web/static/js/vastrenix.js), `handleOfflineMock()` returned `offlineDB.inventory` and `offlineDB.products` (containing demo Pure Mulberry Silk Sarees) for *any* failed API request or offline fallback, regardless of who was logged in.
  2. In [`backend/app/api/v1/inventory.py`](file:///Users/codekajugad/Desktop/Vastranix/backend/app/api/v1/inventory.py) and [`products.py`](file:///Users/codekajugad/Desktop/Vastranix/backend/app/api/v1/products.py), `target_branch_id` defaulted to hardcoded `1` (the demo branch) when `ctx.branch` was null.
- **Fix Implemented**:
  1. **Strict Mock Isolation**: `handleOfflineMock` now explicitly checks:
     ```javascript
     const isDemoStore = (state.user && state.user.email === "demo@vastrenix.com") || (state.business && Number(state.business.id) === 1);
     ```
     For real stores, it returns empty arrays `[]` (and 0 for metrics). Demo products never leak into real tenant accounts.
  2. **Multi-Tenant Branch Resolution**: In `inventory.py`, `products.py`, and `pos_billing.py`, queries find the actual branch belonging to `ctx.business.id`.
- **Verification**:
  - Validated that non-demo accounts receive strictly empty lists `[]` when no items exist.

---

### PART 4 — POS Screen Redesign (Billing-First Flow)
- **Design & Workflow**:
  1. **Customer Details First**: Customer Name and Mobile No. fields are positioned prominently at the very top of the POS panel. Cashiers can enter details immediately or skip for walk-ins.
  2. **Compact Invoice Theme Picker**: Replaced bulky dropdown with a compact horizontal thumbnail row (`.pos-theme-mini-row`). Renders mini-styled card previews for all 6 themes (`Classic GST`, `Modern Minimal`, `Premium Boutique`, `Wholesale & Dealer`, `Compact Thermal`, `Global Commercial`).
  3. **Segmented Payment Mode Selector**: Fast touch-friendly pill buttons (`[Cash]` `[UPI QR]` `[Card]` `[Split]` `[Store Credit]`) pre-selecting the tenant's default mode.
  4. **Settings Modal Option**: Added "Default POS Payment Mode" dropdown in Store Settings (`#modal-store-settings`), persisting choice to `localStorage.vastrenix_default_payment_mode`.
- **Verification**:
  - Tested default mode switching between Cash and UPI. Default persists across restarts and renders appropriately in the segmented control.

---

### PART 5 — Items Catalog: Debounced Search & Inline Stepper
- **Features Implemented**:
  1. **Debounced Search (~250ms)**: Catalog search input `#pos-search` uses `handlePOSSearchInput()` with a 250ms debounce timer across name, fabric, SKU, color, and size.
  2. **Inline Quantity Steppers on Item Cards**:
     - When an item is not in the cart: displays `+ Add` button.
     - When an item is in the cart (qty > 0): displays inline `[-] [qty] [+]` controls directly on the catalog item card (`.pos-inline-stepper`).
     - Cashier can adjust quantities directly from the catalog without switching context.
  3. **Real-Time Synchronization**: Tapping `+` or `-` in either the catalog card or cart updates both views and recalculates totals instantly.
- **Verification**:
  - Stepped quantity up to 4 directly from catalog card; confirmed cart items and totals reflect 4 units in real-time.

---

### PART 6 — UPI Payment Flow (QR → Paid → UTR Capture)
- **Flow**:
  1. Cashier selects "UPI QR" and taps "Complete Sale".
  2. `#modal-upi-payment` opens displaying:
     - Exact grand total (`₹X.XX`).
     - Store's UPI VPA (`storename@upi`).
     - Dynamically generated UPI QR code encoding:
       `upi://pay?pa={vpa}&pn={store}&am={amount}&cu=INR&tn=POS+Sale`
  3. Cashier taps **"✓ Customer Has Paid"**:
     - Modal expands to show the optional UTR input: `"UPI UTR / Reference No. (Optional for reconciliation)"`.
     - Two actions available: **"Confirm & Print Invoice"** (saves UTR) or **"Skip UTR"** (proceeds without UTR).
  4. Backend captures the reference in `Payment.reference_number` and `POSSaleCreateSchema.transaction_reference`.
- **Verification**:
  - Completed UPI sale with test UTR `429381920394`. Confirmed payment record captures reference and posts invoice atomically.

---

### PART 7 — In-App PDF Viewing & Native Sharing
- **Root Cause**:
  1. `MainActivity.java` attempted to launch external PDF viewer apps via `Intent.ACTION_VIEW` without declaring `<queries>` in `AndroidManifest.xml` (required by Android 11+ package visibility rules). On devices without third-party PDF viewers (like Adobe Reader), this threw `ActivityNotFoundException` or silently failed.
  2. There was no in-app fallback or native OS share sheet action.
- **Fix Implemented**:
  1. **AndroidManifest `<queries>`**: Declared intent filters for `android.intent.action.VIEW` and `android.intent.action.SEND` for `application/pdf`.
  2. **In-App PDF Viewer Modal**: Injected `#modal-invoice-viewer` with header, embedded iframe preview, and action buttons.
  3. **Native Android Share Bridge**:
     - Implemented `@JavascriptInterface public void sharePdfUrl(String pdfUrl, String fileName)` in `MainActivity.java`.
     - Writes PDF bytes to application cache directory, creates a `content://` URI via `VastrenixFileProvider`, grants URI read permissions, and launches native Android chooser (`Intent.ACTION_SEND`).
     - Web fallback uses `navigator.share()` API.
  4. Unified all PDF access points (`openInvoicePdf`, `retryInvoicePdf`, and sale completion) to launch `viewInvoiceInApp()`.
- **Verification**:
  - Generated invoice, triggered PDF view inside app modal, tapped "Share Invoice (WhatsApp)" to trigger native OS share sheet with verified URI permissions.

---

### PART 8 — Store Credit: Customer Details & Month-End Reminder
- **Implementation**:
  1. **Customer Details Mandatory**: In `completePOSSale()`, selecting `CREDIT` or `STORE_CREDIT` enforces non-empty Customer Name and Mobile Number. Sale is blocked with an alert if either is missing.
  2. **Outstanding Receivable Record**: Backend `backend/app/api/v1/pos_billing.py` automatically resolves or creates the `Customer` record by phone number.
  3. **Month-End Reminder Calculation**:
     - Backend calculates exact calendar month end date (`calendar.monthrange(now.year, now.month)`).
     - Inserts a reminder record into `Notification` table:
       `"Store credit receivable ₹X.XX due from {cust_name} ({cust_phone}) by {due_date}"`.
  4. **Dashboard Surface**:
     - `get_dashboard_metrics` calculates `pending_credit_dues`.
     - Dashboard displays a dedicated Month-End Credit Dues card and alert banner when dues are outstanding.
- **Verification**:
  - Tested POS sale under Store Credit without customer name; correctly halted. Completed sale with valid customer; confirmed month-end due date recorded and surfaced in dashboard metrics.

---

### PART 9 — Custom Ad-Hoc Item Showing ₹0 Line Total
- **Root Cause**:
  1. `renderCartItems()` displayed `item.price` but had no explicit line total element (`item.price * item.quantity`).
  2. Custom items had no variant ID in `state.products`, causing lookups to fall through to undefined/0.
  3. There was no user interface to add ad-hoc line items.
- **Fix Implemented**:
  1. Added `+ Custom Item` button in the POS catalog header opening `#modal-pos-custom-item`.
  2. Implemented `submitCustomItem(event)` which captures Item Description, Unit Price, and Quantity, creating an ad-hoc cart item with generated SKU `AD-HOC-XXXX`.
  3. In `renderCartItems()`, added explicit line total:
     ```javascript
     const lineTotal = (Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2);
     // Renders: Line Total: ₹{lineTotal}
     ```
  4. In `updateCartTotals()`, subtotal, 5% GST tax, and grand total compute `item.price * item.quantity` safely without catalog lookups.
  5. In backend `backend/app/api/v1/pos_billing.py`, `item.variant_id = None` is handled cleanly (skips stock deduction while creating authoritative invoice item).
- **Verification**:
  - Added a catalog saree (₹3,490) + Custom Alteration item (₹250 × 2 = ₹500). Cart displays `Line Total: ₹500.00`, Subtotal `₹3,990.00`, GST `₹199.50`, Grand Total `₹4,189.50` (never ₹0).

---

## Build Verification Evidence

```bash
=== 9. Signing with apksigner (v2 & v3 schemes) ===
=== 10. Cryptographic Signature Verification ===
Verifies
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
Verified using v3.1 scheme (APK Signature Scheme v3.1): false
Verified using v4 scheme (APK Signature Scheme v4): false
Verified for SourceStamp: false
Number of signers: 1

=== 11. Inspecting Package Manifest & Badging ===
package: name='com.vastrenix.app' versionCode='4' versionName='1.0.3' platformBuildVersionName='14' platformBuildVersionCode='34' compileSdkVersion='34' compileSdkVersionCodename='14'
sdkVersion:'26'
targetSdkVersion:'34'
application-label:'VASTRENIX'

BUILD SUCCESSFUL — Universal Release APK Ready:
-rw-r--r--@ 1 codekajugad  staff   171K Oct 25 18:01 dist/android/vastrenix-release.apk
-rw-r--r--@ 1 codekajugad  staff   171K Oct 25 18:01 vastrenix-release.apk
```

```bash
======================== 24 passed, 5 warnings in 8.60s ========================
```
