# Print Geometry Overlay — Design Specification

**File:** `docs/print-geometry-overlay.md`  
**Component:** `src/html-builder.ts → previewOverlayCss()`  
**Status:** Beta (v2.2)

---

## Purpose

The print geometry overlay renders print-accurate visual guides inside the
preview iframe. It shows the user exactly which area of the page will carry
content and how much margin has been removed, without affecting the printed
output.

---

## Architecture

The overlay is pure CSS injected into the `<style>` block of the srcdoc HTML
inside a `@media screen { }` block. Because it is scoped to screen media, it
is never included in the printed output and does not affect `@page` behaviour.

```
srcdoc HTML structure
│
├── <style>
│   ├── @page { size, margin }          ← print dimensions
│   ├── body, typography, …             ← print styles
│   └── @media screen {
│       ├── html::before                ← Layer 1 (page frame + margin fill)
│       └── html::after                 ← Layer 2 (content-area boundary)
│       }
└── <body>
    └── note content
```

### Why `html::before / html::after` not `body::*`?

`body` height is determined by content. Short notes leave the bottom of the
body short of the viewport, so a body-bound `fixed` child would cover only
partial page height. `html` always fills the iframe viewport, giving both
pseudo-elements a stable, full-page reference frame.

---

## Layer 1 — Page Boundary + Margin Fill (`html::before`)

```css
html::before {
  position: fixed;
  inset: 0;                    /* covers full iframe viewport */
  border: 1.5px dashed crimson;  /* page outer boundary */
  box-shadow:
    inset  0         Tmm  0 0  rgba(220, 20, 60, 0.09),  /* top    margin */
    inset  0        -Bmm  0 0  rgba(220, 20, 60, 0.09),  /* bottom margin */
    inset  Lmm       0    0 0  rgba(220, 20, 60, 0.09),  /* left   margin */
    inset -Rmm       0    0 0  rgba(220, 20, 60, 0.09);  /* right  margin */
}
```

**Page boundary** — `1.5px dashed crimson` border on the `position: fixed`
element that covers the entire iframe viewport. This represents the physical
paper edge.

**Margin fill** — four `box-shadow: inset` declarations, one per side.

| Shadow parameter | Role |
|---|---|
| x-offset | Horizontal shadow origin. `Lmm` = left band. `-Rmm` = right band. |
| y-offset | Vertical shadow origin. `Tmm` = top band. `-Bmm` = bottom band. |
| blur     | `0` — hard edge, no diffusion. Precision guide requires zero blur. |
| spread   | `0` — shadow area equals offset × viewport width/height exactly. |
| color    | `rgba(220, 20, 60, 0.09)` — 9 % crimson tint (print-technical convention). |

The four shadows overlap at corners without visual artefacts because each fills
only one axis direction.

---

## Layer 2 — Content-Area Boundary (`html::after`)

```css
html::after {
  position: fixed;
  top:    Tmm;
  right:  Rmm;
  bottom: Bmm;
  left:   Lmm;
  border: 0.75px dashed rgba(220, 20, 60, 0.50);
}
```

Positioned inward by the margin values on all four sides, this element frames
the printable content area. The thinner weight (`0.75px`) and reduced opacity
(`50%`) create a visual hierarchy: outer page frame is dominant, inner content
frame is secondary.

---

## Paper Aspect Ratio (modal iframe)

`PrintPreviewModal.updateFrameGeometry()` sets the iframe's CSS `aspect-ratio`
property on every render cycle:

```typescript
const PAPER_DIMS_MM: Record<string, [number, number]> = {
  A3: [297, 420], A4: [210, 297], A5: [148, 210],
  Letter: [216, 279], Legal: [216, 356], Tabloid: [279, 432],
};

const [pw, ph] = PAPER_DIMS_MM[pageSize];
const [w, h]   = orientation === 'landscape' ? [ph, pw] : [pw, ph];
frame.style.aspectRatio = `${w} / ${h}`;
```

The preview area is `display: flex; align-items: center; justify-content:
center`, so the iframe is automatically centred over the grey canvas. CSS
`max-width: 100%; max-height: 100%` constrains it to the available space.

