from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from decimal import Decimal
from backend.app.core.database import get_db
from backend.app.core.permissions import get_tenant_context, TenantContext, require_roles
from backend.app.models.commerce import OnlineStorefront, OnlineOrder, OnlineOrderItem
from backend.app.models.auth import Business, Branch
from backend.app.models.product import Product, ProductVariant
from backend.app.models.inventory import InventoryLevel
from backend.app.services.stock_service import deduct_stock_for_sale
from backend.app.schemas.all_schemas import OnlineCheckoutSchema

router = APIRouter(prefix="/commerce", tags=["Online Storefront & Commerce"])

@router.get("/storefront/{slug}")
def get_public_storefront(slug: str, db: Session = Depends(get_db)):
    store = db.query(OnlineStorefront).filter(OnlineStorefront.slug == slug, OnlineStorefront.is_enabled == True).first()
    if not store:
        # Check if business exists, create default storefront if not created yet
        biz = db.query(Business).first()
        if not biz:
            raise HTTPException(status_code=404, detail="Storefront not found")
        store = OnlineStorefront(
            business_id=biz.id,
            slug=slug,
            title=f"{biz.name} Online Boutique",
            tagline="Handcrafted & Everyday Clothing Collections",
            is_enabled=True,
            currency=biz.currency or "INR"
        )
        db.add(store)
        db.commit()
        db.refresh(store)

    biz = db.query(Business).filter(Business.id == store.business_id).first()
    products = db.query(Product).filter(Product.business_id == store.business_id, Product.is_active == True).all()

    catalog = []
    main_branch = db.query(Branch).filter(Branch.business_id == store.business_id, Branch.is_main == True).first()
    branch_id = main_branch.id if main_branch else 1

    for p in products:
        variants = []
        for v in p.variants:
            lvl = db.query(InventoryLevel).filter(InventoryLevel.variant_id == v.id, InventoryLevel.branch_id == branch_id).first()
            if lvl and lvl.available > 0:
                variants.append({
                    "id": v.id,
                    "sku": v.sku,
                    "size": v.size,
                    "color": v.color,
                    "color_hex": v.color_hex,
                    "retail_price": float(v.retail_price),
                    "available": lvl.available
                })
        if variants:
            catalog.append({
                "id": p.id,
                "name": p.name,
                "fabric": p.fabric,
                "pattern": p.pattern,
                "gender": p.gender,
                "image_url": p.image_url,
                "variants": variants
            })

    return {
        "store": {
            "title": store.title,
            "tagline": store.tagline,
            "currency": store.currency,
            "business_name": biz.name if biz else "Vastrenix Store"
        },
        "catalog": catalog
    }

@router.post("/checkout")
def public_checkout(data: OnlineCheckoutSchema, db: Session = Depends(get_db)):
    store = db.query(OnlineStorefront).filter(OnlineStorefront.slug == data.storefront_slug).first()
    if not store:
        raise HTTPException(status_code=404, detail="Storefront not found")

    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = db.query(OnlineOrder).count() + 1
    order_num = f"WEB-{date_str}-{count:04d}"

    main_branch = db.query(Branch).filter(Branch.business_id == store.business_id, Branch.is_main == True).first()
    branch_id = main_branch.id if main_branch else 1

    total_amount = Decimal("0.00")
    order_items = []

    for it in data.items:
        variant_id = it["variant_id"]
        qty = int(it["quantity"])
        variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
        if not variant:
            raise HTTPException(status_code=404, detail=f"Variant #{variant_id} not found")
        prod = db.query(Product).filter(Product.id == variant.product_id).first()

        # Deduct authoritative stock
        deduct_stock_for_sale(
            db=db,
            business_id=store.business_id,
            branch_id=branch_id,
            variant_id=variant.id,
            quantity=qty,
            invoice_number=order_num
        )

        line_tot = variant.retail_price * qty
        total_amount += line_tot

        order_item = OnlineOrderItem(
            variant_id=variant.id,
            product_name=prod.name if prod else "Garment Item",
            size=variant.size,
            color=variant.color,
            quantity=qty,
            unit_price=variant.retail_price,
            line_total=line_tot
        )
        order_items.append(order_item)

    order = OnlineOrder(
        business_id=store.business_id,
        order_number=order_num,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        customer_email=data.customer_email,
        shipping_address=data.shipping_address,
        city=data.city,
        state=data.state,
        pincode=data.pincode,
        total_amount=total_amount,
        payment_method=data.payment_method,
        payment_status="PENDING" if data.payment_method == "COD" else "PAID",
        order_status="NEW"
    )
    db.add(order)
    db.flush()

    for item in order_items:
        item.order_id = order.id
        db.add(item)

    db.commit()
    db.refresh(order)

    return {
        "message": "Order placed successfully",
        "order_number": order.order_number,
        "total_amount": float(order.total_amount),
        "payment_method": order.payment_method,
        "order_status": order.order_status
    }

@router.get("/orders")
def list_merchant_online_orders(
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "DISPATCHER"])),
    db: Session = Depends(get_db)
):
    orders = db.query(OnlineOrder).filter(OnlineOrder.business_id == ctx.business.id).order_by(OnlineOrder.id.desc()).all()
    results = []
    for o in orders:
        items = [{
            "product_name": it.product_name,
            "size": it.size,
            "color": it.color,
            "quantity": it.quantity,
            "unit_price": float(it.unit_price)
        } for it in o.items]
        results.append({
            "id": o.id,
            "order_number": o.order_number,
            "customer_name": o.customer_name,
            "customer_phone": o.customer_phone,
            "city": o.city,
            "total_amount": float(o.total_amount),
            "payment_method": o.payment_method,
            "payment_status": o.payment_status,
            "order_status": o.order_status,
            "items": items,
            "date": o.created_at.strftime("%d-%b-%Y %H:%M")
        })
    return results
