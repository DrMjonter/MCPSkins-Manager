'use strict';
const {basename, slugify, isObject} = require('../domain/skin');
const {readJSON, isFile, isDirectory} = require('../storage/files');
const {parseJSONC} = require('../gunpacks/jsonc');
const {modelOutput} = require('../gunpacks/catalog');
const {animationCopies} = require('./animation');

function assetSelection(paths, draft) {
    const folder = paths.textures(draft.weapon);
    const gun = basename(draft.weapon.trim().toLowerCase());
    const id = draft.id.trim().toLowerCase() || (draft.label.trim() ? `${gun}_${slugify(draft.label.trim())}` : '');
    if (!/^[a-z0-9_]+$/.test(id)) throw new Error('Select a skin or enter a valid skin name/ID first.');
    return {folder, gun, id};
}

function modelForWeapon(fs, path, folder, gun) {
    for (const name of [`${gun}_geo.json`, `${gun}.geo.json`]) {
        const filename = path.join(folder, name);
        if (isFile(fs, filename)) return filename;
    }
    for (const name of fs.readdirSync(folder).filter(n => n.endsWith('.json')).sort()) {
        if (name.startsWith('.') || name.slice(0, -5).endsWith('_skins')) continue;
        const filename = path.join(folder, name);
        try {
            const data = readJSON(fs, filename);
            if (isObject(data) && Object.hasOwn(data, 'minecraft:geometry')) return filename;
        } catch { /* Continue past unrelated or malformed JSON. */ }
    }
    throw new Error(`No Bedrock geometry JSON found in ${folder}`);
}

