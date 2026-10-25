// VASTRENIX Client Application Controller
// Build-time Production Cloud API constant (Render Free Web Service + Firebase Admin)
const PRODUCTION_RENDER_API = "https://vastrenix-api.onrender.com";

let isServerWarm = false;
let coldStartTimer = null;
let coldStartTimeoutTimer = null;

function getBaseServerUrl() {
  // 1. Hidden developer override (accessible only via logo gesture, never shown to regular users)
  const debugOverride = localStorage.getItem("vastrenix_debug_server_url");
  if (debugOverride && debugOverride.trim()) {
    return debugOverride.trim().replace(/\/+$/, "");
  }

  // 2. Native container override if explicitly provided
  if (window.VastrenixNative && typeof window.VastrenixNative.getServerUrl === "function") {
    const nativeSaved = window.VastrenixNative.getServerUrl();
    if (nativeSaved && nativeSaved.trim()) {
      return nativeSaved.trim().replace(/\/+$/, "");
    }
  }

  // 3. Web browser hosting if not localhost
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    if (!window.location.hostname.includes("localhost") && !window.location.hostname.includes("127.0.0.1")) {
      return window.location.origin;
    }
  }

  // 4. Default Production Render API URL
  return PRODUCTION_RENDER_API;
}

function getApiBase() {
  const base = getBaseServerUrl();
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
}

function openInvoicePdf(invoiceId, invoiceNumber) {
  const fullUrl = `${getApiBase()}/pos/invoices/${invoiceId}/pdf`;
  const fileName = `Invoice_${invoiceNumber || invoiceId}.pdf`;

  if (window.VastrenixNative && typeof window.VastrenixNative.openPdfUrl === "function") {
    window.VastrenixNative.openPdfUrl(fullUrl, fileName);
  } else {
    window.open(fullUrl, "_blank");
  }
}

function shareInvoicePdf(invoiceId, invoiceNumber) {
  const fullUrl = `${getApiBase()}/pos/invoices/${invoiceId}/pdf`;
  const fileName = `Invoice_${invoiceNumber || invoiceId}.pdf`;

  if (window.VastrenixNative && typeof window.VastrenixNative.openPdfUrl === "function") {
    window.VastrenixNative.openPdfUrl(fullUrl, fileName);
  } else if (navigator.share) {
    navigator.share({ title: `Invoice ${invoiceNumber}`, url: fullUrl });
  } else {
    window.open(fullUrl, "_blank");
  }
}

const state = {
  token: localStorage.getItem("vastrenix_token") || null,
  user: JSON.parse(localStorage.getItem("vastrenix_user") || "null"),
  business: JSON.parse(localStorage.getItem("vastrenix_business") || "null"),
  storeName: localStorage.getItem("vastrenix_store_name") || null,
  isStaff: localStorage.getItem("vastrenix_is_staff") === "true",
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
    today_sales: "Today's Gross Sales",
    today_orders: "Today's Orders",
    total_revenue: "Total Net Revenue",
    low_stock_items: "Low Stock Items",
    pending_approvals: "Pending Staff Approvals",
    pending_dealer_orders: "Pending Dealer Orders",
    add_product: "+ Add New Garment",
    adjust_stock: "Adjust Stock",
    search_placeholder: "Search garment by name, fabric, or SKU...",
    record_expense: "Record Store Expense",
    open_shift: "Open Cash Shift",
    close_shift: "Close Cash Shift",
    server_settings: "Server URL Settings",
    logout: "Sign Out",
    quick_bill: "Quick POS Billing Till",
    save_changes: "Save Changes",
    current_store: "Current Store",
    flagship_store: "Flagship Store"
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
    today_sales: "आज की कुल बिक्री",
    today_orders: "आज के ऑर्डर्स",
    total_revenue: "कुल राजस्व",
    low_stock_items: "कम स्टॉक वाले वस्त्र",
    pending_approvals: "लंबित कर्मचारी स्वीकृतियां",
    pending_dealer_orders: "लंबित डीलर ऑर्डर्स",
    add_product: "+ नया वस्त्र जोड़ें",
    adjust_stock: "स्टॉक समायोजित करें",
    search_placeholder: "वस्त्र का नाम, फैब्रिक या SKU खोजें...",
    record_expense: "दुकान खर्च दर्ज करें",
    open_shift: "कैश शिफ्ट खोलें",
    close_shift: "कैश शिफ्ट बंद करें",
    server_settings: "सर्वर सेटिंग्स",
    logout: "साइन आउट",
    quick_bill: "त्वरित बिलिंग काउंटर",
    save_changes: "परिवर्तन सहेजें",
    current_store: "वर्तमान दुकान",
    flagship_store: "प्रमुख दुकान"
  },
  gu: {
    welcome: "તમારા વસ્ત્ર વ્યાપારમાં આપનું સ્વાગત છે",
    dashboard: "ડેશબોર્ડ",
    inventory: "ઇન્વેન્ટરી અને કેટલોગ",
    pos: "પીઓએસ બિલિંગ કાઉન્ટર",
    invoices: "બિલ અને થીમ્સ",
    expenses: "દુકાનના ખર્ચાઓ",
    dealers: "ડીલર બી2બી નેટવર્ક",
    team: "સ્ટાફ અને ટીમ",
    flowcharts: "સિસ્ટમ ફ્લોચાર્ટ",
    today_sales: "આજનું કુલ વેચાણ",
    today_orders: "આજના ઓર્ડર્સ",
    total_revenue: "કુલ આવક",
    low_stock_items: "ઓછો સ્ટોક ધરાવતા વસ્ત્રો",
    pending_approvals: "બાકી સ્ટાફ મંજૂરીઓ",
    pending_dealer_orders: "બાકી ડીલર ઓર્ડર્સ",
    add_product: "+ નવો ડ્રેસ/કપડાં ઉમેરો",
    adjust_stock: "સ્ટોક એડજસ્ટ કરો",
    search_placeholder: "કપડાંનું નામ, કાપડ અથવા SKU શોધો...",
    record_expense: "દુકાનનો ખર્ચ નોંધો",
    open_shift: "રોકડ શિફ્ટ શરૂ કરો",
    close_shift: "રોકડ શિફ્ટ સમાપ્ત કરો",
    server_settings: "સર્વર સેટિંગ્સ",
    logout: "લોગ આઉટ",
    quick_bill: "ઝડપી બિલિંગ ટિલ",
    save_changes: "સાચવો",
    current_store: "ચાલુ સ્ટોર",
    flagship_store: "મુખ્ય શોરૂમ"
  }
};

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
  ]
};

