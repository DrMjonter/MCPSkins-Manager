'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {RARITIES, GUN_NAMES, THEMES} = require('../src/domain/constants');
const {emptyDraft, buildEntry, displayGun, draftFromRow, validComponent} = require('../src/domain/skin');
const {PackPaths, packDirectorySelection} = require('../src/domain/paths');
const {readJSON, atomicJSON} = require('../src/storage/files');
const {loadPackSettings, savePackSettings} = require('../src/storage/settings');
const {RegistryRepository} = require('../src/storage/registry');
const {prepareSkin} = require('../src/assets/preparation');
const {previewCards} = require('../src/assets/previews');
const {Manager} = require('../src/state/manager');
const {pathToFileURL} = require('node:url');

function fixture(t, folder = 'Example', namespace = 'example') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpskins-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const paths = new PackPaths(path, root, folder, namespace);
    const repository = new RegistryRepository(fs, paths);
    const write = (file, data) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)); };
    return {root, paths, repository, write};
}
function draft(overrides = {}) {
    return {...emptyDraft(), weapon: 'tacz:ai_awp', label: 'Aurora', collection: 'Winter', description: 'Snow & stars ☃', ...overrides};
}

const pythonReferenceOptions = {skip: fs.existsSync(path.join(__dirname, '..', 'MCPSkins_Asset_Manager.py')) ? false : 'Optional local Python reference is not present'};

test('all mappings, rarity colors, and palettes match the Python source exactly', pythonReferenceOptions, () => {
    const script = "import ast,json,pathlib; t=ast.parse(pathlib.Path('MCPSkins_Asset_Manager.py').read_text(encoding='utf-8')); print(json.dumps({n.targets[0].id:ast.literal_eval(n.value) for n in t.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('RARITIES','GUN_NAMES','THEMES')}))";
    const actual = JSON.parse(execFileSync('python', ['-c', script], {cwd: path.join(__dirname, '..'), encoding: 'utf8'}));
    assert.deepEqual({RARITIES, GUN_NAMES, THEMES}, actual);
    assert.equal(Object.keys(GUN_NAMES).length, 54);
    assert.equal(displayGun('tacz:ai_awp'), 'AWM');
    assert.equal(displayGun('other:path/custom_weapon'), 'CUSTOM WEAPON');
});

test('new skin JSON matches the original Python save method', pythonReferenceOptions, t => {
    const f = fixture(t);
    const input = draft({rarity: 'rare', color: '#3be1ff', locked_text: ' Locked ', unlocked: true, include_weight: true, weight: '007'});
    const result = f.repository.save(input);
    const actual = readJSON(fs, result.filename);
    const python = execFileSync('python', [path.join(__dirname, 'python_reference.py'), f.root, JSON.stringify(input)], {encoding: 'utf8'});
    assert.deepEqual(actual, JSON.parse(python));
});

test('editing preserves unknown fields, unrelated entries, and optional-field omission', t => {
    const f = fixture(t);
    const file = f.paths.registry('tacz:ai_awp');
    const first = buildEntry(draft()).entry;
    const skin = {...first, extra: {keep: ['yes']}, locked_text: 'x', unlocked: true, weight: 3};
    f.write(file, {base_gun: 'tacz:ai_awp', extension: {version: 2}, skins: [null, skin, {id: 'other', unknown: true}]});
    const selected = f.repository.discover().rows[0];
    f.repository.save(draft({id: first.id, label: 'Updated'}), selected);
    const saved = readJSON(fs, file);
    assert.deepEqual(saved.extension, {version: 2});
    assert.equal(saved.skins[0], null);
    assert.deepEqual(saved.skins[2], {id: 'other', unknown: true});
    assert.deepEqual(saved.skins[1].extra, {keep: ['yes']});
    for (const field of ['locked_text', 'unlocked', 'weight']) assert.equal(Object.hasOwn(saved.skins[1], field), false);
    assert.equal(saved.skins[1].name, 'AWM | Updated');
});