---

## Live vs. Snapshot Behaviour

| Trigger | Behaviour | Mechanism |
|---|---|---|
| Custom margin `−` / `+` click | **Live** — overlay redraws within 250 ms | Each click fires `scheduleRerender(debounce=250ms)` |
| Preset selection (Normal/Narrow/Wide) | **Snapshot** — single rerender on change | `onChange` fires once → `scheduleRerender()` |
| Paper size / Orientation change | **Snapshot** | Same as preset |
| Font size change | No overlay change | Only body typography changes |

---

## Color Specification

| Element | Value | CSS |
|---|---|---|
| Page boundary | Crimson, full opacity | `1.5px dashed crimson` |
| Margin fill | Crimson, 9 % opacity | `rgba(220, 20, 60, 0.09)` |
| Content boundary | Crimson, 50 % opacity | `rgba(220, 20, 60, 0.50)` |
| Preview canvas | Neutral grey | `#b0b0b0` (CSS only) |
| Paper white | White | `#ffffff` (iframe bg) |

`crimson` = `rgb(220, 20, 60)` per CSS Color Level 4.

---

## z-index Layering

```
z-index 9999  html::before   page frame + margin fill (always on top)
z-index 9999  html::after    content boundary
z-index auto  body content   note text, images, tables
```

`pointer-events: none` on both pseudo-elements ensures the content remains
fully interactive in the sandboxed preview.

---

## Print Isolation

All overlay rules are wrapped in `@media screen { }`. The `@page` rule and
print styles are outside this block. At print time:

- `html::before` and `html::after` do not render.
- `box-shadow` on the html element is absent.
- No crimson lines appear in the printed output or saved PDF.

---

## Revision: Content Fit, Inner Box Styling, Margin Persistence

### Content constrained to print area

`@media screen` now includes:

```css
body {
  padding: Tmm Rmm Bmm Lmm !important;
}
```

In print, `@page { margin }` handles content offset. The preview iframe does
not render `@page` rules — without this padding the content runs to the iframe
edges, visually ignoring the overlay guides. The `!important` ensures it
overrides any note-sourced body padding without affecting the printed output,
which remains entirely governed by `@page`.

### Inner bounding box styled

`html::after` changed from a thin dashed guide to a more legible treatment:

```css
html::after {
  border: 1px solid rgba(220, 20, 60, 0.80);       /* solid, 80% crimson */
  box-shadow:
    0 0 0 0.5px rgba(220, 20, 60, 0.15),           /* outer glow ring    */
    inset 0 0 0 0.5px rgba(220, 20, 60, 0.15);     /* inner glow ring    */
  background: rgba(255, 255, 255, 0.55);           /* semi-opaque white  */
}
```

The white fill visually separates the content zone from the 9% crimson margin
tint behind it. The double glow ring (outer + inner 0.5px) gives the boundary
a slight presence without competing with the page frame.

**z-index hierarchy** — revised to ensure correct stacking:

| z-index | Layer | Role |
|---|---|---|
| 9998 | `html::before` | Page frame + margin fill (on top) |
| 9997 | `html::after` | Content boundary (below page frame) |
| auto | `body` content | Note text |

### Custom margin persistence

`PrintPreviewModal` now accepts `plugin: NativePrintPlugin` as a constructor
argument. When `CustomMarginModal.onConfirm` fires:

```typescript
// Update local preview copy (for live rerender)
this.local.marginPreset = 'custom';
this.local.marginTop    = v.top;
// ...

// Write through to plugin.settings + persist to data.json
this.plugin.settings.marginPreset = 'custom';
this.plugin.settings.marginTop    = v.top;
// ...
void this.plugin.saveSettings();   // fire-and-forget; no await needed in callback
```

`plugin.saveSettings()` calls Obsidian's `this.saveData(this.settings)`, which
writes `data.json` in `.obsidian/plugins/native-print/`. The custom values are
available via `await this.loadData()` on the next plugin load.

`print-command.ts` updated to pass `plugin` as the sixth argument to
`PrintPreviewModal`.
