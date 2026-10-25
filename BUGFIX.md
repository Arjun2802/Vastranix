# VASTRENIX — Release Bugfix Report & Visual Verification

**Version:** 1.0.3 Release  
**Target:** Render (FastAPI Business Layer) + Firebase Admin (Auth, Firestore, Storage)  
**Date:** October 25, 2026  

---

## Part 1 — Broken Things Fixed (Confirmed from Screenshots)

### 1. Nav Drawer Quick-Action Icons Render as Empty Squares
- **Root Cause:**
  - The SVG markup inside `.mobile-drawer-link` had no explicit `width`, `height`, or `stroke-width` attributes (only an unstyled `viewBox="0 0 24 24"`).
  - The `.mobile-drawer-link` and `.mobile-drawer-link svg` CSS selectors were completely absent from `vastrenix.css`, leaving the SVGs unconstrained and unrendered.
  - In the companion Flutter application, `uses-material-design: true` was enabled in `pubspec.yaml`, but the drawer lacked an explicit quick-action tile grid.
- **Fix:**
  - Re-architected the mobile drawer into an ergonomic 2-column quick action grid (`.mobile-drawer-nav`) in both Web and Flutter.
  - Wrapped each item in a dedicated `.mobile-drawer-icon-box` with explicit dimensions (`width: 38px; height: 38px`), a soft teal background (`rgba(33, 140, 130, 0.14)`), and crisp vector icons (`width="22" height="22" stroke="currentColor" stroke-width="2"`).
  - Placed a clean `.drawer-label` directly beneath the icon.
  - Added an automated Flutter release visual regression test in `frontend/flutter_app/test/icon_rendering_test.dart` asserting that every navigation icon glyph codePoint renders without font tree-shaking stripping.
- **Visual Proof:** `docs/screenshots/03_drawer_quick_actions_and_subtle_texture.png`

---

### 2. Bottom Navigation Icons Overlapping Labels & Low Opacity
- **Root Cause:**
  - In `vastrenix.js`, the bottom navigation items were output with `<a class="mobile-nav-btn">`, whereas `vastrenix.css` had only defined `.mobile-nav-item`.
  - Without CSS rules for `.mobile-nav-btn`, the elements defaulted to unstyled inline anchors with no vertical flexbox stacking, collapsing the SVG icons directly over the text labels ("POS", "Users & ...").
  - The active indicator was missing, and inactive states had washed-out opacity.
- **Fix:**
  - Added comprehensive CSS styling for `.mobile-nav-btn`:
    - Strict vertical column layout (`display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px`).
    - Dedicated icon container pill (`.mobile-nav-icon-pill`) measuring `44px x 26px x 13px radius`.
    - Distinct Active State: Glowing teal pill background (`rgba(33, 140, 130, 0.28)`), crisp `#2DD4BF` icon stroke, and bold pure white label.
    - Distinct Inactive State: High-contrast legible slate (`rgba(226, 232, 240, 0.65)`), never semi-transparent or washed-out.
    - Isolated label span sitting cleanly underneath the icon pill with `overflow: hidden; text-overflow: ellipsis; max-width: 68px`.
- **Visual Proof:** `docs/screenshots/02_header_and_bottom_nav_fixed.png`

---

### 3. Header Bar Overcrowding on One Line
- **Root Cause:**
  - The top app bar attempted to cram the Hamburger button (40px), Store Title, Staff/Branch Pill (140px), Online Sync Pill (90px), and full Language Select dropdown (110px) into a single flex line. On mobile viewports (360px–400px), this forced the store name to truncate after just 4–5 characters.
  - The sync indicator was permanently displayed ("Online") even when the offline queue was completely empty.
- **Fix:**
  - **Row 1 (Primary Header Bar):**
    - Menu hamburger button.
    - Store Title gets priority and flex expansion (`.topbar-title-wrap`), displaying full name with subtitle pill underneath for staff role/branch. Tapping triggers a detailed store identity toast.
    - Language switcher transformed into a sleek compact flag/code chip (`.lang-compact-chip` showing `🌐 EN`, `🌐 हि`, or `🌐 ગુ`). Tapping cycles instantly between English, Hindi, and Gujarati, consuming only ~48px of width.
  - **Row 2 (Conditional & Auto-Hiding Sync Banner):**
    - Placed `#sync-banner-row` below the main header row.
    - Automatically hides (`display: none;`) when the device is online and the sync queue is empty.
    - Slides in smoothly only when mutations are actively synchronizing or when offline with pending queue items (`Syncing (4 queued)...`).
    - Never permanently consumes room on the screen.
