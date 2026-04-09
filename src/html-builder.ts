import { PrintPluginSettings, PAGE_DIMS_MM, PX_PER_MM } from './settings';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function previewOverlayCss(s: PrintPluginSettings): string {
	const { marginTop: T, marginBottom: B, marginLeft: L, marginRight: R } = s;
	const [pw, ph]   = PAGE_DIMS_MM[s.pageSize] ?? [210, 297];
	const [wMm]      = s.orientation === 'landscape' ? [ph, pw] : [pw, ph];
	const paperWpx   = Math.round(wMm * PX_PER_MM);

	return `
    @media screen {
      /* ── Content area exact to paper ──────────────────────────────── */
      body {
        width:   ${paperWpx}px !important;
        padding: ${T}mm ${R}mm ${B}mm ${L}mm !important;
        margin:  0 !important;
        overflow: hidden !important;
        /* Contain all children: nothing grows beyond the body box. */
        max-width: ${paperWpx}px !important;
      }
      /* Constrain every direct block-level child to the content width. */
      body > * {
        max-width: 100% !important;
        overflow:  hidden !important;
      }
      /* Code: wrap aggressively — never extend past content column. */
      pre, code, kbd, samp {
        white-space: pre-wrap  !important;
        word-break:  break-all !important;
        overflow-x:  hidden    !important;
        max-width:   100%      !important;
      }
      /* Tables: fixed layout prevents table cells from stretching. */
      table {
        table-layout: fixed  !important;
        width:        100%   !important;
        overflow:     hidden !important;
      }
      td, th { overflow: hidden !important; word-break: break-word !important; }
      img    { max-width: 100% !important; height: auto !important; }
    }`;
}

function wrapDocument(bodyHtml: string, title: string, s: PrintPluginSettings): string {
	const titleHeading = s.includeTitle
		? `<h1 class="np-doc-title">${escapeHtml(title)}</h1>\n`
		: '';

	// True-colour: when OFF force black text/links for printer economy.
	// When ON preserve the note's original colours.
	const colourRules = s.trueColour
		? ''
		: `body { color: #000; background: #fff; }
    a  { color: #000; }`;

	// Code-wrap: when ON, long lines wrap (better for print).
	// When OFF, honour natural line breaks (default behaviour).
	const codeWrapRule = s.codeWrap
		? `pre, code { white-space: pre-wrap !important; word-break: break-all !important; }`
		: `pre { overflow-x: auto; }`;

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
      margin: 0;
    }
    ${colourRules}
    .np-doc-title { margin: 0 0 0.75em; font-size: 1.6em; border-bottom: 1px solid #ccc; padding-bottom: 0.25em; }
    h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
    pre, blockquote, table  { page-break-inside: avoid; }
    img  { max-width: 100%; page-break-inside: avoid; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; }
    a  { text-decoration: underline; }
    code { font-family: monospace; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; }
    pre  { background: #f5f5f5; padding: 12px; border-radius: 4px; }
    pre code { background: none; padding: 0; }
    ${codeWrapRule}
    blockquote { border-left: 3px solid #999; margin: 0; padding-left: 16px; }
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