test('concurrent edits to selected entry are rejected without changing disk', t => {
    const f = fixture(t);
    const {filename} = f.repository.save(draft());
    const row = f.repository.discover().rows[0];
    const data = readJSON(fs, filename);
    data.skins[0].description = 'External edit';
    f.write(filename, data);
    const before = fs.readFileSync(filename, 'utf8');
    assert.throws(() => f.repository.save(draft({id: row.skin.id}), row), /changed on disk/);
    assert.equal(fs.readFileSync(filename, 'utf8'), before);
});

test('unrelated external edits and reordered object keys survive an edit', t => {
    const f = fixture(t);
    const {filename} = f.repository.save(draft());
    const row = f.repository.discover().rows[0];
    const data = readJSON(fs, filename);
    data.skins[0] = Object.fromEntries(Object.entries(data.skins[0]).reverse());
    data.skins.push({id: 'external', value: 9});
    data.external = true;
    f.write(filename, data);
    f.repository.save(draft({id: row.skin.id, label: 'Changed'}), row);
    const result = readJSON(fs, filename);
    assert.deepEqual(result.skins[1], {id: 'external', value: 9});
    assert.equal(result.external, true);
});

test('duplicate IDs and same-basename weapon collisions are rejected', t => {
    const f = fixture(t);
    f.repository.save(draft());
    assert.throws(() => f.repository.save(draft()), /already exists/);
    assert.throws(() => f.repository.save(draft({weapon: 'other:ai_awp', label: 'Other'})), /Weapon mismatch/);
});

test('melee registries keep base_melee and custom colors on load', t => {
    const f = fixture(t);
    const {filename} = f.repository.save(draft({weapon: 'mod:knife', kind: 'melee', color: '#12aBcD'}));
    const saved = readJSON(fs, filename);
    assert.equal(saved.base_melee, 'mod:knife');
    assert.equal('base_gun' in saved, false);
    const row = f.repository.discover().rows[0];
    assert.equal(draftFromRow(row).color, '#12ABCD');
    assert.equal(draftFromRow(row).label, 'Aurora');
    assert.equal(draftFromRow(row).kind, 'melee');
});

test('unsupported rarity names use a white preview fallback without inherited-object lookups', () => {
    const row = {data: {base_gun: 'tacz:ai_awp'}, skin: {name: 'AWM | Custom', rarity: 'constructor'}};
    assert.equal(draftFromRow(row).color, '#FFFFFF');
    assert.equal(displayGun('mod:constructor'), 'CONSTRUCTOR');
});

test('validation rejects invalid fields before any registry writes', t => {
    const f = fixture(t);
    for (const invalid of [{weapon: 'ai_awp'}, {id: 'Uppercase'}, {label: ''}, {collection: ''},
        {description: ''}, {rarity: 'mythic'}, {color: '#fff'}, {include_weight: true, weight: '0'},
        {include_weight: true, weight: '1.2'}, {include_weight: true, weight: '9007199254740993'}]) {
        assert.throws(() => f.repository.save(draft(invalid)));
    }
    assert.equal(fs.existsSync(f.paths.registryDirectory), false);
});

test('BOM reads and UTF-8 atomic writes match the existing file convention', t => {
    const f = fixture(t);
    const file = f.paths.registry('tacz:ai_awp');
    f.write(file, '\uFEFF' + JSON.stringify({base_gun: 'tacz:ai_awp', skins: []}));
    f.repository.save(draft());
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(text[0], '{');
    assert.ok(text.endsWith('\n'));
    assert.ok(text.includes('\n  "base_gun"'));
    assert.ok(text.includes('☃'));
    assert.equal(fs.existsSync(file + '.tmp'), false);
});

test('unsafe numeric JSON is refused rather than silently rounded', t => {
    const f = fixture(t);
    const file = path.join(f.root, 'large.json');
    f.write(file, '{"unknown":9007199254740993}');
    assert.throws(() => readJSON(fs, file), /safe range/);
});

