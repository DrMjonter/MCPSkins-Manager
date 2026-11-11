'use strict';
module.exports = `
#panel_mcpskins_asset_manager {padding:0;overflow:hidden;min-width:240px}
#panel_mcpskins_asset_manager .panel_vue_wrapper {height:100%;min-height:0;overflow:auto}
.start_screen_section.mcpskins-start-open {display:block;width:100%;max-width:none}
.mcpskins-start-open > .start_screen_right {display:none}
#mcpskins_start_workspace {width:100%;min-width:0;text-align:left}
#mcpskins_start_workspace[hidden] {display:none}
#mcpskins_start_workspace > .mcpskins {max-height:75vh;overflow:auto;min-height:0}
.mcpskins-start-header {display:flex;justify-content:flex-end;padding:0 0 8px}
.mcpskins {--mc-panel:var(--color-back);--mc-field:var(--color-dark);--mc-text:var(--color-text);--mc-muted:var(--color-subtle_text);--mc-border:var(--color-border);--mc-accent:var(--color-accent);--mc-selected:var(--color-selected);color:var(--mc-text);background:var(--mc-panel);padding:10px;container-type:inline-size;font-size:13px;min-height:100%}
.mcpskins * {box-sizing:border-box}
.mcpskins button,.mcpskins input:not([type=checkbox]),.mcpskins select,.mcpskins textarea {font:inherit;color:var(--mc-text);border:1px solid var(--mc-border);border-radius:3px;background:var(--mc-field);min-height:28px;padding:4px 7px;max-width:100%}
.mcpskins button {cursor:pointer;white-space:nowrap}
.mcpskins button:hover {border-color:var(--mc-accent)}
.mcpskins input:focus,.mcpskins textarea:focus,.mcpskins select:focus,.mcpskins button:focus-visible {outline:1px solid var(--mc-accent);outline-offset:1px}
.mcpskins input[readonly],.mcpskins :disabled {opacity:.6}
.mcpskins textarea {resize:vertical;min-height:65px}
.mcpskins .mcpskins-primary {background:var(--mc-accent);color:var(--color-accent_text,#fff)}
.mcpskins .mcpskins-secondary {background:var(--color-button,var(--color-ui));color:var(--color-text);border-color:transparent}
.mcpskins-header,.mcpskins-browser-footer,.mcpskins-browser-footer>div {display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap}
.mcpskins .mcpskins-header {height:auto;min-height:48px;padding:6px 8px;flex-shrink:0;overflow:visible;line-height:normal}
.mcpskins-header strong {font-size:16px}
.mcpskins-muted,.mcpskins-path {color:var(--mc-muted);font-size:11px}
.mcpskins-path {overflow-wrap:anywhere;margin:8px 0}
.mcpskins-filters {display:flex;gap:6px;margin-bottom:8px}
.mcpskins-filters input {flex:1;min-width:70px;width:100%}
.mcpskins-filters select {max-width:130px}
.mcpskins-table-wrap {overflow:auto;border:1px solid var(--mc-border);border-radius:3px;max-height:300px;min-height:100px}
.mcpskins-table {border-collapse:collapse;width:100%;text-align:left;white-space:nowrap}
.mcpskins-table th {position:sticky;top:0;background:var(--mc-panel);z-index:1;text-align:left}
.mcpskins-table th button {border:0;background:transparent;font-weight:bold;width:100%;text-align:left}
.mcpskins-table td {padding:6px 8px;border-bottom:1px solid var(--mc-border);max-width:260px;overflow:hidden;text-overflow:ellipsis}
.mcpskins-table tbody tr {cursor:pointer}
.mcpskins-table tr.selected {background:var(--mc-selected);box-shadow:inset 3px 0 var(--mc-accent)}
.mcpskins-table tr:focus-visible {outline:1px solid var(--mc-accent);outline-offset:-2px}
.mcpskins-rarity-dot {display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;box-shadow:0 0 0 1px #0004}
.mcpskins-browser-footer {margin:8px 0}
.mcpskins-inspector {border-top:1px solid var(--mc-border);padding-top:10px;margin-top:10px;min-width:0}
.mcpskins-inspector h3 {font-size:14px;margin:0 0 8px;font-weight:600}
.mcpskins-dirty {font-size:11px;color:var(--mc-accent);margin-left:6px}
.mcpskins-fields {display:flex;flex-direction:column;gap:9px;min-width:0}
.mcpskins-fields label {display:flex;flex-direction:column;gap:4px}
.mcpskins-weapon-field {display:flex;flex-direction:column;gap:4px}
.mcpskins-weapon-picker {position:relative;min-width:0}
.mcpskins-weapon-input {display:flex;gap:4px;align-items:stretch}
.mcpskins-weapon-input input {width:100%;min-width:0;flex:1}
.mcpskins .mcpskins-weapon-toggle {flex:0 0 32px;width:32px;min-width:32px;padding:0}
.mcpskins-weapon-picker > .mcpskins-muted {display:block;margin-top:4px}
.mcpskins-weapon-list {position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:20;max-height:230px;overflow-y:auto;background:var(--mc-panel);border:1px solid var(--mc-border);border-radius:3px;box-shadow:0 4px 12px #0005}
.mcpskins-weapon-option {display:flex;flex-direction:column;gap:2px;padding:7px 9px;cursor:pointer}
.mcpskins-weapon-option.active {background:var(--mc-selected);box-shadow:inset 3px 0 var(--mc-accent)}
.mcpskins-weapon-option small {color:var(--mc-muted);font-size:11px}
.mcpskins-weapon-empty {padding:9px;font-size:12px;color:var(--mc-muted)}
.mcpskins-fields .mcpskins-check {flex-direction:row;align-items:center;gap:7px}
.mcpskins .mcpskins-check input[type=checkbox] {display:inline-flex;align-items:center;justify-content:center;flex:0 0 24px;width:24px;min-width:24px;height:24px;min-height:24px;margin:0;padding:0;border:0;border-radius:0;background:transparent;line-height:1;color:var(--mc-text);cursor:pointer}
.mcpskins .mcpskins-check input[type=checkbox]::before {display:block;line-height:1}
.mcpskins-title {display:block;overflow-wrap:anywhere}
.mcpskins-color,.mcpskins-save,.mcpskins-asset-actions {display:flex;gap:6px;flex-wrap:wrap}
.mcpskins-color input {width:100px;flex:1;min-width:80px}
.mcpskins-color .mcpskins-swatch {width:30px;min-width:30px}
.mcpskins-previews {margin-top:12px;min-width:0}
.mcpskins summary {cursor:pointer;font-weight:600;padding:6px 0}
.mcpskins-previews figure {margin:10px 0;text-align:center}
.mcpskins-previews figcaption {text-align:left;margin-bottom:4px}
.mcpskins-preview {height:256px;width:100%;display:flex;align-items:center;justify-content:center;background-color:var(--mc-field);background-image:linear-gradient(45deg,#8881 25%,transparent 25%),linear-gradient(-45deg,#8881 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#8881 75%),linear-gradient(-45deg,transparent 75%,#8881 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;border:1px solid var(--mc-border);color:var(--mc-muted);overflow:hidden;padding:6px}
.mcpskins-preview.hud {height:85px}
.mcpskins-preview img {max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;image-rendering:pixelated}
.mcpskins-previews p {overflow-wrap:anywhere;margin:5px 0}
.mcpskins-empty {padding:14px 4px;white-space:normal;color:var(--mc-muted)}
.mcpskins-notice,.mcpskins-warnings {padding:7px;border-left:3px solid var(--mc-accent);overflow-wrap:anywhere;margin:8px 0}
.mcpskins-theme {border-top:1px solid var(--mc-border);margin-top:12px;padding-top:8px;font-size:11px;color:var(--mc-muted)}
.mcpskins-theme label {display:flex;align-items:center;gap:8px}
@container (min-width:500px) {.mcpskins-editor {display:grid;grid-template-columns:minmax(220px,1fr) minmax(180px,256px);gap:16px}.mcpskins-previews {margin-top:0}}
@container (min-width:1000px) {.mcpskins-workspace {display:grid;grid-template-columns:minmax(360px,1fr) minmax(420px,1fr);gap:16px}.mcpskins-inspector {border-top:0;border-left:1px solid var(--mc-border);margin-top:0;padding-top:0;padding-left:16px}.mcpskins-table-wrap {max-height:600px}}
`;
