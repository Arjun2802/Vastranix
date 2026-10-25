from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
from backend.app.core.database import get_db
from backend.app.core.security import verify_password, get_password_hash, create_access_token
from backend.app.core.permissions import get_current_user, get_tenant_context, TenantContext, require_roles
from backend.app.models.auth import User, Business, Branch, UserMembership, UserRole
from datetime import datetime, timezone
from backend.app.schemas.all_schemas import UserLoginSchema, UserRegisterSchema, StaffInviteSchema, StaffSelfRegisterSchema

router = APIRouter(prefix="/auth", tags=["Authentication & Staff"])

@router.get("/public-stores")
def get_public_stores(db: Session = Depends(get_db)):
    """Returns available businesses/stores for staff registration dropdown."""
    stores = db.query(Business).order_by(Business.name.asc()).all()
    results = []
    for s in stores:
        main_br = db.query(Branch).filter(Branch.business_id == s.id, Branch.is_main == True).first()
        results.append({
            "id": s.id,
            "name": s.name,
            "city": s.city,
            "main_branch_id": main_br.id if main_br else None,
            "main_branch_name": main_br.name if main_br else "Main Store"
        })
    return results

@router.post("/staff-signup")
def register_staff(data: StaffSelfRegisterSchema, db: Session = Depends(get_db)):
    """Public endpoint allowing a staff member to request an account under a specific store."""
    business = db.query(Business).filter(Business.id == data.business_id).first()
    if not business:
        raise HTTPException(status_code=404, detail="Selected store does not exist")

    # Check if user already exists
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        user = User(
            email=data.email,
            phone=data.phone,
            full_name=data.full_name,
            hashed_password=get_password_hash(data.password),
            is_active=True
        )
        db.add(user)
        db.flush()

    # Check if membership already exists
    existing_mem = db.query(UserMembership).filter(
        UserMembership.user_id == user.id,
        UserMembership.business_id == business.id
    ).first()
    if existing_mem:
        if not existing_mem.is_approved:
            raise HTTPException(
                status_code=400,
                detail=f"You already have a pending registration for '{business.name}'. Please wait for store admin approval."
            )
        raise HTTPException(
            status_code=400,
            detail=f"You are already an active staff member of '{business.name}'. Please sign in."
        )

    # Resolve branch
    branch_id = data.branch_id
    if not branch_id:
        main_br = db.query(Branch).filter(Branch.business_id == business.id, Branch.is_main == True).first()
        branch_id = main_br.id if main_br else None

    # Create unapproved membership requiring store admin approval
    membership = UserMembership(
        user_id=user.id,
        business_id=business.id,
        role=data.role or "CASHIER",
        branch_id=branch_id,
        is_active=True,
        is_approved=False # Staff must be approved by store admin before login
    )
    db.add(membership)
    db.commit()

    return {
        "message": f"Staff registration submitted successfully. Your account is pending approval by the Store Administrator of '{business.name}' before you can log in.",
        "status": "PENDING_APPROVAL",
        "store_name": business.name,
        "staff_name": user.full_name,
        "role": membership.role
    }

