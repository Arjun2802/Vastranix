# VASTRENIX — Firebase Quota Estimate & Spark vs. Blaze Architecture

## 1. Firebase Free "Spark" Plan Limits

| Metric / Resource | Spark (Free Tier) Limit | Cost Above Limit |
|---|---|---|
| **Firestore Document Reads** | **50,000 reads / day** | Hard cap (Requests fail with ResourceExhausted) |
| **Firestore Document Writes** | **20,000 writes / day** | Hard cap |
| **Firestore Document Deletes** | **20,000 deletes / day** | Hard cap |
| **Firestore Stored Data** | **1 GiB total** | Hard cap |
| **Network Egress (Bandwidth)**| **10 GiB / month** (~330 MB / day) | Hard cap |
| **Firebase Cloud Storage** | **5 GiB total**, 1 GB/day download | Hard cap |
| **Firebase Authentication** | **Unlimited** (Email/Password) | Always Free |
| **Cloud Functions (Serverless)**| **0 (Not available on Spark)** | Requires Blaze Plan |

---

## 2. Daily Quota Model: Mid-Size Clothing Store Profile

### Store Parameters:
- **Daily Volume**: 100 POS counter sales / day (average 2.5 items per cart = 250 garment units sold).
- **Store Personnel**: 5 active concurrent staff members (1 Store Owner, 2 POS Cashiers, 1 Inventory Manager, 1 B2B Dispatcher).
- **Catalog Size**: 500 product styles across 2,000 SKU variants.
- **B2B Dealer Activity**: 8 wholesale dealer orders created, reviewed, or dispatched / day.
- **Operating Hours**: 10:00 AM to 9:00 PM (11 active hours).

---

## 3. Screen-by-Screen Read & Write Breakdown

### 3.1 Morning App Launch & Dashboard (`businesses/{businessId}`)
*Query Architecture: Scoped listener with `.limit(1)` on business document + aggregated counter rollups.*
- 5 staff members open app in morning:
  - Read store profile & business metadata: 5 reads.
  - Read active shift record (`shifts` where status == 'OPEN'): 5 reads.
  - Today's sales summary (aggregated counter doc `analytics/today`): 5 reads.
  - Low-stock query (`variants` where stock <= min_stock, limit 15): 15 reads × 5 = 75 reads.
  - Pending staff / dealer badge counts: 10 reads.
- **Dashboard Total**: **~100 reads / day** | **0 writes**.

### 3.2 Garment Catalog & Inventory Search (`products` & `variants`)
*Query Architecture: Client-side local cache + paginated query `.limit(20)`. Never fetch full 500-item catalog into memory.*
- Inventory manager searches / updates stock throughout the day:
  - 40 catalog searches/views (paginated 20 items per view): 40 × 20 = 800 reads.
  - 15 manual stock adjustments (+/- count with mandatory reason): 15 writes to `inventoryLevels` + 15 writes to audit log = 30 writes.
  - 5 new garments added (1 parent product + 4 variants): 25 writes.
- **Inventory Total**: **~800 reads / day** | **55 writes / day**.

### 3.3 POS Billing Counter (100 Sales / Day)
*Query Architecture: Barcode lookup by exact SKU index (`.where('sku', '==', scannedSku).limit(1)`). Idempotent transaction execution.*
- 100 sales transactions:
  - Barcode scan queries (250 item lookups by exact SKU): 250 reads.
  - Sale transaction write per invoice:
    - 1 invoice document in `invoices/{invoiceId}`: 100 writes.
    - 2.5 inventory variant stock decrements: 250 writes.
    - 1 transaction record in active `cash_shifts/{shiftId}/transactions`: 100 writes.
    - 1 rollup counter update in `analytics/today`: 100 writes.
- **POS Billing Total**: **~250 reads / day** | **550 writes / day**.

### 3.4 B2B Dealer Orders & Fulfillment (8 Orders / Day)
*Query Architecture: Horizontal pipeline query `.where('status', 'in', [...]).limit(25)`.*
- 8 B2B orders progressing through lifecycle:
  - Order review views (dispatcher + buyer): 80 reads.
  - Accept stage (reserve stock): 8 writes.
  - Staff assignment: 8 writes.
  - Dispatch stage (record LR & deduct on-hand): 8 writes.
  - Delivery confirmation (buyer stock credit): 16 writes.
