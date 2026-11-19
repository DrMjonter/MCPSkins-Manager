'use strict';
const {sortedRarities} = require('../domain/rarities');
const {rarityDraft} = require('../storage/rarity-editor');

class RarityEditor {
    constructor(repository, confirm, saved, active = () => true) {
        this.repository = repository; this.confirm = confirm; this.saved = saved; this.active = active; this.selected = null;
        this.state = {rows: [], warnings: [], search: '', selectedId: '', draft: rarityDraft(), active: false, dirty: false, busy: false, error: '', notice: ''};
        this.load();
    }
    load(id = '') {
        const scan = this.repository.scan();
        this.state.rows = sortedRarities(scan.rarities).map(rarity => {
            const source = Object.hasOwn(scan.definitions, rarity.id) ? scan.definitions[rarity.id] : null;
            return {...rarity, filename: source ? source.filename : '', namespace: source ? source.namespace : this.repository.paths.namespace, data: source ? source.data : {}};
        });
        this.state.warnings = scan.warnings.map(warning => warning.message);
        if (id) this.pick(this.state.rows.find(row => row.id === id));
    }
    pick(row) {
        this.selected = row || null;
        Object.assign(this.state, {selectedId: row ? row.id : '', draft: rarityDraft(row), active: !!row, dirty: false, error: '', notice: ''});
    }
    async guard(action) {
        if (this.state.busy) return false;
        this.state.busy = true;
        try {
            if (this.state.dirty) {
                const choice = await this.confirm();
                if (choice === 'cancel') return false;
                if (choice === 'save' && !this.save()) return false;
            }
            action(); return true;
        } finally { this.state.busy = false; }
    }
    select(id) { return this.guard(() => this.pick(this.state.rows.find(row => row.id === id))); }
    create() {
        return this.guard(() => {
            const order = Math.max(400, ...this.state.rows.map(row => row.order)) + 100;
            this.selected = null;
            Object.assign(this.state, {selectedId: '', draft: rarityDraft(null, Number.isSafeInteger(order) ? order : 500), active: true, dirty: false, error: '', notice: ''});
        });
    }
    edit(key, value) {
        const clear = key === 'override_cost' ? 'fuse_cost' : ['fusion_mode', 'target', 'targets'].includes(key) ? 'targets' : key;
        this.state.draft[key] = value;
        this.state.draft.invalid = this.state.draft.invalid.filter(field => field !== clear);
        Object.assign(this.state, {dirty: true, error: '', notice: ''});
    }
    addTarget() { this.edit('targets', [...this.state.draft.targets, {rarity: '', weight: '1'}]); }
    editTarget(index, key, value) { this.edit('targets', this.state.draft.targets.map((row, i) => i === index ? {...row, [key]: value} : row)); }
    removeTarget(index) { this.edit('targets', this.state.draft.targets.filter((_row, i) => i !== index)); }
    discard() {
        if (this.selected) this.pick(this.selected);
        else Object.assign(this.state, {draft: rarityDraft(), dirty: false, error: '', notice: ''});
    }
    save() {
        try {
            if (!this.active()) throw new Error('The selected pack changed. Close this window and reopen Rarities.');
            const result = this.repository.save(this.state.draft, this.selected);
            this.load(result.id); this.saved(); this.state.notice = 'Rarity saved.';
            return true;
        } catch (error) { this.state.error = error.message; return false; }
    }
}
module.exports = {RarityEditor};
