# Changelog

All notable changes to this project will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.6.1] — 2026-04-20 | base: 00f9fdb

### Fixed
- **`#preview-pagebreak-001` — page-break algorithm fully replaced**
  Root cause: `scrollHeight` read inside a CSS-scaled iframe returns the
  *scaled* value, not paper-pixel height — making page-count estimation
  systematically wrong.

  New approach — **two-phase measurement**:
  1. **Measure phase**: render HTML into a hidden 1:1 off-screen iframe
     (`left:-9999px`, paper width, no CSS transform). Read
     `contentDocument.scrollHeight` — this is the true document height in
     paper pixels, unaffected by any scale factor. Timeout fallback at 4 s.
  2. **Display phase**: write the same HTML into the visible iframe, set
     `height = nPages × pageH` (all pages present for print), apply
     `transform: scale(…)` to fit available width. Inject per-page overlays.

  Removed: JS page-break script, `allow-scripts` sandbox flag, `postMessage`
  / `msgHandler` / `layoutTimeout` architecture from previous attempts.
  Sandbox reverted to `allow-same-origin` only.
  `removeMsgHandler()` kept as a no-op for compatibility.

## [2.6.0] — 2026-04-18 | base: 742b39f

### Added

**Custom header / footer templates** (Layout tab)
New `enableHeader`, `enableFooter` (boolean) and `headerTemplate`, `footerTemplate`
(string) fields in `PrintPluginSettings`. Defaults: header off, footer off;
default footer template `{{date}}  ·  Page {{page}} of {{pages}}`.
`buildHeaderFooterCss()` in `html-builder.ts` generates CSS `@page` margin-box
rules (`@top-center`, `@bottom-center`). Static variables (`{{title}}`, `{{date}}`)
resolved at generation time. Page counter variables (`{{page}}`, `{{pages}}`)
converted to CSS `counter(page)` / `counter(pages)` references resolved by the
browser print engine. Settings exposed in new **Layout** tab with a variable
reference table.

**Print from file-explorer context menu** (UX)
`main.ts` registers a `file-menu` event listener via `this.registerEvent()`.
Adds "Print note" item (icon: `printer`, section: `action`) to the context menu
of any `.md` file. Calls `triggerPrint(plugin, false, file)` with the right-clicked
`TFile` as an explicit override, bypassing the active-view requirement.
`triggerPrint` / `preparePrint` in `print-command.ts` now accept an optional
`fileOverride?: TFile` — used when printing from the context menu.

### Changed
- `triggerPrint(plugin, skipPreview, file?)` — optional third argument
- `preparePrint` resolves file as: `fileOverride ?? activeView?.file ?? error`
- `PrintPluginSettings` + `DEFAULT_SETTINGS` — four new fields (header/footer)
- Settings tab — new **Layout** pane (sixth vertical tab, icon `layout-template`)

## [2.5.1] — 2026-04-18 | base: 56d43cf

### Fixed
- **Mermaid/post-processors** — container attached to live `document.body` (off-screen hidden div). Post-processors abort on detached nodes; this is the root fix for Mermaid not rendering. UI chrome stripped before capture.
- **Theme-aware callouts** — `getCalloutCss()` reads `--callout-{type}` CSS vars from `getComputedStyle(document.body)`. Derives hex from RGB tuple for border. Adds `--np-callout-accent` so title colour and border both track the active theme.
- **Vertical settings tabs** — `display()` wraps `np-settings-tab-bar` + `np-settings-tab-wrap` in `np-settings-layout` (flex row). Tab bar is `flex-direction:column; width:128px; border-right`. Previously horizontal because no layout wrapper existed.
- **Nude cog** — `background:transparent; border:none; padding:0`. Rotates on hover/active; no pill/circle surround.

### Added
- **CSS presets master toggle** (Snippets tab) — master checkbox labelled "Apply CSS styles" with active-count badge. ON reveals preset list; OFF clears all. Six built-in presets: `mermaid-zoom`, `callout-border`, `code-polish`, `table-zebra`, `hide-links`, `compact`. Injected via `wrapDocument()`. `enabledCssPresets: string[]` added to settings.

