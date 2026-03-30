import { App, Modal, Platform, Setting } from 'obsidian';
import {
	PrintPluginSettings,
	MARGIN_PRESETS,
	MarginPreset,
	PageSize,
	Orientation,
} from './settings';
import { buildHelperUrl } from './html-builder';

export type PrintExecutor = (html: string) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Custom Margin Sub-modal
// Opens on top of PrintPreviewModal; blurs the preview while active.
// ─────────────────────────────────────────────────────────────────────────────
class CustomMarginModal extends Modal {
	private vals: { top: number; bottom: number; left: number; right: number };
	private readonly onConfirm: (v: typeof this.vals) => void;
	private readonly onDismiss: () => void;

	constructor(
		app: App,
		initial: { top: number; bottom: number; left: number; right: number },
		onConfirm: (v: typeof initial) => void,
		onDismiss: () => void
	) {
		super(app);
		this.vals      = { ...initial };
		this.onConfirm = onConfirm;
		this.onDismiss = onDismiss;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle('Custom Margins (mm)');
		contentEl.addClass('np-custom-margin-modal');

		// Four margin steppers
		const pairs: [string, keyof typeof this.vals][] = [
			['Top',    'top'],
			['Bottom', 'bottom'],
			['Left',   'left'],
			['Right',  'right'],
		];

		for (const [label, key] of pairs) {
			new Setting(contentEl)
				.setName(label)
				.addExtraButton(btn => btn.setIcon('minus')
					.setTooltip('Decrease')
					.onClick(() => {
						this.vals[key] = Math.max(0, this.vals[key] - 1);
						valEls[key].textContent = `${this.vals[key]} mm`;
					}))
				.addExtraButton(btn => {
					// Render value display between buttons
					valEls[key] = btn.extraSettingsEl.createSpan({
						cls:  'np-margin-val',
						text: `${this.vals[key]} mm`,
					});
					// Detach so it appears between the two buttons in DOM order
					btn.extraSettingsEl.insertBefore(valEls[key], btn.extraSettingsEl.firstChild);
					return btn.setIcon('plus')
						.setTooltip('Increase')
						.onClick(() => {
							this.vals[key] = Math.min(50, this.vals[key] + 1);
							valEls[key].textContent = `${this.vals[key]} mm`;
						});
				});
		}

		const btnRow = contentEl.createDiv({ cls: 'np-custom-btn-row' });
		btnRow.createEl('button', { text: 'Cancel' })
			.addEventListener('click', () => this.close());
		const ok = btnRow.createEl('button', { text: 'Apply', cls: 'mod-cta' });
		ok.addEventListener('click', () => {
			this.onConfirm({ ...this.vals });
			this.close();
		});
	}

	onClose(): void {
		this.onDismiss();
		this.contentEl.empty();
	}
}
// Pre-allocate span refs dict (filled during Setting construction)
const valEls: Record<string, HTMLSpanElement> = {};

