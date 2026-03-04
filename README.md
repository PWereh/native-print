# Native Print

An [Obsidian](https://obsidian.md) plugin that prints the current note on desktop via the browser print dialog, and on Android via the [Obsidian Print Helper](https://github.com/PWereh/obsidian-print-helper) companion APK.

No file permissions required on Android (API 33+). HTML is passed inline via a custom URL scheme — no `READ_EXTERNAL_STORAGE` or scoped-storage handling needed.

---

## Features

- **Desktop** — triggers `window.print()` directly
- **Android** — renders the note to HTML and launches the Print Helper APK via a custom scheme URL
- Page size: A4 / Letter / Legal
- Configurable margins, font size, font family
- Optional YAML frontmatter in output
- Ribbon icon + command palette entry

## Installation

### From Obsidian Community Plugins *(pending)*

Search for **Native Print** in Settings → Community Plugins.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/PWereh/native-print/releases/latest)
2. Copy them into `<vault>/.obsidian/plugins/native-print/`
3. Enable the plugin in Settings → Community Plugins

## Android Setup

See [docs/android-setup.md](docs/android-setup.md) for instructions on installing the companion APK.

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production bundle
npm run lint     # eslint
```

Requires Node 18+.

## Release

Push a semver tag to trigger the release workflow:

```bash
npm run version   # bumps manifest.json + versions.json, stages both
git commit -m "chore: release 2.1.0"
git tag 2.1.0
git push && git push --tags
```

GitHub Actions will build and publish a release with `main.js`, `manifest.json`, and `styles.css`.

## License

[MIT](LICENSE)
