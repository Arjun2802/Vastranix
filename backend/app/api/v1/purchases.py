from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional, List
from decimal import Decimal
from backend.app.core.database import get_db
from backend.app.core.permissions import get_tenant_context, TenantContext, require_roles
from backend.app.models.purchase import Supplier, PurchaseOrder, PurchaseOrderItem, GoodsReceipt
from backend.app.models.product import ProductVariant, Product
from backend.app.services.stock_service import receive_purchase_stock
from backend.app.schemas.all_schemas import SupplierCreateSchema, PurchaseOrderCreateSchema, GoodsReceiptCreateSchema

router = APIRouter(prefix="/purchases", tags=["Purchases & Suppliers"])

@router.post("/suppliers")
def create_supplier(
    data: SupplierCreateSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "PURCHASE_MGR"])),
    db: Session = Depends(get_db)
):
    supp = Supplier(
        business_id=ctx.business.id,
        name=data.name,
        contact_person=data.contact_person,
        phone=data.phone,
        email=data.email,
        gstin=data.gstin,
        address=data.address,
        city=data.city,
        state=data.state,
        payment_terms=data.payment_terms or "Net 30 Days",
        balance_payable=0.00
    )
    db.add(supp)
    db.commit()
    db.refresh(supp)
    return {"message": "Supplier created successfully", "id": supp.id, "name": supp.name}

@router.get("/suppliers")
def list_suppliers(
    search: Optional[str] = Query(None),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    query = db.query(Supplier).filter(Supplier.business_id == ctx.business.id)
    if search:
        query = query.filter(Supplier.name.ilike(f"%{search}%") | Supplier.contact_person.ilike(f"%{search}%"))
    return query.order_by(Supplier.name.asc()).all()

@router.post("/orders")
def create_purchase_order(
    data: PurchaseOrderCreateSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "PURCHASE_MGR"])),
    db: Session = Depends(get_db)
):
    branch_id = data.branch_id or (ctx.branch.id if ctx.branch else 1)
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    count_today = db.query(PurchaseOrder).filter(PurchaseOrder.business_id == ctx.business.id).count() + 1
    po_num = data.po_number or f"PO-{date_str}-{count_today:04d}"

    total_amount = Decimal("0.00")
    po_items = []
    for it in data.items:
        line_tot = Decimal(str(it.quantity)) * Decimal(str(it.unit_cost))
        total_amount += line_tot
        po_item = PurchaseOrderItem(
            variant_id=it.variant_id,
            quantity_ordered=it.quantity,
            quantity_received=0,
            unit_cost=it.unit_cost,
            tax_rate=it.tax_rate,
            line_total=line_tot
        )
        po_items.append(po_item)

    po = PurchaseOrder(
        business_id=ctx.business.id,
        branch_id=branch_id,
        supplier_id=data.supplier_id,
        po_number=po_num,
        status="ISSUED",
        total_amount=total_amount,
        notes=data.notes
    )
    db.add(po)
    db.flush()

    for item in po_items:
        item.purchase_order_id = po.id
        db.add(item)

    db.commit()
    db.refresh(po)
    return {"message": "Purchase order created", "po_id": po.id, "po_number": po.po_number, "total_amount": float(po.total_amount)}

@router.get("/orders")
def list_purchase_orders(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    orders = db.query(PurchaseOrder).filter(PurchaseOrder.business_id == ctx.business.id).order_by(PurchaseOrder.id.desc()).all()
    results = []
    for o in orders:
        supp = db.query(Supplier).filter(Supplier.id == o.supplier_id).first()
        results.append({
            "id": o.id,
            "po_number": o.po_number,
            "order_date": o.order_date.strftime("%d-%b-%Y"),
            "supplier_name": supp.name if supp else "N/A",
            "status": o.status,
            "total_amount": float(o.total_amount)
        })
    return results

@router.post("/grn")
def receive_goods_note(
    data: GoodsReceiptCreateSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "PURCHASE_MGR", "INVENTORY_MGR"])),
    db: Session = Depends(get_db)
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == data.purchase_order_id, PurchaseOrder.business_id == ctx.business.id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    grn_num = f"GRN-{po.po_number}"
    grn = GoodsReceipt(
        business_id=ctx.business.id,
        purchase_order_id=po.id,
        branch_id=po.branch_id,
        grn_number=grn_num,
        received_by=ctx.user.id,
        supplier_invoice_no=data.supplier_invoice_no,
        notes=data.notes
    )
    db.add(grn)
    db.flush()

    for item in po.items:
        remaining = item.quantity_ordered - item.quantity_received
        if remaining > 0:
            item.quantity_received += remaining
            # Add into physical inventory
            receive_purchase_stock(
                db=db,
                business_id=ctx.business.id,
                branch_id=po.branch_id,
                variant_id=item.variant_id,
                quantity=remaining,
                grn_number=grn_num,
                user_id=ctx.user.id
            )

    po.status = "COMPLETED"
    db.commit()
    return {"message": "Goods received into stock successfully", "grn_number": grn_num}