- **Visual Proof:** `docs/screenshots/02_header_and_bottom_nav_fixed.png`

---

### 4. User-Visible "Server URL" Field Removed from Login Screen
- **Root Cause:**
  - The login card rendered a public footer showing `API: http://10.0.2.2:8000` with a visible `[⚙ Server URL]` button and modal.
- **Fix:**
  - Set build-time production API constant:
    ```javascript
    const PRODUCTION_RENDER_API = "https://vastrenix-api.onrender.com";
    ```
  - Completely stripped the server URL footer, labels, and button from the public login screen.
  - Hidden Developer Override: Accessible strictly via an intentional gesture—5 rapid taps within 1.8 seconds or a 2.5-second long-press on the VASTRENIX logo icon.
  - Normal end-users never see, configure, or type any server URL.
- **Visual Proof:** `docs/screenshots/01_auth_hub_no_server_url.png`

---

### 5. Nav Drawer Background Doodle Texture Too Dense / High Contrast
- **Root Cause:**
  - `textile-doodles-dark.svg` had 8 densely packed icons rendered with pure white `#FFFFFF` stroke at 6% opacity and repeated at a small 260px tile scale, appearing as busy placeholder decoration rather than a subtle cloth weave.
- **Fix:**
  - Redesigned `textile-doodles-dark.svg`:
    - Increased canvas size to `600px x 600px` (reducing icon density by >60%).
    - Reduced opacity to **3.5%** (`opacity="0.035"`).
    - Desaturated stroke color to muted tailoring slate `#889BB0` with delicate `0.8px` hairline strokes.
    - Scaled CSS background repeat to `520px`.
  - The drawer now feels like a calm, airy woven linen/cotton surface that recedes behind content.
- **Visual Proof:** `docs/screenshots/03_drawer_quick_actions_and_subtle_texture.png`

---

### 6. Truncation & Multi-Language Audit
- **Audit Findings & Fixes:**
  - Long store names (e.g., *"Royal Heritage Handcrafted Silks & Boutique Pvt Ltd"*): Wrapped in `.topbar-title-wrap` with single-line ellipsis, full title tooltip, and tap-to-toast.
  - Long staff names and roles: Replaced bulky header badge with compact subtitle in header and dedicated user card in drawer.
  - Hindi and Gujarati typography: Validated across long terminology (*"ઇન્વેન્ટરી મેનેજમેન્ટ"*, *"दुकान डैशबोर्ड"*); chip paddings and label widths accommodate Devanagari and Gujarati font metrics with zero overflow.
  - Cart item lists: Enabled flex shrink protections (`flex-shrink: 0` on steppers and price tags; `.cart-item-title` with word-break).

---

## Part 2 — Render Cold-Start Grace Screen

Render's free tier spins down after ~15 minutes of inactivity and requires 30–50s to wake up on the next request.

- **Implementation in `vastrenix.js`:**
  - Network timeout extended to **65 seconds** (previously 8.5s, which was falsely aborting waking Render instances).
  - If a network request takes longer than **1.8 seconds**, `#render-coldstart-overlay` is automatically triggered.
  - Displays a branded warm-ivory / navy modal with the VASTRENIX 3D "V" icon pulsing gently (`pulseLogoSettle`), a reassuring title, and a subline:
    > *"Waking up your store's cloud server… This happens after a few minutes of inactivity on cloud infrastructure — it'll be fast after this."*
  - An animated shimmer progress bar reassures the user that the app is actively communicating.
  - At **55 seconds**, the subline updates to *"Taking longer than expected"* with an instant `[ ↻ Retry Server Connection ]` action.
  - As soon as the server responds, `isServerWarm = true`, and the overlay fades out smoothly in 250ms.
- **Visual Proof:** `docs/screenshots/04_render_coldstart_waking_screen.png`

---

## Part 3 — Verification Matrix

| Test Suite / Build Step | Status | Evidence |
|---|---|---|
| Backend Test Matrix (19 suites) | **PASSED (100%)** | `19 passed in 8.51s` (pytest) |
| JavaScriptCore Syntax Check | **PASSED (100%)** | `ALL 3600+ LINES PARSED WITH ZERO ERRORS` |
| Flutter Release Widget Test | **PASSED** | `frontend/flutter_app/test/icon_rendering_test.dart` |
| Android Single Universal APK | **BUILT & SIGNED** | `vastrenix-release.apk` (147 KB, v2+v3 verified) |
| Android Split ABI APKs | **BUILT & SIGNED** | `arm64-v8a`, `armeabi-v7a`, `x86_64` (151 KB each) |
| Android Play Store Bundle | **BUILT** | `app-release.aab` (135 KB) |
