from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional, List, Dict
from decimal import Decimal
from backend.app.core.database import get_db
from backend.app.core.permissions import get_tenant_context, TenantContext, require_roles
from backend.app.models.dealer import DealerConnection, DealerOrder, DealerOrderItem
from backend.app.models.auth import Business, Branch, User
from backend.app.models.product import ProductVariant, Product
from backend.app.services.dealer_service import (
    create_dealer_order,
    accept_dealer_order,
    assign_dealer_order_staff,
    dispatch_dealer_order,
    mark_dealer_order_delivered
)
from backend.app.schemas.all_schemas import (
    DealerConnectionRequestSchema,
    DealerOrderCreateSchema,
    DealerOrderAcceptSchema,
    DealerOrderAssignStaffSchema,
    DealerOrderDispatchSchema
)
from backend.app.core.firebase import firebase_service

router = APIRouter(prefix="/dealers", tags=["Dealers & B2B Connected Business Network"])

@router.post("/connections")
def request_or_add_connection(
    data: DealerConnectionRequestSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN"])),
    db: Session = Depends(get_db)
):
    target = db.query(Business).filter(Business.id == data.target_business_id).first()
    if not target or target.id == ctx.business.id:
        raise HTTPException(status_code=400, detail="Invalid target business")

    conn = db.query(DealerConnection).filter(
        DealerConnection.requester_business_id == ctx.business.id,
        DealerConnection.target_business_id == data.target_business_id
    ).first()

    if not conn:
        conn = DealerConnection(
            requester_business_id=ctx.business.id,
            target_business_id=data.target_business_id,
            status="CONNECTED", # Auto-connected in sandbox network
            price_tier=data.price_tier or "DEALER"
        )
        db.add(conn)
        db.commit()
        db.refresh(conn)

    return {"message": "Dealer business connection established", "connection_id": conn.id, "target_business": target.name}

@router.get("/connections")
def list_connections(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    conns = db.query(DealerConnection).filter(
        (DealerConnection.requester_business_id == ctx.business.id) |
        (DealerConnection.target_business_id == ctx.business.id)
    ).all()

    results = []
    for c in conns:
        other_id = c.target_business_id if c.requester_business_id == ctx.business.id else c.requester_business_id
        other_biz = db.query(Business).filter(Business.id == other_id).first()
        if other_biz:
            results.append({
                "connection_id": c.id,
                "partner_business_id": other_biz.id,
                "partner_name": other_biz.name,
                "partner_city": other_biz.city,
                "partner_gstin": other_biz.gstin,
                "status": c.status,
                "price_tier": c.price_tier
            })
    return results

@router.post("/orders")
def place_dealer_order(
    data: DealerOrderCreateSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "PURCHASE_MGR"])),
    db: Session = Depends(get_db)
):
    seller_biz = db.query(Business).filter(Business.id == data.seller_business_id).first()
    if not seller_biz:
        raise HTTPException(status_code=404, detail="Seller business not found")

    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    count_today = db.query(DealerOrder).count() + 1
    order_num = f"B2B-{date_str}-{count_today:04d}"

    buyer_branch_id = ctx.branch.id if ctx.branch else 1
    seller_branch = db.query(Branch).filter(Branch.business_id == data.seller_business_id, Branch.is_main == True).first()
    seller_branch_id = seller_branch.id if seller_branch else 1

    items_payload = []
    for it in data.items:
        variant = db.query(ProductVariant).filter(ProductVariant.id == it.seller_variant_id).first()
        if not variant:
            raise HTTPException(status_code=404, detail=f"Variant #{it.seller_variant_id} not found")
        prod = db.query(Product).filter(Product.id == variant.product_id).first()
        items_payload.append({
            "seller_variant_id": variant.id,
            "product_name": prod.name if prod else "Garment Item",
            "size": variant.size,
            "color": variant.color,
            "sku": variant.sku,
            "quantity_ordered": it.quantity_ordered,
            "unit_price": float(it.unit_price),
            "tax_rate": float(it.tax_rate)
        })

    order = create_dealer_order(
        db=db,
        buyer_business_id=ctx.business.id,
        seller_business_id=data.seller_business_id,
        buyer_branch_id=buyer_branch_id,
        seller_branch_id=seller_branch_id,
        order_number=order_num,
        items_data=items_payload,
        notes=data.notes
    )

    return {
        "message": "Dealer order submitted successfully to seller",
        "order_id": order.id,
        "order_number": order.order_number,
        "total_amount": float(order.total_amount),
        "status": order.status
    }

