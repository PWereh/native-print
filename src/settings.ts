import { App, PluginSettingTab, Setting, setIcon } from 'obsidian';
import NativePrintPlugin from './main';
import { listSnippets, SnippetEntry } from './snippet-loader';

export type PageSize        = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid';
export type MarginPreset    = 'normal' | 'narrow' | 'wide' | 'custom';
export type Orientation     = 'portrait' | 'landscape';
export type ImageFilter     = 'none' | 'grayscale' | 'sepia' | 'bw';

export const PX_PER_MM = 96 / 25.4;

export const PAGE_DIMS_MM: Record<PageSize, [number, number]> = {
	A3:      [297, 420],
	A4:      [210, 297],
	A5:      [148, 210],
	Letter:  [216, 279],
	Legal:   [216, 356],
	Tabloid: [279, 432],
};

export interface PrintPluginSettings {
	pageSize:       PageSize;
	orientation:    Orientation;
	marginPreset:   MarginPreset;
	marginTop:      number;
	marginBottom:   number;
	marginLeft:     number;
	marginRight:    number;
	fontSize:                number;
	fontFamily:              string;
	includeTitle:            boolean;
	includeYamlFrontmatter:  boolean;
	showPreview:    boolean;
	codeWrap:       boolean;
	inlineImages:   boolean;
	trueColour:     boolean;
	renderMermaid:          boolean;
	renderCallouts:         boolean;
	renderTaskLists:        boolean;
	renderEmbeds:           boolean;
	postProcessorWaitMs:    number;
	imageFilter:        ImageFilter;
	imageMaxWidthPct:   number;
	imageOpacity:       number;
	imageDropShadow:    boolean;
	imageBorderRadius:  number;
	stripImages:        boolean;
	enabledCssPresets: string[];
	enabledSnippets:   string[];
}

export const MARGIN_PRESETS: Record<MarginPreset, { top: number; bottom: number; left: number; right: number }> = {
	normal:  { top: 20, bottom: 20, left: 25, right: 25 },
	narrow:  { top: 12, bottom: 12, left: 12, right: 12 },
	wide:    { top: 30, bottom: 30, left: 35, right: 35 },
	custom:  { top: 20, bottom: 20, left: 25, right: 25 },
};

export const PAGE_SIZE_LABELS: Record<PageSize, string> = {
	A3:      'A3 (297×420 mm)',
	A4:      'A4 (210×297 mm)',
	A5:      'A5 (148×210 mm)',
	Letter:  'Letter (8.5×11 in)',
	Legal:   'Legal (8.5×14 in)',
	Tabloid: 'Tabloid (11×17 in)',
};

export const DEFAULT_SETTINGS: PrintPluginSettings = {
	pageSize:       'A4',
	orientation:    'portrait',
	marginPreset:   'normal',
	marginTop:      20,
	marginBottom:   20,
	marginLeft:     25,
	marginRight:    25,
	fontSize:       11,
	fontFamily:     'Georgia, serif',
	includeTitle:   true,
	includeYamlFrontmatter: false,
	showPreview:    true,
	codeWrap:       false,
	inlineImages:   true,
	trueColour:     false,
	renderMermaid:          true,
	renderCallouts:         true,
	renderTaskLists:        true,
	renderEmbeds:           true,
	postProcessorWaitMs:    1200,
	imageFilter:        'none',
	imageMaxWidthPct:   100,
	imageOpacity:       100,
	imageDropShadow:    false,
	imageBorderRadius:  0,
	stripImages:        false,
	enabledCssPresets: [],
	enabledSnippets:   [],
};

export class PrintSettingTab extends PluginSettingTab {
	plugin: NativePrintPlugin;
	private snippetListEl: HTMLElement | null = null;

