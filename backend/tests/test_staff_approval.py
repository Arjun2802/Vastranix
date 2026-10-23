def test_staff_signup_and_store_admin_approval_lifecycle(client):
    """
    Verifies:
    1. Store Admin registers a Store (e.g. 'Royal Silks Boutique').
    2. Staff member signs up under 'Royal Silks Boutique'.
    3. Staff attempts to login BEFORE store admin approval -> 403 Forbidden with pending message.
    4. Store Admin views pending staff list, sees the request.
    5. Store Admin approves staff.
    6. Staff logs in successfully AFTER approval -> response displays Store Name and Staff Role.
    7. Staff's active business matches the Store Name.
    """
    # 1. Register Store Owner & Store
    owner_reg = client.post("/api/v1/auth/register", json={
        "email": "owner@royalsilks.com",
        "password": "OwnerSecurePass1!",
        "full_name": "Rameshvar Lal",
        "business_name": "Royal Silks Heritage Store",
        "city": "Jaipur"
    })
    assert owner_reg.status_code == 200, owner_reg.text
    owner_token = owner_reg.json()["access_token"]
    store_id = owner_reg.json()["business"]["id"]
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    # 2. Staff self-registers under this store
    staff_signup_res = client.post("/api/v1/auth/staff-signup", json={
        "business_id": store_id,
        "email": "cashier.aman@royalsilks.com",
        "password": "AmanPassword123!",
        "full_name": "Aman Verma",
        "phone": "+91 98888 77777",
        "role": "CASHIER"
    })
    assert staff_signup_res.status_code == 200, staff_signup_res.text
    signup_data = staff_signup_res.json()
    assert signup_data["status"] == "PENDING_APPROVAL"
    assert "pending approval" in signup_data["message"].lower()

    # 3. Staff attempts login BEFORE approval -> MUST BE FORBIDDEN 403
    staff_login_fail = client.post("/api/v1/auth/login", json={
        "email": "cashier.aman@royalsilks.com",
        "password": "AmanPassword123!"
    })
    assert staff_login_fail.status_code == 403
    assert "pending approval" in staff_login_fail.json()["detail"].lower()
    assert "royal silks heritage store" in staff_login_fail.json()["detail"].lower()

    # 4. Store Admin views pending staff requests
    pending_res = client.get("/api/v1/auth/pending-staff", headers=owner_headers)
    assert pending_res.status_code == 200
    pending_list = pending_res.json()
    assert len(pending_list) == 1
    req = pending_list[0]
    assert req["email"] == "cashier.aman@royalsilks.com"
    assert req["full_name"] == "Aman Verma"
    assert req["role"] == "CASHIER"
    membership_id = req["membership_id"]

    # 5. Store Admin approves staff
    approve_res = client.post(f"/api/v1/auth/staff/{membership_id}/approve", headers=owner_headers)
    assert approve_res.status_code == 200
    assert approve_res.json()["is_approved"] is True

    # 6. Staff logs in AFTER approval -> SUCCESS
    staff_login_ok = client.post("/api/v1/auth/login", json={
        "email": "cashier.aman@royalsilks.com",
        "password": "AmanPassword123!"
    })
    assert staff_login_ok.status_code == 200
    staff_data = staff_login_ok.json()
    assert "access_token" in staff_data
    assert staff_data["store_name"] == "Royal Silks Heritage Store"
    assert staff_data["is_staff"] is True
    assert staff_data["active_business"]["role"] == "CASHIER"
    assert staff_data["active_business"]["store_name"] == "Royal Silks Heritage Store"
