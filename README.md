# Native Print

An [Obsidian](https://obsidian.md) plugin that prints the current note on desktop via the browser print dialog, and on Android via the [Obsidian Print Helper](https://github.com/PWereh/obsidian-print-helper) companion APK.

No file permissions required on Android (API 33+). HTML is passed inline via a custom URL scheme — no `READ_EXTERNAL_STORAGE` or scoped-storage handling needed.

---

## Features

- **Desktop** — triggers `window.print()` directly
- **Android** — renders the note to HTML and launches the Print Helper APK via a custom scheme URL
- Page size: A4 / Letter / Legal
- Configurable margins, font size, font family
- Optional YAML frontmatter in output
- Ribbon icon + command palette entry

## Installation

### From Obsidian Community Plugins *(pending)*

Search for **Native Print** in Settings → Community Plugins.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/PWereh/native-print/releases/latest)
2. Copy them into `<vault>/.obsidian/plugins/native-print/`
3. Enable the plugin in Settings → Community Plugins

## Android Setup

See [docs/android-setup.md](docs/android-setup.md) for instructions on installing the companion APK.

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production bundle
npm run lint     # eslint
```

Requires Node 18+.

## Release

Push a semver tag to trigger the release workflow:

```bash
npm run version   # bumps manifest.json + versions.json, stages both
git commit -m "chore: release 2.1.0"
git tag 2.1.0
git push && git push --tags
```

GitHub Actions will build and publish a release with `main.js`, `manifest.json`, and `styles.css`.

# Termux Workflow

This workflow is designed to bypass the common EACCES (Permission Denied) and sh: tsc: not found errors that occur in Termux due to Android’s storage restrictions and incompatible line endings.

## 1. Environment Setup (The Foundation)

Always work in the Termux Home Directory. Do not use `/sdcard` or shared storage for development.

- Initialize Storage & Packages:
    
    ```bash
    termux-setup-storage
    pkg update && pkg upgrade
    pkg install nodejs-lts git dos2unix
    ```
    
- Move Project to Home:  
    If your project is currently on the SD card, move it to `~/`:
    
    ```bash
    cp -r /storage/emulated/0/your-project ~/
    cd ~/your-project
    ```
    

## 2. Dependency Management (The "Termux Way")

Standard `npm install` often fails to link binaries correctly on Android. Follow this sequence for a clean slate:

- Clean & Install:
    
    ```bash
    rm -rf node_modules package-lock.json
    npm install
    ```
    
- Fix Line Endings (Critical):  
    Scripts often arrive with Windows `\r` (CRLF) endings which Termux cannot execute. Fix them globally in your project:
    
    ```bash
    find node_modules/.bin/ -type l -exec dos2unix {} +
    dos2unix node_modules/typescript/bin/tsc
    chmod +x node_modules/.bin/*
    ```
    

## 3. Bulletproof `package.json` Configuration

To avoid the `sh: 1: tsc: not found` error, bypass the shell's PATH and call the Node engine directly for your binaries. Update your `scripts` section:

```json
"scripts": {
  "dev": "node node_modules/esbuild/bin/esbuild --bundle ...",
  "build": "node node_modules/typescript/bin/tsc -noEmit && node esbuild.config.mjs production",
  "lint": "node node_modules/eslint/bin/eslint.js ."
}
```

_By prefixing with `node`, you ensure the script runs even if the file permissions or symlinks are flaky._

## 4. Build & Execution Workflow

When you are ready to compile or run your app:

1. Run Build: `npm run build`
2. Verify Output: Check for your `main.js` or `dist/` folder:
    
    ```bash
    ls -lh
    ```
    
3. Deploy (e.g., to Obsidian):  
    Since Obsidian can't see the Termux home folder easily, copy the final build out to your vault:
    
    ```bash
    cp main.js manifest.json /storage/emulated/0/Documents/Vault/.obsidian/plugins/your-plugin/
    ```
    

## 5. Troubleshooting Cheat Sheet

|Error|Solution|
|---|---|
|`EACCES: permission denied`|Move project to `~/` (Home). Do not build on `/sdcard`.|
|`tsc: not found`|Use `node node_modules/typescript/bin/tsc` in your script.|
|`esbuild: Exec format error`|Run `pkg install esbuild` to get the native Termux binary.|
|`sh: ./file: not found`|Run `dos2unix` on the file; it has hidden Windows line endings.|

To automate this, you can create a deploy script that builds the project and then copies the final files directly into your Obsidian vault.

## 1. Identify Your Vault Path

First, find the exact path to your plugin folder. It usually looks like this:  
`/storage/emulated/0/Documents/YourVault/.obsidian/plugins/native-print`

## 2. Create the Deploy Script (`deploy.sh`)

Create a small bash script in your project root:

```bash
nano deploy.sh
```

Paste the following (replace the `VAULT_DIR` with your actual path):

```bash
#!/bin/bash

# 1. Set your destination (Double check this path!)
VAULT_DIR="/storage/emulated/0/Documents/binx/.obsidian/plugins/native-print"

# 2. Run the build
echo "Building project..."
npm run build

# 3. Check if build succeeded
if [ $? -eq 0 ]; then
    echo "Build successful. Deploying to vault..."
    
    # Create directory if it doesn't exist
    mkdir -p "$VAULT_DIR"
    
    # Copy only the necessary files
    cp main.js manifest.json styles.css "$VAULT_DIR/"
    
    echo "Done! Restart Obsidian to see changes."
else
    echo "Build failed. Check logs."
fi
```

## 3. Make it Executable

Give Termux permission to run the script:

```bash
chmod +x deploy.sh
```

## 4. Update `package.json`

Now, integrate it into your `npm` workflow so you can just type one command:

```json
"scripts": {
  "build": "node node_modules/typescript/bin/tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
  "deploy": "./deploy.sh"
}
```

## 5. Final Workflow

From now on, whenever you make a change, just run:

```bash
npm run deploy
```

Wait! Have you already run `termux-setup-storage` and granted the Files and Media permission? Termux needs that "all files access" to write into your Obsidian vault folder.


Todo

- [x] Revamp print preview page setup modal
	- [ ] Restore toggles
	- [ ] Explore other paper sizes  
	- [ ] print metadata?
	- [ ] 
- [x] Enhance Settings(deep)
	- [ ] Allow code-block text-wrap (deep setting)
	- [ ] Allow image parsing
	- [ ] Allow true color prints
	- [ ] Custom Header/footer
	- [ ] Custom css from .css at vault root 
- [x] Enhance print engine
	- [ ] Add pandoc support for format, typeset, style toggles
	- [ ] Add print function within context menu

## License

[MIT](LICENSE)
