def test_first_working_business_flow(client):
    """
    Mandatory Stage 4 Vertical Slice:
    Business setup -> Product creation -> Size/color variants -> Stock receipt -> POS sale -> Invoice generation -> Inventory update -> Low-stock alert.
    """
    # 1. Business Setup & Registration
    reg_res = client.post("/api/v1/auth/register", json={
        "email": "owner@vastrenix-boutique.com",
        "password": "SecurePassword123!",
        "full_name": "Meera Patel",
        "phone": "+91 98765 43210",
        "business_name": "Vastrenix Heritage Boutique",
        "currency": "INR",
        "city": "Ahmedabad",
        "state": "Gujarat",
        "gstin": "24ABCDE1234F1Z5"
    })
    assert reg_res.status_code == 200, reg_res.text
    auth_data = reg_res.json()
    token = auth_data["access_token"]
    business_id = auth_data["business"]["id"]
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Business-ID": str(business_id)
    }

    # 2. Product Creation with Size/Color variants
    prod_res = client.post("/api/v1/products/", headers=headers, json={
        "name": "Organic Handloom Linen Kurta",
        "code": "KURTA-HL-01",
        "fabric": "100% Pure Organic Linen",
        "material": "Handwoven Khadi Linen",
        "pattern": "Solid Classic",
        "season": "Festive Autumn 2026",
        "gender": "Men",
        "fit": "Tailored Regular",
        "hsn_sac": "6205",
        "tax_rate": 5.0,
        "variants": [
            {
                "sku": "KURTA-LINEN-NVY-M",
                "size": "M",
                "color": "Indigo Navy",
                "color_hex": "#192B3A",
                "purchase_cost": 850.00,
                "retail_price": 2490.00,
                "wholesale_price": 1450.00,
                "dealer_price": 1350.00,
                "min_stock_alert": 3,
                "initial_stock": 0
            },
            {
                "sku": "KURTA-LINEN-NVY-L",
                "size": "L",
                "color": "Indigo Navy",
                "color_hex": "#192B3A",
                "purchase_cost": 850.00,
                "retail_price": 2490.00,
                "wholesale_price": 1450.00,
                "dealer_price": 1350.00,
                "min_stock_alert": 3,
                "initial_stock": 0
            }
        ]
    })
    assert prod_res.status_code == 200, prod_res.text
    prod_id = prod_res.json()["product_id"]

    # Retrieve product and variants
    list_res = client.get("/api/v1/products/", headers=headers)
    assert list_res.status_code == 200
    products_list = list_res.json()
    assert len(products_list) == 1
    variant_m = products_list[0]["variants"][0]
    variant_l = products_list[0]["variants"][1]
    assert variant_m["sku"] == "KURTA-LINEN-NVY-M"
    assert variant_m["available"] == 0

    # 3. Stock Receipt via Supplier & Purchase Order GRN
    supp_res = client.post("/api/v1/purchases/suppliers", headers=headers, json={
        "name": "Surat Textile Weavers Cooperative",
        "contact_person": "Rajesh Shah",
        "phone": "+91 98250 11223",
        "gstin": "24AAACS1429B1ZB",
        "city": "Surat"
    })
    assert supp_res.status_code == 200
    supplier_id = supp_res.json()["id"]

    po_res = client.post("/api/v1/purchases/orders", headers=headers, json={
        "supplier_id": supplier_id,
        "items": [
            {
                "variant_id": variant_m["id"],
                "quantity": 10,
                "unit_cost": 850.00,
                "tax_rate": 5.0
            },
            {
                "variant_id": variant_l["id"],
                "quantity": 5,
                "unit_cost": 850.00,
                "tax_rate": 5.0
            }
        ]
    })
    assert po_res.status_code == 200
    po_id = po_res.json()["po_id"]

    # Post GRN to physically receive stock
    grn_res = client.post("/api/v1/purchases/grn", headers=headers, json={
        "purchase_order_id": po_id,
        "supplier_invoice_no": "INV-STW-9021"
    })
    assert grn_res.status_code == 200

    # Verify inventory is received
    inv_res = client.get("/api/v1/inventory/levels", headers=headers)
    levels = inv_res.json()
    m_level = next(l for l in levels if l["sku"] == "KURTA-LINEN-NVY-M")
    assert m_level["on_hand"] == 10
    assert m_level["available"] == 10

    # 4. POS Sale & Invoice Generation
    sale_res = client.post("/api/v1/pos/sale", headers=headers, json={
        "customer_name": "Kavita Rao",
        "customer_phone": "+91 99887 76655",
        "items": [
            {
                "variant_id": variant_m["id"],
                "product_name": "Organic Handloom Linen Kurta",
                "size": "M",
                "color": "Indigo Navy",
                "sku": "KURTA-LINEN-NVY-M",
                "quantity": 8, # Sell 8 out of 10, leaving 2 (which is <= min_stock_alert 3)
                "unit_price": 2490.00,
                "discount_percent": 10.0,
                "tax_rate": 5.0
            }
        ],
        "discount_amount": 0.0,
        "payment_mode": "UPI",
        "invoice_theme": "PREMIUM_BOUTIQUE",
        "notes": "Thank you for shopping with us!"
    })
    assert sale_res.status_code == 200, sale_res.text
    invoice_data = sale_res.json()
    assert invoice_data["payment_status"] == "PAID"
    assert invoice_data["invoice_theme"] == "PREMIUM_BOUTIQUE"
    assert "pdf_download_url" in invoice_data

    # 5. Inventory Update Check
    inv_res2 = client.get("/api/v1/inventory/levels", headers=headers)
    levels2 = inv_res2.json()
    m_level2 = next(l for l in levels2 if l["sku"] == "KURTA-LINEN-NVY-M")
    assert m_level2["on_hand"] == 2
    assert m_level2["available"] == 2

    # 6. Low-Stock Alert Triggered
    alerts_res = client.get("/api/v1/inventory/alerts", headers=headers)
    assert alerts_res.status_code == 200
    alerts = alerts_res.json()
    m_alert = next((a for a in alerts if a["sku"] == "KURTA-LINEN-NVY-M"), None)
    assert m_alert is not None
    assert m_alert["available"] == 2
    assert m_alert["threshold"] == 3
    assert m_alert["severity"] == "CRITICAL"
