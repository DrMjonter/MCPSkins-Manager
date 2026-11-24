'use strict';
const {THEMES} = require('./constants');
const {isObject} = require('./skin');
const {normalizeCustomStatuses} = require('./status');
const SETTINGS = 'mcpskins_asset_manager.settings.v1';
const themes = ['Blockbench', ...Object.keys(THEMES)];
const PREVIEW_SIZES = {small:160, medium:256, large:384};
function settingsFrom(value) {
    const source = isObject(value) ? value : {};
    const defaults = isObject(source.defaults) ? source.defaults : {}, appearance = isObject(source.appearance) ? source.appearance : {}, health = isObject(source.health) ? source.health : {};
    const assets = isObject(source.assets) ? source.assets : {};
    const text = key => typeof defaults[key] === 'string' ? defaults[key] : '';
    const bool = (object,key,fallback) => typeof object[key] === 'boolean' ? object[key] : fallback;
    return {customStatuses:normalizeCustomStatuses(source.customStatuses),defaults:{rarity:text('rarity') || 'common', collection:text('collection'), author:text('author'), is_new:bool(defaults,'is_new',true), unlocked:bool(defaults,'unlocked',false)},
        assets:{createSpecular:bool(assets,'createSpecular',true),createNormal:bool(assets,'createNormal',true)},
        appearance:{compact:bool(appearance,'compact',false), listHeight:Number.isFinite(appearance.listHeight) && appearance.listHeight >= 40 ? Math.min(1200,Math.round(appearance.listHeight)) : 0, previewSize:typeof appearance.previewSize === 'string' && Object.hasOwn(PREVIEW_SIZES,appearance.previewSize) ? appearance.previewSize : 'medium',theme:themes.includes(appearance.theme) ? appearance.theme : 'Blockbench'},
        health:{live:bool(health,'live',true),skipLowOrder:bool(health,'skipLowOrder',true),missingHud:bool(health,'missingHud',true),missingIcon:bool(health,'missingIcon',true),missingMaps:bool(health,'missingMaps',true),collections:bool(health,'collections',true)}};
}
module.exports = {SETTINGS, themes, PREVIEW_SIZES, settingsFrom};
