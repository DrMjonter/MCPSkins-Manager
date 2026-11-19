'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {PackPaths} = require('../src/domain/paths');
const {RARITIES} = require('../src/domain/constants');
const {defaultRarities, sortedRarities} = require('../src/domain/rarities');
const {emptyDraft} = require('../src/domain/skin');
const {scanRarities} = require('../src/storage/rarities');
const {RegistryRepository} = require('../src/storage/registry');
const {Manager} = require('../src/state/manager');
const {checkPack} = require('../src/assets/health');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpskins-rarities-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const paths = new PackPaths(path, root, 'First', 'skins_namespace');
    const write = (namespace, id, value) => {
        const filename = path.join(paths.pack, 'data', namespace, 'skin_rarities', id + '.json');
        fs.mkdirSync(path.dirname(filename), {recursive: true});
        fs.writeFileSync(filename, typeof value === 'string' ? value : JSON.stringify(value));
        return filename;
    };
    const repository = new RegistryRepository(fs, paths);
    return {root, paths, write, repository};
}
const draft = overrides => ({...emptyDraft(), weapon: 'tacz:ai_awp', label: 'Test', collection: 'Test', description: 'Test', ...overrides});

test('rarity scanning covers all namespaces, applies documented defaults, overrides built-ins and uses ladder order', t => {
    const {paths, write, repository} = fixture(t);
    write('other_namespace', 'mythic', {name: 'Mythic', color: '0xFF4FD8', order: 500, future: {preserve: true}});
    write('another_namespace', 'intermediate', {name: 'Intermediate', color: '#123456', order: 150});
    write('other_namespace', 'legendary', {name: 'Gold', color: '#998800', order: 400});
    write('other_namespace', 'minimal', {});
    const result = repository.discover();
    assert.equal(result.missing, true); // Definitions still load before any skin registry exists.
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.rarities.mythic, {id: 'mythic', name: 'Mythic', color: '#FF4FD8', order: 500});
    assert.deepEqual(result.rarities.minimal, {id: 'minimal', name: 'minimal', color: '#FFFFFF', order: 0});
    assert.equal(result.rarities.legendary.name, 'Gold');
    assert.equal(Object.keys(result.rarities).filter(id => id === 'legendary').length, 1);
    assert.deepEqual(sortedRarities(result.rarities).map(rarity => rarity.id), ['common', 'minimal', 'uncommon', 'intermediate', 'rare', 'epic', 'legendary', 'mythic']);
    assert.equal(RARITIES.legendary, '0xE69138');
    assert.deepEqual(scanRarities(fs, new PackPaths(path, paths.root, 'Empty', 'empty')).rarities, defaultRarities());
});

test('invalid rarity files warn without breaking skins and duplicate IDs have deterministic pack-local precedence', t => {
    const {paths, write, repository} = fixture(t);
    write('a', 'mythic', {name: 'First'});
    write('z', 'mythic', {name: 'Last'});
    write('z', 'bad_json', '{bad');
    write('z', 'bad_color', {color: '#oops'});
    write('z', 'bad_order', {order: 2.5});
    write('z', 'bad_name', {name: 123});
    write('z', 'not_object', []);
    write('z', '__proto__', {name: 'Safe ID'});
    const result = repository.discover();
    assert.equal(result.rarities.mythic.name, 'Last');
    assert.equal(result.rarities.__proto__.name, 'Safe ID');
    assert.equal(result.warnings.length, 6);
    assert.equal(Object.hasOwn(result.rarities, 'bad_color'), false);
    assert.equal(Object.hasOwn(result.rarities, 'bad_json'), false);
    assert.equal(checkPack(fs, paths).issues.filter(issue => issue.message.includes('rarity')).length, 6);
});

test('custom rarities save singly and in bulk, drive colors and sorting, and pass pack health without changing definitions', t => {
    const {paths, write, repository} = fixture(t);
    const definition = write('different', 'mythic', {name: 'Mythic', color: '#FF4FD8', order: 500});
    write('different', 'intermediate', {color: '#123456', order: 150});
    const original = fs.readFileSync(definition, 'utf8');
    repository.save(draft({label: 'High', rarity: 'mythic'}));
    repository.save(draft({label: 'Low', rarity: 'common'}));
    repository.save(draft({label: 'Middle', rarity: 'intermediate'}));
    const manager = new Manager(); manager.attach(repository);
    manager.sort('rarity');
    assert.deepEqual(manager.filteredRows().map(row => row.skin.rarity), ['common', 'intermediate', 'mythic']);
    manager.sort('rarity');
    assert.deepEqual(manager.filteredRows().map(row => row.skin.rarity), ['mythic', 'intermediate', 'common']);
    manager.select(manager.state.rows[0]);
    manager.edit('rarity', 'mythic');
    assert.equal(manager.state.draft.color, '#FF4FD8');
    manager.save();
    manager.selectRows(manager.state.rows);
    manager.edit('rarity', 'intermediate');
    manager.save();
    assert.ok(manager.state.rows.every(row => row.skin.rarity === 'intermediate' && row.skin.label_color === '0x123456'));
    assert.equal(checkPack(fs, paths).issues.some(issue => issue.message === 'Unsupported rarity.'), false);
    assert.equal(fs.readFileSync(definition, 'utf8'), original);
    assert.throws(() => repository.save(draft({rarity: 'nonexistent'})), /supported rarity/);
    assert.throws(() => repository.saveBatch(manager.state.rows, draft({rarity: 'nonexistent'}), ['rarity']), /supported rarity/);
});

