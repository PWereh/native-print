import { App, Modal, Platform } from 'obsidian';
import { PrintPluginSettings } from './settings';
import { buildHelperUrl } from './html-builder';

export type PrintExecutor = (html: string) => void;

/**
 * PrintPreviewModal
 *
 * Ported from the obsidian-enhancing-export dialog pattern but re-implemented
 * with Obsidian's native Modal API so it works on both desktop AND Android.
 *
 * Flow:
 *  1. Caller renders note → HTML fragment
 *  2. html-builder wraps it into a full print-ready document
 *  3. Modal shows the document inside a sandboxed <iframe>
 *  4. User clicks "Print" → executor fires (either window.print() or APK intent)
 *  5. User clicks "Cancel" → modal closes, nothing is printed
 */
export class PrintPreviewModal extends Modal {
	private readonly html: string;
	private readonly title: string;
	private readonly settings: PrintPluginSettings;
	private readonly onPrint: PrintExecutor;

	constructor(
		app: App,
		html: string,
		title: string,
		settings: PrintPluginSettings,
		onPrint: PrintExecutor
	) {
		super(app);
		this.html = html;
		this.title = title;
		this.settings = settings;
		this.onPrint = onPrint;
	}

	onOpen(): void {
		const { modalEl, contentEl } = this;

		// ── Widen the modal to use most of the viewport ─────────────────────
		modalEl.addClass('native-print-preview-modal');

		// ── Header ──────────────────────────────────────────────────────────
		this.setTitle(`Print Preview — ${this.title}`);

		// ── Page info strip ─────────────────────────────────────────────────
		const infoBar = contentEl.createDiv({ cls: 'native-print-info-bar' });
		infoBar.createSpan({
			text: `${this.settings.pageSize}  ·  ${this.settings.fontSize}pt  ·  ${this.settings.fontFamily}`,
			cls: 'native-print-info-text',
		});

		if (Platform.isAndroidApp) {
			infoBar.createSpan({
				text: '  ·  Android Print Helper',
				cls: 'native-print-info-badge',
			});
		}

		// ── Preview iframe ───────────────────────────────────────────────────
		// Build the full print-ready document and inject it via srcdoc so no
		// cross-origin issues arise; sandbox attr blocks script execution.
		const fullHtml = buildHelperUrl.wrapDocument(this.html, this.title, this.settings);

		const frame = contentEl.createEl('iframe', {
			cls: 'native-print-preview-frame',
			attr: {
				sandbox: 'allow-same-origin',   // needed for layout; scripts blocked
				srcdoc: fullHtml,
			},
		}) as HTMLIFrameElement;

		// Make the frame fill the available modal space
		frame.style.cssText = [
			'width: 100%',
			'flex: 1 1 auto',
			'border: 1px solid var(--background-modifier-border)',
			'border-radius: 4px',
			'background: #fff',
			'min-height: 0',          // flex-child shrink works correctly
		].join(';');

		// ── Button row (mirrors enhancing-export dialog footer) ──────────────
		const btnRow = contentEl.createDiv({ cls: 'modal-button-container native-print-btn-row' });

		// Cancel
		const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		// Print (CTA)
		const printBtn = btnRow.createEl('button', {
			text: Platform.isAndroidApp ? '⬡  Send to Print Helper' : '🖨  Print…',
			cls: 'mod-cta',
		});
		printBtn.addEventListener('click', () => {
			this.close();
			this.onPrint(fullHtml);
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