## [2.4.0] — 2026-04-11

### Added

#### Print CSS snippets injection
New section **Print CSS snippets** in the Settings tab (deep settings).

- **`src/snippet-loader.ts`** — new module:
  - `listSnippets(app, enabledSnippets)` — reads `<vault>/<configDir>/snippets/`
    via `app.vault.adapter.list()` and returns every `.css` file with its current
    enabled state. Resolves `configDir` from `app.vault.configDir` (normally
    `.obsidian`) so it honours overridden config-folder paths.
  - `loadEnabledSnippetsCss(app, enabledSnippets)` — reads and concatenates all
    enabled snippet files in order. Non-fatal per file; unreadable files are
    silently skipped. Each block is preceded by a `/* ── snippet: filename ── */`
    comment for debuggability in print output.

- **`src/settings.ts`** — `enabledSnippets: string[]` (default `[]`) added to
  `PrintPluginSettings`. `PrintSettingTab.display()` renders the snippet panel:
  snippet rows with filename + toggle switch; **↻ Reload** button refreshes the
  list from disk. Toggling a snippet persists immediately via `saveSettings()`.

- **`src/html-builder.ts`** — `wrapDocument()` is now `async`. Accepts optional
  `app?: App` fourth argument. When snippets are enabled, `loadEnabledSnippetsCss()`
  is awaited and injected inside the document `<style>` block, after all base
  styles and before the `@media screen` preview overlay CSS. Snippet CSS therefore
  overrides base rules but is overridden by preview-only constraints.

- Callers updated:
  - `print-command.ts` — `preparePrint()` now `await`s `wrapDocument()`, passes `plugin.app`.
  - `print-preview-modal.ts` — Print button uses a `void (async () => { … })()` IIFE;
    `renderFrame()` chains `.then(html => frame.srcdoc = html)` on the promise.

- **`styles.css`** — snippet panel UI: `.np-snippet-list`, `.np-snippet-row`,
  `.np-snippet-name`, custom toggle (`label + ::after` pill, accent colour when
  checked), reload button, empty-state message.

#### Observed issues logged

**`#mermaid-codeblock-001` — Mermaid diagrams print as code blocks**
Obsidian renders Mermaid diagrams dynamically via a post-processor that fires
after `MarkdownRenderer.render()` returns. The rendered container captures the
pre-processor HTML (`<pre><code class="language-mermaid">…</code></pre>`) rather
than the SVG the user sees on screen.
Fix direction: capture the live DOM from the active MarkdownView rather than
re-rendering from markdown source, or wait for post-processors via a
`Component` lifecycle hook.

### Changed

#### Orientation implementation — novel Android approach (documented)
`@page { size: A4 landscape }` works in desktop browsers but has no effect on
Android's `PrintManager`. The correct Android API is:

```kotlin
PrintAttributes.MediaSize.ISO_A4.asPortrait()   // or
PrintAttributes.MediaSize.ISO_A4.asLandscape()
```

`MainActivity.kt` calls `buildMediaSize(settings)` which maps the `pageSize`
string to the appropriate `PrintAttributes.MediaSize` constant, then calls
`.asPortrait()` or `.asLandscape()` depending on the `orientation` field from
the settings JSON. This is believed to be the first Obsidian plugin to implement
orientation-aware Android printing — the standard PDF approach of relying on
`@page` CSS is ineffective on Android's print stack.

## [2.3.0] — 2026-04-08

### Added

#### Code-block text-wrap (`codeWrap`)
New setting and preview-toolbar toggle. When **on**, long lines inside `<pre>`
and `<code>` blocks wrap (`white-space: pre-wrap; word-break: break-all`).
When **off** (default), natural line breaks are preserved and the block scrolls
horizontally in the preview (`overflow-x: auto`). Useful for printing code-heavy
notes where truncation would hide content.

