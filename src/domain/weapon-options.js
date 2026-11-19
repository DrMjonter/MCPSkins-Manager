'use strict';
const {GUN_NAMES} = require('./constants');

// Matches the TaCZ 1.1.8-hotfix-r7 default pack's
// data/tacz/index/guns entries. Suggestions do not restrict custom IDs.
const DEFAULT_TACZ_WEAPONS = Object.freeze(Object.entries(GUN_NAMES)
    .map(([id, name]) => Object.freeze({id: `tacz:${id}`, name}))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)));

function searchWeapons(query, weapons = DEFAULT_TACZ_WEAPONS) {
    const term = query.trim().toLowerCase();
    return weapons.filter(weapon => !term || `${weapon.id} ${weapon.name}`.toLowerCase().includes(term));
}

function weaponSuggestions(discovered, kind = 'gun') {
    const options = new Map((kind === 'gun' ? DEFAULT_TACZ_WEAPONS : []).map(item => [item.id, item]));
    for (const item of discovered) if (item.kind === kind && !options.has(item.id)) options.set(item.id, {id: item.id, name: item.name});
    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
module.exports = {DEFAULT_TACZ_WEAPONS, searchWeapons, weaponSuggestions};
