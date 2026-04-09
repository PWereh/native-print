import { App, Modal } from 'obsidian';
import {
	PrintPluginSettings, MARGIN_PRESETS, MarginPreset,
	PageSize, Orientation, PAGE_DIMS_MM, PX_PER_MM,
} from './settings';
import { buildHelperUrl } from './html-builder';
import NativePrintPlugin from './main';

export type PrintExecutor = (html: string) => void;

const PAGE_GAP_PX = 12;
const CANVAS_PAD  = 20;

type MarginVals = { top: number; bottom: number; left: number; right: number };

// ─────────────────────────────────────────────────────────────────────────────
// Custom Margin Sub-modal — steppers + sliders, synced
// ─────────────────────────────────────────────────────────────────────────────
class CustomMarginModal extends Modal {
	private vals: MarginVals;
	private readonly onConfirm: (v: MarginVals) => void;
	private readonly onDismiss: () => void;

	constructor(app: App, initial: MarginVals,
		onConfirm: (v: MarginVals) => void, onDismiss: () => void) {
		super(app);
		this.vals      = { ...initial };
		this.onConfirm = onConfirm;
		this.onDismiss = onDismiss;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle('Custom Margins (mm)');

		type MK = keyof MarginVals;
		const sides: { label: string; key: MK }[] = [
			{ label: 'Top',    key: 'top'    }, { label: 'Bottom', key: 'bottom' },
			{ label: 'Left',   key: 'left'   }, { label: 'Right',  key: 'right'  },
		];

		for (const { label, key } of sides) {
			const row = contentEl.createDiv({ cls: 'np-cm-row' });
			row.createSpan({ cls: 'np-cm-label', text: label });

			// Stepper + value display
			const ctrlRow = row.createDiv({ cls: 'np-cm-ctrl-row' });
			const dec = ctrlRow.createEl('button', { cls: 'native-print-stepper', text: '−' });
			const valSpan = ctrlRow.createSpan({
				cls: 'native-print-stepper-value np-cm-val',
				text: `${this.vals[key]} mm`,
			});
			const inc = ctrlRow.createEl('button', { cls: 'native-print-stepper', text: '+' });

			// Slider
			const slider = row.createEl('input', {
				attr: { type: 'range', min: '0', max: '50', step: '1', value: String(this.vals[key]) },
			}) as HTMLInputElement;
			slider.className = 'np-cm-slider';

			const update = (v: number) => {
				this.vals[key]     = Math.min(50, Math.max(0, v));
				valSpan.textContent = `${this.vals[key]} mm`;
				slider.value       = String(this.vals[key]);
			};
			dec.addEventListener('click',  () => update(this.vals[key] - 1));
			inc.addEventListener('click',  () => update(this.vals[key] + 1));
			slider.addEventListener('input', () => update(Number(slider.value)));
		}

		const btnRow = contentEl.createDiv({ cls: 'np-custom-btn-row' });
		btnRow.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Apply', cls: 'mod-cta' })
			.addEventListener('click', () => { this.onConfirm({ ...this.vals }); this.close(); });
	}