test('an occupied temp file and a failed atomic rename leave original data intact', t => {
    const f = fixture(t);
    const file = path.join(f.root, 'data.json');
    f.write(file, {original: true});
    f.write(file + '.tmp', 'another writer');
    assert.throws(() => atomicJSON(fs, file, {changed: true}), /EEXIST/);
    assert.equal(fs.readFileSync(file + '.tmp', 'utf8'), 'another writer');
    fs.unlinkSync(file + '.tmp');
    const failing = {...fs, renameSync() { throw new Error('simulated failure'); }};
    assert.throws(() => atomicJSON(failing, file, {changed: true}), /simulated/);
    assert.deepEqual(readJSON(fs, file), {original: true});
    assert.equal(fs.existsSync(file + '.tmp'), false);
});

test('pack settings round trip using unchanged keys and invalid settings fall back', t => {
    const f = fixture(t, 'My.Pack', 'custom');
    savePackSettings(fs, path, f.root, 'My.Pack', 'custom');
    assert.deepEqual(readJSON(fs, path.join(f.root, 'skin_manager_settings.json')), {pack_folder: 'My.Pack', pack_namespace: 'custom'});
    assert.equal(loadPackSettings(fs, path, f.root).settings.pack_folder, 'My.Pack');
    f.write(path.join(f.root, 'skin_manager_settings.json'), '{bad');
    assert.deepEqual(loadPackSettings(fs, path, f.root).settings, {pack_folder: 'Example', pack_namespace: 'example'});
    assert.ok(loadPackSettings(fs, path, f.root).warning);
});

test('pack and asset paths preserve namespaces while blocking directory traversal', t => {
    const f = fixture(t);
    assert.equal(f.paths.textures('tacz:path/ai_awp'), path.join(f.paths.pack, 'assets/mcpskins/textures/skins/tacz/ai_awp'));
    for (const value of ['../pack', '.', '..', 'x.', 'C:\\pack', 'a/b']) assert.equal(validComponent(value), false);
    assert.throws(() => new PackPaths(path, f.root, '../escape', 'example'));
    assert.throws(() => f.paths.textures('..:ai_awp'));
    assert.throws(() => f.paths.textures('tacz:..'));
    assert.throws(() => f.paths.inside('..', 'escape'));
});

test('pack directory selection derives its parent and basename including Windows trailing separators', () => {
    assert.deepEqual(packDirectorySelection(path.win32, 'X:\\mcpskins\\my_pack\\'), {
        directory: 'X:\\mcpskins\\my_pack',
        root: 'X:\\mcpskins', folder: 'my_pack'
    });
    assert.throws(() => packDirectorySelection(path.win32, 'X:\\'), /inside your mcpskins/);
    assert.throws(() => packDirectorySelection(path.win32, 'relative\\pack'), /absolute pack directory/);
    assert.throws(() => packDirectorySelection(path.win32, ''), /absolute pack directory/);
});

test('discovery skips invalid files, non-object entries, and unrelated JSON', t => {
    const f = fixture(t);
    f.repository.save(draft());
    f.write(path.join(f.paths.registryDirectory, 'bad_skins.json'), '{}');
    f.write(path.join(f.paths.registryDirectory, 'unrelated.json'), '{}');
    f.write(path.join(f.paths.registryDirectory, 'melee_skins.json'), {base_melee: 'mod:knife', skins: [null, 1, 'x', {id: 'knife_one'}]});
    const result = f.repository.discover();
    assert.equal(result.rows.length, 2);
    assert.equal(result.warnings.length, 1);
});

test('asset preparation prefers source geometry and never overwrites existing files', t => {
    const f = fixture(t);
    const folder = f.paths.textures('tacz:ai_awp');
    const source = {format_version: '1.12.0', 'minecraft:geometry': [{description: {identifier: 'geometry.awp'}}]};
    f.write(path.join(folder, 'ai_awp_geo.json'), source);
    f.write(path.join(folder, 'ai_awp.geo.json'), {other: true});
    f.write(path.join(folder, 'ai_awp.png'), Buffer.from('base pixels'));
    const result = prepareSkin(fs, f.paths, draft());
    assert.deepEqual(readJSON(fs, result.model), source);
    assert.equal(fs.readFileSync(result.texture, 'utf8'), 'base pixels');
    assert.equal(result.created.length, 2);
    f.write(result.texture, 'painted pixels');
    f.write(result.model, {custom: 'model'});
    const again = prepareSkin(fs, f.paths, draft());
    assert.equal(fs.readFileSync(again.texture, 'utf8'), 'painted pixels');
    assert.deepEqual(readJSON(fs, again.model), {custom: 'model'});
    assert.equal(again.created.length, 0);
    assert.deepEqual(readJSON(fs, path.join(folder, 'ai_awp_geo.json')), source);
});

