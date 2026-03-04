import { App, Component, MarkdownRenderer } from 'obsidian';

/**
 * Renders a Markdown string to an HTML fragment using Obsidian's own renderer.
 * Uses the current non-deprecated static method: MarkdownRenderer.render()
 * (MarkdownRenderer.renderMarkdown() was deprecated in 0.10.6).
 *
 * An ephemeral Component manages the renderer child lifecycle and is
 * unloaded immediately after rendering to prevent memory leaks.
 */
export async function renderNoteToHtml(
	app: App,
	markdown: string,
	sourcePath: string,
	parent: Component
): Promise<string> {
	const container = document.createElement('div');
	const child = new Component();
	child.load();

	try {
		await MarkdownRenderer.render(app, markdown, container, sourcePath, child);
	} finally {
		child.unload();
	}

	return container.innerHTML;
}
