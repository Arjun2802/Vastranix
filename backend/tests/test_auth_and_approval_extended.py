import pytest
from fastapi.testclient import TestClient

def test_full_auth_and_approval_security_matrix(client: TestClient):
    """
    Comprehensive Phase 3 Test Matrix:
    1. Sign In with invalid password -> 401 'Incorrect email or password'.
    2. Owner Signup -> Creates Business, Flagship Branch, OWNER role, returns active token.
    3. Staff Signup -> Creates membership with is_approved=False.
    4. Unapproved Staff Sign In -> 403 Forbidden with clear store admin approval message.
    5. Admin views pending list -> Approves staff.
    6. Approved Staff Sign In -> 200 OK with role and store name context.
    7. Token Refresh -> /auth/refresh returns renewed token.
    8. Cross-Store Forgery Attempt -> Staff sends forged X-Business-ID header -> 403 Forbidden.
    9. Admin Deactivates Staff -> Subsequent Staff access denied.
    10. Staff Rejection -> Pending staff rejected and deleted.
    """
    # 1. Sign In with wrong credentials
    bad_login = client.post("/api/v1/auth/login", json={
        "email": "nonexistent@vastrenix.com",
        "password": "WrongPassword123!"
    })
    assert bad_login.status_code == 401
    assert "incorrect email or password" in bad_login.json()["detail"].lower()

    # 2. Owner Signup
    owner_reg = client.post("/api/v1/auth/register", json={
        "full_name": "Shantanu Singhania",
        "email": "shantanu@singhaniaheritagesilks.com",
        "password": "OwnerSecurePass2026!",
        "business_name": "Singhania Heritage Silks",
        "city": "Varanasi",
        "gstin": "09AAACS1234F1Z5"
    })
    assert owner_reg.status_code == 200
    owner_data = owner_reg.json()
    owner_token = owner_data["access_token"]
    store_id = owner_data["business"]["id"]
    owner_headers = {"Authorization": f"Bearer {owner_token}", "X-Business-ID": str(store_id)}

    # 3. Staff Signup under this store
    staff_signup = client.post("/api/v1/auth/staff-signup", json={
        "business_id": store_id,
        "full_name": "Kavita Rao",
        "email": "kavita.billing@singhania.com",
        "password": "KavitaBillingPass1!",
        "phone": "+91 97777 66666",
        "role": "CASHIER"
    })
    assert staff_signup.status_code == 200
    assert staff_signup.json()["status"] == "PENDING_APPROVAL"

    # 4. Unapproved Staff Sign In -> MUST return HTTP 403 with Store Admin notice
    unapproved_login = client.post("/api/v1/auth/login", json={
        "email": "kavita.billing@singhania.com",
        "password": "KavitaBillingPass1!"
    })
    assert unapproved_login.status_code == 403
    assert "pending approval" in unapproved_login.json()["detail"].lower()
    assert "singhania heritage silks" in unapproved_login.json()["detail"].lower()

    # 5. Admin lists pending staff and approves
    pending_list_res = client.get("/api/v1/auth/pending-staff", headers=owner_headers)
    assert pending_list_res.status_code == 200
    pending_items = pending_list_res.json()
    assert len(pending_items) >= 1
    target_mem = next(p for p in pending_items if p["email"] == "kavita.billing@singhania.com")
    membership_id = target_mem["membership_id"]

    approve_res = client.post(f"/api/v1/auth/staff/{membership_id}/approve", headers=owner_headers)
    assert approve_res.status_code == 200
    assert approve_res.json()["is_approved"] is True

    # 6. Approved Staff logs in successfully
    staff_login = client.post("/api/v1/auth/login", json={
        "email": "kavita.billing@singhania.com",
        "password": "KavitaBillingPass1!"
    })
    assert staff_login.status_code == 200
    staff_auth = staff_login.json()
    staff_token = staff_auth["access_token"]
    assert staff_auth["store_name"] == "Singhania Heritage Silks"
    assert staff_auth["is_staff"] is True
    staff_headers = {"Authorization": f"Bearer {staff_token}", "X-Business-ID": str(store_id)}

    # 7. Token Refresh
    refresh_res = client.post("/api/v1/auth/refresh", headers=staff_headers)
    assert refresh_res.status_code == 200
    new_token = refresh_res.json()["access_token"]
    assert new_token is not None
    refreshed_headers = {"Authorization": f"Bearer {new_token}", "X-Business-ID": str(store_id)}

    # 8. Cross-Store Forgery Attempt
    # Create another store
    other_owner = client.post("/api/v1/auth/register", json={
        "full_name": "Vikram Seth",
        "email": "vikram@sethtextiles.com",
        "password": "VikramPass2026!",
        "business_name": "Seth Textile Emporium",
        "city": "Surat"
    })
    other_store_id = other_owner.json()["business"]["id"]

    # Kavita (belongs to Singhania) attempts to pass Seth Textile's ID in header
    forged_headers = {"Authorization": f"Bearer {new_token}", "X-Business-ID": str(other_store_id)}
    cross_attempt = client.get("/api/v1/inventory/levels", headers=forged_headers)
    assert cross_attempt.status_code == 403
    assert "do not have access" in cross_attempt.json()["detail"].lower()

    # 9. Admin Deactivates Staff Member -> subsequent calls denied
    toggle_res = client.post(f"/api/v1/auth/staff/{membership_id}/toggle-status", headers=owner_headers)
    assert toggle_res.status_code == 200
    assert toggle_res.json()["is_active"] is False

    # Kavita attempts to call API after deactivation -> 403 Forbidden
    deactivated_call = client.get("/api/v1/pos/invoices", headers=refreshed_headers)
    assert deactivated_call.status_code == 403

    # Reactivate staff
    client.post(f"/api/v1/auth/staff/{membership_id}/toggle-status", headers=owner_headers)

    # 10. Staff Rejection Flow
    # Register another staff
    client.post("/api/v1/auth/staff-signup", json={
        "business_id": store_id,
        "full_name": "Temporary Worker",
        "email": "temp.reject@singhania.com",
        "password": "TempPass123!",
        "role": "CASHIER"
    })
    pending_list2 = client.get("/api/v1/auth/pending-staff", headers=owner_headers).json()
    temp_mem = next(p for p in pending_list2 if p["email"] == "temp.reject@singhania.com")

    # Reject
    reject_res = client.post(f"/api/v1/auth/staff/{temp_mem['membership_id']}/reject", headers=owner_headers)
    assert reject_res.status_code == 200
    assert "rejected and removed" in reject_res.json()["message"].lower()

    # Rejected staff login fails with 403 (does not belong to store)
    rejected_login = client.post("/api/v1/auth/login", json={
        "email": "temp.reject@singhania.com",
        "password": "TempPass123!"
    })
    assert rejected_login.status_code == 403
