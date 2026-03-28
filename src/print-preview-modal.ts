import { App, Modal, Platform } from 'obsidian';
import {
	PrintPluginSettings,
	MARGIN_PRESETS,
	MarginPreset,
	PageSize,
	Orientation,
} from './settings';
import { buildHelperUrl } from './html-builder';

export type PrintExecutor = (html: string) => void;

/**
 * PrintPreviewModal — Samsung OneUI glass frame, toolbar in the lower quarter.
 *
 * Structure (top → bottom inside contentEl):
 *   ┌─ preview area (flex-1) ───────────────────────────────────────┐
 *   │  <iframe srcdoc="...">   live-updating at 250ms debounce      │
 *   ├─ compact toolbar ─────────────────────────────────────────────┤
 *   │  Paper[▼]  Orient.[▼]  Margins[▼]  [−]11pt[+]  ◎Title ○Meta │
 *   ├─ button row ──────────────────────────────────────────────────┤
 *   │                                     [Cancel]  [🖨 Print]      │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Controls mutate a LOCAL copy of settings — nothing is persisted until
 * the user clicks Print, at which point the executor receives the final HTML.
 */
export class PrintPreviewModal extends Modal {
	private readonly fragment: string;
	private readonly title: string;
	private readonly onPrint: PrintExecutor;
	private local: PrintPluginSettings;
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
		this.fragment = fragment;
		this.title    = title;
		this.onPrint  = onPrint;
		this.local    = { ...settings };
	}

	onOpen(): void {
		const { modalEl, contentEl } = this;
		modalEl.addClass('native-print-preview-modal');
		this.setTitle(`Print Preview — ${this.title}`);

		// ── 1. Preview iframe (fills top ~75%) ──────────────────────────────
		const previewArea = contentEl.createDiv({ cls: 'native-print-preview-area' });
		this.frame = previewArea.createEl('iframe', {
			cls:  'native-print-preview-frame',
			attr: { sandbox: 'allow-same-origin' },
		}) as HTMLIFrameElement;
		this.renderFrame();

		// ── 2. Compact toolbar (lower quarter) ─────────────────────────────
		const toolbar = contentEl.createDiv({ cls: 'native-print-toolbar' });

		// Paper size — compact key-only labels
		this.addSelect(toolbar, 'Paper', {
			A3: 'A3', A4: 'A4', A5: 'A5',
			Letter: 'Letter', Legal: 'Legal', Tabloid: 'Tabloid',
		}, this.local.pageSize, (v) => {
			this.local.pageSize = v as PageSize;
			this.scheduleRerender();
		});

		// Orientation (was in prev. iteration, re-added)
		this.addSelect(toolbar, 'Orient.', {
			portrait:  'Portrait',
			landscape: 'Landscape',
		}, this.local.orientation, (v) => {
			this.local.orientation = v as Orientation;
			this.scheduleRerender();
		});

		// Margin preset
		this.addSelect(toolbar, 'Margins', {
			normal: 'Normal',
			narrow: 'Narrow',
			wide:   'Wide',
		}, this.local.marginPreset === 'custom' ? 'normal' : this.local.marginPreset, (v) => {
			const key = v as MarginPreset;
			const p   = MARGIN_PRESETS[key];
			this.local.marginPreset = key;
			this.local.marginTop    = p.top;
			this.local.marginBottom = p.bottom;
			this.local.marginLeft   = p.left;
			this.local.marginRight  = p.right;
			this.scheduleRerender();
		});

		// Font stepper: [−] 11 pt [+]
		this.addStepper(toolbar, 'Font (pt)', this.local.fontSize, 'pt', 8, 18, (v) => {
			this.local.fontSize = v;
			this.scheduleRerender();
		});

		// Title toggle
		this.addCircleToggle(toolbar, 'Title', this.local.includeTitle, (v) => {
			this.local.includeTitle = v;
			this.scheduleRerender();
		});

		// Metadata toggle
		this.addCircleToggle(toolbar, 'Metadata', this.local.includeYamlFrontmatter, (v) => {
			this.local.includeYamlFrontmatter = v;
			this.scheduleRerender();
		});

		// ── 3. Button row ────────────────────────────────────────────────────
		const btnRow = contentEl.createDiv({ cls: 'native-print-btn-row' });

		const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		// Printer icon for both platforms — no ⬡ Android symbol
		const printBtn = btnRow.createEl('button', {
			cls:  'mod-cta',
			text: '🖨  Print',
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

	// ── Rendering ───────────────────────────────────────────────────────────

	private renderFrame(): void {
		if (!this.frame) return;
		this.frame.srcdoc = buildHelperUrl.wrapDocument(this.fragment, this.title, this.local);
	}

	private scheduleRerender(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => this.renderFrame(), 250);
	}

	// ── Control helpers ─────────────────────────────────────────────────────

	/** Chip-style <select> with label prefix. */
	private addSelect(
		parent: HTMLElement,
		label: string,
		options: Record<string, string>,
		value: string,
		onChange: (v: string) => void
	): void {
		const g = parent.createDiv({ cls: 'native-print-toolbar-group' });
		g.createSpan({ cls: 'native-print-toolbar-label', text: label });
		const sel = g.createEl('select', { cls: 'native-print-toolbar-select' });
		for (const [k, v] of Object.entries(options)) {
			const opt = sel.createEl('option', { value: k, text: v });
			if (k === value) opt.selected = true;
		}
		sel.addEventListener('change', () => onChange(sel.value));
	}

	/**
	 * Stepper in the pattern: label  [−]  value unit  [+]
	 * Returns the value-span so the caller can update it later if needed.
	 */
	private addStepper(
		parent: HTMLElement,
		label: string,
		initial: number,
		unit: string,
		min: number,
		max: number,
		onChange: (v: number) => void
	): void {
		const g = parent.createDiv({ cls: 'native-print-toolbar-group' });
		g.createSpan({ cls: 'native-print-toolbar-label', text: label });

		let current = initial;

		const dec = g.createEl('button', { cls: 'native-print-stepper', text: '−' });
		const val = g.createSpan({
			cls:  'native-print-stepper-value',
			text: `${current} ${unit}`,
		});
		const inc = g.createEl('button', { cls: 'native-print-stepper', text: '+' });

		const update = (delta: number) => {
			current = Math.min(max, Math.max(min, current + delta));
			val.textContent = `${current} ${unit}`;
			onChange(current);
		};
		dec.addEventListener('click', () => update(-1));
		inc.addEventListener('click', () => update(+1));
	}

	/** Circle checkbox toggle: ◎ / ○ with text label. */
	private addCircleToggle(
		parent: HTMLElement,
		label: string,
		checked: boolean,
		onChange: (v: boolean) => void
	): void {
		const g  = parent.createDiv({ cls: 'np-toggle-group' });
		const id = `np-toggle-${label.toLowerCase().replace(/\s+/g, '-')}`;
		const cb = g.createEl('input', {
			attr: { type: 'checkbox', id },
		}) as HTMLInputElement;
		cb.className = 'np-toggle-cb';
		cb.checked   = checked;
		g.createEl('label', {
			attr: { for: id },
			cls:  'np-toggle-text',
			text: label,
		});
		cb.addEventListener('change', () => onChange(cb.checked));
	}
}
