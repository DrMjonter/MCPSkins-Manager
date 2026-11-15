'use strict';
const {isObject, clone, validateRegistry, baseWeapon, equalJSON, buildEntry, draftFromRow} = require('../domain/skin');
const {duplicateAssets} = require('../assets/preparation');
const {RARITIES} = require('../domain/constants');
const {readJSON, atomicJSON, isDirectory} = require('./files');

class RegistryRepository {
    constructor(fs, paths) { this.fs = fs; this.paths = paths; }
    read(filename) { return validateRegistry(readJSON(this.fs, filename), this.paths.path.basename(filename)); }
    discover() {
        const rows = [], warnings = [];
        const directory = this.paths.registryDirectory;
        if (!isDirectory(this.fs, directory)) return {rows, warnings, missing: true};
        const files = this.fs.readdirSync(directory).filter(n => n.endsWith('_skins.json'))
            .sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
        for (const name of files) {
            const filename = this.paths.path.join(directory, name);
            try {
                const data = this.read(filename);
                data.skins.forEach((skin, index) => {
                    if (isObject(skin)) rows.push({key: `${filename}\0${index}`, filename, data, index, skin: clone(skin)});
                });
            } catch (error) { warnings.push(error.message); }
        }
        return {rows, warnings, missing: false};
    }
    saveBatch(rows, draft, changedFields) {
        const allowed = {rarity: 'rarity', color: 'label_color', collection: 'collection', description: 'description',
            is_new: 'is_new', locked_text: 'locked_text', unlocked: 'unlocked', include_weight: 'weight', weight: 'weight'};
        const fields = [...new Set(changedFields)];
        if (fields.some(key => !Object.hasOwn(allowed, key))) throw new Error('Identity fields cannot be edited in bulk.');
        const patch = {};
        for (const key of fields) {
            let value = draft[key];
            if (['collection', 'description', 'locked_text'].includes(key)) {
                value = value.trim();
                if (key !== 'locked_text' && !value) throw new Error('Collection and description are required.');
            }
            if (key === 'rarity') {
                value = value.toLowerCase();
                if (!Object.hasOwn(RARITIES, value)) throw new Error('Choose a supported rarity.');
            }
            if (key === 'color') {
                if (!/^#[0-9a-f]{6}$/i.test(value.trim())) throw new Error('Use a six-digit label color.');
                value = '0x' + value.trim().slice(1).toUpperCase();
            }
            if (key === 'include_weight' || key === 'weight') {
                if (draft.include_weight) {
                    const text = String(draft.weight).trim();
                    if (!/^[0-9]+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 1) throw new Error('Weight must be a positive safe whole number.');
                    value = Number(text);
                } else value = undefined;
            }
            if ((key === 'locked_text' && !value) || (key === 'unlocked' && !value)) value = undefined;
            patch[allowed[key]] = value;
        }
        const groups = new Map();
        for (const row of rows) {
            if (!groups.has(row.filename)) {
                const data = this.read(row.filename);
                groups.set(row.filename, {data, original: clone(data)});
            }
            const {data} = groups.get(row.filename);
            if (baseWeapon(data) !== baseWeapon(row.data) || !equalJSON(data.skins[row.index], row.skin)) throw new Error('A selected entry changed on disk. Refresh Files before saving.');
            for (const [key, value] of Object.entries(patch)) {
                if (value === undefined) delete data.skins[row.index][key];
                else data.skins[row.index][key] = value;
            }
        }
        const written = [];
        try {
            if (fields.length) for (const [filename, group] of groups) {
                atomicJSON(this.fs, filename, group.data);
                written.push(filename);
            }
        } catch (error) {
            const failures = [];
            for (const filename of written.reverse()) {
                try { atomicJSON(this.fs, filename, groups.get(filename).original); }
                catch { failures.push(filename); }
            }
            if (failures.length) throw new Error(`${error.message} Some files could not be restored: ${failures.join(', ')}. Refresh Files to inspect them.`);
            throw error;
        }
        return {count: rows.length};
    }
    save(draft, selected = null, defaultPrefix = null, duplicate = null) {
        const {weapon, entry} = buildEntry(draft, selected ? selected.skin : duplicate ? duplicate.skin : null, defaultPrefix);
        const filename = selected ? selected.filename : this.paths.registry(weapon);
        let data;
        if (selected) {
            data = this.read(filename);
            if (selected.index >= data.skins.length || !equalJSON(data.skins[selected.index], selected.skin)) {
                throw new Error('This entry changed on disk. Refresh Files before saving.');
            }
            if (baseWeapon(data) !== weapon) throw new Error('The weapon ID cannot change during editing.');
        } else if (this.fs.existsSync(filename)) {
            data = this.read(filename);
            if (baseWeapon(data) !== weapon) throw new Error(`Weapon mismatch: this file belongs to ${baseWeapon(data)}.`);
        } else data = {[draft.kind === 'melee' ? 'base_melee' : 'base_gun']: weapon, skins: []};
        const index = selected ? selected.index : data.skins.length;
        if (data.skins.some((skin, i) => isObject(skin) && skin.id === entry.id && i !== index)) {
            throw new Error(`${entry.id} already exists in ${this.paths.path.basename(filename)}.`);
        }
        data.skins[index] = entry;
        this.fs.mkdirSync(this.paths.registryDirectory, {recursive: true});
        const created = duplicate ? duplicateAssets(this.fs, this.paths, draftFromRow(duplicate), draft) : [];
        try { atomicJSON(this.fs, filename, data); }
        catch (error) { for (const file of created) this.fs.unlinkSync(file); throw error; }
        return {filename, id: entry.id};
    }
}

module.exports = {RegistryRepository};
