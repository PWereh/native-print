import { loadMermaid } from 'obsidian';
import { PrintPluginSettings } from './settings';

// ── Post-processor wait ───────────────────────────────────────────────────────

/**
 * Wait for Obsidian's async post-processors to complete (mermaid, callouts, etc.).
 * Mermaid diagrams and callouts are rendered by post-processors that fire
 * asynchronously after MarkdownRenderer.render() returns.
 */
export function waitForPostProcessors(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Mermaid ───────────────────────────────────────────────────────────────────

/**
 * Fallback: manually render any <pre><code class="language-mermaid"> blocks
 * that Obsidian's post-processor did not handle in time.
 * Uses Obsidian's built-in loadMermaid() — no external CDN required.
 */
export async function renderMermaidFallback(container: HTMLElement): Promise<void> {
	const blocks = Array.from(
		container.querySelectorAll('pre code.language-mermaid, code.language-mermaid')
	) as HTMLElement[];
	if (blocks.length === 0) return;

	let mermaid: any;
	try {
		mermaid = await loadMermaid();
	} catch {
		return; // loadMermaid unavailable — skip silently
	}
	if (!mermaid) return;

	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		const code  = block.textContent?.trim() ?? '';
		if (!code) continue;

		const pre = block.closest('pre') ?? block.parentElement;
		if (!pre) continue;

		try {
			const id = `np-mermaid-${i}-${Date.now()}`;
			// mermaid.render() returns { svg, bindFunctions }
			const result = await mermaid.render(id, code);
			const svgText: string = typeof result === 'object' ? result.svg : String(result);

			const wrapper = document.createElement('div');
			wrapper.className = 'np-mermaid-rendered';
			wrapper.innerHTML = svgText;
			pre.replaceWith(wrapper);
		} catch {
			// Leave as code block — non-fatal
		}
	}
}

// ── HTML block passthrough ────────────────────────────────────────────────────

/**
 * Sanitise inline HTML blocks that Obsidian may have left as raw text.
 * Removes dangerous tags; preserves structural/visual HTML.
 */
export function processHtmlBlocks(container: HTMLElement): void {
	// Obsidian already sanitises HTML during rendering.
	// This pass ensures any <script> or <style> tags surviving the pipeline are stripped.
	container.querySelectorAll('script').forEach(el => el.remove());
	container.querySelectorAll('style').forEach(el => el.remove());
}

// ── CSS generation ────────────────────────────────────────────────────────────

/**
 * CSS for Obsidian callouts / admonitions.
 * Renders callouts with type-specific accent colours matching Obsidian's palette.
 * Must be included in every print output when renderCallouts is enabled.
 */
