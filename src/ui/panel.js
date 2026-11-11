'use strict';
const {RARITIES, THEMES} = require('../domain/constants');
const {baseWeapon, defaultColor} = require('../domain/skin');
const {weaponPicker} = require('./weapon-picker');

function panelComponent(controller) {
    const manager = controller.manager;
    return {
        components: {'weapon-picker': weaponPicker},
        data() { return {s: manager.state, rarities: Object.keys(RARITIES), themes: ['Blockbench', ...Object.keys(THEMES)]}; },
        computed: {
            rows() { return manager.filteredRows(); },
            fileCount() { return new Set(this.s.rows.map(row => row.filename)).size; },
            title() {
                const draft = this.s.draft;
                const prefix = draft.override_prefix ? draft.name_prefix.trim() : manager.prefixFor(draft.weapon);
                return draft.weapon ? `${prefix || '…'} | ${draft.label.trim() || '…'}` : draft.label || 'New skin';
            },
            palette() {
                const theme = THEMES[this.s.theme];
                if (!theme) return {};
                return {'--mc-panel': theme.panel, '--mc-field': theme.field, '--mc-text': theme.text,
                    '--mc-muted': theme.muted, '--mc-border': theme.border, '--mc-accent': theme.accent, '--mc-selected': theme.selected};
            }
        },
        methods: {
            edit(key, event) { controller.edit(key, event.target.type === 'checkbox' ? event.target.checked : event.target.value); },
            editWeapon(value) { controller.edit('weapon', value); },
            commitWeapon() { controller.commitWeapon(); },
            command(name) { controller[name](); },
            select(row) { controller.select(row); },
            sort(column) { manager.sort(column); },
            heading(column, label) { return label + (this.s.sortColumn === column ? (this.s.descending ? ' ▼' : ' ▲') : ''); },
            gun(row) { return manager.prefixFor(baseWeapon(row.data)); },
            filename(row) { return controller.desktop.path.basename(row.filename); },
            rarityColor(rarity) { return defaultColor(String(rarity).toLowerCase()); },
            context(row, event) { event.preventDefault(); controller.context(row, event); },
            imageLoaded(card, event) { card.dimensions = `${event.target.naturalWidth} × ${event.target.naturalHeight} px`; },
            imageFailed(card) { card.source = ''; card.message = 'Could not open image'; },
            changeTheme(event) { controller.changeTheme(event.target.value); }
        },
        template: `
        <div class="mcpskins" :style="palette">
            <header class="mcpskins-header">
                <div><strong>MCPSkins Manager</strong><span class="mcpskins-muted"> · Made by Mjonter</span></div>
                <button type="button" class="mcpskins-secondary" @click="command('configure')" title="Choose pack directory and namespace">Select Pack</button>
            </header>
            <div v-if="!s.ready" class="mcpskins-empty">
                <p>Connect your MCPSkins resource pack to browse and edit its skins.</p>
                <button type="button" class="mcpskins-primary" @click="command('configure')">Choose pack directory</button>
            </div>
            <template v-else>
                <p class="mcpskins-path" :title="s.directory">{{s.folder}} / {{s.namespace}}<br>{{s.directory}}</p>
                <p v-if="s.notice" class="mcpskins-notice" role="status">{{s.notice}}</p>
                <details v-if="s.warnings.length" class="mcpskins-warnings"><summary>{{s.warnings.length}} file(s) skipped</summary><p v-for="warning in s.warnings.slice(0, 10)">{{warning}}</p></details>
                <div class="mcpskins-workspace">
                    <section class="mcpskins-browser" aria-label="Skin browser">
                        <div class="mcpskins-filters">
                            <input type="search" v-model="s.search" placeholder="Search skins…" aria-label="Search skins">
                            <select v-model="s.rarityFilter" aria-label="Filter by rarity"><option value="">All rarities</option><option v-for="rarity in rarities" :value="rarity">{{rarity}}</option></select>
                        </div>
                        <div class="mcpskins-table-wrap">
                            <table class="mcpskins-table">
                                <thead><tr><th v-for="column in [['gun','Weapon'],['name','Skin'],['rarity','Rarity'],['collection','Collection'],['file','File']]" :key="column[0]" :aria-sort="s.sortColumn === column[0] ? (s.descending ? 'descending' : 'ascending') : 'none'"><button type="button" @click="sort(column[0])">{{heading(column[0], column[1])}}</button></th></tr></thead>
                                <tbody><tr v-for="row in rows" :key="row.key" :class="{selected:s.selectedKey===row.key}" tabindex="0" :aria-selected="s.selectedKey===row.key" @click="select(row)" @keydown.enter.prevent="select(row)" @keydown.space.prevent="select(row)" @contextmenu="context(row,$event)">
                                    <td>{{gun(row)}}</td><td>{{row.skin.name}}</td><td><span class="mcpskins-rarity-dot" :style="{background:rarityColor(row.skin.rarity)}"></span>{{row.skin.rarity}}</td><td>{{row.skin.collection}}</td><td :title="row.filename">{{filename(row)}}</td>
                                </tr></tbody>
                            </table>
                            <p v-if="!rows.length" class="mcpskins-empty">{{s.missing ? 'No skins directory yet. Save a new skin to create it.' : s.rows.length ? 'No skins match these filters.' : 'No skins found. Create a new skin to begin.'}}</p>
                        </div>
                        <footer class="mcpskins-browser-footer"><span class="mcpskins-muted">{{rows.length}} of {{s.rows.length}} skins · {{fileCount}} files</span><div><button type="button" @click="command('refresh')">Refresh Files</button><button type="button" class="mcpskins-secondary" @click="command('newSkin')">New Skin</button></div></footer>
                    </section>
                    <section class="mcpskins-inspector" aria-label="Asset inspector">
                        <h3>Asset Inspector <span v-if="s.dirty" class="mcpskins-dirty">Unsaved</span></h3>
                        <p v-if="!s.active" class="mcpskins-muted">Select a skin or click New Skin.</p>
                        <template v-else>
                            <div class="mcpskins-editor">
                                <form class="mcpskins-fields" @submit.prevent="command('save')">
                                    <div class="mcpskins-weapon-field"><span>Weapon ID</span><weapon-picker :value="s.draft.weapon" :readonly="!!s.selectedKey" @input="editWeapon" @commit="commitWeapon"></weapon-picker></div>
                                    <label>Weapon type<select :value="s.draft.kind" :disabled="!!s.selectedKey" @change="edit('kind',$event)"><option value="gun">Gun</option><option value="melee">Melee</option></select></label>
                                    <label class="mcpskins-check"><input type="checkbox" :checked="s.draft.override_prefix" @change="edit('override_prefix',$event)">Override name prefix</label>
                                    <label v-if="s.draft.override_prefix">Name prefix<input :value="s.draft.name_prefix" @input="edit('name_prefix',$event)" placeholder="Custom weapon name"></label>
                                    <label>Skin name <span class="mcpskins-muted mcpskins-title">{{title}}</span><input :value="s.draft.label" @input="edit('label',$event)"></label>
                                    <label>Skin ID<input :value="s.draft.id" @input="edit('id',$event)" placeholder="Leave empty to generate a new ID" spellcheck="false"></label>
                                    <label>Rarity<select :value="s.draft.rarity" @change="edit('rarity',$event)"><option v-for="rarity in rarities" :value="rarity">{{rarity}}</option></select></label>
                                    <label>Label color<div class="mcpskins-color"><button type="button" class="mcpskins-swatch" :style="{background: /^#[0-9a-f]{6}$/i.test(s.draft.color) ? s.draft.color : 'transparent'}" @click="command('pickColor')" aria-label="Choose label color"></button><input :value="s.draft.color" @input="edit('color',$event)" aria-label="Label color hex" spellcheck="false"><button type="button" @click="command('resetColor')">Reset</button></div></label>
                                    <label>Collection<input :value="s.draft.collection" @input="edit('collection',$event)"></label>
                                    <label>Description<textarea rows="3" :value="s.draft.description" @input="edit('description',$event)"></textarea></label>
                                    <label class="mcpskins-check"><input type="checkbox" :checked="s.draft.is_new" @change="edit('is_new',$event)">Mark as new</label>
                                    <label>Locked text <span class="mcpskins-muted">(optional)</span><input :value="s.draft.locked_text" @input="edit('locked_text',$event)"></label>
                                    <label class="mcpskins-check"><input type="checkbox" :checked="s.draft.unlocked" @change="edit('unlocked',$event)">Unlocked</label>
                                    <label class="mcpskins-check"><input type="checkbox" :checked="s.draft.include_weight" @change="edit('include_weight',$event)">Include fusion weight</label>
                                    <label>Fusion weight<input type="number" min="1" step="1" :disabled="!s.draft.include_weight" :value="s.draft.weight" @input="edit('weight',$event)"></label>
                                    <div class="mcpskins-save"><button type="submit" class="mcpskins-primary">Save Skin</button><button type="button" @click="command('revert')">Discard Changes</button></div>
                                    <p class="mcpskins-muted">Only Save Skin writes registry changes. Model and texture edits use Blockbench’s save commands.</p>
                                </form>
                                <details class="mcpskins-previews" open><summary>Textures</summary>
                                    <div class="mcpskins-asset-actions"><button type="button" @click="command('openModel')">Open Model</button><button type="button" @click="command('openFolder')">Open Folder</button></div>
                                    <figure v-for="card in s.previews" :key="card.kind"><figcaption>{{card.label}}</figcaption><div :class="['mcpskins-preview',card.kind]"><img v-if="card.source" :src="card.source" :alt="card.filename" @load="imageLoaded(card,$event)" @error="imageFailed(card)"><span v-else>{{card.message}}</span></div><p class="mcpskins-muted">{{card.filename}}<br>{{card.dimensions}}</p></figure>
                                </details>
                            </div>
                        </template>
                    </section>
                </div>
            </template>
            <footer class="mcpskins-theme"><label>Panel theme <select :value="s.theme" @change="changeTheme"><option v-for="theme in themes" :value="theme">{{theme}}</option></select></label></footer>
        </div>`
    };
}

module.exports = {panelComponent};
