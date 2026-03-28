import { App, Modal, Platform } from 'obsidian';
import { PrintPluginSettings, PAGE_SIZE_LABELS, MARGIN_PRESETS, MarginPreset, PageSize } from './settings';
import { buildHelperUrl } from './html-builder';

export type PrintExecutor = (html: string) => void;

/**
 * PrintPreviewModal — live-updating print preview with inline toolbar.
 *
 * Layout:
 *   ┌─ toolbar ───────────────────────────────────────────────────────┐
 *   │ [Paper ▼] [Margins ▼] [Font pt ↕] [☑ Title] [☑ Metadata]      │
 *   ├─ preview (flex-1) ──────────────────────────────────────────────┤
 *   │  <iframe srcdoc="...">                                          │
 *   ├─ buttons ───────────────────────────────────────────────────────┤
 *   │                               [Cancel]  [🖨 Print…]            │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Controls mutate a local settings copy; the iframe re-renders on every
 * change (debounced 250 ms). Changes are NOT persisted to plugin settings —
 * the caller's executor receives the final HTML only on Print click.
 */
export class PrintPreviewModal extends Modal {
	private readonly fragment: string;          // rendered HTML fragment (no wrapper)
	private readonly title: string;
	private readonly onPrint: PrintExecutor;
	private local: PrintPluginSettings;         // mutable local copy
	private frame: HTMLIFrameElement | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		app: App,
		fragment: string,
		title: string,
		settings: PrintPluginSettings,
		onPrint: PrintExecutor
	) {
		super(app);
		this.fragment  = fragment;
		this.title     = title;
		this.onPrint   = onPrint;
		this.local     = { ...settings };        // shallow clone — safe for flat interface
	}

	onOpen(): void {
		const { modalEl, contentEl } = this;
		modalEl.addClass('native-print-preview-modal');
		this.setTitle(`Print Preview — ${this.title}`);

		// ── Toolbar ─────────────────────────────────────────────────────────
		const toolbar = contentEl.createDiv({ cls: 'native-print-toolbar' });

		// Paper size
		this.addSelect(toolbar, 'Paper', PAGE_SIZE_LABELS, this.local.pageSize, (v) => {
			this.local.pageSize = v as PageSize;
			this.scheduleRerender();
		});

		// Margin preset
		this.addSelect(toolbar, 'Margins', {
			normal:  'Normal',
			narrow:  'Narrow',
			wide:    'Wide',
		}, this.local.marginPreset === 'custom' ? 'normal' : this.local.marginPreset, (v) => {
			const preset = MARGIN_PRESETS[v as MarginPreset];
			this.local.marginPreset = v as MarginPreset;
			this.local.marginTop    = preset.top;
			this.local.marginBottom = preset.bottom;
			this.local.marginLeft   = preset.left;
			this.local.marginRight  = preset.right;
			this.scheduleRerender();
		});

		// Font size stepper
		const fontGroup = toolbar.createDiv({ cls: 'native-print-toolbar-group' });
		fontGroup.createSpan({ cls: 'native-print-toolbar-label', text: 'Font' });
		const fontVal = fontGroup.createSpan({ cls: 'native-print-toolbar-value', text: `${this.local.fontSize}pt` });
		const dec = fontGroup.createEl('button', { cls: 'native-print-stepper', text: '−' });
		const inc = fontGroup.createEl('button', { cls: 'native-print-stepper', text: '+' });
		const updateFont = (delta: number) => {
			this.local.fontSize = Math.min(18, Math.max(8, this.local.fontSize + delta));
			fontVal.textContent = `${this.local.fontSize}pt`;
			this.scheduleRerender();
		};
		dec.addEventListener('click', () => updateFont(-1));
		inc.addEventListener('click', () => updateFont(+1));

		// Toggles
		this.addToggle(toolbar, 'Title',    this.local.includeTitle,         (v) => { this.local.includeTitle = v;            this.scheduleRerender(); });
		this.addToggle(toolbar, 'Metadata', this.local.includeYamlFrontmatter, (v) => { this.local.includeYamlFrontmatter = v; this.scheduleRerender(); });

		// Platform badge
		if (Platform.isAndroidApp) {
			toolbar.createSpan({ cls: 'native-print-info-badge', text: 'Android' });
		}

		// ── Preview iframe ───────────────────────────────────────────────────
		const previewArea = contentEl.createDiv({ cls: 'native-print-preview-area' });
		this.frame = previewArea.createEl('iframe', {
			cls: 'native-print-preview-frame',
			attr: { sandbox: 'allow-same-origin' },
		}) as HTMLIFrameElement;
		this.renderFrame();

		// ── Button row ───────────────────────────────────────────────────────
		const btnRow = contentEl.createDiv({ cls: 'native-print-btn-row' });
		const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const printBtn = btnRow.createEl('button', {
			text: Platform.isAndroidApp ? '⬡  Send to Print Helper' : '🖨  Print…',
			cls: 'mod-cta',
		});
		printBtn.addEventListener('click', () => {
			this.close();
			this.onPrint(buildHelperUrl.wrapDocument(this.fragment, this.title, this.local));
		});
	}

	onClose(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.contentEl.empty();
	}

	// ── Private helpers ────────────────────────────────────────────────────

	private renderFrame(): void {
		if (!this.frame) return;
		const fullHtml = buildHelperUrl.wrapDocument(this.fragment, this.title, this.local);
		this.frame.srcdoc = fullHtml;
	}

	private scheduleRerender(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => this.renderFrame(), 250);
	}

	private addSelect(
		parent: HTMLElement,
		label: string,
		options: Record<string, string>,
		value: string,
		onChange: (v: string) => void
	): void {
		const group = parent.createDiv({ cls: 'native-print-toolbar-group' });
		group.createSpan({ cls: 'native-print-toolbar-label', text: label });
		const sel = group.createEl('select', { cls: 'native-print-toolbar-select' });
		for (const [k, v] of Object.entries(options)) {
			const opt = sel.createEl('option', { value: k, text: v });
			if (k === value) opt.selected = true;
		}
		sel.addEventListener('change', () => onChange(sel.value));
	}

	private addToggle(
		parent: HTMLElement,
		label: string,
		checked: boolean,
		onChange: (v: boolean) => void
	): void {
		const group = parent.createDiv({ cls: 'native-print-toolbar-group native-print-toolbar-toggle' });
		const id = `np-toggle-${label.toLowerCase()}`;
		const cb = group.createEl('input', { attr: { type: 'checkbox', id } }) as HTMLInputElement;
		cb.checked = checked;
		group.createEl('label', { attr: { for: id }, text: label });
		cb.addEventListener('change', () => onChange(cb.checked));
	}
}
