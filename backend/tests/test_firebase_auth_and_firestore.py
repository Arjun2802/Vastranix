"""
VASTRENIX — Firebase Auth Verification & Firestore Security/Tenant Matrix Tests
Confirms:
1. Valid Firebase token + approved staff -> 200 OK
2. Valid Firebase token + unapproved staff -> 403 Forbidden with exact pending approval message
3. Invalid / expired token -> 401 Unauthorized
4. Cross-business access attempt -> 403 Forbidden
5. Atomic Firestore transaction & Idempotency Key deduplication
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import SessionLocal
from backend.app.models.auth import User, Business, Branch, UserMembership, UserRole
from backend.app.core.security import get_password_hash
from backend.app.repositories.firestore_repo import firestore_repo

client = TestClient(app)

@pytest.fixture(scope="module")
def setup_test_businesses():
    db = SessionLocal()
    # 1. Setup Business A
    biz_a = db.query(Business).filter(Business.name == "Firebase Boutique Alpha").first()
    if not biz_a:
        biz_a = Business(name="Firebase Boutique Alpha", currency="INR")
        db.add(biz_a)
        db.flush()
        br_a = Branch(business_id=biz_a.id, name="Main Branch", code="BR-ALPHA", is_main=True)
        db.add(br_a)
        db.flush()

    # 2. Setup Business B (Isolated Tenant)
    biz_b = db.query(Business).filter(Business.name == "Firebase Boutique Beta").first()
    if not biz_b:
        biz_b = Business(name="Firebase Boutique Beta", currency="INR")
        db.add(biz_b)
        db.flush()
        br_b = Branch(business_id=biz_b.id, name="Beta Branch", code="BR-BETA", is_main=True)
        db.add(br_b)
        db.flush()

    # 3. Setup Approved Staff under Business A
    approved_user = db.query(User).filter(User.email == "approved.staff@firebase.com").first()
    if not approved_user:
        approved_user = User(
            email="approved.staff@firebase.com",
            firebase_uid="fb_uid_approved_123",
            full_name="Approved Staff",
            hashed_password=get_password_hash("Pass123!"),
            is_active=True
        )
        db.add(approved_user)
        db.flush()
        mem_a = UserMembership(
            user_id=approved_user.id,
            business_id=biz_a.id,
            role="CASHIER",
            is_active=True,
            is_approved=True
        )
        db.add(mem_a)

    # 4. Setup Unapproved (Pending) Staff under Business A
    pending_user = db.query(User).filter(User.email == "pending.staff@firebase.com").first()
    if not pending_user:
        pending_user = User(
            email="pending.staff@firebase.com",
            firebase_uid="fb_uid_pending_456",
            full_name="Pending Staff",
            hashed_password=get_password_hash("Pass123!"),
            is_active=True
        )
        db.add(pending_user)
        db.flush()
        mem_pending = UserMembership(
            user_id=pending_user.id,
            business_id=biz_a.id,
            role="CASHIER",
            is_active=True,
            is_approved=False
        )
        db.add(mem_pending)

    db.commit()
    yield {
        "biz_a_id": biz_a.id,
        "biz_b_id": biz_b.id,
        "approved_uid": "fb_uid_approved_123",
        "pending_uid": "fb_uid_pending_456"
    }
    db.close()


def test_invalid_or_expired_firebase_token():
    """Confirms invalid or expired token is rejected with HTTP 401."""
    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid_garbage_token_999"}
    )
    assert res.status_code == 401
    assert "Invalid or expired authentication token" in res.json()["detail"]


@patch("firebase_admin.auth.verify_id_token")
def test_valid_token_unapproved_staff_rejected_403(mock_verify, setup_test_businesses):
    """Confirms valid token for unapproved staff returns HTTP 403 with exact pending approval message."""
    data = setup_test_businesses
    mock_verify.return_value = {
        "uid": data["pending_uid"],
        "email": "pending.staff@firebase.com",
        "name": "Pending Staff"
    }

    # Request accessing a protected tenant route
    res = client.get(
        "/api/v1/products/",
        headers={
            "Authorization": "Bearer mock_valid_pending_firebase_token",
            "X-Business-ID": str(data["biz_a_id"])
        }
    )
    assert res.status_code == 403
    assert "pending approval by the Store Administrator" in res.json()["detail"]


@patch("firebase_admin.auth.verify_id_token")
def test_valid_token_approved_staff_succeeds_200(mock_verify, setup_test_businesses):
    """Confirms valid token for approved staff succeeds with HTTP 200."""
    data = setup_test_businesses
    mock_verify.return_value = {
        "uid": data["approved_uid"],
        "email": "approved.staff@firebase.com",
        "name": "Approved Staff"
    }

    res = client.get(
        "/api/v1/products/",
        headers={
            "Authorization": "Bearer mock_valid_approved_firebase_token",
            "X-Business-ID": str(data["biz_a_id"])
        }
    )
    assert res.status_code == 200


@patch("firebase_admin.auth.verify_id_token")
def test_cross_business_access_denied_403(mock_verify, setup_test_businesses):
    """Confirms staff of Store A cannot access Store B (cross-tenant leak protection)."""
    data = setup_test_businesses
    mock_verify.return_value = {
        "uid": data["approved_uid"],
        "email": "approved.staff@firebase.com",
        "name": "Approved Staff"
    }

    # Attempting to query Store B
    res = client.get(
        "/api/v1/products/",
        headers={
            "Authorization": "Bearer mock_valid_approved_firebase_token",
            "X-Business-ID": str(data["biz_b_id"])
        }
    )
    assert res.status_code == 403
    assert "You do not have access to any active business or specified business" in res.json()["detail"]


def test_firestore_repository_idempotency_and_safe_serialization(setup_test_businesses):
    """Verifies repository idempotency caching and serialization."""
    from decimal import Decimal
    from datetime import datetime, timezone
    from backend.app.repositories.firestore_repo import serialize_for_firestore

    data = setup_test_businesses
    biz_id = data["biz_a_id"]
    idempotency_key = f"test_idem_{biz_id}_999"

    # Test serialization helper (Decimals to float, datetimes to ISO)
    sample_payload = {
        "invoice_total": Decimal("1499.50"),
        "timestamp": datetime.now(timezone.utc),
        "items": [{"price": Decimal("750.00"), "qty": 2}]
    }
    serialized = serialize_for_firestore(sample_payload)
    assert isinstance(serialized["invoice_total"], float)
    assert serialized["invoice_total"] == 1499.50
    assert isinstance(serialized["timestamp"], str)
    assert isinstance(serialized["items"][0]["price"], float)

    # Test check_idempotency with mocked Firestore collection
    from backend.app.repositories.firestore_repo import FirestoreRepository
    from unittest.mock import PropertyMock

    with patch.object(FirestoreRepository, "is_active", new_callable=PropertyMock, return_value=True), \
         patch.object(firestore_repo, "_col") as mock_col:
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"response_data": {"sale_id": 999, "status": "COMPLETED"}}
        mock_col.return_value.document.return_value.get.return_value = mock_doc

        cached = firestore_repo.check_idempotency(biz_id, idempotency_key)
        assert cached == {"sale_id": 999, "status": "COMPLETED"}
