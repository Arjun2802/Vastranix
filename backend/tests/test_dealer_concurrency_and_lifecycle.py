import pytest
from decimal import Decimal

def test_dealer_full_lifecycle_and_rejection(client):
    # Register Seller
    s_reg = client.post("/api/v1/auth/register", json={
        "email": "mfg@mill.com",
        "password": "Password123!",
        "full_name": "Silk Manufacturer",
        "business_name": "Kanchipuram Silk Weavers"
    })
    s_token = s_reg.json()["access_token"]
    s_biz_id = s_reg.json()["business"]["id"]
    s_headers = {"Authorization": f"Bearer {s_token}"}

    # Register Buyer
    b_reg = client.post("/api/v1/auth/register", json={
        "email": "retail@boutique.com",
        "password": "Password123!",
        "full_name": "Royal Boutique",
        "business_name": "Royal Heritage Silks"
    })
    b_token = b_reg.json()["access_token"]
    b_headers = {"Authorization": f"Bearer {b_token}"}

    # Connect businesses
    client.post("/api/v1/dealers/connections", headers=b_headers, json={
        "target_business_id": s_biz_id,
        "price_tier": "DEALER"
    })

    # Seller creates product
    client.post("/api/v1/products/", headers=s_headers, json={
        "name": "Zari Brocade Silk Saree",
        "variants": [{
            "sku": "SAREE-ZARI-GOLD",
            "size": "Free",
            "color": "Crimson Gold",
            "dealer_price": 4500.00,
            "retail_price": 8999.00,
            "initial_stock": 30
        }]
    })
    var_id = client.get("/api/v1/products/", headers=s_headers).json()[0]["variants"][0]["id"]

    # 1. Test Rejection flow on first order
    ord1_res = client.post("/api/v1/dealers/orders", headers=b_headers, json={
        "seller_business_id": s_biz_id,
        "items": [{"seller_variant_id": var_id, "quantity_ordered": 10, "unit_price": 4500.00}]
    })
    assert ord1_res.status_code == 200
    ord1_id = ord1_res.json()["order_id"]

    # Seller rejects order 1
    rej_res = client.post(f"/api/v1/dealers/orders/{ord1_id}/reject", headers=s_headers, json={
        "reason": "Zari thread currently out of stock at loom"
    })
    assert rej_res.status_code == 200
    assert rej_res.json()["status"] == "REJECTED"
    assert "Zari thread" in rej_res.json()["rejection_reason"]

    # Trying to accept or reject already rejected order fails with 400
    dup_rej = client.post(f"/api/v1/dealers/orders/{ord1_id}/reject", headers=s_headers, json={"reason": "Repeat"})
    assert dup_rej.status_code == 400
    assert "already processed" in dup_rej.json()["detail"]

    # 2. Test Full State Machine: Submitted -> Accepted -> Processing -> Packed -> Dispatched -> Delivered -> Closed
    ord2_res = client.post("/api/v1/dealers/orders", headers=b_headers, json={
        "seller_business_id": s_biz_id,
        "items": [{"seller_variant_id": var_id, "quantity_ordered": 15, "unit_price": 4500.00}]
    })
    ord2_id = ord2_res.json()["order_id"]

    # Accept order (reserves 15 stock)
    acc_res = client.post(f"/api/v1/dealers/orders/{ord2_id}/accept", headers=s_headers, json={
        "accepted_quantities": {}
    })
    assert acc_res.status_code == 200
    assert acc_res.json()["status"] == "ACCEPTED"

    # Move to Processing
    proc_res = client.post(f"/api/v1/dealers/orders/{ord2_id}/processing", headers=s_headers)
    assert proc_res.status_code == 200
    assert proc_res.json()["status"] == "PROCESSING"

    # Move to Packed
    pack_res = client.post(f"/api/v1/dealers/orders/{ord2_id}/pack", headers=s_headers)
    assert pack_res.status_code == 200
    assert pack_res.json()["status"] == "PACKED"

    # Dispatch order
    disp_res = client.post(f"/api/v1/dealers/orders/{ord2_id}/dispatch", headers=s_headers, json={
        "transporter_name": "Blue Dart Express",
        "lr_number": "BD-77889900"
    })
    assert disp_res.status_code == 200
    assert disp_res.json()["status"] == "DISPATCHED"

    # Buyer confirms delivery
    deliv_res = client.post(f"/api/v1/dealers/orders/{ord2_id}/deliver", headers=b_headers)
    assert deliv_res.status_code == 200
    assert deliv_res.json()["status"] == "DELIVERED"

    # Close order
    close_res = client.post(f"/api/v1/dealers/orders/{ord2_id}/close", headers=b_headers)
    assert close_res.status_code == 200
    assert close_res.json()["status"] == "CLOSED"

