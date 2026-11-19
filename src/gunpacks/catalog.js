'use strict';
const {parseJSONC} = require('./jsonc');
const {ArchiveCache, ZipPack, safeEntry, MAX_ENTRY} = require('./archive');
const {isDirectory} = require('../storage/files');
const {GUN_NAMES} = require('../domain/constants');

function resourcePath(reference, category, extension) {
    if (typeof reference !== 'string' || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(reference)) throw new Error('Invalid gun-pack resource reference: ' + reference);
    const [namespace, value] = reference.split(':');
    if (!safeEntry(namespace) || !safeEntry(value)) throw new Error('Unsafe resource reference: ' + reference);
    const path = value.endsWith(extension) ? value : value + extension;
    return 'assets/' + namespace + '/' + category + '/' + path;
}
function modelOutput(paths, reference, id) {
    const resource = resourcePath(reference, 'geo_models', '.json');
    if (!/^[a-z0-9_]+$/.test(id)) throw new Error('Invalid skin ID for model output.');
    return paths.inside(paths.folder, ...resource.slice(0, -5).split('/')) + '__skin_' + id + '.json';
}
const modelKey = (weapon, kind = 'gun') => kind + ':' + weapon.trim().toLowerCase();

class SourceConflict extends Error {
    constructor(resource, candidates) {
        super('More than one gun pack provides ' + resource + '. Choose its source.');
        this.resource = resource;
        this.candidates = candidates.map(candidate => ({id: candidate.source.id, name: candidate.source.name}));
    }
}
class GunPackCatalog {
    constructor(fs, path, directory, inflate, choices = {}, addonSources = []) {
        this.fs = fs; this.path = path; this.directory = path.resolve(directory); this.inflate = inflate;
        this.choices = {...choices}; this.providers = new Map(); this.items = []; this.warnings = []; this.sources = [];
        this.archives = new ArchiveCache(fs);
        this.addonSources = addonSources; this.addonArchives = [];
    }
    dispose() { this.archives.clear(); this.addonArchives.forEach(cache => cache.clear()); this.addonArchives = []; this.providers.clear(); this.items = []; this.sources = []; }
    scan() {
        const hasDirectory = isDirectory(this.fs, this.directory);
        if (!hasDirectory && !this.addonSources.length) throw new Error('TaCZ gun-pack directory does not exist: ' + this.directory);
        const entries = hasDirectory ? this.fs.readdirSync(this.directory).sort() : [];
        const roots = entries.includes('assets') || entries.includes('data') ? [''] : entries.filter(name => !name.startsWith('.'));
        for (const name of roots) {
            const filename = this.path.join(this.directory, name);
            try {
                if (isDirectory(this.fs, filename)) this.addFolder(filename);
                else if (/\.zip$/i.test(name)) this.addZip(filename);
            } catch (error) { this.warnings.push(name + ': ' + error.message); }
        }
        for (const source of this.addonSources) {
            try { this.addZip(source.filename, source.fs, source.addon); }
            catch (error) { this.warnings.push(this.path.basename(source.filename) + ': ' + error.message); }
        }
        for (const [resource, candidates] of this.providers) {
            const match = /^data\/([^/]+)\/index\/(guns|attachments|melee|throwables?|consumables?)\/(.+)\.json$/.exec(resource);
            if (!match) continue;
            const id = match[1] + ':' + match[3], kind = {guns: 'gun', attachments: 'attachment', melee: 'melee', throwable: 'throwable', throwables: 'throwable', consumable: 'consumable', consumables: 'consumable'}[match[2]];
            try {
                const candidate = candidates[0], data = parseJSONC(this.read(candidate).toString('utf8'));
                const language = this.providers.get('assets/' + match[1] + '/lang/en_us.json');
                let name = typeof data.name === 'string' ? data.name : '';
                if (language) {
                    try {
                        const entry = language.find(entry => entry.source === candidate.source) || language[0];
                        name = parseJSONC(this.read(entry).toString('utf8'))[name] || name;
                    } catch { /* A missing translation does not block discovery. */ }
                }
                if (kind === 'gun' && id.startsWith('tacz:') && Object.hasOwn(GUN_NAMES, id.slice(5))) name = GUN_NAMES[id.slice(5)];
                if (typeof name !== 'string' || !name || name.includes('.')) name = match[3].split('/').pop().replace(/_/g, ' ');
                if (!this.items.some(item => item.id === id && item.kind === kind)) this.items.push({id, kind, name, resource});
            } catch (error) { this.warnings.push(resource + ': ' + error.message); }
        }
        this.items.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        this.archives.clear(); this.addonArchives.forEach(cache => cache.clear());
        return this;
    }
    register(source, resource, entry) {
        if (!/^(assets|data)\//.test(resource) || !safeEntry(resource)) return;
        if (!this.providers.has(resource)) this.providers.set(resource, []);
        this.providers.get(resource).push({source, entry});
    }
    addFolder(filename) {
        const source = {id: filename, name: this.path.basename(filename), type: 'folder'};
        const files = []; let count = 0;
        const walk = (directory, relative, depth) => {
            if (depth > 32) throw new Error('Gun-pack folder is nested too deeply.');
            for (const name of this.fs.readdirSync(directory).sort()) {
                if (name.startsWith('.')) continue;
                if (++count > 100000) throw new Error('Gun pack contains too many files.');
                const full = this.path.join(directory, name), resource = relative ? relative + '/' + name : name;
                if (!safeEntry(resource)) continue;
                if (isDirectory(this.fs, full)) walk(full, resource, depth + 1);
                else files.push(resource);
            }
        };
        for (const category of ['data', 'assets']) if (isDirectory(this.fs, this.path.join(filename, category))) walk(this.path.join(filename, category), category, 0);
        if (!files.length) return;
        this.sources.push(source);
        for (const resource of files) this.register(source, resource, this.path.join(filename, ...resource.split('/')));
    }
    addZip(filename, fs = this.fs, addon = '') {
        const cache = fs === this.fs ? this.archives : new ArchiveCache(fs);
        if (cache !== this.archives) this.addonArchives.push(cache);
        const zip = new ZipPack(cache, filename, this.inflate);
        const source = {id: filename, name: this.path.basename(filename), type: 'zip', zip, addon};
        const seen = new Set(), entries = [];
        for (const entry of zip.entries.keys()) {
            const match = /^(?:[^/]+\/)?((?:assets|data)\/.+)$/.exec(entry);
            if (!match) continue;
            if (seen.has(match[1])) throw new Error('Archive contains duplicate resource roots.');
            seen.add(match[1]); entries.push([match[1], entry]);
        }
        if (!entries.length) return;
        this.sources.push(source);
        for (const [resource, entry] of entries) this.register(source, resource, entry);
    }
    read(candidate) {
        if (candidate.source.type === 'zip') return candidate.source.zip.read(candidate.entry);
        if (this.fs.statSync(candidate.entry).size > MAX_ENTRY) throw new Error('Gun-pack asset exceeds the 64 MB limit.');
        return this.fs.readFileSync(candidate.entry);
    }
    select(resource, preferred = null, optional = false) {
        const candidates = this.providers.get(resource) || [];
        if (!candidates.length) {
            if (optional) return null;
            throw new Error('Gun-pack resource not found: ' + resource);
        }
        const selected = candidates.find(candidate => candidate.source.id === this.choices[resource])
            || candidates.find(candidate => candidate.source.id === preferred);
        if (selected) return selected;
        if (candidates.length === 1) return candidates[0];
        const first = this.read(candidates[0]);
        if (candidates.slice(1).every(candidate => {
            const bytes = this.read(candidate);
            return bytes.length === first.length && bytes.every((byte, i) => byte === first[i]);
        })) return candidates[0];
        throw new SourceConflict(resource, candidates);
    }
    resolve(weapon, kind = 'gun') {
        const displayFolder = {gun: 'guns', attachment: 'attachments', melee: 'melee', throwable: 'throwable', consumable: 'consumable'};
        if (!Object.hasOwn(displayFolder, kind)) return null;
        const editorOnly = !['gun', 'attachment'].includes(kind);
        const item = this.items.find(item => item.id === weapon.trim().toLowerCase() && item.kind === kind);
        if (!item) return null;
        const index = this.select(item.resource), data = parseJSONC(this.read(index).toString('utf8'));
        const displayReference = editorOnly && data.display === undefined ? item.id : data.display;
        const displayResource = resourcePath(displayReference, 'display/' + displayFolder[kind], '.json');
        const displayEntry = this.select(displayResource, index.source.id);
        let display;
        try { display = parseJSONC(this.read(displayEntry).toString('utf8')); }
        catch (error) { throw new Error('Cannot read ' + displayResource + ' from ' + displayEntry.source.name + ': ' + error.message); }
        const get = (reference, category, extension, optional = false) => reference ? this.select(resourcePath(reference, category, extension), displayEntry.source.id, optional) : null;
        const model = get(display.model, 'geo_models', '.json'), texture = get(display.texture, 'textures', '.png');
        if (!model || !texture) throw new Error((kind === 'attachment' ? 'This attachment has no standalone model and UV texture to open. ' : 'Item display must define a model and texture. ') + displayResource);
        const texturePath = resourcePath(display.texture, 'textures', '.png');
        const read = entry => entry ? this.read(entry) : null;
        return {modelRef: display.model, editorOnly, source: index.source.name, model: () => read(model), texture: () => read(texture),
            normal: () => read(this.select(texturePath.slice(0, -4) + '_n.png', texture.source.id, true)),
            specular: () => read(this.select(texturePath.slice(0, -4) + '_s.png', texture.source.id, true)),
            icon: () => read(get(editorOnly ? display.slot_texture || display.slot : display.slot, 'textures', '.png', true)),
            hud: () => kind === 'gun' ? read(get(display.hud, 'textures', '.png', true)) : null,
            hud_empty: () => kind === 'gun' ? read(get(display.hud_empty, 'textures', '.png', true)) : null,
            lod: () => read(get(display.lod && display.lod.texture, 'textures', '.png', true)),
            animation: suffix => read(this.select(texturePath + suffix, texture.source.id, true))};
    }
}
module.exports = {GunPackCatalog, SourceConflict, resourcePath, modelOutput, modelKey};
