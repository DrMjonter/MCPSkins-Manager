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
            this.values = Object.fromEntries(Object.entries(options.form).map(([key, item]) => [key, item.value]));
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
    assert.deepEqual(Object.keys(dialog.options.form), ['pack_directory', 'pack_namespace']);
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
    globals.prompt.callback(1);
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
    globals.prompt.callback(1);
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
    globals.prompt.callback(1);
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
    const context = {console, setTimeout, clearTimeout, requireNativeModule: name => require(name),
        localStorage: storage(), Plugin: {register(id, options) { assert.equal(id, 'mcpskins_asset_manager'); plugin = options; }},
        Action, Panel, Toolbar: class { delete() {} }, MenuBar: {addAction(_action, location) { menus.push(location); }},
        document: environment.document, Vue: environment.Vue, StartScreen: environment.startScreen,
        Blockbench: {Project: 0, addCSS() { counts.css++; return {delete() { counts.css--; }}; }},
        window: {addEventListener(name, handler) { listeners.set(name, handler); }, removeEventListener(name, handler) { assert.equal(listeners.get(name), handler); listeners.delete(name); }}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../mcpskins_asset_manager.js'), 'utf8'), context);
    assert.equal(plugin.variant, 'desktop');
    assert.equal(plugin.min_version, '5.2.2');
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