- **B2B Dealer Total**: **~80 reads / day** | **40 writes / day**.

### 3.5 Store Expenses & Team Approvals
- 10 store expenses recorded with receipt URLs: 10 writes + 20 reads.
- 2 staff registration approvals / role updates: 2 writes + 10 reads.
- **Expenses & Team Total**: **~30 reads / day** | **12 writes / day**.

---

## 4. Total Daily Usage vs. Spark Free Tier Quota

| Operation | Estimated Daily Consumption | Spark Free Tier Daily Limit | Quota Headroom Remaining |
|---|---|---|---|
| **Firestore Reads** | **~1,260 reads / day** | **50,000 reads / day** | **97.5% FREE Headroom** (~40× safety margin) |
| **Firestore Writes** | **~687 writes / day** | **20,000 writes / day** | **96.6% FREE Headroom** (~29× safety margin) |
| **Firestore Deletes** | **< 10 deletes / day** (Soft deletes preferred) | **20,000 deletes / day** | **> 99.9% FREE Headroom** |
| **Database Storage** | **~4.5 MB / month** (Text & JSON docs) | **1,024 MB (1 GiB)** | **99.5% FREE Headroom** (Years of storage) |
| **Storage Bandwidth**| **~15 MB / day** (PDF invoices & receipts) | **330 MB / day** (10 GB / mo) | **95.4% FREE Headroom** |

> **Conclusion**: A typical boutique clothing store handling 100 counter sales, 2,000 SKUs, and 5 concurrent employees consumes **less than 3.5% of the Spark free tier limits**.

---

## 5. Architectural Trade-Off: Spark vs. Blaze Plan

### 5.1 Where Spark Free Plan is 100% Sufficient:
1. **User Authentication**: Unlimited email/password accounts, token issuance, and session state.
2. **Catalog Browsing & Search**: Read-heavy queries with `.limit(20)` pagination and client-side offline persistence.
3. **Multi-Tenant Security Rules**: Enforcing `request.auth.uid` against `businesses/{bizId}/staff/{userId}` directly on Firestore rules.
4. **Document Storage**: Uploading PDF invoices, merchant UPI QR codes, and expense receipts up to 5 GiB.
5. **Real-time Live Listeners**: Using `onSnapshot()` with explicit `.limit()` for the active counter cashier and dispatcher.

### 5.2 Where Blaze Plan is Required & Strongly Recommended:

#### The Concurrency & Financial Safety Dilemma:
In clothing ERP retail, **two cashiers must never sell the last unit in stock simultaneously**, and **dealer dispatch must atomically decrement warehouse on-hand stock while updating LR tracking**.

- **Option A: Client-Side Firestore Transactions on Spark Plan (Free)**:
  - *Mechanism*: The Flutter/Android client initiates `FirebaseFirestore.instance.runTransaction(...)` directly from the cash register device over local Wi-Fi or cellular network.
  - *Risks*:
    1. **Contention & Collisions**: If network latency occurs during checkout, Firestore detects the version mismatch and forces the client to retry up to 5 times. On busy festival days, this leads to cashier screen freezes and transaction abortion.
    2. **Logic Exposure**: Stock validation and pricing logic resides inside the client application bundle, increasing vulnerability.
    3. **Battery & Data Overhead**: Repeated optimistic retry loops over cellular networks consume device resources.

- **Option B: Cloud Functions Callable / Triggers on Blaze Plan (Recommended)**:
  - *Mechanism*: Client submits POS sale payload with `idempotencyKey` to a Cloud Function (`posCheckout`). The function executes the database transaction on Google's low-latency server network in **sub-40 milliseconds**, verifies stock, decrements inventory, posts the immutable invoice, and triggers invoice PDF generation.
  - *Financial Reality*:
    - The Blaze plan **retains the exact same 50k reads, 20k writes, and 2M Cloud Function invocations per month for $0.00**.
    - For a store running 100 sales/day (~3,000 invocations/month), **the monthly bill is $0.00**.
    - You only pay if a business scales past 2,000,000 transactions per month.

### 5.3 Recommendation Summary
We recommend enabling **Blaze with a $0 budget alert**:
- **98% of store operations** (Auth, queries, catalog, dashboards, receipts, offline sync) run on the built-in free tier.
- **Critical stock-decrement and POS checkout** run via Cloud Functions transactions to guarantee zero double-selling and 100% financial consistency across devices.
