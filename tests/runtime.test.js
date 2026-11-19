'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {Controller} = require('../src/controller');
const {BlockbenchBridge} = require('../src/integration/blockbench');
const {panelComponent} = require('../src/ui/panel');
const {StartScreenView} = require('../src/ui/start-screen');
const {weaponPicker} = require('../src/ui/weapon-picker');
const {DEFAULT_TACZ_WEAPONS, searchWeapons} = require('../src/domain/weapon-options');

function startScreenEnvironment() {
    class Element {
        constructor() {
            this.children = [];
            this.classes = new Set();
            this.classList = {add: value => this.classes.add(value), remove: value => this.classes.delete(value)};
            this.handlers = new Map();
        }
        append(...children) { this.children.push(...children); }
        addEventListener(name, callback) { this.handlers.set(name, callback); }
        scrollIntoView() { this.scrolled = true; }
    }
    const element = new Element(), views = [], sections = [];
    class TestVue {
        constructor(component) { this.state = component.data().s; views.push(this); }
        $mount(target) { this.target = target; }
        $destroy() { this.destroyed = true; }
    }
    const environment = {
        document: {querySelector: () => element, createElement: () => new Element()}, Vue: TestVue,
        startScreen: {addSection(id, options) {
            const section = {id, options, delete() { this.deleted = true; }};
            sections.push(section);
            return section;
        }}
    };
    return {environment, element, views, sections};
}

function storage() {
    const entries = new Map();
    return {getItem: key => entries.get(key) || null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key)};
}

function pickerInstance() {
    const emitted = [];
    const instance = {value: '', readonly: false, _uid: 123, ...weaponPicker.data(),
        $emit(_event, value) { emitted.push(value); this.value = value; },
        $refs: {input: {focus() {}}}, $nextTick(callback) { callback(); },
        $el: {contains() { return false; }, querySelector() { return null; }}};
    for (const [name, method] of Object.entries(weaponPicker.methods)) instance[name] = method.bind(instance);
    for (const [name, get] of Object.entries(weaponPicker.computed)) Object.defineProperty(instance, name, {get: get.bind(instance)});
    return {instance, emitted};
}

function pickerKey(key) {
    return {key, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }};
}

test('weapon suggestions include 54 unique default TaCZ IDs searchable by ID or display name', () => {
    assert.equal(DEFAULT_TACZ_WEAPONS.length, 54);
    assert.equal(new Set(DEFAULT_TACZ_WEAPONS.map(item => item.id)).size, 54);
    assert.ok(DEFAULT_TACZ_WEAPONS.every(item => item.id.startsWith('tacz:')));
    assert.deepEqual(searchWeapons(' AWM ').map(item => item.id), ['tacz:ai_awp']);
    assert.deepEqual(searchWeapons('TACZ:HK416D').map(item => item.id), ['tacz:hk416d']);
    assert.deepEqual(searchWeapons('Desert Eagle').map(item => item.id), ['tacz:deagle', 'tacz:deagle_golden']);
    assert.equal(searchWeapons('').length, 54);
});

test('weapon dropdown supports full browsing, arrow selection, escape, and free custom input', () => {
    const {instance, emitted} = pickerInstance();
    instance.value = 'tacz:ai_awp';
    instance.toggle();
    assert.equal(instance.options.length, 54);
    instance.input({target: {value: 'AWM'}});
    assert.equal(instance.options[0].id, 'tacz:ai_awp');
    const down = pickerKey('ArrowDown');
    instance.keydown(down);
    assert.equal(instance.activeIndex, 0);
    assert.equal(down.prevented, true);
    const enter = pickerKey('Enter');
    instance.keydown(enter);
    assert.equal(instance.value, 'tacz:ai_awp');
    assert.equal(instance.open, false);
    assert.equal(enter.prevented, true);
    instance.input({target: {value: 'mypack:custom_rifle'}});
    assert.equal(instance.options.length, 0);
    instance.keydown(pickerKey('Enter'));
    assert.equal(instance.value, 'mypack:custom_rifle');
    assert.equal(instance.open, false);
    instance.focus();
    instance.keydown(pickerKey('Escape'));
    assert.equal(instance.value, 'mypack:custom_rifle');
    assert.equal(instance.open, false);
    assert.ok(emitted.includes('mypack:custom_rifle'));
    instance.focus();
    const tab = pickerKey('Tab');
    instance.keydown(tab);
    assert.equal(tab.prevented, undefined);
    assert.equal(instance.open, false);
});

test('weapon picker keeps existing entries read-only and leaves custom IDs available for new skins', t => {
    const {instance, emitted} = pickerInstance();
    instance.value = 'otherpack:existing_gun';
    instance.readonly = true;
    instance.toggle();
    instance.input({target: {value: 'tacz:ak47'}});
    instance.choose(DEFAULT_TACZ_WEAPONS[0]);
    assert.equal(instance.open, false);
    assert.equal(instance.value, 'otherpack:existing_gun');
    assert.deepEqual(emitted, []);
    const {controller} = setup(t);
    controller.manager.clear();
    Object.assign(controller.manager.state.draft, {weapon: 'mypack:custom_rifle', label: 'Aurora', collection: 'Test', description: 'Custom gun'});
    const saved = controller.manager.save();
    assert.equal(saved.id, 'custom_rifle_aurora');
    assert.equal(JSON.parse(fs.readFileSync(saved.filename, 'utf8')).base_gun, 'mypack:custom_rifle');
});
function setup(t) {
    const previous = {};
    const globals = {Blockbench: {showMessageBox(options, callback) { globals.prompt = {options, callback}; }, showQuickMessage() {}},
        window: {close() { globals.closed = (globals.closed || 0) + 1; }},
        ModelProject: {all: []}, Codecs: {bedrock: new EventEmitter(), bedrock_old: new EventEmitter(), project: new EventEmitter()},
        Cube: {all: []}, Project: null};
    for (const [key, value] of Object.entries(globals)) { previous[key] = global[key]; global[key] = value; }
    t.after(() => { for (const key of Object.keys(previous)) { if (previous[key] === undefined) delete global[key]; else global[key] = previous[key]; } });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpskins-runtime-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const local = storage();
    local.setItem('mcpskins_asset_manager.preferences.v1', JSON.stringify({root, theme: 'Blockbench'}));
    const requests = [];
    const nativeRequire = (name, options) => { requests.push({name, options}); return name === 'fs' ? fs : require(name); };
    const controller = new Controller(nativeRequire, local);
    controller.start();
    t.after(() => controller.dispose());
    return {controller, local, nativeRequire, requests, root, globals};
}

function textureEnvironment(t) {
    const previous = {Texture: global.Texture, Undo: global.Undo, loadModelFile: global.loadModelFile};
    const edits = [], reads = [];
    class TestTexture {
        constructor(options) { Object.assign(this, options); }
        fromPath(p) { reads.push(p); this.path = p; return this; }
        add() { TestTexture.all.push(this); return this; }
        setAsDefaultTexture() { this.defaultTexture = true; }
        select() { this.selected = true; }
    }
    TestTexture.all = [];
    global.Texture = TestTexture;
    global.Undo = {initEdit() { edits.push('start'); }, finishEdit() { edits.push('finish'); }};
    const applied = [];
    Cube.all.push({applyTexture(texture) { applied.push(texture); }});
    t.after(() => { for (const key of Object.keys(previous)) { if (previous[key] === undefined) delete global[key]; else global[key] = previous[key]; } });
    return {TestTexture, edits, reads, applied};
}

function dialogEnvironment(t) {
    const previous = global.Dialog;
    const dialogs = [];
    global.Dialog = class {
        constructor(id, options) {
            this.id = id; this.options = options;
            this.values = Object.fromEntries(Object.entries(options.form || {}).map(([key, item]) => [key, item.value]));
            dialogs.push(this);
        }
        setFormValues(values) { Object.assign(this.values, values); }
        show() { this.visible = true; }
        hide() { this.visible = false; }
        delete() { this.visible = false; }
    };
    t.after(() => { if (previous === undefined) delete global.Dialog; else global.Dialog = previous; });
    return dialogs;
}

test('custom weapon name prompts once, persists across reloads, and prefixes later skins', async t => {
    const {controller, local, nativeRequire} = setup(t);
    const dialogs = dialogEnvironment(t);
    controller.manager.clear();
    Object.assign(controller.manager.state.draft, {weapon: 'cs2_wt:karambit', label: 'Oceania', collection: 'Test', description: 'Custom knife', kind: 'melee'});
    const pending = controller.ensureWeaponPrefix();
    const dialog = dialogs.at(-1);
    assert.equal(dialog.id, 'mcpskins_weapon_prefix');
    assert.equal(dialog.values.weapon, 'cs2_wt:karambit');
    assert.equal(controller.ensureWeaponPrefix(), pending);
    dialog.options.onConfirm({prefix: 'Karambit'});
    assert.equal(await pending, true);
    await controller.save();
    const file = controller.manager.repository.paths.registry('cs2_wt:karambit');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).skins[0].name, 'Karambit | Oceania');
    assert.equal(controller.manager.state.draft.override_prefix, false);
    const restored = new Controller(nativeRequire, local);
    t.after(() => restored.dispose());
    restored.start();
    assert.equal(restored.manager.prefixFor('cs2_wt:karambit'), 'Karambit');
    restored.manager.clear();
    Object.assign(restored.manager.state.draft, {weapon: 'cs2_wt:karambit', label: 'Crimson', collection: 'Test', description: 'Second skin'});
    await restored.save();
    assert.equal(dialogs.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).skins[1].name, 'Karambit | Crimson');
    restored.manager.clear();
    restored.edit('weapon', 'another_pack:karambit');
    const other = restored.ensureWeaponPrefix();
    assert.equal(dialogs.length, 2);
    dialogs.at(-1).options.onCancel();
    assert.equal(await other, false);
});

test('canceling a custom name prompt cancels save and preserves the draft', async t => {
    const {controller, local} = setup(t);
    const dialogs = dialogEnvironment(t);
    controller.manager.clear();
    Object.assign(controller.manager.state.draft, {weapon: 'cs2_wt:karambit', label: 'Oceania', collection: 'Test', description: 'Unsaved'});
    controller.edit('label', 'Oceania');
    const save = controller.save();
    const dialog = dialogs.at(-1);
    dialog.options.onCancel();
    assert.equal(await save, false);
    assert.equal(controller.manager.state.dirty, true);
    assert.equal(controller.manager.state.draft.label, 'Oceania');
    assert.equal(fs.existsSync(controller.manager.repository.paths.registry('cs2_wt:karambit')), false);
    assert.equal(local.getItem('mcpskins_asset_manager.weapon_names.v1'), null);
});

test('name-prefix override is per skin and does not replace remembered or default names', async t => {
    const {controller} = setup(t);
    const dialogs = dialogEnvironment(t);
    controller.manager.state.weaponNames = {'cs2_wt:karambit': 'Karambit'};
    controller.manager.clear();
    Object.assign(controller.manager.state.draft, {weapon: 'cs2_wt:karambit', label: 'Oceania', collection: 'Test', description: 'Override'});
    controller.edit('override_prefix', true);
    assert.equal(controller.manager.state.draft.name_prefix, 'Karambit');
    controller.edit('name_prefix', 'Custom Karambit');
    await controller.save();
    const skin = controller.manager.selected.skin;
    assert.equal(skin.name, 'Custom Karambit | Oceania');
    assert.equal(controller.manager.prefixFor('cs2_wt:karambit'), 'Karambit');
    assert.equal(controller.manager.state.draft.override_prefix, true);
    assert.equal(controller.manager.prefixFor('tacz:glock_17'), 'Glock 17');
    assert.equal(dialogs.length, 0);
    assert.equal(Object.hasOwn(skin, 'name_prefix'), false);
    assert.equal(Object.hasOwn(skin, 'override_prefix'), false);
    controller.manager.clear();
    Object.assign(controller.manager.state.draft, {weapon: 'newpack:custom_knife', label: 'One Off', collection: 'Test', description: 'New custom override', override_prefix: true, name_prefix: 'Special Knife'});
    await controller.save();
    assert.equal(controller.manager.selected.skin.name, 'Special Knife | One Off');
    assert.equal(Object.hasOwn(controller.manager.state.weaponNames, 'newpack:custom_knife'), false);
    assert.equal(dialogs.length, 0);
});

test('default TaCZ IDs keep original prefixes while custom namespaces prompt even for matching basenames', async t => {
    const {controller} = setup(t);
    const dialogs = dialogEnvironment(t);
    controller.manager.clear();
    controller.edit('weapon', 'tacz:glock_17');
    assert.equal(await controller.ensureWeaponPrefix(), true);
    assert.equal(controller.manager.prefixFor('tacz:glock_17'), 'Glock 17');
    assert.equal(dialogs.length, 0);
    controller.edit('weapon', 'another_pack:glock_17');
    const pending = controller.ensureWeaponPrefix();
    assert.equal(dialogs.length, 1);
    dialogs.at(-1).options.onCancel();
    assert.equal(await pending, false);
});

test('old draft recovery without prefix fields still restores unsaved edits', t => {
    const {controller, local, nativeRequire, root} = setup(t);
    const draft = {...controller.manager.state.draft, weapon: 'tacz:ai_awp', label: 'Old draft'};
    delete draft.override_prefix;
    delete draft.name_prefix;
    local.setItem('mcpskins_asset_manager.draft.v1', JSON.stringify({root, folder: 'Example', namespace: 'example', draft, selected: null}));
    const restored = new Controller(nativeRequire, local);
    t.after(() => restored.dispose());
    restored.start();
    assert.equal(restored.manager.state.draft.label, 'Old draft');
    assert.equal(restored.manager.state.draft.override_prefix, false);
    assert.equal(restored.manager.state.dirty, true);
});

