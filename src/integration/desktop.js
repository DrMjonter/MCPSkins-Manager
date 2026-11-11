'use strict';
const {isDirectory, isFile} = require('../storage/files');

class Desktop {
    constructor(nativeRequire) {
        this.require = nativeRequire;
        this.path = nativeRequire('path');
        this.pathToFileURL = nativeRequire('url').pathToFileURL;
        this.fs = null;
        this.root = '';
        this.shell = null;
    }
    connect(root) {
        root = this.path.resolve(root);
        const fs = this.root === root && this.fs ? this.fs : this.require('fs', {
            scope: root, optional: true,
            message: 'Read MCPSkins registries and textures, save registry edits, and prepare skin-specific asset copies in this folder.'
        });
        if (!fs) throw new Error('Folder access was not granted. Choose Pack to connect again.');
        if (!isDirectory(fs, root)) throw new Error('The selected mcpskins root is not a directory.');
        return {fs, root};
    }
    commit(connection) { this.fs = connection.fs; this.root = connection.root; }
    async open(filename, directory = false) {
        if (!(directory ? isDirectory(this.fs, filename) : isFile(this.fs, filename))) throw new Error(`Path does not exist: ${filename}`);
        if (!this.shell) this.shell = this.require('shell', {optional: true, message: 'Open the selected asset folder or registry JSON in your default desktop application.'});
        if (!this.shell) throw new Error('Desktop file-opening access was not granted.');
        const error = await this.shell.openPath(filename);
        if (error) throw new Error(error);
    }
}

module.exports = {Desktop};
