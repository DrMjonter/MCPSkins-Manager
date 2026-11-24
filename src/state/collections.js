'use strict';
const {caseDraft, buildCase, effectiveCase, caseOdds, collectionKey} = require('../domain/collections');
const {collectionIssues} = require('../storage/collections');
class CollectionEditor {
    constructor(repository, rarities, confirm, saved, active = () => true, canRename = () => true) {
        Object.assign(this, {repository, rarities, confirm, saved, active, canRename, selected:null});
        this.state = {rows:[], warnings:[], search:'', selectedKey:'', active:false, draft:caseDraft(null,rarities), dirty:false, busy:false, error:'', notice:''};
        this.load();
    }
    load(key = '') {
        this.scan = this.repository.scan();
        this.availableRarities = {...this.rarities};
        for (const id of Object.keys(this.scan.definitions.get('*')?.[0]?.data.rarity_weights || {})) {
            if (!Object.hasOwn(this.availableRarities,id)) this.availableRarities[id] = {id};
        }
        this.state.rows = this.scan.rows;
        this.state.warnings = collectionIssues(this.scan).map(issue => issue.message);
        if (key) this.pick(this.scan.rows.find(row => row.key === key));
    }
    pick(row) {
        this.selected = row || null;
        Object.assign(this.state, {selectedKey:row?.key || '', active:!!row, draft:caseDraft(row,this.availableRarities), dirty:false,error:'',notice:''});
    }
    async guard(action) {
        if (this.state.busy) return false;
        this.state.busy = true;
        try {
            if (this.state.dirty) {
                const choice = await this.confirm();
                if (choice === 'cancel' || (choice === 'save' && !this.save())) return false;
            }
            action(); return true;
        } finally { this.state.busy = false; }
    }
    select(key) { return this.guard(() => this.pick(this.state.rows.find(row => row.key === key))); }
    create() { return this.guard(() => { this.pick(null); this.state.active = true; }); }
    edit(key,value) { this.state.draft[key] = value; Object.assign(this.state,{dirty:true,error:'',notice:''}); }
    weight(index,value) { this.edit('weights',this.state.draft.weights.map((row,i) => i === index ? {...row,value} : row)); }
    exclude(id,checked) {
        const ids = new Set(this.state.draft.exclusions.split(/[\r\n,]+/).map(value => value.trim()).filter(Boolean));
        if (checked) ids.add(id); else ids.delete(id);
        this.edit('exclusions',[...ids].join('\n'));
    }
    preview() {
        try {
            const data = buildCase(this.state.draft,this.selected?.data || {}), key = collectionKey(data.collection);
            const global = this.scan.definitions.get('*')?.[0]?.data || {};
            const settings = effectiveCase(key === '*' ? {} : global,data);
            const members = this.selected?.members || this.scan.rows.find(row => row.key === key)?.members || [];
            return {settings, odds:caseOdds(members.map(member => member.skin),settings), error:''};
        } catch (error) { return {settings:null,odds:null,error:error.message}; }
    }
    discard() { if (this.selected) this.pick(this.selected); else { this.pick(null); this.state.active = true; } }
    save() {
        try {
            if (!this.active()) throw new Error('The selected pack changed or has unsaved skin edits. Save those edits and reopen Collections.');
            if(this.selected && this.state.draft.collection.trim()!==this.selected.name && !this.canRename()) throw new Error('Save or discard your skin edits before renaming a collection.');
            const result = this.repository.save(this.state.draft,this.selected,this.scan);
            this.load(result.key); this.saved(result); this.state.notice = result.renamed ? 'Collection and matching skin entries renamed.' : 'Collection saved.';
            return true;
        } catch(error) { this.state.error = error.message; return false; }
    }
}
module.exports = {CollectionEditor};