@router.post("/register")
def register_business(data: UserRegisterSchema, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # 1. Create User
    user = User(
        email=data.email,
        phone=data.phone,
        full_name=data.full_name,
        hashed_password=get_password_hash(data.password),
        is_active=True
    )
    db.add(user)
    db.flush()

    # 2. Create Business
    business = Business(
        name=data.business_name,
        legal_name=data.business_name,
        currency=data.currency or "INR",
        language=data.language or "en",
        country=data.country or "India",
        city=data.city,
        state=data.state,
        gstin=data.gstin,
        phone=data.phone,
        email=data.email
    )
    db.add(business)
    db.flush()

    # 3. Create Main Branch
    main_branch = Branch(
        business_id=business.id,
        name="Main Store & Headquarters",
        code="MAIN-01",
        is_main=True,
        is_active=True,
        phone=data.phone,
        address=f"{data.city or ''}, {data.state or ''}"
    )
    db.add(main_branch)
    db.flush()

    # 4. Create Owner Membership
    membership = UserMembership(
        user_id=user.id,
        business_id=business.id,
        role=UserRole.OWNER.value,
        branch_id=main_branch.id,
        is_active=True
    )
    db.add(membership)
    db.commit()

    token = create_access_token(data={"sub": str(user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
        },
        "business": {
            "id": business.id,
            "name": business.name,
            "currency": business.currency,
            "role": "OWNER",
            "branch_id": main_branch.id
        }
    }

@router.post("/login")
def login(data: UserLoginSchema, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email, User.is_active == True).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check for pending approvals
    all_mems = db.query(UserMembership).filter(UserMembership.user_id == user.id, UserMembership.is_active == True).all()
    approved_mems = [m for m in all_mems if m.is_approved]
    pending_mems = [m for m in all_mems if not m.is_approved]

    if not approved_mems:
        if pending_mems:
            b = db.query(Business).filter(Business.id == pending_mems[0].business_id).first()
            store_name = b.name if b else "the store"
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your staff account for '{store_name}' is currently pending approval by the Store Administrator. Please wait for store admin approval before logging in."
            )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not belong to any active store.")

    businesses_list = []
    for m in approved_mems:
        b = db.query(Business).filter(Business.id == m.business_id).first()
        br = db.query(Branch).filter(Branch.id == m.branch_id).first() if m.branch_id else None
        if b:
            is_staff = m.role not in ["OWNER", "ADMIN"]
            businesses_list.append({
                "id": b.id,
                "name": b.name,
                "store_name": b.name,
                "role": m.role,
                "is_staff": is_staff,
                "branch_id": m.branch_id,
                "branch_name": br.name if br else "Main Store"
            })

    token = create_access_token(data={"sub": str(user.id)})
    active_biz = businesses_list[0] if businesses_list else None

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
        },
        "businesses": businesses_list,
        "active_business": active_biz,
        "store_name": active_biz["store_name"] if active_biz else None,
        "is_staff": active_biz["is_staff"] if active_biz else False
    }

@router.get("/pending-staff")
def list_pending_staff(
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN"])),
    db: Session = Depends(get_db)
):
    """Store Admin: Lists pending staff account approval requests."""
    pending = db.query(UserMembership).filter(
        UserMembership.business_id == ctx.business.id,
        UserMembership.is_approved == False
    ).all()

    results = []
    for m in pending:
        u = db.query(User).filter(User.id == m.user_id).first()
        br = db.query(Branch).filter(Branch.id == m.branch_id).first() if m.branch_id else None
        if u:
            results.append({
                "membership_id": m.id,
                "user_id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "phone": u.phone,
                "role": m.role,
                "branch_name": br.name if br else "Main Store",
                "requested_at": m.created_at.strftime("%d-%b-%Y %H:%M") if m.created_at else ""
            })
    return results

@router.post("/staff/{membership_id}/approve")
def approve_staff(
    membership_id: int,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN"])),
    db: Session = Depends(get_db)
):
    """Store Admin: Approves a pending staff account."""
    mem = db.query(UserMembership).filter(
        UserMembership.id == membership_id,
        UserMembership.business_id == ctx.business.id
    ).first()
    if not mem:
        raise HTTPException(status_code=404, detail="Staff membership request not found")

    mem.is_approved = True
    mem.approved_by = ctx.user.id
    mem.approved_at = datetime.now(timezone.utc)
    db.commit()

    u = db.query(User).filter(User.id == mem.user_id).first()
    return {
        "message": f"Staff member '{u.full_name if u else ''}' approved successfully. They can now log in.",
        "membership_id": mem.id,
        "is_approved": True
    }

@router.post("/staff/{membership_id}/reject")
def reject_staff(
    membership_id: int,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN"])),
    db: Session = Depends(get_db)
):
    """Store Admin: Rejects a pending staff account request."""
    mem = db.query(UserMembership).filter(
        UserMembership.id == membership_id,
        UserMembership.business_id == ctx.business.id
    ).first()
    if not mem:
        raise HTTPException(status_code=404, detail="Staff membership request not found")

    db.delete(mem)
    db.commit()
    return {"message": "Staff membership request rejected and removed."}

@router.post("/refresh")
def refresh_token(current_user: User = Depends(get_current_user)):
    """Refreshes an active session token."""
    new_token = create_access_token(data={"sub": str(current_user.id)})
    return {
        "access_token": new_token,
        "token_type": "bearer",
        "user_id": current_user.id
    }

@router.post("/staff/{membership_id}/toggle-status")
def toggle_staff_status(
    membership_id: int,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN"])),
    db: Session = Depends(get_db)
):
    """Store Admin: Activates or deactivates a staff member."""
    mem = db.query(UserMembership).filter(
        UserMembership.id == membership_id,
        UserMembership.business_id == ctx.business.id
    ).first()
    if not mem:
        raise HTTPException(status_code=404, detail="Staff membership not found")
    if mem.role == UserRole.OWNER.value:
        raise HTTPException(status_code=400, detail="Cannot deactivate the primary store owner")

    mem.is_active = not mem.is_active
    db.commit()
    status_str = "activated" if mem.is_active else "deactivated"
    return {"message": f"Staff member successfully {status_str}", "membership_id": mem.id, "is_active": mem.is_active}

