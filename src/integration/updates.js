'use strict';
const REPOSITORY = 'https://github.com/DrMjonter/MCPSkins-Manager';
const LATEST_RELEASE = 'https://api.github.com/repos/DrMjonter/MCPSkins-Manager/releases/latest';

function parseVersion(value) {
    if (typeof value !== 'string') return null;
    const match = /^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/i.exec(value.trim());
    if (!match) return null;
    const numbers = match.slice(1, 4).map(Number), prerelease = match[4] ? match[4].split('.') : [];
    if (numbers.some(number => !Number.isSafeInteger(number)) || prerelease.some(part => /^0[0-9]+$/.test(part))) return null;
    return {numbers, prerelease};
}
function newerVersion(latest, current) {
    const a = parseVersion(latest), b = parseVersion(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] > b.numbers[i];
    if (!a.prerelease.length || !b.prerelease.length) return !a.prerelease.length && !!b.prerelease.length;
    for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
        if (a.prerelease[i] === undefined) return false;
        if (b.prerelease[i] === undefined) return true;
        const left = a.prerelease[i], right = b.prerelease[i];
        if (left === right) continue;
        const numericLeft = /^[0-9]+$/.test(left), numericRight = /^[0-9]+$/.test(right);
        if (numericLeft !== numericRight) return !numericLeft;
        if (numericLeft && left.length !== right.length) return left.length > right.length;
        return left > right;
    }
    return false;
}

class UpdateChecker {
    constructor(version, options = {}) {
        this.version = version;
        this.fetch = options.fetch || (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
        this.Abort = options.AbortController || (typeof AbortController === 'function' ? AbortController : null);
        this.timeout = options.timeout ?? 8000;
        this.started = false; this.disposed = false; this.timer = null; this.abort = null; this.cancel = null; this.pending = null;
    }
    check() {
        if (this.disposed || !this.fetch) return Promise.resolve(null);
        if (!this.started) { this.started = true; this.pending = this.request().catch(() => null); }
        return this.pending;
    }
    async request() {
        this.abort = this.Abort ? new this.Abort() : null;
        const canceled = new Promise(resolve => {
            this.cancel = () => resolve(null);
            this.timer = setTimeout(() => { if (this.abort) this.abort.abort(); resolve(null); }, this.timeout);
        });
        const request = (async () => {
            try {
                const response = await this.fetch(LATEST_RELEASE, {headers: {Accept: 'application/vnd.github+json'}, credentials: 'omit', cache: 'no-store',
                    ...(this.abort ? {signal: this.abort.signal} : {})});
                if (!response.ok) return null;
                const release = await response.json();
                if (!release || release.draft || release.prerelease || !parseVersion(release.tag_name) || parseVersion(release.tag_name).prerelease.length || !newerVersion(release.tag_name, this.version)) return null;
                const tag = release.tag_name.trim();
                return {version: tag.replace(/^v/i, ''), url: REPOSITORY + '/releases/tag/' + encodeURIComponent(tag)};
            } catch { return null; }
        })();
        try { return await Promise.race([request, canceled]); }
        finally { clearTimeout(this.timer); this.cancel = null; }
    }
    dispose() {
        this.disposed = true;
        if (this.abort) this.abort.abort();
        if (this.cancel) this.cancel();
        clearTimeout(this.timer);
    }
}
module.exports = {UpdateChecker, parseVersion, newerVersion, LATEST_RELEASE};
