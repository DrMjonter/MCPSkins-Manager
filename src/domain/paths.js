'use strict';

const {modelOutput, modelKey} = require('../gunpacks/catalog');
const {isObject, basename, validComponent} = require('./skin');

class PackPaths {
    constructor(path, root, folder, namespace) {
        if (!root || !path.isAbsolute(root)) throw new Error('Choose an absolute outer mcpskins directory.');
        if (!validComponent(folder) || !validComponent(namespace)) throw new Error('Pack folder and namespace must be single folder components.');
        this.path = path;
        this.modelReferences = {};
        this.lodReferences = {};
        this.root = path.resolve(root);
        this.folder = folder;
        this.namespace = namespace;
        this.pack = this.inside(folder);
        this.registryDirectory = this.inside(folder, 'data', namespace, 'skins');
    }
    inside(...parts) {
        const result = this.path.resolve(this.root, ...parts);
        const relative = this.path.relative(this.root, result);
        if (relative === '..' || relative.startsWith('..' + this.path.sep) || this.path.isAbsolute(relative)) {
            throw new Error('Asset path falls outside the selected root.');
        }
        return result;
    }
    modelForSkin(weapon, id, kind = 'gun', references = this.modelReferences) {
        const reference = isObject(references) ? references[modelKey(weapon, kind)] : null;
        return typeof reference === 'string' ? modelOutput(this, reference, id) : null;
    }
    registry(weapon, kind = 'gun') {
        const gun = basename(weapon);
        if (!validComponent(gun)) throw new Error('Invalid weapon basename.');
        return this.inside(this.folder, 'data', this.namespace, 'skins', `${gun}${kind === 'attachment' ? '_attachment' : ''}_skins.json`);
    }
    textures(weapon) {
        const value = weapon.trim().toLowerCase();
        const split = value.indexOf(':');
        const namespace = value.slice(0, split);
        const gun = value.slice(split + 1);
        if (split < 1 || !/^[a-z0-9_.-]+$/.test(namespace) || !gun.split('/').every(part => validComponent(part))
            || !validComponent(namespace)) throw new Error('Enter a valid namespaced weapon ID.');
        return this.inside(this.folder, 'assets', 'mcpskins', 'textures', 'skins', namespace, ...gun.split('/'));
    }
}

function packDirectorySelection(path, directory) {
    if (typeof directory !== 'string' || !directory.trim() || !path.isAbsolute(directory.trim())) {
        throw new Error('Choose an absolute pack directory.');
    }
    directory = path.resolve(directory.trim());
    const root = path.dirname(directory);
    const folder = path.basename(directory);
    if (root === directory || !validComponent(folder)) throw new Error('Choose a pack folder inside your mcpskins directory.');
    return {directory, root, folder};
}

module.exports = {PackPaths, packDirectorySelection};
