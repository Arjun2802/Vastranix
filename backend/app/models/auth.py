import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class UserRole(str, enum.Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    BRANCH_MANAGER = "BRANCH_MANAGER"
    CASHIER = "CASHIER"
    INVENTORY_MGR = "INVENTORY_MGR"
    PURCHASE_MGR = "PURCHASE_MGR"
    ACCOUNTANT = "ACCOUNTANT"
    DISPATCHER = "DISPATCHER"
    AUDITOR = "AUDITOR"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    phone = Column(String(50), nullable=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    memberships = relationship("UserMembership", back_populates="user", foreign_keys="[UserMembership.user_id]", cascade="all, delete-orphan")

class Business(Base):
    __tablename__ = "businesses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    legal_name = Column(String(255), nullable=True)
    gstin = Column(String(50), nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    currency = Column(String(10), default="INR")
    timezone = Column(String(50), default="Asia/Kolkata")
    language = Column(String(10), default="en")
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    pincode = Column(String(20), nullable=True)
    country = Column(String(100), default="India")
    logo_url = Column(String(500), nullable=True)
    upi_id = Column(String(100), nullable=True)
    upi_qr_url = Column(String(500), nullable=True)
    default_invoice_theme = Column(String(50), default="CLASSIC_GST")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    branches = relationship("Branch", back_populates="business", cascade="all, delete-orphan")
    memberships = relationship("UserMembership", back_populates="business", cascade="all, delete-orphan")

class Branch(Base):
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=False)
    address = Column(Text, nullable=True)
    phone = Column(String(50), nullable=True)
    is_main = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    business = relationship("Business", back_populates="branches")

class UserMembership(Base):
    __tablename__ = "user_memberships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(50), default="OWNER")
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, default=True)
    is_approved = Column(Boolean, default=True) # False for pending staff self-signups
    approved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", foreign_keys=[user_id], back_populates="memberships")
    business = relationship("Business", back_populates="memberships")
