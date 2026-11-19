'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const {parseJSONC} = require('../src/gunpacks/jsonc');
const {crc32, ArchiveCache, ZipPack} = require('../src/gunpacks/archive');
const {GunPackCatalog, SourceConflict, resourcePath, modelOutput, modelKey} = require('../src/gunpacks/catalog');
const {PackPaths} = require('../src/domain/paths');
const {emptyDraft, draftFromRow} = require('../src/domain/skin');
const {prepareSkin, duplicateAssets} = require('../src/assets/preparation');
const {RegistryRepository} = require('../src/storage/registry');
const {weaponSuggestions} = require('../src/domain/weapon-options');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpskins-gunpacks-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const tacz = path.join(root, 'tacz'), mcpskins = path.join(root, 'mcpskins');
    fs.mkdirSync(tacz); fs.mkdirSync(mcpskins);
    const paths = new PackPaths(path, mcpskins, 'MyPack', 'example');
    fs.mkdirSync(paths.pack);
    const write = (name, data) => { fs.mkdirSync(path.dirname(name), {recursive: true}); fs.writeFileSync(name, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)); };
    return {root, tacz, paths, write};
}
const geometry = {'minecraft:geometry': [{description: {identifier: 'geometry.test'}, bones: []}]};
function resources(namespace = 'custom', id = 'rifle', options = {}) {
    const family = options.kind === 'attachment' ? 'attachments' : 'guns';
    return {
        [`data/${namespace}/index/${family}/${id}.json`]: JSON.stringify({name: 'item.name', display: namespace + ':' + id + '_display'}),
        [`assets/${namespace}/display/${family}/${id}_display.json`]: JSON.stringify({model: namespace + ':gun/' + id + '_geo', texture: namespace + ':gun/uv/' + id, slot: namespace + ':gun/slot/' + id, hud: namespace + ':gun/hud/' + id}),
        [`assets/${namespace}/geo_models/gun/${id}_geo.json`]: JSON.stringify(geometry),
        [`assets/${namespace}/textures/gun/uv/${id}.png`]: Buffer.from('base PNG'),
        [`assets/${namespace}/textures/gun/uv/${id}_n.png`]: Buffer.from('normal PNG'),
        [`assets/${namespace}/textures/gun/uv/${id}_s.png`]: Buffer.from('specular PNG'),
        [`assets/${namespace}/textures/gun/slot/${id}.png`]: Buffer.from('icon PNG'),
        [`assets/${namespace}/textures/gun/hud/${id}.png`]: Buffer.from('HUD PNG'),
        [`assets/${namespace}/lang/en_us.json`]: JSON.stringify({'item.name': 'Custom Rifle'})
    };
}
function zip(entries, method = 8) {
    const local = [], directory = []; let offset = 0;
    for (const [name, value] of Object.entries(entries)) {
        const nameBytes = Buffer.from(name), bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
        const compressed = method === 8 ? zlib.deflateRawSync(bytes) : bytes, crc = crc32(bytes);
        const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(method, 8);
        header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(nameBytes.length, 26);
        local.push(header, nameBytes, compressed);
        const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
        central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
        directory.push(central, nameBytes); offset += header.length + nameBytes.length + compressed.length;
    }
    const central = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10);
    end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, central, end]);
}
function folderPack(f, name, entries) { for (const [resource, data] of Object.entries(entries)) f.write(path.join(f.tacz, name, resource), data); }
const draft = () => ({...emptyDraft(), weapon: 'custom:rifle', label: 'Aurora', id: 'rifle_aurora', collection: 'Test', description: 'Test skin'});

test('JSONC parser preserves quoted comments and escapes while accepting comments and trailing commas', () => {
    assert.deepEqual(parseJSONC('\uFEFF{/* comment */"url":"https://example/a//b", "quote":"\\\"//", "list":[1,2,],//end\n}'), {url: 'https://example/a//b', quote: '"//', list: [1, 2]});
    assert.throws(() => parseJSONC('{/* never closed'));
    assert.throws(() => parseJSONC('{"x":9007199254740993}'), /unsafe/);
});

