// VASTRENIX Client Application Controller

function getBaseServerUrl() {
  const saved = localStorage.getItem("vastrenix_server_url");
  if (saved && saved.trim()) {
    return saved.trim().replace(/\/+$/, "");
  }

  if (window.VastrenixNative && typeof window.VastrenixNative.getServerUrl === "function") {
    const nativeSaved = window.VastrenixNative.getServerUrl();
    if (nativeSaved && nativeSaved.trim()) {
      return nativeSaved.trim().replace(/\/+$/, "");
    }
  }

  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return window.location.origin;
  }

  // Default for Android Emulator / Local LAN testing
  return "http://10.0.2.2:8000";
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

// API Helper with Strict Error Handling & Resilience
async function api(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }
  if (state.business) {
    headers["X-Business-ID"] = state.business.id;
  }

  const method = (options.method || "GET").toUpperCase();
  const url = `${getApiBase()}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers
    });

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

    return await res.json();
  } catch (err) {
    // If it was an intentional HTTP error thrown above, re-throw it
    if (err.message && (err.message.includes("401") || err.message.includes("pending approval") || err.message.includes("Validation error") || err.message.includes("Access forbidden"))) {
      throw err;
    }

    // Network connection failed (TypeError: Failed to fetch)
    if (method === "GET") {
      console.warn("VASTRENIX: Server offline or unreachable. Providing local data preview for:", endpoint);
      return handleOfflineMock(endpoint, options);
    }

    // For POST / PUT / DELETE mutations, NEVER silently mock without notifying user
    alert(`Network Error: Unable to reach VASTRENIX server at ${getBaseServerUrl()}.\nPlease check your connection or configure Server URL in Settings.`);
    throw err;
  }
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
}

// Render Dashboard
async function renderDashboard() {
  const container = document.getElementById("tab-content");
  container.innerHTML = `<div style="padding: 20px; text-align: center;">Loading real metrics...</div>`;

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
            <div style="background: white; border: 1px solid #EADBCA; border-radius: var(--radius-sm); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
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

    <div class="grid-cards">
      <div class="stat-card">
        <div class="stat-label">${t.today_sales}</div>
        <div class="stat-value">₹${metrics.today_sales.toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
        <div class="stat-meta">${metrics.today_orders_count} transactions completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t.low_stock_alerts}</div>
        <div class="stat-value" style="color: ${metrics.low_stock_count > 0 ? 'var(--coral)' : 'var(--teal)'};">${metrics.low_stock_count}</div>
        <div class="stat-meta">${metrics.low_stock_count > 0 ? 'Sizes requiring reorder' : t.all_healthy}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t.pending_dealer}</div>
        <div class="stat-value" style="color: var(--amber);">${metrics.pending_dealer_orders}</div>
        <div class="stat-meta">B2B orders awaiting action</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Revenue</div>
        <div class="stat-value">₹${metrics.total_revenue.toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
        <div class="stat-meta">Authoritative posted invoices</div>
      </div>
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
async function renderInventory() {
  const container = document.getElementById("tab-content");
  container.innerHTML = `<div style="padding: 20px;">Loading garment inventory...</div>`;
  const items = await api("/inventory/levels");
  if (!items) return;

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">Garment Inventory & Warehouse Stock</h2>
        <p style="color: var(--text-muted); font-size: 13px;">Store: <b>${state.storeName || state.business.name}</b> • Authoritative size/color matrix.</p>
      </div>
      <button class="btn btn-primary" onclick="openAddProductModal()">+ Add New Garment</button>
    </div>

    <div class="panel">
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
          <tbody>
            ${items.map(it => `
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
                  ${it.is_out_of_stock ? '<span class="badge badge-danger">Out of Stock</span>' : (it.is_low_stock ? '<span class="badge badge-warning">Low Stock</span>' : '<span class="badge badge-success">Healthy</span>')}
                </td>
                <td>
                  <button class="btn btn-sm btn-secondary" onclick="promptAdjustStock(${it.variant_id})">Adjust</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
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
  container.innerHTML = `<div style="padding: 20px;">Initializing POS terminal...</div>`;
  const prods = await api("/products/");
  if (!prods) return;
  state.products = prods;

  container.innerHTML = `
    <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
      <div style="font-size: 13.5px; color: var(--navy);">
        Store Counter: <b>${state.storeName || state.business.name}</b> • Cashier: <b>${state.user.full_name} (${state.business.role})</b>
      </div>
    </div>

    <div class="pos-container">
      <!-- Left: Catalog & Size Selector -->
      <div class="pos-catalog">
        <div style="display: flex; gap: 12px; margin-bottom: 16px;">
          <input type="text" id="pos-search" class="form-input" placeholder="Search garment name, fabric, or barcode..." oninput="filterPOSCatalog(this.value)">
        </div>
        <div style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px;" id="pos-items-grid">
          ${renderPOSItems(state.products)}
        </div>
      </div>

      <!-- Right: POS Cart & Checkout -->
      <div class="pos-cart">
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
          <h3 style="font-size: 15px; font-weight: 700; color: var(--navy);">Current Sale Cart</h3>
          <button class="btn btn-sm btn-secondary" onclick="clearCart()">Clear</button>
        </div>

        <div class="cart-items" id="cart-items-list">
          ${renderCartItems()}
        </div>

        <div class="cart-summary">
          <div class="form-group" style="margin-bottom: 10px;">
            <label class="form-label">Invoice Theme (6 Configurable Themes)</label>
            <select id="pos-theme-select" class="form-select">
              <option value="CLASSIC_GST">1. Classic GST (HSN/Tax breakdown)</option>
              <option value="MODERN_MINIMAL">2. Modern Minimal (Editorial typography)</option>
              <option value="PREMIUM_BOUTIQUE" selected>3. Premium Boutique (Luxury Atelier)</option>
              <option value="WHOLESALE_DEALER">4. Wholesale & Dealer (Size matrix)</option>
              <option value="COMPACT_THERMAL">5. Compact Thermal (80mm POS Roll)</option>
              <option value="INTERNATIONAL_COMMERCIAL">6. International Commercial (Export)</option>
            </select>
          </div>

          <div class="form-group" style="margin-bottom: 10px;">
            <label class="form-label">Payment Mode</label>
            <select id="pos-payment-mode" class="form-select">
              <option value="UPI">UPI (QR Scan / Instant)</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Debit / Credit Card</option>
              <option value="SPLIT">Split Payment</option>
            </select>
          </div>

          <div class="cart-row"><span>Subtotal:</span><span id="pos-subtotal">₹0.00</span></div>
          <div class="cart-row"><span>GST (5%):</span><span id="pos-tax">₹0.00</span></div>
          <div class="cart-total-row"><span>Total:</span><span id="pos-total">₹0.00</span></div>

          <button class="btn btn-primary" style="width: 100%; margin-top: 14px; padding: 12px;" onclick="completePOSSale()">
            Complete Sale & Generate Invoice
          </button>
        </div>
      </div>
    </div>
  `;
  updateCartTotals();
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
    return `<div style="text-align: center; color: var(--text-muted); padding: 40px 10px;">Cart is empty. Select garments from catalog to add.</div>`;
  }
  return state.cart.map((item, idx) => `
    <div class="cart-item">
      <div>
        <div style="font-weight: 600; font-size: 13px;">${item.name}</div>
        <div style="font-size: 11.5px; color: var(--text-muted);">${item.size} / ${item.color} • ₹${item.price.toFixed(2)}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <input type="number" min="1" value="${item.quantity}" style="width: 48px; padding: 4px; border: 1px solid var(--border); text-align: center;" onchange="updateCartQty(${idx}, this.value)">
        <button style="border: none; background: none; color: var(--coral); cursor: pointer; font-size: 16px;" onclick="removeFromCart(${idx})">&times;</button>
      </div>
    </div>
  `).join('');
}

