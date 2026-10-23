from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from backend.app.core.database import get_db
from backend.app.core.permissions import get_tenant_context, TenantContext, require_roles
from backend.app.models.product import Product, ProductVariant, Category, Brand
from backend.app.models.inventory import InventoryLevel, StockMovement
from backend.app.schemas.all_schemas import ProductCreateSchema

router = APIRouter(prefix="/products", tags=["Inventory & Garment Catalog"])

@router.post("/")
def create_product(
    data: ProductCreateSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "INVENTORY_MGR"])),
    db: Session = Depends(get_db)
):
    # Create Product
    product = Product(
        business_id=ctx.business.id,
        category_id=data.category_id,
        brand_id=data.brand_id,
        name=data.name,
        code=data.code,
        description=data.description,
        fabric=data.fabric,
        material=data.material,
        pattern=data.pattern,
        season=data.season,
        gender=data.gender,
        fit=data.fit,
        hsn_sac=data.hsn_sac or "6205",
        tax_rate=data.tax_rate,
        unit_of_measure=data.unit_of_measure or "PCS",
        image_url=data.image_url,
        is_active=True
    )
    db.add(product)
    db.flush()

    # Create Variants
    created_variants = []
    for var in data.variants:
        variant = ProductVariant(
            product_id=product.id,
            sku=var.sku,
            barcode=var.barcode or var.sku,
            size=var.size,
            color=var.color,
            color_hex=var.color_hex or "#25313B",
            purchase_cost=var.purchase_cost,
            retail_price=var.retail_price,
            wholesale_price=var.wholesale_price,
            dealer_price=var.dealer_price,
            min_stock_alert=var.min_stock_alert or 5,
            is_active=True
        )
        db.add(variant)
        db.flush()

        # Initialize stock in current branch if specified
        initial_qty = var.initial_stock or 0
        branch_id = ctx.branch.id if ctx.branch else 1
        level = InventoryLevel(
            variant_id=variant.id,
            branch_id=branch_id,
            on_hand=initial_qty,
            reserved=0,
            in_transit=0,
            damaged=0
        )
        db.add(level)

        if initial_qty > 0:
            movement = StockMovement(
                business_id=ctx.business.id,
                branch_id=branch_id,
                variant_id=variant.id,
                movement_type="PURCHASE_RECEIPT",
                quantity=initial_qty,
                balance_after=initial_qty,
                reference_id="INITIAL_STOCK",
                reference_type="SETUP",
                note="Initial inventory setup upon product creation",
                user_id=ctx.user.id
            )
            db.add(movement)

        created_variants.append(variant)

    db.commit()
    db.refresh(product)
    return {"message": "Product and variants created successfully", "product_id": product.id, "variants_count": len(created_variants)}

@router.get("/")
def list_products(
    search: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    query = db.query(Product).filter(Product.business_id == ctx.business.id, Product.is_active == True)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%") | Product.fabric.ilike(f"%{search}%"))
    if category_id:
        query = query.filter(Product.category_id == category_id)

    products = query.order_by(Product.id.desc()).all()
    results = []
    current_branch_id = ctx.branch.id if ctx.branch else None

    for p in products:
        variants_data = []
        for v in p.variants:
            # Query stock level for this branch
            level = None
            if current_branch_id:
                level = db.query(InventoryLevel).filter(
                    InventoryLevel.variant_id == v.id,
                    InventoryLevel.branch_id == current_branch_id
                ).first()
            variants_data.append({
                "id": v.id,
                "sku": v.sku,
                "barcode": v.barcode,
                "size": v.size,
                "color": v.color,
                "color_hex": v.color_hex,
                "purchase_cost": float(v.purchase_cost),
                "retail_price": float(v.retail_price),
                "wholesale_price": float(v.wholesale_price),
                "dealer_price": float(v.dealer_price),
                "min_stock_alert": v.min_stock_alert,
                "on_hand": level.on_hand if level else 0,
                "reserved": level.reserved if level else 0,
                "available": level.available if level else 0
            })

        results.append({
            "id": p.id,
            "name": p.name,
            "code": p.code,
            "description": p.description,
            "fabric": p.fabric,
            "material": p.material,
            "pattern": p.pattern,
            "season": p.season,
            "gender": p.gender,
            "fit": p.fit,
            "hsn_sac": p.hsn_sac,
            "tax_rate": float(p.tax_rate),
            "unit_of_measure": p.unit_of_measure,
            "image_url": p.image_url,
            "variants": variants_data
        })

    return results

@router.get("/{id}")
def get_product_details(id: int, ctx: TenantContext = Depends(get_tenant_context), db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == id, Product.business_id == ctx.business.id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    branch_id = ctx.branch.id if ctx.branch else 1
    variants = []
    for v in product.variants:
        lvl = db.query(InventoryLevel).filter(InventoryLevel.variant_id == v.id, InventoryLevel.branch_id == branch_id).first()
        variants.append({
            "id": v.id,
            "sku": v.sku,
            "barcode": v.barcode,
            "size": v.size,
            "color": v.color,
            "color_hex": v.color_hex,
            "purchase_cost": float(v.purchase_cost),
            "retail_price": float(v.retail_price),
            "wholesale_price": float(v.wholesale_price),
            "dealer_price": float(v.dealer_price),
            "available": lvl.available if lvl else 0,
            "on_hand": lvl.on_hand if lvl else 0
        })

    return {
        "id": product.id,
        "name": product.name,
        "fabric": product.fabric,
        "season": product.season,
        "hsn_sac": product.hsn_sac,
        "tax_rate": float(product.tax_rate),
        "variants": variants
    }
