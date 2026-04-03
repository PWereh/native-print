import { PrintPluginSettings } from './settings';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Generates the @media screen CSS block that overlays print geometry guides
 * inside the preview iframe. Never included in the printed output.
 *
 * Two-layer design (both position:fixed so they don't scroll with content):
 *
 *   html::before — page boundary + margin fill
 *     border:     1.5px dashed crimson            → page outer frame
 *     box-shadow: four inset shadows (one per margin side)
 *                                                  → margin area tint
 *
 *   html::after  — content-area boundary
 *     position:   fixed, inset by margin values   → inner dashed guide
 *     border:     0.75px dashed crimson (50% α)   → printable-area frame
 *
 * Both layers update whenever wrapDocument() is called, so:
 *   • Custom margin steppers  → live (debounced 250 ms per click)
 *   • Preset selection        → snapshot (single rerender on change)
 */
function previewOverlayCss(s: PrintPluginSettings): string {
	const { marginTop: T, marginBottom: B, marginLeft: L, marginRight: R } = s;
	return `
    /* ── Print geometry overlay — screen only ─────────────────────── */
    @media screen {
      /* Ensure the html element fills the viewport so fixed children
         have a stable reference frame inside the sandboxed iframe. */
      html { min-height: 100%; }

      /* ── Layer 1: page boundary frame + margin area tint ── */
      html::before {
        content: '';
        position: fixed;
        inset: 0;
        /* Page boundary — 1.5 px dashed crimson */
        border: 1.5px dashed crimson;
        /* Margin fill — four inset box-shadows, one per side.
           Syntax: inset  x-offset  y-offset  blur  spread  color
           Positive y-offset = shadow grows downward from top edge.
           Negative y-offset = shadow grows upward from bottom edge.
           Positive x-offset = shadow grows rightward from left edge.
           Negative x-offset = shadow grows leftward from right edge.  */
        box-shadow:
          inset    0          ${T}mm   0 0 rgba(220, 20, 60, 0.09),
          inset    0         -${B}mm   0 0 rgba(220, 20, 60, 0.09),
          inset    ${L}mm     0        0 0 rgba(220, 20, 60, 0.09),
          inset   -${R}mm     0        0 0 rgba(220, 20, 60, 0.09);
        pointer-events: none;
        z-index: 9999;
      }

      /* ── Layer 2: content-area inner boundary ── */
      html::after {
        content: '';
        position: fixed;
        top:    ${T}mm;
        right:  ${R}mm;
        bottom: ${B}mm;
        left:   ${L}mm;
        border: 0.75px dashed rgba(220, 20, 60, 0.50);
        pointer-events: none;
        z-index: 9999;
      }
    }`;
}

/**
 * Wraps a rendered HTML fragment into a complete print-ready document,
 * applying page settings from the plugin's configuration.
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
 * Encodes the full HTML document as a base64 payload and builds the
 * custom-scheme URL that launches the Print Helper APK.
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