test('folder and ZIP packs index guns and attachments and resolve cross-pack references', t => {
    const f = fixture(t), defaults = resources('base', 'rifle'), custom = resources();
    const displayKey = 'assets/custom/display/guns/rifle_display.json', display = JSON.parse(custom[displayKey]);
    display.model = 'base:gun/rifle_geo'; custom[displayKey] = JSON.stringify(display);
    delete custom['assets/custom/geo_models/gun/rifle_geo.json'];
    folderPack(f, 'base', defaults);
    f.write(path.join(f.tacz, 'custom.zip'), zip(Object.fromEntries(Object.entries(custom).map(([key, value]) => ['wrapper/' + key, value]))));
    f.write(path.join(f.tacz, 'scope.zip'), zip(resources('custom', 'scope', {kind: 'attachment'}), 0));
    const c = new GunPackCatalog(fs, path, f.tacz, zlib.inflateRawSync).scan();
    assert.equal(c.items.length, 3); assert.equal(c.sources.length, 3); assert.deepEqual(c.warnings, []);
    const result = c.resolve('custom:rifle');
    assert.equal(result.modelRef, 'base:gun/rifle_geo');
    assert.deepEqual(JSON.parse(result.model().toString()), geometry);
    assert.equal(result.texture().toString(), 'base PNG');
    assert.equal(result.normal().toString(), 'normal PNG');
    assert.equal(c.items.find(item => item.id === 'custom:rifle').name, 'Custom Rifle');
    assert.equal(c.resolve('custom:scope', 'attachment').hud(), null);
    assert.equal(c.resolve('missing:gun'), null);
});

test('conflicting definitions require a remembered source choice and identical duplicate resources are safe', t => {
    const f = fixture(t), one = resources(), two = resources();
    two['data/custom/index/guns/rifle.json'] = JSON.stringify({name: 'second', display: 'custom:rifle_display'});
    folderPack(f, 'One', one); f.write(path.join(f.tacz, 'Two.zip'), zip(two));
    const c = new GunPackCatalog(fs, path, f.tacz, zlib.inflateRawSync).scan();
    assert.throws(() => c.resolve('custom:rifle'), error => error instanceof SourceConflict && error.candidates.length === 2);
    c.choices['data/custom/index/guns/rifle.json'] = path.join(f.tacz, 'Two.zip');
    assert.equal(c.resolve('custom:rifle').source, 'Two.zip');
    assert.equal(c.resolve('custom:rifle').texture().toString(), 'base PNG');
});

test('ZIP validation rejects traversal, corrupt checksums, and changed archives', t => {
    const f = fixture(t), filename = path.join(f.tacz, 'test.zip');
    f.write(filename, zip({'../escape': 'no'}));
    assert.throws(() => new ZipPack(new ArchiveCache(fs), filename, zlib.inflateRawSync), /Unsafe/);
    const bytes = zip({'file.txt': 'original'}, 0); bytes[30 + 'file.txt'.length] ^= 1;
    f.write(filename, bytes);
    let pack = new ZipPack(new ArchiveCache(fs), filename, zlib.inflateRawSync);
    assert.throws(() => pack.read('file.txt'), /checksum/);
    f.write(filename, zip({'file.txt': 'original'}));
    pack = new ZipPack(new ArchiveCache(fs), filename, zlib.inflateRawSync);
    f.write(filename, zip({'file.txt': 'different text'}));
    assert.throws(() => pack.read('file.txt'), /changed/);
    for (const ref of ['../bad:gun/model', 'custom:../model', 'custom:/model', '..:gun/model']) assert.throws(() => resourcePath(ref, 'geo_models', '.json'));
});

test('Open Model preparation creates canonical geometry and independent textures without changing source packs', t => {
    const f = fixture(t); folderPack(f, 'source', resources());
    const c = new GunPackCatalog(fs, path, f.tacz, zlib.inflateRawSync).scan(), source = c.resolve('custom:rifle');
    const files = prepareSkin(fs, f.paths, draft(), source);
    assert.equal(files.model, path.join(f.paths.pack, 'assets/custom/geo_models/gun/rifle_geo__skin_rifle_aurora.json'));
    assert.equal(fs.readFileSync(files.texture, 'utf8'), 'base PNG');
    assert.equal(fs.readFileSync(files.normal, 'utf8'), 'normal PNG');
    assert.equal(fs.readFileSync(files.specular, 'utf8'), 'specular PNG');
    assert.equal(fs.readFileSync(path.join(f.paths.textures('custom:rifle'), 'rifle_aurora_icon.png'), 'utf8'), 'icon PNG');
    fs.writeFileSync(files.texture, 'painted skin');
    fs.writeFileSync(files.model, JSON.stringify({'minecraft:geometry': [{bones: [{name: 'edited'}]}]}));
    const again = prepareSkin(fs, f.paths, draft(), source);
    assert.deepEqual(again.created, []);
    assert.equal(fs.readFileSync(files.texture, 'utf8'), 'painted skin');
    assert.match(fs.readFileSync(files.model, 'utf8'), /edited/);
    assert.equal(fs.readFileSync(path.join(f.tacz, 'source/assets/custom/textures/gun/uv/rifle.png'), 'utf8'), 'base PNG');
});

