from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from backend.app.models.inventory import InventoryLevel, StockMovement, StockAdjustment
from backend.app.models.product import ProductVariant, Product
from backend.app.models.notification import Notification
from typing import Optional, List, Dict

def get_or_create_inventory_level(db: Session, variant_id: int, branch_id: int, for_update: bool = False) -> InventoryLevel:
    query = db.query(InventoryLevel).filter(
        InventoryLevel.variant_id == variant_id,
        InventoryLevel.branch_id == branch_id
    )
    if for_update:
        query = query.with_for_update()
    level = query.first()
    if not level:
        level = InventoryLevel(
            variant_id=variant_id,
            branch_id=branch_id,
            on_hand=0,
            reserved=0,
            in_transit=0,
            damaged=0
        )
        db.add(level)
        db.flush()
    return level

def deduct_stock_for_sale(
    db: Session,
    business_id: int,
    branch_id: int,
    variant_id: int,
    quantity: int,
    invoice_number: str,
    user_id: Optional[int] = None
) -> InventoryLevel:
    """
    Deducts available stock for a direct POS retail or wholesale sale.
    Uses row-level locking (with_for_update) to prevent overselling on the last unit.
    Raises 400 if insufficient available quantity.
    """
    level = get_or_create_inventory_level(db, variant_id, branch_id, for_update=True)
    if level.available < quantity:
        variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
        sku = variant.sku if variant else f"Variant #{variant_id}"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient stock for SKU '{sku}'. Available: {level.available}, Requested: {quantity}"
        )
    
    level.on_hand -= quantity
    db.flush()

    # Record Movement
    movement = StockMovement(
        business_id=business_id,
        branch_id=branch_id,
        variant_id=variant_id,
        movement_type="POS_SALE",
        quantity=-quantity,
        balance_after=level.on_hand,
        reference_id=invoice_number,
        reference_type="INVOICE",
        note=f"Sold via Invoice {invoice_number}",
        user_id=user_id
    )
    db.add(movement)

    # Check low stock alert
    check_and_trigger_stock_alert(db, business_id, branch_id, variant_id, level)
    return level

def reserve_stock_for_dealer_order(
    db: Session,
    business_id: int,
    branch_id: int,
    variant_id: int,
    quantity: int,
    order_number: str,
    user_id: Optional[int] = None
) -> InventoryLevel:
    """
    Reserves stock for B2B dealer order acceptance.
    """
    level = get_or_create_inventory_level(db, variant_id, branch_id, for_update=True)
    if level.available < quantity:
        variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
        sku = variant.sku if variant else f"Variant #{variant_id}"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reserve: insufficient stock for '{sku}'. Available: {level.available}, Requested: {quantity}"
        )
    
    level.reserved += quantity
    db.flush()

    movement = StockMovement(
        business_id=business_id,
        branch_id=branch_id,
        variant_id=variant_id,
        movement_type="DEALER_RESERVATION",
        quantity=0,
        balance_after=level.on_hand,
        reference_id=order_number,
        reference_type="DEALER_ORDER",
        note=f"Reserved {quantity} units for Dealer Order {order_number}",
        user_id=user_id
    )
    db.add(movement)
    return level

def dispatch_reserved_dealer_stock(
    db: Session,
    business_id: int,
    branch_id: int,
    variant_id: int,
    quantity: int,
    order_number: str,
    user_id: Optional[int] = None
) -> InventoryLevel:
    """
    Dispatches previously reserved stock for a B2B dealer order.
    Deducts both on_hand and reserved.
    """
    level = get_or_create_inventory_level(db, variant_id, branch_id)
    level.on_hand = max(0, level.on_hand - quantity)
    level.reserved = max(0, level.reserved - quantity)
    db.flush()

    movement = StockMovement(
        business_id=business_id,
        branch_id=branch_id,
        variant_id=variant_id,
        movement_type="DEALER_DISPATCH",
        quantity=-quantity,
        balance_after=level.on_hand,
        reference_id=order_number,
        reference_type="DEALER_ORDER",
        note=f"Dispatched {quantity} units for Dealer Order {order_number}",
        user_id=user_id
    )
    db.add(movement)
    check_and_trigger_stock_alert(db, business_id, branch_id, variant_id, level)
    return level

def receive_purchase_stock(
    db: Session,
    business_id: int,
    branch_id: int,
    variant_id: int,
    quantity: int,
    grn_number: str,
    user_id: Optional[int] = None
) -> InventoryLevel:
    """
    Adds physical stock to branch on Goods Receipt Note.
    """
    level = get_or_create_inventory_level(db, variant_id, branch_id)
    level.on_hand += quantity
    db.flush()

    movement = StockMovement(
        business_id=business_id,
        branch_id=branch_id,
        variant_id=variant_id,
        movement_type="PURCHASE_RECEIPT",
        quantity=quantity,
        balance_after=level.on_hand,
        reference_id=grn_number,
        reference_type="GOODS_RECEIPT",
        note=f"Stock received via GRN {grn_number}",
        user_id=user_id
    )
    db.add(movement)
    return level

def adjust_stock(
    db: Session,
    business_id: int,
    branch_id: int,
    variant_id: int,
    quantity_change: int,
    adjustment_type: str,
    reason: str,
    user_id: Optional[int] = None
) -> InventoryLevel:
    """
    Manual adjustment (Damage, Loss, Cycle count).
    """
    level = get_or_create_inventory_level(db, variant_id, branch_id)
    level.on_hand = max(0, level.on_hand + quantity_change)
    if adjustment_type == "DAMAGE":
        level.damaged += abs(quantity_change)
    db.flush()

    adj = StockAdjustment(
        business_id=business_id,
        branch_id=branch_id,
        variant_id=variant_id,
        adjustment_type=adjustment_type,
        quantity_change=quantity_change,
        reason=reason,
        user_id=user_id
    )
    db.add(adj)

    movement = StockMovement(
        business_id=business_id,
        branch_id=branch_id,
        variant_id=variant_id,
        movement_type="ADJUSTMENT",
        quantity=quantity_change,
        balance_after=level.on_hand,
        reference_id=f"ADJ-{adj.id or 'MANUAL'}",
        reference_type="STOCK_ADJUSTMENT",
        note=f"Adjustment: {adjustment_type} ({reason})",
        user_id=user_id
    )
    db.add(movement)
    check_and_trigger_stock_alert(db, business_id, branch_id, variant_id, level)
    return level

def check_and_trigger_stock_alert(db: Session, business_id: int, branch_id: int, variant_id: int, level: InventoryLevel):
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if not variant:
        return
    threshold = variant.min_stock_alert or 5
    product = db.query(Product).filter(Product.id == variant.product_id).first()
    prod_name = product.name if product else "Apparel Item"

    if level.on_hand <= 0:
        notif = Notification(
            business_id=business_id,
            title=f"Out of Stock: {prod_name} ({variant.size}/{variant.color})",
            message=f"SKU {variant.sku} is completely out of stock at this branch.",
            notification_type="LOW_STOCK",
            action_url="/inventory"
        )
        db.add(notif)
    elif level.available <= threshold:
        notif = Notification(
            business_id=business_id,
            title=f"Low Stock Alert: {prod_name} ({variant.size}/{variant.color})",
            message=f"Only {level.available} units remaining (Threshold: {threshold}). Reorder recommended.",
            notification_type="LOW_STOCK",
            action_url="/inventory"
        )
        db.add(notif)
