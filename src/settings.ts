import { App, PluginSettingTab, Setting } from 'obsidian';
import NativePrintPlugin from './main';
import { listSnippets, SnippetEntry } from './snippet-loader';

export type PageSize    = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid';
export type MarginPreset = 'normal' | 'narrow' | 'wide' | 'custom';
export type Orientation  = 'portrait' | 'landscape';

export const PX_PER_MM = 96 / 25.4;

export const PAGE_DIMS_MM: Record<PageSize, [number, number]> = {
	A3:[297,420], A4:[210,297], A5:[148,210],
	Letter:[216,279], Legal:[216,356], Tabloid:[279,432],
};

export interface PrintPluginSettings {
	// Page
	pageSize: PageSize; orientation: Orientation; marginPreset: MarginPreset;
	marginTop: number; marginBottom: number; marginLeft: number; marginRight: number;
	// Typography
	fontSize: number; fontFamily: string;
	// Content
	includeTitle: boolean; includeYamlFrontmatter: boolean;
	// Preview
	showPreview: boolean;
	// Output quality
	codeWrap: boolean; inlineImages: boolean; trueColour: boolean;
	// Render
	renderMermaid:  boolean;
	renderCallouts: boolean;
	// Image manipulation
	imageGrayscale:  boolean;
	imageInvert:     boolean;
	imageBrightness: number;
	imageContrast:   number;
	imageSaturate:   number;
	// CSS snippets
	enabledSnippets: string[];
}

export const MARGIN_PRESETS: Record<MarginPreset, {top:number;bottom:number;left:number;right:number}> = {
	normal:{top:20,bottom:20,left:25,right:25},
	narrow:{top:12,bottom:12,left:12,right:12},
	wide:  {top:30,bottom:30,left:35,right:35},
	custom:{top:20,bottom:20,left:25,right:25},
};

export const PAGE_SIZE_LABELS: Record<PageSize, string> = {
	A3:'A3 (297×420 mm)', A4:'A4 (210×297 mm)', A5:'A5 (148×210 mm)',
	Letter:'Letter (8.5×11 in)', Legal:'Legal (8.5×14 in)', Tabloid:'Tabloid (11×17 in)',
};

export const DEFAULT_SETTINGS: PrintPluginSettings = {
	pageSize:'A4', orientation:'portrait', marginPreset:'normal',
	marginTop:20, marginBottom:20, marginLeft:25, marginRight:25,
	fontSize:11, fontFamily:'Georgia, serif',
	includeTitle:true, includeYamlFrontmatter:false, showPreview:true,
	codeWrap:false, inlineImages:true, trueColour:false,
	renderMermaid:true, renderCallouts:true,
	imageGrayscale:false, imageInvert:false,
	imageBrightness:100, imageContrast:100, imageSaturate:100,
	enabledSnippets:[],
};

// ─── Tab IDs ─────────────────────────────────────────────────────────────────
type TabId = 'general' | 'render' | 'image' | 'snippets';

export class PrintSettingTab extends PluginSettingTab {
	plugin: NativePrintPlugin;
	private snippetListEl: HTMLElement | null = null;
	private activeTab: TabId = 'general';

