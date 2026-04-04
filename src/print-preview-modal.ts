import { App, Modal, Platform } from 'obsidian';
import {
	PrintPluginSettings, MARGIN_PRESETS, MarginPreset,
	PageSize, Orientation, PAGE_DIMS_MM, PX_PER_MM,
} from './settings';
import { buildHelperUrl } from './html-builder';
import NativePrintPlugin from './main';

export type PrintExecutor = (html: string) => void;

/** Vertical offset from preview-area top to the paper outline top (px). */
const OUTLINE_TOP = 20;
/** Gap between pages (px in screen space, after scaling). */
const PAGE_GAP_PX = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Custom Margin Sub-modal
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
		this.vals = { ...initial };
		this.onConfirm = onConfirm;
		this.onDismiss = onDismiss;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle('Custom Margins (mm)');
		type MK = 'top' | 'bottom' | 'left' | 'right';
		const sides: { label: string; key: MK }[] = [
			{ label: 'Top', key: 'top' }, { label: 'Bottom', key: 'bottom' },
			{ label: 'Left', key: 'left' }, { label: 'Right', key: 'right' },
		];
		for (const { label, key } of sides) {
			const row = contentEl.createDiv({ cls: 'np-cm-row' });
			row.createSpan({ cls: 'np-cm-label', text: label });
			const dec = row.createEl('button', { cls: 'native-print-stepper', text: '−' });
			const val = row.createSpan({ cls: 'native-print-stepper-value np-cm-val', text: `${this.vals[key]} mm` });
			const inc = row.createEl('button', { cls: 'native-print-stepper', text: '+' });
			const upd = (d: number) => { this.vals[key] = Math.min(50, Math.max(0, this.vals[key] + d)); val.textContent = `${this.vals[key]} mm`; };
			dec.addEventListener('click', () => upd(-1));
			inc.addEventListener('click', () => upd(+1));
		}
		const btnRow = contentEl.createDiv({ cls: 'np-custom-btn-row' });
		btnRow.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Apply', cls: 'mod-cta' }).addEventListener('click', () => { this.onConfirm({ ...this.vals }); this.close(); });
	}

	onClose(): void { this.onDismiss(); this.contentEl.empty(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Print Preview Modal
// ─────────────────────────────────────────────────────────────────────────────
export class PrintPreviewModal extends Modal {
	private readonly fragment: string;
	private readonly title: string;
	private readonly onPrint: PrintExecutor;
	private readonly plugin: NativePrintPlugin;
	private local: PrintPluginSettings;

	// DOM
	private frame:        HTMLIFrameElement | null = null;
	private wrapper:      HTMLDivElement | null    = null;
	/** Scroll layer: sits behind the static outline. */
	private scrollCanvas: HTMLDivElement | null    = null;
	/** Static paper boundary — never scrolls. */
	private paperOutline: HTMLDivElement | null    = null;
	/** Inner margin guide inside the paper outline. */
	private marginGuide:  HTMLDivElement | null    = null;

	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private marginsSelect: HTMLSelectElement | null = null;
	private scale = 1;

	constructor(
		app: App, fragment: string, title: string,
		settings: PrintPluginSettings, onPrint: PrintExecutor, plugin: NativePrintPlugin
	) {
		super(app);
		this.fragment = fragment; this.title = title;
		this.onPrint  = onPrint; this.plugin = plugin;
		this.local    = { ...settings };
	}

	onOpen(): void {
		const { modalEl, contentEl } = this;
		modalEl.addClass('native-print-preview-modal');
		this.setTitle(`Print Preview — ${this.title}`);

		// ── 1. Preview area ────────────────────────────────────────────────
		const previewArea = contentEl.createDiv({ cls: 'native-print-preview-area' });

		// Scrollable canvas — sits behind the paper outline (z-index 1)
		this.scrollCanvas = previewArea.createDiv({ cls: 'np-scroll-canvas' }) as HTMLDivElement;
		// Centering pad inside the scroll canvas
		const scrollPad = this.scrollCanvas.createDiv({ cls: 'np-scroll-pad' });
		// Wrapper: sized by JS to the scaled document footprint (includes page gaps)
		this.wrapper = scrollPad.createDiv({ cls: 'np-frame-wrapper' }) as HTMLDivElement;
		this.frame   = this.wrapper.createEl('iframe', {
			cls: 'native-print-preview-frame', attr: { sandbox: 'allow-same-origin' },
		}) as HTMLIFrameElement;

		// Static paper outline overlay — never scrolls (z-index 10)
		this.paperOutline = previewArea.createDiv({ cls: 'np-paper-outline' }) as HTMLDivElement;
		// Inner margin guide (content-area boundary) inside the outline
		this.marginGuide  = this.paperOutline.createDiv({ cls: 'np-margin-guide' }) as HTMLDivElement;

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
				if (this.marginsSelect) this.marginsSelect.value = this.local.marginPreset === 'custom' ? 'normal' : this.local.marginPreset;
				return;
			}
			const p = MARGIN_PRESETS[v as MarginPreset];
			this.local = { ...this.local, marginPreset: v as MarginPreset, marginTop: p.top, marginBottom: p.bottom, marginLeft: p.left, marginRight: p.right };
			this.scheduleRerender();
		});

		this.addStepper(toolbar, 'Font (pt)', this.local.fontSize, 'pt', 8, 18, v => { this.local.fontSize = v; this.scheduleRerender(); });
		this.addCircleToggle(toolbar, 'Title',    this.local.includeTitle,           v => { this.local.includeTitle = v;            this.scheduleRerender(); });
		this.addCircleToggle(toolbar, 'Metadata', this.local.includeYamlFrontmatter, v => { this.local.includeYamlFrontmatter = v; this.scheduleRerender(); });

		// ── 3. Button row ──────────────────────────────────────────────────
		const btnRow = contentEl.createDiv({ cls: 'native-print-btn-row' });
		btnRow.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		btnRow.createEl('button', { cls: 'mod-cta', text: '🖨  Print' }).addEventListener('click', () => {
			this.close();
			this.onPrint(buildHelperUrl.wrapDocument(this.fragment, this.title, this.local));
		});
	}

	onClose(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.contentEl.empty();
	}

	// ── Custom margin sub-modal ────────────────────────────────────────────────

	private openCustomMarginModal(): void {
		const { modalEl } = this;
		modalEl.addClass('native-print-blurred');
		new CustomMarginModal(this.app,
			{ top: this.local.marginTop, bottom: this.local.marginBottom, left: this.local.marginLeft, right: this.local.marginRight },
			v => {
				this.local = { ...this.local, marginPreset: 'custom', marginTop: v.top, marginBottom: v.bottom, marginLeft: v.left, marginRight: v.right };
				this.plugin.settings = { ...this.plugin.settings, ...this.local };
				void this.plugin.saveSettings();
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
		this.updateOutline(paperW, pageH);
		this.frame.srcdoc = buildHelperUrl.wrapDocument(this.fragment, this.title, this.local);
		this.frame.addEventListener('load', () => this.onFrameLoaded(paperW, pageH), { once: true });
	}

	/**
	 * After iframe loads: read scroll height, compute page count,
	 * extend iframe + wrapper, inject page-gap divs between pages.
	 */
	private onFrameLoaded(paperW: number, pageH: number): void {
		if (!this.frame?.contentDocument || !this.wrapper) return;

		const scrollH = this.frame.contentDocument.documentElement.scrollHeight;
		const nPages  = Math.max(1, Math.ceil(scrollH / pageH));
		const totalH  = nPages * pageH;

		// Extend iframe to full document height.
		this.frame.style.height = `${totalH}px`;

		// Remove stale gap divs then re-add them.
		this.wrapper.querySelectorAll('.np-page-gap').forEach(el => el.remove());

		// Wrapper height = scaled content + inter-page gaps.
		const gapCount = nPages - 1;
		this.wrapper.style.height = `${Math.round(totalH * this.scale) + gapCount * PAGE_GAP_PX}px`;

		for (let i = 1; i < nPages; i++) {
			const gap = this.wrapper.createDiv({ cls: 'np-page-gap' });
			// Top = scaled iframe content through page i + accumulated prior gaps.
			gap.style.top    = `${Math.round(i * pageH * this.scale) + (i - 1) * PAGE_GAP_PX}px`;
			gap.style.height = `${PAGE_GAP_PX}px`;
		}
	}

	/** Physical paper size in CSS px at 96 dpi. */
	private paperPx(): { paperW: number; pageH: number } {
		const [pw, ph] = PAGE_DIMS_MM[this.local.pageSize] ?? [210, 297];
		const [wMm, hMm] = this.local.orientation === 'landscape' ? [ph, pw] : [pw, ph];
		return { paperW: Math.round(wMm * PX_PER_MM), pageH: Math.round(hMm * PX_PER_MM) };
	}

	/**
	 * Computes fit-scale from available width, sizes iframe to full paper px,
	 * CSS-scales it down, and sets wrapper to the scaled footprint.
	 */
	private applyScale(paperW: number, pageH: number): void {
		if (!this.frame || !this.wrapper || !this.scrollCanvas) return;
		const availW = this.scrollCanvas.clientWidth - 32;
		this.scale   = Math.min(1, availW > 0 ? availW / paperW : 1);

		this.frame.style.width           = `${paperW}px`;
		this.frame.style.height          = `${pageH}px`;    // extended on load
		this.frame.style.transform       = `scale(${this.scale})`;
		this.frame.style.transformOrigin = 'top left';

		this.wrapper.style.width  = `${Math.round(paperW * this.scale)}px`;
		this.wrapper.style.height = `${Math.round(pageH  * this.scale)}px`;
	}

	/**
	 * Sizes and positions the static paper outline and its inner margin guide.
	 * The outline is positioned at OUTLINE_TOP px from the preview area top,
	 * centred horizontally — it never scrolls.
	 */
	private updateOutline(paperW: number, pageH: number): void {
		if (!this.paperOutline || !this.marginGuide) return;

		const scaledW = Math.round(paperW * this.scale);
		const scaledH = Math.round(pageH  * this.scale);

		// Outer paper boundary (one page)
		this.paperOutline.style.width  = `${scaledW}px`;
		this.paperOutline.style.height = `${scaledH}px`;
		// Horizontal centering is handled by CSS (left:50% + translateX(-50%))

		// Inner margin guide — offsets in scaled px matching the iframe padding
		const { marginTop: T, marginBottom: B, marginLeft: L, marginRight: R } = this.local;
		this.marginGuide.style.top    = `${T * PX_PER_MM * this.scale}px`;
		this.marginGuide.style.right  = `${R * PX_PER_MM * this.scale}px`;
		this.marginGuide.style.bottom = `${B * PX_PER_MM * this.scale}px`;
		this.marginGuide.style.left   = `${L * PX_PER_MM * this.scale}px`;
	}

	private scheduleRerender(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => this.renderFrame(), 250);
	}

	// ── Control builders ──────────────────────────────────────────────────────

	private addSelect(parent: HTMLElement, label: string, options: Record<string, string>, value: string, onChange: (v: string) => void): HTMLSelectElement {
		const g = parent.createDiv({ cls: 'native-print-toolbar-group' });
		g.createSpan({ cls: 'native-print-toolbar-label', text: label });
		const sel = g.createEl('select', { cls: 'native-print-toolbar-select' });
		for (const [k, v] of Object.entries(options)) { const opt = sel.createEl('option', { value: k, text: v }); if (k === value) opt.selected = true; }
		sel.addEventListener('change', () => onChange(sel.value));
		return sel;
	}

	private addStepper(parent: HTMLElement, label: string, initial: number, unit: string, min: number, max: number, onChange: (v: number) => void): void {
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

	private addCircleToggle(parent: HTMLElement, label: string, checked: boolean, onChange: (v: boolean) => void): void {
		const g  = parent.createDiv({ cls: 'np-toggle-group' });
		const id = `np-toggle-${label.toLowerCase().replace(/\s+/g, '-')}`;
		const cb = g.createEl('input', { attr: { type: 'checkbox', id } }) as HTMLInputElement;
		cb.className = 'np-toggle-cb'; cb.checked = checked;
		g.createEl('label', { attr: { for: id }, cls: 'np-toggle-text', text: label });
		cb.addEventListener('change', () => onChange(cb.checked));
	}
}
