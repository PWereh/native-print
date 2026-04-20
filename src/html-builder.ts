import { App } from 'obsidian';
import { PrintPluginSettings, PAGE_DIMS_MM, PX_PER_MM } from './settings';
import { loadEnabledSnippetsCss } from './snippet-loader';
import { buildRenderingCss } from './render-pipeline';
import { generateImageCss } from './image-processor';

/**
 * Generates CSS for @page margin-box headers and footers.
 * Variables resolved at generation time: {{title}}, {{date}}.
 * {{page}} and {{pages}} use CSS counters — resolved by the print engine.
 */
function buildHeaderFooterCss(s: PrintPluginSettings, title: string): string {
	if (!s.enableHeader && !s.enableFooter) return '';

	const today = new Date().toISOString().slice(0, 10);

	const resolveStatic = (tpl: string): string =>
		tpl.replace(/{{title}}/g, title).replace(/{{date}}/g, today);

	// CSS counter() cannot be used inside content strings derived at JS time —
	// instead we use the @page margin-box with a CSS attr trick: the page/pages
	// are injected via ::before pseudo-elements using CSS counter(page).
	const parts: string[] = [
		`body { counter-reset: page; }`,
		`@page { counter-increment: page; }`,
	];

	if (s.enableHeader) {
		const tpl = resolveStatic(s.headerTemplate);
		// Replace {{page}} / {{pages}} tokens with CSS counter references
		const hasPage  = tpl.includes('{{page}}');
		const hasPages = tpl.includes('{{pages}}');
		if (!hasPage && !hasPages) {
			parts.push(`@page { @top-center { content: "${tpl}"; font-family: ${s.fontFamily}; font-size: 9pt; color: #666; } }`);
		} else {
			// Split around page tokens — reassemble as CSS string concatenation
			const cssContent = tpl
				.replace(/{{page}}/g,  '" counter(page) "')
				.replace(/{{pages}}/g, '" counter(pages) "');
			parts.push(`@page { @top-center { content: "${cssContent}"; font-family: ${s.fontFamily}; font-size: 9pt; color: #666; } }`);
		}
	}

	if (s.enableFooter) {
		const tpl = resolveStatic(s.footerTemplate);
		const cssContent = tpl
			.replace(/{{page}}/g,  '" counter(page) "')
			.replace(/{{pages}}/g, '" counter(pages) "');
		parts.push(`@page { @bottom-center { content: "${cssContent}"; font-family: ${s.fontFamily}; font-size: 9pt; color: #666; } }`);
	}

	return parts.join('\n');
}

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

	const snippetCss = (app && s.enabledSnippets?.length)
		? await loadEnabledSnippetsCss(app, s.enabledSnippets)
		: '';

	// Header / footer — CSS @page margin-box approach.
	// Variables resolved at CSS generation time (date, title) or by the browser
	// print engine (page/pages via counter()).
	const headerFooterCss = buildHeaderFooterCss(s, title);

	// Built-in CSS presets — keyed by id, no file I/O needed
	const PRESET_CSS: Record<string, string> = {
		'mermaid-zoom':   'svg[id^="m"][width][height][viewBox]{max-width:95%;max-height:95%}\ndiv.mermaid{margin-left:0!important;text-align:center;resize:both;overflow:auto;position:relative;max-height:600px;max-width:100%}',
		'callout-border': '.callout{background:transparent!important;border:none!important;border-left:4px solid var(--np-callout-accent,#086DDD)!important;border-radius:0!important}',
		'code-polish':    'pre,code{font-size:9pt!important;background:#f4f4f4!important;border:1px solid #ddd!important;border-radius:3px!important}pre{padding:8px 10px!important}',
		'table-zebra':    'tbody tr:nth-child(even){background:rgba(0,0,0,0.04)!important}',
		'hide-links':     'a{text-decoration:none!important}',
		'compact':        'body{line-height:1.4!important}p,li{margin:0.2em 0!important}h1,h2,h3{margin:0.5em 0 0.25em!important}',
	};
	const presetCss = (s.enabledCssPresets?.length)
		? s.enabledCssPresets.map(k => PRESET_CSS[k] ?? '').filter(Boolean).join('\n')
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
    ${headerFooterCss ? `/* ── Header / Footer ── */\n${headerFooterCss}` : ''}
    ${renderingCss ? `/* ── Rendering ── */\n${renderingCss}` : ''}
    ${imageCss ? `/* ── Images ── */\n${imageCss}` : ''}
    ${presetCss  ? `/* ── CSS Presets ──────────── */\n${presetCss}` : ''}
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