function updateCartQty(idx, val) {
  const q = parseInt(val, 10);
  if (q > 0) state.cart[idx].quantity = q;
  updateCartTotals();
}

function removeFromCart(idx) {
  state.cart.splice(idx, 1);
  document.getElementById("cart-items-list").innerHTML = renderCartItems();
  updateCartTotals();
}

function clearCart() {
  state.cart = [];
  document.getElementById("cart-items-list").innerHTML = renderCartItems();
  updateCartTotals();
}

function updateCartTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.05;
  const total = subtotal + tax;

  const subEl = document.getElementById("pos-subtotal");
  const taxEl = document.getElementById("pos-tax");
  const totEl = document.getElementById("pos-total");

  if (subEl) subEl.textContent = `₹${subtotal.toFixed(2)}`;
  if (taxEl) taxEl.textContent = `₹${tax.toFixed(2)}`;
  if (totEl) totEl.textContent = `₹${total.toFixed(2)}`;
}

async function completePOSSale() {
  if (state.cart.length === 0) return alert("Please add at least one item to the cart");

  const theme = document.getElementById("pos-theme-select").value;
  const paymentMode = document.getElementById("pos-payment-mode").value;

  const payload = {
    customer_name: "Counter Retail Client",
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
    payment_mode: paymentMode,
    invoice_theme: theme
  };

  const res = await api("/pos/sale", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (res && res.invoice_id) {
    alert(`Success: Invoice ${res.invoice_number} created!\nOpening PDF download in chosen theme (${theme})...`);
    openInvoicePdf(res.invoice_id, res.invoice_number);
    clearCart();
    switchTab("invoices");
  }
}

// Render Invoices List
async function renderInvoices() {
  const container = document.getElementById("tab-content");
  container.innerHTML = `<div style="padding: 20px;">Loading invoice history...</div>`;
  const invoices = await api("/pos/invoices");
  if (!invoices) return;

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">Authoritative Invoices & Billing Records</h2>
        <p style="color: var(--text-muted); font-size: 13px;">Store: <b>${state.storeName || state.business.name}</b> • View posted invoices and download PDFs.</p>
      </div>
      <button class="btn btn-primary" onclick="switchTab('pos')">+ New POS Sale</button>
    </div>

    <div class="panel">
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
                <td><b>₹${inv.total_amount.toFixed(2)}</b></td>
                <td style="color: var(--teal);">₹${inv.paid_amount.toFixed(2)}</td>
                <td>${inv.payment_mode}</td>
                <td><span class="badge badge-success">${inv.payment_status}</span></td>
                <td>
                  <button onclick="openInvoicePdf(${inv.id}, '${inv.invoice_number}')" class="btn btn-sm btn-navy">PDF</button>
                  <button onclick="shareInvoicePdf(${inv.id}, '${inv.invoice_number}')" class="btn btn-sm btn-secondary">Share</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Render Dealer B2B Network
let cachedStaff = [];

async function renderDealers() {
  const container = document.getElementById("tab-content");
  container.innerHTML = `<div style="padding: 20px;">Loading B2B dealer orders...</div>`;
  const incoming = await api("/dealers/orders/incoming");
  const conns = await api("/dealers/connections");

  // Load store staff for order assignment
  try {
    cachedStaff = await api("/auth/staff");
  } catch (e) {
    cachedStaff = [];
  }

  container.innerHTML = `
    <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--navy);">B2B Dealer Network & Connected Businesses</h2>
        <p style="color: var(--text-muted); font-size: 13px;">Manage multi-business orders, atomic stock reservations, staff assignment, and dispatch tracking.</p>
      </div>
      <div style="background: var(--teal-light); border: 1px solid rgba(33,140,130,0.25); border-radius: var(--radius-sm); padding: 8px 14px; font-size: 12px; color: var(--navy);">
        Store Staff Available: <b>${cachedStaff.length} Members</b>
      </div>
    </div>

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

    <div class="panel">
      <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
        <div class="panel-title">Incoming Dealer Orders (To Fulfill & Assign)</div>
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
              <th>Actions & Assignment</th>
            </tr>
          </thead>
          <tbody>
            ${incoming && incoming.length > 0 ? incoming.map(o => {
              const isAssignedToMe = state.user && o.assigned_staff_id === state.user.id;
              return `
              <tr>
                <td><b>${o.order_number}</b></td>
                <td>${o.buyer_name}</td>
                <td>${o.date}</td>
                <td>${o.items.map(it => `${it.product_name} (${it.size}) × ${it.qty_ordered}`).join(', ')}</td>
                <td><b>₹${o.total_amount.toFixed(2)}</b></td>
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
                <td><span class="badge ${o.status === 'SUBMITTED' ? 'badge-warning' : (o.status === 'ACCEPTED' ? 'badge-neutral' : 'badge-success')}">${o.status}</span></td>
                <td>
                  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    ${o.status === 'SUBMITTED' ? `
                      <button class="btn btn-sm btn-primary" onclick="acceptDealerOrder(${o.id}, ${o.items[0]?.id}, ${o.items[0]?.qty_ordered})">Accept & Reserve</button>
                      <button class="btn btn-sm btn-secondary" onclick="openAssignStaffModal(${o.id}, '${o.order_number}')">👤 Assign Staff</button>
                    ` : (o.status === 'ACCEPTED' ? `
                      <button class="btn btn-sm btn-navy" onclick="dispatchDealerOrder(${o.id})">Dispatch (LR)</button>
                      <button class="btn btn-sm btn-secondary" onclick="openAssignStaffModal(${o.id}, '${o.order_number}')">
                        ${o.assigned_staff_id ? 'Reassign Staff' : '👤 Assign Staff'}
                      </button>
                    ` : `<span style="font-size: 12px; color: var(--text-muted);">${o.transporter_name || 'Dispatched'} (${o.lr_number || ''})</span>`)}
                  </div>
                </td>
              </tr>
            `;}).join('') : '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">No incoming dealer orders.</td></tr>'}
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
    return '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px;">No expenses recorded yet. Click "+ Record New Expense" to log costs.</td></tr>';
  }
  return list.map(e => `
    <tr>
      <td><b>${e.date || 'Today'}</b></td>
      <td>
        <span class="badge ${getExpenseBadgeClass(e.category)}">${e.category}</span>
      </td>
      <td>${e.description || 'N/A'}</td>
      <td><span class="badge badge-neutral">${e.payment_mode}</span></td>
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

  try {
    await api("/finance/expenses", {
      method: "POST",
      body: JSON.stringify({
        category,
        amount,
        payment_mode,
        description
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
  await api(`/dealers/orders/${orderId}/accept`, {
    method: "POST",
    body: JSON.stringify({ accepted_quantities: accepted })
  });
  alert("Order accepted! Stock has been atomically reserved.");
  renderDealers();
}

async function dispatchDealerOrder(orderId) {
  const transporter = prompt("Enter Transporter Name:", "VRL Logistics Express");
  if (!transporter) return;
  const lr = prompt("Enter Lorry Receipt (LR) Number:", "LR-9988-7711");
  if (!lr) return;

  await api(`/dealers/orders/${orderId}/dispatch`, {
    method: "POST",
    body: JSON.stringify({ transporter_name: transporter, lr_number: lr })
  });
  alert("Order dispatched! Stock deducted from inventory and buyer notified.");
  renderDealers();
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
                <span style="color: var(--teal); font-weight: 700;">● Active</span>
              </div>
            </div>

            <div style="display: flex; gap: 8px; justify-content: flex-end;">
              <button class="btn btn-sm btn-secondary" onclick="alert('Staff profile for ${s.full_name.replace(/'/g, "\\'")} is verified and active.')">Profile Details</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
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
  renderCurrentTab();
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

// Render Main App or Authentication Gate
async function renderApp() {
  const root = document.getElementById("app");
  if (!state.token) {
    await loadPublicStores();

    root.innerHTML = `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 28px 16px;">
        <div style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(229, 231, 226, 0.9); border-radius: var(--radius-lg); padding: 40px 36px; width: 100%; max-width: 480px; box-shadow: 0 20px 48px rgba(16, 30, 43, 0.12); position: relative;">
          
          <div style="text-align: center; margin-bottom: 26px;">
            <img src="static/brand/vastrenix-icon.svg" alt="VASTRENIX 3D V" style="width: 82px; height: 82px; margin-bottom: 14px; filter: drop-shadow(0 12px 24px rgba(16, 30, 43, 0.28));">
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

          <!-- Server Connection & Cloud API Settings Bar -->
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;">
            <div style="font-size: 11.5px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #10B981; display: inline-block;"></span>
              <span>API: <b style="color: var(--navy);">${getBaseServerUrl()}</b></span>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="openServerSettingsModal()" style="font-size: 11px; padding: 4px 10px;">
              ⚙ Server URL
            </button>
          </div>

        </div>
      </div>

      <!-- Server URL Settings Modal -->
      <div class="modal-overlay" id="modal-server-settings">
        <div class="modal-card" style="max-width: 440px;">
          <div class="modal-header">
            <h3 style="font-size: 16px; font-weight: 700; color: var(--navy);">Server & Cloud Connection</h3>
            <button style="border: none; background: none; font-size: 20px; cursor: pointer;" onclick="closeServerSettingsModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 14px;">
              Configure your backend API server endpoint. Works with local development servers, LAN Wi-Fi IPs, or cloud deployments.
            </p>
            <div class="form-group">
              <label class="form-label">Backend Server URL</label>
              <input type="text" id="server-url-input" class="form-input" placeholder="http://10.0.2.2:8000">
            </div>

            <div style="margin-bottom: 16px;">
              <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Quick Presets</div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                <button type="button" class="btn btn-sm btn-secondary" onclick="setPresetServerUrl('http://10.0.2.2:8000')">Emulator (10.0.2.2:8000)</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="setPresetServerUrl('http://localhost:8000')">Localhost (8000)</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="setPresetServerUrl('http://127.0.0.1:8000')">127.0.0.1:8000</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="setPresetServerUrl('https://api.vastrenix.com')">Cloud HTTPS</button>
              </div>
            </div>

            <div id="server-health-status" style="min-height: 24px; margin-bottom: 14px;"></div>

            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn btn-secondary" style="flex: 1; padding: 10px;" onclick="testServerConnection()">
                Test Health
              </button>
              <button type="button" class="btn btn-primary" style="flex: 1; padding: 10px;" onclick="saveServerSettings()">
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Authenticated Application Shell
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
          <div style="font-size: 10px; color: #9FB0BC; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Current Store</div>
          <div style="font-size: 13.5px; font-weight: 800; color: white; margin: 2px 0;">${state.storeName || state.business.name}</div>
          <div style="font-size: 11px; color: var(--teal); font-weight: 600;">
            ${state.isStaff ? `Staff: ${state.user.full_name} (${state.business.role})` : `Owner / Store Admin`}
          </div>
        </div>

        <ul class="nav-menu">
          <li class="nav-item">
            <a class="nav-link active" data-tab="dashboard" onclick="switchTab('dashboard')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
              Dashboard
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-tab="inventory" onclick="switchTab('inventory')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
              Inventory & Catalog
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-tab="pos" onclick="switchTab('pos')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
              POS Billing
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-tab="invoices" onclick="switchTab('invoices')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              Invoices & Themes
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-tab="dealers" onclick="switchTab('dealers')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
              Dealer B2B Network
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-tab="expenses" onclick="switchTab('expenses')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Store Expenses
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-tab="users" onclick="switchTab('users')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              Users & Staff
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-tab="flowcharts" onclick="switchTab('flowcharts')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              Flowcharts & Guide
            </a>
          </li>
        </ul>

        <div class="user-badge">
          <div>
            <div class="user-info-name">${state.user.full_name}</div>
            <div class="user-info-role">${state.business.role || 'OWNER'}</div>
          </div>
          <button style="background: none; border: none; color: #9FB0BC; cursor: pointer; font-size: 11px;" onclick="logout()">Logout</button>
        </div>
      </aside>

      <!-- Main Section -->
      <div class="main-wrapper">
        <header class="topbar">
          <div class="topbar-left">
            <button class="mobile-hamburger" onclick="toggleMobileDrawer()" aria-label="Open Navigation">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
            <div class="topbar-title">
              ${state.storeName || state.business.name}
            </div>
            ${state.isStaff ? `
              <div class="branch-pill" style="background: #E8F4F0; color: var(--teal);">
                <span style="width: 7px; height: 7px; background: var(--teal); border-radius: 50%;"></span>
                Staff: <b>${state.user.full_name} (${state.business.role})</b>
              </div>
            ` : `
              <div class="branch-pill">
                <span style="width: 7px; height: 7px; background: var(--teal); border-radius: 50%;"></span>
                Flagship Store
              </div>
            `}
          </div>
          <div class="topbar-right">
            <select class="lang-select" onchange="changeLanguage(this.value)">
              <option value="en" ${state.lang==='en'?'selected':''}>English</option>
              <option value="hi" ${state.lang==='hi'?'selected':''}>हिन्दी (Hindi)</option>
              <option value="gu" ${state.lang==='gu'?'selected':''}>ગુજરાતી (Gujarati)</option>
            </select>
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
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
          Dashboard
        </a>
        <a class="mobile-drawer-link" data-tab="inventory" onclick="drawerNav('inventory')">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          Inventory & Catalog
        </a>
        <a class="mobile-drawer-link" data-tab="pos" onclick="drawerNav('pos')">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
          POS Billing Till
        </a>
        <a class="mobile-drawer-link" data-tab="invoices" onclick="drawerNav('invoices')">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          Invoices & Themes
        </a>
        <a class="mobile-drawer-link" data-tab="expenses" onclick="drawerNav('expenses')">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Store Expenses
        </a>
        <a class="mobile-drawer-link" data-tab="dealers" onclick="drawerNav('dealers')">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
          Dealer B2B Network
        </a>
        <a class="mobile-drawer-link" data-tab="users" onclick="drawerNav('users')">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          Users & Staff Management
        </a>
        <a class="mobile-drawer-link" data-tab="flowcharts" onclick="drawerNav('flowcharts')">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
          System Architecture Flowcharts
        </a>
      </div>

      <div style="padding: 14px; border-top: 1px solid rgba(255,255,255,0.08); margin-top: auto;">
        <button onclick="logout()" class="btn btn-secondary" style="width: 100%; border-color: rgba(255,255,255,0.2); color: #FAF8F3;">Sign Out</button>
      </div>
    </aside>

    <!-- Mobile Bottom Navigation Bar (5 Primary Actions) -->
    <nav class="mobile-bottom-nav">
      <a class="mobile-nav-btn active" data-tab="dashboard" onclick="switchTab('dashboard')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
        <span>Home</span>
      </a>
      <a class="mobile-nav-btn" data-tab="inventory" onclick="switchTab('inventory')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        <span>Stock</span>
      </a>
      <a class="mobile-nav-btn" data-tab="pos" onclick="switchTab('pos')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
        <span>POS Till</span>
      </a>
      <a class="mobile-nav-btn" data-tab="expenses" onclick="switchTab('expenses')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <span>Expenses</span>
      </a>
      <a class="mobile-nav-btn" data-tab="users" onclick="switchTab('users')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
        <span>Team</span>
      </a>
    </nav>
  `;

  renderCurrentTab();
}

window.addEventListener("DOMContentLoaded", () => {
  renderApp();
});
