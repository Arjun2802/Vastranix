from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from backend.app.core.database import get_db
from backend.app.core.permissions import get_tenant_context, TenantContext, require_roles
from backend.app.models.inventory import InventoryLevel, StockMovement, StockAdjustment
from backend.app.models.product import ProductVariant, Product
from backend.app.models.auth import Branch
from backend.app.services.stock_service import adjust_stock
from backend.app.schemas.all_schemas import StockAdjustmentSchema

router = APIRouter(prefix="/inventory", tags=["Inventory & Warehouse Control"])

@router.get("/levels")
def get_inventory_levels(
    branch_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    target_branch = ctx.branch
    if not target_branch:
        target_branch = db.query(Branch).filter(Branch.business_id == ctx.business.id).first()
    target_branch_id = branch_id or (target_branch.id if target_branch else None)
    if not target_branch_id:
        return []
    query = db.query(InventoryLevel, ProductVariant, Product).join(
        ProductVariant, InventoryLevel.variant_id == ProductVariant.id
    ).join(
        Product, ProductVariant.product_id == Product.id
    ).join(
        Branch, InventoryLevel.branch_id == Branch.id
    ).filter(
        Branch.business_id == ctx.business.id,
        InventoryLevel.branch_id == target_branch_id
    )

    if search:
        query = query.filter(
            Product.name.ilike(f"%{search}%") | ProductVariant.sku.ilike(f"%{search}%") | ProductVariant.barcode.ilike(f"%{search}%")
        )

    results = []
    for level, variant, product in query.all():
        results.append({
            "inventory_id": level.id,
            "product_id": product.id,
            "product_name": product.name,
            "fabric": product.fabric,
            "variant_id": variant.id,
            "sku": variant.sku,
            "barcode": variant.barcode,
            "size": variant.size,
            "color": variant.color,
            "rack_location": level.rack_location or "Main Rack",
            "on_hand": level.on_hand,
            "reserved": level.reserved,
            "available": level.available,
            "in_transit": level.in_transit,
            "damaged": level.damaged,
            "min_stock_alert": variant.min_stock_alert,
            "is_low_stock": level.available <= variant.min_stock_alert,
            "is_out_of_stock": level.on_hand <= 0
        })
    return results

@router.get("/alerts")
def get_stock_alerts(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    branch_id = ctx.branch.id if ctx.branch else 1
    levels = db.query(InventoryLevel, ProductVariant, Product).join(
        ProductVariant, InventoryLevel.variant_id == ProductVariant.id
    ).join(
        Product, ProductVariant.product_id == Product.id
    ).join(
        Branch, InventoryLevel.branch_id == Branch.id
    ).filter(
        Branch.business_id == ctx.business.id,
        InventoryLevel.branch_id == branch_id
    ).all()

    alerts = []
    for lvl, var, prod in levels:
        threshold = var.min_stock_alert or 5
        if lvl.on_hand <= 0 or lvl.available <= threshold:
            severity = "OUT_OF_STOCK" if lvl.on_hand <= 0 else ("CRITICAL" if lvl.available <= 2 else "LOW_STOCK")
            suggested_reorder = max(15, (threshold * 3) - lvl.available)
            alerts.append({
                "variant_id": var.id,
                "sku": var.sku,
                "product_name": prod.name,
                "size": var.size,
                "color": var.color,
                "severity": severity,
                "available": lvl.available,
                "on_hand": lvl.on_hand,
                "reserved": lvl.reserved,
                "threshold": threshold,
                "suggested_reorder_qty": suggested_reorder,
                "retail_price": float(var.retail_price),
                "purchase_cost": float(var.purchase_cost)
            })
    return alerts

@router.post("/adjust")
def make_stock_adjustment(
    data: StockAdjustmentSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "INVENTORY_MGR", "BRANCH_MANAGER"])),
    db: Session = Depends(get_db)
):
    branch_id = ctx.branch.id if ctx.branch else 1
    level = adjust_stock(
        db=db,
        business_id=ctx.business.id,
        branch_id=branch_id,
        variant_id=data.variant_id,
        quantity_change=data.quantity_change,
        adjustment_type=data.adjustment_type,
        reason=data.reason,
        user_id=ctx.user.id
    )
    db.commit()
    return {"message": "Stock adjusted successfully", "new_on_hand": level.on_hand, "available": level.available}

@router.get("/movements")
def get_stock_movements(
    limit: int = 50,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    movements = db.query(StockMovement).filter(
        StockMovement.business_id == ctx.business.id
    ).order_by(StockMovement.id.desc()).limit(limit).all()

    results = []
    for m in movements:
        var = db.query(ProductVariant).filter(ProductVariant.id == m.variant_id).first()
        prod = db.query(Product).filter(Product.id == var.product_id).first() if var else None
        results.append({
            "id": m.id,
            "sku": var.sku if var else "N/A",
            "product_name": prod.name if prod else "N/A",
            "size": var.size if var else "",
            "color": var.color if var else "",
            "movement_type": m.movement_type,
            "quantity": m.quantity,
            "balance_after": m.balance_after,
            "reference_id": m.reference_id,
            "note": m.note,
            "created_at": m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else ""
        })
    return results
