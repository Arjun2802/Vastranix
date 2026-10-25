import os
import pytest
from datetime import datetime, timezone
from decimal import Decimal
from pydantic import BaseModel
from typing import Optional

from backend.app.services.invoice_renderer import render_invoice_pdf
from backend.app.core.config import settings

class MockBusiness:
    name = "Vastrenix Haute Couture & Textiles Private Limited"
    address = "Plot 42, Millenium Textile Market-2, Ring Road, Surat, Gujarat 395002"
    gstin = "24AAACV1234F1Z9"
    phone = "+91 98765 43210"
    email = "accounts@vastrenixtextiles.com"
    upi_id = "vastrenix@icici"

class MockBranch:
    name = "Surat Flagship Hub"
    address = "Plot 42, Ring Road, Surat, Gujarat"

class MockCustomer:
    name = "Maharaja Silk Emporium & Sons Retailers"
    phone = "+91 99887 76655"
    gstin = "27AAACV9876E1Z2"

class MockItem:
    def __init__(self, idx, name, sku, size, color, qty, price, tax_rate):
        self.product_name = name
        self.sku = sku
        self.size = size
        self.color = color
        self.quantity = qty
        self.unit_price = Decimal(str(price))
        self.tax_rate = Decimal(str(tax_rate))
        self.hsn_sac = "6205"
        self.line_total = self.unit_price * Decimal(str(qty))

class MockInvoice:
    def __init__(self, inv_num, items, discount=Decimal("500.00"), paid=Decimal("15000.00")):
        self.invoice_number = inv_num
        self.invoice_date = datetime.now(timezone.utc)
        self.payment_mode = "UPI"
        self.payment_status = "PARTIAL"
        
        self.subtotal = sum(i.line_total for i in items)
        self.tax_amount = sum(i.line_total * (i.tax_rate / Decimal("100")) for i in items)
        self.discount_amount = discount
        self.total_amount = self.subtotal + self.tax_amount - self.discount_amount
        self.paid_amount = paid
        self.balance_due = max(Decimal("0.00"), self.total_amount - self.paid_amount)

THEMES = [
    "CLASSIC_GST",
    "MODERN_MINIMAL",
    "PREMIUM_BOUTIQUE",
    "WHOLESALE_DEALER",
    "COMPACT_THERMAL",
    "INTERNATIONAL_COMMERCIAL"
]

@pytest.mark.parametrize("theme", THEMES)
def test_invoice_theme_stress_rendering(theme):
    """
    Stress-tests each of the 6 invoice themes with:
    - 18 line items (multi-page flow)
    - Ultra-long product names (60+ characters)
    - Mixed tax rates (5%, 12%, 18%)
    - Subtotals, discounts, partial payments, and balance dues
    """
    items = []
    tax_rates = [Decimal("5.0"), Decimal("12.0"), Decimal("18.0")]

    for i in range(1, 19):
        tax = tax_rates[i % len(tax_rates)]
        long_name = f"Item {i:02d}: Handcrafted Pure Kanchipuram Brocade Heritage Silk Saree With Real Gold Zari Woven Borders"
        item = MockItem(
            idx=i,
            name=long_name,
            sku=f"SKU-HERITAGE-{i:03d}-XL-ROSE",
            size="Free Size",
            color="Antique Rose Gold",
            qty=i % 4 + 1,
            price=Decimal("1250.00") + Decimal(str(i * 100)),
            tax_rate=tax
        )
        items.append(item)

    inv_num = f"STR-{theme[:3]}-{datetime.now().strftime('%H%M%S')}"
    invoice = MockInvoice(inv_num=inv_num, items=items)

    pdf_filename = render_invoice_pdf(
        invoice=invoice,
        business=MockBusiness(),
        branch=MockBranch(),
        customer=MockCustomer(),
        items=items,
        theme=theme
    )

    full_path = os.path.join(settings.INVOICE_DIR, pdf_filename)
    assert os.path.exists(full_path), f"Invoice PDF {full_path} was not generated"
    file_size = os.path.getsize(full_path)
    assert file_size > 1000, f"Invoice PDF {full_path} is too small ({file_size} bytes)"

    # Basic PDF magic byte check
    with open(full_path, "rb") as f:
        header = f.read(5)
        assert header == b"%PDF-", f"Generated file {full_path} does not have valid PDF magic bytes"
