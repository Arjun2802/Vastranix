# VASTRENIX FIXLOG-4 — DASHBOARD RESILIENCE, LOCALIZATION, PDF POPUP & CENTRALIZED BILL THEMES

**Date:** 2026-10-26  
**Target Release:** `vastrenix-release.apk` (v1.0.3, versionCode 4)  
**Verification Status:**
- Backend pytest test suite: 24 of 24 tests passing (100%)
- JavaScript syntax check: Complete file parsed with JavaScriptCore (`SYNTAX OK - ALL LINES PARSED SUCCESSFULLY`)
- Universal Release APK: Compiled, 4-byte zip-aligned, and dual-scheme cryptographically signed (`apksigner` v2 + v3 schemes verified)
- Output artifact: `vastrenix-release.apk` (root) & `dist/android/vastrenix-release.apk` (211 KB)

---

## 1. PART 1 — HOME/DASHBOARD SCREEN STUCK LOADING

### Root Causes
1. **Unbounded Blocking Fetch & Unhandled Exceptions in `renderDashboard()`:**
   Previously, `renderDashboard()` cleared the screen to a permanent skeleton loader, then issued `await api("/reports/dashboard")` (with the default 65-second timeout) without an outer `try...catch` block. If the network dropped, the server cold-start timed out, or a query returned a 500 error, the promise rejected or exited early (`if (!metrics) return;`), permanently stranding the user on the skeleton loader.
2. **Type Mismatch on Dues Array:**
   In `vastrenix.js`, the code called `Number(metrics.pending_credit_dues || 0)`. The backend actually returns an array of customer credit objects (`[{customer_id, customer_name, phone, total_dues}]`), causing `Number(...)` to evaluate to `NaN` and breaking string formatting.
3. **Timezone Offset Exception in Backend Database Queries (`backend/app/api/v1/reports.py`):**
   `get_dashboard_metrics` previously created `today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)`. When comparing against SQLite or PostgreSQL naive timestamp columns (`Sale.sale_date >= today_start`), SQLAlchemy threw `TypeError: can't compare offset-naive and offset-aware datetimes`.
4. **Brittle Sequential Sub-Queries:**
   Sub-queries for sales, low stock, dealer orders, and register shifts were executed in a single monolithic block without isolation. A failure or missing table in any one query broke the entire dashboard.

### Implementation & Architecture
1. **Backend Resilience (`backend/app/api/v1/reports.py`):**
   - Stripped timezone info: `today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=None)`.
   - Added robust branch resolution fallback: `branch = ctx.branch or db.query(Branch).filter(Branch.business_id == ctx.business.id).first()`.
   - Enclosed every independent sub-query in isolated `try...except` blocks with safe fallback defaults (`0`, `[]`).
2. **Immediate Non-Blocking Frontend DOM Shell (`frontend/web/static/js/vastrenix.js`):**
   - `renderDashboard()` now immediately paints the complete dashboard DOM shell: greeting, quick action buttons ("⚡ New Sale POS", "📦 Add Product", "📋 Invoices", "📊 Reports"), metric card placeholders, and the low-stock inventory table container.
3. **Strict 8-Second Timeout with Cache & Retry Banner:**
   - `/reports/dashboard` is requested with an explicit `timeout: 8000`.
   - On success, the response is persisted to `localStorage.setItem("vastrenix_dashboard_cache", ...)`.
   - If the live network request fails or times out, the dashboard automatically loads and displays cached metrics with an informative banner.
   - If no cached metrics exist, an inline alert with a **"⟳ Retry Dashboard"** button is displayed inside the card container without locking the screen.
4. **Non-Blocking Background Fetch for Pending Staff:**
   - The pending staff check (`/auth/pending-staff`) is now executed as an independent background promise with a 4-second timeout, completely decoupled from the metric cards.
5. **Robust Credit Dues Calculation:**
   - Calculated outstanding dues using safe array reduction:
     `duesTotal = Array.isArray(metrics.pending_credit_dues) ? metrics.pending_credit_dues.reduce((sum, d) => sum + (Number(d.total_dues) || 0), 0) : Number(metrics.pending_credit_dues || 0)`.

