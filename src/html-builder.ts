import { PrintPluginSettings, PAGE_DIMS_MM, PX_PER_MM } from './settings';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * @media screen block — constrains content to the print area.
 * Body width = exact paper width; padding = margin values.
 * overflow:hidden + per-element guards prevent any content spilling
 * past the margin boundary in the preview.
 */
function previewOverlayCss(s: PrintPluginSettings): string {
	const { marginTop: T, marginBottom: B, marginLeft: L, marginRight: R } = s;
	const [pw, ph]   = PAGE_DIMS_MM[s.pageSize] ?? [210, 297];
	const [wMm]      = s.orientation === 'landscape' ? [ph, pw] : [pw, ph];
	const paperWpx   = Math.round(wMm * PX_PER_MM);

	return `
    @media screen {
      body {
        width:   ${paperWpx}px !important;
        padding: ${T}mm ${R}mm ${B}mm ${L}mm !important;
        margin:  0 !important;
        /* Hard clip — nothing escapes the body box in the preview. */
        overflow: hidden !important;
      }
      /* Prevent wide code blocks from overflowing the content column. */
      pre, code {
        white-space:   pre-wrap   !important;
        word-break:    break-all  !important;
        overflow-x:    hidden     !important;
      }
      /* Tables must not push past the content width. */
      table {
        table-layout: fixed !important;
        width:        100%  !important;
      }
      img { max-width: 100% !important; }
    }`;
}

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

function toIntentUrl(base64Html: string, s: PrintPluginSettings, docTitle = 'Document'): string {
	const settings = JSON.stringify({
		pageSize: s.pageSize, orientation: s.orientation,
		marginTop: s.marginTop, marginBottom: s.marginBottom,
		marginLeft: s.marginLeft, marginRight: s.marginRight, docTitle,
	});
	return (
		'obsidian-print-helper://print' +
		`?html=${encodeURIComponent(base64Html)}` +
		`&settings=${encodeURIComponent(settings)}`
	);
}

export const buildHelperUrl = { wrapDocument, toIntentUrl };
