from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from decimal import Decimal
from backend.app.models.dealer import DealerOrder, DealerOrderItem, DealerConnection
from backend.app.models.notification import Notification
from backend.app.models.auth import Business, Branch
from backend.app.models.product import ProductVariant, Product
from backend.app.services.stock_service import (
    reserve_stock_for_dealer_order,
    dispatch_reserved_dealer_stock,
    receive_purchase_stock
)
from typing import Optional, List, Dict

def create_dealer_order(
    db: Session,
    buyer_business_id: int,
    seller_business_id: int,
    buyer_branch_id: int,
    seller_branch_id: int,
    order_number: str,
    items_data: List[Dict],
    notes: Optional[str] = None
) -> DealerOrder:
    # Verify active connection
    conn = db.query(DealerConnection).filter(
        DealerConnection.requester_business_id == buyer_business_id,
        DealerConnection.target_business_id == seller_business_id,
        DealerConnection.status == "CONNECTED"
    ).first()
    if not conn:
        # Check reverse connection
        conn = db.query(DealerConnection).filter(
            DealerConnection.requester_business_id == seller_business_id,
            DealerConnection.target_business_id == buyer_business_id,
            DealerConnection.status == "CONNECTED"
        ).first()

    subtotal = sum(item["quantity_ordered"] * item["unit_price"] for item in items_data)
    tax_amount = sum(item["quantity_ordered"] * item["unit_price"] * (item.get("tax_rate", 5.0) / 100.0) for item in items_data)
    total_amount = subtotal + tax_amount

    order = DealerOrder(
        order_number=order_number,
        buyer_business_id=buyer_business_id,
        seller_business_id=seller_business_id,
        buyer_branch_id=buyer_branch_id,
        seller_branch_id=seller_branch_id,
        status="SUBMITTED",
        subtotal=subtotal,
        tax_amount=tax_amount,
        total_amount=total_amount,
        notes=notes
    )
    db.add(order)
    db.flush()

    for item in items_data:
        order_item = DealerOrderItem(
            dealer_order_id=order.id,
            seller_variant_id=item["seller_variant_id"],
            product_name=item["product_name"],
            size=item["size"],
            color=item["color"],
            sku=item["sku"],
            quantity_ordered=item["quantity_ordered"],
            quantity_accepted=0,
            quantity_dispatched=0,
            unit_price=item["unit_price"],
            tax_rate=item.get("tax_rate", 5.0),
            line_total=item["quantity_ordered"] * item["unit_price"]
        )
        db.add(order_item)

    # Notify seller business
    buyer_biz = db.query(Business).filter(Business.id == buyer_business_id).first()
    notif = Notification(
        business_id=seller_business_id,
        title=f"New Dealer Order #{order_number}",
        message=f"Received order of ₹{total_amount:.2f} from {buyer_biz.name if buyer_biz else 'Connected Dealer'}",
        notification_type="DEALER_ORDER",
        action_url="/dealers"
    )
    db.add(notif)
    db.commit()
    db.refresh(order)
    return order

def accept_dealer_order(
    db: Session,
    seller_business_id: int,
    order_id: int,
    accepted_items: Dict[int, int], # item_id -> quantity_accepted
    assigned_staff_id: Optional[int] = None,
    user_id: Optional[int] = None
) -> DealerOrder:
    order = db.query(DealerOrder).filter(
        DealerOrder.id == order_id,
        DealerOrder.seller_business_id == seller_business_id
    ).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Dealer order not found")

    if order.status not in ["SUBMITTED", "RECEIVED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order already processed (Current status: '{order.status}')"
        )

    all_accepted = True
    any_accepted = False

    for item in order.items:
        qty_acc = accepted_items.get(item.id, item.quantity_ordered)
        if qty_acc > item.quantity_ordered:
            qty_acc = item.quantity_ordered
        item.quantity_accepted = qty_acc
        if qty_acc < item.quantity_ordered:
            all_accepted = False
        if qty_acc > 0:
            any_accepted = True
            # Atomically reserve stock in seller's branch
            reserve_stock_for_dealer_order(
                db=db,
                business_id=seller_business_id,
                branch_id=order.seller_branch_id or 1,
                variant_id=item.seller_variant_id,
                quantity=qty_acc,
                order_number=order.order_number,
                user_id=user_id
            )

    if not any_accepted:
        raise HTTPException(status_code=400, detail="Cannot accept 0 quantity on all items. Use reject instead.")

    order.status = "ACCEPTED" if all_accepted else "PARTIAL_ACCEPTED"
    if assigned_staff_id:
        order.assigned_staff_id = assigned_staff_id

    # Notify buyer
    notif = Notification(
        business_id=order.buyer_business_id,
        title=f"Order #{order.order_number} {order.status}",
        message="Your order has been approved and reserved by the seller.",
        notification_type="DEALER_ORDER",
        action_url="/dealers"
    )
    db.add(notif)
    db.commit()
    db.refresh(order)
    return order

def reject_dealer_order(
    db: Session,
    seller_business_id: int,
    order_id: int,
    reason: str,
    user_id: Optional[int] = None
) -> DealerOrder:
    order = db.query(DealerOrder).filter(
        DealerOrder.id == order_id,
        DealerOrder.seller_business_id == seller_business_id
    ).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Dealer order not found")

    if order.status not in ["SUBMITTED", "RECEIVED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order already processed (Current status: '{order.status}')"
        )

    order.status = "REJECTED"
    order.rejection_reason = reason

    notif = Notification(
        business_id=order.buyer_business_id,
        title=f"Order #{order.order_number} Rejected",
        message=f"Order rejected by seller. Reason: {reason}",
        notification_type="DEALER_ORDER",
        action_url="/dealers"
    )
    db.add(notif)
    db.commit()
    db.refresh(order)
    return order