---

## 2. PART 2 — AUDIT & ELIMINATION OF HARDCODED STRINGS (LOCALIZATION GAPS)

### Audit Findings
Hardcoded English strings were identified across multiple screens and modals:
- **Add Garment Product Modal:** "Garment Product Name", "Category", "Size Type", "Standard Sizes (S, M, L, XL...)", "Fabric / Material", "Color / Shade", "Selling Price (₹)", "Cost Price (₹)", "Current Stock Qty", "Barcode / SKU", "Add Product".
- **Store Expenses Screen & Modal:** "Store Expenses", "Track daily operational costs & store overheads", "Log New Expense", "Search expenses...", "All Categories", "Expense Title", "Amount (₹)", "Expense Category", "Payment Method", "Expense Notes", "Record Expense".
- **Staff / Team Screen & Modal:** "Staff & Store Team", "Manage cashier logins, permissions, and staff accounts", "Staff Member", "Role / Access", "Assigned Counter", "Status", "Invite / Add Staff", "Full Name", "Email Address", "Phone Number", "Assigned Branch", "Security PIN / Password", "Save Staff Member".
- **Purchase Order Modal:** "Purchase Orders & Dealer POs", "Create purchase order for fabric / garments", "Select Garment Dealer / Mill", "Target Delivery Date", "Expected Order Items & Quantities", "Add Order Line", "Internal Order Notes", "Dispatch Purchase Order".
- **Receive Stock Inward Modal:** "Receive Garment Stock Inward", "Confirm delivery items, update inventory, and mark bills", "Select Dispatched PO", "Invoice / Bill Number from Dealer", "Received Items & Quantities", "Add Stock Item", "Supplier Bill Amount (₹)", "Confirm Stock Inward".
- **Shift Close Modal:** "Close Register Shift", "Summary of cash & card collected during this shift", "Closing Cash Counted (₹)", "Shift Notes / Variances", "Confirm Shift Close".
- **Empty States & Status Badges:** "No expenses recorded yet.", "No staff members found.", "No purchase orders created.", "Pending Approval", "Approved", "Active", "Inactive".

### Implementation & Translation Keys
1. **Added 90+ Comprehensive Keys Across English (`en`), Hindi (`hi`), and Gujarati (`gu`):**
   - Added exhaustive keys in `i18n.en`, `i18n.hi`, and `i18n.gu` in `vastrenix.js`.
   - Examples in Gujarati (`gu`):
     - `expenses_title`: "દુકાન ખર્ચાઓ"
     - `log_expense_btn`: "+ નવો ખર્ચ ઉમેરો"
     - `users_title`: "સ્ટાફ અને સ્ટોર ટીમ"
     - `add_staff_btn`: "+ નવો સ્ટાફ ઉમેરો"
     - `modal_add_product_title`: "નવો ગારમેન્ટ પ્રોડક્ટ ઉમેરો"
     - `modal_po_title`: "પરચેઝ ઓર્ડર બનાવો (ડીલર PO)"
     - `modal_receive_goods_title`: "માલ સ્ટોક ઇનવર્ડ મેળવો"
     - `modal_close_shift_title`: "કાઉન્ટર શિફ્ટ બંધ કરો"
2. **Updated Screens & Modals:**
   - Updated `renderExpenses()`, `renderUsers()`, and modal DOM generators to utilize `t(key, fallback)` exclusively.
   - Dynamic language switching through `setAppLanguage(lang)` immediately updates live UI components without requiring a full application restart.

---

## 3. PART 3 — SIMPLIFIED PDF VIEWING & ACTION POPUP

### Root Cause of In-App PDF Issues
Android WebViews (especially when rendering local `file:///` assets) do not bundle the desktop Google Chrome PDFium rendering plugin. Embedding PDFs via `<iframe src="blob:...#toolbar=1">` or `<object>` leads to blank gray rectangles or silent load failures.

