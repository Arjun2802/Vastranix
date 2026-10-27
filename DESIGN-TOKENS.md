# VASTRENIX DESIGN TOKENS
Single Source of Truth extracted from `Vastrenix_App_UI.pdf` (Page 1).

---

## 1. COLOR PALETTE

| Token Name | Hex Code | Semantic Role & Usage Constraints |
| :--- | :--- | :--- |
| **Graphite** | `#0E0E12` | Ink, hero dark surfaces, primary dark buttons, brand background on launch. |
| **Vastra Violet** | `#5B3DF5` | **The ONE primary accent color in the entire app.** Marks the one primary action per screen (e.g. "Charge ₹6,216", "Continue", active nav item). Never used decoratively or as a background wash. |
| **Mist** | `#F6F6F8` | Standard app ground / background across all screens. |
| **Paper** | `#FFFFFF` | Cards, bottom sheets, input fields, and elevated panels. |
| **Paid / Success** | `#0E7C58` | Green. Used **strictly** for money received and positive stock/status chips. Never decorative. |
| **Due / Warning** | `#A35A00` | Amber. Used **strictly** for outstanding dues, aging balances, and low-stock warnings. |
| **Risk / Destructive** | `#C8283C` | Red / Coral. Used **strictly** for critical out-of-stock, credit notes, variance loss, and destructive actions (e.g. Sign out). |
| **Border Hairline** | `#E5E7EB` | Subtle divider and card stroke. |
| **Segment Track** | `#EDEDF0` | Pill-shaped segmented control background. |

### Status Chip Color Pairs (WCAG AA Compliant)
- **Paid**: Background `#E8F5E9`, Text `#0E7C58`
- **Due**: Background `#FEF3C7` (or `#FFF8E1`), Text `#A35A00`
- **Risk / Out of Stock**: Background `#FEE2E2` (or `#FFEBEE`), Text `#C8283C`
- **Dispatched**: Background `#EDE9FE`, Text `#5B3DF5`
- **Draft / Inactive**: Background `#F3F4F6`, Text `#6B7280`

---

## 2. TYPOGRAPHY SYSTEM

Default typeface: **Geist** (with fallback to Inter / system sans-serif).  
Hindi: **Noto Sans Devanagari**.  
Gujarati: **Noto Sans Gujarati**.  
*Rule: Tabular numerals (`tnum`) everywhere money, quantities, or timestamps appear.*

| Type Scale | Size / Weight | Line Height | Usage Example |
| :--- | :--- | :--- | :--- |
| **Figure** | `44px` / `700` | `52px` | Large numbers (e.g. `₹48,260`, `₹1,24,300`). Tabular figures, tight tracking. |
| **Title** | `28px` / `700` | `36px` | Screen titles (e.g. "Close shift", "Sign in to your store"). |
| **Heading** | `17px` / `600` | `24px` | Product names, section headers (e.g. "Chanderi silk kurta"). |
| **Body** | `15px` / `400` | `22px` | Descriptive copy, helper text, input values. |
| **Caption** | `13px` / `500` | `18px` | SKU lines, metadata (e.g. `VX-KUR-0142 · Indigo · M`). |
| **Overline** | `11px` / `600` | `16px` | Category labels, date groups (`TODAY`, `YESTERDAY`), uppercase letter-spaced. |

---

## 3. SPACING, RADIUS & ELEVATION

### 4-Point Grid
`4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `48px`
- **Screen gutter**: `20px`
- **Card internal padding**: `16px`
- **Touch targets**: Minimum `44px` height/width

### Corner Radii
- **Controls & Buttons**: `12px`
- **Cards & Hero Panels**: `18px`
- **Bottom Sheets & Modals**: `28px` (top-left & top-right)
- **Pills & Chips**: `999px` (fully rounded)

### Elevation & Shadows
- Flat cards on Mist background have **no shadow** (`box-shadow: none`), relying on `#FFFFFF` paper surface against `#F6F6F8` mist ground with hairline `#E5E7EB` border.
- **ONE soft shadow** used exclusively for bottom sheets and floating action controls:
  `box-shadow: 0 10px 30px rgba(14, 14, 18, 0.10);`

---

## 4. ICONS SPECIFICATION
- **Family**: Lucide Icons (ISC License)
- **Stroke Width**: `1.75px` outline only.
- **Rules**: Never mix in another icon family, never use emoji, never use filled/solid clip art.
- **Sizes**:
  - `24px` in Bottom Navigation bar
  - `20px` to `22px` for inline card actions and headers

