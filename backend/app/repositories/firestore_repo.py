"""
VASTRENIX — Firestore Data Access & Repository Layer
Implements multi-tenant document hierarchy: businesses/{businessId}/{collection}/{docId}
Wraps stock-affecting operations in Firestore Transactions (db.transaction())
"""
import os
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status
from backend.app.core.firebase import firebase_service

logger = logging.getLogger("vastrenix.firestore_repo")


def serialize_for_firestore(data: Any) -> Any:
    """Converts Decimals, datetimes, and complex types for clean Firestore persistence."""
    if isinstance(data, dict):
        return {k: serialize_for_firestore(v) for k, v in data.items()}
    if isinstance(data, list):
        return [serialize_for_firestore(v) for v in data]
    if isinstance(data, Decimal):
        return float(data)
    if isinstance(data, datetime):
        return data.isoformat()
    return data


class FirestoreRepository:
    def __init__(self):
        self.service = firebase_service

    @property
    def db(self):
        return self.service.firestore_db

    @property
    def is_active(self) -> bool:
        if "PYTEST_CURRENT_TEST" in os.environ and not os.getenv("FIRESTORE_EMULATOR_HOST"):
            return False
        return bool(self.service.is_configured and self.db is not None)

    # Multi-tenant collection path helpers
    def _biz_ref(self, business_id: Any):
        return self.db.collection("businesses").document(str(business_id))

    def _col(self, business_id: Any, collection_name: str):
        return self._biz_ref(business_id).collection(collection_name)

    # =========================================================================
    # 1. IDEMPOTENCY KEY DEDUPLICATION
    # =========================================================================
    def check_idempotency(self, business_id: Any, idempotency_key: str) -> Optional[Dict[str, Any]]:
        """Returns existing cached response payload if idempotency key has already been executed."""
        if not self.is_active:
            return None
        try:
            doc = self._col(business_id, "idempotency").document(idempotency_key).get()
            if doc.exists:
                return doc.to_dict().get("response_data")
            return None
        except Exception as e:
            logger.warning(f"Error checking idempotency key in Firestore: {e}")
            return None

    def store_idempotency(self, business_id: Any, idempotency_key: str, response_data: Dict[str, Any]):
        if not self.is_active:
            return
        try:
            self._col(business_id, "idempotency").document(idempotency_key).set({
                "idempotency_key": idempotency_key,
                "response_data": serialize_for_firestore(response_data),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            logger.warning(f"Error storing idempotency key in Firestore: {e}")

    # =========================================================================
    # 2. STAFF & AUTH APPROVAL LIFECYCLE
    # =========================================================================
    def get_staff_by_uid(self, business_id: Any, uid: str) -> Optional[Dict[str, Any]]:
        if not self.is_active:
            return None
        try:
            doc = self._col(business_id, "staff").document(str(uid)).get()
            return doc.to_dict() if doc.exists else None
        except Exception as e:
            logger.error(f"Error fetching staff {uid} from Firestore: {e}")
            return None

    def save_staff_profile(self, business_id: Any, uid: str, staff_data: Dict[str, Any]):
        if not self.is_active:
            return
        try:
            clean = serialize_for_firestore(staff_data)
            clean["updated_at"] = datetime.now(timezone.utc).isoformat()
            self._col(business_id, "staff").document(str(uid)).set(clean, merge=True)
        except Exception as e:
            logger.error(f"Error saving staff {uid} in Firestore: {e}")

    def list_pending_staff(self, business_id: Any) -> List[Dict[str, Any]]:
        if not self.is_active:
            return []
        try:
            docs = self._col(business_id, "staff").where("is_approved", "==", False).stream()
            return [d.to_dict() for d in docs]
        except Exception as e:
            logger.error(f"Error listing pending staff from Firestore: {e}")
            return []

    def approve_staff(self, business_id: Any, uid: str, role: Optional[str] = None):
        if not self.is_active:
            return
        try:
            updates = {
                "is_approved": True,
                "approved_at": datetime.now(timezone.utc).isoformat()
            }
            if role:
                updates["role"] = role
            self._col(business_id, "staff").document(str(uid)).update(updates)
        except Exception as e:
            logger.error(f"Error approving staff {uid} in Firestore: {e}")

    # =========================================================================
    # 3. PRODUCTS & VARIANTS
    # =========================================================================
    def save_product(self, business_id: Any, product_id: Any, product_data: Dict[str, Any]):
        if not self.is_active:
            return
        try:
            clean = serialize_for_firestore(product_data)
            self._col(business_id, "products").document(str(product_id)).set(clean, merge=True)
        except Exception as e:
            logger.error(f"Error saving product {product_id} to Firestore: {e}")

    def save_variant_stock(self, business_id: Any, variant_id: Any, stock_data: Dict[str, Any]):
        if not self.is_active:
            return
        try:
            clean = serialize_for_firestore(stock_data)
            self._col(business_id, "variants").document(str(variant_id)).set(clean, merge=True)
        except Exception as e:
            logger.error(f"Error saving variant {variant_id} stock in Firestore: {e}")

    # =========================================================================
    # 4. ATOMIC POS SALE TRANSACTION (Prevents Overselling & Double Sale)
    # =========================================================================
    def execute_atomic_pos_sale(
        self,
        business_id: Any,
        sale_items: List[Dict[str, Any]],
        invoice_doc: Dict[str, Any],
        idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes a multi-document Firestore transaction:
        1. Checks idempotency (if key provided).
        2. Reads all variant inventory documents inside transaction.
        3. Validates available stock for each line item.
        4. Decrements on_hand stock atomically.
        5. Writes the final invoice document and idempotency record.
        """
        if not self.is_active:
            return {"status": "LOCAL_MOCK_EXECUTED"}

        # 1. Idempotency check before transaction
        if idempotency_key:
            cached = self.check_idempotency(business_id, idempotency_key)
            if cached:
                logger.info(f"Returning cached POS sale response for idempotency key: {idempotency_key}")
                return cached

        from google.cloud import firestore

        transaction = self.db.transaction()

        @firestore.transactional
        def _in_transaction(txn):
            # 2. Read all variants in transaction
            variant_refs = []
            for item in sale_items:
                v_id = str(item["variant_id"])
                v_ref = self._col(business_id, "variants").document(v_id)
                variant_refs.append((v_ref, item["quantity"], item.get("sku", f"SKU-{v_id}")))

            # Read all snapshots
            snapshots = []
            for ref, qty, sku in variant_refs:
                snap = ref.get(transaction=txn)
                if not snap.exists:
                    # If variant doc doesn't exist yet, initialize with on_hand from request
                    continue
                data = snap.to_dict()
                available = data.get("on_hand", 0) - data.get("reserved", 0)
                if available < qty:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Insufficient stock for SKU '{sku}'. Available: {available}, Requested: {qty}"
                    )
                snapshots.append((ref, data, qty))

            # Decrement atomically
            for ref, data, qty in snapshots:
                new_on_hand = max(0, data.get("on_hand", 0) - qty)
                txn.update(ref, {"on_hand": new_on_hand, "last_sold_at": datetime.now(timezone.utc).isoformat()})

            # Save invoice doc
            inv_ref = self._col(business_id, "invoices").document(str(invoice_doc["id"]))
            clean_invoice = serialize_for_firestore(invoice_doc)
            txn.set(inv_ref, clean_invoice)

            # Save idempotency doc
            if idempotency_key:
                idem_ref = self._col(business_id, "idempotency").document(idempotency_key)
                txn.set(idem_ref, {
                    "idempotency_key": idempotency_key,
                    "response_data": clean_invoice,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })

            return clean_invoice

        try:
            return _in_transaction(transaction)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Atomic POS transaction error in Firestore: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Transaction failed: {str(e)}")

    # =========================================================================
    # 5. ATOMIC DEALER ORDER STOCK RESERVATION
    # =========================================================================
    def execute_dealer_order_reservation(
        self,
        business_id: Any,
        order_id: Any,
        items: List[Dict[str, Any]],
        target_status: str = "PROCESSING"
    ) -> Dict[str, Any]:
        """Atomically reserves stock when an incoming B2B dealer order is accepted."""
        if not self.is_active:
            return {"status": "LOCAL_MOCK"}

        from google.cloud import firestore
        transaction = self.db.transaction()

        @firestore.transactional
        def _in_transaction(txn):
            order_ref = self._col(business_id, "dealerOrders").document(str(order_id))
            order_snap = order_ref.get(transaction=txn)
            if not order_snap.exists:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

            # Check for existing transition
            current_status = order_snap.to_dict().get("status")
            if current_status not in ("SUBMITTED", "PENDING"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Order already in {current_status} state")

            # Validate and reserve stock on each variant
            for it in items:
                v_ref = self._col(business_id, "variants").document(str(it["variant_id"]))
                snap = v_ref.get(transaction=txn)
                if snap.exists:
                    d = snap.to_dict()
                    avail = d.get("on_hand", 0) - d.get("reserved", 0)
                    if avail < it["quantity"]:
                        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Insufficient stock for variant #{it['variant_id']}")
                    txn.update(v_ref, {"reserved": d.get("reserved", 0) + it["quantity"]})

            txn.update(order_ref, {
                "status": target_status,
                "accepted_at": datetime.now(timezone.utc).isoformat()
            })
            return {"status": "ACCEPTED", "order_id": order_id}

        return _in_transaction(transaction)

    # =========================================================================
    # 6. EXPENSES & CASH SHIFTS & INVOICES
    # =========================================================================
    def record_invoice(self, business_id: Any, invoice_id: Any, invoice_data: Dict[str, Any]):
        """Persists invoice document under businesses/{businessId}/invoices/{invoiceId}."""
        if not self.is_active:
            return
        try:
            self._col(business_id, "invoices").document(str(invoice_id)).set(
                serialize_for_firestore(invoice_data), merge=True
            )
        except Exception as e:
            logger.error(f"Error saving invoice {invoice_id} in Firestore: {e}")

    def save_expense(self, business_id: Any, expense_id: Any, expense_data: Dict[str, Any]):
        if not self.is_active:
            return
        try:
            self._col(business_id, "expenses").document(str(expense_id)).set(
                serialize_for_firestore(expense_data), merge=True
            )
        except Exception as e:
            logger.error(f"Error saving expense {expense_id} in Firestore: {e}")

    def save_cash_shift(self, business_id: Any, shift_id: Any, shift_data: Dict[str, Any]):
        if not self.is_active:
            return
        try:
            self._col(business_id, "cashShifts").document(str(shift_id)).set(
                serialize_for_firestore(shift_data), merge=True
            )
        except Exception as e:
            logger.error(f"Error saving cash shift {shift_id} in Firestore: {e}")


# Singleton instance of Firestore repository
firestore_repo = FirestoreRepository()

def get_firestore_repo() -> FirestoreRepository:
    return firestore_repo
