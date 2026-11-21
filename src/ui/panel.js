'use strict';
const {weaponSuggestions} = require('../domain/weapon-options');
const {PLUGIN_TITLE} = require('../version');
const {rowStatus} = require('../domain/status');
const {THEMES} = require('../domain/constants');
const {sortedRarities} = require('../domain/rarities');
const {baseWeapon, defaultColor} = require('../domain/skin');
const {variantEditor} = require('./variant-editor');
const {fieldHelp} = require('./field-help');
const {weaponPicker} = require('./weapon-picker');
const LIGHT_PALETTES = {
    'Frutiger Aero': {panel: '#E8F5FC', field: '#F7FCFF', text: '#163C57', muted: '#456A80', border: '#A5C7DA', accent: '#087DB9', selected: '#B8DEF5'},
    Neo: {...THEMES.Neo, muted: '#526B7C', accent: '#B94229'},
    Soft: {...THEMES.Soft, muted: '#665E77', accent: '#73529D'}
};

function panelComponent(controller) {
    const manager = controller.manager;
    return {
        components: {'field-help': fieldHelp, 'weapon-picker': weaponPicker, 'variant-editor': variantEditor},
        data() { return {pluginTitle: PLUGIN_TITLE, s: manager.state, titleEditing: false, titleDraft: '', titlePack: '', titleSaving: false, themes: ['Blockbench', ...Object.keys(THEMES)]}; },
        computed: {
            healthTitle() {
                const health = this.s.health;
                return health.status === 'checking' ? 'Health Check: checking saved pack files...' :
                    'Health Check: ' + health.errors + ' errors, ' + health.warnings + ' warnings' + (health.ignored ? ', ' + health.ignored + ' ignored' : '') + ' (saved files)';
            },
            rarities() { return sortedRarities(this.s.rarities); },
            bulk() { return this.s.selectedKeys.length > 1; },
            variantCandidates() { return manager.variantCandidates(); },
            variantOwner() { return manager.variantOwner(); },
            variantFlags() {
                const parents = new Map(), flags = new Map();
                for (const row of this.s.rows) {
                    if (!Array.isArray(row.skin.variants)) continue;
                    if (!parents.has(row.filename)) parents.set(row.filename, new Map());
                    const file = parents.get(row.filename);
                    for (const id of row.skin.variants) {
                        if (id !== row.skin.id && !file.has(id)) file.set(id, String(row.skin.name || row.skin.id));
                    }
                }
                for (const row of this.s.rows) {
                    const parent = parents.get(row.filename)?.get(row.skin.id);
                    if (parent) flags.set(row.key, 'This skin is a variant of ' + parent);
                }
                return flags;
            },
            fileAuthor() {
                const source = manager.selected || manager.duplicateSource;
                return source && typeof source.data.author === 'string' ? source.data.author : '';
            },
            weaponOptions() { return weaponSuggestions(this.s.gunPackItems, this.s.draft.kind); },
            collections() { return manager.collections(); },
            rows() { return manager.filteredRows(); },
            hiddenSelectedCount() {
                const visible = new Set(this.rows.map(row => row.key));
                return this.s.selectedKeys.filter(key => !visible.has(key)).length;
            },
            tabRowKey() { return this.rows.some(row => row.key === this.s.selectedKey) ? this.s.selectedKey : this.rows.length ? this.rows[0].key : ''; },
            fileCount() { return new Set(this.s.rows.map(row => row.filename)).size; },
            title() {
                if (this.bulk) return `${this.s.selectedKeys.length} skins selected`;
                const draft = this.s.draft;
                const prefix = draft.override_prefix ? draft.name_prefix.trim() : manager.prefixFor(draft.weapon);
                return draft.weapon ? `${prefix || '…'} | ${draft.label.trim() || '…'}` : draft.label || 'New skin';
            },
            palette() {
                const theme = LIGHT_PALETTES[this.s.theme] || THEMES[this.s.theme];
                if (!theme) return {};
                return {'--mc-panel': theme.panel, '--mc-field': theme.field, '--mc-text': theme.text,
                    '--mc-muted': theme.muted, '--mc-border': theme.border, '--mc-accent': theme.accent, '--mc-selected': theme.selected};
            }
        },
        watch: {
            's.folder'() { this.titleEditing = false; },
            's.root'() { this.titleEditing = false; }
        },
        methods: {
            editPackTitle() {
                this.titleDraft = this.s.packMetadata.title;
                this.titlePack = manager.repository.paths.pack;
                this.titleEditing = true;
                this.$nextTick(() => { if (this.$refs.packTitle) { this.$refs.packTitle.focus(); this.$refs.packTitle.select(); } });
            },
            async commitPackTitle() {
                if (!this.titleEditing || this.titleSaving) return;
                if (this.titlePack !== manager.repository.paths.pack) { this.titleEditing = false; return; }
                this.titleSaving = true;
                const saved = await controller.updatePackMetadata({title: this.titleDraft}, this.titlePack);
                this.titleSaving = false;
                if (saved) this.titleEditing = false;
            },
            edit(key, event) { controller.edit(key, event.target.type === 'checkbox' ? event.target.checked : event.target.value); },
            editVariants(value) { controller.edit('variants', value); },
            editLevels(value) { controller.edit('levels', value); },
            editWeapon(value) { controller.edit('weapon', value); },
            commitWeapon() { controller.commitWeapon(); },
            command(name) { controller[name](); },
            select(row, event) { controller.select(row, event); },
            sort(column) { manager.sort(column); },
            heading(column, label) { return label + (this.s.sortColumn === column ? (this.s.descending ? ' ▼' : ' ▲') : ''); },
            gun(row) { return manager.prefixFor(baseWeapon(row.data)); },
            status(row) { return rowStatus(this.s.packMetadata, manager.repository.paths, row); },
            rowToken(row) { return encodeURIComponent(row.key); },
            filename(row) { return controller.desktop.path.basename(row.filename); },
            rarityName(rarity) {
                const id = String(rarity).toLowerCase();
                return Object.hasOwn(this.s.rarities, id) ? this.s.rarities[id].name : rarity;
            },
            rarityColor(rarity) { return defaultColor(String(rarity).toLowerCase(), this.s.rarities); },
            context(row, event) { event.preventDefault(); controller.context(row, event); },
            imageLoaded(card, event) { card.dimensions = `${event.target.naturalWidth} × ${event.target.naturalHeight} px`; },
            imageFailed(card) { card.source = ''; card.message = 'Could not open image'; },
            changeTheme(event) { controller.changeTheme(event.target.value); }
        },
        template: `
        <div class="mcpskins" :class="{'mcpskins-aero':s.theme === 'Frutiger Aero','mcpskins-light':s.theme === 'Neo' || s.theme === 'Soft','mcpskins-neo':s.theme === 'Neo','mcpskins-soft':s.theme === 'Soft'}" :style="palette">
            <header class="mcpskins-header">
                <div class="mcpskins-brand"><strong>{{pluginTitle}}</strong><button v-if="s.update" type="button" class="mcpskins-update-button" @click="command('openUpdate')" :title="'Update available: v' + s.update.version + '. Open GitHub release.'" :aria-label="'Update available: v' + s.update.version + '. Open GitHub release.'"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 16V3m-5 5l5-5 5 5M4 16v5h16v-5"/></svg></button><span class="mcpskins-muted"> · Made by Mjonter</span></div>
                <div class="mcpskins-pack-heading">
                    <template v-if="s.ready">
                        <input v-if="titleEditing" ref="packTitle" class="mcpskins-pack-title-input" v-model="titleDraft" :disabled="titleSaving" aria-label="Pack title" title="Saves automatically on Enter or when leaving the field" @blur="commitPackTitle" @keydown.enter.prevent.stop="commitPackTitle" @keydown.esc.prevent.stop="titleEditing=false">
                        <button v-else type="button" class="mcpskins-pack-title" @click="editPackTitle" title="Click to edit pack title">{{s.packMetadata.title}}</button>
                        <button type="button" class="mcpskins-secondary mcpskins-health-button" @click="command('healthCheck')" :data-health="s.health.status" :title="healthTitle" :aria-label="healthTitle"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false"><path v-if="s.health.status === 'error'" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/><template v-else-if="s.health.status === 'warning'"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 3L2 21h20z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 9v5m0 3v.2"/></template><path v-else-if="s.health.status === 'good'" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M4 12l5 5L20 6"/><path v-else fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" d="M12 3a9 9 0 100 18 9 9 0 000-18"/></svg></button>
                    </template>
                    <button type="button" class="mcpskins-secondary" @click="command('configure')" title="Choose pack directory and namespace">Select Pack</button>
                </div>
            </header>
            <div v-if="!s.ready" class="mcpskins-empty">
                <p>Connect your MCPSkins resource pack to browse and edit its skins.</p>
                <button type="button" class="mcpskins-primary" @click="command('configure')">Choose pack directory</button>
            </div>
            <template v-else>
                <p class="mcpskins-path" :title="s.directory">{{s.folder}} / {{s.namespace}}<br>{{s.directory}}</p>
                <p v-if="s.notice" class="mcpskins-notice" role="status">{{s.notice}}</p>
                <details v-if="s.warnings.length" class="mcpskins-warnings"><summary>{{s.warnings.length}} file(s) skipped</summary><p v-for="warning in s.warnings.slice(0, 10)">{{warning}}</p></details>
                <div class="mcpskins-gunpacks"><span class="mcpskins-muted" :title="s.gunPackDirectory">{{s.gunPackMessage || 'Discover default models and textures from installed TaCZ packs.'}}</span><button type="button" @click="command('configureGunPacks')">Gun Packs...</button><button type="button" @click="command('openRarities')">Rarities</button></div>
                <details v-if="s.gunPackWarnings.length" class="mcpskins-warnings"><summary>{{s.gunPackWarnings.length}} gun-pack warning(s)</summary><p v-for="warning in s.gunPackWarnings.slice(0, 20)">{{warning}}</p></details>
                <div class="mcpskins-workspace">
                    <section class="mcpskins-browser" aria-label="Skin browser">
                        <div class="mcpskins-filters">
                            <button type="button" class="mcpskins-secondary mcpskins-refresh-button" @click="command('refresh')" title="Refresh List" aria-label="Refresh List"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 0012 4a8 8 0 108 8h-2a6 6 0 11-1.76-4.24L13 11h9V2z"/></svg></button>
                            <input type="search" v-model="s.search" placeholder="Search skins…" aria-label="Search skins">
                            <select v-model="s.rarityFilter" aria-label="Filter by rarity"><option value="">All rarities</option><option v-for="rarity in rarities" :key="rarity.id" :value="rarity.id">{{rarity.name}}</option></select>
                            <select v-model="s.collectionFilter" aria-label="Filter by collection" title="Filter by collection"><option value="">All</option><option v-for="collection in collections" :key="collection" :value="collection">{{collection}}</option></select>
                        </div>
                        <div class="mcpskins-table-wrap" tabindex="0" aria-label="Skin list. Use arrow keys to navigate.">
                            <table class="mcpskins-table" aria-multiselectable="true" role="grid">
                                <thead><tr><th v-for="column in [['gun','Weapon'],['name','Skin'],['rarity','Rarity'],['collection','Collection'],['file','File'],['is_new','New'],['progress','Progress']]" :key="column[0]" :aria-sort="s.sortColumn === column[0] ? (s.descending ? 'descending' : 'ascending') : 'none'"><button type="button" @click="sort(column[0])">{{heading(column[0], column[1])}}</button></th></tr></thead>
                                <tbody><tr v-for="row in rows" :key="row.key" :data-skin-key="rowToken(row)" :class="{selected:s.selectedKeys.includes(row.key)}" :tabindex="tabRowKey === row.key ? 0 : -1" :aria-selected="s.selectedKeys.includes(row.key)" @click="select(row,$event)" @keydown.enter.prevent="select(row,$event)" @keydown.space.prevent="select(row,$event)" @contextmenu="context(row,$event)">
                                    <td>{{gun(row)}}</td><td>{{row.skin.name}}<span v-if="variantFlags.has(row.key)" class="mcpskins-status-flag mcpskins-variant-flag" :title="variantFlags.get(row.key)" :aria-label="variantFlags.get(row.key)" role="img"></span></td><td><span class="mcpskins-rarity-dot" :style="{background:rarityColor(row.skin.rarity)}"></span>{{rarityName(row.skin.rarity)}}</td><td>{{row.skin.collection}}</td><td :title="row.filename">{{filename(row)}}</td><td>{{row.skin.is_new ? 'Yes' : 'No'}}</td><td><span class="mcpskins-status-flag" :class="{'mcpskins-status-unset':!status(row)}" :style="{color:status(row) ? status(row).color : ''}" :title="status(row) ? status(row).label : 'No status'" :aria-label="status(row) ? status(row).label : 'No status'" role="img"></span>{{status(row) ? status(row).label : 'Unassigned'}}</td>
                                </tr></tbody>
                            </table>
                            <p v-if="!rows.length" class="mcpskins-empty">{{s.missing ? 'No skins directory yet. Save a new skin to create it.' : s.rows.length ? 'No skins match these filters.' : 'No skins found. Create a new skin to begin.'}}</p>
                        </div>
                        <footer class="mcpskins-browser-footer"><span class="mcpskins-muted">{{rows.length}} of {{s.rows.length}} skins · {{fileCount}} files<span v-if="s.selectedKeys.length"> / {{s.selectedKeys.length}} selected</span></span><div><button type="button" class="mcpskins-secondary" @click="command('newSkin')">New Skin</button></div></footer>
                    </section>
                    <section class="mcpskins-inspector" aria-label="Asset inspector">
                        <h3>Asset Inspector <span v-if="s.dirty" class="mcpskins-dirty">Unsaved</span></h3>
                        <p v-if="!s.active" class="mcpskins-muted">Select a skin or click New Skin.</p>
                        <template v-else>
                            <p v-if="bulk" class="mcpskins-muted">{{s.selectedKeys.length}} skins selected.<span v-if="hiddenSelectedCount"> {{hiddenSelectedCount}} selected skins are hidden by filters.</span> Mixed fields show different values. Only fields you change will be saved.</p>
                            <p v-if="s.duplicatePending" class="mcpskins-muted">Save this duplicate to copy its existing geometry and textures to the new ID. Variant and level links start empty.</p>
                            <div class="mcpskins-editor">
                                <form class="mcpskins-fields" @submit.prevent="command('save')">
                                    <section class="mcpskins-field-group" aria-label="Data">
                                        <h4 class="mcpskins-field-heading">Data</h4>
                                        <label><span>Weapon type <field-help name="Weapon type"></field-help> <span class="mcpskins-required" title="Required" aria-label="Required">*</span></span><select :value="s.draft.kind" :disabled="bulk || s.duplicatePending || !!s.selectedKey" @change="edit('kind',$event)"><option value="gun">Gun</option><option value="melee">Melee</option><option value="attachment">Attachment</option><option value="throwable">Throwable</option><option value="consumable">Consumable</option></select></label>
                                        <div class="mcpskins-weapon-field"><span>Weapon ID <field-help name="Weapon ID"></field-help> <span class="mcpskins-required" title="Required" aria-label="Required">*</span></span><weapon-picker :weapons="weaponOptions" :value="s.draft.weapon" :readonly="bulk || s.duplicatePending || !!s.selectedKey" @input="editWeapon" @commit="commitWeapon"></weapon-picker></div>
                                        <label><span>Skin ID <field-help name="Skin ID"></field-help> <span v-if="s.selectedKey && !s.duplicatePending" class="mcpskins-required" title="Required" aria-label="Required">*</span></span><input :disabled="bulk" :value="bulk ? '' : s.draft.id" @input="edit('id',$event)" placeholder="Leave empty to generate a new ID" spellcheck="false"></label>
                                    </section>
                                    <section class="mcpskins-field-group" aria-label="Skin">
                                        <h4 class="mcpskins-field-heading">Skin</h4>
                                        <label><span>Skin name <field-help name="Skin name"></field-help> <span class="mcpskins-required" title="Required" aria-label="Required">*</span></span> <span class="mcpskins-muted mcpskins-title">{{title}}</span><input aria-label="Skin name" :disabled="bulk" :value="bulk ? '' : s.draft.label" @input="edit('label',$event)"></label>
                                        <label class="mcpskins-check"><input type="checkbox" :disabled="bulk" :checked="s.draft.override_prefix" @change="edit('override_prefix',$event)"><span>Override name prefix <field-help name="Override name prefix"></field-help></span></label>
                                        <label v-if="s.draft.override_prefix"><span>Name prefix <field-help name="Name prefix"></field-help> <span class="mcpskins-required" title="Required" aria-label="Required">*</span></span><input :disabled="bulk" :value="s.draft.name_prefix" @input="edit('name_prefix',$event)" placeholder="Custom weapon name"></label>
                                        <label><span>Collection <field-help name="Collection"></field-help> <span class="mcpskins-required" title="Required" aria-label="Required">*</span></span><input :placeholder="bulk && s.mixed.collection ? 'Mixed values' : ''" :value="s.draft.collection" @input="edit('collection',$event)"></label>
                                        <label><span>Subtitle <field-help name="Subtitle"></field-help></span><span v-if="s.draft.invalid_subtitle" class="mcpskins-muted">Invalid saved value; edit to replace it.</span><input :placeholder="bulk && s.mixed.subtitle ? 'Mixed values' : '(Optional)'" :value="s.draft.subtitle" @input="edit('subtitle',$event)"></label>
                                        <label><span>Skin author <field-help name="Skin author"></field-help></span> <span v-if="s.draft.invalid_author || (!bulk && fileAuthor)" class="mcpskins-muted"><span v-if="s.draft.invalid_author"> Invalid saved value; edit to replace it.</span><span v-if="!bulk && fileAuthor"> File default: {{fileAuthor}}.</span></span><input :placeholder="bulk && s.mixed.author ? 'Mixed values' : '(Optional)'" :value="s.draft.author" @input="edit('author',$event)"></label>
                                        <label><span>Rarity <field-help name="Rarity"></field-help> <span class="mcpskins-required" title="Required" aria-label="Required">*</span></span><select :value="s.draft.rarity" @change="edit('rarity',$event)"><option v-if="bulk && s.mixed.rarity" value="" disabled>Mixed values</option><option v-for="rarity in rarities" :key="rarity.id" :value="rarity.id">{{rarity.name}}</option></select></label>
                                        <label><span>Label color <field-help name="Label color"></field-help> <span class="mcpskins-required" title="Required" aria-label="Required">*</span></span><div class="mcpskins-color"><button type="button" class="mcpskins-swatch" :style="{background: /^#[0-9a-f]{6}$/i.test(s.draft.color) ? s.draft.color : 'transparent'}" @click="command('pickColor')" aria-label="Choose label color"></button><input :placeholder="bulk && s.mixed.color ? 'Mixed values' : ''" :value="s.draft.color" @input="edit('color',$event)" aria-label="Label color hex" spellcheck="false"><button type="button" :disabled="bulk && s.mixed.rarity" title="Reset to the selected rarity color" @click="command('resetColor')">Reset</button><field-help name="Reset color"></field-help></div></label>
                                        <label><span>Description <field-help name="Description"></field-help> <span class="mcpskins-required" title="Required" aria-label="Required">*</span></span><textarea rows="3" :placeholder="bulk && s.mixed.description ? 'Mixed values' : ''" :value="s.draft.description" @input="edit('description',$event)"></textarea></label>
                                        <label class="mcpskins-check"><input type="checkbox" :indeterminate.prop="bulk && s.mixed.is_new" :checked="s.draft.is_new" @change="edit('is_new',$event)"><span>Mark as new <field-help name="Mark as new"></field-help></span><span v-if="bulk && s.mixed.is_new" class="mcpskins-muted">Mixed</span></label>
                                    </section>
                                    <details class="mcpskins-advanced">
                                        <summary>Advanced</summary>
                                        <div class="mcpskins-field-group">
                                            <label class="mcpskins-check"><input type="checkbox" :indeterminate.prop="bulk && s.mixed.limited" :checked="s.draft.limited" @change="edit('limited',$event)"><span>Limited Edition <field-help name="Limited Edition"></field-help></span><span v-if="s.draft.invalid_limited" class="mcpskins-muted">Invalid saved value; toggle to replace it.</span><span v-if="bulk && s.mixed.limited" class="mcpskins-muted">Mixed</span></label>
                                            <label><span>Locked text <field-help name="Locked text"></field-help></span> <span class="mcpskins-muted">(optional)</span><input :placeholder="bulk && s.mixed.locked_text ? 'Mixed values' : ''" :value="s.draft.locked_text" @input="edit('locked_text',$event)"></label>
                                            <label class="mcpskins-check"><input type="checkbox" :indeterminate.prop="bulk && s.mixed.unlocked" :checked="s.draft.unlocked" @change="edit('unlocked',$event)"><span>Unlocked by Default <field-help name="Unlocked by Default"></field-help></span><span v-if="bulk && s.mixed.unlocked" class="mcpskins-muted">Mixed</span></label>
                                            <label class="mcpskins-check"><input type="checkbox" :indeterminate.prop="bulk && s.mixed.include_weight" :checked="s.draft.include_weight" @change="edit('include_weight',$event)"><span>Override Fusion Weight <field-help name="Override Fusion Weight"></field-help></span><span v-if="bulk && s.mixed.include_weight" class="mcpskins-muted">Mixed</span></label>
                                            <label v-if="s.draft.include_weight"><span>Fusion weight <field-help name="Fusion weight"></field-help> <span class="mcpskins-required" title="Required" aria-label="Required">*</span></span><input type="number" min="1" step="1" :disabled="!s.draft.include_weight || (bulk && s.mixed.include_weight)" :placeholder="bulk && s.mixed.weight ? 'Mixed values' : ''" :value="s.draft.weight" @input="edit('weight',$event)"></label>
                                            <variant-editor v-if="!bulk" :variants="s.draft.variants" :levels="s.draft.levels" :candidates="variantCandidates" :owner="variantOwner" :invalid-variants="s.draft.invalid_variants" :invalid-levels="s.draft.invalid_levels" @variants="editVariants" @levels="editLevels"></variant-editor>
                                            <p v-else class="mcpskins-muted">Variants and level requirements are edited one skin at a time.</p>
                                        </div>
                                    </details>
                                    <div class="mcpskins-save"><button type="submit" class="mcpskins-primary" :disabled="bulk && !s.dirty">{{bulk ? 'Save Selected Skins' : 'Save Skin'}}</button><button type="button" @click="command('revert')">Discard Changes</button></div>
                                    <p class="mcpskins-muted">Only Save Skin writes registry changes. Model and texture edits use Blockbench’s save commands.</p>
                                </form>
                                <details v-if="!bulk" class="mcpskins-previews" open><summary>Textures</summary>
                                    <div class="mcpskins-asset-actions"><button type="button" :disabled="s.duplicatePending" @click="command('openModel')">Open Model</button><button type="button" @click="command('openFolder')">Open Folder</button></div>
                                    <figure v-for="card in s.previews" :key="card.kind"><figcaption>{{card.label}}</figcaption><div :class="['mcpskins-preview',card.kind]"><img v-if="card.source" :src="card.source" :alt="card.filename" @load="imageLoaded(card,$event)" @error="imageFailed(card)"><span v-else>{{card.message}}<small v-if="card.ratio" class="mcpskins-aspect">Recommended aspect ratio {{card.ratio}}</small></span></div><p class="mcpskins-muted">{{card.filename}}<br>{{card.dimensions}}</p></figure>
                                    <div class="mcpskins-asset-actions mcpskins-animation-action"><button type="button" :disabled="s.duplicatePending || !s.selectedKey" @click="command('openAnimatedTextures')" title="Open the native Flipbook Editor or import animation frames for a saved skin">Animated Textures (Advanced)</button></div>
                                </details>
                            </div>
                        </template>
                    </section>
                </div>
            </template>
            <footer class="mcpskins-theme"><label>Panel theme <select :value="s.theme" @change="changeTheme"><option v-for="theme in themes" :value="theme">{{theme}}</option></select></label><button type="button" @click="command('showShortcuts')" title="Show keyboard shortcuts">Keyboard Shortcuts</button></footer>
        </div>`
    };
}

module.exports = {panelComponent};