test('startup requests only folder-scoped access and leaves the pack untouched', t => {
    const {controller, requests, root} = setup(t);
    assert.equal(controller.manager.state.ready, true);
    assert.equal(requests.find(r => r.name === 'fs').options.scope, root);
    assert.equal(requests.some(r => r.name === 'shell' || r.name === 'process'), false);
    assert.deepEqual(fs.readdirSync(root), []);
});

test('pack popup selects a pack directory, derives its parent, and preserves settings compatibility', async t => {
    const {controller, root, local, nativeRequire} = setup(t);
    const dialogs = dialogEnvironment(t);
    const pack = path.join(root, 'kelpco');
    fs.mkdirSync(pack);
    // Saved folder must never replace the folder explicitly selected in the picker.
    fs.writeFileSync(path.join(root, 'skin_manager_settings.json'), JSON.stringify({pack_folder: 'PreviousPack', pack_namespace: 'kchs'}));
    controller.configure();
    const dialog = dialogs.at(-1);
    assert.deepEqual(Object.keys(dialog.options.form), ['pack_directory', 'pack_namespace', 'pack_author']);
    assert.equal(dialog.options.form.pack_directory.type, 'folder');
    dialog.values.pack_directory = pack;
    dialog.options.onFormChange(dialog.values);
    assert.equal(dialog.values.pack_directory, pack);
    assert.equal(dialog.values.pack_namespace, 'kchs');
    dialog.options.onConfirm({...dialog.values, pack_namespace: 'KCHS'});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dialog.visible, false);
    assert.equal(controller.manager.repository.paths.pack, pack);
    assert.equal(controller.manager.state.root, root);
    assert.equal(controller.manager.state.folder, 'kelpco');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'skin_manager_settings.json'), 'utf8')), {
        pack_folder: 'kelpco', pack_namespace: 'kchs'
    });
    const restored = new Controller(nativeRequire, local);
    t.after(() => restored.dispose());
    restored.start();
    assert.equal(restored.manager.repository.paths.pack, pack);
    assert.equal(restored.manager.state.namespace, 'kchs');
});

test('canceling a directory switch keeps unsaved edits and leaves pack settings unwritten', async t => {
    const {controller, root, globals} = setup(t);
    const dialogs = dialogEnvironment(t);
    const pack = path.join(root, 'OtherPack');
    fs.mkdirSync(pack);
    controller.manager.clear();
    controller.edit('label', 'Keep this');
    controller.configure();
    const dialog = dialogs.at(-1);
    dialog.options.onConfirm({pack_directory: pack, pack_namespace: 'other'});
    globals.prompt.callback(globals.prompt.options.buttons.indexOf('Cancel'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dialog.visible, true);
    assert.equal(controller.manager.state.folder, 'Example');
    assert.equal(controller.manager.state.draft.label, 'Keep this');
    assert.equal(controller.manager.state.dirty, true);
    assert.equal(fs.existsSync(path.join(root, 'skin_manager_settings.json')), false);
});

test('nonexistent pack directory cannot be applied or create parent settings', async t => {
    const {controller, root, globals} = setup(t);
    const dialogs = dialogEnvironment(t);
    controller.configure();
    const dialog = dialogs.at(-1);
    dialog.options.onConfirm({pack_directory: path.join(root, 'MissingPack'), pack_namespace: 'example'});
    await new Promise(resolve => setImmediate(resolve));
    assert.match(globals.prompt.options.message, /does not exist/);
    assert.equal(dialog.visible, true);
    assert.equal(fs.existsSync(path.join(root, 'skin_manager_settings.json')), false);
});

test('start-screen launcher opens the complete manager without creating a model project', t => {
    const {controller} = setup(t);
    const {environment, views, sections, element} = startScreenEnvironment();
    const start = new StartScreenView(controller, environment);
    t.after(() => start.dispose());
    assert.equal(views.length, 0);
    assert.equal(sections[0].options.closable, false);
    sections[0].options.text.find(item => item.type === 'button').click();
    assert.equal(views.length, 1);
    assert.equal(views[0].state, controller.manager.state);
    assert.equal(start.workspace.hidden, false);
    assert.equal(element.classes.has('mcpskins-start-open'), true);
    assert.equal(ModelProject.all.length, 0);
    assert.equal(Project, null);
});

test('start-screen hide/reopen retains the shared selection and dirty draft', t => {
    const {controller} = setup(t);
    const {environment, views, sections} = startScreenEnvironment();
    const start = new StartScreenView(controller, environment);
    start.show();
    controller.manager.clear();
    controller.edit('label', 'Keep my edits');
    start.hide();
    assert.equal(start.workspace.hidden, true);
    assert.equal(controller.manager.state.dirty, true);
    start.show();
    assert.equal(views.length, 1);
    assert.equal(views[0].state.draft.label, 'Keep my edits');
    start.dispose();
    assert.equal(views[0].destroyed, true);
    assert.equal(sections[0].deleted, true);
});

test('drafts survive unload/reload and are cleared by explicit discard', t => {
    const {controller, local, nativeRequire} = setup(t);
    controller.manager.clear();
    controller.edit('weapon', 'tacz:ai_awp');
    controller.edit('label', 'Unsaved');
    controller.dispose();
    const restored = new Controller(nativeRequire, local);
    t.after(() => restored.dispose());
    restored.start();
    assert.equal(restored.manager.state.draft.label, 'Unsaved');
    assert.equal(restored.manager.state.dirty, true);
    restored.revert();
    assert.equal(local.getItem('mcpskins_asset_manager.draft.v1'), null);
});

test('canceling a selection transition preserves the draft and selected row', async t => {
    const {controller, globals} = setup(t);
    controller.manager.clear();
    controller.edit('label', 'Keep me');
    let applied = false;
    const transition = controller.transition(() => { applied = true; });
    globals.prompt.callback(globals.prompt.options.buttons.indexOf('Cancel'));
    assert.equal(await transition, false);
    assert.equal(applied, false);
    assert.equal(controller.manager.state.draft.label, 'Keep me');
});

test('window close cancel retains draft; discard permits close', t => {
    const {controller, globals, local} = setup(t);
    controller.manager.clear();
    controller.edit('label', 'Keep');
    function event() { return {preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }}; }
    const first = event();
    controller.beforeUnload(first);
    assert.equal(first.prevented, true);
    assert.equal(first.stopped, true);
    globals.prompt.callback(2);
    assert.equal(globals.closed, undefined);
    assert.equal(controller.manager.state.dirty, true);
    controller.beforeUnload(event());
    globals.prompt.callback(globals.prompt.options.buttons.indexOf('Discard'));
    assert.equal(globals.closed, 1);
    assert.equal(local.getItem('mcpskins_asset_manager.draft.v1'), null);
});

test('window close save failure keeps the window open and draft intact', async t => {
    const {controller, globals} = setup(t);
    controller.manager.clear();
    controller.edit('label', 'Missing fields');
    controller.beforeUnload({preventDefault() {}, stopImmediatePropagation() {}});
    await globals.prompt.callback(0);
    assert.equal(globals.closed, undefined);
    assert.equal(controller.manager.state.dirty, true);
    assert.match(globals.prompt.options.message, /namespaced/);
});

test('model bridge preserves a project already open with unsaved work', t => {
    setup(t);
    const bridge = new BlockbenchBridge(path);
    t.after(() => bridge.dispose());
    let selected = false;
    ModelProject.all.push({export_path: path.resolve('skin.geo.json'), select() { selected = true; }});
    bridge.openModel({model: path.resolve('skin.geo.json'), texture: 'missing.png'}, fs);
    assert.equal(selected, true);
});

test('newly opened model binds only its own skin texture and removes listeners', async t => {
    const {root} = setup(t);
    const file = path.join(root, 'skin.geo.json'), texture = path.join(root, 'skin.png');
    // Blockbench accepts JSON comments in existing models; the adapter must defer parsing.
    fs.writeFileSync(file, '{"minecraft:geometry":[] /* model comment */}');
    fs.writeFileSync(texture, 'png');
    const previous = {Texture: global.Texture, Undo: global.Undo, loadModelFile: global.loadModelFile};
    const edits = [];
    class TestTexture {
        fromPath(p) { this.path = p; return this; }
        add() { TestTexture.all.push(this); return this; }
        select() { this.selected = true; }
    }
    TestTexture.all = [];
    global.Texture = TestTexture;
    global.Undo = {initEdit() { edits.push('start'); }, finishEdit() { edits.push('finish'); }};
    let applied;
    Cube.all.push({applyTexture(t) { applied = t; }});
    global.loadModelFile = input => { global.Project = {export_path: input.path}; Codecs.bedrock.emit('parsed', {}); };
    t.after(() => { for (const key of Object.keys(previous)) { if (previous[key] === undefined) delete global[key]; else global[key] = previous[key]; } });
    const bridge = new BlockbenchBridge(path);
    t.after(() => bridge.dispose());
    bridge.openModel({model: file, texture}, fs);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(applied.path, texture);
    assert.deepEqual(edits, ['start', 'finish']);
    assert.equal(Project.mcpskins_asset.model, file);
    assert.equal(Codecs.bedrock.listenerCount('parsed'), 0);
    assert.equal(bridge.pending, null);
});

test('Open Model copies and imports a missing skin PNG into an already-open geometry', async t => {
    const {controller} = setup(t);
    const {TestTexture, edits, reads, applied} = textureEnvironment(t);
    const paths = controller.manager.repository.paths;
    const folder = paths.textures('tacz:ai_awp');
    fs.mkdirSync(folder, {recursive: true});
    const model = path.join(folder, 'ai_awp_blue_ice.json');
    const texture = path.join(folder, 'ai_awp_blue_ice.png');
    const original = '{"minecraft:geometry":[],"keep":"existing geometry"}';
    fs.writeFileSync(model, original);
    fs.writeFileSync(path.join(folder, 'ai_awp.png'), 'default gun pixels');
    const project = {export_path: model, select() { global.Project = this; }};
    ModelProject.all.push(project);
    global.loadModelFile = () => assert.fail('An already-open model must not be reloaded');
    controller.manager.clear();
    Object.assign(controller.manager.state.draft, {weapon: 'tacz:ai_awp', label: 'Blue Ice'});
    await controller.openModel();
    assert.equal(fs.readFileSync(model, 'utf8'), original);
    assert.equal(fs.readFileSync(texture, 'utf8'), 'default gun pixels');
    assert.equal(TestTexture.all.length, 1);
    assert.equal(TestTexture.all[0].name, 'ai_awp_blue_ice.png');
    assert.equal(TestTexture.all[0].defaultTexture, true);
    assert.equal(applied[0], TestTexture.all[0]);
    assert.deepEqual(edits, ['start', 'finish']);
    TestTexture.all[0].unsavedPainting = 'keep pixels in memory';
    await controller.openModel();
    assert.equal(TestTexture.all.length, 1);
    assert.equal(TestTexture.all[0].unsavedPainting, 'keep pixels in memory');
    assert.deepEqual(reads, [texture]);
    assert.deepEqual(edits, ['start', 'finish']);
});

test('Open Model copies missing geometry and PNG, then imports after parsing', async t => {
    const {controller} = setup(t);
    const {TestTexture, applied} = textureEnvironment(t);
    const folder = controller.manager.repository.paths.textures('tacz:ai_awp');
    fs.mkdirSync(folder, {recursive: true});
    const original = '{"minecraft:geometry":[]}';
    fs.writeFileSync(path.join(folder, 'ai_awp_geo.json'), original);
    fs.writeFileSync(path.join(folder, 'ai_awp.png'), 'base pixels');
    let opened;
    global.loadModelFile = input => {
        opened = input;
        global.Project = {export_path: input.path};
        Codecs.bedrock.emit('parsed', {});
    };
    controller.manager.clear();
    Object.assign(controller.manager.state.draft, {weapon: 'tacz:ai_awp', label: 'Blue Ice'});
    await controller.openModel();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(opened.path, path.join(folder, 'ai_awp_blue_ice.geo.json'));
    assert.equal(opened.content, original);
    assert.equal(TestTexture.all[0].path, path.join(folder, 'ai_awp_blue_ice.png'));
    assert.equal(fs.readFileSync(TestTexture.all[0].path, 'utf8'), 'base pixels');
    assert.equal(applied[0], TestTexture.all[0]);
    assert.equal(fs.readFileSync(path.join(folder, 'ai_awp_geo.json'), 'utf8'), original);
    assert.equal(fs.readFileSync(path.join(folder, 'ai_awp.png'), 'utf8'), 'base pixels');
});

test('Open Model imports base, normal, and specular in order without applying the maps as colors', async t => {
    const {controller} = setup(t);
    const {TestTexture, applied, reads, edits} = textureEnvironment(t);
    const folder = controller.manager.repository.paths.textures('tacz:ai_awp');
    fs.mkdirSync(folder, {recursive: true});
    const model = path.join(folder, 'ai_awp_aurora.geo.json');
    const color = path.join(folder, 'ai_awp_aurora.png');
    const normal = path.join(folder, 'ai_awp_aurora_n.png');
    const specular = path.join(folder, 'ai_awp_aurora_s.png');
    const defaultSpecular = path.join(folder, 'ai_awp_s.png');
    fs.writeFileSync(model, '{"minecraft:geometry":[]}');
    for (const file of [color, normal, defaultSpecular]) fs.writeFileSync(file, path.basename(file));
    global.loadModelFile = input => {
        const project = {export_path: input.path, select() { global.Project = this; }};
        ModelProject.all.push(project);
        global.Project = project;
        Codecs.bedrock.emit('parsed', {});
    };
    controller.manager.clear();
    Object.assign(controller.manager.state.draft, {weapon: 'tacz:ai_awp', label: 'Aurora'});
    await controller.openModel();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(TestTexture.all.map(texture => texture.path), [color, normal, specular]);
    assert.equal(fs.readFileSync(specular, 'utf8'), path.basename(defaultSpecular));
    assert.equal(TestTexture.all.some(texture => texture.path === defaultSpecular), false);
    assert.deepEqual(applied.map(texture => texture.path), [color]);
    assert.equal(TestTexture.all[0].selected, true);
    assert.equal(TestTexture.all[1].render_mode, 'default');
    assert.equal(TestTexture.all[2].render_mode, 'default');
    const paintedNormal = TestTexture.all[1];
    paintedNormal.unsavedPainting = 'keep normal painting';
    TestTexture.all.reverse();
    await controller.openModel();
    assert.deepEqual(TestTexture.all.map(texture => texture.path), [color, normal, specular]);
    assert.equal(TestTexture.all[1], paintedNormal);
    assert.equal(paintedNormal.unsavedPainting, 'keep normal painting');
    assert.deepEqual(reads, [color, normal, specular]);
    assert.equal(applied.length, 1);
    assert.deepEqual(edits, ['start', 'finish', 'start', 'finish']);
    // Existing skin files and in-memory painting survive another open.
    fs.writeFileSync(specular, 'skin specific specular');
    await controller.openModel();
    assert.deepEqual(TestTexture.all.slice(0, 3).map(texture => texture.path), [color, normal, specular]);
    assert.equal(fs.readFileSync(specular, 'utf8'), 'skin specific specular');
    assert.equal(fs.readFileSync(defaultSpecular, 'utf8'), path.basename(defaultSpecular));
    assert.deepEqual(reads, [color, normal, specular]);
});