test('existing skin .json wins over .geo.json and still gets its missing skin PNG', t => {
    const f = fixture(t);
    const folder = f.paths.textures('tacz:ai_awp');
    f.write(path.join(folder, 'ai_awp_aurora.json'), {existing: 1});
    f.write(path.join(folder, 'ai_awp_aurora.geo.json'), {existing: 2});
    f.write(path.join(folder, 'ai_awp.png'), 'default pixels');
    const result = prepareSkin(fs, f.paths, draft());
    assert.equal(result.model, path.join(folder, 'ai_awp_aurora.json'));
    assert.equal(fs.readFileSync(result.texture, 'utf8'), 'default pixels');
    assert.deepEqual(result.created, [result.texture]);
    assert.deepEqual(readJSON(fs, result.model), {existing: 1});
    assert.deepEqual(readJSON(fs, path.join(folder, 'ai_awp_aurora.geo.json')), {existing: 2});
});

test('existing skin geometry and painted PNG work without any base assets', t => {
    const f = fixture(t);
    const folder = f.paths.textures('tacz:ai_awp');
    f.write(path.join(folder, 'ai_awp_aurora.geo.json'), {existing: 'skin model'});
    f.write(path.join(folder, 'ai_awp_aurora.png'), 'painted pixels');
    const result = prepareSkin(fs, f.paths, draft());
    assert.equal(fs.readFileSync(result.texture, 'utf8'), 'painted pixels');
    assert.deepEqual(result.created, []);
});

test('existing skin geometry reports a missing default PNG without modifying the geometry', t => {
    const f = fixture(t);
    const folder = f.paths.textures('tacz:ai_awp');
    const model = path.join(folder, 'ai_awp_aurora.geo.json');
    f.write(model, {existing: 'keep'});
    assert.throws(() => prepareSkin(fs, f.paths, draft()), /default texture ai_awp.png/);
    assert.deepEqual(readJSON(fs, model), {existing: 'keep'});
    assert.deepEqual(fs.readdirSync(folder), ['ai_awp_aurora.geo.json']);
});

test('generated texture filenames combine the weapon basename and slugified skin name', t => {
    const f = fixture(t);
    const folder = f.paths.textures('tacz:ai_awp');
    f.write(path.join(folder, 'ai_awp_geo.json'), {'minecraft:geometry': []});
    f.write(path.join(folder, 'ai_awp.png'), 'default pixels');
    const result = prepareSkin(fs, f.paths, draft({label: 'Blue Ice!'}));
    assert.equal(path.basename(result.texture), 'ai_awp_blue_ice.png');
    assert.equal(path.basename(result.model), 'ai_awp_blue_ice.geo.json');
});

