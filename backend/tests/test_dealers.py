def test_b2b_dealer_network_lifecycle(client):
    """
    Tests Dealer Network Lifecycle:
    Buyer places order -> Status: SUBMITTED
    Seller accepts -> Status: ACCEPTED (stock atomically reserved)
    Seller dispatches -> Status: DISPATCHED (stock deducted from reserved & on_hand, LR number attached)
    Buyer confirms delivery -> Status: DELIVERED (stock credited to buyer inventory)
    """
    # 1. Register Seller (Garment Manufacturer)
    seller_reg = client.post("/api/v1/auth/register", json={
        "email": "seller@mills.com",
        "password": "Password123!",
        "full_name": "Arjun Mills",
        "business_name": "Arjun Apparel Manufacturing Co."
    })
    seller_token = seller_reg.json()["access_token"]
    seller_biz_id = seller_reg.json()["business"]["id"]
    seller_headers = {"Authorization": f"Bearer {seller_token}"}

    # Seller creates product with 50 units
    client.post("/api/v1/products/", headers=seller_headers, json={
        "name": "Denim Relaxed Jacket",
        "variants": [{
            "sku": "DENIM-JKT-BLU-L",
            "size": "L",
            "color": "Washed Blue",
            "dealer_price": 1200.00,
            "retail_price": 2999.00,
            "initial_stock": 50
        }]
    })
    seller_var_id = client.get("/api/v1/products/", headers=seller_headers).json()[0]["variants"][0]["id"]

    # 2. Register Buyer (Retail Store / Boutique)
    buyer_reg = client.post("/api/v1/auth/register", json={
        "email": "buyer@boutique.com",
        "password": "Password123!",
        "full_name": "Diya Boutique",
        "business_name": "Diya Fashion Studio"
    })
    buyer_token = buyer_reg.json()["access_token"]
    buyer_headers = {"Authorization": f"Bearer {buyer_token}"}

    # 3. Establish Dealer Connection
    conn_res = client.post("/api/v1/dealers/connections", headers=buyer_headers, json={
        "target_business_id": seller_biz_id,
        "price_tier": "DEALER"
    })
    assert conn_res.status_code == 200

    # 4. Buyer places B2B order for 20 units
    order_res = client.post("/api/v1/dealers/orders", headers=buyer_headers, json={
        "seller_business_id": seller_biz_id,
        "items": [{
            "seller_variant_id": seller_var_id,
            "quantity_ordered": 20,
            "unit_price": 1200.00,
            "tax_rate": 5.0
        }],
        "notes": "Urgent festive dispatch required"
    })
    assert order_res.status_code == 200, order_res.text
    order_id = order_res.json()["order_id"]
    assert order_res.json()["status"] == "SUBMITTED"

    # 5. Seller checks incoming orders
    incoming_res = client.get("/api/v1/dealers/orders/incoming", headers=seller_headers)
    assert incoming_res.status_code == 200
    assert len(incoming_res.json()) >= 1
    incoming_order = incoming_res.json()[0]
    item_id = incoming_order["items"][0]["id"]

    # 6. Seller accepts the order for 20 units
    accept_res = client.post(f"/api/v1/dealers/orders/{order_id}/accept", headers=seller_headers, json={
        "accepted_quantities": {item_id: 20}
    })
    assert accept_res.status_code == 200
    assert accept_res.json()["status"] == "ACCEPTED"

    # Verify seller inventory has 20 reserved (on_hand: 50, reserved: 20, available: 30)
    seller_inv = client.get("/api/v1/inventory/levels", headers=seller_headers).json()[0]
    assert seller_inv["on_hand"] == 50
    assert seller_inv["reserved"] == 20
    assert seller_inv["available"] == 30

    # 7. Seller dispatches order with transporter and LR number
    disp_res = client.post(f"/api/v1/dealers/orders/{order_id}/dispatch", headers=seller_headers, json={
        "transporter_name": "VRL Logistics Express",
        "lr_number": "LR-VRL-998822"
    })
    assert disp_res.status_code == 200
    assert disp_res.json()["status"] == "DISPATCHED"

    # Verify seller inventory after dispatch (on_hand: 30, reserved: 0, available: 30)
    seller_inv_after = client.get("/api/v1/inventory/levels", headers=seller_headers).json()[0]
    assert seller_inv_after["on_hand"] == 30
    assert seller_inv_after["reserved"] == 0
    assert seller_inv_after["available"] == 30

    # 8. Buyer confirms delivery
    deliver_res = client.post(f"/api/v1/dealers/orders/{order_id}/deliver", headers=buyer_headers)
    assert deliver_res.status_code == 200
    assert deliver_res.json()["status"] == "DELIVERED"
