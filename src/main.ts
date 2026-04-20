import { Plugin, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, PrintPluginSettings, PrintSettingTab } from './settings';
import { registerPrintCommand, triggerPrint } from './print-command';

export default class NativePrintPlugin extends Plugin {
	settings: PrintPluginSettings;

	async onload() {
		await this.loadSettings();
		registerPrintCommand(this);
		this.addRibbonIcon('printer', 'Print current note', () => triggerPrint(this));
		this.addSettingTab(new PrintSettingTab(this.app, this));

		// File-explorer context menu — "Print note"
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile) || file.extension !== 'md') return;
				menu.addItem(item => {
					item.setTitle('Print note')
						.setIcon('printer')
						.setSection('action')
						.onClick(() => triggerPrint(this, false, file));
				});
			})
		);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
