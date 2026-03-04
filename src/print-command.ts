import { MarkdownView, Notice, Platform } from 'obsidian';
import NativePrintPlugin from './main';
import { renderNoteToHtml } from './renderer';
import { buildHelperUrl } from './html-builder';

export function registerPrintCommand(plugin: NativePrintPlugin): void {
	plugin.addCommand({
		id: 'print-current-note',
		name: 'Print current note',
		icon: 'printer',
		checkCallback: (checking: boolean) => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view?.file) return false;
			if (!checking) triggerPrint(plugin);
			return true;
		},
	});
}

export function triggerPrint(plugin: NativePrintPlugin): void {
	if (Platform.isAndroidApp) {
		printAndroid(plugin).catch(err => {
			new Notice(`Print failed: ${(err as Error).message}`);
			console.error('[NativePrint]', err);
		});
	} else {
		window.print();
	}
}

async function printAndroid(plugin: NativePrintPlugin): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view?.file) {
		new Notice('No active note to print.');
		return;
	}

	const notice = new Notice('Preparing print\u2026', 0);
	try {
		const markdown = await plugin.app.vault.read(view.file);
		const fragment = await renderNoteToHtml(plugin.app, markdown, view.file.path, plugin);
		const fullHtml = buildHelperUrl.wrapDocument(fragment, view.file.basename, plugin.settings);

		// Encode HTML as Base64 and pass inline in the custom-scheme URL.
		// This avoids all Android scoped-storage permission issues (API 33+) —
		// no READ_EXTERNAL_STORAGE or file-path handling needed in the APK.
		const base64 = btoa(unescape(encodeURIComponent(fullHtml)));

		if (base64.length > 900_000) {
			new Notice('Note is very large \u2014 embedded images may be omitted.', 6000);
		}

		window.open(buildHelperUrl.toIntentUrl(base64, plugin.settings), '_blank');
	} finally {
		notice.hide();
	}
}
