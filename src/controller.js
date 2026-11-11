'use strict';
const {Manager} = require('./state/manager');
const {PackPaths, packDirectorySelection} = require('./domain/paths');
const {clone, defaultColor, emptyDraft, validComponent, normalizedWeapon, validWeapon, isDefaultWeapon, sanitizeWeaponNames} = require('./domain/skin');
const {THEMES} = require('./domain/constants');
const {RegistryRepository} = require('./storage/registry');
const {loadPackSettings, savePackSettings} = require('./storage/settings');
const {atomicJSON, isDirectory} = require('./storage/files');
const {prepareSkin} = require('./assets/preparation');
const {previewCards} = require('./assets/previews');
const {Desktop} = require('./integration/desktop');
const {BlockbenchBridge} = require('./integration/blockbench');
const {message, confirmDiscard, packDialog, colorDialog, namePrefixDialog} = require('./ui/dialogs');

const PREFERENCES = 'mcpskins_asset_manager.preferences.v1';
const RECOVERY = 'mcpskins_asset_manager.draft.v1';
const WEAPON_NAMES = 'mcpskins_asset_manager.weapon_names.v1';

class Controller {
    constructor(nativeRequire, storage = localStorage) {
        this.manager = new Manager();
        this.desktop = new Desktop(nativeRequire);
        this.bridge = new BlockbenchBridge(this.desktop.path);
        this.storage = storage;
        this.timer = null;
        this.dialogs = new Set();
        this.switching = false;
        this.closingAllowed = false;
        this.closePrompt = false;
        this.disposed = false;
        this.prefixRequest = null;
    }
    report(error) { if (!this.disposed) message('MCPSkins', error.message || String(error)); }
    run(callback) {
        try { return Promise.resolve(callback()).catch(error => this.report(error)); }
        catch (error) { this.report(error); return Promise.resolve(); }
    }
    getStored(key) {
        try { return JSON.parse(this.storage.getItem(key) || 'null'); }
        catch { return null; }
    }
    persist(key, value) {
        try {
            if (value === null) this.storage.removeItem(key);
            else this.storage.setItem(key, JSON.stringify(value));
        } catch {
            this.manager.state.notice = 'Draft recovery storage is unavailable. Save registry edits before reloading the plugin.';
        }
    }
    start() {
        this.manager.state.weaponNames = sanitizeWeaponNames(this.getStored(WEAPON_NAMES));
        const preferences = this.getStored(PREFERENCES);
        if (!preferences) return;
        this.manager.state.theme = preferences.theme === 'Blockbench' || Object.hasOwn(THEMES, preferences.theme) ? preferences.theme : 'Blockbench';
        if (!preferences.root) return;
        try {
            const connection = this.readRoot(preferences.root);
            const settings = connection.settings;
            const paths = new PackPaths(this.desktop.path, connection.root, settings.pack_folder, settings.pack_namespace);
            this.manager.attach(new RegistryRepository(connection.fs, paths));
            this.desktop.commit(connection);
            if (connection.warning) this.manager.state.notice = connection.warning;
            this.restoreDraft();
            this.updatePreviews();
        } catch (error) {
            this.manager.state.root = preferences.root;
            this.manager.state.notice = error.message;
            this.report(error);
        }
    }
    readRoot(root) {
        const connection = this.desktop.connect(root);
        return {...connection, ...loadPackSettings(connection.fs, this.desktop.path, connection.root)};
    }
    readPackDirectory(directory) {
        const selected = packDirectorySelection(this.desktop.path, directory);
        const connection = this.readRoot(selected.root);
        if (!isDirectory(connection.fs, selected.directory)) throw new Error('The selected pack directory does not exist.');
        return {...connection, packDirectory: selected.directory};
    }
    remember() {
        const s = this.manager.state;
        this.closingAllowed = false;
        if (!s.dirty) { this.persist(RECOVERY, null); return; }
        const row = this.manager.selected;
        this.persist(RECOVERY, {root: s.root, folder: s.folder, namespace: s.namespace, draft: s.draft,
            selected: row ? {key: row.key, filename: row.filename, index: row.index, skin: row.skin, data: row.data} : null});
    }
    restoreDraft() {
        const saved = this.getStored(RECOVERY), s = this.manager.state;
        if (!saved || saved.root !== s.root || saved.folder !== s.folder || saved.namespace !== s.namespace || !saved.draft) return;
        if (saved.selected && (!saved.selected.skin || !saved.selected.data)) return;
        const defaults = saved.selected ? this.manager.draftForRow(saved.selected) : emptyDraft();
        const draft = {...defaults, ...saved.draft};
        for (const key of Object.keys(defaults)) {
            if (typeof draft[key] !== typeof defaults[key]) return;
        }
        if (saved.selected) {
            const p = this.desktop.path;
            if (p.dirname(saved.selected.filename) !== s.directory || !Number.isInteger(saved.selected.index) || saved.selected.index < 0 || !saved.selected.skin) return;
        }
        this.manager.selected = saved.selected;
        Object.assign(s, {draft: clone(draft), active: true, dirty: true,
            selectedKey: saved.selected ? saved.selected.key : '', notice: 'Recovered unsaved registry edits. Save Skin or Discard Changes to resolve them.'});
    }
    async transition(callback) {
        if (this.switching) return false;
        this.switching = true;
        try {
            if (this.manager.state.dirty && !await confirmDiscard()) return false;
            await callback();
            return true;
        } finally { this.switching = false; }
    }
    configure() {
        this.removeDialog('mcpskins_pack');
        const s = this.manager.state;
        const dialog = packDialog({directory: s.root ? this.desktop.path.join(s.root, s.folder) : '', namespace: s.namespace}, directory => this.readPackDirectory(directory),
            async (values, connection) => {
                const {root, folder, directory} = packDirectorySelection(this.desktop.path, values.pack_directory);
                const namespace = String(values.pack_namespace || '').trim().toLowerCase();
                if (!validComponent(namespace)) throw new Error('Pack Namespace must be a single folder component.');
                const paths = new PackPaths(this.desktop.path, root, folder, namespace);
                connection = connection && connection.packDirectory === directory ? connection : this.readPackDirectory(directory);
                const switching = !s.ready || paths.root !== s.root || folder !== s.folder || namespace !== s.namespace;
                const apply = () => {
                    const repository = new RegistryRepository(connection.fs, paths);
                    const result = switching ? repository.discover() : null;
                    savePackSettings(connection.fs, this.desktop.path, paths.root, folder, namespace);
                    if (switching) {
                        this.manager.attach(repository, result);
                        this.desktop.commit(connection);
                        s.notice = '';
                        // A matching recovery can be present when initial folder access was denied.
                        const recovery = this.getStored(RECOVERY);
                        if (recovery && recovery.root === paths.root && recovery.folder === folder && recovery.namespace === namespace) this.restoreDraft();
                        else this.remember();
                    }
                    this.persist(PREFERENCES, {root: paths.root, theme: s.theme});
                    this.updatePreviews();
                };
                if (switching) return this.transition(apply);
                apply();
                return true;
            });
        this.dialogs.add(dialog);
    }
    edit(key, value) {
        this.manager.edit(key, value);
        this.remember();
        if (['weapon', 'label', 'id'].includes(key)) this.schedulePreviews();
    }
    commitWeapon() { return this.run(() => this.ensureWeaponPrefix()); }
    cancelPrefixRequest() {
        if (this.prefixRequest) this.prefixRequest.resolve(false);
        this.prefixRequest = null;
        this.removeDialog('mcpskins_weapon_prefix');
    }
    ensureWeaponPrefix() {
        const s = this.manager.state, draft = s.draft, weapon = normalizedWeapon(draft.weapon);
        if (draft.override_prefix || !validWeapon(weapon) || isDefaultWeapon(weapon) || Object.hasOwn(s.weaponNames, weapon)) return Promise.resolve(true);
        if (this.prefixRequest && this.prefixRequest.weapon === weapon && this.prefixRequest.draft === draft) return this.prefixRequest.promise;
        this.cancelPrefixRequest();
        let resolve;
        const promise = new Promise(done => { resolve = done; });
        const request = {weapon, draft, promise, resolve};
        this.prefixRequest = request;
        const finish = result => { if (this.prefixRequest === request) this.prefixRequest = null; resolve(result); };
        const dialog = namePrefixDialog(weapon, prefix => {
            if (this.disposed || this.prefixRequest !== request) { finish(false); return; }
            s.weaponNames = {...s.weaponNames, [weapon]: prefix};
            this.persist(WEAPON_NAMES, s.weaponNames);
            if (s.draft === draft && normalizedWeapon(draft.weapon) === weapon) { s.dirty = true; this.remember(); }
            finish(true);
        }, () => finish(false));
        this.dialogs.add(dialog);
        return promise;
    }
    select(row) {
        if (this.manager.state.selectedKey === row.key) return;
        return this.run(() => this.transition(() => {
            this.manager.select(row); this.remember(); this.updatePreviews();
        }));
    }
    newSkin() {
        if (!this.manager.state.ready) return this.configure();
        return this.run(() => this.transition(() => { this.manager.clear(); this.remember(); this.updatePreviews(); }));
    }
    refresh() {
        if (!this.manager.state.ready) return;
        return this.run(() => this.transition(() => {
            this.manager.reload(); this.manager.state.notice = ''; this.remember(); this.updatePreviews();
        }));
    }
    revert() {
        this.manager.revert(); this.manager.state.notice = ''; this.remember(); this.updatePreviews();
    }
    save() {
        if (!this.manager.state.ready || !this.manager.state.active || this.switching) return;
        return this.run(() => this.saveWithPrefix());
    }
    async saveWithPrefix() {
        const draft = this.manager.state.draft;
        if (!await this.ensureWeaponPrefix() || this.disposed || this.manager.state.draft !== draft) return false;
        this.saveNow();
        return true;
    }
    saveNow() {
        const result = this.manager.save();
        this.manager.state.notice = '';
        this.remember();
        this.updatePreviews();
        Blockbench.showQuickMessage(`${result.id} saved to ${this.desktop.path.basename(result.filename)}`, 3500);
    }
    resetColor() { this.edit('color', defaultColor(this.manager.state.draft.rarity)); }
    pickColor() {
        this.removeDialog('mcpskins_color');
        const dialog = colorDialog(this.manager.state.draft.color, color => this.edit('color', color));
        this.dialogs.add(dialog);
    }
    removeDialog(id) {
        for (const dialog of this.dialogs) {
            if (dialog.id !== id) continue;
            if (dialog.delete) dialog.delete(); else dialog.hide();
            this.dialogs.delete(dialog);
        }
    }
    schedulePreviews() { clearTimeout(this.timer); this.timer = setTimeout(() => this.updatePreviews(), 160); }
    updatePreviews() {
        clearTimeout(this.timer);
        if (!this.manager.state.ready || this.disposed) return;
        try {
            this.manager.state.previews = previewCards(this.desktop.fs, this.manager.repository.paths,
                this.manager.state.draft, this.desktop.pathToFileURL);
        } catch (error) { this.manager.state.notice = `Preview unavailable: ${error.message}`; }
    }
    openModel() {
        return this.run(() => {
            const files = prepareSkin(this.desktop.fs, this.manager.repository.paths, this.manager.state.draft);
            this.bridge.openModel(files, this.desktop.fs);
            this.updatePreviews();
        });
    }
    openFolder() {
        return this.run(() => this.desktop.open(this.manager.repository.paths.textures(this.manager.state.draft.weapon), true));
    }
    context(row, event) {
        new Menu([{name: 'Open File', icon: 'description', click: () => this.run(() => this.desktop.open(row.filename))},
            {name: 'Reveal File', icon: 'folder_open', click: () => {
                if (typeof Blockbench.showItemInFolder === 'function') Blockbench.showItemInFolder(row.filename);
                else this.run(() => this.desktop.open(this.desktop.path.dirname(row.filename), true));
            }}]).open(event);
    }
    changeTheme(theme) {
        if (theme !== 'Blockbench' && !Object.hasOwn(THEMES, theme)) return;
        this.manager.state.theme = theme;
        this.persist(PREFERENCES, {root: this.manager.state.root, theme});
        if (theme !== 'Blockbench' && this.manager.state.ready) this.run(() => atomicJSON(this.desktop.fs,
            this.desktop.path.join(this.manager.state.root, 'skin_manager_theme.json'), {theme}));
    }
    beforeUnload(event) {
        if (!this.manager.state.dirty || this.closingAllowed) return;
        event.preventDefault();
        event.returnValue = false;
        event.stopImmediatePropagation();
        if (this.closePrompt) return;
        this.closePrompt = true;
        Blockbench.showMessageBox({title: 'Unsaved MCPSkins registry edits',
            message: 'Save your skin registry changes before closing Blockbench?',
            buttons: ['Save Skin', 'Discard', 'Cancel'], confirm: 0, cancel: 2
        }, async result => {
            if (result === 2 || result === undefined) { this.closePrompt = false; return; }
            try {
                if (result === 0 && !await this.saveWithPrefix()) return;
                if (result === 1) { this.manager.state.dirty = false; this.persist(RECOVERY, null); }
                this.closingAllowed = true;
                window.close();
            } catch (error) { this.report(error); }
            finally { this.closePrompt = false; }
        });
    }
    dispose() {
        // Unload callbacks cannot veto a plugin reload; recovery is retained instead.
        if (this.manager.state.dirty) this.remember();
        this.disposed = true;
        this.cancelPrefixRequest();
        clearTimeout(this.timer);
        this.bridge.dispose();
        this.dialogs.forEach(dialog => { if (dialog.delete) dialog.delete(); else dialog.hide(); });
        this.dialogs.clear();
    }
}

module.exports = {Controller};
