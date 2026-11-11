'use strict';
const {GUN_NAMES} = require('./constants');

// Matches the TaCZ 1.1.8-hotfix-r7 default pack's
// data/tacz/index/guns entries. Suggestions do not restrict custom IDs.
const DEFAULT_TACZ_WEAPONS = Object.freeze(Object.entries(GUN_NAMES)
    .map(([id, name]) => Object.freeze({id: `tacz:${id}`, name}))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)));

function searchWeapons(query) {
    const term = query.trim().toLowerCase();
    return DEFAULT_TACZ_WEAPONS.filter(weapon => !term || `${weapon.id} ${weapon.name}`.toLowerCase().includes(term));
}

module.exports = {DEFAULT_TACZ_WEAPONS, searchWeapons};
