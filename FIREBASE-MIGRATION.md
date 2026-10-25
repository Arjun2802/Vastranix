# VASTRENIX — Firebase Spark Migration, Security Rules & Quota Architecture

## 1. Executive Summary & Strategy
As per production guidelines, VASTRENIX is engineered to operate **strictly within the Firebase Spark (100% Free) Plan** without requiring Blaze or incurring cloud billing.

All multi-tenant data, catalog items, invoice records, and staff approval lifecycles are modeled in Cloud Firestore and Firebase Storage using **read-disciplined query architectures, composite indexes, and client-side transactions**.

---

## 2. Multi-Tenant Firestore Schema Design

```
/public_stores/{businessId}               (Public store directory for staff signup dropdown)
/users/{userId}                           (Global user auth mapping)
/businesses/{businessId}/                 (Tenant boundary)
  ├── staff/{membershipId}                (Role, approval status, active flag)
  ├── products/{productId}                (Garment style metadata, fabric, HSN/SAC, tax)
  ├── variants/{variantId}                (SKU, Size, Color, Retail Price, Cost, Stock counts)
  ├── invoices/{invoiceId}                (Immutable billing records with items array)
  ├── cash_shifts/{shiftId}               (Register till open/close float & reconciliation)
  │    └── transactions/{txId}            (Sale collections, cash refunds, petty cash)
  ├── expenses/{expenseId}                (Categorized business expenses & receipt URLs)
  ├── dealer_orders/{orderId}             (B2B wholesale orders & status stepper)
  └── analytics/today                     (Pre-aggregated sales counters to save reads)
```

### Key Schema Optimizations:
1. **Denormalized Line Items**: Invoices store `items` as a nested array directly on the invoice document. Loading an invoice requires exactly **1 read** rather than 1 read + N item subcollection reads.
2. **Aggregated Counter Document (`analytics/today`)**: Rather than running `COUNT(*)` or summing 100 invoice documents on every dashboard view, POS sales atomically increment `analytics/today` using `FieldValue.increment(totalAmount)`. Viewing today's sales costs **1 read** instead of 100 reads.

---

## 3. Quota Discipline & Mathematical Usage Breakdown

### Sample Store Profile (100 sales/day, 5 staff, 2,000 SKUs, 8 dealer orders):

| Operation Group | Queries / Day | Reads / Day | Writes / Day | Spark Daily Limit | Free Headroom |
|---|---|---|---|---|---|
| **App Open & Dashboard** | Aggregated `analytics/today` + `.limit(15)` low stock | ~100 | 0 | 50,000 reads | **99.8% FREE** |
| **Garment Catalog & Stock**| Paginated search `.limit(20)` | ~800 | ~55 | 50,000 reads | **98.4% FREE** |
| **POS Counter Billing** | Exact SKU lookup `.where('sku', '==', ...).limit(1)` | ~250 | ~550 | 20,000 writes| **97.2% FREE** |
| **B2B Wholesale Orders** | Pipeline status query `.limit(25)` | ~80 | ~40 | 50,000 reads | **99.8% FREE** |
| **Expenses & Staff Admin** | Category filter `.limit(20)` | ~30 | ~12 | 20,000 writes| **99.9% FREE** |
| **TOTAL ESTIMATED DAILY** | — | **~1,260 reads** | **~657 writes** | — | **~97.5% FREE** |

---

## 4. Spark-Compliant Atomic Stock Decrement & Concurrency

Since Cloud Functions are not available on the Spark plan, stock reservation and last-unit overselling protection are handled via **client-side Firestore transactions** (`FirebaseFirestore.instance.runTransaction(...)`):

```dart
// Spark-Compliant Atomic Stock Decrement with Conflict Detection
Future<bool> executePOSCheckout({
  required String businessId,
  required String variantId,
  required int quantityToDeduct,
  required Map<String, dynamic> invoiceData,
}) async {
  final firestore = FirebaseFirestore.instance;
  final variantRef = firestore
      .collection('businesses')
      .doc(businessId)
      .collection('variants')
      .doc(variantId);
  final invoiceRef = firestore
      .collection('businesses')
      .doc(businessId)
      .collection('invoices')
      .doc(invoiceData['idempotency_key']);

  try {
    await firestore.runTransaction((transaction) async {
      // 1. Idempotency Check
      final existingInvoice = await transaction.get(invoiceRef);
      if (existingInvoice.exists) {
        return; // Already processed idempotently; return success
      }

      // 2. Read Variant Stock inside transaction lock
      final snapshot = await transaction.get(variantRef);
      if (!snapshot.exists) {
        throw Exception("Garment variant not found");
      }

      final int onHand = snapshot.data()?['on_hand'] ?? 0;
      final int reserved = snapshot.data()?['reserved'] ?? 0;
      final int available = onHand - reserved;

      if (available < quantityToDeduct) {
        throw Exception("Insufficient stock: Only $available available.");
      }

      // 3. Atomically Decrement Inventory
      transaction.update(variantRef, {
        'on_hand': onHand - quantityToDeduct,
        'available': available - quantityToDeduct,
        'is_low_stock': (available - quantityToDeduct) <= 5,
        'last_sold_at': FieldValue.serverTimestamp(),
      });

      // 4. Post Immutable Invoice Record
      transaction.set(invoiceRef, invoiceData);
    });
    return true;
  } catch (e) {
    debugPrint("Transaction failed: $e");
    return false;
  }
}
```

---

## 5. Security Rules Verification (`firestore.rules` & `storage.rules`)

1. **Tenant Isolation**: A user belonging to Store A (`businesses/biz_101`) is strictly forbidden from querying, reading, or writing documents in Store B (`businesses/biz_102`).
2. **Staff Approval Gate**: Membership documents require `is_approved == true` and `is_active == true`. Unapproved staff accounts receive `PERMISSION_DENIED` on all store collections.
3. **Role-Based Protection**:
   - `CASHIER`: Can read catalog and create POS invoices; forbidden from reading business purchase costs, profit margins, or store expense records.
   - `INVENTORY_MGR`: Can adjust stock levels and add garments; forbidden from viewing payroll and closing financial shifts.
   - `OWNER` / `ADMIN`: Full administrative control over staff memberships, roles, and business settings.

---

## 6. Migration Execution & Rollback Plan

### 6.1 Running the Migration
The migration script [`scripts/migrate_to_firestore.py`](file:///Users/codekajugad/Desktop/Vastranix/scripts/migrate_to_firestore.py) extracts data from the relational database and populates Firestore documents with verified sums.

```bash
# Step 1: Execute Dry-Run Verification (0 writes to Firestore)
./.venv/bin/python3 scripts/migrate_to_firestore.py --dry-run

# Step 2: Execute Live Migration
./.venv/bin/python3 scripts/migrate_to_firestore.py
```

### 6.2 Rollback Plan
If any discrepancy occurs during live cutover:
1. Set the application client to **SQLite / PostgreSQL Primary Mode** via `vastrenix_server_url` in Settings.
2. The relational database continues to maintain authoritative state without data loss.
3. A reverse-sync script can be executed if Firestore offline changes need to be folded back into SQLite.
