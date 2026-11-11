'use strict';
const {basename, slugify, isObject} = require('../domain/skin');
const {readJSON, isFile, isDirectory} = require('../storage/files');

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

function prepareSkin(fs, paths, draft) {
    const {folder, gun, id} = assetSelection(paths, draft);
    const path = paths.path;
    if (!isDirectory(fs, folder)) throw new Error(`Texture folder does not exist: ${folder}`);
    const texture = path.join(folder, `${id}.png`);
    let model;
    for (const name of [`${id}.json`, `${id}.geo.json`]) {
        const candidate = path.join(folder, name);
        if (isFile(fs, candidate)) { model = candidate; break; }
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
        if (isFile(fs, source)) copyMissing(fs, source, output, created);
        maps[kind] = isFile(fs, output) ? output : null;
    }
    return {model, texture, ...maps, created};
}

module.exports = {assetSelection, modelForWeapon, prepareSkin};