def mark_dealer_order_processing(
    db: Session,
    seller_business_id: int,
    order_id: int,
    user_id: Optional[int] = None
) -> DealerOrder:
    order = db.query(DealerOrder).filter(
        DealerOrder.id == order_id,
        DealerOrder.seller_business_id == seller_business_id
    ).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Dealer order not found")

    if order.status not in ["ACCEPTED", "PARTIAL_ACCEPTED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order cannot transition to PROCESSING from '{order.status}'"
        )

    order.status = "PROCESSING"
    db.commit()
    db.refresh(order)
    return order

def mark_dealer_order_packed(
    db: Session,
    seller_business_id: int,
    order_id: int,
    user_id: Optional[int] = None
) -> DealerOrder:
    order = db.query(DealerOrder).filter(
        DealerOrder.id == order_id,
        DealerOrder.seller_business_id == seller_business_id
    ).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Dealer order not found")

    if order.status not in ["ACCEPTED", "PARTIAL_ACCEPTED", "PROCESSING"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order cannot transition to PACKED from '{order.status}'"
        )

    order.status = "PACKED"
    db.commit()
    db.refresh(order)
    return order

def assign_dealer_order_staff(
    db: Session,
    seller_business_id: int,
    order_id: int,
    staff_id: int
) -> DealerOrder:
    order = db.query(DealerOrder).filter(
        DealerOrder.id == order_id,
        DealerOrder.seller_business_id == seller_business_id
    ).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Dealer order not found")

    order.assigned_staff_id = staff_id
    notif = Notification(
        business_id=seller_business_id,
        user_id=staff_id,
        title=f"Order #{order.order_number} Assigned to You",
        message=f"You have been assigned to fulfill and dispatch Order #{order.order_number}.",
        notification_type="DEALER_ORDER",
        action_url="/dealers"
    )
    db.add(notif)
    db.commit()
    db.refresh(order)
    return order

def dispatch_dealer_order(
    db: Session,
    seller_business_id: int,
    order_id: int,
    transporter_name: str,
    lr_number: str,
    user_id: Optional[int] = None
) -> DealerOrder:
    order = db.query(DealerOrder).filter(
        DealerOrder.id == order_id,
        DealerOrder.seller_business_id == seller_business_id
    ).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Dealer order not found")

    if order.status not in ["ACCEPTED", "PARTIAL_ACCEPTED", "PROCESSING", "PACKED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order already processed (Current status: '{order.status}')"
        )

    for item in order.items:
        qty_to_dispatch = item.quantity_accepted if item.quantity_accepted > 0 else item.quantity_ordered
        item.quantity_dispatched = qty_to_dispatch
        dispatch_reserved_dealer_stock(
            db=db,
            business_id=seller_business_id,
            branch_id=order.seller_branch_id or 1,
            variant_id=item.seller_variant_id,
            quantity=qty_to_dispatch,
            order_number=order.order_number,
            user_id=user_id
        )

    order.status = "DISPATCHED"
    order.transporter_name = transporter_name
    order.lr_number = lr_number

    # Notify buyer
    notif = Notification(
        business_id=order.buyer_business_id,
        title=f"Dispatched: Order #{order.order_number}",
        message=f"Dispatched via {transporter_name} (LR: {lr_number}).",
        notification_type="DEALER_ORDER",
        action_url="/dealers"
    )
    db.add(notif)
    db.commit()
    db.refresh(order)
    return order

def mark_dealer_order_delivered(
    db: Session,
    buyer_business_id: int,
    order_id: int,
    user_id: Optional[int] = None
) -> DealerOrder:
    order = db.query(DealerOrder).filter(
        DealerOrder.id == order_id,
        DealerOrder.buyer_business_id == buyer_business_id
    ).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Dealer order not found")

    if order.status in ["DELIVERED", "CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order already processed (Current status: '{order.status}')"
        )

    if order.status != "DISPATCHED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only DISPATCHED orders can be marked delivered (Current status: '{order.status}')"
        )

    buyer_branch = db.query(Branch).filter(Branch.business_id == buyer_business_id).first()
    target_branch_id = order.buyer_branch_id or (buyer_branch.id if buyer_branch else 1)

    # Auto-add stock to the BUYER's store inventory
    for item in order.items:
        qty_received = item.quantity_dispatched if item.quantity_dispatched > 0 else item.quantity_accepted
        if qty_received > 0:
            receive_purchase_stock(
                db=db,
                business_id=buyer_business_id,
                branch_id=target_branch_id,
                variant_id=item.seller_variant_id,
                quantity=qty_received,
                grn_number=f"GRN-DEALER-{order.order_number}",
                user_id=user_id
            )

    order.status = "DELIVERED"

    # Notify seller that buyer confirmed delivery
    notif = Notification(
        business_id=order.seller_business_id,
        title=f"Delivered: Order #{order.order_number}",
        message=f"Buyer has confirmed receipt of goods for Order #{order.order_number}.",
        notification_type="DEALER_ORDER",
        action_url="/dealers"
    )
    db.add(notif)
    db.commit()
    db.refresh(order)
    return order

def close_dealer_order(
    db: Session,
    buyer_business_id: int,
    order_id: int,
    user_id: Optional[int] = None
) -> DealerOrder:
    order = db.query(DealerOrder).filter(
        DealerOrder.id == order_id,
        (DealerOrder.buyer_business_id == buyer_business_id) | (DealerOrder.seller_business_id == buyer_business_id)
    ).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Dealer order not found")

    if order.status not in ["DELIVERED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot close order in '{order.status}' status. Only DELIVERED orders can be closed."
        )

    order.status = "CLOSED"
    db.commit()
    db.refresh(order)
    return order