test('refresh and pack changes replace custom rarities, clear stale filters and preserve per-skin color overrides', t => {
    const {root, write, repository} = fixture(t);
    const filename = write('other', 'mythic', {color: '#FF4FD8'});
    write('other', 'common', {color: '#AABBCC'});
    repository.save(draft({rarity: 'mythic', color: '#112233'}));
    const manager = new Manager(); manager.attach(repository);
    assert.equal(manager.state.draft.color, '#AABBCC');
    manager.select(manager.state.rows[0]);
    assert.equal(manager.state.draft.color, '#112233');
    manager.state.rarityFilter = 'mythic';
    fs.unlinkSync(filename);
    manager.reload();
    assert.equal(Object.hasOwn(manager.state.rarities, 'mythic'), false);
    assert.equal(manager.state.rarityFilter, '');
    write('other', 'mythic', {color: '#FF4FD8'});
    manager.reload();
    assert.ok(Object.hasOwn(manager.state.rarities, 'mythic'));
    const second = new RegistryRepository(fs, new PackPaths(path, root, 'Second', 'second'));
    manager.attach(second);
    assert.deepEqual(manager.state.rarities, defaultRarities());
    assert.equal(manager.state.draft.color, '#FFFFFF');
    assert.throws(() => second.save(draft({rarity: 'mythic'})), /supported rarity/);
    manager.attach(repository);
    assert.equal(manager.state.rarities.mythic.color, '#FF4FD8');
});


const {RarityRepository, rarityDraft} = require('../src/storage/rarity-editor');
const {RarityEditor} = require('../src/state/rarities');

function editorFixture(t) {
    const f = fixture(t), repository = new RarityRepository(fs, f.paths);
    let choice = 'cancel', saves = 0;
    const editor = new RarityEditor(repository, async () => choice, () => { saves++; });
    return {...f, rarityRepository: repository, editor, choose(value) { choice = value; }, get saves() { return saves; }};
}

test('rarity manager creates custom definitions, updates the chosen namespace file, and preserves unknown weighted properties', async t => {
    const f = editorFixture(t), editor = f.editor;
    await editor.create();
    for (const [key, value] of Object.entries({id: 'mythic', name: 'Mythic', color: '#ff4fd8', order: '500', translation_key: 'rarity.mythic', override_cost: true, fuse_cost: '5', fusion_mode: 'weighted', targets: [{rarity: 'epic', weight: '85'}, {rarity: 'legendary', weight: '15'}]})) editor.edit(key, value);
    assert.equal(editor.save(), true);
    const filename = path.join(f.paths.pack, 'data/skins_namespace/skin_rarities/mythic.json');
    let data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    assert.deepEqual(data, {color: '#FF4FD8', order: 500, fusable: true, name: 'Mythic', translation_key: 'rarity.mythic', fuse_cost: 5, fuses_into: [{rarity: 'epic', weight: 85}, {rarity: 'legendary', weight: 15}]});
    const otherFile = f.write('other', 'eternal', {name: 'Eternal', color: '#123456', order: 600, future: {keep: true}, fuses_into: [{rarity: 'mythic', weight: 3, future: 'target'}]});
    editor.load('eternal');
    editor.edit('name', 'Eternal Gold'); editor.editTarget(0, 'weight', '7');
    assert.equal(editor.save(), true);
    data = JSON.parse(fs.readFileSync(otherFile, 'utf8'));
    assert.deepEqual(data.future, {keep: true});
    assert.deepEqual(data.fuses_into, [{rarity: 'mythic', weight: 7, future: 'target'}]);
    assert.equal(data.name, 'Eternal Gold');
    editor.edit('fusion_mode', 'single'); editor.edit('target', 'epic'); assert.equal(editor.save(), true);
    assert.equal(JSON.parse(fs.readFileSync(otherFile, 'utf8')).fuses_into, 'epic');
    editor.edit('fusion_mode', 'auto'); editor.edit('override_cost', false); assert.equal(editor.save(), true);
    data = JSON.parse(fs.readFileSync(otherFile, 'utf8'));
    assert.equal(Object.hasOwn(data, 'fuses_into'), false); assert.equal(Object.hasOwn(data, 'fuse_cost'), false);
});

