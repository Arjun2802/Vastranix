from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Text, Boolean
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class OnlineStorefront(Base):
    __tablename__ = "online_storefronts"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), unique=True, nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False) # e.g. "vastrenix-boutique"
    title = Column(String(255), nullable=False)
    tagline = Column(String(255), nullable=True)
    is_enabled = Column(Boolean, default=True)
    currency = Column(String(10), default="INR")
    banner_url = Column(String(500), nullable=True)
    return_policy = Column(Text, nullable=True)
    shipping_policy = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class OnlineOrder(Base):
    __tablename__ = "online_orders"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    order_number = Column(String(100), unique=True, index=True, nullable=False)
    customer_name = Column(String(255), nullable=False)
    customer_phone = Column(String(50), nullable=False)
    customer_email = Column(String(255), nullable=True)
    shipping_address = Column(Text, nullable=False)
    city = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)
    pincode = Column(String(20), nullable=False)
    
    total_amount = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(50), default="COD") # COD, UPI_PREPAID, CARD
    payment_status = Column(String(50), default="PENDING") # PENDING, PAID, REFUNDED
    order_status = Column(String(50), default="NEW") # NEW, CONFIRMED, DISPATCHED, DELIVERED, CANCELLED
    tracking_number = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    items = relationship("OnlineOrderItem", back_populates="order", cascade="all, delete-orphan")

class OnlineOrderItem(Base):
    __tablename__ = "online_order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("online_orders.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(Integer, ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False)
    product_name = Column(String(255), nullable=False)
    size = Column(String(50), nullable=False)
    color = Column(String(50), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    line_total = Column(Numeric(12, 2), nullable=False)

    order = relationship("OnlineOrder", back_populates="items")
    variant = relationship("ProductVariant")