def test_dealer_concurrency_and_cross_tenant_isolation(client):
    # Setup Store A (Seller)
    s_reg = client.post("/api/v1/auth/register", json={
        "email": "seller_a@fabrics.com",
        "password": "Password123!",
        "full_name": "Store A Owner",
        "business_name": "Store A Wholesale Textiles"
    })
    s_token = s_reg.json()["access_token"]
    s_biz_id = s_reg.json()["business"]["id"]
    s_headers = {"Authorization": f"Bearer {s_token}"}

    # Setup Store B (Buyer)
    b_reg = client.post("/api/v1/auth/register", json={
        "email": "buyer_b@retail.com",
        "password": "Password123!",
        "full_name": "Store B Buyer",
        "business_name": "Store B Fashion Studio"
    })
    b_token = b_reg.json()["access_token"]
    b_biz_id = b_reg.json()["business"]["id"]
    b_headers = {"Authorization": f"Bearer {b_token}"}

    # Setup Store C (Unrelated Intruder)
    c_reg = client.post("/api/v1/auth/register", json={
        "email": "intruder_c@stranger.com",
        "password": "Password123!",
        "full_name": "Store C Stranger",
        "business_name": "Store C Unrelated Business"
    })
    c_token = c_reg.json()["access_token"]
    c_headers = {"Authorization": f"Bearer {c_token}"}

    # Connect A and B
    client.post("/api/v1/dealers/connections", headers=b_headers, json={"target_business_id": s_biz_id})

    # Seller A creates item with stock 10
    client.post("/api/v1/products/", headers=s_headers, json={
        "name": "Chanderi Cotton Tunic",
        "variants": [{
            "sku": "CHANDERI-TUNIC-M",
            "size": "M",
            "color": "Mint Green",
            "dealer_price": 800.00,
            "retail_price": 1800.00,
            "initial_stock": 10
        }]
    })
    var_id = client.get("/api/v1/products/", headers=s_headers).json()[0]["variants"][0]["id"]

    # Buyer B creates order for 5 pieces
    ord_res = client.post("/api/v1/dealers/orders", headers=b_headers, json={
        "seller_business_id": s_biz_id,
        "items": [{"seller_variant_id": var_id, "quantity_ordered": 5, "unit_price": 800.00}]
    })
    order_id = ord_res.json()["order_id"]

    # --- CROSS-TENANT ISOLATION TESTS ---
    # 1. Store C cannot view Store A's incoming orders
    c_incoming = client.get("/api/v1/dealers/orders/incoming", headers=c_headers).json()
    assert all(o["id"] != order_id for o in c_incoming)

    # 2. Store C cannot view Store B's outgoing orders
    c_outgoing = client.get("/api/v1/dealers/orders/outgoing", headers=c_headers).json()
    assert all(o["id"] != order_id for o in c_outgoing)

    # 3. Store C cannot accept Store A's order -> 404
    c_acc = client.post(f"/api/v1/dealers/orders/{order_id}/accept", headers=c_headers, json={"accepted_quantities": {}})
    assert c_acc.status_code == 404
    assert "not found" in c_acc.json()["detail"].lower()

    # 4. Store C cannot dispatch Store A's order -> 404
    c_disp = client.post(f"/api/v1/dealers/orders/{order_id}/dispatch", headers=c_headers, json={"transporter_name": "Fake", "lr_number": "123"})
    assert c_disp.status_code == 404

    # 5. Store C cannot confirm delivery on Store B's order -> 404
    c_deliv = client.post(f"/api/v1/dealers/orders/{order_id}/deliver", headers=c_headers)
    assert c_deliv.status_code == 404

    # --- CONCURRENCY & DOUBLE-ACTION TESTS ---
    # Tab 1: Seller A accepts order
    acc1 = client.post(f"/api/v1/dealers/orders/{order_id}/accept", headers=s_headers, json={"accepted_quantities": {}})
    assert acc1.status_code == 200

    # Tab 2 (simultaneous double click): Second accept attempt gets clear error
    acc2 = client.post(f"/api/v1/dealers/orders/{order_id}/accept", headers=s_headers, json={"accepted_quantities": {}})
    assert acc2.status_code == 400
    assert "already processed" in acc2.json()["detail"].lower()

    # Tab 1: Seller A dispatches order
    disp1 = client.post(f"/api/v1/dealers/orders/{order_id}/dispatch", headers=s_headers, json={
        "transporter_name": "Speed Post Cargo",
        "lr_number": "SP-001122"
    })
    assert disp1.status_code == 200

    # Tab 2: Second dispatch attempt gets clear error
    disp2 = client.post(f"/api/v1/dealers/orders/{order_id}/dispatch", headers=s_headers, json={
        "transporter_name": "Speed Post Cargo",
        "lr_number": "SP-001122"
    })
    assert disp2.status_code == 400
    assert "already processed" in disp2.json()["detail"].lower()

    # Tab 1: Buyer B marks delivered
    deliv1 = client.post(f"/api/v1/dealers/orders/{order_id}/deliver", headers=b_headers)
    assert deliv1.status_code == 200

    # Tab 2: Second deliver attempt gets clear error
    deliv2 = client.post(f"/api/v1/dealers/orders/{order_id}/deliver", headers=b_headers)
    assert deliv2.status_code == 400
    assert "already processed" in deliv2.json()["detail"].lower()