function handleOfflineMock(endpoint, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  if (endpoint.includes("/auth/public-stores")) return offlineDB.stores;
  if (endpoint.includes("/reports/dashboard")) return offlineDB.dashboard;
  if (endpoint.includes("/products/")) return offlineDB.products;
  if (endpoint.includes("/inventory/levels")) return offlineDB.inventory;
  if (endpoint.includes("/finance/expenses") && method === "GET") return offlineDB.expenses;
  if (endpoint.includes("/finance/summary")) return { total_collected: 68450.00, total_expenses: 28680.00, net_cash_flow: 39770.00, total_receivables: 12400.00 };
  if (endpoint.includes("/pos/invoices")) return offlineDB.invoices;
  if (endpoint.includes("/dealers/orders/incoming")) return offlineDB.incomingOrders;
  if (endpoint.includes("/dealers/connections")) return offlineDB.connections;
  if (endpoint.includes("/auth/staff")) return offlineDB.staff;
  if (endpoint.includes("/auth/pending-staff")) return [];

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

function cycleLanguage() {
  const modes = ["en", "hi", "gu"];
  const currentIdx = modes.indexOf(state.lang || "en");
  const nextIdx = (currentIdx + 1) % modes.length;
  changeLanguage(modes[nextIdx]);
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

// Render Cold-Start Management (Part 2)
function showColdStartOverlay() {
  const overlay = document.getElementById("render-coldstart-overlay");
  if (overlay) {
    overlay.style.display = "flex";
    const title = document.getElementById("coldstart-title");
    const sub = document.getElementById("coldstart-subline");
    const action = document.getElementById("coldstart-timeout-action");
    if (title) title.innerText = "Waking up your store's cloud server…";
    if (sub) sub.innerText = "This happens after a few minutes of inactivity on cloud infrastructure — it'll be fast after this.";
    if (action) action.style.display = "none";

    // Set 55s fallback timer
    if (coldStartTimeoutTimer) clearTimeout(coldStartTimeoutTimer);
    coldStartTimeoutTimer = setTimeout(() => {
      if (overlay.style.display === "flex") {
        if (title) title.innerText = "Taking longer than expected";
        if (sub) sub.innerText = "The cloud instance is taking a little longer to boot. Please check your connection or tap below.";
        if (action) action.style.display = "block";
      }
    }, 55000);
  }
}

function hideColdStartOverlay() {
  if (coldStartTimer) {
    clearTimeout(coldStartTimer);
    coldStartTimer = null;
  }
  if (coldStartTimeoutTimer) {
    clearTimeout(coldStartTimeoutTimer);
    coldStartTimeoutTimer = null;
  }
  const overlay = document.getElementById("render-coldstart-overlay");
  if (overlay && overlay.style.display === "flex") {
    overlay.style.transition = "opacity 0.25s ease-out";
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.style.display = "none";
      overlay.style.opacity = "1";
    }, 250);
  }
}

