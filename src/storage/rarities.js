'use strict';
const {defaultRarities} = require('../domain/rarities');
const {readJSON, isDirectory} = require('./files');

// Definitions are pack-wide: their namespace does not have to match the skins namespace.
function scanRarities(fs, paths) {
    let rarities = defaultRarities(), definitions = {};
    const warnings = [], seen = new Set(), data = paths.path.join(paths.pack, 'data');
    const warn = (filename, message) => warnings.push({filename, message});
    if (!isDirectory(fs, data)) return {rarities, warnings, definitions};
    try {
        const namespaces = fs.readdirSync(data, {withFileTypes: true}).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
        for (const namespace of namespaces) {
            const directory = paths.path.join(data, namespace, 'skin_rarities');
            if (!isDirectory(fs, directory)) continue;
            try {
                const files = fs.readdirSync(directory, {withFileTypes: true}).filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(entry => entry.name).sort();
                for (const file of files) {
                    const filename = paths.path.join(directory, file), id = file.slice(0, -5).toLowerCase();
                    try {
                        const value = readJSON(fs, filename);
                        if (!/^[a-z0-9_.-]+$/.test(id) || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a rarity object with a valid filename ID.');
                        if (value.name !== undefined && typeof value.name !== 'string') throw new Error('Rarity name must be text.');
                        if (value.color !== undefined && (typeof value.color !== 'string' || !/^(#|0x)[0-9a-f]{6}$/i.test(value.color))) throw new Error('Rarity color must be a six-digit RGB value.');
                        if (value.order !== undefined && !Number.isSafeInteger(value.order)) throw new Error('Rarity order must be a safe whole number.');
                        if (seen.has(id)) warn(filename, 'Duplicate rarity ' + id + '; using ' + filename + '.');
                        seen.add(id);
                        definitions = {...definitions, [id]: {id, filename, namespace, data: value}};
                        rarities = {...rarities, [id]: {id, name: value.name ?? id,
                            color: value.color === undefined ? '#FFFFFF' : '#' + value.color.slice(-6).toUpperCase(), order: value.order ?? 0}};
                    } catch (error) { warn(filename, 'Invalid rarity definition ' + filename + ': ' + error.message); }
                }
            } catch (error) { warn(directory, 'Unable to scan rarities: ' + error.message); }
        }
    } catch (error) { warn(data, 'Unable to scan rarities: ' + error.message); }
    return {rarities, warnings, definitions};
}
module.exports = {scanRarities};
