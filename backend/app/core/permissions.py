from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import Optional, List
from backend.app.core.database import get_db
from backend.app.core.security import decode_access_token
from backend.app.models.auth import User, Business, UserMembership, Branch, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user

class TenantContext:
    def __init__(self, user: User, business: Business, membership: UserMembership, branch: Optional[Branch] = None):
        self.user = user
        self.business = business
        self.membership = membership
        self.branch = branch

    @property
    def role(self) -> str:
        return self.membership.role

    @property
    def business_id(self) -> int:
        return self.business.id

def get_tenant_context(
    x_business_id: Optional[int] = Header(None, alias="X-Business-ID"),
    x_branch_id: Optional[int] = Header(None, alias="X-Branch-ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> TenantContext:
    # Check if user has an unapproved membership
    unapproved = db.query(UserMembership).filter(
        UserMembership.user_id == current_user.id,
        UserMembership.is_approved == False
    ).first()

    # Query approved memberships
    query = db.query(UserMembership).filter(
        UserMembership.user_id == current_user.id,
        UserMembership.is_active == True,
        UserMembership.is_approved == True
    )
    if x_business_id:
        membership = query.filter(UserMembership.business_id == x_business_id).first()
    else:
        membership = query.first()

    if not membership:
        if unapproved:
            biz = db.query(Business).filter(Business.id == unapproved.business_id).first()
            store_name = biz.name if biz else "your store"
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your staff account is currently pending approval by the Store Administrator of '{store_name}'. Please wait for admin approval before logging in."
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to any active business or specified business"
        )

    business = db.query(Business).filter(Business.id == membership.business_id).first()
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    branch = None
    if x_branch_id:
        branch = db.query(Branch).filter(Branch.id == x_branch_id, Branch.business_id == business.id).first()
    elif membership.branch_id:
        branch = db.query(Branch).filter(Branch.id == membership.branch_id).first()
    else:
        branch = db.query(Branch).filter(Branch.business_id == business.id, Branch.is_main == True).first()
        if not branch:
            branch = db.query(Branch).filter(Branch.business_id == business.id).first()

    return TenantContext(user=current_user, business=business, membership=membership, branch=branch)

def require_roles(allowed_roles: List[str]):
    def role_checker(ctx: TenantContext = Depends(get_tenant_context)) -> TenantContext:
        # OWNER and ADMIN have access to all modules
        if ctx.membership.role in ["OWNER", "ADMIN"]:
            return ctx
        if ctx.membership.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role in {allowed_roles}, your role is {ctx.membership.role}"
            )
        return ctx
    return role_checker
