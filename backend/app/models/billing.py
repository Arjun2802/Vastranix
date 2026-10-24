from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Text, Boolean
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    phone = Column(String(50), index=True, nullable=True)
    email = Column(String(255), nullable=True)
    gstin = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    credit_limit = Column(Numeric(12, 2), default=0.00)
    outstanding_balance = Column(Numeric(12, 2), default=0.00)
    price_list_type = Column(String(50), default="RETAIL") # RETAIL, WHOLESALE, DEALER
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    invoice_number = Column(String(100), unique=True, index=True, nullable=False)
    invoice_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    due_date = Column(DateTime, nullable=True)
    
    subtotal = Column(Numeric(12, 2), default=0.00)
    discount_amount = Column(Numeric(12, 2), default=0.00)
    tax_amount = Column(Numeric(12, 2), default=0.00)
    total_amount = Column(Numeric(12, 2), default=0.00)
    paid_amount = Column(Numeric(12, 2), default=0.00)
    balance_due = Column(Numeric(12, 2), default=0.00)
    
    payment_status = Column(String(50), default="PAID") # PAID, PARTIAL, UNPAID, REFUNDED
    payment_mode = Column(String(50), default="CASH") # CASH, UPI, CARD, BANK_TRANSFER, SPLIT, CREDIT
    invoice_theme = Column(String(50), default="CLASSIC_GST") # CLASSIC_GST, MODERN_MINIMAL, PREMIUM_BOUTIQUE, WHOLESALE_DEALER, COMPACT_THERMAL, INTERNATIONAL_COMMERCIAL
    status = Column(String(50), default="POSTED") # POSTED, VOIDED, CANCELLED
    
    cashier_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    idempotency_key = Column(String(100), unique=True, index=True, nullable=True)
    pdf_filename = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    terms_conditions = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    customer = relationship("Customer")
    branch = relationship("Branch")
    cashier = relationship("User")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice", cascade="all, delete-orphan")

class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(Integer, ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True)
    product_name = Column(String(255), nullable=False)
    size = Column(String(50), nullable=True)
    color = Column(String(50), nullable=True)
    sku = Column(String(100), nullable=True)
    hsn_sac = Column(String(50), default="6205")
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    discount_percent = Column(Numeric(5, 2), default=0.00)
    tax_rate = Column(Numeric(5, 2), default=5.00)
    tax_amount = Column(Numeric(12, 2), default=0.00)
    line_total = Column(Numeric(12, 2), nullable=False)

    invoice = relationship("Invoice", back_populates="items")
    variant = relationship("ProductVariant")

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_mode = Column(String(50), nullable=False) # CASH, UPI, CARD, BANK_TRANSFER, CHEQUE
    reference_number = Column(String(100), nullable=True) # UPI UTR, Card auth code, Cheque no.
    verified = Column(Boolean, default=True)
    verified_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    cashier_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    invoice = relationship("Invoice", back_populates="payments")

class CreditNote(Base):
    __tablename__ = "credit_notes"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    credit_note_number = Column(String(100), unique=True, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    reason = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
