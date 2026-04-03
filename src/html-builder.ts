import { PrintPluginSettings } from './settings';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Generates the @media screen CSS block injected into the preview iframe.
 * Never included in printed output — scoped entirely to @media screen.
 *
 * Three responsibilities:
 *   1. body padding  — pushes content inside the margin boundary so the
 *                      preview matches the actual printed layout exactly.
 *   2. html::before  — page outer frame (1.5 px dashed crimson) +
 *                      four box-shadow:inset margin-fill bands (9 % crimson).
 *   3. html::after   — content-area inner boundary: solid crimson, 1 px,
 *                      with a subtle crimson glow and a semi-transparent
 *                      white fill to differentiate it from the margin zone.
 */
function previewOverlayCss(s: PrintPluginSettings): string {
	const { marginTop: T, marginBottom: B, marginLeft: L, marginRight: R } = s;
	return `
    @media screen {
      /* ── Stable full-height reference for fixed children ── */
      html { min-height: 100%; }

      /* ── Push content inside margin boundary ──────────────────────
         In print, @page margin handles this. In the iframe preview
         there is no @page rendering — body padding is the equivalent.
         Set only in @media screen so the printed document is unaffected. */
      body {
        padding: ${T}mm ${R}mm ${B}mm ${L}mm !important;
      }

      /* ── Layer 1: page boundary frame + margin tint ────────────── */
      html::before {
        content: '';
        position: fixed;
        inset: 0;
        border: 1.5px dashed crimson;
        box-shadow:
          inset  0        ${T}mm  0 0 rgba(220, 20, 60, 0.08),
          inset  0       -${B}mm  0 0 rgba(220, 20, 60, 0.08),
          inset  ${L}mm   0       0 0 rgba(220, 20, 60, 0.08),
          inset -${R}mm   0       0 0 rgba(220, 20, 60, 0.08);
        pointer-events: none;
        z-index: 9998;
      }

      /* ── Layer 2: content-area boundary ────────────────────────────
         Solid 1 px crimson line at the margin inset + subtle glow so
         it reads as the "safe zone" not just a decorative rule.
         Semi-transparent white fill visually separates the content
         zone from the margin band without hiding the tint behind it. */
      html::after {
        content: '';
        position: fixed;
        top:    ${T}mm;
        right:  ${R}mm;
        bottom: ${B}mm;
        left:   ${L}mm;
        border: 1px solid rgba(220, 20, 60, 0.80);
        box-shadow:
          0 0 0 0.5px rgba(220, 20, 60, 0.15),
          inset 0 0 0 0.5px rgba(220, 20, 60, 0.15);
        background: rgba(255, 255, 255, 0.55);
        pointer-events: none;
        z-index: 9997;
      }
    }`;
}

/**
 * Wraps a rendered HTML fragment into a complete print-ready document.
 */
function wrapDocument(bodyHtml: string, title: string, s: PrintPluginSettings): string {
	const titleHeading = s.includeTitle
		? `<h1 class="np-doc-title">${escapeHtml(title)}</h1>\n`
		: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: ${s.pageSize} ${s.orientation};
      margin: ${s.marginTop}mm ${s.marginRight}mm ${s.marginBottom}mm ${s.marginLeft}mm;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: ${s.fontFamily};
      font-size: ${s.fontSize}pt;
      line-height: 1.6;
      color: #000;
      background: #fff;
      margin: 0;
    }
    .np-doc-title { margin: 0 0 0.75em; font-size: 1.6em; border-bottom: 1px solid #ccc; padding-bottom: 0.25em; }
    h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
    pre, blockquote, table  { page-break-inside: avoid; }
    img  { max-width: 100%; page-break-inside: avoid; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; }
    a  { color: #000; text-decoration: underline; }
    code { font-family: monospace; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; }
    pre  { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #999; margin: 0; padding-left: 16px; color: #444; }
    hr { border: none; border-top: 1px solid #ccc; margin: 1em 0; }
    ${s.includeYamlFrontmatter ? '' : '.frontmatter, .frontmatter-container { display: none !important; }'}
    ${previewOverlayCss(s)}
  </style>
</head>
<body>${titleHeading}${bodyHtml}</body>
</html>`;
}

/**
 * Encodes the full HTML document as a base64 URL for the Android Print Helper APK.
 */
function toIntentUrl(base64Html: string, s: PrintPluginSettings, docTitle = 'Document'): string {
	const settings = JSON.stringify({
		pageSize:     s.pageSize,
		orientation:  s.orientation,
		marginTop:    s.marginTop,
		marginBottom: s.marginBottom,
		marginLeft:   s.marginLeft,
		marginRight:  s.marginRight,
		docTitle,
	});
	return (
		'obsidian-print-helper://print' +
		`?html=${encodeURIComponent(base64Html)}` +
		`&settings=${encodeURIComponent(settings)}`
	);
}

export const buildHelperUrl = { wrapDocument, toIntentUrl };
