'use strict';
const {message} = require('./dialogs');
const {RARITIES} = require('../domain/constants');
const ITEM_TYPES = [['gun', 'Guns'], ['attachment', 'Attachments'], ['melee', 'Melee'], ['throwable', 'Throwables'], ['consumable', 'Consumables']];
function itemCounts(catalog) {
    return ITEM_TYPES.map(([kind, label]) => [label, catalog.items.filter(item => item.kind === kind).length]);
}
function scanSummary(catalog, rarities, packWarnings = []) {
    const custom = Object.keys(rarities).filter(id => !Object.hasOwn(RARITIES, id)).length;
    return ['Scanned ' + catalog.sources.length + ' sources.', 'LesRaisins archives: ' + catalog.sources.filter(source => source.addon === 'LesRaisins').length, '', ...itemCounts(catalog).map(([label, count]) => label + ': ' + count), '',
        'Custom rarities: ' + custom + ' (' + Object.keys(rarities).length + ' total tiers in the selected skin pack)',
        'Warnings: ' + (catalog.warnings.length + packWarnings.length)].join('\n');
}
function gunPackDialog(directory, scan) {
    const dialog = new Dialog('mcpskins_gunpacks', {
        title: 'TaCZ Gun Packs', width: 650, buttons: ['Rescan', 'Cancel'], confirmIndex: 0, cancelIndex: 1,
        form: {directory: {label: 'TaCZ Directory', type: 'folder', value: directory,
            description: 'Contains installed gun-pack folders and ZIPs. Installed LesRaisins items are also read from the Minecraft instance’s mods folder. Rescan refreshes item discovery and custom rarities in the selected skin pack.'}},
        onConfirm(values) {
            try {
                const result = scan(values.directory);
                if (result) { dialog.hide(); message('Scan complete', result); }
            }
            catch (error) { message('Gun packs not loaded', error.message); }
            return false;
        }
    });
    dialog.show(); return dialog;
}
function sourceDialog(conflict, finish) {
    const options = Object.fromEntries(conflict.candidates.map(candidate => [candidate.id, candidate.name]));
    const dialog = new Dialog('mcpskins_gunpack_source', {
        title: 'Choose Gun-Pack Source', width: 650,
        form: {resource: {label: 'Resource', type: 'text', value: conflict.resource, readonly: true},
            source: {label: 'Source Pack', type: 'select', options, value: conflict.candidates[0].id,
                description: 'Multiple packs supply different versions. This choice is remembered for this TaCZ folder.'}},
        onConfirm(values) { finish(values.source); dialog.hide(); },
        onCancel() { finish(null); }
    });
    dialog.show(); return dialog;
}
module.exports = {gunPackDialog, sourceDialog, itemCounts, scanSummary};