	constructor(app: App, plugin: NativePrintPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Native Print' });

		// ── Tab bar ────────────────────────────────────────────────────────
		const tabBar   = containerEl.createDiv({ cls: 'np-tab-bar' });
		const tabBody  = containerEl.createDiv({ cls: 'np-tab-body' });

		const tabs: { id: TabId; label: string }[] = [
			{ id:'general',  label:'General'  },
			{ id:'render',   label:'Render'   },
			{ id:'image',    label:'Image'    },
			{ id:'snippets', label:'Snippets' },
		];

		const panels: Partial<Record<TabId, HTMLElement>> = {};

		tabs.forEach(({ id, label }) => {
			const btn = tabBar.createEl('button', { cls: 'np-tab-btn', text: label });
			if (id === this.activeTab) btn.addClass('np-tab-active');

			const panel = tabBody.createDiv({ cls: 'np-tab-panel' });
			if (id !== this.activeTab) panel.style.display = 'none';
			panels[id] = panel;

			btn.addEventListener('click', () => {
				this.activeTab = id;
				tabBar.querySelectorAll('.np-tab-btn').forEach(b => b.removeClass('np-tab-active'));
				btn.addClass('np-tab-active');
				Object.values(panels).forEach(p => { if (p) p.style.display = 'none'; });
				if (panels[id]) panels[id]!.style.display = '';
			});
		});

		this.buildGeneral(panels.general!);
		this.buildRender(panels.render!);
		this.buildImage(panels.image!);
		this.buildSnippets(panels.snippets!);
	}

