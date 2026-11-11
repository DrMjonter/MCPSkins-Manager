'use strict';
const {isObject, clone, validateRegistry, baseWeapon, equalJSON, buildEntry} = require('../domain/skin');
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
    save(draft, selected = null, defaultPrefix = null) {
        const {weapon, entry} = buildEntry(draft, selected && selected.skin, defaultPrefix);
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
        atomicJSON(this.fs, filename, data);
        return {filename, id: entry.id};
    }
}

module.exports = {RegistryRepository};
