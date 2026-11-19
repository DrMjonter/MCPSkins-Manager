'use strict';
const {rowStatus} = require('../domain/status');
const {defaultRarities, sortedRarities} = require('../domain/rarities');
const {emptyDraft, draftFromRow, baseWeapon, defaultColor, weaponPrefix, equalJSON, itemKind, normalizedWeapon} = require('../domain/skin');

class Manager {
    constructor() {
        this.repository = null;
        this.selected = null;
        this.selection = [];
        this.anchorKey = '';
        this.duplicateSource = null;
        this.state = {update: null, ready: false, dirty: false, active: false, root: '', folder: 'Example', namespace: 'example',
            gunPackItems: [], gunPackDirectory: '', gunPackMessage: '', gunPackWarnings: [], packMetadata: {title: 'Pack Name'}, directory: '', rows: [], selectedKey: '', selectedKeys: [], duplicatePending: false, mixed: {}, changedFields: [], draft: emptyDraft(), search: '', rarityFilter: '', collectionFilter: '',
            health: {status: 'checking', errors: 0, warnings: 0}, rarities: defaultRarities(), sortColumn: 'gun', descending: false, missing: false, warnings: [], previews: [], notice: '', theme: 'Blockbench', weaponNames: {}};
    }
    attach(repository, result = repository.discover()) {
        this.repository = repository;
        const p = repository.paths;
        Object.assign(this.state, {ready: true, root: p.root, folder: p.folder, namespace: p.namespace, directory: p.registryDirectory,
            rows: result.rows, warnings: result.warnings, missing: result.missing, rarities: result.rarities || defaultRarities(), rarityFilter: '', collectionFilter: '', health: {status: 'checking', errors: 0, warnings: 0}});
        this.clear(false);
    }
    reload() {
        const result = this.repository.discover();
        Object.assign(this.state, {rows: result.rows, warnings: result.warnings, missing: result.missing, rarities: result.rarities || defaultRarities()});
        if (!Object.hasOwn(this.state.rarities, this.state.rarityFilter)) this.state.rarityFilter = '';
        if (!this.collections().includes(this.state.collectionFilter)) this.state.collectionFilter = '';
        this.clear(false);
    }
    refreshRarities() {
        // Refresh definitions and scan warnings without replacing selections or unsaved drafts.
        const result = this.repository.discover();
        Object.assign(this.state, {rarities: result.rarities || defaultRarities(), warnings: result.warnings});
        if (!Object.hasOwn(this.state.rarities, this.state.rarityFilter)) this.state.rarityFilter = '';
    }
    clear(active = true) {
        this.selected = null;
        this.selection = [];
        this.anchorKey = '';
        this.duplicateSource = null;
        const draft = emptyDraft();
        draft.color = defaultColor(draft.rarity, this.state.rarities);
        Object.assign(this.state, {selectedKey: '', selectedKeys: [], duplicatePending: false, mixed: {}, changedFields: [], draft, dirty: false, active});
    }
    select(row) { this.anchorKey = row.key; this.selectRows([row]); }
    selectRows(rows) {
        this.selection = rows;
        this.selected = rows[0] || null;
        this.duplicateSource = null;
        const drafts = rows.map(row => this.draftForRow(row));
        const draft = drafts[0] || emptyDraft(), mixed = {};
        for (const key of Object.keys(draft)) mixed[key] = drafts.some(other => !equalJSON(other[key], draft[key]));
        if (rows.length > 1) for (const key of BULK_FIELDS) { if (mixed[key]) draft[key] = typeof draft[key] === 'boolean' ? false : ''; }
        Object.assign(this.state, {selectedKey: this.selected ? this.selected.key : '', selectedKeys: rows.map(row => row.key),
            draft, mixed, duplicatePending: false, changedFields: [], dirty: false, active: rows.length > 0});
    }
    selectionFor(row, event = {}) {
        const toggle = event.ctrlKey || event.metaKey;
        if (event.shiftKey) {
            const visible = this.filteredRows(), a = visible.findIndex(item => item.key === this.anchorKey), b = visible.findIndex(item => item.key === row.key);
            const range = a < 0 ? [row] : visible.slice(Math.min(a, b), Math.max(a, b) + 1);
            return toggle ? [...new Map([...this.selection, ...range].map(item => [item.key, item])).values()] : range;
        }
        if (toggle) return this.selection.some(item => item.key === row.key) ? this.selection.filter(item => item.key !== row.key) : [...this.selection, row];
        return [row];
    }
    duplicate(row) {
        this.clear();
        this.duplicateSource = row;
        const draft = this.draftForRow(row), original = draft.id;
        let suffix = '_copy', number = 2;
        const folder = this.repository.paths.textures(draft.weapon), path = this.repository.paths.path;
        const exists = id => (this.repository.paths.modelForSkin(draft.weapon, id, draft.kind) && this.repository.fs.existsSync(this.repository.paths.modelForSkin(draft.weapon, id, draft.kind))) || this.state.rows.some(item => item.filename === row.filename && item.skin.id === id)
            || ['.json', '.geo.json', '.png', '_n.png', '_s.png', '_hud.png', '_icon.png'].some(ext => this.repository.fs.existsSync(path.join(folder, id + ext)));
        while (exists(original + suffix)) suffix = `_copy_${number++}`;
        draft.variants = []; draft.levels = []; draft.invalid_variants = false; draft.invalid_levels = false;
        draft.id = original + suffix;
        draft.label += suffix === '_copy' ? ' Copy' : ` Copy ${number - 1}`;
        Object.assign(this.state, {draft, dirty: true, duplicatePending: true});
    }
    prefixFor(weapon) { return weaponPrefix(weapon, this.state.weaponNames); }
    draftForRow(row) {
        const draft = draftFromRow(row, this.state.rarities);
        draft.override_prefix = Boolean(draft.name_prefix && draft.name_prefix !== this.prefixFor(draft.weapon));
        return draft;
    }
    revert() { if (this.selection.length) this.selectRows(this.selection); else this.clear(); }
    edit(key, value) {
        if (this.selection.length > 1 && !BULK_FIELDS.includes(key)) return;
        this.state.draft[key] = value;
        if (['author', 'subtitle', 'limited'].includes(key)) this.state.draft['invalid_' + key] = false;
        if (key === 'variants') this.state.draft.invalid_variants = false;
        if (key === 'levels') this.state.draft.invalid_levels = false;
        const changed = new Set(this.state.changedFields);
        changed.add(key);
        if (key === 'rarity') changed.add('color');
        this.state.changedFields = [...changed];
        this.state.mixed = {...this.state.mixed, [key]: false, ...(key === 'rarity' ? {color: false} : {})};
        if (key === 'rarity') this.state.draft.color = defaultColor(value, this.state.rarities);
        if (key === 'override_prefix' && value && !this.state.draft.name_prefix) this.state.draft.name_prefix = this.prefixFor(this.state.draft.weapon);
        this.state.dirty = true;
    }
    save() {
        if (this.selection.length > 1) {
            const keys = this.state.selectedKeys.slice();
            const result = this.repository.saveBatch(this.selection, this.state.draft, this.state.changedFields);
            this.reload();
            this.selectRows(this.state.rows.filter(row => keys.includes(row.key)));
            return result;
        }
        const result = this.repository.save(this.state.draft, this.selected, this.prefixFor(this.state.draft.weapon), this.duplicateSource);
        this.reload();
        Object.assign(this.state, {search: '', rarityFilter: '', collectionFilter: ''});
        const row = this.state.rows.find(r => r.filename === result.filename && r.skin.id === result.id);
        if (row) this.select(row);
        return result;
    }
    siblingRows() {
        const draft = this.state.draft, source = this.selected || this.duplicateSource;
        return this.state.rows.filter(row => source ? row.filename === source.filename : baseWeapon(row.data) === normalizedWeapon(draft.weapon) && itemKind(row.data) === draft.kind);
    }
    variantOwner() {
        const id = this.selected ? this.selected.skin.id : this.state.draft.id;
        const parent = this.siblingRows().find(row => Array.isArray(row.skin.variants) && row.skin.variants.includes(id) && row.skin.id !== id);
        return parent ? String(parent.skin.name || parent.skin.id) : '';
    }
    variantCandidates() {
        const rows = this.siblingRows(), ownId = this.selected ? this.selected.skin.id : this.state.draft.id;
        const candidates = new Map();
        for (const row of rows) {
            const id = row.skin.id;
            if (typeof id !== 'string' || !id || id === ownId || id === this.state.draft.id) continue;
            const owner = rows.find(parent => parent.skin.id !== ownId && parent.skin.id !== id && Array.isArray(parent.skin.variants) && parent.skin.variants.includes(id));
            let reason = id.startsWith('default:') ? 'Default skin' : Array.isArray(row.skin.variants) && row.skin.variants.length ? 'Has its own variants' : owner ? 'Belongs to ' + String(owner.skin.name || owner.skin.id) : '';
            candidates.set(id, {id, name: String(row.skin.name || id), reason});
        }
        for (const id of this.state.draft.variants) if (typeof id === 'string' && !candidates.has(id)) candidates.set(id, {id, name: String(id), reason: 'Missing or unavailable in this file'});
        return [...candidates.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    collections() {
        return [...new Set(this.state.rows.map(row => typeof row.skin.collection === 'string' ? row.skin.collection.trim() : '').filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
    }
    filteredRows() {
        const s = this.state;
        const term = s.search.trim().toLowerCase();
        const rows = s.rows.filter(row => {
            const skin = row.skin;
            const text = [skin.name, skin.id, skin.collection, skin.description, skin.subtitle, skin.author ?? row.data.author,
                this.repository.paths.path.basename(row.filename), this.prefixFor(baseWeapon(row.data))].join(' ').toLowerCase();
            return (!term || text.includes(term)) && (!s.rarityFilter || String(skin.rarity ?? '').toLowerCase() === s.rarityFilter)
                && (!s.collectionFilter || String(skin.collection ?? '').trim() === s.collectionFilter);
        });
        const rarityRanks = new Map(sortedRarities(s.rarities).map((rarity, index) => [rarity.id, index]));
        const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
        const keys = row => {
            const gun = this.prefixFor(baseWeapon(row.data)).toLowerCase();
            const values = {gun, name: row.skin.name ?? '', rarity: row.skin.rarity ?? '',
                collection: row.skin.collection ?? '', is_new: row.skin.is_new ? 1 : 0, file: this.repository.paths.path.basename(row.filename)};
            const rarityRank = rarityRanks.get(String(row.skin.rarity ?? '').trim().toLowerCase()) ?? rarityRanks.size;
            const status = rowStatus(s.packMetadata, this.repository.paths, row);
            const progressRank = status ? ['Planned', 'WIP', 'Complete'].indexOf(status.label) : 3;
            const primary = s.sortColumn === 'rarity' ? rarityRank
                : s.sortColumn === 'progress' ? progressRank : String(values[s.sortColumn]).toLowerCase();
            return [primary, gun, String(row.skin.name ?? '').toLowerCase()];
        };
        return rows.sort((a, b) => {
            const ak = keys(a), bk = keys(b);
            return (compare(ak[0], bk[0]) || compare(ak[1], bk[1]) || compare(ak[2], bk[2])) * (s.descending ? -1 : 1);
        });
    }
    sort(column) {
        this.state.descending = this.state.sortColumn === column ? !this.state.descending : column === 'is_new';
        this.state.sortColumn = column;
    }
}

const BULK_FIELDS = ['author', 'subtitle', 'limited', 'rarity', 'color', 'collection', 'description', 'is_new', 'locked_text', 'unlocked', 'include_weight', 'weight'];

module.exports = {Manager, BULK_FIELDS};
