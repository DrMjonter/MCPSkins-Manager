'use strict';
const {Manager} = require('./state/manager');
const {VERSION} = require('./version');
const {AnimationSession} = require('./assets/animation');
const {canvasRaster} = require('./integration/raster');
const {animationComponent} = require('./ui/animation');
const {NativeAnimations,saveNativeMetadata} = require('./integration/native-animation');
const {UpdateChecker} = require('./integration/updates');
const {PackPaths, packDirectorySelection} = require('./domain/paths');
const {clone, equalJSON, defaultColor, emptyDraft, validComponent, normalizedWeapon, validWeapon, isDefaultWeapon, sanitizeWeaponNames, isObject} = require('./domain/skin');
const {exportInventory,runtimePlan,validateFilename} = require('./assets/pack-export');
const {ExportSelection} = require('./state/export');
const {exportComponent} = require('./ui/export');
const {createZip} = require('./integration/zip');
const {lodStatus,planLOD,writeLOD} = require('./assets/lod');
const {THEMES} = require('./domain/constants');
const {RegistryRepository} = require('./storage/registry');
const {deleteSkin:removeSkin} = require('./storage/delete-skin');
const {RarityRepository} = require('./storage/rarity-editor');
const {RarityEditor} = require('./state/rarities');
const {rarityComponent} = require('./ui/rarities');
const {CollectionRepository} = require('./storage/collections');
const {CollectionEditor} = require('./state/collections');
const {collectionComponent} = require('./ui/collections');
const {settingsComponent} = require('./ui/settings');
const {SETTINGS, settingsFrom} = require('./domain/preferences');
const {loadPackSettings, savePackSettings} = require('./storage/settings');
const {loadPackMetadata, savePackMetadata,metadataFile} = require('./storage/pack-metadata');
const {newPackPaths, createPack} = require('./storage/new-pack');
const {RECENT_PACKS, recentPacks, rememberPack} = require('./storage/recent-packs');
const {atomicJSON, isDirectory} = require('./storage/files');
const {availableStatuses, sortedStatuses, newCustomStatus, saveStatuses} = require('./domain/status');
const {customStatusComponent} = require('./ui/custom-status');
const {checkPack} = require('./assets/health');
const {healthSnapshot, healthSummary, healthIssueKey, applyHealthIgnores} = require('./assets/health-monitor');
const {shortcutComponent} = require('./ui/keyboard');
const {healthComponent} = require('./ui/health');
const {GunPackCatalog, SourceConflict, modelKey} = require('./gunpacks/catalog');
const {gunPackDialog, sourceDialog, itemCounts, scanSummary} = require('./ui/gunpacks');
const {prepareSkin, modelForEditing, assetSelection} = require('./assets/preparation');
const {previewCards} = require('./assets/previews');
const {Desktop} = require('./integration/desktop');
const {BlockbenchBridge} = require('./integration/blockbench');
const {message, confirmUnsaved, packDialog, newPackDialog, colorDialog, namePrefixDialog} = require('./ui/dialogs');

const GUNPACKS = 'mcpskins_asset_manager.gunpacks.v1';
const PREFERENCES = 'mcpskins_asset_manager.preferences.v1';
const RECOVERY = 'mcpskins_asset_manager.draft.v1';
const WEAPON_NAMES = 'mcpskins_asset_manager.weapon_names.v1';

