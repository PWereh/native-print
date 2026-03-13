import { MarkdownView, Notice, Platform } from 'obsidian';
import NativePrintPlugin from './main';
import { renderNoteToHtml } from './renderer';
import { buildHelperUrl } from './html-builder';
import { PrintPreviewModal } from './print-preview-modal';

// ── Command registration ──────────────────────────────────────────────────────

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

	plugin.addCommand({
		id: 'print-current-note-direct',
		name: 'Print current note (skip preview)',
		icon: 'printer',
		checkCallback: (checking: boolean) => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view?.file) return false;
			if (!checking) triggerPrint(plugin, true);
			return true;
		},
	});
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function triggerPrint(plugin: NativePrintPlugin, skipPreview = false): void {
	preparePrint(plugin, skipPreview).catch(err => {
		new Notice(`Print failed: ${(err as Error).message}`);
		console.error('[NativePrint]', err);
	});
}

// ── Core pipeline ─────────────────────────────────────────────────────────────

async function preparePrint(plugin: NativePrintPlugin, skipPreview: boolean): Promise<void> {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view?.file) {
		new Notice('No active note to print.');
		return;
	}

	const notice = new Notice('Preparing print\u2026', 0);

	let fragment: string;
	try {
		const markdown = await plugin.app.vault.read(view.file);
		fragment = await renderNoteToHtml(plugin.app, markdown, view.file.path, plugin);
	} finally {
		notice.hide();
	}

	const title = view.file.basename;
	const settings = plugin.settings;

	if (skipPreview || !settings.showPreview) {
		const fullHtml = buildHelperUrl.wrapDocument(fragment, title, settings);
		getPrintExecutor(plugin)(fullHtml);
		return;
	}

	new PrintPreviewModal(
		plugin.app,
		fragment,
		title,
		settings,
		getPrintExecutor(plugin)
	).open();
}

// ── Platform executors ────────────────────────────────────────────────────────

function getPrintExecutor(plugin: NativePrintPlugin) {
	if (Platform.isAndroidApp) {
		return (fullHtml: string) => sendToAndroidHelper(fullHtml, plugin);
	}
	return (_fullHtml: string) => { window.print(); };
}

function sendToAndroidHelper(fullHtml: string, plugin: NativePrintPlugin): void {
	const base64 = btoa(unescape(encodeURIComponent(fullHtml)));
	if (base64.length > 900_000) {
		new Notice('Note is very large \u2014 embedded images may be omitted.', 6000);
	}
	window.open(buildHelperUrl.toIntentUrl(base64, plugin.settings), '_blank');
}
