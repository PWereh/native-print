# Android Setup

Printing on Android requires the **Obsidian Print Helper** companion app. The plugin sends the rendered note HTML directly to the companion app via a custom URL scheme — no file permissions are needed.

## Steps

1. **Install the companion APK**
   - Download `obsidian-print-helper.apk` from the [Print Helper releases](https://github.com/PWereh/obsidian-print-helper/releases/latest)
   - On your Android device: Settings → Apps → Install unknown apps → allow your browser/file manager
   - Open the downloaded APK and install it

2. **Enable the plugin in Obsidian**
   - Settings → Community Plugins → Native Print → toggle on

3. **Print a note**
   - Open any note
   - Tap the printer icon in the ribbon, or use the command palette: *Print current note*
   - The Print Helper app will open and display the Android print dialog

## How it works

The plugin renders the current note to HTML using Obsidian's `MarkdownRenderer`, wraps it in a print-ready document with your configured page settings, encodes the result as base64, and launches:

```
obsidian-print-helper://print?html=<base64>&settings=<json>
```

The companion APK receives this URL, decodes the HTML, and loads it into an `Android.webkit.WebView` before calling `PrintManager.print()`.

## Notes

- Works on Android API 26+ (Obsidian minimum)
- Tested on API 33+ (no scoped-storage issues by design)
- Very large notes (>900 KB encoded) may have embedded images omitted — a notice will warn you