test('default maps added later are copied and imported for an already-open skin model', async t => {
    const {controller} = setup(t);
    const {TestTexture, reads} = textureEnvironment(t);
    const folder = controller.manager.repository.paths.textures('tacz:ai_awp');
    fs.mkdirSync(folder, {recursive: true});
    const model = path.join(folder, 'ai_awp_aurora.geo.json');
    const color = path.join(folder, 'ai_awp_aurora.png');
    fs.writeFileSync(model, '{"minecraft:geometry":[]}');
    fs.writeFileSync(color, 'skin color');
    const project = {export_path: model, select() { global.Project = this; }};
    ModelProject.all.push(project);
    controller.manager.clear();
    Object.assign(controller.manager.state.draft, {weapon: 'tacz:ai_awp', label: 'Aurora'});
    await controller.openModel();
    for (const suffix of ['_n', '_s']) fs.writeFileSync(path.join(folder, `ai_awp${suffix}.png`), `default${suffix}`);
    await controller.openModel();
    const normal = path.join(folder, 'ai_awp_aurora_n.png');
    const specular = path.join(folder, 'ai_awp_aurora_s.png');
    assert.deepEqual(TestTexture.all.map(texture => texture.path), [color, normal, specular]);
    assert.deepEqual(reads, [color, normal, specular]);
    assert.equal(fs.readFileSync(normal, 'utf8'), 'default_n');
    assert.equal(fs.readFileSync(specular, 'utf8'), 'default_s');
});

test('multi-geometry loading waits for parse completion before importing the PNG', async t => {
    const {root} = setup(t);
    const {TestTexture} = textureEnvironment(t);
    const model = path.join(root, 'skin.geo.json'), texture = path.join(root, 'skin.png');
    fs.writeFileSync(model, '{"minecraft:geometry":[{},{}]}');
    fs.writeFileSync(texture, 'png');
    global.loadModelFile = input => { global.Project = {export_path: input.path}; };
    const bridge = new BlockbenchBridge(path);
    t.after(() => bridge.dispose());
    bridge.openModel({model, texture}, fs);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(TestTexture.all.length, 0);
    Codecs.bedrock.emit('parsed', {});
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(TestTexture.all.length, 1);
    assert.equal(bridge.pending, null);
});

test('generated plugin registers, loads, cleans up and reloads without leaking handlers', () => {
    const listeners = new Map();
    const counts = {actions: 0, panels: 0, css: 0};
    const {environment, views, sections} = startScreenEnvironment();
    const registered = new Map(), menus = [];
    let currentPanel;
    let plugin;
    class Action {
        constructor(id, options) { counts.actions++; registered.set(id, options); }
        delete() { counts.actions--; }
    }
    class Panel {
        constructor(_id, options) { this.options = options; counts.panels++; currentPanel = this; }
        fold() { this.revealed = true; }
        selectTab() {}
        moveToFront() {}
        delete() { counts.panels--; }
    }
    const context = {console, setTimeout, clearTimeout, setInterval, clearInterval, requireNativeModule: name => require(name),
        localStorage: storage(), Plugin: {register(id, options) { assert.equal(id, 'mcpskins_asset_manager'); plugin = options; }},
        Action, Panel, Toolbar: class { delete() {} }, MenuBar: {addAction(_action, location) { menus.push(location); }},
        document: environment.document, Vue: environment.Vue, StartScreen: environment.startScreen,
        Blockbench: {Project: 0, addCSS() { counts.css++; return {delete() { counts.css--; }}; }},
        window: {addEventListener(name, handler) { listeners.set(name, handler); }, removeEventListener(name, handler) { assert.equal(listeners.get(name), handler); listeners.delete(name); }}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../mcpskins_asset_manager.js'), 'utf8'), context);
    assert.equal(plugin.variant, 'desktop');
    assert.equal(plugin.min_version, '5.1.0');
    for (let i = 0; i < 2; i++) {
        plugin.onload();
        assert.equal(listeners.size, 2);
        assert.deepEqual(counts, {actions: 6, panels: 1, css: 1});
        assert.deepEqual(menus.slice(-2), ['tools', 'file']);
        registered.get('mcpskins_show').click();
        assert.equal(views.at(-1).state.ready, false);
        assert.equal(currentPanel.revealed, undefined);
        context.Blockbench.Project = {};
        registered.get('mcpskins_show').click();
        assert.equal(currentPanel.revealed, true);
        context.Blockbench.Project = 0;
        plugin.onunload();
        assert.equal(listeners.size, 0);
        assert.deepEqual(counts, {actions: 0, panels: 0, css: 0});
        assert.equal(views.at(-1).destroyed, true);
        assert.equal(sections.at(-1).deleted, true);
    }
});

function installedVue() {
    if (!process.env.LOCALAPPDATA) return null;
    const asar = path.join(process.env.LOCALAPPDATA, 'Programs/Blockbench/resources/app.asar');
    if (!fs.existsSync(asar)) return null;
    const bytes = fs.readFileSync(asar);
    const header = JSON.parse(bytes.subarray(16, 16 + bytes.readUInt32LE(12)));
    const file = header.files.dist.files['bundle.js'];
    const offset = 8 + bytes.readUInt32LE(4) + Number(file.offset);
    const bundle = bytes.subarray(offset, offset + file.size).toString();
    const start = bundle.indexOf('var ID=Ft(');
    const next = /;var \w+=Ft\(/.exec(bundle.slice(start + 12));
    if (start < 0 || !next) return null;
    const end = start + 12 + next.index + 1;
    const context = {console, setTimeout, clearTimeout, document: {createElement() { return {set innerHTML(text) { this.textContent = text; }}; }}};
    vm.runInNewContext('var Ft=fn=>()=>{const m={exports:{}};fn(m.exports,m);return m.exports};\n' + bundle.slice(start, end) + '\nvar Vue=ID();', context);
    return context.Vue;
}

test('panel compiles and renders with Vue shipped in installed Blockbench 5.2.2', t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {controller} = setup(t);
    const errors = [];
    Vue.config.warnHandler = message => errors.push(message);
    Vue.config.errorHandler = error => errors.push(error.message);
    const picker = new Vue({...weaponPicker, ...Vue.compile(weaponPicker.template), propsData: {value: 'AWM', readonly: false}});
    picker.open = true;
    assert.ok(picker._render());
    assert.equal(picker.options[0].id, 'tacz:ai_awp');
    picker.readonly = true;
    assert.ok(picker._render());
    picker.$destroy();
    const component = panelComponent(controller);
    const compiled = Vue.compile(component.template);
    const instance = new Vue({...component, ...compiled});
    assert.ok(instance._render());
    controller.manager.clear();
    controller.manager.state.previews = [{kind: 'skin', label: 'Skin', source: '', filename: '', dimensions: '', message: 'Missing'}];
    controller.manager.edit('weapon', 'tacz:ai_awp');
    assert.ok(instance._render());
    assert.deepEqual(errors, []);
    instance.$destroy();
});

function multipleSkins(t) {
    const {controller, ...rest} = setup(t);
    const manager = controller.manager, repository = manager.repository;
    for (const [weapon, label, rarity] of [['tacz:ai_awp', 'Alpha', 'common'], ['tacz:ai_awp', 'Bravo', 'rare'], ['tacz:ak47', 'Charlie', 'epic'], ['tacz:ak47', 'Delta', 'common']]) {
        repository.save({...manager.state.draft, weapon, label, rarity, collection: label, description: label, is_new: label === 'Alpha'});
    }
    manager.reload();
    return {controller, manager, repository, rows: manager.filteredRows(), ...rest};
}

test('Ctrl toggles selections, Shift selects visible sorted ranges, and plain clicks reset selection', async t => {
    const {controller, manager, rows} = multipleSkins(t);
    await controller.select(rows[0]);
    await controller.select(rows[2], {ctrlKey: true});
    assert.deepEqual(manager.state.selectedKeys, [rows[0].key, rows[2].key]);
    await controller.select(rows[2], {ctrlKey: true});
    assert.deepEqual(manager.state.selectedKeys, [rows[0].key]);
    await controller.select(rows[1]);
    await controller.select(rows[3], {shiftKey: true});
    assert.deepEqual(manager.state.selectedKeys, rows.slice(1).map(row => row.key));
    await controller.select(rows[0], {ctrlKey: true, shiftKey: true});
    assert.equal(manager.state.selectedKeys.length, 4);
    await controller.select(rows[0]);
    assert.deepEqual(manager.state.selectedKeys, [rows[0].key]);
    manager.state.search = 'Alpha';
    await controller.select(manager.filteredRows()[0], {shiftKey: true});
    assert.equal(manager.state.selectedKeys.length, 1);
    await controller.select(manager.selection[0], {metaKey: true});
    assert.equal(manager.state.active, false);
});

test('bulk save edits only changed shared fields and preserves identities, mixed values, and extensions', async t => {
    const {controller, manager, rows, repository} = multipleSkins(t);
    const before = rows.map(row => JSON.parse(JSON.stringify(row.skin)));
    manager.selectRows(rows);
    assert.equal(manager.state.mixed.rarity, true);
    assert.equal(manager.state.draft.collection, '');
    assert.equal(manager.state.mixed.is_new, true);
    controller.edit('label', 'Forbidden');
    assert.equal(manager.state.dirty, false);
    controller.edit('collection', 'Shared collection');
    await controller.save();
    assert.equal(manager.state.selectedKeys.length, 4);
    const after = repository.discover().rows;
    for (let i = 0; i < rows.length; i++) {
        assert.deepEqual(after.find(row => row.key === rows[i].key).skin, {...before[i], collection: 'Shared collection'});
    }
    controller.edit('rarity', 'legendary');
    controller.edit('unlocked', true);
    await controller.save();
    assert.ok(repository.discover().rows.every(row => row.skin.rarity === 'legendary' && row.skin.label_color === '0xE69138' && row.skin.unlocked));
});

test('bulk changes and duplicate drafts survive recovery and discard without writing files', async t => {
    const {controller, manager, rows, local, nativeRequire, repository} = multipleSkins(t);
    manager.selectRows(rows);
    controller.edit('description', 'Recovered batch');
    const restored = new Controller(nativeRequire, local);
    t.after(() => restored.dispose());
    restored.start();
    assert.equal(restored.manager.selection.length, 4);
    assert.deepEqual(restored.manager.state.changedFields, ['description']);
    await restored.save();
    assert.ok(repository.discover().rows.every(row => row.skin.description === 'Recovered batch'));
    controller.revert();
    await controller.duplicateSkin(repository.discover().rows[0]);
    const restoredCopy = new Controller(nativeRequire, local);
    t.after(() => restoredCopy.dispose());
    restoredCopy.start();
    assert.equal(restoredCopy.manager.state.duplicatePending, true);
    assert.ok(restoredCopy.manager.duplicateSource);
    restoredCopy.revert();
    assert.equal(repository.discover().rows.length, 4);
    assert.equal(restoredCopy.manager.state.dirty, false);
});

test('bulk validation and conflicts are detected before any file is written', t => {
    const {manager, rows, repository} = multipleSkins(t);
    manager.selectRows(rows);
    manager.edit('include_weight', true);
    manager.edit('weight', '0');
    assert.throws(() => manager.save(), /positive/);
    assert.ok(repository.discover().rows.every(row => !Object.hasOwn(row.skin, 'weight')));
    manager.revert();
    manager.edit('collection', 'Replacement');
    const last = rows.at(-1), data = repository.read(last.filename);
    data.skins[last.index].description = 'External change';
    fs.writeFileSync(last.filename, JSON.stringify(data));
    assert.throws(() => manager.save(), /changed on disk/);
    assert.ok(repository.discover().rows.every(row => row.skin.collection !== 'Replacement'));
});

test('bulk write failure restores earlier files and keeps the draft dirty', t => {
    const {manager, rows, repository} = multipleSkins(t);
    manager.selectRows(rows);
    manager.edit('collection', 'Replacement');
    let renames = 0;
    repository.fs = {...fs, renameSync(from, to) { if (++renames === 2) throw new Error('Simulated write failure'); fs.renameSync(from, to); }};
    assert.throws(() => manager.save(), /Simulated/);
    assert.equal(manager.state.dirty, true);
    for (const row of repository.discover().rows) assert.equal(row.skin.collection, row.skin.description);
});

test('Duplicate Skin menu creates a unique draft and copies all existing assets only on save', async t => {
    const {controller, manager, rows, repository} = multipleSkins(t);
    const row = rows[0], directory = repository.paths.textures(manager.draftForRow(row).weapon);
    fs.mkdirSync(directory, {recursive: true});
    const extensions = ['.geo.json', '.png', '_n.png', '_s.png', '_hud.png', '_icon.png'];
    for (const extension of extensions) fs.writeFileSync(path.join(directory, row.skin.id + extension), 'original' + extension);
    const previous = global.Menu;
    let items;
    global.Menu = class { constructor(entries) { items = entries; } open() {} };
    t.after(() => { if (previous === undefined) delete global.Menu; else global.Menu = previous; });
    controller.context(row, {});
    await items.find(item => item.name === 'Duplicate Skin').click();
    const id = manager.state.draft.id;
    assert.equal(id, row.skin.id + '_copy');
    assert.equal(repository.discover().rows.length, 4);
    assert.equal(fs.existsSync(path.join(directory, id + '.png')), false);
    controller.edit('label', 'Custom copy');
    await controller.save();
    assert.equal(repository.discover().rows.length, 5);
    for (const extension of extensions) {
        assert.equal(fs.readFileSync(path.join(directory, id + extension), 'utf8'), 'original' + extension);
        assert.equal(fs.readFileSync(path.join(directory, row.skin.id + extension), 'utf8'), 'original' + extension);
    }
    assert.equal(manager.selected.skin.name.endsWith(' | Custom copy'), true);
    await controller.duplicateSkin(row);
    assert.equal(manager.state.draft.id, row.skin.id + '_copy_2');
});

test('duplicate refuses asset collisions and removes new copies if registry saving fails', t => {
    const {manager, rows, repository} = multipleSkins(t);
    const row = rows[0], directory = repository.paths.textures(manager.draftForRow(row).weapon);
    fs.mkdirSync(directory, {recursive: true});
    fs.writeFileSync(path.join(directory, row.skin.id + '.png'), 'source');
    manager.duplicate(row);
    const target = path.join(directory, manager.state.draft.id + '.png');
    fs.writeFileSync(target, 'occupied');
    assert.throws(() => manager.save(), /already exists/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'occupied');
    fs.unlinkSync(target);
    fs.writeFileSync(row.filename + '.tmp', 'occupied temporary');
    assert.throws(() => manager.save());
    assert.equal(fs.existsSync(target), false);
    assert.equal(repository.discover().rows.length, 4);
});

test('bulk editor renders disabled identity controls and mixed values using installed Blockbench Vue', t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {controller, manager, rows} = multipleSkins(t);
    const errors = [];
    Vue.config.warnHandler = message => errors.push(message);
    Vue.config.errorHandler = error => errors.push(error.message);
    const component = panelComponent(controller), instance = new Vue({...component, ...Vue.compile(component.template)});
    const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
    const text = node => flatten(node).map(item => item.text || '').join('');
    manager.selectRows(rows);
    const nodes = flatten(instance._render());
    for (const label of ['Skin name', 'Skin ID', 'Weapon type']) {
        const field = nodes.find(node => node.tag === 'label' && text(node).startsWith(label));
        const control = flatten(field).find(node => ['input', 'select'].includes(node.tag));
        assert.equal(control.data.attrs.disabled, true, label);
    }
    assert.ok(nodes.some(node => node.tag === 'input' && node.data.domProps && node.data.domProps.indeterminate));
    assert.ok(nodes.some(node => node.tag === 'input' && node.data.attrs.placeholder === 'Mixed values'));
    assert.ok(nodes.some(node => node.tag === 'button' && text(node) === 'Save Selected Skins'));
    assert.ok(!nodes.some(node => node.tag === 'button' && text(node) === 'Open Model'));
    manager.select(rows[0]);
    controller.updatePreviews();
    const single = text(instance._render());
    assert.ok(single.includes('Recommended aspect ratio 3:1'));
    assert.ok(single.includes('Recommended aspect ratio 1:1'));
    assert.deepEqual(errors, []);
    instance.$destroy();
});

