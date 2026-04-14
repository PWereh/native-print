import { App, Component, MarkdownRenderer, TFile } from 'obsidian';

const IMG_MIME: Record<string, string> = {
	png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
	gif:'image/gif', webp:'image/webp', svg:'image/svg+xml', bmp:'image/bmp',
};

const POST_PROCESSOR_TIMEOUT_MS = 4000;
const MERMAID_POLL_MS = 80;

export interface RenderOptions {
	inlineImages:    boolean;
	renderMermaid:   boolean;
	imageGrayscale:  boolean;
	imageInvert:     boolean;
	imageBrightness: number;
	imageContrast:   number;
	imageSaturate:   number;
}

/**
 * Renders Markdown to an HTML fragment.
 *
 * Attaches to a live (but off-screen) DOM node so that Obsidian post-processors
 * (mermaid, callouts, admonitions) actually fire — they silently abort on
 * detached elements.
 *
 * When renderMermaid is true, polls until every .mermaid container has an SVG,
 * then serializes each SVG to a data-URI <img>. Fixes #mermaid-codeblock-001.
 */
export async function renderNoteToHtml(
	app:        App,
	markdown:   string,
	sourcePath: string,
	parent:     Component,
	opts: Partial<RenderOptions> = {}
): Promise<string> {
	// Must be attached to live DOM for post-processors.
	const host = document.body.createDiv({
		attr: { style: 'position:absolute;left:-9999px;top:-9999px;width:800px;visibility:hidden;' },
	});
	const child = new Component();
	child.load();

	try {
		await MarkdownRenderer.render(app, markdown, host, sourcePath, child);

		if (opts.renderMermaid !== false) {
			await waitForMermaid(host);
			serializeMermaidSvgs(host);
		}

		// Remove Obsidian UI chrome that has no print meaning.
		host.querySelectorAll('.copy-code-button, .code-block-flair, .edit-block-button').forEach(e => e.remove());

		if (opts.inlineImages) {
			await inlineVaultImages(app, host, sourcePath, opts);
		}

		return host.innerHTML;
	} finally {
		child.unload();
		host.remove();
	}
}

// ── Mermaid ──────────────────────────────────────────────────────────────────

async function waitForMermaid(container: HTMLElement): Promise<void> {
	const blocks = Array.from(container.querySelectorAll('.mermaid,[class*="language-mermaid"]'));
	if (blocks.length === 0) return;
	const deadline = Date.now() + POST_PROCESSOR_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (blocks.every(el => el.querySelector('svg'))) break;
		await new Promise<void>(r => setTimeout(r, MERMAID_POLL_MS));
	}
}

function serializeMermaidSvgs(container: HTMLElement): void {
	container.querySelectorAll('.mermaid,[class*="language-mermaid"]').forEach(block => {
		const svg = block.querySelector('svg');
		if (!svg) return;
		// Ensure dimensions so the img renders at the right size.
		if (!svg.hasAttribute('width') && svg.hasAttribute('viewBox')) {
			const parts = svg.getAttribute('viewBox')!.split(' ');
			svg.setAttribute('width',  parts[2] ?? '100%');
			svg.setAttribute('height', parts[3] ?? 'auto');
		}
		const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
		const img = document.createElement('img');
		img.src       = dataUri;
		img.alt       = 'Mermaid diagram';
		img.style.cssText = 'max-width:100%;height:auto;display:block;margin:0.5em auto;';
		block.replaceWith(img);
	});
}

// ── Image inlining ───────────────────────────────────────────────────────────

async function inlineVaultImages(
	app: App, container: HTMLElement,
	sourcePath: string, opts: Partial<RenderOptions>
): Promise<void> {
	const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
	if (imgs.length === 0) return;
	const fileMap = new Map<string, TFile>();
	for (const f of app.vault.getFiles()) {
		fileMap.set(f.name.toLowerCase(), f);
		fileMap.set(f.path.toLowerCase(), f);
	}
	const filter = buildCssFilter(opts);
	await Promise.all(imgs.map(async img => {
		// Skip already-inlined data URIs.
		if (img.src.startsWith('data:')) {
			if (filter) img.style.filter = filter;
			return;
		}
		try {
			const tfile = resolveImageFile(app, img.src, sourcePath, fileMap);
			if (!tfile) return;
			const mime = IMG_MIME[tfile.extension.toLowerCase()];
			if (!mime) return;
			const buf = await app.vault.readBinary(tfile);
			img.src   = `data:${mime};base64,${arrayBufferToBase64(buf)}`;
			if (filter) img.style.filter = filter;
		} catch { /* non-fatal */ }
	}));
}

function buildCssFilter(opts: Partial<RenderOptions>): string {
	const p: string[] = [];
	if (opts.imageGrayscale) p.push('grayscale(100%)');
	if (opts.imageInvert)    p.push('invert(100%)');
	if (opts.imageBrightness != null && opts.imageBrightness !== 100) p.push(`brightness(${opts.imageBrightness}%)`);
	if (opts.imageContrast   != null && opts.imageContrast   !== 100) p.push(`contrast(${opts.imageContrast}%)`);
	if (opts.imageSaturate   != null && opts.imageSaturate   !== 100) p.push(`saturate(${opts.imageSaturate}%)`);
	return p.join(' ');
}

function resolveImageFile(app: App, src: string, sourcePath: string, fileMap: Map<string, TFile>): TFile | null {
	const n = src.replace(/^app:\/\/local\//i,'').replace(/^file:\/\/\//i,'').replace(/\?.*$/,'').replace(/%20/g,' ');
	const byPath = app.vault.getAbstractFileByPath(n);
	if (byPath instanceof TFile) return byPath;
	const byName = fileMap.get((n.split('/').pop() ?? '').toLowerCase());
	if (byName) return byName;
	const linked = app.metadataCache.getFirstLinkpathDest(decodeURIComponent(n), sourcePath);
	return linked instanceof TFile ? linked : null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let b = '';
	for (let i = 0; i < bytes.byteLength; i++) b += String.fromCharCode(bytes[i]);
	return btoa(b);
}
