'use strict';
const {RARITIES} = require('./constants');

function defaultRarities() {
    return Object.fromEntries(Object.entries(RARITIES).map(([id, color], index) =>
        [id, {id, name: id, color: '#' + color.slice(2).toUpperCase(), order: index * 100}]));
}
function sortedRarities(rarities) {
    return Object.values(rarities).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
function rarityColor(id, rarities = defaultRarities()) {
    const key = String(id).trim().toLowerCase();
    return Object.hasOwn(rarities, key) ? rarities[key].color : rarities.common.color;
}
module.exports = {defaultRarities, sortedRarities, rarityColor};
