'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {emptyDraft, draftFromRow} = require('../src/domain/skin');
const {PackPaths} = require('../src/domain/paths');
const {RegistryRepository} = require('../src/storage/registry');
const {Manager} = require('../src/state/manager');
const {variantIssues} = require('../src/domain/variants');
const {checkPack} = require('../src/assets/health');
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpskins-variants-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const paths = new PackPaths(path, root, 'Pack', 'example'), repository = new RegistryRepository(fs, paths);
    const draft = (id, extra = {}) => ({...emptyDraft(), weapon: 'tacz:ak47', id, label: id, collection: 'Test', description: 'Test skin', ...extra});
    for (const id of ['root', 'blue', 'gold', 'other']) repository.save(draft(id));
    const file = paths.registry('tacz:ak47');
    const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));
    const write = data => fs.writeFileSync(file, JSON.stringify(data));
    const row = id => repository.discover().rows.find(row => row.skin.id === id);
    const edit = (id, fields) => repository.save({...draftFromRow(row(id)), ...fields}, row(id));
    return {paths, repository, draft, file, read, write, row, edit};
}

test('skin authors, file defaults and pack authors are separate and optional metadata round trips', t => {
    const f = fixture(t), metadata = path.join(f.paths.pack, 'mcpskins_manager.json');
    fs.writeFileSync(metadata, JSON.stringify({title: 'Pack', author: 'Pack Team'}));
    const data = f.read(); data.author = 'File Default'; f.write(data);
    f.edit('root', {author: 'Individual Artist', subtitle: 'Short flavor line', limited: true});
    assert.equal(f.read().author, 'File Default');
    assert.equal(f.row('root').skin.author, 'Individual Artist');
    assert.equal(f.row('root').skin.subtitle, 'Short flavor line');
    assert.equal(f.row('root').skin.limited, true);
    assert.equal(JSON.parse(fs.readFileSync(metadata, 'utf8')).author, 'Pack Team');
    f.edit('root', {author: '', subtitle: '', limited: false});
    for (const field of ['author', 'subtitle', 'limited']) assert.equal(Object.hasOwn(f.row('root').skin, field), false);
    assert.equal(f.read().author, 'File Default');
    assert.equal(draftFromRow(f.row('root')).author, '');
});

test('variant and level definitions serialize goals as integers and retain unknown level properties', t => {
    const f = fixture(t);
    f.edit('root', {variants: ['blue', 'gold'], levels: [{variant: 'gold', requires: {kills: '100', headshots: '10', player_kills: '2'}, extension: {keep: true}}]});
    const saved = f.row('root').skin;
    assert.deepEqual(saved.variants, ['blue', 'gold']);
    assert.deepEqual(saved.levels, [{variant: 'gold', requires: {kills: 100, headshots: 10, player_kills: 2}, extension: {keep: true}}]);
    assert.deepEqual(draftFromRow(f.row('root')).levels, saved.levels);
    assert.deepEqual(variantIssues(f.read().skins), []);
});

test('invalid references, nesting and shared variants fail without changing the registry', t => {
    const f = fixture(t);
    for (const variants of [['root'], ['missing'], ['default:tacz:ak47'], ['blue', 'blue']]) {
        const before = fs.readFileSync(f.file, 'utf8');
        assert.throws(() => f.edit('root', {variants}));
        assert.equal(fs.readFileSync(f.file, 'utf8'), before);
    }
    f.edit('root', {variants: ['blue']});
    const before = fs.readFileSync(f.file, 'utf8');
    assert.throws(() => f.edit('other', {variants: ['blue']}), /more than one root/);
    assert.throws(() => f.edit('other', {variants: ['root']}), /Nested/);
    assert.equal(fs.readFileSync(f.file, 'utf8'), before);
    f.repository.save(f.draft('foreign', {weapon: 'tacz:ai_awp'}));
    assert.throws(() => f.edit('root', {variants: ['foreign']}), /in this file/);
});

test('levels require selected variants, supported counters and positive safe whole-number goals', t => {
    const f = fixture(t);
    const badLevels = [
        [{variant: 'gold', requires: {kills: 1}}],
        [{variant: 'blue'}],
        [{variant: 'blue', requires: {}}],
        [{variant: 'blue', requires: {deaths: 1}}],
        ...[0, -1, 1.5, '1e3', true, Number.MAX_SAFE_INTEGER + 1].map(kills => [{variant: 'blue', requires: {kills}}])
    ];
    for (const levels of badLevels) {
        const before = fs.readFileSync(f.file, 'utf8');
        assert.throws(() => f.edit('root', {variants: ['blue'], levels}));
        assert.equal(fs.readFileSync(f.file, 'utf8'), before);
    }
});

