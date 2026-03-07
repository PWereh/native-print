var p=Object.defineProperty;var S=Object.getOwnPropertyDescriptor;var w=Object.getOwnPropertyNames;var y=Object.prototype.hasOwnProperty;var x=(n,t)=>{for(var e in t)p(n,e,{get:t[e],enumerable:!0})},T=(n,t,e,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of w(t))!y.call(n,r)&&r!==e&&p(n,r,{get:()=>t[r],enumerable:!(i=S(t,r))||i.enumerable});return n};var v=n=>T(p({},"__esModule",{value:!0}),n);var k={};x(k,{default:()=>l});module.exports=v(k);var P=require("obsidian");var o=require("obsidian"),u={pageSize:"A4",marginTop:20,marginBottom:20,marginLeft:25,marginRight:25,fontSize:11,fontFamily:"Georgia, serif",includeYamlFrontmatter:!1},g=class extends o.PluginSettingTab{constructor(t,e){super(t,e),this.plugin=e}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Native Print"}),new o.Setting(t).setName("Page size").setDesc("Paper format for the print dialog.").addDropdown(e=>e.addOption("A4","A4").addOption("Letter","Letter").addOption("Legal","Legal").setValue(this.plugin.settings.pageSize).onChange(async i=>{this.plugin.settings.pageSize=i,await this.plugin.saveSettings()})),this.addMargin(t,"marginTop","Top margin (mm)"),this.addMargin(t,"marginBottom","Bottom margin (mm)"),this.addMargin(t,"marginLeft","Left margin (mm)"),this.addMargin(t,"marginRight","Right margin (mm)"),new o.Setting(t).setName("Font size (pt)").addSlider(e=>e.setLimits(8,18,1).setValue(this.plugin.settings.fontSize).setDynamicTooltip().setInstant(!0).onChange(async i=>{this.plugin.settings.fontSize=i,await this.plugin.saveSettings()})),new o.Setting(t).setName("Font family").setDesc("CSS font-family string for printed body text.").addText(e=>e.setPlaceholder("Georgia, serif").setValue(this.plugin.settings.fontFamily).onChange(async i=>{this.plugin.settings.fontFamily=i,await this.plugin.saveSettings()})),new o.Setting(t).setName("Include YAML frontmatter").setDesc("Show the frontmatter block in the printed output.").addToggle(e=>e.setValue(this.plugin.settings.includeYamlFrontmatter).onChange(async i=>{this.plugin.settings.includeYamlFrontmatter=i,await this.plugin.saveSettings()})),t.createEl("h3",{text:"Android companion app"}),t.createEl("p",{text:"Printing on Android requires the Obsidian Print Helper APK. The plugin sends rendered HTML directly to the companion app via a custom URL \u2014 no file permissions needed."})}addMargin(t,e,i){new o.Setting(t).setName(i).addSlider(r=>r.setLimits(0,50,1).setValue(this.plugin.settings[e]).setDynamicTooltip().setInstant(!0).onChange(async s=>{this.plugin.settings[e]=s,await this.plugin.saveSettings()}))}};var a=require("obsidian");var m=require("obsidian");async function h(n,t,e,i){let r=document.createElement("div"),s=new m.Component;s.load();try{await m.MarkdownRenderer.render(n,t,r,e,s)}finally{s.unload()}return r.innerHTML}function L(n){return n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function C(n,t,e){return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${L(t)}</title>
  <style>
    @page {
      size: ${e.pageSize};
      margin: ${e.marginTop}mm ${e.marginRight}mm ${e.marginBottom}mm ${e.marginLeft}mm;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: ${e.fontFamily};
      font-size: ${e.fontSize}pt;
      line-height: 1.6;
      color: #000;
      background: #fff;
      margin: 0;
    }
    h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
    pre, blockquote, table    { page-break-inside: avoid; }
    img  { max-width: 100%; page-break-inside: avoid; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; }
    a  { color: #000; text-decoration: underline; }
    code { font-family: monospace; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; }
    pre  { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #999; margin: 0; padding-left: 16px; color: #444; }
    hr { border: none; border-top: 1px solid #ccc; margin: 1em 0; }
    ${e.includeYamlFrontmatter?"":".frontmatter, .frontmatter-container { display: none !important; }"}
  </style>
</head>
<body>${n}</body>
</html>`}function N(n,t){let e=JSON.stringify({pageSize:t.pageSize,marginTop:t.marginTop,marginBottom:t.marginBottom,marginLeft:t.marginLeft,marginRight:t.marginRight});return`obsidian-print-helper://print?html=${encodeURIComponent(n)}&settings=${encodeURIComponent(e)}`}var d={wrapDocument:C,toIntentUrl:N};function b(n){n.addCommand({id:"print-current-note",name:"Print current note",icon:"printer",checkCallback:t=>{let e=n.app.workspace.getActiveViewOfType(a.MarkdownView);return e!=null&&e.file?(t||c(n),!0):!1}})}function c(n){a.Platform.isAndroidApp?A(n).catch(t=>{new a.Notice(`Print failed: ${t.message}`),console.error("[NativePrint]",t)}):window.print()}async function A(n){let t=n.app.workspace.getActiveViewOfType(a.MarkdownView);if(!(t!=null&&t.file)){new a.Notice("No active note to print.");return}let e=new a.Notice("Preparing print\u2026",0);try{let i=await n.app.vault.read(t.file),r=await h(n.app,i,t.file.path,n),s=d.wrapDocument(r,t.file.basename,n.settings),f=btoa(unescape(encodeURIComponent(s)));f.length>9e5&&new a.Notice("Note is very large \u2014 embedded images may be omitted.",6e3),window.open(d.toIntentUrl(f,n.settings),"_blank")}finally{e.hide()}}var l=class extends P.Plugin{async onload(){await this.loadSettings(),b(this),this.addRibbonIcon("printer","Print current note",()=>c(this)),this.addSettingTab(new g(this.app,this))}onunload(){}async loadSettings(){this.settings=Object.assign({},u,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}};
