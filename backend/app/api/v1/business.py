from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.permissions import get_tenant_context, TenantContext, require_roles
from backend.app.models.auth import Business, Branch
from backend.app.schemas.all_schemas import BusinessUpdateSchema, BranchCreateSchema

router = APIRouter(prefix="/business", tags=["Business & Branches"])

@router.get("/profile")
def get_business_profile(ctx: TenantContext = Depends(get_tenant_context), db: Session = Depends(get_db)):
    branches = db.query(Branch).filter(Branch.business_id == ctx.business.id).all()
    return {
        "id": ctx.business.id,
        "name": ctx.business.name,
        "legal_name": ctx.business.legal_name,
        "gstin": ctx.business.gstin,
        "phone": ctx.business.phone,
        "email": ctx.business.email,
        "currency": ctx.business.currency,
        "language": ctx.business.language,
        "address": ctx.business.address,
        "city": ctx.business.city,
        "state": ctx.business.state,
        "country": ctx.business.country,
        "upi_id": ctx.business.upi_id,
        "default_invoice_theme": ctx.business.default_invoice_theme,
        "branches": [
            {
                "id": b.id,
                "name": b.name,
                "code": b.code,
                "address": b.address,
                "phone": b.phone,
                "is_main": b.is_main,
                "is_active": b.is_active
            } for b in branches
        ]
    }

@router.put("/profile")
def update_business_profile(
    data: BusinessUpdateSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN"])),
    db: Session = Depends(get_db)
):
    biz = ctx.business
    for key, val in data.dict(exclude_unset=True).items():
        if val is not None:
            setattr(biz, key, val)
    db.commit()
    db.refresh(biz)
    return {"message": "Business profile updated successfully", "business_id": biz.id}

@router.post("/branches")
def create_branch(
    data: BranchCreateSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN"])),
    db: Session = Depends(get_db)
):
    branch = Branch(
        business_id=ctx.business.id,
        name=data.name,
        code=data.code,
        address=data.address,
        phone=data.phone,
        is_main=data.is_main or False,
        is_active=True
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return {"message": "Branch created successfully", "id": branch.id, "name": branch.name}

@router.get("/branches")
def list_branches(ctx: TenantContext = Depends(get_tenant_context), db: Session = Depends(get_db)):
    branches = db.query(Branch).filter(Branch.business_id == ctx.business.id).all()
    return branches
