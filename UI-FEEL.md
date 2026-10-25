# VASTRENIX — UI Feel Specification & Design Constitution

> *"The app should feel the way a well-lit boutique feels when you walk in: calm at first glance, but alive the moment your eye moves — fabric textures instead of flat gray boxes, numbers that visibly tick up when a sale posts, cards that breathe with a little give when tapped, like pressing into folded cotton rather than clicking a plastic button."*

---

## 1. The Short Film: Emotional Architecture

1. **The Morning Opening (App Launch)**
   - *Visual & Sensory Narrative*: Pulling back a heritage store's morning shutters. The screen does not jump from white to black; a gentle warm-ivory (#FAF8F3) linen wash settles across the canvas. The chiseled teal and gold ribbon 'V' monogram glides softly into position (350ms, ease-out-cubic). Below, the dashboard key metrics do not snap into existence — their numbers count up smoothly from zero over 600ms, signaling a fresh day of commerce.
2. **The Barcode "Catch" (POS Entry)**
   - *Visual & Sensory Narrative*: Running a garment barcode across the counter scanner feels like a satisfying, tactile catch. The product card performs a quick 120ms scale-pulse (1.00 → 1.03 → 1.00), accompanied by a crisp, soft haptic tick (`HapticFeedback.selectionClick()`). The cart drawer line slides in effortlessly from the right; the running subtotal odometer rolls upward to its new figure without jarring jumps.
3. **The Small Win (Completed Sale)**
   - *Visual & Sensory Narrative*: Posting a sale is not a loud, garish confetti circus. It is a quiet, confident triumph. The "Complete Sale" action button transforms: its background turns into a soft teal progress ring that completes in 280ms as the backend confirms, then morphs seamlessly into a hand-drawn teal checkmark (`#218C82`) with a dual-haptic pulse (`HapticFeedback.mediumImpact()`). Clean, professional, earned.
4. **The Gentle Tap on the Shoulder (Low-Stock Alert)**
   - *Visual & Sensory Narrative*: Running low on Mulberry Silk sarees is not an air-raid siren. It is an experienced shop manager tapping you on the shoulder. Muted amber accent pill (`#D99A43`) with a soft, breathing opacity cycle (1.0 → 0.65 → 1.0 over 2200ms) only while the condition remains unresolved. Never aggressive red for everyday store numbers.
5. **The Notebook Page Turn (Language Switch: EN / हिन्दी / ગુજરાતી)**
   - *Visual & Sensory Narrative*: Switching between English, Hindi, and Gujarati feels like turning the crisp leaf of a leather-bound ledger. Zero layout jumps, zero clipped glyph boxes, and zero flash of untranslated text. Render tree updates smoothly in 180ms with typography metrics locked across Noto Sans Devanagari and Noto Sans Gujarati.

---

## 2. Concrete Flutter Design Tokens

### 2.1 Motion & Transition Timings

| Animation Type | Duration | Curve | Flutter Implementation | Behavior / Constraints |
|---|---|---|---|---|
| **Element Micro-Interaction** | `180ms` | `Curves.easeOutCubic` | `AnimatedScale(scale: isPressed ? 0.97 : 1.0)` | Interruptible, triggers on touch down |
| **Card Tap Lift** | `200ms` | `Curves.easeOutQuad` | `AnimatedContainer(transform: isHovered ? Matrix4.translationValues(0, -2, 0) : Matrix4.identity())` | 1–2px physical elevation lift |
| **Number Tween (Count-Up)** | `500ms – 700ms` | `Curves.easeOutExpo` | `TweenAnimationBuilder<double>(tween: Tween(begin: oldVal, end: newVal))` | Used on sales totals, cart total, stock balances |
| **Page / Route Transition** | `320ms` | `Curves.fastOutSlowIn` | `CustomFadeThroughPageTransition` | Smooth cross-dissolve with 4px vertical rise |
| **Staggered Card Entry** | `60ms stagger` | `Curves.easeOutCubic` | `Interval(i * 0.08, 1.0, curve: Curves.easeOutCubic)` | Dashboard metric cards cascading into place |
| **Checkmark Draw** | `380ms` | `Curves.easeInOutCubic` | `CustomPainter` with animated `pathMetric` | Stroke draws from vertex to tail |
| **Accessibility Gate** | `0ms` | `Curves.linear` | `MediaQuery.of(context).disableAnimations` | All tweens snap directly when OS Reduce Motion is active |