// ─────────────────────────────────────────────────────────────────────────────
// Print Preview Modal
// ─────────────────────────────────────────────────────────────────────────────
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

		// ── 1. Preview iframe ─────────────────────────────────────────────
		const previewArea = contentEl.createDiv({ cls: 'native-print-preview-area' });
		this.frame = previewArea.createEl('iframe', {
			cls:  'native-print-preview-frame',
			attr: { sandbox: 'allow-same-origin' },
		}) as HTMLIFrameElement;
		this.renderFrame();

		// ── 2. Compact toolbar ─────────────────────────────────────────────
		const toolbar = contentEl.createDiv({ cls: 'native-print-toolbar' });

		this.addSelect(toolbar, 'Paper', {
			A3: 'A3', A4: 'A4', A5: 'A5',
			Letter: 'Letter', Legal: 'Legal', Tabloid: 'Tabloid',
		}, this.local.pageSize, (v) => {
			this.local.pageSize = v as PageSize;
			this.scheduleRerender();
		});

		this.addSelect(toolbar, 'Orient.', {
			portrait:  'Portrait',
			landscape: 'Landscape',
		}, this.local.orientation, (v) => {
			this.local.orientation = v as Orientation;
			this.scheduleRerender();
		});

		// Margins — includes Custom; selecting it opens the sub-modal
		this.addSelect(toolbar, 'Margins', {
			normal: 'Normal',
			narrow: 'Narrow',
			wide:   'Wide',
			custom: 'Custom…',
		}, this.local.marginPreset, (v) => {
			if (v === 'custom') {
				this.openCustomMarginModal();
				return;
			}
			const key = v as MarginPreset;
			const p   = MARGIN_PRESETS[key];
			this.local.marginPreset = key;
			this.local.marginTop    = p.top;
			this.local.marginBottom = p.bottom;
			this.local.marginLeft   = p.left;
			this.local.marginRight  = p.right;
			this.scheduleRerender();
		});

		this.addStepper(toolbar, 'Font (pt)', this.local.fontSize, 'pt', 8, 18, (v) => {
			this.local.fontSize = v;
			this.scheduleRerender();
		});

		this.addCircleToggle(toolbar, 'Title', this.local.includeTitle, (v) => {
			this.local.includeTitle = v;
			this.scheduleRerender();
		});
		this.addCircleToggle(toolbar, 'Metadata', this.local.includeYamlFrontmatter, (v) => {
			this.local.includeYamlFrontmatter = v;
			this.scheduleRerender();
		});

		// ── 3. Button row ──────────────────────────────────────────────────
		const btnRow = contentEl.createDiv({ cls: 'native-print-btn-row' });
		btnRow.createEl('button', { text: 'Cancel' })
			.addEventListener('click', () => this.close());

		const printBtn = btnRow.createEl('button', { cls: 'mod-cta', text: '🖨  Print' });
		printBtn.addEventListener('click', () => {
			this.close();
			this.onPrint(buildHelperUrl.wrapDocument(this.fragment, this.title, this.local));
		});
	}

	onClose(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.contentEl.empty();
	}

	// ── Custom margin sub-modal ──────────────────────────────────────────────

	private openCustomMarginModal(): void {
		const { modalEl } = this;
		modalEl.addClass('native-print-blurred');

		new CustomMarginModal(
			this.app,
			{
				top:    this.local.marginTop,
				bottom: this.local.marginBottom,
				left:   this.local.marginLeft,
				right:  this.local.marginRight,
			},
			(v) => {
				this.local.marginPreset = 'custom';
				this.local.marginTop    = v.top;
				this.local.marginBottom = v.bottom;
				this.local.marginLeft   = v.left;
				this.local.marginRight  = v.right;
				this.scheduleRerender();
			},
			() => modalEl.removeClass('native-print-blurred')
		).open();
	}

	// ── Rendering ────────────────────────────────────────────────────────────

	private renderFrame(): void {
		if (!this.frame) return;
		this.frame.srcdoc = buildHelperUrl.wrapDocument(this.fragment, this.title, this.local);
	}

	private scheduleRerender(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => this.renderFrame(), 250);
	}

	// ── Control builders ─────────────────────────────────────────────────────

	private addSelect(
		parent: HTMLElement, label: string, options: Record<string, string>,
		value: string, onChange: (v: string) => void
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

	private addStepper(
		parent: HTMLElement, label: string, initial: number, unit: string,
		min: number, max: number, onChange: (v: number) => void
	): void {
		const g = parent.createDiv({ cls: 'native-print-toolbar-group' });
		g.createSpan({ cls: 'native-print-toolbar-label', text: label });
		let cur = initial;
		const dec = g.createEl('button', { cls: 'native-print-stepper', text: '−' });
		const val = g.createSpan({ cls: 'native-print-stepper-value', text: `${cur} ${unit}` });
		const inc = g.createEl('button', { cls: 'native-print-stepper', text: '+' });
		const upd = (d: number) => {
			cur = Math.min(max, Math.max(min, cur + d));
			val.textContent = `${cur} ${unit}`;
			onChange(cur);
		};
		dec.addEventListener('click', () => upd(-1));
		inc.addEventListener('click', () => upd(+1));
	}

	private addCircleToggle(
		parent: HTMLElement, label: string, checked: boolean,
		onChange: (v: boolean) => void
	): void {
		const g  = parent.createDiv({ cls: 'np-toggle-group' });
		const id = `np-toggle-${label.toLowerCase().replace(/\s+/g, '-')}`;
		const cb = g.createEl('input', { attr: { type: 'checkbox', id } }) as HTMLInputElement;
		cb.className = 'np-toggle-cb';
		cb.checked   = checked;
		g.createEl('label', { attr: { for: id }, cls: 'np-toggle-text', text: label });
		cb.addEventListener('change', () => onChange(cb.checked));
	}
}
