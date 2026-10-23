from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from backend.app.core.database import get_db
from backend.app.core.permissions import get_tenant_context, TenantContext
from backend.app.models.billing import Invoice, InvoiceItem
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
    branch_id = ctx.branch.id if ctx.branch else 1
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    # 1. Today's Performance
    today_invoices = db.query(Invoice).filter(
        Invoice.business_id == ctx.business.id,
        Invoice.status == "POSTED",
        Invoice.invoice_date >= today_start
    ).all()
    today_sales = sum(inv.total_amount for inv in today_invoices)
    today_orders_count = len(today_invoices)
    today_collected = sum(inv.paid_amount for inv in today_invoices)

    # All-time sales
    all_invoices = db.query(Invoice).filter(
        Invoice.business_id == ctx.business.id,
        Invoice.status == "POSTED"
    ).all()
    total_revenue = sum(inv.total_amount for inv in all_invoices)

    # 2. Low Stock Count
    levels = db.query(InventoryLevel, ProductVariant, Product).join(
        ProductVariant, InventoryLevel.variant_id == ProductVariant.id
    ).join(
        Product, ProductVariant.product_id == Product.id
    ).filter(
        Product.business_id == ctx.business.id,
        InventoryLevel.branch_id == branch_id
    ).all()

    low_stock_items = []
    for lvl, var, prod in levels:
        if lvl.available <= (var.min_stock_alert or 5):
            low_stock_items.append({
                "sku": var.sku,
                "name": prod.name,
                "size": var.size,
                "color": var.color,
                "available": lvl.available,
                "threshold": var.min_stock_alert
            })

    # 3. Pending Incoming Dealer Orders
    pending_dealer_orders = db.query(DealerOrder).filter(
        DealerOrder.seller_business_id == ctx.business.id,
        DealerOrder.status.in_(["SUBMITTED", "RECEIVED", "ACCEPTED"])
    ).count()

    # 4. Open Cashier Shift status
    open_shift = db.query(CashShift).filter(
        CashShift.business_id == ctx.business.id,
        CashShift.branch_id == branch_id,
        CashShift.status == "OPEN"
    ).first()

    return {
        "business_name": ctx.business.name,
        "branch_name": ctx.branch.name if ctx.branch else "Main Branch",
        "currency": ctx.business.currency,
        "today_sales": float(today_sales),
        "today_orders_count": today_orders_count,
        "today_collected": float(today_collected),
        "total_revenue": float(total_revenue),
        "low_stock_count": len(low_stock_items),
        "top_low_stock": low_stock_items[:5],
        "pending_dealer_orders": pending_dealer_orders,
        "has_open_shift": open_shift is not None,
        "open_shift_cashier_id": open_shift.cashier_id if open_shift else None
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