test('editing a built-in creates a pack override without changing the built-in constants or skin registries', async t => {
    const f = editorFixture(t), editor = f.editor;
    f.repository.save(draft());
    const registry = f.repository.discover().rows[0].filename, original = fs.readFileSync(registry, 'utf8');
    await editor.select('legendary');
    assert.equal(editor.selected.filename, '');
    editor.edit('name', 'Golden'); editor.edit('color', '#123456'); editor.edit('order', '450'); editor.edit('fusable', false);
    assert.equal(editor.save(), true);
    assert.ok(editor.selected.filename.endsWith('legendary.json'));
    assert.equal(f.rarityRepository.scan().rarities.legendary.name, 'Golden');
    assert.equal(RARITIES.legendary, '0xE69138');
    assert.equal(fs.readFileSync(registry, 'utf8'), original);
});

test('rarity saves reject duplicate IDs, unsafe paths, invalid fusion values and concurrent edits before modifying data', async t => {
    const f = editorFixture(t), editor = f.editor;
    await editor.create();
    for (const id of ['../escape', 'Rare', '.', 'rare']) {
        editor.edit('id', id); assert.equal(editor.save(), false);
    }
    editor.edit('id', 'mythic'); editor.edit('color', '#oops'); assert.equal(editor.save(), false);
    editor.edit('color', '#123456'); editor.edit('order', '1.5'); assert.equal(editor.save(), false);
    editor.edit('order', '500'); editor.edit('override_cost', true); editor.edit('fuse_cost', '0'); assert.equal(editor.save(), false);
    editor.edit('fuse_cost', '5'); editor.edit('fusion_mode', 'single'); editor.edit('target', 'missing'); assert.equal(editor.save(), false);
    editor.edit('target', 'epic'); editor.edit('fusion_mode', 'weighted'); editor.edit('targets', [{rarity: 'epic', weight: '0'}]); assert.equal(editor.save(), false);
    editor.editTarget(0, 'weight', '9007199254740993'); assert.equal(editor.save(), false);
    editor.editTarget(0, 'weight', '5'); assert.equal(editor.save(), true);
    const filename = editor.selected.filename, original = JSON.parse(fs.readFileSync(filename, 'utf8'));
    editor.edit('id', 'renamed'); assert.equal(editor.save(), false); editor.edit('id', 'mythic');
    fs.writeFileSync(filename, JSON.stringify({...original, external: true}));
    editor.edit('name', 'Changed'); assert.equal(editor.save(), false);
    assert.ok(editor.state.error.includes('changed on disk'));
    assert.equal(JSON.parse(fs.readFileSync(filename, 'utf8')).external, true);
});

test('rarity editing supports Save, Discard and Cancel transitions and preserves invalid saved fields until corrected', async t => {
    const f = editorFixture(t), editor = f.editor;
    await editor.select('common'); editor.edit('name', 'Changed');
    assert.equal(await editor.select('rare'), false); assert.equal(editor.state.selectedId, 'common');
    f.choose('save'); assert.equal(await editor.select('rare'), true);
    assert.equal(f.rarityRepository.scan().rarities.common.name, 'Changed');
    editor.edit('name', 'Unsaved Rare'); f.choose('discard'); await editor.create();
    assert.equal(f.rarityRepository.scan().rarities.rare.name, 'rare');
    const filename = f.write('other', 'broken', {fusable: 'invalid', fuse_cost: 0, translation_key: 3, fuses_into: {unsupported: true}});
    const original = fs.readFileSync(filename, 'utf8');
    editor.load('broken'); editor.edit('name', 'Corrected');
    assert.equal(editor.save(), false); assert.equal(fs.readFileSync(filename, 'utf8'), original);
    editor.edit('fusable', true); editor.edit('override_cost', false); editor.edit('translation_key', ''); editor.edit('fusion_mode', 'auto');
    assert.equal(editor.save(), true);
    assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(filename, 'utf8')), 'fuse_cost'), false);
});

test('rarity editor stops saves after a pack switch and failed atomic writes retain the existing definition', async t => {
    const f = editorFixture(t), editor = f.editor;
    await editor.select('epic'); editor.edit('name', 'New Epic');
    editor.active = () => false;
    assert.equal(editor.save(), false); assert.equal(editor.state.dirty, true);
    editor.active = () => true;
    const filename = path.join(f.paths.pack, 'data/skins_namespace/skin_rarities/epic.json');
    fs.mkdirSync(path.dirname(filename), {recursive: true}); fs.writeFileSync(filename + '.tmp', 'occupied');
    assert.equal(editor.save(), false); assert.equal(fs.existsSync(filename), false);
    assert.equal(editor.state.dirty, true);
});
