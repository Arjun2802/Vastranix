import re
import subprocess
import sys

def main():
    print("Reading screen modules...")
    with open('scripts/build_ui_screens.py') as f:
        lucide_js = re.search(r'LUCIDE_ENGINE\s*=\s*r\'\'\'(.*?)\'\'\'', f.read(), re.DOTALL).group(1)

    with open('scripts/generate_all_34_screens.py') as f:
        screens_2_5_js = re.search(r'SCREEN_CODE\s*=\s*r\'\'\'(.*?)\'\'\'', f.read(), re.DOTALL).group(1)

    with open('scripts/append_screens_6_to_34.py') as f:
        screens_6_15_js = re.search(r'SCREENS_6_TO_15\s*=\s*r\'\'\'(.*?)\'\'\'', f.read(), re.DOTALL).group(1)

    with open('scripts/append_screens_16_to_25.py') as f:
        screens_16_25_js = re.search(r'SCREENS_16_TO_25\s*=\s*r\'\'\'(.*?)\'\'\'', f.read(), re.DOTALL).group(1)

    with open('scripts/append_screens_26_to_34.py') as f:
        screens_26_34_js = re.search(r'SCREENS_26_TO_34\s*=\s*r\'\'\'(.*?)\'\'\'', f.read(), re.DOTALL).group(1)

    nav_and_app_js = '''
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
'''

    new_set_app_state_js = '''function setAppState(newState, metadata = {}) {
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
'''

    with open('frontend/web/static/js/vastrenix.js') as f:
        js_content = f.read()

    # Exact replacement of setAppState up to async function startAppLaunchSequence
    idx1 = js_content.find('function setAppState(newState, metadata = {}) {')
    idx2 = js_content.find('async function startAppLaunchSequence()')
    if idx1 != -1 and idx2 != -1:
        js_content = js_content[:idx1] + new_set_app_state_js + "\n\n" + js_content[idx2:]
        print("Replaced setAppState precisely without touching startAppLaunchSequence.")
    else:
        print("Warning: setAppState boundaries not found exactly.")

    # Remove old renderApp function block
    old_render_app_idx = js_content.find('async function renderApp() {')
    keydown_idx = js_content.find('window.addEventListener("keydown"', old_render_app_idx)

    if old_render_app_idx != -1 and keydown_idx != -1:
        js_content = js_content[:old_render_app_idx] + js_content[keydown_idx:]
        print("Removed old renderApp block successfully.")

    full_engine = "\n\n" + lucide_js + "\n\n" + screens_2_5_js + "\n\n" + screens_6_15_js + "\n\n" + screens_16_25_js + "\n\n" + screens_26_34_js + "\n\n" + nav_and_app_js

    js_content += full_engine

    with open('frontend/web/static/js/vastrenix.js', 'w') as f:
        f.write(js_content)

    print("Updated frontend/web/static/js/vastrenix.js successfully!")

if __name__ == '__main__':
    main()
