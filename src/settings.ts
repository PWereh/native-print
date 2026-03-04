import {
	App,
	PluginSettingTab,
	Setting,
	DropdownComponent,
	SliderComponent,
	TextComponent,
	ToggleComponent,
} from 'obsidian';
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

		// ── Page ─────────────────────────────────────────────────────────────

		new Setting(containerEl)
			.setName('Page size')
			.setDesc('Paper format for the print dialog.')
			.addDropdown((d: DropdownComponent) =>
				d
					.addOption('A4', 'A4')
					.addOption('Letter', 'Letter')
					.addOption('Legal', 'Legal')
					.setValue(this.plugin.settings.pageSize)
					.onChange(async (v: string) => {
						this.plugin.settings.pageSize = v as PrintPluginSettings['pageSize'];
						await this.plugin.saveSettings();
					})
			);

		this.addMargin(containerEl, 'marginTop', 'Top margin (mm)');
		this.addMargin(containerEl, 'marginBottom', 'Bottom margin (mm)');
		this.addMargin(containerEl, 'marginLeft', 'Left margin (mm)');
		this.addMargin(containerEl, 'marginRight', 'Right margin (mm)');

		// ── Typography ────────────────────────────────────────────────────────

		new Setting(containerEl)
			.setName('Font size (pt)')
			.addSlider(s =>
				s
					.setLimits(8, 18, 1)
					.setValue(this.plugin.settings.fontSize)
					.setDynamicTooltip()
					.setInstant(true)
					.onChange(async v => {
						this.plugin.settings.fontSize = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Font family')
			.setDesc('CSS font-family string for printed body text.')
			.addText(t =>
				t
					.setPlaceholder('Georgia, serif')
					.setValue(this.plugin.settings.fontFamily)
					.onChange(async v => {
						this.plugin.settings.fontFamily = v;
						await this.plugin.saveSettings();
					})
			);

		// ── Content ───────────────────────────────────────────────────────────

		new Setting(containerEl)
			.setName('Include YAML frontmatter')
			.setDesc('Show the frontmatter block in the printed output.')
			.addToggle(t =>
				t
					.setValue(this.plugin.settings.includeYamlFrontmatter)
					.onChange(async v => {
						this.plugin.settings.includeYamlFrontmatter = v;
						await this.plugin.saveSettings();
					})
			);

		// ── Android ───────────────────────────────────────────────────────────

		containerEl.createEl('h3', { text: 'Android companion app' });
		containerEl.createEl('p', {
			text: 'Printing on Android requires the Obsidian Print Helper APK. The plugin sends rendered HTML directly to the companion app via a custom URL — no file permissions needed.',
		});
	}

	private addMargin(
		containerEl: HTMLElement,
		key: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight',
		label: string
	): void {
		new Setting(containerEl)
			.setName(label)
			.addSlider(s =>
				s
					.setLimits(0, 50, 1)
					.setValue(this.plugin.settings[key])
					.setDynamicTooltip()
					.setInstant(true)
					.onChange(async v => {
						this.plugin.settings[key] = v;
						await this.plugin.saveSettings();
					})
			);
	}
}