@router.get("/orders/incoming")
def list_incoming_dealer_orders(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    orders = db.query(DealerOrder).filter(DealerOrder.seller_business_id == ctx.business.id).order_by(DealerOrder.id.desc()).all()
    results = []
    for o in orders:
        buyer = db.query(Business).filter(Business.id == o.buyer_business_id).first()
        staff = db.query(User).filter(User.id == o.assigned_staff_id).first() if o.assigned_staff_id else None
        items = [{
            "id": it.id,
            "product_name": it.product_name,
            "size": it.size,
            "color": it.color,
            "sku": it.sku,
            "qty_ordered": it.quantity_ordered,
            "qty_accepted": it.quantity_accepted,
            "unit_price": float(it.unit_price)
        } for it in o.items]
        results.append({
            "id": o.id,
            "order_number": o.order_number,
            "buyer_name": buyer.name if buyer else "Partner Business",
            "date": o.created_at.strftime("%d-%b-%Y %H:%M"),
            "status": o.status,
            "total_amount": float(o.total_amount),
            "items": items,
            "transporter_name": o.transporter_name,
            "lr_number": o.lr_number,
            "assigned_staff_id": o.assigned_staff_id,
            "assigned_staff_name": staff.full_name if staff else None
        })
    return results

@router.get("/orders/outgoing")
def list_outgoing_dealer_orders(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    orders = db.query(DealerOrder).filter(DealerOrder.buyer_business_id == ctx.business.id).order_by(DealerOrder.id.desc()).all()
    results = []
    for o in orders:
        seller = db.query(Business).filter(Business.id == o.seller_business_id).first()
        items = [{
            "id": it.id,
            "product_name": it.product_name,
            "size": it.size,
            "color": it.color,
            "sku": it.sku,
            "qty_ordered": it.quantity_ordered,
            "qty_accepted": it.quantity_accepted,
            "unit_price": float(it.unit_price)
        } for it in o.items]
        results.append({
            "id": o.id,
            "order_number": o.order_number,
            "seller_name": seller.name if seller else "Supplier Business",
            "date": o.created_at.strftime("%d-%b-%Y %H:%M"),
            "status": o.status,
            "total_amount": float(o.total_amount),
            "items": items,
            "transporter_name": o.transporter_name,
            "lr_number": o.lr_number
        })
    return results

@router.post("/orders/{id}/accept")
def accept_incoming_order(
    id: int,
    data: DealerOrderAcceptSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "INVENTORY_MGR", "BRANCH_MANAGER"])),
    db: Session = Depends(get_db)
):
    order = accept_dealer_order(
        db=db,
        seller_business_id=ctx.business.id,
        order_id=id,
        accepted_items=data.accepted_quantities,
        assigned_staff_id=data.assigned_staff_id,
        user_id=ctx.user.id
    )
    return {
        "message": "Order accepted and stock atomically reserved",
        "order_id": order.id,
        "status": order.status,
        "assigned_staff_id": order.assigned_staff_id
    }

@router.post("/orders/{id}/assign-staff")
def assign_order_to_staff(
    id: int,
    data: DealerOrderAssignStaffSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "BRANCH_MANAGER", "INVENTORY_MGR"])),
    db: Session = Depends(get_db)
):
    order = assign_dealer_order_staff(
        db=db,
        seller_business_id=ctx.business.id,
        order_id=id,
        staff_id=data.staff_id
    )
    staff_user = db.query(User).filter(User.id == data.staff_id).first()
    buyer = db.query(Business).filter(Business.id == order.buyer_business_id).first()

    # Trigger Firebase Cloud Messaging (FCM) & Firestore Sync
    firebase_service.notify_staff_order_assigned(
        staff_id=data.staff_id,
        order_number=order.order_number,
        store_name=ctx.business.name,
        buyer_name=buyer.name if buyer else "Partner Business"
    )
    firebase_service.sync_to_firestore("dealer_orders", str(order.id), {
        "order_number": order.order_number,
        "seller_business_id": order.seller_business_id,
        "buyer_business_id": order.buyer_business_id,
        "status": order.status,
        "assigned_staff_id": order.assigned_staff_id,
        "assigned_staff_name": staff_user.full_name if staff_user else None,
        "total_amount": float(order.total_amount)
    })

    return {
        "message": f"Order assigned to staff '{staff_user.full_name if staff_user else ''}'",
        "order_id": order.id,
        "assigned_staff_id": order.assigned_staff_id,
        "assigned_staff_name": staff_user.full_name if staff_user else None
    }

@router.post("/orders/{id}/dispatch")
def dispatch_order(
    id: int,
    data: DealerOrderDispatchSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "DISPATCHER", "INVENTORY_MGR"])),
    db: Session = Depends(get_db)
):
    order = dispatch_dealer_order(
        db=db,
        seller_business_id=ctx.business.id,
        order_id=id,
        transporter_name=data.transporter_name,
        lr_number=data.lr_number,
        user_id=ctx.user.id
    )
    buyer = db.query(Business).filter(Business.id == order.buyer_business_id).first()

    # Firebase FCM Notification & Firestore Sync
    firebase_service.notify_order_status_change(
        order_number=order.order_number,
        status="DISPATCHED",
        buyer_name=buyer.name if buyer else "Partner Business",
        lr_number=order.lr_number
    )
    firebase_service.sync_to_firestore("dealer_orders", str(order.id), {
        "order_number": order.order_number,
        "status": order.status,
        "transporter_name": order.transporter_name,
        "lr_number": order.lr_number
    })

    return {"message": "Order dispatched and stock deducted", "order_id": order.id, "status": order.status, "lr_number": order.lr_number}

@router.post("/orders/{id}/deliver")
def mark_order_delivered(
    id: int,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "PURCHASE_MGR"])),
    db: Session = Depends(get_db)
):
    order = mark_dealer_order_delivered(
        db=db,
        buyer_business_id=ctx.business.id,
        order_id=id,
        user_id=ctx.user.id
    )
    return {"message": "Goods received into stock and order marked delivered", "order_id": order.id, "status": order.status}
