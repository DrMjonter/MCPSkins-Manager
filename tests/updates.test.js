'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {VERSION, PLUGIN_TITLE} = require('../src/version');
const {UpdateChecker, newerVersion, LATEST_RELEASE} = require('../src/integration/updates');

test('displayed and checked versions match the package version', () => {
    assert.equal(VERSION, JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version);
    assert.equal(PLUGIN_TITLE, 'MCPSkins Manager v' + VERSION);
});

test('version comparison handles numeric components, prereleases, build metadata and invalid tags', () => {
    for (const [latest, current] of [['v1.10.0', '1.2.0'], ['2.0.0', '1.99.99'], ['1.2.0', '1.2.0-rc.1'], ['1.2.0-rc.10', '1.2.0-rc.2'], ['1.2.0-beta', '1.2.0-2'], ['1.2.0-rc.1', '1.2.0-beta']]) assert.equal(newerVersion(latest, current), true, latest + ' > ' + current);
    for (const [latest, current] of [['v1.2.0', '1.2.0'], ['1.2.0+build.9', '1.2.0'], ['1.1.0', '1.2.0'], ['1.2.0-rc.1', '1.2.0'], ['1.2.0-beta', '1.2.0-beta.1'], ['1.2', '1.0.0'], ['garbage', '1.0.0'], ['01.2.0', '1.0.0'], ['1.2.0-01', '1.0.0'], ['9007199254740993.0.0', '1.0.0']]) assert.equal(newerVersion(latest, current), false, latest + ' / ' + current);
});

test('startup checker requests the public latest release only once and constructs a trusted release link', async () => {
    const requests = [], checker = new UpdateChecker('1.2.0', {fetch: async (url, options) => {
        requests.push({url, options}); return {ok: true, json: async () => ({tag_name: 'v1.3.0', html_url: 'https://unrelated.example/'})};
    }});
    const result = await checker.check();
    assert.deepEqual(result, {version: '1.3.0', url: 'https://github.com/DrMjonter/MCPSkins-Manager/releases/tag/v1.3.0'});
    assert.equal(await checker.check(), result);
    assert.equal(requests.length, 1); assert.equal(requests[0].url, LATEST_RELEASE);
    assert.equal(requests[0].options.credentials, 'omit');
    checker.dispose();
});

test('same, older, draft, prerelease, malformed and unavailable releases do not produce an update', async () => {
    for (const release of [{tag_name: 'v1.2.0'}, {tag_name: 'v1.1.0'}, {tag_name: 'v2.0.0', draft: true}, {tag_name: 'v2.0.0', prerelease: true}, {tag_name: 'v2.0.0-rc.1'}, {tag_name: 'not-a-version'}, {}, null]) {
        const checker = new UpdateChecker('1.2.0', {fetch: async () => ({ok: true, json: async () => release})});
        assert.equal(await checker.check(), null); checker.dispose();
    }
    for (const fetch of [async () => { throw new Error('Offline'); }, async () => ({ok: false, status: 403}), async () => ({ok: true, json: async () => { throw new Error('Invalid JSON'); }})]) {
        const checker = new UpdateChecker('1.2.0', {fetch}); assert.equal(await checker.check(), null); checker.dispose();
    }
});

test('timeout and disposal cancel pending requests without leaving a timer or updating later', async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const checker = new UpdateChecker('1.2.0', {timeout: 100, fetch: () => new Promise(() => {})});
    const pending = checker.check(); t.mock.timers.tick(100);
    assert.equal(await pending, null); assert.equal(checker.abort.signal.aborted, true);
    const disposed = new UpdateChecker('1.2.0', {fetch: () => new Promise(() => {})});
    const canceled = disposed.check(); disposed.dispose();
    assert.equal(await canceled, null); assert.equal(disposed.abort.signal.aborted, true);
    assert.equal(await disposed.check(), null);
});
