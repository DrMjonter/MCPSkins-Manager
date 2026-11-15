'use strict';
const {isObject} = require('../domain/skin');
const {readJSON, atomicJSON} = require('./files');

const DEFAULT_TITLE = 'Pack Name';
function metadataFile(paths) { return paths.path.join(paths.pack, 'mcpskins_manager.json'); }
function loadPackMetadata(fs, paths) {
    const filename = metadataFile(paths);
    if (!fs.existsSync(filename)) return {title: DEFAULT_TITLE};
    const data = readJSON(fs, filename);
    if (!isObject(data)) throw new Error('Pack metadata must be a JSON object.');
    if (data.title !== undefined && typeof data.title !== 'string') throw new Error('Pack title must be text.');
    return {...data, title: (data.title || '').trim() || DEFAULT_TITLE};
}
function savePackMetadata(fs, paths, changes) {
    if (!isObject(changes)) throw new Error('Pack metadata changes must be a JSON object.');
    // Read again to preserve fields added by future versions or other tools.
    const data = {...loadPackMetadata(fs, paths), ...changes};
    if (typeof data.title !== 'string') throw new Error('Pack title must be text.');
    data.title = data.title.trim() || DEFAULT_TITLE;
    if (Object.hasOwn(changes, 'author')) {
        if (typeof changes.author !== 'string') throw new Error('Pack author must be text.');
        data.author = changes.author.trim();
    }
    atomicJSON(fs, metadataFile(paths), data);
    return data;
}
module.exports = {DEFAULT_TITLE, metadataFile, loadPackMetadata, savePackMetadata};
