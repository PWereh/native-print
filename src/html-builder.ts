import { PrintPluginSettings, PAGE_DIMS_MM, PX_PER_MM } from './settings';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * @media screen CSS injected into every srcdoc render. Never printed.
 *
 * Three layers:
 *   body          — fixed pixel width matching paper; padding = margin values
 *   html::before  — page outer frame (1.5 px dashed crimson) + margin tint bands
 *   html::after   — content-area inner boundary (solid crimson, glow, white fill)
 *
 * Page break visualisation:
 *   html background — repeating-linear-gradient draws a 3 px crimson rule
 *   at exactly every pageHeightPx, producing accurate page break previews.
 *   The gradient position is independent of content so breaks are always correct.
 */
function previewOverlayCss(s: PrintPluginSettings): string {
	const { marginTop: T, marginBottom: B, marginLeft: L, marginRight: R } = s;
	const [pw, ph] = PAGE_DIMS_MM[s.pageSize] ?? [210, 297];
	const [wMm, hMm] = s.orientation === 'landscape' ? [ph, pw] : [pw, ph];
	const paperWpx  = Math.round(wMm * PX_PER_MM);
	const pageHpx   = Math.round(hMm * PX_PER_MM);

	return `
    @media screen {
      /* ── Stable reference frame for all fixed children ── */
      html {
        min-height: 100%;
        background-color: #fff;

        /* Page break line: 3 px crimson rule, with a 1 px feather on each side.
           Pattern repeats every pageHpx — aligns exactly with @page boundaries. */
        background-image: repeating-linear-gradient(
          to bottom,
          transparent 0px,
          transparent calc(${pageHpx}px - 2px),
          rgba(220, 20, 60, 0.25) calc(${pageHpx}px - 2px),
          rgba(220, 20, 60, 0.90) calc(${pageHpx}px - 1px),
          rgba(220, 20, 60, 0.90) ${pageHpx}px,
          rgba(220, 20, 60, 0.25) ${pageHpx}px,
          rgba(220, 20, 60, 0.25) calc(${pageHpx}px + 1px),
          transparent            calc(${pageHpx}px + 1px)
        );
      }

      /* ── Content layout at exact paper dimensions ── */
      body {
        width:   ${paperWpx}px !important;
        /* Padding mirrors @page margin — in print @page handles this; the
           iframe does not render @page, so padding is the screen equivalent. */
        padding: ${T}mm ${R}mm ${B}mm ${L}mm !important;
        margin:  0 !important;
      }

      /* ── Layer 1: page outer boundary + margin tint ── */
      html::before {
        content: '';
        position: fixed;
        inset: 0;
        border: 1.5px dashed crimson;
        box-shadow:
          inset  0        ${T}mm  0 0 rgba(220, 20, 60, 0.07),
          inset  0       -${B}mm  0 0 rgba(220, 20, 60, 0.07),
          inset  ${L}mm   0       0 0 rgba(220, 20, 60, 0.07),
          inset -${R}mm   0       0 0 rgba(220, 20, 60, 0.07);
        pointer-events: none;
        z-index: 9998;
      }

      /* ── Layer 2: content-area inner boundary ── */
      html::after {
        content: '';
        position: fixed;
        top:    ${T}mm;
        right:  ${R}mm;
        bottom: ${B}mm;
        left:   ${L}mm;
        border: 1px solid rgba(220, 20, 60, 0.80);
        box-shadow:
          0 0 0 0.5px rgba(220, 20, 60, 0.18),
          inset 0 0 0 0.5px rgba(220, 20, 60, 0.18);
        background: rgba(255, 255, 255, 0.50);
        pointer-events: none;
        z-index: 9997;
      }
    }`;
}

/**
 * Wraps a rendered HTML fragment into a complete, self-contained print document.
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
 * Builds the obsidian-print-helper:// URL that launches the Android APK.
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
