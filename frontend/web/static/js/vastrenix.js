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

async function viewInvoiceInApp(invoiceId, invoiceNumber) {
  const modal = document.getElementById("modal-invoice-viewer");
  if (!modal) {
    const directUrl = `${getApiBase()}/pos/invoices/${invoiceId}/pdf?token=${encodeURIComponent(state.token || '')}&business_id=${state.business ? state.business.id : ''}`;
    window.open(directUrl, "_blank");
    return;
  }
  const title = document.getElementById("invoice-viewer-title");
  if (title) title.textContent = `${t('invoice_viewer_title', 'Invoice Details')} #${invoiceNumber || invoiceId}`;

  const body = document.getElementById("invoice-viewer-body");
  const pdfUrl = `${getApiBase()}/pos/invoices/${invoiceId}/pdf`;
  const fileName = `Invoice_${invoiceNumber || invoiceId}.pdf`;

  if (body) {
    body.innerHTML = `
      <div style="padding: 44px 16px; text-align: center; color: var(--navy);">
        <div class="spinner"></div>
        <div style="margin-top: 14px; font-weight: 700; font-size: 14px;">Preparing secure invoice PDF...</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Fetching official tax document with verified credentials</div>
      </div>
    `;
  }

  const shareBtn = document.getElementById("invoice-viewer-share-btn");
  if (shareBtn) {
    shareBtn.onclick = () => shareInvoicePdf(invoiceId, invoiceNumber);
  }

  const downloadBtn = document.getElementById("invoice-viewer-download-btn");
  if (downloadBtn) {
    downloadBtn.onclick = () => downloadInvoicePdf(invoiceId, invoiceNumber);
  }

  modal.classList.add("active");

  try {
    const headers = {};
    if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
    if (state.business) headers["X-Business-ID"] = state.business.id;

    // Authenticated PDF byte fetch to eliminate "Authentication required" error
    const res = await fetch(pdfUrl, { headers });
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const blob = await res.blob();
    _currentInvoiceBlob = blob;
    if (_currentInvoiceBlobUrl) {
      URL.revokeObjectURL(_currentInvoiceBlobUrl);
    }
    _currentInvoiceBlobUrl = URL.createObjectURL(blob);

    if (body) {
      body.innerHTML = `
        <iframe src="${_currentInvoiceBlobUrl}#toolbar=1&navpanes=0" style="width: 100%; height: 500px; border: 1px solid var(--border); border-radius: 8px; background: white;" onerror="this.outerHTML='<div style=\\'padding: 30px; text-align: center; color: var(--text-muted);\\'>Preview frame restricted by system. Tap Share or Download below.</div>'"></iframe>
      `;
    }
  } catch (err) {
    console.warn("[PDF-AUTH-FALLBACK] Direct blob fetch encountered:", err.message);
    const fallbackUrl = `${pdfUrl}?token=${encodeURIComponent(state.token || '')}&business_id=${state.business ? state.business.id : ''}`;
    if (body) {
      body.innerHTML = `
        <div style="padding: 36px 16px; text-align: center;">
          <div style="font-size: 34px; margin-bottom: 8px;">🧾</div>
          <div style="font-size: 15px; font-weight: 700; color: var(--navy); margin-bottom: 6px;">Invoice Document Ready</div>
          <div style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 16px;">Inline preview unavailable. Tap below to view or share verified document:</div>
          <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-navy" onclick="downloadInvoicePdf(${invoiceId}, '${invoiceNumber}')">Open Document</button>
            <button class="btn btn-secondary" onclick="shareInvoicePdf(${invoiceId}, '${invoiceNumber}')">Share</button>
          </div>
        </div>
      `;
    }
  }
}

function openInvoicePdf(invoiceId, invoiceNumber) {
  viewInvoiceInApp(invoiceId, invoiceNumber);
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

    // Convert blob to Base64 Data URL for zero-network native Android sharing
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
    console.error("[SHARE-PDF-FAIL]", err);
    alert("Unable to share PDF: " + err.message);
  }
}

async function downloadInvoicePdf(invoiceId, invoiceNumber) {
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

    if (window.VastrenixNative && typeof window.VastrenixNative.openPdfUrl === "function") {
      const reader = new FileReader();
      reader.onloadend = function() {
        window.VastrenixNative.openPdfUrl(reader.result, fileName);
      };
      reader.readAsDataURL(blob);
    } else {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      a.click();
    }
  } catch (err) {
    const directUrl = `${pdfUrl}?token=${encodeURIComponent(state.token || '')}&business_id=${state.business ? state.business.id : ''}`;
    window.open(directUrl, "_blank");
  }
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
    server_connected_msg: "✓ Server Connected"
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
    server_connected_msg: "✓ सर्वर कनेक्ट हो गया"
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
    server_connected_msg: "✓ સર્વર કનેક્ટ થઈ ગયું"
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

