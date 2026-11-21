'use strict';
const {clone, isObject} = require('./skin');
const collectionKey = value => String(value || '').trim().toLowerCase();
const CASE_DEFAULTS = {price: 100, case_color: '#FFFFFF', requiresKey: true,
    rarity_weights: {common: 55, uncommon: 27, rare: 12, epic: 5, legendary: 1}, excluded_skins: []};
const TEXT_FIELDS = ['title', 'description', 'shop_icon'];
function validateCase(data) {
    if (!isObject(data) || typeof data.collection !== 'string' || !data.collection.trim()) throw new Error('A collection name is required.');
    for (const key of TEXT_FIELDS) if (data[key] !== undefined && typeof data[key] !== 'string') throw new Error(key + ' must be text.');
    if (data.price !== undefined && (!Number.isInteger(data.price) || data.price < 0 || data.price > 2147483647)) throw new Error('Price must be a whole number from 0 to 2147483647.');
    if (data.case_color !== undefined && (typeof data.case_color !== 'string' || !/^#?[a-f0-9]{6}$/i.test(data.case_color))) throw new Error('Case color must use #RRGGBB.');
    if (data.requiresKey !== undefined && typeof data.requiresKey !== 'boolean') throw new Error('requiresKey must be true or false.');
    if (data.shop_icon && !/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(data.shop_icon)) throw new Error('Shop icon must be a resource texture ID.');
    if (data.rarity_weights !== undefined && (!isObject(data.rarity_weights) || Object.entries(data.rarity_weights).some(([key, value]) => !key.trim() || !Number.isInteger(value) || value < 0 || value > 2147483647))) throw new Error('Rarity weights must be nonnegative whole numbers.');
    if (data.excluded_skins !== undefined && (!Array.isArray(data.excluded_skins) || data.excluded_skins.some(id => typeof id !== 'string' || !id.trim()))) throw new Error('Excluded skins must be a list of skin IDs.');
    return data;
}
function effectiveCase(global = {}, specific = {}) {
    const result = clone(CASE_DEFAULTS);
    for (const data of [global, specific]) {
        for (const key of ['price', 'case_color', 'requiresKey', ...TEXT_FIELDS]) {
            if (data[key] !== undefined && (typeof data[key] !== 'string' || data[key].trim())) result[key] = data[key];
        }
        for (const [key, value] of Object.entries(data.rarity_weights || {})) result.rarity_weights[key.toLowerCase()] = value;
        result.excluded_skins = [...new Set([...result.excluded_skins, ...(data.excluded_skins || [])])];
    }
    return result;
}
function caseOdds(skins, settings) {
    const excluded = new Set(settings.excluded_skins), groups = new Map();
    for (const skin of skins) {
        if (excluded.has(skin.id) || String(skin.id).startsWith('default:')) continue;
        const rarity = String(skin.rarity || 'common').toLowerCase();
        if (!groups.has(rarity)) groups.set(rarity, []);
        groups.get(rarity).push(skin);
    }
    const tiers = [...groups].map(([rarity, members]) => ({rarity, members, weight: Object.hasOwn(settings.rarity_weights,rarity) ? settings.rarity_weights[rarity] : 0}));
    const total = tiers.reduce((sum, tier) => sum + tier.weight, 0);
    return {total, eligible: tiers.filter(tier => tier.weight > 0).reduce((sum, tier) => sum + tier.members.length, 0),
        tiers: tiers.map(tier => {
            const chance = total ? tier.weight / total : 0;
            const weights = tier.members.map(skin => Math.max(1, Number.isSafeInteger(skin.weight) ? skin.weight : 1));
            const skinTotal = weights.reduce((a, b) => a + b, 0);
            return {rarity: tier.rarity, weight: tier.weight, chance, count: tier.members.length,
                skins: tier.members.map((skin, index) => ({id: skin.id, name: skin.name || skin.id, chance: chance * weights[index] / skinTotal}))};
        })};
}
function caseDraft(row, rarities) {
    const data = row ? row.data : {};
    return {collection: row ? row.name : '', title: data.title || '', description: data.description || '',
        price: data.price === undefined ? '' : String(data.price), case_color: data.case_color || '', shop_icon: data.shop_icon || '',
        requiresKey: data.requiresKey === undefined ? '' : String(data.requiresKey),
        weights: [...new Set([...Object.keys(rarities), ...Object.keys(data.rarity_weights || {})])].map(id => ({id, value: data.rarity_weights?.[id] === undefined ? '' : String(data.rarity_weights[id])})),
        exclusions: (data.excluded_skins || []).join('\n')};
}
function buildCase(draft, previous = {}) {
    const data = {...clone(previous), collection: draft.collection.trim()};
    for (const key of [...TEXT_FIELDS, 'case_color']) { if (draft[key].trim()) data[key] = draft[key].trim(); else delete data[key]; }
    const integer = (value, label) => { if (!/^[0-9]+$/.test(value.trim())) throw new Error(label + ' must be a nonnegative whole number.'); return Number(value); };
    if (draft.price.trim()) data.price = integer(draft.price, 'Price'); else delete data.price;
    if (draft.requiresKey === '') delete data.requiresKey; else if (['true', 'false'].includes(draft.requiresKey)) data.requiresKey = draft.requiresKey === 'true'; else throw new Error('Choose a key requirement.');
    const weights = Object.create(null);
    for (const row of draft.weights) if (row.value.trim()) weights[row.id] = integer(row.value, 'Rarity weight');
    if (Object.keys(weights).length) data.rarity_weights = weights; else delete data.rarity_weights;
    const exclusions = [...new Set(draft.exclusions.split(/[\r\n,]+/).map(id => id.trim()).filter(Boolean))];
    if (exclusions.length) data.excluded_skins = exclusions; else delete data.excluded_skins;
    return validateCase(data);
}
module.exports = {collectionKey, CASE_DEFAULTS, validateCase, effectiveCase, caseOdds, caseDraft, buildCase};
