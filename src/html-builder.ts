import { PrintPluginSettings } from './settings';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Wraps a rendered HTML fragment into a complete print-ready document,
 * applying page settings from the plugin's configuration.
 */
function wrapDocument(
	bodyHtml: string,
	title: string,
	s: PrintPluginSettings
): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: ${s.pageSize};
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
    h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
    pre, blockquote, table    { page-break-inside: avoid; }
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
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

/**
 * Encodes the full HTML document as a base64 payload and builds the
 * custom-scheme URL that launches the Print Helper APK.
 *
 * Passing HTML inline (rather than a file path) avoids all Android
 * scoped-storage permission issues on API 33+.
 */
function toIntentUrl(base64Html: string, s: PrintPluginSettings): string {
	const settings = JSON.stringify({
		pageSize: s.pageSize,
		marginTop: s.marginTop,
		marginBottom: s.marginBottom,
		marginLeft: s.marginLeft,
		marginRight: s.marginRight,
	});
	return (
		'obsidian-print-helper://print' +
		`?html=${encodeURIComponent(base64Html)}` +
		`&settings=${encodeURIComponent(settings)}`
	);
}

export const buildHelperUrl = { wrapDocument, toIntentUrl };
