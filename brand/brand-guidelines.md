# VASTRENIX Brand Identity & Usage Guidelines

**Tagline:** "Your Business, Beautifully in Sync."  
**Descriptor:** Clothing Business Management Platform  

---

## 1. Brand Concept & Emotional Pillars

VASTRENIX represents the convergence of textile craftsmanship and modern enterprise clarity. The name unites **Vastra** (Sanskrit for apparel, textile, garments) with **Matrix / Phoenix / Nexus** (interconnected intelligence, resilience, and growth).

- **Trust & Reliability:** Financial figures, inventory valuations, and order statuses are authoritative, decimal-precise, and verifiable.
- **Effortless Business Management:** Shop owners and cashiers experience low cognitive friction through clear visual hierarchy and thoughtful defaults.
- **Clothing Industry Expertise:** Purpose-built size/color matrices, fabric/GSM/HSN fields, seasonal batches, rack locations, and B2B dealer networks.
- **Warm Editorial SaaS Aesthetic:** Eliminates harsh AI-style neon accents and generic marketplace clip-art in favor of warm ivory surfaces, deep ink navy contrast, and balancing teal.

---

## 2. Color Palette & Design Tokens

| Token Name | Hex Code | Purpose & Semantic Role |
| :--- | :--- | :--- |
| `color-primary-navy` | `#192B3A` | Deep ink navy for high-contrast headings, primary nav, and confident branding |
| `color-surface-ivory` | `#FAF8F3` | Warm ivory background providing a calm, welcoming workspace |
| `color-surface-white` | `#FFFFFF` | Card containers, modal sheets, and high-clarity data table backgrounds |
| `color-accent-teal` | `#218C82` | Progress, primary CTA buttons, active status badges, positive movement |
| `color-teal-light` | `#E8F4F0` | Light teal tint for selected table rows, subtle chips, and success banners |
| `color-warning-amber` | `#D99A43` | Reorder warnings, pending dealer reviews, partial approvals |
| `color-danger-coral` | `#D96F65` | Out-of-stock critical alerts, failed sync items, refund & destructive actions |
| `color-text-main` | `#25313B` | High legibility charcoal-slate for long reading and tabular figures |
| `color-text-muted` | `#697782` | Supporting labels, timestamps, secondary navigation, and units |
| `color-border-subtle` | `#E7E8E4` | Restrained 1px component borders and clean dividers |
| `color-dark-surface` | `#14212B` | Dark mode background and compact thermal invoice header blocks |

---

## 3. Typography Rules

- **Primary Font Family:** Inter / Manrope (System sans-serif fallback)
- **Tabular Numerals:** Always enabled for prices, quantities, SKU counts, and totals (`font-feature-settings: "tnum" 1`).
- **Hierarchy:**
  - Page Titles: 24px - 28px SemiBold
  - Section Headers: 18px - 20px SemiBold
  - Card Titles & Table Headers: 13px - 14px Medium uppercase with 0.5px letter-spacing
  - Body Text: 14px Regular (Line height 1.5)
  - Small Meta / Footers: 12px Regular
- **Multilingual Support:** Tested for English, Hindi (हिन्दी), and Gujarati (ગુજરાતી) glyph rendering with zero line truncation.

---

## 4. Logo Usage Guidelines

- Maintain a minimum clear space equal to half the height of the icon around all sides.
- Do not skew, apply harsh dropshadows, or alter the color relationships.
- Use `vastrenix-logo-light.svg` on ivory, white, or light surfaces.
- Use `vastrenix-logo-dark.svg` on dark slate or navy headers.
- Use `vastrenix-logo-monochrome.svg` for 80mm/58mm thermal receipts and monochrome stamps.
