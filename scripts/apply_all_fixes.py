#!/usr/bin/env python3
import re
import sys

JS_PATH = "frontend/web/static/js/vastrenix.js"

with open(JS_PATH, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update performCleanResumeSync and add silentTokenRefresh
old_resume = """async function performCleanResumeSync() {
  try {
    if (!state.token) return;
    await api("/sync/firebase/status", { silent: true, timeout: 5000 });
    state.reconnectAttempts = 0;
  } catch (err) {
    state.reconnectAttempts = (state.reconnectAttempts || 0) + 1;
    const backoffMs = Math.min(60000, 2000 * Math.pow(2, state.reconnectAttempts));
    console.log(`[LIFECYCLE] Sync attempt failed; exponential backoff in ${backoffMs}ms`);
    if (pendingReconnectTimer) clearTimeout(pendingReconnectTimer);
    pendingReconnectTimer = setTimeout(() => {
      if (!isAppInBackground) {
        performCleanResumeSync();
      }
    }, backoffMs);
  }
}"""

new_resume = """async function performCleanResumeSync() {
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
}, 45 * 60 * 1000);"""

if old_resume in content:
    content = content.replace(old_resume, new_resume)
    print("✓ Replaced performCleanResumeSync & added silentTokenRefresh")
else:
    print("! Warning: old_resume not found exactly")

# 2. Add handleVersionSecretTap, checkSettingsConnection, updateSettingsConnectionDisplay and update openStoreSettingsModal
old_settings = """let devTapCount = 0;
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

function openStoreSettingsModal() {
  const modal = document.getElementById("modal-store-settings");
  if (!modal) return;
  const payModeSelect = document.getElementById("settings-default-payment-mode");
  if (payModeSelect) payModeSelect.value = state.defaultPaymentMode || "CASH";
  const themeSelect = document.getElementById("settings-default-theme");
  if (themeSelect) themeSelect.value = state.selectedPOSTheme || "PREMIUM_BOUTIQUE";
  modal.classList.add("active");
}"""

new_settings = """let devTapCount = 0;
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
}"""

if old_settings in content:
    content = content.replace(old_settings, new_settings)
    print("✓ Replaced openStoreSettingsModal and added connection/secret tap functions")
else:
    print("! Warning: old_settings not found exactly")

# 3. Replace bottom dismissSplashScreen and launch sequence
old_bottom = """function dismissSplashScreen() {
  const splash = document.getElementById("vastrenix-splash-screen");
  if (splash && !splash.classList.contains("splash-fade-out")) {
    const root = document.getElementById("app");
    if (root && (!root.innerHTML || root.innerHTML.trim() === "")) {
      try { renderApp(); } catch (e) { console.error("Fallback renderApp error:", e); }
    }
    splash.classList.add("splash-fade-out");
    setTimeout(() => {
      if (splash.parentNode) splash.parentNode.removeChild(splash);
    }, 500);
  }
}

// Render immediately upon script evaluation
try {
  renderApp();
} catch (e) {
  console.error("Initial renderApp error:", e);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(renderApp, 1);
  setTimeout(dismissSplashScreen, 1800);
} else {
  window.addEventListener("DOMContentLoaded", () => {
    renderApp();
    setTimeout(dismissSplashScreen, 1800);
  });
}"""

new_bottom = """const AppState = {
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
}"""

if old_bottom in content:
    content = content.replace(old_bottom, new_bottom)
    print("✓ Replaced bottom bootstrap with startAppLaunchSequence and deterministic state machine")
else:
    print("! Warning: old_bottom not found exactly")

with open(JS_PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated vastrenix.js successfully.")