	constructor(app: App, plugin: NativePrintPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Native Print' });

		type TabId = 'general' | 'page' | 'rendering' | 'images' | 'snippets';
		const TABS: { id: TabId; label: string; icon: string }[] = [
			{ id: 'general',   label: 'General',   icon: 'sliders-horizontal' },
			{ id: 'page',      label: 'Page',       icon: 'file-text' },
			{ id: 'rendering', label: 'Rendering',  icon: 'layers' },
			{ id: 'images',    label: 'Images',     icon: 'image' },
			{ id: 'snippets',  label: 'Snippets',   icon: 'code' },
		];

		const tabLayout = containerEl.createDiv({ cls: 'np-settings-layout' });
		const tabBar    = tabLayout.createDiv({ cls: 'np-settings-tab-bar' });
		const tabWrap   = tabLayout.createDiv({ cls: 'np-settings-tab-wrap' });

		const panes = {} as Record<TabId, HTMLDivElement>;
		const btns  = {} as Record<TabId, HTMLButtonElement>;

		for (const t of TABS) {
			panes[t.id] = tabWrap.createDiv({ cls: 'np-settings-pane' });
		}

		const switchTab = (id: TabId) => {
			for (const t of TABS) {
				btns[t.id].toggleClass('np-settings-tab-active', t.id === id);
				panes[t.id].style.display = t.id === id ? 'block' : 'none';
			}
		};

		for (const t of TABS) {
			const btn = tabBar.createEl('button', { cls: 'np-settings-tab-btn' }) as HTMLButtonElement;
			const iconSpan = btn.createSpan({ cls: 'np-tab-icon' });
			setIcon(iconSpan, t.icon);
			btn.createSpan({ cls: 'np-tab-label', text: t.label });
			btns[t.id] = btn;
			btn.addEventListener('click', () => switchTab(t.id));
		}

		this.buildGeneralPane(panes.general);
		this.buildPagePane(panes.page);
		this.buildRenderingPane(panes.rendering);
		this.buildImagesPane(panes.images);
		this.buildSnippetsPane(panes.snippets);

		switchTab('general');
	}

