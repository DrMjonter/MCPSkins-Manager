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
        this.gunPackFS = null; this.gunPackDirectory = '';
        this.modsFS = null; this.modsDirectory = '';
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
    connectGunPacks(directory, allowMissing = false) {
        if (typeof directory !== 'string' || !this.path.isAbsolute(directory)) throw new Error('Choose an absolute TaCZ gun-pack directory.');
        directory = this.path.resolve(directory);
        const fs = this.gunPackDirectory === directory && this.gunPackFS ? this.gunPackFS : this.require('fs', {
            scope: directory, optional: true, message: 'Read installed TaCZ gun packs to discover default models and textures. Source packs are not modified.'
        });
        if (!fs) throw new Error('TaCZ folder access was not granted. You can still use manually prepared assets.');
        if (!allowMissing && !isDirectory(fs, directory)) throw new Error('TaCZ gun-pack directory does not exist: ' + directory);
        this.gunPackFS = fs; this.gunPackDirectory = directory;
        return {fs, directory};
    }
    lesRaisinsSources(directory) {
        directory = this.path.resolve(directory);
        const fs = this.modsDirectory === directory && this.modsFS ? this.modsFS : this.require('fs', {
            scope: directory, optional: true,
            message: 'Read the installed LesRaisins Tactical Equipment JAR to discover melee weapons, throwables, and consumables. Mod files are not modified.'
        });
        if (!fs) throw new Error('Mods folder access was not granted; LesRaisins discovery is unavailable.');
        this.modsFS = fs; this.modsDirectory = directory;
        if (!isDirectory(fs, directory)) return [];
        return fs.readdirSync(directory).filter(name => /\.jar$/i.test(name) && /(?:lesraisins.*tactical|lr[-_]?tactical)/i.test(name))
            .sort().map(name => ({fs, filename: this.path.join(directory, name), addon: 'LesRaisins'}));
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
