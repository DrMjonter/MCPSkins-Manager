'use strict';
const {scanRarities} = require('./rarities');
const {atomicJSON, readJSON} = require('./files');
const {clone, equalJSON, isObject, validComponent} = require('../domain/skin');

function rarityDraft(record = null, order = 500) {
    const raw = record ? record.data : {}, effective = record || {id: '', name: '', color: '#FFFFFF', order};
    const targets = Array.isArray(raw.fuses_into) ? clone(raw.fuses_into) : [];
    const invalid = [];
    if (raw.fusable !== undefined && typeof raw.fusable !== 'boolean') invalid.push('fusable');
    if (raw.translation_key !== undefined && typeof raw.translation_key !== 'string') invalid.push('translation_key');
    if (raw.fuse_cost !== undefined && (!Number.isSafeInteger(raw.fuse_cost) || raw.fuse_cost < 1)) invalid.push('fuse_cost');
    if (raw.fuses_into !== undefined && typeof raw.fuses_into !== 'string' && !Array.isArray(raw.fuses_into)) invalid.push('targets');
    if (targets.some(target => !isObject(target) || typeof target.rarity !== 'string' || !Number.isSafeInteger(target.weight) || target.weight < 1)) invalid.push('targets');
    return {id: effective.id, name: effective.name, color: effective.color, order: String(effective.order),
        translation_key: typeof raw.translation_key === 'string' ? raw.translation_key : '',
        fusable: typeof raw.fusable === 'boolean' ? raw.fusable : true,
        override_cost: raw.fuse_cost !== undefined, fuse_cost: String(raw.fuse_cost ?? 5),
        fusion_mode: typeof raw.fuses_into === 'string' ? 'single' : Array.isArray(raw.fuses_into) ? 'weighted' : 'auto',
        target: typeof raw.fuses_into === 'string' ? raw.fuses_into : '',
        targets: targets.map(target => isObject(target) ? {...target, weight: String(target.weight)} : {rarity: '', weight: '1'}), invalid};
}

function buildRarity(draft, previous, available) {
    const id = draft.id.trim();
    if (!validComponent(id) || !/^[a-z0-9_.-]+$/.test(id)) throw new Error('Use a lowercase rarity ID with letters, numbers, underscores, dots, or hyphens.');
    if (draft.invalid.length) throw new Error('Correct the invalid saved fields: ' + draft.invalid.join(', ') + '.');
    if (!/^#[0-9a-f]{6}$/i.test(draft.color.trim())) throw new Error('Use a six-digit color, such as #FF4FD8.');
    const integer = (value, label, positive = false) => {
        const text = String(value).trim();
        if (!/^-?[0-9]+$/.test(text) || !Number.isSafeInteger(Number(text)) || (positive && Number(text) < 1)) throw new Error(label + ' must be a ' + (positive ? 'positive ' : '') + 'whole number within the safe range.');
        return Number(text);
    };
    const data = {...clone(previous || {}), color: draft.color.trim().toUpperCase(), order: integer(draft.order, 'Order'), fusable: draft.fusable};
    for (const key of ['name', 'translation_key']) {
        const value = draft[key].trim();
        if (value) data[key] = value; else delete data[key];
    }
    if (draft.override_cost) data.fuse_cost = integer(draft.fuse_cost, 'Fusion cost', true); else delete data.fuse_cost;
    const target = value => {
        if (typeof value !== 'string') throw new Error('Choose a fusion target.');
        const key = value.trim().toLowerCase();
        if (key !== id && !Object.hasOwn(available, key)) throw new Error('Choose an existing fusion target: ' + value + '.');
        return key;
    };
    if (draft.fusion_mode === 'auto') delete data.fuses_into;
    else if (draft.fusion_mode === 'single') data.fuses_into = target(draft.target);
    else if (draft.fusion_mode === 'weighted') data.fuses_into = draft.targets.map(row => ({...clone(row), rarity: target(row.rarity), weight: integer(row.weight, 'Target weight', true)}));
    else throw new Error('Choose a supported fusion mode.');
    return {id, data};
}

class RarityRepository {
    constructor(fs, paths) { this.fs = fs; this.paths = paths; }
    scan() { return scanRarities(this.fs, this.paths); }
    save(draft, selected = null) {
        const current = this.scan();
        if (selected && draft.id !== selected.id) throw new Error('Existing rarity IDs cannot be changed.');
        const {id, data} = buildRarity(draft, selected ? selected.data : {}, current.rarities);
        if (!selected && Object.hasOwn(current.rarities, id)) throw new Error('This rarity already exists. Select it in the list to edit it.');
        const namespace = selected ? selected.namespace : this.paths.namespace;
        if (!validComponent(namespace)) throw new Error('Invalid rarity namespace.');
        const directory = this.paths.inside(this.paths.folder, 'data', namespace, 'skin_rarities');
        const filename = selected && selected.filename ? selected.filename : this.paths.path.join(directory, id + '.json');
        if (this.paths.path.dirname(filename) !== directory) throw new Error('Rarity file is outside its namespace directory.');
        const definition = Object.hasOwn(current.definitions, id) ? current.definitions[id] : null;
        if (selected && selected.filename) {
            if (!definition || definition.filename !== filename || !equalJSON(readJSON(this.fs, filename), selected.data)) throw new Error('This rarity changed on disk. Reopen Rarities before saving.');
        } else if (definition || this.fs.existsSync(filename)) throw new Error('A rarity definition already exists. Reopen Rarities before saving.');
        this.fs.mkdirSync(directory, {recursive: true});
        atomicJSON(this.fs, filename, data);
        return {id, filename, data};
    }
}
module.exports = {RarityRepository, rarityDraft, buildRarity};