test('renaming a variant updates its root and level references in the same atomic registry save', t => {
    const f = fixture(t);
    f.edit('root', {variants: ['blue'], levels: [{variant: 'blue', requires: {kills: 10}, extension: 'keep'}]});
    f.edit('blue', {id: 'blue_renamed', author: 'Artist'});
    assert.deepEqual(f.row('root').skin.variants, ['blue_renamed']);
    assert.deepEqual(f.row('root').skin.levels, [{variant: 'blue_renamed', requires: {kills: 10}, extension: 'keep'}]);
    assert.equal(f.row('blue_renamed').skin.author, 'Artist');
    assert.deepEqual(variantIssues(f.read().skins), []);
});

test('duplicating a root copies its metadata and starts without variant or level links', t => {
    const f = fixture(t);
    f.edit('root', {author: 'Artist', subtitle: 'Subtitle', limited: true, variants: ['blue'], levels: [{variant: 'blue', requires: {kills: 10}}]});
    const manager = new Manager(); manager.attach(f.repository); manager.duplicate(f.row('root'));
    assert.deepEqual(manager.state.draft.variants, []);
    assert.deepEqual(manager.state.draft.levels, []);
    manager.save();
    assert.equal(manager.selected.skin.author, 'Artist');
    assert.equal(manager.selected.skin.subtitle, 'Subtitle');
    assert.equal(manager.selected.skin.limited, true);
    assert.equal(Object.hasOwn(manager.selected.skin, 'variants'), false);
    assert.equal(Object.hasOwn(manager.selected.skin, 'levels'), false);
    assert.deepEqual(f.row('root').skin.variants, ['blue']);
});

test('bulk author, subtitle and limited edits preserve individual variant relationships', t => {
    const f = fixture(t);
    f.edit('root', {variants: ['blue'], levels: [{variant: 'blue', requires: {kills: 10}}]});
    const previous = f.row('root').skin;
    const manager = new Manager(); manager.attach(f.repository); manager.selectRows(manager.state.rows);
    manager.edit('author', 'Shared Artist'); manager.edit('subtitle', 'Shared line'); manager.edit('limited', true);
    manager.save();
    assert.ok(f.read().skins.every(skin => skin.author === 'Shared Artist' && skin.subtitle === 'Shared line' && skin.limited));
    assert.deepEqual(f.row('root').skin.levels, previous.levels);
    assert.deepEqual(f.row('root').skin.variants, previous.variants);
    manager.edit('variants', ['gold']);
    assert.equal(manager.state.dirty, false);
    manager.edit('author', ''); manager.edit('limited', false); manager.save();
    assert.ok(f.read().skins.every(skin => !Object.hasOwn(skin, 'author') && !Object.hasOwn(skin, 'limited')));
});

test('malformed saved relationship fields are preserved until explicitly cleared or corrected', t => {
    const f = fixture(t), data = f.read();
    data.skins[0].variants = 'wrong'; data.skins[0].levels = {};
    f.write(data);
    assert.throws(() => f.edit('root', {subtitle: 'Change'}), /existing variants or levels/);
    assert.equal(f.read().skins[0].variants, 'wrong');
    const manager = new Manager(); manager.attach(f.repository); manager.select(f.row('root'));
    manager.edit('variants', []); manager.edit('levels', []); manager.save();
    assert.equal(Object.hasOwn(f.row('root').skin, 'variants'), false);
    assert.equal(Object.hasOwn(f.row('root').skin, 'levels'), false);
});

test('health check diagnoses new field types and invalid variant goals or references', t => {
    const f = fixture(t), data = f.read();
    data.skins[0].variants = ['missing']; data.skins[0].levels = [{variant: 'missing', requires: {kills: 0}}];
    data.skins[0].limited = 'true'; data.skins[0].author = {}; data.author = 123;
    f.write(data);
    const report = checkPack(fs, f.paths);
    for (const pattern of [/positive whole/, /in this file/, /limited must/, /author must/]) assert.ok(report.issues.some(issue => pattern.test(issue.message)), pattern);
});

test('malformed author, subtitle and limited values are not silently rewritten during unrelated edits', t => {
    const f = fixture(t), data = f.read();
    data.skins[0].author = {unknown: true}; data.skins[0].subtitle = 123; data.skins[0].limited = 'false'; f.write(data);
    assert.throws(() => f.edit('root', {description: 'Unrelated edit'}), /saved author value is invalid/);
    const manager = new Manager(); manager.attach(f.repository); manager.select(f.row('root'));
    manager.edit('author', 'Artist'); manager.edit('subtitle', 'Subtitle'); manager.edit('limited', false); manager.save();
    assert.equal(f.row('root').skin.author, 'Artist');
    assert.equal(f.row('root').skin.subtitle, 'Subtitle');
    assert.equal(Object.hasOwn(f.row('root').skin, 'limited'), false);
});
