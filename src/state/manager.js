'use strict';
const {emptyDraft, draftFromRow, baseWeapon, defaultColor, weaponPrefix} = require('../domain/skin');

class Manager {
    constructor() {
        this.repository = null;
        this.selected = null;
        this.state = {ready: false, dirty: false, active: false, root: '', folder: 'Example', namespace: 'example',
            directory: '', rows: [], selectedKey: '', draft: emptyDraft(), search: '', rarityFilter: '',
            sortColumn: 'gun', descending: false, missing: false, warnings: [], previews: [], notice: '', theme: 'Blockbench', weaponNames: {}};
    }
    attach(repository, result = repository.discover()) {
        this.repository = repository;
        const p = repository.paths;
        Object.assign(this.state, {ready: true, root: p.root, folder: p.folder, namespace: p.namespace, directory: p.registryDirectory,
            rows: result.rows, warnings: result.warnings, missing: result.missing});
        this.clear(false);
    }
    reload() {
        const result = this.repository.discover();
        Object.assign(this.state, {rows: result.rows, warnings: result.warnings, missing: result.missing});
        this.clear(false);
    }
    clear(active = true) {
        this.selected = null;
        Object.assign(this.state, {selectedKey: '', draft: emptyDraft(), dirty: false, active});
    }
    select(row) {
        this.selected = row;
        Object.assign(this.state, {selectedKey: row.key, draft: this.draftForRow(row), dirty: false, active: true});
    }
    prefixFor(weapon) { return weaponPrefix(weapon, this.state.weaponNames); }
    draftForRow(row) {
        const draft = draftFromRow(row);
        draft.override_prefix = Boolean(draft.name_prefix && draft.name_prefix !== this.prefixFor(draft.weapon));
        return draft;
    }
    revert() { if (this.selected) this.select(this.selected); else this.clear(); }
    edit(key, value) {
        this.state.draft[key] = value;
        if (key === 'rarity') this.state.draft.color = defaultColor(value);
        if (key === 'override_prefix' && value && !this.state.draft.name_prefix) this.state.draft.name_prefix = this.prefixFor(this.state.draft.weapon);
        this.state.dirty = true;
    }
    save() {
        const result = this.repository.save(this.state.draft, this.selected, this.prefixFor(this.state.draft.weapon));
        this.reload();
        Object.assign(this.state, {search: '', rarityFilter: ''});
        const row = this.state.rows.find(r => r.filename === result.filename && r.skin.id === result.id);
        if (row) this.select(row);
        return result;
    }
    filteredRows() {
        const s = this.state;
        const term = s.search.trim().toLowerCase();
        const rows = s.rows.filter(row => {
            const skin = row.skin;
            const text = [skin.name, skin.id, skin.collection, skin.description,
                this.repository.paths.path.basename(row.filename), this.prefixFor(baseWeapon(row.data))].join(' ').toLowerCase();
            return (!term || text.includes(term)) && (!s.rarityFilter || String(skin.rarity ?? '').toLowerCase() === s.rarityFilter);
        });
        const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
        const keys = row => {
            const gun = this.prefixFor(baseWeapon(row.data)).toLowerCase();
            const values = {gun, name: row.skin.name ?? '', rarity: row.skin.rarity ?? '',
                collection: row.skin.collection ?? '', file: this.repository.paths.path.basename(row.filename)};
            return [String(values[s.sortColumn]).toLowerCase(), gun, String(row.skin.name ?? '').toLowerCase()];
        };
        return rows.sort((a, b) => {
            const ak = keys(a), bk = keys(b);
            return (compare(ak[0], bk[0]) || compare(ak[1], bk[1]) || compare(ak[2], bk[2])) * (s.descending ? -1 : 1);
        });
    }
    sort(column) {
        this.state.descending = this.state.sortColumn === column ? !this.state.descending : false;
        this.state.sortColumn = column;
    }
}

module.exports = {Manager};