export function getCalloutCss(): string {
	// Read live theme colour vars — each --callout-{type} = "r,g,b" RGB tuple.
	// Falls back to Obsidian's default dark-theme palette when unset.
	type E = [types: string[], cssVar: string, rgbFb: string, hexFb: string];
	const palette: E[] = [
		[['note','info'],                                    '--callout-info',     '8,109,221',   '#086DDD'],
		[['tip','hint'],                                     '--callout-tip',      '45,183,181',  '#2db7b5'],
		[['important','abstract','summary','tldr'],          '--callout-abstract', '83,223,221',  '#53DFDD'],
		[['success','check','done'],                         '--callout-success',  '12,181,79',   '#0cb54f'],
		[['question','help','faq'],                          '--callout-question', '189,142,55',  '#BD8E37'],
		[['warning','caution','attention'],                  '--callout-warning',  '217,108,0',   '#d96c00'],
		[['danger','error','failure','fail','missing','bug'],'--callout-error',    '228,55,75',   '#E4374B'],
		[['example'],                                        '--callout-example',  '168,130,255', '#a882ff'],
		[['quote','cite'],                                   '--callout-quote',    '158,158,158', '#9e9e9e'],
	];
	const cs = (typeof document !== 'undefined') ? getComputedStyle(document.body) : null;
	const typeRules = palette.map(([types, cssVar, rgbFb, hexFb]) => {
		const liveRgb = cs?.getPropertyValue(cssVar).trim() || rgbFb;
		const parts   = liveRgb.split(',').map(x => parseInt(x.trim(), 10));
		const hex     = (parts.length === 3 && parts.every(n => !isNaN(n)))
			? '#' + parts.map(n => n.toString(16).padStart(2, '0')).join('')
			: hexFb;
		const sels    = types.map(t => `.callout[data-callout="${t}"]`).join(',\n');
		return `${sels} {\n\tbackground: rgba(${liveRgb},0.08);\n\tborder-left-color: ${hex};\n\t--np-callout-accent: ${hex};\n}`;
	}).join('\n');

	return `
/* ── Callouts — theme-aware ── */
.callout {
	border-radius: 5px;
	padding: 10px 14px;
	margin: 0.85em 0;
	page-break-inside: avoid;
	position: relative;
	border-left: 4px solid var(--np-callout-accent, #086DDD);
}
.callout-title {
	display: flex;
	align-items: center;
	gap: 7px;
	font-weight: 700;
	margin-bottom: 6px;
	font-size: 0.95em;
	color: var(--np-callout-accent, #086DDD);
}
.callout-icon svg { width: 16px; height: 16px; flex-shrink: 0; fill: currentColor; }
.callout-fold { display: none; }
.callout-content > :first-child { margin-top: 0; }
.callout-content > :last-child  { margin-bottom: 0; }
.callout:not([data-callout]) {
	background: rgba(8,109,221,0.08); border-left-color: #086DDD; --np-callout-accent: #086DDD;
}
${typeRules}
`;
}

/**
 * CSS for Mermaid diagrams and other rendered diagram blocks.
 */
export function getMermaidCss(): string {
	return `
/* ── Mermaid diagrams ── */
.np-mermaid-rendered,
.mermaid,
pre.mermaid {
	text-align: center;
	page-break-inside: avoid;
	margin: 0.85em auto;
	overflow: visible;
}
.np-mermaid-rendered svg,
.mermaid svg {
	max-width: 100%;
	height: auto;
	display: block;
	margin: 0 auto;
}
/* Suppress raw code if Obsidian rendered it as SVG */
.np-mermaid-rendered pre,
.np-mermaid-rendered code { display: none; }
`;
}

/**
 * CSS for task lists.
 */
export function getTaskListCss(): string {
	return `
/* ── Task lists ── */
ul.contains-task-list { padding-left: 1.4em; list-style: none; }
.task-list-item        { position: relative; }
.task-list-item-checkbox {
	appearance: none; -webkit-appearance: none;
	width: 13px; height: 13px;
	border: 1.5px solid #555;
	border-radius: 2px;
	display: inline-block;
	vertical-align: middle;
	margin-right: 6px;
	position: relative;
}
.task-list-item-checkbox:checked {
	background: #0cb54f;
	border-color: #0cb54f;
}
.task-list-item-checkbox:checked::after {
	content: '';
	position: absolute;
	top: 1px; left: 3px;
	width: 4px; height: 7px;
	border: 1.5px solid #fff;
	border-top: none; border-left: none;
	transform: rotate(45deg);
}
`;
}

/**
 * CSS for embedded note blocks.
 */
export function getEmbedCss(): string {
	return `
/* ── Embedded notes ── */
.internal-embed, .markdown-embed {
	border: 1px solid #d0d0d0;
	border-left: 3px solid #999;
	border-radius: 4px;
	padding: 8px 12px;
	margin: 0.75em 0;
	page-break-inside: avoid;
	background: rgba(0,0,0,0.02);
}
.markdown-embed-title { font-weight: 600; margin-bottom: 4px; font-size: 0.9em; color: #555; }
`;
}

/**
 * Assemble all rendering CSS based on current settings.
 */
export function buildRenderingCss(s: PrintPluginSettings): string {
	const parts: string[] = [];
	if (s.renderCallouts)  parts.push(getCalloutCss());
	if (s.renderMermaid)   parts.push(getMermaidCss());
	if (s.renderTaskLists) parts.push(getTaskListCss());
	if (s.renderEmbeds)    parts.push(getEmbedCss());
	return parts.join('\n');
}
