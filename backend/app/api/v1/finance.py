from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional, List
from decimal import Decimal
from backend.app.core.database import get_db
from backend.app.core.permissions import get_tenant_context, TenantContext, require_roles
from backend.app.models.finance import CashShift, CashShiftTransaction, BusinessExpense
from backend.app.models.billing import Invoice, Payment
from backend.app.schemas.all_schemas import CashShiftOpenSchema, CashShiftCloseSchema, BusinessExpenseCreateSchema

router = APIRouter(prefix="/finance", tags=["Finance & Cash Shift Management"])

@router.post("/shifts/open")
def open_cash_shift(
    data: CashShiftOpenSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "BRANCH_MANAGER", "CASHIER"])),
    db: Session = Depends(get_db)
):
    branch_id = ctx.branch.id if ctx.branch else 1
    # Check if cashier already has an active shift
    active_shift = db.query(CashShift).filter(
        CashShift.cashier_id == ctx.user.id,
        CashShift.branch_id == branch_id,
        CashShift.status == "OPEN"
    ).first()
    if active_shift:
        raise HTTPException(status_code=400, detail="You already have an open shift. Please close it first.")

    shift = CashShift(
        business_id=ctx.business.id,
        branch_id=branch_id,
        cashier_id=ctx.user.id,
        opening_cash=data.opening_cash,
        expected_closing_cash=data.opening_cash,
        actual_closing_cash=Decimal("0.00"),
        difference=Decimal("0.00"),
        status="OPEN",
        notes=data.notes
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return {"message": "Cash shift opened successfully", "shift_id": shift.id, "opening_cash": float(shift.opening_cash)}

@router.get("/shifts/current")
def get_current_shift(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    branch_id = ctx.branch.id if ctx.branch else 1
    shift = db.query(CashShift).filter(
        CashShift.cashier_id == ctx.user.id,
        CashShift.branch_id == branch_id,
        CashShift.status == "OPEN"
    ).first()
    if not shift:
        return {"has_active_shift": False, "shift": None}

    # Calculate expected cash = opening cash + total cash sales - cash payouts/expenses
    cash_sales = db.query(Payment).filter(
        Payment.cashier_id == ctx.user.id,
        Payment.payment_mode == "CASH",
        Payment.created_at >= shift.opened_at
    ).all()
    total_cash_sales = sum((Decimal(str(p.amount)) for p in cash_sales), Decimal("0.00"))

    cash_expenses = db.query(BusinessExpense).filter(
        BusinessExpense.branch_id == branch_id,
        BusinessExpense.payment_mode == "CASH",
        BusinessExpense.expense_date >= shift.opened_at
    ).all()
    total_cash_expenses = sum((Decimal(str(e.amount)) for e in cash_expenses), Decimal("0.00"))

    expected_cash = shift.opening_cash + total_cash_sales - total_cash_expenses

    return {
        "has_active_shift": True,
        "shift": {
            "id": shift.id,
            "opened_at": shift.opened_at.strftime("%d-%b-%Y %H:%M"),
            "opening_cash": float(shift.opening_cash),
            "cash_sales_collected": float(total_cash_sales),
            "cash_payouts_expenses": float(total_cash_expenses),
            "expected_closing_cash": float(expected_cash),
            "status": shift.status
        }
    }

@router.post("/shifts/close")
def close_cash_shift(
    data: CashShiftCloseSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "BRANCH_MANAGER", "CASHIER"])),
    db: Session = Depends(get_db)
):
    branch_id = ctx.branch.id if ctx.branch else 1
    shift = db.query(CashShift).filter(
        CashShift.cashier_id == ctx.user.id,
        CashShift.branch_id == branch_id,
        CashShift.status == "OPEN"
    ).first()
    if not shift:
        raise HTTPException(status_code=400, detail="No active shift found to close")

    cash_sales = db.query(Payment).filter(
        Payment.cashier_id == ctx.user.id,
        Payment.payment_mode == "CASH",
        Payment.created_at >= shift.opened_at
    ).all()
    total_cash_sales = sum((Decimal(str(p.amount)) for p in cash_sales), Decimal("0.00"))

    cash_expenses = db.query(BusinessExpense).filter(
        BusinessExpense.branch_id == branch_id,
        BusinessExpense.payment_mode == "CASH",
        BusinessExpense.expense_date >= shift.opened_at
    ).all()
    total_cash_expenses = sum((Decimal(str(e.amount)) for e in cash_expenses), Decimal("0.00"))

    expected = shift.opening_cash + total_cash_sales - total_cash_expenses
    diff = data.actual_closing_cash - expected

    shift.closed_at = datetime.now(timezone.utc)
    shift.expected_closing_cash = expected
    shift.actual_closing_cash = data.actual_closing_cash
    shift.difference = diff
    shift.status = "CLOSED"
    if data.notes:
        shift.notes = (shift.notes or "") + f" | Close Notes: {data.notes}"

    db.commit()
    db.refresh(shift)
    return {
        "message": "Cash shift closed and reconciled",
        "shift_id": shift.id,
        "opening_cash": float(shift.opening_cash),
        "cash_sales_collected": float(total_cash_sales),
        "cash_payouts_expenses": float(total_cash_expenses),
        "expected_closing_cash": float(expected),
        "actual_closing_cash": float(shift.actual_closing_cash),
        "difference": float(diff),
        "reconciliation_status": "EXACT" if diff == Decimal("0.00") else ("EXCESS" if diff > Decimal("0.00") else "SHORTAGE")
    }

@router.post("/expenses")
def add_business_expense(
    data: BusinessExpenseCreateSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"])),
    db: Session = Depends(get_db)
):
    branch_id = ctx.branch.id if ctx.branch else 1
    exp = BusinessExpense(
        business_id=ctx.business.id,
        branch_id=branch_id,
        category=data.category,
        amount=data.amount,
        payment_mode=data.payment_mode,
        description=data.description,
        created_by=ctx.user.id
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return {"message": "Expense recorded", "id": exp.id, "amount": float(exp.amount)}

@router.get("/expenses")
def list_business_expenses(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    expenses = db.query(BusinessExpense).filter(
        BusinessExpense.business_id == ctx.business.id
    ).order_by(BusinessExpense.id.desc()).all()

    results = []
    for e in expenses:
        results.append({
            "id": e.id,
            "category": e.category,
            "amount": float(e.amount),
            "payment_mode": e.payment_mode,
            "description": e.description,
            "date": e.expense_date.strftime("%d-%b-%Y %H:%M") if e.expense_date else ""
        })
    return results

@router.get("/summary")
def get_financial_summary(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    invoices = db.query(Invoice).filter(Invoice.business_id == ctx.business.id, Invoice.status == "POSTED").all()
    total_sales = sum(inv.total_amount for inv in invoices)
    total_collected = sum(inv.paid_amount for inv in invoices)
    total_receivables = sum(inv.balance_due for inv in invoices)

    expenses = db.query(BusinessExpense).filter(BusinessExpense.business_id == ctx.business.id).all()
    total_expenses = sum(e.amount for e in expenses)

    return {
        "currency": ctx.business.currency,
        "total_sales": float(total_sales),
        "total_collected": float(total_collected),
        "total_receivables": float(total_receivables),
        "total_expenses": float(total_expenses),
        "net_cash_flow": float(total_collected - total_expenses)
    }