test('canceling a dirty multi-selection transition retains the original selected entries', async t => {
    const {controller, manager, rows, globals} = multipleSkins(t);
    manager.selectRows(rows.slice(0, 2));
    controller.edit('description', 'Keep this draft');
    const pending = controller.select(rows[2], {ctrlKey: true});
    globals.prompt.callback(globals.prompt.options.buttons.indexOf('Cancel'));
    await pending;
    assert.deepEqual(manager.state.selectedKeys, rows.slice(0, 2).map(row => row.key));
    assert.equal(manager.state.draft.description, 'Keep this draft');
    assert.equal(manager.state.dirty, true);
});

test('duplicate retains extension fields while allowing a new identity', t => {
    const {manager, repository, rows} = multipleSkins(t);
    const row = rows[0], data = repository.read(row.filename);
    data.skins[row.index].extension = {custom: ['keep']};
    fs.writeFileSync(row.filename, JSON.stringify(data));
    const source = repository.discover().rows.find(item => item.key === row.key);
    manager.duplicate(source);
    manager.edit('label', 'New identity');
    const result = manager.save(), saved = repository.read(result.filename);
    const duplicate = saved.skins.find(skin => skin.id === result.id);
    assert.deepEqual(duplicate.extension, source.skin.extension);
    assert.notEqual(duplicate.id, source.skin.id);
    assert.equal(duplicate.name.endsWith(' | New identity'), true);
    assert.deepEqual(saved.skins[source.index], source.skin);
});

test('bulk optional fields can be removed without changing untouched fields', t => {
    const {manager, repository, rows} = multipleSkins(t);
    manager.selectRows(rows);
    manager.edit('locked_text', 'Shared lock');
    manager.edit('unlocked', true);
    manager.edit('include_weight', true);
    manager.edit('weight', '12');
    manager.save();
    assert.ok(repository.discover().rows.every(row => row.skin.weight === 12 && row.skin.unlocked && row.skin.locked_text === 'Shared lock'));
    manager.edit('locked_text', '');
    manager.edit('unlocked', false);
    manager.edit('include_weight', false);
    manager.save();
    assert.ok(repository.discover().rows.every(row => !Object.hasOwn(row.skin, 'weight') && !Object.hasOwn(row.skin, 'unlocked') && !Object.hasOwn(row.skin, 'locked_text')));
});

test('pack title auto-save persists across restarts without changing an unsaved skin draft', async t => {
    const {controller, manager, rows, local, nativeRequire, repository} = multipleSkins(t);
    assert.equal(manager.state.packMetadata.title, 'Pack Name');
    manager.select(rows[0]);
    controller.edit('description', 'Unsaved skin metadata');
    const saved = await controller.updatePackMetadata({title: 'Personal pack'}, repository.paths.pack);
    assert.equal(saved, true);
    assert.equal(manager.state.packMetadata.title, 'Personal pack');
    assert.equal(manager.state.dirty, true);
    assert.equal(manager.state.draft.description, 'Unsaved skin metadata');
    assert.equal(repository.read(rows[0].filename).skins[rows[0].index].description, rows[0].skin.description);
    const restarted = new Controller(nativeRequire, local);
    t.after(() => restarted.dispose());
    restarted.start();
    assert.equal(restarted.manager.state.packMetadata.title, 'Personal pack');
    assert.equal(restarted.manager.state.draft.description, 'Unsaved skin metadata');
    assert.equal(await controller.updatePackMetadata({title: 'Wrong pack'}, 'different-pack'), false);
    assert.equal(manager.state.packMetadata.title, 'Personal pack');
});

test('unreadable pack metadata reports a notice and cannot be overwritten by title editing', async t => {
    const {controller, manager, repository, globals} = multipleSkins(t);
    const filename = path.join(repository.paths.pack, 'mcpskins_manager.json');
    fs.writeFileSync(filename, '{broken');
    controller.loadMetadata();
    assert.equal(manager.state.packMetadata.title, 'Pack Name');
    assert.match(manager.state.notice, /Pack metadata unavailable/);
    assert.equal(await controller.updatePackMetadata({title: 'Replacement'}, repository.paths.pack), undefined);
    assert.equal(fs.readFileSync(filename, 'utf8'), '{broken');
    assert.match(globals.prompt.options.message, /Unable to read/);
});

test('pack title renders beside Select Pack and inline edits save without a save button', async t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {controller, manager, repository} = multipleSkins(t);
    const errors = [];
    Vue.config.warnHandler = message => errors.push(message);
    Vue.config.errorHandler = error => errors.push(error.message);
    const component = panelComponent(controller), instance = new Vue({...component, ...Vue.compile(component.template)});
    const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
    const nodes = flatten(instance._render());
    assert.ok(nodes.some(node => node.tag === 'button' && node.children.some(child => child.text === 'Pack Name')));
    instance.editPackTitle();
    const editor = flatten(instance._render()).find(node => node.tag === 'input' && node.data.attrs['aria-label'] === 'Pack title');
    assert.ok(editor.data.on.blur);
    instance.titleDraft = 'New title';
    await instance.commitPackTitle();
    assert.equal(instance.titleEditing, false);
    assert.equal(manager.state.packMetadata.title, 'New title');
    assert.equal(JSON.parse(fs.readFileSync(path.join(repository.paths.pack, 'mcpskins_manager.json'), 'utf8')).title, 'New title');
    assert.deepEqual(errors, []);
    instance.$destroy();
});

test('recent packs persist name, author, path and namespace and reopen from the Select Pack list', async t => {
    const {controller, manager, repository, local, nativeRequire, root} = multipleSkins(t);
    const {RECENT_PACKS} = require('../src/storage/recent-packs');
    const dialogs = dialogEnvironment(t);
    await controller.updatePackMetadata({title: 'First pack', author: 'Mjonter'}, repository.paths.pack);
    const other = path.join(root, 'OtherPack');
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, 'mcpskins_manager.json'), JSON.stringify({title: 'Other title', author: 'Other author'}));
    controller.configure();
    const firstDialog = dialogs.at(-1);
    const recent = firstDialog.options.component.data().entries[0];
    assert.equal(recent.title, 'First pack');
    assert.equal(recent.author, 'Mjonter');
    assert.equal(recent.directory, repository.paths.pack);
    firstDialog.options.onConfirm({pack_directory: other, pack_namespace: 'custom_namespace'});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(manager.state.folder, 'OtherPack');
    controller.configure();
    const picker = dialogs.at(-1), entries = picker.options.component.data().entries;
    assert.deepEqual(entries.map(entry => entry.title), ['Other title', 'First pack']);
    assert.equal(entries[0].namespace, 'custom_namespace');
    await picker.options.component.methods.select(entries[1]);
    assert.equal(manager.state.folder, 'Example');
    assert.equal(manager.state.packMetadata.title, 'First pack');
    assert.equal(picker.visible, false);
    const history = JSON.parse(local.getItem(RECENT_PACKS));
    assert.equal(history.length, 2);
    assert.equal(history[0].title, 'First pack');
    const restarted = new Controller(nativeRequire, local);
    t.after(() => restarted.dispose());
    restarted.start();
    restarted.configure();
    assert.equal(dialogs.at(-1).options.component.data().entries.length, 2);
});

test('recent pack selection respects unsaved edits and handles missing directories without switching', async t => {
    const {controller, manager, root, local, globals} = multipleSkins(t);
    const {RECENT_PACKS} = require('../src/storage/recent-packs');
    const other = path.join(root, 'Other');
    fs.mkdirSync(other);
    local.setItem(RECENT_PACKS, JSON.stringify([{directory: other, namespace: 'custom', title: 'Other', author: ''}]));
    const dialogs = dialogEnvironment(t);
    controller.configure();
    const picker = dialogs.at(-1), entry = picker.options.component.data().entries.find(entry => entry.directory === other);
    controller.edit('description', 'Unsaved');
    const pending = picker.options.component.methods.select(entry);
    globals.prompt.callback(globals.prompt.options.buttons.indexOf('Cancel'));
    await pending;
    assert.equal(manager.state.folder, 'Example');
    assert.equal(manager.state.draft.description, 'Unsaved');
    assert.equal(picker.visible, true);
    controller.revert();
    fs.rmdirSync(other);
    await picker.options.component.methods.select(entry);
    assert.equal(manager.state.folder, 'Example');
    assert.equal(picker.visible, true);
    assert.match(globals.prompt.options.message, /does not exist/);
});

test('recent pack table renders Name, Author and Path safely with native Blockbench Vue', t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {recentPacksComponent} = require('../src/ui/dialogs');
    let selected;
    const entry = {directory: 'X:\\packs\\Example', title: '<Pack>', author: 'Author'};
    const component = recentPacksComponent([entry], value => { selected = value; });
    const errors = [];
    Vue.config.warnHandler = message => errors.push(message);
    Vue.config.errorHandler = error => errors.push(error.message);
    const instance = new Vue({...component, ...Vue.compile(component.template)});
    const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
    const nodes = flatten(instance._render());
    assert.deepEqual(nodes.filter(node => node.tag === 'th').map(node => node.children[0].text), ['Name', 'Author', 'Path']);
    assert.ok(nodes.some(node => node.text === '<Pack>'));
    instance.select(entry);
    assert.equal(selected.directory, entry.directory);
    assert.deepEqual(errors, []);
    instance.$destroy();
});

