import { App, PluginSettingTab, Setting } from 'obsidian';
import NativePrintPlugin from './main';

export interface PrintPluginSettings {
	pageSize: 'A4' | 'Letter' | 'Legal';
	marginTop: number;
	marginBottom: number;
	marginLeft: number;
	marginRight: number;
	fontSize: number;
	fontFamily: string;
	includeYamlFrontmatter: boolean;
	/** Show a print preview modal before sending to the printer / APK. */
	showPreview: boolean;
}

export const DEFAULT_SETTINGS: PrintPluginSettings = {
	pageSize: 'A4',
	marginTop: 20,
	marginBottom: 20,
	marginLeft: 25,
	marginRight: 25,
	fontSize: 11,
	fontFamily: 'Georgia, serif',
	includeYamlFrontmatter: false,
	showPreview: true,
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
			.setDesc(
				'Open a preview modal before printing so you can review the layout. ' +
				'You can also use the "Print (skip preview)" command to bypass this.'
			)
			.addToggle(t =>
				t.setValue(this.plugin.settings.showPreview)
					.onChange(async v => {
						this.plugin.settings.showPreview = v;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl('h3', { text: 'Page' });

		new Setting(containerEl)
			.setName('Page size')
			.setDesc('Paper format for the print dialog.')
			.addDropdown(d =>
				d.addOption('A4', 'A4').addOption('Letter', 'Letter').addOption('Legal', 'Legal')
					.setValue(this.plugin.settings.pageSize)
					.onChange(async v => {
						this.plugin.settings.pageSize = v as PrintPluginSettings['pageSize'];
						await this.plugin.saveSettings();
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
			.setDesc('CSS font-family string for printed body text.')
			.addText(t =>
				t.setPlaceholder('Georgia, serif').setValue(this.plugin.settings.fontFamily)
					.onChange(async v => { this.plugin.settings.fontFamily = v; await this.plugin.saveSettings(); })
			);

		containerEl.createEl('h3', { text: 'Content' });

		new Setting(containerEl)
			.setName('Include YAML frontmatter')
			.setDesc('Show the frontmatter block in the printed output.')
			.addToggle(t =>
				t.setValue(this.plugin.settings.includeYamlFrontmatter)
					.onChange(async v => { this.plugin.settings.includeYamlFrontmatter = v; await this.plugin.saveSettings(); })
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
					.onChange(async v => { this.plugin.settings[key] = v; await this.plugin.saveSettings(); })
			);
	}
}
