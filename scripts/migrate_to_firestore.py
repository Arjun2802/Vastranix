#!/usr/bin/env python3
"""
VASTRENIX — Relational Database to Cloud Firestore Migration Script (Spark-Compliant)
Migrates SQLite/PostgreSQL schema into multi-tenant Firestore documents under `businesses/{businessId}/...`
"""

import os
import sys
import json
import logging
from decimal import Decimal
from datetime import datetime, timezone
from typing import Dict, Any, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.core.database import SessionLocal
from backend.app.core.firebase import firebase_service
from backend.app.models.auth import Business, Branch, User, UserMembership
from backend.app.models.product import Product, ProductVariant
from backend.app.models.inventory import InventoryLevel
from backend.app.models.billing import Invoice, InvoiceItem
from backend.app.models.dealer import DealerOrder, DealerOrderItem
from backend.app.models.finance import BusinessExpense, CashShift

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("vastrenix.migration")

def serialize_val(val: Any) -> Any:
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, datetime):
        return val.isoformat()
    return val

def run_migration(dry_run: bool = False):
    logger.info(f"Starting VASTRENIX Firestore Migration (dry_run={dry_run})...")
    db = SessionLocal()
    migration_summary = {
        "businesses_migrated": 0,
        "staff_migrated": 0,
        "products_migrated": 0,
        "variants_migrated": 0,
        "invoices_migrated": 0,
        "total_invoice_revenue": 0.0,
        "expenses_migrated": 0,
        "total_expenses_amount": 0.0,
        "dealer_orders_migrated": 0,
        "errors": []
    }

    try:
        businesses = db.query(Business).all()
        logger.info(f"Found {len(businesses)} businesses in source database.")

        for biz in businesses:
            biz_doc = {
                "id": biz.id,
                "name": biz.name,
                "legal_name": biz.legal_name,
                "city": biz.city,
                "gstin": biz.gstin,
                "phone": biz.phone,
                "email": biz.email,
                "currency": biz.currency,
                "default_invoice_theme": biz.default_invoice_theme,
                "upi_id": biz.upi_id,
                "created_at": serialize_val(biz.created_at),
                "migrated_at": datetime.now(timezone.utc).isoformat()
            }

            if not dry_run and firebase_service.is_configured and firebase_service.firestore_db:
                firebase_service.firestore_db.collection("businesses").document(str(biz.id)).set(biz_doc, merge=True)
                # Public store listing for staff signup dropdown
                firebase_service.firestore_db.collection("public_stores").document(str(biz.id)).set({
                    "id": biz.id,
                    "name": biz.name,
                    "city": biz.city
                }, merge=True)

            migration_summary["businesses_migrated"] += 1

            # 1. Staff Memberships
            memberships = db.query(UserMembership).filter(UserMembership.business_id == biz.id).all()
            for m in memberships:
                user = db.query(User).filter(User.id == m.user_id).first()
                staff_doc = {
                    "membership_id": m.id,
                    "user_id": m.user_id,
                    "business_id": biz.id,
                    "full_name": user.full_name if user else "Staff",
                    "email": user.email if user else "",
                    "phone": user.phone if user else "",
                    "role": m.role,
                    "is_approved": m.is_approved,
                    "is_active": m.is_active,
                    "branch_id": m.branch_id
                }
                if not dry_run and firebase_service.is_configured and firebase_service.firestore_db:
                    firebase_service.firestore_db.collection("businesses").document(str(biz.id))\
                        .collection("staff").document(str(m.id)).set(staff_doc, merge=True)
                migration_summary["staff_migrated"] += 1

            # 2. Products & Variants
            products = db.query(Product).filter(Product.business_id == biz.id).all()
            for p in products:
                prod_doc = {
                    "id": p.id,
                    "name": p.name,
                    "fabric": p.fabric,
                    "hsn_sac": p.hsn_sac,
                    "tax_rate": serialize_val(p.tax_rate),
                    "created_at": serialize_val(p.created_at)
                }
                if not dry_run and firebase_service.is_configured and firebase_service.firestore_db:
                    firebase_service.firestore_db.collection("businesses").document(str(biz.id))\
                        .collection("products").document(str(p.id)).set(prod_doc, merge=True)
                migration_summary["products_migrated"] += 1

                variants = db.query(ProductVariant).filter(ProductVariant.product_id == p.id).all()
                for v in variants:
                    inv = db.query(InventoryLevel).filter(InventoryLevel.variant_id == v.id).first()
                    on_hand = inv.on_hand if inv else 0
                    reserved = inv.reserved if inv else 0
                    available = inv.available if inv else on_hand - reserved
                    var_doc = {
                        "id": v.id,
                        "product_id": p.id,
                        "product_name": p.name,
                        "sku": v.sku,
                        "size": v.size,
                        "color": v.color,
                        "retail_price": serialize_val(v.retail_price),
                        "purchase_cost": serialize_val(v.purchase_cost),
                        "on_hand": on_hand,
                        "reserved": reserved,
                        "available": available,
                        "is_low_stock": available <= (v.min_stock_alert or 5)
                    }
                    if not dry_run and firebase_service.is_configured and firebase_service.firestore_db:
                        firebase_service.firestore_db.collection("businesses").document(str(biz.id))\
                            .collection("variants").document(str(v.id)).set(var_doc, merge=True)
                    migration_summary["variants_migrated"] += 1

            # 3. Invoices
            invoices = db.query(Invoice).filter(Invoice.business_id == biz.id).all()
            for inv in invoices:
                items = db.query(InvoiceItem).filter(InvoiceItem.invoice_id == inv.id).all()
                items_data = [{
                    "variant_id": it.variant_id,
                    "product_name": it.product_name,
                    "sku": it.sku,
                    "size": it.size,
                    "color": it.color,
                    "quantity": it.quantity,
                    "unit_price": serialize_val(it.unit_price),
                    "line_total": serialize_val(it.line_total)
                } for it in items]

                inv_doc = {
                    "id": inv.id,
                    "invoice_number": inv.invoice_number,
                    "invoice_date": serialize_val(inv.invoice_date),
                    "invoice_theme": inv.invoice_theme,
                    "payment_mode": inv.payment_mode,
                    "payment_status": inv.payment_status,
                    "subtotal": serialize_val(inv.subtotal),
                    "tax_amount": serialize_val(inv.tax_amount),
                    "discount_amount": serialize_val(inv.discount_amount),
                    "total_amount": serialize_val(inv.total_amount),
                    "paid_amount": serialize_val(inv.paid_amount),
                    "balance_due": serialize_val(inv.balance_due),
                    "items": items_data
                }
                if not dry_run and firebase_service.is_configured and firebase_service.firestore_db:
                    firebase_service.firestore_db.collection("businesses").document(str(biz.id))\
                        .collection("invoices").document(str(inv.id)).set(inv_doc, merge=True)
                migration_summary["invoices_migrated"] += 1
                migration_summary["total_invoice_revenue"] += float(inv.total_amount or 0)

            # 4. Expenses
            expenses = db.query(BusinessExpense).filter(BusinessExpense.business_id == biz.id).all()
            for exp in expenses:
                exp_doc = {
                    "id": exp.id,
                    "category": exp.category,
                    "amount": serialize_val(exp.amount),
                    "payment_mode": exp.payment_mode,
                    "description": exp.description,
                    "receipt_url": exp.receipt_url,
                    "expense_date": serialize_val(exp.expense_date)
                }
                if not dry_run and firebase_service.is_configured and firebase_service.firestore_db:
                    firebase_service.firestore_db.collection("businesses").document(str(biz.id))\
                        .collection("expenses").document(str(exp.id)).set(exp_doc, merge=True)
                migration_summary["expenses_migrated"] += 1
                migration_summary["total_expenses_amount"] += float(exp.amount or 0)

            # 5. Dealer Orders
            dealer_orders = db.query(DealerOrder).filter(
                (DealerOrder.seller_business_id == biz.id) | (DealerOrder.buyer_business_id == biz.id)
            ).all()
            for do in dealer_orders:
                do_doc = {
                    "id": do.id,
                    "order_number": do.order_number,
                    "seller_business_id": do.seller_business_id,
                    "buyer_business_id": do.buyer_business_id,
                    "status": do.status,
                    "total_amount": serialize_val(do.total_amount),
                    "transporter_name": do.transporter_name,
                    "lr_number": do.lr_number,
                    "created_at": serialize_val(do.created_at)
                }
                if not dry_run and firebase_service.is_configured and firebase_service.firestore_db:
                    firebase_service.firestore_db.collection("businesses").document(str(biz.id))\
                        .collection("dealer_orders").document(str(do.id)).set(do_doc, merge=True)
                migration_summary["dealer_orders_migrated"] += 1

        logger.info("==================================================")
        logger.info("   MIGRATION EXECUTION COMPLETED SUCCESSFULLY      ")
        logger.info("==================================================")
        logger.info(json.dumps(migration_summary, indent=2))
        return migration_summary

    except Exception as e:
        logger.error(f"Migration failed with error: {e}", exc_info=True)
        migration_summary["errors"].append(str(e))
        return migration_summary
    finally:
        db.close()

if __name__ == "__main__":
    is_dry = "--dry-run" in sys.argv
    res = run_migration(dry_run=is_dry)
    sys.exit(0 if len(res.get("errors", [])) == 0 else 1)