test('Author field auto-saves pack metadata and updates the recent list without saving skin edits', async t => {
    const {controller, manager, repository, rows, root, local} = multipleSkins(t);
    const {RECENT_PACKS} = require('../src/storage/recent-packs');
    const dialogs = dialogEnvironment(t);
    manager.select(rows[0]);
    controller.edit('description', 'Keep draft');
    controller.configure();
    const dialog = dialogs.at(-1);
    assert.equal(dialog.options.form.pack_author.label, 'Author');
    dialog.values.pack_author = 'Mjonter';
    dialog.options.onFormChange(dialog.values);
    const metadata = path.join(repository.paths.pack, 'mcpskins_manager.json');
    assert.equal(JSON.parse(fs.readFileSync(metadata, 'utf8')).author, 'Mjonter');
    assert.equal(manager.state.packMetadata.author, 'Mjonter');
    assert.equal(manager.state.dirty, true);
    assert.equal(dialog.options.component.data().entries[0].author, 'Mjonter');
    assert.equal(JSON.parse(local.getItem(RECENT_PACKS))[0].author, 'Mjonter');
    const other = path.join(root, 'OtherAuthorPack');
    fs.mkdirSync(other);
    const otherMetadata = path.join(other, 'mcpskins_manager.json');
    fs.writeFileSync(otherMetadata, JSON.stringify({title: 'Other', author: 'Someone', future: 123}));
    dialog.values.pack_directory = other;
    dialog.options.onFormChange(dialog.values);
    assert.equal(dialog.values.pack_author, 'Someone');
    assert.equal(JSON.parse(fs.readFileSync(otherMetadata, 'utf8')).author, 'Someone');
    dialog.values.pack_author = 'Different author';
    dialog.options.onFormChange(dialog.values);
    assert.deepEqual(JSON.parse(fs.readFileSync(otherMetadata, 'utf8')), {title: 'Other', author: 'Different author', future: 123});
    assert.equal(JSON.parse(fs.readFileSync(metadata, 'utf8')).author, 'Mjonter');
    assert.equal(manager.state.packMetadata.author, 'Mjonter');
    assert.equal(manager.state.folder, 'Example');
    dialog.values.pack_author = '';
    dialog.options.onFormChange(dialog.values);
    assert.equal(JSON.parse(fs.readFileSync(otherMetadata, 'utf8')).author, '');
});

test('Status hover menu saves color flags for selected skins and preserves skin drafts', async t => {
    const {controller, manager, rows, local, nativeRequire} = multipleSkins(t);
    const {rowStatus} = require('../src/domain/status');
    const previous = global.Menu;
    let items;
    global.Menu = class { constructor(entries) { items = entries; } open() {} };
    t.after(() => { if (previous === undefined) delete global.Menu; else global.Menu = previous; });
    manager.selectRows(rows.slice(0, 2));
    controller.edit('description', 'Keep this draft');
    controller.context(rows[0], {});
    const status = items.find(item => item.name === 'Status');
    assert.deepEqual(status.children.slice(0, 3).map(item => item.name), ['WIP', 'Planned', 'Complete']);
    await status.children.find(item => item.name === 'WIP').click();
    for (const row of rows.slice(0, 2)) assert.equal(rowStatus(manager.state.packMetadata, manager.repository.paths, row).color, '#E9B949');
    assert.equal(rowStatus(manager.state.packMetadata, manager.repository.paths, rows[2]), null);
    assert.equal(manager.state.draft.description, 'Keep this draft');
    assert.equal(manager.state.dirty, true);
    const restored = new Controller(nativeRequire, local);
    t.after(() => restored.dispose());
    restored.start();
    assert.equal(rowStatus(restored.manager.state.packMetadata, restored.manager.repository.paths, rows[0]).label, 'WIP');
    controller.context(rows[2], {});
    await items.find(item => item.name === 'Status').children.find(item => item.name === 'Complete').click();
    assert.equal(rowStatus(manager.state.packMetadata, manager.repository.paths, rows[2]).label, 'Complete');
    await controller.setStatus(rows[2], null);
    assert.equal(rowStatus(manager.state.packMetadata, manager.repository.paths, rows[2]), null);
});

test('health report opens in a native dialog and issue selection respects unsaved-change cancellation', async t => {
    const {controller, manager, rows, globals} = multipleSkins(t);
    const dialogs = dialogEnvironment(t);
    manager.select(rows[0]);
    controller.edit('description', 'Keep draft');
    const report = await controller.healthCheck();
    const dialog = dialogs.at(-1);
    assert.equal(dialog.id, 'mcpskins_health');
    assert.equal(report.skins, 4);
    const issue = report.issues.find(issue => issue.rowKey && issue.skinId !== rows[0].skin.id);
    const pending = dialog.options.component.methods.select(issue);
    globals.prompt.callback(globals.prompt.options.buttons.indexOf('Cancel'));
    await pending;
    assert.equal(manager.state.draft.description, 'Keep draft');
    assert.equal(dialog.visible, true);
    controller.revert();
    await dialog.options.component.methods.select(issue);
    assert.equal(manager.selected.skin.id, issue.skinId);
    assert.equal(dialog.visible, false);
});

test('health report and colored status flags render with installed Blockbench Vue', async t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {controller, manager, rows} = multipleSkins(t);
    await controller.setStatus(rows[0], 'planned');
    const errors = [];
    Vue.config.warnHandler = message => errors.push(message);
    Vue.config.errorHandler = error => errors.push(error.message);
    const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
    const component = panelComponent(controller), panel = new Vue({...component, ...Vue.compile(component.template)});
    const flag = flatten(panel._render()).find(node => node.data && node.data.attrs && node.data.attrs['aria-label'] === 'Planned');
    assert.equal(flag.data.style.color, '#E05A5A');
    const {healthComponent} = require('../src/ui/health');
    const report = {skins: 1, files: 1, issues: [{severity: 'warning', message: 'Missing image', filename: 'skin.png', rowKey: 'a', skinId: 'skin'}]};
    const health = healthComponent(report, () => {}, () => {}), view = new Vue({...health, ...Vue.compile(health.template)});
    assert.ok(view._render());
    assert.equal(view.warnings, 1);
    assert.equal(view.errors, 0);
    assert.deepEqual(errors, []);
    panel.$destroy(); view.$destroy();
});

test('Progress sorting uses Planned, WIP, Complete, and unassigned and reverses on the next click', async t => {
    const {controller, manager, rows} = multipleSkins(t);
    await controller.setStatus(rows[0], 'complete');
    await controller.setStatus(rows[1], 'planned');
    await controller.setStatus(rows[2], 'wip');
    manager.sort('progress');
    assert.deepEqual(manager.filteredRows().map(row => row.key), [rows[1].key, rows[2].key, rows[0].key, rows[3].key]);
    manager.sort('progress');
    assert.deepEqual(manager.filteredRows().map(row => row.key), [rows[3].key, rows[0].key, rows[2].key, rows[1].key]);
});

test('start-screen access supports the Blockbench 5.1 global section helper', t => {
    const {controller} = setup(t);
    const {environment, sections} = startScreenEnvironment();
    const previous = global.addStartScreenSection;
    global.addStartScreenSection = environment.startScreen.addSection;
    environment.startScreen = {};
    t.after(() => { if (previous === undefined) delete global.addStartScreenSection; else global.addStartScreenSection = previous; });
    const start = new StartScreenView(controller, environment);
    assert.equal(sections.length, 1);
    start.show();
    assert.equal(start.workspace.hidden, false);
    assert.equal(start.view.state, controller.manager.state);
    start.dispose();
    assert.equal(sections[0].deleted, true);
});

function keyboardHarness(controller) {
    const {ManagerKeyboard} = require('../src/ui/keyboard');
    let focus = null;
    const root = {querySelectorAll() { return nodes; }, querySelector(selector) { return selector.includes('Skin name') ? name : search; }};
    function element(kind, row) {
        return {
            kind, clientHeight: 120,
            closest(selector) {
                if (selector === '.mcpskins') return kind === 'outside' ? null : root;
                if (selector === '.mcpskins-table-wrap') return ['row', 'list'].includes(kind) ? list : null;
                if (selector === '[data-skin-key]') return kind === 'row' ? this : null;
                if (selector === 'input[type="search"]') return kind === 'search' ? this : null;
                if (selector === '.mcpskins-pack-title-input') return null;
                return selector.startsWith('input,') && ['search', 'text', 'name'].includes(kind) ? this : null;
            },
            getAttribute() { return row ? encodeURIComponent(row.key) : ''; },
            getBoundingClientRect() { return {height: 30}; },
            focus() { focus = this; }, select() { this.textSelected = true; }, scrollIntoView() {}
        };
    }
    const list = element('list'), search = element('search'), text = element('text'), name = element('name');
    const nodes = controller.manager.filteredRows().map(row => element('row', row));
    const keyboard = new ManagerKeyboard(controller);
    function press(key, target = focus || list, modifiers = {}) {
        const event = {key, target, ...modifiers, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }};
        const handled = keyboard.handle(event);
        return {event, handled};
    }
    return {keyboard, press, nodes, list, search, text, name, outside: element('outside'), get focus() { return focus; }};
}

test('keyboard navigation follows visible sorting and supports ranges, focus-only movement and list selection', async t => {
    const {controller, manager, rows} = multipleSkins(t);
    const keys = keyboardHarness(controller), flush = () => new Promise(resolve => setImmediate(resolve));
    keys.press('ArrowDown'); await flush();
    assert.equal(manager.selected.key, rows[0].key);
    assert.equal(keys.focus, keys.nodes[0]);
    keys.press('ArrowDown', keys.focus, {shiftKey: true}); await flush();
    assert.deepEqual(manager.state.selectedKeys, rows.slice(0, 2).map(row => row.key));
    keys.press('ArrowDown', keys.focus, {ctrlKey: true}); await flush();
    assert.equal(keys.focus, keys.nodes[2]);
    assert.equal(manager.selection.length, 2);
    keys.press('End'); await flush();
    assert.equal(manager.selected.key, rows.at(-1).key);
    keys.press('Home'); await flush();
    assert.equal(manager.selected.key, rows[0].key);
    keys.press('PageDown'); await flush();
    assert.equal(manager.selected.key, rows[3].key);
    keys.press('a', keys.focus, {ctrlKey: true}); await flush();
    assert.equal(manager.selection.length, 4);
    manager.state.search = rows[0].skin.collection;
    keys.press('a', keys.focus, {metaKey: true}); await flush();
    assert.equal(manager.selection.length, 4);
    assert.deepEqual(new Set(manager.state.selectedKeys), new Set(rows.map(row => row.key)));
    assert.equal(manager.state.search, rows[0].skin.collection);
    assert.equal(panelComponent(controller).computed.hiddenSelectedCount.call({s: manager.state, rows: manager.filteredRows()}), 3);
});

test('keyboard search and duplicate shortcuts focus the right fields while typing and outside keys are untouched', async t => {
    const {controller, manager, rows} = multipleSkins(t);
    const keys = keyboardHarness(controller), flush = () => new Promise(resolve => setImmediate(resolve));
    manager.select(rows[0]);
    const typing = keys.press('d', keys.text, {ctrlKey: true});
    assert.equal(typing.handled, false);
    assert.equal(manager.state.duplicatePending, false);
    assert.equal(keys.press('ArrowDown', keys.text).handled, false);
    assert.equal(keys.press('a', keys.text, {ctrlKey: true}).handled, false);
    assert.equal(keys.press('d', keys.outside, {ctrlKey: true}).handled, false);
    keys.press('f', keys.nodes[0], {ctrlKey: true});
    assert.equal(keys.focus, keys.search);
    assert.equal(keys.search.textSelected, true);
    manager.state.search = 'search term';
    keys.press('Escape', keys.search);
    assert.equal(manager.state.search, '');
    keys.press('ArrowDown', keys.search); await flush();
    assert.equal(keys.focus, keys.nodes[0]);
    keys.press('d', keys.nodes[0], {ctrlKey: true}); await flush();
    assert.equal(manager.state.duplicatePending, true);
    assert.equal(keys.focus, keys.name);
    assert.equal(keys.name.textSelected, true);
    const id = manager.state.draft.id;
    keys.press('d', keys.nodes[0], {ctrlKey: true, repeat: true}); await flush();
    assert.equal(manager.state.draft.id, id);
});

test('keyboard navigation cancellation retains draft, selection, and focus', async t => {
    const {controller, manager, rows, globals} = multipleSkins(t);
    const keys = keyboardHarness(controller);
    manager.select(rows[0]);
    keys.nodes[0].focus();
    controller.edit('description', 'Keep draft');
    keys.press('ArrowDown', keys.nodes[0]);
    globals.prompt.callback(globals.prompt.options.buttons.indexOf('Cancel'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(manager.selected.key, rows[0].key);
    assert.equal(manager.state.draft.description, 'Keep draft');
    assert.equal(keys.focus, keys.nodes[0]);
});

test('manager shortcuts invoke commands only in scope and do not repeat destructive transitions', async t => {
    const {controller, manager, rows} = multipleSkins(t);
    const keys = keyboardHarness(controller), calls = [];
    for (const command of ['newSkin', 'configure', 'refresh', 'healthCheck', 'save', 'openModel', 'showShortcuts']) controller[command] = () => { calls.push(command); return false; };
    manager.select(rows[0]);
    keys.press('s', keys.text, {ctrlKey: true});
    for (const key of ['n', 'o', 'r', 'h']) keys.press(key, keys.text, {ctrlKey: true, shiftKey: true});
    keys.press('Enter', keys.nodes[0]);
    await new Promise(resolve => setImmediate(resolve));
    keys.press('?', keys.nodes[0]);
    assert.deepEqual(calls, ['save', 'newSkin', 'configure', 'refresh', 'healthCheck', 'openModel', 'showShortcuts']);
    keys.press('h', keys.outside, {ctrlKey: true, shiftKey: true});
    keys.press('s', keys.text, {ctrlKey: true, isComposing: true});
    keys.press('s', keys.text, {ctrlKey: true, repeat: true});
    assert.equal(calls.length, 7);
});


test('Enter opens the focused row after Ctrl navigation rather than the previous selection', async t => {
    const {controller, manager, rows} = multipleSkins(t);
    const keys = keyboardHarness(controller);
    manager.select(rows[0]);
    keys.nodes[0].focus();
    keys.press('ArrowDown', keys.nodes[0], {ctrlKey: true});
    assert.equal(manager.selected.key, rows[0].key);
    let opened;
    controller.openModel = () => { opened = manager.selected.key; };
    keys.press('Enter');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(opened, rows[1].key);
});

function runtimeSourcePack(root, name, id = 'custom:rifle', texture = 'default skin') {
    const [ns, gun] = id.split(':'), folder = path.join(root, name);
    const write = (relative, data) => { const file = path.join(folder, relative); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data)); };
    write(`data/${ns}/index/guns/${gun}.json`, {display: `${ns}:${gun}_display`, name: 'Custom Rifle'});
    write(`assets/${ns}/display/guns/${gun}_display.json`, {model: `${ns}:gun/${gun}_geo`, texture: `${ns}:gun/uv/${gun}`});
    write(`assets/${ns}/geo_models/gun/${gun}_geo.json`, {'minecraft:geometry': [{description: {identifier: 'geometry.rifle'}, bones: []}]});
    write(`assets/${ns}/textures/gun/uv/${gun}.png`, texture);
    write(`assets/${ns}/textures/gun/uv/${gun}_n.png`, 'default normal');
    return folder;
}

