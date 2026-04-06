import { PrintPluginSettings, PAGE_DIMS_MM, PX_PER_MM } from './settings';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Generates the page-break JavaScript injected into every srcdoc render.
 *
 * Algorithm — single top-to-bottom pass over direct body children:
 *   For each element, if it overflows into the bottom margin zone of its
 *   current page (i.e. elBot > (page+1)*PAGE_H - M_BOT), a spacer div is
 *   inserted before it with enough height to push the element to the top of
 *   the next page's content area. Elements taller than one content area are
 *   skipped (can't be broken without splitting the element).
 *
 * When complete, the script posts { type:'np-layout-ready', scrollH } to the
 * parent window so the modal can read the final document height without a race
 * condition against the iframe's own load event.
 *
 * Requires sandbox="allow-scripts allow-same-origin".
 */
function pageBreakScript(pageHpx: number, mTopPx: number, mBotPx: number): string {
	const contentH = pageHpx - mTopPx - mBotPx;
	return `<script>
(function () {
  var PAGE_H    = ${pageHpx};
  var M_TOP     = ${mTopPx};
  var M_BOT     = ${mBotPx};
  var CONTENT_H = ${contentH};

  function run() {
    var children = Array.from(document.body.children);
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      if (el.dataset.npSpacer) continue;

      var rect  = el.getBoundingClientRect();
      var elTop = rect.top + window.scrollY;
      var elBot = elTop + rect.height;

      // Skip elements taller than one content area — can't single-break them.
      if (rect.height > CONTENT_H) continue;

      var page   = Math.floor(elTop / PAGE_H);
      var cntEnd = (page + 1) * PAGE_H - M_BOT;   // content zone end this page

      if (elBot > cntEnd) {
        // Insert spacer: push element to top of next page's content area.
        var pushTo = (page + 1) * PAGE_H + M_TOP;
        var gap    = Math.ceil(pushTo - elTop);
        if (gap > 0) {
          var sp = document.createElement('div');
          sp.dataset.npSpacer = '1';
          sp.style.cssText = 'display:block;height:' + gap + 'px;';
          el.parentNode.insertBefore(sp, el);
        }
      }
    }

    try {
      window.parent.postMessage({
        type: 'np-layout-ready',
        scrollH: document.documentElement.scrollHeight
      }, '*');
    } catch (e) {}
  }

  // Two rAFs after DOMContentLoaded ensures getBoundingClientRect is valid.
  function schedule() {
    requestAnimationFrame(function () { requestAnimationFrame(run); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
}());
<\/script>`;
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
	const [pw, ph]   = PAGE_DIMS_MM[s.pageSize] ?? [210, 297];
	const [wMm, hMm] = s.orientation === 'landscape' ? [ph, pw] : [pw, ph];
	const pageHpx    = Math.round(hMm * PX_PER_MM);
	const mTopPx     = Math.round(s.marginTop    * PX_PER_MM);
	const mBotPx     = Math.round(s.marginBottom * PX_PER_MM);

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
${pageBreakScript(pageHpx, mTopPx, mBotPx)}
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