// Render Dashboard
async function renderDashboard() {
  const container = document.getElementById("tab-content");
  container.innerHTML = `
    <div style="margin-bottom: 24px;">
      <div class="skeleton skeleton-text" style="width: 220px; height: 26px; margin-bottom: 12px;"></div>
      <div class="skeleton skeleton-text" style="width: 320px; height: 16px;"></div>
    </div>
    ${getSkeletonCardsHTML()}
  `;

  const t = i18n[state.lang] || i18n.en;
  const metrics = await api("/reports/dashboard");
  if (!metrics) return;

  // If Store Owner/Admin, check for pending staff approvals
  let pendingStaff = [];
  if (!state.isStaff) {
    try {
      pendingStaff = await api("/auth/pending-staff");
    } catch (e) {
      pendingStaff = [];
    }
  }

  container.innerHTML = `
    <!-- Top Greeting Banner -->
    <div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
      <div>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
          <h2 style="font-size: 22px; font-weight: 800; color: var(--navy);">${metrics.business_name}</h2>
          ${state.isStaff ? `<span class="badge badge-success" style="font-size: 11px;">Staff View</span>` : `<span class="badge badge-neutral" style="font-size: 11px;">Store Admin</span>`}
        </div>
        <p style="color: var(--text-muted); font-size: 13.5px;">${t.welcome} • <b>${metrics.branch_name}</b></p>
      </div>

      ${state.isStaff ? `
        <div style="background: var(--teal-light); border: 1px solid rgba(33,140,130,0.2); border-radius: var(--radius-sm); padding: 8px 16px;">
          <div style="font-size: 11px; text-transform: uppercase; color: var(--teal); font-weight: 700;">Assigned Store</div>
          <div style="font-size: 14px; font-weight: 800; color: var(--navy);">${state.storeName || metrics.business_name}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">Logged in as: <b>${state.user.full_name} (${state.business.role})</b></div>
        </div>
      ` : ''}
    </div>

    <!-- Pending Staff Approvals Notice (Visible to Store Owner/Admin) -->
    ${pendingStaff && pendingStaff.length > 0 ? `
      <div style="background: #FEF8ED; border: 1px solid var(--amber); border-radius: var(--radius-md); padding: 18px 24px; margin-bottom: 24px; box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="background: var(--amber); color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">!</span>
            <h3 style="font-size: 15px; font-weight: 700; color: #8A5A1B; margin: 0;">${t("pending_staff_title", "Pending Staff Signups Requiring Approval")} (${pendingStaff.length})</h3>
          </div>
        </div>
        <p style="font-size: 13px; color: #735022; margin-bottom: 14px;">The following employees have signed up under your store '<b>${metrics.business_name}</b>' and cannot log in until you approve them:</p>
        
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${pendingStaff.map(s => `
            <div style="background: white; border: 1px solid #EADBCA; border-radius: var(--radius-sm); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-left: 4px solid var(--amber);">
              <div>
                <div style="font-weight: 700; font-size: 13.5px; color: var(--navy);">${s.full_name}</div>
                <div style="font-size: 12px; color: var(--text-muted);">${s.email} • Role Requested: <span class="badge badge-neutral">${s.role}</span> • Phone: ${s.phone || 'N/A'}</div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-sm btn-primary" onclick="approveStaffMember(${s.membership_id}, '${s.full_name.replace(/'/g, "\\'")}')">${t("approve_staff_btn", "✓ Approve Staff")}</button>
                <button class="btn btn-sm btn-secondary" onclick="rejectStaffMember(${s.membership_id})">${t("reject_staff_btn", "✕ Reject")}</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${Number(metrics.pending_credit_dues || 0) > 0 ? `
      <div style="background: #FFF5F5; border: 1px solid #FEB2B2; border-radius: var(--radius-md); padding: 14px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 24px;">📅</span>
          <div>
            <div style="font-size: 14px; font-weight: 800; color: #9B2C2C;">${t("month_end_banner_title", "Month-End Credit Payment Reminders Active")}</div>
            <div style="font-size: 12.5px; color: #C53030;">₹${Number(metrics.pending_credit_dues).toFixed(2)} total outstanding Store Credit due for collection before month-end.</div>
          </div>
        </div>
        <button class="btn btn-sm btn-navy" onclick="switchTab('invoices')">${t("review_dues_btn", "Review Dues in Invoices")}</button>
      </div>
    ` : ''}

    <div class="grid-cards" style="margin-bottom: 24px;">
      <div class="stat-card stagger-1">
        <div class="stat-label">${t.today_sales}</div>
        <div class="stat-value" id="dash-val-sales" style="color: var(--teal);">₹0.00</div>
        <div class="stat-meta"><span id="dash-val-orders">0</span> ${t("tx_completed", "transactions completed")}</div>
      </div>
      <div class="stat-card stagger-2">
        <div class="stat-label">${t.low_stock_items}</div>
        <div class="stat-value ${metrics.low_stock_count > 0 ? 'badge-low-stock-pulse' : ''}" id="dash-val-lowstock" style="color: ${metrics.low_stock_count > 0 ? 'var(--amber)' : 'var(--teal)'};">
          ${metrics.low_stock_count > 0 ? '▲ ' : '● '}${metrics.low_stock_count}
        </div>
        <div class="stat-meta">${metrics.low_stock_count > 0 ? 'Sizes requiring reorder' : 'All inventory healthy'}</div>
      </div>
      <div class="stat-card stagger-3">
        <div class="stat-label">${t.pending_dealer_orders}</div>
        <div class="stat-value" id="dash-val-dealers" style="color: var(--amber);">0</div>
        <div class="stat-meta">B2B orders awaiting action</div>
      </div>
      ${(!state.isStaff || (state.business && state.business.role !== 'CASHIER')) ? `
      <div class="stat-card stagger-4">
        <div class="stat-label">${t.total_revenue}</div>
        <div class="stat-value" id="dash-val-revenue" style="color: var(--navy);">₹0.00</div>
        <div class="stat-meta">Authoritative posted invoices</div>
      </div>
      ` : ''}
      ${Number(metrics.pending_credit_dues || 0) > 0 ? `
      <div class="stat-card stagger-5" style="border-left: 4px solid var(--coral);">
        <div class="stat-label">Month-End Credit Dues</div>
        <div class="stat-value" style="color: var(--coral);">₹${Number(metrics.pending_credit_dues).toFixed(2)}</div>
        <div class="stat-meta">Pending customer receivables</div>
      </div>
      ` : ''}
    </div>

    <!-- Quick Actions Banner -->
    <div style="display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;">
      <button class="btn btn-primary" onclick="switchTab('pos')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        New POS Sale
      </button>
      <button class="btn btn-secondary" onclick="openAddProductModal()">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        Add Garment Product
      </button>
      <button class="btn btn-secondary" onclick="switchTab('dealers')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
        Dealer Orders (${metrics.pending_dealer_orders})
      </button>
    </div>

    <!-- Low Stock Alert Panel -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">Urgent Low Stock Warnings</div>
        <button class="btn btn-sm btn-secondary" onclick="switchTab('inventory')">View All Inventory</button>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Garment Product</th>
              <th>SKU</th>
              <th>Size / Color</th>
              <th>Available Qty</th>
              <th>Threshold</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${metrics.top_low_stock && metrics.top_low_stock.length > 0 ? metrics.top_low_stock.map(item => `
              <tr>
                <td><b>${item.name}</b></td>
                <td><code>${item.sku}</code></td>
                <td>${item.size} / ${item.color}</td>
                <td><b style="color: ${item.available <= 0 ? 'var(--coral)' : 'var(--amber)'};">${item.available} units</b></td>
                <td>${item.threshold}</td>
                <td><button class="btn btn-sm btn-secondary" onclick="switchTab('inventory')">Manage Stock</button></td>
              </tr>
            `).join('') : `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">${t.all_healthy} All variants have sufficient inventory.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Trigger Number Tweens for Boutique Feel
  animateNumber(document.getElementById("dash-val-sales"), 0, Number(metrics.today_sales || 0), 700, "₹", "", 2);
  animateNumber(document.getElementById("dash-val-orders"), 0, Number(metrics.today_orders_count || 0), 500);
  animateNumber(document.getElementById("dash-val-dealers"), 0, Number(metrics.pending_dealer_orders || 0), 500);
  const revEl = document.getElementById("dash-val-revenue");
  if (revEl) {
    animateNumber(revEl, 0, Number(metrics.total_revenue || 0), 800, "₹", "", 2);
  }
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

const posThemesData = [
  { id: "CLASSIC_GST", name: "Classic GST", tag: "GST Standard", color: "#1E3A8A" },
  { id: "MODERN_MINIMAL", name: "Modern Minimal", tag: "Modern Retail", color: "#0D9488" },
  { id: "PREMIUM_BOUTIQUE", name: "Premium Boutique", tag: "High Fashion", color: "#B45309" },
  { id: "WHOLESALE_DEALER", name: "Wholesale & Dealer", tag: "B2B Wholesale", color: "#4B5563" },
  { id: "COMPACT_THERMAL", name: "Compact Thermal", tag: "Counter POS", color: "#1F2937" },
  { id: "INTERNATIONAL_COMMERCIAL", name: "Global Commercial", tag: "Global Trade", color: "#4338CA" }
];

function getThemeName(themeId) {
  const t = posThemesData.find(x => x.id === themeId);
  return t ? t.name : "Premium Boutique";
}

function renderThemeThumbnails() {
  const active = state.selectedPOSTheme || "PREMIUM_BOUTIQUE";
  return posThemesData.map(th => `
    <div class="pos-theme-thumb ${th.id === active ? 'active' : ''}" onclick="selectPOSTheme('${th.id}')" title="${th.name}">
      <div class="pos-theme-thumb-preview" style="border-top: 3px solid ${th.color};">
        <div style="height: 4px; width: 60%; background: ${th.color}; margin-bottom: 2px; border-radius: 1px;"></div>
        <div style="height: 2px; width: 90%; background: #E5E7EB; margin-bottom: 2px;"></div>
        <div style="height: 2px; width: 75%; background: #E5E7EB; margin-bottom: 2px;"></div>
        <div style="height: 3px; width: 45%; background: ${th.color}; margin-top: 3px; border-radius: 1px;"></div>
      </div>
      <div class="pos-theme-thumb-name">${th.tag}</div>
    </div>
  `).join('');
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
        ${themesData.map(th => `
          <div class="invoice-carousel-card ${th.id === currentDefaultTheme ? 'active' : ''}" onclick="selectStoreDefaultTheme('${th.id}')">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 20px;">${th.icon}</span>
              <span class="badge ${th.id === currentDefaultTheme ? 'badge-primary' : 'badge-neutral'}" style="font-size: 10px;">${th.tag}</span>
            </div>
            <div style="font-size: 14px; font-weight: 800; color: var(--navy); margin-bottom: 4px;">${th.name}</div>
            <div style="font-size: 11px; color: var(--text-muted); line-height: 1.4; flex: 1; margin-bottom: 12px;">${th.desc}</div>
            <div style="font-size: 11.5px; font-weight: 700; color: ${th.id === currentDefaultTheme ? 'var(--teal)' : 'var(--text-muted)'}; display: flex; align-items: center; gap: 4px;">
              ${th.id === currentDefaultTheme ? t('store_default_badge', '✓ Store Default') : t('set_default_label', 'Tap to set default')}
            </div>
          </div>
        `).join('')}
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
        <h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">Store Expenses & Overhead Management</h2>
        <p style="color: var(--text-muted); font-size: 13px;">Store: <b>${state.storeName || state.business.name}</b> • Track daily operational costs, salaries, rent, and packaging.</p>
      </div>
      <button class="btn btn-primary" onclick="openAddExpenseModal()">+ Record New Expense</button>
    </div>

    <!-- Expense Metrics Cards -->
    <div class="grid-cards" style="margin-bottom: 24px;">
      <div class="stat-card">
        <div class="stat-label">Total Expenses Recorded</div>
        <div class="stat-value" style="color: var(--coral);">₹${totalExp.toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
        <div class="stat-meta">${allExpenses.length} expense entries</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Sales Collections</div>
        <div class="stat-value" style="color: var(--teal);">₹${(summary ? summary.total_collected : 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
        <div class="stat-meta">Cash + UPI + Card receipts</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Net Operating Cash Flow</div>
        <div class="stat-value" style="color: ${(summary && summary.net_cash_flow >= 0) ? 'var(--teal)' : 'var(--coral)'};">
          ₹${(summary ? summary.net_cash_flow : 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}
        </div>
        <div class="stat-meta">Collections minus expenses</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Accounts Receivable</div>
        <div class="stat-value" style="color: var(--amber);">₹${(summary ? summary.total_receivables : 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
        <div class="stat-meta">Pending customer dues</div>
      </div>
    </div>

    <!-- Expenses Table Panel -->
    <div class="panel">
      <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div class="panel-title">Expense Transactions Log</div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <label style="font-size: 12px; color: var(--text-muted);">Filter Category:</label>
          <select id="expense-cat-filter" class="form-select" style="width: auto; padding: 4px 10px; font-size: 12.5px;" onchange="filterExpenses(this.value)">
            <option value="ALL">All Categories</option>
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
              <th>Date & Time</th>
              <th>Category</th>
              <th>Description / Purpose</th>
              <th>Payment Mode</th>
              <th>Receipt</th>
              <th style="text-align: right;">Amount (₹)</th>
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
    return '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">No expenses recorded yet. Click "+ Record New Expense" to log costs.</td></tr>';
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
          <h2 style="font-size: 22px; font-weight: 800; color: var(--navy);">Store Team & User Accounts</h2>
          <span class="badge badge-success">${list.length} Members</span>
        </div>
        <p style="color: var(--text-muted); font-size: 13px;">Store: <b>${state.storeName || state.business.name}</b> • Manage employee roles, counter cashiers, and logistics dispatchers.</p>
      </div>
      <button class="btn btn-primary" onclick="openAddStaffModal()">+ Add Team Member</button>
    </div>

    <!-- Staff Summary Metrics -->
    <div class="grid-cards" style="margin-bottom: 24px;">
      <div class="stat-card">
        <div class="stat-label">Total Store Team</div>
        <div class="stat-value" style="color: var(--navy);">${list.length}</div>
        <div class="stat-meta">Active registered accounts</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">POS Counter Cashiers</div>
        <div class="stat-value" style="color: var(--teal);">${cashiersCount}</div>
        <div class="stat-meta">Cash shift & billing access</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Logistics & Dispatch</div>
        <div class="stat-value" style="color: #0284C7;">${dispatchersCount}</div>
        <div class="stat-meta">Order packing & LR dispatch</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pending Registrations</div>
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
async function renderApp() {
  const root = document.getElementById("app");
  if (!root) return;

  if (!state.token) {
    if (!state.stores || state.stores.length === 0) {
      state.stores = offlineDB.stores;
    }
    // Background fetch of public stores without blocking UI render
    loadPublicStores().then(() => {
      const storeSelect = document.getElementById("reg-staff-store");
      if (storeSelect && state.stores && state.stores.length > 0) {
        storeSelect.innerHTML = state.stores.map(s => `
          <option value="${s.id}">${s.name} (${s.city || 'India'})</option>
        `).join('');
      }
    }).catch(() => {});

    root.innerHTML = `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 28px 16px;">
        <div style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(229, 231, 226, 0.9); border-radius: var(--radius-lg); padding: 40px 36px; width: 100%; max-width: 480px; box-shadow: 0 20px 48px rgba(16, 30, 43, 0.12); position: relative;">
          
          <div style="text-align: center; margin-bottom: 26px;">
            <img src="static/brand/vastrenix-icon.svg" alt="VASTRENIX 3D V" style="width: 82px; height: 82px; margin-bottom: 14px; filter: drop-shadow(0 12px 24px rgba(16, 30, 43, 0.28)); cursor: pointer;" onclick="handleDevLogoTap()" oncontextmenu="handleDevLogoHold(event)" title="VASTRENIX Platform">
            <div style="font-size: 26px; font-weight: 900; letter-spacing: 3.5px; color: var(--navy); margin-bottom: 4px;">VASTRENIX</div>
            <p style="color: var(--teal); font-size: 11.5px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">Your Business, Beautifully in Sync.</p>
          </div>

          <!-- Auth Navigation Switcher -->
          <div style="display: flex; background: #EEF2F5; padding: 4px; border-radius: 10px; margin-bottom: 24px;">
            <button class="btn" style="flex: 1; padding: 8px; font-size: 13px; font-weight: 700; border-radius: 8px; background: ${state.authMode==='signin'?'var(--white)':'transparent'}; color: ${state.authMode==='signin'?'var(--navy)':'var(--text-muted)'}; box-shadow: ${state.authMode==='signin'?'0 2px 6px rgba(0,0,0,0.06)':'none'};" onclick="setAuthMode('signin')">
              Sign In
            </button>
            <button class="btn" style="flex: 1; padding: 8px; font-size: 13px; font-weight: 700; border-radius: 8px; background: ${state.authMode==='signup_owner'?'var(--white)':'transparent'}; color: ${state.authMode==='signup_owner'?'var(--navy)':'var(--text-muted)'}; box-shadow: ${state.authMode==='signup_owner'?'0 2px 6px rgba(0,0,0,0.06)':'none'};" onclick="setAuthMode('signup_owner')">
              Store Owner
            </button>
            <button class="btn" style="flex: 1; padding: 8px; font-size: 13px; font-weight: 700; border-radius: 8px; background: ${state.authMode==='signup_staff'?'var(--white)':'transparent'}; color: ${state.authMode==='signup_staff'?'var(--navy)':'var(--text-muted)'}; box-shadow: ${state.authMode==='signup_staff'?'0 2px 6px rgba(0,0,0,0.06)':'none'};" onclick="setAuthMode('signup_staff')">
              Staff Request
            </button>
          </div>

          <!-- MODE 1: SIGN IN -->
          ${state.authMode === 'signin' ? `
            <form id="signin-form" onsubmit="handleSignIn(event)">
              <div class="form-group">
                <label class="form-label">Email Address</label>
                <input type="email" id="login-email" class="form-input" required placeholder="demo@vastrenix.com" value="demo@vastrenix.com">
              </div>
              <div class="form-group">
                <label class="form-label">Password</label>
                <input type="password" id="login-password" class="form-input" required placeholder="••••••••" value="VastrenixDemo2026!">
              </div>
              <button type="submit" class="btn btn-primary" style="width: 100%; padding: 13px; margin-top: 10px; font-size: 14px;">
                Enter Business Workspace ➔
              </button>
            </form>

            <div style="margin-top: 24px; padding-top: 20px; border-top: 1px dashed var(--border);">
              <div style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px; text-align: center;">One-Click Instant Access</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <button class="btn btn-sm btn-navy" onclick="loginDemo('demo@vastrenix.com', 'VastrenixDemo2026!')">
                  👑 Store Owner
                </button>
                <button class="btn btn-sm btn-secondary" onclick="loginDemo('cashier@vastrenix.com', 'CashierPass123!')">
                  🛒 Cashier POS
                </button>
              </div>
            </div>
          ` : ''}

          <!-- MODE 2: OWNER SIGNUP -->
          ${state.authMode === 'signup_owner' ? `
            <form onsubmit="handleOwnerSignUp(event)">
              <div class="form-group">
                <label class="form-label">Store / Business Name</label>
                <input type="text" id="reg-biz-name" class="form-input" required placeholder="e.g. Royal Silks Heritage">
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="form-group">
                  <label class="form-label">City</label>
                  <input type="text" id="reg-biz-city" class="form-input" required placeholder="Surat">
                </div>
                <div class="form-group">
                  <label class="form-label">GSTIN (Optional)</label>
                  <input type="text" id="reg-biz-gstin" class="form-input" placeholder="24AAACV1234F1Z9">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Owner Full Name</label>
                <input type="text" id="reg-owner-name" class="form-input" required placeholder="Ramesh Patel">
              </div>
              <div class="form-group">
                <label class="form-label">Phone Number</label>
                <input type="text" id="reg-owner-phone" class="form-input" required placeholder="+91 98765 43210">
              </div>
              <div class="form-group">
                <label class="form-label">Email Address</label>
                <input type="email" id="reg-owner-email" class="form-input" required placeholder="owner@royalsilks.com">
              </div>
              <div class="form-group">
                <label class="form-label">Password</label>
                <input type="password" id="reg-owner-password" class="form-input" required placeholder="••••••••">
              </div>
              <button type="submit" class="btn btn-primary" style="width: 100%; padding: 12px; margin-top: 8px;">
                Register Store & Open Business
              </button>
            </form>
          ` : ''}

          <!-- MODE 3: STAFF SIGNUP -->
          ${state.authMode === 'signup_staff' ? `
            <form onsubmit="handleStaffSignUp(event)">
              <div style="background: var(--teal-light); border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 16px; font-size: 12px; color: var(--navy);">
                <b>Staff Notice:</b> After submitting, your Store Administrator must approve your account before you can log in.
              </div>

              <div class="form-group">
                <label class="form-label">Select Your Store</label>
                <select id="reg-staff-store" class="form-select" required>
                  ${state.stores && state.stores.length > 0 ? state.stores.map(s => `
                    <option value="${s.id}">${s.name} (${s.city || 'India'})</option>
                  `).join('') : '<option value="1">Vastrenix Heritage Garments (Surat)</option>'}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Assigned Staff Role</label>
                <select id="reg-staff-role" class="form-select" required>
                  <option value="CASHIER">Store Cashier (Billing & Shifts)</option>
                  <option value="INVENTORY_MGR">Inventory & Warehouse Manager</option>
                  <option value="BRANCH_MANAGER">Branch Manager</option>
                  <option value="DISPATCHER">Dispatcher & Logistics</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Staff Full Name</label>
                <input type="text" id="reg-staff-name" class="form-input" required placeholder="Aman Verma">
              </div>

              <div class="form-group">
                <label class="form-label">Staff Email Address</label>
                <input type="email" id="reg-staff-email" class="form-input" required placeholder="aman.staff@store.com">
              </div>

              <div class="form-group">
                <label class="form-label">Phone Number</label>
                <input type="text" id="reg-staff-phone" class="form-input" required placeholder="+91 98888 77777">
              </div>

              <div class="form-group">
                <label class="form-label">Password</label>
                <input type="password" id="reg-staff-password" class="form-input" required placeholder="••••••••">
              </div>

              <button type="submit" class="btn btn-navy" style="width: 100%; padding: 12px; margin-top: 8px;">
                Request Staff Account (Pending Admin Approval)
              </button>
            </form>
          ` : ''}

        </div>
      </div>

      <!-- Developer Diagnostic Server URL Modal (Hidden from regular users, accessible via logo gesture) -->
      <div class="modal-overlay" id="modal-server-settings">
        <div class="modal-card" style="max-width: 440px;">
          <div class="modal-header">
            <h3 style="font-size: 16px; font-weight: 700; color: var(--navy);">Developer Diagnostic Settings</h3>
            <button style="border: none; background: none; font-size: 20px; cursor: pointer;" onclick="closeServerSettingsModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 14px;">
              Production default is hardcoded to Render cloud service. Use this dialog only for internal debugging or self-hosted testing.
            </p>
            <div class="form-group">
              <label class="form-label">API Override Endpoint</label>
              <input type="text" id="server-url-input" class="form-input" placeholder="${PRODUCTION_RENDER_API}">
            </div>

            <div style="margin-bottom: 16px;">
              <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Presets</div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                <button type="button" class="btn btn-sm btn-primary" onclick="setPresetServerUrl('${PRODUCTION_RENDER_API}')">Production Render</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="setPresetServerUrl('http://10.0.2.2:8000')">Android Emulator (10.0.2.2)</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="setPresetServerUrl('http://localhost:8000')">Localhost (8000)</button>
              </div>
            </div>

            <div id="server-health-status" style="min-height: 24px; margin-bottom: 14px;"></div>

            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn btn-secondary" style="flex: 1; padding: 10px;" onclick="testServerConnection()">
                Test Health
              </button>
              <button type="button" class="btn btn-primary" style="flex: 1; padding: 10px;" onclick="saveServerSettings()">
                Save Override
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Authenticated Application Shell
  const t = i18n[state.lang] || i18n.en;
  root.innerHTML = `
    <div class="app-layout">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="brand-header">
          <img src="static/brand/vastrenix-icon.svg" alt="VASTRENIX 3D V" class="brand-logo-img">
          <div>
            <div class="brand-title">VASTRENIX</div>
            <div class="brand-desc">Clothing Business Platform</div>
          </div>
        </div>

        <!-- Prominent Store & Staff Identity Card -->
        <div style="margin: 12px; padding: 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-sm);">
          <div style="font-size: 10px; color: #9FB0BC; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">${t.current_store}</div>
          <div style="font-size: 13.5px; font-weight: 800; color: white; margin: 2px 0;">${state.storeName || state.business.name}</div>
          <div style="font-size: 11px; color: var(--teal); font-weight: 600;">
            ${state.isStaff ? `Staff: ${state.user.full_name} (${state.business.role})` : `Owner / Store Admin`}
          </div>
        </div>

        <ul class="nav-menu">
          <li class="nav-item">
            <a class="nav-link active" data-tab="dashboard" onclick="switchTab('dashboard')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
              ${t.dashboard}
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-tab="inventory" onclick="switchTab('inventory')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
              ${t.inventory}
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-tab="pos" onclick="switchTab('pos')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
              ${t.pos}
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-tab="invoices" onclick="switchTab('invoices')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              ${t.invoices}
            </a>
          </li>
          ${(!state.isStaff || state.business.role !== 'CASHIER') ? `
          <li class="nav-item">
            <a class="nav-link" data-tab="dealers" onclick="switchTab('dealers')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
              ${t.dealers}
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-tab="expenses" onclick="switchTab('expenses')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              ${t.expenses}
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-tab="users" onclick="switchTab('users')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              ${t.team}
            </a>
          </li>
          ` : ''}
          <li class="nav-item">
            <a class="nav-link" data-tab="flowcharts" onclick="switchTab('flowcharts')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              ${t.flowcharts}
            </a>
          </li>
        </ul>

        <div class="user-badge">
          <div>
            <div class="user-info-name">${state.user.full_name}</div>
            <div class="user-info-role">${state.business.role || 'OWNER'}</div>
          </div>
          <button style="background: none; border: none; color: #9FB0BC; cursor: pointer; font-size: 11px;" onclick="logout()">${t.logout}</button>
        </div>
      </aside>

      <!-- Main Section -->
      <div class="main-wrapper">
        <header class="topbar">
          <div class="topbar-row-main">
            <div class="topbar-left">
              <button class="mobile-hamburger" onclick="toggleMobileDrawer()" aria-label="Open Navigation">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
              </button>
              <div class="topbar-title-wrap" onclick="showStoreInfoToast()" title="${state.storeName || state.business.name}">
                <div class="topbar-title">${state.storeName || state.business.name}</div>
                <div class="topbar-subtitle">${state.isStaff ? `Staff: ${state.user.full_name} (${state.business.role})` : (t.flagship_store || 'Flagship Store')}</div>
              </div>
            </div>
            <div class="topbar-right">
              <button class="lang-compact-chip" onclick="openStoreSettingsModal()" title="Store & POS Settings" style="margin-right: 6px;">
                <span style="font-size: 14px;">⚙️</span>
                <span class="lang-code-text">Settings</span>
              </button>
              <button class="lang-compact-chip" onclick="openLanguageModal()" title="Switch Language (English / हिन्दी / ગુજરાતી)">
                <span class="lang-globe-icon">🌐</span>
                <span class="lang-code-text">${state.lang==='hi' ? 'हि' : state.lang==='gu' ? 'ગુ' : 'EN'}</span>
              </button>
            </div>
          </div>
          <!-- Row 2: Sync Status Pill (Shown ONLY while syncing/offline, auto-hides when empty) -->
          <div id="sync-banner-row" class="sync-banner-row" style="display: none;" onclick="drainOfflineQueue()" title="Tap to sync with cloud">
            <span class="sync-pulse-dot"></span>
            <span id="sync-banner-text">Syncing...</span>
          </div>
        </header>

        <main class="content-body" id="tab-content"></main>
      </div>
    </div>

    <!-- Add Product Modal -->
    <div class="modal-overlay" id="modal-add-product">
      <div class="modal-card">
        <div class="modal-header">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--navy);">Add Garment Product</h3>
          <button style="border: none; background: none; font-size: 20px; cursor: pointer;" onclick="closeModal('modal-add-product')">&times;</button>
        </div>
        <form class="modal-body" onsubmit="submitAddProduct(event)">
          <div class="form-group">
            <label class="form-label">Garment Name</label>
            <input type="text" id="prod-name" class="form-input" required placeholder="e.g. Pure Mulberry Silk Sari">
          </div>
          <div class="form-group">
            <label class="form-label">Fabric / Material</label>
            <input type="text" id="prod-fabric" class="form-input" required placeholder="e.g. Handwoven Mulberry Silk">
          </div>
          <div class="modal-responsive-grid">
            <div class="form-group">
              <label class="form-label">Retail Price (₹)</label>
              <input type="number" step="0.01" id="prod-price" class="form-input" required placeholder="3490.00">
            </div>
            <div class="form-group">
              <label class="form-label">Purchase Cost (₹)</label>
              <input type="number" step="0.01" id="prod-cost" class="form-input" required placeholder="1400.00">
            </div>
          </div>
          <div class="modal-responsive-grid-3">
            <div class="form-group">
              <label class="form-label">Size</label>
              <input type="text" id="prod-size" class="form-input" required placeholder="M or Free">
            </div>
            <div class="form-group">
              <label class="form-label">Color</label>
              <input type="text" id="prod-color" class="form-input" required placeholder="Peacock Blue">
            </div>
            <div class="form-group">
              <label class="form-label">Initial Stock</label>
              <input type="number" id="prod-stock" class="form-input" required placeholder="20">
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px; padding: 12px;">Save & Create Garment</button>
        </form>
      </div>
    </div>

    <!-- Purchase Order Modal (Order More) -->
    <div class="modal-overlay" id="modal-purchase-order">
      <div class="modal-card">
        <div class="modal-header">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--navy);">Create Purchase Order (Order More)</h3>
          <button style="border: none; background: none; font-size: 20px; cursor: pointer;" onclick="closeModal('modal-purchase-order')">&times;</button>
        </div>
        <form class="modal-body" onsubmit="submitPurchaseOrder(event)">
          <div style="background: var(--teal-light); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 16px;">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--teal); font-weight: 700;">Garment Target</div>
            <div style="font-size: 14px; font-weight: 800; color: var(--navy);" id="po-product-display">Garment Variant</div>
          </div>
          <div class="form-group">
            <label class="form-label">Select Textile Supplier / Weaver</label>
            <select id="po-supplier-select" class="form-select" required></select>
          </div>
          <div class="modal-responsive-grid">
            <div class="form-group">
              <label class="form-label">Order Quantity (Pieces)</label>
              <input type="number" id="po-quantity" class="form-input" min="1" required placeholder="20">
            </div>
            <div class="form-group">
              <label class="form-label">Unit Purchase Cost (₹)</label>
              <input type="number" step="0.01" id="po-unit-cost" class="form-input" required placeholder="1200.00">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">PO Notes / Reference</label>
            <input type="text" id="po-notes" class="form-input" placeholder="e.g. Festival restocking">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px; padding: 12px;">Issue Purchase Order</button>
        </form>
      </div>
    </div>

    <!-- Goods Receipt Modal (Receive Stock) -->
    <div class="modal-overlay" id="modal-receive-goods">
      <div class="modal-card">
        <div class="modal-header">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--navy);">Goods Received Note (Receive Stock)</h3>
          <button style="border: none; background: none; font-size: 20px; cursor: pointer;" onclick="closeModal('modal-receive-goods')">&times;</button>
        </div>
        <form class="modal-body" onsubmit="submitReceiveGoods(event)">
          <div style="background: var(--teal-light); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 16px;">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--teal); font-weight: 700;">Receiving Garment</div>
            <div style="font-size: 14px; font-weight: 800; color: var(--navy);" id="grn-product-display">Garment Variant</div>
          </div>
          <div class="form-group">
            <label class="form-label">Select Issued Purchase Order</label>
            <select id="grn-po-select" class="form-select" required></select>
          </div>
          <div class="form-group">
            <label class="form-label">Supplier Invoice / Challan Number</label>
            <input type="text" id="grn-invoice-no" class="form-input" required placeholder="e.g. INV-TEX-9921">
          </div>
          <div class="form-group">
            <label class="form-label">Receiving Inspection Notes</label>
            <input type="text" id="grn-notes" class="form-input" placeholder="e.g. Checked pieces, quality approved">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px; padding: 12px;">Confirm & Add to Stock</button>
        </form>
      </div>
    </div>

    <!-- Language Picker Modal -->
    <div class="modal-overlay" id="modal-language-picker">
      <div class="modal-card" style="max-width: 420px;">
        <div class="modal-header">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--navy);">Choose App Language / ભાષા પસંદ કરો</h3>
          <button style="border: none; background: none; font-size: 20px; cursor: pointer;" onclick="closeModal('modal-language-picker')">&times;</button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 10px; padding-top: 6px;">
          <div class="lang-option-card ${state.lang === 'en' ? 'selected' : ''}" data-lang="en" onclick="selectLanguage('en')">
            <span style="font-size: 24px;">🇬🇧</span>
            <div>
              <div style="font-weight: 700; font-size: 14px; color: var(--navy);">English</div>
              <div style="font-size: 11px; color: var(--text-muted);">Standard Retail Operations</div>
            </div>
          </div>
          <div class="lang-option-card ${state.lang === 'hi' ? 'selected' : ''}" data-lang="hi" onclick="selectLanguage('hi')">
            <span style="font-size: 24px;">🇮🇳</span>
            <div>
              <div style="font-weight: 700; font-size: 14px; color: var(--navy);">हिन्दी (Hindi)</div>
              <div style="font-size: 11px; color: var(--text-muted);">भारतीय वस्त्र भंडार एवं बिलिंग</div>
            </div>
          </div>
          <div class="lang-option-card ${state.lang === 'gu' ? 'selected' : ''}" data-lang="gu" onclick="selectLanguage('gu')">
            <span style="font-size: 24px;">🇮🇳</span>
            <div>
              <div style="font-weight: 700; font-size: 14px; color: var(--navy);">ગુજરાતી (Gujarati)</div>
              <div style="font-size: 11px; color: var(--text-muted);">સુરત ટેક્સટાઇલ વ્યાપાર અને હિસાબ</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Assign Staff to Order Modal -->
    <div class="modal-overlay" id="modal-assign-staff">
      <div class="modal-card">
        <div class="modal-header">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--navy);">Assign Order to Store Staff</h3>
          <button style="border: none; background: none; font-size: 20px; cursor: pointer;" onclick="closeModal('modal-assign-staff')">&times;</button>
        </div>
        <form class="modal-body" onsubmit="submitAssignStaff(event)">
          <input type="hidden" id="assign-order-id">
          <div style="background: var(--teal-light); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 16px;">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--teal); font-weight: 700;">Dealer Order</div>
            <div style="font-size: 14px; font-weight: 800; color: var(--navy);" id="assign-order-num-display">B2B Order</div>
          </div>
          <div class="form-group">
            <label class="form-label">Select Staff Member to Assign</label>
            <select id="assign-staff-select" class="form-select" required></select>
          </div>
          <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 14px;">The assigned staff member will be responsible for item picking, quality check, and packaging for this order.</p>
          <button type="submit" class="btn btn-primary" style="width: 100%; padding: 12px;">Confirm Staff Assignment</button>
        </form>
      </div>
    </div>

    <!-- Record Store Expense Modal -->
    <div class="modal-overlay" id="modal-add-expense">
      <div class="modal-card">
        <div class="modal-header">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--navy);">Record Store Expense</h3>
          <button style="border: none; background: none; font-size: 20px; cursor: pointer;" onclick="closeModal('modal-add-expense')">&times;</button>
        </div>
        <form class="modal-body" onsubmit="submitAddExpense(event)">
          <div class="form-group">
            <label class="form-label">Expense Category</label>
            <select id="exp-category" class="form-select" required>
              <option value="RENT">Rent & Store Premises</option>
              <option value="SALARY">Staff Salaries & Advances</option>
              <option value="TEA_SNACKS">Tea, Coffee & Hospitality</option>
              <option value="PACKAGING">Packaging Bags & Boxes</option>
              <option value="ELECTRICITY">Electricity & Power Bill</option>
              <option value="LOGISTICS">Transport, Porter & Freight</option>
              <option value="MARKETING">Marketing & Social Media</option>
              <option value="MAINTENANCE">Store Repairs & Maintenance</option>
              <option value="OTHER">Other Miscellaneous</option>
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Amount (₹)</label>
              <input type="number" step="0.01" id="exp-amount" class="form-input" required placeholder="1500.00">
            </div>
            <div class="form-group">
              <label class="form-label">Payment Mode</label>
              <select id="exp-payment-mode" class="form-select" required>
                <option value="CASH">Cash (From Store Till)</option>
                <option value="UPI">UPI (Google Pay / PhonePe)</option>
                <option value="BANK_TRANSFER">Bank IMPS / NEFT</option>
                <option value="CARD">Debit / Credit Card</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Description / Receipt Note</label>
            <input type="text" id="exp-description" class="form-input" required placeholder="e.g. 500 custom cotton carry bags for festival rush">
          </div>
          <div class="form-group">
            <label class="form-label">Attach Bill / Receipt Document (Optional)</label>
            <input type="file" id="exp-receipt-file" class="form-input" accept="image/*,application/pdf">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px; padding: 12px;">Save & Post Expense</button>
        </form>
      </div>
    </div>

    <!-- Add Staff Member Modal -->
    <div class="modal-overlay" id="modal-add-staff">
      <div class="modal-card">
        <div class="modal-header">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--navy);">Add Store Staff Member</h3>
          <button style="border: none; background: none; font-size: 20px; cursor: pointer;" onclick="closeModal('modal-add-staff')">&times;</button>
        </div>
        <form class="modal-body" onsubmit="submitAddStaff(event)">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input type="text" id="staff-name" class="form-input" required placeholder="e.g. Ramesh Patel">
          </div>
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="email" id="staff-email" class="form-input" required placeholder="ramesh@vastrenix-store.com">
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="text" id="staff-phone" class="form-input" required placeholder="+91 98765 43210">
          </div>
          <div class="form-group">
            <label class="form-label">Role & Responsibility</label>
            <select id="staff-role" class="form-select" required>
              <option value="SALES">Sales Associate / Till Operator</option>
              <option value="INVENTORY_MANAGER">Inventory & Warehouse Manager</option>
              <option value="BILLING">Billing & Cash Counter Staff</option>
              <option value="STORE_STAFF">General Store Associate</option>
              <option value="ADMIN">Assistant Store Admin</option>
            </select>
          </div>
          <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 14px;">Once created, staff will immediately be authorized to sign in to this store location.</p>
          <button type="submit" class="btn btn-primary" style="width: 100%; padding: 12px;">Create & Authorize Staff</button>
        </form>
      </div>
    </div>

    <!-- Close & Reconcile Shift Modal -->
    <div class="modal-overlay" id="modal-close-shift">
      <div class="modal-card" style="max-width: 480px;">
        <div class="modal-header">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--navy);">Close & Reconcile Cash Shift</h3>
          <button style="border: none; background: none; font-size: 20px; cursor: pointer;" onclick="closeModal('modal-close-shift')">&times;</button>
        </div>
        <form class="modal-body" onsubmit="submitCloseShift(event)">
          <div style="background: #FAF8F3; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px; font-size: 13px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: var(--text-muted);">Opening Cash Float:</span>
              <b id="close-shift-opening">₹0.00</b>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: var(--text-muted);">Total Cash Sales Collected:</span>
              <b id="close-shift-sales" style="color: var(--teal);">+₹0.00</b>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: var(--text-muted);">Cash Payouts / Expenses:</span>
              <b id="close-shift-expenses" style="color: var(--coral);">-₹0.00</b>
            </div>
            <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px dashed var(--border); font-size: 14px;">
              <b>Expected Drawer Cash:</b>
              <b id="close-shift-expected" style="color: var(--navy);">₹0.00</b>
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 14px;">
            <label class="form-label" style="font-weight: 700;">Counted Physical Cash in Drawer (₹)</label>
            <input type="number" step="0.01" id="close-shift-actual" class="form-input" required placeholder="Enter total counted notes & coins" oninput="recalcShiftDifference()" style="font-size: 16px; font-weight: 700;">
          </div>

          <div id="close-shift-diff-box" style="margin-bottom: 16px; padding: 10px; border-radius: var(--radius-sm); text-align: center; font-weight: 700; font-size: 13px; display: none;">
          </div>

          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label">Closing Notes / Discrepancy Reason (Optional)</label>
            <input type="text" id="close-shift-notes" class="form-input" placeholder="e.g. Verified by head cashier">
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%; padding: 13px; font-weight: 700;">
            Reconcile & Close Shift
          </button>
        </form>
      </div>
    </div>

    <!-- Mobile Navigation Drawer Overlay & Drawer -->
    <div class="mobile-drawer-overlay" id="mobile-drawer-overlay" onclick="closeMobileDrawer()"></div>
    <aside class="mobile-drawer" id="mobile-drawer">
      <div class="mobile-drawer-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="static/brand/vastrenix-icon.svg" alt="3D V" style="width: 28px; height: 28px;">
          <div>
            <div style="font-size: 14px; font-weight: 800; color: white; letter-spacing: 0.5px;">VASTRENIX</div>
            <div style="font-size: 10px; color: var(--teal); font-weight: 600;">${state.storeName || state.business.name}</div>
          </div>
        </div>
        <button onclick="closeMobileDrawer()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 4px;">&times;</button>
      </div>

      <div style="padding: 12px 14px; background: rgba(255,255,255,0.05); margin: 10px; border-radius: 8px;">
        <div style="font-size: 10px; color: #9FB0BC; text-transform: uppercase; font-weight: 700;">Logged in as</div>
        <div style="font-size: 13px; font-weight: 700; color: white; margin: 2px 0;">${state.user.full_name}</div>
        <div style="font-size: 11px; color: var(--teal);">${state.isStaff ? `Staff (${state.business.role})` : 'Store Owner / Admin'}</div>
      </div>

      <div class="mobile-drawer-nav">
        <a class="mobile-drawer-link ${state.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard" onclick="drawerNav('dashboard')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          </div>
          <span class="drawer-label">${t.dashboard}</span>
        </a>
        <a class="mobile-drawer-link ${state.activeTab === 'inventory' ? 'active' : ''}" data-tab="inventory" onclick="drawerNav('inventory')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </div>
          <span class="drawer-label">${t.inventory}</span>
        </a>
        <a class="mobile-drawer-link ${state.activeTab === 'pos' ? 'active' : ''}" data-tab="pos" onclick="drawerNav('pos')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line><circle cx="6" cy="15" r="1"></circle><circle cx="10" cy="15" r="1"></circle><circle cx="14" cy="15" r="1"></circle></svg>
          </div>
          <span class="drawer-label">${t.pos}</span>
        </a>
        <a class="mobile-drawer-link ${state.activeTab === 'invoices' ? 'active' : ''}" data-tab="invoices" onclick="drawerNav('invoices')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </div>
          <span class="drawer-label">${t.invoices}</span>
        </a>
        ${(!state.isStaff || state.business.role !== 'CASHIER') ? `
        <a class="mobile-drawer-link ${state.activeTab === 'expenses' ? 'active' : ''}" data-tab="expenses" onclick="drawerNav('expenses')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          </div>
          <span class="drawer-label">${t.expenses}</span>
        </a>
        <a class="mobile-drawer-link ${state.activeTab === 'dealers' ? 'active' : ''}" data-tab="dealers" onclick="drawerNav('dealers')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          </div>
          <span class="drawer-label">${t.dealers}</span>
        </a>
        <a class="mobile-drawer-link ${state.activeTab === 'users' ? 'active' : ''}" data-tab="users" onclick="drawerNav('users')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <span class="drawer-label">${t.team}</span>
        </a>
        ` : ''}
        <a class="mobile-drawer-link ${state.activeTab === 'flowcharts' ? 'active' : ''}" data-tab="flowcharts" onclick="drawerNav('flowcharts')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><path d="M10 6.5h4"></path><path d="M17.5 10v4"></path></svg>
          </div>
          <span class="drawer-label">${t.flowcharts}</span>
        </a>
      </div>

      <div style="padding: 14px; border-top: 1px solid rgba(255,255,255,0.08); margin-top: auto;">
        <button onclick="logout()" class="mobile-drawer-logout-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-radius: 8px; background: rgba(220, 53, 69, 0.15); border: 1px solid rgba(220, 53, 69, 0.3); color: #ff6b6b; font-weight: 700; cursor: pointer;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          <span>${t.logout} (Sign Out)</span>
        </button>
      </div>
    </aside>

    <!-- Mobile Bottom Navigation Bar (Max 5 Actions, Crisp Icons & Clean Non-Overlapping Labels) -->
    <nav class="mobile-bottom-nav">
      <a class="mobile-nav-btn ${state.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard" onclick="switchTab('dashboard')">
        <div class="mobile-nav-icon-pill">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        </div>
        <span>${t.dashboard}</span>
      </a>
      <a class="mobile-nav-btn ${state.activeTab === 'inventory' ? 'active' : ''}" data-tab="inventory" onclick="switchTab('inventory')">
        <div class="mobile-nav-icon-pill">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        </div>
        <span>${t.inventory}</span>
      </a>
      <a class="mobile-nav-btn ${state.activeTab === 'pos' ? 'active' : ''}" data-tab="pos" onclick="switchTab('pos')">
        <div class="mobile-nav-icon-pill">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line><circle cx="6" cy="15" r="1"></circle><circle cx="10" cy="15" r="1"></circle><circle cx="14" cy="15" r="1"></circle></svg>
        </div>
        <span>${t.pos}</span>
      </a>
      ${(!state.isStaff || state.business.role !== 'CASHIER') ? `
      <a class="mobile-nav-btn ${state.activeTab === 'expenses' ? 'active' : ''}" data-tab="expenses" onclick="switchTab('expenses')">
        <div class="mobile-nav-icon-pill">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
        </div>
        <span>${t.expenses}</span>
      </a>
      <a class="mobile-nav-btn ${state.activeTab === 'users' ? 'active' : ''}" data-tab="users" onclick="switchTab('users')">
        <div class="mobile-nav-icon-pill">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </div>
        <span>${t.team}</span>
      </a>
      ` : `
      <a class="mobile-nav-btn ${state.activeTab === 'invoices' ? 'active' : ''}" data-tab="invoices" onclick="switchTab('invoices')">
        <div class="mobile-nav-icon-pill">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <span>${t.invoices}</span>
      </a>
      `}
    </nav>
  `;

  renderCurrentTab();
  updateOfflineIndicator();
}

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
  const spinner = document.getElementById("splash-spinner");
  const statusText = document.getElementById("splash-status-text");
  const subText = document.getElementById("splash-sub-text");
  const actionContainer = document.getElementById("splash-action-container");

  if (newState === AppState.LAUNCHING || newState === AppState.CONNECTING) {
    if (splash) {
      splash.style.display = "flex";
      splash.classList.remove("splash-fade-out");
    }
    if (spinner) spinner.style.display = "block";
    if (actionContainer) actionContainer.style.display = "none";
    if (statusText) {
      statusText.textContent = metadata.title || t("connecting_cloud", "Connecting to cloud server...");
      statusText.style.color = "#FFF";
    }
    if (subText) {
      subText.textContent = metadata.sub || t("checking_server_availability", "Checking server availability & secure session");
      subText.style.color = "rgba(255, 255, 255, 0.85)";
    }
  } else if (newState === AppState.CONNECTED) {
    if (launchColdStartTimer) clearTimeout(launchColdStartTimer);
    if (launchColdStartInterval) clearInterval(launchColdStartInterval);
    if (spinner) spinner.style.display = "none";
    if (statusText) {
      statusText.textContent = t("server_connected_msg", "✓ Server Connected");
      statusText.style.color = "#10B981";
    }
    if (subText) {
      subText.textContent = "Opening your store workspace...";
      subText.style.color = "rgba(255, 255, 255, 0.9)";
    }
    if (actionContainer) actionContainer.style.display = "none";

    // Dismiss splash screen smoothly after short confirmation
    setTimeout(() => {
      dismissSplashScreen();
    }, 450);
  } else if (newState === AppState.CONNECTION_FAILED) {
    if (launchColdStartTimer) clearTimeout(launchColdStartTimer);
    if (launchColdStartInterval) clearInterval(launchColdStartInterval);
    if (spinner) spinner.style.display = "none";
    if (statusText) {
      statusText.textContent = t("cant_reach_title", "Can't reach VASTRENIX right now");
      statusText.style.color = "#EF4444";
    }
    if (subText) {
      subText.textContent = metadata.error || "Unable to establish connection to the cloud server.";
      subText.style.color = "rgba(255, 255, 255, 0.85)";
    }
    if (actionContainer) {
      actionContainer.style.display = "flex";
      actionContainer.style.flexDirection = "column";
      actionContainer.style.gap = "10px";
      actionContainer.innerHTML = `
        <button type="button" class="btn btn-primary" onclick="startAppLaunchSequence()" style="width: 100%; padding: 12px; font-weight: 700; background: #E65100; border: none; box-shadow: 0 4px 14px rgba(230,81,0,0.4); border-radius: 8px; color: #FFF; font-size: 14px; cursor: pointer;">
          ⟳ ${t("retry_conn_btn", "Retry Connection")}
        </button>
        <button type="button" class="btn btn-secondary" onclick="enterOfflineTillMode()" style="width: 100%; padding: 10px; font-size: 13px; background: rgba(255,255,255,0.12); color: #FFF; border: 1px solid rgba(255,255,255,0.25); border-radius: 8px; cursor: pointer;">
          ${t("use_offline_till", "Open Offline POS Till")}
        </button>
      `;
    }
  }
}

async function startAppLaunchSequence() {
  setAppState(AppState.CONNECTING, {
    title: t("connecting_cloud", "Connecting to cloud server..."),
    sub: t("checking_server_availability", "Checking server availability & secure session")
  });

  launchElapsedSeconds = 0;
  if (launchColdStartInterval) clearInterval(launchColdStartInterval);
  launchColdStartInterval = setInterval(() => {
    launchElapsedSeconds++;
    const statusText = document.getElementById("splash-status-text");
    const subText = document.getElementById("splash-sub-text");
    if (launchElapsedSeconds >= 4) {
      if (statusText) {
        statusText.textContent = `Waking up your store's server... (${launchElapsedSeconds}s)`;
      }
      if (subText) {
        subText.textContent = "Render free-tier cold-start can take ~30-50s. Please hold on...";
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