test('controller discovers installed items, prepares canonical models, and remembers their paths for offline use', async t => {
    const {controller, root, local, nativeRequire, requests} = setup(t);
    const directory = path.join(root, 'gunpacks');
    runtimeSourcePack(directory, 'Custom');
    local.setItem('mcpskins_asset_manager.gunpacks.v1', JSON.stringify({directories: {[root]: directory}, choices: {}}));
    const catalog = controller.ensureGunPacks();
    assert.equal(controller.manager.state.gunPackItems[0].id, 'custom:rifle');
    assert.equal(controller.ensureGunPacks(), catalog);
    assert.ok(requests.some(request => request.name === 'fs' && request.options.scope === directory));
    controller.manager.clear();
    Object.assign(controller.manager.state.draft, {weapon: 'custom:rifle', label: 'Aurora', id: 'rifle_aurora', collection: 'Test', description: 'Test'});
    let opened;
    controller.bridge.openModel = files => { opened = files; };
    await controller.openModel();
    assert.equal(opened.model, path.join(root, 'Example/assets/custom/geo_models/gun/rifle_geo__skin_rifle_aurora.json'));
    assert.equal(fs.readFileSync(opened.texture, 'utf8'), 'default skin');
    assert.equal(fs.readFileSync(opened.normal, 'utf8'), 'default normal');
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'Example/mcpskins_manager.json'), 'utf8'));
    assert.equal(metadata.weapon_models['gun:custom:rifle'], 'custom:gun/rifle_geo');
    const restarted = new Controller(nativeRequire, local);
    t.after(() => restarted.dispose());
    restarted.start();
    assert.equal(restarted.manager.repository.paths.modelForSkin('custom:rifle', 'rifle_aurora'), opened.model);
    runtimeSourcePack(directory, 'Other', 'another:gun');
    assert.equal(controller.ensureGunPacks().items.length, 1);
    controller.rescanGunPacks();
    assert.equal(controller.catalog.items.length, 2);
});

test('source selection is remembered and cancellation or unload creates no skin assets', async t => {
    const {controller, root, local} = setup(t), dialogs = dialogEnvironment(t);
    const directory = path.join(root, 'gunpacks');
    const one = runtimeSourcePack(directory, 'One', 'custom:rifle', 'one');
    runtimeSourcePack(directory, 'Two', 'custom:rifle', 'two');
    const index = path.join(one, 'data/custom/index/guns/rifle.json');
    fs.writeFileSync(index, JSON.stringify({display: 'custom:rifle_display', name: 'First variant'}));
    local.setItem('mcpskins_asset_manager.gunpacks.v1', JSON.stringify({directories: {[root]: directory}}));
    controller.manager.clear();
    Object.assign(controller.manager.state.draft, {weapon: 'custom:rifle', label: 'Aurora', id: 'rifle_aurora', collection: 'Test', description: 'Test'});
    let opened;
    controller.bridge.openModel = files => { opened = files; };
    let pending = controller.openModel();
    assert.equal(dialogs.at(-1).id, 'mcpskins_gunpack_source');
    dialogs.at(-1).options.onCancel();
    await pending;
    assert.equal(opened, undefined);
    assert.equal(fs.existsSync(path.join(root, 'Example')), false);
    pending = controller.openModel();
    dialogs.at(-1).options.onConfirm({source: one});
    await pending;
    assert.equal(fs.readFileSync(opened.texture, 'utf8'), 'one');
    const saved = JSON.parse(local.getItem('mcpskins_asset_manager.gunpacks.v1'));
    assert.equal(saved.choices[directory]['data/custom/index/guns/rifle.json'], one);
    assert.equal(controller.sourceRequests.size, 0);
    controller.catalog.choices = {};
    local.setItem('mcpskins_asset_manager.gunpacks.v1', JSON.stringify({directories: {[root]: directory}}));
    pending = controller.openModel();
    controller.dispose();
    await pending;
    assert.equal(controller.sourceRequests.size, 0);
});

test('TaCZ directory override scans without changing skin drafts and can be restored later', t => {
    const {controller, root, local} = setup(t), dialogs = dialogEnvironment(t);
    const directory = path.join(root, 'custom-source');
    runtimeSourcePack(directory, 'Example');
    controller.manager.clear(); controller.edit('description', 'Keep draft');
    controller.configureGunPacks();
    const dialog = dialogs.at(-1);
    dialog.options.onConfirm({directory});
    assert.equal(dialog.visible, false);
    assert.equal(controller.gunPackDirectory(), directory);
    assert.equal(controller.manager.state.draft.description, 'Keep draft');
    assert.equal(controller.manager.state.dirty, true);
    assert.equal(JSON.parse(local.getItem('mcpskins_asset_manager.gunpacks.v1')).directories[root], directory);
});

test('unsaved legacy models are not migrated until their model and textures are saved', async t => {
    const {controller, root, local} = setup(t), directory = path.join(root, 'sources');
    runtimeSourcePack(directory, 'Custom');
    local.setItem('mcpskins_asset_manager.gunpacks.v1', JSON.stringify({directories: {[root]: directory}}));
    controller.manager.clear();
    Object.assign(controller.manager.state.draft, {weapon: 'custom:rifle', label: 'Aurora', id: 'rifle_aurora', collection: 'Test', description: 'Test'});
    const folder = controller.manager.repository.paths.textures('custom:rifle');
    fs.mkdirSync(folder, {recursive: true});
    const legacy = path.join(folder, 'rifle_aurora.geo.json');
    fs.writeFileSync(legacy, JSON.stringify({'minecraft:geometry': [{bones: []}]}));
    ModelProject.all.push({export_path: legacy, saved: false, textures: []});
    let opened;
    controller.bridge.openModel = files => { opened = files; };
    await controller.openModel();
    assert.equal(opened, undefined);
    assert.equal(fs.existsSync(path.join(root, 'Example/assets/custom/geo_models/gun/rifle_geo__skin_rifle_aurora.json')), false);
    ModelProject.all[0].saved = true;
    await controller.openModel();
    assert.ok(opened.model.endsWith('rifle_geo__skin_rifle_aurora.json'));
});

test('new skin fields and variant goals survive draft recovery without changing the pack author', async t => {
    const {controller, manager, rows, repository, local, nativeRequire} = multipleSkins(t);
    await controller.updatePackMetadata({author: 'Pack Team'}, repository.paths.pack);
    const root = rows.find(row => row.skin.id === 'ai_awp_alpha'), child = rows.find(row => row.skin.id === 'ai_awp_bravo');
    manager.select(root);
    controller.edit('author', 'Individual'); controller.edit('subtitle', 'A short line'); controller.edit('limited', true);
    controller.edit('variants', [child.skin.id]);
    controller.edit('levels', [{variant: child.skin.id, requires: {kills: '25', headshots: '5'}}]);
    const restored = new Controller(nativeRequire, local);
    t.after(() => restored.dispose()); restored.start();
    assert.equal(restored.manager.state.draft.author, 'Individual');
    assert.equal(restored.manager.state.draft.subtitle, 'A short line');
    assert.equal(restored.manager.state.draft.limited, true);
    assert.deepEqual(restored.manager.state.draft.variants, [child.skin.id]);
    assert.deepEqual(restored.manager.state.draft.levels[0].requires, {kills: '25', headshots: '5'});
    assert.equal(restored.manager.state.packMetadata.author, 'Pack Team');
    await restored.save();
    const saved = restored.manager.selected.skin;
    assert.equal(saved.author, 'Individual');
    assert.deepEqual(saved.levels[0].requires, {kills: 25, headshots: 5});
    assert.equal(restored.manager.state.packMetadata.author, 'Pack Team');
    assert.equal(Object.hasOwn(repository.read(root.filename), 'author'), false);
});

test('variant editor changes are immutable, remove linked goals, and preserve unknown level properties', () => {
    const {variantEditor} = require('../src/ui/variant-editor');
    const events = [];
    const original = [{variant: 'blue', requires: {kills: 100}, future: {keep: true}}];
    const instance = {variants: ['blue', 'gold'], levels: original, $emit(name, value) { events.push({name, value}); this[name] = value; }};
    for (const [key, method] of Object.entries(variantEditor.methods)) instance[key] = method.bind(instance);
    instance.setGoal(0, 'headshots', '10');
    assert.deepEqual(original, [{variant: 'blue', requires: {kills: 100}, future: {keep: true}}]);
    assert.deepEqual(instance.levels[0].requires, {kills: 100, headshots: '10'});
    assert.deepEqual(instance.levels[0].future, {keep: true});
    instance.addLevel(); assert.equal(instance.levels[1].variant, 'gold');
    instance.moveLevel(1, -1); assert.equal(instance.levels[0].variant, 'gold');
    instance.toggle('blue', false);
    assert.deepEqual(instance.variants, ['gold']);
    assert.equal(instance.levels.length, 1);
    assert.equal(instance.levels[0].variant, 'gold');
    instance.clearVariants(); assert.deepEqual(instance.variants, []); assert.deepEqual(instance.levels, []);
});

test('new metadata fields and the variant/level editor render with native Blockbench Vue', t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {variantEditor} = require('../src/ui/variant-editor');
    const {controller, manager, rows} = multipleSkins(t);
    manager.select(rows[0]);
    manager.edit('author', 'Individual Artist'); manager.edit('subtitle', 'Flavor line'); manager.edit('limited', true);
    const errors = [];
    Vue.config.warnHandler = message => errors.push(message); Vue.config.errorHandler = error => errors.push(error.message);
    const component = panelComponent(controller), panel = new Vue({...component, ...Vue.compile(component.template)});
    assert.ok(panel._render());
    const editor = new Vue({...variantEditor, ...Vue.compile(variantEditor.template), propsData: {
        variants: ['blue', 'gold'], levels: [{variant: 'gold', requires: {kills: 100, headshots: 10}}],
        candidates: [{id: 'blue', name: 'Blue', reason: ''}, {id: 'gold', name: 'Gold', reason: ''}], owner: ''
    }});
    const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
    const nodes = flatten(editor._render());
    assert.equal(nodes.filter(node => node.tag === 'input' && node.data.attrs.type === 'number').length, 3);
    assert.ok(nodes.some(node => node.text && node.text.includes('Level 2')));
    editor.owner = 'Parent skin'; assert.ok(editor._render());
    editor.levels = [null, {variant: 'bad', requires: {unknown_counter: 1}}]; assert.ok(editor._render());
    assert.deepEqual(errors, []);
    editor.$destroy(); panel.$destroy();
});

test('variant flags find parents outside filters and scope duplicate skin IDs to their registry file', t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {controller, manager, rows} = multipleSkins(t);
    const parent = rows[0], child = rows.find(row => row.filename === parent.filename && row.key !== parent.key);
    const unrelated = rows.find(row => row.filename !== parent.filename);
    parent.skin.variants = [child.skin.id];
    unrelated.skin.id = child.skin.id;
    manager.state.search = child.skin.name;
    const component = panelComponent(controller), panel = new Vue({...component, ...Vue.compile(component.template)});
    const tooltip = 'This skin is a variant of ' + parent.skin.name;
    assert.equal(panel.variantFlags.get(child.key), tooltip);
    assert.equal(panel.variantFlags.has(unrelated.key), false);
    const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
    const flags = flatten(panel._render()).filter(node => node.data?.staticClass?.includes('mcpskins-variant-flag'));
    assert.equal(flags.length, 1);
    assert.equal(flags[0].data.attrs.title, tooltip);
    panel.$destroy();
});

test('malformed recovered relationship arrays are ignored rather than loaded into the editor', t => {
    const {controller, local, nativeRequire} = setup(t);
    controller.manager.clear();
    controller.edit('author', 'Artist');
    const key = 'mcpskins_asset_manager.draft.v1', saved = JSON.parse(local.getItem(key));
    saved.draft.variants = {invalid: true}; local.setItem(key, JSON.stringify(saved));
    const restored = new Controller(nativeRequire, local); t.after(() => restored.dispose()); restored.start();
    assert.equal(restored.manager.state.dirty, false);
    assert.deepEqual(restored.manager.state.draft.variants, []);
});

test('Add Level creates a row before selecting variants and reward selection saves through the real Vue event wiring', async t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {variantEditor} = require('../src/ui/variant-editor');
    const {controller, manager, rows} = multipleSkins(t);
    const root = rows.find(row => row.skin.id === 'ai_awp_alpha'), child = rows.find(row => row.skin.id === 'ai_awp_bravo');
    manager.select(root);
    const warnings = [];
    Vue.config.warnHandler = message => warnings.push(message); Vue.config.errorHandler = error => warnings.push(error.message);
    const component = panelComponent(controller), parent = new Vue({...component, ...Vue.compile(component.template)});
    const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
    const children = [];
    const editor = () => {
        const vnode = flatten(parent._render()).find(node => node.componentOptions && node.componentOptions.tag === 'variant-editor');
        const view = new Vue({...variantEditor, ...Vue.compile(variantEditor.template), propsData: vnode.componentOptions.propsData, _parentListeners: vnode.componentOptions.listeners});
        children.push(view); return view;
    };
    let view = editor();
    const button = flatten(view._render()).find(node => node.tag === 'button' && (node.children || []).some(child => child.text === 'Add Level'));
    assert.equal(Boolean(button.data.attrs.disabled), false);
    button.data.on.click();
    assert.equal(manager.state.draft.levels.length, 1);
    assert.equal(manager.state.draft.levels[0].variant, '');
    assert.equal(manager.state.dirty, true);
    view = editor();
    assert.ok(view.levelCandidates.some(candidate => candidate.id === child.skin.id));
    view.selectTarget(0, child.skin.id);
    assert.deepEqual(Array.from(manager.state.draft.variants), [child.skin.id]);
    assert.equal(manager.state.draft.levels[0].variant, child.skin.id);
    view = editor(); view.setGoal(0, 'kills', '10');
    await controller.save();
    assert.deepEqual(Array.from(manager.selected.skin.variants), [child.skin.id]);
    assert.deepEqual(JSON.parse(JSON.stringify(manager.selected.skin.levels)), [{variant: child.skin.id, requires: {kills: 10}}]);
    assert.deepEqual(warnings, []);
    children.forEach(view => view.$destroy()); parent.$destroy();
});