test('missing skin maps are copied from defaults while existing maps and unrelated skins are preserved', t => {
    const f = fixture(t);
    const folder = f.paths.textures('tacz:ai_awp');
    f.write(path.join(folder, 'ai_awp_aurora.geo.json'), {'minecraft:geometry': []});
    f.write(path.join(folder, 'ai_awp_aurora.png'), 'color');
    f.write(path.join(folder, 'ai_awp_aurora_n.png'), 'skin normal');
    f.write(path.join(folder, 'ai_awp_n.png'), 'default normal');
    f.write(path.join(folder, 'ai_awp_s.png'), 'default specular');
    f.write(path.join(folder, 'ai_awp_other_s.png'), 'unrelated specular');
    const files = prepareSkin(fs, f.paths, draft());
    assert.equal(files.normal, path.join(folder, 'ai_awp_aurora_n.png'));
    assert.equal(files.specular, path.join(folder, 'ai_awp_aurora_s.png'));
    assert.equal(fs.readFileSync(files.normal, 'utf8'), 'skin normal');
    assert.equal(fs.readFileSync(files.specular, 'utf8'), 'default specular');
    assert.deepEqual(files.created, [files.specular]);
    fs.unlinkSync(files.normal);
    const copied = prepareSkin(fs, f.paths, draft());
    assert.equal(copied.normal, path.join(folder, 'ai_awp_aurora_n.png'));
    assert.equal(fs.readFileSync(copied.normal, 'utf8'), 'default normal');
    assert.deepEqual(copied.created, [copied.normal]);
    fs.writeFileSync(copied.normal, 'painted skin normal');
    fs.writeFileSync(copied.specular, 'painted skin specular');
    assert.deepEqual(prepareSkin(fs, f.paths, draft()).created, []);
    assert.equal(fs.readFileSync(copied.normal, 'utf8'), 'painted skin normal');
    assert.equal(fs.readFileSync(copied.specular, 'utf8'), 'painted skin specular');
    assert.equal(fs.readFileSync(path.join(folder, 'ai_awp_n.png'), 'utf8'), 'default normal');
    assert.equal(fs.readFileSync(path.join(folder, 'ai_awp_s.png'), 'utf8'), 'default specular');
    fs.unlinkSync(path.join(folder, 'ai_awp_n.png'));
    fs.unlinkSync(path.join(folder, 'ai_awp_s.png'));
    fs.unlinkSync(copied.normal);
    fs.unlinkSync(copied.specular);
    const none = prepareSkin(fs, f.paths, draft());
    assert.equal(none.normal, null);
    assert.equal(none.specular, null);
});

test('new geometry preparation creates independent base, normal, and specular skin files', t => {
    const f = fixture(t);
    const folder = f.paths.textures('tacz:ai_awp');
    f.write(path.join(folder, 'ai_awp_geo.json'), {'minecraft:geometry': []});
    for (const suffix of ['', '_n', '_s']) f.write(path.join(folder, `ai_awp${suffix}.png`), `original${suffix}`);
    const files = prepareSkin(fs, f.paths, draft({label: 'Blue Ice'}));
    assert.deepEqual(files.created.map(file => path.basename(file)), [
        'ai_awp_blue_ice.geo.json', 'ai_awp_blue_ice.png', 'ai_awp_blue_ice_n.png', 'ai_awp_blue_ice_s.png'
    ]);
    for (const [file, suffix] of [[files.texture, ''], [files.normal, '_n'], [files.specular, '_s']]) {
        assert.equal(fs.readFileSync(file, 'utf8'), `original${suffix}`);
        fs.writeFileSync(file, 'edited skin pixels');
        assert.equal(fs.readFileSync(path.join(folder, `ai_awp${suffix}.png`), 'utf8'), `original${suffix}`);
    }
});

test('per-skin name overrides change only the name string and survive subsequent editing', t => {
    const f = fixture(t);
    const manager = new Manager();
    manager.attach(f.repository);
    manager.clear();
    Object.assign(manager.state.draft, draft({override_prefix: true, name_prefix: 'Collector AWM'}));
    const {filename} = manager.save();
    assert.equal(manager.state.draft.override_prefix, true);
    assert.equal(manager.state.draft.name_prefix, 'Collector AWM');
    manager.edit('collection', 'Changed');
    manager.save();
    const skin = readJSON(fs, filename).skins[0];
    assert.equal(skin.name, 'Collector AWM | Aurora');
    assert.equal(Object.hasOwn(skin, 'name_prefix'), false);
    assert.equal(Object.hasOwn(skin, 'override_prefix'), false);
    assert.deepEqual(manager.state.weaponNames, {});
    assert.throws(() => buildEntry(draft({override_prefix: true, name_prefix: ''})), /weapon name prefix/);
    assert.throws(() => buildEntry(draft({override_prefix: true, name_prefix: 'Name | Extra'})), /pipe/);
});

