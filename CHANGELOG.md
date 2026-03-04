# Changelog

All notable changes to this project will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.0.0] — 2025-03

### Added
- Android printing via `obsidian-print-helper://` custom URL scheme
- HTML passed as inline base64 — no file permissions needed on API 33+
- Print settings: page size, margins, font size, font family
- Toggle for YAML frontmatter in printed output
- Ribbon icon and command palette entry

### Changed
- Migrated from `MarkdownRenderer.renderMarkdown()` (deprecated) to `MarkdownRenderer.render()`
- `isDesktopOnly` set to `false`

---

## [1.0.0] — Initial release

- Desktop-only print via `window.print()`
