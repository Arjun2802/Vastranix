import pytest
from backend.app.models.auth import User, Business, Branch, UserMembership
from backend.app.models.product import Product, ProductVariant
from backend.app.models.dealer import DealerOrder, DealerOrderItem
from backend.app.models.finance import BusinessExpense
from backend.app.core.security import get_password_hash, create_access_token

def test_expenses_and_dealer_order_staff_assignment(client, db_session):
    db = db_session
    # 1. Setup Store Owner & Staff
    owner_email = "owner_exp@vastrenix.com"
    staff_email = "staff_picker@vastrenix.com"

    owner = db.query(User).filter(User.email == owner_email).first()
    if not owner:
        owner = User(email=owner_email, full_name="Exp Store Owner", hashed_password=get_password_hash("Pass123!"), is_active=True)
        db.add(owner)
        db.flush()

    staff = db.query(User).filter(User.email == staff_email).first()
    if not staff:
        staff = User(email=staff_email, full_name="Staff Picker Aman", hashed_password=get_password_hash("Pass123!"), is_active=True)
        db.add(staff)
        db.flush()

    # Business
    biz = db.query(Business).filter(Business.name == "Exp Textiles").first()
    if not biz:
        biz = Business(name="Exp Textiles", legal_name="Exp Textiles LLP", currency="INR")
        db.add(biz)
        db.flush()

    branch = db.query(Branch).filter(Branch.business_id == biz.id).first()
    if not branch:
        branch = Branch(business_id=biz.id, name="Main Store", code="M1", is_main=True, is_active=True)
        db.add(branch)
        db.flush()

    # Memberships
    m_owner = db.query(UserMembership).filter(UserMembership.user_id == owner.id, UserMembership.business_id == biz.id).first()
    if not m_owner:
        m_owner = UserMembership(user_id=owner.id, business_id=biz.id, role="OWNER", branch_id=branch.id, is_active=True, is_approved=True)
        db.add(m_owner)

    m_staff = db.query(UserMembership).filter(UserMembership.user_id == staff.id, UserMembership.business_id == biz.id).first()
    if not m_staff:
        m_staff = UserMembership(user_id=staff.id, business_id=biz.id, role="CASHIER", branch_id=branch.id, is_active=True, is_approved=True)
        db.add(m_staff)

    # Buyer Business
    buyer_biz = db.query(Business).filter(Business.name == "Buyer Retail").first()
    if not buyer_biz:
        buyer_biz = Business(name="Buyer Retail", legal_name="Buyer Retail Pvt", currency="INR")
        db.add(buyer_biz)
        db.flush()

    # Product & Variant
    prod = Product(business_id=biz.id, name="Bridal Silk Lehenga", fabric="Pure Silk")
    db.add(prod)
    db.flush()
    var = ProductVariant(product_id=prod.id, sku="LEH-RED-L", size="L", color="Crimson Red", retail_price=12000.0, purchase_cost=6000.0)
    db.add(var)
    db.flush()

    # Dealer Order
    order = DealerOrder(
        buyer_business_id=buyer_biz.id,
        seller_business_id=biz.id,
        buyer_branch_id=branch.id,
        seller_branch_id=branch.id,
        order_number="B2B-EXP-001",
        status="SUBMITTED",
        total_amount=24000.0
    )
    db.add(order)
    db.flush()
    order_item = DealerOrderItem(
        dealer_order_id=order.id,
        seller_variant_id=var.id,
        product_name=prod.name,
        size=var.size,
        color=var.color,
        sku=var.sku,
        quantity_ordered=2,
        unit_price=12000.0,
        line_total=24000.0
    )
    db.add(order_item)
    db.commit()

    owner_token = create_access_token({"sub": str(owner.id)})
    headers = {"Authorization": f"Bearer {owner_token}", "X-Business-ID": str(biz.id)}

    # 2. Test Record Expense
    exp_res = client.post(
        "/api/v1/finance/expenses",
        json={
            "category": "PACKAGING",
            "amount": 2500.0,
            "payment_mode": "UPI",
            "description": "Premium garment dust covers and boxes"
        },
        headers=headers
    )
    assert exp_res.status_code == 200, exp_res.text
    assert exp_res.json()["amount"] == 2500.0

    # Test List Expenses
    list_exp = client.get("/api/v1/finance/expenses", headers=headers)
    assert list_exp.status_code == 200
    expenses = list_exp.json()
    assert len(expenses) >= 1
    assert any(e["category"] == "PACKAGING" and e["amount"] == 2500.0 for e in expenses)

    # 3. Test Order Staff Assignment
    assign_res = client.post(
        f"/api/v1/dealers/orders/{order.id}/assign-staff",
        json={"staff_id": staff.id},
        headers=headers
    )
    assert assign_res.status_code == 200, assign_res.text
    assert assign_res.json()["assigned_staff_id"] == staff.id
    assert assign_res.json()["assigned_staff_name"] == staff.full_name

    # Verify incoming orders endpoint returns the assigned staff name and ID
    inc_res = client.get("/api/v1/dealers/orders/incoming", headers=headers)
    assert inc_res.status_code == 200
    orders = inc_res.json()
    target_order = next((o for o in orders if o["id"] == order.id), None)
    assert target_order is not None
    assert target_order["assigned_staff_id"] == staff.id
    assert target_order["assigned_staff_name"] == "Staff Picker Aman"