#### Image inline embedding (`inlineImages`)
New setting (default **on**). After Obsidian renders the markdown, every `<img>`
element whose `src` resolves to a vault file is replaced with a `data:` URI
containing the base64-encoded file contents. Resolution covers:
- `app://local/` Obsidian internal scheme
- Vault-relative paths
- Bare filenames via `fileMap` (handles cross-folder references)
- `MetadataCache.getFirstLinkpathDest` fallback for wikilink short names

Supported formats: PNG, JPEG, GIF, WebP, SVG, BMP.
Non-fatal: if a file cannot be read, the original `src` is left unchanged.
**Required for images to print on Android** — without inlining, the APK
receives an HTML file it has no access to load vault images from.

#### True-colour output (`trueColour`)
New setting and preview-toolbar toggle (default **off**). When **off**, the
output forces `body { color: #000 }` and `a { color: #000 }` for printer
economy. When **on**, all original note colours are preserved — useful for
notes with intentional colour coding, callout highlights, or brand styling.

### Changed
- `renderer.ts` `renderNoteToHtml()` accepts optional `inlineImages: boolean`
  (fourth argument). Called from `print-command.ts` with `plugin.settings.inlineImages`.
- `html-builder.ts` `wrapDocument()` generates `colourRules` and `codeWrapRule`
  blocks conditionally; `body { color }` and `a { color }` are no longer hardcoded.
- Preview toolbar: `Wrap` and `Colour` circle toggles added alongside `Title`/`Metadata`.
- Settings tab: new **Output quality** section with three toggles.

## [2.2.0] — 2026-04-08

### Known issues (deferred to next cycle)

#### `#preview-pagebreak-001` — Page-break algorithm: content truncation, spurious heading gaps, tail-end misalignment

Three failure modes remain unresolved after two passes (`2bcb3ef`, `77b3f13`):

1. **Content truncated at margin borders** — `splitPre()` estimates line height as
   `rect.height / lines.length`. Syntax-highlight spans, padding, and border decorators
   cause variable-height lines; `curY` diverges from actual layout, splitting mid-line
   instead of between lines.

2. **Spurious gaps after subheadings** — Pass 1 inserts a spacer before any element
   whose bottom edge crosses `cntEnd(page)`. Short `h2`/`h3` elements trigger this
   even when the following paragraph would fit on the same page, producing large blank
   zones after headings.

3. **Tail-end rendering artefact** — Injected spacer divs inflate `scrollH` beyond
   `nPages × PAGE_H`. The overlay and gap-bar calculation uses the pre-script page count,
   causing the final page overlay to be misaligned with the actual iframe content height.

**Root cause:** `getBoundingClientRect` values inside a sandboxed, CSS-scaled iframe are
unreliable for sub-element line measurement. There is no way to determine rendered line
height per node type without injecting calibration elements.

**Proposed fix direction (next cycle):** Render at 1:1 scale in a hidden off-screen
iframe, measure, inject spacers, then reload at display scale. Alternatively, use the
browser's native print fragmentation in a `@media print` hidden iframe to derive break
points, then mirror them into the preview.

### Added (v2.2.0 feature set — delivered on beta)

- Live print preview with per-page engineering overlay (margin bands, corner targets)
- Custom margin sub-modal with sliders (5 mm) + steppers (1 mm), thumb-friendly layout
- Paper aspect ratio preview (A3/A4/A5/Letter/Legal/Tabloid, portrait + landscape)
- Orientation cast to Android `PrintAttributes.MediaSize.asPortrait/asLandscape()`
- Note filename threaded as Android print job name and PDF filename
- Page-number counter (glass/mica popup, fades 1.6 s after scroll)
- Custom margin values persisted to `data.json` (survive plugin reload + app restart)
- `savedCustomMargins` — custom values restored across preset switches within a session
- `obelix-builder` skill §9 Termux workflow added

## [Unreleased — beta] — 2026-04-05 (r2)

### Fixed
- **Content no longer spills into margins** — `.np-margin-band` now uses
  `background-color: #ffffff` (solid white, matches paper) as the base.
  Any iframe content overflowing past `body { padding }` is completely
  hidden under the opaque white band. Engineering diagonal hatch rendered
  on top with `repeating-linear-gradient(-45deg, …)` at 4.5 px pitch.
