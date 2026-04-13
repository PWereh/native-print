import { App } from 'obsidian';
import { PrintPluginSettings, PAGE_DIMS_MM, PX_PER_MM } from './settings';
import { loadEnabledSnippetsCss } from './snippet-loader';
import { buildRenderingCss } from './render-pipeline';
import { generateImageCss } from './image-processor';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function previewOverlayCss(s: PrintPluginSettings): string {
	const [pw, ph] = PAGE_DIMS_MM[s.pageSize] ?? [210, 297];
	const [wMm]    = s.orientation === 'landscape' ? [ph, pw] : [pw, ph];
	const paperWpx = Math.round(wMm * PX_PER_MM);
	const { marginTop: T, marginBottom: B, marginLeft: L, marginRight: R } = s;
	return `
    @media screen {
      body {
        width:     ${paperWpx}px !important;
        padding:   ${T}mm ${R}mm ${B}mm ${L}mm !important;
        margin:    0 !important;
        overflow:  hidden !important;
        max-width: ${paperWpx}px !important;
      }
      body > * { max-width: 100% !important; overflow: hidden !important; }
      pre, code, kbd, samp {
        white-space: pre-wrap !important;
        word-break:  break-all !important;
        overflow-x:  hidden    !important;
        max-width:   100%      !important;
      }
      table { table-layout: fixed !important; width: 100% !important; overflow: hidden !important; }
      td, th { overflow: hidden !important; word-break: break-word !important; }
      img    { max-width: 100% !important; height: auto !important; }
    }`;
}

/**
 * Assembles a complete, self-contained print-ready HTML document.
 * Includes: rendering CSS (callouts, mermaid, tasks), image CSS, and enabled snippets.
 */
async function wrapDocument(
	bodyHtml: string,
	title:    string,
	s:        PrintPluginSettings,
	app?:     App
): Promise<string> {
	const titleHeading = s.includeTitle
		? `<h1 class="np-doc-title">${escapeHtml(title)}</h1>\n`
		: '';

	const colourRules = s.trueColour
		? ''
		: `body { color: #000; background: #fff; }\n    a { color: #000; }`;

	const codeWrapRule = s.codeWrap
		? `pre, code { white-space: pre-wrap !important; word-break: break-all !important; }`
		: `pre { overflow-x: auto; }`;

	const snippetCss    = (app && s.enabledSnippets?.length)
		? await loadEnabledSnippetsCss(app, s.enabledSnippets)
		: '';

	const renderingCss  = buildRenderingCss(s);
	const imageCss      = generateImageCss(s);

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
    body { font-family: ${s.fontFamily}; font-size: ${s.fontSize}pt; line-height: 1.6; margin: 0; }
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
    ${renderingCss ? `/* ── Rendering ── */\n${renderingCss}` : ''}
    ${imageCss ? `/* ── Images ── */\n${imageCss}` : ''}
    ${snippetCss ? `/* ── Print CSS Snippets ── */\n${snippetCss}` : ''}
    ${previewOverlayCss(s)}
  </style>
</head>
<body>${titleHeading}${bodyHtml}</body>
</html>`;
}

function toIntentUrl(base64Html: string, s: PrintPluginSettings, docTitle = 'Document'): string {
	const settings = JSON.stringify({
		pageSize:    s.pageSize,    orientation:  s.orientation,
		marginTop:   s.marginTop,   marginBottom: s.marginBottom,
		marginLeft:  s.marginLeft,  marginRight:  s.marginRight,
		docTitle,
	});
	return (
		'obsidian-print-helper://print' +
		`?html=${encodeURIComponent(base64Html)}` +
		`&settings=${encodeURIComponent(settings)}`
	);
}

export const buildHelperUrl = { wrapDocument, toIntentUrl };
