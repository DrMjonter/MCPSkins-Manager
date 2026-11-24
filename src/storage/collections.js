'use strict';
const {readJSON, atomicJSON, isDirectory} = require('./files');
const {isObject, clone, equalJSON, BASE_KEYS, slugify} = require('../domain/skin');
const {collectionKey, validateCase, effectiveCase, caseOdds, buildCase} = require('../domain/collections');

function createJSON(fs, filename, data) {
    const temporary = filename + '.tmp';
    let owned = false;
    try {
        fs.writeFileSync(temporary, JSON.stringify(data,null,2) + '\n', {encoding:'utf8',flag:'wx'});
        owned = true;
        // COPYFILE_EXCL is 1; Blockbench's scoped filesystem does not expose constants.
        fs.copyFileSync(temporary,filename,1);
    } finally { if (owned) fs.unlinkSync(temporary); }
}

function scanCollections(fs, paths) {
    const definitions = new Map(), members = new Map(), registries = [], issues = [];
    const root = paths.path.join(paths.pack, 'data');
    const warn = (filename, message, severity = 'error') => issues.push({filename, message, severity});
    const walk = (directory, visit, depth = 0) => {
        if (!isDirectory(fs, directory)) return;
        if (depth > 16) throw new Error('Collection data folders are nested too deeply.');
        for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a,b) => a.name.localeCompare(b.name))) {
            const filename = paths.path.join(directory, entry.name);
            if (entry.isDirectory()) walk(filename, visit, depth + 1);
            else if (entry.isFile() && entry.name.endsWith('.json')) {
                try { visit(filename, readJSON(fs, filename)); } catch (error) { warn(filename, error.message); }
            }
        }
    };
    if (isDirectory(fs, root)) for (const namespace of fs.readdirSync(root, {withFileTypes:true}).filter(entry => entry.isDirectory())) {
        const base = paths.path.join(root, namespace.name);
        for (const folder of ['collection_cases', 'skins']) try {
            walk(paths.path.join(base, folder), (filename, data) => {
                if (folder === 'collection_cases') {
                    validateCase(data);
                    const key = collectionKey(data.collection), definition = {filename, data};
                    if (!definitions.has(key)) definitions.set(key, []);
                    definitions.get(key).push(definition);
                } else if (isObject(data) && Object.values(BASE_KEYS).some(key => Object.hasOwn(data,key))) {
                    if (!Array.isArray(data.skins)) throw new Error('Registry skins must be a list.');
                    registries.push({filename, data});
                    for (const skin of data.skins) if (isObject(skin) && typeof skin.collection === 'string' && skin.collection.trim() && !String(skin.id).startsWith('default:')) {
                        const key = collectionKey(skin.collection);
                        if (!members.has(key)) members.set(key, []);
                        members.get(key).push({skin, filename});
                    }
                }
            });
        } catch (error) { warn(paths.path.join(base, folder), error.message); }
    }
    for (const [key, entries] of definitions) if (entries.length > 1) for (const entry of entries) warn(entry.filename, 'Multiple case definitions target collection "' + key + '". Resolve the duplicate files before editing.');
    const keys = new Set(['*', ...members.keys(), ...definitions.keys()]);
    const rows = [...keys].map(key => {
        const definition = definitions.get(key)?.[0], skins = members.get(key) || [];
        return {key, name: definition ? definition.data.collection : skins[0]?.skin.collection.trim() || '*', filename: definition?.filename || '',
            data: definition?.data || {}, duplicate: (definitions.get(key)?.length || 0) > 1, members: skins,
            count: skins.length, title: definition?.data.title || ''};
    }).sort((a,b) => a.key === '*' ? -1 : b.key === '*' ? 1 : a.name.localeCompare(b.name));
    return {rows, definitions, registries, issues};
}
function collectionIssues(scan) {
    const issues = [...scan.issues];
    if (!scan.definitions.size) return issues;
    const global = scan.definitions.get('*')?.[0]?.data || {};
    const ids = new Set(scan.registries.flatMap(record => record.data.skins.filter(isObject).map(skin => skin.id)));
    for (const row of scan.rows) {
        if (row.key === '*') continue;
        const settings = effectiveCase(global, row.data), odds = caseOdds(row.members.map(member => member.skin), settings);
        const filename = row.filename || scan.definitions.get('*')?.[0]?.filename;
        if (!filename) continue;
        const add = message => issues.push({filename, severity:'warning', message: row.name + ': ' + message});
        if (!odds.eligible) add('Case has no eligible rewards with positive rarity weights.');
        for (const tier of odds.tiers) if (!tier.weight) add('Rarity "' + tier.rarity + '" has no positive case weight.');
    }
    for (const entries of scan.definitions.values()) for (const entry of entries) {
        for (const id of entry.data.excluded_skins || []) if (!ids.has(id)) issues.push({filename:entry.filename, severity:'warning', message:'Excluded skin does not exist in this pack: ' + id + '. It may belong to another installed pack.'});
    }
    return issues;
}
class CollectionRepository {
    constructor(fs, paths) { this.fs = fs; this.paths = paths; }
    scan() { return scanCollections(this.fs, this.paths); }
    save(draft, selected, baseline) {
        const current = this.scan(), data = buildCase(draft, selected?.data || {}), key = collectionKey(data.collection);
        const oldKey = selected?.key, renaming = selected && key !== oldKey;
        if (selected?.duplicate || current.definitions.get(oldKey)?.length > 1) throw new Error('Resolve duplicate collection case definitions before saving.');
        if (selected && (oldKey === '*') !== (key === '*')) throw new Error('Global Defaults cannot be renamed into a collection or vice versa.');
        if ((!selected || renaming) && current.rows.some(row => row.key === key)) throw new Error('That collection already exists. Select it in the list to edit it.');
        const old = oldKey && current.definitions.get(oldKey)?.[0];
        if (selected?.filename ? !old || old.filename !== selected.filename || !equalJSON(old.data, selected.data) : old) throw new Error('This collection changed on disk. Close and reopen Collections before saving.');
        const rename = selected && data.collection !== selected.name;
        if (rename && current.issues.some(issue => issue.severity === 'error')) throw new Error('Resolve collection or registry scan errors before renaming a collection.');
        if (rename && !equalJSON(current.rows.find(row => row.key === oldKey)?.members || [], selected.members)) throw new Error('Collection skins changed on disk. Close and reopen Collections before renaming.');
        if (rename && baseline && !equalJSON(current.registries, baseline.registries)) throw new Error('Skin registries changed on disk. Close and reopen Collections before renaming.');
        const directory = this.paths.inside(this.paths.folder, 'data', this.paths.namespace, 'collection_cases');
        let filename = selected?.filename;
        if (!filename) {
            this.fs.mkdirSync(directory, {recursive:true});
            const stem = key === '*' ? 'defaults' : slugify(data.collection) || 'collection';
            filename = this.paths.path.join(directory, stem + '.json');
            for (let suffix = 2; this.fs.existsSync(filename); suffix++) filename = this.paths.path.join(directory, stem + '_' + suffix + '.json');
        }
        const writes = [];
        if (rename) for (const record of current.registries) {
            const changed = clone(record.data); let count = 0;
            for (const skin of changed.skins) if (isObject(skin) && collectionKey(skin.collection) === oldKey) { skin.collection = data.collection; count++; }
            if (count) writes.push({filename:record.filename, data:changed, original:record.data});
        }
        writes.push({filename, data, original:selected?.filename ? selected.data : null});
        const written = [];
        try {
            for (const write of writes) {
                if (write.original === null) createJSON(this.fs,write.filename,write.data);
                else {
                    if (!equalJSON(readJSON(this.fs,write.filename),write.original)) throw new Error('A file changed on disk before saving. Reopen Collections.');
                    atomicJSON(this.fs,write.filename,write.data);
                }
                written.push(write);
            }
        } catch (error) {
            const failures = [];
            for (const write of written.reverse()) try {
                if (!equalJSON(readJSON(this.fs,write.filename),write.data)) throw new Error('Changed externally');
                if (write.original === null) this.fs.unlinkSync(write.filename); else atomicJSON(this.fs,write.filename,write.original);
            } catch { failures.push(write.filename); }
            throw new Error(error.message + (failures.length ? ' Could not restore: ' + failures.join(', ') : ''));
        }
        return {key, filename, renamed:rename,created:!selected};
    }
}
module.exports = {scanCollections, collectionIssues, CollectionRepository};
