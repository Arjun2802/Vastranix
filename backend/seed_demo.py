import os
import sys
from decimal import Decimal
from datetime import datetime, timezone

# Ensure project root is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.core.database import SessionLocal, Base, engine
from backend.app.core.security import get_password_hash
from backend.app.models import (
    User, Business, Branch, UserMembership, Category, Brand, Product, ProductVariant,
    InventoryLevel, StockMovement, Supplier, Customer, Invoice, InvoiceItem, Payment,
    DealerConnection, DealerOrder, DealerOrderItem, OnlineStorefront
)
from backend.app.services.invoice_renderer import render_invoice_pdf

def seed_database():
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # Check if already seeded
        existing_owner = db.query(User).filter(User.email == "demo@vastrenix.com").first()
        if existing_owner:
            print("Database already contains demo user. Skipping seed.")
            return

        print("Seeding Vastrenix Demo Environment...")

        # 1. Primary User & Business (Vastrenix Heritage Garments)
        owner = User(
            email="demo@vastrenix.com",
            phone="+91 98765 43210",
            full_name="Rajeshwar Varma",
            hashed_password=get_password_hash("VastrenixDemo2026!"),
            is_active=True
        )
        db.add(owner)
        db.flush()

        business = Business(
            name="Vastrenix Heritage Garments",
            legal_name="Vastrenix Heritage Apparel Pvt Ltd",
            gstin="24AAACV1234F1Z9",
            phone="+91 98765 43210",
            email="contact@vastrenix-heritage.com",
            currency="INR",
            language="en",
            address="Plot 104, Textile Market Ring Road",
            city="Surat",
            state="Gujarat",
            pincode="395002",
            country="India",
            upi_id="vastrenix@icici",
            default_invoice_theme="PREMIUM_BOUTIQUE"
        )
        db.add(business)
        db.flush()

        main_branch = Branch(
            business_id=business.id,
            name="Surat Flagship Store & Atelier",
            code="SRT-FLG-01",
            phone="+91 98765 43210",
            address="Plot 104, Textile Market Ring Road, Surat",
            is_main=True,
            is_active=True
        )
        db.add(main_branch)
        db.flush()

        membership = UserMembership(
            user_id=owner.id,
            business_id=business.id,
            role="OWNER",
            branch_id=main_branch.id,
            is_active=True
        )
        db.add(membership)

        # Cashier staff
        cashier = User(
            email="cashier@vastrenix.com",
            phone="+91 98222 33445",
            full_name="Pooja Sharma",
            hashed_password=get_password_hash("CashierPass123!"),
            is_active=True
        )
        db.add(cashier)
        db.flush()

        cashier_mem = UserMembership(
            user_id=cashier.id,
            business_id=business.id,
            role="CASHIER",
            branch_id=main_branch.id,
            is_active=True
        )
        db.add(cashier_mem)

        # 2. Secondary Business for B2B Dealer Network (Kaveri Boutique, Mumbai)
        dealer_owner = User(
            email="kaveri@boutique.com",
            phone="+91 99200 88776",
            full_name="Kaveri Singhania",
            hashed_password=get_password_hash("KaveriPass123!"),
            is_active=True
        )
        db.add(dealer_owner)
        db.flush()

        dealer_biz = Business(
            name="Kaveri Haute Boutique",
            legal_name="Kaveri Retail LLP",
            gstin="27AABCK5678J1Z2",
            phone="+91 99200 88776",
            email="orders@kaveri-boutique.com",
            currency="INR",
            city="Mumbai",
            state="Maharashtra",
            country="India",
            default_invoice_theme="MODERN_MINIMAL"
        )
        db.add(dealer_biz)
        db.flush()

        dealer_branch = Branch(
            business_id=dealer_biz.id,
            name="Kala Ghoda Atelier",
            code="MUM-KG-01",
            is_main=True,
            is_active=True
        )
        db.add(dealer_branch)
        db.flush()

        db.add(UserMembership(
            user_id=dealer_owner.id,
            business_id=dealer_biz.id,
            role="OWNER",
            branch_id=dealer_branch.id,
            is_active=True
        ))

        # Connect the two businesses in B2B Network
        connection = DealerConnection(
            requester_business_id=dealer_biz.id,
            target_business_id=business.id,
            status="CONNECTED",
            price_tier="DEALER",
            credit_limit=Decimal("500000.00"),
            payment_terms="Net 15 Days"
        )
        db.add(connection)

        # 3. Clothing Products & Variants
        cat_festive = Category(business_id=business.id, name="Festive & Occasion Wear")
        cat_casual = Category(business_id=business.id, name="Everyday Casuals")
        db.add_all([cat_festive, cat_casual])
        db.flush()

        # Product 1: Pure Silk Nehru Jacket
        p1 = Product(
            business_id=business.id,
            category_id=cat_festive.id,
            name="Banarasi Raw Silk Nehru Jacket",
            code="JKT-BNR-01",
            description="Handwoven pure raw silk jacket with hand-carved brass buttons and satin lining.",
            fabric="100% Pure Raw Silk",
            material="Raw Silk 280 GSM",
            pattern="Brocade Woven",
            season="Festive 2026",
            gender="Men",
            fit="Tailored Classic",
            hsn_sac="6203",
            tax_rate=Decimal("5.00"),
            unit_of_measure="PCS"
        )
        db.add(p1)
        db.flush()

        p1_sizes = [("38", 12), ("40", 8), ("42", 2), ("44", 0)] # 42 is low stock (2), 44 is out of stock (0)
        p1_variants = []
        for sz, stock_qty in p1_sizes:
            v = ProductVariant(
                product_id=p1.id,
                sku=f"JKT-BNR-SLK-ROYAL-{sz}",
                barcode=f"8901234{sz}01",
                size=sz,
                color="Royal Navy & Gold",
                color_hex="#192B3A",
                purchase_cost=Decimal("1800.00"),
                retail_price=Decimal("4990.00"),
                wholesale_price=Decimal("2900.00"),
                dealer_price=Decimal("2650.00"),
                min_stock_alert=3,
                is_active=True
            )
            db.add(v)
            db.flush()
            p1_variants.append(v)

            lvl = InventoryLevel(
                variant_id=v.id,
                branch_id=main_branch.id,
                on_hand=stock_qty,
                reserved=0,
                rack_location="Aisle 2 - Rack B"
            )
            db.add(lvl)

        # Product 2: Handloom Linen Kurta
        p2 = Product(
            business_id=business.id,
            category_id=cat_casual.id,
            name="Handloom Linen Relaxed Kurta",
            code="KRT-LNN-02",
            description="Breathable pre-washed pure European flax linen kurta with mandarin collar.",
            fabric="100% Pure Linen",
            pattern="Solid",
            season="All-Season",
            gender="Unisex",
            fit="Relaxed Comfort",
            hsn_sac="6205",
            tax_rate=Decimal("5.00"),
            unit_of_measure="PCS"
        )
        db.add(p2)
        db.flush()

        p2_sizes = [("M", 25), ("L", 30), ("XL", 18)]
        p2_variants = []
        for sz, stock_qty in p2_sizes:
            v = ProductVariant(
                product_id=p2.id,
                sku=f"KRT-LNN-IVR-{sz}",
                barcode=f"8905678{sz}02",
                size=sz,
                color="Warm Ivory",
                color_hex="#FAF8F3",
                purchase_cost=Decimal("750.00"),
                retail_price=Decimal("2190.00"),
                wholesale_price=Decimal("1250.00"),
                dealer_price=Decimal("1100.00"),
                min_stock_alert=5
            )
            db.add(v)
            db.flush()
            p2_variants.append(v)

            lvl = InventoryLevel(
                variant_id=v.id,
                branch_id=main_branch.id,
                on_hand=stock_qty,
                reserved=0,
                rack_location="Aisle 1 - Bay 4"
            )
            db.add(lvl)

        # 4. Customers & Initial Invoices
        cust1 = Customer(
            business_id=business.id,
            name="Ananya Deshmukh",
            phone="+91 98111 22334",
            email="ananya@deshmukh.org",
            city="Pune",
            state="Maharashtra"
        )
        db.add(cust1)
        db.flush()

        # Seed Sample Posted Invoice
        inv1 = Invoice(
            business_id=business.id,
            branch_id=main_branch.id,
            customer_id=cust1.id,
            invoice_number="INV-20261022-0001",
            invoice_date=datetime.now(timezone.utc),
            subtotal=Decimal("7180.00"),
            discount_amount=Decimal("500.00"),
            tax_amount=Decimal("334.00"),
            total_amount=Decimal("7014.00"),
            paid_amount=Decimal("7014.00"),
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            payment_mode="UPI",
            invoice_theme="PREMIUM_BOUTIQUE",
            status="POSTED",
            cashier_id=owner.id,
            notes="Exclusive Diwali Collection Purchase"
        )
        db.add(inv1)
        db.flush()

        inv1_item1 = InvoiceItem(
            invoice_id=inv1.id,
            variant_id=p1_variants[0].id,
            product_name="Banarasi Raw Silk Nehru Jacket",
            size="38",
            color="Royal Navy & Gold",
            sku=p1_variants[0].sku,
            quantity=1,
            unit_price=Decimal("4990.00"),
            tax_rate=Decimal("5.00"),
            tax_amount=Decimal("249.50"),
            line_total=Decimal("5239.50")
        )
        inv1_item2 = InvoiceItem(
            invoice_id=inv1.id,
            variant_id=p2_variants[0].id,
            product_name="Handloom Linen Relaxed Kurta",
            size="M",
            color="Warm Ivory",
            sku=p2_variants[0].sku,
            quantity=1,
            unit_price=Decimal("2190.00"),
            tax_rate=Decimal("5.00"),
            tax_amount=Decimal("109.50"),
            line_total=Decimal("2299.50")
        )
        db.add_all([inv1_item1, inv1_item2])

        db.add(Payment(
            business_id=business.id,
            invoice_id=inv1.id,
            customer_id=cust1.id,
            amount=Decimal("7014.00"),
            payment_mode="UPI",
            reference_number="UPI/UTR/990234881",
            verified=True,
            cashier_id=owner.id
        ))

        # Render PDF
        pdf_name = render_invoice_pdf(inv1, business, main_branch, cust1, [inv1_item1, inv1_item2], "PREMIUM_BOUTIQUE")
        inv1.pdf_filename = pdf_name

        # 5. Seed Online Storefront
        store = OnlineStorefront(
            business_id=business.id,
            slug="vastrenix-heritage",
            title="Vastrenix Heritage Atelier",
            tagline="Conscious Textile Craftsmanship & Timeless Garments",
            is_enabled=True,
            currency="INR"
        )
        db.add(store)

        # 6. Seed Pending Incoming Dealer Order from Kaveri Boutique
        d_order = DealerOrder(
            order_number="B2B-20261022-0001",
            buyer_business_id=dealer_biz.id,
            seller_business_id=business.id,
            buyer_branch_id=dealer_branch.id,
            seller_branch_id=main_branch.id,
            status="SUBMITTED",
            subtotal=Decimal("26500.00"),
            tax_amount=Decimal("1325.00"),
            total_amount=Decimal("27825.00"),
            notes="Immediate order for upcoming Festive Exhibition."
        )
        db.add(d_order)
        db.flush()

        db.add(DealerOrderItem(
            dealer_order_id=d_order.id,
            seller_variant_id=p1_variants[0].id,
            product_name="Banarasi Raw Silk Nehru Jacket",
            size="38",
            color="Royal Navy & Gold",
            sku=p1_variants[0].sku,
            quantity_ordered=10,
            quantity_accepted=0,
            quantity_dispatched=0,
            unit_price=Decimal("2650.00"),
            tax_rate=Decimal("5.00"),
            line_total=Decimal("26500.00")
        ))

        db.commit()
        print("Demo database successfully seeded!")
        print(f"Owner credentials: {owner.email} / VastrenixDemo2026!")
        print(f"Cashier credentials: {cashier.email} / CashierPass123!")
        print(f"Dealer credentials: {dealer_owner.email} / KaveriPass123!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