- **Corner circle line weight reduced** — `.np-corner-target::after` border
  changed from `1.5px` to `1px solid rgba(160,30,30,0.80)`. Lighter,
  more precise feel matching the crosshair weight.

### Added
- **Sliders in custom margin sub-modal** — each margin row now contains a
  full-width `<input type="range" min="0" max="50">` below the stepper
  buttons. Slider and steppers are bidirectionally synced; moving either
  updates both controls and the live preview.
- **Custom margin memory across preset switches** — `savedCustomMargins`
  field in `PrintPreviewModal` seeds from `plugin.settings` on open (if
  `marginPreset === 'custom'`) and is updated on every Apply. Opening
  "Custom…" always restores the last user-typed values, even after
  temporarily switching to Normal/Narrow/Wide and back.
- **Save on Print** — clicking 🖨 Print now writes the full `this.local`
  state (including any toolbar-only changes like paper size or orientation)
  to `plugin.settings` before printing, ensuring all settings persist.
- **Targeted margin persistence** — on CustomMarginModal Apply, only the
  five margin fields (`marginPreset`, `marginTop/Bottom/Left/Right`) are
  written to `plugin.settings` immediately. Other toolbar changes are saved
  on Print. This avoids overwriting unsaved toolbar state.

## [Unreleased — beta] — 2026-04-05

### Added
- **Engineering corner targets** — four 22×22 px crosshair markers at the
  corners of the print-area boundary. Two CSS background-image gradients
  draw the 1.5 px H/V lines; `::after` draws a 7 px circle with white fill
  at the intersection. Tone: `rgba(160,30,30,0.90)` — slightly darker and
  heavier than the margin guide border.
- **Diagonal hatching on margin bands** — four `.np-margin-band` divs cover
  each margin side. Background: light grey `rgba(195,195,200,0.55)` +
  `repeating-linear-gradient(-45deg, …)` at 5 px pitch, 1 px dark stroke.
  Print area centre has no band, so the iframe content shows through cleanly.
- **Disappearing page counter** — glass/mica `div.np-page-counter` absolutely
  positioned on the preview area (z-index 100). Appears on scroll
  (`np-pc-visible` → `opacity:1`), fades out 1.6 s after last scroll event.
  Format: `currentPage / totalPages`. Mica finish: `backdrop-filter:blur(22px)
  saturate(1.7)`, dark translucent bg, pill border-radius.

### Fixed
- **Content overflow into margins** — `html-builder.ts` `@media screen` block
  now adds `overflow:hidden !important` to `body`, `pre/code { white-space:
  pre-wrap; word-break:break-all; overflow-x:hidden }`, `table { table-layout:
  fixed }`, `img { max-width:100% }`. No content escapes the print area in the
  preview.

## [Unreleased — beta] — 2026-04-04 (r3)

### Changed
- **Per-page overlays in scroll layer** — paper boundary and margin guides
  are now `position:absolute` inside the wrapper, one per page, scrolling
  with the content. Each `.np-page-overlay` is sized to the scaled page
  footprint and sits at its exact page slot (`top = i × scaledPageH + i × PAGE_GAP_PX`).
  The inner `.np-margin-guide` is positioned from mm values converted to
  scaled screen px (`mm × PX_PER_MM × scale`).
- **Single scroll layer** — removed the static `np-paper-outline` overlay.
  All elements (iframe, page gap bars, page overlays) are in one
  `.np-scroll-canvas → .np-scroll-pad → .np-frame-wrapper` hierarchy.
- **z-index stack inside wrapper**:
  `iframe (1) → .np-page-gap (5) → .np-page-overlay (10)`.
  Page overlays use `outline` not `border` so they don't affect layout.
  `overflow:hidden` on each overlay prevents content bleeding into gap areas.

## [Unreleased — beta] — 2026-04-04 (r2)