function retryColdStartRequest() {
  hideColdStartOverlay();
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

  const controller = new AbortController();
  // Allow up to 65s for Render free-tier instance wake-up
  const timeoutMs = options.timeout || 65000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If request takes > 1.8s (typical of Render sleeping), display reassuring branded wake screen
  coldStartTimer = setTimeout(() => {
    showColdStartOverlay();
  }, 1800);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    hideColdStartOverlay();
    isServerWarm = true;

    if (res.status === 401) {
      logout();
      alert("Session expired or invalid credentials. Please sign in again.");
      throw new Error("Unauthorized (401)");
    }

    if (res.status === 403) {
      const data = await res.json().catch(() => ({}));
      const msg = data.detail || "Your account does not have permission or is pending approval.";
      alert(msg);
      throw new Error(msg);
    }

    if (res.status === 422) {
      const data = await res.json().catch(() => ({}));
      const msg = data.detail ? (Array.isArray(data.detail) ? data.detail.map(d => d.msg || JSON.stringify(d)).join(", ") : JSON.stringify(data.detail)) : "Validation error";
      alert("Input validation error: " + msg);
      throw new Error(msg);
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.detail || `Server error (HTTP ${res.status})`;
      alert(msg);
      throw new Error(msg);
    }

    // Success - if queue has items and we are online, trigger background drain
    if (getOfflineQueue().length > 0) {
      setTimeout(drainOfflineQueue, 100);
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    hideColdStartOverlay();
    if (err.name === "AbortError") {
      alert(`Network Timeout: The operation took longer than 60s to reach the cloud server.\nPlease tap Retry or check your network.`);
      throw new Error(`Timeout on ${endpoint}`);
    }

    // If it was an intentional HTTP error thrown above, re-throw it
    if (err.message && (err.message.includes("401") || err.message.includes("pending approval") || err.message.includes("Validation error") || err.message.includes("Access forbidden"))) {
      throw err;
    }

    // Network connection failed (TypeError: Failed to fetch / offline)
    if (method === "GET") {
      console.warn("VASTRENIX: Server offline or unreachable. Providing local data preview for:", endpoint);
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
      alert(`Network offline or unreachable. Your operation has been saved locally and queued for automatic sync when connectivity resumes.`);
      return handleOfflineMock(endpoint, { ...options, headers: { ...headers, "X-Idempotency-Key": idempotency_key } });
    }

    // For POST / PUT / DELETE mutations, NEVER silently mock without notifying user
    alert(`Network Error: Unable to reach VASTRENIX server at ${getBaseServerUrl()}.\nPlease check your connection or configure Server URL in Settings.`);
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

// Tab Switching
function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".nav-link").forEach(el => el.classList.remove("active"));
  const activeEl = document.querySelector(`[data-tab="${tab}"]`);
  if (activeEl) activeEl.classList.add("active");
  renderCurrentTab();
  updateOfflineIndicator();
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
            <h3 style="font-size: 15px; font-weight: 700; color: #8A5A1B; margin: 0;">Pending Staff Signups Requiring Approval (${pendingStaff.length})</h3>
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
                <button class="btn btn-sm btn-primary" onclick="approveStaffMember(${s.membership_id}, '${s.full_name.replace(/'/g, "\\'")}')">✓ Approve Staff</button>
                <button class="btn btn-sm btn-secondary" onclick="rejectStaffMember(${s.membership_id})">✕ Reject</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="grid-cards" style="margin-bottom: 24px;">
      <div class="stat-card stagger-1">
        <div class="stat-label">${t.today_sales}</div>
        <div class="stat-value" id="dash-val-sales" style="color: var(--teal);">₹0.00</div>
        <div class="stat-meta"><span id="dash-val-orders">0</span> transactions completed</div>
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
          <button class="btn btn-sm btn-secondary" onclick="promptAdjustStock(${it.variant_id})">Adjust</button>
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
        <h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">Garment Inventory & Warehouse Stock</h2>
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
          <h3 style="font-size: 16px; font-weight: 700; color: var(--navy); margin-bottom: 6px;">Garment Catalog is Empty</h3>
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
            <input type="text" id="inventory-search-input" class="form-input" placeholder="Search by garment name, SKU, or fabric..." oninput="filterInventoryCatalog(this.value)" style="padding-left: 36px; font-size: 13px;">
            <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; opacity: 0.5;">🔍</span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Fabric</th>
                <th>SKU</th>
                <th>Size</th>
                <th>Color</th>
                <th>Rack Location</th>
                <th>On-Hand</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Status</th>
                <th>Adjust</th>
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
        <h2 style="font-size: 20px; font-weight: 800; color: var(--navy); margin-bottom: 8px;">Cash Register Shift Required</h2>
        <p style="font-size: 13.5px; color: var(--text-muted); line-height: 1.5; margin-bottom: 24px;">
          To begin processing retail sales with tamper-proof financial reconciliation, please count and enter the opening cash float in the drawer.
        </p>

        <form onsubmit="submitOpenShift(event)" style="text-align: left;">
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" style="font-weight: 700;">Opening Cash Float (₹)</label>
            <input type="number" step="0.01" id="shift-open-float" class="form-input" required value="2000.00" placeholder="e.g. 2000.00" style="font-size: 16px; font-weight: 700;">
            <small style="color: var(--text-muted); font-size: 11.5px; display: block; margin-top: 4px;">Initial physical currency & coins placed into the store till.</small>
          </div>
          <div class="form-group" style="margin-bottom: 22px;">
            <label class="form-label">Shift Notes / Register ID (Optional)</label>
            <input type="text" id="shift-open-notes" class="form-input" placeholder="e.g. Morning Counter Shift #1">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; padding: 13px; font-weight: 700; font-size: 14.5px;">
            Open Shift & Unlock Counter
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
        <span>Store Counter: <b>${state.storeName || state.business.name}</b></span>
        <span>•</span>
        <span>Cashier: <b>${state.user.full_name} (${state.business.role})</b></span>
      </div>

      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="background: #E8F4F0; border: 1px solid var(--teal-light); border-radius: 20px; padding: 4px 12px; font-size: 12px; color: var(--teal); font-weight: 700; display: flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--teal); display: inline-block;"></span>
          Shift #${state.currentShift.id} Active • Float: ₹${Number(state.currentShift.opening_cash).toFixed(2)}
        </div>
        <button class="btn btn-sm btn-outline" style="border-color: var(--coral); color: var(--coral); font-weight: 700;" onclick="openCloseShiftModal()">
          Close Shift
        </button>
      </div>
    </div>

    <div class="pos-container">
      <!-- Left: Catalog & Size Selector -->
      <div class="pos-catalog">
        <div style="display: flex; gap: 10px; margin-bottom: 14px;">
          <div style="position: relative; flex: 1;">
            <input type="text" id="pos-search" class="form-input" placeholder="Scan barcode or search name/fabric (Press Enter or F2)..." oninput="filterPOSCatalog(this.value)" onkeydown="handlePOSSearchKeyDown(event)" style="padding-right: 40px;">
            <span style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 16px; opacity: 0.5;">🔍</span>
          </div>
          <button class="btn btn-secondary" onclick="document.getElementById('pos-search').focus();" title="Keyboard Shortcut: F2">
            F2 Focus
          </button>
        </div>

        <div style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px;" id="pos-items-grid">
          ${renderPOSItems(state.products)}
        </div>
      </div>

      <!-- Right: POS Cart & Checkout -->
      <div class="pos-cart">
        <div style="padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
          <h3 style="font-size: 15px; font-weight: 700; color: var(--navy); margin: 0;">Sale Cart</h3>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm btn-secondary" onclick="clearCart()" title="Keyboard Shortcut: F8">Clear (F8)</button>
          </div>
        </div>

        <div class="cart-items" id="cart-items-list">
          ${renderCartItems()}
        </div>

        <div class="cart-summary" style="padding: 16px 18px;">
          <!-- Customer info -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
            <input type="text" id="pos-cust-name" class="form-input" placeholder="Customer Name (optional)" style="font-size: 12px; padding: 6px 10px;">
            <input type="text" id="pos-cust-phone" class="form-input" placeholder="Mobile No. (optional)" style="font-size: 12px; padding: 6px 10px;">
          </div>

          <!-- Theme selector -->
          <div class="form-group" style="margin-bottom: 10px;">
            <label class="form-label" style="font-size: 11.5px; font-weight: 700;">Invoice Theme (6 Configurable Themes)</label>
            <select id="pos-theme-select" class="form-select" style="font-size: 12.5px;">
              <option value="CLASSIC_GST">1. Classic GST (HSN/Tax breakdown)</option>
              <option value="MODERN_MINIMAL">2. Modern Minimal (Editorial typography)</option>
              <option value="PREMIUM_BOUTIQUE" selected>3. Premium Boutique (Luxury Atelier)</option>
              <option value="WHOLESALE_DEALER">4. Wholesale & Dealer (Size matrix)</option>
              <option value="COMPACT_THERMAL">5. Compact Thermal (80mm POS Roll)</option>
              <option value="INTERNATIONAL_COMMERCIAL">6. International Commercial (Export)</option>
            </select>
          </div>

          <!-- Payment Mode -->
          <div class="form-group" style="margin-bottom: 10px;">
            <label class="form-label" style="font-size: 11.5px; font-weight: 700;">Payment Mode</label>
            <select id="pos-payment-mode" class="form-select" style="font-size: 12.5px;" onchange="onPaymentModeChange(this.value)">
              <option value="UPI">UPI (QR Scan / Instant)</option>
              <option value="CASH">Cash (Drawer Till)</option>
              <option value="CARD">Debit / Credit Card</option>
              <option value="SPLIT">Split Payment</option>
              <option value="CREDIT">Store Credit / Khata</option>
            </select>
          </div>

          <!-- UPI Verification Section -->
          <div id="pos-upi-box" style="background: #F0F9F8; border: 1px solid var(--teal-light); border-radius: var(--radius-sm); padding: 10px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 11.5px; font-weight: 700; color: var(--teal); text-transform: uppercase;">UPI Instant Pay</span>
              <span id="pos-upi-amount-display" style="font-size: 13px; font-weight: 800; color: var(--navy);">₹0.00</span>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
              UPI VPA: <b>${(state.business.name || 'vastrenix').toLowerCase().replace(/[^a-z0-9]/g, '')}@upi</b>
            </div>
            <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 11.5px; font-weight: 600; color: var(--navy); cursor: pointer; user-select: none;">
              <input type="checkbox" id="pos-upi-verified" style="margin-top: 2px;">
              <span>Mark as verified (Payment received on Soundbox / App)</span>
            </label>
          </div>

          <!-- Cart Totals & Discount -->
          <div class="cart-row">
            <span>Subtotal:</span>
            <span id="pos-subtotal">₹0.00</span>
          </div>

          <div class="cart-row" style="align-items: center;">
            <span style="display: flex; align-items: center; gap: 4px;">
              Discount:
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
            <span>GST (5%):</span>
            <span id="pos-tax">₹0.00</span>
          </div>

          <div class="cart-total-row">
            <span>Grand Total:</span>
            <span id="pos-total" style="font-size: 18px; font-weight: 800; color: var(--navy);">₹0.00</span>
          </div>

          <button id="pos-complete-sale-btn" class="btn btn-primary" style="width: 100%; margin-top: 14px; padding: 13px; font-weight: 700; font-size: 14px;" onclick="completePOSSale()">
            Complete Sale & Generate Invoice (F4)
          </button>
        </div>
      </div>
    </div>
  `;
  updateCartTotals();
}

function onPaymentModeChange(mode) {
  const upiBox = document.getElementById("pos-upi-box");
  if (upiBox) {
    upiBox.style.display = (mode === "UPI") ? "block" : "none";
  }
}

function handlePOSSearchKeyDown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const query = e.target.value.trim().toLowerCase();
    if (!query) return;

    // Direct exact match on SKU or Barcode
    for (const p of state.products) {
      for (const v of p.variants) {
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

    // Partial search match if only one product/variant matches
    const matches = [];
    state.products.forEach(p => {
      p.variants.forEach(v => {
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

const debouncedFilterPOSCatalog = debounce((query) => {
  const container = document.getElementById("pos-items-grid");
  if (!container) return;
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    container.innerHTML = renderPOSItems(state.products);
    return;
  }
  const filtered = [];
  state.products.forEach(p => {
    const matchingVariants = p.variants.filter(v => 
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
}, 250);

function filterPOSCatalog(query) {
  debouncedFilterPOSCatalog(query);
}

function renderPOSItems(products) {
  let html = "";
  products.forEach(p => {
    p.variants.forEach(v => {
      html += `
        <div style="background: #FAF8F3; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
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
            <button class="btn btn-sm btn-navy" ${v.available <= 0 ? 'disabled' : ''} onclick="addToCart(${v.id}, '${p.name.replace(/'/g, "\\'")}', '${v.size}', '${v.color}', ${v.retail_price}, '${v.sku}')">
              + Add
            </button>
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
    state.cart.push({ variantId, name, size, color, price, sku, quantity: 1 });
  }
  document.getElementById("cart-items-list").innerHTML = renderCartItems();
  updateCartTotals();
}