	// ── Tab: General ─────────────────────────────────────────────────────────
	private buildGeneral(el: HTMLElement): void {
		el.createEl('h3', { text: 'Print management' });

		new Setting(el).setName('Show print preview')
			.setDesc('Open preview before printing. Use "Print (skip preview)" to bypass.')
			.addToggle(t => t.setValue(this.plugin.settings.showPreview)
				.onChange(async v => { this.plugin.settings.showPreview = v; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Page' });

		new Setting(el).setName('Page size').addDropdown(d => {
			Object.entries(PAGE_SIZE_LABELS).forEach(([k,v]) => d.addOption(k,v));
			return d.setValue(this.plugin.settings.pageSize).onChange(async v => {
				this.plugin.settings.pageSize = v as PageSize; await this.plugin.saveSettings();
			});
		});

		new Setting(el).setName('Orientation')
			.addDropdown(d => d.addOption('portrait','Portrait').addOption('landscape','Landscape')
				.setValue(this.plugin.settings.orientation).onChange(async v => {
					this.plugin.settings.orientation = v as Orientation; await this.plugin.saveSettings();
				}));

		new Setting(el).setName('Margin preset')
			.setDesc('Choosing a preset overwrites margin sliders.')
			.addDropdown(d => d.addOption('normal','Normal (20/25 mm)').addOption('narrow','Narrow (12 mm)')
				.addOption('wide','Wide (30/35 mm)').addOption('custom','Custom')
				.setValue(this.plugin.settings.marginPreset).onChange(async v => {
					const k = v as MarginPreset; this.plugin.settings.marginPreset = k;
					if (k !== 'custom') { const p = MARGIN_PRESETS[k]; Object.assign(this.plugin.settings, { marginTop:p.top,marginBottom:p.bottom,marginLeft:p.left,marginRight:p.right }); }
					await this.plugin.saveSettings(); this.display();
				}));

		(['marginTop','marginBottom','marginLeft','marginRight'] as const).forEach(key => {
			new Setting(el).setName(key.replace('margin','').replace(/([A-Z])/g,' $1').trim() + ' margin (mm)')
				.addSlider(s => s.setLimits(0,50,1).setValue(this.plugin.settings[key])
					.setDynamicTooltip().setInstant(true)
					.onChange(async v => { this.plugin.settings[key] = v; this.plugin.settings.marginPreset='custom'; await this.plugin.saveSettings(); }));
		});

		el.createEl('h3', { text: 'Typography' });

		new Setting(el).setName('Font size (pt)')
			.addSlider(s => s.setLimits(8,18,1).setValue(this.plugin.settings.fontSize)
				.setDynamicTooltip().setInstant(true)
				.onChange(async v => { this.plugin.settings.fontSize = v; await this.plugin.saveSettings(); }));

		new Setting(el).setName('Font family').setDesc('CSS font-family string.')
			.addText(t => t.setPlaceholder('Georgia, serif').setValue(this.plugin.settings.fontFamily)
				.onChange(async v => { this.plugin.settings.fontFamily = v; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Content' });

		new Setting(el).setName('Include document title')
			.setDesc('Print the note filename as H1 at the top.')
			.addToggle(t => t.setValue(this.plugin.settings.includeTitle)
				.onChange(async v => { this.plugin.settings.includeTitle = v; await this.plugin.saveSettings(); }));

		new Setting(el).setName('Include YAML frontmatter')
			.addToggle(t => t.setValue(this.plugin.settings.includeYamlFrontmatter)
				.onChange(async v => { this.plugin.settings.includeYamlFrontmatter = v; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Output quality' });

		new Setting(el).setName('Wrap code blocks')
			.setDesc('Long lines wrap instead of truncating.')
			.addToggle(t => t.setValue(this.plugin.settings.codeWrap)
				.onChange(async v => { this.plugin.settings.codeWrap = v; await this.plugin.saveSettings(); }));

		new Setting(el).setName('True-colour output')
			.setDesc('Preserve original note colours instead of forcing black-on-white.')
			.addToggle(t => t.setValue(this.plugin.settings.trueColour)
				.onChange(async v => { this.plugin.settings.trueColour = v; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Android companion app' });
		el.createEl('p', { text: 'Printing on Android requires the Obsidian Print Helper APK.' });
	}

	// ── Tab: Render ──────────────────────────────────────────────────────────
	private buildRender(el: HTMLElement): void {
		el.createEl('h3', { text: 'Diagram rendering' });

		new Setting(el).setName('Render Mermaid diagrams')
			.setDesc('Wait for Mermaid post-processors and serialize diagrams as inline SVG images. Fixes code-block fallback.')
			.addToggle(t => t.setValue(this.plugin.settings.renderMermaid)
				.onChange(async v => { this.plugin.settings.renderMermaid = v; await this.plugin.saveSettings(); }));

		new Setting(el).setName('Render callouts & admonitions')
			.setDesc('Capture Obsidian callout styling (> [!note], > [!warning], etc.) in the printed output.')
			.addToggle(t => t.setValue(this.plugin.settings.renderCallouts)
				.onChange(async v => { this.plugin.settings.renderCallouts = v; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Embedded content' });

		new Setting(el).setName('Inline images')
			.setDesc('Embed vault images as base64 data URIs. Required for images to print on Android.')
			.addToggle(t => t.setValue(this.plugin.settings.inlineImages)
				.onChange(async v => { this.plugin.settings.inlineImages = v; await this.plugin.saveSettings(); }));

		el.createEl('p', { cls: 'np-render-note',
			text: '⚠ HTML blocks, iframe embeds, and dynamic content (DataView, Excalidraw) '
				+ 'require post-processors to complete before capture. Enable "Render Mermaid" '
				+ 'to apply the same wait mechanism to all post-processed content.' });
	}

	// ── Tab: Image ───────────────────────────────────────────────────────────
	private buildImage(el: HTMLElement): void {
		el.createEl('h3', { text: 'Image adjustments' });
		el.createEl('p', { cls: 'np-render-note',
			text: 'Applied via CSS filter to all images in the print output. '
				+ '"Inline images" must be enabled for filters to work on Android.' });

		new Setting(el).setName('Grayscale')
			.setDesc('Convert all images to black and white.')
			.addToggle(t => t.setValue(this.plugin.settings.imageGrayscale)
				.onChange(async v => { this.plugin.settings.imageGrayscale = v; await this.plugin.saveSettings(); }));

		new Setting(el).setName('Invert colours')
			.setDesc('Invert image colours. Useful for dark-mode screenshots.')
			.addToggle(t => t.setValue(this.plugin.settings.imageInvert)
				.onChange(async v => { this.plugin.settings.imageInvert = v; await this.plugin.saveSettings(); }));

		new Setting(el).setName('Brightness (%)')
			.setDesc('100 = normal. Raise to lighten, lower to darken.')
			.addSlider(s => s.setLimits(0,200,5).setValue(this.plugin.settings.imageBrightness)
				.setDynamicTooltip().setInstant(true)
				.onChange(async v => { this.plugin.settings.imageBrightness = v; await this.plugin.saveSettings(); }));

		new Setting(el).setName('Contrast (%)')
			.setDesc('100 = normal.')
			.addSlider(s => s.setLimits(0,200,5).setValue(this.plugin.settings.imageContrast)
				.setDynamicTooltip().setInstant(true)
				.onChange(async v => { this.plugin.settings.imageContrast = v; await this.plugin.saveSettings(); }));

		new Setting(el).setName('Saturation (%)')
			.setDesc('100 = normal. 0 = grayscale. >100 = vivid.')
			.addSlider(s => s.setLimits(0,200,5).setValue(this.plugin.settings.imageSaturate)
				.setDynamicTooltip().setInstant(true)
				.onChange(async v => { this.plugin.settings.imageSaturate = v; await this.plugin.saveSettings(); }));

		el.createEl('h3', { text: 'Reset' });
		new Setting(el).setName('Reset image adjustments')
			.setDesc('Restore all sliders and toggles to defaults.')
			.addButton(b => b.setButtonText('Reset to default').onClick(async () => {
				this.plugin.settings.imageGrayscale  = false;
				this.plugin.settings.imageInvert     = false;
				this.plugin.settings.imageBrightness = 100;
				this.plugin.settings.imageContrast   = 100;
				this.plugin.settings.imageSaturate   = 100;
				await this.plugin.saveSettings();
				this.display();
			}));
	}

	// ── Tab: Snippets ─────────────────────────────────────────────────────────
	private buildSnippets(el: HTMLElement): void {
		el.createEl('h3', { text: 'Print CSS snippets' });
		el.createEl('p', { cls: 'np-snippet-desc',
			text: 'Toggle snippets from .obsidian/snippets/ to inject into every print output. '
				+ 'Same files as Obsidian\'s Appearance → CSS snippets panel.' });

		const header = el.createDiv({ cls: 'np-snippet-header' });
		header.createEl('button', { cls: 'np-snippet-reload', text: '↻ Reload' })
			.addEventListener('click', () => void this.refreshSnippets());

		this.snippetListEl = el.createDiv({ cls: 'np-snippet-list' });
		void this.refreshSnippets();
	}

	async refreshSnippets(): Promise<void> {
		if (!this.snippetListEl) return;
		this.snippetListEl.empty();
		const entries = await listSnippets(this.app, this.plugin.settings.enabledSnippets);
		if (entries.length === 0) {
			this.snippetListEl.createEl('p', { cls:'np-snippet-empty', text:'No CSS snippets found in .obsidian/snippets/.' });
			return;
		}
		for (const e of entries) this.renderSnippetRow(this.snippetListEl, e);
	}

	private renderSnippetRow(parent: HTMLElement, entry: SnippetEntry): void {
		const row = parent.createDiv({ cls:'np-snippet-row' });
		const nameEl = row.createSpan({ cls:'np-snippet-name', text:entry.filename });
		nameEl.title = entry.filename;
		const toggle   = row.createEl('div', { cls:'np-snippet-toggle' });
		const checkbox = toggle.createEl('input', { attr:{ type:'checkbox', id:`np-snip-${entry.filename}` } }) as HTMLInputElement;
		checkbox.checked = entry.enabled;
		checkbox.addEventListener('change', async () => {
			const enabled = this.plugin.settings.enabledSnippets;
			if (checkbox.checked) { if (!enabled.includes(entry.filename)) enabled.push(entry.filename); }
			else { const i = enabled.indexOf(entry.filename); if (i !== -1) enabled.splice(i,1); }
			await this.plugin.saveSettings();
		});
		const label = toggle.createEl('label', { attr:{ for:`np-snip-${entry.filename}` } });
		label.addClass('np-snippet-toggle-label');
	}
}
