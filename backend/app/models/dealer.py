from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Text, Boolean
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class DealerConnection(Base):
    __tablename__ = "dealer_connections"

    id = Column(Integer, primary_key=True, index=True)
    requester_business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    target_business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), default="CONNECTED") # PENDING, CONNECTED, REJECTED, BLOCKED
    connection_type = Column(String(50), default="BUYER_SELLER") # Requester is Buyer, Target is Seller
    price_tier = Column(String(50), default="DEALER") # RETAIL, WHOLESALE, DEALER, SPECIAL_NEGOTIATED
    credit_limit = Column(Numeric(12, 2), default=500000.00)
    payment_terms = Column(String(100), default="15 Days")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    requester_business = relationship("Business", foreign_keys=[requester_business_id])
    target_business = relationship("Business", foreign_keys=[target_business_id])

class DealerOrder(Base):
    __tablename__ = "dealer_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(100), unique=True, index=True, nullable=False)
    buyer_business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    seller_business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    buyer_branch_id = Column(Integer, ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    seller_branch_id = Column(Integer, ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    
    # Draft -> Submitted -> Received -> Accepted / Partially Accepted / Rejected -> Processing -> Packed -> Dispatched -> Delivered -> Closed
    status = Column(String(50), default="SUBMITTED")
    
    subtotal = Column(Numeric(12, 2), default=0.00)
    tax_amount = Column(Numeric(12, 2), default=0.00)
    total_amount = Column(Numeric(12, 2), default=0.00)
    
    transporter_name = Column(String(255), nullable=True)
    lr_number = Column(String(100), nullable=True) # Lorry Receipt Number
    tracking_url = Column(String(500), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    assigned_staff_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    buyer_business = relationship("Business", foreign_keys=[buyer_business_id])
    seller_business = relationship("Business", foreign_keys=[seller_business_id])
    assigned_staff = relationship("User", foreign_keys=[assigned_staff_id])
    items = relationship("DealerOrderItem", back_populates="dealer_order", cascade="all, delete-orphan")

class DealerOrderItem(Base):
    __tablename__ = "dealer_order_items"

    id = Column(Integer, primary_key=True, index=True)
    dealer_order_id = Column(Integer, ForeignKey("dealer_orders.id", ondelete="CASCADE"), nullable=False)
    seller_variant_id = Column(Integer, ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False)
    product_name = Column(String(255), nullable=False)
    size = Column(String(50), nullable=False)
    color = Column(String(50), nullable=False)
    sku = Column(String(100), nullable=False)
    
    quantity_ordered = Column(Integer, nullable=False)
    quantity_accepted = Column(Integer, default=0)
    quantity_dispatched = Column(Integer, default=0)
    
    unit_price = Column(Numeric(12, 2), nullable=False)
    tax_rate = Column(Numeric(5, 2), default=5.00)
    line_total = Column(Numeric(12, 2), nullable=False)

    dealer_order = relationship("DealerOrder", back_populates="items")
    seller_variant = relationship("ProductVariant")