### Changed
- **Static paper bounding box** — paper outline is now `position:absolute`
  in the preview area (z-index 10) and never scrolls. Content, page breaks,
  and gap bars scroll behind it through `.np-scroll-canvas` (z-index 1).
- **Two-layer canvas architecture**:
  - `.np-scroll-canvas` (`position:absolute; inset:0; overflow-y:auto`) — the
    scrollable layer containing the iframe wrapper and gap divs.
  - `.np-paper-outline` (`position:absolute; z-index:10`) — static overlay
    showing the paper boundary. Centred via `left:50%; translateX(-50%)`.
  - `.np-margin-guide` — inner div inside the outline, positioned by JS from
    margin mm values × scale, showing the printable-area boundary.
- **Page-gap divs** — on iframe load, `onFrameLoaded()` injects `.np-page-gap`
  divs (grey, `PAGE_GAP_PX = 10`) at each page break position inside the
  wrapper. Wrapper height = scaled content + `(nPages-1) × PAGE_GAP_PX`.
- **Removed iframe pseudo-elements** — `html::before`, `html::after`,
  `repeating-linear-gradient` all removed from `html-builder.ts`. They caused
  incorrect `position:fixed` behaviour in multi-page tall iframes. All visual
  guides are now DOM elements in the modal coordinate space.
- **`html-builder.ts` simplified** — `@media screen` block now only sets
  `body { width: paperWpx; padding: margins; margin: 0 }` for accurate layout.

## [Unreleased — beta] — 2026-04-04

### Changed
- **Print preview now renders at exact paper scale** — iframe is sized to
  physical paper dimensions (e.g. A4 = 793 × 1122 px at 96 dpi) and
  CSS-scaled down to fit the preview area width. Content layout inside
  the iframe matches the actual printed page exactly, not the iframe container.
- **Page break visualisation** — `repeating-linear-gradient` on `html`
  background draws a 3 px crimson rule (with 1 px feather) every page-height
  interval. Page breaks are accurate: they fall at exactly every `pageHeightPx`
  from the document origin, matching `@page` boundaries.
- **Multi-page scroll** — preview area is now `overflow-y: auto`. After each
  iframe load event, `onFrameLoaded()` reads `scrollHeight`, computes page
  count, and extends the iframe + wrapper to cover all pages. Users can scroll
  the full document.
- **Wrapper/iframe architecture** — a `.np-frame-wrapper` div holds the scaled
  footprint (so the scroll canvas is correct); the iframe is `position:absolute`
  inside it at full paper size then `transform:scale()` shrinks it visually.
- **`PAGE_DIMS_MM` and `PX_PER_MM` exported from `settings.ts`** — shared
  between `html-builder.ts` and `print-preview-modal.ts`; previously duplicated.

## [Unreleased — beta] — 2026-04-03

### Fixed
- **Content now constrained to print area** — `@media screen` adds
  `body { padding: Tmm Rmm Bmm Lmm !important }` so preview content is
  visually inside the margin boundary, matching actual print output.
  (`@page` handles this at print time; the iframe does not render `@page`.)
- **Content-area bounding box styled** — `html::after` changed from a thin
  dashed guide to `1px solid rgba(220,20,60,0.80)` with a double 0.5 px
  crimson glow ring and a `rgba(255,255,255,0.55)` white fill. The fill
  separates the print zone from the 9% crimson margin tint behind it.
- **Custom margins now persistent** — `PrintPreviewModal` receives
  `plugin: NativePrintPlugin`. On `CustomMarginModal` Apply, margins are
  written to both `this.local` (live preview) and `plugin.settings`
  (persisted via `plugin.saveSettings()` → `data.json`). Values survive
  modal close, plugin reload, and app restart.

 — dashed crimson guides injected into the preview
  iframe via `@media screen` CSS (never printed):
  - `html::before` — 1.5 px dashed crimson page boundary + four `box-shadow:
    inset` margin-fill bands (one per side, 9 % crimson tint).
  - `html::after` — 0.75 px dashed crimson content-area boundary, inset by
    the current margin values.
  - Updates **live** (250 ms debounce) on every custom-margin stepper click.
  - Updates as a **snapshot** (single rerender) on preset and paper-size changes.
