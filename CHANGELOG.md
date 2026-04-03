# Changelog

All notable changes to this project will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased — beta] — 2026-03-28

### Added
- **Print geometry overlay** — dashed crimson guides injected into the preview
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