test('legacy skin geometry is migrated without overwriting it and failed copies roll back only new files', t => {
    const f = fixture(t); folderPack(f, 'source', resources());
    const source = new GunPackCatalog(fs, path, f.tacz, zlib.inflateRawSync).scan().resolve('custom:rifle');
    const legacy = path.join(f.paths.textures('custom:rifle'), 'rifle_aurora.geo.json');
    const legacyData = {'minecraft:geometry': [{bones: [{name: 'painted_model'}]}]};
    f.write(legacy, legacyData);
    const realWrite = fs.writeFileSync;
    const failing = {...fs, writeFileSync(filename, ...args) { if (filename.endsWith('_n.png')) throw new Error('simulated write failure'); return realWrite(filename, ...args); }};
    assert.throws(() => prepareSkin(failing, f.paths, draft(), source), /simulated/);
    assert.deepEqual(JSON.parse(fs.readFileSync(legacy, 'utf8')), legacyData);
    assert.equal(fs.existsSync(modelOutput(f.paths, source.modelRef, draft().id)), false);
    const result = prepareSkin(fs, f.paths, draft(), source);
    assert.deepEqual(JSON.parse(fs.readFileSync(result.model, 'utf8')), legacyData);
});

test('canonical geometry remains accessible offline and duplication copies the resolved model', t => {
    const f = fixture(t); folderPack(f, 'source', resources());
    const source = new GunPackCatalog(fs, path, f.tacz, zlib.inflateRawSync).scan().resolve('custom:rifle');
    const initial = prepareSkin(fs, f.paths, draft(), source);
    f.paths.modelReferences = {[modelKey('custom:rifle')]: source.modelRef};
    assert.equal(prepareSkin(fs, f.paths, draft()).model, initial.model);
    const copied = {...draft(), id: 'rifle_copy'};
    duplicateAssets(fs, f.paths, draft(), copied);
    assert.deepEqual(fs.readFileSync(f.paths.modelForSkin(copied.weapon, copied.id)), fs.readFileSync(initial.model));
});

test('attachment registries and arbitrary registry names preserve schema and are reused for new entries', t => {
    const f = fixture(t), file = path.join(f.paths.registryDirectory, 'my_scopes.json');
    f.write(file, {base_attachment: 'custom:scope', custom: true, skins: []});
    const repository = new RegistryRepository(fs, f.paths);
    const result = repository.save({...draft(), weapon: 'custom:scope', id: 'scope_skin', kind: 'attachment'});
    assert.equal(result.filename, file);
    const row = repository.discover().rows[0];
    assert.equal(draftFromRow(row).kind, 'attachment');
    assert.equal(row.data.custom, true);
    assert.equal(row.data.base_attachment, 'custom:scope');
    assert.equal(Object.hasOwn(row.data, 'base_gun'), false);
    const options = weaponSuggestions([{id: 'custom:scope', name: 'Scope', kind: 'attachment'}, {id: 'custom:rifle', name: 'Rifle', kind: 'gun'}], 'attachment');
    assert.deepEqual(options.map(item => item.id), ['custom:scope']);
    assert.equal(weaponSuggestions([{id: 'tacz:ai_awp', name: 'Wrong', kind: 'gun'}]).find(item => item.id === 'tacz:ai_awp').name, 'AWM');
});


