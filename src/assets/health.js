'use strict';
const {isObject, baseWeapon, validWeapon, basename, BASE_KEYS, itemKind} = require('../domain/skin');
const {loadPackMetadata, metadataFile} = require('../storage/pack-metadata');
const {variantIssues} = require('../domain/variants');
const {scanRarities} = require('../storage/rarities');
const {readJSON, isFile, isDirectory} = require('../storage/files');

function checkPack(fs, paths) {
    const issues = [];
    let files = 0, skins = 0;
    const add = (severity, message, filename, row = null) => issues.push({severity, message, filename,
        rowKey: row ? row.key : '', skinId: row ? String(row.skin.id ?? '') : '', registry: row ? row.filename : filename});
    const {rarities, warnings: rarityWarnings} = scanRarities(fs, paths);
    for (const warning of rarityWarnings) add('warning', warning.message, warning.filename);
    let metadata = {};
    try { metadata = loadPackMetadata(fs, paths); } catch (error) { add('error', `Invalid pack metadata: ${error.message}`, metadataFile(paths)); }
    if (!isDirectory(fs, paths.registryDirectory)) {
        add('error', 'The skins registry directory is missing.', paths.registryDirectory);
        return {issues, files, skins};
    }
    for (const name of fs.readdirSync(paths.registryDirectory).filter(name => name.endsWith('.json')).sort()) {
        const filename = paths.path.join(paths.registryDirectory, name);
        files++;
        let data;
        try {
            data = readJSON(fs, filename);
            if (!name.endsWith('_skins.json') && (!isObject(data) || !Object.values(BASE_KEYS).some(key => Object.hasOwn(data, key)))) { files--; continue; }
            if (!isObject(data) || !Array.isArray(data.skins) || !validWeapon(baseWeapon(data) || '')) throw new Error('Expected a namespaced base_gun/base_melee and a skins list.');
            if (Object.values(BASE_KEYS).filter(key => Object.hasOwn(data, key)).length !== 1) throw new Error('Registry must contain exactly one base item key.');
        } catch (error) { add('error', error.message, filename); continue; }
        const weapon = baseWeapon(data);
        const family = itemKind(data);
        if (data.author !== undefined && typeof data.author !== 'string') add('error', 'File author must be text.', filename);
        for (const problem of variantIssues(data.skins)) {
            const row = {key: `${filename}\0${problem.index}`, filename, skin: data.skins[problem.index]};
            add('error', problem.message, filename, row);
        }
        const ids = new Set();
        data.skins.forEach((skin, index) => {
            if (!isObject(skin)) { add('error', `Entry ${index + 1} is not a skin object.`, filename); return; }
            skins++;
            const row = {key: `${filename}\0${index}`, filename, data, index, skin};
            const issue = (severity, message, file = filename) => add(severity, message, file, row);
            for (const field of ['author', 'subtitle']) if (skin[field] !== undefined && typeof skin[field] !== 'string') issue('error', field + ' must be text.');
            if (skin.limited !== undefined && typeof skin.limited !== 'boolean') issue('error', 'limited must be true or false.');
            if (typeof skin.id !== 'string' || !/^[a-z0-9_]+$/.test(skin.id)) { issue('error', 'Skin ID is missing or invalid.'); return; }
            if (ids.has(skin.id)) issue('error', `Duplicate skin ID: ${skin.id}.`);
            ids.add(skin.id);
            for (const field of ['name', 'collection', 'description']) if (typeof skin[field] !== 'string' || !skin[field].trim()) issue('error', `Missing ${field}.`);
            if (!Object.hasOwn(rarities, String(skin.rarity ?? '').toLowerCase())) issue('error', 'Unsupported rarity.');
            if (skin.label_color !== undefined && !/^(0x|#)[0-9a-f]{6}$/i.test(String(skin.label_color))) issue('warning', 'Label color is not a six-digit RGB value.');
            if (skin.weight !== undefined && (!Number.isSafeInteger(skin.weight) || skin.weight < 1)) issue('error', 'Fusion weight must be a positive whole number.');
            let folder;
            try { folder = paths.textures(weapon); } catch (error) { issue('error', error.message); return; }
            const asset = suffix => paths.path.join(folder, skin.id + suffix);
            let canonical = null;
            try { canonical = paths.modelForSkin(weapon, skin.id, family, metadata.weapon_models || {}); } catch (error) { issue('error', error.message); }
            const models = (canonical && isFile(fs, canonical) ? [canonical] : [asset('.json'), asset('.geo.json')]).filter(file => isFile(fs, file));
            if (!models.length) issue('warning', 'Skin geometry is missing; Open Model can create it if a source model is available.', asset('.geo.json'));
            for (const model of models) {
                try {
                    const geo = readJSON(fs, model);
                    if (!isObject(geo) || !Array.isArray(geo['minecraft:geometry']) || !geo['minecraft:geometry'].length) throw new Error('Expected a nonempty minecraft:geometry list.');
                } catch (error) { issue('error', `Invalid geometry: ${error.message}`, model); }
            }
            for (const [kind, suffix, required] of [['Skin', '', true], ['Normal', '_n', false], ['Specular', '_s', false], ['HUD', '_hud', false], ['Icon', '_icon', false]]) {
                if (family !== 'gun' && suffix === '_hud') continue;
                const file = asset(suffix + '.png');
                if (!isFile(fs, file)) {
                    if (required) issue('error', 'Skin texture is missing.', file);
                    else if (kind === 'HUD' || kind === 'Icon') issue('warning', `${kind} texture is missing (optional).`, file);
                    else if (isFile(fs, paths.path.join(folder, basename(weapon) + suffix + '.png'))) issue('warning', `${kind} skin map is missing; a default map is available.`, file);
                    continue;
                }
                try {
                    const bytes = fs.readFileSync(file);
                    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
                    if (bytes.length < 24 || signature.some((value, i) => bytes[i] !== value) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('Invalid PNG header.');
                    const integer = offset => bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3];
                    const width = integer(16), height = integer(20);
                    if (!width || !height) throw new Error('Invalid image dimensions.');
                    if ((kind === 'HUD' && width !== height * 3) || (kind === 'Icon' && width !== height)) issue('warning', `${kind} aspect ratio should be ${kind === 'HUD' ? '3:1' : '1:1'}; found ${width} x ${height}.`, file);
                } catch (error) { issue('error', `${kind} texture: ${error.message}`, file); }
            }
        });
    }
    if (!files) add('warning', 'No skin registry files found.', paths.registryDirectory);
    issues.sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
    return {issues, files, skins};
}
module.exports = {checkPack};
