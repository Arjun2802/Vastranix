def test_cashier_shift_reconciliation(client):
    # Register business
    reg = client.post("/api/v1/auth/register", json={
        "email": "finance@vastrenix.com",
        "password": "Password123!",
        "full_name": "Finance Admin",
        "business_name": "Vastrenix Cashier Shift Test"
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Open Cash Shift with 2000 INR opening float
    open_res = client.post("/api/v1/finance/shifts/open", headers=headers, json={
        "opening_cash": 2000.00,
        "notes": "Morning cashier shift opened"
    })
    assert open_res.status_code == 200
    shift_id = open_res.json()["shift_id"]

    # Check active shift
    curr_res = client.get("/api/v1/finance/shifts/current", headers=headers)
    assert curr_res.status_code == 200
    assert curr_res.json()["has_active_shift"] is True
    assert curr_res.json()["shift"]["opening_cash"] == 2000.00

    # Record POS sale in CASH for 1500 INR
    client.post("/api/v1/pos/sale", headers=headers, json={
        "customer_name": "Cash Walk-in",
        "items": [{
            "product_name": "Cotton Casual T-Shirt",
            "quantity": 3,
            "unit_price": 500.00,
            "tax_rate": 0.0
        }],
        "payment_mode": "CASH"
    })

    # Close shift with 3500 INR (2000 opening + 1500 sales = 3500 exact)
    close_res = client.post("/api/v1/finance/shifts/close", headers=headers, json={
        "actual_closing_cash": 3500.00,
        "notes": "End of shift count verified"
    })
    assert close_res.status_code == 200
    close_data = close_res.json()
    assert close_data["expected_closing_cash"] == 3500.00
    assert close_data["actual_closing_cash"] == 3500.00
    assert close_data["difference"] == 0.00
    assert close_data["reconciliation_status"] == "EXACT"

def test_online_storefront_and_sync(client):
    reg = client.post("/api/v1/auth/register", json={
        "email": "store@vastrenix.com",
        "password": "Password123!",
        "full_name": "Store Owner",
        "business_name": "Vastrenix Online Boutique"
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create Product with 15 stock
    client.post("/api/v1/products/", headers=headers, json={
        "name": "Handmade Silk Scarf",
        "variants": [{
            "sku": "SCARF-SILK-GLD",
            "size": "Free",
            "color": "Gold",
            "retail_price": 1200.00,
            "initial_stock": 15
        }]
    })
    var_id = client.get("/api/v1/products/", headers=headers).json()[0]["variants"][0]["id"]

    # Public storefront catalog
    store_res = client.get("/api/v1/commerce/storefront/boutique")
    assert store_res.status_code == 200
    catalog = store_res.json()["catalog"]
    assert len(catalog) >= 1
    assert catalog[0]["name"] == "Handmade Silk Scarf"

    # Public checkout for 3 pieces
    order_res = client.post("/api/v1/commerce/checkout", json={
        "storefront_slug": "boutique",
        "customer_name": "Aarav Sharma",
        "customer_phone": "+91 91234 56789",
        "shipping_address": "402 Royal Palms, SG Highway",
        "city": "Ahmedabad",
        "state": "Gujarat",
        "pincode": "380054",
        "payment_method": "COD",
        "items": [{
            "variant_id": var_id,
            "quantity": 3
        }]
    })
    assert order_res.status_code == 200
    assert order_res.json()["total_amount"] == 3600.00

    # Verify inventory is authoritatively decremented to 12
    inv_res = client.get("/api/v1/inventory/levels", headers=headers).json()
    level = next(l for l in inv_res if l["sku"] == "SCARF-SILK-GLD")
    assert level["on_hand"] == 12
    assert level["available"] == 12

    # Offline Sync Queue test
    sync_res = client.post("/api/v1/sync/push", headers=headers, json={
        "client_id": "POS_TERMINAL_DESK_01",
        "operations": [{
            "operation_id": "OP-SYNC-UUID-9001",
            "entity": "INVOICE",
            "action": "CREATE",
            "payload": {"total": 1200},
            "timestamp": "2026-10-22T14:30:00Z"
        }]
    })
    assert sync_res.status_code == 200
    assert sync_res.json()["processed_count"] == 1

    # Idempotency check: push identical operation_id again
    sync_res2 = client.post("/api/v1/sync/push", headers=headers, json={
        "client_id": "POS_TERMINAL_DESK_01",
        "operations": [{
            "operation_id": "OP-SYNC-UUID-9001",
            "entity": "INVOICE",
            "action": "CREATE",
            "payload": {"total": 1200},
            "timestamp": "2026-10-22T14:30:00Z"
        }]
    })
    assert sync_res2.status_code == 200
    assert sync_res2.json()["results"][0]["status"] == "ALREADY_APPLIED"
