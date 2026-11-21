'use strict';
const {PackPaths} = require('../domain/paths');
const {validComponent} = require('../domain/skin');
const {isDirectory} = require('./files');
const {DEFAULT_TITLE} = require('./pack-metadata');

function newPackPaths(path, root, folder, namespace) {
    root = String(root || '').trim();
    folder = String(folder || '').trim();
    namespace = String(namespace || '').trim().toLowerCase();
    if (!root || !path.isAbsolute(root)) throw new Error('Choose an absolute parent directory for the new pack.');
    if (!validComponent(folder) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(folder)) {
        throw new Error('Enter a valid pack folder name without spaces or path separators.');
    }
    if (!/^[a-z0-9_][a-z0-9_.-]*$/.test(namespace) || namespace.endsWith('.')) {
        throw new Error('Use lowercase letters, numbers, underscores, dots, or hyphens for the namespace.');
    }
    return new PackPaths(path, root, folder, namespace);
}

function createPack(fs, paths, values = {}) {
    if (!isDirectory(fs, paths.root)) throw new Error('The parent directory does not exist.');
    // Exclusive creation: even an empty existing pack must never be replaced.
    if (fs.existsSync(paths.pack)) throw new Error('That pack folder already exists. Choose a different folder name.');
    const directories = [[], ['data'], ['data', paths.namespace], ['data', paths.namespace, 'skins'],
        ['data', paths.namespace, 'skin_rarities'], ['data', paths.namespace, 'skin_lang'],
        ['assets'], ['assets', 'mcpskins'], ['assets', 'mcpskins', 'textures'], ['assets', 'mcpskins', 'textures', 'skins']];
    const created = [];
    try {
        for (const parts of directories) {
            const directory = paths.path.join(paths.pack, ...parts);
            fs.mkdirSync(directory);
            created.push(directory);
        }
        const metadata = {title: String(values.pack_title || '').trim() || DEFAULT_TITLE, author: String(values.pack_author || '').trim()};
        fs.writeFileSync(paths.path.join(paths.pack, 'mcpskins_manager.json'), JSON.stringify(metadata, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
        return metadata;
    } catch (error) {
        // Only remove empty directories made by this attempt; retain any files another process added.
        for (const directory of created.reverse()) { try { fs.rmdirSync(directory); } catch { /* Preserve nonempty directories. */ } }
        throw error;
    }
}

module.exports = {newPackPaths, createPack};
