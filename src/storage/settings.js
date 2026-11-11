'use strict';
const {validComponent} = require('../domain/skin');
const {readJSON, atomicJSON, isFile} = require('./files');

function loadPackSettings(fs, path, root) {
    const defaults = {pack_folder: 'Example', pack_namespace: 'example'};
    const filename = path.join(root, 'skin_manager_settings.json');
    if (!isFile(fs, filename)) return {settings: defaults, warning: ''};
    try {
        const data = readJSON(fs, filename);
        if (!data || !validComponent(data.pack_folder) || !validComponent(data.pack_namespace)) throw new Error('Invalid saved pack folder or namespace.');
        return {settings: {pack_folder: data.pack_folder, pack_namespace: data.pack_namespace}, warning: ''};
    } catch (error) { return {settings: defaults, warning: error.message}; }
}

function savePackSettings(fs, path, root, folder, namespace) {
    if (!validComponent(folder) || !validComponent(namespace)) throw new Error('Invalid pack folder or namespace.');
    atomicJSON(fs, path.join(root, 'skin_manager_settings.json'), {pack_folder: folder, pack_namespace: namespace});
}

module.exports = {loadPackSettings, savePackSettings};
