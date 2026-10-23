from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Text
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class InventoryLevel(Base):
    __tablename__ = "inventory_levels"

    id = Column(Integer, primary_key=True, index=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    on_hand = Column(Integer, default=0)
    reserved = Column(Integer, default=0)
    in_transit = Column(Integer, default=0)
    damaged = Column(Integer, default=0)
    rack_location = Column(String(50), nullable=True) # e.g. Rack A-12, Bin 4
    last_counted_at = Column(DateTime, nullable=True)

    variant = relationship("ProductVariant", back_populates="inventory_levels")
    branch = relationship("Branch")

    @property
    def available(self) -> int:
        return max(0, self.on_hand - self.reserved)

class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(Integer, ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False)
    movement_type = Column(String(50), nullable=False) # PURCHASE_RECEIPT, POS_SALE, SALE_RETURN, PURCHASE_RETURN, ADJUSTMENT, TRANSFER_IN, TRANSFER_OUT, DEALER_RESERVATION, DEALER_DISPATCH
    quantity = Column(Integer, nullable=False) # Positive or negative
    balance_after = Column(Integer, nullable=False)
    reference_id = Column(String(100), nullable=True)
    reference_type = Column(String(50), nullable=True) # INVOICE, PO, DEALER_ORDER, CYCLE_COUNT
    note = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class StockAdjustment(Base):
    __tablename__ = "stock_adjustments"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(Integer, ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False)
    adjustment_type = Column(String(50), nullable=False) # DAMAGE, LOSS, CORRECTION, AUDIT
    quantity_change = Column(Integer, nullable=False) # e.g. -2, +5
    reason = Column(Text, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