### Implementation
1. **Simplified Action Modal (`#modal-invoice-viewer`):**
   - Replaced unreliable in-app `<iframe>` preview with an intuitive modal titled **"Invoice Document Ready"**.
   - Displays an Invoice Summary Card showing Invoice Number, Store Name, Customer Name, and Bill Total.
   - Includes a green verified badge: **"✓ PDF Compiled & Ready for Printing"**.
2. **Integrated Document Actions:**
   - **"👁️ View PDF (System Viewer)":**
     Uses `openInvoicePdfInNativeViewer()` to trigger the native Android `ACTION_VIEW` intent via `VastrenixFileProvider` (or opens a secure blob tab in standard browsers), launching the device's native PDF reader (Google Drive PDF Viewer, Adobe Acrobat, etc.).
   - **"💬 Share via WhatsApp":**
     Triggers `shareInvoicePdf()`, passing a Base64 PDF Data URL to `window.VastrenixNative.sharePdfUrl` to initiate the Android system share sheet pre-targeted for WhatsApp.
   - **"⎙ Download PDF":**
     Downloads the authenticated PDF blob directly to the user's local storage.
   - **"✕ Close":**
     Dismisses the popup cleanly.

---

## 4. PART 4 — INVOICE & BILL DESIGN CENTRALIZATION

### Root Cause
Theme definitions and previews were fragmented across multiple locations:
1. `posThemesData` array in POS settings.
2. `themesData` array in the Invoices screen.
3. Raw `<option>` tags in `index.html`.
4. Theme constants in `backend/app/services/invoice_renderer.py`.

Changes to theme styling or names required updating multiple files and risked out-of-sync presets.

### Implementation: `InvoiceThemeRegistry`
Created a single authoritative registry object in `frontend/web/static/js/vastrenix.js`:

```javascript
window.InvoiceThemeRegistry = {
  themes: [
    { id: "CLASSIC_GST", name: "Classic GST Standard", subtitle: "Official A4 / 3-inch format with full HSN/SAC & tax breakdown", ... },
    { id: "MODERN_MINIMAL", name: "Modern Minimal Clean", subtitle: "High-contrast clean layout for premium retail & designer wear", ... },
    { id: "PREMIUM_BOUTIQUE", name: "Premium Boutique Luxury", subtitle: "Navy & gold luxury branding with designer typography", ... },
    { id: "WHOLESALE_DEALER", name: "Wholesale & Fabric Dealer", subtitle: "Dual-column B2B format with ledger balance & terms", ... },
    { id: "COMPACT_THERMAL", name: "Thermal Roll (80mm / 58mm)", subtitle: "Ultra-fast ESC/POS thermal receipt format", ... },
    { id: "INTERNATIONAL_COMMERCIAL", name: "Export & Commercial", subtitle: "Multi-currency compliant export invoice", ... }
  ],
  getAll() { return this.themes; },
  get(themeId) { return this.themes.find(t => t.id === themeId) || this.themes[0]; },
  renderInvoiceCard(theme, isSelected, onClickFn) { ... },
  renderPOSThumbnail(theme, isSelected) { ... },
  renderCarouselCard(theme, isSelected) { ... }
};
```

- **POS Quick Selector:** Uses `InvoiceThemeRegistry.renderPOSThumbnail()` to render thumbnails dynamically.
- **Invoices Carousel & Settings:** Uses `InvoiceThemeRegistry.renderCarouselCard()` and `renderInvoiceCard()`.
- **In-App Visual Preview:** Generates the invoice visual card directly from `InvoiceThemeRegistry.get(themeId)`.
- **Elimination of Redundancy:** Completely removed ad-hoc `posThemesData` and `themesData` duplicates.

---

## 5. BUILD & VERIFICATION SUMMARY

| Verification Step | Result |
| :--- | :--- |
| **Backend Pytest Suite** | **24 / 24 passed (100%)** |
| **Frontend JavaScriptCore Check** | **SYNTAX OK — all lines parsed successfully** |
| **Android ZipAlign** | **4-byte alignment verified (OK)** |
| **Signature Verification (apksigner)** | **v2 scheme: TRUE, v3 scheme: TRUE** |
| **Output Artifacts** | `vastrenix-release.apk` (Root, 211 KB) & `dist/android/vastrenix-release.apk` |