	private buildGeneralPane(el: HTMLElement): void {
		el.createEl('h3', { text: 'Print management' });
		new Setting(el)
			.setName('Show print preview')
			.setDesc('Open a preview modal before printing.')
			.addToggle(t => t.setValue(this.plugin.settings.showPreview)
				.onChange(async v => { this.plugin.settings.showPreview = v; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Typography' });
		new Setting(el)
			.setName('Font size (pt)')
			.addSlider(s => s.setLimits(8, 18, 1).setValue(this.plugin.settings.fontSize)
				.setDynamicTooltip().setInstant(true)
				.onChange(async v => { this.plugin.settings.fontSize = v; await this.plugin.saveSettings(); }));
		new Setting(el)
			.setName('Font family')
			.setDesc('CSS font-family string for body text.')
			.addText(t => t.setPlaceholder('Georgia, serif').setValue(this.plugin.settings.fontFamily)
				.onChange(async v => { this.plugin.settings.fontFamily = v; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Content' });
		new Setting(el)
			.setName('Include document title')
			.setDesc('Print the note filename as an H1 heading.')
			.addToggle(t => t.setValue(this.plugin.settings.includeTitle)
				.onChange(async v => { this.plugin.settings.includeTitle = v; await this.plugin.saveSettings(); }));
		new Setting(el)
			.setName('Include YAML frontmatter')
			.addToggle(t => t.setValue(this.plugin.settings.includeYamlFrontmatter)
				.onChange(async v => { this.plugin.settings.includeYamlFrontmatter = v; await this.plugin.saveSettings(); }));
		new Setting(el)
			.setName('Wrap code blocks')
			.setDesc('Wrap long lines in code blocks.')
			.addToggle(t => t.setValue(this.plugin.settings.codeWrap)
				.onChange(async v => { this.plugin.settings.codeWrap = v; await this.plugin.saveSettings(); }));
		new Setting(el)
			.setName('True-colour output')
			.setDesc('Preserve original text and link colours.')
			.addToggle(t => t.setValue(this.plugin.settings.trueColour)
				.onChange(async v => { this.plugin.settings.trueColour = v; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Android' });
		el.createEl('p', { cls: 'np-setting-desc', text: 'Printing on Android requires the Obsidian Print Helper APK. No file permissions needed.' });
		new Setting(el)
			.setName('Inline images')
			.setDesc('Embed vault images as base64. Required for Android printing.')
			.addToggle(t => t.setValue(this.plugin.settings.inlineImages)
				.onChange(async v => { this.plugin.settings.inlineImages = v; await this.plugin.saveSettings(); }));
	}

	private buildPagePane(el: HTMLElement): void {
		el.createEl('h3', { text: 'Paper' });
		new Setting(el)
			.setName('Page size')
			.addDropdown(d => {
				Object.entries(PAGE_SIZE_LABELS).forEach(([k, v]) => d.addOption(k, v));
				return d.setValue(this.plugin.settings.pageSize)
					.onChange(async v => { this.plugin.settings.pageSize = v as PageSize; await this.plugin.saveSettings(); });
			});
		new Setting(el)
			.setName('Orientation')
			.addDropdown(d => d
				.addOption('portrait', 'Portrait').addOption('landscape', 'Landscape')
				.setValue(this.plugin.settings.orientation)
				.onChange(async v => { this.plugin.settings.orientation = v as Orientation; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Margins' });
		new Setting(el)
			.setName('Margin preset')
			.addDropdown(d => d
				.addOption('normal', 'Normal (20 / 25 mm)').addOption('narrow', 'Narrow (12 mm all)')
				.addOption('wide', 'Wide (30 / 35 mm)').addOption('custom', 'Custom')
				.setValue(this.plugin.settings.marginPreset)
				.onChange(async v => {
					const key = v as MarginPreset;
					this.plugin.settings.marginPreset = key;
					if (key !== 'custom') {
						const p = MARGIN_PRESETS[key];
						this.plugin.settings.marginTop    = p.top;
						this.plugin.settings.marginBottom = p.bottom;
						this.plugin.settings.marginLeft   = p.left;
						this.plugin.settings.marginRight  = p.right;
					}
					await this.plugin.saveSettings();
					this.display();
				}));
		this.addMarginSetting(el, 'marginTop',    'Top margin (mm)');
		this.addMarginSetting(el, 'marginBottom', 'Bottom margin (mm)');
		this.addMarginSetting(el, 'marginLeft',   'Left margin (mm)');
		this.addMarginSetting(el, 'marginRight',  'Right margin (mm)');
	}

	private buildRenderingPane(el: HTMLElement): void {
		el.createEl('h3', { text: 'Diagram rendering' });
		el.createEl('p', { cls: 'np-setting-desc', text: 'Controls how embedded diagrams and special block types are rendered in print output.' });

		new Setting(el)
			.setName('Render Mermaid diagrams')
			.setDesc('Convert Mermaid code blocks to inline SVG. Requires post-processor wait (see below).')
			.addToggle(t => t.setValue(this.plugin.settings.renderMermaid)
				.onChange(async v => { this.plugin.settings.renderMermaid = v; await this.plugin.saveSettings(); }));

		new Setting(el)
			.setName('Post-processor wait (ms)')
			.setDesc('Wait time for Obsidian\'s async renderers (Mermaid, callouts) to complete. 0 = disabled. Increase if diagrams appear as code blocks.')
			.addSlider(s => s.setLimits(0, 5000, 100)
				.setValue(this.plugin.settings.postProcessorWaitMs)
				.setDynamicTooltip().setInstant(true)
				.onChange(async v => { this.plugin.settings.postProcessorWaitMs = v; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Block types' });
		new Setting(el)
			.setName('Render callouts / admonitions')
			.setDesc('Apply colour-coded styling for > [!note], > [!warning] and all Obsidian callout types.')
			.addToggle(t => t.setValue(this.plugin.settings.renderCallouts)
				.onChange(async v => { this.plugin.settings.renderCallouts = v; await this.plugin.saveSettings(); }));
		new Setting(el)
			.setName('Render task list checkboxes')
			.setDesc('Style - [x] and - [ ] items with visible tick/empty boxes.')
			.addToggle(t => t.setValue(this.plugin.settings.renderTaskLists)
				.onChange(async v => { this.plugin.settings.renderTaskLists = v; await this.plugin.saveSettings(); }));
		new Setting(el)
			.setName('Render embedded notes')
			.setDesc('Apply border and background to ![[embedded note]] blocks.')
			.addToggle(t => t.setValue(this.plugin.settings.renderEmbeds)
				.onChange(async v => { this.plugin.settings.renderEmbeds = v; await this.plugin.saveSettings(); }));
	}

	private buildImagesPane(el: HTMLElement): void {
		el.createEl('h3', { text: 'Colour filter' });
		el.createEl('p', { cls: 'np-setting-desc', text: 'Apply a visual filter to all images in the print output.' });
		new Setting(el)
			.setName('Filter')
			.setDesc('None = full colour  ·  Grayscale = desaturated  ·  Sepia = warm tones  ·  B&W = high-contrast mono.')
			.addDropdown(d => d
				.addOption('none',      'None (full colour)')
				.addOption('grayscale', 'Grayscale')
				.addOption('sepia',     'Sepia')
				.addOption('bw',        'Black & White')
				.setValue(this.plugin.settings.imageFilter)
				.onChange(async v => { this.plugin.settings.imageFilter = v as ImageFilter; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Sizing & effects' });
		new Setting(el)
			.setName('Max image width (%)')
			.setDesc('Limit image width as a percentage of the print area.')
			.addSlider(s => s.setLimits(10, 100, 5)
				.setValue(this.plugin.settings.imageMaxWidthPct)
				.setDynamicTooltip().setInstant(true)
				.onChange(async v => { this.plugin.settings.imageMaxWidthPct = v; await this.plugin.saveSettings(); }));
		new Setting(el)
			.setName('Image opacity (%)')
			.setDesc('Reduce opacity to save ink. 100 = fully opaque.')
			.addSlider(s => s.setLimits(10, 100, 5)
				.setValue(this.plugin.settings.imageOpacity)
				.setDynamicTooltip().setInstant(true)
				.onChange(async v => { this.plugin.settings.imageOpacity = v; await this.plugin.saveSettings(); }));
		new Setting(el)
			.setName('Border radius (px)')
			.setDesc('Round image corners. 0 = sharp.')
			.addSlider(s => s.setLimits(0, 24, 1)
				.setValue(this.plugin.settings.imageBorderRadius)
				.setDynamicTooltip().setInstant(true)
				.onChange(async v => { this.plugin.settings.imageBorderRadius = v; await this.plugin.saveSettings(); }));
		new Setting(el)
			.setName('Drop shadow')
			.setDesc('Add a subtle shadow beneath images.')
			.addToggle(t => t.setValue(this.plugin.settings.imageDropShadow)
				.onChange(async v => { this.plugin.settings.imageDropShadow = v; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Strip images' });
		new Setting(el)
			.setName('Remove all images')
			.setDesc('Exclude all images from print output. Useful for text-only printing.')
			.addToggle(t => t.setValue(this.plugin.settings.stripImages)
				.onChange(async v => { this.plugin.settings.stripImages = v; await this.plugin.saveSettings(); }));
	}

	private buildSnippetsPane(el: HTMLElement): void {
		// ── Built-in CSS presets ── master toggle → unfolds list ─────────────
		el.createEl('h3', { text: 'CSS presets' });
		el.createEl('p', { cls: 'np-setting-desc',
			text: 'Built-in style presets. Enable the master toggle to configure individual presets.' });

		const masterRow = el.createDiv({ cls: 'np-preset-master-row' });
		const lbl = masterRow.createDiv({ cls: 'np-preset-master-lbl' });
		lbl.createSpan({ cls: 'np-preset-master-title', text: 'Apply CSS styles' });
		const badge = lbl.createSpan({ cls: 'np-preset-badge' });
		badge.textContent = this.plugin.settings.enabledCssPresets.length > 0
			? `${this.plugin.settings.enabledCssPresets.length} active` : '';

		const masterToggleWrap = masterRow.createEl('div', { cls: 'np-snippet-toggle' });
		const masterCb = masterToggleWrap.createEl('input', { attr: { type: 'checkbox', id: 'np-preset-master' } }) as HTMLInputElement;
		masterCb.checked = this.plugin.settings.enabledCssPresets.length > 0;
		masterToggleWrap.createEl('label', { attr: { for: 'np-preset-master' }, cls: 'np-snippet-toggle-label' });

		const presetList = el.createDiv({ cls: 'np-preset-list' });
		presetList.style.display = masterCb.checked ? '' : 'none';

		const PRESETS: Record<string, { name: string; desc: string }> = {
			'mermaid-zoom':   { name: 'Mermaid zoom',         desc: 'Responsive diagrams with resize handle' },
			'callout-border': { name: 'Callout border-only',  desc: 'Strip fill, keep left-border accent' },
			'code-polish':    { name: 'Code block polish',    desc: 'Soft bg, 9pt mono, tighter padding' },
			'table-zebra':    { name: 'Zebra-stripe tables',  desc: 'Alternating row shading' },
			'hide-links':     { name: 'Hide link underlines', desc: 'Remove underline from all links' },
			'compact':        { name: 'Compact spacing',      desc: 'Tighter line-height and margins' },
		};

		for (const [key, p] of Object.entries(PRESETS)) {
			const row = presetList.createDiv({ cls: 'np-preset-row' });
			const info = row.createDiv({ cls: 'np-preset-info' });
			info.createSpan({ cls: 'np-preset-name', text: p.name });
			info.createSpan({ cls: 'np-preset-desc', text: p.desc });
			const tw = row.createEl('div', { cls: 'np-snippet-toggle' });
			const cb = tw.createEl('input', { attr: { type: 'checkbox', id: `np-preset-${key}` } }) as HTMLInputElement;
			cb.checked = this.plugin.settings.enabledCssPresets.includes(key);
			tw.createEl('label', { attr: { for: `np-preset-${key}` }, cls: 'np-snippet-toggle-label' });
			cb.addEventListener('change', async () => {
				const list = this.plugin.settings.enabledCssPresets;
				if (cb.checked) { if (!list.includes(key)) list.push(key); }
				else { const i = list.indexOf(key); if (i !== -1) list.splice(i, 1); }
				badge.textContent = list.length > 0 ? `${list.length} active` : '';
				await this.plugin.saveSettings();
			});
		}

		masterCb.addEventListener('change', async () => {
			presetList.style.display = masterCb.checked ? '' : 'none';
			if (!masterCb.checked) {
				this.plugin.settings.enabledCssPresets = [];
				presetList.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(c => { c.checked = false; });
				badge.textContent = '';
				await this.plugin.saveSettings();
			}
		});

		// ── Vault snippets ────────────────────────────────────────────────────
		el.createEl('h3', { text: 'Vault CSS snippets' });
		el.createEl('p', { cls: 'np-setting-desc',
			text: 'Toggle snippets from .obsidian/snippets/ — same files as Appearance → CSS snippets.' });
		const header    = el.createDiv({ cls: 'np-snippet-header' });
		const reloadBtn = header.createEl('button', { cls: 'np-snippet-reload', text: '↻ Reload' });
		this.snippetListEl = el.createDiv({ cls: 'np-snippet-list' });
		reloadBtn.addEventListener('click', () => void this.refreshSnippets());
		void this.refreshSnippets();
	}

	async refreshSnippets(): Promise<void> {
		if (!this.snippetListEl) return;
		this.snippetListEl.empty();
		const entries = await listSnippets(this.app, this.plugin.settings.enabledSnippets);
		if (entries.length === 0) {
			this.snippetListEl.createEl('p', { cls: 'np-snippet-empty', text: 'No CSS snippets found in .obsidian/snippets/.' });
			return;
		}
		for (const entry of entries) this.renderSnippetRow(this.snippetListEl, entry);
	}

	private renderSnippetRow(parent: HTMLElement, entry: SnippetEntry): void {
		const row    = parent.createDiv({ cls: 'np-snippet-row' });
		const nameEl = row.createSpan({ cls: 'np-snippet-name', text: entry.filename });
		nameEl.title = entry.filename;
		const toggle   = row.createEl('div', { cls: 'np-snippet-toggle' });
		const checkbox = toggle.createEl('input', { attr: { type: 'checkbox', id: `np-snip-${entry.filename}` } }) as HTMLInputElement;
		checkbox.checked = entry.enabled;
		checkbox.addEventListener('change', async () => {
			const enabled = this.plugin.settings.enabledSnippets;
			if (checkbox.checked) { if (!enabled.includes(entry.filename)) enabled.push(entry.filename); }
			else { const idx = enabled.indexOf(entry.filename); if (idx !== -1) enabled.splice(idx, 1); }
			await this.plugin.saveSettings();
		});
		const label = toggle.createEl('label', { attr: { for: `np-snip-${entry.filename}` } });
		label.addClass('np-snippet-toggle-label');
	}

	private addMarginSetting(el: HTMLElement, key: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight', label: string): void {
		new Setting(el)
			.setName(label)
			.addSlider(s => s.setLimits(0, 50, 1).setValue(this.plugin.settings[key])
				.setDynamicTooltip().setInstant(true)
				.onChange(async v => { this.plugin.settings[key] = v; this.plugin.settings.marginPreset = 'custom'; await this.plugin.saveSettings(); }));
	}
}
