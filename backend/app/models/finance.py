from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Text
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class CashShift(Base):
    __tablename__ = "cash_shifts"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    cashier_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    opened_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    closed_at = Column(DateTime, nullable=True)
    opening_cash = Column(Numeric(12, 2), default=0.00)
    expected_closing_cash = Column(Numeric(12, 2), default=0.00)
    actual_closing_cash = Column(Numeric(12, 2), default=0.00)
    difference = Column(Numeric(12, 2), default=0.00)
    status = Column(String(50), default="OPEN") # OPEN, CLOSED
    notes = Column(Text, nullable=True)

    cashier = relationship("User")
    transactions = relationship("CashShiftTransaction", back_populates="shift", cascade="all, delete-orphan")

class CashShiftTransaction(Base):
    __tablename__ = "cash_shift_transactions"

    id = Column(Integer, primary_key=True, index=True)
    shift_id = Column(Integer, ForeignKey("cash_shifts.id", ondelete="CASCADE"), nullable=False)
    transaction_type = Column(String(50), nullable=False) # CASH_SALE, CASH_REFUND, PAYOUT, PETTY_CASH_EXPENSE, FLOAT_ADDITION
    amount = Column(Numeric(12, 2), nullable=False)
    reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    shift = relationship("CashShift", back_populates="transactions")

class BusinessExpense(Base):
    __tablename__ = "business_expenses"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(100), nullable=False) # RENT, UTILITIES, SALARIES, PACKAGING, LOGISTICS, REPAIR, MARKETING, TEA_SNACKS
    amount = Column(Numeric(12, 2), nullable=False)
    payment_mode = Column(String(50), default="CASH") # CASH, UPI, BANK_TRANSFER
    description = Column(Text, nullable=True)
    receipt_url = Column(String(500), nullable=True)
    expense_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
