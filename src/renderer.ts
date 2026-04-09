import { App, Component, MarkdownRenderer, TFile } from 'obsidian';

/** MIME type map for image inlining. */
const IMG_MIME: Record<string, string> = {
	png:  'image/png',
	jpg:  'image/jpeg',
	jpeg: 'image/jpeg',
	gif:  'image/gif',
	webp: 'image/webp',
	svg:  'image/svg+xml',
	bmp:  'image/bmp',
};

/**
 * Renders a Markdown string to an HTML fragment using Obsidian's own renderer.
 *
 * When `inlineImages` is true, every <img> src that resolves to a vault file
 * is replaced with a base64 data URI so the HTML is fully self-contained.
 * This is required for images to survive the base64-URL transfer to the
 * Android Print Helper APK.
 */
export async function renderNoteToHtml(
	app: App,
	markdown: string,
	sourcePath: string,
	parent: Component,
	inlineImages = false
): Promise<string> {
	const container = document.createElement('div');
	const child = new Component();
	child.load();

	try {
		await MarkdownRenderer.render(app, markdown, container, sourcePath, child);
	} finally {
		child.unload();
	}

	if (inlineImages) {
		await inlineVaultImages(app, container, sourcePath);
	}

	return container.innerHTML;
}

/**
 * Walks all <img> elements in the container and replaces vault-relative src
 * attributes with base64 data URIs.
 *
 * Obsidian renders wikilink images (![[ ]]) as <img src="app://local/...">
 * and markdown images as <img src="path/to/image.png"> relative to the vault.
 * Both are resolved through MetadataCache / vault.getFiles().
 */
async function inlineVaultImages(
	app: App,
	container: HTMLElement,
	sourcePath: string
): Promise<void> {
	const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
	if (imgs.length === 0) return;

	// Build a fast filename → TFile lookup from the vault.
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
			if (!mime) return;          // unsupported format — leave src as-is

			const buf    = await app.vault.readBinary(tfile);
			const b64    = arrayBufferToBase64(buf);
			img.src      = `data:${mime};base64,${b64}`;
		} catch {
			// Non-fatal — leave original src if inlining fails
		}
	}));
}

/**
 * Resolves an <img> src to a TFile in the vault, handling:
 *   - Absolute file:// / app://local/ paths (strip to basename)
 *   - Vault-relative paths
 *   - Bare filenames (matched via the fileMap)
 */
function resolveImageFile(
	app: App,
	src: string,
	sourcePath: string,
	fileMap: Map<string, TFile>
): TFile | null {
	// Strip protocol + host from Obsidian's internal scheme.
	let normalized = src
		.replace(/^app:\/\/local\//i, '')
		.replace(/^file:\/\/\//i,     '')
		.replace(/\?.*$/, '')           // strip query string
		.replace(/%20/g, ' ');          // decode common URL encoding

	// Try vault path lookup first.
	const byPath = app.vault.getAbstractFileByPath(normalized);
	if (byPath instanceof TFile) return byPath;

	// Try basename lookup (handles bare names and cross-folder references).
	const basename = normalized.split('/').pop()?.toLowerCase() ?? '';
	const byName   = fileMap.get(basename);
	if (byName) return byName;

	// Try MetadataCache link resolution (resolves wiki-style short names).
	const linked = app.metadataCache.getFirstLinkpathDest(
		decodeURIComponent(normalized), sourcePath
	);
	return linked instanceof TFile ? linked : null;
}

/** ArrayBuffer → base64 string without relying on Node.js Buffer. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary  = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}
