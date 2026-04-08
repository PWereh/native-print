import { PrintPluginSettings, PAGE_DIMS_MM, PX_PER_MM } from './settings';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Page-break algorithm injected into every srcdoc.
 *
 * Two-pass approach:
 *   Pass 1 — short elements  (height ≤ CONTENT_H):
 *     If the element overflows the bottom margin zone of its current page,
 *     insert a spacer div before it to push it to the top of the next page's
 *     content area.
 *
 *   Pass 2 — tall elements, specifically <pre> blocks (height > CONTENT_H):
 *     Walk every pre/code block. For each page boundary that falls inside it,
 *     split the block's text at the nearest line break before that boundary
 *     and insert a spacer between the two halves. This removes the "content
 *     hidden under white margin band" problem for long code blocks.
 *
 * Line-height estimate: rect.height / line_count  — adequate for monospace pre
 * blocks. Syntax-highlight spans are not preserved in split segments; the
 * actual printed output (sent to Android PrintManager) is the original document.
 *
 * Completes by posting { type:'np-layout-ready', scrollH } to the parent.
 */
function pageBreakScript(pageHpx: number, mTopPx: number, mBotPx: number): string {
	const contentH = pageHpx - mTopPx - mBotPx;
	return `<script>
(function () {
  var PAGE_H    = ${pageHpx};
  var M_TOP     = ${mTopPx};
  var M_BOT     = ${mBotPx};
  var CONTENT_H = ${contentH};

  function cntEnd(page)   { return (page + 1) * PAGE_H - M_BOT; }
  function cntStart(page) { return page * PAGE_H + M_TOP; }

  // ── Pass 1: push short elements past the bottom margin ──────────────────
  function passOne() {
    var children = Array.from(document.body.children);
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      if (el.dataset.npSpacer || el.dataset.npSplit) continue;
      var rect  = el.getBoundingClientRect();
      var elTop = rect.top + window.scrollY;
      var elBot = elTop + rect.height;
      if (rect.height > CONTENT_H) continue;   // handled by pass 2
      var page = Math.floor(elTop / PAGE_H);
      if (elBot > cntEnd(page)) {
        var gap = Math.ceil(cntStart(page + 1) - elTop);
        if (gap > 0) {
          var sp = document.createElement('div');
          sp.dataset.npSpacer = '1';
          sp.style.cssText = 'display:block;height:' + gap + 'px;';
          el.parentNode.insertBefore(sp, el);
        }
      }
    }
  }

  // ── Pass 2: split pre blocks that span multiple pages ───────────────────
  function passTwo() {
    // querySelectorAll returns a static NodeList — safe to iterate while DOM mutates.
    var pres = Array.from(document.body.querySelectorAll('pre'));
    for (var j = 0; j < pres.length; j++) {
      splitPre(pres[j]);
    }
  }

  function splitPre(pre) {
    if (pre.dataset.npSplit || pre.dataset.npSpacer) return;
    var rect      = pre.getBoundingClientRect();
    var preTop    = rect.top + window.scrollY;
    var startPage = Math.floor(preTop / PAGE_H);
    var endPage   = Math.floor((preTop + rect.height) / PAGE_H);
    if (startPage >= endPage) return;              // fits on one page — skip

    // Split on newlines so we never cut mid-character.
    var raw   = pre.textContent || '';
    var lines = raw.split('\\n');
    if (lines.length < 2) return;

    var lineH = rect.height / lines.length;        // estimated monospace line height

    // Build segment arrays and the spacer height needed between them.
    var segments = [[]];
    var spacers  = [];
    var curY     = preTop;

    for (var l = 0; l < lines.length; l++) {
      var page = Math.floor(curY / PAGE_H);
      // Would adding this line push the bottom past the content zone end?
      if (curY + lineH > cntEnd(page) && segments[segments.length - 1].length > 0) {
        var nextTop = cntStart(page + 1);
        spacers.push(Math.ceil(nextTop - curY));
        segments.push([]);
        curY = nextTop;
      }
      segments[segments.length - 1].push(lines[l]);
      curY += lineH;
    }

    if (segments.length < 2) return;

    // Build replacement fragment: pre, spacer, pre, spacer, …
    var frag = document.createDocumentFragment();
    for (var s = 0; s < segments.length; s++) {
      var clone = document.createElement('pre');
      // Preserve classes (e.g. language-xxx) but not inline height/width.
      clone.className     = pre.className;
      clone.dataset.npSplit = '1';
      // Wrap in a code element if the original had one.
      var origCode = pre.querySelector('code');
      if (origCode) {
        var c = document.createElement('code');
        c.className   = origCode.className;
        c.textContent = segments[s].join('\\n');
        clone.appendChild(c);
      } else {
        clone.textContent = segments[s].join('\\n');
      }
      frag.appendChild(clone);

      if (s < spacers.length && spacers[s] > 0) {
        var sp = document.createElement('div');
        sp.dataset.npSpacer = '1';
        sp.style.cssText = 'display:block;height:' + spacers[s] + 'px;';
        frag.appendChild(sp);
      }
    }

    pre.parentNode.replaceChild(frag, pre);
  }

  function done() {
    try {
      window.parent.postMessage({
        type:    'np-layout-ready',
        scrollH: document.documentElement.scrollHeight
      }, '*');
    } catch (e) {}
  }

  function run() {
    passOne();
    passTwo();
    // Second rAF after mutations to let the browser reflow before measuring.
    requestAnimationFrame(function () { requestAnimationFrame(done); });
  }

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