test('folder and ZIP discovery classify all supported skin item families without treating addon models as TaCZ guns', t => {
    const f = fixture(t);
    folderPack(f, 'Mixed', {
        ...resources(),
        'data/addon/index/melee/knife.json': JSON.stringify({name: 'Knife'}),
        'data/addon/index/throwables/grenade.json': JSON.stringify({name: 'Grenade'}),
        'data/addon/index/consumables/medkit.json': JSON.stringify({name: 'Medkit'}),
        'data/addon/index/ammo/bullet.json': JSON.stringify({name: 'Ammo'})
    });
    f.write(path.join(f.tacz, 'addon.zip'), zip({
        'data/addon/index/melee/sword.json': JSON.stringify({name: 'Sword'})
    }));
    const catalog = new GunPackCatalog(fs, path, f.tacz, zlib.inflateRawSync).scan();
    assert.deepEqual(catalog.warnings, []);
    assert.equal(catalog.items.length, 5);
    for (const [kind, id] of [['melee', 'addon:knife'], ['throwable', 'addon:grenade'], ['consumable', 'addon:medkit']]) {
        assert.ok(catalog.items.some(item => item.id === id && item.kind === kind));
        assert.ok(weaponSuggestions(catalog.items, kind).some(item => item.id === id));
        assert.throws(() => catalog.resolve(id, kind), /Gun-pack resource not found:.*display/);
    }
    assert.ok(catalog.items.some(item => item.id === 'addon:sword' && item.kind === 'melee'));
});


test('LesRaisins JAR discovery reads singular addon indexes through its own scoped filesystem and keeps pack overrides', t => {
    const f = fixture(t), mods = path.join(f.root, 'mods'), filename = path.join(mods, 'LesRaisins-Tactical-Equipements.jar');
    const archive = zip({
        'data/lrtactical/index/melee/karambit.json': '{"name":"item.lrtactical.karambit", /* JSONC */}',
        'data/lrtactical/index/throwable/m67.json': '{"name":"item.lrtactical.m67"}',
        'data/lrtactical/index/consumable/ai2.json': '{"name":"item.lrtactical.ai2"}',
        'assets/lrtactical/lang/en_us.json': JSON.stringify({'item.lrtactical.karambit': 'Karambit', 'item.lrtactical.m67': 'M67 Grenade', 'item.lrtactical.ai2': 'AI-2 Medkit'})
    });
    f.write(filename, archive);
    folderPack(f, 'Override', {'data/lrtactical/index/melee/karambit.json': '{"name":"Custom Karambit"}'});
    const reads = [];
    const addonFS = {
        statSync(file) { assert.equal(file, filename); return fs.statSync(file); },
        readFileSync(file) { assert.equal(file, filename); reads.push(file); return fs.readFileSync(file); }
    };
    const catalog = new GunPackCatalog(fs, path, f.tacz, zlib.inflateRawSync, {}, [{fs: addonFS, filename, addon: 'LesRaisins'}]).scan();
    assert.deepEqual(catalog.warnings, []);
    assert.equal(catalog.items.length, 3);
    assert.equal(catalog.items.find(item => item.id === 'lrtactical:karambit').name, 'Custom Karambit');
    assert.ok(catalog.items.some(item => item.id === 'lrtactical:m67' && item.kind === 'throwable' && item.name === 'M67 Grenade'));
    assert.ok(catalog.items.some(item => item.id === 'lrtactical:ai2' && item.kind === 'consumable' && item.name === 'AI-2 Medkit'));
    assert.equal(catalog.sources.filter(source => source.addon === 'LesRaisins').length, 1);
    assert.ok(reads.length);
    assert.ok(catalog.addonArchives.every(cache => cache.bytes === null));
    assert.deepEqual(fs.readFileSync(filename), archive);
    catalog.dispose();
});

test('controller finds installed LesRaisins in the instance mods folder even without a TaCZ folder', t => {
    const f = fixture(t), instanceRoot = path.join(f.root, 'mcpskins');
    fs.rmdirSync(f.tacz);
    fs.mkdirSync(instanceRoot, {recursive: true});
    const paths = new PackPaths(path, instanceRoot, 'Pack', 'example');
    const filename = path.join(f.root, 'mods/lrtactical-1.21.1.jar');
    f.write(filename, zip({'data/lrtactical/index/melee/karambit.json': '{"name":"Karambit"}'}));
    f.write(path.join(f.root, 'mods/unrelated.jar'), 'Not an archive');
    const {Controller} = require('../src/controller');
    const requests = [], controller = new Controller((name, options) => { requests.push({name, options}); return name === 'fs' ? fs : require(name); }, {getItem() { return null; }});
    t.after(() => controller.dispose());
    controller.manager.attach(new RegistryRepository(fs, paths));
    const catalog = controller.ensureGunPacks();
    assert.equal(catalog.items.length, 1);
    assert.equal(catalog.items[0].id, 'lrtactical:karambit');
    assert.deepEqual(catalog.warnings, []);
    assert.ok(requests.some(request => request.options?.scope === path.join(f.root, 'mods')));
    assert.equal(controller.ensureGunPacks(), catalog);
    fs.unlinkSync(filename);
    assert.throws(() => controller.ensureGunPacks(true), /does not exist/);
});

