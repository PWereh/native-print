import { App, TFile } from 'obsidian';

/** Path within the vault config dir where Obsidian stores CSS snippets. */
const SNIPPETS_SUBDIR = 'snippets';

export interface SnippetEntry {
	filename: string;   // e.g. "mermaid_zoom.css"
	enabled:  boolean;
}

/**
 * Lists every .css file under <vault>/.obsidian/snippets/.
 * Returns them with the enabled state from `enabledSnippets` (persisted in settings).
 */
export async function listSnippets(
	app: App,
	enabledSnippets: string[]
): Promise<SnippetEntry[]> {
	const dir = snippetsDir(app);
	if (!dir) return [];

	// adapter.list works on physical paths relative to vault root.
	try {
		const listing = await app.vault.adapter.list(dir);
		return listing.files
			.filter(f => f.toLowerCase().endsWith('.css'))
			.map(f => ({
				filename: f.split('/').pop() ?? f,
				enabled:  enabledSnippets.includes(f.split('/').pop() ?? f),
			}))
			.sort((a, b) => a.filename.localeCompare(b.filename));
	} catch {
		return [];
	}
}

/**
 * Reads and concatenates all enabled snippet CSS files.
 * Called by wrapDocument() just before sealing the <style> block.
 * Non-fatal: a file that can't be read is silently skipped.
 */
export async function loadEnabledSnippetsCss(
	app: App,
	enabledSnippets: string[]
): Promise<string> {
	if (enabledSnippets.length === 0) return '';
	const dir = snippetsDir(app);
	if (!dir) return '';

	const parts: string[] = [];
	for (const name of enabledSnippets) {
		try {
			const path = `${dir}/${name}`;
			const css  = await app.vault.adapter.read(path);
			parts.push(`/* ── snippet: ${name} ── */\n${css}`);
		} catch {
			// file deleted or unreadable — skip
		}
	}
	return parts.join('\n');
}

/** Resolves the .obsidian/snippets dir relative to the vault root. */
function snippetsDir(app: App): string | null {
	// app.vault.configDir is ".obsidian" (relative to vault root).
	// adapter.getResourcePath requires vault-relative paths.
	const configDir = (app.vault as unknown as { configDir: string }).configDir ?? '.obsidian';
	return `${configDir}/${SNIPPETS_SUBDIR}`;
}
