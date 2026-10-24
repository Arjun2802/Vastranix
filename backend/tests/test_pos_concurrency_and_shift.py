from decimal import Decimal
import pytest

def test_pos_shift_reconciliation_with_expenses(client):
    reg = client.post("/api/v1/auth/register", json={
        "email": "shift_admin@vastrenix.com",
        "password": "Password123!",
        "full_name": "Shift Admin",
        "business_name": "Shift & POS Test Co."
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Initially no active shift
    curr = client.get("/api/v1/finance/shifts/current", headers=headers).json()
    assert curr["has_active_shift"] is False

    # 2. Open shift with 5000 INR opening float
    open_res = client.post("/api/v1/finance/shifts/open", headers=headers, json={
        "opening_cash": 5000.00,
        "notes": "Morning drawer setup"
    })
    assert open_res.status_code == 200
    assert open_res.json()["opening_cash"] == 5000.00

    # Cannot open another shift while one is open
    dup_open = client.post("/api/v1/finance/shifts/open", headers=headers, json={"opening_cash": 1000.00})
    assert dup_open.status_code == 400

    # 3. Create a product with stock
    client.post("/api/v1/products/", headers=headers, json={
        "name": "Linen Kurta",
        "variants": [{
            "sku": "KURTA-LINEN-M",
            "size": "M",
            "color": "Beige",
            "retail_price": 1500.00,
            "initial_stock": 20
        }]
    })
    var_id = client.get("/api/v1/products/", headers=headers).json()[0]["variants"][0]["id"]

    # 4. Cashier records a cash sale of 2 units (2 * 1500 = 3000 + 5% tax 150 = 3150)
    sale_res = client.post("/api/v1/pos/sale", headers=headers, json={
        "customer_name": "Cash Walk-in",
        "items": [{
            "variant_id": var_id,
            "product_name": "Linen Kurta",
            "quantity": 2,
            "unit_price": 1500.00,
            "tax_rate": 5.0
        }],
        "payment_mode": "CASH"
    })
    assert sale_res.status_code == 200
    sale_data = sale_res.json()
    assert sale_data["total_amount"] == 3150.00
    assert sale_data["pdf_status"] == "SUCCESS"

    # 5. Record a cash business expense (e.g. Tea & Snacks / Petty Cash = 150)
    exp_res = client.post("/api/v1/finance/expenses", headers=headers, json={
        "category": "TEA_SNACKS",
        "amount": 150.00,
        "payment_mode": "CASH",
        "description": "Counter hospitality tea for clients"
    })
    assert exp_res.status_code == 200

    # 6. Current shift verification:
    # Expected = Opening (5000) + Cash Sales (3150) - Cash Expenses (150) = 8000
    curr2 = client.get("/api/v1/finance/shifts/current", headers=headers).json()
    assert curr2["has_active_shift"] is True
    assert curr2["shift"]["opening_cash"] == 5000.00
    assert curr2["shift"]["cash_sales_collected"] == 3150.00
    assert curr2["shift"]["cash_payouts_expenses"] == 150.00
    assert curr2["shift"]["expected_closing_cash"] == 8000.00

    # 7. Close shift with EXACT count (8000)
    close_exact = client.post("/api/v1/finance/shifts/close", headers=headers, json={
        "actual_closing_cash": 8000.00,
        "notes": "Drawer counted and reconciled"
    })
    assert close_exact.status_code == 200
    c_data = close_exact.json()
    assert c_data["expected_closing_cash"] == 8000.00
    assert c_data["actual_closing_cash"] == 8000.00
    assert c_data["difference"] == 0.00
    assert c_data["reconciliation_status"] == "EXACT"

def test_pos_idempotency_and_overselling_protection(client):
    reg = client.post("/api/v1/auth/register", json={
        "email": "pos_boss@vastrenix.com",
        "password": "Password123!",
        "full_name": "POS Boss",
        "business_name": "Idempotency POS Corp"
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create garment variant with exactly 1 unit of stock
    client.post("/api/v1/products/", headers=headers, json={
        "name": "Exclusive Designer Blazer",
        "variants": [{
            "sku": "BLAZER-ROYAL-42",
            "size": "42",
            "color": "Royal Blue",
            "retail_price": 9999.00,
            "initial_stock": 1
        }]
    })
    var_id = client.get("/api/v1/products/", headers=headers).json()[0]["variants"][0]["id"]

    # 1. First sale attempt with Idempotency Key
    idempotency_key = "CLIENT-TXN-ID-99001"
    sale_payload = {
        "idempotency_key": idempotency_key,
        "customer_name": "VIP Buyer",
        "items": [{
            "variant_id": var_id,
            "product_name": "Exclusive Designer Blazer",
            "quantity": 1,
            "unit_price": 9999.00,
            "tax_rate": 0.0
        }],
        "payment_mode": "CARD"
    }

    res1 = client.post("/api/v1/pos/sale", headers=headers, json=sale_payload)
    assert res1.status_code == 200
    inv1 = res1.json()
    assert inv1["invoice_number"].startswith("INV-")
    assert inv1["total_amount"] == 9999.00
    inv_id = inv1["invoice_id"]

    # 2. Duplicate network tap with same Idempotency Key
    res2 = client.post("/api/v1/pos/sale", headers=headers, json=sale_payload)
    assert res2.status_code == 200
    inv2 = res2.json()
    assert inv2["invoice_id"] == inv_id
    assert inv2["invoice_number"] == inv1["invoice_number"]
    assert inv2.get("is_duplicate") is True

    # 3. Another sale attempt for the same variant (now 0 stock) should be rejected with 400
    sale_payload2 = {
        "idempotency_key": "DIFFERENT-TXN-KEY",
        "customer_name": "Second Buyer",
        "items": [{
            "variant_id": var_id,
            "product_name": "Exclusive Designer Blazer",
            "quantity": 1,
            "unit_price": 9999.00,
            "tax_rate": 0.0
        }],
        "payment_mode": "CASH"
    }
    res3 = client.post("/api/v1/pos/sale", headers=headers, json=sale_payload2)
    assert res3.status_code == 400
    assert "Insufficient stock" in res3.json()["detail"]

    # 4. Test PDF Retry endpoint
    retry_res = client.post(f"/api/v1/pos/invoices/{inv_id}/retry-pdf", headers=headers)
    assert retry_res.status_code == 200
    assert "pdf_download_url" in retry_res.json()
