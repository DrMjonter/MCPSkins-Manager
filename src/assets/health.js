'use strict';
const {isObject, baseWeapon, validWeapon, basename, BASE_KEYS, itemKind} = require('../domain/skin');
const {loadPackMetadata, metadataFile} = require('../storage/pack-metadata');
const {variantIssues} = require('../domain/variants');
const {scanRarities} = require('../storage/rarities');
const {scanCollections, collectionIssues} = require('../storage/collections');
const {readJSON, isFile, isDirectory} = require('../storage/files');
const {rowStatus} = require('../domain/status');

function checkPack(fs, paths, options = {}) {
    const issues = [];
    let files = 0, skins = 0, skipped = 0;
    const add = (severity, message, filename, row = null) => issues.push({severity, message, filename,
        rowKey: row ? row.key : '', skinId: row ? String(row.skin.id ?? '') : '', registry: row ? row.filename : filename});
    const {rarities, warnings: rarityWarnings} = scanRarities(fs, paths);
    for (const warning of rarityWarnings) add('warning', warning.message, warning.filename);
    if (options.collections !== false) try {
        for (const issue of collectionIssues(scanCollections(fs, paths))) add(issue.severity, issue.message, issue.filename);
    } catch (error) { add('error', 'Unable to check collections: ' + error.message, paths.pack); }
    let metadata = {};
    try { metadata = loadPackMetadata(fs, paths); } catch (error) { add('error', `Invalid pack metadata: ${error.message}`, metadataFile(paths)); }
    if (!isDirectory(fs, paths.registryDirectory)) {
        add('error', 'The skins registry directory is missing.', paths.registryDirectory);
        return {issues, files, skins, skipped};
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
            if(options.skipLowOrder===true && (rowStatus(metadata,paths,row,options.customStatuses)?.order ?? 0)<=5)continue;
            add('error', problem.message, filename, row);
        }
        const ids = new Set();
        data.skins.forEach((skin, index) => {
            if (!isObject(skin)) { add('error', `Entry ${index + 1} is not a skin object.`, filename); return; }
            const row = {key: `${filename}\0${index}`, filename, data, index, skin};
            if(options.skipLowOrder===true && (rowStatus(metadata,paths,row,options.customStatuses)?.order ?? 0)<=5){skipped++;return;}
            skins++;
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
            // Geometry is optional: texture-only skins intentionally use the stock model.
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
                    else if (kind === 'HUD' || kind === 'Icon') {
                        if ((kind === 'HUD' ? options.missingHud : options.missingIcon) !== false) issue('warning', `${kind} texture is missing (optional).`, file);
                    } else if (options.missingMaps !== false && isFile(fs, paths.path.join(folder, basename(weapon) + suffix + '.png'))) issue('warning', `${kind} skin map is missing; a default map is available.`, file);
                    continue;
                }
                try {
                    const bytes = fs.readFileSync(file);
                    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
                    if (bytes.length < 24 || signature.some((value, i) => bytes[i] !== value) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('Invalid PNG header.');
                    const integer = offset => bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3];
                    const width = integer(16), height = integer(20);
                    if (!width || !height) throw new Error('Invalid image dimensions.');
                    let frameWidth=width, frameHeight=height;
                    if(isFile(fs,file+'.mcmeta')) {
                        try {
                            const metadata=readJSON(fs,file+'.mcmeta'), animation=metadata.animation;
                            if(animation!==undefined) {
                                if(!isObject(animation)) throw new Error('Expected an animation object.');
                                frameWidth=animation.width ?? Math.min(width,height); frameHeight=animation.height ?? Math.min(width,height);
                                if(!Number.isSafeInteger(frameWidth) || frameWidth<1 || !Number.isSafeInteger(frameHeight) || frameHeight<1 || width%frameWidth || height%frameHeight) throw new Error('Frame dimensions must divide the image dimensions.');
                                if(animation.frametime!==undefined && (!Number.isSafeInteger(animation.frametime) || animation.frametime<1)) throw new Error('Frame time must be a positive whole number.');
                                if(animation.interpolate!==undefined && typeof animation.interpolate!=='boolean') throw new Error('Interpolation must be true or false.');
                                const count=width/frameWidth*(height/frameHeight);
                                if(animation.frames!==undefined && (!Array.isArray(animation.frames) || !animation.frames.length || animation.frames.some(frame=>{
                                    const index=isObject(frame)?frame.index:frame;
                                    return !Number.isSafeInteger(index) || index<0 || index>=count || (isObject(frame) && frame.time!==undefined && (!Number.isSafeInteger(frame.time) || frame.time<1));
                                }))) throw new Error('Animation contains invalid frame indices or durations.');
                            }
                        } catch(error) { issue('warning','Animation metadata: '+error.message,file+'.mcmeta'); }
                    }
                } catch (error) { issue('error', `${kind} texture: ${error.message}`, file); }
            }
        });
    }
    if (!files) add('warning', 'No skin registry files found.', paths.registryDirectory);
    issues.sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
    return {issues, files, skins, skipped};
}
module.exports = {checkPack};
