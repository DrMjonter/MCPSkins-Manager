'use strict';

const {RARITIES, GUN_NAMES} = require('./constants');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const basename = weapon => String(weapon).split(':').pop().split('/').pop();
const displayGun = weapon => Object.hasOwn(GUN_NAMES, basename(weapon)) ? GUN_NAMES[basename(weapon)] : basename(weapon).replace(/_/g, ' ').toUpperCase();
const slugify = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const defaultColor = rarity => '#' + (Object.hasOwn(RARITIES, rarity) ? RARITIES[rarity] : RARITIES.common).slice(2).toUpperCase();
const validComponent = value => typeof value === 'string' && /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(value) && !value.endsWith('.');
const baseWeapon = data => Object.hasOwn(data, 'base_gun') ? data.base_gun : data.base_melee;
const normalizedWeapon = weapon => String(weapon).trim().toLowerCase();
const validWeapon = weapon => /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(normalizedWeapon(weapon));
const isDefaultWeapon = weapon => {
    const id = normalizedWeapon(weapon);
    return id.startsWith('tacz:') && Object.hasOwn(GUN_NAMES, id.slice(5));
};

function validateNamePrefix(value) {
    const prefix = String(value ?? '').trim();
    if (!prefix || /[|\r\n]/.test(prefix)) throw new Error('Enter a weapon name prefix without a pipe (|) or line breaks.');
    return prefix;
}

function weaponPrefix(weapon, names = {}) {
    const id = normalizedWeapon(weapon);
    return Object.hasOwn(names, id) ? names[id] : displayGun(id);
}

function sanitizeWeaponNames(value) {
    const names = {};
    if (!isObject(value)) return names;
    for (const [id, prefix] of Object.entries(value)) {
        if (!validWeapon(id) || typeof prefix !== 'string') continue;
        try { names[normalizedWeapon(id)] = validateNamePrefix(prefix); } catch { /* Skip invalid saved preferences. */ }
    }
    return names;
}

function validateRegistry(data, filename = 'registry') {
    if (!isObject(data) || !Array.isArray(data.skins) || !('base_gun' in data || 'base_melee' in data)) {
        throw new Error(`Invalid ${filename}: expected base_gun/base_melee and a skins list.`);
    }
    return data;
}

function equalJSON(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null) return false;
    if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => equalJSON(v, b[i]));
    if (!isObject(a) || !isObject(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equalJSON(a[k], b[k]));
}

function emptyDraft() {
    return {weapon: '', kind: 'gun', label: '', id: '', rarity: 'common', color: '#FFFFFF',
        collection: '', description: '', is_new: true, locked_text: '', unlocked: false,
        include_weight: false, weight: '1', override_prefix: false, name_prefix: ''};
}

function draftFromRow(row) {
    const {data, skin} = row;
    const rarity = String(skin.rarity ?? 'common').toLowerCase();
    const color = String(skin.label_color ?? (Object.hasOwn(RARITIES, rarity) ? RARITIES[rarity] : RARITIES.common)).trim();
    const name = String(skin.name ?? '');
    return {weapon: String('base_melee' in data ? data.base_melee : data.base_gun),
        kind: 'base_melee' in data ? 'melee' : 'gun',
        label: name.includes(' | ') ? name.slice(name.indexOf(' | ') + 3) : name,
        id: String(skin.id ?? ''), rarity,
        color: /^(?:0[xX]|#)[0-9a-fA-F]{6}$/.test(color) ? '#' + color.slice(-6).toUpperCase() : defaultColor(rarity),
        collection: String(skin.collection ?? ''), description: String(skin.description ?? ''),
        is_new: Boolean(skin.is_new), locked_text: String(skin.locked_text ?? ''), unlocked: Boolean(skin.unlocked),
        include_weight: Object.hasOwn(skin, 'weight'), weight: String(skin.weight ?? 1),
        override_prefix: false, name_prefix: name.includes(' | ') ? name.slice(0, name.indexOf(' | ')) : ''};
}

function buildEntry(draft, previous = null, defaultPrefix = null) {
    const weapon = draft.weapon.trim().toLowerCase();
    const label = draft.label.trim();
    const rarity = draft.rarity.toLowerCase();
    let id = draft.id.trim();
    if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(weapon)) throw new Error('Use a namespaced weapon ID, e.g. tacz:ai_awp.');
    if (!label || !draft.collection.trim() || !draft.description.trim()) throw new Error('Skin name, collection and description are required.');
    if (!Object.hasOwn(RARITIES, rarity)) throw new Error('Choose a supported rarity.');
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.color.trim())) throw new Error('Use a six-digit label color, e.g. #3BE1FF.');
    if (!previous && !id) {
        const slug = slugify(label);
        if (!slug) throw new Error('Skin name needs ASCII letters or digits to generate an ID.');
        id = `${basename(weapon)}_${slug}`;
    }
    if (!/^[a-z0-9_]+$/.test(id)) throw new Error('Skin IDs may only contain lowercase letters, digits and underscores.');
    const prefix = draft.override_prefix ? validateNamePrefix(draft.name_prefix)
        : defaultPrefix === null ? displayGun(weapon) : validateNamePrefix(defaultPrefix);
    const entry = {...(previous ? clone(previous) : {}), id, name: `${prefix} | ${label}`,
        label_color: '0x' + draft.color.trim().slice(1).toUpperCase(), rarity,
        collection: draft.collection.trim(), description: draft.description.trim(), is_new: Boolean(draft.is_new)};
    if (draft.locked_text.trim()) entry.locked_text = draft.locked_text.trim();
    else delete entry.locked_text;
    if (draft.unlocked) entry.unlocked = true;
    else delete entry.unlocked;
    if (draft.include_weight) {
        const weight = String(draft.weight).trim();
        if (!/^[0-9]+$/.test(weight) || Number(weight) < 1 || !Number.isSafeInteger(Number(weight))) {
            throw new Error('Weight must be a positive whole number within JavaScript’s safe integer range.');
        }
        entry.weight = Number(weight);
    } else delete entry.weight;
    return {weapon, entry};
}

module.exports = {isObject, clone, basename, displayGun, slugify, defaultColor, validComponent,
    baseWeapon, validateRegistry, equalJSON, emptyDraft, draftFromRow, buildEntry,
    normalizedWeapon, validWeapon, isDefaultWeapon, validateNamePrefix, weaponPrefix, sanitizeWeaponNames};
