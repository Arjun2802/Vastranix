import pytest

def test_all_six_invoice_themes(client):
    """
    Tests that all 6 invoice themes render properly and generate valid PDFs:
    1. CLASSIC_GST
    2. MODERN_MINIMAL
    3. PREMIUM_BOUTIQUE
    4. WHOLESALE_DEALER
    5. COMPACT_THERMAL
    6. INTERNATIONAL_COMMERCIAL
    """
    # Register business
    reg = client.post("/api/v1/auth/register", json={
        "email": "themes@vastrenix.com",
        "password": "Password123!",
        "full_name": "Vikram Sethi",
        "business_name": "Sethi Textile Mills"
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Add product
    prod = client.post("/api/v1/products/", headers=headers, json={
        "name": "Supima Cotton Executive Shirt",
        "hsn_sac": "6205",
        "tax_rate": 5.0,
        "variants": [{
            "sku": "SHIRT-SUPIMA-WHT-40",
            "size": "40",
            "color": "Crisp White",
            "retail_price": 1999.00,
            "initial_stock": 100
        }]
    })
    var_id = client.get("/api/v1/products/", headers=headers).json()[0]["variants"][0]["id"]

    themes = [
        "CLASSIC_GST",
        "MODERN_MINIMAL",
        "PREMIUM_BOUTIQUE",
        "WHOLESALE_DEALER",
        "COMPACT_THERMAL",
        "INTERNATIONAL_COMMERCIAL"
    ]

    for theme in themes:
        res = client.post("/api/v1/pos/sale", headers=headers, json={
            "customer_name": f"Client for {theme}",
            "items": [{
                "variant_id": var_id,
                "product_name": "Supima Cotton Executive Shirt",
                "size": "40",
                "color": "Crisp White",
                "sku": "SHIRT-SUPIMA-WHT-40",
                "quantity": 2,
                "unit_price": 1999.00,
                "tax_rate": 5.0
            }],
            "invoice_theme": theme
        })
        assert res.status_code == 200, f"Failed for theme {theme}: {res.text}"
        data = res.json()
        assert data["invoice_theme"] == theme
        inv_id = data["invoice_id"]

        # Verify PDF download endpoint returns 200 and application/pdf
        pdf_res = client.get(f"/api/v1/pos/invoices/{inv_id}/pdf", headers=headers)
        assert pdf_res.status_code == 200
        assert pdf_res.headers["content-type"] == "application/pdf"
        assert len(pdf_res.content) > 500

        # Verify HTML preview endpoint returns 200 and html
        html_res = client.get(f"/api/v1/pos/invoices/{inv_id}/preview", headers=headers)
        assert html_res.status_code == 200
        assert "Supima Cotton Executive Shirt" in html_res.text
        assert theme in html_res.text