test('Add Level explains missing reward skins and remains disabled for a child variant', t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {variantEditor} = require('../src/ui/variant-editor');
    const view = new Vue({...variantEditor, ...Vue.compile(variantEditor.template), propsData: {variants: [], levels: [{variant: '', requires: {}}], candidates: [], owner: ''}});
    const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
    assert.ok(flatten(view._render()).some(node => node.text && node.text.includes('Create or duplicate another skin')));
    view.owner = 'Parent skin';
    const button = flatten(view._render()).find(node => node.tag === 'button' && (node.children || []).some(child => child.text === 'Add Level'));
    assert.equal(button.data.attrs.disabled, true);
    view.$destroy();
});

function chooseUnsaved(globals, label) {
    const index = globals.prompt.options.buttons.indexOf(label);
    assert.ok(index >= 0, 'Expected prompt choice: ' + label);
    globals.prompt.callback(index);
}

test('Save and Continue saves the current skin and selects a fresh target without a later conflict', async t => {
    const {controller, manager, rows, repository, globals} = multipleSkins(t);
    const first = rows.find(row => row.skin.id === 'ai_awp_alpha'), next = rows.find(row => row.skin.id === 'ai_awp_bravo');
    manager.select(first); controller.edit('description', 'Saved before selecting');
    manager.state.search = 'ai_awp';
    const pending = controller.select(next);
    assert.deepEqual(globals.prompt.options.buttons, ['Save and Continue', 'Discard', 'Cancel']);
    chooseUnsaved(globals, 'Save and Continue');
    assert.equal(await pending, true);
    assert.equal(manager.selected.skin.id, next.skin.id);
    assert.equal(manager.selected.data.skins[first.index].description, 'Saved before selecting');
    assert.equal(manager.state.search, 'ai_awp');
    controller.edit('description', 'Next skin edit'); await controller.save();
    assert.equal(repository.read(next.filename).skins[next.index].description, 'Next skin edit');
    assert.equal(repository.read(first.filename).skins[first.index].description, 'Saved before selecting');
});

test('Discard continues without saving while Cancel leaves the operation and draft unchanged', async t => {
    const {controller, manager, rows, repository, globals} = multipleSkins(t);
    manager.select(rows[0]); controller.edit('description', 'Discard me');
    const before = fs.readFileSync(rows[0].filename, 'utf8');
    let pending = controller.select(rows[1]); chooseUnsaved(globals, 'Cancel');
    assert.equal(await pending, false); assert.equal(manager.state.draft.description, 'Discard me');
    pending = controller.select(rows[1]); chooseUnsaved(globals, 'Discard');
    assert.equal(await pending, true); assert.equal(manager.selected.skin.id, rows[1].skin.id);
    assert.equal(fs.readFileSync(rows[0].filename, 'utf8'), before);
    assert.equal(manager.state.dirty, false);
});

test('Save and Continue duplicates the newly saved metadata instead of the old row snapshot', async t => {
    const {controller, manager, rows, globals} = multipleSkins(t);
    manager.select(rows[0]); controller.edit('description', 'Updated original');
    const pending = controller.duplicateSkin(rows[0]); chooseUnsaved(globals, 'Save and Continue');
    assert.equal(await pending, true);
    assert.equal(manager.state.duplicatePending, true);
    assert.equal(manager.state.draft.description, 'Updated original');
    assert.equal(manager.duplicateSource.skin.description, 'Updated original');
});

test('Save and Continue includes a newly saved skin in Select All and refreshes batch-edit snapshots', async t => {
    const {controller, manager, rows, globals} = multipleSkins(t);
    manager.clear();
    Object.assign(manager.state.draft, {weapon: 'tacz:ak47', label: 'Echo', collection: 'Test', description: 'New skin'});
    controller.edit('author', 'Artist');
    let pending = controller.selectAll(); chooseUnsaved(globals, 'Save and Continue');
    assert.equal(await pending, true);
    assert.equal(manager.selection.length, 5);
    assert.ok(manager.selection.some(row => row.skin.id === 'ak47_echo'));
    controller.edit('subtitle', 'Batch change');
    pending = controller.select(manager.state.rows[0]); chooseUnsaved(globals, 'Save and Continue');
    assert.equal(await pending, true);
    assert.equal(manager.selected.skin.subtitle, 'Batch change');
    controller.edit('author', 'Follow-up'); await controller.save();
    assert.equal(manager.selected.skin.author, 'Follow-up');
});

test('failed saves stop the pending operation and retain dirty edits and recovery data', async t => {
    const {controller, manager, rows, repository, globals, local} = multipleSkins(t);
    manager.select(rows[0]); controller.edit('description', '');
    let pending = controller.newSkin(); chooseUnsaved(globals, 'Save and Continue');
    assert.equal(await pending, false);
    assert.equal(manager.selected.skin.id, rows[0].skin.id);
    assert.equal(manager.state.dirty, true);
    assert.ok(local.getItem('mcpskins_asset_manager.draft.v1'));
    assert.equal(controller.switching, false);
    controller.edit('description', 'Valid but cannot write');
    const before = fs.readFileSync(rows[0].filename, 'utf8');
    repository.fs = {...fs, renameSync() { throw new Error('Simulated write failure'); }};
    pending = controller.refresh(); chooseUnsaved(globals, 'Save and Continue');
    assert.equal(await pending, false);
    assert.equal(manager.state.draft.description, 'Valid but cannot write');
    assert.equal(manager.state.dirty, true);
    assert.equal(fs.readFileSync(rows[0].filename, 'utf8'), before);
    assert.equal(fs.existsSync(rows[0].filename + '.tmp'), false);
});

test('canceling a required name-prefix prompt cancels Save and Continue too', async t => {
    const {controller, manager, globals, root} = multipleSkins(t), dialogs = dialogEnvironment(t);
    manager.clear();
    Object.assign(manager.state.draft, {weapon: 'custom:rifle', label: 'Draft', collection: 'Test', description: 'Keep'});
    controller.edit('subtitle', 'Unsaved');
    const pending = controller.newSkin(); chooseUnsaved(globals, 'Save and Continue');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dialogs.at(-1).id, 'mcpskins_weapon_prefix');
    dialogs.at(-1).options.onCancel();
    assert.equal(await pending, false);
    assert.equal(manager.state.draft.weapon, 'custom:rifle');
    assert.equal(manager.state.draft.subtitle, 'Unsaved');
    assert.equal(manager.state.dirty, true);
    assert.equal(controller.switching, false);
});

test('Save and Continue saves the old pack before applying a pack switch', async t => {
    const {controller, manager, rows, repository, globals, root} = multipleSkins(t), dialogs = dialogEnvironment(t);
    manager.select(rows[0]); controller.edit('description', 'Saved in old pack');
    const other = path.join(root, 'Other'); fs.mkdirSync(other);
    controller.configure();
    const dialog = dialogs.at(-1);
    dialog.options.onConfirm({pack_directory: other, pack_namespace: 'other'});
    chooseUnsaved(globals, 'Save and Continue');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(manager.state.folder, 'Other');
    assert.equal(dialog.visible, false);
    assert.equal(repository.read(rows[0].filename).skins[rows[0].index].description, 'Saved in old pack');
});

test('Save and Continue lets health navigation select a skin renamed by the save', async t => {
    const {controller, manager, rows, globals} = multipleSkins(t), dialogs = dialogEnvironment(t);
    manager.select(rows[0]); controller.edit('id', 'renamed_skin');
    const report = await controller.healthCheck(), dialog = dialogs.at(-1);
    const issue = report.issues.find(issue => issue.rowKey === rows[0].key);
    const pending = dialog.options.component.methods.select(issue);
    chooseUnsaved(globals, 'Save and Continue');
    assert.equal(await pending, true);
    assert.equal(manager.selected.skin.id, 'renamed_skin');
    assert.equal(dialog.visible, false);
});

test('Save and Continue follows the intended target if unrelated entries were reordered on disk', async t => {
    const {controller, manager, rows, repository, globals} = multipleSkins(t);
    const first = rows.find(row => row.skin.id === 'ai_awp_alpha'), next = rows.find(row => row.skin.id === 'ai_awp_bravo');
    manager.select(first); controller.edit('description', 'Saved');
    const data = repository.read(first.filename);
    data.skins.splice(1, 0, {...data.skins[1], id: 'ai_awp_external'});
    fs.writeFileSync(first.filename, JSON.stringify(data));
    const pending = controller.select(next); chooseUnsaved(globals, 'Save and Continue');
    assert.equal(await pending, true);
    assert.equal(manager.selected.skin.id, 'ai_awp_bravo');
    assert.equal(manager.selected.index, 2);
});


test('native rarity dropdowns follow the selected pack and Reset uses the pack rarity color', t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {PackPaths} = require('../src/domain/paths');
    const {RegistryRepository} = require('../src/storage/registry');
    const {controller, manager, repository, root, rows} = multipleSkins(t);
    const directory = path.join(repository.paths.pack, 'data', 'another_namespace', 'skin_rarities');
    fs.mkdirSync(directory, {recursive: true});
    fs.writeFileSync(path.join(directory, 'mythic.json'), JSON.stringify({name: 'Mythic', color: '#FF4FD8', order: 500}));
    manager.reload();
    manager.select(manager.state.rows.find(row => row.key === rows[0].key));
    const errors = [];
    Vue.config.warnHandler = message => errors.push(message); Vue.config.errorHandler = error => errors.push(error.message);
    const component = panelComponent(controller), panel = new Vue({...component, ...Vue.compile(component.template)});
    const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
    const options = () => flatten(panel._render()).filter(node => node.tag === 'option' && node.data?.domProps?.value === 'mythic');
    assert.equal(options().length, 2); // Filter and inspector selectors.
    assert.ok(options().every(node => node.children[0].text === 'Mythic'));
    manager.edit('rarity', 'mythic');
    manager.edit('color', '#112233');
    controller.resetColor();
    assert.equal(manager.state.draft.color, '#FF4FD8');
    const second = new RegistryRepository(fs, new PackPaths(path, root, 'Second', 'second'));
    manager.attach(second);
    assert.equal(options().length, 0);
    manager.attach(repository);
    manager.select(manager.state.rows[0]);
    assert.equal(options().length, 2);
    assert.deepEqual(errors, []);
    panel.$destroy();
});


test('Gun Packs menu rescans item families and custom rarities with completion feedback while preserving unsaved edits', t => {
    const {controller, manager, repository, rows, root, globals} = multipleSkins(t), dialogs = dialogEnvironment(t);
    const directory = path.join(root, 'sources'), source = runtimeSourcePack(directory, 'Mixed');
    for (const [folder, id] of [['attachments', 'scope'], ['melee', 'knife'], ['throwables', 'grenade'], ['consumables', 'medkit']]) {
        const filename = path.join(source, 'data/addon/index', folder, id + '.json');
        fs.mkdirSync(path.dirname(filename), {recursive: true});
        fs.writeFileSync(filename, JSON.stringify({name: id}));
    }
    const rarityFile = path.join(repository.paths.pack, 'data/other/skin_rarities/mythic.json');
    fs.mkdirSync(path.dirname(rarityFile), {recursive: true});
    fs.writeFileSync(rarityFile, JSON.stringify({name: 'Mythic', color: '#FF4FD8'}));
    manager.select(rows[0]); controller.edit('description', 'Keep my unsaved edits');
    const selected = manager.state.selectedKeys.slice(), draft = manager.state.draft;
    controller.configureGunPacks();
    const dialog = dialogs.at(-1);
    assert.deepEqual(dialog.options.buttons, ['Rescan', 'Cancel']);
    dialog.options.onConfirm({directory});
    assert.equal(dialog.visible, false);
    assert.equal(globals.prompt.options.title, 'Scan complete');
    for (const label of ['Guns', 'Attachments', 'Melee', 'Throwables', 'Consumables', 'Custom rarities']) {
        assert.ok(globals.prompt.options.message.includes(label + ': 1'));
    }
    assert.equal(manager.state.rarities.mythic.color, '#FF4FD8');
    assert.equal(manager.state.draft, draft);
    assert.equal(manager.state.draft.description, 'Keep my unsaved edits');
    assert.equal(manager.state.dirty, true);
    assert.deepEqual(manager.state.selectedKeys, selected);
    assert.ok(manager.state.gunPackMessage.includes('1 melee'));
    fs.unlinkSync(rarityFile);
    controller.rescanGunPacks();
    assert.equal(Object.hasOwn(manager.state.rarities, 'mythic'), false);
    assert.ok(globals.prompt.options.message.includes('Custom rarities: 0'));
});

test('failed gun-pack rescans still refresh rarities and report the failure instead of scan completion', async t => {
    const {controller, root, globals} = setup(t);
    const file = path.join(controller.manager.repository.paths.pack, 'data/other/skin_rarities/mythic.json');
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, '{}');
    controller.gunPackDirectory = () => path.join(root, 'missing_sources');
    await controller.rescanGunPacks();
    assert.ok(Object.hasOwn(controller.manager.state.rarities, 'mythic'));
    assert.notEqual(globals.prompt.options.title, 'Scan complete');
    assert.ok(globals.prompt.options.message.includes('does not exist'));
});


