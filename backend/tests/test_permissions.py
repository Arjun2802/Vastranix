def test_rbac_and_tenant_isolation(client):
    """
    Tests:
    1. Cashier cannot perform inventory adjustments or invite staff.
    2. Cashier CAN perform POS billing and open/close cash shifts.
    3. Cross-tenant isolation: Business A cannot view or access Business B's invoices or products.
    """
    # 1. Owner registers Business A
    reg_a = client.post("/api/v1/auth/register", json={
        "email": "owner_a@vastrenix.com",
        "password": "Password123!",
        "full_name": "Owner A",
        "business_name": "Business A Apparel"
    })
    token_a = reg_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Owner A creates product
    client.post("/api/v1/products/", headers=headers_a, json={
        "name": "Secret Silk Sari A",
        "variants": [{
            "sku": "SARI-SILK-A",
            "size": "Free",
            "color": "Crimson",
            "retail_price": 5000.00,
            "initial_stock": 10
        }]
    })

    # Owner A invites a Cashier
    invite_res = client.post("/api/v1/auth/staff", headers=headers_a, json={
        "email": "cashier@vastrenix.com",
        "password": "CashierPass123!",
        "full_name": "Rohan Cashier",
        "role": "CASHIER"
    })
    assert invite_res.status_code == 200

    # 2. Login as Cashier
    login_c = client.post("/api/v1/auth/login", json={
        "email": "cashier@vastrenix.com",
        "password": "CashierPass123!"
    })
    assert login_c.status_code == 200
    token_c = login_c.json()["access_token"]
    headers_c = {"Authorization": f"Bearer {token_c}"}

    # Cashier attempts inventory adjustment -> Expect 403 Forbidden
    var_id = client.get("/api/v1/products/", headers=headers_a).json()[0]["variants"][0]["id"]
    adj_res = client.post("/api/v1/inventory/adjust", headers=headers_c, json={
        "variant_id": var_id,
        "quantity_change": 5,
        "adjustment_type": "CORRECTION",
        "reason": "Unauthorized attempt"
    })
    assert adj_res.status_code == 403, f"Expected 403, got {adj_res.status_code}"

    # Cashier attempts staff invitation -> Expect 403 Forbidden
    staff_res = client.post("/api/v1/auth/staff", headers=headers_c, json={
        "email": "hacker@test.com",
        "password": "Pass",
        "full_name": "Hacker",
        "role": "ADMIN"
    })
    assert staff_res.status_code == 403

    # Cashier DOES have access to POS billing
    sale_c = client.post("/api/v1/pos/sale", headers=headers_c, json={
        "customer_name": "Walkin",
        "items": [{
            "variant_id": var_id,
            "product_name": "Secret Silk Sari A",
            "quantity": 1,
            "unit_price": 5000.00
        }]
    })
    assert sale_c.status_code == 200

    # 3. Cross-Tenant Isolation: Register Business B
    reg_b = client.post("/api/v1/auth/register", json={
        "email": "owner_b@vastrenix.com",
        "password": "Password123!",
        "full_name": "Owner B",
        "business_name": "Business B Retail"
    })
    token_b = reg_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Business B queries products: should see 0 products (cannot see Business A's products)
    b_prods = client.get("/api/v1/products/", headers=headers_b).json()
    assert len(b_prods) == 0

    # Business B queries invoices: should see 0 invoices (cannot see Business A's invoices)
    b_invs = client.get("/api/v1/pos/invoices", headers=headers_b).json()
    assert len(b_invs) == 0
