'use strict';
const {Manager} = require('./state/manager');
const {PackPaths, packDirectorySelection} = require('./domain/paths');
const {clone, defaultColor, emptyDraft, validComponent, normalizedWeapon, validWeapon, isDefaultWeapon, sanitizeWeaponNames} = require('./domain/skin');
const {THEMES} = require('./domain/constants');
const {RegistryRepository} = require('./storage/registry');
const {loadPackSettings, savePackSettings} = require('./storage/settings');
const {loadPackMetadata, savePackMetadata} = require('./storage/pack-metadata');
const {RECENT_PACKS, recentPacks, rememberPack} = require('./storage/recent-packs');
const {atomicJSON, isDirectory} = require('./storage/files');
const {STATUSES, saveStatuses} = require('./domain/status');
const {checkPack} = require('./assets/health');
const {shortcutComponent} = require('./ui/keyboard');
const {healthComponent} = require('./ui/health');
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
            this.loadMetadata();
            this.rememberRecentPack();
            this.restoreDraft();
            this.updatePreviews();
        } catch (error) {
            this.manager.state.root = preferences.root;
            this.manager.state.notice = error.message;
            this.report(error);
        }
    }
    loadMetadata() {
        const repository = this.manager.repository;
        try { this.manager.state.packMetadata = loadPackMetadata(repository.fs, repository.paths); }
        catch (error) {
            this.manager.state.packMetadata = {title: 'Pack Name'};
            this.manager.state.notice = `Pack metadata unavailable: ${error.message}`;
        }
    }
    updatePackMetadata(changes, expectedPack) {
        if (!this.manager.state.ready || this.disposed) return Promise.resolve(false);
        const repository = this.manager.repository;
        if (expectedPack !== repository.paths.pack) return Promise.resolve(false);
        return this.run(() => {
            this.manager.state.packMetadata = savePackMetadata(repository.fs, repository.paths, changes);
            this.rememberRecentPack();
            return true;
        });
    }
    rememberRecentPack() {
        const repository = this.manager.repository;
        if (!repository || !isDirectory(repository.fs, repository.paths.pack)) return;
        const entry = {directory: repository.paths.pack, namespace: repository.paths.namespace, title: this.manager.state.packMetadata.title, author: this.manager.state.packMetadata.author};
        this.persist(RECENT_PACKS, rememberPack(this.desktop.path, this.getStored(RECENT_PACKS), entry));
    }
    readRoot(root) {
        const connection = this.desktop.connect(root);
        return {...connection, ...loadPackSettings(connection.fs, this.desktop.path, connection.root)};
    }
    readPackDirectory(directory) {
        const selected = packDirectorySelection(this.desktop.path, directory);
        const connection = this.readRoot(selected.root);
        if (!isDirectory(connection.fs, selected.directory)) throw new Error('The selected pack directory does not exist.');
        let author = '';
        try {
            const paths = new PackPaths(this.desktop.path, selected.root, selected.folder, connection.settings.pack_namespace);
            const metadata = loadPackMetadata(connection.fs, paths);
            author = typeof metadata.author === 'string' ? metadata.author : '';
        } catch { /* Metadata errors are reported on load or when editing the author. */ }
        return {...connection, packDirectory: selected.directory, author};
    }
    savePackAuthor(directory, author, connection) {
        const selected = packDirectorySelection(this.desktop.path, directory);
        connection = connection && connection.packDirectory === selected.directory ? connection : this.readPackDirectory(directory);
        const paths = new PackPaths(this.desktop.path, selected.root, selected.folder, connection.settings.pack_namespace);
        const metadata = savePackMetadata(connection.fs, paths, {author});
        if (this.manager.repository && this.manager.repository.paths.pack === paths.pack) this.manager.state.packMetadata = metadata;
        const history = recentPacks(this.desktop.path, this.getStored(RECENT_PACKS));
        for (const entry of history) {
            if (this.desktop.path.relative(entry.directory, paths.pack) === '') Object.assign(entry, {title: metadata.title, author: metadata.author});
        }
        this.persist(RECENT_PACKS, history);
        return metadata.author;
    }
    remember() {
        const s = this.manager.state;
        this.closingAllowed = false;
        if (!s.dirty) { this.persist(RECOVERY, null); return; }
        const row = this.manager.selected;
        this.persist(RECOVERY, {root: s.root, folder: s.folder, namespace: s.namespace, draft: s.draft,
            selected: row ? {key: row.key, filename: row.filename, index: row.index, skin: row.skin, data: row.data} : null,
            selection: this.manager.selection, changedFields: s.changedFields, mixed: s.mixed, duplicate: this.manager.duplicateSource});
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
        const validRow = row => row && row.skin && row.data && typeof row.filename === 'string'
            && this.desktop.path.dirname(row.filename) === s.directory && Number.isInteger(row.index) && row.index >= 0;
        const selection = saved.selection || (saved.selected ? [saved.selected] : []);
        if (!Array.isArray(selection) || !selection.every(validRow) || (saved.duplicate && !validRow(saved.duplicate))) return;
        this.manager.selection = selection;
        this.manager.selected = selection[0] || null;
        this.manager.anchorKey = selection[0] ? selection[0].key : '';
        this.manager.duplicateSource = saved.duplicate || null;
        Object.assign(s, {draft: clone(draft), active: true, dirty: true,
            selectedKey: saved.selected ? saved.selected.key : '', selectedKeys: selection.map(row => row.key),
            changedFields: Array.isArray(saved.changedFields) ? saved.changedFields : [], mixed: saved.mixed || {}, duplicatePending: !!saved.duplicate, notice: 'Recovered unsaved registry edits. Save Skin or Discard Changes to resolve them.'});
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
        this.rememberRecentPack();
        const dialog = packDialog({directory: s.root ? this.desktop.path.join(s.root, s.folder) : '', namespace: s.namespace, author: typeof s.packMetadata.author === 'string' ? s.packMetadata.author : ''}, directory => this.readPackDirectory(directory),
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
                    this.loadMetadata();
                    this.rememberRecentPack();
                    this.persist(PREFERENCES, {root: paths.root, theme: s.theme});
                    this.updatePreviews();
                };
                if (switching) return this.transition(apply);
                apply();
                return true;
            }, recentPacks(this.desktop.path, this.getStored(RECENT_PACKS)), (directory, author, connection) => this.savePackAuthor(directory, author, connection));
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
    select(row, event = {}) {
        const rows = this.manager.selectionFor(row, event);
        if (rows.length === this.manager.selection.length && rows.every(item => this.manager.state.selectedKeys.includes(item.key))) return;
        return this.run(() => this.transition(() => {
            if (!event.shiftKey || !this.manager.anchorKey) this.manager.anchorKey = row.key;
            this.manager.selectRows(rows); this.remember(); this.updatePreviews();
        }));
    }
    selectAll() {
        const rows = this.manager.state.ready ? this.manager.state.rows.slice() : [];
        if (!rows.length) return;
        return this.run(() => this.transition(() => {
            this.manager.anchorKey = rows[0].key;
            this.manager.selectRows(rows); this.remember(); this.updatePreviews();
        }));
    }
    showShortcuts() {
        this.removeDialog('mcpskins_shortcuts');
        const dialog = new Dialog('mcpskins_shortcuts', {title: 'MCPSkins Keyboard Shortcuts', width: 700, buttons: ['Close'], component: shortcutComponent()});
        this.dialogs.add(dialog); dialog.show();
    }
    duplicateSkin(row) {
        return this.run(() => this.transition(() => {
            this.manager.duplicate(row); this.remember(); this.updatePreviews();
        }));
    }
    newSkin() {
        if (!this.manager.state.ready) return this.configure();
        return this.run(() => this.transition(() => { this.manager.clear(); this.remember(); this.updatePreviews(); }));
    }
    refresh() {
        if (!this.manager.state.ready) return;
        return this.run(() => this.transition(() => {
            this.manager.reload(); this.manager.state.notice = ''; this.loadMetadata(); this.remember(); this.updatePreviews();
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
        if ((this.manager.selection.length <= 1 && !await this.ensureWeaponPrefix()) || this.disposed || this.manager.state.draft !== draft) return false;
        this.saveNow();
        return true;
    }
    saveNow() {
        const result = this.manager.save();
        this.manager.state.notice = '';
        this.remember();
        this.updatePreviews();
        Blockbench.showQuickMessage(result.count ? `${result.count} skins saved` : `${result.id} saved to ${this.desktop.path.basename(result.filename)}`, 3500);
    }
    resetColor() { this.edit('color', defaultColor(this.manager.state.draft.rarity)); }
    pickColor() {
        this.removeDialog('mcpskins_color');
        const dialog = colorDialog(this.manager.state.draft.color || '#FFFFFF', color => this.edit('color', color));
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
        if (this.manager.selection.length > 1 || this.manager.duplicateSource) { this.manager.state.previews = []; return; }
        try {
            this.manager.state.previews = previewCards(this.desktop.fs, this.manager.repository.paths,
                this.manager.state.draft, this.desktop.pathToFileURL);
        } catch (error) { this.manager.state.notice = `Preview unavailable: ${error.message}`; }
    }
    openModel() {
        if (this.manager.selection.length > 1 || this.manager.duplicateSource) return;
        return this.run(() => {
            const files = prepareSkin(this.desktop.fs, this.manager.repository.paths, this.manager.state.draft);
            this.bridge.openModel(files, this.desktop.fs);
            this.updatePreviews();
        });
    }
    openFolder() {
        if (this.manager.selection.length > 1) return;
        return this.run(() => this.desktop.open(this.manager.repository.paths.textures(this.manager.state.draft.weapon), true));
    }
    setStatus(row, status) {
        return this.run(() => {
            const repository = this.manager.repository;
            const rows = this.manager.state.selectedKeys.includes(row.key) ? this.manager.selection : [row];
            this.manager.state.packMetadata = saveStatuses(repository.fs, repository.paths, rows, status);
            Blockbench.showQuickMessage(`${rows.length} skin${rows.length === 1 ? '' : 's'}: ${status === null ? 'status cleared' : STATUSES[status].label}`, 2500);
        });
    }
    healthCheck() {
        if (!this.manager.state.ready) return;
        return this.run(() => {
            const repository = this.manager.repository, pack = repository.paths.pack;
            const report = checkPack(repository.fs, repository.paths);
            this.removeDialog('mcpskins_health');
            const dialog = new Dialog('mcpskins_health', {
                title: 'Pack Health Check', width: 780, buttons: ['Close'],
                component: healthComponent(report, issue => {
                    if (this.disposed || this.manager.repository.paths.pack !== pack) return;
                    return this.run(() => this.transition(() => {
                        this.manager.reload();
                        const row = this.manager.state.rows.find(row => row.key === issue.rowKey && String(row.skin.id ?? '') === issue.skinId)
                            || this.manager.state.rows.find(row => row.filename === issue.registry && String(row.skin.id ?? '') === issue.skinId);
                        if (!row) throw new Error('This skin is no longer available. Run the health check again.');
                        Object.assign(this.manager.state, {search: '', rarityFilter: '', collectionFilter: ''});
                        this.manager.select(row); this.remember(); this.updatePreviews();
                        dialog.hide();
                    }));
                }, issue => {
                    if (typeof Blockbench.showItemInFolder === 'function') Blockbench.showItemInFolder(issue.registry);
                })
            });
            this.dialogs.add(dialog);
            dialog.show();
            return report;
        });
    }
    context(row, event) {
        new Menu([{name: 'Status', icon: 'flag', children: [
                ...Object.entries(STATUSES).map(([status, info]) => ({name: info.label, icon: 'flag', color: info.color, click: () => this.setStatus(row, status)})),
                {name: 'Clear Status', icon: 'flag', click: () => this.setStatus(row, null)}
            ]}, {name: 'Duplicate Skin', icon: 'content_copy', click: () => this.duplicateSkin(row)},
            {name: 'Open File', icon: 'description', click: () => this.run(() => this.desktop.open(row.filename))},
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