test('fallback geometry scan excludes hidden/registry files and checks minecraft:geometry', t => {
    const f = fixture(t);
    const folder = f.paths.textures('tacz:ai_awp');
    f.write(path.join(folder, '.hidden.json'), {'minecraft:geometry': []});
    f.write(path.join(folder, 'aaa_skins.json'), {'minecraft:geometry': []});
    f.write(path.join(folder, 'bad.json'), '{');
    f.write(path.join(folder, 'weapon.json'), {'minecraft:geometry': [{bones: []}]});
    f.write(path.join(folder, 'ai_awp.png'), 'png');
    const result = prepareSkin(fs, f.paths, draft());
    assert.deepEqual(readJSON(fs, result.model), {'minecraft:geometry': [{bones: []}]});
});

test('asset-only prefix validation is distinct from registry validation', t => {
    const f = fixture(t);
    f.repository.save(draft({id: 'custom_id'}));
    fs.mkdirSync(f.paths.textures('tacz:ai_awp'), {recursive: true});
    assert.throws(() => prepareSkin(fs, f.paths, draft({id: 'custom_id'})), /must start/);
});

test('missing source texture fails before creating a model copy', t => {
    const f = fixture(t);
    const folder = f.paths.textures('tacz:ai_awp');
    f.write(path.join(folder, 'ai_awp_geo.json'), {'minecraft:geometry': []});
    assert.throws(() => prepareSkin(fs, f.paths, draft()), /Missing skin texture/);
    assert.equal(fs.existsSync(path.join(folder, 'ai_awp_aurora.geo.json')), false);
});

test('previews resolve all suffixes, escape URL characters, and refresh when files change', t => {
    const f = fixture(t, 'My.Pack');
    const folder = f.paths.textures('tacz:ai_awp');
    for (const suffix of ['', '_hud', '_icon']) f.write(path.join(folder, 'ai_awp_aurora' + suffix + '.png'), 'png');
    const cards = previewCards(fs, f.paths, draft(), pathToFileURL);
    assert.equal(cards.length, 3);
    assert.ok(cards.every(card => card.source.startsWith('file:')));
    assert.equal(cards[1].filename, 'ai_awp_aurora_hud.png');
    f.write(path.join(folder, 'ai_awp_aurora.png'), 'longer png');
    assert.notEqual(previewCards(fs, f.paths, draft(), pathToFileURL)[0].source, cards[0].source);
});

test('manager keeps drafts separate, filters descriptions, resets rarity colors and reselects saved entries', t => {
    const f = fixture(t);
    f.repository.save(draft({color: '#123456'}));
    const manager = new Manager();
    manager.attach(f.repository);
    manager.select(manager.state.rows[0]);
    manager.edit('label', 'New name');
    assert.equal(manager.state.rows[0].skin.name, 'AWM | Aurora');
    manager.revert();
    assert.equal(manager.state.draft.label, 'Aurora');
    assert.equal(manager.state.draft.color, '#123456');
    manager.edit('rarity', 'rare');
    assert.equal(manager.state.draft.color, '#3BE1FF');
    manager.state.search = 'snow';
    assert.equal(manager.filteredRows().length, 1);
    manager.state.rarityFilter = 'epic';
    assert.equal(manager.filteredRows().length, 0);
    manager.save();
    assert.equal(manager.state.dirty, false);
    assert.equal(manager.state.search, '');
    assert.equal(manager.state.rarityFilter, '');
    assert.ok(manager.state.selectedKey);
});

test('missing HUD and icon previews include aspect ratio hints without a skin texture hint', t => {
    const f = fixture(t);
    const cards = previewCards(fs, f.paths, draft(), pathToFileURL);
    assert.equal(cards[0].ratio, '');
    assert.equal(cards[1].ratio, '3:1');
    assert.equal(cards[2].ratio, '1:1');
    assert.ok(cards.every(card => !card.source));
});