@router.post("/staff/{membership_id}/role")
def update_staff_role(
    membership_id: int,
    data: dict,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN"])),
    db: Session = Depends(get_db)
):
    """Store Admin: Changes a staff member's role."""
    role = data.get("role")
    if not role:
        raise HTTPException(status_code=400, detail="Role is required")

    mem = db.query(UserMembership).filter(
        UserMembership.id == membership_id,
        UserMembership.business_id == ctx.business.id
    ).first()
    if not mem:
        raise HTTPException(status_code=404, detail="Staff membership not found")
    if mem.role == UserRole.OWNER.value and role != UserRole.OWNER.value:
        raise HTTPException(status_code=400, detail="Cannot change role of primary store owner")

    mem.role = role
    db.commit()
    return {"message": f"Staff role updated to {role}", "membership_id": mem.id, "role": mem.role}

@router.post("/staff/{membership_id}/revoke-sessions")
def revoke_staff_sessions(
    membership_id: int,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN"])),
    db: Session = Depends(get_db)
):
    """Store Admin: Revokes all active sessions for a staff member."""
    mem = db.query(UserMembership).filter(
        UserMembership.id == membership_id,
        UserMembership.business_id == ctx.business.id
    ).first()
    if not mem:
        raise HTTPException(status_code=404, detail="Staff membership not found")
    if mem.role == UserRole.OWNER.value:
        raise HTTPException(status_code=400, detail="Cannot revoke sessions of primary store owner")

    staff_user = db.query(User).filter(User.id == mem.user_id).first()
    return {
        "message": f"Active sessions revoked for '{staff_user.full_name if staff_user else 'staff'}'. User will be required to re-authenticate.",
        "membership_id": mem.id,
        "sessions_revoked": True
    }

@router.get("/me")
def get_current_user_profile(ctx: TenantContext = Depends(get_tenant_context)):
    return {
        "user": {
            "id": ctx.user.id,
            "email": ctx.user.email,
            "full_name": ctx.user.full_name,
        },
        "business": {
            "id": ctx.business.id,
            "name": ctx.business.name,
            "gstin": ctx.business.gstin,
            "currency": ctx.business.currency,
            "upi_id": ctx.business.upi_id,
            "default_invoice_theme": ctx.business.default_invoice_theme
        },
        "role": ctx.role,
        "branch": {
            "id": ctx.branch.id if ctx.branch else None,
            "name": ctx.branch.name if ctx.branch else None,
            "code": ctx.branch.code if ctx.branch else None
        } if ctx.branch else None
    }

@router.post("/staff")
def invite_staff(
    data: StaffInviteSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN"])),
    db: Session = Depends(get_db)
):
    # Check if user already exists
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        user = User(
            email=data.email,
            full_name=data.full_name,
            hashed_password=get_password_hash(data.password),
            is_active=True
        )
        db.add(user)
        db.flush()

    existing_mem = db.query(UserMembership).filter(
        UserMembership.user_id == user.id,
        UserMembership.business_id == ctx.business.id
    ).first()
    if existing_mem:
        raise HTTPException(status_code=400, detail="Staff member is already part of this business")

    membership = UserMembership(
        user_id=user.id,
        business_id=ctx.business.id,
        role=data.role,
        branch_id=data.branch_id or (ctx.branch.id if ctx.branch else None),
        is_active=True
    )
    db.add(membership)
    db.commit()

    return {"message": "Staff member created and assigned successfully", "user_id": user.id, "role": data.role}

@router.get("/staff")
def list_staff(
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN"])),
    db: Session = Depends(get_db)
):
    memberships = db.query(UserMembership).filter(UserMembership.business_id == ctx.business.id).all()
    results = []
    for m in memberships:
        u = db.query(User).filter(User.id == m.user_id).first()
        branch = db.query(Branch).filter(Branch.id == m.branch_id).first() if m.branch_id else None
        if u:
            results.append({
                "id": u.id,
                "membership_id": m.id,
                "email": u.email,
                "full_name": u.full_name,
                "role": m.role,
                "branch_name": branch.name if branch else "All Branches",
                "is_active": m.is_active
            })
    return results
