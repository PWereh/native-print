import { App, PluginSettingTab, Setting } from 'obsidian';
import NativePrintPlugin from './main';

export type PageSize = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid';
export type MarginPreset = 'normal' | 'narrow' | 'wide' | 'custom';
export type Orientation = 'portrait' | 'landscape';

/** CSS reference pixels per millimetre at 96 dpi (the web standard). */
export const PX_PER_MM = 96 / 25.4;   // ≈ 3.7795

/** Physical paper dimensions [width, height] in mm, portrait orientation. */
export const PAGE_DIMS_MM: Record<PageSize, [number, number]> = {
	A3:      [297, 420],
	A4:      [210, 297],
	A5:      [148, 210],
	Letter:  [216, 279],
	Legal:   [216, 356],
	Tabloid: [279, 432],
};

export interface PrintPluginSettings {
	pageSize: PageSize;
	orientation: Orientation;
	marginPreset: MarginPreset;
	marginTop: number;
	marginBottom: number;
	marginLeft: number;
	marginRight: number;
	fontSize: number;
	fontFamily: string;
	includeTitle: boolean;
	includeYamlFrontmatter: boolean;
	showPreview: boolean;
	/** Wrap long code-block lines in the output (pre-wrap vs pre). */
	codeWrap: boolean;
	/** Inline vault images as base64 data URIs so they survive Android transfer. */
	inlineImages: boolean;
	/** Preserve original text/link colours instead of forcing black-on-white. */
	trueColour: boolean;
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
	pageSize: 'A4',
	orientation: 'portrait',
	marginPreset: 'normal',
	marginTop: 20,
	marginBottom: 20,
	marginLeft: 25,
	marginRight: 25,
	fontSize: 11,
	fontFamily: 'Georgia, serif',
	includeTitle: true,
	includeYamlFrontmatter: false,
	showPreview: true,
	codeWrap: false,
	inlineImages: true,
	trueColour: false,
};

export class PrintSettingTab extends PluginSettingTab {
	plugin: NativePrintPlugin;

	constructor(app: App, plugin: NativePrintPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Native Print' });

		containerEl.createEl('h3', { text: 'Print management' });

		new Setting(containerEl)
			.setName('Show print preview')
			.setDesc('Open a preview modal before printing. Use "Print (skip preview)" command to bypass.')
			.addToggle(t =>
				t.setValue(this.plugin.settings.showPreview)
					.onChange(async v => { this.plugin.settings.showPreview = v; await this.plugin.saveSettings(); })
			);

		containerEl.createEl('h3', { text: 'Page' });

		new Setting(containerEl)
			.setName('Page size')
			.setDesc('Paper format for the print dialog.')
			.addDropdown(d => {
				Object.entries(PAGE_SIZE_LABELS).forEach(([k, v]) => d.addOption(k, v));
				return d.setValue(this.plugin.settings.pageSize)
					.onChange(async v => {
						this.plugin.settings.pageSize = v as PageSize;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Orientation')
			.setDesc('Portrait or landscape page layout.')
			.addDropdown(d =>
				d.addOption('portrait', 'Portrait')
					.addOption('landscape', 'Landscape')
					.setValue(this.plugin.settings.orientation)
					.onChange(async v => {
						this.plugin.settings.orientation = v as Orientation;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Margin preset')
			.setDesc('Apply a margin preset. Choosing a preset overwrites individual margin sliders.')
			.addDropdown(d =>
				d.addOption('normal', 'Normal (20 / 25 mm)')
					.addOption('narrow', 'Narrow (12 mm all)')
					.addOption('wide',   'Wide (30 / 35 mm)')
					.addOption('custom', 'Custom')
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
					})
			);

		this.addMarginSetting(containerEl, 'marginTop',    'Top margin (mm)');
		this.addMarginSetting(containerEl, 'marginBottom', 'Bottom margin (mm)');
		this.addMarginSetting(containerEl, 'marginLeft',   'Left margin (mm)');
		this.addMarginSetting(containerEl, 'marginRight',  'Right margin (mm)');

		containerEl.createEl('h3', { text: 'Typography' });

		new Setting(containerEl)
			.setName('Font size (pt)')
			.addSlider(s =>
				s.setLimits(8, 18, 1).setValue(this.plugin.settings.fontSize)
					.setDynamicTooltip().setInstant(true)
					.onChange(async v => { this.plugin.settings.fontSize = v; await this.plugin.saveSettings(); })
			);

		new Setting(containerEl)
			.setName('Font family')
			.setDesc('CSS font-family string for body text.')
			.addText(t =>
				t.setPlaceholder('Georgia, serif').setValue(this.plugin.settings.fontFamily)
					.onChange(async v => { this.plugin.settings.fontFamily = v; await this.plugin.saveSettings(); })
			);

		containerEl.createEl('h3', { text: 'Content' });

		new Setting(containerEl)
			.setName('Include document title')
			.setDesc('Print the note filename as an H1 heading at the top of the output.')
			.addToggle(t =>
				t.setValue(this.plugin.settings.includeTitle)
					.onChange(async v => { this.plugin.settings.includeTitle = v; await this.plugin.saveSettings(); })
			);

		new Setting(containerEl)
			.setName('Include YAML frontmatter')
			.setDesc('Show the frontmatter block in the printed output.')
			.addToggle(t =>
				t.setValue(this.plugin.settings.includeYamlFrontmatter)
					.onChange(async v => { this.plugin.settings.includeYamlFrontmatter = v; await this.plugin.saveSettings(); })
			);

		containerEl.createEl('h3', { text: 'Output quality' });

		new Setting(containerEl)
			.setName('Wrap code blocks')
			.setDesc('Wrap long lines in code blocks instead of truncating. Useful for printing code-heavy notes.')
			.addToggle(t =>
				t.setValue(this.plugin.settings.codeWrap)
					.onChange(async v => { this.plugin.settings.codeWrap = v; await this.plugin.saveSettings(); })
			);

		new Setting(containerEl)
			.setName('Inline images')
			.setDesc('Embed vault images as base64 data URIs. Required for images to print on Android.')
			.addToggle(t =>
				t.setValue(this.plugin.settings.inlineImages)
					.onChange(async v => { this.plugin.settings.inlineImages = v; await this.plugin.saveSettings(); })
			);

		new Setting(containerEl)
			.setName('True-colour output')
			.setDesc('Preserve original text and link colours instead of forcing black-on-white for printer economy.')
			.addToggle(t =>
				t.setValue(this.plugin.settings.trueColour)
					.onChange(async v => { this.plugin.settings.trueColour = v; await this.plugin.saveSettings(); })
			);

		containerEl.createEl('h3', { text: 'Android companion app' });
		containerEl.createEl('p', {
			text: 'Printing on Android requires the Obsidian Print Helper APK. ' +
				'The plugin renders the note, shows a preview, then sends the HTML ' +
				'directly to the companion app — no file permissions needed.',
		});
	}

	private addMarginSetting(
		containerEl: HTMLElement,
		key: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight',
		label: string
	): void {
		new Setting(containerEl)
			.setName(label)
			.addSlider(s =>
				s.setLimits(0, 50, 1).setValue(this.plugin.settings[key])
					.setDynamicTooltip().setInstant(true)
					.onChange(async v => {
						this.plugin.settings[key] = v;
						this.plugin.settings.marginPreset = 'custom';
						await this.plugin.saveSettings();
					})
			);
	}
}