test('pack metadata defaults, persists within each pack, and preserves future fields', t => {
    const {metadataFile, loadPackMetadata, savePackMetadata} = require('../src/storage/pack-metadata');
    const f = fixture(t);
    fs.mkdirSync(f.paths.pack, {recursive: true});
    assert.deepEqual(loadPackMetadata(fs, f.paths), {title: 'Pack Name'});
    assert.equal(fs.existsSync(metadataFile(f.paths)), false);
    const second = new PackPaths(path, f.root, 'Other', 'example');
    fs.mkdirSync(second.pack);
    f.write(metadataFile(f.paths), {title: 'First', future: {keep: [1, 2]}});
    savePackMetadata(fs, f.paths, {title: '  My skins  '});
    assert.deepEqual(readJSON(fs, metadataFile(f.paths)), {title: 'My skins', future: {keep: [1, 2]}});
    savePackMetadata(fs, second, {title: 'Second pack'});
    assert.equal(loadPackMetadata(fs, f.paths).title, 'My skins');
    assert.equal(loadPackMetadata(fs, second).title, 'Second pack');
    assert.equal(metadataFile(f.paths), path.join(f.paths.pack, 'mcpskins_manager.json'));
    savePackMetadata(fs, f.paths, {title: '   '});
    assert.equal(loadPackMetadata(fs, f.paths).title, 'Pack Name');
});

test('invalid metadata and failed writes preserve the existing pack file', t => {
    const {metadataFile, loadPackMetadata, savePackMetadata} = require('../src/storage/pack-metadata');
    const f = fixture(t), filename = metadataFile(f.paths);
    f.write(filename, '{broken');
    assert.throws(() => loadPackMetadata(fs, f.paths), /Unable to read/);
    assert.throws(() => savePackMetadata(fs, f.paths, {title: 'Replacement'}));
    assert.equal(fs.readFileSync(filename, 'utf8'), '{broken');
    f.write(filename, {title: 'Original'});
    assert.throws(() => savePackMetadata(fs, f.paths, {title: 123}), /must be text/);
    fs.writeFileSync(filename + '.tmp', 'occupied');
    assert.throws(() => savePackMetadata(fs, f.paths, {title: 'Replacement'}));
    assert.equal(readJSON(fs, filename).title, 'Original');
});

test('recent pack history deduplicates Windows paths, keeps latest metadata, and limits its length', () => {
    const {recentPacks, rememberPack} = require('../src/storage/recent-packs');
    const entry = {directory: 'X:\\packs\\Example', namespace: 'example', title: 'First', author: 'Author'};
    const history = rememberPack(path.win32, [entry], {...entry, directory: 'x:\\packs\\example\\', title: 'Renamed'});
    assert.equal(history.length, 1);
    assert.equal(history[0].title, 'Renamed');
    assert.equal(history[0].author, 'Author');
    assert.deepEqual(recentPacks(path.win32, [null, {}, {directory: 'relative', namespace: 'example'}, {...entry, namespace: '../bad'}]), []);
    const many = Array.from({length: 20}, (_, i) => ({...entry, directory: `X:\\packs\\Pack${i}`}));
    assert.equal(recentPacks(path.win32, many).length, 12);
});

function pngHeader(width, height) {
    const bytes = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(13, 8);
    bytes.write('IHDR', 12);
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    return bytes;
}

test('pack health check scans geometry and image headers without modifying files', t => {
    const {checkPack} = require('../src/assets/health');
    const f = fixture(t), result = f.repository.save(draft());
    const folder = f.paths.textures('tacz:ai_awp'), asset = suffix => path.join(folder, result.id + suffix);
    f.write(asset('.geo.json'), {'minecraft:geometry': [{description: {identifier: 'geometry.test'}, bones: []}]});
    f.write(asset('.png'), pngHeader(32, 32));
    f.write(asset('_hud.png'), pngHeader(96, 32));
    f.write(asset('_icon.png'), pngHeader(32, 32));
    const files = [result.filename, ...fs.readdirSync(folder).map(name => path.join(folder, name))];
    const before = files.map(filename => fs.readFileSync(filename));
    const report = checkPack(fs, f.paths);
    assert.equal(report.files, 1);
    assert.equal(report.skins, 1);
    assert.deepEqual(report.issues, []);
    files.forEach((filename, i) => assert.deepEqual(fs.readFileSync(filename), before[i]));
    assert.equal(fs.existsSync(path.join(f.paths.pack, 'mcpskins_manager.json')), false);
});