class Controller {
    constructor(nativeRequire, storage = localStorage, options = {}) {
        this.manager = new Manager();
        this.updates = new UpdateChecker(VERSION, options);
        this.nativeAnimations = new NativeAnimations(); this.animations = new Map(); this.raster = options.raster || null;
        this.desktop = new Desktop(nativeRequire);
        this.bridge = new BlockbenchBridge(this.desktop.path);
        this.storage = storage;
        this.timer = null;
        this.healthTimer = null; this.healthPoll = null; this.healthRepository = null; this.healthStamp = null; this.healthReport = null;
        this.dialogs = new Set();
        this.switching = false;
        this.closingAllowed = false;
        this.closePrompt = false;
        this.disposed = false;
        this.prefixRequest = null;
        this.catalog = null; this.catalogAttempt = ''; this.catalogRoot = ''; this.sourceRequests = new Set();
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
        this.checkForUpdates();
        if (!this.healthPoll) {
            this.healthPoll = setInterval(() => { this.updateHealth(); this.updateLODStatus(); this.animations.forEach(session => session.poll()); this.nativeAnimations.poll(); }, 3000);
            if (this.healthPoll && typeof this.healthPoll.unref === 'function') this.healthPoll.unref();
        }
        this.manager.state.weaponNames = sanitizeWeaponNames(this.getStored(WEAPON_NAMES));
        const preferences = this.getStored(PREFERENCES);
        const storedSettings = this.getStored(SETTINGS);
        const settings = settingsFrom(storedSettings);
        if (!storedSettings && preferences && (preferences.theme === 'Blockbench' || Object.hasOwn(THEMES,preferences.theme))) settings.appearance.theme = preferences.theme;
        this.manager.state.settings = settings;
        this.manager.state.theme = settings.appearance.theme;
        if (!preferences) return;
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
            this.loadGunPacks();
        } catch (error) {
            this.manager.state.root = preferences.root;
            this.manager.state.notice = error.message;
            this.report(error);
        }
    }
    async checkForUpdates() {
        const update = await this.updates.check();
        if (!this.disposed) this.manager.state.update = update;
        return update;
    }
    openUpdate() {
        const update = this.manager.state.update;
        if (!this.disposed && update && typeof Blockbench.openLink === 'function') Blockbench.openLink(update.url);
    }
    loadMetadata() {
        const repository = this.manager.repository;
        try {
            this.manager.state.packMetadata = loadPackMetadata(repository.fs, repository.paths);
            repository.paths.modelReferences = this.manager.state.packMetadata.weapon_models || {};
            repository.paths.lodReferences = this.manager.state.packMetadata.weapon_lod_models || {};
        }
        catch (error) {
            this.manager.state.packMetadata = {title: 'Pack Name'};
            this.manager.state.notice = `Pack metadata unavailable: ${error.message}`;
        }
        this.refreshCollectionOptions();
    }
    refreshCollectionOptions() {
        if(this.disposed || !this.manager.repository) return;
        const repository=this.manager.repository;
        const scan=new CollectionRepository(repository.fs,repository.paths).scan();
        this.manager.state.collectionOptions=scan.rows.filter(row=>row.key!=='*').map(row=>row.name);
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
    gunPackSettings() {
        const saved = this.getStored(GUNPACKS);
        return isObject(saved) ? {directories: isObject(saved.directories) ? saved.directories : {}, choices: isObject(saved.choices) ? saved.choices : {}} : {directories: {}, choices: {}};
    }
    gunPackDirectory() {
        const s = this.manager.state, saved = this.gunPackSettings();
        const directory = saved.directories[s.root];
        return typeof directory === 'string' && this.desktop.path.isAbsolute(directory) ? directory : this.desktop.path.resolve(s.root, '..', 'tacz');
    }
    ensureGunPacks(force = false, directory = this.gunPackDirectory(), quiet = false) {
        if (!this.manager.state.ready || this.disposed) return null;
        directory = this.desktop.path.resolve(directory);
        if (!force && this.catalogAttempt === directory && this.catalogRoot === this.manager.state.root) return this.catalog;
        this.catalogAttempt = directory; this.catalogRoot = this.manager.state.root;
        if (this.catalog) this.catalog.dispose();
        this.catalog = null;
        const state = this.manager.state;
        Object.assign(state, {gunPackDirectory: directory, gunPackItems: [], gunPackMessage: 'Scanning gun packs...', gunPackWarnings: []});
        try {
            let addons = []; const addonWarnings = [];
            try { addons = this.desktop.lesRaisinsSources(this.desktop.path.resolve(state.root, '..', 'mods')); }
            catch (error) { addonWarnings.push(error.message); }
            const connection = this.desktop.connectGunPacks(directory, addons.length > 0), saved = this.gunPackSettings();
            const catalog = new GunPackCatalog(connection.fs, this.desktop.path, directory, this.desktop.require('zlib').inflateRawSync, saved.choices[directory] || {}, addons).scan();
            catalog.warnings.push(...addonWarnings);
            this.catalog = catalog;
            Object.assign(state, {gunPackItems: catalog.items.map(({id, name, kind}) => ({id, name, kind})), gunPackWarnings: catalog.warnings,
                gunPackMessage: itemCounts(catalog).map(([label, count]) => count + ' ' + label.toLowerCase()).join(' / ') + ` from ${catalog.sources.length} sources`});
            return catalog;
        } catch (error) {
            state.gunPackMessage = error.message;
            if (!quiet) throw error;
            return null;
        }
    }
    loadGunPacks() { return this.run(() => this.ensureGunPacks(false, this.gunPackDirectory(), true)); }
    scanGunPacks(directory = this.gunPackDirectory()) {
        this.manager.refreshRarities();
        return this.ensureGunPacks(true, directory);
    }
    gunPackScanSummary(catalog) {
        return scanSummary(catalog, this.manager.state.rarities, this.manager.state.warnings);
    }
    rescanGunPacks() {
        return this.run(() => {
            const catalog = this.scanGunPacks();
            if (catalog) message('Scan complete', this.gunPackScanSummary(catalog));
            return catalog;
        });
    }
    configureGunPacks() {
        if (!this.manager.state.ready) return;
        this.removeDialog('mcpskins_gunpacks');
        const dialog = gunPackDialog(this.gunPackDirectory(), directory => {
            const catalog = this.scanGunPacks(directory);
            if (!catalog) return false;
            const saved = this.gunPackSettings();
            saved.directories[this.manager.state.root] = catalog.directory;
            this.persist(GUNPACKS, saved);
            return this.gunPackScanSummary(catalog);
        });
        this.dialogs.add(dialog);
    }
    openRarities() {
        if (!this.manager.state.ready || this.disposed) return;
        if (this.rarityEditor) {
            const existing = [...this.dialogs].find(dialog => dialog.id === 'mcpskins_rarities');
            if (existing) { existing.show(); return existing; }
        }
        return this.run(() => {
            this.removeDialog('mcpskins_rarities');
            const repository = this.manager.repository;
            const editor = new RarityEditor(new RarityRepository(repository.fs, repository.paths),
                () => confirmUnsaved({title: 'Unsaved rarity edits', message: 'Save your rarity changes before continuing?'}),
                () => { this.manager.refreshRarities(); this.updateHealth(true); },
                () => !this.disposed && this.manager.repository === repository);
            this.rarityEditor = editor;
            const close = () => {
                editor.guard(() => { dialog.hide(); if (this.rarityEditor === editor) this.rarityEditor = null; });
                return false;
            };
            const dialog = new Dialog('mcpskins_rarities', {title: 'Pack Rarities', width: 1040, buttons: ['Close'], confirmIndex: 0, cancelIndex: 0,
                component: rarityComponent(editor), onConfirm: close, onCancel: close});
            this.dialogs.add(dialog); dialog.show(); return dialog;
        });
    }
    openCollections(createNew = false) {
        if (!this.manager.state.ready || this.disposed) return;
        if (this.collectionEditor) {
            const existing = [...this.dialogs].find(dialog => dialog.id === 'mcpskins_collections');
            if (existing) { existing.show(); if(createNew)this.collectionEditor.create(); return existing; }
        }
        const open=() => {
            this.removeDialog('mcpskins_collections');
            const repository = this.manager.repository;
            const originalDraft=this.manager.state.draft;
            const editor = new CollectionEditor(new CollectionRepository(repository.fs, repository.paths), this.manager.state.rarities,
                () => confirmUnsaved({title:'Unsaved collection edits', message:'Save your collection changes before continuing?'}),
                result => {
                    if (result.renamed) this.manager.state.collectionFilter = '';
                    if(createNew && result.created && this.manager.state.draft===originalDraft && this.manager.state.active) this.edit('collection',editor.state.draft.collection);
                    if(!this.manager.state.dirty)this.manager.reload();
                    this.refreshCollectionOptions();this.remember();this.updatePreviews();this.updateHealth(true);
                }, () => !this.disposed && this.manager.repository === repository && (createNew || !this.manager.state.dirty),
                () => !this.manager.state.dirty);
            this.collectionEditor = editor;
            if(createNew)editor.create();
            const close = () => {
                editor.guard(() => { dialog.hide(); if (this.collectionEditor === editor) this.collectionEditor = null; });
                return false;
            };
            const dialog = new Dialog('mcpskins_collections', {title:'Collections Manager', width:1040, buttons:['Close'], confirmIndex:0, cancelIndex:0,
                component:collectionComponent(editor), onConfirm:close, onCancel:close});
            this.dialogs.add(dialog); dialog.show(); return dialog;
        };
        return createNew?this.run(open):this.runTransition(open);
    }
    openExport() {
        if(!this.manager.state.ready || this.disposed)return;
        return this.runTransition(()=>{
            if(this.cancelPackExport)this.cancelPackExport();
            this.removeDialog('mcpskins_export');
            const repository=this.manager.repository,metadata=loadPackMetadata(repository.fs,repository.paths);
            const inventory=exportInventory(repository.fs,repository.paths,metadata,this.manager.state.settings.customStatuses);
            const selection=new ExportSelection(inventory,metadata),state=selection.state;
            let canceled=false;
            const cancel=()=>{canceled=true;};this.cancelPackExport=cancel;
            const exportPack=async full=>{
                if(state.busy || canceled)return;
                Object.assign(state,{busy:true,error:'',notice:'',progress:'Preparing export...'});
                try {
                    const filename=validateFilename(state.filename);
                    if(!state.version.trim())throw new Error('Enter a pack version for the export.');
                    const current=exportInventory(repository.fs,repository.paths,metadata,this.manager.state.settings.customStatuses);
                    if(!full) {
                        const byKey=new Map(inventory.rows.map(row=>[row.key,row]));
                        for(const key of state.selected) {
                            const before=byKey.get(key),after=current.rows.find(row=>row.key===key);
                            if(!before || !after || !equalJSON(before.data,after.data))throw new Error('Skin registries changed. Reopen Export Pack before exporting.');
                        }
                    }
                    const plan=full?{entries:[...current.files.values()],skins:current.rows.length,omitted:0}:runtimePlan(current,state.selected);
                    const zip=await createZip(plan.entries,this.desktop.require('zlib').deflateRawSync,
                        (count,total)=>{state.progress='Packing '+count+' of '+total+' files...';},
                        ()=>canceled || this.disposed || this.manager.repository!==repository);
                    if(canceled || this.disposed || this.manager.repository!==repository)return;
                    const outputDirectory=repository.paths.inside('Packed');
                    if(this.desktop.path.relative(repository.paths.pack,outputDirectory)==='')throw new Error('The export folder must be beside the pack. Choose a pack folder other than Packed.');
                    repository.fs.mkdirSync(outputDirectory,{recursive:true});
                    let saved=false;
                    Blockbench.export({type:'MCPSkins pack',extensions:['zip'],name:filename,startpath:this.desktop.path.join(outputDirectory,filename),savetype:'buffer',content:zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength),resource_id:'mcpskins_pack_export'},()=>{
                        saved=true;
                        state.notice='Exported '+plan.skins+' skin(s) in '+plan.entries.length+' files'+(full?'.':' ('+plan.omitted+' files omitted).');
                        Blockbench.showQuickMessage('Pack exported',3500);
                    });
                    if(!saved)state.notice='Export canceled.';
                } catch(error) {state.error=error.message;}
                finally {state.busy=false;state.progress='';}
            };
            const close=()=>{cancel();dialog.hide();return false;};
            const dialog=new Dialog('mcpskins_export',{title:'Export Pack',width:1000,buttons:[],component:exportComponent(selection,exportPack),onConfirm:close,onCancel:close});
            this.dialogs.add(dialog);dialog.show();return dialog;
        });
    }
    async resolveGunPack(draft) {
        const catalog = this.ensureGunPacks(false, this.gunPackDirectory(), true);
        if (!catalog) return null;
        for (let attempts = 0; attempts < 32; attempts++) {
            try { return catalog.resolve(draft.weapon, draft.kind); }
            catch (error) {
                if (!(error instanceof SourceConflict)) throw error;
                const choice = await new Promise(resolve => {
                    const finish = value => { this.sourceRequests.delete(finish); resolve(value); };
                    this.sourceRequests.add(finish);
                    this.removeDialog('mcpskins_gunpack_source');
                    const dialog = sourceDialog(error, finish); this.dialogs.add(dialog);
                });
                if (!choice || this.disposed || this.catalog !== catalog || this.manager.state.draft !== draft) return false;
                catalog.choices[error.resource] = choice;
                const saved = this.gunPackSettings(); saved.choices[catalog.directory] = {...catalog.choices}; this.persist(GUNPACKS, saved);
            }
        }
        throw new Error('Too many conflicting resources. Check your installed gun packs.');
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
            if (typeof draft[key] !== typeof defaults[key] || (Array.isArray(defaults[key]) && !Array.isArray(draft[key]))) return;
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
            let saved = false;
            if (this.manager.state.dirty) {
                const action = await confirmUnsaved();
                if (this.disposed || action === 'cancel') return false;
                if (action === 'save') {
                    const view = {search: this.manager.state.search, rarityFilter: this.manager.state.rarityFilter, collectionFilter: this.manager.state.collectionFilter};
                    if (!await this.saveWithPrefix()) return false;
                    if (view.collectionFilter && !this.manager.collections().includes(view.collectionFilter)) view.collectionFilter = '';
                    Object.assign(this.manager.state, view);
                    saved = true;
                }
            }
            if (this.disposed) return false;
            await callback({saved});
            return true;
        } finally { this.switching = false; }
    }
    runTransition(callback) {
        return this.run(() => this.transition(callback)).then(result => result === true);
    }
    freshRows(rows) {
        return rows.map(row => {
            const fresh = this.manager.state.rows.find(candidate => candidate.key === row.key && candidate.skin.id === row.skin.id)
                || this.manager.state.rows.find(candidate => candidate.filename === row.filename && candidate.skin.id === row.skin.id)
                || (this.manager.selected && this.manager.selected.key === row.key ? this.manager.selected : null);
            if (!fresh) throw new Error('This skin is no longer available. Refresh Files before continuing.');
            return fresh;
        });
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
                const paths = values.create_pack ? newPackPaths(this.desktop.path, root, folder, namespace) : new PackPaths(this.desktop.path, root, folder, namespace);
                connection = values.create_pack ? this.desktop.connect(root) : connection && connection.packDirectory === directory ? connection : this.readPackDirectory(directory);
                const switching = !s.ready || paths.root !== s.root || folder !== s.folder || namespace !== s.namespace;
                const apply = () => {
                    if (values.create_pack) createPack(connection.fs, paths, values);
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
                    this.loadGunPacks();
                };
                if (switching) return this.transition(apply);
                apply();
                return true;
            }, recentPacks(this.desktop.path, this.getStored(RECENT_PACKS)), (directory, author, connection) => this.savePackAuthor(directory, author, connection), submit => {
                this.removeDialog('mcpskins_new_pack');
                const createDialog = newPackDialog(s.root, values => {
                    const paths = newPackPaths(this.desktop.path, values.parent_directory, values.pack_folder, values.pack_namespace);
                    return submit({...values, pack_directory: paths.pack, pack_namespace: paths.namespace, create_pack: true}, null);
                }, () => { if (!this.disposed) dialog.show(); });
                this.dialogs.add(createDialog);
                return createDialog;
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
    select(row, event = {}) {
        const rows = this.manager.selectionFor(row, event), anchor = this.manager.anchorKey;
        if (rows.length === this.manager.selection.length && rows.every(item => this.manager.state.selectedKeys.includes(item.key))) return;
        return this.runTransition(() => {
            const fresh = this.freshRows(rows);
            this.manager.anchorKey = event.shiftKey && anchor ? anchor : row.key;
            this.manager.selectRows(fresh); this.remember(); this.updatePreviews();
        });
    }
    selectAll() {
        if (!this.manager.state.ready || !this.manager.state.rows.length) return;
        return this.runTransition(() => {
            const rows = this.manager.state.rows.slice();
            this.manager.anchorKey = rows[0] ? rows[0].key : '';
            this.manager.selectRows(rows); this.remember(); this.updatePreviews();
        });
    }
    updateSettings(section, key, value) {
        if (this.disposed || !Object.hasOwn(this.manager.state.settings,section) || !Object.hasOwn(this.manager.state.settings[section],key)) return;
        if (section === 'appearance' && key === 'theme') return this.changeTheme(value);
        const settings = this.manager.state.settings;
        this.manager.state.settings = settingsFrom({...settings,[section]:{...settings[section],[key]:value}});
        this.persist(SETTINGS,this.manager.state.settings);
        if (section === 'health') {
            this.healthStamp = null;
            if (this.manager.state.settings.health.live) this.updateHealth(true);
            else this.manager.state.health = {...this.manager.state.health,status:'manual'};
        }
    }
    async factoryReset() {
        if (this.disposed || this.resetPending) return false;
        this.resetPending = true;
        try {
            const answer = await new Promise(resolve => Blockbench.showMessageBox({title:'Factory Reset',
                message:'This will reset all settings. Are you sure?', buttons:['Yes','Cancel'], confirm:0, cancel:1},resolve));
            if (answer !== 0 || this.disposed) return false;
            const settings = settingsFrom();
            this.manager.state.settings = settings;
            this.manager.state.theme = settings.appearance.theme;
            this.persist(SETTINGS,settings);
            this.persist(PREFERENCES,{root:this.manager.state.root,theme:settings.appearance.theme});
            this.healthStamp = null;
            this.updateHealth(true);
            return true;
        } finally { this.resetPending = false; }
    }
    showSettings() {
        if (this.disposed) return;
        this.removeDialog('mcpskins_settings');
        const dialog = new Dialog('mcpskins_settings', {title:'Settings',width:760,buttons:[],
            component:settingsComponent(this.manager.state,(section,key,value) => this.updateSettings(section,key,value),url => { if (!this.disposed) Blockbench.openLink(url); },() => this.factoryReset(),() => dialog.hide())});
        this.dialogs.add(dialog); dialog.show(); return dialog;
    }
    showShortcuts() {
        this.removeDialog('mcpskins_shortcuts');
        const dialog = new Dialog('mcpskins_shortcuts', {title: 'MCPSkins Keyboard Shortcuts', width: 700, buttons: ['Close'], component: shortcutComponent()});
        this.dialogs.add(dialog); dialog.show();
    }
    duplicateSkin(row) {
        return this.runTransition(() => {
            this.manager.duplicate(this.freshRows([row])[0]); this.remember(); this.updatePreviews();
        });
    }
    newSkin() {
        if (!this.manager.state.ready) return this.configure();
        return this.runTransition(() => { this.manager.clear(); this.remember(); this.updatePreviews(); });
    }
    refresh() {
        if (!this.manager.state.ready) return;
        return this.runTransition(() => {
            this.manager.reload(); this.manager.state.notice = ''; this.loadMetadata(); this.remember(); this.updatePreviews();
        });
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
    resetColor() { this.edit('color', defaultColor(this.manager.state.draft.rarity, this.manager.state.rarities)); }
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
    updateLODStatus() {
        const state=this.manager.state;
        if(!state.ready || this.disposed)return;
        state.lodFiles=[];
        if(this.manager.selection.length>1 || this.manager.duplicateSource)return;
        try {state.lodFiles=lodStatus(this.manager.repository.fs,this.manager.repository.paths,state.draft);}
        catch(error){state.lodFiles=[{kind:'model',label:'LOD Model',path:'',filename:'',status:'invalid',message:error.message}];}
    }
    generateLOD() {
        const state=this.manager.state;
        if(!state.ready || state.draft.kind!=='gun' || this.manager.selection.length>1 || this.manager.duplicateSource)return;
        return this.run(async()=>{
            if(!state.selectedKey || state.dirty)throw new Error('Save the skin entry before generating LODs.');
            const repository=this.manager.repository,draft=state.draft;
            let source=null;
            try{source=await this.resolveGunPack(draft);}catch(error){if(!repository.paths.lodReferences[modelKey(draft.weapon,draft.kind)] && !draft.weapon.startsWith('tacz:'))throw error;}
            if(source===false || this.disposed || this.manager.repository!==repository || state.draft!==draft || state.dirty)return;
            let plan=planLOD(repository.fs,repository.paths,draft,source);
            const guard=plan=>{
                const same=(file,list)=>file && list.some(candidate=>this.bridge.same(file,candidate));
                if(typeof ModelProject!=='undefined')for(const project of ModelProject.all) {
                    const outputs=plan.files.map(([file])=>file);
                    if(same(project.export_path,outputs) || same(project.save_path,outputs) || (project.textures || []).some(texture=>same(texture.path,outputs)))throw new Error('Save and close open LOD model or texture projects before generating LODs.');
                    if(project.saved===false && (same(project.export_path,plan.sources) || same(project.save_path,plan.sources)) || (project.textures || []).some(texture=>texture.saved===false && same(texture.path,plan.sources)))throw new Error('Save the full model and painted textures in Blockbench before generating LODs.');
                }
                for(const session of this.animations.values())if((session.running || session.state.busy || session.state.dirty) && same(session.texture,[...plan.sources,...plan.files.map(([file])=>file)]))throw new Error('Save or discard pending animation edits before generating LODs.');
            };
            guard(plan);
            if(plan.existing.length) {
                const replace=await new Promise(resolve=>Blockbench.showMessageBox({title:'Generate LODs',message:'Replace existing LOD files with copies of this skin\'s full model and textures?',buttons:['Replace','Cancel'],confirm:1,cancel:1},resolve));
                if(replace!==0 || this.disposed || this.manager.repository!==repository || state.draft!==draft || state.dirty)return;
                plan=planLOD(repository.fs,repository.paths,draft,source);guard(plan);
            }
            const metadata=loadPackMetadata(repository.fs,repository.paths);
            if(metadata.weapon_lod_models!==undefined && !isObject(metadata.weapon_lod_models))throw new Error('Pack weapon_lod_models must be a JSON object.');
            const lodReferences={...metadata.weapon_lod_models,[modelKey(draft.weapon,draft.kind)]:plan.reference};
            const updated={...metadata,weapon_lod_models:lodReferences};
            if(source) {
                if(metadata.weapon_models!==undefined && !isObject(metadata.weapon_models))throw new Error('Pack weapon_models must be a JSON object.');
                updated.weapon_models={...metadata.weapon_models,[modelKey(draft.weapon,draft.kind)]:source.modelRef};
            }
            writeLOD(repository.fs,repository.paths,[...plan.files,[metadataFile(repository.paths),JSON.stringify(updated,null,2)+'\n']]);
            state.packMetadata=updated;repository.paths.lodReferences=lodReferences;
            if(updated.weapon_models)repository.paths.modelReferences=updated.weapon_models;
            const targets=plan.files.map(([file])=>file),matches=filename=>targets.some(file=>this.bridge.same(filename,file));
            for(const [filename,session] of this.animations)if(matches(filename)){session.dispose();this.animations.delete(filename);}
            for(const record of this.nativeAnimations.records)if(matches(record.texture.path))this.nativeAnimations.records.delete(record);
            state.notice='LOD model and textures generated from the saved full model and painted textures. UVs are preserved; geometry was not simplified.';
            this.updateLODStatus();this.updateHealth(true);Blockbench.showQuickMessage('LODs generated',3000);
        });
    }
    updatePreviews() {
        clearTimeout(this.timer);
        if (!this.manager.state.ready || this.disposed) return;
        this.scheduleHealth();
        this.updateLODStatus();
        this.manager.state.customModel = false;
        if (this.manager.selection.length > 1 || this.manager.duplicateSource) { this.manager.state.previews = []; return; }
        try {
            const draft = this.manager.state.draft;
            const canonical = this.manager.repository.paths.modelForSkin(draft.weapon, assetSelection(this.manager.repository.paths, draft).id, draft.kind);
            this.manager.state.customModel = !!canonical && this.desktop.fs.existsSync(canonical);
        } catch { /* A new skin may not have an ID yet. */ }
        try {
            this.manager.state.previews = previewCards(this.desktop.fs, this.manager.repository.paths,
                this.manager.state.draft, this.desktop.pathToFileURL);
        } catch (error) { this.manager.state.notice = `Preview unavailable: ${error.message}`; }
    }
    toggleCustomModel() {
        if (!this.manager.state.selectedKey || this.manager.state.dirty || this.manager.selection.length > 1) return;
        if (!this.manager.state.customModel) return this.openModel(null, true);
        return this.run(() => {
            const repository = this.manager.repository, draft = this.manager.state.draft;
            const {folder, id} = assetSelection(repository.paths, draft);
            const model = repository.paths.modelForSkin(draft.weapon, id, draft.kind);
            if (!model || !repository.fs.existsSync(model)) return;
            const reference = this.desktop.path.join(folder, id + '.geo.json');
            if (typeof ModelProject !== 'undefined' && ModelProject.all.some(project => [model,reference].some(file => this.bridge.same(project.export_path,file) || this.bridge.same(project.save_path,file)))) {
                throw new Error('Save and close this skin\'s model projects before switching to the stock model.');
            }
            repository.fs.mkdirSync(folder, {recursive:true});
            // Preserve both copies if a separate editing reference already exists.
            let backup = null;
            if (repository.fs.existsSync(reference)) {
                const directory = repository.paths.inside(repository.paths.folder, '.mcpskins_manager', 'model_backups');
                repository.fs.mkdirSync(directory, {recursive:true});
                backup = this.desktop.path.join(directory,id + '.geo.json');
                for (let number=2; repository.fs.existsSync(backup); number++) backup = this.desktop.path.join(directory,id + '_' + number + '.geo.json');
                repository.fs.copyFileSync(reference,backup,1);
            }
            try {
                repository.fs.copyFileSync(model,reference);
                repository.fs.unlinkSync(model);
            } catch (error) {
                if (backup) repository.fs.copyFileSync(backup,reference);
                throw error;
            }
            this.manager.state.notice = 'Stock geometry will be used in game. Your model is kept as an editing reference; Use Custom Model enables it again.';
            this.updatePreviews();
        });
    }
    openModel(frameTexture = null, customModel = false) {
        if (this.manager.selection.length > 1 || this.manager.duplicateSource) return;
        return this.run(async () => {
            const repository = this.manager.repository, draft = this.manager.state.draft;
            if (customModel && typeof ModelProject !== 'undefined') {
                const {folder,id} = assetSelection(repository.paths,draft);
                const references = [this.desktop.path.join(folder,id + '.json'),this.desktop.path.join(folder,id + '.geo.json')];
                const open = ModelProject.all.find(project => references.some(file => this.bridge.same(file,project.export_path) || this.bridge.same(file,project.save_path)));
                if (open && (open.saved === false || (open.textures || []).some(texture => texture.saved === false))) throw new Error('Save the open model and its painted textures before enabling custom geometry.');
            }
            let files;
            // Resolve all sources before copying. Source choices can be required for
            // referenced textures as well as the primary gun/attachment definition.
            for (let attempts = 0; attempts < 32; attempts++) {
                let source;
                try { source = await this.resolveGunPack(draft); }
                catch (error) {
                    // Existing/manual assets remain usable if a source pack was removed
                    // or its display references are broken.
                    try { files = prepareSkin(repository.fs, repository.paths, draft, null, {customModel,...this.manager.state.settings.assets}); }
                    catch { throw error; }
                    this.manager.state.notice = 'Using existing/manual assets. Gun-pack source: ' + error.message;
                    break;
                }
                if (source === false || this.disposed || this.manager.repository !== repository || this.manager.state.draft !== draft) return;
                try {
                    if (source && typeof ModelProject !== 'undefined') {
                        const selection = assetSelection(repository.paths, draft);
                        const canonical = modelForEditing(repository.fs, repository.paths, draft, source, customModel);
                        if (!repository.fs.existsSync(canonical)) {
                            const {folder, id} = selection;
                            const legacy = [this.desktop.path.join(folder, id + '.json'), this.desktop.path.join(folder, id + '.geo.json')];
                            const open = ModelProject.all.find(project => legacy.some(file => this.bridge.same(file, project.export_path) || this.bridge.same(file, project.save_path)));
                            if (open && (open.saved === false || (open.textures || []).some(texture => texture.saved === false))) throw new Error('Save the open model and its painted textures before migrating it to the MCPSkins geometry path.');
                        }
                    }
                    files = prepareSkin(repository.fs, repository.paths, draft, source, {customModel,...this.manager.state.settings.assets});
                    if (source && !source.editorOnly) {
                        try {
                            const metadata = loadPackMetadata(repository.fs, repository.paths);
                            if (metadata.weapon_models !== undefined && !isObject(metadata.weapon_models)) throw new Error('Pack weapon_models must be a JSON object.');
                            if (metadata.weapon_lod_models !== undefined && !isObject(metadata.weapon_lod_models)) throw new Error('Pack weapon_lod_models must be a JSON object.');
                            const references = {...metadata.weapon_models, [modelKey(draft.weapon, draft.kind)]: source.modelRef};
                            const lodReferences={...metadata.weapon_lod_models,[modelKey(draft.weapon,draft.kind)]:source.lodModelRef || null};
                            this.manager.state.packMetadata = metadata.weapon_models && metadata.weapon_models[modelKey(draft.weapon, draft.kind)] === source.modelRef && metadata.weapon_lod_models && metadata.weapon_lod_models[modelKey(draft.weapon,draft.kind)]===(source.lodModelRef || null)
                                ? metadata : savePackMetadata(repository.fs, repository.paths, {weapon_models: references,weapon_lod_models:lodReferences});
                            repository.paths.modelReferences = references;
                            repository.paths.lodReferences = lodReferences;
                        } catch (error) { for (const filename of files.created) repository.fs.unlinkSync(filename); throw error; }
                    }
                    if (source && source.editorOnly) this.manager.state.notice = 'LesRaisins geometry is an editing reference. MCPSkins applies texture and icon changes to these items.';
                    break;
                } catch (error) {
                    if (!(error instanceof SourceConflict)) throw error;
                    const choice = await new Promise(resolve => {
                        const finish = value => { this.sourceRequests.delete(finish); resolve(value); };
                        this.sourceRequests.add(finish);
                        this.removeDialog('mcpskins_gunpack_source');
                        const dialog = sourceDialog(error, finish); this.dialogs.add(dialog);
                    });
                    if (!choice || this.disposed || this.manager.repository !== repository || this.manager.state.draft !== draft) return;
                    this.catalog.choices[error.resource] = choice;
                    const saved = this.gunPackSettings(); saved.choices[this.catalog.directory] = {...this.catalog.choices}; this.persist(GUNPACKS, saved);
                }
            }
            if (!files) throw new Error('Could not resolve gun-pack assets.');
            for(const texture of [files.texture,files.normal,files.specular].filter(Boolean)) {
                const manifest=this.desktop.path.join(this.desktop.path.dirname(texture),this.desktop.path.basename(texture,'.png')+'_frames','animation.json');
                if(repository.fs.existsSync(manifest)) {
                    const session=this.animationSession(repository,texture); await session.poll();
                    if(session.state.error) this.manager.state.notice=session.state.error;
                }
            }
            if (frameTexture) {
                if (!repository.fs.existsSync(frameTexture)) throw new Error('Frame PNG is missing.');
                files = {...files, texture: frameTexture, normal: null, specular: null, animationFrame: true};
            }
            this.bridge.openModel(files, repository.fs);
            this.updatePreviews();
            return files;
        });
    }
    animationSession(repository,texture) {
        let session=this.animations.get(texture);
        if(!session || session.disposed) {
            if(!this.raster) this.raster=canvasRaster();
            session=new AnimationSession(repository.fs,repository.paths,texture,this.raster,{
                url:file=>this.desktop.pathToFileURL(file).href,
                canWrite:files=>{
                    if(typeof ModelProject!=='undefined') for(const project of ModelProject.all) for(const texture of project.textures || [])
                        if(texture.saved===false && files.some(file=>this.bridge.same(texture.path,file))) throw new Error('Save the open texture edits in Blockbench before rebuilding.');
                },
                saved:()=>{ if(!this.disposed && this.manager.repository && this.manager.repository.paths.pack===repository.paths.pack) this.updatePreviews(); },
                error:message=>{if(!this.disposed && this.manager.repository && this.manager.repository.paths.pack===repository.paths.pack) this.manager.state.notice='Animation: '+message;}
            });
            this.animations.set(texture,session);
        }
        return session;
    }
    duplicateCurrentFrame() {
        return this.run(async ()=>{
            const texture=this.nativeAnimations.get('Texture')?.selected;
            let session=texture?.path ? this.animations.get(texture.path) : null;
            if(!session && texture?.path && this.manager.selected && this.manager.selection.length===1) {
                const repository=this.manager.repository,selection=assetSelection(repository.paths,this.manager.state.draft);
                const paths=['','_n','_s','_icon','_hud','_hud_empty','_lod'].map(suffix=>repository.paths.path.join(selection.folder,selection.id+suffix+'.png'));
                if(paths.some(file=>this.bridge.same(file,texture.path))) session=this.animationSession(repository,texture.path);
            }
            if(session) await session.preferNative();
            if(this.nativeAnimations.get('Texture')?.selected!==texture) throw new Error('The selected texture changed. Try duplicating the current frame again.');
            return this.nativeAnimations.duplicateCurrentFrame(session);
        });
    }
    openAnimatedTextures() {
        if (!this.manager.selected || this.manager.selection.length > 1 || this.manager.duplicateSource) return;
        return this.run(async () => {
            const repository=this.manager.repository, selected=this.manager.selected;
            const selection=assetSelection(repository.paths,this.manager.state.draft);
            if(selection.id!==selected.skin.id) throw new Error('Save the skin ID change before editing animation frames.');
            if(!this.raster) this.raster=canvasRaster();
            this.removeDialog('mcpskins_animation');
            const targets=[{id:'skin',label:'Skin',suffix:''},{id:'normal',label:'Normal map',suffix:'_n'},{id:'specular',label:'Specular map',suffix:'_s'},
                {id:'icon',label:'Icon',suffix:'_icon'},...(this.manager.state.draft.kind==='gun'?[{id:'hud',label:'HUD',suffix:'_hud'},{id:'hud_empty',label:'Empty HUD',suffix:'_hud_empty'},{id:'lod',label:'LOD',suffix:'_lod'}]:[])];
            const getSession=target=>{
                const value=this.animationSession(repository,this.desktop.path.join(selection.folder,selection.id+target.suffix+'.png'));
                if(!value.running && !value.state.dirty) value.load();
                return value;
            };
            let session=getSession(targets[0]);
            await session.preferNative();
            const state={target:'skin',targets,session:session.state,error:''};
            const execute=async callback=>{ try { state.error=''; return await callback(); } catch(error) { state.error=error.message; return false; } };
            const settle=async action=>{
                if(session.running) await session.running;
                if(session.state.dirty) {
                    const choice=await confirmUnsaved({title:'Unsaved animation settings',message:'Save and build the animation before continuing?'});
                    if(choice==='cancel') return false;
                    if(choice==='save') { try { saveNativeMetadata(session,session.state);this.nativeAnimations.applySessionSettings(session); } catch(error) {session.state.error=error.message;return false;} }
                    if(choice==='discard') session.load();
                }
                return action();
            };
            const importImages=strip=>{
                const targetSession=session;
                Blockbench.import({extensions:['png'],type:'PNG images',readtype:'buffer',multiple:!strip},files=>{
                    if(!files || !files.length || this.disposed) return;
                    execute(async ()=>{
                        if(targetSession.options.canWrite) targetSession.options.canWrite([targetSession.texture]);
                        await targetSession.preferNative();
                        const frames=files.slice().sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})).map(file=>new Uint8Array(file.content));
                        return strip ? targetSession.importStrip(frames[0]) : targetSession.importFrames(frames,true);
                    });
                });
            };
            const close=()=>{ execute(()=>settle(()=>dialog.hide())); return false; };
            const dialog=new Dialog('mcpskins_animation',{title:'Animated Textures',width:950,buttons:['Close'],confirmIndex:0,cancelIndex:0,onConfirm:close,onCancel:close,
                component:animationComponent(state,{
                    target:id=>execute(()=>settle(async ()=>{ const target=targets.find(target=>target.id===id); if(!target) return; session=getSession(target); await session.preferNative(); state.target=id; state.session=session.state; })),
                    edit:(key,value)=>session.edit(key,value),timing:(index,value)=>session.editTiming(index,value),
                    importFrames:()=>importImages(false),importStrip:()=>importImages(true),
                    save:()=>execute(()=>{
                        saveNativeMetadata(session,session.state);
                        this.nativeAnimations.applySessionSettings(session);
                        return true;
                    }),
                    folder:()=>execute(()=>{ repository.fs.mkdirSync(selection.folder,{recursive:true}); return this.desktop.open(selection.folder,true); }),
                    native:()=>execute(()=>settle(async ()=>{
                        if(this.manager.repository!==repository || this.manager.selected!==selected) throw new Error('Select the original skin before opening its native editor.');
                        await session.preferNative();dialog.hide();
                        try {
                            const files=await this.openModel(session.texture);if(!files || this.disposed) {if(!this.disposed) dialog.show();return false;}
                            if(!session.state.dirty) session.load();
                            await session.preferNative();
                            return await this.nativeAnimations.open(session,(a,b)=>this.bridge.same(a,b));
                        } catch(error) {if(!this.disposed) dialog.show();throw error;}
                    }))
                })});
            this.dialogs.add(dialog); dialog.show(); return dialog;
        });
    }
    openFolder() {
        if (!this.manager.state.ready || this.manager.selection.length > 1) return;
        return this.run(() => {
            const repository = this.manager.repository, folder = repository.paths.textures(this.manager.state.draft.weapon);
            repository.fs.mkdirSync(folder, {recursive: true});
            this.scheduleHealth();
            return this.desktop.open(folder, true);
        });
    }
    setStatus(row, status) {
        return this.run(() => {
            const repository = this.manager.repository;
            const rows = this.manager.state.selectedKeys.includes(row.key) ? this.manager.selection : [row];
            const custom=this.manager.state.settings.customStatuses;
            this.manager.state.packMetadata = saveStatuses(repository.fs, repository.paths, rows, status,custom);
            if(this.manager.state.settings.health.live)this.updateHealth(true);
            Blockbench.showQuickMessage(`${rows.length} skin${rows.length === 1 ? '' : 's'}: ${status === null ? 'Unassigned' : availableStatuses(custom)[status].label}`, 2500);
        });
    }
    createCustomStatus() {
        if(this.disposed) return;
        this.removeDialog('mcpskins_custom_status');
        const state={name:'',order:'15',color:'#6DA9E4',error:''};
        const dialog=new Dialog('mcpskins_custom_status',{title:'Custom Status',width:440,buttons:['Cancel','Done'],confirmIndex:1,cancelIndex:0,
            component:customStatusComponent(state),onConfirm:()=>{
                try {
                    if(this.disposed) return false;
                    const current=this.manager.state.settings;
                    const status=newCustomStatus(state,current.customStatuses);
                    const settings=settingsFrom({...current,customStatuses:[...current.customStatuses,status]});
                    this.storage.setItem(SETTINGS,JSON.stringify(settings));
                    this.manager.state.settings=settings;
                    Blockbench.showQuickMessage('Custom status added',2500);
                    dialog.hide();
                } catch(error) {state.error=error.message;return false;}
            }});
        this.dialogs.add(dialog);dialog.show();return dialog;
    }
    scheduleHealth() {
        clearTimeout(this.healthTimer);
        this.healthTimer = setTimeout(() => this.updateHealth(), 160);
    }
    updateHealth(force = false) {
        if (this.disposed || !this.manager.state.ready || !this.manager.repository) return null;
        if (!force && !this.manager.state.settings.health.live) {
            if (!this.healthReport || this.healthRepository !== this.manager.repository) this.manager.state.health = {...this.manager.state.health,status:'manual'};
            return this.healthRepository === this.manager.repository ? this.healthReport : null;
        }
        const repository = this.manager.repository;
        let stamp, report;
        try {
            stamp = healthSnapshot(repository.fs, repository.paths)+JSON.stringify([this.manager.state.settings.health,this.manager.state.settings.customStatuses]);
            if (!force && this.healthRepository === repository && this.healthStamp === stamp && this.healthReport) return this.healthReport;
            report = checkPack(repository.fs, repository.paths, {...this.manager.state.settings.health,customStatuses:this.manager.state.settings.customStatuses});
            let metadata = {};
            try { metadata = loadPackMetadata(repository.fs, repository.paths); } catch { /* The report already includes the metadata error. */ }
            applyHealthIgnores(report, repository.paths, metadata);
        } catch (error) {
            report = {files: 0, skins: 0, issues: [{severity: 'error', message: 'Unable to check pack: ' + error.message,
                filename: repository.paths.pack, registry: repository.paths.pack, rowKey: '', skinId: ''}]};
        }
        this.healthRepository = repository; this.healthStamp = stamp; this.healthReport = report;
        this.manager.state.health = healthSummary(report);
        return report;
    }
    setHealthIgnored(repository, issue, ignored) {
        if (this.disposed || this.manager.repository !== repository) return Promise.resolve(null);
        return this.run(() => {
            const metadata = loadPackMetadata(repository.fs, repository.paths);
            const keys = new Set(Array.isArray(metadata.ignored_health_issues) ? metadata.ignored_health_issues.filter(key => typeof key === 'string') : []);
            const key = healthIssueKey(repository.paths, issue);
            if (ignored) keys.add(key); else keys.delete(key);
            this.manager.state.packMetadata = savePackMetadata(repository.fs, repository.paths, {ignored_health_issues: [...keys]});
            return this.updateHealth(true);
        });
    }
    healthCheck() {
        if (!this.manager.state.ready) return;
        return this.run(() => {
            const repository = this.manager.repository, pack = repository.paths.pack;
            const report = this.updateHealth(true);
            this.removeDialog('mcpskins_health');
            const dialog = new Dialog('mcpskins_health', {
                title: 'Pack Health Check', width: 780, buttons: ['Close'],
                component: healthComponent(report, issue => {
                    if (this.disposed || this.manager.repository.paths.pack !== pack) return;
                    return this.runTransition(({saved}) => {
                        const selected = this.manager.selected;
                        const id = saved && selected && selected.key === issue.rowKey ? String(selected.skin.id ?? '') : issue.skinId;
                        this.manager.reload();
                        const row = this.manager.state.rows.find(row => row.key === issue.rowKey && String(row.skin.id ?? '') === id)
                            || this.manager.state.rows.find(row => row.filename === issue.registry && String(row.skin.id ?? '') === id);
                        if (!row) throw new Error('This skin is no longer available. Run the health check again.');
                        Object.assign(this.manager.state, {search: '', rarityFilter: '', collectionFilter: ''});
                        this.manager.select(row); this.remember(); this.updatePreviews();
                        dialog.hide();
                    });
                }, issue => {
                    if (typeof Blockbench.showItemInFolder === 'function') Blockbench.showItemInFolder(issue.registry);
                }, (issue, ignored) => this.setHealthIgnored(repository, issue, ignored))
            });
            this.dialogs.add(dialog);
            dialog.show();
            return report;
        });
    }
    deleteSkin(row) {
        const repository=this.manager.repository;
        return this.runTransition(async () => {
            const target=this.freshRows([row])[0];
            const choice=await new Promise(resolve=>Blockbench.showMessageBox({title:'Delete Skin',
                message:'Delete "'+String(target.skin.name || target.skin.id)+'"?\n\nFull Delete removes all related files, including textures and icons.\n\nDelete Entry only removes skin registry entry.',
                buttons:['Full Delete','Delete Entry','Cancel'],confirm:2,cancel:2},resolve));
            if (choice!==0 && choice!==1 || this.disposed || this.manager.repository!==repository) return;
            const result=removeSkin(repository,target,choice===0,assets=>{
                const matches=filename=>filename && assets.related.some(file=>this.bridge.same(filename,file));
                if(typeof ModelProject!=='undefined' && ModelProject.all.some(project=>matches(project.export_path) || matches(project.save_path) || (project.textures || []).some(texture=>matches(texture.path)))) {
                    throw new Error('Save and close the skin\'s open model and texture projects before Full Delete. Delete Entry keeps those files.');
                }
                for(const session of this.animations.values()) if(matches(session.texture) && !session.disposed && (session.running || session.state.busy || session.state.dirty)) throw new Error('Save or discard this skin\'s pending animation edits before Full Delete.');
            });
            if(result.full) {
                const matches=filename=>filename && result.related.some(file=>this.bridge.same(filename,file));
                for(const [filename,session] of this.animations) if(matches(filename)) {session.dispose();this.animations.delete(filename);}
                for(const record of this.nativeAnimations.records) if(matches(record.texture.path)) this.nativeAnimations.records.delete(record);
            }
            this.manager.reload();this.loadMetadata();this.remember();this.updatePreviews();this.updateHealth(true);
            this.manager.state.notice=result.warning || 'Skin deleted'+(result.full?' with its related files.':'. Asset files were kept.');
            Blockbench.showQuickMessage(result.full?'Skin and related files deleted':'Skin entry deleted',3500);
        });
    }
    context(row, event) {
        new Menu([{name: 'Duplicate Skin', icon: 'content_copy', click: () => this.duplicateSkin(row)},
            {name: 'Status', icon: 'flag', children: [
                ...sortedStatuses(this.manager.state.settings.customStatuses).map(info => ({name:info.label,icon:'flag',color:info.color,click:()=>this.setStatus(row,info.id)})),
                {name:'Custom Status',icon:'add',click:()=>this.createCustomStatus()}
            ]},
            {name: 'Open File', icon: 'description', click: () => this.run(() => this.desktop.open(row.filename))},
            {name: 'Reveal in File Explorer', icon: 'folder_open', click: () => {
                if (typeof Blockbench.showItemInFolder === 'function') Blockbench.showItemInFolder(row.filename);
                else this.run(() => this.desktop.open(this.desktop.path.dirname(row.filename), true));
            }}, {name:'Delete Skin',icon:'delete',click:()=>this.deleteSkin(row)}]).open(event);
    }
    changeTheme(theme) {
        if (theme !== 'Blockbench' && !Object.hasOwn(THEMES, theme)) return;
        this.manager.state.theme = theme;
        this.manager.state.settings = {...this.manager.state.settings,appearance:{...this.manager.state.settings.appearance,theme}};
        this.persist(SETTINGS,this.manager.state.settings);
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
        this.updates.dispose();
        this.nativeAnimations.dispose();
        this.animations.forEach(session => session.dispose()); this.animations.clear();
        this.cancelPrefixRequest();
        this.sourceRequests.forEach(finish => finish(null)); this.sourceRequests.clear();
        if (this.catalog) this.catalog.dispose();
        clearTimeout(this.timer);
        clearTimeout(this.healthTimer); clearInterval(this.healthPoll); this.healthPoll = null;
        this.bridge.dispose();
        this.dialogs.forEach(dialog => { if (dialog.delete) dialog.delete(); else dialog.hide(); });
        this.dialogs.clear();
    }
}

module.exports = {Controller};
