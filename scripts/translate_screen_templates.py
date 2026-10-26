#!/usr/bin/env python3
import sys

JS_PATH = "frontend/web/static/js/vastrenix.js"

with open(JS_PATH, "r", encoding="utf-8") as f:
    code = f.read()

substitutions = [
    # POS shift required
    ('<h2 style="font-size: 20px; font-weight: 800; color: var(--navy); margin-bottom: 8px;">Cash Register Shift Required</h2>',
     '<h2 style="font-size: 20px; font-weight: 800; color: var(--navy); margin-bottom: 8px;">${t("shift_req_title", "Cash Register Shift Required")}</h2>'),
    ('<p style="font-size: 13.5px; color: var(--text-muted); line-height: 1.5; margin-bottom: 24px;">\n          To begin processing retail sales with tamper-proof financial reconciliation, please count and enter the opening cash float in the drawer.\n        </p>',
     '<p style="font-size: 13.5px; color: var(--text-muted); line-height: 1.5; margin-bottom: 24px;">\n          ${t("shift_req_desc", "To begin processing retail sales with tamper-proof financial reconciliation, please count and enter the opening cash float in the drawer.")}\n        </p>'),
    ('<label class="form-label" style="font-weight: 700;">Opening Cash Float (₹)</label>',
     '<label class="form-label" style="font-weight: 700;">${t("open_float_label", "Opening Cash Float (₹)")}</label>'),
    ('<button type="submit" class="btn btn-primary" style="width: 100%; padding: 13px; font-weight: 700; font-size: 14.5px;">\n            Open Shift & Unlock Counter\n          </button>',
     '<button type="submit" class="btn btn-primary" style="width: 100%; padding: 13px; font-weight: 700; font-size: 14.5px;">\n            ${t("open_shift_btn", "Open Shift & Unlock Counter")}\n          </button>'),
    ('<span>Store Counter: <b>${state.storeName || state.business.name}</b></span>',
     '<span>${t("store_counter", "Store Counter")}: <b>${state.storeName || state.business.name}</b></span>'),
    ('<span>Cashier: <b>${state.user.full_name} (${state.business.role})</b></span>',
     '<span>${t("cashier", "Cashier")}: <b>${state.user.full_name} (${state.business.role})</b></span>'),
    ('Shift #${state.currentShift.id} Active • Float: ₹${Number(state.currentShift.opening_cash).toFixed(2)}',
     '${t("shift_active", "Shift Active")} #${state.currentShift.id} • ${t("float_label", "Float")}: ₹${Number(state.currentShift.opening_cash).toFixed(2)}'),
    ('Close Shift\n        </button>',
     '${t("close_shift", "Close Shift")}\n        </button>'),
    ('placeholder="Scan barcode or search name/fabric (F2)..."',
     'placeholder="${t(\'scan_search_placeholder\', \'Scan barcode or search name/fabric (F2)...\')}"'),
    ('+ Custom Item\n          </button>',
     '${t("custom_item_btn", "+ Custom Item")}\n          </button>'),
    ('<h3 style="font-size: 15px; font-weight: 800; color: var(--navy); margin: 0;">POS Counter Till</h3>',
     '<h3 style="font-size: 15px; font-weight: 800; color: var(--navy); margin: 0;">${t("pos_terminal_title", "POS Counter Till")}</h3>'),
    ('title="Keyboard Shortcut: F8">Clear (F8)</button>',
     'title="Keyboard Shortcut: F8">${t("clear_cart", "Clear (F8)")}</button>'),
    ('1. Customer Details (Optional for Cash/UPI, Required for Store Credit)',
     '${t("customer_details_title", "1. Customer Details (Optional for Cash/UPI, Required for Store Credit)")}'),
    ('placeholder="Customer Name"',
     'placeholder="${t(\'customer_name_placeholder\', \'Customer Name\')}"'),
    ('placeholder="Mobile No. (10 Digits)"',
     'placeholder="${t(\'mobile_no_placeholder\', \'Mobile No. (10 Digits)\')}"'),
    ('2. Invoice Theme\n            </span>',
     '${t("invoice_theme_title", "2. Invoice Theme")}\n            </span>'),
    ('3. Payment Mode (Default: ${state.defaultPaymentMode})',
     '${t("payment_mode_title", "3. Payment Mode")} (${state.defaultPaymentMode})'),
    ('>Cash</button>',
     '>${t("pay_cash", "Cash")}</button>'),
    ('>UPI QR</button>',
     '>${t("pay_upi", "UPI QR")}</button>'),
    ('>Card</button>',
     '>${t("pay_card", "Card")}</button>'),
    ('>Split</button>',
     '>${t("pay_split", "Split")}</button>'),
    ('>Store Credit</button>',
     '>${t("pay_credit", "Store Credit")}</button>'),
    ('<span>Subtotal:</span>',
     '<span>${t("subtotal", "Subtotal")}:</span>'),
    ('Discount:\n              ${canDiscount',
     '${t("discount", "Discount")}:\n              ${canDiscount'),
    ('<span>GST (5%):</span>',
     '<span>${t("tax_gst", "GST (5%)")}:</span>'),
    ('<span>Grand Total:</span>',
     '<span>${t("grand_total", "Grand Total")}:</span>'),
    ('Complete Sale & Generate Invoice (F4)\n          </button>',
     '${t("complete_sale_btn", "Complete Sale & Generate Invoice (F4)")}\n          </button>'),

    # Inventory translations
    ('<h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">Garment Inventory & Warehouse Stock</h2>',
     '<h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">${t("inventory_title", "Garment Inventory & Warehouse Stock")}</h2>'),
    ('<h3 style="font-size: 16px; font-weight: 700; color: var(--navy); margin-bottom: 6px;">Garment Catalog is Empty</h3>',
     '<h3 style="font-size: 16px; font-weight: 700; color: var(--navy); margin-bottom: 6px;">${t("no_inventory_title", "Garment Catalog is Empty")}</h3>'),
    ('placeholder="Search by garment name, SKU, or fabric..."',
     'placeholder="${t(\'search_garment_placeholder\', \'Search by garment name, SKU, or fabric...\')}"'),
    ('<th>Product Name</th>\n                <th>Fabric</th>\n                <th>SKU</th>\n                <th>Size</th>\n                <th>Color</th>\n                <th>Rack Location</th>\n                <th>On-Hand</th>\n                <th>Reserved</th>\n                <th>Available</th>\n                <th>Status</th>\n                <th>Stock Operations</th>',
     '<th>${t("product_name_col", "Product Name")}</th>\n                <th>${t("fabric_col", "Fabric")}</th>\n                <th>${t("sku", "SKU")}</th>\n                <th>${t("size_col", "Size")}</th>\n                <th>${t("color_col", "Color")}</th>\n                <th>${t("rack_location_col", "Rack Location")}</th>\n                <th>${t("on_hand_col", "On-Hand")}</th>\n                <th>${t("reserved_col", "Reserved")}</th>\n                <th>${t("available_col", "Available")}</th>\n                <th>${t("status_col", "Status")}</th>\n                <th>${t("stock_ops_col", "Stock Operations")}</th>'),

    # Invoices translations
    ('<h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">Authoritative Invoices & Billing Records</h2>',
     '<h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">${t("invoices_title", "Authoritative Invoices & Billing Records")}</h2>'),
    ('↻ Refresh Invoices\n        </button>',
     '${t("refresh_invoices_btn", "↻ Refresh Invoices")}\n        </button>'),
    ('+ New POS Sale</button>',
     '${t("new_pos_sale", "+ New POS Sale")}</button>'),
    ('<span style="font-size: 13.5px; font-weight: 800; color: var(--navy);">6 Invoice Themes (Swipe to Preview & Select Default)</span>',
     '<span style="font-size: 13.5px; font-weight: 800; color: var(--navy);">${t("six_themes_title", "6 Invoice Themes (Swipe to Preview & Select Default)")}</span>'),
    ('Active: <b>${currentDefaultTheme}</b>',
     '${t("active_theme_label", "Active")}: <b>${currentDefaultTheme}</b>'),
    ("${th.id === currentDefaultTheme ? '✓ Store Default' : 'Tap to set default'}",
     "${th.id === currentDefaultTheme ? t('store_default_badge', '✓ Store Default') : t('set_default_label', 'Tap to set default')}"),
    ('<h3 style="font-size: 16px; font-weight: 700; color: var(--navy); margin-bottom: 6px;">No Invoices Posted Yet</h3>',
     '<h3 style="font-size: 16px; font-weight: 700; color: var(--navy); margin-bottom: 6px;">${t("no_invoices_title", "No Invoices Posted Yet")}</h3>'),
    ('Invoices are immutable business records. Complete your first garment sale on the POS Till to generate a GST invoice with instant PDF download.',
     '${t("no_invoices_desc", "Invoices are immutable business records. Complete your first garment sale on the POS Till to generate a GST invoice with instant PDF download.")}'),
    ('Open POS Billing Till ➔</button>',
     '${t("open_pos_till_btn", "Open POS Billing Till ➔")}</button>'),
    ('<th>Invoice Number</th>\n              <th>Date</th>\n              <th>Customer</th>\n              <th>Theme</th>\n              <th>Total Amount</th>\n              <th>Paid</th>\n              <th>Payment Mode</th>\n              <th>Status</th>\n              <th>Actions</th>',
     '<th>${t("invoice_number_col", "Invoice Number")}</th>\n              <th>${t("date_col", "Date")}</th>\n              <th>${t("customer_col", "Customer")}</th>\n              <th>${t("theme_col", "Theme")}</th>\n              <th>${t("total_amount_col", "Total Amount")}</th>\n              <th>${t("paid_col", "Paid")}</th>\n              <th>${t("payment_mode_title", "Payment Mode")}</th>\n              <th>${t("status_col", "Status")}</th>\n              <th>${t("actions_col", "Actions")}</th>'),

    # Dashboard translations
    ('<div class="stat-meta"><span id="dash-val-orders">0</span> transactions completed</div>',
     '<div class="stat-meta"><span id="dash-val-orders">0</span> ${t("tx_completed", "transactions completed")}</div>'),
    ('Month-End Credit Payment Reminders Active',
     '${t("month_end_banner_title", "Month-End Credit Payment Reminders Active")}'),
    ('Review Dues in Invoices</button>',
     '${t("review_dues_btn", "Review Dues in Invoices")}</button>'),
    ('Pending Staff Signups Requiring Approval',
     '${t("pending_staff_title", "Pending Staff Signups Requiring Approval")}'),
    ('✓ Approve Staff</button>',
     '${t("approve_staff_btn", "✓ Approve Staff")}</button>'),
    ('✕ Reject</button>',
     '${t("reject_staff_btn", "✕ Reject")}</button>'),
]

matched = 0
for old, new in substitutions:
    if old in code:
        code = code.replace(old, new)
        matched += 1
    else:
        print(f"Skipped substitution (not found): {old[:40]}...")

print(f"Applied {matched}/{len(substitutions)} template substitutions.")

with open(JS_PATH, "w", encoding="utf-8") as f:
    f.write(code)

print("Saved updated vastrenix.js.")