function renderCartItems() {
  if (state.cart.length === 0) {
    return `<div style="text-align: center; color: var(--text-muted); padding: 40px 10px; font-size: 13px;">Cart is empty. Scan barcodes or click '+ Add' from catalog.</div>`;
  }
  return state.cart.map((item, idx) => `
    <div class="cart-item cart-item-enter" id="cart-item-row-${idx}" style="padding: 10px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
      <div style="flex: 1; padding-right: 8px;">
        <div style="font-weight: 700; font-size: 13px; color: var(--navy);">${item.name}</div>
        <div style="font-size: 11.5px; color: var(--text-muted);">${item.size} / ${item.color} • <b style="color: var(--navy);">₹${item.price.toFixed(2)}</b></div>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <button type="button" style="width: 34px; height: 34px; border-radius: 6px; border: 1px solid var(--border); background: #fff; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="stepCartQty(${idx}, -1)">-</button>
        <input type="number" min="1" value="${item.quantity}" style="width: 44px; height: 34px; border: 1px solid var(--border); border-radius: 6px; text-align: center; font-weight: 700; font-size: 13px;" onchange="updateCartQty(${idx}, this.value)">
        <button type="button" style="width: 34px; height: 34px; border-radius: 6px; border: 1px solid var(--border); background: #fff; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="stepCartQty(${idx}, 1)">+</button>
        <button type="button" style="width: 30px; height: 30px; border: none; background: none; color: var(--coral); cursor: pointer; font-size: 18px; margin-left: 2px;" onclick="removeFromCart(${idx})" title="Remove item">&times;</button>
      </div>
    </div>
  `).join('');
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
  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountInput = document.getElementById("pos-discount");
  const discountVal = discountInput ? Math.max(0, parseFloat(discountInput.value) || 0) : 0;
  const total = Math.max(0, subtotal - discountVal);

  const subEl = document.getElementById("pos-subtotal");
  if (subEl) subEl.textContent = `₹${subtotal.toFixed(2)}`;

  const totalEl = document.getElementById("pos-cart-total");
  if (totalEl) {
    const currentNum = parseFloat(totalEl.textContent.replace(/[^0-9.]/g, '')) || 0;
    animateNumber(totalEl, currentNum, total, 450, "₹", "", 2);
  }

  const upiEl = document.getElementById("pos-upi-amount-display");
  if (upiEl) upiEl.textContent = `₹${total.toFixed(2)}`;
}