test('denied mods access or a corrupt LesRaisins JAR leaves normal TaCZ discovery available with a warning', t => {
    const f = fixture(t), instanceRoot = path.join(f.root, 'mcpskins');
    fs.mkdirSync(instanceRoot, {recursive: true});
    folderPack(f, 'Default', resources());
    const filename = path.join(f.root, 'mods/lrtactical.jar'); f.write(filename, 'corrupt archive');
    const {Controller} = require('../src/controller');
    const controller = new Controller((name, options) => name === 'fs' ? fs : require(name), {getItem() { return null; }});
    t.after(() => controller.dispose());
    controller.manager.attach(new RegistryRepository(fs, new PackPaths(path, instanceRoot, 'Pack', 'example')));
    let catalog = controller.ensureGunPacks();
    assert.equal(catalog.items.length, 1);
    assert.ok(catalog.warnings.some(warning => warning.includes('lrtactical.jar')));
    controller.desktop.modsFS = null;
    controller.desktop.require = (name, options) => name === 'fs' && options?.scope === path.join(f.root, 'mods') ? null : name === 'fs' ? fs : require(name);
    catalog = controller.ensureGunPacks(true);
    assert.equal(catalog.items.length, 1);
    assert.ok(catalog.warnings.some(warning => warning.includes('Mods folder access was not granted')));
});


function addonResources(kind, id) {
    return {
        [`data/lrtactical/index/${kind}/${id}.json`]: JSON.stringify({name: id}),
        [`assets/lrtactical/display/${kind}/${id}.json`]: JSON.stringify({model: `lrtactical:${kind}/${id}_geo`, texture: `lrtactical:${kind}/${id}_uv`, slot_texture: `lrtactical:${kind}/slot/${id}`}),
        [`assets/lrtactical/geo_models/${kind}/${id}_geo.json`]: JSON.stringify(geometry),
        [`assets/lrtactical/textures/${kind}/${id}_uv.png`]: Buffer.from('UV texture'),
        [`assets/lrtactical/textures/${kind}/${id}_uv_n.png`]: Buffer.from('Normal texture'),
        [`assets/lrtactical/textures/${kind}/${id}_uv_s.png`]: Buffer.from('Specular texture'),
        [`assets/lrtactical/textures/${kind}/slot/${id}.png`]: Buffer.from('Inventory icon'),
        [`assets/lrtactical/textures/${kind}/${id}_uv.png.mcmeta`]: '{"animation":{"frametime":2}}'
    };
}

test('LesRaisins preparation copies geometry, UV, icons and maps for all three families and preserves painted/offline assets', t => {
    const f = fixture(t), filename = path.join(f.root, 'mods/lrtactical.jar');
    const archive = zip({...addonResources('melee', 'karambit'), ...addonResources('throwable', 'm67'), ...addonResources('consumable', 'ai2')});
    f.write(filename, archive);
    const catalog = new GunPackCatalog(fs, path, f.tacz, zlib.inflateRawSync, {}, [{fs, filename, addon: 'LesRaisins'}]).scan();
    for (const [kind, id] of [['melee', 'karambit'], ['throwable', 'm67'], ['consumable', 'ai2']]) {
        const draft = {...emptyDraft(), kind, weapon: 'lrtactical:' + id, id: id + '_custom', label: 'Custom'};
        const source = catalog.resolve(draft.weapon, kind);
        assert.equal(source.editorOnly, true);
        const files = prepareSkin(fs, f.paths, draft, source), folder = f.paths.textures(draft.weapon);
        assert.equal(files.model, path.join(folder, draft.id + '.geo.json'));
        assert.deepEqual(JSON.parse(fs.readFileSync(files.model, 'utf8')), geometry);
        assert.equal(fs.readFileSync(files.texture, 'utf8'), 'UV texture');
        assert.equal(fs.readFileSync(files.normal, 'utf8'), 'Normal texture');
        assert.equal(fs.readFileSync(files.specular, 'utf8'), 'Specular texture');
        assert.equal(fs.readFileSync(path.join(folder, draft.id + '_icon.png'), 'utf8'), 'Inventory icon');
        assert.ok(fs.existsSync(files.texture + '.mcmeta'));
        assert.equal(files.created.length, 6);
        fs.writeFileSync(files.texture, 'Painted UV');
        fs.writeFileSync(files.model, JSON.stringify({...geometry, edited: true}));
        assert.equal(prepareSkin(fs, f.paths, draft, source).created.length, 0);
        assert.equal(fs.readFileSync(files.texture, 'utf8'), 'Painted UV');
        assert.equal(JSON.parse(fs.readFileSync(files.model, 'utf8')).edited, true);
        assert.equal(prepareSkin(fs, f.paths, draft).model, files.model);
        const target = {...draft, id: id + '_duplicate'};
        duplicateAssets(fs, f.paths, draft, target);
        assert.equal(fs.readFileSync(path.join(folder, target.id + '.png'), 'utf8'), 'Painted UV');
        assert.equal(JSON.parse(fs.readFileSync(path.join(folder, target.id + '.geo.json'), 'utf8')).edited, true);
    }
    assert.deepEqual(fs.readFileSync(filename), archive);
    catalog.dispose();
});

