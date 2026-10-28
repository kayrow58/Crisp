# Crisp — Design System

**Feel:** sharp, energetic, focused. Clean black with neon accents; a soft glow on the bars only. iOS layout conventions throughout (Apple Human Interface Guidelines).

The tokens below are implemented in [`src/theme/tokens.css`](../src/theme/tokens.css).

---

## Color

### Dark (default)
| Token | CSS variable | Hex | Use |
|---|---|---|---|
| Background | `--bg` | `#000000` | App background |
| Card | `--card` | `#121212` | Cards, stat card |
| Raised | `--raised` | `#1C1C1E` | Sheets, inputs |
| Divider | `--divider` | `#2C2C2E` | Row dividers, tab bar top line |
| Text | `--text` | `#FFFFFF` | Primary text (21:1) |
| Text secondary | `--text-2` | `#8E8E93` | Labels, captions (5.8:1) |
| Primary | `--primary` | `#39FF14` | Calories bar, + button, primary buttons, success |
| On primary | `--on-primary` | `#000000` | Text on neon buttons |
| Primary fill | `--primary-fill` | `#39FF14` | Bars |
| Protein | `--protein` | `#FF2D95` | P bar |
| Carbs | `--carbs` | `#00E5FF` | C bar |
| Fat | `--fat` | `#FFD60A` | F bar |
| Warning / over | `--warning` | `#FF9F0A` | Over-target striped tip |
| Error | `--error` | `#FF453A` | Destructive, errors |
| Flame | `--flame-from` → `--flame-to` | `#FF9F0A` → `#FFD60A` | Streak flame gradient |

### Light
| Token | Hex | Notes |
|---|---|---|
| Background | `#F2F2F7` | |
| Card | `#FFFFFF` | |
| Raised | `#FFFFFF` | |
| Divider | `#D1D1D6` | |
| Text | `#000000` | |
| Text secondary | `#6C6C70` | |
| Primary (buttons, green text) | `#147A08` | White text on it (~5.5:1) |
| On primary | `#FFFFFF` | |
| Primary fill (bars) | `#1A9E0B` | Bars only |
| Protein | `#D6127A` | |
| Carbs | `#0089A8` | |
| Fat | `#B88A00` | Bar only; labels stay black |
| Warning / over | `#C25E00` | |
| Error | `#D70015` | |

**Theme setting:** Dark (default) · Light · System. Implemented with `data-theme="dark|light"` on `<html>`; System follows `prefers-color-scheme`.

**Over target:** bar fills completely; extra shown as a striped orange tip plus "+120 over" text (calories and macros).

**Color is never the only signal:** P/C/F letters on bars, stripes + text for over-target, ✓/✕ icons for success/error.

---

## Typography

System fonts only (nothing to download). Numbers and titles use SF Pro Rounded (`ui-rounded`); everything else uses SF Pro (`-apple-system`).

| Style | Size (pt) | Weight | Font |
|---|---|---|---|
| Big number | 48 | Bold | Rounded |
| Large title | 34 | Bold | Rounded |
| Title | 22 | Semibold | Rounded |
| Headline | 17 | Semibold | SF Pro |
| Body | 17 | Regular | SF Pro |
| Subhead | 15 | Regular | SF Pro |
| Caption | 12 | Medium | SF Pro, secondary color |

- Line height ≈ 1.3×.
- Text scales with the iPhone text-size setting (`-apple-system-body` base + `rem`).
- Inputs are ≥ 17 pt so iOS never zooms on focus.

---

## Spacing, radius, shadow

- **Spacing scale:** 4 · 8 · 12 · 16 · 24 · 32
- **Screen edge:** 16 · **Gap between cards:** 12
- **Radius:** cards 20 · buttons 14 · inputs 12 · sheets 24 (top corners) · bars fully rounded
- **Shadows:** none in dark mode; very soft in light mode

---

## Icons

**Phosphor** icon set. Outline weight, gray (`--text-2`) by default; **solid (fill) neon** for the active tab.

---

## Components

| Component | Spec |
|---|---|
| Primary button | 50 pt tall, radius 14, `--primary` fill, `--on-primary` text |
| Secondary button | 50 pt, `--raised` fill, `--text` text |
| Destructive button | 50 pt, no fill, `--error` text |
| Card | `--card`, radius 20, no border |
| List row | 56 pt, divider, › chevron on tap-through rows |
| Input | `--raised` fill, radius 12, 17 pt text, neon outline on focus |
| Toggle | iOS style, `--primary` when on |
| Segmented control | gray pill; selected segment lighter gray + white text |
| Tab bar | black, thin top divider; center (+) is a 56 pt `--primary` circle; always visible |
| Nav bar | large title that collapses to small on scroll |
| Sheet | `--raised`, top radius 24, grab handle, drag down to dismiss |
| Toast | dark pill at top: "✓ Added to Lunch · Undo", 4 s |
| Empty state | one large glowing Phosphor icon + one short line + one button |
| Loading | shimmering placeholder shapes |
| Offline pill | gray "Offline" pill at top; on sync: spin → ✓ → slides away |

**Press state:** buttons/cards scale to 0.97 and dim slightly, then spring back. List rows get a light gray highlight.

---

## Motion

- Quick springy: ~0.35 s for screens and sheets; ~0.6 s for bar growth.
- Streak flare ~1 s; milestone confetti.
- **Reduce Motion:** simple fades only; no confetti, bar sweep, or flame flare.
- No haptics (not reliable on iOS web) — every action has visual feedback.

---

## App icon & launch

- **Icon:** three rounded bars (pink `#FF2D95`, cyan `#00E5FF`, yellow `#FFD60A`) curving into a "C" on black. Placeholder versions ship in `public/icons/`; final artwork replaces them.
- **Launch:** still icon on black (iOS startup image), then the C fades as Home's bars sweep in (~0.6 s).
- **Imagery:** empty states use one large glowing icon; milestones use neon confetti + a big number.

---

## Streak flame tiers

| Streak | Flame |
|---|---|
| 1–6 days | small |
| 7–29 | medium |
| 30–99 | large |
| 100+ | large with constant glow |
| Lost / not yet logged today | small, gray |
