import os
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from backend.app.core.config import settings
from backend.app.services.upi_service import generate_upi_uri, generate_upi_qr_file

# Color definitions
NAVY = colors.HexColor("#192B3A")
TEAL = colors.HexColor("#218C82")
IVORY = colors.HexColor("#FAF8F3")
TEXT_MAIN = colors.HexColor("#25313B")
TEXT_MUTED = colors.HexColor("#697782")
BORDER_SUBTLE = colors.HexColor("#E7E8E4")
AMBER = colors.HexColor("#D99A43")

def render_invoice_pdf(invoice, business, branch, customer, items, theme: str = "CLASSIC_GST") -> str:
    """
    Renders high-quality PDF invoice according to specified theme.
    Returns relative filepath of generated PDF.
    """
    filename = f"INV_{invoice.invoice_number.replace('/', '_')}_{theme}.pdf"
    filepath = os.path.join(settings.INVOICE_DIR, filename)

    # Page sizing: Thermal is 80mm roll, others standard A4
    if theme == "COMPACT_THERMAL":
        pagesize = (80 * mm, 200 * mm)
        doc = SimpleDocTemplate(filepath, pagesize=pagesize, leftMargin=4*mm, rightMargin=4*mm, topMargin=4*mm, bottomMargin=4*mm)
    else:
        pagesize = A4
        doc = SimpleDocTemplate(filepath, pagesize=pagesize, leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=12*mm)

    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        "InvTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18 if theme != "COMPACT_THERMAL" else 12,
        textColor=NAVY,
        leading=22 if theme != "COMPACT_THERMAL" else 14
    )
    meta_style = ParagraphStyle(
        "InvMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9 if theme != "COMPACT_THERMAL" else 7.5,
        textColor=TEXT_MUTED,
        leading=12 if theme != "COMPACT_THERMAL" else 10
    )
    cell_style = ParagraphStyle(
        "InvCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5 if theme != "COMPACT_THERMAL" else 7,
        textColor=TEXT_MAIN,
        leading=11 if theme != "COMPACT_THERMAL" else 9
    )
    cell_bold = ParagraphStyle(
        "InvCellBold",
        parent=cell_style,
        fontName="Helvetica-Bold"
    )

    story = []

    # 1. Header Section based on Theme
    theme_titles = {
        "CLASSIC_GST": "TAX INVOICE",
        "MODERN_MINIMAL": "INVOICE",
        "PREMIUM_BOUTIQUE": "BOUTIQUE RECEIPT & ATELIER BILL",
        "WHOLESALE_DEALER": "B2B WHOLESALE & DISPATCH MEMO",
        "COMPACT_THERMAL": "SALE MEMO",
        "INTERNATIONAL_COMMERCIAL": "COMMERCIAL EXPORT INVOICE"
    }

    header_text = theme_titles.get(theme, "TAX INVOICE")

    # Business Info Block
    biz_info = f"<b>{business.name}</b><br/>{branch.address or business.address or 'Garment District'}<br/>"
    if business.gstin:
        biz_info += f"GSTIN: {business.gstin}<br/>"
    if business.phone:
        biz_info += f"Phone: {business.phone} | Email: {business.email or 'billing@vastrenix.com'}"

    # Invoice Meta Block
    inv_meta = f"<b>{header_text}</b><br/>"
    inv_meta += f"Invoice No: <b>{invoice.invoice_number}</b><br/>"
    inv_meta += f"Date: {invoice.invoice_date.strftime('%d-%b-%Y')}<br/>"
    inv_meta += f"Payment Mode: {invoice.payment_mode}<br/>"
    inv_meta += f"Status: <b>{invoice.payment_status}</b>"

    if theme == "COMPACT_THERMAL":
        story.append(Paragraph(f"<font color='#192B3A'><b>{business.name}</b></font>", title_style))
        story.append(Paragraph(f"GSTIN: {business.gstin or 'N/A'} | Inv: {invoice.invoice_number}", meta_style))
        story.append(Paragraph(f"Date: {invoice.invoice_date.strftime('%d/%m/%Y %H:%M')}", meta_style))
        story.append(Spacer(1, 2*mm))
    else:
        header_table = Table(
            [[Paragraph(biz_info, meta_style), Paragraph(inv_meta, meta_style)]],
            colWidths=[105*mm, 80*mm]
        )
        header_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 4*mm))

    # Customer Block (if not thermal or if customer provided)
    if customer:
        cust_info = f"<b>Bill To:</b> {customer.name} | Phone: {customer.phone or 'N/A'}"
        if customer.gstin:
            cust_info += f" | GSTIN: {customer.gstin}"
        story.append(Paragraph(cust_info, meta_style))
        story.append(Spacer(1, 3*mm))

    # 2. Line Items Table
    if theme == "COMPACT_THERMAL":
        table_data = [
            [Paragraph("Item", cell_bold), Paragraph("Qty", cell_bold), Paragraph("Rate", cell_bold), Paragraph("Total", cell_bold)]
        ]
        for item in items:
            desc = f"{item.product_name} ({item.size or ''}/{item.color or ''})"
            table_data.append([
                Paragraph(desc, cell_style),
                Paragraph(str(item.quantity), cell_style),
                Paragraph(f"{float(item.unit_price):.2f}", cell_style),
                Paragraph(f"{float(item.line_total):.2f}", cell_bold)
            ])
        item_table = Table(table_data, colWidths=[36*mm, 10*mm, 12*mm, 14*mm])
        item_table.setStyle(TableStyle([
            ('LINEBELOW', (0,0), (-1,0), 0.5, colors.black),
            ('LINEBELOW', (0,-1), (-1,-1), 0.5, colors.black),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('TOPPADDING', (0,0), (-1,-1), 2),
        ]))
        story.append(item_table)
    else:
        table_data = [
            [
                Paragraph("#", cell_bold),
                Paragraph("Description of Goods", cell_bold),
                Paragraph("HSN/SAC", cell_bold),
                Paragraph("Size/Color", cell_bold),
                Paragraph("Qty", cell_bold),
                Paragraph("Rate", cell_bold),
                Paragraph("Tax%", cell_bold),
                Paragraph("Total (₹)", cell_bold),
            ]
        ]
        for idx, item in enumerate(items, 1):
            table_data.append([
                Paragraph(str(idx), cell_style),
                Paragraph(f"<b>{item.product_name}</b><br/><font color='#697782'>SKU: {item.sku or 'N/A'}</font>", cell_style),
                Paragraph(item.hsn_sac or "6205", cell_style),
                Paragraph(f"{item.size or '-'} / {item.color or '-'}", cell_style),
                Paragraph(str(item.quantity), cell_style),
                Paragraph(f"{float(item.unit_price):.2f}", cell_style),
                Paragraph(f"{float(item.tax_rate):.1f}%", cell_style),
                Paragraph(f"{float(item.line_total):.2f}", cell_bold),
            ])

        col_widths = [8*mm, 60*mm, 18*mm, 26*mm, 12*mm, 20*mm, 15*mm, 26*mm]
        item_table = Table(table_data, colWidths=col_widths)
        
        # Theme specific styling
        t_bg = colors.HexColor("#F0F6F5") if theme == "MODERN_MINIMAL" else colors.HexColor("#FAF8F3")
        t_header_bg = NAVY if theme in ["CLASSIC_GST", "WHOLESALE_DEALER"] else TEAL
        header_text_color = colors.white

        item_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), t_header_bg),
            ('TEXTCOLOR', (0,0), (-1,0), header_text_color),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('GRID', (0,0), (-1,-1), 0.5, BORDER_SUBTLE),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        story.append(item_table)

    story.append(Spacer(1, 4*mm))

    # 3. Totals and UPI Section
    totals_data = [
        [Paragraph("Subtotal:", cell_style), Paragraph(f"₹ {float(invoice.subtotal):.2f}", cell_style)],
        [Paragraph("Tax Total:", cell_style), Paragraph(f"₹ {float(invoice.tax_amount):.2f}", cell_style)],
        [Paragraph("Discount:", cell_style), Paragraph(f"- ₹ {float(invoice.discount_amount):.2f}", cell_style)],
        [Paragraph("<b>Grand Total:</b>", cell_bold), Paragraph(f"<b>₹ {float(invoice.total_amount):.2f}</b>", cell_bold)],
        [Paragraph("Amount Paid:", cell_style), Paragraph(f"₹ {float(invoice.paid_amount):.2f}", cell_style)],
        [Paragraph("Balance Due:", cell_style), Paragraph(f"₹ {float(invoice.balance_due):.2f}", cell_style)],
    ]
    
    if theme == "COMPACT_THERMAL":
        tot_table = Table(totals_data, colWidths=[40*mm, 32*mm])
        tot_table.setStyle(TableStyle([
            ('LINEABOVE', (0,3), (-1,3), 0.5, colors.black),
            ('LINEBELOW', (0,3), (-1,3), 0.5, colors.black),
        ]))
        story.append(tot_table)
        story.append(Spacer(1, 4*mm))
        story.append(Paragraph("<center>Thank you for shopping at Vastrenix!<br/>Exchange within 7 days with tag intact.</center>", meta_style))
    else:
        tot_table = Table(totals_data, colWidths=[35*mm, 35*mm])
        tot_table.setStyle(TableStyle([
            ('BACKGROUND', (0,3), (-1,3), colors.HexColor("#E8F4F0")),
            ('GRID', (0,0), (-1,-1), 0.5, BORDER_SUBTLE),
            ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ('TOPPADDING', (0,0), (-1,-1), 3),
        ]))

        # Generate UPI QR if business has upi_id
        qr_flowable = None
        if business.upi_id and float(invoice.balance_due) > 0:
            upi_uri = generate_upi_uri(
                upi_id=business.upi_id,
                payee_name=business.name,
                amount=float(invoice.balance_due),
                transaction_ref=invoice.invoice_number
            )
            qr_filename = f"qr_{invoice.invoice_number.replace('/', '_')}.png"
            qr_path = generate_upi_qr_file(upi_uri, qr_filename)
            qr_flowable = RLImage(qr_path, width=28*mm, height=28*mm)

        if qr_flowable:
            bottom_row = [
                [
                    Paragraph(f"<b>Scan & Pay via UPI</b><br/><font color='#697782'>VPA: {business.upi_id}<br/>Fast & Direct Merchant Transfer</font>", meta_style),
                    qr_flowable,
                    tot_table
                ]
            ]
            bot_table = Table(bottom_row, colWidths=[65*mm, 35*mm, 85*mm])
        else:
            bot_table = Table([[Paragraph(f"Terms: Goods once sold will be exchanged within 7 days in unworn condition.<br/>Authorized Signatory: <b>{business.name}</b>", meta_style), tot_table]], colWidths=[110*mm, 75*mm])

        bot_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        story.append(bot_table)

    doc.build(story)
    return filename