function copyMissing(fs, source, output, created) {
    if (fs.existsSync(output)) return;
    try {
        // COPYFILE_EXCL is 1; the scoped Blockbench filesystem does not expose constants.
        fs.copyFileSync(source, output, 1);
        created.push(output);
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

function modelForEditing(fs, paths, draft, source = null, custom = false) {
    const {folder, id} = assetSelection(paths, draft);
    const reference = paths.path.join(folder, id + '.geo.json');
    if (source && source.editorOnly) {
        if (custom) throw new Error('Custom geometry overrides are not supported for this item type.');
        return reference;
    }
    const canonical = source ? modelOutput(paths, source.modelRef, id) : paths.modelForSkin(draft.weapon, id, draft.kind);
    if (custom && !canonical) throw new Error('Scan the weapon source pack before enabling a custom model.');
    return canonical && (custom || isFile(fs, canonical)) ? canonical : reference;
}

function prepareSkin(fs, paths, draft, source = null, options = {}) {
    if (source) return prepareFromGunPack(fs, paths, draft, source, options);
    const {folder, gun, id} = assetSelection(paths, draft);
    const path = paths.path;
    if (!isDirectory(fs, folder)) throw new Error(`Texture folder does not exist: ${folder}`);
    const texture = path.join(folder, `${id}.png`);
    let model = paths.modelForSkin(draft.weapon, id, draft.kind);
    if (!isFile(fs, model)) model = null;
    for (const name of [`${id}.json`, `${id}.geo.json`]) {
        const candidate = path.join(folder, name);
        if (!model && isFile(fs, candidate)) { model = candidate; break; }
    }
    let sourceModel;
    if (!model) {
        if (!id.startsWith(gun + '_') || id === gun + '_') throw new Error('The skin ID must start with the weapon basename and an underscore.');
        sourceModel = modelForWeapon(fs, path, folder, gun);
        model = path.join(folder, `${id}.geo.json`);
        if (path.resolve(sourceModel) === path.resolve(model)) throw new Error('Could not distinguish base geometry from skin geometry.');
    }
    const sourceTexture = path.join(folder, `${gun}.png`);
    if (!isFile(fs, texture) && !isFile(fs, sourceTexture)) throw new Error(`Missing skin texture ${id}.png and default texture ${gun}.png in ${folder}`);
    const created = [];
    const copies = sourceModel ? [[sourceModel, model], [sourceTexture, texture]] : [[sourceTexture, texture]];
    for (const [source, output] of copies) copyMissing(fs, source, output, created);
    // Give each skin independent maps; never import shared defaults for editing.
    const maps = {};
    for (const [kind, suffix] of [['normal', '_n'], ['specular', '_s']]) {
        const output = path.join(folder, `${id}${suffix}.png`);
        const source = path.join(folder, `${gun}${suffix}.png`);
        const enabled = kind === 'normal' ? options.createNormal !== false : options.createSpecular !== false;
        if (enabled && isFile(fs, source)) copyMissing(fs, source, output, created);
        maps[kind] = isFile(fs, output) ? output : null;
    }
    if (options.customModel) {
        const canonical = modelForEditing(fs, paths, draft, null, true);
        fs.mkdirSync(path.dirname(canonical), {recursive:true});
        copyMissing(fs, model, canonical, created);
        model = canonical;
    }
    return {model, texture, ...maps, created};
}

function prepareFromGunPack(fs, paths, draft, source, options = {}) {
    const {folder, gun, id} = assetSelection(paths, draft), path = paths.path;
    const model = modelForEditing(fs, paths, draft, source, !!options.customModel);
    const texture = path.join(folder, id + '.png');
    const pending = [];
    const add = (filename, read) => {
        if (fs.existsSync(filename)) {
            if (!isFile(fs, filename)) throw new Error('Asset destination is not a file: ' + filename);
            return;
        }
        const bytes = read();
        if (bytes !== null && bytes !== undefined) pending.push([filename, bytes]);
    };
    add(model, () => {
        const legacy = [path.join(folder, id + '.json'), path.join(folder, id + '.geo.json')].find(file => isFile(fs, file));
        const data = parseJSONC((legacy ? fs.readFileSync(legacy) : source.model()).toString('utf8'));
        if (!isObject(data) || !Array.isArray(data['minecraft:geometry']) || !data['minecraft:geometry'].length) throw new Error('The source is not a Bedrock geometry model.');
        return JSON.stringify(data, null, 2) + '\n';
    });
    add(texture, () => {
        const legacy = path.join(folder, gun + '.png');
        return isFile(fs, legacy) ? fs.readFileSync(legacy) : source.texture();
    });
    for (const [kind, suffix] of [['normal', '_n'], ['specular', '_s'], ['icon', '_icon'], ['hud', '_hud'], ['hud_empty', '_hud_empty'], ['lod', '_lod']]) {
        if ((kind === 'normal' && options.createNormal === false) || (kind === 'specular' && options.createSpecular === false)) continue;
        if (draft.kind !== 'gun' && kind.startsWith('hud')) continue;
        add(path.join(folder, id + suffix + '.png'), () => {
            const legacy = path.join(folder, gun + suffix + '.png');
            return isFile(fs, legacy) ? fs.readFileSync(legacy) : source[kind] ? source[kind]() : null;
        });
    }
    if (source.animation) add(texture + '.mcmeta', () => source.animation('.mcmeta'));
    // Read and validate every source first, then create independent, exclusive copies.
    const created = [];
    try {
        for (const [filename, bytes] of pending) {
            fs.mkdirSync(path.dirname(filename), {recursive: true});
            fs.writeFileSync(filename, bytes, {flag: 'wx'});
            created.push(filename);
        }
    } catch (error) {
        for (const filename of created.reverse()) fs.unlinkSync(filename);
        throw error;
    }
    return {model, texture, normal: isFile(fs, path.join(folder, id + '_n.png')) ? path.join(folder, id + '_n.png') : null,
        specular: isFile(fs, path.join(folder, id + '_s.png')) ? path.join(folder, id + '_s.png') : null, created};
}

function duplicateAssets(fs, paths, sourceDraft, targetDraft) {
    const source = assetSelection(paths, sourceDraft), target = assetSelection(paths, targetDraft);
    if (source.folder !== target.folder || source.id === target.id) throw new Error('Choose a different skin ID for the duplicate.');
    const copies = [];
    for (const extension of ['.json', '.geo.json', '.png', '_n.png', '_s.png', '_hud.png', '_icon.png', '_hud_empty.png', '_lod.png', '.png.mcmeta', '_n.png.mcmeta', '_s.png.mcmeta', '_hud.png.mcmeta', '_hud_empty.png.mcmeta', '_icon.png.mcmeta', '_lod.png.mcmeta']) {
        const from = paths.path.join(source.folder, source.id + extension), to = paths.path.join(target.folder, target.id + extension);
        if (fs.existsSync(to)) throw new Error(`Duplicate asset already exists: ${to}`);
        if (isFile(fs, from)) copies.push([from, to]);
    }
    const sourceModel = paths.modelForSkin(sourceDraft.weapon, source.id, sourceDraft.kind);
    const targetModel = paths.modelForSkin(targetDraft.weapon, target.id, targetDraft.kind);
    if (targetModel && fs.existsSync(targetModel)) throw new Error('Duplicate model already exists: ' + targetModel);
    if (sourceModel && targetModel && isFile(fs, sourceModel)) copies.push([sourceModel, targetModel]);
    const frames = animationCopies(fs, paths, source, target);
    const created = [];
    try {
        for (const [from, to] of copies) { fs.mkdirSync(paths.path.dirname(to), {recursive: true}); fs.copyFileSync(from, to, 1); created.push(to); }
        for (const [file, bytes] of frames) { fs.mkdirSync(paths.path.dirname(file), {recursive: true}); fs.writeFileSync(file, bytes, {flag: 'wx'}); created.push(file); }
    } catch (error) {
        for (const file of created) fs.unlinkSync(file);
        throw error;
    }
    return created;
}

module.exports = {assetSelection, modelForWeapon, modelForEditing, prepareSkin, duplicateAssets};