function healthySavedPack(t) {
    const context = setup(t), {controller} = context, repository = controller.manager.repository;
    const result = repository.save({...controller.manager.state.draft, weapon: 'tacz:ai_awp', label: 'Healthy', collection: 'Test', description: 'Test'});
    controller.manager.reload();
    const folder = repository.paths.textures('tacz:ai_awp');
    fs.mkdirSync(folder, {recursive: true});
    const asset = suffix => path.join(folder, result.id + suffix);
    const png = (width = 32, height = 32) => {
        const bytes = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
        bytes.write('IHDR', 12); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20); return bytes;
    };
    fs.writeFileSync(asset('.json'), JSON.stringify({'minecraft:geometry': [{bones: []}]}));
    fs.writeFileSync(asset('.png'), png());
    fs.writeFileSync(asset('_hud.png'), png(96, 32));
    fs.writeFileSync(asset('_icon.png'), png());
    return {...context, repository, asset, png};
}

test('live health polls saved files, prioritizes errors, caches unchanged packs, and stops on disposal', t => {
    t.mock.timers.enable({apis: ['setTimeout', 'setInterval']});
    const {controller, asset, png} = healthySavedPack(t), state = controller.manager.state;
    t.mock.timers.tick(3000);
    assert.equal(state.health.status, 'good');
    const report = controller.healthReport;
    assert.equal(controller.updateHealth(), report);
    fs.unlinkSync(asset('_hud.png'));
    t.mock.timers.tick(3000);
    assert.equal(state.health.status, 'warning');
    assert.equal(state.health.warnings, 1);
    fs.writeFileSync(asset('.png'), 'corrupt');
    t.mock.timers.tick(3000);
    assert.equal(state.health.status, 'error');
    assert.equal(state.health.errors, 1);
    fs.writeFileSync(asset('.png'), png());
    fs.writeFileSync(asset('_hud.png'), png(96, 32));
    t.mock.timers.tick(3000);
    assert.equal(state.health.status, 'good');
    controller.dispose();
    fs.unlinkSync(asset('.png'));
    t.mock.timers.tick(6000);
    assert.equal(state.health.status, 'good');
    assert.equal(controller.updateHealth(), null);
});

test('health ignores persist per pack, preserve drafts and metadata, and can be restored', async t => {
    const {controller, repository, asset, root, local, nativeRequire} = healthySavedPack(t);
    const {PackPaths} = require('../src/domain/paths');
    const {RegistryRepository} = require('../src/storage/registry');
    const {loadPackMetadata, savePackMetadata} = require('../src/storage/pack-metadata');
    savePackMetadata(fs, repository.paths, {title: 'Keep title', author: 'Team', future: {keep: true}});
    controller.manager.select(controller.manager.state.rows[0]);
    controller.edit('description', 'Keep unsaved draft');
    fs.unlinkSync(asset('_hud.png'));
    const report = controller.updateHealth(), issue = report.issues[0];
    assert.equal(controller.manager.state.health.status, 'warning');
    const ignored = await controller.setHealthIgnored(repository, issue, true);
    assert.equal(ignored.issues[0].ignored, true);
    assert.equal(controller.manager.state.health.status, 'good');
    assert.equal(controller.manager.state.health.ignored, 1);
    assert.equal(controller.manager.state.dirty, true);
    assert.equal(controller.manager.state.draft.description, 'Keep unsaved draft');
    const metadata = loadPackMetadata(fs, repository.paths);
    assert.equal(metadata.title, 'Keep title'); assert.equal(metadata.author, 'Team');
    assert.deepEqual(metadata.future, {keep: true});
    assert.equal(metadata.ignored_health_issues.length, 1);
    const restarted = new Controller(nativeRequire, local); t.after(() => restarted.dispose()); restarted.start();
    assert.equal(restarted.updateHealth().issues[0].ignored, true);
    const other = new RegistryRepository(fs, new PackPaths(path, root, 'Other', 'other'));
    controller.manager.attach(other);
    assert.equal(await controller.setHealthIgnored(repository, issue, false), null);
    controller.updateHealth(); assert.equal(controller.manager.state.health.status, 'error');
    controller.manager.attach(repository);
    controller.updateHealth(); assert.equal(controller.manager.state.health.status, 'good');
    const restored = await controller.setHealthIgnored(repository, issue, false);
    assert.equal(restored.issues[0].ignored, false);
    assert.equal(controller.manager.state.health.status, 'warning');
    assert.deepEqual(loadPackMetadata(fs, repository.paths).ignored_health_issues, []);
});

test('health ignore keys are portable, distinguish findings, and failed persistence does not hide an issue', async t => {
    const {controller, repository, asset, root, globals} = healthySavedPack(t);
    const {healthIssueKey} = require('../src/assets/health-monitor');
    const {PackPaths} = require('../src/domain/paths');
    fs.unlinkSync(asset('_hud.png'));
    const report = controller.updateHealth(), issue = report.issues[0];
    const moved = new PackPaths(path, path.join(root, 'relocated'), 'Example', 'example');
    const movedIssue = {...issue, registry: path.join(moved.pack, path.relative(repository.paths.pack, issue.registry)),
        filename: path.join(moved.pack, path.relative(repository.paths.pack, issue.filename))};
    assert.equal(healthIssueKey(repository.paths, issue), healthIssueKey(moved, movedIssue));
    assert.notEqual(healthIssueKey(repository.paths, issue), healthIssueKey(repository.paths, {...issue, message: 'Different problem'}));
    const temporary = path.join(repository.paths.pack, 'mcpskins_manager.json.tmp');
    fs.writeFileSync(temporary, 'occupied');
    assert.equal(await controller.setHealthIgnored(repository, issue, true), undefined);
    assert.equal(controller.manager.state.health.status, 'warning');
    assert.equal(controller.healthReport.issues[0].ignored, false);
    assert.ok(globals.prompt.options.message);
});

test('native health button and report reflect live status and Ignore/Restore actions', async t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {controller, repository, asset} = healthySavedPack(t), dialogs = dialogEnvironment(t);
    fs.unlinkSync(asset('_hud.png'));
    const component = panelComponent(controller), panel = new Vue({...component, ...Vue.compile(component.template)});
    const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
    const button = () => flatten(panel._render()).find(node => node.data?.staticClass?.includes('mcpskins-health-button'));
    await controller.healthCheck();
    const health = dialogs.at(-1).options.component, view = new Vue({...health, ...Vue.compile(health.template)});
    assert.equal(button().data.attrs['data-health'], 'warning');
    assert.equal(view.warnings, 1);
    assert.ok(view._render());
    await view.ignore(view.activeIssues[0], true);
    assert.equal(view.activeIssues.length, 0); assert.equal(view.ignoredIssues.length, 1);
    assert.equal(button().data.attrs['data-health'], 'good');
    assert.ok(button().data.attrs.title.includes('1 ignored'));
    assert.ok(view._render());
    await view.ignore(view.ignoredIssues[0], false);
    assert.equal(view.warnings, 1); assert.equal(view.ignoredIssues.length, 0);
    assert.equal(button().data.attrs['data-health'], 'warning');
    fs.writeFileSync(asset('.png'), 'corrupt'); controller.updateHealth();
    assert.equal(button().data.attrs['data-health'], 'error');
    assert.ok(view._render());
    panel.$destroy(); view.$destroy();
});


test('Rarities dialog renders its list and inspector with native Vue and saves through real field events', async t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {controller, manager, rows} = multipleSkins(t), dialogs = dialogEnvironment(t);
    manager.select(rows[0]); controller.edit('description', 'Keep skin draft');
    const skinDraft = manager.state.draft;
    await controller.openRarities();
    const dialog = dialogs.at(-1), component = dialog.options.component;
    assert.equal(dialog.id, 'mcpskins_rarities');
    const errors = [];
    Vue.config.warnHandler = message => errors.push(message); Vue.config.errorHandler = error => errors.push(error.message);
    const view = new Vue({...component, ...Vue.compile(component.template)});
    const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
    const text = node => (node.text || '') + (node.children || []).map(text).join('');
    const button = label => flatten(view._render()).find(node => node.tag === 'button' && text(node) === label);
    assert.equal(view.rows.length, 5);
    assert.ok(view._render());
    await button('New Rarity').data.on.click();
    const input = (key, value) => view.edit(key, {target: {type: 'text', value}});
    input('id', 'mythic'); input('name', 'Mythic'); input('color', '#FF4FD8'); input('order', '500');
    view.edit('override_cost', {target: {type: 'checkbox', checked: true}});
    input('fuse_cost', '5'); input('fusion_mode', 'weighted');
    button('Add Target').data.on.click();
    view.target(0, 'rarity', {target: {value: 'legendary'}});
    view.target(0, 'weight', {target: {value: '5'}});
    assert.ok(view._render());
    const form = flatten(view._render()).find(node => node.tag === 'form');
    form.data.on.submit({preventDefault() {}});
    assert.equal(view.r.error, ''); assert.equal(view.r.selectedId, 'mythic');
    assert.equal(manager.state.rarities.mythic.color, '#FF4FD8');
    assert.equal(manager.state.draft, skinDraft); assert.equal(manager.state.dirty, true);
    assert.equal(manager.state.draft.description, 'Keep skin draft');
    const filename = path.join(manager.repository.paths.pack, 'data', manager.state.namespace, 'skin_rarities/mythic.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')).fuses_into, [{rarity: 'legendary', weight: 5}]);
    await view.select('legendary'); assert.equal(view.builtin, true);
    assert.ok(button('Save Pack Override')); assert.ok(view._render());
    assert.deepEqual(errors, []);
    view.$destroy();
});

test('closing the Rarities dialog offers Save and Continue, Discard and Cancel without saving skin drafts', async t => {
    const {controller, manager, globals} = multipleSkins(t), dialogs = dialogEnvironment(t);
    await controller.openRarities();
    const dialog = dialogs.at(-1), editor = controller.rarityEditor;
    await editor.select('common'); editor.edit('name', 'Everyday');
    assert.equal(dialog.options.onCancel(), false);
    globals.prompt.callback(2); await new Promise(resolve => setImmediate(resolve));
    assert.equal(dialog.visible, true); assert.equal(editor.state.dirty, true);
    dialog.options.onConfirm(); globals.prompt.callback(0); await new Promise(resolve => setImmediate(resolve));
    assert.equal(dialog.visible, false); assert.equal(manager.state.rarities.common.name, 'Everyday');
    await controller.openRarities();
    const next = dialogs.at(-1); await controller.rarityEditor.select('rare'); controller.rarityEditor.edit('name', 'Unsaved Rare');
    next.options.onCancel(); globals.prompt.callback(1); await new Promise(resolve => setImmediate(resolve));
    assert.equal(next.visible, false); assert.equal(manager.state.rarities.rare.name, 'rare');
});


test('Open Folder creates the validated skin folder, preserves existing contents and rejects invalid paths', async t => {
    const {controller, globals} = setup(t), repository = controller.manager.repository;
    controller.manager.clear(); controller.edit('weapon', 'lrtactical:karambit');
    const folder = repository.paths.textures('lrtactical:karambit'), opened = [];
    controller.desktop.open = async (file, directory) => { assert.equal(fs.statSync(file).isDirectory(), true); opened.push({file, directory}); };
    assert.equal(fs.existsSync(folder), false);
    await controller.openFolder();
    assert.deepEqual(opened, [{file: folder, directory: true}]);
    const sentinel = path.join(folder, 'keep.txt'); fs.writeFileSync(sentinel, 'Keep this');
    await controller.openFolder(); assert.equal(fs.readFileSync(sentinel, 'utf8'), 'Keep this');
    controller.manager.state.draft.weapon = '../../outside';
    await controller.openFolder();
    assert.equal(opened.length, 2); assert.ok(globals.prompt.options.message.includes('valid namespaced weapon ID'));
    controller.manager.state.draft.weapon = 'lrtactical:blocked';
    const blocked = repository.paths.textures('lrtactical:blocked'); fs.writeFileSync(blocked, 'Existing file');
    await controller.openFolder();
    assert.equal(opened.length, 2); assert.equal(fs.readFileSync(blocked, 'utf8'), 'Existing file');
});


test('startup update check works without a selected pack and the native header icon opens the new GitHub release', async t => {
    const Vue = installedVue();
    if (!Vue) { t.skip('Installed Blockbench bundle not available'); return; }
    const {nativeRequire, globals} = setup(t);
    let calls = 0, finish, opened;
    const controller = new Controller(nativeRequire, storage(), {fetch: () => { calls++; return new Promise(resolve => { finish = resolve; }); }});
    t.after(() => controller.dispose());
    globals.Blockbench.openLink = url => { opened = url; };
    controller.start(); assert.equal(calls, 1); assert.equal(controller.manager.state.ready, false);
    const component = panelComponent(controller), panel = new Vue({...component, ...Vue.compile(component.template)});
    const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
    const icon = () => flatten(panel._render()).find(node => node.data?.staticClass?.includes('mcpskins-update-button'));
    assert.equal(icon(), undefined);
    finish({ok: true, json: async () => ({tag_name: 'v1.3.0'})});
    await controller.checkForUpdates();
    assert.equal(calls, 1);
    assert.ok(icon().data.attrs.title.includes('v1.3.0'));
    icon().data.on.click();
    assert.equal(opened, 'https://github.com/DrMjonter/MCPSkins-Manager/releases/tag/v1.3.0');
    panel.$destroy();
});

test('unloading the plugin cancels an in-flight update check and keeps the update icon hidden', async t => {
    const {nativeRequire} = setup(t);
    const controller = new Controller(nativeRequire, storage(), {fetch: () => new Promise(() => {})});
    controller.start(); const pending = controller.checkForUpdates(); controller.dispose();
    assert.equal(await pending, null); assert.equal(controller.manager.state.update, null);
});
