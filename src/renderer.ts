import { App, Component, MarkdownRenderer, TFile } from 'obsidian';
import { PrintPluginSettings } from './settings';
import { waitForPostProcessors, renderMermaidFallback, processHtmlBlocks } from './render-pipeline';

const IMG_MIME: Record<string, string> = {
	png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
	gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
};

/**
 * Renders a Markdown string to an HTML fragment using Obsidian's own renderer.
 *
 * When renderSettings.postProcessorWaitMs > 0, the child Component is kept alive
 * for that duration so Obsidian's async post-processors (Mermaid, callouts, etc.)
 * have time to mutate the DOM before we capture innerHTML.
 *
 * If Mermaid blocks remain after the wait, renderMermaidFallback() handles them.
 */
export async function renderNoteToHtml(
	app:          App,
	markdown:     string,
	sourcePath:   string,
	parent:       Component,
	inlineImages  = false,
	renderSettings?: Partial<Pick<PrintPluginSettings, 'postProcessorWaitMs' | 'renderMermaid'>>
): Promise<string> {
	// Attach to live DOM — Obsidian post-processors (Mermaid, callouts, DataView)
	// silently abort on detached elements. Off-screen hidden div is the fix.
	const container = document.body.createDiv({
		attr: { style: 'position:absolute;left:-9999px;top:-9999px;width:860px;visibility:hidden;' },
	});
	const child = new Component();
	child.load();

	try {
		await MarkdownRenderer.render(app, markdown, container, sourcePath, child);

		// Keep child alive while post-processors render (mermaid, callouts, etc.)
		const waitMs = renderSettings?.postProcessorWaitMs ?? 0;
		if (waitMs > 0) {
			await waitForPostProcessors(waitMs);
		}
	} finally {
		child.unload();
	}

	// Mermaid fallback: render any blocks that the post-processor missed
	if (renderSettings?.renderMermaid !== false) {
		await renderMermaidFallback(container);
	}

	// Strip Obsidian UI chrome (copy buttons, edit handles) before capture.
	container.querySelectorAll('.copy-code-button,.code-block-flair,.edit-block-button').forEach(e => e.remove());

	// Safety pass: strip any stray <script>/<style> that survived rendering
	processHtmlBlocks(container);

	if (inlineImages) {
		await inlineVaultImages(app, container, sourcePath);
	}

	const html = container.innerHTML;
	container.remove();
	return html;
}

async function inlineVaultImages(app: App, container: HTMLElement, sourcePath: string): Promise<void> {
	const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
	if (imgs.length === 0) return;

	const fileMap = new Map<string, TFile>();
	for (const f of app.vault.getFiles()) {
		fileMap.set(f.name.toLowerCase(), f);
		fileMap.set(f.path.toLowerCase(), f);
	}

	await Promise.all(imgs.map(async (img) => {
		try {
			const tfile = resolveImageFile(app, img.src, sourcePath, fileMap);
			if (!tfile) return;
			const ext  = tfile.extension.toLowerCase();
			const mime = IMG_MIME[ext];
			if (!mime) return;
			const buf = await app.vault.readBinary(tfile);
			img.src   = `data:${mime};base64,${arrayBufferToBase64(buf)}`;
		} catch {
			// Non-fatal
		}
	}));
}

function resolveImageFile(app: App, src: string, sourcePath: string, fileMap: Map<string, TFile>): TFile | null {
	let normalized = src
		.replace(/^app:\/\/local\//i, '')
		.replace(/^file:\/\/\//i, '')
		.replace(/\?.*$/, '')
		.replace(/%20/g, ' ');

	const byPath = app.vault.getAbstractFileByPath(normalized);
	if (byPath instanceof TFile) return byPath;

	const basename = normalized.split('/').pop()?.toLowerCase() ?? '';
	const byName   = fileMap.get(basename);
	if (byName) return byName;

	const linked = app.metadataCache.getFirstLinkpathDest(decodeURIComponent(normalized), sourcePath);
	return linked instanceof TFile ? linked : null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary  = '';
	for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}
