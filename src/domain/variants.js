'use strict';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const COUNTERS = Object.freeze(['kills', 'headshots', 'player_kills']);

function normalizeVariants(value) {
    if (!Array.isArray(value)) throw new Error('Variants must be a list of skin IDs.');
    const result = value.map(id => {
        if (typeof id !== 'string' || !id.trim()) throw new Error('Every variant needs a skin ID.');
        return id.trim();
    });
    if (new Set(result).size !== result.length) throw new Error('A variant can only be listed once.');
    return result;
}
function normalizeLevel(level) {
    if (!object(level) || typeof level.variant !== 'string' || !level.variant.trim()) throw new Error('Choose a variant for every level.');
    if (!object(level.requires)) throw new Error('Every level needs requirements.');
    const requires = {};
    for (const [key, value] of Object.entries(level.requires)) {
        if (!COUNTERS.includes(key)) throw new Error('Unsupported level counter: ' + key);
        if (value === '') continue;
        const text = String(value).trim();
        if (!['string', 'number'].includes(typeof value) || !/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 1) {
            throw new Error(key + ' must be a positive whole number.');
        }
        requires[key] = Number(text);
    }
    if (!Object.keys(requires).length) throw new Error('Set at least one kill goal for every level.');
    return {...level, variant: level.variant.trim(), requires};
}
function normalizeLevels(value) {
    if (!Array.isArray(value)) throw new Error('Levels must be a list.');
    return value.map((level, index) => {
        try { return normalizeLevel(level); }
        catch (error) { throw new Error('Level ' + (index + 2) + ': ' + error.message); }
    });
}
function variantIssues(skins) {
    const issues = [], byId = new Map(), claims = new Map();
    skins.forEach((skin, index) => {
        if (!object(skin)) return;
        if (!byId.has(skin.id)) byId.set(skin.id, []);
        byId.get(skin.id).push(index);
    });
    skins.forEach((skin, index) => {
        if (!object(skin)) return;
        const related = [skin.id, ...(Array.isArray(skin.variants) ? skin.variants.filter(id => typeof id === 'string') : [])];
        const add = message => issues.push({index, skinId: skin.id, related, message});
        let variants = [], levels = [];
        try { variants = normalizeVariants(skin.variants === undefined ? [] : skin.variants); }
        catch (error) { add(error.message); }
        try { levels = normalizeLevels(skin.levels === undefined ? [] : skin.levels); }
        catch (error) { add(error.message); }
        for (const id of variants) {
            if (id === skin.id) { add('A skin cannot list itself as a variant.'); continue; }
            if (id.startsWith('default:')) { add('Default skins cannot be variants.'); continue; }
            const matches = byId.get(id);
            if (!matches || matches.length !== 1) { add('Variant ' + id + ' must identify exactly one skin in this file.'); continue; }
            const child = skins[matches[0]];
            if (Array.isArray(child.variants) && child.variants.length) add('Variant ' + id + ' has variants of its own. Nested variants are not supported.');
            if (!claims.has(id)) claims.set(id, []);
            claims.get(id).push(index);
        }
        for (const level of levels) if (!variants.includes(level.variant)) add('Level variant ' + level.variant + ' must also be selected under Variants.');
    });
    for (const [id, owners] of claims) if (owners.length > 1) {
        for (const index of owners) issues.push({index, skinId: skins[index].id, related: [id, ...owners.map(index => skins[index].id)], message: 'Variant ' + id + ' is claimed by more than one root skin.'});
    }
    return issues;
}
function assertVariants(skins, affected) {
    const issue = variantIssues(skins).find(issue => issue.related.some(id => affected.includes(id)));
    if (issue) throw new Error(String(issue.skinId || 'Skin') + ': ' + issue.message);
}
function renameVariantLinks(skins, previousId, id) {
    if (previousId === id) return;
    for (const skin of skins) {
        if (!object(skin)) continue;
        if (Array.isArray(skin.variants)) skin.variants = skin.variants.map(value => value === previousId ? id : value);
        if (Array.isArray(skin.levels)) skin.levels = skin.levels.map(level => object(level) && level.variant === previousId ? {...level, variant: id} : level);
    }
}
module.exports = {COUNTERS, normalizeVariants, normalizeLevels, variantIssues, assertVariants, renameVariantLinks};