---

## 5. FLUTTER THEME IMPLEMENTATION CODE

```dart
import 'package:flutter/material.dart';

class VastrenixColors {
  static const Color graphite = Color(0xFF0E0E12);
  static const Color vastraViolet = Color(0xFF5B3DF5);
  static const Color mist = Color(0xFFF6F6F8);
  static const Color paper = Color(0xFFFFFFFF);
  static const Color paidGreen = Color(0xFF0E7C58);
  static const Color dueAmber = Color(0xFFA35A00);
  static const Color riskRed = Color(0xFFC8283C);
  static const Color border = Color(0xFFE5E7EB);
  static const Color segmentTrack = Color(0xFFEDEDF0);
  
  // Chip backgrounds
  static const Color paidBg = Color(0xFFE8F5E9);
  static const Color dueBg = Color(0xFFFEF3C7);
  static const Color riskBg = Color(0xFFFEE2E2);
  static const Color dispatchedBg = Color(0xFFEDE9FE);
  static const Color draftBg = Color(0xFFF3F4F6);
}

class VastrenixSpacing {
  static const double p4 = 4.0;
  static const double p8 = 8.0;
  static const double p12 = 12.0;
  static const double p16 = 16.0;
  static const double p20 = 20.0;
  static const double p24 = 24.0;
  static const double p32 = 32.0;
  static const double p48 = 48.0;

  static const double screenGutter = 20.0;
  static const double cardPadding = 16.0;
  static const double touchTargetMin = 44.0;
}

class VastrenixRadii {
  static const double control = 12.0;
  static const double card = 18.0;
  static const double sheet = 28.0;
  static const double pill = 999.0;
}

class VastrenixElevation {
  static const BoxShadow sheetShadow = BoxShadow(
    color: Color.fromRGBO(14, 14, 18, 0.10),
    blurRadius: 30.0,
    offset: Offset(0, 10),
  );
}

class VastrenixTypography {
  static const String fontFamily = 'Geist';

  static const TextStyle figure = TextStyle(
    fontFamily: fontFamily,
    fontSize: 44.0,
    fontWeight: FontWeight.w700,
    height: 52.0 / 44.0,
    letterSpacing: -1.0,
    fontFeatures: [FontFeature.tabularFigures()],
    color: VastrenixColors.graphite,
  );

  static const TextStyle title = TextStyle(
    fontFamily: fontFamily,
    fontSize: 28.0,
    fontWeight: FontWeight.w700,
    height: 36.0 / 28.0,
    letterSpacing: -0.5,
    color: VastrenixColors.graphite,
  );

  static const TextStyle heading = TextStyle(
    fontFamily: fontFamily,
    fontSize: 17.0,
    fontWeight: FontWeight.w600,
    height: 24.0 / 17.0,
    color: VastrenixColors.graphite,
  );

  static const TextStyle body = TextStyle(
    fontFamily: fontFamily,
    fontSize: 15.0,
    fontWeight: FontWeight.w400,
    height: 22.0 / 15.0,
    color: VastrenixColors.graphite,
  );

  static const TextStyle caption = TextStyle(
    fontFamily: fontFamily,
    fontSize: 13.0,
    fontWeight: FontWeight.w500,
    height: 18.0 / 13.0,
    color: Color(0xFF6B7280),
  );

  static const TextStyle overline = TextStyle(
    fontFamily: fontFamily,
    fontSize: 11.0,
    fontWeight: FontWeight.w600,
    height: 16.0 / 11.0,
    letterSpacing: 0.8,
    color: Color(0xFF6B7280),
  );
}

class VastrenixTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: VastrenixColors.mist,
      colorScheme: const ColorScheme.light(
        primary: VastrenixColors.vastraViolet,
        onPrimary: VastrenixColors.paper,
        surface: VastrenixColors.paper,
        onSurface: VastrenixColors.graphite,
        error: VastrenixColors.riskRed,
        outline: VastrenixColors.border,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: VastrenixColors.mist,
        foregroundColor: VastrenixColors.graphite,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardTheme(
        color: VastrenixColors.paper,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(VastrenixRadii.card),
          side: const BorderSide(color: VastrenixColors.border, width: 1),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: VastrenixColors.vastraViolet,
          foregroundColor: VastrenixColors.paper,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(VastrenixRadii.control),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          minimumSize: const Size.fromHeight(VastrenixSpacing.touchTargetMin),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
    );
  }
}
```