test('pack health reports duplicate IDs, broken registries, bad geometry and wrong image dimensions', t => {
    const {checkPack} = require('../src/assets/health');
    const f = fixture(t), result = f.repository.save(draft());
    const data = readJSON(fs, result.filename);
    data.skins.push({...data.skins[0]});
    f.write(result.filename, data);
    f.write(path.join(f.paths.registryDirectory, 'broken_skins.json'), '{broken');
    const folder = f.paths.textures('tacz:ai_awp');
    f.write(path.join(folder, result.id + '.geo.json'), {invalid: true});
    f.write(path.join(folder, result.id + '_hud.png'), pngHeader(32, 32));
    f.write(path.join(folder, result.id + '_icon.png'), pngHeader(64, 32));
    const report = checkPack(fs, f.paths);
    for (const pattern of [/Duplicate skin ID/, /Unable to read/, /Invalid geometry/, /Skin texture is missing/, /HUD aspect ratio should be 3:1/, /Icon aspect ratio should be 1:1/]) {
        assert.ok(report.issues.some(issue => pattern.test(issue.message)), pattern);
    }
    assert.ok(report.issues.find(issue => /Duplicate/.test(issue.message)).rowKey);
});

test('health check treats optional images as warnings and reports corrupt PNGs and missing directories', t => {
    const {checkPack} = require('../src/assets/health');
    const f = fixture(t);
    assert.match(checkPack(fs, f.paths).issues[0].message, /directory is missing/);
    const result = f.repository.save(draft());
    f.write(path.join(f.paths.textures('tacz:ai_awp'), result.id + '.png'), 'broken PNG');
    const issues = checkPack(fs, f.paths).issues;
    assert.ok(issues.some(issue => issue.severity === 'error' && /PNG header/.test(issue.message)));
    assert.ok(issues.some(issue => issue.severity === 'warning' && /HUD.*optional/.test(issue.message)));
    assert.ok(issues.some(issue => issue.severity === 'warning' && /Icon.*optional/.test(issue.message)));
});

test('status metadata uses portable pack-relative IDs and preserves other metadata and registry fields', t => {
    const {saveStatuses, rowStatus, statusKey} = require('../src/domain/status');
    const f = fixture(t);
    f.repository.save(draft());
    const row = f.repository.discover().rows[0], registry = fs.readFileSync(row.filename, 'utf8');
    const metadataFile = path.join(f.paths.pack, 'mcpskins_manager.json');
    f.write(metadataFile, {title: 'Pack title', author: 'Author', future: {keep: true}, skin_statuses: {other: 'planned'}});
    let metadata = saveStatuses(fs, f.paths, [row], 'wip');
    assert.equal(rowStatus(metadata, f.paths, row).label, 'WIP');
    assert.equal(metadata.author, 'Author');
    assert.deepEqual(metadata.future, {keep: true});
    assert.equal(metadata.skin_statuses.other, 'planned');
    const moved = new PackPaths(path, path.join(f.root, 'moved'), 'Example', 'example');
    const movedRow = {...row, filename: path.join(moved.registryDirectory, path.basename(row.filename))};
    assert.equal(statusKey(moved, movedRow), statusKey(f.paths, row));
    assert.equal(rowStatus(metadata, moved, movedRow).label, 'WIP');
    metadata = saveStatuses(fs, f.paths, [row], null);
    assert.equal(rowStatus(metadata, f.paths, row), null);
    assert.equal(fs.readFileSync(row.filename, 'utf8'), registry);
    f.write(metadataFile, {title: 'Keep', skin_statuses: 'invalid'});
    assert.throws(() => saveStatuses(fs, f.paths, [row], 'complete'), /JSON object/);
    assert.equal(readJSON(fs, metadataFile).skin_statuses, 'invalid');
});
