from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Numeric, Text
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)

class Brand(Base):
    __tablename__ = "brands"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    brand_id = Column(Integer, ForeignKey("brands.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=True)
    description = Column(Text, nullable=True)
    fabric = Column(String(100), nullable=True)  # Cotton, Linen, Silk, Denim, Rayon, Wool, etc.
    material = Column(String(100), nullable=True) # 100% Combed Cotton, 60/40 Blend, etc.
    pattern = Column(String(100), nullable=True)  # Solid, Checked, Striped, Floral, Printed
    season = Column(String(100), nullable=True)   # Summer 2026, Festive, Winter, All-Season
    gender = Column(String(50), nullable=True)    # Men, Women, Unisex, Kids, Boys, Girls
    fit = Column(String(50), nullable=True)       # Slim, Regular, Relaxed, Tailored, Oversized
    hsn_sac = Column(String(50), default="6205")  # Textile garment HSN code
    tax_rate = Column(Numeric(5, 2), default=5.00) # Standard 5% or 12% GST
    base_purchase_cost = Column(Numeric(12, 2), default=0.00)
    base_retail_price = Column(Numeric(12, 2), default=0.00)
    base_wholesale_price = Column(Numeric(12, 2), default=0.00)
    base_dealer_price = Column(Numeric(12, 2), default=0.00)
    unit_of_measure = Column(String(20), default="PCS")
    image_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")

class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    sku = Column(String(100), unique=True, index=True, nullable=False)
    barcode = Column(String(100), index=True, nullable=True)
    size = Column(String(50), nullable=False)     # S, M, L, XL, XXL, 32, 34, 36, Free Size
    color = Column(String(50), nullable=False)    # Indigo Navy, Olive, Ivory White, Maroon
    color_hex = Column(String(10), default="#25313B")
    purchase_cost = Column(Numeric(12, 2), default=0.00)
    retail_price = Column(Numeric(12, 2), default=0.00)
    wholesale_price = Column(Numeric(12, 2), default=0.00)
    dealer_price = Column(Numeric(12, 2), default=0.00)
    min_stock_alert = Column(Integer, default=5)
    is_active = Column(Boolean, default=True)

    product = relationship("Product", back_populates="variants")
    inventory_levels = relationship("InventoryLevel", back_populates="variant", cascade="all, delete-orphan")
