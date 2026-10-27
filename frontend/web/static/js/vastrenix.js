// VASTRENIX Client Application Controller
// Build-time Production Cloud API constant (Render Free Web Service + Firebase Admin)
const PRODUCTION_RENDER_API = "https://vastrenix-api.onrender.com";

let isServerWarm = false;
let coldStartTimer = null;
let coldStartTimeoutTimer = null;

function getBaseServerUrl() {
  // Always clean up any stale overrides pointing to localhost or old URLs
  try {
    localStorage.removeItem("vastrenix_server_url");
    localStorage.removeItem("vastrenix_debug_server_url");
  } catch (e) {}

  // 1. Web browser hosting if deployed directly to another domain (production domain)
  if (typeof window !== "undefined" && window.location) {
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      if (!window.location.hostname.includes("localhost") && !window.location.hostname.includes("127.0.0.1")) {
        return window.location.origin;
      }
    }
  }

  // 2. Default Production Render API URL (Strict Cloud Source of Truth)
  return PRODUCTION_RENDER_API;
}

function getApiBase() {
  const base = getBaseServerUrl();
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
}

let _currentInvoiceBlob = null;
let _currentInvoiceBlobUrl = null;
let _currentInvoiceId = null;
let _currentInvoiceNumber = null;

async function viewInvoiceInApp(invoiceId, invoiceNumber) {
  _currentInvoiceId = invoiceId;
  _currentInvoiceNumber = invoiceNumber || invoiceId;

  const modal = document.getElementById("modal-invoice-viewer");
  if (!modal) return;

  const title = document.getElementById("invoice-viewer-title");
  if (title) title.textContent = `${t('invoice_viewer_title', 'Invoice Details')} #${_currentInvoiceNumber}`;

  const body = document.getElementById("invoice-viewer-body");
  const fileName = `Invoice_${_currentInvoiceNumber}.pdf`;
  const pdfUrl = `${getApiBase()}/pos/invoices/${invoiceId}/pdf`;

  // 1. Render immediate centralized invoice visual preview in modal dialog
  if (body) {
    const dummyInv = {
      invoice_number: _currentInvoiceNumber,
      date: new Date().toLocaleDateString(),
      customer_name: "Walk-in Retail Client",
      total_amount: "0.00",
      theme: state.selectedPOSTheme || "PREMIUM_BOUTIQUE"
    };
    body.innerHTML = `
      <div style="padding: 10px 4px;">
        <div id="invoice-preview-card-wrap">
          ${InvoiceThemeRegistry.renderInvoiceCard(dummyInv, state.selectedPOSTheme)}
        </div>
        <div id="pdf-download-status-banner" style="margin-top: 14px; background: #E8F4F0; border: 1px solid var(--teal-light); border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span>
            <span style="font-size: 12px; color: var(--teal); font-weight: 700;">Preparing verified PDF...</span>
          </div>
          <span style="font-size: 11px; color: var(--text-muted);">Cloud Verified</span>
        </div>
      </div>
    `;
  }

  // 2. Wire popup action buttons
  const shareBtn = document.getElementById("invoice-viewer-share-btn");
  if (shareBtn) {
    shareBtn.textContent = t("share_pdf_btn", "💬 Share via WhatsApp");
    shareBtn.onclick = () => shareInvoicePdf(_currentInvoiceId, _currentInvoiceNumber);
  }

  const downloadBtn = document.getElementById("invoice-viewer-download-btn");
  if (downloadBtn) {
    downloadBtn.textContent = t("view_system_pdf_btn", "👁️ View PDF (System Viewer)");
    downloadBtn.onclick = () => openInvoicePdfInNativeViewer(_currentInvoiceId, _currentInvoiceNumber);
  }

  modal.classList.add("active");

  // 3. Pre-fetch authenticated PDF bytes in background
  try {
    const headers = {};
    if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
    if (state.business) headers["X-Business-ID"] = state.business.id;

    const res = await fetch(pdfUrl, { headers });
    if (res.ok) {
      const blob = await res.blob();
      _currentInvoiceBlob = blob;
      if (_currentInvoiceBlobUrl) URL.revokeObjectURL(_currentInvoiceBlobUrl);
      _currentInvoiceBlobUrl = URL.createObjectURL(blob);

      const banner = document.getElementById("pdf-download-status-banner");
      if (banner) {
        banner.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: #10B981; font-weight: 800; font-size: 15px;">✓</span>
            <span style="font-size: 12.5px; color: var(--navy); font-weight: 700;">${t('pdf_popup_title', 'Invoice Document Ready')}</span>
          </div>
          <span class="badge badge-success" style="font-size: 10px;">PDF Ready</span>
        `;
      }
    }
  } catch (err) {
    console.warn("[PDF-FETCH] Pre-fetch error:", err);
  }
}

function openInvoicePdf(invoiceId, invoiceNumber) {
  viewInvoiceInApp(invoiceId, invoiceNumber);
}

async function openInvoicePdfInNativeViewer(invoiceId, invoiceNumber) {
  const fileName = `Invoice_${invoiceNumber || invoiceId}.pdf`;
  const pdfUrl = `${getApiBase()}/pos/invoices/${invoiceId}/pdf`;

  try {
    let blob = _currentInvoiceBlob;
    if (!blob) {
      const headers = {};
      if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
      if (state.business) headers["X-Business-ID"] = state.business.id;
      const res = await fetch(pdfUrl, { headers });
      if (!res.ok) throw new Error("Could not load PDF bytes");
      blob = await res.blob();
      _currentInvoiceBlob = blob;
    }

    if (window.VastrenixNative && typeof window.VastrenixNative.openPdfUrl === "function") {
      const reader = new FileReader();
      reader.onloadend = function() {
        window.VastrenixNative.openPdfUrl(reader.result, fileName);
      };
      reader.readAsDataURL(blob);
    } else {
      const blobUrl = _currentInvoiceBlobUrl || URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    }
  } catch (err) {
    const directUrl = `${pdfUrl}?token=${encodeURIComponent(state.token || '')}&business_id=${state.business ? state.business.id : ''}`;
    window.open(directUrl, "_blank");
  }
}

async function shareInvoicePdf(invoiceId, invoiceNumber) {
  const fileName = `Invoice_${invoiceNumber || invoiceId}.pdf`;
  const pdfUrl = `${getApiBase()}/pos/invoices/${invoiceId}/pdf`;

  try {
    let blob = _currentInvoiceBlob;
    if (!blob) {
      const headers = {};
      if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
      if (state.business) headers["X-Business-ID"] = state.business.id;
      const res = await fetch(pdfUrl, { headers });
      if (!res.ok) throw new Error("Could not retrieve PDF");
      blob = await res.blob();
      _currentInvoiceBlob = blob;
    }

    const reader = new FileReader();
    reader.onloadend = function() {
      const base64data = reader.result;
      if (window.VastrenixNative && typeof window.VastrenixNative.sharePdfUrl === "function") {
        window.VastrenixNative.sharePdfUrl(base64data, fileName);
      } else if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type: 'application/pdf' })] })) {
        navigator.share({
          title: `Invoice ${invoiceNumber}`,
          text: `Tax Invoice ${invoiceNumber} from ${state.storeName || (state.business && state.business.name) || 'Vastrenix'}`,
          files: [new File([blob], fileName, { type: 'application/pdf' })]
        }).catch(e => console.log("Share cancelled", e));
      } else {
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = fileName;
        a.click();
      }
    };
    reader.readAsDataURL(blob);
  } catch (err) {
    const directUrl = `${pdfUrl}?token=${encodeURIComponent(state.token || '')}&business_id=${state.business ? state.business.id : ''}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent('Invoice #' + (invoiceNumber || invoiceId) + ': ' + directUrl)}`, "_blank");
  }
}

async function downloadInvoicePdf(invoiceId, invoiceNumber) {
  await openInvoicePdfInNativeViewer(invoiceId, invoiceNumber);
}

let isAppInBackground = false;
let pendingReconnectTimer = null;

function handleAppBackground() {
  console.log("[LIFECYCLE] App backgrounded - pausing polling and suppressing reconnect loops");
  isAppInBackground = true;
  if (coldStartTimer) { clearTimeout(coldStartTimer); coldStartTimer = null; }
  if (coldStartTimeoutTimer) { clearTimeout(coldStartTimeoutTimer); coldStartTimeoutTimer = null; }
  if (coldStartInterval) { clearInterval(coldStartInterval); coldStartInterval = null; }
  if (pendingReconnectTimer) { clearTimeout(pendingReconnectTimer); pendingReconnectTimer = null; }
}

function handleAppResume() {
  console.log("[LIFECYCLE] App resumed");
  isAppInBackground = false;
  const now = Date.now();
  if (now - (state.lastResumeTime || 0) < 30000) {
    console.log("[LIFECYCLE] Throttled resume refresh (last refreshed < 30s ago)");
    return;
  }
  state.lastResumeTime = now;
  performCleanResumeSync();
}

if (typeof window !== "undefined") {
  window.onAppBackground = handleAppBackground;
  window.onAppResume = handleAppResume;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      handleAppBackground();
    } else {
      handleAppResume();
    }
  });
}

async function performCleanResumeSync() {
  try {
    if (!state.token) return;
    // Silent check, do not show cold-start or reconnect overlays
    await api("/sync/firebase/status", { silent: true, timeout: 5000 });
    state.reconnectAttempts = 0;
    // Silent token refresh if it has been > 40 minutes since last refresh
    const now = Date.now();
    if (now - (state.lastTokenRefreshTime || 0) > 40 * 60 * 1000) {
      silentTokenRefresh();
    }
  } catch (err) {
    console.log("[LIFECYCLE] Resume sync check skipped or offline");
  }
}

async function silentTokenRefresh() {
  if (!state.token || isAppInBackground) return;
  try {
    const res = await api("/auth/refresh", { method: "POST", silent: true, timeout: 10000 });
    if (res && res.access_token) {
      state.token = res.access_token;
      localStorage.setItem("vastrenix_token", res.access_token);
      state.lastTokenRefreshTime = Date.now();
      console.log("[AUTH] Silent token refresh succeeded");
    }
  } catch (err) {
    console.warn("[AUTH] Silent token refresh skipped: " + err.message);
  }
}

// Background silent token refresh every 45 minutes
setInterval(() => {
  if (!isAppInBackground && state.token) {
    silentTokenRefresh();
  }
}, 45 * 60 * 1000);

const state = {
  token: localStorage.getItem("vastrenix_token") || null,
  user: JSON.parse(localStorage.getItem("vastrenix_user") || "null"),
  business: JSON.parse(localStorage.getItem("vastrenix_business") || "null"),
  storeName: localStorage.getItem("vastrenix_store_name") || null,
  isStaff: localStorage.getItem("vastrenix_is_staff") === "true",
  defaultPaymentMode: localStorage.getItem("vastrenix_default_payment_mode") || "CASH",
  selectedPOSTheme: localStorage.getItem("vastrenix_pos_theme") || "PREMIUM_BOUTIQUE",
  tabCache: {},
  lastResumeTime: 0,
  reconnectAttempts: 0,
  activeTab: "dashboard",
  cart: [],
  products: [],
  stores: [],
  authMode: "signin", // "signin", "signup_owner", "signup_staff"
  lang: localStorage.getItem("vastrenix_lang") || "en"
};

const i18n = {
  en: {
    welcome: "Welcome to your clothing operations",
    dashboard: "Dashboard",
    inventory: "Inventory & Catalog",
    pos: "POS Billing",
    invoices: "Invoices & Themes",
    expenses: "Store Expenses",
    dealers: "Dealer B2B Network",
    team: "Users & Staff",
    flowcharts: "Architecture Flowcharts",
    settings: "Settings",
    logout: "Sign Out",
    current_store: "Current Store",
    flagship_store: "Flagship Store",
    store_admin: "Store Admin",
    staff_view: "Staff View",
    assigned_store: "Assigned Store",
    logged_in_as: "Logged in as",
    today_sales: "Today's Gross Sales",
    today_orders: "Today's Orders",
    total_revenue: "Total Net Revenue",
    low_stock_items: "Low Stock Items",
    pending_approvals: "Pending Staff Approvals",
    pending_dealer_orders: "Pending Dealer Orders",
    month_end_dues: "Month-End Credit Dues",
    sizes_reorder: "Sizes requiring reorder",
    all_healthy: "All inventory healthy",
    b2b_awaiting: "B2B orders awaiting action",
    posted_invoices: "Authoritative posted invoices",
    pending_receivables: "Pending customer receivables",
    tx_completed: "transactions completed",
    new_pos_sale: "+ New POS Sale",
    add_garment_prod: "+ Add Garment Product",
    dealer_orders_btn: "Dealer Orders",
    urgent_low_stock: "Urgent Low Stock Warnings",
    view_all_inventory: "View All Inventory",
    garment_product: "Garment Product",
    sku: "SKU",
    size_color: "Size / Color",
    available_qty: "Available Qty",
    threshold: "Threshold",
    action: "Action",
    manage_stock: "Manage Stock",
    month_end_banner_title: "Month-End Credit Payment Reminders Active",
    month_end_banner_desc: "total outstanding Store Credit due for collection before month-end.",
    review_dues_btn: "Review Dues in Invoices",
    pending_staff_title: "Pending Staff Signups Requiring Approval",
    approve_staff_btn: "✓ Approve Staff",
    reject_staff_btn: "✕ Reject",
    inventory_title: "Garment Inventory & Warehouse Stock",
    inventory_desc: "Track on-hand vs available retail stock by size and color variant.",
    search_garment_placeholder: "Search by garment name, SKU, or fabric...",
    product_name_col: "Product Name",
    fabric_col: "Fabric",
    size_col: "Size",
    color_col: "Color",
    rack_location_col: "Rack Location",
    on_hand_col: "On-Hand",
    reserved_col: "Reserved",
    available_col: "Available",
    status_col: "Status",
    stock_ops_col: "Stock Operations",
    in_stock_label: "in stock",
    out_of_stock_label: "Out of stock",
    adjust_stock_btn: "Adjust Stock",
    no_inventory_title: "Garment Catalog is Empty",
    no_inventory_desc: "Add your first garment product with size/color variants to start tracking on-hand stock and billing on the POS.",
    pos_terminal_title: "POS Counter Till",
    store_counter: "Store Counter",
    cashier: "Cashier",
    shift_active: "Shift Active",
    float_label: "Float",
    close_shift: "Close Shift",
    open_shift: "Open Shift",
    scan_search_placeholder: "Scan barcode or search name/fabric (F2)...",
    custom_item_btn: "+ Custom Item",
    customer_details_title: "1. Customer Details (Optional for Cash/UPI, Required for Store Credit)",
    customer_name_placeholder: "Customer Name",
    mobile_no_placeholder: "Mobile No. (10 Digits)",
    invoice_theme_title: "2. Invoice Theme",
    payment_mode_title: "3. Payment Mode",
    pay_cash: "Cash",
    pay_upi: "UPI QR",
    pay_card: "Card",
    pay_split: "Split",
    pay_credit: "Store Credit",
    sale_cart: "Sale Cart",
    clear_cart: "Clear (F8)",
    subtotal: "Subtotal",
    discount: "Discount",
    tax_gst: "GST (5%)",
    grand_total: "Grand Total",
    complete_sale_btn: "Complete Sale & Generate Invoice (F4)",
    add_btn: "+ Add",
    line_total: "Line Total",
    cart_empty: "Cart is empty. Scan barcodes, click '+ Add', or add a Custom Item.",
    custom_badge: "Custom",
    shift_req_title: "Cash Register Shift Required",
    shift_req_desc: "To begin processing retail sales with tamper-proof financial reconciliation, please count and enter the opening cash float in the drawer.",
    open_float_label: "Opening Cash Float (₹)",
    open_shift_btn: "Open Shift & Unlock Counter",
    upi_modal_title: "UPI Counter Payment",
    upi_modal_subtitle: "Scan with Google Pay, PhonePe, Paytm, or BHIM",
    customer_paid_btn: "✓ Customer Has Paid",
    utr_label: "UPI UTR / Reference No. (Optional for reconciliation)",
    utr_placeholder: "e.g. 429381920394",
    confirm_invoice_btn: "Confirm & Print Invoice",
    skip_utr_btn: "Skip UTR",
    custom_modal_title: "+ Add Custom Item to Cart",
    item_desc_label: "Item Description / Name",
    item_desc_placeholder: "e.g. Alteration & Fitting, Matching Border Dupatta",
    unit_price_label: "Unit Price (₹)",
    qty_label: "Quantity",
    add_line_item_btn: "Add Line Item to Cart",
    invoices_title: "Authoritative Invoices & Billing Records",
    invoices_desc: "View posted invoices, verify tax compliance, and download PDFs.",
    refresh_invoices_btn: "↻ Refresh Invoices",
    six_themes_title: "6 Invoice Themes (Swipe to Preview & Select Default)",
    active_theme_label: "Active",
    set_default_label: "Tap to set default",
    store_default_badge: "✓ Store Default",
    no_invoices_title: "No Invoices Posted Yet",
    no_invoices_desc: "Invoices are immutable business records. Complete your first garment sale on the POS Till to generate a GST invoice with instant PDF download.",
    open_pos_till_btn: "Open POS Billing Till ➔",
    invoice_number_col: "Invoice Number",
    date_col: "Date",
    customer_col: "Customer",
    theme_col: "Theme",
    total_amount_col: "Total Amount",
    paid_col: "Paid",
    actions_col: "Actions",
    pdf_btn: "PDF",
    share_btn: "Share",
    retry_btn: "Retry",
    invoice_viewer_title: "Invoice Details",
    share_whatsapp_btn: "Share Invoice (WhatsApp)",
    download_print_btn: "⎙ Download / Print PDF",
    close_btn: "Close",
    settings_modal_title: "Store & POS Settings",
    default_pay_mode_label: "Default POS Payment Mode",
    default_theme_label: "Default Invoice Theme",
    cloud_server_connection: "Cloud Server Connection",
    connected_status: "Connected to VASTRENIX Cloud",
    disconnected_status: "Disconnected (Offline / Reconnecting)",
    conn_active_meta: "All store operations and real-time syncing are active.",
    check_status_btn: "Check Status",
    done_btn: "Done",
    cant_reach_title: "Can't reach VASTRENIX right now",
    retry_conn_btn: "Retry Connection",
    use_offline_till: "Open Offline POS Till",
    connecting_cloud: "Connecting to VASTRENIX Cloud Server...",
    waking_server: "Waking up store server (Render free-tier cold start, ~30s)...",
    device_offline_msg: "Your device appears to be offline. Check Wi-Fi or mobile data.",
    server_slow_msg: "Store server took longer than expected to respond. Please tap Retry.",
    server_connected_msg: "✓ Server Connected",
    // Add Garment Product Modal
    add_product_title: "Add Garment Product",
    prod_name_label: "Garment Name",
    prod_name_placeholder: "e.g. Pure Mulberry Silk Sari",
    prod_fabric_label: "Fabric / Material",
    prod_fabric_placeholder: "e.g. Handwoven Mulberry Silk",
    retail_price_label: "Retail Price (₹)",
    purchase_cost_label: "Purchase Cost (₹)",
    size_label: "Size",
    size_placeholder: "e.g. M or Free",
    color_label: "Color",
    color_placeholder: "e.g. Peacock Blue",
    initial_stock_label: "Initial Stock Quantity",
    alert_threshold_label: "Stock Alert Threshold",
    rack_location_label: "Shelf / Rack Location",
    rack_placeholder: "e.g. Rack A-12, Bin 4",
    sku_barcode_label: "Barcode / SKU (Optional)",
    sku_barcode_placeholder: "e.g. VAST-SLK-001",
    save_add_catalog_btn: "Save & Add to Catalog",

    // Purchase Order Modal (Order More)
    create_po_title: "Create Purchase Order (Order More)",
    target_garment_label: "Target Garment",
    select_supplier_label: "Select Textile Supplier / Weaver",
    order_qty_label: "Order Quantity (Pieces)",
    unit_cost_label: "Unit Purchase Cost (₹)",
    po_notes_label: "PO Notes / Reference",
    po_notes_placeholder: "e.g. Festival restocking",
    issue_po_btn: "Issue Purchase Order",

    // Goods Receipt Modal (Receive Stock)
    receive_goods_title: "Goods Received Note (Receive Stock)",
    receiving_garment_label: "Receiving Garment",
    select_po_label: "Select Issued Purchase Order",
    challan_no_label: "Supplier Invoice / Challan Number",
    challan_placeholder: "e.g. INV-TEX-9921",
    inspection_notes_label: "Receiving Inspection Notes",
    inspection_placeholder: "e.g. Checked pieces, quality approved",
    confirm_receive_stock_btn: "Confirm & Add to Stock",

    // Store Expenses Screen & Modal
    expenses_title: "Store Expenses & Overhead Management",
    expenses_subtitle: "Track daily operational costs, salaries, rent, and packaging.",
    record_expense_btn: "+ Record New Expense",
    total_expenses_recorded: "Total Expenses Recorded",
    expense_entries: "expense entries",
    total_sales_collections: "Total Sales Collections",
    cash_upi_card_receipts: "Cash + UPI + Card receipts",
    net_operating_cashflow: "Net Operating Cash Flow",
    collections_minus_expenses: "Collections minus expenses",
    accounts_receivable: "Accounts Receivable",
    pending_customer_dues: "Pending customer dues",
    expense_transactions_log: "Expense Transactions Log",
    filter_category_label: "Filter Category:",
    all_categories: "All Categories",
    date_time_col: "Date & Time",
    category_col: "Category",
    desc_purpose_col: "Description / Purpose",
    payment_mode_col: "Payment Mode",
    receipt_col: "Receipt",
    amount_col: "Amount (₹)",
    no_expenses_recorded: "No expenses recorded yet. Click '+ Record New Expense' to log costs.",
    record_store_expense_title: "Record Store Expense",
    expense_category_label: "Expense Category",
    expense_desc_label: "Description / Receipt Note",
    expense_desc_placeholder: "e.g. 500 custom cotton carry bags for festival rush",
    attach_receipt_label: "Attach Bill / Receipt Document (Optional)",
    save_post_expense_btn: "Save & Post Expense",
    view_receipt_link: "📎 View Receipt",
    no_receipt_attached: "No receipt attached",

    // Staff & Users Screen & Modal
    team_title: "Store Team & User Accounts",
    team_subtitle: "Manage employee roles, counter cashiers, and logistics dispatchers.",
    add_team_member_btn: "+ Add Team Member",
    total_store_team: "Total Store Team",
    members_count_label: "Members",
    active_cashiers: "Active Cashiers",
    pos_till_operators: "POS counter till operators",
    dispatchers_picking: "Dispatchers & Picking",
    b2b_staff: "B2B order packaging staff",
    pending_approvals_metric: "Pending Approvals",
    signups_waiting: "Staff signups waiting",
    employee_name_col: "Employee Name",
    contact_email_col: "Contact / Email",
    role_responsibilities_col: "Role & Responsibilities",
    store_branch_col: "Store Branch",
    status_label: "Status",
    add_staff_title: "Add Store Staff Member",
    full_name_label: "Full Name",
    full_name_placeholder: "e.g. Ramesh Patel",
    email_address_label: "Email Address",
    email_placeholder: "ramesh@vastrenix-store.com",
    phone_number_label: "Phone Number",
    phone_placeholder: "+91 98765 43210",
    role_responsibility_label: "Role & Responsibility",
    staff_auth_notice: "Once created, staff will immediately be authorized to sign in to this store location.",
    create_auth_staff_btn: "Create & Authorize Staff",

    // Close Shift Modal
    close_shift_title: "Close & Reconcile Cash Shift",
    opening_float_label: "Opening Cash Float:",
    cash_sales_collected_label: "Total Cash Sales Collected:",
    cash_payouts_label: "Cash Payouts / Expenses:",
    expected_drawer_cash_label: "Expected Drawer Cash:",
    counted_cash_label: "Counted Physical Cash in Drawer (₹)",
    counted_cash_placeholder: "Enter total counted notes & coins",
    closing_notes_label: "Closing Notes / Discrepancy Reason (Optional)",
    closing_notes_placeholder: "e.g. Verified by head cashier",
    reconcile_close_btn: "Reconcile & Close Shift",

    // Assign Staff Modal
    assign_staff_title: "Assign Order to Store Staff",
    dealer_order_label: "Dealer Order",
    select_staff_label: "Select Staff Member to Assign",
    assign_staff_notice: "The assigned staff member will be responsible for item picking, quality check, and packaging for this order.",
    confirm_assignment_btn: "Confirm Staff Assignment",

    // Dashboard Resilience Fallbacks
    metrics_load_failed: "Live dashboard metrics could not be loaded.",
    retry_dashboard_btn: "⟳ Retry Dashboard",

    // PDF Dialog Popup
    pdf_popup_title: "Invoice Document Ready",
    pdf_popup_subtitle: "Official GST tax document generated and verified",
    view_system_pdf_btn: "👁️ View PDF (System Viewer)",
    share_pdf_btn: "💬 Share via WhatsApp",
    download_pdf_btn: "⎙ Download / Print PDF",
  },
  hi: {
    welcome: "आपके वस्त्र व्यापार में आपका स्वागत है",
    dashboard: "डैशबोर्ड",
    inventory: "इन्वेंटरी और कैटलॉग",
    pos: "पीओएस बिलिंग",
    invoices: "चालान और थीम्स",
    expenses: "दुकान के खर्च",
    dealers: "डीलर बी2बी नेटवर्क",
    team: "कर्मचारी और टीम",
    flowcharts: "सिस्टम फ्लोचार्ट्स",
    settings: "सेटिंग्स",
    logout: "साइन आउट",
    current_store: "वर्तमान दुकान",
    flagship_store: "प्रमुख दुकान",
    store_admin: "स्टोर एडमिन",
    staff_view: "स्टाफ व्यू",
    assigned_store: "आवंटित दुकान",
    logged_in_as: "लॉगिन उपयोगकर्ता",
    today_sales: "आज की कुल बिक्री",
    today_orders: "आज के ऑर्डर्स",
    total_revenue: "कुल शुद्ध राजस्व",
    low_stock_items: "कम स्टॉक वाले वस्त्र",
    pending_approvals: "लंबित कर्मचारी स्वीकृतियां",
    pending_dealer_orders: "लंबित डीलर ऑर्डर्स",
    month_end_dues: "माह-अंत क्रेडिट बकाया",
    sizes_reorder: "पुनः ऑर्डर योग्य साइज़",
    all_healthy: "सभी स्टॉक पर्याप्त है",
    b2b_awaiting: "कार्रवाई हेतु प्रतीक्षारत बी2बी ऑर्डर्स",
    posted_invoices: "आधिकारिक पोस्ट किए गए चालान",
    pending_receivables: "लंबित ग्राहक प्राप्य राशि",
    tx_completed: "लेन-देन पूर्ण",
    new_pos_sale: "+ नई पीओएस बिक्री",
    add_garment_prod: "+ नया वस्त्र जोड़ें",
    dealer_orders_btn: "डीलर ऑर्डर्स",
    urgent_low_stock: "महत्वपूर्ण कम स्टॉक चेतावनी",
    view_all_inventory: "पूरी इन्वेंटरी देखें",
    garment_product: "वस्त्र उत्पाद",
    sku: "एसकेयू",
    size_color: "साइज़ / रंग",
    available_qty: "उपलब्ध मात्रा",
    threshold: "न्यूनतम सीमा",
    action: "कार्रवाई",
    manage_stock: "स्टॉक प्रबंधन",
    month_end_banner_title: "माह-अंत क्रेडिट भुगतान अनुस्मारक सक्रिय",
    month_end_banner_desc: "माह-अंत से पहले वसूली हेतु कुल बकाया स्टोर क्रेडिट।",
    review_dues_btn: "चालानों में बकाया देखें",
    pending_staff_title: "अनुमोदन की प्रतीक्षा में कर्मचारी साइनअप",
    approve_staff_btn: "✓ कर्मचारी स्वीकृत करें",
    reject_staff_btn: "✕ अस्वीकार करें",
    inventory_title: "वस्त्र इन्वेंटरी और गोदाम स्टॉक",
    inventory_desc: "साइज़ और रंग के अनुसार उपलब्ध खुदरा स्टॉक ट्रैक करें।",
    search_garment_placeholder: "वस्त्र का नाम, एसकेयू या फैब्रिक खोजें...",
    product_name_col: "उत्पाद का नाम",
    fabric_col: "कपड़ा / फैब्रिक",
    size_col: "साइज़",
    color_col: "रंग",
    rack_location_col: "रैक स्थान",
    on_hand_col: "मौजूद स्टॉक",
    reserved_col: "आरक्षित",
    available_col: "उपलब्ध",
    status_col: "स्थिति",
    stock_ops_col: "स्टॉक संचालन",
    in_stock_label: "स्टॉक में उपलब्ध",
    out_of_stock_label: "स्टॉक समाप्त",
    adjust_stock_btn: "स्टॉक समायोजित करें",
    no_inventory_title: "वस्त्र कैटलॉग खाली है",
    no_inventory_desc: "स्टॉक ट्रैक करने और पीओएस पर बिलिंग शुरू करने के लिए अपना पहला वस्त्र जोड़ें।",
    pos_terminal_title: "पीओएस काउंटर बिलिंग",
    store_counter: "स्टोर काउंटर",
    cashier: "कैशियर",
    shift_active: "शिफ्ट सक्रिय",
    float_label: "कैश फ्लोट",
    close_shift: "शिफ्ट बंद करें",
    open_shift: "शिफ्ट खोलें",
    scan_search_placeholder: "बारकोड स्कैन करें या नाम/फैब्रिक खोजें (F2)...",
    custom_item_btn: "+ कस्टम आइटम",
    customer_details_title: "1. ग्राहक विवरण (कैश/यूपीआई के लिए वैकल्पिक, क्रेडिट हेतु अनिवार्य)",
    customer_name_placeholder: "ग्राहक का नाम",
    mobile_no_placeholder: "मोबाइल नंबर (10 अंक)",
    invoice_theme_title: "2. चालान थीम",
    payment_mode_title: "3. भुगतान माध्यम",
    pay_cash: "नकद (कैश)",
    pay_upi: "यूपीआई क्यूआर",
    pay_card: "कार्ड",
    pay_split: "विभाजित भुगतान",
    pay_credit: "स्टोर क्रेडिट (खाता)",
    sale_cart: "बिक्री कार्ट",
    clear_cart: "साफ़ करें (F8)",
    subtotal: "उप-कुल",
    discount: "छूट",
    tax_gst: "जीएसटी (5%)",
    grand_total: "कुल देय राशि",
    complete_sale_btn: "बिक्री पूर्ण करें और बिल बनाएं (F4)",
    add_btn: "+ जोड़ें",
    line_total: "लाइन कुल",
    cart_empty: "कार्ट खाली है। बारकोड स्कैन करें या '+ जोड़ें' दबाएं।",
    custom_badge: "कस्टम",
    shift_req_title: "कैश रजिस्टर शिफ्ट आवश्यक है",
    shift_req_desc: "वित्तीय समाधान के साथ खुदरा बिक्री शुरू करने के लिए गल्ले में मौजूद प्रारंभिक नकद दर्ज करें।",
    open_float_label: "प्रारंभिक कैश फ्लोट (₹)",
    open_shift_btn: "शिफ्ट खोलें और काउंटर अनलॉक करें",
    upi_modal_title: "यूपीआई काउंटर भुगतान",
    upi_modal_subtitle: "Google Pay, PhonePe, Paytm, या BHIM से स्कैन करें",
    customer_paid_btn: "✓ ग्राहक ने भुगतान कर दिया",
    utr_label: "यूपीआई यूटीआर / संदर्भ संख्या (समाधान हेतु वैकल्पिक)",
    utr_placeholder: "उदा. 429381920394",
    confirm_invoice_btn: "पुष्टि करें और बिल प्रिंट करें",
    skip_utr_btn: "यूटीआर छोड़ें",
    custom_modal_title: "+ कार्ट में कस्टम आइटम जोड़ें",
    item_desc_label: "आइटम विवरण / नाम",
    item_desc_placeholder: "उदा. सिलाई व फिटिंग, मैचिंग दुपट्टा",
    unit_price_label: "इकाई मूल्य (₹)",
    qty_label: "मात्रा",
    add_line_item_btn: "कार्ट में जोड़ें",
    invoices_title: "आधिकारिक चालान और बिल रिकॉर्ड्स",
    invoices_desc: "पोस्ट किए गए बिल देखें, कर अनुपालन जांचें और पीडीएफ डाउनलोड करें।",
    refresh_invoices_btn: "↻ चालान रीफ्रेश करें",
    six_themes_title: "6 चालान थीम्स (पूर्वावलोकन और डिफ़ॉल्ट चुनने के लिए स्वाइप करें)",
    active_theme_label: "सक्रिय",
    set_default_label: "डिफ़ॉल्ट सेट करने के लिए टैप करें",
    store_default_badge: "✓ स्टोर डिफ़ॉल्ट",
    no_invoices_title: "अभी तक कोई चालान पोस्ट नहीं हुआ",
    no_invoices_desc: "चालान अपरिवर्तनीय व्यावसायिक रिकॉर्ड हैं। तुरंत जीएसटी बिल बनाने के लिए पीओएस पर अपनी पहली बिक्री पूरी करें।",
    open_pos_till_btn: "पीओएस बिलिंग टिल खोलें ➔",
    invoice_number_col: "चालान संख्या",
    date_col: "तारीख",
    customer_col: "ग्राहक",
    theme_col: "थीम",
    total_amount_col: "कुल राशि",
    paid_col: "प्राप्त राशि",
    actions_col: "कार्रवाइयां",
    pdf_btn: "पीडीएफ",
    share_btn: "शेयर करें",
    retry_btn: "पुनः प्रयास",
    invoice_viewer_title: "चालान विवरण",
    share_whatsapp_btn: "व्हाट्सएप पर शेयर करें",
    download_print_btn: "⎙ डाउनलोड / प्रिंट पीडीएफ",
    close_btn: "बंद करें",
    settings_modal_title: "दुकान और पीओएस सेटिंग्स",
    default_pay_mode_label: "डिफ़ॉल्ट पीओएस भुगतान माध्यम",
    default_theme_label: "डिफ़ॉल्ट चालान थीम",
    cloud_server_connection: "क्लाउड सर्वर कनेक्शन",
    connected_status: "वस्त्रनिक्स क्लाउड से सफलतापूर्वक जुड़ा है",
    disconnected_status: "डिस्कनेक्ट (ऑफ़लाइन / पुनः कनेक्ट हो रहा है)",
    conn_active_meta: "सभी दुकान संचालन और रीयल-टाइम सिंक सक्रिय हैं।",
    check_status_btn: "स्थिति जांचें",
    done_btn: "पूर्ण",
    cant_reach_title: "इस समय वस्त्रनिक्स से संपर्क नहीं हो पा रहा",
    retry_conn_btn: "पुनः कनेक्ट करें",
    use_offline_till: "ऑफ़लाइन बिलिंग काउंटर खोलें",
    connecting_cloud: "वस्त्रनिक्स क्लाउड सर्वर से जुड़ रहे हैं...",
    waking_server: "स्टोर सर्वर जागृत हो रहा है (Render कोल्ड स्टार्ट, ~30s)...",
    device_offline_msg: "आपका डिवाइस वर्तमान में ऑफ़लाइन है। कृपया वाई-फाई या मोबाइल डेटा जांचें।",
    server_slow_msg: "स्टोर सर्वर से उत्तर मिलने में सामान्य से अधिक समय लग रहा है। कृपया पुनः प्रयास करें।",
    server_connected_msg: "✓ सर्वर कनेक्ट हो गया",
    // Add Garment Product Modal
    add_product_title: "वस्त्र उत्पाद जोड़ें",
    prod_name_label: "वस्त्र का नाम",
    prod_name_placeholder: "उदा. शुद्ध मलबरी सिल्क साड़ी",
    prod_fabric_label: "कपड़ा / सामग्री",
    prod_fabric_placeholder: "उदा. हथकरघा मलबरी सिल्क",
    retail_price_label: "खुदरा बिक्री मूल्य (₹)",
    purchase_cost_label: "खरीद लागत (₹)",
    size_label: "साइज़",
    size_placeholder: "उदा. M या Free",
    color_label: "रंग",
    color_placeholder: "उदा. मोरपंखी नीला",
    initial_stock_label: "प्रारंभिक स्टॉक मात्रा",
    alert_threshold_label: "स्टॉक चेतावनी सीमा",
    rack_location_label: "रैक / शेल्फ स्थान",
    rack_placeholder: "उदा. रैक A-12, बिन 4",
    sku_barcode_label: "बारकोड / एसकेयू (वैकल्पिक)",
    sku_barcode_placeholder: "उदा. VAST-SLK-001",
    save_add_catalog_btn: "सहेजें और कैटलॉग में जोड़ें",

    // Purchase Order Modal (Order More)
    create_po_title: "खरीद आदेश बनाएं (अधिक ऑर्डर)",
    target_garment_label: "लक्षित वस्त्र",
    select_supplier_label: "वस्त्र आपूर्तिकर्ता / बुनकर चुनें",
    order_qty_label: "ऑर्डर मात्रा (संख्या)",
    unit_cost_label: "प्रति नग खरीद लागत (₹)",
    po_notes_label: "पीओ नोट्स / संदर्भ",
    po_notes_placeholder: "उदा. त्योहार का स्टॉक",
    issue_po_btn: "खरीद आदेश जारी करें",

    // Goods Receipt Modal (Receive Stock)
    receive_goods_title: "सामान प्राप्ति रसीद (स्टॉक आवक)",
    receiving_garment_label: "प्राप्त हो रहा वस्त्र",
    select_po_label: "जारी किया गया खरीद आदेश चुनें",
    challan_no_label: "आपूर्तिकर्ता बिल / चालान नंबर",
    challan_placeholder: "उदा. INV-TEX-9921",
    inspection_notes_label: "निरीक्षण विवरण",
    inspection_placeholder: "उदा. पीस जांचे गए, गुणवत्ता स्वीकृत",
    confirm_receive_stock_btn: "पुष्टि करें और स्टॉक में जोड़ें",

    // Store Expenses Screen & Modal
    expenses_title: "दुकान के खर्च और प्रबंधन",
    expenses_subtitle: "दैनिक परिचालन लागत, वेतन, किराया और पैकेजिंग का हिसाब रखें।",
    record_expense_btn: "+ नया खर्च दर्ज करें",
    total_expenses_recorded: "दर्ज कुल खर्च",
    expense_entries: "खर्च प्रविष्टियां",
    total_sales_collections: "कुल बिक्री वसूली",
    cash_upi_card_receipts: "नकद + यूपीआई + कार्ड प्राप्तियां",
    net_operating_cashflow: "शुद्ध परिचालन नकदी प्रवाह",
    collections_minus_expenses: "कुल वसूली में से खर्च घटाकर",
    accounts_receivable: "प्राप्य खाते / उधारी",
    pending_customer_dues: "ग्राहकों से बकाया राशि",
    expense_transactions_log: "खर्च लेन-देन लॉग",
    filter_category_label: "श्रेणी फ़िल्टर:",
    all_categories: "सभी श्रेणियां",
    date_time_col: "दिनांक एवं समय",
    category_col: "श्रेणी",
    desc_purpose_col: "विवरण / उद्देश्य",
    payment_mode_col: "भुगतान माध्यम",
    receipt_col: "रसीद",
    amount_col: "राशि (₹)",
    no_expenses_recorded: "अभी तक कोई खर्च दर्ज नहीं है। खर्च जोड़ने के लिए '+ नया खर्च दर्ज करें' पर क्लिक करें।",
    record_store_expense_title: "दुकान का खर्च दर्ज करें",
    expense_category_label: "खर्च की श्रेणी",
    expense_desc_label: "विवरण / रसीद नोट",
    expense_desc_placeholder: "उदा. त्योहार के लिए 500 कॉटन कैरी बैग",
    attach_receipt_label: "बिल / रसीद संलग्न करें (वैकल्पिक)",
    save_post_expense_btn: "खर्च सहेजें और पोस्ट करें",
    view_receipt_link: "📎 रसीद देखें",
    no_receipt_attached: "रसीद संलग्न नहीं है",

    // Staff & Users Screen & Modal
    team_title: "स्टोर टीम और कर्मचारी खाते",
    team_subtitle: "कर्मचारियों की भूमिकाएं, काउंटर कैशियर और लॉजिस्टिक्स संभालें।",
    add_team_member_btn: "+ नया कर्मचारी जोड़ें",
    total_store_team: "कुल स्टोर टीम",
    members_count_label: "कर्मचारी",
    active_cashiers: "सक्रिय कैशियर",
    pos_till_operators: "बिलिंग काउंटर ऑपरेटर",
    dispatchers_picking: "डिस्पैच और पैकिंग",
    b2b_staff: "बी2बी ऑर्डर पैकिंग स्टाफ",
    pending_approvals_metric: "स्वीकृति लंबित",
    signups_waiting: "प्रतीक्षारत पंजीकरण",
    employee_name_col: "कर्मचारी का नाम",
    contact_email_col: "संपर्क / ईमेल",
    role_responsibilities_col: "भूमिका और जिम्मेदारियां",
    store_branch_col: "स्टोर शाखा",
    status_label: "स्थिति",
    add_staff_title: "स्टोर कर्मचारी जोड़ें",
    full_name_label: "पूरा नाम",
    full_name_placeholder: "उदा. रमेश पटेल",
    email_address_label: "ईमेल पता",
    email_placeholder: "ramesh@vastrenix-store.com",
    phone_number_label: "फ़ोन नंबर",
    phone_placeholder: "+91 98765 43210",
    role_responsibility_label: "भूमिका और जिम्मेदारी",
    staff_auth_notice: "बनाए जाने के बाद कर्मचारी इस स्टोर में तुरंत लॉगिन कर सकेंगे।",
    create_auth_staff_btn: "कर्मचारी बनाएं और अधिकृत करें",

    // Close Shift Modal
    close_shift_title: "कैश शिफ्ट बंद एवं समाधान करें",
    opening_float_label: "प्रारंभिक नकद राशि:",
    cash_sales_collected_label: "प्राप्त कुल नकद बिक्री:",
    cash_payouts_label: "नकद खर्च / निकासी:",
    expected_drawer_cash_label: "अपेक्षित गल्ला नकद:",
    counted_cash_label: "गल्ले में गिनी गई नकद राशि (₹)",
    counted_cash_placeholder: "गिने गए नोट और सिक्के दर्ज करें",
    closing_notes_label: "समापन विवरण / विसंगति कारण (वैकल्पिक)",
    closing_notes_placeholder: "उदा. मुख्य कैशियर द्वारा सत्यापित",
    reconcile_close_btn: "समाधान करें और शिफ्ट बंद करें",

    // Assign Staff Modal
    assign_staff_title: "कर्मचारी को ऑर्डर सौंपें",
    dealer_order_label: "डीलर ऑर्डर",
    select_staff_label: "कर्मचारी चुनें",
    assign_staff_notice: "सौंपा गया कर्मचारी इस ऑर्डर के आइटम चुनने, गुणवत्ता जांच और पैकिंग के लिए जिम्मेदार होगा।",
    confirm_assignment_btn: "कार्यभार पुष्टि करें",

    // Dashboard Resilience Fallbacks
    metrics_load_failed: "डैशबोर्ड डेटा लोड नहीं हो सका।",
    retry_dashboard_btn: "⟳ डैशबोर्ड पुनः प्रयास",

    // PDF Dialog Popup
    pdf_popup_title: "चालान पीडीएफ तैयार है",
    pdf_popup_subtitle: "आधिकारिक जीएसटी कर दस्तावेज सत्यापित किया गया",
    view_system_pdf_btn: "👁️ पीडीएफ देखें (सिस्टम व्यूअर)",
    share_pdf_btn: "💬 व्हाट्सएप पर साझा करें",
    download_pdf_btn: "⎙ डाउनलोड / प्रिंट पीडीएफ",
  },
  gu: {
    welcome: "તમારા વસ્ત્ર વ્યાપારમાં આપનું સ્વાગત છે",
    dashboard: "ડેશબોર્ડ",
    inventory: "ઇન્વેન્ટરી અને કેટલોગ",
    pos: "પીઓએસ બિલિંગ",
    invoices: "બિલ અને થીમ્સ",
    expenses: "દુકાનના ખર્ચાઓ",
    dealers: "ડીલર બી2બી નેટવર્ક",
    team: "સ્ટાફ અને ટીમ",
    flowcharts: "સિસ્ટમ ફ્લોચાર્ટ",
    settings: "સેટિંગ્સ",
    logout: "લોગ આઉટ",
    current_store: "ચાલુ શોરૂમ",
    flagship_store: "મુખ્ય શોરૂમ",
    store_admin: "સ્ટોર એડમિન",
    staff_view: "સ્ટાફ વ્યૂ",
    assigned_store: "સોંપેલ દુકાન",
    logged_in_as: "લોગિન યુઝર",
    today_sales: "આજનું કુલ વેચાણ",
    today_orders: "આજના ઓર્ડર્સ",
    total_revenue: "કુલ ચોખ્ખી આવક",
    low_stock_items: "ઓછો સ્ટોક ધરાવતા વસ્ત્રો",
    pending_approvals: "બાકી સ્ટાફ મંજૂરીઓ",
    pending_dealer_orders: "બાકી ડીલર ઓર્ડર્સ",
    month_end_dues: "મહિનાના અંતનું બાકી ઉધાર",
    sizes_reorder: "ફરી ઓર્ડર કરવા યોગ્ય સાઇઝ",
    all_healthy: "બધો સ્ટોક પૂરતો છે",
    b2b_awaiting: "બાકી બી2બી ઓર્ડર્સ",
    posted_invoices: "માન્ય સેવ કરેલા બિલ",
    pending_receivables: "ગ્રાહકો પાસેથી બાકી લેણી રકમ",
    tx_completed: "ટ્રાન્ઝેક્શન પૂર્ણ",
    new_pos_sale: "+ નવું વેચાણ",
    add_garment_prod: "+ નવો ડ્રેસ ઉમેરો",
    dealer_orders_btn: "ડીલર ઓર્ડર્સ",
    urgent_low_stock: "ઓછા સ્ટોકની ચેતવણી",
    view_all_inventory: "આખી ઇન્વેન્ટરી જુઓ",
    garment_product: "કપડાંનું નામ",
    sku: "એસકેયુ",
    size_color: "સાઇઝ / કલર",
    available_qty: "ઉપલબ્ધ જથ્થો",
    threshold: "ન્યૂનતમ મર્યાદા",
    action: "ક્રિયા",
    manage_stock: "સ્ટોક મેનેજમેન્ટ",
    month_end_banner_title: "મહિનાના અંતના ઉધાર પેમેન્ટ રીમાઇન્ડર સક્રિય",
    month_end_banner_desc: "મહિનાના અંત પહેલા ઉઘરાવવા પાત્ર કુલ સ્ટોર ક્રેડિટ.",
    review_dues_btn: "બિલમાં બાકી રકમ જુઓ",
    pending_staff_title: "મંજૂરી માટે બાકી સ્ટાફ નોંધણી",
    approve_staff_btn: "✓ સ્ટાફ મંજૂર કરો",
    reject_staff_btn: "✕ નામંજૂર કરો",
    inventory_title: "વસ્ત્ર ઇન્વેન્ટરી અને ગોડાઉન સ્ટોક",
    inventory_desc: "સાઇઝ અને કલર મુજબ ઉપલબ્ધ સ્ટોક ટ્રૅક કરો.",
    search_garment_placeholder: "કપડાંનું નામ, એસકેયુ અથવા કાપડ શોધો...",
    product_name_col: "પ્રોડક્ટનું નામ",
    fabric_col: "કાપડ / મટિરિયલ",
    size_col: "સાઇઝ",
    color_col: "કલર",
    rack_location_col: "રેક લોકેશન",
    on_hand_col: "હાજર સ્ટોક",
    reserved_col: "રિઝર્વ",
    available_col: "ઉપલબ્ધ",
    status_col: "સ્થિતિ",
    stock_ops_col: "સ્ટોક કામગીરી",
    in_stock_label: "સ્ટોકમાં ઉપલબ્ધ",
    out_of_stock_label: "સ્ટોક ખાલી",
    adjust_stock_btn: "સ્ટોક એડજસ્ટ કરો",
    no_inventory_title: "કપડાંનો કેટલોગ ખાલી છે",
    no_inventory_desc: "સ્ટોક ટ્રેક કરવા અને કાઉન્ટર પર બિલિંગ શરૂ કરવા માટે પહેલી પ્રોડક્ટ ઉમેરો.",
    pos_terminal_title: "પીઓએસ કાઉન્ટર ટિલ",
    store_counter: "સ્ટોર કાઉન્ટર",
    cashier: "કેશિયર",
    shift_active: "શિફ્ટ ચાલુ",
    float_label: "કેશ ફ્લોટ",
    close_shift: "શિફ્ટ બંધ કરો",
    open_shift: "શિફ્ટ શરૂ કરો",
    scan_search_placeholder: "બારકોડ સ્કેન કરો અથવા નામ/કાપડ શોધો (F2)...",
    custom_item_btn: "+ કસ્ટમ આઇટમ",
    customer_details_title: "1. ગ્રાહકની વિગતો (રોકડ/યુપીઆઈ માટે વૈકલ્પિક, ઉધાર માટે ફરજિયાત)",
    customer_name_placeholder: "ગ્રાહકનું નામ",
    mobile_no_placeholder: "મોબાઇલ નંબર (10 આંકડા)",
    invoice_theme_title: "2. બિલિંગ થીમ",
    payment_mode_title: "3. ચુકવણી પદ્ધતિ (પેમેન્ટ મોડ)",
    pay_cash: "રોકડ (કેશ)",
    pay_upi: "યુપીઆઈ ક્યૂઆર",
    pay_card: "કાર્ડ",
    pay_split: "સ્પ્લિટ પેમેન્ટ",
    pay_credit: "દુકાન ઉધાર (ખાતાવહી)",
    sale_cart: "સેલ કાર્ટ",
    clear_cart: "ખાલી કરો (F8)",
    subtotal: "સબટોટલ",
    discount: "ડિસ્કાઉન્ટ",
    tax_gst: "જીએસટી (5%)",
    grand_total: "કુલ રકમ",
    complete_sale_btn: "બિલ બનાવો અને સાચવો (F4)",
    add_btn: "+ ઉમેરો",
    line_total: "કુલ રકમ",
    cart_empty: "કાર્ટ ખાલી છે. બારકોડ સ્કેન કરો અથવા '+ ઉમેરો' દબાવો.",
    custom_badge: "કસ્ટમ",
    shift_req_title: "રોકડ રજીસ્ટર શિફ્ટ જરૂરી છે",
    shift_req_desc: "હિસાબી મેળ સાથે વેચાણ શરૂ કરવા માટે કાઉન્ટરમાં મૂકેલ પ્રારંભિક રોકડ રકમ દાખલ કરો.",
    open_float_label: "પ્રારંભિક રોકડ રકમ (₹)",
    open_shift_btn: "શિફ્ટ શરૂ કરો અને કાઉન્ટર ખોલો",
    upi_modal_title: "યુપીઆઈ કાઉન્ટર પેમેન્ટ",
    upi_modal_subtitle: "Google Pay, PhonePe, Paytm, અથવા BHIM થી સ્કેન કરો",
    customer_paid_btn: "✓ ગ્રાહકે પૈસા ચૂકવી દીધા",
    utr_label: "યુપીઆઈ યુટીઆર / રેફરન્સ નંબર (વૈકલ્પિક)",
    utr_placeholder: "દા.ત. 429381920394",
    confirm_invoice_btn: "કન્ફર્મ કરો અને બિલ પ્રિન્ટ કરો",
    skip_utr_btn: "યુટીઆર સ્કીપ કરો",
    custom_modal_title: "+ કાર્ટમાં કસ્ટમ આઇટમ ઉમેરો",
    item_desc_label: "વિગત / નામ",
    item_desc_placeholder: "દા.ત. સિલાઈ અને ફિટિંગ, મેચિંગ દુપટ્ટો",
    unit_price_label: "ભાવ (₹)",
    qty_label: "જથ્થો",
    add_line_item_btn: "કાર્ટમાં ઉમેરો",
    invoices_title: "માન્ય બિલ અને હિસાબી રેકોર્ડ્સ",
    invoices_desc: "બનાવેલા બિલ જુઓ, જીએસટી તપાસો અને પીડીએફ ડાઉનલોડ કરો.",
    refresh_invoices_btn: "↻ બિલ રિફ્રેશ કરો",
    six_themes_title: "6 ઇનવોઇસ થીમ્સ (પસંદ કરવા માટે સ્વાઇપ કરો)",
    active_theme_label: "સક્રિય",
    set_default_label: "ડિફોલ્ટ સેટ કરવા ક્લિક કરો",
    store_default_badge: "✓ સ્ટોર ડિફોલ્ટ",
    no_invoices_title: "હજી સુધી કોઈ બિલ બન્યા નથી",
    no_invoices_desc: "બિલ એ કાયમી વેપાર રેકોર્ડ છે. જીએસટી બિલ બનાવવા માટે કાઉન્ટર પર પહેલું વેચાણ કરો.",
    open_pos_till_btn: "પીઓએસ બિલિંગ કાઉન્ટર ખોલો ➔",
    invoice_number_col: "બિલ નંબર",
    date_col: "તારીખ",
    customer_col: "ગ્રાહક",
    theme_col: "થીમ",
    total_amount_col: "કુલ રકમ",
    paid_col: "ચૂકવેલ",
    actions_col: "કામગીરી",
    pdf_btn: "પીડીએફ",
    share_btn: "શેર કરો",
    retry_btn: "ફરી પ્રયાસ",
    invoice_viewer_title: "બિલની વિગત",
    share_whatsapp_btn: "વોટ્સએપ પર શેર કરો",
    download_print_btn: "⎙ ડાઉનલોડ / પ્રિન્ટ પીડીએફ",
    close_btn: "બંધ કરો",
    settings_modal_title: "દુકાન અને પીઓએસ સેટિંગ્સ",
    default_pay_mode_label: "ડિફોલ્ટ પીઓએસ પેમેન્ટ પદ્ધતિ",
    default_theme_label: "ડિફોલ્ટ બિલિંગ થીમ",
    cloud_server_connection: "ક્લાઉડ સર્વર કનેક્શન",
    connected_status: "વસ્ત્રનિક્સ ક્લાઉડ સાથે જોડાયેલ છે",
    disconnected_status: "ડિસ્કનેક્ટ (ઓફલાઇન / પુનઃપ્રયાસ)",
    conn_active_meta: "તમામ સ્ટોર કામગીરી અને રિયલ-ટાઇમ સિંક ચાલુ છે.",
    check_status_btn: "સ્થિતિ ચકાસો",
    done_btn: "પૂર્ણ",
    cant_reach_title: "હાલમાં વસ્ત્રનિક્સ સાથે કનેક્શન થતું નથી",
    retry_conn_btn: "ફરી કનેક્ટ કરો",
    use_offline_till: "ઓફલાઇન બિલિંગ ટિલ ખોલો",
    connecting_cloud: "વસ્ત્રનિક્સ ક્લાઉડ સર્વર સાથે કનેક્ટ થઈ રહ્યું છે...",
    waking_server: "સ્ટોર સર્વર જાગૃત થઈ રહ્યું છે (Render કોલ્ડ સ્ટાર્ટ, ~30s)...",
    device_offline_msg: "તમારું ડિવાઇસ હાલમાં ઑફલાઇન છે. કૃપા કરીને ઇન્ટરનેટ કનેક્શન ચકાસો.",
    server_slow_msg: "સર્વર પ્રતિસાદ આપવામાં સામાન્ય કરતાં વધુ સમય લઈ રહ્યું છે. ફરી પ્રયાસ કરો.",
    server_connected_msg: "✓ સર્વર કનેક્ટ થઈ ગયું",
    // Add Garment Product Modal
    add_product_title: "નવું વસ્ત્ર ઉત્પાદન ઉમેરો",
    prod_name_label: "વસ્ત્રનું નામ",
    prod_name_placeholder: "દા.ત. શુદ્ધ મલબરી સિલ્ક સાડી",
    prod_fabric_label: "કાપડ / મટિરિયલ",
    prod_fabric_placeholder: "દા.ત. હેન્ડવુવન મલબરી સિલ્ક",
    retail_price_label: "છૂટક વેચાણ કિંમત (₹)",
    purchase_cost_label: "ખરીદ પડતર (₹)",
    size_label: "સાઇઝ",
    size_placeholder: "દા.ત. M અથવા ફ્રી",
    color_label: "રંગ",
    color_placeholder: "દા.ત. મોરપીંછ વાદળી",
    initial_stock_label: "પ્રારંભિક સ્ટોક જથ્થો",
    alert_threshold_label: "સ્ટોક ચેતવણી મર્યાદા",
    rack_location_label: "શેલ્ફ / રેક લોકેશન",
    rack_placeholder: "દા.ત. રેક A-12, ખાનું 4",
    sku_barcode_label: "બારકોડ / એસકેયુ (વૈકલ્પિક)",
    sku_barcode_placeholder: "દા.ત. VAST-SLK-001",
    save_add_catalog_btn: "સાચવો અને કેટલોગમાં ઉમેરો",

    // Purchase Order Modal (Order More)
    create_po_title: "ખરીદ ઓર્ડર બનાવો (વધુ સ્ટોક)",
    target_garment_label: "લક્ષિત વસ્ત્ર",
    select_supplier_label: "કાપડ સપ્લાયર / વણકર પસંદ કરો",
    order_qty_label: "ઓર્ડર જથ્થો (નંગ)",
    unit_cost_label: "પ્રતિ નંગ ખરીદ કિંમત (₹)",
    po_notes_label: "ઓર્ડર નોંધ / સંદર્ભ",
    po_notes_placeholder: "દા.ત. તહેવાર સ્ટોક રિફિલ",
    issue_po_btn: "ખરીદ ઓર્ડર જારી કરો",

    // Goods Receipt Modal (Receive Stock)
    receive_goods_title: "માલ પ્રાપ્તિ નોંધ (સ્ટોક આવક)",
    receiving_garment_label: "પ્રાપ્ત થતું વસ્ત્ર",
    select_po_label: "જારી કરેલ ખરીદ ઓર્ડર પસંદ કરો",
    challan_no_label: "સપ્લાયર બિલ / ચલણ નંબર",
    challan_placeholder: "દા.ત. INV-TEX-9921",
    inspection_notes_label: "ચકાસણી નોંધ",
    inspection_placeholder: "દા.ત. માલ ચકાસ્યો, ગુણવત્તા મંજૂર",
    confirm_receive_stock_btn: "ખાતરી કરો અને સ્ટોકમાં ઉમેરો",

    // Store Expenses Screen & Modal
    expenses_title: "દુકાનના ખર્ચાઓ અને સંચાલન",
    expenses_subtitle: "દૈનિક સંચાલન ખર્ચ, પગાર, ભાડું અને પેકિંગનો હિસાબ રાખો.",
    record_expense_btn: "+ નવો ખર્ચ નોંધો",
    total_expenses_recorded: "કુલ નોંધાયેલ ખર્ચ",
    expense_entries: "ખર્ચ એન્ટ્રીઓ",
    total_sales_collections: "કુલ વેચાણ રોકડ આવક",
    cash_upi_card_receipts: "રોકડ + યુપીઆઈ + કાર્ડ આવક",
    net_operating_cashflow: "ચોખ્ખો રોકડ પ્રવાહ",
    collections_minus_expenses: "આવકમાંથી ખર્ચ બાદ કરતાં",
    accounts_receivable: "બાકી ઉધારી ખાતા",
    pending_customer_dues: "ગ્રાહકો પાસેથી લેણી રકમ",
    expense_transactions_log: "ખર્ચ વ્યવહારોની યાદી",
    filter_category_label: "કેટેગરી ફિલ્ટર:",
    all_categories: "બધી કેટેગરીઓ",
    date_time_col: "તારીખ અને સમય",
    category_col: "કેટેગરી",
    desc_purpose_col: "વિગત / હેતુ",
    payment_mode_col: "ચૂકવણી પદ્ધતિ",
    receipt_col: "પહોંચ",
    amount_col: "રકમ (₹)",
    no_expenses_recorded: "હજુ સુધી કોઈ ખર્ચ નોંધાયેલ નથી. ખર્ચ ઉમેરવા '+ નવો ખર્ચ નોંધો' પર ક્લિક કરો.",
    record_store_expense_title: "દુકાનનો ખર્ચ નોંધો",
    expense_category_label: "ખર્ચની કેટેગરી",
    expense_desc_label: "વિગત / પહોંચ નોંધ",
    expense_desc_placeholder: "દા.ત. તહેવાર માટે 500 કોટન કેરી બેગ્સ",
    attach_receipt_label: "બિલ / રસીદ જોડો (વૈકલ્પિક)",
    save_post_expense_btn: "ખર્ચ સાચવો અને પોસ્ટ કરો",
    view_receipt_link: "📎 પહોંચ જુઓ",
    no_receipt_attached: "પહોંચ જોડેલ નથી",

    // Staff & Users Screen & Modal
    team_title: "સ્ટોર ટીમ અને કર્મચારી ખાતાઓ",
    team_subtitle: "કર્મચારીઓની ભૂમિકા, કાઉન્ટર કેશિયર અને પેકિંગ સ્ટાફ સંભાળો.",
    add_team_member_btn: "+ નવો સ્ટાફ ઉમેરો",
    total_store_team: "કુલ સ્ટોર ટીમ",
    members_count_label: "કર્મચારીઓ",
    active_cashiers: "સક્રિય કેશિયર",
    pos_till_operators: "કાઉન્ટર બિલિંગ ઓપરેટરો",
    dispatchers_picking: "ડિસ્પેચ અને પેકિંગ",
    b2b_staff: "બી2બી ઓર્ડર પેકિંગ સ્ટાફ",
    pending_approvals_metric: "મંજૂરી બાકી",
    signups_waiting: "રાહ જોતા રજીસ્ટ્રેશન",
    employee_name_col: "કર્મચારીનું નામ",
    contact_email_col: "સંપર્ક / ઇમેઇલ",
    role_responsibilities_col: "હોદ્દો અને જવાબદારી",
    store_branch_col: "દુકાન શાખા",
    status_label: "સ્થિતિ",
    add_staff_title: "નવા કર્મચારીને જોડો",
    full_name_label: "પૂરું નામ",
    full_name_placeholder: "દા.ત. રમેશ પટેલ",
    email_address_label: "ઇમેઇલ એડ્રેસ",
    email_placeholder: "ramesh@vastrenix-store.com",
    phone_number_label: "ફોન નંબર",
    phone_placeholder: "+91 98765 43210",
    role_responsibility_label: "હોદ્દો અને જવાબદારી",
    staff_auth_notice: "બનાવ્યા પછી કર્મચારી તરત જ આ દુકાનમાં લૉગિન કરી શકશે.",
    create_auth_staff_btn: "સ્ટાફ એકાઉન્ટ બનાવો",

    // Close Shift Modal
    close_shift_title: "કેશ શિફ્ટ બંધ અને મેળવણી કરો",
    opening_float_label: "પ્રારંભિક રોકડ રકમ:",
    cash_sales_collected_label: "કુલ રોકડ વેચાણ આવક:",
    cash_payouts_label: "રોકડ ખર્ચ / ઉપાડ:",
    expected_drawer_cash_label: "અપેક્ષિત ગલ્લા રોકડ:",
    counted_cash_label: "ગલ્લામાં ગણેલી રોકડ રકમ (₹)",
    counted_cash_placeholder: "ગણેલી નોટો અને સિક્કા દાખલ કરો",
    closing_notes_label: "બંધ નોંધ / તફાવતનું કારણ (વૈકલ્પિક)",
    closing_notes_placeholder: "દા.ત. હેડ કેશિયર દ્વારા વેરિફાઇડ",
    reconcile_close_btn: "મેળવણી કરો અને શિફ્ટ બંધ કરો",

    // Assign Staff Modal
    assign_staff_title: "કર્મચારીને ઓર્ડર સોંપો",
    dealer_order_label: "ડીલર ઓર્ડર",
    select_staff_label: "કર્મચારી પસંદ કરો",
    assign_staff_notice: "સોંપેલ કર્મચારી આ ઓર્ડરની માલ પસંદગી, ગુણવત્તા ચકાસણી અને પેકિંગ માટે જવાબદાર રહેશે.",
    confirm_assignment_btn: "જવાબદારી મંજૂર કરો",

    // Dashboard Resilience Fallbacks
    metrics_load_failed: "ડેશબોર્ડ ડેટા લોડ થઈ શક્યો નથી.",
    retry_dashboard_btn: "⟳ ડેશબોર્ડ ફરી પ્રયાસ",

    // PDF Dialog Popup
    pdf_popup_title: "બિલ પીડીએફ તૈયાર છે",
    pdf_popup_subtitle: "સત્તાવાર જીએસટી ટેક્સ દસ્તાવેજ ચકાસાયેલ છે",
    view_system_pdf_btn: "👁️ પીડીએફ જુઓ (સિસ્ટમ વ્યુઅર)",
    share_pdf_btn: "💬 વોટ્સએપ પર શેર કરો",
    download_pdf_btn: "⎙ ડાઉનલોડ / પ્રિન્ટ પીડીએફ",
  }
};

function t(key, fallback = "") {
  const currentLang = state.lang || "en";
  if (i18n[currentLang] && i18n[currentLang][key] !== undefined) {
    return i18n[currentLang][key];
  }
  if (i18n.en && i18n.en[key] !== undefined) {
    return i18n.en[key];
  }
  return fallback || key;
}

// Robust offline database to guarantee ZERO blank screen on Android APK / offline devices
const offlineDB = {
  stores: [
    { id: 1, name: "Vastrenix Heritage Garments (Surat Flagship)", city: "Surat", gstin: "24AAACV1234F1Z9" },
    { id: 2, name: "Vastrenix Royal Silks (Jaipur Boutique)", city: "Jaipur", gstin: "08BBBCV5678G2Z1" }
  ],
  dashboard: {
    business_name: "Vastrenix Heritage Garments",
    branch_name: "Surat Main Store & Atelier",
    today_sales: 68450.00,
    today_orders_count: 18,
    total_revenue: 1640000.00,
    low_stock_count: 2,
    pending_dealer_orders: 1,
    top_low_stock: [
      { name: "Handcrafted Mulberry Silk Sari", sku: "SILK-PEACOCK", size: "Free", color: "Peacock Blue", available: 2, threshold: 5 },
      { name: "Chanderi Embroidered Kurta Set", sku: "CHAND-M-IVR", size: "M", color: "Ivory White", available: 0, threshold: 4 }
    ]
  },
  products: [
    {
      id: 1,
      name: "Handcrafted Mulberry Silk Sari",
      fabric: "100% Pure Mulberry Silk",
      hsn_sac: "5007",
      variants: [
        { id: 101, sku: "SILK-PEACOCK", size: "Free", color: "Peacock Blue", retail_price: 3490.00, available: 16 },
        { id: 102, sku: "SILK-CRIMSON", size: "Free", color: "Crimson Red", retail_price: 3890.00, available: 9 }
      ]
    },
    {
      id: 2,
      name: "Chanderi Embroidered Kurta Set",
      fabric: "Chanderi Silk Blend",
      hsn_sac: "6204",
      variants: [
        { id: 103, sku: "CHAND-S-IVR", size: "S", color: "Ivory White", retail_price: 1890.00, available: 14 },
        { id: 104, sku: "CHAND-M-IVR", size: "M", color: "Ivory White", retail_price: 1890.00, available: 0 },
        { id: 105, sku: "CHAND-L-IVR", size: "L", color: "Ivory White", retail_price: 1890.00, available: 11 }
      ]
    },
    {
      id: 3,
      name: "Bandhani Georgette Dupatta",
      fabric: "Pure Georgette",
      hsn_sac: "6214",
      variants: [
        { id: 106, sku: "BANDH-FREE-RED", size: "Free", color: "Maroon / Gold", retail_price: 1250.00, available: 25 }
      ]
    }
  ],
  inventory: [
    { product_name: "Handcrafted Mulberry Silk Sari", fabric: "Mulberry Silk", sku: "SILK-PEACOCK", size: "Free", color: "Peacock Blue", rack_location: "RACK-A1", on_hand: 18, reserved: 2, available: 16, is_low_stock: false, is_out_of_stock: false, variant_id: 101 },
    { product_name: "Handcrafted Mulberry Silk Sari", fabric: "Mulberry Silk", sku: "SILK-CRIMSON", size: "Free", color: "Crimson Red", rack_location: "RACK-A2", on_hand: 9, reserved: 0, available: 9, is_low_stock: false, is_out_of_stock: false, variant_id: 102 },
    { product_name: "Chanderi Embroidered Kurta Set", fabric: "Chanderi Silk", sku: "CHAND-M-IVR", size: "M", color: "Ivory White", rack_location: "RACK-B3", on_hand: 0, reserved: 0, available: 0, is_low_stock: true, is_out_of_stock: true, variant_id: 104 }
  ],
  expenses: [
    { id: 1, category: "RENT", amount: 25000.00, payment_mode: "BANK_TRANSFER", description: "Showroom Premises Rent", date: "20-Oct-2026 10:30" },
    { id: 2, category: "PACKAGING", amount: 3200.00, payment_mode: "UPI", description: "Custom foil-stamped luxury carry bags (500 pcs)", date: "22-Oct-2026 14:15" },
    { id: 3, category: "TEA_SNACKS", amount: 480.00, payment_mode: "CASH", description: "Chai & snacks for boutique guests", date: "Today 16:00" }
  ],
  invoices: [
    { id: 101, invoice_number: "INV-20261023-0001", date: "23-Oct-2026 14:10", customer_name: "Ananya Sharma", invoice_theme: "PREMIUM_BOUTIQUE", total_amount: 3664.50, paid_amount: 3664.50, payment_mode: "UPI", payment_status: "PAID" },
    { id: 102, invoice_number: "INV-20261023-0002", date: "23-Oct-2026 16:35", customer_name: "Vikram Mehta", invoice_theme: "CLASSIC_GST", total_amount: 1984.50, paid_amount: 1984.50, payment_mode: "CASH", payment_status: "PAID" }
  ],
  incomingOrders: [
    { id: 501, order_number: "B2B-20261023-0001", buyer_name: "Kaveri Boutique (Bengaluru)", date: "23-Oct-2026 11:20", items: [{ id: 1, product_name: "Mulberry Silk Sari", size: "Free", qty_ordered: 10, unit_price: 2400.00 }], total_amount: 24000.00, status: "ACCEPTED", assigned_staff_id: 2, assigned_staff_name: "Aman Verma" }
  ],
  connections: [
    { partner_name: "Kaveri Boutique (Bengaluru)", partner_city: "Bengaluru", partner_gstin: "29AABCU9603R1ZM", status: "ACTIVE", price_tier: "WHOLESALE" }
  ],
  staff: [
    { id: 2, full_name: "Aman Verma", email: "aman.staff@store.com", role: "DISPATCHER", branch_name: "Main Store", is_active: true },
    { id: 3, full_name: "Pooja Sharma", email: "pooja.cashier@store.com", role: "CASHIER", branch_name: "Main Store", is_active: true }
  ],
  suppliers: [
    { id: 1, name: "Surat Textile Mill (Primary Supplier)", city: "Surat", phone: "+91 98250 11223" },
    { id: 2, name: "Jaipur Handloom Weavers", city: "Jaipur", phone: "+91 94140 33445" }
  ],
  purchaseOrders: [
    { id: 1, po_number: "PO-20261025-0001", order_date: "25-Oct-2026", supplier_name: "Surat Textile Mill", status: "ISSUED", total_amount: 24000.00 }
  ]
};

function handleOfflineMock(endpoint, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isDemoStore = (state.user && state.user.email === "demo@vastrenix.com") || (state.business && Number(state.business.id) === 1);

  if (endpoint.includes("/auth/public-stores")) return offlineDB.stores;
  if (endpoint.includes("/reports/dashboard")) {
    if (!isDemoStore) {
      return {
        today_sales: 0,
        today_orders: 0,
        total_revenue: 0,
        low_stock_items: 0,
        low_stock_count: 0,
        pending_approvals: 0,
        pending_dealer_orders: 0,
        pending_credit_dues: 0,
        business_name: (state.business && state.business.name) || (state.storeName) || "My Store",
        branch_name: state.storeName || "Main Counter",
        recent_sales: []
      };
    }
    return offlineDB.dashboard;
  }
  if (endpoint.includes("/products/")) return isDemoStore ? offlineDB.products : [];
  if (endpoint.includes("/inventory/levels")) return isDemoStore ? offlineDB.inventory : [];
  if (endpoint.includes("/finance/expenses") && method === "GET") return isDemoStore ? offlineDB.expenses : [];
  if (endpoint.includes("/finance/summary")) {
    return isDemoStore ? { total_collected: 68450.00, total_expenses: 28680.00, net_cash_flow: 39770.00, total_receivables: 12400.00 } : { total_collected: 0, total_expenses: 0, net_cash_flow: 0, total_receivables: 0 };
  }
  if (endpoint.includes("/pos/invoices")) return isDemoStore ? offlineDB.invoices : [];
  if (endpoint.includes("/dealers/orders/incoming")) return isDemoStore ? offlineDB.incomingOrders : [];
  if (endpoint.includes("/dealers/connections")) return isDemoStore ? offlineDB.connections : [];
  if (endpoint.includes("/auth/staff")) return isDemoStore ? offlineDB.staff : [];
  if (endpoint.includes("/auth/pending-staff")) return [];
  if (endpoint.includes("/purchases/suppliers")) return isDemoStore ? offlineDB.suppliers : [];
  if (endpoint.includes("/purchases/orders") && method === "GET") return isDemoStore ? offlineDB.purchaseOrders : [];
  if (endpoint.includes("/purchases/orders") && method === "POST") {
    const payload = JSON.parse(options.body || "{}");
    const num = `PO-${Date.now().toString().slice(-4)}`;
    const newPo = {
      id: Date.now(),
      po_number: num,
      order_date: "Today",
      supplier_name: "Surat Textile Mill",
      status: "ISSUED",
      total_amount: payload.items ? payload.items.reduce((s, it) => s + (it.unit_cost * it.quantity), 0) : 5000.00
    };
    offlineDB.purchaseOrders.unshift(newPo);
    return { message: "Purchase order created", po_id: newPo.id, po_number: newPo.po_number, total_amount: newPo.total_amount };
  }
  if (endpoint.includes("/purchases/grn") && method === "POST") {
    const payload = JSON.parse(options.body || "{}");
    const po = offlineDB.purchaseOrders.find(o => o.id === payload.purchase_order_id);
    if (po) po.status = "COMPLETED";
    return { message: "Goods received into stock successfully", grn_number: `GRN-${Date.now().toString().slice(-4)}` };
  }

  if (endpoint.includes("/auth/login") && method === "POST") {
    return {
      access_token: "demo_token_" + Date.now(),
      user: { id: 1, full_name: "Ramesh Patel (Store Owner)", email: "demo@vastrenix.com" },
      active_business: { id: 1, name: "Vastrenix Heritage Garments", currency: "INR", role: "OWNER" },
      store_name: "Vastrenix Heritage Garments",
      is_staff: false
    };
  }

  if (endpoint.includes("/pos/sale") && method === "POST") {
    const payload = JSON.parse(options.body || "{}");
    const num = `INV-${Date.now().toString().slice(-4)}`;
    const newInv = {
      id: Date.now(),
      invoice_number: num,
      date: "Today " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      customer_name: payload.customer_name || "Retail Client",
      invoice_theme: payload.invoice_theme || "PREMIUM_BOUTIQUE",
      total_amount: payload.items ? payload.items.reduce((s, it) => s + (it.unit_price * it.quantity), 0) : 1000,
      paid_amount: payload.items ? payload.items.reduce((s, it) => s + (it.unit_price * it.quantity), 0) : 1000,
      payment_mode: payload.payment_mode || "UPI",
      payment_status: "PAID"
    };
    offlineDB.invoices.unshift(newInv);
    return { invoice_id: newInv.id, invoice_number: newInv.invoice_number, pdf_download_url: "#" };
  }

  if (endpoint.includes("/finance/expenses") && method === "POST") {
    const payload = JSON.parse(options.body || "{}");
    const newExp = {
      id: Date.now(),
      category: payload.category || "OTHER",
      amount: payload.amount || 0,
      payment_mode: payload.payment_mode || "CASH",
      description: payload.description || "Expense",
      date: "Today " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    offlineDB.expenses.unshift(newExp);
    return { message: "Expense recorded", id: newExp.id, amount: newExp.amount };
  }

  if (endpoint.includes("/assign-staff") && method === "POST") {
    const payload = JSON.parse(options.body || "{}");
    return { message: "Order assigned to staff", assigned_staff_id: payload.staff_id, assigned_staff_name: "Assigned Staff" };
  }

  if (endpoint.includes("/sync/firebase/status")) {
    return { is_configured: true, mode: "PRODUCTION_FIREBASE", project_id: "vastranix" };
  }

  return { status: "OK", message: "Offline operation recorded" };
}

// Server Connection Settings Controllers
function openServerSettingsModal() {
  const modal = document.getElementById("modal-server-settings");
  if (modal) {
    document.getElementById("server-url-input").value = getBaseServerUrl();
    document.getElementById("server-health-status").innerHTML = "";
    modal.classList.add("active");
  }
}

function closeServerSettingsModal() {
  const modal = document.getElementById("modal-server-settings");
  if (modal) modal.classList.remove("active");
}

function setPresetServerUrl(url) {
  const input = document.getElementById("server-url-input");
  if (input) input.value = url;
}

async function testServerConnection() {
  const inputUrl = document.getElementById("server-url-input").value.trim().replace(/\/+$/, "");
  const statusEl = document.getElementById("server-health-status");
  statusEl.innerHTML = `<span style="color: var(--text-muted); font-size: 12px;">Testing connection to ${inputUrl}...</span>`;

  try {
    const res = await fetch(`${inputUrl}/health`, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      statusEl.innerHTML = `<span style="color: #10B981; font-weight: 700; font-size: 12px;">✓ Connected: ${data.platform || 'VASTRENIX'} (${data.status || 'OK'})</span>`;
      if (window.VastrenixNative && typeof window.VastrenixNative.showToast === "function") {
        window.VastrenixNative.showToast("Connected to VASTRENIX Server");
      }
    } else {
      statusEl.innerHTML = `<span style="color: #EF4444; font-weight: 700; font-size: 12px;">✗ Server responded with HTTP status ${res.status}</span>`;
    }
  } catch (err) {
    statusEl.innerHTML = `<span style="color: #EF4444; font-weight: 700; font-size: 12px;">✗ Connection failed: ${err.message}. Ensure backend is running.</span>`;
  }
}

function saveServerSettings() {
  const inputUrl = document.getElementById("server-url-input").value.trim().replace(/\/+$/, "");
  if (!inputUrl) {
    localStorage.removeItem("vastrenix_server_url");
  } else {
    localStorage.setItem("vastrenix_server_url", inputUrl);
  }

  if (window.VastrenixNative && typeof window.VastrenixNative.setServerUrl === "function") {
    window.VastrenixNative.setServerUrl(inputUrl);
    window.VastrenixNative.showToast("Server URL saved: " + (inputUrl || "Default"));
  }

  closeServerSettingsModal();
  loadPublicStores();
  renderApp();
}

// Durable Offline Queue Management
function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem("vastrenix_offline_queue") || "[]");
  } catch (e) {
    return [];
  }
}

function saveOfflineQueue(queue) {
  localStorage.setItem("vastrenix_offline_queue", JSON.stringify(queue));
  updateOfflineIndicator();
}

function showToast(message, duration = 4000) {
  const existing = document.getElementById("vastrenix-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "vastrenix-toast";
  toast.className = "toast-notification";
  toast.innerHTML = `<span>✨</span><span>${message}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      toast.style.opacity = "0";
      toast.style.transform = "translate(-50%, 20px)";
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
}

function openLanguageModal() {
  const picker = document.getElementById("modal-language-picker");
  if (picker) {
    picker.querySelectorAll(".lang-option-card").forEach(card => {
      const lang = card.getAttribute("data-lang");
      card.classList.toggle("selected", lang === (state.lang || "en"));
    });
    picker.classList.add("active");
  } else {
    cycleLanguage();
  }
}

function selectLanguage(lang) {
  state.lang = lang;
  localStorage.setItem("vastrenix_lang", lang);
  closeModal("modal-language-picker");
  showToast(lang === 'hi' ? 'भाषा हिन्दी सक्रिय है' : lang === 'gu' ? 'ગુજરાતી ભાષા સેટ થઈ' : 'Language set to English');
  renderApp();
}

function cycleLanguage() {
  const modes = ["en", "hi", "gu"];
  const currentIdx = modes.indexOf(state.lang || "en");
  const nextIdx = (currentIdx + 1) % modes.length;
  selectLanguage(modes[nextIdx]);
}

function showStoreInfoToast() {
  const name = state.storeName || (state.business && state.business.name) || "VASTRENIX Flagship";
  const user = state.user ? `${state.user.full_name} (${state.isStaff ? state.business.role : 'Owner'})` : "";
  if (window.VastrenixNative && typeof window.VastrenixNative.showToast === "function") {
    window.VastrenixNative.showToast(`${name} • ${user}`);
  } else {
    alert(`Store: ${name}\nLogged in: ${user}`);
  }
}

function updateOfflineIndicator() {
  const queue = getOfflineQueue();
  const isOnline = navigator.onLine;

  // 1. Mobile Auto-Hiding Row 2 Sync Banner
  const syncRow = document.getElementById("sync-banner-row");
  const syncText = document.getElementById("sync-banner-text");
  if (syncRow && syncText) {
    if (!isOnline) {
      syncRow.style.display = "flex";
      syncRow.className = "sync-banner-row offline-pending";
      syncText.textContent = `Offline • ${queue.length} Pending Sync`;
    } else if (queue.length > 0) {
      syncRow.style.display = "flex";
      syncRow.className = "sync-banner-row";
      syncText.textContent = isDrainingQueue ? `Syncing (${queue.length} queued)...` : `${queue.length} operations queued for cloud sync`;
    } else {
      // Auto-hide when queue is empty and network is online — NEVER reserve space!
      syncRow.style.display = "none";
    }
  }

  // 2. Desktop Status Pill (if present)
  const pill = document.getElementById("offline-status-pill");
  const text = document.getElementById("offline-status-text");
  if (pill && text) {
    if (!isOnline) {
      pill.style.background = "#FEF2F2";
      pill.style.color = "#991B1B";
      pill.style.borderColor = "#FECACA";
      const dot = pill.querySelector(".status-dot");
      if (dot) dot.style.background = "#EF4444";
      text.textContent = `Offline • ${queue.length} Pending`;
      pill.style.display = "inline-flex";
    } else if (queue.length > 0) {
      pill.style.background = "#FFFBEB";
      pill.style.color = "#92400E";
      pill.style.borderColor = "#FDE68A";
      const dot = pill.querySelector(".status-dot");
      if (dot) dot.style.background = "#F59E0B";
      text.textContent = `Syncing (${queue.length})...`;
      pill.style.display = "inline-flex";
    } else {
      pill.style.display = "none"; // Clean auto-hide on desktop as well
    }
  }
}

let isDrainingQueue = false;
async function drainOfflineQueue() {
  if (isDrainingQueue) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) {
    updateOfflineIndicator();
    return;
  }
  isDrainingQueue = true;
  updateOfflineIndicator();

  const remaining = [];
  for (const item of queue) {
    try {
      const headers = item.headers || {};
      if (item.idempotency_key) {
        headers["X-Idempotency-Key"] = item.idempotency_key;
      }
      const res = await fetch(`${getApiBase()}${item.endpoint}`, {
        method: item.method,
        headers,
        body: item.body
      });
      if (!res.ok && res.status >= 500) {
        remaining.push(item);
      }
    } catch (err) {
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  isDrainingQueue = false;
  updateOfflineIndicator();
  if (queue.length > remaining.length) {
    console.log(`[VASTRENIX] Successfully synced ${queue.length - remaining.length} offline operations.`);
  }
}

window.addEventListener("online", () => {
  console.log("[VASTRENIX] Network reconnected. Draining offline queue...");
  drainOfflineQueue();
});
window.addEventListener("offline", () => {
  updateOfflineIndicator();
});

// Render Cold-Start Management (Part 2 - Non-blocking floating banner)
let coldStartInterval = null;
let coldStartElapsedSeconds = 0;

function showColdStartOverlay() {
  const banner = document.getElementById("render-coldstart-overlay");
  if (banner) {
    banner.style.display = "block";
    requestAnimationFrame(() => {
      banner.classList.add("visible");
    });

    const title = document.getElementById("coldstart-title");
    const sub = document.getElementById("coldstart-subline");
    const action = document.getElementById("coldstart-timeout-action");
    const dot = document.getElementById("cloud-wake-dot");

    if (dot) {
      dot.style.background = "#2DD4BF";
      dot.style.boxShadow = "0 0 8px #2DD4BF";
    }
    if (action) action.style.display = "none";
    if (sub) sub.innerText = "Offline operations & billing active";

    coldStartElapsedSeconds = 0;
    if (title) title.innerText = "Connecting to cloud server (1s)...";
    if (coldStartInterval) clearInterval(coldStartInterval);
    coldStartInterval = setInterval(() => {
      coldStartElapsedSeconds++;
      if (title) {
        title.innerText = `Connecting to cloud server (${coldStartElapsedSeconds}s)...`;
      }
    }, 1000);

    // Set 45s fallback action
    if (coldStartTimeoutTimer) clearTimeout(coldStartTimeoutTimer);
    coldStartTimeoutTimer = setTimeout(() => {
      if (banner.classList.contains("visible") || banner.style.display !== "none") {
        if (title) title.innerText = "Server waking up slowly...";
        if (sub) sub.innerText = "Tap retry or continue using offline mode";
        if (action) action.style.display = "block";
      }
    }, 45000);
  }
}

function hideColdStartOverlay(isSuccess = true) {
  if (coldStartTimer) {
    clearTimeout(coldStartTimer);
    coldStartTimer = null;
  }
  if (coldStartTimeoutTimer) {
    clearTimeout(coldStartTimeoutTimer);
    coldStartTimeoutTimer = null;
  }
  if (coldStartInterval) {
    clearInterval(coldStartInterval);
    coldStartInterval = null;
  }
  document.body.style.overflow = "";

  const banner = document.getElementById("render-coldstart-overlay");
  if (banner && (banner.classList.contains("visible") || banner.style.display !== "none")) {
    const title = document.getElementById("coldstart-title");
    const dot = document.getElementById("cloud-wake-dot");
    if (isSuccess && title) {
      title.innerText = "✓ Cloud Server Connected";
      if (dot) {
        dot.style.background = "#10B981";
        dot.style.boxShadow = "0 0 10px #10B981";
      }
    }
    setTimeout(() => {
      banner.classList.remove("visible");
      setTimeout(() => {
        banner.style.display = "none";
      }, 350);
    }, isSuccess ? 1200 : 200);
  }
}

function retryColdStartRequest() {
  hideColdStartOverlay(false);
  renderApp();
}

// API Helper with Strict Error Handling, Cold-Start Grace & Offline Resilience
async function api(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }
  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }
  if (state.business) {
    headers["X-Business-ID"] = state.business.id;
  }

  const method = (options.method || "GET").toUpperCase();
  const url = `${getApiBase()}${endpoint}`;
  console.log(`[VASTRENIX-HTTP] ${method} ${url}`);

  const controller = new AbortController();
  // Allow up to 65s for Render free-tier instance wake-up
  const timeoutMs = options.timeout || 65000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Show reassuring branded wake screen only on cold start if server is not yet warm
  if (!options.silent && !isServerWarm && !isAppInBackground) {
    coldStartTimer = setTimeout(() => {
      if (!isServerWarm && !isAppInBackground) {
        showColdStartOverlay();
      }
    }, 3000);
  }

  let resStatus = 0;
  let resData = null;

  try {
    try {
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      resStatus = res.status;
      resData = await res.json().catch(() => ({}));
    } catch (fetchErr) {
      // If standard browser fetch failed in Android WebView (e.g. file:// CORS restriction), try Native Android Bridge
      if (window.VastrenixNative && typeof window.VastrenixNative.fetchNative === "function") {
        try {
          console.log("[VASTRENIX] Attempting native Android HTTP bridge for: " + url);
          const bodyStr = typeof options.body === "string" ? options.body : "";
          const nativeRaw = window.VastrenixNative.fetchNative(url, method, JSON.stringify(headers), bodyStr);
          if (nativeRaw) {
            const parsed = JSON.parse(nativeRaw);
            if (parsed && parsed.status > 0) {
              resStatus = parsed.status;
              resData = parsed.body ? JSON.parse(parsed.body) : {};
              console.log(`[VASTRENIX-NATIVE-OK] ${url} returned HTTP ${resStatus}`);
            }
          }
        } catch (nativeErr) {
          console.warn("[VASTRENIX] Native bridge exception: " + nativeErr.message);
        }
      }

      // If neither standard fetch nor native bridge succeeded, rethrow fetchErr
      if (!resStatus) {
        throw fetchErr;
      }
    }

    clearTimeout(timeoutId);
    hideColdStartOverlay(true);
    isServerWarm = true;

    if (resStatus === 401) {
      logout();
      showToast("Session expired or invalid credentials. Please sign in again.");
      throw new Error("Unauthorized (401)");
    }

    if (resStatus === 403) {
      const msg = (resData && resData.detail) || "Account pending approval or insufficient role.";
      showToast(msg);
      throw new Error(msg);
    }

    if (resStatus >= 500) {
      const msg = (resData && resData.detail) || `Server is temporarily updating (${resStatus}). Please try again shortly.`;
      showToast(msg);
      throw new Error(msg);
    }

    if (resStatus === 422) {
      const msg = resData && resData.detail ? (Array.isArray(resData.detail) ? resData.detail.map(d => d.msg || JSON.stringify(d)).join(", ") : JSON.stringify(resData.detail)) : "Validation error";
      showToast("Input validation error: " + msg);
      throw new Error(msg);
    }

    if (resStatus < 200 || resStatus >= 300) {
      const msg = (resData && resData.detail) || `Server error (HTTP ${resStatus})`;
      showToast(msg);
      throw new Error(msg);
    }

    // Success - if queue has items and we are online, trigger background drain
    if (getOfflineQueue().length > 0) {
      setTimeout(drainOfflineQueue, 100);
    }

    return resData;
  } catch (err) {
    clearTimeout(timeoutId);
    hideColdStartOverlay(false);
    console.error(`[VASTRENIX-HTTP-ERROR] ${url} Failed: ${err.message || err}`);

    if (err.name === "AbortError") {
      showToast("Cloud Connection Timeout: Server took >65s to respond. Please tap Retry.");
      throw new Error(`Timeout on ${endpoint}`);
    }

    // If it was an intentional HTTP error thrown above, re-throw it
    if (err.message && (err.message.includes("401") || err.message.includes("pending approval") || err.message.includes("Validation error") || err.message.includes("Server is temporarily updating"))) {
      throw err;
    }

    // Network connection failed (TypeError: Failed to fetch / offline)
    if (method === "GET") {
      console.warn("VASTRENIX: Server unreachable. Providing local data preview for:", endpoint);
      showToast(`Notice: Server unreachable (${err.message || 'offline'}). Showing cached data.`);
      return handleOfflineMock(endpoint, options);
    }

    // Mutating request offline queueing
    if (typeof options.body === "string") {
      const queue = getOfflineQueue();
      const idempotency_key = headers["X-Idempotency-Key"] || `off_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      queue.push({
        endpoint,
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": headers["Authorization"],
          "X-Business-ID": headers["X-Business-ID"]
        },
        body: options.body,
        idempotency_key,
        timestamp: new Date().toISOString()
      });
      saveOfflineQueue(queue);
      showToast("Network unreachable: Operation queued for automatic cloud sync.");
      return handleOfflineMock(endpoint, { ...options, headers: { ...headers, "X-Idempotency-Key": idempotency_key } });
    }

    showToast(`Network Error: Unable to reach VASTRENIX server at ${getBaseServerUrl()}.`);
    throw err;
  }
}

// =========================================================================
// UI ENERGY & POLISH HELPERS (UI-FEEL.md)
// =========================================================================

// 1. Smooth Number Count-Up Tween
function animateNumber(element, start, end, duration = 650, prefix = "", suffix = "", decimals = 0) {
  if (!element) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = `${prefix}${decimals > 0 ? end.toLocaleString('en-IN', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}) : Math.round(end).toLocaleString('en-IN')}${suffix}`;
    return;
  }
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // easeOutExpo
    const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const current = start + (end - start) * ease;
    if (decimals > 0) {
      element.textContent = `${prefix}${current.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
    } else {
      element.textContent = `${prefix}${Math.round(current).toLocaleString('en-IN')}${suffix}`;
    }
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

// 2. Tactile Sound & Haptics Trigger
function triggerHaptic(type = "tick") {
  if (navigator.vibrate) {
    if (type === "tick") navigator.vibrate(12);
    else if (type === "success") navigator.vibrate([15, 35, 15]);
    else if (type === "warning") navigator.vibrate(35);
  }
  if (window.VastrenixNative && typeof window.VastrenixNative.vibrate === "function") {
    window.VastrenixNative.vibrate(type === "success" ? 40 : 15);
  }
}

// 3. Non-blocking Undo Snackbar
let undoSnackbarTimer = null;
function showUndoSnackbar(message, onUndo) {
  const existing = document.getElementById("vastrenix-undo-snackbar");
  if (existing) existing.remove();
  if (undoSnackbarTimer) clearTimeout(undoSnackbarTimer);

  const bar = document.createElement("div");
  bar.id = "vastrenix-undo-snackbar";
  bar.className = "undo-snackbar";
  bar.innerHTML = `
    <span>${message}</span>
    <button id="undo-snackbar-action-btn">UNDO</button>
  `;
  document.body.appendChild(bar);

  document.getElementById("undo-snackbar-action-btn").addEventListener("click", () => {
    bar.remove();
    if (typeof onUndo === "function") onUndo();
  });

  undoSnackbarTimer = setTimeout(() => {
    if (bar && bar.parentNode) bar.remove();
  }, 4000);
}

// 4. Debounced Input Filter Helper
function debounce(func, wait = 250) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 5. Skeleton Shimmer Placeholders
function getSkeletonCardsHTML() {
  return `
    <div class="grid-cards" style="margin-bottom: 24px;">
      <div class="stat-card skeleton skeleton-card"></div>
      <div class="stat-card skeleton skeleton-card"></div>
      <div class="stat-card skeleton skeleton-card"></div>
      <div class="stat-card skeleton skeleton-card"></div>
    </div>
  `;
}

function getSkeletonTableRowsHTML(cols = 6, count = 4) {
  return Array.from({ length: count }).map(() => `
    <tr><td colspan="${cols}" style="padding: 10px;"><div class="skeleton skeleton-row"></div></td></tr>
  `).join('');
}

// Fetch public stores list
async function loadPublicStores() {
  try {
    const data = await api("/auth/public-stores");
    if (data && Array.isArray(data)) {
      state.stores = data;
    } else {
      state.stores = offlineDB.stores;
    }
  } catch (err) {
    state.stores = offlineDB.stores;
  }
}

// Authentication
async function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    if (data && data.access_token) {
      state.token = data.access_token;
      state.user = data.user;
      state.business = data.active_business || data.businesses[0];
      state.storeName = data.store_name || state.business.store_name || state.business.name;
      state.isStaff = data.is_staff || false;

      localStorage.setItem("vastrenix_token", state.token);
      localStorage.setItem("vastrenix_user", JSON.stringify(state.user));
      localStorage.setItem("vastrenix_business", JSON.stringify(state.business));
      localStorage.setItem("vastrenix_store_name", state.storeName);
      localStorage.setItem("vastrenix_is_staff", state.isStaff ? "true" : "false");

      renderApp();
    }
  } catch (err) {
    // Alert already shown by api()
  }
}

async function handleOwnerSignUp(e) {
  e.preventDefault();
  const name = document.getElementById("reg-owner-name").value;
  const email = document.getElementById("reg-owner-email").value;
  const password = document.getElementById("reg-owner-password").value;
  const phone = document.getElementById("reg-owner-phone").value;
  const bizName = document.getElementById("reg-biz-name").value;
  const city = document.getElementById("reg-biz-city").value;
  const gstin = document.getElementById("reg-biz-gstin").value;

  try {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        full_name: name,
        email,
        password,
        phone,
        business_name: bizName,
        city,
        gstin
      })
    });
    if (data && data.access_token) {
      alert(`Welcome to Vastrenix, ${name}! Your store '${bizName}' has been successfully created.`);
      state.token = data.access_token;
      state.user = data.user;
      state.business = data.business;
      state.storeName = bizName;
      state.isStaff = false;

      localStorage.setItem("vastrenix_token", state.token);
      localStorage.setItem("vastrenix_user", JSON.stringify(state.user));
      localStorage.setItem("vastrenix_business", JSON.stringify(state.business));
      localStorage.setItem("vastrenix_store_name", state.storeName);
      localStorage.setItem("vastrenix_is_staff", "false");

      renderApp();
    }
  } catch (err) {}
}

async function handleStaffSignUp(e) {
  e.preventDefault();
  const storeId = parseInt(document.getElementById("reg-staff-store").value, 10);
  const name = document.getElementById("reg-staff-name").value;
  const email = document.getElementById("reg-staff-email").value;
  const password = document.getElementById("reg-staff-password").value;
  const phone = document.getElementById("reg-staff-phone").value;
  const role = document.getElementById("reg-staff-role").value;

  try {
    const data = await api("/auth/staff-signup", {
      method: "POST",
      body: JSON.stringify({
        business_id: storeId,
        full_name: name,
        email,
        password,
        phone,
        role
      })
    });

    alert(data.message);
    setAuthMode("signin");
  } catch (err) {}
}

function setAuthMode(mode) {
  state.authMode = mode;
  renderApp();
}

function loginDemo(email, password) {
  document.getElementById("login-email").value = email;
  document.getElementById("login-password").value = password;
  document.getElementById("signin-form").dispatchEvent(new Event("submit"));
}

function logout() {
  state.token = null;
  state.user = null;
  state.business = null;
  state.storeName = null;
  state.isStaff = false;
  localStorage.clear();
  renderApp();
}

// Render Dashboard with Zero-Stuck Loading & Independent Section Fault-Tolerance (Part 1)
async function renderDashboard() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  const t = (k, fb) => i18n[state.lang]?.[k] || i18n.en[k] || fb || k;
  const bizName = state.storeName || (state.business && state.business.name) || "VASTRENIX Store";

  // 1. Render immediate visual shell so Home NEVER sits in a blank or infinite skeleton state
  container.innerHTML = `
    <!-- Top Greeting Banner -->
    <div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
      <div>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
          <h2 style="font-size: 22px; font-weight: 800; color: var(--navy);">${bizName}</h2>
          ${state.isStaff ? `<span class="badge badge-success" style="font-size: 11px;">Staff View</span>` : `<span class="badge badge-neutral" style="font-size: 11px;">Store Admin</span>`}
        </div>
        <p style="color: var(--text-muted); font-size: 13.5px;">${t("welcome", "Welcome to your clothing operations")} • <b>Main Branch</b></p>
      </div>

      ${state.isStaff ? `
        <div style="background: var(--teal-light); border: 1px solid rgba(33,140,130,0.2); border-radius: var(--radius-sm); padding: 8px 16px;">
          <div style="font-size: 11px; text-transform: uppercase; color: var(--teal); font-weight: 700;">Assigned Store</div>
          <div style="font-size: 14px; font-weight: 800; color: var(--navy);">${bizName}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">Logged in as: <b>${state.user ? state.user.full_name : 'Staff'} (${state.business ? state.business.role : 'STAFF'})</b></div>
        </div>
      ` : ''}
    </div>

    <!-- Independent Pending Staff Approvals Container (Owner/Admin) -->
    <div id="dashboard-pending-staff-container"></div>

    <!-- Month-End Dues Banner Container -->
    <div id="dashboard-dues-banner-container"></div>

    <!-- Metrics Grid Cards (Load and fail independently) -->
    <div class="grid-cards" style="margin-bottom: 24px;">
      <div class="stat-card stagger-1" id="dash-card-sales">
        <div class="stat-label">${t("today_sales", "Today's Gross Sales")}</div>
        <div class="stat-value" id="dash-val-sales" style="color: var(--teal);">₹0.00</div>
        <div class="stat-meta"><span id="dash-val-orders">0</span> ${t("tx_completed", "transactions completed")}</div>
      </div>
      <div class="stat-card stagger-2" id="dash-card-lowstock">
        <div class="stat-label">${t("low_stock_items", "Low Stock Items")}</div>
        <div class="stat-value" id="dash-val-lowstock" style="color: var(--teal);">● 0</div>
        <div class="stat-meta" id="dash-meta-lowstock">${t("all_healthy", "All inventory healthy")}</div>
      </div>
      <div class="stat-card stagger-3" id="dash-card-dealers">
        <div class="stat-label">${t("pending_dealer_orders", "Pending Dealer Orders")}</div>
        <div class="stat-value" id="dash-val-dealers" style="color: var(--amber);">0</div>
        <div class="stat-meta">${t("b2b_awaiting", "B2B orders awaiting action")}</div>
      </div>
      ${(!state.isStaff || (state.business && state.business.role !== 'CASHIER')) ? `
      <div class="stat-card stagger-4" id="dash-card-revenue">
        <div class="stat-label">${t("total_revenue", "Total Net Revenue")}</div>
        <div class="stat-value" id="dash-val-revenue" style="color: var(--navy);">₹0.00</div>
        <div class="stat-meta">${t("posted_invoices", "Authoritative posted invoices")}</div>
      </div>
      ` : ''}
    </div>

    <!-- Quick Actions Banner (Always clickable immediately, never blocked) -->
    <div style="display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;">
      <button class="btn btn-primary" onclick="switchTab('pos')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        ${t("new_pos_sale", "+ New POS Sale")}
      </button>
      <button class="btn btn-secondary" onclick="openAddProductModal()">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        ${t("add_garment_prod", "+ Add Garment Product")}
      </button>
      <button class="btn btn-secondary" onclick="switchTab('dealers')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        ${t("dealer_orders_btn", "Dealer Orders")}
      </button>
    </div>

    <!-- Low Stock Alert Panel -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">${t("urgent_low_stock", "Urgent Low Stock Warnings")}</div>
        <button class="btn btn-sm btn-secondary" onclick="switchTab('inventory')">${t("view_all_inventory", "View All Inventory")}</button>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t("garment_product", "Garment Product")}</th>
              <th>${t("sku", "SKU")}</th>
              <th>${t("size_color", "Size / Color")}</th>
              <th>${t("available_qty", "Available Qty")}</th>
              <th>${t("threshold", "Threshold")}</th>
              <th>${t("action", "Action")}</th>
            </tr>
          </thead>
          <tbody id="dash-lowstock-tbody">
            <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">${t("all_healthy", "All inventory healthy")}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // 2. Fetch Dashboard Metrics with a strict 8s timeout to guarantee ZERO infinite loading
  try {
    const metrics = await api("/reports/dashboard", { timeout: 8000 });
    if (metrics) {
      // Save last successful metrics in cache for instant resume
      state.cachedDashboard = metrics;

      const salesEl = document.getElementById("dash-val-sales");
      if (salesEl) animateNumber(salesEl, 0, Number(metrics.today_sales || 0), 600, "₹", "", 2);

      const ordersEl = document.getElementById("dash-val-orders");
      if (ordersEl) animateNumber(ordersEl, 0, Number(metrics.today_orders_count || 0), 400);

      const dealersEl = document.getElementById("dash-val-dealers");
      if (dealersEl) animateNumber(dealersEl, 0, Number(metrics.pending_dealer_orders || 0), 400);

      const revEl = document.getElementById("dash-val-revenue");
      if (revEl) animateNumber(revEl, 0, Number(metrics.total_revenue || 0), 700, "₹", "", 2);

      const lowEl = document.getElementById("dash-val-lowstock");
      const lowMeta = document.getElementById("dash-meta-lowstock");
      const lowCount = Number(metrics.low_stock_count || 0);
      if (lowEl) {
        lowEl.innerHTML = `${lowCount > 0 ? '▲ ' : '● '}${lowCount}`;
        lowEl.style.color = lowCount > 0 ? 'var(--amber)' : 'var(--teal)';
      }
      if (lowMeta) {
        lowMeta.textContent = lowCount > 0 ? t("sizes_reorder", "Sizes requiring reorder") : t("all_healthy", "All inventory healthy");
      }

      // Populate low stock table rows
      const tbody = document.getElementById("dash-lowstock-tbody");
      if (tbody && metrics.top_low_stock && metrics.top_low_stock.length > 0) {
        tbody.innerHTML = metrics.top_low_stock.map(item => `
          <tr>
            <td><b>${item.name}</b></td>
            <td><code>${item.sku}</code></td>
            <td>${item.size} / ${item.color}</td>
            <td><b style="color: ${item.available <= 0 ? 'var(--coral)' : 'var(--amber)'};">${item.available} units</b></td>
            <td>${item.threshold}</td>
            <td><button class="btn btn-sm btn-secondary" onclick="switchTab('inventory')">${t("manage_stock", "Manage Stock")}</button></td>
          </tr>
        `).join('');
      }

      // Populate Month-end dues banner if any
      const duesContainer = document.getElementById("dashboard-dues-banner-container");
      const duesTotal = Number(metrics.total_credit_due || 0);
      if (duesContainer && duesTotal > 0) {
        duesContainer.innerHTML = `
          <div style="background: #FFF5F5; border: 1px solid #FEB2B2; border-radius: var(--radius-md); padding: 14px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 24px;">📅</span>
              <div>
                <div style="font-size: 14px; font-weight: 800; color: #9B2C2C;">${t("month_end_banner_title", "Month-End Credit Payment Reminders Active")}</div>
                <div style="font-size: 12.5px; color: #C53030;">₹${duesTotal.toFixed(2)} ${t("month_end_banner_desc", "total outstanding Store Credit due for collection before month-end.")}</div>
              </div>
            </div>
            <button class="btn btn-sm btn-navy" onclick="switchTab('invoices')">${t("review_dues_btn", "Review Dues in Invoices")}</button>
          </div>
        `;
      }
    }
  } catch (err) {
    console.warn("[DASHBOARD] Metrics fetch failed, showing fallback state:", err.message);
    const duesContainer = document.getElementById("dashboard-dues-banner-container");
    if (duesContainer) {
      duesContainer.innerHTML = `
        <div style="background: #FFF9ED; border: 1px solid var(--amber); border-radius: var(--radius-sm); padding: 10px 16px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #8A5A1B;">
          <span>⚠️ ${t("metrics_load_failed", "Live dashboard metrics could not be loaded.")}</span>
          <button class="btn btn-sm btn-primary" onclick="renderDashboard()" style="padding: 4px 10px; font-size: 11.5px;">${t("retry_dashboard_btn", "⟳ Retry Dashboard")}</button>
        </div>
      `;
    }
  }

  // 3. Independent Background Fetch for Pending Staff (Owner/Admin only)
  if (!state.isStaff) {
    api("/auth/pending-staff", { silent: true, timeout: 4000 }).then(pendingStaff => {
      const staffContainer = document.getElementById("dashboard-pending-staff-container");
      if (staffContainer && pendingStaff && pendingStaff.length > 0) {
        staffContainer.innerHTML = `
          <div style="background: #FEF8ED; border: 1px solid var(--amber); border-radius: var(--radius-md); padding: 18px 24px; margin-bottom: 24px; box-shadow: var(--shadow-sm);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="background: var(--amber); color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">!</span>
                <h3 style="font-size: 15px; font-weight: 700; color: #8A5A1B; margin: 0;">${t("pending_staff_title", "Pending Staff Signups Requiring Approval")} (${pendingStaff.length})</h3>
              </div>
            </div>
            <p style="font-size: 13px; color: #735022; margin-bottom: 14px;">The following employees have signed up under your store and require authorization:</p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${pendingStaff.map(s => `
                <div style="background: white; border: 1px solid #EADBCA; border-radius: var(--radius-sm); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-left: 4px solid var(--amber);">
                  <div>
                    <div style="font-weight: 700; font-size: 13.5px; color: var(--navy);">${s.full_name}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${s.email} • Role: <span class="badge badge-neutral">${s.role}</span> • Phone: ${s.phone || 'N/A'}</div>
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <button class="btn btn-sm btn-primary" onclick="approveStaffMember(${s.membership_id}, '${s.full_name.replace(/'/g, "\\'")}')">${t("approve_staff_btn", "✓ Approve Staff")}</button>
                    <button class="btn btn-sm btn-secondary" onclick="rejectStaffMember(${s.membership_id})">${t("reject_staff_btn", "✕ Reject")}</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    }).catch(() => {});
  }
  return;
}


async function approveStaffMember(membershipId, name) {
  if (!confirm(`Approve staff member '${name}' to access store '${state.storeName || state.business.name}'?`)) return;
  await api(`/auth/staff/${membershipId}/approve`, { method: "POST" });
  alert(`Staff member '${name}' is approved! They can now log in to the store.`);
  renderDashboard();
}

async function rejectStaffMember(membershipId) {
  if (!confirm("Are you sure you want to reject and remove this staff signup request?")) return;
  await api(`/auth/staff/${membershipId}/reject`, { method: "POST" });
  renderDashboard();
}

// Render Inventory
let allInventoryItems = [];

const debouncedFilterInventory = debounce((q) => {
  const tbody = document.getElementById("inventory-table-body");
  if (!tbody) return;
  const query = (q || "").trim().toLowerCase();
  const filtered = query
    ? allInventoryItems.filter(it => 
        (it.product_name && it.product_name.toLowerCase().includes(query)) ||
        (it.sku && it.sku.toLowerCase().includes(query)) ||
        (it.fabric && it.fabric.toLowerCase().includes(query)) ||
        (it.color && it.color.toLowerCase().includes(query)) ||
        (it.size && it.size.toLowerCase().includes(query))
      )
    : allInventoryItems;
  tbody.innerHTML = renderInventoryRows(filtered);
}, 250);

function filterInventoryCatalog(q) {
  debouncedFilterInventory(q);
}

function renderInventoryRows(list) {
  if (!list || list.length === 0) {
    return `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 32px;">No matching garments found.</td></tr>`;
  }
  return list.map(it => `
    <tr>
      <td><b>${it.product_name}</b></td>
      <td>${it.fabric || 'Textile'}</td>
      <td><code>${it.sku}</code></td>
      <td><span class="badge badge-neutral">${it.size}</span></td>
      <td>${it.color}</td>
      <td>${it.rack_location}</td>
      <td><b>${it.on_hand}</b></td>
      <td style="color: var(--amber);">${it.reserved}</td>
      <td><b style="color: ${it.available <= 0 ? 'var(--coral)' : 'var(--teal)'}; font-size: 14px;">${it.available}</b></td>
      <td>
        ${it.is_out_of_stock ? '<span class="badge badge-danger">✕ Out of Stock</span>' : (it.is_low_stock ? '<span class="badge badge-warning">▲ Low Stock</span>' : '<span class="badge badge-success">● Healthy</span>')}
      </td>
      <td>
        ${(!state.isStaff || (state.business && (state.business.role === 'INVENTORY_MGR' || state.business.role === 'ADMIN' || state.business.role === 'OWNER'))) ? `
          <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
            <button class="btn btn-sm btn-primary" style="font-size: 11px; padding: 4px 8px; font-weight: 700;" onclick="openPurchaseOrderModal(${it.variant_id}, '${it.product_name.replace(/'/g, "\\'")}', '${it.sku}')">+ Order More</button>
            <button class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 4px 8px; font-weight: 700;" onclick="openReceiveGoodsModal(${it.variant_id}, '${it.product_name.replace(/'/g, "\\'")}', '${it.sku}')">Receive Stock</button>
            <button class="btn btn-sm" style="background: none; border: 1px dashed var(--border); font-size: 10px; color: var(--text-muted); padding: 3px 6px;" onclick="promptAdjustStock(${it.variant_id})" title="Manual Audit / Breakage Correction">Correction</button>
          </div>
        ` : `
          <span style="font-size: 11.5px; color: var(--text-muted); font-weight: 600;">View Only</span>
        `}
      </td>
    </tr>
  `).join('');
}

async function renderInventory() {
  const container = document.getElementById("tab-content");
  container.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div class="skeleton skeleton-text" style="width: 260px; height: 24px; margin-bottom: 10px;"></div>
      <div class="skeleton skeleton-text" style="width: 340px; height: 14px;"></div>
    </div>
    <div class="panel">
      <div class="table-responsive">
        <table class="data-table"><tbody>${getSkeletonTableRowsHTML(11, 5)}</tbody></table>
      </div>
    </div>
  `;
  const items = await api("/inventory/levels");
  if (!items) return;
  allInventoryItems = items;

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">${t("inventory_title", "Garment Inventory & Warehouse Stock")}</h2>
        <p style="color: var(--text-muted); font-size: 13px;">Store: <b>${state.storeName || state.business.name}</b> • Authoritative size/color matrix.</p>
      </div>
      ${(!state.isStaff || (state.business && (state.business.role === 'INVENTORY_MGR' || state.business.role === 'ADMIN' || state.business.role === 'OWNER'))) ? `
        <button class="btn btn-primary" onclick="openAddProductModal()">+ Add New Garment</button>
      ` : ''}
    </div>

    <div class="panel">
      ${items.length === 0 ? `
        <div style="text-align: center; padding: 48px 16px;">
          <div style="font-size: 38px; margin-bottom: 10px;">👗</div>
          <h3 style="font-size: 16px; font-weight: 700; color: var(--navy); margin-bottom: 6px;">${t("no_inventory_title", "Garment Catalog is Empty")}</h3>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 18px;">
            Add your first garment product with size/color variants to start tracking on-hand stock and billing on the POS.
          </p>
          ${(!state.isStaff || (state.business && (state.business.role === 'INVENTORY_MGR' || state.business.role === 'ADMIN' || state.business.role === 'OWNER'))) ? `
            <button class="btn btn-primary" onclick="openAddProductModal()">+ Add New Garment</button>
          ` : ''}
        </div>
      ` : `
        <div style="padding: 14px 18px 0 18px;">
          <div style="position: relative; max-width: 440px;">
            <input type="text" id="inventory-search-input" class="form-input" placeholder="${t('search_garment_placeholder', 'Search by garment name, SKU, or fabric...')}" oninput="filterInventoryCatalog(this.value)" style="padding-left: 36px; font-size: 13px;">
            <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; opacity: 0.5;">🔍</span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>${t("product_name_col", "Product Name")}</th>
                <th>${t("fabric_col", "Fabric")}</th>
                <th>${t("sku", "SKU")}</th>
                <th>${t("size_col", "Size")}</th>
                <th>${t("color_col", "Color")}</th>
                <th>${t("rack_location_col", "Rack Location")}</th>
                <th>${t("on_hand_col", "On-Hand")}</th>
                <th>${t("reserved_col", "Reserved")}</th>
                <th>${t("available_col", "Available")}</th>
                <th>${t("status_col", "Status")}</th>
                <th>${t("stock_ops_col", "Stock Operations")}</th>
              </tr>
            </thead>
            <tbody id="inventory-table-body">
              ${renderInventoryRows(items)}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

async function promptAdjustStock(variantId) {
  const qtyStr = prompt("Enter quantity adjustment (e.g. +5 for audit found, -2 for damage):", "+1");
  if (!qtyStr) return;
  const qty = parseInt(qtyStr, 10);
  if (isNaN(qty)) return alert("Invalid quantity");
  const reason = prompt("Enter reason for adjustment (e.g. Physical cycle count):", "Cycle count verified");
  if (!reason) return;

  await api("/inventory/adjust", {
    method: "POST",
    body: JSON.stringify({
      variant_id: variantId,
      quantity_change: qty,
      adjustment_type: qty < 0 ? "DAMAGE" : "CYCLE_COUNT",
      reason: reason
    })
  });
  renderInventory();
}

// Render POS Billing Terminal
async function renderPOS() {
  const container = document.getElementById("tab-content");
  container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--navy);"><div class="spinner"></div><div style="margin-top: 12px; font-weight: 600;">Connecting to counter terminal & cash register...</div></div>`;

  // 1. Shift check: if no open shift for this cashier, prompt for opening float
  const shiftRes = await api("/finance/shifts/current");
  const hasShift = shiftRes && shiftRes.has_active_shift;
  state.currentShift = hasShift ? shiftRes.shift : null;

  if (!hasShift) {
    container.innerHTML = `
      <div style="max-width: 540px; margin: 40px auto; background: #fff; border-radius: var(--radius-md); border: 1px solid var(--border); padding: 36px 30px; box-shadow: var(--shadow-md); text-align: center;">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: #E8F4F0; color: var(--teal); font-size: 30px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
          💼
        </div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--navy); margin-bottom: 8px;">${t("shift_req_title", "Cash Register Shift Required")}</h2>
        <p style="font-size: 13.5px; color: var(--text-muted); line-height: 1.5; margin-bottom: 24px;">
          ${t("shift_req_desc", "To begin processing retail sales with tamper-proof financial reconciliation, please count and enter the opening cash float in the drawer.")}
        </p>

        <form onsubmit="submitOpenShift(event)" style="text-align: left;">
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" style="font-weight: 700;">${t("open_float_label", "Opening Cash Float (₹)")}</label>
            <input type="number" step="0.01" id="shift-open-float" class="form-input" required value="2000.00" placeholder="e.g. 2000.00" style="font-size: 16px; font-weight: 700;">
            <small style="color: var(--text-muted); font-size: 11.5px; display: block; margin-top: 4px;">Initial physical currency & coins placed into the store till.</small>
          </div>
          <div class="form-group" style="margin-bottom: 22px;">
            <label class="form-label">Shift Notes / Register ID (Optional)</label>
            <input type="text" id="shift-open-notes" class="form-input" placeholder="e.g. Morning Counter Shift #1">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; padding: 13px; font-weight: 700; font-size: 14.5px;">
            ${t("open_shift_btn", "Open Shift & Unlock Counter")}
          </button>
        </form>
      </div>
    `;
    return;
  }

  const prods = await api("/products/");
  if (!prods) return;
  state.products = prods;

  const canDiscount = ["OWNER", "ADMIN", "BRANCH_MANAGER"].includes(state.business.role);

  container.innerHTML = `
    <!-- Counter Header & Shift Pill -->
    <div style="margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div style="font-size: 13.5px; color: var(--navy); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span>${t("store_counter", "Store Counter")}: <b>${state.storeName || state.business.name}</b></span>
        <span>•</span>
        <span>${t("cashier", "Cashier")}: <b>${state.user.full_name} (${state.business.role})</b></span>
      </div>

      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="background: #E8F4F0; border: 1px solid var(--teal-light); border-radius: 20px; padding: 4px 12px; font-size: 12px; color: var(--teal); font-weight: 700; display: flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--teal); display: inline-block;"></span>
          ${t("shift_active", "Shift Active")} #${state.currentShift.id} • ${t("float_label", "Float")}: ₹${Number(state.currentShift.opening_cash).toFixed(2)}
        </div>
        <button class="btn btn-sm btn-outline" style="border-color: var(--coral); color: var(--coral); font-weight: 700;" onclick="openCloseShiftModal()">
          ${t("close_shift", "Close Shift")}
        </button>
      </div>
    </div>

    <div class="pos-container">
      <!-- Left: Catalog & Size Selector -->
      <div class="pos-catalog">
        <div style="display: flex; gap: 10px; margin-bottom: 14px; align-items: center;">
          <div style="position: relative; flex: 1;">
            <input type="text" id="pos-search" class="form-input" placeholder="${t('scan_search_placeholder', 'Scan barcode or search name/fabric (F2)...')}" oninput="handlePOSSearchInput(this.value)" onkeydown="handlePOSSearchKeyDown(event)" style="padding-right: 40px;">
            <span style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 16px; opacity: 0.5;">🔍</span>
          </div>
          <button class="btn btn-secondary" onclick="openCustomItemModal()" title="Add ad-hoc garment or alteration">
            ${t("custom_item_btn", "+ Custom Item")}
          </button>
        </div>

        <div style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px;" id="pos-items-grid">
          ${renderPOSItems(state.products)}
        </div>
      </div>

      <!-- Right: POS Cart & Checkout (Billing-First Flow) -->
      <div class="pos-cart">
        <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: #fff;">
          <h3 style="font-size: 15px; font-weight: 800; color: var(--navy); margin: 0;">${t("pos_terminal_title", "POS Counter Till")}</h3>
          <button class="btn btn-sm btn-secondary" onclick="clearCart()" title="Keyboard Shortcut: F8">${t("clear_cart", "Clear (F8)")}</button>
        </div>

        <div style="padding: 14px 16px; border-bottom: 1px solid var(--border); background: #FAF9F6;">
          <!-- 1. Customer Name field FIRST at the top -->
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">
            ${t("customer_details_title", "1. Customer Details (Optional for Cash/UPI, Required for Store Credit)")}
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
            <input type="text" id="pos-cust-name" class="form-input" placeholder="${t('customer_name_placeholder', 'Customer Name')}" style="font-size: 12.5px; padding: 7px 10px;">
            <input type="tel" id="pos-cust-phone" class="form-input" placeholder="${t('mobile_no_placeholder', 'Mobile No. (10 Digits)')}" style="font-size: 12.5px; padding: 7px 10px;">
          </div>

          <!-- 2. Invoice Theme Compact Thumbnail Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
              ${t("invoice_theme_title", "2. Invoice Theme")}
            </span>
            <span id="pos-theme-name-display" style="font-size: 11px; color: var(--teal); font-weight: 700;">${getThemeName(state.selectedPOSTheme)}</span>
          </div>
          <div class="pos-theme-mini-row" id="pos-theme-mini-row">
            ${renderThemeThumbnails()}
          </div>
          <input type="hidden" id="pos-theme-select" value="${state.selectedPOSTheme || 'PREMIUM_BOUTIQUE'}">

          <!-- 3. Payment Mode Selector: Cash / UPI / Card / Split / Store Credit -->
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; margin-top: 12px; letter-spacing: 0.5px;">
            ${t("payment_mode_title", "3. Payment Mode")} (${state.defaultPaymentMode})
          </div>
          <div class="pos-payment-segmented">
            <button type="button" class="pos-pay-pill ${state.defaultPaymentMode === 'CASH' ? 'active' : ''}" data-mode="CASH" onclick="selectPaymentMode('CASH')">${t("pay_cash", "Cash")}</button>
            <button type="button" class="pos-pay-pill ${state.defaultPaymentMode === 'UPI' ? 'active' : ''}" data-mode="UPI" onclick="selectPaymentMode('UPI')">${t("pay_upi", "UPI QR")}</button>
            <button type="button" class="pos-pay-pill ${state.defaultPaymentMode === 'CARD' ? 'active' : ''}" data-mode="CARD" onclick="selectPaymentMode('CARD')">${t("pay_card", "Card")}</button>
            <button type="button" class="pos-pay-pill ${state.defaultPaymentMode === 'SPLIT' ? 'active' : ''}" data-mode="SPLIT" onclick="selectPaymentMode('SPLIT')">${t("pay_split", "Split")}</button>
            <button type="button" class="pos-pay-pill ${state.defaultPaymentMode === 'CREDIT' ? 'active' : ''}" data-mode="CREDIT" onclick="selectPaymentMode('CREDIT')">${t("pay_credit", "Store Credit")}</button>
          </div>
          <input type="hidden" id="pos-payment-mode" value="${state.defaultPaymentMode || 'CASH'}">
        </div>

        <!-- Cart Items List -->
        <div class="cart-items" id="cart-items-list" style="flex: 1; overflow-y: auto; max-height: 260px; padding: 10px 16px;">
          ${renderCartItems()}
        </div>

        <div class="cart-summary" style="padding: 14px 16px; border-top: 1px solid var(--border); background: #fff;">
          <!-- Cart Totals & Discount -->
          <div class="cart-row">
            <span>${t("subtotal", "Subtotal")}:</span>
            <span id="pos-subtotal">₹0.00</span>
          </div>

          <div class="cart-row" style="align-items: center;">
            <span style="display: flex; align-items: center; gap: 4px;">
              ${t("discount", "Discount")}:
              ${canDiscount ? '' : '<small style="color: var(--text-muted);">(Locked)</small>'}
            </span>
            <div>
              ${canDiscount ? `
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="font-size: 12px; color: var(--text-muted);">₹</span>
                  <input type="number" step="0.01" min="0" id="pos-discount" class="form-input" value="0.00" style="width: 76px; padding: 3px 6px; font-size: 12px; text-align: right;" oninput="updateCartTotals()">
                </div>
              ` : `
                <span id="pos-discount-display" style="color: var(--text-muted); font-size: 12px;">₹0.00</span>
              `}
            </div>
          </div>

          <div class="cart-row">
            <span>${t("tax_gst", "GST (5%)")}:</span>
            <span id="pos-tax">₹0.00</span>
          </div>

          <div class="cart-total-row">
            <span>${t("grand_total", "Grand Total")}:</span>
            <span id="pos-total" style="font-size: 18px; font-weight: 800; color: var(--navy);">₹0.00</span>
          </div>

          <button id="pos-complete-sale-btn" class="btn btn-primary" style="width: 100%; margin-top: 14px; padding: 13px; font-weight: 700; font-size: 14px;" onclick="completePOSSale()">
            ${t("complete_sale_btn", "Complete Sale & Generate Invoice (F4)")}
          </button>
        </div>
      </div>
    </div>
  `;
  updateCartTotals();
}

// ==============================================================================
// CENTRALIZED INVOICE THEMES & BILL DESIGN REGISTRY (Part 4 - Single Source of Truth)
// ==============================================================================
const InvoiceThemeRegistry = {
  themes: [
    {
      id: "CLASSIC_GST",
      name: "Classic GST",
      tag: "GST Standard",
      badge: "Tax Standard",
      desc: "Official HSN/SAC & CGST/SGST tax breakdown tables.",
      color: "#1E3A8A",
      accent: "#3B82F6",
      icon: "🏛️",
      docTitle: "TAX INVOICE / બિલ"
    },
    {
      id: "MODERN_MINIMAL",
      name: "Modern Minimal",
      tag: "Modern Retail",
      badge: "Modern Retail",
      desc: "Airy editorial spacing with subtle teal divider lines.",
      color: "#0D9488",
      accent: "#14B8A6",
      icon: "✨",
      docTitle: "RETAIL SALES MEMO"
    },
    {
      id: "PREMIUM_BOUTIQUE",
      name: "Premium Boutique",
      tag: "High Fashion",
      badge: "High Fashion",
      desc: "Gold ribbon header with luxury atelier receipt feel.",
      color: "#B45309",
      accent: "#D97706",
      icon: "👑",
      docTitle: "BOUTIQUE ATELIER RECEIPT"
    },
    {
      id: "WHOLESALE_DEALER",
      name: "Wholesale & Dealer",
      tag: "B2B Wholesale",
      badge: "B2B Wholesale",
      desc: "Garment size/color matrix with dispatch memo header.",
      color: "#4B5563",
      accent: "#6B7280",
      icon: "📦",
      docTitle: "WHOLESALE DISPATCH MEMO"
    },
    {
      id: "COMPACT_THERMAL",
      name: "Compact Thermal",
      tag: "Counter POS",
      badge: "Counter POS",
      desc: "80mm continuous roll slip with dynamic item length.",
      color: "#1F2937",
      accent: "#374151",
      icon: "🧾",
      docTitle: "CASH COUNTER TILL RECEIPT"
    },
    {
      id: "INTERNATIONAL_COMMERCIAL",
      name: "Global Commercial",
      tag: "Global Trade",
      badge: "Global Trade",
      desc: "Port of discharge, currency conversion & export declaration.",
      color: "#4338CA",
      accent: "#6366F1",
      icon: "🌐",
      docTitle: "COMMERCIAL EXPORT INVOICE"
    }
  ],

  get(themeId) {
    return this.themes.find(t => t.id === themeId) || this.themes[2];
  },

  getAll() {
    return this.themes;
  },

  renderInvoiceCard(invoice, themeId) {
    const theme = this.get(themeId || (invoice && invoice.theme) || "PREMIUM_BOUTIQUE");
    const num = (invoice && invoice.invoice_number) || "INV-SAMPLE";
    const date = (invoice && (invoice.date || invoice.invoice_date)) || new Date().toLocaleDateString();
    const store = state.storeName || (state.business && state.business.name) || "VASTRENIX Flagship";
    const customer = (invoice && invoice.customer_name) || "Walk-in Retail Client";
    const total = Number((invoice && invoice.total_amount) || 0).toFixed(2);
    const subtotal = Number((invoice && invoice.subtotal) || (total / 1.05)).toFixed(2);
    const tax = Number((invoice && invoice.tax_amount) || (total - subtotal)).toFixed(2);
    const mode = (invoice && invoice.payment_mode) || state.defaultPaymentMode || "CASH";

    return `
      <div class="centralized-invoice-card" style="border-top: 5px solid ${theme.color}; background: #FFF; border-radius: 12px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border-left: 1px solid var(--border); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; border-bottom: 1px solid #F0EFEA; padding-bottom: 12px;">
          <div>
            <div style="font-size: 16px; font-weight: 800; color: ${theme.color}; letter-spacing: 0.5px;">${store}</div>
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-top: 2px;">${theme.docTitle}</div>
          </div>
          <div style="text-align: right;">
            <span class="badge" style="background: ${theme.color}; color: white; font-size: 10px; font-weight: 700;">${theme.name}</span>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${date}</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 14px; font-size: 12px; background: #FAF9F6; padding: 8px 12px; border-radius: 6px;">
          <div><span style="color: var(--text-muted);">Invoice No:</span> <b style="color: var(--navy);">${num}</b></div>
          <div><span style="color: var(--text-muted);">Customer:</span> <b style="color: var(--navy);">${customer}</b></div>
        </div>

        <div style="border-top: 1px dashed var(--border); padding-top: 10px; margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; color: var(--text-muted);">
            <span>Subtotal:</span>
            <span>₹${subtotal}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; color: var(--text-muted);">
            <span>GST (5%):</span>
            <span>₹${tax}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; color: var(--navy); margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px;">
            <span>Grand Total:</span>
            <span style="color: ${theme.color};">₹${total}</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; font-size: 11px; color: var(--text-muted); background: #F8FAFC; padding: 6px 10px; border-radius: 4px;">
          <span>Payment: <b>${mode}</b></span>
          <span style="color: #10B981; font-weight: 700;">● Official Authenticated Tax Record</span>
        </div>
      </div>
    `;
  },

  renderPOSThumbnail(th, isActive) {
    return `
      <div class="pos-theme-thumb ${isActive ? 'active' : ''}" onclick="selectPOSTheme('${th.id}')" title="${th.name}">
        <div class="pos-theme-thumb-preview" style="border-top: 3px solid ${th.color};">
          <div style="height: 4px; width: 60%; background: ${th.color}; margin-bottom: 2px; border-radius: 1px;"></div>
          <div style="height: 2px; width: 90%; background: #E5E7EB; margin-bottom: 2px;"></div>
          <div style="height: 2px; width: 75%; background: #E5E7EB; margin-bottom: 2px;"></div>
          <div style="height: 3px; width: 45%; background: ${th.color}; margin-top: 3px; border-radius: 1px;"></div>
        </div>
        <div class="pos-theme-thumb-name">${th.tag}</div>
      </div>
    `;
  },

  renderCarouselCard(th, isDefault) {
    return `
      <div class="invoice-carousel-card ${isDefault ? 'active' : ''}" onclick="selectStoreDefaultTheme('${th.id}')">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 20px;">${th.icon}</span>
          <span class="badge ${isDefault ? 'badge-primary' : 'badge-neutral'}" style="font-size: 10px; background: ${isDefault ? th.color : ''}; color: ${isDefault ? '#FFF' : ''};">${th.badge}</span>
        </div>
        <div style="font-size: 14px; font-weight: 800; color: var(--navy); margin-bottom: 4px;">${th.name}</div>
        <div style="font-size: 11px; color: var(--text-muted); line-height: 1.4; flex: 1; margin-bottom: 12px;">${th.desc}</div>
        <div style="font-size: 11.5px; font-weight: 700; color: ${isDefault ? th.color : 'var(--text-muted)'}; display: flex; align-items: center; gap: 4px;">
          ${isDefault ? t('store_default_badge', '✓ Store Default') : t('set_default_label', 'Tap to set default')}
        </div>
      </div>
    `;
  }
};

function getThemeName(themeId) {
  const t = InvoiceThemeRegistry.get(themeId);
  return t ? t.name : "Premium Boutique";
}

function renderThemeThumbnails() {
  const active = state.selectedPOSTheme || "PREMIUM_BOUTIQUE";
  return InvoiceThemeRegistry.getAll().map(th => InvoiceThemeRegistry.renderPOSThumbnail(th, th.id === active)).join('');
}

function selectPOSTheme(themeId) {
  triggerHaptic("tick");
  state.selectedPOSTheme = themeId;
  localStorage.setItem("vastrenix_pos_theme", themeId);
  const container = document.getElementById("pos-theme-mini-row");
  if (container) container.innerHTML = renderThemeThumbnails();
  const themeInput = document.getElementById("pos-theme-select");
  if (themeInput) themeInput.value = themeId;
  const nameDisplay = document.getElementById("pos-theme-name-display");
  if (nameDisplay) nameDisplay.textContent = getThemeName(themeId);
}

function selectPaymentMode(mode) {
  triggerHaptic("tick");
  const hiddenInput = document.getElementById("pos-payment-mode");
  if (hiddenInput) hiddenInput.value = mode;

  document.querySelectorAll(".pos-pay-pill").forEach(pill => {
    pill.classList.toggle("active", pill.getAttribute("data-mode") === mode);
  });
}

let posSearchDebounceTimer = null;
function handlePOSSearchInput(val) {
  if (posSearchDebounceTimer) clearTimeout(posSearchDebounceTimer);
  posSearchDebounceTimer = setTimeout(() => {
    filterPOSCatalog(val);
  }, 250);
}

function handlePOSSearchKeyDown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const query = e.target.value.trim().toLowerCase();
    if (!query) return;

    for (const p of state.products) {
      for (const v of (p.variants || [])) {
        if (v.sku.toLowerCase() === query || (v.barcode && v.barcode.toLowerCase() === query)) {
          if (v.available <= 0) {
            alert(`SKU ${v.sku} (${p.name}) is out of stock!`);
            return;
          }
          addToCart(v.id, p.name, v.size, v.color, v.retail_price, v.sku);
          e.target.value = "";
          filterPOSCatalog("");
          return;
        }
      }
    }

    const matches = [];
    state.products.forEach(p => {
      (p.variants || []).forEach(v => {
        if (v.sku.toLowerCase().includes(query) || p.name.toLowerCase().includes(query)) {
          matches.push({ p, v });
        }
      });
    });
    if (matches.length === 1 && matches[0].v.available > 0) {
      const { p, v } = matches[0];
      addToCart(v.id, p.name, v.size, v.color, v.retail_price, v.sku);
      e.target.value = "";
      filterPOSCatalog("");
    }
  }
}

function filterPOSCatalog(query) {
  const container = document.getElementById("pos-items-grid");
  if (!container) return;
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    container.innerHTML = renderPOSItems(state.products);
    return;
  }
  const filtered = [];
  state.products.forEach(p => {
    const matchingVariants = (p.variants || []).filter(v => 
      v.sku.toLowerCase().includes(q) || 
      p.name.toLowerCase().includes(q) || 
      (p.fabric && p.fabric.toLowerCase().includes(q)) || 
      v.color.toLowerCase().includes(q) || 
      v.size.toLowerCase().includes(q)
    );
    if (matchingVariants.length > 0) {
      filtered.push({ ...p, variants: matchingVariants });
    }
  });
  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 32px;">No garments matching '${query}'.</div>`;
  } else {
    container.innerHTML = renderPOSItems(filtered);
  }
}

function renderPOSItems(products) {
  let html = "";
  (products || []).forEach(p => {
    (p.variants || []).forEach(v => {
      const inCart = state.cart.find(c => c.variantId === v.id);
      const qtyInCart = inCart ? inCart.quantity : 0;
      html += `
        <div class="pos-item-card" style="background: #FAF8F3; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="font-size: 11px; color: var(--text-muted);">${p.fabric || 'Textile'}</div>
            <div style="font-weight: 700; font-size: 13.5px; color: var(--navy); margin: 2px 0;">${p.name}</div>
            <div style="display: flex; gap: 6px; margin: 6px 0;">
              <span class="badge badge-neutral">${v.size}</span>
              <span style="font-size: 11px; color: var(--text-muted);">${v.color}</span>
            </div>
            <div style="font-size: 11px; color: ${v.available <= 0 ? 'var(--coral)' : 'var(--teal)'}; font-weight: 600;">
              ${v.available > 0 ? `${v.available} in stock` : 'Out of stock'}
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
            <div style="font-weight: 800; font-size: 14px; color: var(--navy);">₹${v.retail_price.toFixed(2)}</div>
            ${qtyInCart > 0 ? `
              <div class="pos-inline-stepper">
                <button type="button" class="btn-step" onclick="stepItemCartQty(${v.id}, -1)">−</button>
                <span class="qty-badge">${qtyInCart}</span>
                <button type="button" class="btn-step" ${v.available <= qtyInCart ? 'disabled' : ''} onclick="stepItemCartQty(${v.id}, 1)">+</button>
              </div>
            ` : `
              <button class="btn btn-sm btn-navy" ${v.available <= 0 ? 'disabled' : ''} onclick="addToCart(${v.id}, '${p.name.replace(/'/g, "\\'")}', '${v.size}', '${v.color}', ${v.retail_price}, '${v.sku}')">
                + Add
              </button>
            `}
          </div>
        </div>
      `;
    });
  });
  return html;
}

function addToCart(variantId, name, size, color, price, sku) {
  triggerHaptic("tick");
  const existing = state.cart.find(c => c.variantId === variantId);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ variantId, name, size, color, price: Number(price), sku, quantity: 1 });
  }
  document.getElementById("cart-items-list").innerHTML = renderCartItems();
  updateCartTotals();
}

function stepItemCartQty(variantId, delta) {
  const existing = state.cart.find(c => c.variantId === variantId);
  if (!existing && delta > 0) {
    for (const p of state.products) {
      for (const v of (p.variants || [])) {
        if (v.id === variantId) {
          addToCart(v.id, p.name, v.size, v.color, v.retail_price, v.sku);
          return;
        }
      }
    }
  } else if (existing) {
    const idx = state.cart.indexOf(existing);
    stepCartQty(idx, delta);
  }
}

function openCustomItemModal() {
  const nameInput = document.getElementById("custom-item-name");
  const priceInput = document.getElementById("custom-item-price");
  const qtyInput = document.getElementById("custom-item-qty");
  if (nameInput) nameInput.value = "";
  if (priceInput) priceInput.value = "";
  if (qtyInput) qtyInput.value = "1";
  const modal = document.getElementById("modal-pos-custom-item");
  if (modal) modal.classList.add("active");
}

function submitCustomItem(event) {
  event.preventDefault();
  const name = document.getElementById("custom-item-name").value.trim() || "Custom Garment";
  const price = parseFloat(document.getElementById("custom-item-price").value) || 0;
  const qty = parseInt(document.getElementById("custom-item-qty").value, 10) || 1;

  if (price <= 0) {
    alert("Please enter a valid unit price greater than ₹0.");
    return;
  }
  if (qty <= 0) {
    alert("Quantity must be at least 1.");
    return;
  }

  const sku = "AD-HOC-" + Date.now().toString().slice(-4);
  state.cart.push({
    variantId: null,
    isCustom: true,
    name,
    size: "Standard",
    color: "Custom",
    price,
    sku,
    quantity: qty
  });

  closeModal("modal-pos-custom-item");
  document.getElementById("cart-items-list").innerHTML = renderCartItems();
  updateCartTotals();
  triggerHaptic("success");
}

function renderCartItems() {
  if (state.cart.length === 0) {
    return `<div style="text-align: center; color: var(--text-muted); padding: 40px 10px; font-size: 13px;">Cart is empty. Scan barcodes, click '+ Add', or add a Custom Item.</div>`;
  }
  return state.cart.map((item, idx) => {
    const lineTotal = (Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2);
    return `
      <div class="cart-item cart-item-enter" id="cart-item-row-${idx}" style="padding: 10px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
        <div style="flex: 1; padding-right: 8px;">
          <div style="font-weight: 700; font-size: 13px; color: var(--navy); display: flex; align-items: center; gap: 6px;">
            <span>${item.name}</span>
            ${item.isCustom ? '<span class="badge badge-neutral" style="font-size: 9.5px; padding: 1px 5px;">Custom</span>' : ''}
          </div>
          <div style="font-size: 11.5px; color: var(--text-muted);">
            ${item.size || 'STD'} / ${item.color || 'Assorted'} • <span style="color: var(--navy);">₹${Number(item.price || 0).toFixed(2)} each</span>
          </div>
          <div style="font-size: 12px; font-weight: 700; color: var(--teal); margin-top: 2px;">
            Line Total: ₹${lineTotal}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button type="button" style="width: 32px; height: 32px; border-radius: 6px; border: 1px solid var(--border); background: #fff; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="stepCartQty(${idx}, -1)">-</button>
          <input type="number" min="1" value="${item.quantity}" style="width: 42px; height: 32px; border: 1px solid var(--border); border-radius: 6px; text-align: center; font-weight: 700; font-size: 13px;" onchange="updateCartQty(${idx}, this.value)">
          <button type="button" style="width: 32px; height: 32px; border-radius: 6px; border: 1px solid var(--border); background: #fff; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="stepCartQty(${idx}, 1)">+</button>
          <button type="button" style="width: 28px; height: 28px; border: none; background: none; color: var(--coral); cursor: pointer; font-size: 18px; margin-left: 2px;" onclick="removeFromCart(${idx})" title="Remove item">&times;</button>
        </div>
      </div>
    `;
  }).join('');
}

function stepCartQty(idx, delta) {
  if (state.cart[idx]) {
    const newQty = state.cart[idx].quantity + delta;
    if (newQty <= 0) {
      removeFromCart(idx);
    } else {
      triggerHaptic("tick");
      state.cart[idx].quantity = newQty;
      document.getElementById("cart-items-list").innerHTML = renderCartItems();
      updateCartTotals();
    }
  }
}

function updateCartQty(idx, val) {
  const q = parseInt(val, 10);
  if (q > 0) state.cart[idx].quantity = q;
  updateCartTotals();
}

let lastRemovedCartItem = null;
function removeFromCart(idx) {
  const row = document.getElementById(`cart-item-row-${idx}`);
  const removed = state.cart[idx];
  if (!removed) return;
  lastRemovedCartItem = { item: { ...removed }, index: idx };

  if (row) {
    row.classList.add("cart-item-exit");
    setTimeout(() => {
      state.cart.splice(idx, 1);
      document.getElementById("cart-items-list").innerHTML = renderCartItems();
      updateCartTotals();
      showUndoSnackbar(`Removed '${removed.name}' from cart`, () => {
        state.cart.splice(lastRemovedCartItem.index, 0, lastRemovedCartItem.item);
        document.getElementById("cart-items-list").innerHTML = renderCartItems();
        updateCartTotals();
      });
    }, 200);
  } else {
    state.cart.splice(idx, 1);
    document.getElementById("cart-items-list").innerHTML = renderCartItems();
    updateCartTotals();
  }
}

function clearCart() {
  if (state.cart.length === 0) return;
  const previousCart = [...state.cart];
  state.cart = [];
  document.getElementById("cart-items-list").innerHTML = renderCartItems();
  updateCartTotals();
  showUndoSnackbar("Sale cart cleared", () => {
    state.cart = previousCart;
    document.getElementById("cart-items-list").innerHTML = renderCartItems();
    updateCartTotals();
  });
}

function updateCartTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
  const discountInput = document.getElementById("pos-discount");
  const discountVal = discountInput ? Math.max(0, parseFloat(discountInput.value) || 0) : 0;
  const taxable = Math.max(0, subtotal - discountVal);
  const tax = taxable * 0.05;
  const total = taxable + tax;

  const subEl = document.getElementById("pos-subtotal");
  if (subEl) subEl.textContent = `₹${subtotal.toFixed(2)}`;

  const taxEl = document.getElementById("pos-tax");
  if (taxEl) taxEl.textContent = `₹${tax.toFixed(2)}`;

  const totalEl = document.getElementById("pos-total");
  if (totalEl) totalEl.textContent = `₹${total.toFixed(2)}`;

  const cartTotalEl = document.getElementById("pos-cart-total");
  if (cartTotalEl) {
    const currentNum = parseFloat(cartTotalEl.textContent.replace(/[^0-9.]/g, '')) || 0;
    animateNumber(cartTotalEl, currentNum, total, 450, "₹", "", 2);
  }

  const grid = document.getElementById("pos-items-grid");
  if (grid && state.products) {
    const searchInput = document.getElementById("pos-search");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    if (!query) {
      grid.innerHTML = renderPOSItems(state.products);
    }
  }
}

let pendingUpiSaleData = null;

function openUpiPaymentModal(totalAmount) {
  const modal = document.getElementById("modal-upi-payment");
  if (!modal) return;

  const amountEl = document.getElementById("upi-modal-amount");
  if (amountEl) amountEl.textContent = `₹${totalAmount.toFixed(2)}`;

  const vpa = `${(state.business && state.business.name ? state.business.name : 'vastrenix').toLowerCase().replace(/[^a-z0-9]/g, '')}@upi`;
  const vpaEl = document.getElementById("upi-modal-vpa");
  if (vpaEl) vpaEl.textContent = vpa;

  const qrContainer = document.getElementById("upi-modal-qr-container");
  if (qrContainer) {
    const upiUri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(state.storeName || (state.business && state.business.name) || 'Vastrenix')}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('POS Sale')}`;
    qrContainer.innerHTML = `
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUri)}" alt="UPI QR Code" style="width: 180px; height: 180px; border-radius: 8px; border: 1px solid var(--border);" onerror="this.outerHTML='<div style=\\'width:180px;height:180px;display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-size:12px;color:#6b7280;text-align:center;padding:10px;\\'>Scan with any UPI App<br><b>${vpa}</b></div>'">
    `;
  }

  const paidBtn = document.getElementById("upi-paid-btn");
  if (paidBtn) paidBtn.style.display = "block";
  const utrSection = document.getElementById("upi-utr-capture-section");
  if (utrSection) utrSection.style.display = "none";
  const utrInput = document.getElementById("upi-utr-input");
  if (utrInput) utrInput.value = "";

  modal.classList.add("active");
}

function onUpiPaidTapped() {
  triggerHaptic("tick");
  const paidBtn = document.getElementById("upi-paid-btn");
  if (paidBtn) paidBtn.style.display = "none";
  const utrSection = document.getElementById("upi-utr-capture-section");
  if (utrSection) {
    utrSection.style.display = "block";
    const utrInput = document.getElementById("upi-utr-input");
    if (utrInput) utrInput.focus();
  }
}

async function confirmUpiSaleWithUtr(skip) {
  triggerHaptic("tick");
  const utrInput = document.getElementById("upi-utr-input");
  const utr = skip ? null : (utrInput ? utrInput.value.trim() : null);
  closeModal("modal-upi-payment");

  if (!pendingUpiSaleData) return;
  const payload = pendingUpiSaleData;
  pendingUpiSaleData = null;

  if (utr) {
    payload.reference_number = utr;
    payload.transaction_reference = utr;
  }

  await executeSalePost(payload);
}

async function completePOSSale() {
  if (state.cart.length === 0) return alert("Please add at least one item to the cart");

  const modeInput = document.getElementById("pos-payment-mode");
  const paymentMode = modeInput ? modeInput.value : (state.defaultPaymentMode || "CASH");
  const customerName = document.getElementById("pos-cust-name") ? document.getElementById("pos-cust-name").value.trim() : "";
  const customerPhone = document.getElementById("pos-cust-phone") ? document.getElementById("pos-cust-phone").value.trim() : "";

  // Part 8: Customer Name and Phone mandatory for Store Credit
  if (paymentMode === "CREDIT" || paymentMode === "STORE_CREDIT") {
    if (!customerName || !customerPhone) {
      alert("Store Credit Requirement:\nCustomer Name AND Mobile Number are strictly required to record outstanding receivables.");
      if (!customerName && document.getElementById("pos-cust-name")) document.getElementById("pos-cust-name").focus();
      else if (!customerPhone && document.getElementById("pos-cust-phone")) document.getElementById("pos-cust-phone").focus();
      return;
    }
  }

  const themeInput = document.getElementById("pos-theme-select");
  const theme = state.selectedPOSTheme || (themeInput ? themeInput.value : "PREMIUM_BOUTIQUE");
  const discountInput = document.getElementById("pos-discount");
  const discountVal = discountInput ? Math.max(0, parseFloat(discountInput.value) || 0) : 0;

  const idempotencyKey = "POS-IDEMP-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);

  const payload = {
    idempotency_key: idempotencyKey,
    customer_name: customerName || "Walk-in Retail Client",
    customer_phone: customerPhone || undefined,
    items: state.cart.map(c => ({
      variant_id: c.variantId || null,
      product_name: c.name,
      size: c.size || "STD",
      color: c.color || "Assorted",
      sku: c.sku || "CUSTOM",
      quantity: c.quantity,
      unit_price: c.price,
      tax_rate: 5.0
    })),
    discount_amount: discountVal,
    payment_mode: paymentMode,
    invoice_theme: theme
  };

  // Part 6: If UPI, open QR modal first to verify payment & capture optional UTR
  if (paymentMode === "UPI") {
    const subtotal = state.cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
    const taxable = Math.max(0, subtotal - discountVal);
    const total = taxable + (taxable * 0.05);
    pendingUpiSaleData = payload;
    openUpiPaymentModal(total);
    return;
  }

  await executeSalePost(payload);
}

async function executeSalePost(payload) {
  const btn = document.getElementById("pos-complete-sale-btn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; display: inline-block; margin-right: 8px;"></span> Posting Authoritative Invoice...`;
  }

  try {
    const res = await api("/pos/sale", {
      method: "POST",
      headers: { "Idempotency-Key": payload.idempotency_key },
      body: JSON.stringify(payload)
    });

    if (res && res.invoice_id) {
      triggerHaptic("success");
      if (btn) {
        btn.style.background = "var(--teal)";
        btn.innerHTML = `✓ Sale Confirmed & Saved!`;
      }

      await new Promise(r => setTimeout(r, 400));
      clearCart();
      viewInvoiceInApp(res.invoice_id, res.invoice_number);
      switchTab("invoices");
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.style.background = "";
      btn.textContent = "Complete Sale & Generate Invoice (F4)";
    }
  }
}

async function submitOpenShift(e) {
  e.preventDefault();
  const floatVal = parseFloat(document.getElementById("shift-open-float").value) || 0;
  const notes = document.getElementById("shift-open-notes").value;

  const res = await api("/finance/shifts/open", {
    method: "POST",
    body: JSON.stringify({
      opening_cash: floatVal,
      notes: notes || undefined
    })
  });

  if (res && res.shift_id) {
    alert(`Register Shift #${res.shift_id} opened successfully with ₹${Number(res.opening_cash).toFixed(2)} float!`);
    renderPOS();
  }
}

async function openCloseShiftModal() {
  const shiftRes = await api("/finance/shifts/current");
  if (!shiftRes || !shiftRes.has_active_shift) {
    return alert("No active shift found to close.");
  }
  const s = shiftRes.shift;
  state.currentShift = s;

  document.getElementById("close-shift-opening").textContent = `₹${Number(s.opening_cash).toFixed(2)}`;
  document.getElementById("close-shift-sales").textContent = `+₹${Number(s.cash_sales_collected).toFixed(2)}`;
  document.getElementById("close-shift-expenses").textContent = `-₹${Number(s.cash_payouts_expenses || 0).toFixed(2)}`;
  document.getElementById("close-shift-expected").textContent = `₹${Number(s.expected_closing_cash).toFixed(2)}`;

  const actInput = document.getElementById("close-shift-actual");
  actInput.value = "";
  document.getElementById("close-shift-diff-box").style.display = "none";
  document.getElementById("close-shift-notes").value = "";

  document.getElementById("modal-close-shift").classList.add("active");
  setTimeout(() => actInput.focus(), 150);
}

function recalcShiftDifference() {
  if (!state.currentShift) return;
  const expected = Number(state.currentShift.expected_closing_cash);
  const actualStr = document.getElementById("close-shift-actual").value;
  const diffBox = document.getElementById("close-shift-diff-box");
  if (!actualStr) {
    diffBox.style.display = "none";
    return;
  }
  const actual = parseFloat(actualStr) || 0;
  const diff = actual - expected;

  diffBox.style.display = "block";
  if (Math.abs(diff) < 0.01) {
    diffBox.style.background = "#E8F4F0";
    diffBox.style.color = "var(--teal)";
    diffBox.innerHTML = `✓ EXACT MATCH: Counted ₹${actual.toFixed(2)} matches Expected ₹${expected.toFixed(2)}`;
  } else if (diff > 0) {
    diffBox.style.background = "#FFF9ED";
    diffBox.style.color = "var(--gold)";
    diffBox.innerHTML = `⚠️ CASH OVERAGE / EXCESS: +₹${diff.toFixed(2)} over expected`;
  } else {
    diffBox.style.background = "#FDF0ED";
    diffBox.style.color = "var(--coral)";
    diffBox.innerHTML = `⚠️ CASH SHORTAGE: -₹${Math.abs(diff).toFixed(2)} below expected`;
  }
}

async function submitCloseShift(e) {
  e.preventDefault();
  const actualVal = parseFloat(document.getElementById("close-shift-actual").value);
  if (isNaN(actualVal)) return alert("Please enter the counted physical cash in drawer.");

  const notes = document.getElementById("close-shift-notes").value;
  const res = await api("/finance/shifts/close", {
    method: "POST",
    body: JSON.stringify({
      actual_closing_cash: actualVal,
      notes: notes || undefined
    })
  });

  if (res && res.shift_id) {
    closeModal("modal-close-shift");
    alert(`Shift Closed & Reconciled!\nExpected: ₹${Number(res.expected_closing_cash).toFixed(2)}\nActual: ₹${Number(res.actual_closing_cash).toFixed(2)}\nReconciliation Status: ${res.reconciliation_status} (Difference: ₹${Number(res.difference).toFixed(2)})`);
    state.currentShift = null;
    renderPOS();
  }
}

async function retryInvoicePdf(id, invoiceNumber) {
  const res = await api(`/pos/invoices/${id}/retry-pdf`, { method: "POST" });
  if (res && res.pdf_filename) {
    alert(`PDF for ${invoiceNumber} generated successfully! Opening in-app view...`);
    viewInvoiceInApp(id, invoiceNumber);
    renderInvoices();
  }
}

async function refreshInvoices(force = false) {
  const tableContainer = document.getElementById("invoices-table-container");
  if (tableContainer) {
    tableContainer.innerHTML = `
      <div style="padding: 30px; text-align: center; color: var(--navy);">
        <div class="spinner"></div>
        <div style="margin-top: 10px; font-weight: 600;">Refreshing invoice records from cloud...</div>
      </div>
    `;
  }
  await renderInvoices();
}

// Render Invoices List
async function renderInvoices() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  const currentDefaultTheme = (state.business && state.business.default_invoice_theme) || "CLASSIC_GST";

  const themesData = [
    { id: "CLASSIC_GST", name: "Classic GST", desc: "Official HSN/SAC & CGST/SGST tax breakdown tables.", tag: "Tax Authority Standard", icon: "🏛️" },
    { id: "MODERN_MINIMAL", name: "Modern Minimal", desc: "Airy editorial spacing with subtle teal divider lines.", tag: "Modern Retail", icon: "✨" },
    { id: "PREMIUM_BOUTIQUE", name: "Premium Boutique", desc: "Gold ribbon header with luxury atelier receipt feel.", tag: "High Fashion", icon: "👑" },
    { id: "WHOLESALE_DEALER", name: "Wholesale & Dealer", desc: "Garment size/color matrix with dispatch memo header.", tag: "B2B Wholesale", icon: "📦" },
    { id: "COMPACT_THERMAL", name: "Compact Thermal", desc: "80mm continuous roll slip with dynamic item length.", tag: "Counter Thermal POS", icon: "🧾" },
    { id: "INTERNATIONAL_COMMERCIAL", name: "International Commercial", desc: "Port of discharge, currency conversion & export declaration.", tag: "Global Trade", icon: "🌐" }
  ];

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">${t("invoices_title", "Authoritative Invoices & Billing Records")}</h2>
        <p style="color: var(--text-muted); font-size: 13px;">Store: <b>${state.storeName || (state.business && state.business.name) || 'My Store'}</b> • View posted invoices and download PDFs.</p>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-secondary" onclick="refreshInvoices(true)" id="btn-refresh-invoices" style="display: flex; align-items: center; gap: 6px;">
          ${t("refresh_invoices_btn", "↻ Refresh Invoices")}
        </button>
        <button class="btn btn-primary" onclick="switchTab('pos')">${t("new_pos_sale", "+ New POS Sale")}</button>
      </div>
    </div>

    <!-- Live Theme Picker Carousel -->
    <div style="margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 13.5px; font-weight: 800; color: var(--navy);">${t("six_themes_title", "6 Invoice Themes (Swipe to Preview & Select Default)")}</span>
        <span style="font-size: 11.5px; color: var(--teal); font-weight: 600;">${t("active_theme_label", "Active")}: <b>${currentDefaultTheme}</b></span>
      </div>
      <div class="invoice-carousel-container">
        ${InvoiceThemeRegistry.getAll().map(th => InvoiceThemeRegistry.renderCarouselCard(th, th.id === currentDefaultTheme)).join('')}
      </div>
    </div>

    <div class="panel" id="invoices-table-container">
      <div class="table-responsive">
        <table class="data-table"><tbody>${getSkeletonTableRowsHTML(6, 4)}</tbody></table>
      </div>
    </div>
  `;

  try {
    const invoices = await api("/pos/invoices");
    const tableContainer = document.getElementById("invoices-table-container");
    if (!tableContainer) return;

    if (!invoices || invoices.length === 0) {
      tableContainer.innerHTML = `
        <div style="text-align: center; padding: 48px 16px;">
          <div style="font-size: 38px; margin-bottom: 10px;">🧾</div>
          <h3 style="font-size: 16px; font-weight: 700; color: var(--navy); margin-bottom: 6px;">${t("no_invoices_title", "No Invoices Posted Yet")}</h3>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 18px;">
            ${t("no_invoices_desc", "Invoices are immutable business records. Complete your first garment sale on the POS Till to generate a GST invoice with instant PDF download.")}
          </p>
          <button class="btn btn-primary" onclick="switchTab('pos')">${t("open_pos_till_btn", "Open POS Billing Till ➔")}</button>
        </div>
      `;
      return;
    }

    tableContainer.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t("invoice_number_col", "Invoice Number")}</th>
              <th>${t("date_col", "Date")}</th>
              <th>${t("customer_col", "Customer")}</th>
              <th>${t("theme_col", "Theme")}</th>
              <th>${t("total_amount_col", "Total Amount")}</th>
              <th>${t("paid_col", "Paid")}</th>
              <th>${t("payment_mode_title", "Payment Mode")}</th>
              <th>${t("status_col", "Status")}</th>
              <th>${t("actions_col", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map(inv => `
              <tr>
                <td><b>${inv.invoice_number}</b></td>
                <td>${inv.date}</td>
                <td>${inv.customer_name}</td>
                <td><span class="badge badge-neutral">${inv.invoice_theme}</span></td>
                <td><b>₹${Number(inv.total_amount).toFixed(2)}</b></td>
                <td style="color: var(--teal);">₹${Number(inv.paid_amount).toFixed(2)}</td>
                <td>${inv.payment_mode}</td>
                <td>
                  ${inv.payment_status === 'VOID' || inv.payment_status === 'REVERSED' 
                    ? '<span class="badge badge-danger">VOID / REVERSED</span>' 
                    : `<span class="badge badge-success">${inv.payment_status}</span>`}
                </td>
                <td>
                  <button onclick="viewInvoiceInApp(${inv.id}, '${inv.invoice_number}')" class="btn btn-sm btn-navy">PDF</button>
                  <button onclick="shareInvoicePdf(${inv.id}, '${inv.invoice_number}')" class="btn btn-sm btn-secondary">Share</button>
                  <button onclick="retryInvoicePdf(${inv.id}, '${inv.invoice_number}')" class="btn btn-sm btn-outline" title="Re-render PDF">Retry</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    const tableContainer = document.getElementById("invoices-table-container");
    if (tableContainer) {
      tableContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--coral);">
          <div style="font-size: 15px; font-weight: 700; margin-bottom: 8px;">Failed to load invoices from server</div>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">${err.message || 'Network request error'}</p>
          <button class="btn btn-primary" onclick="refreshInvoices(true)">Retry Fetch</button>
        </div>
      `;
    }
  }
}

function selectStoreDefaultTheme(themeId) {
  triggerHaptic("tick");
  if (state.business) {
    state.business.default_invoice_theme = themeId;
    localStorage.setItem("vastrenix_business", JSON.stringify(state.business));
  }
  const posSelect = document.getElementById("pos-theme-select");
  if (posSelect) posSelect.value = themeId;
  alert(`Store Default Invoice Theme set to '${themeId}'!`);
  renderInvoices();
}

// Render Dealer B2B Network
let cachedStaff = [];

function renderOrderStepper(status) {
  if (status === 'REJECTED') {
    return `<div style="padding: 4px 10px; background: #FEE2E2; color: #991B1B; border-radius: 6px; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">✕ Order Rejected</div>`;
  }
  const steps = ["SUBMITTED", "ACCEPTED", "PROCESSING", "PACKED", "DISPATCHED", "DELIVERED"];
  const labels = ["Submitted", "Accepted", "Picking", "Packed", "Dispatched", "Delivered"];
  const currentIdx = steps.indexOf(status);
  const activeIdx = currentIdx >= 0 ? currentIdx : (status === "CLOSED" ? 5 : 0);
  const progressWidth = Math.min(100, Math.max(0, (activeIdx / (steps.length - 1)) * 100));

  return `
    <div class="b2b-stepper" style="margin: 8px 0 12px 0;">
      <div class="b2b-stepper-track"></div>
      <div class="b2b-stepper-progress" style="width: ${progressWidth}%;"></div>
      ${steps.map((st, i) => {
        const isDone = i < activeIdx;
        const isActive = i === activeIdx;
        return `
          <div class="b2b-step-node ${isDone ? 'completed' : (isActive ? 'active' : '')}">
            <div class="b2b-step-circle">${isDone ? '✓' : (i + 1)}</div>
            <span class="b2b-step-label">${labels[i]}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function renderDealers() {
  const container = document.getElementById("tab-content");
  container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--navy);"><div class="spinner"></div><div style="margin-top: 12px; font-weight: 600;">Loading B2B dealer network & connected orders...</div></div>`;
  
  const [incoming, outgoing, conns] = await Promise.all([
    api("/dealers/orders/incoming").catch(() => []),
    api("/dealers/orders/outgoing").catch(() => []),
    api("/dealers/connections").catch(() => [])
  ]);

  try {
    cachedStaff = await api("/auth/staff");
  } catch (e) {
    cachedStaff = [];
  }

  container.innerHTML = `
    <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">B2B Dealer Network & Connected Businesses</h2>
        <p style="color: var(--text-muted); font-size: 13px;">Manage multi-business orders, atomic stock reservations, staff picking/packing, dispatch tracking & delivery receipt.</p>
      </div>
      <div style="background: var(--teal-light); border: 1px solid rgba(33,140,130,0.25); border-radius: var(--radius-sm); padding: 8px 14px; font-size: 12px; color: var(--navy);">
        Store Staff Available: <b>${cachedStaff.length} Members</b>
      </div>
    </div>

    <!-- Connected Business Partners -->
    <div class="panel" style="margin-bottom: 24px;">
      <div class="panel-header">
        <div class="panel-title">Connected Business Partners</div>
      </div>
      <div style="padding: 16px 24px; display: flex; gap: 16px; flex-wrap: wrap;">
        ${conns && conns.length > 0 ? conns.map(c => `
          <div style="background: #FAF8F3; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 18px;">
            <div style="font-weight: 700; color: var(--navy); font-size: 14px;">${c.partner_name}</div>
            <div style="font-size: 12px; color: var(--text-muted);">${c.partner_city || 'India'} • GST: ${c.partner_gstin || 'N/A'}</div>
            <span class="badge badge-success" style="margin-top: 6px;">${c.status} (${c.price_tier})</span>
          </div>
        `).join('') : '<div style="color: var(--text-muted);">No connected businesses yet.</div>'}
      </div>
    </div>

    <!-- Incoming Dealer Orders (To Fulfill & Dispatch) -->
    <div class="panel" style="margin-bottom: 24px;">
      <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
        <div class="panel-title">Incoming Orders from Retailers & Dealers (Seller Fulfill Queue)</div>
        <span class="badge badge-neutral">${incoming ? incoming.length : 0} Orders</span>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Order Number</th>
              <th>Buyer Business</th>
              <th>Date</th>
              <th>Items Ordered</th>
              <th>Total Amount</th>
              <th>Assigned Staff</th>
              <th>Status</th>
              <th>Actions & Lifecycle</th>
            </tr>
          </thead>
          <tbody>
            ${incoming && incoming.length > 0 ? incoming.map(o => {
              const isAssignedToMe = state.user && o.assigned_staff_id === state.user.id;
              let statusBadge = 'badge-neutral';
              if (o.status === 'SUBMITTED') statusBadge = 'badge-warning';
              else if (o.status === 'ACCEPTED' || o.status === 'PARTIAL_ACCEPTED') statusBadge = 'badge-primary';
              else if (o.status === 'PROCESSING') statusBadge = 'badge-info';
              else if (o.status === 'PACKED') statusBadge = 'badge-warning';
              else if (o.status === 'DISPATCHED') statusBadge = 'badge-success';
              else if (o.status === 'DELIVERED' || o.status === 'CLOSED') statusBadge = 'badge-success';
              else if (o.status === 'REJECTED') statusBadge = 'badge-danger';

              return `
              <tr>
                <td><b>${o.order_number}</b></td>
                <td>${o.buyer_name}</td>
                <td>${o.date}</td>
                <td>${o.items.map(it => `${it.product_name} (${it.size}) × ${it.qty_ordered}`).join(', ')}</td>
                <td><b>₹${Number(o.total_amount).toFixed(2)}</b></td>
                <td>
                  ${o.assigned_staff_id ? `
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span class="badge badge-neutral" style="background: #E8F4F0; color: var(--teal); font-weight: 700;">
                        👤 ${o.assigned_staff_name || 'Staff #' + o.assigned_staff_id}
                      </span>
                      ${isAssignedToMe ? `<span class="badge badge-success" style="font-size: 10px;">Assigned to You</span>` : ''}
                    </div>
                  ` : `
                    <span class="badge badge-neutral" style="color: var(--text-muted); background: #F1F3F5;">Unassigned</span>
                  `}
                </td>
                <td>
                  <span class="badge ${statusBadge}">${o.status}</span>
                  ${renderOrderStepper(o.status)}
                </td>
                <td>
                  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    ${o.status === 'SUBMITTED' ? `
                      <button class="btn btn-sm btn-primary" onclick="acceptDealerOrder(${o.id}, ${o.items[0]?.id}, ${o.items[0]?.qty_ordered})">Accept & Reserve</button>
                      <button class="btn btn-sm btn-outline-danger" style="border: 1px solid var(--coral); color: var(--coral);" onclick="rejectDealerOrder(${o.id})">Reject</button>
                      <button class="btn btn-sm btn-secondary" onclick="openAssignStaffModal(${o.id}, '${o.order_number}')">👤 Assign Staff</button>
                    ` : (o.status === 'ACCEPTED' || o.status === 'PARTIAL_ACCEPTED' ? `
                      <button class="btn btn-sm btn-secondary" onclick="moveDealerOrderProcessing(${o.id})">Start Picking</button>
                      <button class="btn btn-sm btn-navy" onclick="dispatchDealerOrder(${o.id})">Dispatch (LR)</button>
                      <button class="btn btn-sm btn-secondary" onclick="openAssignStaffModal(${o.id}, '${o.order_number}')">Reassign</button>
                    ` : (o.status === 'PROCESSING' ? `
                      <button class="btn btn-sm btn-secondary" onclick="moveDealerOrderPacked(${o.id})">Mark Packed</button>
                      <button class="btn btn-sm btn-navy" onclick="dispatchDealerOrder(${o.id})">Dispatch (LR)</button>
                      <button class="btn btn-sm btn-secondary" onclick="openAssignStaffModal(${o.id}, '${o.order_number}')">Reassign</button>
                    ` : (o.status === 'PACKED' ? `
                      <button class="btn btn-sm btn-navy" onclick="dispatchDealerOrder(${o.id})">Dispatch (LR)</button>
                    ` : `<span style="font-size: 12px; color: var(--text-muted);">${o.transporter_name || 'Dispatched'} ${o.lr_number ? `(LR: ${o.lr_number})` : ''}</span>`)))}
                  </div>
                </td>
              </tr>
            `;}).join('') : '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">No incoming dealer orders.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Outgoing Dealer Orders (Purchases from Mills & Manufacturers) -->
    <div class="panel">
      <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
        <div class="panel-title">Outgoing Orders to Suppliers (Buyer Procurement & Stock Inward)</div>
        <span class="badge badge-neutral">${outgoing ? outgoing.length : 0} Orders</span>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Order Number</th>
              <th>Seller Supplier</th>
              <th>Date</th>
              <th>Items Ordered</th>
              <th>Total Amount</th>
              <th>Status</th>
              <th>Transporter / LR</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${outgoing && outgoing.length > 0 ? outgoing.map(o => `
              <tr>
                <td><b>${o.order_number}</b></td>
                <td>${o.seller_name}</td>
                <td>${o.date}</td>
                <td>${o.items.map(it => `${it.product_name} (${it.size}) × ${it.qty_ordered}`).join(', ')}</td>
                <td><b>₹${Number(o.total_amount).toFixed(2)}</b></td>
                <td>
                  <span class="badge ${o.status === 'DELIVERED' ? 'badge-success' : (o.status === 'DISPATCHED' ? 'badge-warning' : 'badge-neutral')}">${o.status}</span>
                  ${renderOrderStepper(o.status)}
                </td>
                <td>${o.transporter_name ? `${o.transporter_name} (${o.lr_number || ''})` : '<span style="color: var(--text-muted);">Awaiting Dispatch</span>'}</td>
                <td>
                  ${o.status === 'DISPATCHED' ? `
                    <button class="btn btn-sm btn-primary" onclick="confirmDealerOrderDelivered(${o.id})">✓ Confirm Delivery & Inward Stock</button>
                  ` : (o.status === 'DELIVERED' ? `
                    <button class="btn btn-sm btn-secondary" onclick="closeDealerOrder(${o.id})">Close & Archive</button>
                  ` : `<span style="font-size: 12px; color: var(--text-muted);">In Progress</span>`)}
                </td>
              </tr>
            `).join('') : '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">No outgoing dealer orders placed yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openAssignStaffModal(orderId, orderNum) {
  document.getElementById("assign-order-id").value = orderId;
  document.getElementById("assign-order-num-display").textContent = orderNum;
  
  const select = document.getElementById("assign-staff-select");
  if (cachedStaff && cachedStaff.length > 0) {
    select.innerHTML = cachedStaff.map(s => `
      <option value="${s.id}">${s.full_name} (${s.role}) - ${s.email}</option>
    `).join('');
  } else {
    select.innerHTML = `<option value="${state.user.id}">${state.user.full_name} (Self)</option>`;
  }
  
  document.getElementById("modal-assign-staff").classList.add("active");
}

async function submitAssignStaff(e) {
  e.preventDefault();
  const orderId = document.getElementById("assign-order-id").value;
  const staffId = parseInt(document.getElementById("assign-staff-select").value, 10);

  try {
    const res = await api(`/dealers/orders/${orderId}/assign-staff`, {
      method: "POST",
      body: JSON.stringify({ staff_id: staffId })
    });
    alert(res.message || "Order successfully assigned to staff!");
    closeModal("modal-assign-staff");
    renderDealers();
  } catch (err) {}
}

// Render Expenses Management View
let allExpenses = [];

async function renderExpenses() {
  const container = document.getElementById("tab-content");
  container.innerHTML = `<div style="padding: 20px;">Loading business expenses...</div>`;

  const [expenses, summary] = await Promise.all([
    api("/finance/expenses"),
    api("/finance/summary").catch(() => null)
  ]);

  allExpenses = expenses || [];
  const totalExp = allExpenses.reduce((sum, e) => sum + e.amount, 0);

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">${t("expenses_title", "Store Expenses & Overhead Management")}</h2>
        <p style="color: var(--text-muted); font-size: 13px;">Store: <b>${state.storeName || state.business.name}</b> • ${t("expenses_subtitle", "Track daily operational costs, salaries, rent, and packaging.")}</p>
      </div>
      <button class="btn btn-primary" onclick="openAddExpenseModal()">${t("record_expense_btn", "+ Record New Expense")}</button>
    </div>

    <!-- Expense Metrics Cards -->
    <div class="grid-cards" style="margin-bottom: 24px;">
      <div class="stat-card">
        <div class="stat-label">${t("total_expenses_recorded", "Total Expenses Recorded")}</div>
        <div class="stat-value" style="color: var(--coral);">₹${totalExp.toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
        <div class="stat-meta">${allExpenses.length} ${t("expense_entries", "expense entries")}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t("total_sales_collections", "Total Sales Collections")}</div>
        <div class="stat-value" style="color: var(--teal);">₹${(summary ? summary.total_collected : 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
        <div class="stat-meta">${t("cash_upi_card_receipts", "Cash + UPI + Card receipts")}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t("net_operating_cashflow", "Net Operating Cash Flow")}</div>
        <div class="stat-value" style="color: ${(summary && summary.net_cash_flow >= 0) ? 'var(--teal)' : 'var(--coral)'};">
          ₹${(summary ? summary.net_cash_flow : 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}
        </div>
        <div class="stat-meta">${t("collections_minus_expenses", "Collections minus expenses")}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t("accounts_receivable", "Accounts Receivable")}</div>
        <div class="stat-value" style="color: var(--amber);">₹${(summary ? summary.total_receivables : 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
        <div class="stat-meta">${t("pending_customer_dues", "Pending customer dues")}</div>
      </div>
    </div>

    <!-- Expenses Table Panel -->
    <div class="panel">
      <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div class="panel-title">${t("expense_transactions_log", "Expense Transactions Log")}</div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <label style="font-size: 12px; color: var(--text-muted);">${t("filter_category_label", "Filter Category:")}</label>
          <select id="expense-cat-filter" class="form-select" style="width: auto; padding: 4px 10px; font-size: 12.5px;" onchange="filterExpenses(this.value)">
            <option value="ALL">${t("all_categories", "All Categories")}</option>
            <option value="RENT">Rent & Premises</option>
            <option value="SALARY">Salaries & Wages</option>
            <option value="TEA_SNACKS">Tea, Snacks & Hospitality</option>
            <option value="PACKAGING">Packaging & Bags</option>
            <option value="ELECTRICITY">Electricity & Utilities</option>
            <option value="LOGISTICS">Transport & Freight</option>
            <option value="MARKETING">Marketing & Advertising</option>
            <option value="MAINTENANCE">Store Repairs & Maintenance</option>
            <option value="OTHER">Other Miscellaneous</option>
          </select>
        </div>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t("date_time_col", "Date & Time")}</th>
              <th>${t("category_col", "Category")}</th>
              <th>${t("desc_purpose_col", "Description / Purpose")}</th>
              <th>${t("payment_mode_col", "Payment Mode")}</th>
              <th>${t("receipt_col", "Receipt")}</th>
              <th style="text-align: right;">${t("amount_col", "Amount (₹)")}</th>
            </tr>
          </thead>
          <tbody id="expenses-table-body">
            ${renderExpenseRows(allExpenses)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderExpenseRows(list) {
  if (!list || list.length === 0) {
    return `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">${t("no_expenses_recorded", "No expenses recorded yet. Click '+ Record New Expense' to log costs.")}</td></tr>`;
  }
  return list.map(e => `
    <tr>
      <td><b>${e.date || 'Today'}</b></td>
      <td>
        <span class="badge ${getExpenseBadgeClass(e.category)}">${e.category}</span>
      </td>
      <td>${e.description || 'N/A'}</td>
      <td><span class="badge badge-neutral">${e.payment_mode}</span></td>
      <td>
        ${e.receipt_url ? `
          <a href="${e.receipt_url.startsWith('http') ? e.receipt_url : getBaseServerUrl() + e.receipt_url}" target="_blank" class="badge badge-neutral" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px; color: var(--teal); font-weight: 600;">
            📎 View Receipt
          </a>
        ` : '<span style="color: var(--text-muted); font-size: 11px;">No receipt</span>'}
      </td>
      <td style="text-align: right; font-weight: 800; color: var(--navy); font-size: 14px;">₹${e.amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
    </tr>
  `).join('');
}

function getExpenseBadgeClass(cat) {
  switch (cat) {
    case 'RENT': return 'badge-neutral';
    case 'SALARY': return 'badge-success';
    case 'TEA_SNACKS': return 'badge-warning';
    case 'PACKAGING': return 'badge-neutral';
    case 'ELECTRICITY': return 'badge-warning';
    default: return 'badge-neutral';
  }
}

function filterExpenses(cat) {
  const body = document.getElementById("expenses-table-body");
  if (!body) return;
  if (cat === "ALL") {
    body.innerHTML = renderExpenseRows(allExpenses);
  } else {
    const filtered = allExpenses.filter(e => e.category === cat);
    body.innerHTML = renderExpenseRows(filtered);
  }
}

function openAddExpenseModal() {
  document.getElementById("modal-add-expense").classList.add("active");
}

async function submitAddExpense(e) {
  e.preventDefault();
  const category = document.getElementById("exp-category").value;
  const amount = parseFloat(document.getElementById("exp-amount").value);
  const payment_mode = document.getElementById("exp-payment-mode").value;
  const description = document.getElementById("exp-description").value;

  if (isNaN(amount) || amount <= 0) {
    return alert("Please enter a valid expense amount greater than 0");
  }

  let receipt_url = null;
  const fileInput = document.getElementById("exp-receipt-file");
  if (fileInput && fileInput.files && fileInput.files[0]) {
    try {
      const formData = new FormData();
      formData.append("file", fileInput.files[0]);
      const uploadRes = await api("/finance/expenses/upload-receipt", {
        method: "POST",
        body: formData
      });
      receipt_url = uploadRes.receipt_url;
    } catch (upErr) {
      console.warn("Receipt upload notice:", upErr);
    }
  }

  try {
    await api("/finance/expenses", {
      method: "POST",
      body: JSON.stringify({
        category,
        amount,
        payment_mode,
        description,
        receipt_url
      })
    });
    alert(`Expense of ₹${amount.toFixed(2)} for '${category}' recorded successfully!`);
    closeModal("modal-add-expense");
    renderExpenses();
  } catch (err) {}
}

// Render Interactive App Flowcharts & System Architecture Guide
function renderFlowcharts() {
  const container = document.getElementById("tab-content");
  container.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h2 style="font-size: 22px; font-weight: 800; color: var(--navy);">VASTRENIX System Flowcharts & User Journeys</h2>
      <p style="color: var(--text-muted); font-size: 13.5px;">Complete visual blueprint of user entry, approval gates, POS shift lifecycles, and dealer order fulfillment.</p>
    </div>

    <!-- Section 1: Entry & Staff Approval Gate -->
    <div class="panel" style="margin-bottom: 24px;">
      <div class="panel-header">
        <div class="panel-title">1. Master Authentication & Store Staff Approval Gate</div>
      </div>
      <div style="padding: 20px 24px;">
        <div style="display: flex; gap: 14px; flex-wrap: wrap; align-items: center; justify-content: space-between; background: #FAF8F3; padding: 18px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
          <div style="flex: 1; min-width: 200px; text-align: center; padding: 12px; background: white; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--teal); font-weight: 700;">Step 1: Sign Up</div>
            <div style="font-weight: 800; color: var(--navy); margin: 4px 0;">Staff Self Registration</div>
            <div style="font-size: 12px; color: var(--text-muted);">Employee picks store from directory & requests role (Cashier / Dispatcher)</div>
          </div>
          <div style="font-size: 20px; color: var(--teal); font-weight: bold;">➔</div>
          <div style="flex: 1; min-width: 200px; text-align: center; padding: 12px; background: #FEF8ED; border-radius: var(--radius-sm); border: 1px solid var(--amber);">
            <div style="font-size: 11px; text-transform: uppercase; color: #8A5A1B; font-weight: 700;">Step 2: Gate Check</div>
            <div style="font-weight: 800; color: #8A5A1B; margin: 4px 0;">Approval Quarantine</div>
            <div style="font-size: 12px; color: #8A5A1B;">Staff login is strictly blocked until approved by the Store Admin</div>
          </div>
          <div style="font-size: 20px; color: var(--teal); font-weight: bold;">➔</div>
          <div style="flex: 1; min-width: 200px; text-align: center; padding: 12px; background: #E8F4F0; border-radius: var(--radius-sm); border: 1px solid rgba(33,140,130,0.3);">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--teal); font-weight: 700;">Step 3: Verification</div>
            <div style="font-weight: 800; color: var(--navy); margin: 4px 0;">Admin 1-Click Approval</div>
            <div style="font-size: 12px; color: var(--text-muted);">Store Owner reviews name/role and approves on Dashboard</div>
          </div>
          <div style="font-size: 20px; color: var(--teal); font-weight: bold;">➔</div>
          <div style="flex: 1; min-width: 200px; text-align: center; padding: 12px; background: var(--navy); color: white; border-radius: var(--radius-sm);">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--teal); font-weight: 700;">Step 4: Access</div>
            <div style="font-weight: 800; color: white; margin: 4px 0;">Store Access Granted</div>
            <div style="font-size: 12px; color: #9FB0BC;">Staff logs in and sees Store Name and assigned role</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: Dealer Order & Staff Assignment Flow -->
    <div class="panel" style="margin-bottom: 24px;">
      <div class="panel-header">
        <div class="panel-title">2. B2B Dealer Order Fulfillment & Staff Assignment Pipeline</div>
      </div>
      <div style="padding: 20px 24px;">
        <div style="display: flex; gap: 14px; flex-wrap: wrap; align-items: center; justify-content: space-between; background: #FAF8F3; padding: 18px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
          <div style="flex: 1; min-width: 180px; text-align: center; padding: 12px; background: white; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 700;">1. Order Received</div>
            <div style="font-weight: 800; color: var(--navy);">B2B Submission</div>
            <div style="font-size: 11.5px; color: var(--text-muted);">Buyer submits wholesale order with garment matrix</div>
          </div>
          <div style="font-size: 18px; color: var(--teal);">➔</div>
          <div style="flex: 1; min-width: 180px; text-align: center; padding: 12px; background: #E8F4F0; border-radius: var(--radius-sm); border: 1px solid rgba(33,140,130,0.3);">
            <div style="font-size: 11px; color: var(--teal); font-weight: 700;">2. Stock Reserved</div>
            <div style="font-weight: 800; color: var(--navy);">Atomic Reservation</div>
            <div style="font-size: 11.5px; color: var(--text-muted);">Stock moves from Available to Reserved automatically</div>
          </div>
          <div style="font-size: 18px; color: var(--teal);">➔</div>
          <div style="flex: 1; min-width: 180px; text-align: center; padding: 12px; background: #FEF8ED; border-radius: var(--radius-sm); border: 1px solid var(--amber);">
            <div style="font-size: 11px; color: #8A5A1B; font-weight: 700;">3. Assign Staff</div>
            <div style="font-weight: 800; color: #8A5A1B;">Picker / Dispatcher</div>
            <div style="font-size: 11.5px; color: #735022;">Admin assigns order to a specific employee for packaging</div>
          </div>
          <div style="font-size: 18px; color: var(--teal);">➔</div>
          <div style="flex: 1; min-width: 180px; text-align: center; padding: 12px; background: white; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 700;">4. Logistics</div>
            <div style="font-weight: 800; color: var(--navy);">LR Number Assigned</div>
            <div style="font-size: 11.5px; color: var(--text-muted);">Transporter & Lorry Receipt entered; inventory deducted</div>
          </div>
          <div style="font-size: 18px; color: var(--teal);">➔</div>
          <div style="flex: 1; min-width: 180px; text-align: center; padding: 12px; background: var(--teal); color: white; border-radius: var(--radius-sm);">
            <div style="font-size: 11px; color: #E8F4F0; font-weight: 700;">5. Delivered</div>
            <div style="font-weight: 800; color: white;">Stock Inward</div>
            <div style="font-size: 11.5px; color: #E8F4F0;">Buyer receives garments directly into local warehouse</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: Financial & Firebase Free Plan Blueprint -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">3. Store Financial Accounting Architecture</div>
        </div>
        <div style="padding: 18px 24px; font-size: 13px; line-height: 1.6;">
          <p style="margin-bottom: 12px;">VASTRENIX maintains an authoritative double-entry transaction trail:</p>
          <ul style="padding-left: 20px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 6px;">
            <li><b>Revenue Flow:</b> POS sales post to cash shifts with 6 customizable invoice templates.</li>
            <li><b>Expenses Flow:</b> Store expenses (Rent, Salaries, Logistics) recorded directly under branch finance.</li>
            <li><b>Reconciliation:</b> Expected Cash = Opening Cash + Cash Receipts - Cash Expenses.</li>
          </ul>
          <div style="background: var(--teal-light); padding: 10px 14px; border-radius: var(--radius-sm); font-size: 12px;">
            <b>Automated Reporting:</b> Net Operating Cash Flow is calculated in real time without manual spreadsheets.
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
          <div class="panel-title">4. Live Firebase Free (Spark) Services</div>
          <span class="badge badge-success">Connected: vastranix</span>
        </div>
        <div style="padding: 18px 24px; font-size: 13px; line-height: 1.6;">
          <div style="background: #E8F4F0; border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 14px; border: 1px solid rgba(33,140,130,0.25);">
            <div style="font-weight: 800; color: var(--navy); font-size: 13.5px; margin-bottom: 2px;">Firebase Spark Plan Active (100% Free)</div>
            <div style="font-size: 12px; color: var(--text-muted);">Configured with <code>google-services.json</code> and Service Account Key.</div>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #FAF8F3; border-radius: 4px;">
              <span><b>Cloud Messaging (FCM):</b> Unlimited Push Alerts</span>
              <span class="badge badge-success">Active (com.vastrenix.app)</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #FAF8F3; border-radius: 4px;">
              <span><b>Cloud Firestore:</b> Multi-Device Realtime Sync</span>
              <span class="badge badge-success">Connected</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #FAF8F3; border-radius: 4px;">
              <span><b>Cloud Storage:</b> 5 GB Catalog & PDF Bills</span>
              <span class="badge badge-success">vastrenix.firebasestorage.app</span>
            </div>
          </div>

          <div style="display: flex; gap: 10px;">
            <button class="btn btn-sm btn-navy" onclick="triggerTestPush()">⚡ Test Firebase Push</button>
            <button class="btn btn-sm btn-secondary" onclick="triggerTestStorage()">☁️ Test Cloud Storage</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function acceptDealerOrder(orderId, itemId, qty) {
  if (!confirm(`Accept order and atomically reserve ${qty} units of stock?`)) return;
  const accepted = {};
  if (itemId) accepted[itemId] = qty;
  const res = await api(`/dealers/orders/${orderId}/accept`, {
    method: "POST",
    body: JSON.stringify({ accepted_quantities: accepted })
  });
  if (res) {
    alert("Order accepted! Stock has been atomically reserved.");
    renderDealers();
  }
}

async function rejectDealerOrder(orderId) {
  const reason = prompt("Enter Rejection Reason:", "Fabric or color out of stock at loom");
  if (!reason) return;
  const res = await api(`/dealers/orders/${orderId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason: reason })
  });
  if (res) {
    alert(`Order rejected: ${res.rejection_reason || reason}`);
    renderDealers();
  }
}

async function moveDealerOrderProcessing(orderId) {
  const res = await api(`/dealers/orders/${orderId}/processing`, { method: "POST" });
  if (res) {
    alert("Order moved to Processing / Picking stage.");
    renderDealers();
  }
}

async function moveDealerOrderPacked(orderId) {
  const res = await api(`/dealers/orders/${orderId}/pack`, { method: "POST" });
  if (res) {
    alert("Order marked Packed and ready for logistics dispatch.");
    renderDealers();
  }
}

async function dispatchDealerOrder(orderId) {
  const transporter = prompt("Enter Transporter Name:", "VRL Logistics Express");
  if (!transporter) return;
  const lr = prompt("Enter Lorry Receipt (LR) Number:", "LR-9988-7711");
  if (!lr) return;

  const res = await api(`/dealers/orders/${orderId}/dispatch`, {
    method: "POST",
    body: JSON.stringify({ transporter_name: transporter, lr_number: lr })
  });
  if (res) {
    alert("Order dispatched! Stock deducted from inventory and buyer notified.");
    renderDealers();
  }
}

async function confirmDealerOrderDelivered(orderId) {
  if (!confirm("Confirm delivery of goods? This will automatically receive stock into your store branch inventory.")) return;
  const res = await api(`/dealers/orders/${orderId}/deliver`, { method: "POST" });
  if (res) {
    alert("Delivery confirmed! Goods received and added to your store branch inventory.");
    renderDealers();
  }
}

async function closeDealerOrder(orderId) {
  const res = await api(`/dealers/orders/${orderId}/close`, { method: "POST" });
  if (res) {
    alert("Order closed and archived.");
    renderDealers();
  }
}

async function triggerTestPush() {
  try {
    const res = await api("/sync/firebase/test-push", { method: "POST" });
    alert(`Firebase Push Dispatched!\nStatus: ${res.result?.status || 'SENT'}\nTitle: ${res.result?.title || 'VASTRENIX Live Sync'}`);
  } catch (err) {}
}

async function triggerTestStorage() {
  try {
    const res = await api("/sync/firebase/test-storage", { method: "POST" });
    alert(`Firebase Cloud Storage Test Completed!\nBucket: ${res.result?.bucket || 'vastrenix.firebasestorage.app'}\nStatus: ${res.result?.status}`);
  } catch (err) {}
}

// Render Users & Staff Team Management View
async function renderUsers() {
  const container = document.getElementById("tab-content");
  container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--navy);">Loading store team and users...</div>`;

  const [staffList, pendingStaff] = await Promise.all([
    api("/auth/staff").catch(() => offlineDB.staff),
    api("/auth/pending-staff").catch(() => [])
  ]);

  const list = (staffList && staffList.length > 0) ? staffList : offlineDB.staff;
  const pending = pendingStaff || [];

  const cashiersCount = list.filter(s => s.role === 'CASHIER').length;
  const dispatchersCount = list.filter(s => s.role === 'DISPATCHER').length;

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 14px;">
      <div>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
          <h2 style="font-size: 22px; font-weight: 800; color: var(--navy);">${t("team_title", "Store Team & User Accounts")}</h2>
          <span class="badge badge-success">${list.length} ${t("members_count_label", "Members")}</span>
        </div>
        <p style="color: var(--text-muted); font-size: 13px;">Store: <b>${state.storeName || state.business.name}</b> • ${t("team_subtitle", "Manage employee roles, counter cashiers, and logistics dispatchers.")}</p>
      </div>
      <button class="btn btn-primary" onclick="openAddStaffModal()">${t("add_team_member_btn", "+ Add Team Member")}</button>
    </div>

    <!-- Staff Summary Metrics -->
    <div class="grid-cards" style="margin-bottom: 24px;">
      <div class="stat-card">
        <div class="stat-label">${t("total_store_team", "Total Store Team")}</div>
        <div class="stat-value" style="color: var(--navy);">${list.length}</div>
        <div class="stat-meta">Active registered accounts</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t("active_cashiers", "POS Counter Cashiers")}</div>
        <div class="stat-value" style="color: var(--teal);">${cashiersCount}</div>
        <div class="stat-meta">${t("pos_till_operators", "POS counter till operators")}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t("dispatchers_picking", "Logistics & Dispatch")}</div>
        <div class="stat-value" style="color: #0284C7;">${dispatchersCount}</div>
        <div class="stat-meta">${t("b2b_staff", "Order packing & LR dispatch")}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t("pending_approvals_metric", "Pending Registrations")}</div>
        <div class="stat-value" style="color: ${pending.length > 0 ? 'var(--amber)' : 'var(--teal)'};">${pending.length}</div>
        <div class="stat-meta">${pending.length > 0 ? 'Requires admin approval' : 'All accounts approved'}</div>
      </div>
    </div>

    <!-- Pending Staff Approvals Banner -->
    ${pending.length > 0 ? `
      <div class="panel" style="border: 1px solid var(--amber); background: #FFFDF9; margin-bottom: 24px;">
        <div class="panel-header" style="background: #FEF8ED; border-bottom: 1px solid #F5E5C9;">
          <div class="panel-title" style="color: #8A5A1B;">
            <span>⚠️</span> Pending Staff Approvals (${pending.length})
          </div>
        </div>
        <div style="padding: 16px 20px; display: flex; flex-direction: column; gap: 12px;">
          ${pending.map(s => `
            <div style="background: white; border: 1px solid #EADBCA; border-radius: var(--radius-sm); padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div>
                <div style="font-weight: 800; font-size: 14px; color: var(--navy);">${s.full_name}</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                  ${s.email} • Requested Role: <span class="badge badge-warning">${s.role}</span> • Phone: ${s.phone || 'N/A'}
                </div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-sm btn-primary" onclick="approveStaffMember(${s.membership_id}, '${s.full_name.replace(/'/g, "\\'")}')">✓ Approve</button>
                <button class="btn btn-sm btn-secondary" onclick="rejectStaffMember(${s.membership_id})">${t("reject_staff_btn", "✕ Reject")}</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Active Team Directory Panel -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">Active Store Team Directory</div>
        <span class="badge badge-neutral">${list.length} Members</span>
      </div>
      
      <!-- Responsive Mobile-Friendly Staff Cards -->
      <div class="staff-grid" style="padding: 18px;">
        ${list.map(s => `
          <div class="staff-card">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #249A8F, #115E59); color: white; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; box-shadow: 0 4px 10px rgba(33, 140, 130, 0.3);">
                  ${(s.full_name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style="font-weight: 800; font-size: 14.5px; color: var(--navy);">${s.full_name}</div>
                  <div style="font-size: 11.5px; color: var(--text-muted);">${s.email}</div>
                </div>
              </div>
              <span class="badge ${getRoleBadgeClass(s.role)}">${s.role}</span>
            </div>
            
            <div style="background: #FAF8F3; border-radius: var(--radius-sm); padding: 10px 12px; font-size: 12px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 5px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">Assigned Branch:</span>
                <span style="font-weight: 700; color: var(--navy);">${s.branch_name || 'Surat Main Flagship'}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">Contact Phone:</span>
                <span style="font-weight: 600;">${s.phone || '+91 98XXX XXXXX'}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">Account Status:</span>
                <span style="color: ${s.is_active !== false ? 'var(--teal)' : 'var(--coral)'}; font-weight: 700;">● ${s.is_active !== false ? 'Active' : 'Deactivated'}</span>
              </div>
            </div>

            <div style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;">
              ${s.role !== 'OWNER' ? `
                <button class="btn btn-sm btn-secondary" onclick="changeStaffRole(${s.membership_id}, '${s.full_name.replace(/'/g, "\\'")}', '${s.role}')">Change Role</button>
                <button class="btn btn-sm ${s.is_active !== false ? 'btn-secondary' : 'btn-primary'}" onclick="toggleStaffStatus(${s.membership_id}, '${s.full_name.replace(/'/g, "\\'")}', ${s.is_active !== false})">
                  ${s.is_active !== false ? 'Deactivate' : 'Activate'}
                </button>
                <button class="btn btn-sm btn-secondary" style="color: var(--coral);" onclick="revokeStaffSessions(${s.membership_id}, '${s.full_name.replace(/'/g, "\\'")}')">Revoke Session</button>
              ` : `
                <span class="badge badge-neutral" style="font-size: 11px;">Primary Owner</span>
              `}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function toggleStaffStatus(membershipId, staffName, currentActive) {
  const action = currentActive ? "deactivate" : "activate";
  if (!confirm(`Are you sure you want to ${action} ${staffName}?`)) return;
  try {
    await api(`/auth/staff/${membershipId}/toggle-status`, { method: "POST" });
    alert(`Staff member ${staffName} has been ${action}d successfully.`);
    renderUsers();
  } catch (err) {}
}

async function changeStaffRole(membershipId, staffName, currentRole) {
  const newRole = prompt(`Change role for ${staffName}\nAllowed roles: CASHIER, DISPATCHER, INVENTORY_MGR, ADMIN`, currentRole);
  if (!newRole) return;
  const cleanedRole = newRole.trim().toUpperCase();
  if (cleanedRole === currentRole) return;
  const validRoles = ["CASHIER", "DISPATCHER", "INVENTORY_MGR", "ADMIN"];
  if (!validRoles.includes(cleanedRole)) {
    return alert(`Invalid role '${cleanedRole}'. Please enter one of: ${validRoles.join(", ")}`);
  }
  try {
    await api(`/auth/staff/${membershipId}/role`, {
      method: "POST",
      body: JSON.stringify({ role: cleanedRole })
    });
    alert(`Role for ${staffName} updated to ${cleanedRole}!`);
    renderUsers();
  } catch (err) {}
}

async function revokeStaffSessions(membershipId, staffName) {
  if (!confirm(`Revoke all active login sessions for ${staffName}? The user will be required to re-authenticate.`)) return;
  try {
    const res = await api(`/auth/staff/${membershipId}/revoke-sessions`, { method: "POST" });
    alert(res.message || `Sessions revoked for ${staffName}.`);
    renderUsers();
  } catch (err) {}
}

function getRoleBadgeClass(role) {
  switch (role) {
    case 'OWNER': return 'badge-neutral';
    case 'CASHIER': return 'badge-success';
    case 'DISPATCHER': return 'badge-warning';
    case 'INVENTORY_MGR': return 'badge-neutral';
    default: return 'badge-neutral';
  }
}

function openAddStaffModal() {
  document.getElementById("modal-add-staff").classList.add("active");
}

async function submitAddStaff(event) {
  event.preventDefault();
  const name = document.getElementById("staff-add-name").value;
  const email = document.getElementById("staff-add-email").value;
  const phone = document.getElementById("staff-add-phone").value;
  const role = document.getElementById("staff-add-role").value;
  const password = document.getElementById("staff-add-password").value;

  try {
    await api("/auth/staff", {
      method: "POST",
      body: JSON.stringify({
        email,
        full_name: name,
        password,
        role
      })
    });
    alert(`Staff member '${name}' created successfully with role '${role}'!`);
    closeModal("modal-add-staff");
    renderUsers();
  } catch (err) {}
}

// Mobile Drawer and Android Native Back Navigation Handlers
function toggleMobileDrawer() {
  const drawer = document.getElementById("mobile-drawer");
  const overlay = document.getElementById("mobile-drawer-overlay");
  if (drawer && overlay) {
    drawer.classList.toggle("open");
    overlay.classList.toggle("open");
  }
}

function closeMobileDrawer() {
  const drawer = document.getElementById("mobile-drawer");
  const overlay = document.getElementById("mobile-drawer-overlay");
  if (drawer && overlay) {
    drawer.classList.remove("open");
    overlay.classList.remove("open");
  }
}

function handleAndroidBack() {
  // 1. Close any open modal
  const activeModal = document.querySelector(".modal-overlay.active");
  if (activeModal) {
    activeModal.classList.remove("active");
    return true;
  }
  // 2. Close mobile drawer if open
  const drawer = document.getElementById("mobile-drawer");
  if (drawer && drawer.classList.contains("open")) {
    closeMobileDrawer();
    return true;
  }
  // 3. Go back to dashboard if on another tab
  if (state.activeTab !== "dashboard") {
    switchTab("dashboard");
    return true;
  }
  // 4. Return false to exit app
  return false;
}

function drawerNav(tab) {
  closeMobileDrawer();
  switchTab(tab);
}

function switchTab(tab) {
  state.activeTab = tab;
  // Update desktop sidebar
  document.querySelectorAll(".nav-link").forEach(el => {
    el.classList.toggle("active", el.getAttribute("data-tab") === tab);
  });
  // Update mobile bottom nav
  document.querySelectorAll(".mobile-nav-btn").forEach(el => {
    el.classList.toggle("active", el.getAttribute("data-tab") === tab);
  });
  // Update mobile drawer links
  document.querySelectorAll(".mobile-drawer-link").forEach(el => {
    el.classList.toggle("active", el.getAttribute("data-tab") === tab);
  });
  // Close mobile drawer if open
  closeMobileDrawer();
  renderCurrentTab();
  updateOfflineIndicator();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function changeLanguage(lang) {
  state.lang = lang;
  localStorage.setItem("vastrenix_lang", lang);
  renderApp();
}

function renderCurrentTab() {
  switch (state.activeTab) {
    case "dashboard": renderDashboard(); break;
    case "inventory": renderInventory(); break;
    case "pos": renderPOS(); break;
    case "invoices": renderInvoices(); break;
    case "dealers": renderDealers(); break;
    case "expenses": renderExpenses(); break;
    case "users": renderUsers(); break;
    case "flowcharts": renderFlowcharts(); break;
    default: renderDashboard(); break;
  }
}

function openAddProductModal() {
  const name = document.getElementById("prod-name");
  const fabric = document.getElementById("prod-fabric");
  const price = document.getElementById("prod-price");
  const cost = document.getElementById("prod-cost");
  const size = document.getElementById("prod-size");
  const color = document.getElementById("prod-color");
  const stock = document.getElementById("prod-stock");
  if (name) name.value = "";
  if (fabric) fabric.value = "";
  if (price) price.value = "";
  if (cost) cost.value = "";
  if (size) size.value = "";
  if (color) color.value = "";
  if (stock) stock.value = "";
  document.getElementById("modal-add-product").classList.add("active");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("active");
}

async function submitAddProduct(event) {
  event.preventDefault();
  const btn = event.target.querySelector('button[type="submit"]');
  const originalText = btn ? btn.textContent : "Save & Create Garment";
  if (btn) { btn.disabled = true; btn.textContent = "Saving Garment..."; }

  const name = document.getElementById("prod-name").value.trim();
  const fabric = document.getElementById("prod-fabric").value.trim();
  const price = parseFloat(document.getElementById("prod-price").value);
  const cost = parseFloat(document.getElementById("prod-cost").value);
  const size = document.getElementById("prod-size").value.trim();
  const color = document.getElementById("prod-color").value.trim();
  const stock = parseInt(document.getElementById("prod-stock").value, 10);

  const sku = `${name.replace(/\s+/g, '-').toUpperCase().slice(0, 8)}-${size}-${color.slice(0, 3).toUpperCase()}`;

  try {
    await api("/products/", {
      method: "POST",
      body: JSON.stringify({
        name,
        fabric,
        hsn_sac: "6205",
        tax_rate: 5.0,
        variants: [{
          sku,
          size,
          color,
          retail_price: price,
          purchase_cost: cost,
          initial_stock: stock,
          min_stock_alert: 3
        }]
      })
    });

    showToast("Garment product created successfully!");
    closeModal("modal-add-product");
    if (state.activeTab !== "inventory") {
      switchTab("inventory");
    } else {
      renderInventory();
    }
  } catch (err) {
    showToast("Failed to create garment: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

// Purchase Orders (Order More) & Goods Receipt Note (Receive Stock)
let currentPoVariantId = null;

async function openPurchaseOrderModal(variantId, productName, sku) {
  currentPoVariantId = variantId;
  const nameEl = document.getElementById("po-product-display");
  if (nameEl) nameEl.textContent = `${productName} (${sku})`;

  const suppSelect = document.getElementById("po-supplier-select");
  if (suppSelect) {
    suppSelect.innerHTML = `<option value="1">Primary Surat Textile Mill</option>`;
    try {
      const suppliers = await api("/purchases/suppliers");
      if (suppliers && suppliers.length > 0) {
        suppSelect.innerHTML = suppliers.map(s => `<option value="${s.id}">${s.name} (${s.city || 'India'})</option>`).join('');
      }
    } catch (e) {
      // Fallback already rendered
    }
  }
  const qtyInput = document.getElementById("po-quantity");
  const costInput = document.getElementById("po-unit-cost");
  const notesInput = document.getElementById("po-notes");
  if (qtyInput) qtyInput.value = "20";
  if (costInput) costInput.value = "1200.00";
  if (notesInput) notesInput.value = "Store inventory replenishment";

  document.getElementById("modal-purchase-order").classList.add("active");
}

async function submitPurchaseOrder(event) {
  event.preventDefault();
  const btn = event.target.querySelector('button[type="submit"]');
  const originalText = btn ? btn.textContent : "Issue Purchase Order";
  if (btn) { btn.disabled = true; btn.textContent = "Issuing PO..."; }

  const supplierId = parseInt(document.getElementById("po-supplier-select").value, 10) || 1;
  const quantity = parseInt(document.getElementById("po-quantity").value, 10);
  const unitCost = parseFloat(document.getElementById("po-unit-cost").value);
  const notes = document.getElementById("po-notes").value;

  try {
    const res = await api("/purchases/orders", {
      method: "POST",
      body: JSON.stringify({
        supplier_id: supplierId,
        items: [{
          variant_id: currentPoVariantId || 101,
          quantity: quantity,
          unit_cost: unitCost,
          tax_rate: 5.0
        }],
        notes: notes
      })
    });
    showToast(`Purchase Order ${res.po_number || ''} issued successfully!`);
    closeModal("modal-purchase-order");
    renderInventory();
  } catch (err) {
    showToast("Error creating purchase order: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

async function openReceiveGoodsModal(variantId, productName, sku) {
  currentPoVariantId = variantId;
  const nameEl = document.getElementById("grn-product-display");
  if (nameEl) nameEl.textContent = `${productName} (${sku})`;

  const poSelect = document.getElementById("grn-po-select");
  if (poSelect) {
    poSelect.innerHTML = `<option value="0">Direct Warehouse Stock Receipt</option>`;
    try {
      const orders = await api("/purchases/orders");
      const pendingOrders = (orders || []).filter(o => o.status !== "COMPLETED");
      if (pendingOrders.length > 0) {
        poSelect.innerHTML = pendingOrders.map(o => `<option value="${o.id}">${o.po_number} - ${o.supplier_name} (₹${o.total_amount})</option>`).join('');
      }
    } catch (e) {
      // Fallback
    }
  }
  const invInput = document.getElementById("grn-invoice-no");
  const notesInput = document.getElementById("grn-notes");
  if (invInput) invInput.value = `INV-${Date.now().toString().slice(-6)}`;
  if (notesInput) notesInput.value = "Received in warehouse in good condition";

  document.getElementById("modal-receive-goods").classList.add("active");
}

async function submitReceiveGoods(event) {
  event.preventDefault();
  const btn = event.target.querySelector('button[type="submit"]');
  const originalText = btn ? btn.textContent : "Confirm & Add to Stock";
  if (btn) { btn.disabled = true; btn.textContent = "Receiving Stock..."; }

  let poId = parseInt(document.getElementById("grn-po-select").value, 10);
  const invNo = document.getElementById("grn-invoice-no").value;
  const notes = document.getElementById("grn-notes").value;

  try {
    if (!poId || poId <= 0) {
      // Auto-issue a PO to link GRN cleanly
      const quickPo = await api("/purchases/orders", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: 1,
          items: [{ variant_id: currentPoVariantId || 101, quantity: 10, unit_cost: 1000.00, tax_rate: 5.0 }],
          notes: "Direct stock delivery"
        })
      });
      poId = quickPo.po_id || 1;
    }

    const res = await api("/purchases/grn", {
      method: "POST",
      body: JSON.stringify({
        purchase_order_id: poId,
        supplier_invoice_no: invNo,
        notes: notes
      })
    });
    showToast(`Stock received (${res.grn_number || 'GRN Recorded'}) into inventory!`);
    closeModal("modal-receive-goods");
    renderInventory();
  } catch (err) {
    showToast("Error processing GRN: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

let devTapCount = 0;
let devTapTimeout = null;
function handleDevLogoTap() {
  devTapCount++;
  if (devTapTimeout) clearTimeout(devTapTimeout);
  if (devTapCount >= 5) {
    devTapCount = 0;
    openServerSettingsModal();
    return;
  }
  devTapTimeout = setTimeout(() => { devTapCount = 0; }, 1800);
}
function handleDevLogoHold(e) {
  e.preventDefault();
  openStoreSettingsModal();
}

let versionSecretTapCount = 0;
let versionSecretTapTimeout = null;
function handleVersionSecretTap() {
  versionSecretTapCount++;
  console.log(`[DEV-SECRET] Version tap: ${versionSecretTapCount}/7`);
  if (versionSecretTapTimeout) clearTimeout(versionSecretTapTimeout);

  if (versionSecretTapCount >= 7) {
    versionSecretTapCount = 0;
    closeModal("modal-store-settings");
    openServerSettingsModal();
    showToast("Developer Server Settings unlocked");
    return;
  }
  versionSecretTapTimeout = setTimeout(() => {
    versionSecretTapCount = 0;
  }, 3000);
}

function openStoreSettingsModal() {
  const modal = document.getElementById("modal-store-settings");
  if (!modal) return;
  const payModeSelect = document.getElementById("settings-default-payment-mode");
  if (payModeSelect) payModeSelect.value = state.defaultPaymentMode || "CASH";
  const themeSelect = document.getElementById("settings-default-theme");
  if (themeSelect) themeSelect.value = state.selectedPOSTheme || "PREMIUM_BOUTIQUE";

  const titleLbl = document.getElementById("settings-title-label");
  if (titleLbl) titleLbl.textContent = t("settings_modal_title", "Store & POS Settings");
  const payModeLbl = document.getElementById("settings-paymode-label");
  if (payModeLbl) payModeLbl.textContent = t("default_pay_mode_label", "Default POS Payment Mode");
  const themeLbl = document.getElementById("settings-theme-label");
  if (themeLbl) themeLbl.textContent = t("default_theme_label", "Default Invoice Theme");
  const checkBtn = document.getElementById("settings-check-status-btn");
  if (checkBtn) checkBtn.textContent = t("check_status_btn", "Check Status");
  const doneBtn = document.getElementById("settings-done-btn");
  if (doneBtn) doneBtn.textContent = t("done_btn", "Done");

  updateSettingsConnectionDisplay();
  modal.classList.add("active");
}

async function checkSettingsConnection() {
  const dot = document.getElementById("settings-conn-dot");
  const text = document.getElementById("settings-conn-text");
  const meta = document.getElementById("settings-conn-meta");
  const btn = document.getElementById("settings-check-status-btn");
  if (btn) btn.disabled = true;
  if (text) text.textContent = t("connecting_cloud", "Checking connection to VASTRENIX Cloud...");
  if (dot) {
    dot.style.background = "#F59E0B";
    dot.style.boxShadow = "0 0 8px #F59E0B";
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${getBaseServerUrl()}/health`, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timer);
    const elapsed = Date.now() - startTime;
    if (res.ok) {
      state.isServerConnected = true;
      state.isServerWarm = true;
      state.lastHealthCheckTime = new Date();
      updateSettingsConnectionDisplay(true, elapsed);
    } else {
      updateSettingsConnectionDisplay(false, null, `Server responded with HTTP ${res.status}`);
    }
  } catch (err) {
    const msg = !navigator.onLine ? t("device_offline_msg", "No internet connection detected.") : (err.name === "AbortError" ? "Connection timed out (>10s)" : err.message);
    updateSettingsConnectionDisplay(false, null, msg);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function updateSettingsConnectionDisplay(isOnline = state.isServerConnected, latencyMs = null, errorMsg = null) {
  const dot = document.getElementById("settings-conn-dot");
  const text = document.getElementById("settings-conn-text");
  const meta = document.getElementById("settings-conn-meta");
  if (!text) return;

  if (isOnline) {
    if (dot) {
      dot.style.background = "#10B981";
      dot.style.boxShadow = "0 0 8px #10B981";
    }
    text.textContent = t("connected_status", "Connected to VASTRENIX Cloud");
    text.style.color = "var(--navy)";
    const timeStr = state.lastHealthCheckTime ? state.lastHealthCheckTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now";
    const pingStr = latencyMs !== null ? ` (${latencyMs}ms)` : "";
    if (meta) meta.textContent = `Online and verified at ${timeStr}${pingStr}. All store operations active.`;
  } else {
    if (dot) {
      dot.style.background = "#EF4444";
      dot.style.boxShadow = "0 0 8px #EF4444";
    }
    text.textContent = t("disconnected_status", "Disconnected (Offline / Reconnecting)");
    text.style.color = "#DC2626";
    if (meta) meta.textContent = errorMsg || t("conn_active_meta", "Unable to reach server. Local offline till mode is active.");
  }
}

function setDefaultPaymentMode(mode) {
  state.defaultPaymentMode = mode;
  localStorage.setItem("vastrenix_default_payment_mode", mode);
  showToast(`Default POS Payment Mode set to '${mode}'`);
  const posHidden = document.getElementById("pos-payment-mode");
  if (posHidden) selectPaymentMode(mode);
}

function setSettingsDefaultTheme(themeId) {
  selectPOSTheme(themeId);
  selectStoreDefaultTheme(themeId);
}

// Render Main App or Authentication Gate
window.addEventListener("keydown", (e) => {
  // ESC closes any active modal
  if (e.key === "Escape") {
    const activeModal = document.querySelector(".modal-overlay.active");
    if (activeModal) {
      activeModal.classList.remove("active");
      return;
    }
  }

  // POS specific shortcuts when cashier is on the POS tab
  if (state.currentTab === "pos") {
    if (e.key === "F2") {
      e.preventDefault();
      const s = document.getElementById("pos-search");
      if (s) { s.focus(); s.select(); }
    } else if (e.key === "F4") {
      e.preventDefault();
      completePOSSale();
    } else if (e.key === "F8") {
      e.preventDefault();
      clearCart();
    }
  }
});

const AppState = {
  LAUNCHING: "LAUNCHING",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  CONNECTION_FAILED: "CONNECTION_FAILED"
};

let currentAppState = AppState.LAUNCHING;
let launchColdStartTimer = null;
let launchColdStartInterval = null;
let launchElapsedSeconds = 0;

function setAppState(newState, metadata = {}) {
  currentAppState = newState;
  console.log(`[APP-STATE] -> ${newState}`, metadata);

  const splash = document.getElementById("vastrenix-splash-screen");
  const pBar = document.getElementById("splash-progress-bar");
  const icon1 = document.getElementById("chk-icon-1");
  const icon2 = document.getElementById("chk-icon-2");
  const icon3 = document.getElementById("chk-icon-3");
  const step2 = document.getElementById("chk-step-2");
  const step3 = document.getElementById("chk-step-3");
  const actionContainer = document.getElementById("splash-action-container");

  const greenCheckSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  if (newState === AppState.LAUNCHING || newState === AppState.CONNECTING) {
    if (splash) {
      splash.style.display = "flex";
      splash.classList.remove("splash-fade-out");
    }
    if (actionContainer) actionContainer.style.display = "none";
    if (pBar) pBar.style.width = "40%";
    if (icon1) {
      icon1.style.background = "transparent";
      icon1.style.border = "2px solid #5B3DF5";
      icon1.style.borderTopColor = "transparent";
      icon1.style.animation = "splashSpin 0.9s linear infinite";
      icon1.innerHTML = "";
    }
  } else if (newState === AppState.CONNECTED) {
    if (launchColdStartTimer) clearTimeout(launchColdStartTimer);
    if (launchColdStartInterval) clearInterval(launchColdStartInterval);
    if (pBar) pBar.style.width = "100%";
    
    // Step 1: Server reachable
    if (icon1) {
      icon1.style.background = "#0E7C58";
      icon1.style.border = "none";
      icon1.style.animation = "none";
      icon1.innerHTML = greenCheckSvg;
    }
    // Step 2: Restoring your session
    if (step2) step2.style.color = "#FFFFFF";
    if (icon2) {
      icon2.style.background = "#0E7C58";
      icon2.style.border = "none";
      icon2.style.animation = "none";
      icon2.innerHTML = greenCheckSvg;
    }
    // Step 3: Syncing today's store data
    if (step3) step3.style.color = "#FFFFFF";
    if (icon3) {
      icon3.style.background = "#0E7C58";
      icon3.style.border = "none";
      icon3.style.animation = "none";
      icon3.innerHTML = greenCheckSvg;
    }
    if (actionContainer) actionContainer.style.display = "none";

    setTimeout(() => {
      dismissSplashScreen();
    }, 450);
  } else if (newState === AppState.CONNECTION_FAILED) {
    if (launchColdStartTimer) clearTimeout(launchColdStartTimer);
    if (launchColdStartInterval) clearInterval(launchColdStartInterval);
    if (pBar) {
      pBar.style.width = "100%";
      pBar.style.background = "#C8283C";
    }
    if (icon1) {
      icon1.style.background = "#C8283C";
      icon1.style.border = "none";
      icon1.style.animation = "none";
      icon1.style.color = "#FFFFFF";
      icon1.style.fontSize = "12px";
      icon1.style.fontWeight = "bold";
      icon1.innerHTML = "✕";
    }
    if (actionContainer) {
      actionContainer.style.display = "flex";
      actionContainer.style.flexDirection = "column";
      actionContainer.style.gap = "10px";
      actionContainer.innerHTML = `
        <button type="button" class="btn btn-primary" onclick="startAppLaunchSequence()" style="width: 100%; height: 48px; font-weight: 700; background: var(--vastra-violet); border: none; border-radius: var(--radius-button); color: #FFF; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span>Retry Connection</span>
        </button>
        <button type="button" onclick="enterOfflineTillMode()" style="width: 100%; height: 44px; font-size: 14px; font-weight: 600; background: #1C1B24; color: #FFFFFF; border: 1px solid #2B2A36; border-radius: var(--radius-button); cursor: pointer;">
          Open Offline POS Till
        </button>
      `;
    }
  }
}


async function startAppLaunchSequence() {
  setAppState(AppState.CONNECTING, {
    title: "Connecting to server...",
    sub: ""
  });

  launchElapsedSeconds = 0;
  if (launchColdStartInterval) clearInterval(launchColdStartInterval);
  launchColdStartInterval = setInterval(() => {
    launchElapsedSeconds++;
    const statusText = document.getElementById("splash-status-text");
    const subText = document.getElementById("splash-sub-text");
    if (launchElapsedSeconds >= 6) {
      if (statusText) {
        statusText.textContent = "Connecting to server...";
      }
      if (subText) {
        subText.textContent = `Waking up cloud server (${launchElapsedSeconds}s)...`;
      }
    }
  }, 1000);

  const startTime = Date.now();
  const url = `${getBaseServerUrl()}/health`;
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), 65000); // 65 seconds max timeout

  try {
    let resStatus = 0;
    try {
      const res = await fetch(url, { method: "GET", signal: controller.signal });
      resStatus = res.status;
    } catch (fetchErr) {
      // If WebView CORS or native file:// restriction, try Native Bridge
      if (window.VastrenixNative && typeof window.VastrenixNative.fetchNative === "function") {
        try {
          const nativeRaw = window.VastrenixNative.fetchNative(url, "GET", "{}", "");
          if (nativeRaw) {
            const parsed = JSON.parse(nativeRaw);
            if (parsed && parsed.status > 0) {
              resStatus = parsed.status;
            }
          }
        } catch (nativeErr) {
          console.warn("[LAUNCH] Native bridge failed: " + nativeErr.message);
        }
      }
      if (!resStatus) throw fetchErr;
    }

    clearTimeout(timeoutTimer);
    clearInterval(launchColdStartInterval);

    if (resStatus === 200) {
      state.isServerConnected = true;
      state.isServerWarm = true;
      state.lastHealthCheckTime = new Date();
      setAppState(AppState.CONNECTED);
      try {
        renderApp();
      } catch (err) {
        console.error("renderApp error after connected:", err);
      }
    } else {
      setAppState(AppState.CONNECTION_FAILED, {
        error: `Server responded with unexpected status (${resStatus}). Please tap Retry.`
      });
    }
  } catch (err) {
    clearTimeout(timeoutTimer);
    clearInterval(launchColdStartInterval);

    let reason = "Server is not responding. Please retry shortly.";
    if (!navigator.onLine) {
      reason = t("device_offline_msg", "No internet connection detected on your device. Please verify your Wi-Fi or mobile data.");
    } else if (err.name === "AbortError" || launchElapsedSeconds >= 60) {
      reason = t("server_slow_msg", "Server cold-start timed out (>60s). It may still be booting. Please tap Retry.");
    } else if (err.message) {
      reason = err.message.includes("Failed to fetch") 
        ? "Network connection to server failed. Please check internet or retry."
        : err.message;
    }
    setAppState(AppState.CONNECTION_FAILED, { error: reason });
  }
}

function enterOfflineTillMode() {
  dismissSplashScreen();
  state.isServerConnected = false;
  state.isOffline = true;
  showToast("Offline POS Till Mode active. Sales will be saved locally.");
  renderApp();
}

function dismissSplashScreen() {
  const splash = document.getElementById("vastrenix-splash-screen");
  if (splash && !splash.classList.contains("splash-fade-out")) {
    splash.classList.add("splash-fade-out");
    setTimeout(() => {
      splash.style.display = "none";
    }, 500);
  }
}

// Deterministic app launch sequence: probe server connection FIRST before displaying app/login
if (document.readyState === "complete" || document.readyState === "interactive") {
  startAppLaunchSequence();
} else {
  window.addEventListener("DOMContentLoaded", () => {
    startAppLaunchSequence();
  });
}



// ============================================================================
// LUCIDE ICON ENGINE (Exact 1.75px stroke, outline only, ISC License)
// ============================================================================
function lucideIcon(name, size = 20, stroke = 1.75, color = "currentColor", className = "") {
  const icons = {
    "home": '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
    "shirt": '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path>',
    "truck": '<rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>',
    "grid": '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect>',
    "wallet": '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    "clock": '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
    "alert-triangle": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
    "package": '<path d="m16.5 9.4-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',
    "arrow-left-right": '<path d="m9 7-5 5 5 5"></path><path d="m15 17 5-5-5-5"></path><path d="M4 12h16"></path>',
    "receipt": '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"></path><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><path d="M12 17.5v.5"></path><path d="M12 6v.5"></path>',
    "cash": '<rect width="20" height="12" x="2" y="6" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path>',
    "building": '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"></path><path d="M6 12H4a2 2 0 0 0-2 2v8h4"></path><path d="M18 12h2a2 2 0 0 1 2 2v8h-4"></path><path d="M10 6h4"></path><path d="M10 10h4"></path><path d="M10 14h4"></path><path d="M10 18h4"></path>',
    "store": '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"></path><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"></path><path d="M2 7h20"></path><path d="M22 7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2"></path>',
    "bar-chart": '<path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path>',
    "network": '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>',
    "palette": '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.992 6.5 17.5 2 12 2z"></path>',
    "settings": '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle>',
    "search": '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
    "scan": '<path d="M3 7V5a2 2 0 0 1 2-2h2"></path><path d="M17 3h2a2 2 0 0 1 2 2v2"></path><path d="M21 17v2a2 2 0 0 1-2 2h-2"></path><path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>',
    "bell": '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>',
    "qr-code": '<rect width="5" height="5" x="3" y="3" rx="1"></rect><rect width="5" height="5" x="16" y="3" rx="1"></rect><rect width="5" height="5" x="3" y="16" rx="1"></rect><path d="M21 16h-3a2 2 0 0 0-2 2v3"></path><path d="M21 21v.01"></path><path d="M12 7v3a2 2 0 0 1-2 2H7"></path><path d="M3 12h.01"></path><path d="M12 3h.01"></path><path d="M12 16v.01"></path><path d="M16 12h1"></path><path d="M21 12v.01"></path><path d="M12 21v-1"></path>',
    "check": '<polyline points="20 6 9 17 4 12"></polyline>',
    "plus": '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
    "minus": '<line x1="5" y1="12" x2="19" y2="12"></line>',
    "chevron-right": '<path d="m9 18 6-6-6-6"></path>',
    "chevron-down": '<path d="m6 9 6 6 6-6"></path>',
    "chevron-left": '<path d="m15 18-6-6 6-6"></path>',
    "arrow-left": '<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>',
    "arrow-right": '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>',
    "globe": '<circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path>',
    "lock": '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
    "mail": '<rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>',
    "eye": '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle>',
    "phone": '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',
    "message-circle": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>',
    "printer": '<polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect width="12" height="8" x="6" y="14"></rect>',
    "share": '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>',
    "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',
    "copy": '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>',
    "camera": '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle>',
    "credit-card": '<rect width="20" height="14" x="2" y="5" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line>',
    "sliders-horizontal": '<line x1="21" y1="4" x2="14" y2="4"></line><line x1="10" y1="4" x2="3" y2="4"></line><line x1="21" y1="12" x2="12" y2="12"></line><line x1="8" y1="12" x2="3" y2="12"></line><line x1="21" y1="20" x2="16" y2="20"></line><line x1="12" y1="20" x2="3" y2="20"></line><line x1="14" y1="2" x2="14" y2="6"></line><line x1="8" y1="10" x2="8" y2="14"></line><line x1="16" y1="18" x2="16" y2="22"></line>',
    "map-pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle>',
    "shield": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"></path>',
    "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>',
    "edit": '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>',
    "more-vertical": '<circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle>',
    "refresh-cw": '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path>',
    "x": '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
    "user-plus": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line>',
    "arrow-up-right": '<line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline>',
    "arrow-down-left": '<line x1="17" y1="7" x2="7" y2="17"></line><polyline points="17 17 7 17 7 7"></polyline>'
  };

  const body = icons[name] || icons["grid"];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon ${className}">${body}</svg>`;
}
window.lucideIcon = lucideIcon;
window.lucide = lucideIcon;



// ============================================================================
// VASTRENIX 34 SCREENS ENGINE — PIXEL-FOR-PIXEL ACCORDING TO Vastrenix_App_UI.pdf
// ============================================================================

// --- SCREEN 2: LOGIN SCREEN (Page 5) ---
function renderLoginScreen() {
  const root = document.getElementById("app");
  if (!root) return;
  const t = (k, d) => (window.i18n && window.i18n[state.lang] && window.i18n[state.lang][k]) || d;

  root.innerHTML = `
    <div style="min-height: 100vh; background: var(--mist); display: flex; flex-direction: column; justify-content: space-between; padding: 24px var(--screen-gutter) 20px var(--screen-gutter); box-sizing: border-box;">
      <!-- Top Bar: Logo & Language Selector Pill -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="static/brand/vastrenix-icon.svg" alt="vastrenix" style="width: 28px; height: 28px; border-radius: 8px;">
          <span style="font-size: 20px; font-weight: 700; color: var(--graphite); letter-spacing: -0.5px;">vastrenix</span>
        </div>
        <!-- Language Switcher Pill (Page 5: EN pill) -->
        <button onclick="cycleLanguage()" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: var(--radius-pill); background: var(--paper); border: 1px solid var(--border); font-size: 13px; font-weight: 600; color: var(--graphite); cursor: pointer;">
          ${lucideIcon("globe", 15, 1.75, "var(--graphite)")}
          <span>${state.lang === 'hi' ? 'हिन्दी' : state.lang === 'gu' ? 'ગુજરાતી' : 'EN'}</span>
          ${lucideIcon("chevron-down", 14, 1.75, "#6B7280")}
        </button>
      </div>

      <!-- Main Login Form Container -->
      <div style="width: 100%; max-width: 400px; margin: 0 auto; flex: 1;">
        <h1 class="type-title" style="margin: 0 0 8px 0; color: var(--graphite);">Sign in to<br>your store</h1>
        <p class="type-body" style="color: var(--text-muted); margin: 0 0 28px 0;">Billing, stock and dealer orders — wherever you are.</p>

        <form id="signin-form" onsubmit="handleSignIn(event)">
          <!-- Email Input -->
          <div style="margin-bottom: 20px;">
            <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">Email</label>
            <div style="display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px; box-shadow: none;">
              ${lucideIcon("mail", 18, 1.75, "#6B7280")}
              <input type="email" id="login-email" required placeholder="arjun@odedarafashions.in" value="arjun@odedarafashions.in" style="flex: 1; border: none; outline: none; font-size: 15px; color: var(--graphite); background: transparent; font-family: inherit;">
            </div>
          </div>

          <!-- Password Input -->
          <div style="margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label class="type-caption" style="font-weight: 600; color: var(--graphite); margin: 0;">Password</label>
              <a href="#" onclick="alert('Password reset link sent to registered owner email.')" style="font-size: 13px; font-weight: 600; color: var(--vastra-violet); text-decoration: none;">Forgot password?</a>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px;">
              ${lucideIcon("lock", 18, 1.75, "#6B7280")}
              <input type="password" id="login-password" required value="VastrenixDemo2026!" style="flex: 1; border: none; outline: none; font-size: 15px; color: var(--graphite); background: transparent; font-family: inherit;">
              ${lucideIcon("eye", 18, 1.75, "#6B7280")}
            </div>
          </div>

          <!-- Continue Button (Graphite / Black per PDF Page 5) -->
          <button type="submit" class="btn btn-secondary" style="width: 100%; height: 50px; font-size: 15px; font-weight: 600; border-radius: var(--radius-control); display: flex; justify-content: center; align-items: center; gap: 6px;">
            <span>Continue</span>
            <span>—</span>
          </button>
        </form>

        <!-- Joining a store team? Card (Page 5) -->
        <div onclick="renderStaffAccessRequest()" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-top: 24px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("user-plus", 20, 1.75, "var(--graphite)")}
            </div>
            <div>
              <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Joining a store team?</div>
              <div style="font-size: 12.5px; color: var(--text-muted);">Request access — your admin approves it.</div>
            </div>
          </div>
          ${lucideIcon("chevron-right", 18, 1.75, "#9CA3AF")}
        </div>

        <!-- Set up a new business Link -->
        <div style="text-align: center; margin-top: 28px;">
          <a href="#" onclick="renderOnboardingTaxBilling()" style="font-size: 14px; font-weight: 600; color: var(--vastra-violet); text-decoration: none;">Set up a new business</a>
        </div>
      </div>

      <!-- Bottom Connected Status Dot (Page 5) -->
      <div style="display: flex; align-items: center; justify-content: center; gap: 6px; padding: 12px 0;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #0E7C58;"></span>
        <span style="font-size: 12px; font-weight: 500; color: #4B5563;">Connected</span>
      </div>
    </div>
  `;
}

// --- SCREEN 3: STAFF ACCESS REQUEST FLOW (Page 6) ---
function renderStaffAccessRequest() {
  const root = document.getElementById("app");
  if (!root) return;

  root.innerHTML = `
    <div style="min-height: 100vh; background: var(--mist); display: flex; flex-direction: column; justify-content: space-between; padding: 20px var(--screen-gutter); box-sizing: border-box;">
      <div style="width: 100%; max-width: 440px; margin: 0 auto; flex: 1;">
        <!-- Header: Back & Step Tracker -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <button onclick="renderLoginScreen()" style="border: none; background: none; cursor: pointer; padding: 4px; display: flex; align-items: center;">
            ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
          </button>
          <span style="font-size: 13px; font-weight: 600; color: var(--text-muted);">Step 1 of 2</span>
        </div>

        <h1 class="type-title" style="margin: 0 0 6px 0; color: var(--graphite);">Request staff access</h1>
        <p class="type-body" style="color: var(--text-muted); margin: 0 0 24px 0;">Your store owner or admin approves every new account before you can sign in.</p>

        <!-- Store code input with resolved badge -->
        <div style="margin-bottom: 18px;">
          <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">Store code</label>
          <div style="display: flex; align-items: center; justify-content: space-between; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              ${lucideIcon("store", 18, 1.75, "#6B7280")}
              <input type="text" id="req-store-code" value="ODF-RJK-24" style="border: none; outline: none; font-size: 15px; font-weight: 700; color: var(--graphite); background: transparent; width: 130px; font-family: inherit;">
            </div>
            <div style="display: flex; align-items: center; gap: 6px; color: #0E7C58; font-size: 12.5px; font-weight: 700; background: #E8F5E9; padding: 4px 10px; border-radius: var(--radius-pill);">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: #0E7C58;"></span>
              <span>Odedara Fashions</span>
            </div>
          </div>
        </div>

        <!-- Full Name & Mobile side-by-side -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px;">
          <div>
            <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">Full name</label>
            <input type="text" id="req-staff-name" value="Ravi Patel" style="width: 100%; box-sizing: border-box; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px; font-size: 14.5px; color: var(--graphite); outline: none;">
          </div>
          <div>
            <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">Mobile</label>
            <input type="text" id="req-staff-phone" value="98250 41123" style="width: 100%; box-sizing: border-box; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px; font-size: 14.5px; color: var(--graphite); outline: none;">
          </div>
        </div>

        <!-- Work Email -->
        <div style="margin-bottom: 22px;">
          <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">Work email</label>
          <input type="email" id="req-staff-email" value="ravi.patel@gmail.com" style="width: 100%; box-sizing: border-box; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px; font-size: 14.5px; color: var(--graphite); outline: none;">
        </div>

        <!-- Role Selector (Pill grid from Page 6) -->
        <div style="margin-bottom: 22px;">
          <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 8px;">Your role</label>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;" id="staff-role-chips">
            <button type="button" class="segment-btn active" style="background: var(--graphite); color: #FFFFFF; padding: 8px 14px; border-radius: var(--radius-pill); font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px;" onclick="selectStaffRoleChip(this, 'Cashier')">
              ${lucideIcon("check", 14, 2.2, "#FFFFFF")} Cashier
            </button>
            <button type="button" class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); padding: 8px 14px; border-radius: var(--radius-pill); font-size: 13px; font-weight: 500;" onclick="selectStaffRoleChip(this, 'Inventory')">Inventory</button>
            <button type="button" class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); padding: 8px 14px; border-radius: var(--radius-pill); font-size: 13px; font-weight: 500;" onclick="selectStaffRoleChip(this, 'Purchase')">Purchase</button>
            <button type="button" class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); padding: 8px 14px; border-radius: var(--radius-pill); font-size: 13px; font-weight: 500;" onclick="selectStaffRoleChip(this, 'Accountant')">Accountant</button>
            <button type="button" class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); padding: 8px 14px; border-radius: var(--radius-pill); font-size: 13px; font-weight: 500;" onclick="selectStaffRoleChip(this, 'Dispatcher')">Dispatcher</button>
            <button type="button" class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); padding: 8px 14px; border-radius: var(--radius-pill); font-size: 13px; font-weight: 500;" onclick="selectStaffRoleChip(this, 'Branch manager')">Branch manager</button>
          </div>
        </div>

        <!-- Branch Dropdown -->
        <div style="margin-bottom: 32px;">
          <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">Branch</label>
          <div style="display: flex; align-items: center; justify-content: space-between; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              ${lucideIcon("map-pin", 18, 1.75, "#6B7280")}
              <span style="font-size: 14.5px; font-weight: 500; color: var(--graphite);">Rajkot — Yagnik Road</span>
            </div>
            ${lucideIcon("chevron-down", 16, 1.75, "#6B7280")}
          </div>
        </div>
      </div>

      <!-- Sticky Continue Button (Vastra Violet #5B3DF5) -->
      <div style="width: 100%; max-width: 440px; margin: 0 auto;">
        <button type="button" onclick="renderWaitingApproval()" class="btn btn-primary" style="width: 100%; height: 50px;">
          Continue
        </button>
      </div>
    </div>
  `;
}

function selectStaffRoleChip(btn, role) {
  document.querySelectorAll("#staff-role-chips button").forEach(b => {
    b.style.background = "var(--paper)";
    b.style.color = "var(--graphite)";
    b.style.border = "1px solid var(--border)";
    b.innerHTML = b.textContent.replace("✓ ", "").trim();
  });
  btn.style.background = "var(--graphite)";
  btn.style.color = "#FFFFFF";
  btn.style.border = "none";
  btn.innerHTML = `${lucideIcon("check", 14, 2.2, "#FFFFFF")} ${role}`;
}

// --- SCREEN 4: WAITING FOR APPROVAL (Page 7) ---
function renderWaitingApproval() {
  const root = document.getElementById("app");
  if (!root) return;

  root.innerHTML = `
    <div style="min-height: 100vh; background: var(--mist); display: flex; flex-direction: column; justify-content: space-between; padding: 40px var(--screen-gutter) 24px var(--screen-gutter); box-sizing: border-box;">
      <div style="width: 100%; max-width: 400px; margin: 0 auto; text-align: center;">
        <!-- Clock & Arrow Illustration Card -->
        <div style="width: 80px; height: 80px; border-radius: 24px; background: var(--paper); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; margin: 0 auto 24px auto; box-shadow: 0 4px 14px rgba(0,0,0,0.04);">
          <div style="position: relative;">
            ${lucideIcon("clock", 36, 1.75, "var(--vastra-violet)")}
            <div style="position: absolute; bottom: -4px; right: -6px; background: var(--graphite); border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("arrow-up-right", 12, 2.2, "#FFFFFF")}
            </div>
          </div>
        </div>

        <h1 class="type-title" style="margin: 0 0 8px 0; color: var(--graphite);">Waiting for approval</h1>
        <p class="type-body" style="color: var(--text-muted); margin: 0 0 28px 0;">We’ve sent your request to the admins at Odedara Fashions. You’ll get a notification the moment it’s approved.</p>

        <!-- Summary Card (Paper #FFFFFF, radius 18px) -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 18px; margin-bottom: 24px; text-align: left;">
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
            <span style="color: var(--text-muted);">Store</span>
            <span style="font-weight: 600; color: var(--graphite);">Odedara Fashions</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
            <span style="color: var(--text-muted);">Branch</span>
            <span style="font-weight: 600; color: var(--graphite);">Rajkot — Yagnik Road</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
            <span style="color: var(--text-muted);">Role requested</span>
            <span style="font-weight: 600; color: var(--graphite);">Cashier</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
            <span style="color: var(--text-muted);">Sent</span>
            <span style="font-weight: 600; color: var(--graphite);">Today, 10:42 AM</span>
          </div>
        </div>

        <!-- Vertical Timeline (Page 7) -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 18px; margin-bottom: 24px; text-align: left;">
          <div style="display: flex; gap: 14px; margin-bottom: 16px;">
            <div style="display: flex; flex-direction: column; align-items: center;">
              <div style="width: 20px; height: 20px; border-radius: 50%; background: #0E7C58; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("check", 12, 2.2, "#FFFFFF")}
              </div>
              <div style="width: 2px; height: 28px; background: #0E7C58;"></div>
            </div>
            <div>
              <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Request submitted</div>
              <div style="font-size: 12.5px; color: var(--text-muted);">Account created, email verified</div>
            </div>
          </div>

          <div style="display: flex; gap: 14px; margin-bottom: 16px;">
            <div style="display: flex; flex-direction: column; align-items: center;">
              <div style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--vastra-violet); display: flex; align-items: center; justify-content: center;">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--vastra-violet);"></div>
              </div>
              <div style="width: 2px; height: 28px; background: #E5E7EB;"></div>
            </div>
            <div>
              <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Admin review</div>
              <div style="font-size: 12.5px; color: var(--text-muted);">Usually within a few hours</div>
            </div>
          </div>

          <div style="display: flex; gap: 14px;">
            <div style="display: flex; flex-direction: column; align-items: center;">
              <div style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid #D1D5DB;"></div>
            </div>
            <div>
              <div style="font-size: 14px; font-weight: 700; color: #9CA3AF;">Access granted</div>
              <div style="font-size: 12.5px; color: var(--text-muted);">Sign in with your role’s permissions</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions: Check status & Sign out -->
      <div style="width: 100%; max-width: 400px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; text-align: center;">
        <button type="button" class="btn btn-secondary" onclick="alert('Your account is currently under review by Odedara Fashions admins.')" style="width: 100%; height: 50px;">
          ${lucideIcon("refresh-cw", 16, 1.75, "#FFFFFF")}
          <span>Check status</span>
        </button>
        <button type="button" onclick="renderLoginScreen()" style="background: none; border: none; font-size: 14px; font-weight: 600; color: var(--graphite); padding: 8px; cursor: pointer;">
          Sign out
        </button>
      </div>
    </div>
  `;
}

// --- SCREEN 5: ONBOARDING — TAX & BILLING (Page 8) ---
function renderOnboardingTaxBilling() {
  const root = document.getElementById("app");
  if (!root) return;

  root.innerHTML = `
    <div style="min-height: 100vh; background: var(--mist); display: flex; flex-direction: column; justify-content: space-between; padding: 20px var(--screen-gutter); box-sizing: border-box;">
      <div style="width: 100%; max-width: 440px; margin: 0 auto; flex: 1;">
        <!-- Top bar: Back & Save & exit -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <button onclick="renderLoginScreen()" style="border: none; background: none; cursor: pointer; padding: 4px;">
            ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
          </button>
          <button onclick="renderLoginScreen()" style="border: none; background: none; font-size: 14px; font-weight: 600; color: var(--graphite); cursor: pointer;">
            Save & exit
          </button>
        </div>

        <!-- Step tracker (Page 8: Business, Tax [active], Products, Invoice, Team) -->
        <div style="display: flex; gap: 8px; margin-bottom: 24px;">
          <div style="flex: 1; height: 3px; background: var(--vastra-violet); border-radius: 2px;"></div>
          <div style="flex: 1; height: 3px; background: var(--vastra-violet); border-radius: 2px;"></div>
          <div style="flex: 1; height: 3px; background: #E5E7EB; border-radius: 2px;"></div>
          <div style="flex: 1; height: 3px; background: #E5E7EB; border-radius: 2px;"></div>
          <div style="flex: 1; height: 3px; background: #E5E7EB; border-radius: 2px;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-top: -16px; margin-bottom: 24px;">
          <span>Business</span>
          <span style="color: var(--vastra-violet);">Tax</span>
          <span>Products</span>
          <span>Invoice</span>
          <span>Team</span>
        </div>

        <h1 class="type-title" style="margin: 0 0 6px 0; color: var(--graphite);">Tax & billing</h1>
        <p class="type-body" style="color: var(--text-muted); margin: 0 0 24px 0;">We’ll use this on every invoice. You can change it later in Settings.</p>

        <!-- GSTIN Input with Verified badge -->
        <div style="margin-bottom: 18px;">
          <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">GSTIN</label>
          <div style="display: flex; align-items: center; justify-content: space-between; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px;">
            <input type="text" value="24AAPCO4821K1Z6" style="border: none; outline: none; font-size: 15px; font-weight: 700; color: var(--graphite); background: transparent; width: 180px; font-family: inherit;">
            <div style="display: flex; align-items: center; gap: 5px; color: #0E7C58; font-size: 12px; font-weight: 700; background: #E8F5E9; padding: 4px 10px; border-radius: var(--radius-pill);">
              ${lucideIcon("check", 12, 2.2, "#0E7C58")}
              <span>Verified</span>
            </div>
          </div>
        </div>

        <!-- Resolved Details Card (Page 8) -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 22px;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 13.5px;">
            <span style="color: var(--text-muted);">Legal name</span>
            <span style="font-weight: 600; color: var(--graphite);">Odedara Fashions Pvt Ltd</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 13.5px;">
            <span style="color: var(--text-muted);">State</span>
            <span style="font-weight: 600; color: var(--graphite);">Gujarat (24)</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 13.5px;">
            <span style="color: var(--text-muted);">Registration</span>
            <span style="font-weight: 600; color: var(--graphite);">Regular</span>
          </div>
        </div>

        <!-- Default GST on garments (Segmented pills: 5% | 12% | 18% | By slab) -->
        <div style="margin-bottom: 22px;">
          <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 8px;">Default GST on garments</label>
          <div class="segmented-control" style="background: var(--segment-track);">
            <button type="button" class="segment-btn active" style="font-weight: 700;" onclick="activateSegmentBtn(this)">5%</button>
            <button type="button" class="segment-btn" onclick="activateSegmentBtn(this)">12%</button>
            <button type="button" class="segment-btn" onclick="activateSegmentBtn(this)">18%</button>
            <button type="button" class="segment-btn" onclick="activateSegmentBtn(this)">By slab</button>
          </div>
        </div>

        <!-- Toggle Row 1: Prices include GST -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-top: 1px solid var(--border);">
          <div>
            <div style="font-size: 14.5px; font-weight: 600; color: var(--graphite);">Prices include GST</div>
            <div style="font-size: 12.5px; color: var(--text-muted);">Off: GST is added at billing</div>
          </div>
          <input type="checkbox" style="width: 44px; height: 24px; accent-color: var(--vastra-violet); cursor: pointer;">
        </div>

        <!-- Toggle Row 2: More than one branch -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-top: 1px solid var(--border);">
          <div>
            <div style="font-size: 14.5px; font-weight: 600; color: var(--graphite);">More than one branch</div>
            <div style="font-size: 12.5px; color: var(--text-muted);">Separate stock and cash per branch</div>
          </div>
          <input type="checkbox" checked style="width: 44px; height: 24px; accent-color: var(--vastra-violet); cursor: pointer;">
        </div>
      </div>

      <!-- Bottom Button Pair: Back & Continue to products -->
      <div style="width: 100%; max-width: 440px; margin: 0 auto; display: flex; gap: 12px;">
        <button type="button" class="btn btn-tertiary" onclick="renderLoginScreen()" style="flex: 1; height: 50px;">Back</button>
        <button type="button" class="btn btn-primary" onclick="loginDemo('demo@vastrenix.com', 'VastrenixDemo2026!')" style="flex: 2; height: 50px;">Continue to products —</button>
      </div>
    </div>
  `;
}

function activateSegmentBtn(btn) {
  const parent = btn.parentElement;
  if (!parent) return;
  parent.querySelectorAll(".segment-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}



// --- SCREEN 6: HOME / DASHBOARD (Page 9) ---
async function renderDashboard() {
  const container = document.getElementById("tab-content");
  if (!container) return;
  const t = (k, d) => (window.i18n && window.i18n[state.lang] && window.i18n[state.lang][k]) || d;

  container.innerHTML = `
    <div style="padding-bottom: 84px;">
      <!-- Store Switcher Header (Page 9) -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="openStoreSettingsModal()">
          <div style="width: 44px; height: 44px; border-radius: 12px; background: var(--graphite); color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px;">
            OF
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-size: 16px; font-weight: 700; color: var(--graphite);">Odedara Fashions</span>
              ${lucideIcon("chevron-down", 16, 1.75, "var(--graphite)")}
            </div>
            <div style="font-size: 12.5px; color: var(--text-muted);">Rajkot · Yagnik Rd</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <button onclick="switchTab('inventory')" style="width: 40px; height: 40px; border-radius: 50%; background: var(--paper); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${lucideIcon("search", 18, 1.75, "var(--graphite)")}
          </button>
          <button onclick="renderUsers()" style="width: 40px; height: 40px; border-radius: 50%; background: var(--paper); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; position: relative; cursor: pointer;">
            ${lucideIcon("bell", 18, 1.75, "var(--graphite)")}
            <span style="position: absolute; top: 8px; right: 8px; width: 8px; height: 8px; border-radius: 50%; background: var(--risk-red);"></span>
          </button>
        </div>
      </div>

      <!-- Hero Dark Card: Today's sales (Page 9) -->
      <div class="card-hero-dark" style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-size: 13.5px; font-weight: 500; color: #9CA3AF;">Today’s sales · Mon 26 Oct</div>
          <div style="display: flex; align-items: center; gap: 6px; background: rgba(14, 124, 88, 0.2); padding: 4px 10px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 600; color: #34D399;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #34D399;"></span>
            <span>Shift open</span>
          </div>
        </div>

        <div style="display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px;">
          <div class="type-figure" style="color: #FFFFFF;">₹48,260</div>
          <div style="display: flex; align-items: center; gap: 4px; color: #34D399; font-size: 14px; font-weight: 600;">
            ${lucideIcon("arrow-up-right", 16, 2.2, "#34D399")} 12.4%
          </div>
        </div>

        <!-- Mini 7-Bar Chart -->
        <div style="display: flex; align-items: flex-end; gap: 8px; height: 44px; margin-bottom: 20px; padding: 4px 0;">
          <div style="flex: 1; height: 35%; background: #26262E; border-radius: 3px;"></div>
          <div style="flex: 1; height: 45%; background: #26262E; border-radius: 3px;"></div>
          <div style="flex: 1; height: 40%; background: #26262E; border-radius: 3px;"></div>
          <div style="flex: 1; height: 55%; background: #26262E; border-radius: 3px;"></div>
          <div style="flex: 1; height: 70%; background: #26262E; border-radius: 3px;"></div>
          <div style="flex: 1; height: 85%; background: #26262E; border-radius: 3px;"></div>
          <div style="flex: 1; height: 100%; background: var(--vastra-violet); border-radius: 3px;"></div>
        </div>

        <!-- 3-stat row (Bills / Avg. bill / Cash drawer) -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; border-top: 1px solid #1F1F24; padding-top: 14px;">
          <div>
            <div style="font-size: 18px; font-weight: 700; color: #FFFFFF; font-variant-numeric: tabular-nums;">37</div>
            <div style="font-size: 12px; color: #9CA3AF;">Bills</div>
          </div>
          <div>
            <div style="font-size: 18px; font-weight: 700; color: #FFFFFF; font-variant-numeric: tabular-nums;">₹1,304</div>
            <div style="font-size: 12px; color: #9CA3AF;">Avg. bill</div>
          </div>
          <div>
            <div style="font-size: 18px; font-weight: 700; color: #FFFFFF; font-variant-numeric: tabular-nums;">₹18,450</div>
            <div style="font-size: 12px; color: #9CA3AF;">Cash drawer</div>
          </div>
        </div>
      </div>

      <!-- 4-Icon Quick-Action Row (Page 9) -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;">
        <!-- New bill: Violet Card -->
        <button onclick="switchTab('pos')" style="background: var(--vastra-violet); border: none; border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; color: #FFFFFF;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center;">
            ${lucideIcon("receipt", 20, 2, "#FFFFFF")}
          </div>
          <span style="font-size: 12.5px; font-weight: 600; color: #FFFFFF;">New bill</span>
        </button>

        <!-- Add item -->
        <button onclick="openAddGarmentScreen()" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
            ${lucideIcon("shirt", 20, 1.75, "var(--graphite)")}
          </div>
          <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Add item</span>
        </button>

        <!-- Receive -->
        <button onclick="openReceiveGoodsScreen()" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
            ${lucideIcon("truck", 20, 1.75, "var(--graphite)")}
          </div>
          <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Receive</span>
        </button>

        <!-- Expense -->
        <button onclick="switchTab('expenses')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
            ${lucideIcon("wallet", 20, 1.75, "var(--graphite)")}
          </div>
          <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Expense</span>
        </button>
      </div>

      <!-- Staff Approval Banner (Page 9) -->
      <div onclick="switchTab('users')" style="background: #EDE9FE; border-radius: var(--radius-card); padding: 14px 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="display: flex; margin-right: 4px;">
            <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--vastra-violet); color: white; display: flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 700; border: 2px solid white;">RP</div>
            <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--graphite); color: white; display: flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 700; border: 2px solid white; margin-left: -10px;">MK</div>
          </div>
          <span style="font-size: 14px; font-weight: 700; color: var(--graphite);">2 staff requests to review</span>
        </div>
        ${lucideIcon("chevron-right", 18, 1.75, "var(--vastra-violet)")}
      </div>

      <!-- Needs Attention Section (Page 9) -->
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h2 style="font-size: 16px; font-weight: 700; color: var(--graphite); margin: 0;">Needs attention</h2>
          <a href="#" onclick="switchTab('more')" style="font-size: 13.5px; font-weight: 600; color: var(--vastra-violet); text-decoration: none;">See all</a>
        </div>

        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); overflow: hidden;">
          <!-- Item 1: Low stock -->
          <div onclick="switchTab('lowstock')" style="padding: 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #FEE2E2; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("alert-triangle", 20, 1.75, "#C8283C")}
              </div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">14 variants low on stock</div>
                <div style="font-size: 12.5px; color: var(--text-muted);">5 have a reorder suggestion</div>
              </div>
            </div>
            ${lucideIcon("chevron-right", 18, 1.75, "#9CA3AF")}
          </div>

          <!-- Item 2: Store credit due -->
          <div onclick="switchTab('dues')" style="padding: 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #FEF3C7; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("wallet", 20, 1.75, "#A35A00")}
              </div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">₹1,24,300 store credit due</div>
                <div style="font-size: 12.5px; color: var(--text-muted);">9 customers · reminders go out 28 Oct</div>
              </div>
            </div>
            ${lucideIcon("chevron-right", 18, 1.75, "#9CA3AF")}
          </div>

          <!-- Item 3: New dealer orders -->
          <div onclick="switchTab('orders')" style="padding: 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #EDE9FE; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("truck", 20, 1.75, "#5B3DF5")}
              </div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">3 new dealer orders</div>
                <div style="font-size: 12.5px; color: var(--text-muted);">6 accepted orders waiting to pack</div>
              </div>
            </div>
            ${lucideIcon("chevron-right", 18, 1.75, "#9CA3AF")}
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- SCREEN 7: POS "NEW BILL" (Page 10) ---
function renderPOS() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="padding-bottom: 96px;">
      <!-- Top Bar: Title & Hold -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button onclick="switchTab('dashboard')" style="border: none; background: none; cursor: pointer; padding: 4px;">
            ${lucideIcon("arrow-left", 20, 1.75, "var(--graphite)")}
          </button>
          <div>
            <h1 class="type-heading" style="margin: 0; color: var(--graphite);">New bill</h1>
            <div style="font-size: 12px; color: var(--text-muted);">VX-2041 · Counter 1</div>
          </div>
        </div>
        <button onclick="alert('Current bill held and saved to queue.')" style="display: flex; align-items: center; gap: 6px; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px; font-weight: 600; color: var(--graphite); cursor: pointer;">
          ${lucideIcon("clock", 15, 1.75, "var(--graphite)")}
          <span>Hold</span>
        </button>
      </div>

      <!-- Add Customer (Optional, clearly marked - Product Principle 01) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="promptCustomerName()">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
            ${lucideIcon("users", 18, 1.75, "#6B7280")}
          </div>
          <div>
            <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);" id="pos-cust-name-label">Add customer</div>
            <div style="font-size: 12px; color: var(--text-muted);">Optional · needed for store credit</div>
          </div>
        </div>
        ${lucideIcon("plus", 18, 2, "var(--vastra-violet)")}
      </div>

      <!-- Search / Scan Bar (Page 10) -->
      <div style="display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px 14px; margin-bottom: 16px;">
        ${lucideIcon("search", 18, 1.75, "#6B7280")}
        <input type="text" placeholder="Search name, SKU or size" style="flex: 1; border: none; outline: none; font-size: 14.5px; background: transparent; font-family: inherit;">
        <button style="border: none; background: none; cursor: pointer; padding: 2px;">
          ${lucideIcon("scan", 20, 1.75, "var(--graphite)")}
        </button>
      </div>

      <!-- Cart List Items (Page 10) -->
      <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
        <!-- Item 1: Chanderi silk kurta -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #233876; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("shirt", 22, 1.75, "#FFFFFF")}
            </div>
            <div>
              <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Chanderi silk kurta</div>
              <div class="type-caption">Indigo · M · VX-KUR-0142</div>
              <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite); margin-top: 2px;">₹2,450</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; background: #F3F4F6; border-radius: var(--radius-pill); padding: 4px 8px;">
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer; padding: 2px 6px;">−</button>
            <span style="font-size: 14px; font-weight: 700; min-width: 16px; text-align: center;">1</span>
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer; padding: 2px 6px;">+</button>
          </div>
        </div>

        <!-- Item 2: Linen Nehru jacket -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #374151; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("shirt", 22, 1.75, "#FFFFFF")}
            </div>
            <div>
              <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Linen Nehru jacket</div>
              <div class="type-caption">Charcoal · 40 · VX-JKT-0087</div>
              <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite); margin-top: 2px;">₹1,890</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; background: #F3F4F6; border-radius: var(--radius-pill); padding: 4px 8px;">
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer; padding: 2px 6px;">−</button>
            <span style="font-size: 14px; font-weight: 700; min-width: 16px; text-align: center;">1</span>
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer; padding: 2px 6px;">+</button>
          </div>
        </div>

        <!-- Item 3: Cotton palazzo -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #9A3412; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("shirt", 22, 1.75, "#FFFFFF")}
            </div>
            <div>
              <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Cotton palazzo</div>
              <div class="type-caption">Rust · L · VX-PLZ-0213 · ₹790 each</div>
              <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite); margin-top: 2px;">₹1,580</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; background: #F3F4F6; border-radius: var(--radius-pill); padding: 4px 8px;">
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer; padding: 2px 6px;">−</button>
            <span style="font-size: 14px; font-weight: 700; min-width: 16px; text-align: center;">2</span>
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer; padding: 2px 6px;">+</button>
          </div>
        </div>
      </div>

      <!-- + Custom Item Link (Page 10) -->
      <div style="margin-bottom: 20px;">
        <button onclick="openCustomItemModal()" style="border: none; background: none; color: var(--vastra-violet); font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
          ${lucideIcon("plus", 16, 2, "var(--vastra-violet)")}
          <span>Custom item</span>
        </button>
      </div>

      <!-- Financial Calculation Breakdown Card (Page 10) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px;">
          <span style="color: var(--text-muted);">Subtotal · 4 items</span>
          <span style="font-weight: 600; color: var(--graphite); font-variant-numeric: tabular-nums;">₹5,920.00</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px;">
          <span style="color: var(--text-muted);">CGST 2.5% + SGST 2.5%</span>
          <span style="font-weight: 600; color: var(--graphite); font-variant-numeric: tabular-nums;">₹296.00</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 13.5px;">
          <span style="color: var(--text-muted);">Discount</span>
          <a href="#" onclick="alert('Enter discount percentage or amount');" style="color: var(--vastra-violet); font-weight: 600; text-decoration: none;">Add</a>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); margin-top: 6px; font-size: 13px;">
          <div style="display: flex; align-items: center; gap: 6px; cursor: pointer;" onclick="switchTab('themes')">
            ${lucideIcon("receipt", 15, 1.75, "#6B7280")}
            <span style="color: var(--text-muted);">Invoice: <strong style="color: var(--vastra-violet);">Modern Minimal</strong></span>
          </div>
          <span style="color: var(--text-muted); font-variant-numeric: tabular-nums;">Round off −₹0.00</span>
        </div>
      </div>

      <!-- Sticky Bottom Total & Charge Button (Page 10) -->
      <div style="position: fixed; bottom: 68px; left: 0; right: 0; background: var(--paper); border-top: 1px solid var(--border); padding: 12px var(--screen-gutter); display: flex; justify-content: space-between; align-items: center; z-index: 100;">
        <div>
          <div class="type-overline" style="color: var(--text-muted);">Total payable</div>
          <div style="font-size: 24px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹6,216</div>
        </div>
        <button onclick="openPaymentMethodSheet()" class="btn btn-primary" style="height: 48px; padding: 0 20px; display: flex; align-items: center; gap: 10px;">
          <span>Charge</span>
          <div style="display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: var(--radius-pill); font-size: 12.5px;">
            ${lucideIcon("cash", 14, 1.75, "#FFFFFF")}
            <span id="pos-charge-mode-text">Cash ></span>
          </div>
        </button>
      </div>
    </div>
  `;
}

function promptCustomerName() {
  const name = prompt("Enter customer name or phone for Store Credit tracking:", "Meera Shah");
  if (name) {
    const el = document.getElementById("pos-cust-name-label");
    if (el) el.textContent = name;
  }
}

// --- SCREEN 8: PAYMENT METHOD BOTTOM SHEET (Page 11) ---
function openPaymentMethodSheet() {
  let sheet = document.getElementById("pos-payment-bottom-sheet");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "pos-payment-bottom-sheet";
    sheet.className = "modal-overlay active";
    sheet.style.zIndex = "100000";
    document.body.appendChild(sheet);
  }

  sheet.innerHTML = `
    <div style="position: fixed; inset: 0; background: rgba(14, 14, 18, 0.6);" onclick="closePaymentMethodSheet()"></div>
    <div class="bottom-sheet" style="position: fixed; bottom: 0; left: 0; right: 0; z-index: 100001; max-width: 500px; margin: 0 auto; box-sizing: border-box;">
      <div class="sheet-drag-handle"></div>

      <!-- Header: Amount due & Edit bill link -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div>
          <div style="font-size: 12.5px; color: var(--text-muted);">Amount due · VX-2041</div>
          <div class="type-figure" style="font-size: 36px; line-height: 42px;">₹6,216</div>
        </div>
        <button onclick="closePaymentMethodSheet()" style="border: none; background: none; font-size: 14px; font-weight: 600; color: var(--vastra-violet); cursor: pointer; padding: 4px;">
          Edit bill
        </button>
      </div>

      <!-- 5-Mode Segmented Selector (Cash / UPI / Card / Split / Credit) -->
      <div class="segmented-control" style="margin-bottom: 20px;">
        <button type="button" class="segment-btn active" onclick="selectPaySegment(this, 'CASH')">
          ${lucideIcon("cash", 16, 1.75)} Cash
        </button>
        <button type="button" class="segment-btn" onclick="selectPaySegment(this, 'UPI')">
          ${lucideIcon("qr-code", 16, 1.75)} UPI
        </button>
        <button type="button" class="segment-btn" onclick="selectPaySegment(this, 'CARD')">
          ${lucideIcon("credit-card", 16, 1.75)} Card
        </button>
        <button type="button" class="segment-btn" onclick="selectPaySegment(this, 'SPLIT')">
          ${lucideIcon("arrow-left-right", 16, 1.75)} Split
        </button>
        <button type="button" class="segment-btn" onclick="selectPaySegment(this, 'CREDIT')">
          ${lucideIcon("wallet", 16, 1.75)} Credit
        </button>
      </div>

      <!-- Cash Received Field (Page 11) -->
      <div id="cash-received-section">
        <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 8px;">Cash received</label>
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 14px; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px; font-weight: 700; color: var(--graphite);">₹</span>
          <input type="text" id="pos-cash-input" value="6,500" style="border: none; outline: none; font-size: 22px; font-weight: 700; color: var(--graphite); width: 100%; font-family: inherit; font-variant-numeric: tabular-nums;">
        </div>

        <!-- Quick Amount Chips (Exact, ₹6,500, ₹7,000, ₹10,000) -->
        <div style="display: flex; gap: 8px; margin-bottom: 20px;">
          <button type="button" class="segment-btn" style="border: 1px solid var(--border); background: var(--paper); border-radius: var(--radius-pill); font-size: 13px;" onclick="setCashVal('6,216')">Exact</button>
          <button type="button" class="segment-btn active" style="border: 1px solid var(--graphite); background: var(--paper); border-radius: var(--radius-pill); font-size: 13px; font-weight: 700;" onclick="setCashVal('6,500')">₹6,500</button>
          <button type="button" class="segment-btn" style="border: 1px solid var(--border); background: var(--paper); border-radius: var(--radius-pill); font-size: 13px;" onclick="setCashVal('7,000')">₹7,000</button>
          <button type="button" class="segment-btn" style="border: 1px solid var(--border); background: var(--paper); border-radius: var(--radius-pill); font-size: 13px;" onclick="setCashVal('10,000')">₹10,000</button>
        </div>

        <!-- Return Change Row (Page 11: Green label & green 24px figure) -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-top: 1px solid var(--border); margin-bottom: 20px;">
          <span style="font-size: 15px; font-weight: 600; color: #0E7C58;">Return change</span>
          <span style="font-size: 24px; font-weight: 700; color: #0E7C58; font-variant-numeric: tabular-nums;">₹284</span>
        </div>
      </div>

      <!-- Primary Action Button: Complete sale · ₹6,216 -->
      <button onclick="handleCompleteSaleAction()" class="btn btn-primary" style="width: 100%; height: 50px; font-size: 16px; margin-bottom: 12px;">
        Complete sale · ₹6,216
      </button>

      <!-- Default Payment Hint Subtext -->
      <div style="text-align: center; font-size: 12.5px; color: var(--text-muted);">
        Cash is your default · change in Settings
      </div>
    </div>
  `;
}

function closePaymentMethodSheet() {
  const sheet = document.getElementById("pos-payment-bottom-sheet");
  if (sheet) sheet.remove();
}

let _selectedPayMode = "CASH";
function selectPaySegment(btn, mode) {
  _selectedPayMode = mode;
  btn.parentElement.querySelectorAll(".segment-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const cashSec = document.getElementById("cash-received-section");
  if (cashSec) {
    cashSec.style.display = (mode === "CASH" || mode === "SPLIT") ? "block" : "none";
  }
}

function setCashVal(val) {
  const el = document.getElementById("pos-cash-input");
  if (el) el.value = val;
}

function handleCompleteSaleAction() {
  closePaymentMethodSheet();
  if (_selectedPayMode === "UPI") {
    openUpiPaymentScreen();
  } else {
    openPaymentConfirmationScreen();
  }
}

// --- SCREEN 9: UPI PAYMENT SCREEN (Page 12) ---
function openUpiPaymentScreen() {
  const root = document.getElementById("tab-content");
  if (!root) return;

  root.innerHTML = `
    <div style="max-width: 440px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header -->
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <button onclick="switchTab('pos')" style="border: none; background: none; cursor: pointer; padding: 4px;">
          ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
        </button>
        <h1 class="type-heading" style="margin: 0; color: var(--graphite);">UPI payment</h1>
      </div>

      <!-- Collect Exactly Figure (Page 12) -->
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 13.5px; color: var(--text-muted);">Collect exactly</div>
        <div class="type-figure" style="margin: 4px 0;">₹6,216.00</div>
        <div style="font-size: 13px; color: var(--text-muted);">Bill VX-2041 · 4 items</div>
      </div>

      <!-- QR Code Card with center woven V mark -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 24px; text-align: center; margin-bottom: 20px;">
        <div style="width: 200px; height: 200px; margin: 0 auto 16px auto; position: relative; display: flex; align-items: center; justify-content: center; background: #FFFFFF; border: 1px solid var(--border); border-radius: 12px; padding: 8px;">
          <!-- SVG QR Code with Center Logo Mark -->
          <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;">
            <path d="M10,10 h25 v25 h-25 z M15,15 v15 h15 v-15 z M65,10 h25 v25 h-25 z M70,15 v15 h15 v-15 z M10,65 h25 v25 h-25 z M15,70 v15 h15 v-15 z" fill="#0E0E12" />
            <path d="M40,15 h5 v5 h-5 z M50,15 h10 v5 h-10 z M40,25 h15 v5 h-15 z M45,35 h5 v10 h-5 z M15,45 h10 v5 h-10 z M65,45 h20 v5 h-20 z M55,55 h10 v15 h-10 z M75,60 h15 v5 h-15 z M40,65 h10 v20 h-10 z M70,75 h20 v5 h-20 z M80,85 h10 v10 h-10 z" fill="#0E0E12" />
          </svg>
          <div style="position: absolute; width: 34px; height: 34px; border-radius: 8px; background: var(--graphite); display: flex; align-items: center; justify-content: center; border: 2px solid white;">
            <img src="static/brand/vastrenix-icon.svg" style="width: 22px; height: 22px;">
          </div>
        </div>

        <!-- UPI ID with Copy Icon -->
        <div style="display: inline-flex; align-items: center; gap: 8px; background: #F3F4F6; padding: 6px 14px; border-radius: var(--radius-pill); font-size: 13px; font-weight: 600; color: var(--graphite); margin-bottom: 8px;">
          <span>odedarafashions@hdfcbank</span>
          <button onclick="navigator.clipboard.writeText('odedarafashions@hdfcbank'); alert('UPI ID copied!');" style="border: none; background: none; cursor: pointer; padding: 0;">
            ${lucideIcon("copy", 14, 1.75, "#6B7280")}
          </button>
        </div>

        <div style="font-size: 12.5px; color: var(--text-muted);">Scan with GPay, PhonePe, Paytm or any UPI app</div>
      </div>

      <!-- Status Pill: Waiting for payment · QR valid 04:32 (Page 12) -->
      <div style="display: flex; justify-content: space-between; align-items: center; background: #EDE9FE; padding: 12px 18px; border-radius: var(--radius-pill); margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--vastra-violet);"></span>
          <span style="font-size: 13.5px; font-weight: 600; color: var(--vastra-violet);">Waiting for payment</span>
        </div>
        <span style="font-size: 13px; font-weight: 600; color: var(--vastra-violet); font-variant-numeric: tabular-nums;">QR valid 04:32</span>
      </div>

      <!-- Primary Action: Customer has paid -->
      <button onclick="openPaymentConfirmationScreen()" class="btn btn-primary" style="width: 100%; height: 50px; font-size: 15px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
        ${lucideIcon("check", 18, 2.2, "#FFFFFF")}
        <span>Customer has paid</span>
      </button>

      <!-- Secondary Row: Change method | Send link -->
      <div style="display: flex; gap: 12px;">
        <button onclick="openPaymentMethodSheet()" class="btn btn-tertiary" style="flex: 1; height: 44px; font-size: 13.5px;">Change method</button>
        <button onclick="alert('Payment link dispatched via SMS/WhatsApp.')" class="btn btn-tertiary" style="flex: 1; height: 44px; font-size: 13.5px; display: flex; align-items: center; justify-content: center; gap: 6px;">
          ${lucideIcon("arrow-up-right", 16, 1.75)}
          <span>Send link</span>
        </button>
      </div>
    </div>
  `;
}

// --- SCREEN 10: PAYMENT RECEIVED CONFIRMATION (Page 13) ---
function openPaymentConfirmationScreen() {
  const root = document.getElementById("tab-content");
  if (!root) return;

  root.innerHTML = `
    <div style="max-width: 440px; margin: 0 auto; text-align: center; padding: 32px var(--screen-gutter) 84px var(--screen-gutter);">
      <!-- Success Animated Badge (Page 13) -->
      <div style="width: 72px; height: 72px; border-radius: 50%; background: #0E7C58; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px auto; box-shadow: 0 8px 24px rgba(14, 124, 88, 0.25);">
        ${lucideIcon("check", 38, 2.5, "#FFFFFF")}
      </div>

      <div style="font-size: 14.5px; color: var(--text-muted); margin-bottom: 4px;">Payment received</div>
      <div class="type-figure" style="margin-bottom: 6px;">₹6,216</div>
      <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 28px;">via UPI · 7:42 PM · Invoice VX-2041</div>

      <!-- Optional UTR Card (Page 13) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 20px; text-align: left;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
          <strong style="color: var(--graphite);">UTR / reference no.</strong>
          <span style="color: var(--text-muted);">Optional</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; background: #F9FAFB; border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px 12px; margin-bottom: 8px;">
          <input type="text" value="4321 9876 5410" style="border: none; outline: none; font-size: 15px; font-weight: 600; color: var(--graphite); background: transparent; font-family: inherit; font-variant-numeric: tabular-nums;">
          ${lucideIcon("camera", 18, 1.75, "#6B7280")}
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">Helps match this bill during bank reconciliation.</div>
      </div>

      <!-- 3-Action Card Row: View invoice | WhatsApp | Print (Page 13) -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 18px;">
        <button onclick="openInvoiceDetail({id: 'VX-2041', total: 6216})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
          ${lucideIcon("receipt", 22, 1.75, "var(--graphite)")}
          <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">View invoice</span>
        </button>
        <button onclick="alert('PDF invoice shared to customer WhatsApp number.')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
          ${lucideIcon("message-circle", 22, 1.75, "#0E7C58")}
          <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">WhatsApp</span>
        </button>
        <button onclick="window.print()" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
          ${lucideIcon("printer", 22, 1.75, "var(--graphite)")}
          <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Print</span>
        </button>
      </div>

      <!-- Stock Updated Link Banner (Page 13) -->
      <div style="background: #F3F4F6; border-radius: var(--radius-card); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px;">
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--graphite); font-weight: 500;">
          ${lucideIcon("package", 16, 1.75, "#6B7280")}
          <span>Stock updated · 4 units sold</span>
        </div>
        <a href="#" onclick="switchTab('inventory')" style="font-size: 13.5px; font-weight: 600; color: var(--vastra-violet); text-decoration: none;">View</a>
      </div>

      <!-- Bottom Button: + Next bill & Back to home -->
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <button onclick="switchTab('pos')" class="btn btn-secondary" style="height: 50px; font-size: 15px;">
          ${lucideIcon("plus", 18, 2, "#FFFFFF")}
          <span>Next bill</span>
        </button>
        <button onclick="switchTab('dashboard')" style="background: none; border: none; font-size: 14px; font-weight: 600; color: var(--graphite); cursor: pointer; padding: 6px;">
          Back to home
        </button>
      </div>
    </div>
  `;
}

// --- SCREEN 11: CLOSE SHIFT (Page 14) ---
function renderCloseShift() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header (Page 14) -->
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
        <button onclick="switchTab('dashboard')" style="border: none; background: none; cursor: pointer; padding: 4px;">
          ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
        </button>
        <div>
          <h1 class="type-title" style="margin: 0; font-size: 24px;">Close shift</h1>
          <div style="font-size: 12.5px; color: var(--text-muted);">Ravi P. · Counter 1 · since 10:02 AM</div>
        </div>
      </div>

      <!-- Reconciliation Card (Page 14) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
          <span style="color: var(--text-muted);">Opening float</span>
          <span style="font-weight: 600; color: var(--graphite); font-variant-numeric: tabular-nums;">₹2,000</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
          <span style="color: var(--text-muted);">Cash sales · 22 bills</span>
          <span style="font-weight: 600; color: #0E7C58; font-variant-numeric: tabular-nums;">+₹24,300</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
          <span style="color: var(--text-muted);">Cash received (dues)</span>
          <span style="font-weight: 600; color: #0E7C58; font-variant-numeric: tabular-nums;">+₹1,500</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
          <span style="color: var(--text-muted);">Payouts & expenses</span>
          <span style="font-weight: 600; color: #C8283C; font-variant-numeric: tabular-nums;">−₹2,350</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0 4px 0; border-top: 1px solid var(--border); margin-top: 6px; font-size: 15px; font-weight: 700;">
          <span style="color: var(--graphite);">Expected in drawer</span>
          <span style="color: var(--graphite); font-variant-numeric: tabular-nums;">₹25,450</span>
        </div>
      </div>

      <!-- Count the drawer (Denomination Grid - Page 14) -->
      <div style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <strong style="font-size: 15px; color: var(--graphite);">Count the drawer</strong>
          <span style="font-size: 12.5px; color: var(--text-muted);">By denomination</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px;">
          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">₹500</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 2px;">× 32</div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">₹200</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 2px;">× 20</div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">₹100</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 2px;">× 38</div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">₹50</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 2px;">× 20</div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">₹20</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 2px;">× 15</div>
          </div>
          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">₹10 & coins</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 2px;">× 20</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control);">
          <span style="font-size: 15px; font-weight: 600; color: var(--graphite);">Counted</span>
          <span style="font-size: 22px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹25,300</span>
        </div>
      </div>

      <!-- Variance Banner (Amber 'Short by ₹150' style per Page 14) -->
      <div style="background: #FEF3C7; border-radius: var(--radius-card); padding: 14px 16px; display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        ${lucideIcon("alert-triangle", 22, 1.75, "#A35A00")}
        <div>
          <div style="font-size: 14.5px; font-weight: 700; color: #A35A00;">Short by ₹150</div>
          <div style="font-size: 12.5px; color: #78350F;">Add a note — your manager will see it.</div>
        </div>
      </div>

      <!-- Non-Cash Collected Summary Cards (Page 14) -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px;">
          <div style="font-size: 12.5px; color: var(--text-muted);">UPI collected</div>
          <div style="font-size: 18px; font-weight: 700; color: var(--graphite); margin-top: 4px; font-variant-numeric: tabular-nums;">₹19,840</div>
        </div>
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px;">
          <div style="font-size: 12.5px; color: var(--text-muted);">Card collected</div>
          <div style="font-size: 18px; font-weight: 700; color: var(--graphite); margin-top: 4px; font-variant-numeric: tabular-nums;">₹4,120</div>
        </div>
      </div>

      <!-- Sticky Close Shift Button (Graphite #0E0E12 per Page 14) -->
      <button onclick="alert('Register shift #14 closed successfully. Settlement summary printed.'); switchTab('dashboard');" class="btn btn-secondary" style="width: 100%; height: 50px; font-size: 15px;">
        ${lucideIcon("lock", 18, 1.75, "#FFFFFF")}
        <span>Close shift & print summary</span>
      </button>
    </div>
  `;
}

// --- SCREEN 12: ITEMS LIST (Page 15) ---
function renderInventory() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="padding-bottom: 84px;">
      <!-- Header (Page 15) -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div>
          <h1 class="type-title" style="margin: 0; font-size: 26px;">Items</h1>
          <div style="font-size: 13px; color: var(--text-muted);">1,284 variants · ₹38.6L at cost</div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button style="border: none; background: var(--paper); border: 1px solid var(--border); width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${lucideIcon("arrow-left-right", 16, 1.75, "var(--graphite)")}
          </button>
          <button style="border: none; background: var(--paper); border: 1px solid var(--border); width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${lucideIcon("search", 16, 1.75, "var(--graphite)")}
          </button>
        </div>
      </div>

      <!-- Search & Filter Row -->
      <div style="display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px 14px; margin-bottom: 14px;">
        ${lucideIcon("search", 18, 1.75, "#6B7280")}
        <input type="text" placeholder="Search kurta, SKU, fabric..." style="flex: 1; border: none; outline: none; font-size: 14px; background: transparent; font-family: inherit;">
        <button style="border: none; background: none; cursor: pointer; padding: 2px;">
          ${lucideIcon("scan", 18, 1.75, "var(--graphite)")}
        </button>
        <button style="border: none; background: none; cursor: pointer; padding: 2px;">
          ${lucideIcon("sliders-horizontal", 18, 1.75, "var(--graphite)")}
        </button>
      </div>

      <!-- Horizontal Filter Chips (All [active black] / Low stock · 14 / Kurtas / Sarees / Menswear) -->
      <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 12px; margin-bottom: 14px;">
        <button class="segment-btn active" style="background: var(--graphite); color: #FFFFFF; border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px;">All</button>
        <button class="segment-btn" onclick="switchTab('lowstock')" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px; white-space: nowrap;">Low stock · 14</button>
        <button class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px;">Kurtas</button>
        <button class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); border-radius: var(--radius-pill); font-size: 13px;">Sarees</button>
        <button class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); border-radius: var(--radius-pill); font-size: 13px;">Menswear</button>
      </div>

      <!-- Item Rows (Page 15) -->
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <!-- Item 1: Chanderi silk kurta -->
        <div onclick="openItemDetail({name: 'Chanderi silk kurta', sku: 'VX-KUR-0142', price: '2,450', avail: '36 available', color: '#233876'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #233876; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("shirt", 22, 1.75, "#FFFFFF")}
            </div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Chanderi silk kurta</div>
              <div class="type-caption">VX-KUR-0142 · S–XL · Chand...</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹2,450</div>
            <div class="chip chip-paid" style="margin-top: 4px;">36 available</div>
          </div>
        </div>

        <!-- Item 2: Banarasi silk saree -->
        <div onclick="openItemDetail({name: 'Banarasi silk saree', sku: 'VX-SAR-0031', price: '8,900', avail: '3 left', color: '#881337'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #881337; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("shirt", 22, 1.75, "#FFFFFF")}
            </div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Banarasi silk saree</div>
              <div class="type-caption">VX-SAR-0031 · Free size · Katan silk</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹8,900</div>
            <div class="chip chip-risk" style="margin-top: 4px;">3 left</div>
          </div>
        </div>

        <!-- Item 3: Linen Nehru jacket -->
        <div onclick="openItemDetail({name: 'Linen Nehru jacket', sku: 'VX-JKT-0087', price: '1,890', avail: '9 available', color: '#374151'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #374151; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("shirt", 22, 1.75, "#FFFFFF")}
            </div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Linen Nehru jacket</div>
              <div class="type-caption">VX-JKT-0087 · 38–44 · Linen</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹1,890</div>
            <div class="chip chip-due" style="margin-top: 4px;">9 available</div>
          </div>
        </div>

        <!-- Item 4: Cotton palazzo -->
        <div onclick="openItemDetail({name: 'Cotton palazzo', sku: 'VX-PLZ-0213', price: '790', avail: '64 available', color: '#9A3412'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #9A3412; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("shirt", 22, 1.75, "#FFFFFF")}
            </div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Cotton palazzo</div>
              <div class="type-caption">VX-PLZ-0213 · S–XXL · Cotton</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹790</div>
            <div class="chip chip-paid" style="margin-top: 4px;">64 available</div>
          </div>
        </div>

        <!-- Item 5: Bandhani dupatta -->
        <div onclick="openItemDetail({name: 'Bandhani dupatta', sku: 'VX-DUP-0110', price: '1,250', avail: '2 left', color: '#B45309'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #B45309; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("shirt", 22, 1.75, "#FFFFFF")}
            </div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Bandhani dupatta</div>
              <div class="type-caption">VX-DUP-0110 · Free size · Georgette</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹1,250</div>
            <div class="chip chip-risk" style="margin-top: 4px;">2 left</div>
          </div>
        </div>

        <!-- Item 6: Khadi kurta pyjama set -->
        <div onclick="openItemDetail({name: 'Khadi kurta pyjama set', sku: 'VX-SET-0045', price: '2,190', avail: '21 available', color: '#3F6212'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #3F6212; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("shirt", 22, 1.75, "#FFFFFF")}
            </div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Khadi kurta pyjama set</div>
              <div class="type-caption">VX-SET-0045 · 38–46 · Khadi</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹2,190</div>
            <div class="chip chip-paid" style="margin-top: 4px;">21 available</div>
          </div>
        </div>
      </div>

      <!-- Floating Action Button: + Add garment (Vastra Violet #5B3DF5 pill - Page 15) -->
      <div style="position: fixed; bottom: 84px; right: var(--screen-gutter); z-index: 99;">
        <button onclick="openAddGarmentScreen()" class="btn btn-primary" style="border-radius: var(--radius-pill); padding: 12px 20px; box-shadow: 0 8px 24px rgba(91, 61, 245, 0.35);">
          ${lucideIcon("plus", 18, 2, "#FFFFFF")}
          <span>Add garment</span>
        </button>
      </div>
    </div>
  `;
}

// --- SCREEN 13: ITEM DETAIL (Page 16) ---
function openItemDetail(item = {}) {
  const container = document.getElementById("tab-content");
  if (!container) return;

  const name = item.name || "Chanderi silk kurta";
  const sku = item.sku || "VX-KUR-0142";
  const price = item.price || "2,450";

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 96px;">
      <!-- Top Bar: Back & Actions -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <button onclick="switchTab('inventory')" style="border: none; background: none; cursor: pointer; padding: 4px;">
          ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
        </button>
        <div style="display: flex; gap: 8px;">
          <button style="border: none; background: var(--paper); border: 1px solid var(--border); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${lucideIcon("edit", 16, 1.75, "var(--graphite)")}
          </button>
          <button style="border: none; background: var(--paper); border: 1px solid var(--border); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${lucideIcon("more-vertical", 16, 1.75, "var(--graphite)")}
          </button>
        </div>
      </div>

      <!-- Hero Visual Panel with Color Swatches & Counter (Page 16) -->
      <div style="background: #233876; border-radius: var(--radius-card); height: 200px; position: relative; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
        ${lucideIcon("shirt", 80, 1.5, "rgba(255,255,255,0.7)")}

        <!-- Color Swatch Dots -->
        <div style="position: absolute; bottom: 14px; left: 16px; display: flex; gap: 8px; align-items: center;">
          <div style="width: 22px; height: 22px; border-radius: 50%; background: #233876; border: 2px solid white;"></div>
          <div style="width: 18px; height: 18px; border-radius: 50%; background: #881337;"></div>
          <div style="width: 18px; height: 18px; border-radius: 50%; background: #D97706;"></div>
        </div>

        <!-- 1 / 4 Image Indicator -->
        <div style="position: absolute; bottom: 14px; right: 16px; background: rgba(0,0,0,0.5); padding: 4px 10px; border-radius: var(--radius-pill); font-size: 11.5px; font-weight: 600; color: white;">
          1 / 4
        </div>
      </div>

      <!-- Title & Price (Page 16) -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px;">
        <div>
          <h1 class="type-title" style="margin: 0 0 4px 0; font-size: 24px;">${name}</h1>
          <div class="type-caption">Indigo · ${sku} · HSN 6204</div>
        </div>
        <div class="type-title" style="color: var(--graphite); font-size: 26px; font-variant-numeric: tabular-nums;">₹${price}</div>
      </div>

      <!-- 3-Price Card Row (Retail / Wholesale / Dealer) -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;">
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px;">
          <div class="type-overline">Retail</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 4px; font-variant-numeric: tabular-nums;">₹2,450</div>
        </div>
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px;">
          <div class="type-overline">Wholesale</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 4px; font-variant-numeric: tabular-nums;">₹1,980</div>
        </div>
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px;">
          <div class="type-overline">Dealer</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 4px; font-variant-numeric: tabular-nums;">₹1,760</div>
        </div>
      </div>

      <!-- Stock Breakdown Card (Page 16) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <strong style="font-size: 15px; color: var(--graphite);">Stock</strong>
          <span style="font-size: 12.5px; color: var(--text-muted);">48 on hand · 20 in transit</span>
        </div>

        <!-- Segmented Stock Bar -->
        <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 14px;">
          <div style="flex: 36; background: var(--graphite);"></div>
          <div style="flex: 8; background: var(--vastra-violet);"></div>
          <div style="flex: 4; background: var(--risk-red);"></div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px;">
          <div>
            <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted);">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--graphite);"></span> Available
            </div>
            <div style="font-size: 20px; font-weight: 700; color: var(--graphite); margin-top: 2px;">36</div>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted);">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--vastra-violet);"></span> Reserved
            </div>
            <div style="font-size: 20px; font-weight: 700; color: var(--graphite); margin-top: 2px;">8</div>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted);">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--risk-red);"></span> Damaged
            </div>
            <div style="font-size: 20px; font-weight: 700; color: var(--graphite); margin-top: 2px;">4</div>
          </div>
        </div>

        <!-- Size Grid with Low Stock Highlighting (Page 16) -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
          <div style="background: #F9FAFB; border-radius: var(--radius-control); padding: 10px; text-align: center;">
            <div style="font-size: 12px; color: var(--text-muted);">S</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 2px;">6</div>
          </div>
          <div style="background: #F9FAFB; border-radius: var(--radius-control); padding: 10px; text-align: center;">
            <div style="font-size: 12px; color: var(--text-muted);">M</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 2px;">14</div>
          </div>
          <div style="background: #FEE2E2; border-radius: var(--radius-control); padding: 10px; text-align: center;">
            <div style="font-size: 12px; color: #C8283C; font-weight: 600;">L · low</div>
            <div style="font-size: 16px; font-weight: 700; color: #C8283C; margin-top: 2px;">3</div>
          </div>
          <div style="background: #F9FAFB; border-radius: var(--radius-control); padding: 10px; text-align: center;">
            <div style="font-size: 12px; color: var(--text-muted);">XL</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 2px;">13</div>
          </div>
        </div>
      </div>

      <!-- Detail Rows (Fabric / Supplier / Location) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px;">
          <span style="color: var(--text-muted);">Fabric</span>
          <span style="font-weight: 600; color: var(--graphite);">Chanderi silk-cotton</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px;">
          <span style="color: var(--text-muted);">Supplier</span>
          <span style="font-weight: 600; color: var(--vastra-violet); cursor: pointer;" onclick="switchTab('suppliers')">Shree Textiles, Surat</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px;">
          <span style="color: var(--text-muted);">Location</span>
          <span style="font-weight: 600; color: var(--graphite);">Rack R-03 · Shelf B</span>
        </div>
      </div>

      <!-- Bottom Action Pair: New order | Receive stock (Page 16) -->
      <div style="display: flex; gap: 12px;">
        <button onclick="switchTab('suppliers')" class="btn btn-tertiary" style="flex: 1; height: 50px;">
          ${lucideIcon("receipt", 18, 1.75)} New order
        </button>
        <button onclick="openReceiveGoodsScreen()" class="btn btn-primary" style="flex: 1; height: 50px;">
          ${lucideIcon("package", 18, 1.75, "#FFFFFF")} Receive stock
        </button>
      </div>
    </div>
  `;
}

// --- SCREEN 14: ADD GARMENT (Page 17) ---
function openAddGarmentScreen() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Top Bar: Close & Save draft (Page 17) -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <button onclick="switchTab('inventory')" style="border: none; background: none; cursor: pointer; padding: 4px;">
            ${lucideIcon("x", 22, 1.75, "var(--graphite)")}
          </button>
          <h1 class="type-heading" style="margin: 0; font-size: 18px;">Add garment</h1>
        </div>
        <button onclick="alert('Draft saved locally.'); switchTab('inventory');" style="border: none; background: none; font-size: 14px; font-weight: 600; color: var(--graphite); cursor: pointer;">
          Save draft
        </button>
      </div>

      <!-- Top Photo Picker + Swatch Row (Page 17) -->
      <div style="display: flex; gap: 12px; margin-bottom: 20px;">
        <div style="width: 80px; height: 80px; border: 1.5px dashed var(--border); border-radius: var(--radius-card); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer; background: var(--paper);">
          ${lucideIcon("camera", 22, 1.75, "#6B7280")}
          <span style="font-size: 11px; font-weight: 600; color: var(--text-muted);">Add photo</span>
        </div>
        <div style="width: 80px; height: 80px; border-radius: var(--radius-card); background: #134E4A; display: flex; align-items: center; justify-content: center;">
          ${lucideIcon("shirt", 32, 1.75, "rgba(255,255,255,0.7)")}
        </div>
        <div style="width: 80px; height: 80px; border-radius: var(--radius-card); background: #D6C2A9; display: flex; align-items: center; justify-content: center;">
          ${lucideIcon("shirt", 32, 1.75, "rgba(255,255,255,0.7)")}
        </div>
      </div>

      <!-- Garment Name Input -->
      <div style="margin-bottom: 18px;">
        <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">Garment name</label>
        <input type="text" id="add-prod-name" value="Mul cotton anarkali" style="width: 100%; box-sizing: border-box; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px; font-size: 15px; font-weight: 500; color: var(--graphite); outline: none;">
      </div>

      <!-- Category & Fabric Dropdown Row -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px;">
        <div>
          <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">Category</label>
          <div style="display: flex; align-items: center; justify-content: space-between; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px;">
            <span style="font-size: 14.5px; color: var(--graphite);">Kurtas</span>
            ${lucideIcon("chevron-down", 16, 1.75, "#6B7280")}
          </div>
        </div>
        <div>
          <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">Fabric</label>
          <div style="display: flex; align-items: center; justify-content: space-between; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px;">
            <span style="font-size: 14.5px; color: var(--graphite);">Mul cotton</span>
            ${lucideIcon("chevron-down", 16, 1.75, "#6B7280")}
          </div>
        </div>
      </div>

      <!-- Colours Row with Add Button -->
      <div style="margin-bottom: 20px;">
        <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 8px;">Colours</label>
        <div style="display: flex; gap: 10px; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px; background: var(--paper); border: 1px solid var(--border); padding: 6px 14px; border-radius: var(--radius-pill); font-size: 13px; font-weight: 600;">
            <span style="width: 14px; height: 14px; border-radius: 50%; background: #134E4A;"></span>
            <span>Teal</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; background: var(--paper); border: 1px solid var(--border); padding: 6px 14px; border-radius: var(--radius-pill); font-size: 13px; font-weight: 600;">
            <span style="width: 14px; height: 14px; border-radius: 50%; background: #D6C2A9;"></span>
            <span>Beige</span>
          </div>
          <button style="width: 32px; height: 32px; border-radius: 50%; background: var(--paper); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${lucideIcon("plus", 16, 2, "var(--graphite)")}
          </button>
        </div>
      </div>

      <!-- Sizes Grid with Live Variant Count (Page 17) -->
      <div style="margin-bottom: 22px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label class="type-caption" style="font-weight: 600; color: var(--graphite); margin: 0;">Sizes</label>
          <span style="font-size: 12.5px; color: var(--text-muted);">8 variants will be created</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px;">
          <button class="segment-btn" style="border: 1px solid var(--border); background: var(--paper); border-radius: var(--radius-control); padding: 10px 0; font-size: 13px;">XS</button>
          <button class="segment-btn active" style="background: var(--graphite); color: white; border-radius: var(--radius-control); padding: 10px 0; font-size: 13px;">S</button>
          <button class="segment-btn active" style="background: var(--graphite); color: white; border-radius: var(--radius-control); padding: 10px 0; font-size: 13px;">M</button>
          <button class="segment-btn active" style="background: var(--graphite); color: white; border-radius: var(--radius-control); padding: 10px 0; font-size: 13px;">L</button>
          <button class="segment-btn active" style="background: var(--graphite); color: white; border-radius: var(--radius-control); padding: 10px 0; font-size: 13px;">XL</button>
          <button class="segment-btn" style="border: 1px solid var(--border); background: var(--paper); border-radius: var(--radius-control); padding: 10px 0; font-size: 13px;">XXL</button>
        </div>
      </div>

      <!-- Pricing 4-Field Grid (Cost / Retail / Wholesale / Dealer) -->
      <div style="margin-bottom: 22px;">
        <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 8px;">Pricing</label>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="font-size: 11.5px; color: var(--text-muted); display: block; margin-bottom: 4px;">Cost</label>
            <input type="text" value="₹980" style="width: 100%; box-sizing: border-box; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px; font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">
          </div>
          <div>
            <label style="font-size: 11.5px; color: var(--text-muted); display: block; margin-bottom: 4px;">Retail (MRP)</label>
            <input type="text" value="₹2,190" style="width: 100%; box-sizing: border-box; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px; font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label style="font-size: 11.5px; color: var(--text-muted); display: block; margin-bottom: 4px;">Wholesale</label>
            <input type="text" value="₹1,640" style="width: 100%; box-sizing: border-box; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px; font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">
          </div>
          <div>
            <label style="font-size: 11.5px; color: var(--text-muted); display: block; margin-bottom: 4px;">Dealer</label>
            <input type="text" value="₹1,480" style="width: 100%; box-sizing: border-box; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px; font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">
          </div>
        </div>
      </div>

      <!-- Information Note (Page 17) -->
      <div style="display: flex; gap: 8px; font-size: 12.5px; color: var(--text-muted); margin-bottom: 24px; line-height: 1.4;">
        <span style="color: var(--text-muted);">ⓘ</span>
        <span>Barcodes are generated. Stock starts at 0 until goods are received.</span>
      </div>

      <!-- Primary Action: Create 8 variants (Vastra Violet #5B3DF5) -->
      <button onclick="alert('Successfully generated 8 variant SKUs with unique barcodes!'); switchTab('inventory');" class="btn btn-primary" style="width: 100%; height: 50px; font-size: 15px;">
        Create 8 variants
      </button>
    </div>
  `;
}

// --- SCREEN 15: RECEIVE GOODS (Page 18) ---
function openReceiveGoodsScreen(po = {}) {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header with Scanner Icon (Page 18) -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button onclick="switchTab('inventory')" style="border: none; background: none; cursor: pointer; padding: 4px;">
            ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
          </button>
          <div>
            <h1 class="type-heading" style="margin: 0; font-size: 20px;">Receive goods</h1>
            <div style="font-size: 12.5px; color: var(--text-muted);">Against PO-0318 · Shree Textiles</div>
          </div>
        </div>
        <button style="border: none; background: var(--paper); border: 1px solid var(--border); width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${lucideIcon("scan", 20, 1.75, "var(--graphite)")}
        </button>
      </div>

      <!-- Progress Card (62 of 80 units arrived · Partial receipt) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <strong style="font-size: 15px; color: var(--graphite);">62 of 80 units arrived</strong>
          <span class="chip chip-due">Partial receipt</span>
        </div>
        <div style="height: 6px; background: #E5E7EB; border-radius: 3px; overflow: hidden;">
          <div style="width: 77.5%; height: 100%; background: var(--graphite); border-radius: 3px;"></div>
        </div>
      </div>

      <!-- Supplier Invoice & Put-away fields -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
        <div>
          <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">Supplier invoice</label>
          <input type="text" value="ST/24-25/1187" style="width: 100%; box-sizing: border-box; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px; font-size: 14px; font-weight: 600; color: var(--graphite);">
        </div>
        <div>
          <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">Put away at</label>
          <div style="display: flex; align-items: center; justify-content: space-between; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px;">
            <span style="font-size: 14px; color: var(--graphite);">Godown · R-03</span>
            ${lucideIcon("chevron-down", 16, 1.75, "#6B7280")}
          </div>
        </div>
      </div>

      <!-- Per-Line Input Table (ITEM | RECD | DAMAGED - Page 18) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 18px;">
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">
          <span>ITEM</span>
          <span style="text-align: center;">RECD</span>
          <span style="text-align: center;">DAMAGED</span>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border);">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Chanderi silk kurta</div>
            <div class="type-caption">Indigo · M · of 20</div>
          </div>
          <input type="number" value="20" style="text-align: center; background: #F9FAFB; border: 1px solid var(--border); border-radius: 8px; padding: 8px; font-weight: 700; font-size: 15px;">
          <input type="number" value="0" style="text-align: center; background: #F9FAFB; border: 1px solid var(--border); border-radius: 8px; padding: 8px; font-weight: 700; font-size: 15px;">
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border);">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Chanderi silk kurta</div>
            <div class="type-caption">Indigo · L · of 20</div>
          </div>
          <input type="number" value="18" style="text-align: center; background: #F9FAFB; border: 1px solid var(--border); border-radius: 8px; padding: 8px; font-weight: 700; font-size: 15px;">
          <input type="number" value="2" style="text-align: center; background: #FEE2E2; border: 1px solid #FCA5A5; color: #C8283C; border-radius: 8px; padding: 8px; font-weight: 700; font-size: 15px;">
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border);">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Linen Nehru jacket</div>
            <div class="type-caption">Charcoal · 40 · of 20</div>
          </div>
          <input type="number" value="12" style="text-align: center; background: #F9FAFB; border: 1px solid var(--border); border-radius: 8px; padding: 8px; font-weight: 700; font-size: 15px;">
          <input type="number" value="0" style="text-align: center; background: #F9FAFB; border: 1px solid var(--border); border-radius: 8px; padding: 8px; font-weight: 700; font-size: 15px;">
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border);">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Cotton palazzo</div>
            <div class="type-caption">Rust · L · of 20</div>
          </div>
          <input type="number" value="12" style="text-align: center; background: #F9FAFB; border: 1px solid var(--border); border-radius: 8px; padding: 8px; font-weight: 700; font-size: 15px;">
          <input type="number" value="2" style="text-align: center; background: #FEE2E2; border: 1px solid #FCA5A5; color: #C8283C; border-radius: 8px; padding: 8px; font-weight: 700; font-size: 15px;">
        </div>
      </div>

      <!-- Informational Note (Page 18) -->
      <div style="display: flex; gap: 8px; font-size: 12.5px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.4;">
        <span style="color: var(--text-muted);">ⓘ</span>
        <span>18 units stay open on the PO. Damaged pieces are tracked separately and can be returned to the supplier.</span>
      </div>

      <!-- Bottom Bar: Adds to stock summary & Post goods receipt (Page 18) -->
      <div style="margin-bottom: 12px; font-size: 13.5px; display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Adds to stock</span>
        <strong style="color: var(--graphite);">58 available · 4 damaged</strong>
      </div>

      <button onclick="alert('Inward stock receipt posted. Inventory counts updated across store and godown.'); switchTab('inventory');" class="btn btn-primary" style="width: 100%; height: 50px; font-size: 15px;">
        ${lucideIcon("check", 18, 2.2, "#FFFFFF")}
        <span>Post goods receipt</span>
      </button>
    </div>
  `;
}



// --- SCREEN 16: LOW STOCK (Page 19) ---
function renderLowStock() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header with Locations Dropdown (Page 19) -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button onclick="switchTab('inventory')" style="border: none; background: none; cursor: pointer; padding: 4px;">
            ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
          </button>
          <h1 class="type-title" style="margin: 0; font-size: 24px;">Low stock</h1>
        </div>
        <div style="display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: var(--graphite); background: var(--paper); border: 1px solid var(--border); padding: 6px 12px; border-radius: var(--radius-pill); cursor: pointer;">
          ${lucideIcon("map-pin", 14, 1.75, "var(--graphite)")}
          <span>All locations</span>
          ${lucideIcon("chevron-down", 14, 1.75, "#6B7280")}
        </div>
      </div>

      <!-- Hero Dark Summary Card (Page 19: Below minimum / Out of stock / To reorder) -->
      <div class="card-hero-dark" style="margin-bottom: 20px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 10px;">
          <div>
            <div style="font-size: 28px; font-weight: 700; color: #FFFFFF; font-variant-numeric: tabular-nums;">14</div>
            <div style="font-size: 12px; color: #9CA3AF;">Below minimum</div>
          </div>
          <div>
            <div style="font-size: 28px; font-weight: 700; color: #F87171; font-variant-numeric: tabular-nums;">4</div>
            <div style="font-size: 12px; color: #9CA3AF;">Out of stock</div>
          </div>
          <div>
            <div style="font-size: 28px; font-weight: 700; color: #FFFFFF; font-variant-numeric: tabular-nums;">₹42.6k</div>
            <div style="font-size: 12px; color: #9CA3AF;">To reorder</div>
          </div>
        </div>
      </div>

      <!-- Supplier Group 1: Shree Textiles (Page 19) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">ST</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Shree Textiles</div>
              <div class="type-caption">Surat · lead time 5 days</div>
            </div>
          </div>
          <div style="font-size: 16px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹24,300</div>
        </div>

        <!-- Line 1 -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" checked style="accent-color: var(--vastra-violet); width: 18px; height: 18px;">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Chanderi silk kurta · L</div>
              <div style="font-size: 12px; color: #C8283C; font-weight: 600;">3 left · min 10</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; background: #F3F4F6; border-radius: var(--radius-pill); padding: 4px 8px;">
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer;">−</button>
            <span style="font-size: 13.5px; font-weight: 700; min-width: 18px; text-align: center;">15</span>
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer;">+</button>
          </div>
        </div>

        <!-- Line 2 -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" checked style="accent-color: var(--vastra-violet); width: 18px; height: 18px;">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Cotton palazzo · XXL</div>
              <div style="font-size: 12px; color: #C8283C; font-weight: 600;">Out of stock · min 8</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; background: #F3F4F6; border-radius: var(--radius-pill); padding: 4px 8px;">
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer;">−</button>
            <span style="font-size: 13.5px; font-weight: 700; min-width: 18px; text-align: center;">12</span>
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer;">+</button>
          </div>
        </div>

        <!-- Line 3 -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" checked style="accent-color: var(--vastra-violet); width: 18px; height: 18px;">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Linen Nehru jacket · 44</div>
              <div style="font-size: 12px; color: #A35A00; font-weight: 600;">1 left · min 6</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; background: #F3F4F6; border-radius: var(--radius-pill); padding: 4px 8px;">
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer;">−</button>
            <span style="font-size: 13.5px; font-weight: 700; min-width: 18px; text-align: center;">6</span>
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer;">+</button>
          </div>
        </div>
      </div>

      <!-- Supplier Group 2: Kala Silk House (Page 19) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">KS</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Kala Silk House</div>
              <div class="type-caption">Varanasi · lead time 9 days</div>
            </div>
          </div>
          <div style="font-size: 16px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹18,300</div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" checked style="accent-color: var(--vastra-violet); width: 18px; height: 18px;">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Banarasi silk saree · Wine</div>
              <div style="font-size: 12px; color: #C8283C; font-weight: 600;">3 left · min 6</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; background: #F3F4F6; border-radius: var(--radius-pill); padding: 4px 8px;">
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer;">−</button>
            <span style="font-size: 13.5px; font-weight: 700; min-width: 18px; text-align: center;">4</span>
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer;">+</button>
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" checked style="accent-color: var(--vastra-violet); width: 18px; height: 18px;">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Bandhani dupatta · Mustard</div>
              <div style="font-size: 12px; color: #C8283C; font-weight: 600;">Out of stock · min 5</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; background: #F3F4F6; border-radius: var(--radius-pill); padding: 4px 8px;">
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer;">−</button>
            <span style="font-size: 13.5px; font-weight: 700; min-width: 18px; text-align: center;">6</span>
            <button style="border: none; background: none; font-size: 16px; font-weight: 700; cursor: pointer;">+</button>
          </div>
        </div>
      </div>

      <!-- Sticky Bottom: 5 items · 2 suppliers & Create 2 purchase orders -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px;">
          <span style="color: var(--text-muted);">5 items · 2 suppliers</span>
          <strong style="color: var(--graphite); font-variant-numeric: tabular-nums;">₹42,600 at cost</strong>
        </div>
        <button onclick="alert('2 Purchase Orders (PO-0319 & PO-0320) generated and queued for dispatch.'); switchTab('dealers');" class="btn btn-primary" style="width: 100%; height: 50px; font-size: 15px;">
          Create 2 purchase orders
        </button>
      </div>
    </div>
  `;
}

// --- SCREEN 17: STOCK MOVEMENT (Page 20) ---
function renderStockMovement() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header -->
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
        <button onclick="switchTab('more')" style="border: none; background: none; cursor: pointer; padding: 4px;">
          ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
        </button>
        <h1 class="type-title" style="margin: 0; font-size: 24px;">Stock movement</h1>
      </div>

      <!-- Tab Switcher: Transfer (active) | Physical count | Return (Page 20) -->
      <div class="segmented-control" style="margin-bottom: 20px;">
        <button type="button" class="segment-btn active">Transfer</button>
        <button type="button" class="segment-btn">Physical count</button>
        <button type="button" class="segment-btn">Return</button>
      </div>

      <!-- FROM & TO Cards with Swap Icon in between (Page 20) -->
      <div style="position: relative; margin-bottom: 24px;">
        <!-- FROM Card -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 14px;">
          <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
            ${lucideIcon("building", 20, 1.75, "var(--graphite)")}
          </div>
          <div>
            <div class="type-overline">FROM</div>
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Main godown · Aji GIDC</div>
          </div>
        </div>

        <!-- Swap Icon Circle -->
        <div style="position: absolute; right: 24px; top: 58px; z-index: 10; width: 36px; height: 36px; border-radius: 50%; background: var(--graphite); color: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.2); cursor: pointer;">
          ${lucideIcon("arrow-left-right", 16, 2, "#FFFFFF")}
        </div>

        <!-- TO Card -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; display: flex; align-items: center; gap: 14px;">
          <div style="width: 40px; height: 40px; border-radius: 12px; background: #EDE9FE; display: flex; align-items: center; justify-content: center;">
            ${lucideIcon("store", 20, 1.75, "var(--vastra-violet)")}
          </div>
          <div>
            <div class="type-overline">TO</div>
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Shop floor · Yagnik Road</div>
          </div>
        </div>
      </div>

      <!-- Scannable Item List (Page 20) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <strong style="font-size: 15px; color: var(--graphite);">Items · 24 units</strong>
          <a href="#" onclick="alert('Barcode camera scanner ready to scan item tags.');" style="font-size: 13.5px; font-weight: 600; color: var(--vastra-violet); text-decoration: none; display: flex; align-items: center; gap: 4px;">
            ${lucideIcon("scan", 16, 1.75, "var(--vastra-violet)")}
            <span>Scan to add</span>
          </a>
        </div>

        <!-- Item 1 -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: #233876;"></div>
            <div>
              <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Chanderi silk kurta · M</div>
              <div class="type-caption">14 in godown</div>
            </div>
          </div>
          <div style="background: #F3F4F6; border-radius: 8px; padding: 6px 14px; font-weight: 700; font-size: 15px;">10</div>
        </div>

        <!-- Item 2 -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: #3F6212;"></div>
            <div>
              <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Khadi kurta pyjama · 40</div>
              <div class="type-caption">21 in godown</div>
            </div>
          </div>
          <div style="background: #F3F4F6; border-radius: 8px; padding: 6px 14px; font-weight: 700; font-size: 15px;">8</div>
        </div>

        <!-- Item 3 -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: #991B1B;"></div>
            <div>
              <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Bandhani dupatta · Red</div>
              <div class="type-caption">9 in godown</div>
            </div>
          </div>
          <div style="background: #F3F4F6; border-radius: 8px; padding: 6px 14px; font-weight: 700; font-size: 15px;">6</div>
        </div>
      </div>

      <!-- Note for Receiver (Page 20) -->
      <div style="margin-bottom: 20px;">
        <label class="type-caption" style="display: block; font-weight: 600; color: var(--graphite); margin-bottom: 6px;">Note for receiver</label>
        <input type="text" value="Diwali display — front racks" style="width: 100%; box-sizing: border-box; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px 14px; font-size: 14.5px; color: var(--graphite);">
      </div>

      <!-- Footer Note -->
      <div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-muted); margin-bottom: 24px;">
        ${lucideIcon("truck", 16, 1.75, "#6B7280")}
        <span>Shows as in-transit until the shop confirms receipt.</span>
      </div>

      <!-- Send 24 units Button (Vastra Violet #5B3DF5) -->
      <button onclick="alert('Dispatched 24 units in transit to Shop floor.'); switchTab('inventory');" class="btn btn-primary" style="width: 100%; height: 50px; font-size: 15px;">
        Send 24 units
      </button>
    </div>
  `;
}

// --- SCREEN 18: INVOICE VIEW (Page 21) ---
function openInvoiceDetail(invoice = {}) {
  const container = document.getElementById("tab-content");
  if (!container) return;

  const invId = invoice.id || invoice.invoice_number || "VX-2041";

  container.innerHTML = `
    <div style="max-width: 480px; margin: 0 auto; padding-bottom: 96px;">
      <!-- Top Bar: Back & Status Chip (Page 21) -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <button onclick="switchTab('invoices')" style="border: none; background: none; cursor: pointer; padding: 4px;">
            ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
          </button>
          <span style="font-size: 18px; font-weight: 700; color: var(--graphite);">${invId}</span>
          <span class="chip chip-paid">Paid</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button onclick="switchTab('themes')" style="border: none; background: var(--paper); border: 1px solid var(--border); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${lucideIcon("palette", 16, 1.75, "var(--graphite)")}
          </button>
          <button style="border: none; background: var(--paper); border: 1px solid var(--border); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${lucideIcon("more-vertical", 16, 1.75, "var(--graphite)")}
          </button>
        </div>
      </div>

      <!-- Invoice Sheet Card (Paper #FFFFFF, radius 18px - Page 21) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 22px 20px; margin-bottom: 16px;">
        <!-- Letterhead Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
          <div style="display: flex; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 10px; background: var(--graphite); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">OF</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Odedara Fashions</div>
              <div style="font-size: 12px; color: var(--text-muted);">Yagnik Road, Rajkot 360001</div>
              <div style="font-size: 11.5px; color: var(--text-muted); font-weight: 600;">GSTIN 24AAPCO4821K1Z6</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div class="type-overline">TAX INVOICE</div>
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">${invId}</div>
            <div style="font-size: 11.5px; color: var(--text-muted);">26 Oct 2026, 7:42 PM</div>
          </div>
        </div>

        <!-- Bill To & Place of Supply -->
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin-bottom: 16px; font-size: 13px;">
          <div><span style="color: var(--text-muted);">Bill to</span> <strong>Walk-in customer</strong></div>
          <div><span style="color: var(--text-muted);">Place of supply:</span> <strong>Gujarat</strong></div>
        </div>

        <!-- Line Item Table (ITEM | QTY | RATE | AMOUNT) -->
        <div style="margin-bottom: 18px;">
          <div style="display: grid; grid-template-columns: 2.2fr 0.8fr 1fr 1fr; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">
            <span>ITEM</span>
            <span style="text-align: center;">QTY</span>
            <span style="text-align: right;">RATE</span>
            <span style="text-align: right;">AMOUNT</span>
          </div>

          <div style="display: grid; grid-template-columns: 2.2fr 0.8fr 1fr 1fr; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #F3F4F6;">
            <div>
              <div style="font-weight: 600; color: var(--graphite);">Chanderi silk kurta · Indigo M</div>
              <div style="font-size: 11px; color: var(--text-muted);">HSN 6204 · 5%</div>
            </div>
            <span style="text-align: center; font-variant-numeric: tabular-nums;">1</span>
            <span style="text-align: right; font-variant-numeric: tabular-nums;">2,450.00</span>
            <span style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">2,450.00</span>
          </div>

          <div style="display: grid; grid-template-columns: 2.2fr 0.8fr 1fr 1fr; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #F3F4F6;">
            <div>
              <div style="font-weight: 600; color: var(--graphite);">Linen Nehru jacket · 40</div>
              <div style="font-size: 11px; color: var(--text-muted);">HSN 6203 · 5%</div>
            </div>
            <span style="text-align: center; font-variant-numeric: tabular-nums;">1</span>
            <span style="text-align: right; font-variant-numeric: tabular-nums;">1,890.00</span>
            <span style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">1,890.00</span>
          </div>

          <div style="display: grid; grid-template-columns: 2.2fr 0.8fr 1fr 1fr; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #F3F4F6;">
            <div>
              <div style="font-weight: 600; color: var(--graphite);">Cotton palazzo · Rust L</div>
              <div style="font-size: 11px; color: var(--text-muted);">HSN 6204 · 5%</div>
            </div>
            <span style="text-align: center; font-variant-numeric: tabular-nums;">2</span>
            <span style="text-align: right; font-variant-numeric: tabular-nums;">790.00</span>
            <span style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">1,580.00</span>
          </div>
        </div>

        <!-- Breakdown & Total (Page 21) -->
        <div style="border-top: 1px solid var(--border); padding-top: 12px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px;">
            <span style="color: var(--text-muted);">Taxable value</span>
            <span style="font-variant-numeric: tabular-nums; font-weight: 600;">5,920.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px;">
            <span style="color: var(--text-muted);">CGST 2.5%</span>
            <span style="font-variant-numeric: tabular-nums; font-weight: 600;">148.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px;">
            <span style="color: var(--text-muted);">SGST 2.5%</span>
            <span style="font-variant-numeric: tabular-nums; font-weight: 600;">148.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0 0 0; border-top: 1px solid var(--border); margin-top: 6px;">
            <span style="font-size: 16px; font-weight: 700; color: var(--graphite);">Total</span>
            <span style="font-size: 24px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹6,216.00</span>
          </div>
        </div>

        <!-- Footer Payment Notes -->
        <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5; border-top: 1px dashed var(--border); padding-top: 12px;">
          <div>Paid via UPI · UTR 4321 9876 5410</div>
          <div>Thank you for shopping with us</div>
        </div>
      </div>

      <!-- Immutability Notice Card with Issue Credit Note link (Page 21) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          ${lucideIcon("lock", 18, 1.75, "#6B7280")}
          <span style="font-size: 13px; color: var(--graphite);">Posted invoices can’t be edited.</span>
        </div>
        <a href="#" onclick="alert('Credit note generator ready for bill ' + '${invId}');" style="font-size: 13.5px; font-weight: 600; color: var(--vastra-violet); text-decoration: none;">Issue credit note</a>
      </div>

      <!-- Bottom Action Row: Download | Print | Share invoice (Page 21) -->
      <div style="display: flex; gap: 10px;">
        <button onclick="downloadInvoicePdf('${invId}')" class="btn btn-tertiary" style="width: 52px; height: 50px; padding: 0;">
          ${lucideIcon("download", 18, 1.75)}
        </button>
        <button onclick="window.print()" class="btn btn-tertiary" style="width: 52px; height: 50px; padding: 0;">
          ${lucideIcon("printer", 18, 1.75)}
        </button>
        <button onclick="shareInvoicePdf('${invId}')" class="btn btn-primary" style="flex: 1; height: 50px;">
          ${lucideIcon("share", 18, 1.75, "#FFFFFF")}
          <span>Share invoice</span>
        </button>
      </div>
    </div>
  `;
}

// --- SCREEN 19: INVOICE THEMES PICKER (Page 22) ---
function renderInvoiceThemesPicker() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  const currentDefault = state.selectedPOSTheme || "MODERN_MINIMAL";

  container.innerHTML = `
    <div style="max-width: 480px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header (Page 22) -->
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 18px;">
        <button onclick="switchTab('more')" style="border: none; background: none; cursor: pointer; padding: 4px;">
          ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
        </button>
        <div>
          <h1 class="type-title" style="margin: 0; font-size: 22px;">Invoice themes</h1>
          <div style="font-size: 12.5px; color: var(--text-muted);">Same data, six looks — preview is the real PDF</div>
        </div>
      </div>

      <!-- 2-Column Grid of 6 Theme Cards (Page 22) -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;" id="theme-cards-grid">
        <!-- 1. Classic GST -->
        <div onclick="selectInvoiceTheme('CLASSIC_GST')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; position: relative; cursor: pointer;">
          <div style="border: 1px solid #D1D5DB; border-radius: 6px; height: 90px; padding: 8px; margin-bottom: 10px; background: #FFFFFF;">
            <div style="height: 10px; background: #E5E7EB; margin-bottom: 8px; border-radius: 2px;"></div>
            <div style="height: 2px; background: #9CA3AF; margin-bottom: 4px;"></div>
            <div style="height: 2px; background: #D1D5DB; margin-bottom: 4px;"></div>
            <div style="height: 2px; background: #D1D5DB; margin-bottom: 4px;"></div>
            <div style="height: 6px; background: var(--graphite); margin-top: 14px; border-radius: 2px;"></div>
          </div>
          <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Classic GST</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">Boxed, every tax column</div>
        </div>

        <!-- 2. Modern Minimal (Selected State with Checkmark Badge - Page 22) -->
        <div onclick="selectInvoiceTheme('MODERN_MINIMAL')" style="background: var(--paper); border: 2px solid var(--vastra-violet); border-radius: var(--radius-card); padding: 14px; position: relative; cursor: pointer;">
          <div style="position: absolute; top: 10px; right: 10px; width: 22px; height: 22px; border-radius: 50%; background: var(--vastra-violet); color: white; display: flex; align-items: center; justify-content: center;">
            ${lucideIcon("check", 14, 2.5, "#FFFFFF")}
          </div>
          <div style="border: 1px solid #E5E7EB; border-radius: 6px; height: 90px; padding: 8px; margin-bottom: 10px; background: #FFFFFF;">
            <div style="height: 6px; width: 40%; background: var(--graphite); margin-bottom: 12px; border-radius: 2px;"></div>
            <div style="height: 2px; background: #E5E7EB; margin-bottom: 6px;"></div>
            <div style="height: 2px; background: #E5E7EB; margin-bottom: 6px;"></div>
            <div style="height: 2px; background: #E5E7EB; margin-bottom: 12px;"></div>
            <div style="height: 6px; width: 50%; background: var(--vastra-violet); border-radius: 2px; margin-left: auto;"></div>
          </div>
          <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Modern Minimal</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">Airy, one bold total</div>
        </div>

        <!-- 3. Premium Boutique -->
        <div onclick="selectInvoiceTheme('PREMIUM_BOUTIQUE')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; position: relative; cursor: pointer;">
          <div style="border: 1px solid #E5E7EB; border-radius: 6px; height: 90px; overflow: hidden; margin-bottom: 10px; background: #FFFFFF;">
            <div style="height: 24px; background: #0E0E12; margin-bottom: 4px;"></div>
            <div style="height: 2px; background: #D97706; margin-bottom: 8px;"></div>
            <div style="padding: 0 6px;">
              <div style="height: 2px; background: #E5E7EB; margin-bottom: 4px;"></div>
              <div style="height: 2px; background: #E5E7EB; margin-bottom: 4px;"></div>
              <div style="height: 4px; background: #D97706; width: 40%; margin-top: 10px;"></div>
            </div>
          </div>
          <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Premium Boutique</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">Dark band, gold rule</div>
        </div>

        <!-- 4. Wholesale & Dealer -->
        <div onclick="selectInvoiceTheme('WHOLESALE_DEALER')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; position: relative; cursor: pointer;">
          <div style="border: 1px solid #E5E7EB; border-radius: 6px; height: 90px; padding: 6px; margin-bottom: 10px; background: #FFFFFF;">
            <div style="height: 12px; background: #EDE9FE; margin-bottom: 6px;"></div>
            <div style="height: 2px; background: #9CA3AF; margin-bottom: 3px;"></div>
            <div style="height: 2px; background: #D1D5DB; margin-bottom: 3px;"></div>
            <div style="height: 2px; background: #D1D5DB; margin-bottom: 3px;"></div>
            <div style="height: 4px; background: var(--graphite); width: 60%; margin-top: 12px; margin-left: auto;"></div>
          </div>
          <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Wholesale & Dealer</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">Dense, bulk quantities</div>
        </div>

        <!-- 5. Compact Thermal -->
        <div onclick="selectInvoiceTheme('COMPACT_THERMAL')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; position: relative; cursor: pointer;">
          <div style="border: 1px solid #E5E7EB; border-radius: 6px; height: 90px; padding: 6px 14px; margin-bottom: 10px; background: #FFFFFF;">
            <div style="height: 4px; width: 50%; background: #0E0E12; margin: 4px auto 8px auto;"></div>
            <div style="height: 2px; background: #9CA3AF; margin-bottom: 3px;"></div>
            <div style="height: 2px; background: #9CA3AF; margin-bottom: 3px;"></div>
            <div style="height: 2px; background: #9CA3AF; margin-bottom: 3px;"></div>
            <div style="height: 4px; background: #0E0E12; width: 60%; margin: 8px auto 0 auto;"></div>
          </div>
          <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Compact Thermal</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">58 / 80 mm receipts</div>
        </div>

        <!-- 6. International Commercial -->
        <div onclick="selectInvoiceTheme('INTERNATIONAL_COMMERCIAL')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; position: relative; cursor: pointer;">
          <div style="border: 1px solid #E5E7EB; border-radius: 6px; height: 90px; padding: 6px; margin-bottom: 10px; background: #FFFFFF;">
            <div style="height: 14px; background: #1E293B; margin-bottom: 6px;"></div>
            <div style="height: 2px; background: #9CA3AF; margin-bottom: 3px;"></div>
            <div style="height: 2px; background: #D1D5DB; margin-bottom: 3px;"></div>
            <div style="height: 2px; background: #D1D5DB; margin-bottom: 3px;"></div>
            <div style="height: 4px; background: var(--graphite); width: 50%; margin-top: 12px; margin-left: auto;"></div>
          </div>
          <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">International</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">Export, multi-currency</div>
        </div>
      </div>

      <!-- Toggles: Show logo & Print UPI QR for dues (Page 22) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 8px 16px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border);">
          <span style="font-size: 14.5px; font-weight: 600; color: var(--graphite);">Show logo</span>
          <input type="checkbox" checked style="width: 44px; height: 24px; accent-color: var(--vastra-violet); cursor: pointer;">
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0;">
          <span style="font-size: 14.5px; font-weight: 600; color: var(--graphite);">Print UPI QR for dues</span>
          <input type="checkbox" checked style="width: 44px; height: 24px; accent-color: var(--vastra-violet); cursor: pointer;">
        </div>
      </div>

      <!-- Primary Action: Set Modern Minimal as default (Page 22) -->
      <button onclick="setThemeAsDefault('MODERN_MINIMAL')" class="btn btn-primary" style="width: 100%; height: 50px; font-size: 15px;">
        Set Modern Minimal as default
      </button>
    </div>
  `;
}

function selectInvoiceTheme(themeId) {
  state.selectedPOSTheme = themeId;
  alert(`Theme '${themeId}' selected. All future bills will use this layout.`);
}

function setThemeAsDefault(themeId) {
  state.selectedPOSTheme = themeId;
  localStorage.setItem("vastrenix_invoice_theme", themeId);
  alert(`'Modern Minimal' set as default invoice theme across all registers.`);
  switchTab('dashboard');
}

// --- SCREEN 20: INVOICES LIST (Page 23) ---
function renderInvoices() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header with Download / Export Icon (Page 23) -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div>
          <h1 class="type-title" style="margin: 0; font-size: 26px;">Invoices</h1>
          <div style="font-size: 12.5px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; margin-top: 2px;">
            ${lucideIcon("refresh-cw", 13, 1.75, "#6B7280")}
            <span>Pull to refresh · updated just now</span>
          </div>
        </div>
        <button onclick="alert('Exporting GST B2C/B2B summary spreadsheet...');" style="border: none; background: var(--paper); border: 1px solid var(--border); width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${lucideIcon("download", 18, 1.75, "var(--graphite)")}
        </button>
      </div>

      <!-- Search Bar -->
      <div style="display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px 14px; margin-bottom: 14px;">
        ${lucideIcon("search", 18, 1.75, "#6B7280")}
        <input type="text" placeholder="Invoice no., customer, phone, UTR" style="flex: 1; border: none; outline: none; font-size: 14px; background: transparent; font-family: inherit;">
      </div>

      <!-- Filter Chips (All [active black] / Store credit / Credit notes / Date) -->
      <div style="display: flex; gap: 8px; margin-bottom: 20px;">
        <button class="segment-btn active" style="background: var(--graphite); color: #FFFFFF; border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px;">All</button>
        <button class="segment-btn" onclick="switchTab('dues')" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px;">Store credit</button>
        <button class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px;">Credit notes</button>
        <button class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 6px 12px; font-size: 13px; display: flex; align-items: center; gap: 4px;">
          ${lucideIcon("clock", 14, 1.75)} Date
        </button>
      </div>

      <!-- Section: TODAY ₹48,260 · 37 (Page 23) -->
      <div style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span class="type-overline">TODAY</span>
          <span style="font-size: 13px; font-weight: 600; color: var(--text-muted); font-variant-numeric: tabular-nums;">₹48,260 · 37</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          <!-- Row 1: Walk-in customer -->
          <div onclick="openInvoiceDetail({id: 'VX-2041'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("qr-code", 18, 1.75, "var(--graphite)")}
              </div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Walk-in customer</div>
                <div class="type-caption">VX-2041 · 7:42 PM · UPI</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹6,216</div>
              <div class="chip chip-paid" style="margin-top: 4px;">Paid</div>
            </div>
          </div>

          <!-- Row 2: Meera Shah -->
          <div onclick="openInvoiceDetail({id: 'VX-2040'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("wallet", 18, 1.75, "var(--graphite)")}
              </div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Meera Shah</div>
                <div class="type-caption">VX-2040 · 7:10 PM · Store credit</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹3,480</div>
              <div class="chip chip-due" style="margin-top: 4px;">Due 30 Oct</div>
            </div>
          </div>

          <!-- Row 3: Karan Mehta -->
          <div onclick="openInvoiceDetail({id: 'VX-2039'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("cash", 18, 1.75, "var(--graphite)")}
              </div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Karan Mehta</div>
                <div class="type-caption">VX-2039 · 6:55 PM · Cash</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹1,890</div>
              <div class="chip chip-paid" style="margin-top: 4px;">Paid</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section: YESTERDAY ₹42,915 · 33 (Page 23) -->
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span class="type-overline">YESTERDAY</span>
          <span style="font-size: 13px; font-weight: 600; color: var(--text-muted); font-variant-numeric: tabular-nums;">₹42,915 · 33</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          <!-- Row 1: Nisha Joshi (Credit Note) -->
          <div onclick="openInvoiceDetail({id: 'CN-0112'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: #FEE2E2; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("arrow-left-right", 18, 1.75, "#C8283C")}
              </div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Nisha Joshi</div>
                <div class="type-caption">CN-0112 · against VX-2006</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 15px; font-weight: 700; color: #C8283C; font-variant-numeric: tabular-nums;">−₹790</div>
              <div class="chip chip-draft" style="margin-top: 4px;">Credit note</div>
            </div>
          </div>

          <!-- Row 2: Shiv Garments (dealer) -->
          <div onclick="openInvoiceDetail({id: 'VX-2008'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("arrow-left-right", 18, 1.75, "var(--graphite)")}
              </div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Shiv Garments (dealer)</div>
                <div class="type-caption">VX-2008 · 5:30 PM · Split</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹18,400</div>
              <div class="chip chip-paid" style="margin-top: 4px;">Paid</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- SCREEN 21: DUES (Page 24) ---
function renderDues() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header (Page 24) -->
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
        <button onclick="switchTab('more')" style="border: none; background: none; cursor: pointer; padding: 4px;">
          ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
        </button>
        <h1 class="type-title" style="margin: 0; font-size: 24px;">Dues</h1>
      </div>

      <!-- Segmented Tab Toggle: To collect · ₹1.24L (active) | To pay · ₹2.86L -->
      <div class="segmented-control" style="margin-bottom: 20px;">
        <button type="button" class="segment-btn active">To collect · ₹1.24L</button>
        <button type="button" class="segment-btn" onclick="switchTab('suppliers')">To pay · ₹2.86L</button>
      </div>

      <!-- Aging Summary Hero Card (Page 24) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 18px; margin-bottom: 16px;">
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">Customer store credit outstanding</div>
        <div class="type-figure" style="font-size: 34px; line-height: 40px; margin-bottom: 14px;">₹1,24,300</div>

        <!-- 3-Segment Aging Bar (0-30 days black / 31-60 days amber / 60+ days red) -->
        <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 14px;">
          <div style="flex: 78; background: var(--graphite);"></div>
          <div style="flex: 32; background: var(--due-amber);"></div>
          <div style="flex: 14; background: var(--risk-red);"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; border-top: 1px solid var(--border); padding-top: 12px;">
          <div>
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">0–30 days</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 2px; font-variant-numeric: tabular-nums;">₹78,000</div>
          </div>
          <div>
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">31–60 days</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); margin-top: 2px; font-variant-numeric: tabular-nums;">₹32,000</div>
          </div>
          <div>
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">60+ days</div>
            <div style="font-size: 16px; font-weight: 700; color: #C8283C; margin-top: 2px; font-variant-numeric: tabular-nums;">₹14,300</div>
          </div>
        </div>
      </div>

      <!-- Month-End Reminders Banner (Page 24) -->
      <div style="background: #EDE9FE; border-radius: var(--radius-card); padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${lucideIcon("clock", 20, 1.75, "var(--vastra-violet)")}
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Month-end reminders · 28 Oct</div>
            <div style="font-size: 12px; color: var(--text-muted);">WhatsApp + SMS to 9 customers</div>
          </div>
        </div>
        <a href="#" onclick="alert('Dispatching scheduled payment reminders.');" style="font-size: 13.5px; font-weight: 600; color: var(--vastra-violet); text-decoration: none;">Edit</a>
      </div>

      <!-- Customer Dues Rows (Page 24) -->
      <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">
        <!-- Customer 1 -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--graphite);">MS</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Meera Shah</div>
              <div class="type-caption">Due 30 Oct · 2 bills</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹28,480</div>
            <button onclick="alert('WhatsApp reminder sent to Meera Shah.');" style="border: none; background: none; cursor: pointer; padding: 4px;">
              ${lucideIcon("message-circle", 20, 1.75, "var(--graphite)")}
            </button>
          </div>
        </div>

        <!-- Customer 2 -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--graphite);">RJ</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Rathod Jewellers</div>
              <div style="font-size: 12.5px; color: #C8283C; font-weight: 600;">64 days overdue</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹14,300</div>
            <button onclick="alert('Overdue notice dispatched.');" style="border: none; background: none; cursor: pointer; padding: 4px;">
              ${lucideIcon("message-circle", 20, 1.75, "var(--graphite)")}
            </button>
          </div>
        </div>

        <!-- Customer 3 -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--graphite);">AK</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Anjali Kapadia</div>
              <div class="type-caption">Due 30 Oct · 1 bill</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹12,900</div>
            <button onclick="alert('Reminder sent.');" style="border: none; background: none; cursor: pointer; padding: 4px;">
              ${lucideIcon("message-circle", 20, 1.75, "var(--graphite)")}
            </button>
          </div>
        </div>

        <!-- Customer 4 -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--graphite);">PD</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Pooja Desai</div>
              <div class="type-caption">38 days · partial paid</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹9,650</div>
            <button onclick="alert('Reminder sent.');" style="border: none; background: none; cursor: pointer; padding: 4px;">
              ${lucideIcon("message-circle", 20, 1.75, "var(--graphite)")}
            </button>
          </div>
        </div>
      </div>

      <!-- Sticky Bottom Button: + Record a payment (Graphite #0E0E12 per Page 24) -->
      <button onclick="alert('Record Ledger Payment modal ready.');" class="btn btn-secondary" style="width: 100%; height: 50px; font-size: 15px;">
        ${lucideIcon("plus", 18, 2, "#FFFFFF")}
        <span>Record a payment</span>
      </button>
    </div>
  `;
}

// --- SCREEN 22: EXPENSES (Page 25) ---
function renderExpenses() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header with Month Selector (Page 25) -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button onclick="switchTab('more')" style="border: none; background: none; cursor: pointer; padding: 4px;">
            ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
          </button>
          <h1 class="type-title" style="margin: 0; font-size: 24px;">Expenses</h1>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--graphite); background: var(--paper); border: 1px solid var(--border); padding: 6px 12px; border-radius: var(--radius-pill); cursor: pointer;">
          <span>October 2026</span>
          ${lucideIcon("chevron-down", 14, 1.75, "#6B7280")}
        </div>
      </div>

      <!-- Spend Total Hero Card (Page 25) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 18px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 13px; color: var(--text-muted);">Spent this month</span>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: #0E7C58;">
            ${lucideIcon("arrow-down-left", 14, 2, "#0E7C58")}
            <span>6% vs Sep</span>
          </div>
        </div>
        <div class="type-figure" style="font-size: 36px; line-height: 42px; margin-bottom: 20px;">₹1,86,400</div>

        <!-- Category Progress Bars (Page 25) -->
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 13.5px; margin-bottom: 4px;">
              <span style="font-weight: 600; color: var(--graphite);">Salaries</span>
              <strong style="color: var(--graphite); font-variant-numeric: tabular-nums;">₹92,000</strong>
            </div>
            <div style="height: 6px; background: #E5E7EB; border-radius: 3px; overflow: hidden;">
              <div style="width: 49.3%; height: 100%; background: var(--vastra-violet); border-radius: 3px;"></div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 13.5px; margin-bottom: 4px;">
              <span style="font-weight: 600; color: var(--graphite);">Rent</span>
              <strong style="color: var(--graphite); font-variant-numeric: tabular-nums;">₹65,000</strong>
            </div>
            <div style="height: 6px; background: #E5E7EB; border-radius: 3px; overflow: hidden;">
              <div style="width: 34.8%; height: 100%; background: var(--graphite); border-radius: 3px;"></div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 13.5px; margin-bottom: 4px;">
              <span style="font-weight: 600; color: var(--graphite);">Logistics & courier</span>
              <strong style="color: var(--graphite); font-variant-numeric: tabular-nums;">₹14,200</strong>
            </div>
            <div style="height: 6px; background: #E5E7EB; border-radius: 3px; overflow: hidden;">
              <div style="width: 7.6%; height: 100%; background: #9CA3AF; border-radius: 3px;"></div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 13.5px; margin-bottom: 4px;">
              <span style="font-weight: 600; color: var(--graphite);">Electricity & internet</span>
              <strong style="color: var(--graphite); font-variant-numeric: tabular-nums;">₹8,600</strong>
            </div>
            <div style="height: 6px; background: #E5E7EB; border-radius: 3px; overflow: hidden;">
              <div style="width: 4.6%; height: 100%; background: #9CA3AF; border-radius: 3px;"></div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 13.5px; margin-bottom: 4px;">
              <span style="font-weight: 600; color: var(--graphite);">Other</span>
              <strong style="color: var(--graphite); font-variant-numeric: tabular-nums;">₹6,600</strong>
            </div>
            <div style="height: 6px; background: #E5E7EB; border-radius: 3px; overflow: hidden;">
              <div style="width: 3.5%; height: 100%; background: #9CA3AF; border-radius: 3px;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- RECENT Section with Cash book link (Page 25) -->
      <div style="margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span class="type-overline">RECENT</span>
          <a href="#" onclick="switchTab('cashbook')" style="font-size: 13.5px; font-weight: 600; color: var(--vastra-violet); text-decoration: none;">Cash book</a>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("truck", 18, 1.75, "var(--graphite)")}
              </div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Courier to Ahmedabad</div>
                <div class="type-caption">Today · Cash · Ravi P.</div>
              </div>
            </div>
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹1,350</div>
          </div>

          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("cash", 18, 1.75, "var(--graphite)")}
              </div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Tea & snacks</div>
                <div class="type-caption">Today · Cash drawer</div>
              </div>
            </div>
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹420</div>
          </div>

          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("building", 18, 1.75, "var(--graphite)")}
              </div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Shop rent — October</div>
                <div class="type-caption">5 Oct · Bank transfer</div>
              </div>
            </div>
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹65,000</div>
          </div>
        </div>
      </div>

      <!-- Floating Action Button: + Add expense (Vastra Violet #5B3DF5 pill - Page 25) -->
      <div style="position: fixed; bottom: 84px; right: var(--screen-gutter); z-index: 99;">
        <button onclick="openAddExpenseModal()" class="btn btn-primary" style="border-radius: var(--radius-pill); padding: 12px 20px; box-shadow: 0 8px 24px rgba(91, 61, 245, 0.35);">
          ${lucideIcon("plus", 18, 2, "#FFFFFF")}
          <span>Add expense</span>
        </button>
      </div>
    </div>
  `;
}

// --- SCREEN 23: CASH BOOK (Page 26) ---
function renderCashBook() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header (Page 26) -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button onclick="switchTab('expenses')" style="border: none; background: none; cursor: pointer; padding: 4px;">
            ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
          </button>
          <h1 class="type-title" style="margin: 0; font-size: 24px;">Cash book</h1>
        </div>
        <div style="display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: var(--graphite); background: var(--paper); border: 1px solid var(--border); padding: 6px 12px; border-radius: var(--radius-pill);">
          ${lucideIcon("clock", 14, 1.75)}
          <span>Today</span>
        </div>
      </div>

      <!-- Hero Dark Card: Expected Closing Cash (Page 26) -->
      <div class="card-hero-dark" style="margin-bottom: 16px;">
        <div style="font-size: 13px; color: #9CA3AF; margin-bottom: 4px;">Expected closing cash</div>
        <div class="type-figure" style="color: #FFFFFF; font-size: 36px; line-height: 42px; margin-bottom: 16px;">₹25,450</div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; border-top: 1px solid #1F1F24; padding-top: 14px;">
          <div>
            <div style="font-size: 11px; color: #9CA3AF;">Opening</div>
            <div style="font-size: 16px; font-weight: 700; color: #FFFFFF; margin-top: 2px; font-variant-numeric: tabular-nums;">₹2,000</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #9CA3AF;">Cash in</div>
            <div style="font-size: 16px; font-weight: 700; color: #34D399; margin-top: 2px; font-variant-numeric: tabular-nums;">+₹25,800</div>
          </div>
          <div>
            <div style="font-size: 11px; color: #9CA3AF;">Cash out</div>
            <div style="font-size: 16px; font-weight: 700; color: #F87171; margin-top: 2px; font-variant-numeric: tabular-nums;">−₹2,350</div>
          </div>
        </div>
      </div>

      <!-- UPI Reconciliation Summary Row (Page 26) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; cursor: pointer;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${lucideIcon("refresh-cw", 18, 1.75, "var(--graphite)")}
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">UPI reconciliation</div>
            <div style="font-size: 12px; color: var(--text-muted);">34 of 37 matched to bank · 3 to review</div>
          </div>
        </div>
        ${lucideIcon("chevron-right", 18, 1.75, "#9CA3AF")}
      </div>

      <!-- Running-Balance Entry List (Page 26) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 24px;">
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">
          <span>ENTRY</span>
          <span style="text-align: right;">AMOUNT</span>
          <span style="text-align: right;">BALANCE</span>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; padding: 10px 0; border-top: 1px solid var(--border); align-items: center;">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Sale VX-2039</div>
            <div class="type-caption">6:55 PM · Ravi</div>
          </div>
          <span style="text-align: right; color: #0E7C58; font-weight: 700; font-variant-numeric: tabular-nums;">+₹1,890</span>
          <span style="text-align: right; color: var(--graphite); font-weight: 600; font-variant-numeric: tabular-nums;">₹25,450</span>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; padding: 10px 0; border-top: 1px solid var(--border); align-items: center;">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Courier to Ahmed...</div>
            <div class="type-caption">5:20 PM · Ravi</div>
          </div>
          <span style="text-align: right; color: #C8283C; font-weight: 700; font-variant-numeric: tabular-nums;">−₹1,350</span>
          <span style="text-align: right; color: var(--graphite); font-weight: 600; font-variant-numeric: tabular-nums;">₹23,560</span>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; padding: 10px 0; border-top: 1px solid var(--border); align-items: center;">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Dues — Pooja Desai</div>
            <div class="type-caption">4:05 PM · Arjun</div>
          </div>
          <span style="text-align: right; color: #0E7C58; font-weight: 700; font-variant-numeric: tabular-nums;">+₹1,500</span>
          <span style="text-align: right; color: var(--graphite); font-weight: 600; font-variant-numeric: tabular-nums;">₹24,910</span>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; padding: 10px 0; border-top: 1px solid var(--border); align-items: center;">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Tea & snacks</div>
            <div class="type-caption">1:30 PM · Ravi</div>
          </div>
          <span style="text-align: right; color: #C8283C; font-weight: 700; font-variant-numeric: tabular-nums;">−₹420</span>
          <span style="text-align: right; color: var(--graphite); font-weight: 600; font-variant-numeric: tabular-nums;">₹23,410</span>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; padding: 10px 0; border-top: 1px solid var(--border); align-items: center;">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Tailor advance</div>
            <div class="type-caption">12:10 PM · Arjun</div>
          </div>
          <span style="text-align: right; color: #C8283C; font-weight: 700; font-variant-numeric: tabular-nums;">−₹580</span>
          <span style="text-align: right; color: var(--graphite); font-weight: 600; font-variant-numeric: tabular-nums;">₹23,830</span>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; padding: 10px 0; border-top: 1px solid var(--border); align-items: center;">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Opening float</div>
            <div class="type-caption">10:02 AM · Ravi</div>
          </div>
          <span style="text-align: right; color: #0E7C58; font-weight: 700; font-variant-numeric: tabular-nums;">+₹2,000</span>
          <span style="text-align: right; color: var(--graphite); font-weight: 600; font-variant-numeric: tabular-nums;">₹2,000</span>
        </div>
      </div>

      <!-- Action Pair: Cash out | Cash in (Page 26) -->
      <div style="display: flex; gap: 12px;">
        <button onclick="alert('Cash Out recorded.');" class="btn btn-tertiary" style="flex: 1; height: 50px;">
          ${lucideIcon("arrow-up-right", 18, 1.75)}
          <span>Cash out</span>
        </button>
        <button onclick="alert('Cash In added.');" class="btn btn-secondary" style="flex: 1; height: 50px;">
          ${lucideIcon("arrow-down-left", 18, 1.75, "#FFFFFF")}
          <span>Cash in</span>
        </button>
      </div>
    </div>
  `;
}

// --- SCREEN 24: SUPPLIERS (Page 27) ---
function renderSuppliers() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header (Page 27) -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div>
          <h1 class="type-title" style="margin: 0; font-size: 26px;">Suppliers</h1>
          <div style="font-size: 13px; color: var(--text-muted);">18 suppliers · 5 open purchase orders</div>
        </div>
        <button onclick="openPurchaseOrderModal()" style="width: 40px; height: 40px; border-radius: 50%; background: var(--graphite); color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${lucideIcon("plus", 20, 2, "#FFFFFF")}
        </button>
      </div>

      <!-- You Owe Suppliers Hero Card (Page 27) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 18px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="font-size: 13px; color: var(--text-muted);">You owe suppliers</div>
            <div class="type-figure" style="font-size: 34px; line-height: 40px; margin-top: 4px;">₹2,86,000</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; color: var(--text-muted);">Due this week</div>
            <div style="font-size: 18px; font-weight: 700; color: #A35A00; margin-top: 2px; font-variant-numeric: tabular-nums;">₹64,000</div>
          </div>
        </div>
      </div>

      <!-- Search Bar -->
      <div style="display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px 14px; margin-bottom: 16px;">
        ${lucideIcon("search", 18, 1.75, "#6B7280")}
        <input type="text" placeholder="Search suppliers or GSTIN" style="flex: 1; border: none; outline: none; font-size: 14px; background: transparent; font-family: inherit;">
      </div>

      <!-- Supplier Cards (Page 27) -->
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <!-- Card 1: Shree Textiles -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">ST</div>
              <div>
                <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Shree Textiles</div>
                <div class="type-caption">Surat · Kurtas, palazzos</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 16px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹1,42,500</div>
              <div style="font-size: 12px; color: #A35A00; font-weight: 600;">₹64,000 due Fri</div>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 12px;">
            <button onclick="openPurchaseOrderDetail({id: 'PO-0318'})" style="border: none; background: none; font-size: 13.5px; font-weight: 600; color: var(--graphite); cursor: pointer; display: flex; align-items: center; gap: 6px;">
              ${lucideIcon("receipt", 16, 1.75)} 2 open POs
            </button>
            <button onclick="alert('Supplier payment recorded.');" class="btn btn-secondary" style="height: 38px; padding: 0 16px; font-size: 13px;">
              ${lucideIcon("arrow-up-right", 14, 1.75, "#FFFFFF")} Record payment
            </button>
          </div>
        </div>

        <!-- Card 2: Kala Silk House -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">KS</div>
              <div>
                <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Kala Silk House</div>
                <div class="type-caption">Varanasi · Sarees, dupattas</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 16px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹96,000</div>
              <div style="font-size: 12px; color: var(--text-muted);">Due 12 Nov</div>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 12px;">
            <button onclick="openPurchaseOrderDetail({id: 'PO-0319'})" style="border: none; background: none; font-size: 13.5px; font-weight: 600; color: var(--graphite); cursor: pointer; display: flex; align-items: center; gap: 6px;">
              ${lucideIcon("receipt", 16, 1.75)} 2 open POs
            </button>
            <button onclick="alert('Supplier payment recorded.');" class="btn btn-secondary" style="height: 38px; padding: 0 16px; font-size: 13px;">
              ${lucideIcon("arrow-up-right", 14, 1.75, "#FFFFFF")} Record payment
            </button>
          </div>
        </div>

        <!-- Card 3: Rajkot Button & Lace -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">RB</div>
              <div>
                <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Rajkot Button & Lace</div>
                <div class="type-caption">Rajkot · Trims, packaging</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 16px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹47,500</div>
              <div style="font-size: 12px; color: var(--text-muted);">Due 20 Nov</div>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 12px;">
            <button onclick="openPurchaseOrderDetail({id: 'PO-0320'})" style="border: none; background: none; font-size: 13.5px; font-weight: 600; color: var(--graphite); cursor: pointer; display: flex; align-items: center; gap: 6px;">
              ${lucideIcon("receipt", 16, 1.75)} 1 open PO
            </button>
            <button onclick="alert('Supplier payment recorded.');" class="btn btn-secondary" style="height: 38px; padding: 0 16px; font-size: 13px;">
              ${lucideIcon("arrow-up-right", 14, 1.75, "#FFFFFF")} Record payment
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- SCREEN 25: PURCHASE ORDER DETAIL (Page 28) ---
function openPurchaseOrderDetail(po = {}) {
  const container = document.getElementById("tab-content");
  if (!container) return;

  const poNum = po.id || "PO-0318";

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header with Status Chip (Partly received - Page 28) -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <button onclick="switchTab('suppliers')" style="border: none; background: none; cursor: pointer; padding: 4px;">
            ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
          </button>
          <span style="font-size: 20px; font-weight: 700; color: var(--graphite);">${poNum}</span>
          <span class="chip chip-due">Partly received</span>
        </div>
        <button onclick="alert('PO document shared via PDF.');" style="border: none; background: var(--paper); border: 1px solid var(--border); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${lucideIcon("share", 16, 1.75, "var(--graphite)")}
        </button>
      </div>

      <!-- Supplier Info Card with Call Icon (Page 28) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">ST</div>
          <div>
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Shree Textiles</div>
            <div class="type-caption">GSTIN 24ABCFS2210M1Z9 · Surat</div>
          </div>
        </div>
        <button onclick="alert('Calling Shree Textiles (+91 98250 12345)...');" style="border: none; background: #F3F4F6; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${lucideIcon("phone", 16, 1.75, "var(--graphite)")}
        </button>
      </div>

      <!-- 4-Stage Progress Tracker (Created / Sent / Received / Closed - Page 28) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 18px;">
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; gap: 4px;">
          <div>
            <div style="width: 24px; height: 24px; border-radius: 50%; background: #0E7C58; color: white; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px auto;">
              ${lucideIcon("check", 14, 2.2, "#FFFFFF")}
            </div>
            <div style="font-size: 12px; font-weight: 700; color: var(--graphite);">Created</div>
            <div style="font-size: 10.5px; color: var(--text-muted);">14 Oct</div>
          </div>
          <div>
            <div style="width: 24px; height: 24px; border-radius: 50%; background: #0E7C58; color: white; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px auto;">
              ${lucideIcon("check", 14, 2.2, "#FFFFFF")}
            </div>
            <div style="font-size: 12px; font-weight: 700; color: var(--graphite);">Sent</div>
            <div style="font-size: 10.5px; color: var(--text-muted);">14 Oct</div>
          </div>
          <div>
            <div style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--vastra-violet); display: flex; align-items: center; justify-content: center; margin: 0 auto 6px auto;">
              <div style="width: 10px; height: 10px; border-radius: 50%; background: var(--vastra-violet);"></div>
            </div>
            <div style="font-size: 12px; font-weight: 700; color: var(--vastra-violet);">Received</div>
            <div style="font-size: 10.5px; color: var(--vastra-violet); font-weight: 600;">62 / 80</div>
          </div>
          <div>
            <div style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid #D1D5DB; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px auto;">
              ${lucideIcon("lock", 12, 1.75, "#9CA3AF")}
            </div>
            <div style="font-size: 12px; font-weight: 700; color: #9CA3AF;">Closed</div>
            <div style="font-size: 10.5px; color: #9CA3AF;">—</div>
          </div>
        </div>
      </div>

      <!-- Per-Line Table (ITEM | ORD | RECD | OPEN - Page 28) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 16px;">
        <div style="display: grid; grid-template-columns: 2.2fr 0.8fr 0.8fr 0.8fr; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px;">
          <span>ITEM</span>
          <span style="text-align: center;">ORD</span>
          <span style="text-align: center;">RECD</span>
          <span style="text-align: center;">OPEN</span>
        </div>

        <div style="display: grid; grid-template-columns: 2.2fr 0.8fr 0.8fr 0.8fr; padding: 8px 0; font-size: 13px; border-top: 1px solid #F3F4F6;">
          <div>
            <div style="font-weight: 600; color: var(--graphite);">Chanderi silk kurta</div>
            <div class="type-caption">Indigo M · ₹1,200</div>
          </div>
          <span style="text-align: center; font-variant-numeric: tabular-nums;">20</span>
          <span style="text-align: center; font-variant-numeric: tabular-nums;">20</span>
          <span style="text-align: center; font-variant-numeric: tabular-nums; color: var(--text-muted);">0</span>
        </div>

        <div style="display: grid; grid-template-columns: 2.2fr 0.8fr 0.8fr 0.8fr; padding: 8px 0; font-size: 13px; border-top: 1px solid #F3F4F6;">
          <div>
            <div style="font-weight: 600; color: var(--graphite);">Chanderi silk kurta</div>
            <div class="type-caption">Indigo L · ₹1,200</div>
          </div>
          <span style="text-align: center; font-variant-numeric: tabular-nums;">20</span>
          <span style="text-align: center; font-variant-numeric: tabular-nums;">18</span>
          <span style="text-align: center; font-variant-numeric: tabular-nums; color: #A35A00; font-weight: 700;">2</span>
        </div>

        <div style="display: grid; grid-template-columns: 2.2fr 0.8fr 0.8fr 0.8fr; padding: 8px 0; font-size: 13px; border-top: 1px solid #F3F4F6;">
          <div>
            <div style="font-weight: 600; color: var(--graphite);">Linen Nehru jacket</div>
            <div class="type-caption">Charcoal 40 · ₹1,100</div>
          </div>
          <span style="text-align: center; font-variant-numeric: tabular-nums;">20</span>
          <span style="text-align: center; font-variant-numeric: tabular-nums;">12</span>
          <span style="text-align: center; font-variant-numeric: tabular-nums; color: #A35A00; font-weight: 700;">8</span>
        </div>

        <div style="display: grid; grid-template-columns: 2.2fr 0.8fr 0.8fr 0.8fr; padding: 8px 0; font-size: 13px; border-top: 1px solid #F3F4F6;">
          <div>
            <div style="font-weight: 600; color: var(--graphite);">Cotton palazzo</div>
            <div class="type-caption">Rust L · ₹420</div>
          </div>
          <span style="text-align: center; font-variant-numeric: tabular-nums;">20</span>
          <span style="text-align: center; font-variant-numeric: tabular-nums;">12</span>
          <span style="text-align: center; font-variant-numeric: tabular-nums; color: #A35A00; font-weight: 700;">8</span>
        </div>
      </div>

      <!-- Financial Totals (Cost / Tax / Total - Page 28) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 13.5px;">
          <span style="color: var(--text-muted);">Value at cost</span>
          <span style="font-weight: 600; color: var(--graphite); font-variant-numeric: tabular-nums;">₹78,400</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 13.5px;">
          <span style="color: var(--text-muted);">CGST + SGST 5%</span>
          <span style="font-weight: 600; color: var(--graphite); font-variant-numeric: tabular-nums;">₹3,920</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0 0 0; border-top: 1px solid var(--border); margin-top: 6px;">
          <span style="font-size: 16px; font-weight: 700; color: var(--graphite);">PO total</span>
          <span style="font-size: 22px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹82,320</span>
        </div>
      </div>

      <!-- Action Pair: Return 4 damaged | Receive 18 more (Page 28) -->
      <div style="display: flex; gap: 12px;">
        <button onclick="alert('Damaged return dispatch order created for 4 units.');" class="btn btn-tertiary" style="flex: 1; height: 50px;">
          ${lucideIcon("arrow-left-right", 16, 1.75)}
          <span>Return 4 damaged</span>
        </button>
        <button onclick="openReceiveGoodsScreen({po: 'PO-0318'})" class="btn btn-primary" style="flex: 1; height: 50px;">
          ${lucideIcon("package", 16, 1.75, "#FFFFFF")}
          <span>Receive 18 more</span>
        </button>
      </div>
    </div>
  `;
}



// --- SCREEN 26: DEALER ORDERS LIST (Page 29) ---
function renderDealers() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header with Network Icon (Page 29) -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div>
          <h1 class="type-title" style="margin: 0; font-size: 26px;">Dealer orders</h1>
          <div style="font-size: 13px; color: var(--text-muted);">B2B network · 12 connected dealers</div>
        </div>
        <button onclick="switchTab('network')" style="width: 40px; height: 40px; border-radius: 50%; background: var(--paper); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${lucideIcon("network", 18, 1.75, "var(--graphite)")}
        </button>
      </div>

      <!-- Segmented Tab Toggle: Incoming (active) | Placed by us (Page 29) -->
      <div class="segmented-control" style="margin-bottom: 16px;">
        <button type="button" class="segment-btn active">Incoming</button>
        <button type="button" class="segment-btn">Placed by us</button>
      </div>

      <!-- Status Filter Chips with Counts (New 3 [active black] / To pack 6 / Dispatched 4 / Delivered) -->
      <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 16px;">
        <button class="segment-btn active" style="background: var(--graphite); color: #FFFFFF; border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px; display: flex; align-items: center; gap: 6px; white-space: nowrap;">
          <span>New</span>
          <span style="background: var(--vastra-violet); color: white; padding: 1px 6px; border-radius: var(--radius-pill); font-size: 11px;">3</span>
        </button>
        <button class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px; white-space: nowrap;">To pack 6</button>
        <button class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px; white-space: nowrap;">Dispatched 4</button>
        <button class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px; white-space: nowrap;">Delivered</button>
      </div>

      <!-- Order Cards List (Page 29) -->
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <!-- Order 1: Shiv Garments (New) -->
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; cursor: pointer;" onclick="openDealerOrderDetail({id: 'DO-1187'})">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">SG</div>
              <div>
                <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Shiv Garments</div>
                <div class="type-caption">DO-1187 · 120 pcs · Jamnagar</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 16px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹1,95,000</div>
              <div class="chip chip-dispatched" style="margin-top: 4px;">New</div>
            </div>
          </div>

          <!-- Lifecycle Progress Bar (1/4 filled) -->
          <div style="height: 4px; background: #E5E7EB; border-radius: 2px; overflow: hidden; margin-bottom: 14px;">
            <div style="width: 25%; height: 100%; background: var(--graphite);"></div>
          </div>

          <!-- Contextual Action Buttons: Reject | Accept partial | Accept all (Page 29) -->
          <div style="display: flex; align-items: center; gap: 10px;">
            <button onclick="alert('Order DO-1187 rejected.');" style="border: none; background: none; font-size: 13.5px; font-weight: 600; color: #C8283C; cursor: pointer; padding: 8px 12px;">Reject</button>
            <button onclick="alert('Partial allocation dialog opened.');" class="btn btn-tertiary" style="flex: 1; height: 42px; font-size: 13px;">Accept partial</button>
            <button onclick="alert('Order accepted in full. Stock reserved.'); openDealerOrderDetail({id: 'DO-1187'});" class="btn btn-primary" style="flex: 1.2; height: 42px; font-size: 13px;">Accept all</button>
          </div>
        </div>

        <!-- Order 2: Mahalaxmi Fashion (Packing) -->
        <div onclick="openDealerOrderDetail({id: 'DO-1179', status: 'Packing'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; cursor: pointer;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">MF</div>
              <div>
                <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Mahalaxmi Fashion</div>
                <div class="type-caption">DO-1179 · 64 pcs · Morbi</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 16px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹92,300</div>
              <div class="chip chip-due" style="margin-top: 4px;">Packing</div>
            </div>
          </div>

          <!-- Lifecycle Progress Bar (2/4 filled) -->
          <div style="height: 4px; background: #E5E7EB; border-radius: 2px; overflow: hidden; margin-bottom: 14px;">
            <div style="width: 50%; height: 100%; background: var(--graphite);"></div>
          </div>

          <!-- Context Chip: Assigned to Suresh · Dispatcher -->
          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted);">
            <div style="width: 22px; height: 22px; border-radius: 50%; background: #EDE9FE; color: var(--vastra-violet); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700;">SK</div>
            <span>Assigned to Suresh · Dispatcher</span>
          </div>
        </div>

        <!-- Order 3: Patel Cloth Centre (Dispatched) -->
        <div onclick="openDealerOrderDetail({id: 'DO-1171', status: 'Dispatched'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; cursor: pointer;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">PC</div>
              <div>
                <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Patel Cloth Centre</div>
                <div class="type-caption">DO-1171 · 40 pcs · Gondal</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 16px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹58,200</div>
              <div class="chip chip-paid" style="margin-top: 4px;">Dispatched</div>
            </div>
          </div>

          <!-- Lifecycle Progress Bar (3/4 filled) -->
          <div style="height: 4px; background: #E5E7EB; border-radius: 2px; overflow: hidden; margin-bottom: 14px;">
            <div style="width: 75%; height: 100%; background: var(--graphite);"></div>
          </div>

          <!-- Context Chip: LR 77210 · VRL Logistics -->
          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted);">
            <div style="width: 22px; height: 22px; border-radius: 50%; background: #EDE9FE; color: var(--vastra-violet); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700;">VR</div>
            <span>LR 77210 · VRL Logistics</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- SCREEN 27: DEALER ORDER DETAIL (Page 30) ---
function openDealerOrderDetail(order = {}) {
  const container = document.getElementById("tab-content");
  if (!container) return;

  const orderNum = order.id || "DO-1187";

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header with Chat Icon (Page 30) -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button onclick="switchTab('dealers')" style="border: none; background: none; cursor: pointer; padding: 4px;">
            ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
          </button>
          <div>
            <h1 class="type-title" style="margin: 0; font-size: 22px;">${orderNum}</h1>
            <div style="font-size: 12.5px; color: var(--text-muted);">Shiv Garments · Jamnagar</div>
          </div>
        </div>
        <button onclick="alert('Opening dealer WhatsApp messaging...');" style="border: none; background: var(--paper); border: 1px solid var(--border); width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${lucideIcon("message-circle", 18, 1.75, "var(--graphite)")}
        </button>
      </div>

      <!-- Hero Dark Price Card (Page 30) -->
      <div class="card-hero-dark" style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="font-size: 12.5px; color: #9CA3AF;">Dealer price · 120 pcs</div>
            <div class="type-figure" style="color: #FFFFFF; font-size: 34px; line-height: 40px; margin-top: 4px;">₹1,95,000</div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.12); padding: 6px 12px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 600; color: white;">
            ${lucideIcon("lock", 12, 1.75, "#FFFFFF")}
            <span>Stock reserved</span>
          </div>
        </div>
      </div>

      <!-- Vertical Status Timeline (Page 30) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 18px; margin-bottom: 20px;">
        <!-- Step 1: Submitted -->
        <div style="display: flex; gap: 14px; margin-bottom: 14px;">
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div style="width: 20px; height: 20px; border-radius: 50%; background: #0E7C58; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("check", 12, 2.2, "#FFFFFF")}
            </div>
            <div style="width: 2px; height: 32px; background: #0E7C58;"></div>
          </div>
          <div style="flex: 1; display: flex; justify-content: space-between;">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Submitted</div>
              <div style="font-size: 12px; color: var(--text-muted);">By Shiv Garments</div>
            </div>
            <span style="font-size: 12px; color: var(--text-muted);">26 Oct, 11:20</span>
          </div>
        </div>

        <!-- Step 2: Accepted -->
        <div style="display: flex; gap: 14px; margin-bottom: 14px;">
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div style="width: 20px; height: 20px; border-radius: 50%; background: #0E7C58; display: flex; align-items: center; justify-content: center;">
              ${lucideIcon("check", 12, 2.2, "#FFFFFF")}
            </div>
            <div style="width: 2px; height: 32px; background: #0E7C58;"></div>
          </div>
          <div style="flex: 1; display: flex; justify-content: space-between;">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Accepted</div>
              <div style="font-size: 12px; color: var(--text-muted);">120 of 120 pcs reserved</div>
            </div>
            <span style="font-size: 12px; color: var(--text-muted);">26 Oct, 12:05</span>
          </div>
        </div>

        <!-- Step 3: Packing (Active Violet) -->
        <div style="display: flex; gap: 14px; margin-bottom: 14px;">
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--vastra-violet); display: flex; align-items: center; justify-content: center;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--vastra-violet);"></div>
            </div>
            <div style="width: 2px; height: 32px; background: #E5E7EB;"></div>
          </div>
          <div style="flex: 1; display: flex; justify-content: space-between;">
            <div>
              <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Packing</div>
              <div style="font-size: 12px; color: var(--text-muted);">Suresh is picking items</div>
            </div>
            <span style="font-size: 12px; font-weight: 600; color: var(--vastra-violet);">Now</span>
          </div>
        </div>

        <!-- Step 4: Dispatched -->
        <div style="display: flex; gap: 14px; margin-bottom: 14px;">
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid #D1D5DB;"></div>
            <div style="width: 2px; height: 32px; background: #E5E7EB;"></div>
          </div>
          <div>
            <div style="font-size: 14px; font-weight: 700; color: #9CA3AF;">Dispatched</div>
            <div style="font-size: 12px; color: var(--text-muted);">Stock leaves on dispatch</div>
          </div>
        </div>

        <!-- Step 5: Delivered -->
        <div style="display: flex; gap: 14px; margin-bottom: 14px;">
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid #D1D5DB;"></div>
            <div style="width: 2px; height: 32px; background: #E5E7EB;"></div>
          </div>
          <div>
            <div style="font-size: 14px; font-weight: 700; color: #9CA3AF;">Delivered</div>
            <div style="font-size: 12px; color: var(--text-muted);">Dealer confirms receipt</div>
          </div>
        </div>

        <!-- Step 6: Closed -->
        <div style="display: flex; gap: 14px;">
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid #D1D5DB;"></div>
          </div>
          <div>
            <div style="font-size: 14px; font-weight: 700; color: #9CA3AF;">Closed</div>
            <div style="font-size: 12px; color: var(--text-muted);">Invoice settled</div>
          </div>
        </div>
      </div>

      <!-- Line-Item List (Page 30) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 14px;">
          <span style="font-weight: 600; color: var(--graphite);">Chanderi silk kurta · S–XL</span>
          <span style="font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">60 × ₹1,760</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 14px;">
          <span style="font-weight: 600; color: var(--graphite);">Mul cotton anarkali · S–XL</span>
          <span style="font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">40 × ₹1,480</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; font-size: 14px;">
          <span style="font-weight: 600; color: var(--graphite);">Khadi kurta pyjama · 38–44</span>
          <span style="font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">20 × ₹1,510</span>
        </div>
      </div>

      <!-- Assigned Staff Card with Reassign Link (Page 30) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #EDE9FE; color: var(--vastra-violet); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">SK</div>
          <div>
            <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Suresh Kumar</div>
            <div class="type-caption">Packing & dispatch</div>
          </div>
        </div>
        <a href="#" onclick="alert('Staff reassignment sheet opened.');" style="font-size: 13.5px; font-weight: 600; color: var(--vastra-violet); text-decoration: none;">Reassign</a>
      </div>

      <!-- Sticky Bottom Button: Mark as packed (Vastra Violet #5B3DF5 - Page 30) -->
      <button onclick="alert('Order DO-1187 marked as PACKED. Ready for carrier dispatch.'); switchTab('dealers');" class="btn btn-primary" style="width: 100%; height: 50px; font-size: 15px;">
        ${lucideIcon("package", 18, 1.75, "#FFFFFF")}
        <span>Mark as packed</span>
      </button>
    </div>
  `;
}

// --- SCREEN 28: BUSINESS NETWORK (Page 31) ---
function renderBusinessNetwork() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header -->
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
        <button onclick="switchTab('more')" style="border: none; background: none; cursor: pointer; padding: 4px;">
          ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
        </button>
        <h1 class="type-title" style="margin: 0; font-size: 24px;">Business network</h1>
      </div>

      <!-- Business Code Hero Card (Page 31) -->
      <div class="card-hero-dark" style="margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <span style="font-size: 13px; color: #9CA3AF;">Your business code</span>
          ${lucideIcon("network", 22, 1.75, "#9CA3AF")}
        </div>
        <div class="type-figure" style="color: #FFFFFF; font-size: 34px; letter-spacing: 1px; margin-bottom: 12px;">VX-ODF-24</div>
        <p style="font-size: 13px; color: #D1D5DB; line-height: 1.4; margin: 0 0 18px 0;">Dealers who connect with this code can order from your catalogue at the price tier you assign them.</p>

        <!-- Action Row: Share invite | Copy -->
        <div style="display: flex; gap: 10px;">
          <button onclick="alert('Business invite link copied for sharing!');" style="flex: 1; height: 44px; background: #FFFFFF; color: var(--graphite); border: none; border-radius: var(--radius-control); font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
            ${lucideIcon("share", 16, 1.75, "var(--graphite)")}
            <span>Share invite</span>
          </button>
          <button onclick="navigator.clipboard.writeText('VX-ODF-24'); alert('Code copied!');" style="width: 44px; height: 44px; background: rgba(255,255,255,0.12); color: white; border: none; border-radius: var(--radius-control); display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${lucideIcon("copy", 18, 1.75, "#FFFFFF")}
          </button>
        </div>
      </div>

      <!-- REQUESTS · 2 (Page 31) -->
      <div style="margin-bottom: 24px;">
        <span class="type-overline" style="display: block; margin-bottom: 12px;">REQUESTS · 2</span>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">NT</div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Navrang Textiles</div>
                <div class="type-caption">Bhavnagar · wants dealer access</div>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button onclick="alert('Edit price tier');" style="width: 36px; height: 36px; border: 1px solid var(--border); background: var(--paper); border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                ${lucideIcon("edit", 16, 1.75)}
              </button>
              <button onclick="alert('Navrang Textiles approved as Dealer partner.'); this.parentElement.parentElement.remove();" style="width: 36px; height: 36px; background: var(--graphite); color: white; border: none; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                ${lucideIcon("check", 16, 2.2, "#FFFFFF")}
              </button>
            </div>
          </div>

          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">GW</div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Gokul Wholesale</div>
                <div class="type-caption">Ahmedabad · wants wholesale</div>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button onclick="alert('Edit price tier');" style="width: 36px; height: 36px; border: 1px solid var(--border); background: var(--paper); border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                ${lucideIcon("edit", 16, 1.75)}
              </button>
              <button onclick="alert('Gokul Wholesale approved.'); this.parentElement.parentElement.remove();" style="width: 36px; height: 36px; background: var(--graphite); color: white; border: none; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                ${lucideIcon("check", 16, 2.2, "#FFFFFF")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- CONNECTED · 12 (Page 31) -->
      <div>
        <span class="type-overline" style="display: block; margin-bottom: 12px;">CONNECTED · 12</span>

        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); overflow: hidden;">
          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">SG</div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Shiv Garments</div>
                <div class="type-caption">Jamnagar · 28 orders</div>
              </div>
            </div>
            <span class="chip chip-dispatched">Dealer</span>
          </div>

          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">MF</div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Mahalaxmi Fashion</div>
                <div class="type-caption">Morbi · 17 orders</div>
              </div>
            </div>
            <span class="chip chip-dispatched">Dealer</span>
          </div>

          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">PC</div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Patel Cloth Centre</div>
                <div class="type-caption">Gondal · 9 orders</div>
              </div>
            </div>
            <span class="chip chip-draft" style="color: var(--graphite);">Wholesale</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- SCREEN 29: CUSTOMERS LIST (Page 32) ---
function renderCustomers() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header (Page 32) -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div>
          <h1 class="type-title" style="margin: 0; font-size: 26px;">Customers</h1>
          <div style="font-size: 13px; color: var(--text-muted);">2,418 people · 312 this month</div>
        </div>
        <button onclick="alert('Add Customer dialog opened');" style="width: 40px; height: 40px; border-radius: 50%; background: var(--graphite); color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${lucideIcon("user-plus", 18, 1.75, "#FFFFFF")}
        </button>
      </div>

      <!-- Search Bar -->
      <div style="display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px 14px; margin-bottom: 14px;">
        ${lucideIcon("search", 18, 1.75, "#6B7280")}
        <input type="text" placeholder="Name or mobile number" style="flex: 1; border: none; outline: none; font-size: 14px; background: transparent; font-family: inherit;">
      </div>

      <!-- Filter Chips: All [active black] / With dues · 9 / Top spenders (Page 32) -->
      <div style="display: flex; gap: 8px; margin-bottom: 18px;">
        <button class="segment-btn active" style="background: var(--graphite); color: #FFFFFF; border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px;">All</button>
        <button class="segment-btn" onclick="switchTab('dues')" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px;">With dues · 9</button>
        <button class="segment-btn" style="background: var(--paper); color: var(--graphite); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 6px 14px; font-size: 13px;">Top spenders</button>
      </div>

      <!-- Customer Rows List (Page 32) -->
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <!-- Meera Shah -->
        <div onclick="openCustomerDetail({name: 'Meera Shah', phone: '98980 22145', due: '28,480', total: '1,42,800'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--graphite);">MS</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Meera Shah</div>
              <div class="type-caption">98980 22145 · 2 days ago</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹1,42,800</div>
            <div style="font-size: 12px; color: #A35A00; font-weight: 600; margin-top: 2px;">₹28,480 due</div>
          </div>
        </div>

        <!-- Karan Mehta -->
        <div onclick="openCustomerDetail({name: 'Karan Mehta', phone: '99099 31870', due: null, total: '38,450'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--graphite);">KM</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Karan Mehta</div>
              <div class="type-caption">99099 31870 · today</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹38,450</div>
          </div>
        </div>

        <!-- Anjali Kapadia -->
        <div onclick="openCustomerDetail({name: 'Anjali Kapadia', phone: '98252 66014', due: '12,900', total: '96,200'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--graphite);">AK</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Anjali Kapadia</div>
              <div class="type-caption">98252 66014 · 1 week ago</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹96,200</div>
            <div style="font-size: 12px; color: #A35A00; font-weight: 600; margin-top: 2px;">₹12,900 due</div>
          </div>
        </div>

        <!-- Nisha Joshi -->
        <div onclick="openCustomerDetail({name: 'Nisha Joshi', phone: '97277 50431', due: null, total: '21,760'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--graphite);">NJ</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Nisha Joshi</div>
              <div class="type-caption">97277 50431 · yesterday</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹21,760</div>
          </div>
        </div>

        <!-- Pooja Desai -->
        <div onclick="openCustomerDetail({name: 'Pooja Desai', phone: '98795 11920', due: '9,650', total: '64,300'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--graphite);">PD</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Pooja Desai</div>
              <div class="type-caption">98795 11920 · 38 days ago</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹64,300</div>
            <div style="font-size: 12px; color: #A35A00; font-weight: 600; margin-top: 2px;">₹9,650 due</div>
          </div>
        </div>

        <!-- Hardik Vyas -->
        <div onclick="openCustomerDetail({name: 'Hardik Vyas', phone: '90990 44726', due: null, total: '17,980'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--graphite);">HV</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Hardik Vyas</div>
              <div class="type-caption">90990 44726 · 3 weeks ago</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹17,980</div>
          </div>
        </div>

        <!-- Riya Trivedi -->
        <div onclick="openCustomerDetail({name: 'Riya Trivedi', phone: '94262 80115', due: null, total: '12,640'})" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--graphite);">RT</div>
            <div>
              <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Riya Trivedi</div>
              <div class="type-caption">94262 80115 · 1 month ago</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹12,640</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- SCREEN 30: CUSTOMER DETAIL (Page 33) ---
function openCustomerDetail(cust = {}) {
  const container = document.getElementById("tab-content");
  if (!container) return;

  const name = cust.name || "Meera Shah";
  const phone = cust.phone || "98980 22145";

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header with Edit Pen (Page 33) -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px;">
        <button onclick="switchTab('customers')" style="border: none; background: none; cursor: pointer; padding: 4px;">
          ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
        </button>
        <button style="border: none; background: var(--paper); border: 1px solid var(--border); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${lucideIcon("edit", 16, 1.75, "var(--graphite)")}
        </button>
      </div>

      <!-- Avatar & Name Header Block (Page 33) -->
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: #EDE9FE; color: var(--vastra-violet); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; margin: 0 auto 12px auto;">
          MS
        </div>
        <h1 class="type-title" style="margin: 0 0 4px 0; font-size: 24px;">${name}</h1>
        <div style="font-size: 13.5px; color: var(--text-muted);">+91 ${phone} · customer since 2023</div>
      </div>

      <!-- 3-Action Row: Call | WhatsApp | New bill (Page 33) -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 10px; margin-bottom: 20px;">
        <button onclick="alert('Calling ${phone}...');" class="btn btn-tertiary" style="height: 44px; font-size: 13.5px;">
          ${lucideIcon("phone", 16, 1.75)} Call
        </button>
        <button onclick="alert('Opening WhatsApp for ${phone}...');" class="btn btn-tertiary" style="height: 44px; font-size: 13.5px;">
          ${lucideIcon("message-circle", 16, 1.75, "#0E7C58")} WhatsApp
        </button>
        <button onclick="switchTab('pos')" class="btn btn-secondary" style="height: 44px; font-size: 13.5px;">
          ${lucideIcon("receipt", 16, 1.75, "#FFFFFF")} New bill
        </button>
      </div>

      <!-- 3-Stat Row (Lifetime / Visits / Usual size - Page 33) -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px;">
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px;">
          <div class="type-overline">Lifetime</div>
          <div style="font-size: 18px; font-weight: 700; color: var(--graphite); margin-top: 4px; font-variant-numeric: tabular-nums;">₹1.43L</div>
        </div>
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px;">
          <div class="type-overline">Visits</div>
          <div style="font-size: 18px; font-weight: 700; color: var(--graphite); margin-top: 4px; font-variant-numeric: tabular-nums;">23</div>
        </div>
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 12px;">
          <div class="type-overline">Usual size</div>
          <div style="font-size: 18px; font-weight: 700; color: var(--graphite); margin-top: 4px;">M</div>
        </div>
      </div>

      <!-- Store Credit Due Card (Amber surface per Page 33) -->
      <div style="background: #FEF8ED; border: 1px solid #FDE68A; border-radius: var(--radius-card); padding: 18px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <span style="font-size: 13px; color: #78350F; font-weight: 600;">Store credit due</span>
          <div style="text-align: right; font-size: 11.5px; color: #92400E; font-weight: 600;">
            <div>Due 30 Oct</div>
            <div>Reminder on 28th</div>
          </div>
        </div>
        <div class="type-figure" style="color: #78350F; font-size: 34px; line-height: 40px; margin-bottom: 16px;">₹28,480</div>

        <button onclick="alert('Payment receipt modal opened for Meera Shah.');" class="btn btn-secondary" style="width: 100%; height: 46px; font-size: 14.5px;">
          Collect payment
        </button>
      </div>

      <!-- Activity List (Chronological credit/payments - Page 33) -->
      <div>
        <h2 style="font-size: 16px; font-weight: 700; color: var(--graphite); margin: 0 0 12px 0;">Activity</h2>

        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); overflow: hidden;">
          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("receipt", 18, 1.75, "var(--graphite)")}
              </div>
              <div>
                <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">VX-2040 · on credit</div>
                <div class="type-caption">24 Oct · 3 items</div>
              </div>
            </div>
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹3,480</div>
          </div>

          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: #E8F5E9; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("arrow-down-left", 18, 2, "#0E7C58")}
              </div>
              <div>
                <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">Payment received</div>
                <div class="type-caption">20 Oct · UPI</div>
              </div>
            </div>
            <div style="font-size: 15px; font-weight: 700; color: #0E7C58; font-variant-numeric: tabular-nums;">+₹10,000</div>
          </div>

          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("receipt", 18, 1.75, "var(--graphite)")}
              </div>
              <div>
                <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">VX-1962 · on credit</div>
                <div class="type-caption">12 Oct · Banarasi saree</div>
              </div>
            </div>
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹25,000</div>
          </div>

          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: #F3F4F6; display: flex; align-items: center; justify-content: center;">
                ${lucideIcon("cash", 18, 1.75, "var(--graphite)")}
              </div>
              <div>
                <div style="font-size: 14px; font-weight: 700; color: var(--graphite);">VX-1871 · paid</div>
                <div class="type-caption">28 Sep · Cash</div>
              </div>
            </div>
            <div style="font-size: 15px; font-weight: 700; color: var(--graphite); font-variant-numeric: tabular-nums;">₹6,240</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- SCREEN 31: STAFF (Page 34) ---
function renderUsers() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header with + Invite button (Page 34) -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button onclick="switchTab('more')" style="border: none; background: none; cursor: pointer; padding: 4px;">
            ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
          </button>
          <h1 class="type-title" style="margin: 0; font-size: 24px;">Staff</h1>
        </div>
        <button onclick="alert('Staff invite link copied!');" class="btn btn-secondary" style="height: 38px; padding: 0 14px; font-size: 13px; border-radius: var(--radius-pill);">
          ${lucideIcon("user-plus", 14, 2, "#FFFFFF")}
          <span>Invite</span>
        </button>
      </div>

      <!-- WAITING FOR APPROVAL · 2 (Page 34) -->
      <div style="margin-bottom: 24px;">
        <span class="type-overline" style="display: block; margin-bottom: 12px;">WAITING FOR APPROVAL · 2</span>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <!-- Card 1: Ravi Patel -->
          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #EDE9FE; color: var(--vastra-violet); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">RP</div>
                <div>
                  <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Ravi Patel</div>
                  <div class="type-caption">Yagnik Road · requested today</div>
                </div>
              </div>
              <span class="chip chip-draft">Cashier</span>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
              <button onclick="alert('Request rejected'); this.closest('div[style*=\'background: var(--paper)\']').remove();" style="border: none; background: none; font-size: 13.5px; font-weight: 600; color: #C8283C; cursor: pointer; padding: 8px 12px;">Reject</button>
              <button onclick="alert('Ravi Patel approved as Cashier!'); this.closest('div[style*=\'background: var(--paper)\']').remove();" class="btn btn-primary" style="flex: 1; height: 42px; font-size: 13.5px;">
                ${lucideIcon("check", 16, 2, "#FFFFFF")} Approve as Cashier
              </button>
            </div>
          </div>

          <!-- Card 2: Mitesh Kotak -->
          <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #EDE9FE; color: var(--vastra-violet); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">MK</div>
                <div>
                  <div style="font-size: 15px; font-weight: 700; color: var(--graphite);">Mitesh Kotak</div>
                  <div class="type-caption">Main godown · requested yesterday</div>
                </div>
              </div>
              <span class="chip chip-draft">Inventory</span>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
              <button onclick="alert('Request rejected'); this.closest('div[style*=\'background: var(--paper)\']').remove();" style="border: none; background: none; font-size: 13.5px; font-weight: 600; color: #C8283C; cursor: pointer; padding: 8px 12px;">Reject</button>
              <button onclick="alert('Mitesh Kotak approved as Inventory!'); this.closest('div[style*=\'background: var(--paper)\']').remove();" class="btn btn-primary" style="flex: 1; height: 42px; font-size: 13.5px;">
                ${lucideIcon("check", 16, 2, "#FFFFFF")} Approve as Inventory
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- TEAM · 7 (Page 34) -->
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span class="type-overline">TEAM · 7</span>
          <span style="font-size: 12.5px; color: var(--text-muted);">2 branches</span>
        </div>

        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); overflow: hidden;">
          <!-- Arjun Odedara -->
          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">AO</div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Arjun Odedara</div>
                <div class="type-caption">Both branches · active now</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="background: var(--graphite); color: white; padding: 4px 10px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 700;">Owner</span>
              ${lucideIcon("chevron-right", 16, 1.75, "#9CA3AF")}
            </div>
          </div>

          <!-- Nirali Odedara -->
          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">NO</div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Nirali Odedara</div>
                <div class="type-caption">Both branches</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="background: var(--graphite); color: white; padding: 4px 10px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 700;">Admin</span>
              ${lucideIcon("chevron-right", 16, 1.75, "#9CA3AF")}
            </div>
          </div>

          <!-- Suresh Kumar -->
          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">SK</div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Suresh Kumar</div>
                <div class="type-caption">Main godown</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="chip chip-draft">Dispatcher</span>
              ${lucideIcon("chevron-right", 16, 1.75, "#9CA3AF")}
            </div>
          </div>

          <!-- Bhavna Dave -->
          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">BD</div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: var(--graphite);">Bhavna Dave</div>
                <div class="type-caption">Yagnik Road</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="chip chip-draft">Accountant</span>
              ${lucideIcon("chevron-right", 16, 1.75, "#9CA3AF")}
            </div>
          </div>

          <!-- Jay Thakkar (Deactivated State per Page 34) -->
          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; opacity: 0.55;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: #E5E7EB; color: #6B7280; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;">JT</div>
              <div>
                <div style="font-size: 14.5px; font-weight: 700; color: #6B7280;">Jay Thakkar</div>
                <div class="type-caption">Deactivated 12 Oct</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="chip chip-draft" style="color: #9CA3AF;">Cashier</span>
              ${lucideIcon("chevron-right", 16, 1.75, "#9CA3AF")}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- SCREEN 32: SETTINGS (Page 35) ---
function renderSettingsScreen() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Header (Page 35) -->
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <button onclick="switchTab('more')" style="border: none; background: none; cursor: pointer; padding: 4px;">
          ${lucideIcon("arrow-left", 22, 1.75, "var(--graphite)")}
        </button>
        <h1 class="type-title" style="margin: 0; font-size: 24px;">Settings</h1>
      </div>

      <!-- LANGUAGE Section (English / हिन्दी / ગુજરાતી pill group - Page 35) -->
      <div style="margin-bottom: 24px;">
        <span class="type-overline" style="display: block; margin-bottom: 8px;">LANGUAGE</span>
        <div class="segmented-control">
          <button type="button" class="segment-btn ${state.lang==='en'?'active':''}" onclick="setAppLanguage('en'); renderSettingsScreen();">English</button>
          <button type="button" class="segment-btn ${state.lang==='hi'?'active':''}" onclick="setAppLanguage('hi'); renderSettingsScreen();">हिन्दी</button>
          <button type="button" class="segment-btn ${state.lang==='gu'?'active':''}" onclick="setAppLanguage('gu'); renderSettingsScreen();">ગુજરાતી</button>
        </div>
      </div>

      <!-- BILLING Section (Page 35) -->
      <div style="margin-bottom: 24px;">
        <span class="type-overline" style="display: block; margin-bottom: 8px;">BILLING</span>
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); overflow: hidden;">
          <div onclick="openStoreSettingsModal()" style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${lucideIcon("cash", 18, 1.75, "#6B7280")}
              <span style="font-size: 14.5px; font-weight: 600; color: var(--graphite);">Default payment</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 13.5px;">
              <span>Cash</span>
              ${lucideIcon("chevron-right", 16, 1.75)}
            </div>
          </div>

          <div onclick="switchTab('themes')" style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${lucideIcon("palette", 18, 1.75, "#6B7280")}
              <span style="font-size: 14.5px; font-weight: 600; color: var(--graphite);">Invoice theme</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 13.5px;">
              <span>Modern Minimal</span>
              ${lucideIcon("chevron-right", 16, 1.75)}
            </div>
          </div>

          <div onclick="alert('Credit reminder automation: 28-30 of each month active.');" style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${lucideIcon("clock", 18, 1.75, "#6B7280")}
              <span style="font-size: 14.5px; font-weight: 600; color: var(--graphite);">Credit reminders</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 13.5px;">
              <span>28–30 monthly</span>
              ${lucideIcon("chevron-right", 16, 1.75)}
            </div>
          </div>
        </div>
      </div>

      <!-- STORE Section (Page 35) -->
      <div style="margin-bottom: 24px;">
        <span class="type-overline" style="display: block; margin-bottom: 8px;">STORE</span>
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); overflow: hidden;">
          <div onclick="alert('Business profile: Odedara Fashions, Rajkot.');" style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${lucideIcon("store", 18, 1.75, "#6B7280")}
              <span style="font-size: 14.5px; font-weight: 600; color: var(--graphite);">Business profile</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 13.5px;">
              <span>Odedara Fashions</span>
              ${lucideIcon("chevron-right", 16, 1.75)}
            </div>
          </div>

          <div onclick="alert('Branches: Rajkot Flagship & Aji GIDC Godown.');" style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${lucideIcon("building", 18, 1.75, "#6B7280")}
              <span style="font-size: 14.5px; font-weight: 600; color: var(--graphite);">Branches & godowns</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 13.5px;">
              <span>2</span>
              ${lucideIcon("chevron-right", 16, 1.75)}
            </div>
          </div>

          <div onclick="renderOnboardingTaxBilling()" style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${lucideIcon("receipt", 18, 1.75, "#6B7280")}
              <span style="font-size: 14.5px; font-weight: 600; color: var(--graphite);">Tax & GST</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 13.5px;">
              <span>5%</span>
              ${lucideIcon("chevron-right", 16, 1.75)}
            </div>
          </div>
        </div>
      </div>

      <!-- ACCOUNT Section (Connected dot + Sign-in security - Page 35) -->
      <div style="margin-bottom: 28px;">
        <span class="type-overline" style="display: block; margin-bottom: 8px;">ACCOUNT</span>
        <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); overflow: hidden;">
          <div style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${lucideIcon("shield", 18, 1.75, "#6B7280")}
              <span style="font-size: 14.5px; font-weight: 600; color: var(--graphite);">Server</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; font-size: 13.5px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #0E7C58;"></span>
              <span style="color: #0E7C58; font-weight: 600;">Connected</span>
              ${lucideIcon("chevron-right", 16, 1.75, "#9CA3AF")}
            </div>
          </div>

          <div onclick="alert('Security credentials & session tokens valid.');" style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${lucideIcon("lock", 18, 1.75, "#6B7280")}
              <span style="font-size: 14.5px; font-weight: 600; color: var(--graphite);">Sign-in & security</span>
            </div>
            ${lucideIcon("chevron-right", 16, 1.75, "#9CA3AF")}
          </div>
        </div>
      </div>

      <!-- Full-Width Red Sign Out Button (Page 35) -->
      <button onclick="logout()" style="width: 100%; border: none; background: none; color: #C8283C; font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; cursor: pointer; margin-bottom: 20px;">
        ${lucideIcon("log-out", 18, 1.75, "#C8283C")}
        <span>Sign out</span>
      </button>

      <div style="text-align: center; font-size: 12px; color: var(--text-muted);">
        Vastrenix 2.4.0
      </div>
    </div>
  `;
}

// --- SCREEN 33: "MORE" HUB SCREEN (Page 36) ---
function renderMoreHub() {
  const container = document.getElementById("tab-content");
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 460px; margin: 0 auto; padding-bottom: 84px;">
      <!-- Profile Header Card with Settings Gear (Page 36) -->
      <div style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="width: 48px; height: 48px; border-radius: 14px; background: var(--graphite); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px;">
            AO
          </div>
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--graphite);">Arjun Odedara</div>
            <div style="font-size: 13px; color: var(--text-muted);">Owner · Odedara Fashions</div>
          </div>
        </div>
        <button onclick="renderSettingsScreen()" style="border: none; background: #F3F4F6; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${lucideIcon("settings", 20, 1.75, "var(--graphite)")}
        </button>
      </div>

      <!-- Section SELL (Invoices, Dues·9, Customers, Shift) -->
      <div style="margin-bottom: 22px;">
        <span class="type-overline" style="display: block; margin-bottom: 10px;">SELL</span>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
          <button onclick="switchTab('invoices')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
            ${lucideIcon("receipt", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Invoices</span>
          </button>
          <button onclick="switchTab('dues')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; cursor: pointer;">
            <span style="position: absolute; top: 8px; right: 8px; background: var(--vastra-violet); color: white; font-size: 10px; font-weight: 800; border-radius: var(--radius-pill); padding: 1px 6px;">9</span>
            ${lucideIcon("wallet", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Dues</span>
          </button>
          <button onclick="switchTab('customers')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
            ${lucideIcon("users", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Customers</span>
          </button>
          <button onclick="switchTab('shift')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
            ${lucideIcon("clock", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Shift</span>
          </button>
        </div>
      </div>

      <!-- Section STOCK (Items, Low stock·14, Receive, Transfers) -->
      <div style="margin-bottom: 22px;">
        <span class="type-overline" style="display: block; margin-bottom: 10px;">STOCK</span>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
          <button onclick="switchTab('inventory')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
            ${lucideIcon("shirt", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Items</span>
          </button>
          <button onclick="switchTab('lowstock')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; cursor: pointer;">
            <span style="position: absolute; top: 8px; right: 8px; background: var(--vastra-violet); color: white; font-size: 10px; font-weight: 800; border-radius: var(--radius-pill); padding: 1px 6px;">14</span>
            ${lucideIcon("alert-triangle", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Low stock</span>
          </button>
          <button onclick="openReceiveGoodsScreen()" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
            ${lucideIcon("package", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Receive</span>
          </button>
          <button onclick="switchTab('transfers')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
            ${lucideIcon("arrow-left-right", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Transfers</span>
          </button>
        </div>
      </div>

      <!-- Section MONEY (Expenses, Cash book, Suppliers, Reports) -->
      <div style="margin-bottom: 22px;">
        <span class="type-overline" style="display: block; margin-bottom: 10px;">MONEY</span>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
          <button onclick="switchTab('expenses')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
            ${lucideIcon("receipt", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Expenses</span>
          </button>
          <button onclick="switchTab('cashbook')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
            ${lucideIcon("cash", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Cash book</span>
          </button>
          <button onclick="switchTab('suppliers')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
            ${lucideIcon("building", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Suppliers</span>
          </button>
          <button onclick="alert('Analytics & P&L reports module.');" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
            ${lucideIcon("bar-chart", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Reports</span>
          </button>
        </div>
      </div>

      <!-- Section NETWORK & TEAM (Dealers·3, Network·2, Staff·2, Themes) -->
      <div>
        <span class="type-overline" style="display: block; margin-bottom: 10px;">NETWORK & TEAM</span>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
          <button onclick="switchTab('dealers')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; cursor: pointer;">
            <span style="position: absolute; top: 8px; right: 8px; background: var(--vastra-violet); color: white; font-size: 10px; font-weight: 800; border-radius: var(--radius-pill); padding: 1px 6px;">3</span>
            ${lucideIcon("truck", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Dealers</span>
          </button>
          <button onclick="switchTab('network')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; cursor: pointer;">
            <span style="position: absolute; top: 8px; right: 8px; background: var(--vastra-violet); color: white; font-size: 10px; font-weight: 800; border-radius: var(--radius-pill); padding: 1px 6px;">2</span>
            ${lucideIcon("network", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Network</span>
          </button>
          <button onclick="switchTab('users')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; cursor: pointer;">
            <span style="position: absolute; top: 8px; right: 8px; background: var(--vastra-violet); color: white; font-size: 10px; font-weight: 800; border-radius: var(--radius-pill); padding: 1px 6px;">2</span>
            ${lucideIcon("users", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Staff</span>
          </button>
          <button onclick="switchTab('themes')" style="background: var(--paper); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;">
            ${lucideIcon("palette", 24, 1.75, "var(--graphite)")}
            <span style="font-size: 12.5px; font-weight: 600; color: var(--graphite);">Themes</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

// --- SCREEN 34: BOTTOM NAVIGATION (Page 3 & all) ---
function renderBottomNav() {
  return `
    <nav class="mobile-bottom-nav">
      <!-- 1: Home -->
      <button class="mobile-nav-btn ${state.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard" onclick="switchTab('dashboard')">
        ${lucideIcon("home", 24, 1.75, state.activeTab === 'dashboard' ? "var(--vastra-violet)" : "#6B7280")}
        <span>Home</span>
      </button>

      <!-- 2: Items -->
      <button class="mobile-nav-btn ${state.activeTab === 'inventory' ? 'active' : ''}" data-tab="inventory" onclick="switchTab('inventory')">
        ${lucideIcon("shirt", 24, 1.75, state.activeTab === 'inventory' ? "var(--vastra-violet)" : "#6B7280")}
        <span>Items</span>
      </button>

      <!-- 3: Raised Center + Button (Page 3: Black Graphite squircle with white + icon) -->
      <button class="nav-center-create-btn" onclick="switchTab('pos')" title="New Bill / Fast POS">
        ${lucideIcon("plus", 26, 2.2, "#FFFFFF")}
      </button>

      <!-- 4: Orders -->
      <button class="mobile-nav-btn ${state.activeTab === 'orders' || state.activeTab === 'dealers' ? 'active' : ''}" data-tab="orders" onclick="switchTab('orders')">
        ${lucideIcon("truck", 24, 1.75, (state.activeTab === 'orders' || state.activeTab === 'dealers') ? "var(--vastra-violet)" : "#6B7280")}
        <span>Orders</span>
      </button>

      <!-- 5: More (Grid outline icon) -->
      <button class="mobile-nav-btn ${state.activeTab === 'more' ? 'active' : ''}" data-tab="more" onclick="switchTab('more')">
        ${lucideIcon("grid", 24, 1.75, state.activeTab === 'more' ? "var(--vastra-violet)" : "#6B7280")}
        <span>More</span>
      </button>
    </nav>
  `;
}



// ============================================================================
// VASTRENIX 34-SCREEN ROUTER & SHELL ENGINE
// ============================================================================

function setAppLanguage(lang) {
  state.lang = lang;
  localStorage.setItem("vastrenix_lang", lang);
  renderApp();
}

function switchTab(tab) {
  state.activeTab = tab;
  // Update mobile bottom nav active states and icon strokes
  document.querySelectorAll(".mobile-nav-btn").forEach(el => {
    const dataTab = el.getAttribute("data-tab");
    const isAct = dataTab === tab || 
                  (tab === 'dashboard' && dataTab === 'home') ||
                  (tab === 'inventory' && dataTab === 'items') ||
                  (tab === 'dealers' && dataTab === 'orders');
    el.classList.toggle("active", isAct);
    const svg = el.querySelector("svg");
    if (svg) {
      svg.setAttribute("stroke", isAct ? "var(--vastra-violet)" : "#6B7280");
    }
  });
  renderCurrentTab();
  updateOfflineIndicator();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCurrentTab() {
  switch (state.activeTab) {
    case "dashboard":
    case "home":
      renderDashboard();
      break;
    case "inventory":
    case "items":
      renderInventory();
      break;
    case "pos":
      renderPOS();
      break;
    case "orders":
    case "dealers":
      renderDealers();
      break;
    case "more":
      renderMoreHub();
      break;
    case "invoices":
      renderInvoices();
      break;
    case "dues":
      renderDues();
      break;
    case "expenses":
      renderExpenses();
      break;
    case "cashbook":
      renderCashBook();
      break;
    case "suppliers":
      renderSuppliers();
      break;
    case "network":
      renderBusinessNetwork();
      break;
    case "customers":
      renderCustomers();
      break;
    case "users":
      renderUsers();
      break;
    case "settings":
      renderSettingsScreen();
      break;
    case "shift":
      renderCloseShift();
      break;
    case "themes":
      renderInvoiceThemesPicker();
      break;
    case "lowstock":
      renderLowStock();
      break;
    case "transfers":
      renderStockMovement();
      break;
    default:
      renderDashboard();
      break;
  }
}

async function renderApp() {
  const root = document.getElementById("app");
  if (!root) return;

  if (!state.token) {
    renderLoginScreen();
    return;
  }

  root.innerHTML = `
    <div style="min-height: 100vh; background: var(--mist); display: flex; flex-direction: column; padding-bottom: 74px; box-sizing: border-box;">
      <main id="tab-content" style="flex: 1; width: 100%; box-sizing: border-box; padding: 20px var(--screen-gutter) 16px var(--screen-gutter);"></main>
      ${renderBottomNav()}
    </div>
    <div id="modal-container"></div>
  `;

  renderCurrentTab();
  updateOfflineIndicator();
}
