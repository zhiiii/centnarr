# Page Override: Linear Style

> This file overrides `MASTER.md` for Centnarr MVP. Linear-style UI per user request.

---

## Color Palette

### Dark Mode (default)

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Background (ground) | `#08090A` | `--bg-ground` |
| Surface 1 | `#16171C` | `--bg-surface-1` |
| Surface 2 | `#1E1F25` | `--bg-surface-2` |
| Surface 3 (raised) | `#26272E` | `--bg-surface-3` |
| Border (hairline) | `rgba(255,255,255,0.06)` | `--border-hairline` |
| Border (strong) | `rgba(255,255,255,0.10)` | `--border-strong` |
| Text Primary | `#F7F8F8` | `--text-primary` |
| Text Secondary | `#9CA3AF` | `--text-secondary` |
| Text Muted | `#6B7280` | `--text-muted` |
| Accent (Linear Purple) | `#5E6AD2` | `--accent` |
| Accent Hover | `#6872D9` | `--accent-hover` |
| Accent Foreground | `#FFFFFF` | `--accent-fg` |
| Success | `#4CB782` | `--success` |
| Warning | `#F2C94C` | `--warning` |
| Destructive | `#EB5757` | `--destructive` |

### Light Mode

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Background (ground) | `#FAFAF9` | `--bg-ground` |
| Surface 1 | `#FFFFFF` | `--bg-surface-1` |
| Surface 2 | `#F4F4F2` | `--bg-surface-2` |
| Surface 3 (raised) | `#EBEBE8` | `--bg-surface-3` |
| Border (hairline) | `rgba(0,0,0,0.08)` | `--border-hairline` |
| Border (strong) | `rgba(0,0,0,0.14)` | `--border-strong` |
| Text Primary | `#1A1B1F` | `--text-primary` |
| Text Secondary | `#6B7280` | `--text-secondary` |
| Text Muted | `#9CA3AF` | `--text-muted` |
| Accent (Linear Purple) | `#5E6AD2` | `--accent` |
| Accent Hover | `#4F58C2` | `--accent-hover` |
| Accent Foreground | `#FFFFFF` | `--accent-fg` |

**Accent rule**: purple appears on <5% of pixels — focused states, tiny pills, key brand surfaces. Never on body backgrounds.

---

## Typography

- **Display**: `Inter Tight` weight 600 — letter-spacing -0.02em
- **Body**: `Inter` weight 400–500, line-height 1.55, 14–15px
- **Mono**: `JetBrains Mono` for inline code and keyboard shortcuts

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
```

---

## Spacing

4 / 8 / 12 / 16 / 24 / 40 / 64 / 96 (px)

---

## Radius

- `--radius-sm`: 6px (small UI, chips, inputs)
- `--radius-md`: 12px (medium cards)
- `--radius-lg`: 16px (large panels)
- **Never above 16** — "modest, precise, never gummy"

---

## Shadow

- `--shadow-sm`: `0 1px 2px rgba(0,0,0,0.3)` (dark) / `0 1px 2px rgba(0,0,0,0.05)` (light)
- `--shadow-md`: `0 2px 8px rgba(0,0,0,0.35)` / `0 2px 8px rgba(0,0,0,0.08)`
- **No glow. No colored shadow.**

---

## Motion

- Hover: 150ms ease-out
- Layout moves: 350-450ms `cubic-bezier(0.22, 1, 0.36, 1)`
- State changes: "snappy but not bouncy"

---

## Theme Switching Rules

1. `data-theme="dark"` or `data-theme="light"` on `<html>`
2. CSS variables switch on `[data-theme]`
3. Default to `prefers-color-scheme` (system preference)
4. User choice persisted in `localStorage` key `centnarr-theme`
5. Theme toggle in top-right corner (sun/moon icon button)
6. Smooth transition on theme switch (200ms)

---

## Signature Moves (per Linear recipe)

- 1px hairline borders `rgba(255,255,255,0.06)` separating every panel
- Selective accent use — purple on focused/active only
- Inline code styled with mono font and dim background
- Keyboard shortcut chips (`⌘K`, `Esc`, `⏎`) styled like Linear
- No emoji. No bouncy springs. No stock photography.

---

## Anti-Patterns

- ❌ Emoji as icons (use inline SVG, lucide-style)
- ❌ Purple-pink-blue gradient mesh
- ❌ Inter at default weight as display
- ❌ Border-radius above 16
- ❌ Glow / colored shadow
- ❌ "Get Started Free" hero CTA styled like 2018 SaaS
- ❌ Bright saturated colors