	onClose(): void { this.onDismiss(); this.contentEl.empty(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Print Preview Modal
// ─────────────────────────────────────────────────────────────────────────────
export class PrintPreviewModal extends Modal {
	private readonly fragment: string;
	private readonly title:    string;
	private readonly onPrint:  PrintExecutor;
	private readonly plugin:   NativePrintPlugin;
	private local: PrintPluginSettings;

	/**
	 * Remembers the last user-set custom margin values independently of
	 * which preset is currently active. Seeded from plugin.settings on open
	 * (if marginPreset === 'custom') or from MARGIN_PRESETS.normal otherwise.
	 * Persists across preset switches within the session so "Custom…" always
	 * restores what the user last typed.
	 */
	private savedCustomMargins: MarginVals;

	private frame:        HTMLIFrameElement | null = null;
	private wrapper:      HTMLDivElement    | null = null;
	private scrollCanvas: HTMLDivElement    | null = null;
	private pageCounter:  HTMLDivElement    | null = null;

	private debounceTimer:   ReturnType<typeof setTimeout> | null = null;
	private scrollFadeTimer: ReturnType<typeof setTimeout> | null = null;
	private marginsSelect:   HTMLSelectElement | null = null;

	private scale    = 1;
	private scaledPH = 0;
	private nPages   = 1;

	constructor(app: App, fragment: string, title: string,
		settings: PrintPluginSettings, onPrint: PrintExecutor, plugin: NativePrintPlugin) {
		super(app);
		this.fragment = fragment; this.title  = title;
		this.onPrint  = onPrint;  this.plugin = plugin;
		this.local    = { ...settings };

		// Seed savedCustomMargins from persisted settings if they were custom,
		// otherwise from the normal preset defaults.
		const p = MARGIN_PRESETS.normal;
		this.savedCustomMargins = settings.marginPreset === 'custom'
			? { top: settings.marginTop, bottom: settings.marginBottom,
			    left: settings.marginLeft, right: settings.marginRight }
			: { top: p.top, bottom: p.bottom, left: p.left, right: p.right };
	}

	onOpen(): void {
		const { modalEl, contentEl } = this;
		modalEl.addClass('native-print-preview-modal');
		this.setTitle(`Print Preview — ${this.title}`);

		// ── 1. Preview area ────────────────────────────────────────────────
		const previewArea = contentEl.createDiv({ cls: 'native-print-preview-area' });
		this.scrollCanvas = previewArea.createDiv({ cls: 'np-scroll-canvas' });
		const scrollPad   = this.scrollCanvas.createDiv({ cls: 'np-scroll-pad' });
		this.wrapper      = scrollPad.createDiv({ cls: 'np-frame-wrapper' });
		this.frame        = this.wrapper.createEl('iframe', {
			cls: 'native-print-preview-frame', attr: { sandbox: 'allow-same-origin' },
		}) as HTMLIFrameElement;

		this.pageCounter = previewArea.createDiv({ cls: 'np-page-counter' });
		this.pageCounter.textContent = '1 / 1';
		this.scrollCanvas.addEventListener('scroll', () => this.onScroll());

		this.renderFrame();

		// ── 2. Toolbar ─────────────────────────────────────────────────────
		const toolbar = contentEl.createDiv({ cls: 'native-print-toolbar' });

		this.addSelect(toolbar, 'Paper', {
			A3: 'A3', A4: 'A4', A5: 'A5', Letter: 'Letter', Legal: 'Legal', Tabloid: 'Tabloid',
		}, this.local.pageSize, v => { this.local.pageSize = v as PageSize; this.scheduleRerender(); });

		this.addSelect(toolbar, 'Orient.', {
			portrait: 'Portrait', landscape: 'Landscape',
		}, this.local.orientation, v => { this.local.orientation = v as Orientation; this.scheduleRerender(); });

		this.marginsSelect = this.addSelect(toolbar, 'Margins', {
			normal: 'Normal', narrow: 'Narrow', wide: 'Wide', custom: 'Custom…',
		}, this.local.marginPreset, v => {
			if (v === 'custom') {
				this.openCustomMarginModal();
				// Reset displayed value to last non-custom preset so 'Custom…'
				// can be re-selected (change event won't fire on same value).
				if (this.marginsSelect)
					this.marginsSelect.value = this.local.marginPreset === 'custom'
						? 'normal' : this.local.marginPreset;
				return;
			}
			const key = v as MarginPreset;
			const p   = MARGIN_PRESETS[key];
			this.local = { ...this.local, marginPreset: key,
				marginTop: p.top, marginBottom: p.bottom, marginLeft: p.left, marginRight: p.right };
			this.scheduleRerender();
		});

		this.addStepper(toolbar, 'Font (pt)', this.local.fontSize, 'pt', 8, 18, v => {
			this.local.fontSize = v; this.scheduleRerender();
		});
		this.addCircleToggle(toolbar, 'Title',    this.local.includeTitle,           v => { this.local.includeTitle = v;            this.scheduleRerender(); });
		this.addCircleToggle(toolbar, 'Metadata', this.local.includeYamlFrontmatter, v => { this.local.includeYamlFrontmatter = v; this.scheduleRerender(); });
		this.addCircleToggle(toolbar, 'Wrap',     this.local.codeWrap,               v => { this.local.codeWrap = v;                this.scheduleRerender(); });
		this.addCircleToggle(toolbar, 'Colour',   this.local.trueColour,             v => { this.local.trueColour = v;              this.scheduleRerender(); });

		// ── 3. Button row ──────────────────────────────────────────────────
		const btnRow = contentEl.createDiv({ cls: 'native-print-btn-row' });
		btnRow.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		btnRow.createEl('button', { cls: 'mod-cta', text: '🖨  Print' }).addEventListener('click', () => {
			// Persist current full local settings (incl. any toolbar changes) on Print.
			this.plugin.settings = { ...this.plugin.settings, ...this.local };
			void this.plugin.saveSettings();
			this.close();
			this.onPrint(buildHelperUrl.wrapDocument(this.fragment, this.title, this.local));
		});
	}

	onClose(): void {
		if (this.debounceTimer)   clearTimeout(this.debounceTimer);
		if (this.scrollFadeTimer) clearTimeout(this.scrollFadeTimer);
		this.contentEl.empty();
	}

	// ── Page counter ──────────────────────────────────────────────────────────

	private onScroll(): void {
		if (!this.scrollCanvas || !this.pageCounter || this.scaledPH === 0) return;
		const scrollTop = this.scrollCanvas.scrollTop;
		const slotH     = this.scaledPH + PAGE_GAP_PX;
		const pg        = Math.min(this.nPages, Math.floor(scrollTop / slotH) + 1);
		this.pageCounter.textContent = `${pg} / ${this.nPages}`;
		this.pageCounter.classList.add('np-pc-visible');
		if (this.scrollFadeTimer) clearTimeout(this.scrollFadeTimer);
		this.scrollFadeTimer = setTimeout(() =>
			this.pageCounter?.classList.remove('np-pc-visible'), 1600);
	}

	// ── Custom margin sub-modal ────────────────────────────────────────────────

	private openCustomMarginModal(): void {
		const { modalEl } = this;
		modalEl.addClass('native-print-blurred');

		new CustomMarginModal(this.app,
			// Always seed with savedCustomMargins so switching presets
			// and back to Custom restores the user's last typed values.
			{ ...this.savedCustomMargins },
			v => {
				// 1. Remember custom values across preset switches.
				this.savedCustomMargins = { ...v };

				// 2. Apply to live preview.
				this.local = { ...this.local, marginPreset: 'custom',
					marginTop: v.top, marginBottom: v.bottom,
					marginLeft: v.left, marginRight: v.right };

				// 3. Persist margins immediately — independent of other toolbar
				//    settings so they survive preset switches and restarts.
				this.plugin.settings.marginPreset = 'custom';
				this.plugin.settings.marginTop    = v.top;
				this.plugin.settings.marginBottom = v.bottom;
				this.plugin.settings.marginLeft   = v.left;
				this.plugin.settings.marginRight  = v.right;
				void this.plugin.saveSettings();

				// 4. Update select display.
				if (this.marginsSelect) this.marginsSelect.value = 'custom';

				this.scheduleRerender();
			},
			() => modalEl.removeClass('native-print-blurred')
		).open();
	}

	// ── Rendering ──────────────────────────────────────────────────────────────

	private renderFrame(): void {
		if (!this.frame || !this.wrapper) return;
		const { paperW, pageH } = this.paperPx();
		this.applyScale(paperW, pageH);
		this.frame.srcdoc = buildHelperUrl.wrapDocument(this.fragment, this.title, this.local);
		this.frame.addEventListener('load', () => this.onFrameLoaded(paperW, pageH), { once: true });
	}

	private onFrameLoaded(paperW: number, pageH: number): void {
		if (!this.frame?.contentDocument || !this.wrapper) return;

		const scrollH  = this.frame.contentDocument.documentElement.scrollHeight;
		this.nPages    = Math.max(1, Math.ceil(scrollH / pageH));
		const totalH   = this.nPages * pageH;
		this.scaledPH  = Math.round(pageH  * this.scale);
		const scaledPW = Math.round(paperW * this.scale);

		this.wrapper.querySelectorAll('.np-page-gap, .np-page-overlay').forEach(el => el.remove());
		this.frame.style.height = `${totalH}px`;

		this.wrapper.style.height =
			`${this.scaledPH * this.nPages + PAGE_GAP_PX * (this.nPages - 1)}px`;

		const { marginTop: T, marginBottom: B, marginLeft: L, marginRight: R } = this.local;
		const mT = Math.round(T * PX_PER_MM * this.scale);
		const mB = Math.round(B * PX_PER_MM * this.scale);
		const mL = Math.round(L * PX_PER_MM * this.scale);
		const mR = Math.round(R * PX_PER_MM * this.scale);

		for (let i = 0; i < this.nPages; i++) {
			const slotTop = i * this.scaledPH + i * PAGE_GAP_PX;

			if (i > 0) {
				const gap = this.wrapper.createDiv({ cls: 'np-page-gap' });
				gap.style.top    = `${slotTop - PAGE_GAP_PX}px`;
				gap.style.height = `${PAGE_GAP_PX}px`;
				gap.style.width  = `${scaledPW}px`;
			}

			const overlay = this.wrapper.createDiv({ cls: 'np-page-overlay' });
			overlay.style.top    = `${slotTop}px`;
			overlay.style.width  = `${scaledPW}px`;
			overlay.style.height = `${this.scaledPH}px`;

			// Four margin bands: solid white base + diagonal hatch on top.
			// White base fully occludes overflowing iframe content.
			type Band = { cls: string; t?: string; r?: string; b?: string; l?: string; w?: string; h?: string };
			const bands: Band[] = [
				{ cls: 'np-mb-top',    t: '0',       l: '0', r: '0',       h: `${mT}px`  },
				{ cls: 'np-mb-bottom', b: '0',       l: '0', r: '0',       h: `${mB}px`  },
				{ cls: 'np-mb-left',   t: `${mT}px`, b: `${mB}px`, l: '0', w: `${mL}px`  },
				{ cls: 'np-mb-right',  t: `${mT}px`, b: `${mB}px`, r: '0', w: `${mR}px`  },
			];
			for (const b of bands) {
				const el = overlay.createDiv({ cls: `np-margin-band ${b.cls}` });
				if (b.t !== undefined) el.style.top    = b.t;
				if (b.b !== undefined) el.style.bottom = b.b;
				if (b.l !== undefined) el.style.left   = b.l;
				if (b.r !== undefined) el.style.right  = b.r;
				if (b.w !== undefined) el.style.width  = b.w;
				if (b.h !== undefined) el.style.height = b.h;
			}

			const guide = overlay.createDiv({ cls: 'np-margin-guide' });
			guide.style.top    = `${mT}px`;
			guide.style.right  = `${mR}px`;
			guide.style.bottom = `${mB}px`;
			guide.style.left   = `${mL}px`;

			(['np-ct-tl', 'np-ct-tr', 'np-ct-bl', 'np-ct-br'] as const)
				.forEach(cls => guide.createDiv({ cls: `np-corner-target ${cls}` }));
		}

		if (this.pageCounter) this.pageCounter.textContent = `1 / ${this.nPages}`;
	}

	private paperPx(): { paperW: number; pageH: number } {
		const [pw, ph]   = PAGE_DIMS_MM[this.local.pageSize] ?? [210, 297];
		const [wMm, hMm] = this.local.orientation === 'landscape' ? [ph, pw] : [pw, ph];
		return { paperW: Math.round(wMm * PX_PER_MM), pageH: Math.round(hMm * PX_PER_MM) };
	}

	private applyScale(paperW: number, pageH: number): void {
		if (!this.frame || !this.wrapper || !this.scrollCanvas) return;
		const availW = this.scrollCanvas.clientWidth - CANVAS_PAD * 2;
		this.scale   = Math.min(1, availW > 0 ? availW / paperW : 1);
		this.frame.style.width           = `${paperW}px`;
		this.frame.style.height          = `${pageH}px`;
		this.frame.style.transform       = `scale(${this.scale})`;
		this.frame.style.transformOrigin = 'top left';
		this.wrapper.style.width  = `${Math.round(paperW * this.scale)}px`;
		this.wrapper.style.height = `${Math.round(pageH  * this.scale)}px`;
	}

	private scheduleRerender(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => this.renderFrame(), 250);
	}

	// ── Control builders ──────────────────────────────────────────────────────

	private addSelect(parent: HTMLElement, label: string, options: Record<string, string>,
		value: string, onChange: (v: string) => void): HTMLSelectElement {
		const g = parent.createDiv({ cls: 'native-print-toolbar-group' });
		g.createSpan({ cls: 'native-print-toolbar-label', text: label });
		const sel = g.createEl('select', { cls: 'native-print-toolbar-select' });
		for (const [k, v] of Object.entries(options)) {
			const opt = sel.createEl('option', { value: k, text: v });
			if (k === value) opt.selected = true;
		}
		sel.addEventListener('change', () => onChange(sel.value));
		return sel;
	}

	private addStepper(parent: HTMLElement, label: string, initial: number, unit: string,
		min: number, max: number, onChange: (v: number) => void): void {
		const g = parent.createDiv({ cls: 'native-print-toolbar-group' });
		g.createSpan({ cls: 'native-print-toolbar-label', text: label });
		let cur = initial;
		const dec = g.createEl('button', { cls: 'native-print-stepper', text: '−' });
		const val = g.createSpan({ cls: 'native-print-stepper-value', text: `${cur} ${unit}` });
		const inc = g.createEl('button', { cls: 'native-print-stepper', text: '+' });
		const upd = (d: number) => { cur = Math.min(max, Math.max(min, cur + d)); val.textContent = `${cur} ${unit}`; onChange(cur); };
		dec.addEventListener('click', () => upd(-1));
		inc.addEventListener('click', () => upd(+1));
	}

	private addCircleToggle(parent: HTMLElement, label: string, checked: boolean,
		onChange: (v: boolean) => void): void {
		const g  = parent.createDiv({ cls: 'np-toggle-group' });
		const id = `np-toggle-${label.toLowerCase().replace(/\s+/g, '-')}`;
		const cb = g.createEl('input', { attr: { type: 'checkbox', id } }) as HTMLInputElement;
		cb.className = 'np-toggle-cb'; cb.checked = checked;
		g.createEl('label', { attr: { for: id }, cls: 'np-toggle-text', text: label });
		cb.addEventListener('change', () => onChange(cb.checked));
	}
}
