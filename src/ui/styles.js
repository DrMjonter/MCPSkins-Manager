'use strict';
module.exports = `
.mcpskins-animation {max-height:72vh;overflow:auto;container-type:inline-size;font-size:13px}
.mcpskins-animation h3 {font-size:14px;font-weight:700;border-top:1px solid var(--color-border);padding-top:12px;margin-top:14px}
.mcpskins-animation label {display:flex;flex-direction:column;gap:4px;margin:8px 0}
.mcpskins-animation input:not([type=checkbox]),.mcpskins-animation select {background:var(--color-dark);color:var(--color-text);border:1px solid var(--color-border);border-radius:3px;padding:5px;min-height:28px;max-width:100%}
.mcpskins-animation button {min-width:0}
.mcpskins-animation-toolbar {display:flex;gap:5px;flex-wrap:wrap;margin:8px 0}
.mcpskins-animation .mcpskins-animation-check {flex-direction:row;align-items:center;gap:7px}
.mcpskins-frame-timings {border:1px solid var(--color-border);border-radius:4px;padding:8px;margin:10px 0}
.mcpskins-frame-timings summary {cursor:pointer;font-weight:600}
.mcpskins-frame-timings table {border-collapse:collapse;width:100%;text-align:left}
.mcpskins-frame-timings th,.mcpskins-frame-timings td {padding:6px;border-bottom:1px solid var(--color-border)}
.mcpskins-frame-timings input {width:150px}
.mcpskins-animation-dimensions {display:flex;gap:8px}
.mcpskins-animation-dimensions label {min-width:0;flex:1}
.mcpskins-rarity-manager {font-size:13px;container-type:inline-size;max-height:72vh;overflow:auto;padding:0 3px 6px}
.mcpskins-rarity-layout {display:grid;grid-template-columns:minmax(260px,1fr) minmax(300px,1fr);gap:18px}
.mcpskins-rarity-browser,.mcpskins-rarity-inspector {min-width:0}
.mcpskins-rarity-muted {color:var(--color-subtle_text);font-size:11px}
.mcpskins-rarity-manager p {margin:6px 0 10px;overflow-wrap:anywhere}
.mcpskins-rarity-toolbar {display:flex;gap:6px;align-items:center;margin-bottom:8px}
.mcpskins-rarity-toolbar input {flex:1;min-width:60px}
.mcpskins-rarity-manager button {min-width:0;white-space:nowrap}
.mcpskins-rarity-manager input:not([type=checkbox]),.mcpskins-rarity-manager select {box-sizing:border-box;min-height:28px;max-width:100%;font:inherit;color:var(--color-text);background:var(--color-dark);border:1px solid var(--color-border);border-radius:3px;padding:4px 7px}
.mcpskins-rarity-scroll {overflow:auto;max-height:55vh;border:1px solid var(--color-border);border-radius:4px}
.mcpskins-rarity-manager table {border-collapse:collapse;width:100%;text-align:left}
.mcpskins-rarity-manager th,.mcpskins-rarity-manager td {padding:8px;border-bottom:1px solid var(--color-border);overflow-wrap:anywhere}
.mcpskins-rarity-manager th {position:sticky;top:0;background:var(--color-back);z-index:1}
.mcpskins-rarity-manager tbody tr {cursor:pointer}
.mcpskins-rarity-manager tbody tr:hover {background:var(--color-ui)}
.mcpskins-rarity-manager tbody tr.selected {background:var(--color-selected);box-shadow:inset 3px 0 var(--color-accent)}
.mcpskins-rarity-manager tbody tr:focus-visible {outline:1px solid var(--color-accent);outline-offset:-1px}
.mcpskins-rarity-inspector {border-left:1px solid var(--color-border);padding-left:18px}
.mcpskins-rarity-inspector h3 {font-size:14px;font-weight:700;margin:0 0 10px}
.mcpskins-rarity-inspector form,.mcpskins-rarity-inspector label {display:flex;flex-direction:column;gap:5px;min-width:0}
.mcpskins-rarity-inspector form {gap:12px}
.mcpskins-rarity-inspector label > input:not([type=checkbox]),.mcpskins-rarity-inspector label > select {width:100%}
.mcpskins-rarity-inspector input[readonly] {opacity:.6}
.mcpskins-rarity-inspector .mcpskins-rarity-check {flex-direction:row;align-items:center;gap:7px}
.mcpskins-rarity-manager input[type=checkbox] {position:static;display:inline-flex;align-items:center;justify-content:center;flex:0 0 24px;width:24px;height:24px;min-width:24px;min-height:24px;margin:0;padding:0;vertical-align:middle;background:transparent;border:0;transform:none;line-height:1}
.mcpskins-rarity-manager input[type=checkbox]::before {display:block;line-height:1}
.mcpskins-rarity-color,.mcpskins-rarity-actions {display:flex;align-items:center;gap:6px}
.mcpskins-rarity-color input[type=color] {width:32px;min-width:32px;height:30px;padding:0}
.mcpskins-rarity-color input:not([type=color]) {flex:1;min-width:50px}
.mcpskins-rarity-target {display:grid;grid-template-columns:minmax(100px,1fr) 70px auto;gap:6px;align-items:end;margin-bottom:8px}
.mcpskins-rarity-targets {border:1px solid var(--color-border);padding:8px;border-radius:4px}
@container (max-width:650px) {.mcpskins-rarity-layout {grid-template-columns:1fr}.mcpskins-rarity-inspector {border-left:0;border-top:1px solid var(--color-border);padding:12px 0 0}}
.mcpskins-recent-packs {margin:18px 0 0}
.mcpskins-recent-packs .mcpskins-new-pack {margin-bottom:14px}
.mcpskins-recent-packs h3 {font-size:14px;margin:0 0 8px}
.mcpskins-recent-scroll {max-height:240px;overflow:auto;border:1px solid var(--color-border);border-radius:3px}
.mcpskins-recent-packs table {border-collapse:collapse;width:100%;text-align:left;font-size:13px}
.mcpskins-recent-packs th,.mcpskins-recent-packs td {padding:8px 10px;border-bottom:1px solid var(--color-border);overflow-wrap:anywhere}
.mcpskins-recent-packs th {position:sticky;top:0;background:var(--color-back)}
.mcpskins-recent-packs tbody tr {cursor:pointer}
.mcpskins-recent-packs tbody tr:hover,.mcpskins-recent-packs tbody tr:focus {background:var(--color-selected);outline:none}
.mcpskins-recent-path {font-size:11px;color:var(--color-subtle_text);width:50%}
.mcpskins-shortcuts {max-height:65vh;overflow:auto}
.mcpskins-shortcuts section {margin:18px 0 4px}
.mcpskins-shortcuts h3 {font-size:14px;font-weight:600;margin:0 0 7px}
.mcpskins-shortcuts th {text-align:left;padding:6px 8px;color:var(--color-subtle_text);font-size:12px}
.mcpskins-shortcuts td:first-child,.mcpskins-shortcuts th:first-child {width:45%}
.mcpskins-shortcuts table {border-collapse:collapse;width:100%;font-size:13px}
.mcpskins-shortcuts td {padding:6px 8px;border-bottom:1px solid var(--color-border)}
.mcpskins-shortcuts kbd {white-space:nowrap;font:inherit;font-weight:600}
.mcpskins-health-list {max-height:55vh;overflow:auto}
.mcpskins-health-list article {padding:10px 4px;border-top:1px solid var(--color-border)}
.mcpskins-health-list p {margin:4px 0;overflow-wrap:anywhere}
.mcpskins-health-list button {margin:5px 6px 0 0}
.mcpskins-health-error {color:#e05a5a}
.mcpskins-health-warning {color:#d4a537}
.mcpskins-status-flag {display:inline-block;width:11px;height:13px;margin-right:7px;vertical-align:-2px;clip-path:polygon(0 0,100% 0,100% 65%,15% 65%,15% 100%,0 100%);background:currentColor}
.mcpskins-variant-flag {width:10px;height:10px;margin-right:0;margin-left:7px;vertical-align:0;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);color:#a875dc}
.mcpskins-status-unset {color:var(--mc-muted);opacity:.25}
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
.mcpskins-brand {display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.mcpskins .mcpskins-brand > .mcpskins-update-button {display:inline-flex;align-items:center;justify-content:center;flex:0 0 24px;width:24px;min-width:24px;max-width:24px;height:24px;min-height:24px;max-height:24px;padding:0;color:var(--mc-accent);background:transparent}
.mcpskins-update-button svg {display:block;flex-shrink:0}
.mcpskins input:focus,.mcpskins textarea:focus,.mcpskins select:focus,.mcpskins button:focus-visible {outline:1px solid var(--mc-accent);outline-offset:1px}
.mcpskins input[readonly],.mcpskins :disabled {opacity:.6}
.mcpskins textarea {resize:vertical;min-height:65px}
.mcpskins .mcpskins-primary {background:var(--mc-accent);color:var(--color-accent_text,#fff)}
.mcpskins .mcpskins-secondary {background:var(--color-button,var(--color-ui));color:var(--color-text);border-color:transparent}
.mcpskins-header,.mcpskins-browser-footer,.mcpskins-browser-footer>div {display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap}
.mcpskins .mcpskins-header {height:auto;min-height:48px;padding:6px 8px;flex-shrink:0;overflow:visible;line-height:normal}
.mcpskins-pack-heading {display:flex;align-items:center;justify-content:flex-end;gap:10px;min-width:0;margin-left:auto;max-width:100%}
.mcpskins .mcpskins-pack-title {background:transparent;border-color:transparent;font-weight:600;overflow:hidden;text-overflow:ellipsis;max-width:240px}
.mcpskins .mcpskins-pack-title:hover {border-color:var(--mc-border)}
.mcpskins .mcpskins-pack-title-input {width:200px;min-width:70px}
.mcpskins-pack-heading > .mcpskins-secondary {flex-shrink:0}
.mcpskins .mcpskins-pack-heading > .mcpskins-health-button {display:inline-flex;align-items:center;justify-content:center;flex:0 0 28px;width:28px;min-width:28px;max-width:28px;height:28px;min-height:28px;max-height:28px;padding:0}
.mcpskins-health-button svg {display:block;flex-shrink:0}
.mcpskins .mcpskins-health-button[data-health="error"] {color:#e05a5a}
.mcpskins .mcpskins-health-button[data-health="warning"] {color:#d4a537}
.mcpskins .mcpskins-health-button[data-health="good"] {color:#3bbd77}
.mcpskins-header strong {font-size:16px}
.mcpskins-muted,.mcpskins-path {color:var(--mc-muted);font-size:11px}
.mcpskins-path {overflow-wrap:anywhere;margin:8px 0}
.mcpskins-gunpacks {display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:8px 0}
.mcpskins-gunpacks > span {flex:1;min-width:140px;overflow-wrap:anywhere}
.mcpskins-gunpacks button {font-size:11px;min-height:25px}
.mcpskins-filters {display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}
.mcpskins-filters input {flex:1;min-width:70px;width:100%}
.mcpskins-filters select {max-width:130px}
.mcpskins .mcpskins-filters > .mcpskins-refresh-button {display:inline-flex;align-items:center;justify-content:center;align-self:center;flex:0 0 28px;width:28px;min-width:28px;max-width:28px;height:28px;min-height:28px;max-height:28px;padding:0}
.mcpskins-refresh-button svg {display:block;flex-shrink:0}
.mcpskins-table-wrap {overflow:auto;border:1px solid var(--mc-border);border-radius:3px;max-height:300px;min-height:100px}
.mcpskins-table {border-collapse:collapse;width:100%;text-align:left;white-space:nowrap}
.mcpskins-table th {position:sticky;top:0;background:var(--mc-panel);z-index:1;text-align:left}
.mcpskins-table th button {border:0;background:transparent;font-weight:bold;width:100%;text-align:left}
.mcpskins-table td {padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.07);max-width:260px;overflow:hidden;text-overflow:ellipsis}
.mcpskins-table tbody tr {cursor:pointer;user-select:none}
.mcpskins-table tr.selected {background:var(--mc-selected);box-shadow:inset 3px 0 var(--mc-accent)}
.mcpskins-table tr:focus-visible {outline:1px solid var(--mc-accent);outline-offset:-2px}
.mcpskins-rarity-dot {display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;box-shadow:0 0 0 1px #0004}
.mcpskins-browser-footer {margin:8px 0}
.mcpskins-inspector {border-top:1px solid var(--mc-border);padding-top:10px;margin-top:10px;min-width:0}
.mcpskins-inspector h3 {font-size:14px;margin:0 0 8px;font-weight:600}
.mcpskins-dirty {font-size:11px;color:var(--mc-accent);margin-left:6px}
.mcpskins-fields {display:flex;flex-direction:column;gap:16px;min-width:0}
.mcpskins-field-group {display:flex;flex-direction:column;gap:10px;min-width:0}
.mcpskins-field-group > label + label,.mcpskins-field-group > .mcpskins-weapon-field + label,.mcpskins-field-group > label + .mcpskins-weapon-field {border-top:1px solid rgba(108,146,196,.12);padding-top:10px}
.mcpskins .mcpskins-field-heading {font-size:13px;font-weight:700;margin:0;padding:8px 10px;border:1px solid var(--mc-border);border-radius:4px;background:linear-gradient(rgba(108,146,196,.10),rgba(108,146,196,.10)),var(--mc-panel)}
.mcpskins-advanced {border:1px solid var(--mc-border);border-radius:6px;overflow:hidden}
.mcpskins .mcpskins-advanced > summary {display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;list-style:none;background:rgba(255,255,255,.07)}
.mcpskins-advanced > summary::-webkit-details-marker {display:none}
.mcpskins-advanced > summary::after {content:'';width:8px;height:8px;flex-shrink:0;margin:0 3px 4px 0;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg)}
.mcpskins-advanced[open] > summary::after {transform:rotate(225deg);margin-top:4px;margin-bottom:0}
.mcpskins-advanced > summary:hover {background:rgba(255,255,255,.11)}
.mcpskins-advanced > summary:focus-visible {outline:1px solid var(--mc-accent);outline-offset:-2px}
.mcpskins-advanced > .mcpskins-field-group {padding:12px}
.mcpskins-fields label {display:flex;flex-direction:column;gap:4px}
.mcpskins-required {color:#e05a5a;font-weight:700}
.mcpskins-field-help {display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;flex:0 0 auto;width:14px;height:14px;margin-left:3px;border:1px solid var(--mc-muted);border-radius:50%;color:var(--mc-muted);font-size:10px;font-weight:600;line-height:1;cursor:help}
.mcpskins-field-help:hover {color:var(--mc-text);border-color:var(--mc-text)}
.mcpskins-field-help:focus-visible {outline:1px solid var(--mc-accent);outline-offset:2px}
.mcpskins-variants {border:1px solid var(--mc-border);border-radius:6px;padding:6px 9px}
.mcpskins-variants > summary {font-weight:600}
.mcpskins-variant-list {display:flex;flex-direction:column;gap:7px;max-height:190px;overflow:auto;padding:6px 0 10px}
.mcpskins-variant-list small {display:block;overflow-wrap:anywhere}
.mcpskins-variants h4 {margin:14px 0 6px;font-weight:600}
.mcpskins-level {border-top:1px solid var(--mc-border);padding:9px 0;display:flex;flex-direction:column;gap:7px}
.mcpskins-level-heading {display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap}
.mcpskins-level-heading > div {display:flex;gap:4px}
.mcpskins-level-goals {display:grid;grid-template-columns:repeat(auto-fit,minmax(85px,1fr));gap:6px}
.mcpskins-level-goals input {width:100%;min-width:0}
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
.mcpskins-animation-action {margin-top:12px}
.mcpskins-color input {width:100px;flex:1;min-width:80px}
.mcpskins-color .mcpskins-swatch {width:30px;min-width:30px}
.mcpskins-previews {margin-top:12px;min-width:0}
.mcpskins summary {cursor:pointer;font-weight:600;padding:6px 0}
.mcpskins-previews figure {margin:10px 0;text-align:center}
.mcpskins-previews figcaption {text-align:left;margin-bottom:4px}
.mcpskins-preview {height:256px;width:100%;display:flex;align-items:center;justify-content:center;background-color:var(--mc-field);background-image:linear-gradient(45deg,#8881 25%,transparent 25%),linear-gradient(-45deg,#8881 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#8881 75%),linear-gradient(-45deg,transparent 75%,#8881 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;border:1px solid var(--mc-border);color:var(--mc-muted);overflow:hidden;padding:6px}
.mcpskins-aspect {display:block;font-size:11px;opacity:.7;margin-top:5px}
.mcpskins-preview.hud {height:85px}
.mcpskins-preview img {max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;image-rendering:pixelated}
.mcpskins-previews p {overflow-wrap:anywhere;margin:5px 0}
.mcpskins-empty {padding:14px 4px;white-space:normal;color:var(--mc-muted)}
.mcpskins-notice,.mcpskins-warnings {padding:7px;border-left:3px solid var(--mc-accent);overflow-wrap:anywhere;margin:8px 0}
.mcpskins-theme {display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;border-top:1px solid var(--mc-border);margin-top:12px;padding-top:8px;font-size:11px;color:var(--mc-muted)}
.mcpskins-theme label {display:flex;align-items:center;gap:8px}
.mcpskins .mcpskins-variant-warning {border-left-color:#e05a5a;background:rgba(224,90,90,.07)}
/* Frutiger Aero: sky glass, clear white surfaces, and glossy blue controls. */
.mcpskins.mcpskins-aero {--color-back:#e8f5fc;--color-dark:#e1eff7;--color-text:#163c57;--color-subtle_text:#456a80;--color-border:#a5c7da;--color-button:#d6edf9;--color-ui:#e6f3fb;--color-selected:#b8def5;--color-accent:#087db9;--color-accent_text:#fff;color-scheme:light;background:radial-gradient(ellipse at 90% 0%,#ffffffd9,transparent 55%),linear-gradient(155deg,#effaff,#d8edf9);text-shadow:none}
.mcpskins-aero .mcpskins-header {background:linear-gradient(180deg,#ffffffed,#d4ecfacf);border:1px solid #a5c7da;border-radius:9px;box-shadow:inset 0 1px #fff,0 2px 5px #22577a14;padding:9px 12px;margin-bottom:10px}
.mcpskins-aero .mcpskins-header strong {color:#124e75;text-shadow:0 1px #fff}
.mcpskins-aero button,.mcpskins-aero input:not([type=checkbox]),.mcpskins-aero select,.mcpskins-aero textarea {border-radius:6px;color:var(--mc-text);text-shadow:none;box-shadow:inset 0 1px 2px #1a54720d}
.mcpskins-aero input:not([type=checkbox]),.mcpskins-aero textarea {background:#faffff}
.mcpskins-aero input[readonly] {opacity:1;background:#eaf3f9;color:#456a80}
.mcpskins-aero input::placeholder,.mcpskins-aero textarea::placeholder {color:#5c7d91;opacity:1}
.mcpskins-aero button,.mcpskins-aero select {background:linear-gradient(#fff,#d9edf8);box-shadow:inset 0 1px #fff,0 1px 2px #2455741a}
.mcpskins-aero select option {background:#f7fcff;color:#163c57}
.mcpskins-aero button:hover:not(:disabled) {background:linear-gradient(#fff,#c5e6f8);border-color:#4e9cc8}
.mcpskins-aero .mcpskins-primary,.mcpskins-aero .mcpskins-secondary {color:#fff;border:1px solid #086b9e;background:linear-gradient(#4fafd9 0%,#137dae 48%,#086a9e 49%,#075b8e 100%);box-shadow:inset 0 1px #ffffff8c,0 2px 3px #17476626;text-shadow:0 1px #075e8a}
.mcpskins-aero .mcpskins-primary:hover:not(:disabled),.mcpskins-aero .mcpskins-secondary:hover:not(:disabled) {background:linear-gradient(#66bde4,#1785b6 48%,#0b73a6 49%,#086492);border-color:#075882}
.mcpskins-aero .mcpskins-pack-title {background:transparent;box-shadow:none;color:#12537d;text-shadow:none}
.mcpskins-aero .mcpskins-pack-title:hover {background:#ffffff80}
.mcpskins-aero .mcpskins-table-wrap {background:#f8fcff;border-color:#9abed4;border-radius:8px;box-shadow:inset 0 1px #fff,0 2px 5px #22577a0d}
.mcpskins-aero .mcpskins-table th {background:linear-gradient(#f9fdff,#d5eaf7);border-bottom:1px solid #a5c7da}
.mcpskins-aero .mcpskins-table th button,.mcpskins-aero .mcpskins-table th button:hover {background:transparent;box-shadow:none;border-radius:0;color:#174e72;text-shadow:0 1px #fff}
.mcpskins-aero .mcpskins-table td {border-bottom-color:#d5e6f0}
.mcpskins-aero .mcpskins-table tbody tr:nth-child(even) {background:#edf6fc}
.mcpskins-aero .mcpskins-table tbody tr:hover {background:#dceffc}
.mcpskins-aero .mcpskins-table tbody tr.selected {background:linear-gradient(#c9e9fc,#acd6f1);color:#103b58;box-shadow:inset 3px 0 #087db9}
.mcpskins-aero .mcpskins-weapon-list {background:#f7fcff;border-color:#8bb8d2;box-shadow:0 5px 14px #17476626}
.mcpskins-aero .mcpskins-theme {border-top-color:#abcddd}
.mcpskins-aero .mcpskins-color .mcpskins-swatch {background-image:none}
.mcpskins-aero ::-webkit-scrollbar-track {background:#e5f0f7}
.mcpskins-aero ::-webkit-scrollbar-thumb {background:#92b9d0;border:2px solid #e5f0f7;border-radius:8px}
/* Neo and Soft share the glass surfaces with their own accent and surface colors. */
.mcpskins-neo {--mc-glass-tint:#edf5fa;--mc-glass-deep:#d9e7f0;--mc-glass-zebra:#eef4f8;--mc-glass-hover:#e0edf5;--mc-glass-strong:#922f1c;--mc-glass-button-start:#e89a80;--mc-glass-button-mid:#b94229;--mc-glass-button-end:#97321e;--mc-glass-selected:#cce2f0;--mc-glass-scroll:#a2b8c8}
.mcpskins-soft {--mc-glass-tint:#f8f4fc;--mc-glass-deep:#e7dff2;--mc-glass-zebra:#f5f1fa;--mc-glass-hover:#eee5f7;--mc-glass-strong:#5e3e85;--mc-glass-button-start:#b69bcf;--mc-glass-button-mid:#7956a1;--mc-glass-button-end:#5e3e85;--mc-glass-selected:#e1d4f0;--mc-glass-scroll:#b7a8ca}
.mcpskins.mcpskins-light {--color-back:var(--mc-panel);--color-dark:var(--mc-glass-deep);--color-text:var(--mc-text);--color-subtle_text:var(--mc-muted);--color-border:var(--mc-border);--color-button:var(--mc-glass-deep);--color-ui:var(--mc-glass-tint);--color-selected:var(--mc-selected);--color-accent:var(--mc-accent);--color-accent_text:#fff;color-scheme:light;background:radial-gradient(ellipse at 90% 0%,#ffffffd9,transparent 55%),linear-gradient(155deg,var(--mc-glass-tint),var(--mc-glass-deep));text-shadow:none}
.mcpskins-light .mcpskins-header {background:linear-gradient(180deg,#ffffffed,var(--mc-glass-deep));border:1px solid var(--mc-border);border-radius:9px;box-shadow:inset 0 1px #fff,0 2px 5px #25334e14;padding:9px 12px;margin-bottom:10px}
.mcpskins-light .mcpskins-header strong {color:var(--mc-text);text-shadow:0 1px #fff}
.mcpskins-light button,.mcpskins-light input:not([type=checkbox]),.mcpskins-light select,.mcpskins-light textarea {border-radius:6px;color:var(--mc-text);text-shadow:none;box-shadow:inset 0 1px 2px #25334e0d}
.mcpskins-light input:not([type=checkbox]),.mcpskins-light textarea {background:var(--mc-field)}
.mcpskins-light input[readonly] {opacity:1;background:var(--mc-glass-zebra);color:var(--mc-muted)}
.mcpskins-light input::placeholder,.mcpskins-light textarea::placeholder {color:var(--mc-muted);opacity:1}
.mcpskins-light button,.mcpskins-light select {background:linear-gradient(#fff,var(--mc-glass-deep));box-shadow:inset 0 1px #fff,0 1px 2px #25334e1a}
.mcpskins-light select option {background:var(--mc-field);color:var(--mc-text)}
.mcpskins-light button:hover:not(:disabled) {background:linear-gradient(#fff,var(--mc-glass-hover));border-color:var(--mc-accent)}
.mcpskins-light .mcpskins-primary,.mcpskins-light .mcpskins-secondary {color:#fff;border:1px solid var(--mc-glass-strong);background:linear-gradient(var(--mc-glass-button-start) 0%,var(--mc-glass-button-mid) 48%,var(--mc-glass-button-end) 49%,var(--mc-glass-strong) 100%);box-shadow:inset 0 1px #ffffff8c,0 2px 3px #25334e26;text-shadow:0 1px var(--mc-glass-strong)}
.mcpskins-light .mcpskins-primary:hover:not(:disabled),.mcpskins-light .mcpskins-secondary:hover:not(:disabled) {background:linear-gradient(var(--mc-glass-button-start),var(--mc-glass-button-mid));border-color:var(--mc-glass-strong)}
.mcpskins-light .mcpskins-pack-title {background:transparent;box-shadow:none;color:var(--mc-glass-strong);text-shadow:none}
.mcpskins-light .mcpskins-pack-title:hover {background:#ffffff80}
.mcpskins-light .mcpskins-table-wrap {background:var(--mc-field);border-color:var(--mc-border);border-radius:8px;box-shadow:inset 0 1px #fff,0 2px 5px #25334e0d}
.mcpskins-light .mcpskins-table th {background:linear-gradient(#fff,var(--mc-glass-deep));border-bottom:1px solid var(--mc-border)}
.mcpskins-light .mcpskins-table th button,.mcpskins-light .mcpskins-table th button:hover {background:transparent;box-shadow:none;border-radius:0;color:var(--mc-text);text-shadow:0 1px #fff}
.mcpskins-light .mcpskins-table td {border-bottom-color:var(--mc-glass-deep)}
.mcpskins-light .mcpskins-table tbody tr:nth-child(even) {background:var(--mc-glass-zebra)}
.mcpskins-light .mcpskins-table tbody tr:hover {background:var(--mc-glass-hover)}
.mcpskins-light .mcpskins-table tbody tr.selected {background:linear-gradient(var(--mc-glass-hover),var(--mc-glass-selected));color:var(--mc-text);box-shadow:inset 3px 0 var(--mc-accent)}
.mcpskins-light .mcpskins-weapon-list {background:var(--mc-field);border-color:var(--mc-border);box-shadow:0 5px 14px #25334e26}
.mcpskins-light .mcpskins-color .mcpskins-swatch {background-image:none}
.mcpskins-light ::-webkit-scrollbar-track {background:var(--mc-glass-zebra)}
.mcpskins-light ::-webkit-scrollbar-thumb {background:var(--mc-glass-scroll);border:2px solid var(--mc-glass-zebra);border-radius:8px}
@container (min-width:500px) {.mcpskins-editor {display:grid;grid-template-columns:minmax(220px,1fr) minmax(180px,256px);gap:16px}.mcpskins-previews {margin-top:0}}
@container (min-width:1000px) {.mcpskins-workspace {display:grid;grid-template-columns:minmax(360px,1fr) minmax(420px,1fr);gap:16px}.mcpskins-inspector {border-top:0;border-left:1px solid var(--mc-border);margin-top:0;padding-top:0;padding-left:16px}.mcpskins-table-wrap {max-height:600px}}
`;