async function completePOSSale() {
  if (state.cart.length === 0) return alert("Please add at least one item to the cart");

  const paymentMode = document.getElementById("pos-payment-mode").value;
  if (paymentMode === "UPI") {
    const verified = document.getElementById("pos-upi-verified");
    if (!verified || !verified.checked) {
      return alert("Manual UPI Verification Required: Please verify payment received on the Soundbox or Bank App and check the verification box before issuing invoice.");
    }
  }

  const theme = document.getElementById("pos-theme-select").value;
  const discountInput = document.getElementById("pos-discount");
  const discountVal = discountInput ? Math.max(0, parseFloat(discountInput.value) || 0) : 0;
  const customerName = document.getElementById("pos-cust-name") ? document.getElementById("pos-cust-name").value.trim() : "Walk-in Retail Client";
  const customerPhone = document.getElementById("pos-cust-phone") ? document.getElementById("pos-cust-phone").value.trim() : "";

  // Unique client idempotency key to prevent double sales on double-tap or retries
  const idempotencyKey = "POS-IDEMP-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);

  const payload = {
    idempotency_key: idempotencyKey,
    customer_name: customerName || "Walk-in Retail Client",
    customer_phone: customerPhone || undefined,
    items: state.cart.map(c => ({
      variant_id: c.variantId,
      product_name: c.name,
      size: c.size,
      color: c.color,
      sku: c.sku,
      quantity: c.quantity,
      unit_price: c.price,
      tax_rate: 5.0
    })),
    discount_amount: discountVal,
    payment_mode: paymentMode,
    invoice_theme: theme
  };

  const btn = document.getElementById("pos-complete-sale-btn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; display: inline-block; margin-right: 8px;"></span> Posting Authoritative Invoice...`;
  }

  try {
    const res = await api("/pos/sale", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload)
    });

    if (res && res.invoice_id) {
      triggerHaptic("success");
      if (btn) {
        btn.style.background = "var(--teal)";
        btn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 6px;">
            <path class="draw-check" d="M20 6L9 17l-5-5"/>
          </svg>
          Sale Confirmed & Saved!
        `;
      }

      await new Promise(r => setTimeout(r, 450));

      if (res.pdf_status === "FAILED") {
        alert(`Invoice ${res.invoice_number} saved successfully, but background PDF generation failed or timed out.\nYou can click 'Retry PDF' on the invoice history tab.`);
      } else {
        openInvoicePdf(res.invoice_id, res.invoice_number);
      }
      clearCart();
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
    alert(`PDF for ${invoiceNumber} generated successfully! Opening download...`);
    openInvoicePdf(id, invoiceNumber);
    renderInvoices();
  }
}

