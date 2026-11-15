'use strict';
const {packDirectorySelection} = require('../domain/paths');
const {validComponent} = require('../domain/skin');
const RECENT_PACKS = 'mcpskins_asset_manager.recent_packs.v1';
const LIMIT = 12;
const pathKey = (path, directory) => path.sep === '\\' ? path.resolve(directory).toLowerCase() : path.resolve(directory);
function recentPacks(path, value) {
    const result = [], seen = new Set();
    for (const entry of Array.isArray(value) ? value : []) {
        try {
            if (!entry || !validComponent(entry.namespace)) continue;
            const {directory} = packDirectorySelection(path, entry.directory), key = pathKey(path, directory);
            if (seen.has(key)) continue;
            seen.add(key);
            result.push({directory, namespace: entry.namespace, title: typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : 'Pack Name',
                author: typeof entry.author === 'string' ? entry.author.trim() : ''});
            if (result.length === LIMIT) break;
        } catch { /* Ignore malformed local history entries. */ }
    }
    return result;
}
function rememberPack(path, history, entry) {
    return recentPacks(path, [entry, ...recentPacks(path, history)]);
}
module.exports = {RECENT_PACKS, recentPacks, rememberPack};