### 2.2 Depth, Elevation & Texture

- **Shadow Layering (Max 2 Levels)**:
  - **Level 1 (Resting Surface / Folded Cotton)**:
    ```dart
    boxShadow: const [
      BoxShadow(
        color: Color.fromRGBO(25, 43, 58, 0.05),
        offset: Offset(0, 2),
        blurRadius: 8,
        spreadRadius: 0,
      ),
    ]
    ```
  - **Level 2 (Lifted / Modal / Counter Till Drawer)**:
    ```dart
    boxShadow: const [
      BoxShadow(
        color: Color.fromRGBO(25, 43, 58, 0.10),
        offset: Offset(0, 12),
        blurRadius: 28,
        spreadRadius: -4,
      ),
    ]
    ```
- **Tactile Background Texture**:
  - `assets/static/images/textile-doodles.svg` (or linen-grain overlay) rendered at **3.5% opacity** over `#FAF8F3` (Warm Ivory).
  - Eliminates flat cold digital plastic; gives large tablet and counter POS screens the warmth of woven fabric.
- **Rule of Hierarchy**: Never stack card-inside-card. Group sub-items using clean 1px hairline borders (`#E7E8E4`) or subtle 12-column spacing rather than nesting containers.

### 2.3 Color Energy & Palette Rules

```dart
class VastrenixPalette {
  static const Color navyDark     = Color(0xFF101E2B); // Deep Ink Navy (Backgrounds & Headers)
  static const Color navySurface  = Color(0xFF192B3A); // Card Headers & Primary Type
  static const Color ivoryBg      = Color(0xFFFAF8F3); // Warm Boutique Ivory Canvas
  static const Color whiteSurface = Color(0xFFFFFFFF); // Clean Card Surfaces
  static const Color tealPrimary  = Color(0xFF218C82); // Chiseled Teal Primary Action
  static const Color tealLight    = Color(0xFFE8F4F0); // Subtle Teal Fill for Selected Chips
  static const Color amberMuted   = Color(0xFFD99A43); // Low-Stock Attention & Gold Ribbon
  static const Color amberLight   = Color(0xFFFEF8ED); // Amber Banner Surface
  static const Color coralSoft    = Color(0xFFD96F65); // Shortage & Financial Deductions
  static const Color textMain     = Color(0xFF25313B); // High-contrast Charcoal Body
  static const Color textMuted    = Color(0xFF697782); // Secondary Subtitles & SKU Labels
  static const Color borderHairline= Color(0xFFE7E8E4); // Subtle 1px Boundaries
}
```

- **Gradient Rule**: Gradients are **2-stop same-hue** only (e.g. `LinearGradient(colors: [Color(0xFF249A8F), Color(0xFF1B756D)])`). Permitted *only* on the primary action button and sparkline chart fills. **Never** on table rows, modal backdrops, or application body canvases.
- **Color-Coding with Glyphs**: Never use color alone to convey state.
  - Teal (Optimal / In Stock): Accompanied by check/package icon `●`
  - Amber (Low Stock): Accompanied by warning triangle `▲`
  - Coral (Stock Depleted / Shortage): Accompanied by circle exclamation `✕`

### 2.4 Micro-Interactions on Interactive Elements

1. **Button Touch Response**:
   - `onTapDown`: Scales immediately to `0.97`, shadow drops from 8px blur to 2px blur.
   - `onTapUp` / `onTapCancel`: Springs back to `1.00` in 150ms.