- **Paper aspect ratio** — preview iframe `aspect-ratio` set dynamically to
  the selected paper size + orientation (A3/A4/A5/Letter/Legal/Tabloid).
  Iframe is centred over a neutral grey canvas; shrinks to fit available height.
- **Design spec** — `docs/print-geometry-overlay.md` documents overlay
  architecture, layer breakdown, color spec, z-index stack, and live/snapshot
  behaviour table.
  a focused margin editor (Top / Bottom / Left / Right steppers). The preview
  modal blurs and becomes non-interactive while the sub-modal is active; clicking
  Apply returns to the live preview with updated values.
- **Orientation control** — Portrait / Landscape in preview toolbar and settings tab.
  Value is serialised into the APK intent URL and applied to Android `PrintAttributes`
  via `MediaSize.asPortrait()` / `asLandscape()`.
- **Full page size support on Android** — A3, A4, A5, Letter, Legal, Tabloid all
  map to the correct `PrintAttributes.MediaSize` constant in the APK.
- **Note filename threaded to Android print manager** — the note basename is now
  passed as `docTitle` in the settings JSON. The APK uses it as the `PrintManager`
  job name, so the print queue entry and any saved PDF are named after the note.

### Changed
- `toIntentUrl` now includes `orientation` and `docTitle` in the serialised JSON payload.
- `getPrintExecutor` and `sendToAndroidHelper` accept `title: string` parameter
  so the note name is available at URL-construction time.
- APK `PrintViewModel.Success` now carries `docTitle`.
- APK `MainActivity.doPrint` uses `docTitle` as job name; `buildMediaSize()` handles
  all six paper sizes and maps orientation correctly.

---

## [2.1.1] — 2026-03-28

### Added
- OneUI-inspired translucent glass modal bezel (`rgba(13,13,18,0.93)`, `blur(32px)`,
  `border-radius: 22px`, layered `box-shadow`).
- Toolbar repositioned to the lower quarter below the preview iframe.
- Orientation (Portrait / Landscape) added to toolbar and settings.
- Circle-checkbox toggles for Title and Metadata.
- `🖨` printer icon on both platforms (replaced `⬡` Android symbol).

---

## [2.1.0] — 2026-03-28

### Added
- Live-updating print preview modal with 250 ms debounce.
- Expanded paper sizes: A3, A4, A5, Letter, Legal, Tabloid.
- Margin presets: Normal / Narrow / Wide.
- `includeTitle` setting — prints note filename as H1 heading.
- Termux build workflow (`deploy.sh`, `node node_modules/…` scripts).
- `npm run deploy` command for one-step Termux → vault deployment.

---

## [2.0.1] — 2026-03-20

### Fixed
- APK: scheme mismatch (`native-print-helper` → `obsidian-print-helper`).
- APK: `finish()` removed from `doPrint()` — was destroying Activity while
  `PrintDocumentAdapter` was still rendering asynchronously.
- APK: `StateFlow` re-delivery on `repeatOnLifecycle` restart fixed via
  `resetState()` called before `triggerPrint()`.
- APK: `WebView` now attached via `setContentView()` before loading HTML.
- Plugin: `btoa()` output converted to URL-safe base64 before encoding.
- Plugin: `anchor.click()` replaces `window.open()` for Android dispatch.

---

## [2.0.0] — 2026-03

### Added
- Android printing via `obsidian-print-helper://` custom URL scheme.
- HTML passed as inline base64 — no file permissions needed on API 33+.
- Print preview modal with iframe.
- Settings: page size, margins, font size, font family, frontmatter toggle.
- Ribbon icon + command palette entry.

### Changed
- Migrated from deprecated `MarkdownRenderer.renderMarkdown()` to `MarkdownRenderer.render()`.
- `isDesktopOnly` set to `false`.

---

## [1.0.0] — Initial release

- Desktop-only print via `window.print()`.
