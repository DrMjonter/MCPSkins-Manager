'use strict';
const {assetSelection} = require('./preparation');
const {isFile} = require('../storage/files');

function previewCards(fs, paths, draft, pathToFileURL) {
    let selection;
    try { selection = assetSelection(paths, draft); } catch { /* Empty editor. */ }
    return [['skin', 'Skin', ''], ['hud', 'HUD', '_hud'], ['icon', 'Icon', '_icon']].map(([kind, label, suffix]) => {
        const card = {kind, label, source: '', filename: '', dimensions: '', message: 'Select a skin'};
        if (!selection) return card;
        const filename = paths.path.join(selection.folder, selection.id + suffix + '.png');
        card.filename = paths.path.basename(filename);
        if (!isFile(fs, filename)) { card.message = `No ${kind} texture found`; return card; }
        const stat = fs.statSync(filename);
        card.source = pathToFileURL(filename).href + '?v=' + stat.mtimeMs + '-' + stat.size;
        card.message = '';
        return card;
    });
}

module.exports = {previewCards};
