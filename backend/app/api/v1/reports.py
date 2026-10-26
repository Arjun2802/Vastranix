from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from backend.app.core.database import get_db
from backend.app.core.permissions import get_tenant_context, TenantContext
from backend.app.models.auth import Branch
from backend.app.models.billing import Invoice, InvoiceItem, Customer
from backend.app.models.inventory import InventoryLevel
from backend.app.models.product import ProductVariant, Product
from backend.app.models.dealer import DealerOrder
from backend.app.models.finance import CashShift

router = APIRouter(prefix="/reports", tags=["Business Intelligence & Reports"])

@router.get("/dashboard")
def get_dashboard_metrics(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    branch = ctx.branch or db.query(Branch).filter(Branch.business_id == ctx.business.id).first()
    branch_id = branch.id if branch else 1
    branch_name = branch.name if branch else "Main Branch"

    # Robust timezone-safe UTC start of today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=None)

    # 1. Today's Performance (Safe individual evaluation)
    today_sales = 0.0
    today_orders_count = 0
    today_collected = 0.0
    try:
        today_invoices = db.query(Invoice).filter(
            Invoice.business_id == ctx.business.id,
            Invoice.status == "POSTED",
            Invoice.invoice_date >= today_start
        ).all()
        today_sales = sum(float(inv.total_amount or 0) for inv in today_invoices)
        today_orders_count = len(today_invoices)
        today_collected = sum(float(inv.paid_amount or 0) for inv in today_invoices)
    except Exception:
        pass

    # All-time sales
    total_revenue = 0.0
    try:
        all_invoices = db.query(Invoice).filter(
            Invoice.business_id == ctx.business.id,
            Invoice.status == "POSTED"
        ).all()
        total_revenue = sum(float(inv.total_amount or 0) for inv in all_invoices)
    except Exception:
        pass

    # 2. Low Stock Count
    low_stock_items = []
    try:
        levels = db.query(InventoryLevel, ProductVariant, Product).join(
            ProductVariant, InventoryLevel.variant_id == ProductVariant.id
        ).join(
            Product, ProductVariant.product_id == Product.id
        ).filter(
            Product.business_id == ctx.business.id,
            InventoryLevel.branch_id == branch_id
        ).all()

        for lvl, var, prod in levels:
            if lvl.available <= (var.min_stock_alert or 5):
                low_stock_items.append({
                    "sku": var.sku,
                    "name": prod.name,
                    "size": var.size,
                    "color": var.color,
                    "available": lvl.available,
                    "threshold": var.min_stock_alert or 5
                })
    except Exception:
        pass

    # 3. Pending Incoming Dealer Orders
    pending_dealer_orders = 0
    try:
        pending_dealer_orders = db.query(DealerOrder).filter(
            DealerOrder.seller_business_id == ctx.business.id,
            DealerOrder.status.in_(["SUBMITTED", "RECEIVED", "ACCEPTED"])
        ).count()
    except Exception:
        pass

    # 4. Open Cashier Shift status
    open_shift = None
    try:
        open_shift = db.query(CashShift).filter(
            CashShift.business_id == ctx.business.id,
            CashShift.branch_id == branch_id,
            CashShift.status == "OPEN"
        ).first()
    except Exception:
        pass

    # 5. Pending Store Credit / Khata Dues
    credit_dues = []
    try:
        credit_invoices = db.query(Invoice).filter(
            Invoice.business_id == ctx.business.id,
            Invoice.payment_mode.in_(["CREDIT", "STORE_CREDIT"]),
            Invoice.balance_due > 0,
            Invoice.status == "POSTED"
        ).order_by(Invoice.due_date.asc()).all()

        for inv in credit_invoices:
            cust = db.query(Customer).filter(Customer.id == inv.customer_id).first() if inv.customer_id else None
            credit_dues.append({
                "invoice_id": inv.id,
                "invoice_number": inv.invoice_number,
                "customer_name": cust.name if cust else "Store Credit Customer",
                "customer_phone": cust.phone if cust else "N/A",
                "amount_owed": float(inv.balance_due),
                "due_date": inv.due_date.strftime("%d-%b-%Y") if inv.due_date else "Month-End",
                "is_month_end_due": True
            })
    except Exception:
        pass

    return {
        "business_name": ctx.business.name,
        "branch_name": branch_name,
        "currency": ctx.business.currency or "INR",
        "today_sales": float(today_sales),
        "today_orders_count": today_orders_count,
        "today_collected": float(today_collected),
        "total_revenue": float(total_revenue),
        "low_stock_count": len(low_stock_items),
        "top_low_stock": low_stock_items[:5],
        "pending_dealer_orders": pending_dealer_orders,
        "has_open_shift": open_shift is not None,
        "open_shift_cashier_id": open_shift.cashier_id if open_shift else None,
        "pending_credit_dues": credit_dues,
        "total_credit_due": sum(c["amount_owed"] for c in credit_dues)
    }

@router.get("/valuation")
def get_inventory_valuation(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    branch_id = ctx.branch.id if ctx.branch else 1
    levels = db.query(InventoryLevel, ProductVariant).join(
        ProductVariant, InventoryLevel.variant_id == ProductVariant.id
    ).join(
        Product, ProductVariant.product_id == Product.id
    ).filter(
        Product.business_id == ctx.business.id,
        InventoryLevel.branch_id == branch_id
    ).all()

    total_cost_val = sum(lvl.on_hand * var.purchase_cost for lvl, var in levels)
    total_retail_val = sum(lvl.on_hand * var.retail_price for lvl, var in levels)
    total_pieces = sum(lvl.on_hand for lvl, var in levels)

    return {
        "currency": ctx.business.currency,
        "total_pieces_on_hand": total_pieces,
        "total_cost_value": float(total_cost_val),
        "total_retail_value": float(total_retail_val),
        "potential_gross_margin": float(total_retail_val - total_cost_val)
    }