test('malformed LesRaisins geometry fails before copying textures and failed writes roll back only newly created assets', t => {
    const f = fixture(t), filename = path.join(f.root, 'mods/lrtactical.jar'), resources = addonResources('melee', 'karambit');
    resources['assets/lrtactical/geo_models/melee/karambit_geo.json'] = '{"minecraft:geometry":[]}';
    f.write(filename, zip(resources));
    let catalog = new GunPackCatalog(fs, path, f.tacz, zlib.inflateRawSync, {}, [{fs, filename}]).scan();
    const draft = {...emptyDraft(), kind: 'melee', weapon: 'lrtactical:karambit', id: 'karambit_custom'};
    assert.throws(() => prepareSkin(fs, f.paths, draft, catalog.resolve(draft.weapon, draft.kind)), /Bedrock geometry/);
    assert.equal(fs.existsSync(f.paths.textures(draft.weapon)), false);
    catalog.dispose();
    f.write(filename, zip(addonResources('melee', 'karambit')));
    catalog = new GunPackCatalog(fs, path, f.tacz, zlib.inflateRawSync, {}, [{fs, filename}]).scan();
    const failingFS = Object.create(fs);
    failingFS.writeFileSync = (file, bytes, options) => { if (file.endsWith('_icon.png')) throw new Error('Simulated disk failure'); return fs.writeFileSync(file, bytes, options); };
    assert.throws(() => prepareSkin(failingFS, f.paths, draft, catalog.resolve(draft.weapon, draft.kind)), /Simulated disk failure/);
    assert.deepEqual(fs.readdirSync(f.paths.textures(draft.weapon)), []);
    catalog.dispose();
});

test('controller Open Model imports LesRaisins geometry and copied maps without registering a runtime geometry override', async t => {
    const f = fixture(t), filename = path.join(f.root, 'mods/lrtactical.jar');
    f.write(filename, zip(addonResources('melee', 'karambit')));
    const {Controller} = require('../src/controller');
    const controller = new Controller(name => name === 'fs' ? fs : require(name), {getItem() { return null; }, setItem() {}, removeItem() {}});
    t.after(() => controller.dispose());
    controller.manager.attach(new RegistryRepository(fs, f.paths)); controller.desktop.commit({fs, root: f.paths.root});
    Object.assign(controller.manager.state.draft, {kind: 'melee', weapon: 'lrtactical:karambit', id: 'karambit_custom', label: 'Custom'});
    let opened;
    controller.bridge.openModel = (files, openedFS) => { opened = files; assert.equal(openedFS, fs); };
    await controller.openModel();
    assert.ok(opened.model.endsWith('karambit_custom.geo.json'));
    assert.equal(fs.readFileSync(opened.normal, 'utf8'), 'Normal texture');
    assert.equal(fs.readFileSync(opened.specular, 'utf8'), 'Specular texture');
    assert.equal(fs.existsSync(path.join(f.paths.pack, 'mcpskins_manager.json')), false);
    assert.ok(controller.manager.state.notice.includes('editing reference'));
    fs.unlinkSync(filename); controller.catalog.dispose(); controller.catalog = null; controller.catalogAttempt = '';
    await controller.openModel();
    assert.ok(opened.model.endsWith('karambit_custom.geo.json'));
});