2. **Garment Size / Color Chip Selection**:
   - Tap wipes teal background from left-to-right (`ClipRect` with `AnimatedAlign`) in 180ms with text transitioning from Charcoal (`#25313B`) to pure White (`#FFFFFF`).
3. **Cart Item Modification**:
   - Tapping `[+]` or `[-]` executes instant quantity tick; stepper buttons give 0.95 scale feedback.
   - Removing an item triggers a **horizontal slide-out to the left (200ms) with vertical height collapse (160ms)**.
   - Immediately presents a 4-second non-blocking Snack-bar: *"Item removed from cart — **UNDO**"*.

### 2.5 Empty States & Skeleton Shimmers

- **Illustrated Line-Art Empty States**:
  - *No Products Yet*: Elegant fine-line SVG of folded linen fabric on a wooden shelf + *"Your boutique catalog is waiting for its first collection."* + `[+ Add Garment]`.
  - *No Sales Today*: Line-art of neatly organized invoice ledger with a resting quill + *"Counter till is open. First sale will appear here as soon as billed."*.
  - *No Pending Approvals*: Clean green shield with ribbon + *"All store staff members are currently approved and active."*.
- **Skeleton Shimmer Architecture**:
  - Built with linear gradient shimmer moving at 1200ms period (`#F0EFE9` → `#FAF8F3` → `#F0EFE9`).
  - Matches the exact layout of final components:
    - 4 Dashboard metric card skeletons with rounded pill badges.
    - 5-column Table row skeletons with realistic text block widths (30%, 60%, 15%).
    - Grid thumbnail card skeletons (180dp aspect ratio).

### 2.6 Sound & Haptics Matrix (Android & iOS Native)

| Trigger Event | Haptic Pattern | Optional Audio (Toggable in Settings) |
|---|---|---|
| **Barcode Scan Detected** | `HapticFeedback.selectionClick()` | 15ms soft bell tick (44.1kHz, 880Hz sine wave) |
| **Sale Completed & Invoice Rendered** | `HapticFeedback.mediumImpact()` + `HapticFeedback.lightImpact()` | Subdued confirmation chime (220ms duration) |
| **Stock Shortage / Warning** | `HapticFeedback.heavyImpact()` | None (silent visual emphasis) |
| **Standard Tab Navigation** | None (Zero distraction) | None |

---

## 3. Flutter Widget Token Implementation Guide

```dart
// Core Motion Constants
abstract class VastrenixMotion {
  static const Duration micro = Duration(milliseconds: 180);
  static const Duration regular = Duration(milliseconds: 240);
  static const Duration page = Duration(milliseconds: 320);
  static const Duration countUp = Duration(milliseconds: 650);

  static const Curve enter = Curves.easeOutCubic;
  static const Curve exit = Curves.easeInCubic;
  static const Curve standard = Curves.easeInOutCubic;
}

// Interactive Cotton-Press Card Container
class VastrenixCottonCard extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;

  const VastrenixCottonCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(18),
  });

  @override
  State<VastrenixCottonCard> createState() => _VastrenixCottonCardState();
}

class _VastrenixCottonCardState extends State<VastrenixCottonCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final disableAnim = MediaQuery.of(context).disableAnimations;

    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: (disableAnim || !_pressed) ? 1.0 : 0.985,
        duration: VastrenixMotion.micro,
        curve: VastrenixMotion.enter,
        child: AnimatedContainer(
          duration: VastrenixMotion.micro,
          padding: widget.padding,
          decoration: BoxDecoration(
            color: VastrenixPalette.whiteSurface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: VastrenixPalette.borderHairline),
            boxShadow: _pressed
                ? const [BoxShadow(color: Color(0x08192B3A), blurRadius: 4, offset: Offset(0, 1))]
                : const [BoxShadow(color: Color(0x0D192B3A), blurRadius: 10, offset: Offset(0, 2))],
          ),
          child: widget.child,
        ),
      ),
    );
  }
}
```
