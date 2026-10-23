# VASTRENIX

**"Your Business, Beautifully in Sync."**  
*Clothing Business ERP, Multi-Branch Inventory, POS Billing, Dealer Network & Commerce Platform*

---

## 1. Executive Summary & Design System

VASTRENIX is an enterprise-grade, cross-platform clothing business management platform built for garment retailers, boutiques, manufacturers, distributors, and connected multi-dealer networks. It bridges modern SaaS clarity with textile craftsmanship aesthetics:

- **Warm Editorial SaaS Aesthetic:** Eliminates harsh AI-style neon accents and generic marketplace clip-art in favor of warm ivory surfaces (`#FAF8F3`), deep ink navy (`#192B3A`), balancing soft teal (`#218C82`), muted amber (`#D99A43`), and soft coral (`#D96F65`).
- **Tabular Numerals & High Legibility:** Prices, SKU codes, rack locations, and tax totals maintain strict alignment.
- **Multilingual Support:** English, Hindi (हिन्दी), and Gujarati (ગુજરાતી).

### Brand Assets

- **Primary Logo:** `brand/vastrenix-logo-light.svg`
- **Dark Surface Logo:** `brand/vastrenix-logo-dark.svg`
- **Monochrome Thermal / Stamp:** `brand/vastrenix-logo-monochrome.svg`
- **App & Favicon Mark:** `brand/vastrenix-icon.svg` & `brand/favicon.svg`
- **Brand Guidelines:** `brand/brand-guidelines.md`

---

## 2. Core Modules

### 1. Garment Catalog & Variant Matrix
- Textile garment attributes: Fabric, Material, Pattern, Season, Gender, Fit, HSN/SAC (`6205`, `6203`, etc.), Tax Rate.
- Size & Color matrix with individual SKU, Barcode, Retail Price, Wholesale Price, and Dealer Price.
- Multi-location stock breakdown: On-Hand, Reserved, Available, In-Transit, Damaged, and Rack Location.

### 2. Low-Stock & Reorder Intelligence
- Real-time evaluation at the variant and location level.
- Automated generation of in-app alerts and notifications when available stock falls below safety thresholds.

### 3. POS Sales Billing & Six Built-in Invoice Themes
- Barcode lookup, variant picker, split discounts, taxes, and customer balances.
- Real-time stock deduction with server-side validation.
- Direct PDF generation and interactive HTML previews across **6 configurable themes**:
  1. **Classic GST:** Tax invoice with HSN breakdown, CGST/SGST/IGST, terms.
  2. **Modern Minimal:** Editorial typography, minimal lines, and UPI QR code.
  3. **Premium Boutique:** Luxury serif headings, atelier details, return policy.
  4. **Wholesale & Dealer:** Compact matrix with size columns, pack counts, transport LR.
  5. **Compact Thermal:** High-contrast 80mm/58mm POS receipt.
  6. **International Commercial:** Multi-currency, export terms, country of origin.

### 4. Cashier Shift & Cash Management
- Cashier shift open/close workflow with automatic calculation of expected cash from sales.
- Reconciliation recording exact, shortage, or excess differences.
- Business expense logging and net cash flow reporting.

### 5. Connected Dealer B2B Network
- End-to-end lifecycle: `Draft` → `Submitted` → `Accepted` (atomic stock reservation) → `Dispatched` (LR transport tracking) → `Delivered` (stock increment at buyer branch) → `Closed`.

### 6. Staff Self-Signup & Store Admin Approval Workflow
- **Public Store Directory:** Prospective staff can pick their store from available businesses during registration.
- **Pending Approval Gate:** When staff registers, their account is placed into `PENDING_APPROVAL` status. Attempting to log in before approval returns:
  `"Your staff account is currently pending approval by the Store Administrator of '<Store Name>'."`
- **Store Admin Panel:** Store owners/admins have a dedicated **"Pending Staff Approvals"** banner where they can review candidate full name, email, phone, requested role, and click **"Approve Staff"** or **"Reject"**.
- **Prominent Store Identity for Staff:** Once logged in, the application prominently showcases the Store Name in both the top navigation bar and sidebar card:
  `Store: Surat Flagship Store • Staff: Pooja Sharma (CASHIER)`

---

## 3. Native Mac & Android Builds Ready

| Platform | Build Artifact Location | Description |
| :--- | :--- | :--- |
| **macOS Native App** | [`dist/mac/VASTRENIX.app`](file:///Users/codekajugad/Desktop/Vastranix/dist/mac/VASTRENIX.app) | Standalone macOS application bundle compiled with embedded server and GUI auto-launcher. |
| **Android Release APK** | [`dist/android/vastrenix-release.apk`](file:///Users/codekajugad/Desktop/Vastranix/dist/android/vastrenix-release.apk) | Installable Android release APK with offline caching and POS hardware support. |

---

## 4. Quick Start & Setup

### Requirements
- Python 3.9+
- SQLite (included) or PostgreSQL (optional via Docker)

### Installation
```bash
# 1. Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install backend dependencies
pip install -r <(cat <<EOF
fastapi
uvicorn
pydantic
pydantic-settings
email-validator
sqlalchemy
alembic
pyjwt
cryptography
bcrypt
python-multipart
reportlab<4.1
qrcode
pillow
httpx
pytest
EOF
)

# 3. Populate demo database
python backend/seed_demo.py

# 4. Start the server
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

Once running:
- **Interactive Web App & POS:** Open [http://localhost:8000](http://localhost:8000)
- **API Swagger Documentation:** Open [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check:** Open [http://localhost:8000/health](http://localhost:8000/health)

---

## 4. Demo Login Credentials

| Role | Email | Password | Business |
| :--- | :--- | :--- | :--- |
| **Business Owner** | `demo@vastrenix.com` | `VastrenixDemo2026!` | Vastrenix Heritage Garments (Surat) |
| **Cashier** | `cashier@vastrenix.com` | `CashierPass123!` | Flagship Billing Terminal |
| **Connected Dealer** | `kaveri@boutique.com` | `KaveriPass123!` | Kaveri Haute Boutique (Mumbai) |

---

## 5. Automated Test Suite

Run the full end-to-end verification test suite:
```bash
PYTHONPATH=. ./.venv/bin/pytest backend/tests/ -v
```

### Verified Test Results:
- `test_first_working_business_flow`: **PASSED** (Product creation → Size/color variants → Purchase GRN receipt → POS sale → Invoice PDF generation → Inventory update → Low-stock alert).
- `test_all_six_invoice_themes`: **PASSED** (Verifies ReportLab PDF generation and HTML preview for all 6 themes).
- `test_b2b_dealer_network_lifecycle`: **PASSED** (Order submitted → Seller accepted → Atomic reservation → Dispatched with LR → Buyer delivered).
- `test_rbac_and_tenant_isolation`: **PASSED** (Cashier restricted from adjustments/invites; Cross-tenant data isolation verified).
- `test_cashier_shift_reconciliation`: **PASSED** (Opening float → Cash sales calculation → Reconciled closing count).
- `test_online_storefront_and_sync`: **PASSED** (Public checkout → Stock decrement → Offline queue idempotency).