// Render Invoices List
async function renderInvoices() {
  const container = document.getElementById("tab-content");
  container.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div class="skeleton skeleton-text" style="width: 280px; height: 24px; margin-bottom: 10px;"></div>
      <div class="skeleton skeleton-text" style="width: 380px; height: 14px;"></div>
    </div>
    <div class="panel">
      <div class="table-responsive">
        <table class="data-table"><tbody>${getSkeletonTableRowsHTML(8, 4)}</tbody></table>
      </div>
    </div>
  `;
  const invoices = await api("/pos/invoices");
  if (!invoices) return;

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
        <h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">Authoritative Invoices & Billing Records</h2>
        <p style="color: var(--text-muted); font-size: 13px;">Store: <b>${state.storeName || state.business.name}</b> • View posted invoices and download PDFs.</p>
      </div>
      <button class="btn btn-primary" onclick="switchTab('pos')">+ New POS Sale</button>
    </div>

    <!-- Live Theme Picker Carousel -->
    <div style="margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 13.5px; font-weight: 800; color: var(--navy);">6 Invoice Themes (Swipe to Preview & Select Default)</span>
        <span style="font-size: 11.5px; color: var(--teal); font-weight: 600;">Active: <b>${currentDefaultTheme}</b></span>
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
              ${th.id === currentDefaultTheme ? '✓ Store Default' : 'Tap to set default'}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="panel">
      ${invoices.length === 0 ? `
        <div style="text-align: center; padding: 48px 16px;">
          <div style="font-size: 38px; margin-bottom: 10px;">🧾</div>
          <h3 style="font-size: 16px; font-weight: 700; color: var(--navy); margin-bottom: 6px;">No Invoices Posted Yet</h3>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 18px;">
            Invoices are immutable business records. Complete your first garment sale on the POS Till to generate a GST invoice with instant PDF download.
          </p>
          <button class="btn btn-primary" onclick="switchTab('pos')">Open POS Billing Till ➔</button>
        </div>
      ` : `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Theme</th>
                <th>Total Amount</th>
                <th>Paid</th>
                <th>Payment Mode</th>
                <th>Status</th>
                <th>Actions</th>
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
                    <button onclick="openInvoicePdf(${inv.id}, '${inv.invoice_number}')" class="btn btn-sm btn-navy">PDF</button>
                    <button onclick="shareInvoicePdf(${inv.id}, '${inv.invoice_number}')" class="btn btn-sm btn-secondary">Share</button>
                    <button onclick="retryInvoicePdf(${inv.id}, '${inv.invoice_number}')" class="btn btn-sm btn-outline" title="Re-render PDF">Retry</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
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
                <button class="btn btn-sm btn-secondary" onclick="rejectStaffMember(${s.membership_id})">✕ Reject</button>
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

function switchTab(tab) {
  state.activeTab = tab;
  // Update desktop sidebar
  document.querySelectorAll(".nav-link").forEach(el => {
    if (el.getAttribute("data-tab") === tab) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });
  // Update mobile bottom nav
  document.querySelectorAll(".mobile-nav-item").forEach(el => {
    if (el.getAttribute("data-tab") === tab) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });
  // Close mobile drawer if open
  closeMobileDrawer();
  renderCurrentTab();
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
  document.getElementById("modal-add-product").classList.add("active");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

async function submitAddProduct(event) {
  event.preventDefault();
  const name = document.getElementById("prod-name").value;
  const fabric = document.getElementById("prod-fabric").value;
  const price = parseFloat(document.getElementById("prod-price").value);
  const cost = parseFloat(document.getElementById("prod-cost").value);
  const size = document.getElementById("prod-size").value;
  const color = document.getElementById("prod-color").value;
  const stock = parseInt(document.getElementById("prod-stock").value, 10);

  const sku = `${name.replace(/\s+/g, '-').toUpperCase().slice(0, 8)}-${size}-${color.slice(0, 3).toUpperCase()}`;

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

  alert("Product created successfully!");
  closeModal("modal-add-product");
  renderInventory();
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
  openServerSettingsModal();
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
      <!-- Render Cold-Start Grace Screen (Part 2) -->
      <div id="render-coldstart-overlay" class="coldstart-overlay" style="display: none;">
        <div class="coldstart-card">
          <div class="coldstart-logo-pulse">
            <img src="static/brand/vastrenix-icon.svg" alt="VASTRENIX" style="width: 58px; height: 58px;">
          </div>
          <h2 id="coldstart-title" class="coldstart-title">Waking up your store's cloud server…</h2>
          <p id="coldstart-subline" class="coldstart-subline">
            This happens after a few minutes of inactivity on cloud infrastructure — it'll be fast after this.
          </p>
          <div class="coldstart-progress-bar">
            <div id="coldstart-progress-fill" class="coldstart-progress-fill"></div>
          </div>
          <div id="coldstart-timeout-action" style="display: none; margin-top: 18px;">
            <button class="btn btn-primary" onclick="retryColdStartRequest()" style="padding: 10px 20px; font-size: 13px;">
              ↻ Retry Server Connection
            </button>
          </div>
        </div>
      </div>

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
    <!-- Render Cold-Start Grace Screen (Part 2) -->
    <div id="render-coldstart-overlay" class="coldstart-overlay" style="display: none;">
      <div class="coldstart-card">
        <div class="coldstart-logo-pulse">
          <img src="static/brand/vastrenix-icon.svg" alt="VASTRENIX" style="width: 58px; height: 58px;">
        </div>
        <h2 id="coldstart-title" class="coldstart-title">Waking up your store's cloud server…</h2>
        <p id="coldstart-subline" class="coldstart-subline">
          This happens after a few minutes of inactivity on cloud infrastructure — it'll be fast after this.
        </p>
        <div class="coldstart-progress-bar">
          <div id="coldstart-progress-fill" class="coldstart-progress-fill"></div>
        </div>
        <div id="coldstart-timeout-action" style="display: none; margin-top: 18px;">
          <button class="btn btn-primary" onclick="retryColdStartRequest()" style="padding: 10px 20px; font-size: 13px;">
            ↻ Retry Server Connection
          </button>
        </div>
      </div>
    </div>

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
              <button class="lang-compact-chip" onclick="cycleLanguage()" title="Switch Language (English / हिन्दी / ગુજરાતી)">
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
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Retail Price (₹)</label>
              <input type="number" step="0.01" id="prod-price" class="form-input" required placeholder="3490.00">
            </div>
            <div class="form-group">
              <label class="form-label">Purchase Cost (₹)</label>
              <input type="number" step="0.01" id="prod-cost" class="form-input" required placeholder="1400.00">
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
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
        <a class="mobile-drawer-link active" data-tab="dashboard" onclick="drawerNav('dashboard')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          </div>
          <span class="drawer-label">${t.dashboard}</span>
        </a>
        <a class="mobile-drawer-link" data-tab="inventory" onclick="drawerNav('inventory')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </div>
          <span class="drawer-label">${t.inventory}</span>
        </a>
        <a class="mobile-drawer-link" data-tab="pos" onclick="drawerNav('pos')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line><circle cx="6" cy="15" r="1"></circle><circle cx="10" cy="15" r="1"></circle><circle cx="14" cy="15" r="1"></circle></svg>
          </div>
          <span class="drawer-label">${t.pos}</span>
        </a>
        <a class="mobile-drawer-link" data-tab="invoices" onclick="drawerNav('invoices')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </div>
          <span class="drawer-label">${t.invoices}</span>
        </a>
        ${(!state.isStaff || state.business.role !== 'CASHIER') ? `
        <a class="mobile-drawer-link" data-tab="expenses" onclick="drawerNav('expenses')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          </div>
          <span class="drawer-label">${t.expenses}</span>
        </a>
        <a class="mobile-drawer-link" data-tab="dealers" onclick="drawerNav('dealers')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          </div>
          <span class="drawer-label">${t.dealers}</span>
        </a>
        <a class="mobile-drawer-link" data-tab="users" onclick="drawerNav('users')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <span class="drawer-label">${t.team}</span>
        </a>
        ` : ''}
        <a class="mobile-drawer-link" data-tab="flowcharts" onclick="drawerNav('flowcharts')">
          <div class="mobile-drawer-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><path d="M10 6.5h4"></path><path d="M17.5 10v4"></path></svg>
          </div>
          <span class="drawer-label">${t.flowcharts}</span>
        </a>
      </div>

      <div style="padding: 14px; border-top: 1px solid rgba(255,255,255,0.08); margin-top: auto;">
        <button onclick="logout()" class="btn btn-secondary" style="width: 100%; border-color: rgba(255,255,255,0.2); color: #FAF8F3;">${t.logout}</button>
      </div>
    </aside>

    <!-- Mobile Bottom Navigation Bar (Max 5 Actions, Crisp Icons & Clean Non-Overlapping Labels) -->
    <nav class="mobile-bottom-nav">
      <a class="mobile-nav-btn active" data-tab="dashboard" onclick="switchTab('dashboard')">
        <div class="mobile-nav-icon-pill">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        </div>
        <span>${t.dashboard}</span>
      </a>
      <a class="mobile-nav-btn" data-tab="inventory" onclick="switchTab('inventory')">
        <div class="mobile-nav-icon-pill">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        </div>
        <span>${t.inventory}</span>
      </a>
      <a class="mobile-nav-btn" data-tab="pos" onclick="switchTab('pos')">
        <div class="mobile-nav-icon-pill">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line><circle cx="6" cy="15" r="1"></circle><circle cx="10" cy="15" r="1"></circle><circle cx="14" cy="15" r="1"></circle></svg>
        </div>
        <span>${t.pos}</span>
      </a>
      ${(!state.isStaff || state.business.role !== 'CASHIER') ? `
      <a class="mobile-nav-btn" data-tab="expenses" onclick="switchTab('expenses')">
        <div class="mobile-nav-icon-pill">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
        </div>
        <span>${t.expenses}</span>
      </a>
      <a class="mobile-nav-btn" data-tab="users" onclick="switchTab('users')">
        <div class="mobile-nav-icon-pill">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </div>
        <span>${t.team}</span>
      </a>
      ` : `
      <a class="mobile-nav-btn" data-tab="invoices" onclick="switchTab('invoices')">
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

if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(renderApp, 1);
} else {
  window.addEventListener("DOMContentLoaded", () => {
    renderApp();
  });
}
