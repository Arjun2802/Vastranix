from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional, List
import os
from decimal import Decimal
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.core.permissions import get_tenant_context, TenantContext, require_roles
from backend.app.models.billing import Invoice, InvoiceItem, Payment, Customer, CreditNote
from backend.app.models.auth import Branch, Business
from backend.app.models.product import ProductVariant, Product
from backend.app.services.stock_service import deduct_stock_for_sale, check_and_trigger_stock_alert, get_or_create_inventory_level
from backend.app.services.invoice_renderer import render_invoice_pdf
from backend.app.schemas.all_schemas import POSSaleCreateSchema, CustomerCreateSchema

router = APIRouter(prefix="/pos", tags=["Point of Sale & Billing"])

@router.post("/customers")
def create_customer(
    data: CustomerCreateSchema,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    cust = Customer(
        business_id=ctx.business.id,
        name=data.name,
        phone=data.phone,
        email=data.email,
        gstin=data.gstin,
        address=data.address,
        city=data.city,
        state=data.state,
        credit_limit=data.credit_limit,
        outstanding_balance=0.00,
        price_list_type=data.price_list_type
    )
    db.add(cust)
    db.commit()
    db.refresh(cust)
    return {"message": "Customer created successfully", "id": cust.id, "name": cust.name}

@router.get("/customers")
def list_customers(
    search: Optional[str] = Query(None),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    query = db.query(Customer).filter(Customer.business_id == ctx.business.id)
    if search:
        query = query.filter(Customer.name.ilike(f"%{search}%") | Customer.phone.ilike(f"%{search}%"))
    return query.order_by(Customer.name.asc()).all()

@router.post("/sale")
def process_pos_sale(
    data: POSSaleCreateSchema,
    ctx: TenantContext = Depends(require_roles(["OWNER", "ADMIN", "BRANCH_MANAGER", "CASHIER"])),
    db: Session = Depends(get_db)
):
    branch_id = ctx.branch.id if ctx.branch else 1
    
    # 1. Resolve or create Customer
    customer = None
    if data.customer_id:
        customer = db.query(Customer).filter(Customer.id == data.customer_id, Customer.business_id == ctx.business.id).first()
    elif data.customer_phone:
        customer = db.query(Customer).filter(Customer.phone == data.customer_phone, Customer.business_id == ctx.business.id).first()
        if not customer:
            customer = Customer(
                business_id=ctx.business.id,
                name=data.customer_name or "Walk-in Customer",
                phone=data.customer_phone
            )
            db.add(customer)
            db.flush()

    # 2. Generate unique invoice number: INV-YYYYMMDD-XXXX
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    count_today = db.query(Invoice).filter(Invoice.business_id == ctx.business.id).count() + 1
    inv_num = f"INV-{date_str}-{count_today:04d}"

    # 3. Calculate Item totals, tax, and perform stock deduction
    subtotal = Decimal("0.00")
    tax_total = Decimal("0.00")
    invoice_items = []

    for item_data in data.items:
        qty = item_data.quantity
        rate = Decimal(str(item_data.unit_price))
        disc_pct = Decimal(str(item_data.discount_percent))
        tax_pct = Decimal(str(item_data.tax_rate))

        line_sub = (rate * qty) * (1 - (disc_pct / 100))
        line_tax = line_sub * (tax_pct / 100)
        line_tot = line_sub + line_tax

        subtotal += line_sub
        tax_total += line_tax

        inv_item = InvoiceItem(
            variant_id=item_data.variant_id,
            product_name=item_data.product_name,
            size=item_data.size,
            color=item_data.color,
            sku=item_data.sku,
            hsn_sac=item_data.hsn_sac or "6205",
            quantity=qty,
            unit_price=rate,
            discount_percent=disc_pct,
            tax_rate=tax_pct,
            tax_amount=line_tax,
            line_total=line_tot
        )
        invoice_items.append(inv_item)

        # Deduct physical stock if variant_id provided
        if item_data.variant_id:
            deduct_stock_for_sale(
                db=db,
                business_id=ctx.business.id,
                branch_id=branch_id,
                variant_id=item_data.variant_id,
                quantity=qty,
                invoice_number=inv_num,
                user_id=ctx.user.id
            )

    discount_amount = Decimal(str(data.discount_amount))
    total_amount = max(Decimal("0.00"), subtotal + tax_total - discount_amount)
    paid_amount = Decimal(str(data.paid_amount)) if data.paid_amount is not None else total_amount
    balance_due = max(Decimal("0.00"), total_amount - paid_amount)

    payment_status = "PAID" if balance_due <= Decimal("0.00") else ("PARTIAL" if paid_amount > 0 else "UNPAID")
    theme = data.invoice_theme or ctx.business.default_invoice_theme or "CLASSIC_GST"

    # 4. Create Invoice Record
    invoice = Invoice(
        business_id=ctx.business.id,
        branch_id=branch_id,
        customer_id=customer.id if customer else None,
        invoice_number=inv_num,
        invoice_date=datetime.now(timezone.utc),
        subtotal=subtotal,
        discount_amount=discount_amount,
        tax_amount=tax_total,
        total_amount=total_amount,
        paid_amount=paid_amount,
        balance_due=balance_due,
        payment_status=payment_status,
        payment_mode=data.payment_mode,
        invoice_theme=theme,
        status="POSTED",
        cashier_id=ctx.user.id,
        notes=data.notes
    )
    db.add(invoice)
    db.flush()

    for item in invoice_items:
        item.invoice_id = invoice.id
        db.add(item)

    # 5. Record Payment
    if paid_amount > 0:
        payment = Payment(
            business_id=ctx.business.id,
            invoice_id=invoice.id,
            customer_id=customer.id if customer else None,
            amount=paid_amount,
            payment_mode=data.payment_mode,
            verified=True,
            cashier_id=ctx.user.id,
            notes=f"Initial payment for {inv_num}"
        )
        db.add(payment)

    # If balance due and customer exists, update outstanding balance
    if balance_due > 0 and customer:
        customer.outstanding_balance += balance_due

    db.commit()
    db.refresh(invoice)

    # 6. Render PDF in chosen theme
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    pdf_filename = render_invoice_pdf(
        invoice=invoice,
        business=ctx.business,
        branch=branch,
        customer=customer,
        items=invoice.items,
        theme=theme
    )
    invoice.pdf_filename = pdf_filename
    db.commit()

    return {
        "message": "Invoice posted successfully",
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "total_amount": float(invoice.total_amount),
        "paid_amount": float(invoice.paid_amount),
        "balance_due": float(invoice.balance_due),
        "payment_status": invoice.payment_status,
        "invoice_theme": invoice.invoice_theme,
        "pdf_download_url": f"/api/v1/pos/invoices/{invoice.id}/pdf",
        "preview_url": f"/api/v1/pos/invoices/{invoice.id}/preview"
    }

@router.get("/invoices")
def list_invoices(
    limit: int = 50,
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    query = db.query(Invoice).filter(Invoice.business_id == ctx.business.id)
    if search:
        query = query.filter(Invoice.invoice_number.ilike(f"%{search}%"))
    if status:
        query = query.filter(Invoice.status == status)

    invoices = query.order_by(Invoice.id.desc()).limit(limit).all()
    results = []
    for inv in invoices:
        cust = db.query(Customer).filter(Customer.id == inv.customer_id).first() if inv.customer_id else None
        results.append({
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "date": inv.invoice_date.strftime("%d-%b-%Y %H:%M"),
            "customer_name": cust.name if cust else "Walk-in Customer",
            "total_amount": float(inv.total_amount),
            "paid_amount": float(inv.paid_amount),
            "balance_due": float(inv.balance_due),
            "payment_status": inv.payment_status,
            "payment_mode": inv.payment_mode,
            "invoice_theme": inv.invoice_theme,
            "status": inv.status
        })
    return results

@router.get("/invoices/{id}/pdf")
def download_invoice_pdf(id: int, ctx: TenantContext = Depends(get_tenant_context), db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == id, Invoice.business_id == ctx.business.id).first()
    if not invoice or not invoice.pdf_filename:
        raise HTTPException(status_code=404, detail="Invoice PDF not found")
    filepath = os.path.join(settings.INVOICE_DIR, invoice.pdf_filename)
    if not os.path.exists(filepath):
        # Regenerate on demand
        branch = db.query(Branch).filter(Branch.id == invoice.branch_id).first()
        customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
        render_invoice_pdf(invoice, ctx.business, branch, customer, invoice.items, invoice.invoice_theme)
    return FileResponse(filepath, media_type="application/pdf", filename=invoice.pdf_filename)

@router.get("/invoices/{id}/preview", response_class=HTMLResponse)
def preview_invoice_html(id: int, ctx: TenantContext = Depends(get_tenant_context), db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == id, Invoice.business_id == ctx.business.id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
    branch = db.query(Branch).filter(Branch.id == invoice.branch_id).first()

    rows = ""
    for idx, it in enumerate(invoice.items, 1):
        rows += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #E7E8E4;">{idx}</td>
            <td style="padding: 10px; border-bottom: 1px solid #E7E8E4;"><b>{it.product_name}</b><br><small style="color: #697782;">{it.size or ''} / {it.color or ''} | HSN: {it.hsn_sac}</small></td>
            <td style="padding: 10px; border-bottom: 1px solid #E7E8E4; text-align: center;">{it.quantity}</td>
            <td style="padding: 10px; border-bottom: 1px solid #E7E8E4; text-align: right;">₹{float(it.unit_price):.2f}</td>
            <td style="padding: 10px; border-bottom: 1px solid #E7E8E4; text-align: right;">{float(it.tax_rate):.1f}%</td>
            <td style="padding: 10px; border-bottom: 1px solid #E7E8E4; text-align: right; font-weight: 600;">₹{float(it.line_total):.2f}</td>
        </tr>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Invoice {invoice.invoice_number} | Vastrenix</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; background: #FAF8F3; padding: 24px; color: #25313B; }}
            .container {{ max-width: 800px; margin: 0 auto; background: #FFFFFF; padding: 36px; border-radius: 12px; border: 1px solid #E7E8E4; box-shadow: 0 4px 12px rgba(25,43,58,0.06); }}
            .header {{ display: flex; justify-content: space-between; border-bottom: 2px solid #218C82; padding-bottom: 20px; }}
            .theme-badge {{ display: inline-block; padding: 4px 10px; background: #E8F4F0; color: #218C82; font-size: 11px; font-weight: 700; border-radius: 4px; text-transform: uppercase; }}
            .totals {{ width: 280px; margin-left: auto; margin-top: 24px; }}
            .total-row {{ display: flex; justify-content: space-between; padding: 6px 0; }}
            .grand-total {{ font-size: 18px; font-weight: 800; color: #192B3A; border-top: 1px solid #192B3A; padding-top: 8px; }}
            .btn {{ display: inline-block; padding: 10px 18px; background: #218C82; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div>
                    <h2 style="margin: 0; color: #192B3A;">{ctx.business.name}</h2>
                    <p style="margin: 4px 0; color: #697782; font-size: 13px;">{branch.address or ctx.business.address or 'Garment Center'}</p>
                    <p style="margin: 2px 0; color: #697782; font-size: 13px;">GSTIN: <b>{ctx.business.gstin or 'N/A'}</b></p>
                </div>
                <div style="text-align: right;">
                    <span class="theme-badge">Theme: {invoice.invoice_theme}</span>
                    <h3 style="margin: 8px 0 4px 0; color: #192B3A;">{invoice.invoice_number}</h3>
                    <p style="margin: 0; color: #697782; font-size: 13px;">Date: {invoice.invoice_date.strftime('%d-%b-%Y')}</p>
                    <p style="margin: 2px 0; font-size: 13px;">Status: <b style="color: {'#218C82' if invoice.payment_status=='PAID' else '#D99A43'};">{invoice.payment_status}</b></p>
                </div>
            </div>

            <div style="margin: 20px 0; font-size: 14px;">
                <b>Bill To:</b> {customer.name if customer else 'Walk-in Customer'} 
                {f"| Phone: {customer.phone}" if customer and customer.phone else ""}
                {f"| GSTIN: {customer.gstin}" if customer and customer.gstin else ""}
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 10px;">
                <thead>
                    <tr style="background: #FAF8F3; color: #192B3A; text-align: left;">
                        <th style="padding: 10px; border-bottom: 2px solid #E7E8E4;">#</th>
                        <th style="padding: 10px; border-bottom: 2px solid #E7E8E4;">Garment Item</th>
                        <th style="padding: 10px; border-bottom: 2px solid #E7E8E4; text-align: center;">Qty</th>
                        <th style="padding: 10px; border-bottom: 2px solid #E7E8E4; text-align: right;">Rate</th>
                        <th style="padding: 10px; border-bottom: 2px solid #E7E8E4; text-align: right;">Tax</th>
                        <th style="padding: 10px; border-bottom: 2px solid #E7E8E4; text-align: right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>

            <div class="totals">
                <div class="total-row"><span>Subtotal:</span><span>₹{float(invoice.subtotal):.2f}</span></div>
                <div class="total-row"><span>Tax Total:</span><span>₹{float(invoice.tax_amount):.2f}</span></div>
                {f'<div class="total-row"><span>Discount:</span><span>-₹{float(invoice.discount_amount):.2f}</span></div>' if float(invoice.discount_amount) > 0 else ''}
                <div class="total-row grand-total"><span>Grand Total:</span><span>₹{float(invoice.total_amount):.2f}</span></div>
                <div class="total-row" style="color: #218C82;"><span>Paid Amount:</span><span>₹{float(invoice.paid_amount):.2f}</span></div>
                <div class="total-row" style="color: {'#D96F65' if float(invoice.balance_due) > 0 else '#697782'};"><span>Balance Due:</span><span>₹{float(invoice.balance_due):.2f}</span></div>
            </div>

            <div style="margin-top: 30px; text-align: center;">
                <a href="/api/v1/pos/invoices/{invoice.id}/pdf" class="btn" target="_blank">Download Authoritative PDF</a>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)
