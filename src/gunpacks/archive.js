'use strict';

const MAX_ARCHIVE = 256 * 1024 * 1024;
const MAX_ENTRY = 64 * 1024 * 1024;
const crcTable = Array.from({length: 256}, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
});
function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
function safeEntry(name) {
    return typeof name === 'string' && name.length > 0 && !/[\\\0:]/.test(name)
        && !name.startsWith('/') && name.split('/').every(part => part && part !== '.' && part !== '..');
}

// Scoped Blockbench fs exposes whole-file reads, not file descriptors. Retain
// only the most recently used archive rather than every pack's compressed data.
class ArchiveCache {
    constructor(fs) { this.fs = fs; this.clear(); }
    clear() { this.filename = ''; this.bytes = null; this.signature = ''; }
    read(filename, signature) {
        const stat = this.fs.statSync(filename), current = stat.size + ':' + stat.mtimeMs;
        if (signature && current !== signature) throw new Error('Gun pack changed; Rescan Gun Packs before opening assets.');
        if (stat.size > MAX_ARCHIVE) throw new Error('Gun-pack archive exceeds the 256 MB limit. Unpack it to use it.');
        if (this.filename !== filename || this.signature !== current) {
            this.bytes = this.fs.readFileSync(filename); this.filename = filename; this.signature = current;
        }
        return this.bytes;
    }
}
class ZipPack {
    constructor(cache, filename, inflate) {
        this.cache = cache; this.filename = filename; this.inflate = inflate; this.entries = new Map();
        const bytes = cache.read(filename); this.signature = cache.signature;
        let end = -1;
        for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
            if (bytes.readUInt32LE(i) === 0x06054B50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
        }
        if (end < 0) throw new Error('Invalid ZIP directory.');
        const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
        if (count === 65535 || start === 0xFFFFFFFF || size === 0xFFFFFFFF || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new Error('ZIP64 and multipart ZIPs are unsupported. Unpack this gun pack.');
        if (start + size > end) throw new Error('Invalid ZIP directory bounds.');
        let offset = start;
        for (let i = 0; i < count; i++) {
            if (offset + 46 > start + size || bytes.readUInt32LE(offset) !== 0x02014B50) throw new Error('Invalid ZIP directory entry.');
            const length = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32);
            const next = offset + 46 + length + extra + comment;
            if (next > start + size) throw new Error('Invalid ZIP entry bounds.');
            const name = bytes.subarray(offset + 46, offset + 46 + length).toString('utf8');
            if (!name.endsWith('/')) {
                if (!safeEntry(name)) throw new Error('Unsafe ZIP entry: ' + name);
                if (this.entries.has(name)) throw new Error('Duplicate ZIP entry: ' + name);
                this.entries.set(name, {flags: bytes.readUInt16LE(offset + 8), method: bytes.readUInt16LE(offset + 10), crc: bytes.readUInt32LE(offset + 16),
                    compressed: bytes.readUInt32LE(offset + 20), size: bytes.readUInt32LE(offset + 24), offset: bytes.readUInt32LE(offset + 42)});
            }
            offset = next;
        }
    }
    read(name) {
        const entry = this.entries.get(name);
        if (!entry) return null;
        if (entry.flags & 1 || ![0, 8].includes(entry.method)) throw new Error('Encrypted or unsupported ZIP entry: ' + name);
        if (entry.size > MAX_ENTRY) throw new Error('Gun-pack asset exceeds the 64 MB limit: ' + name);
        const bytes = this.cache.read(this.filename, this.signature), at = entry.offset;
        if (at + 30 > bytes.length || bytes.readUInt32LE(at) !== 0x04034B50) throw new Error('Invalid ZIP local header.');
        const start = at + 30 + bytes.readUInt16LE(at + 26) + bytes.readUInt16LE(at + 28);
        if (start + entry.compressed > bytes.length) throw new Error('Invalid ZIP asset bounds.');
        const compressed = bytes.subarray(start, start + entry.compressed);
        const result = entry.method === 8 ? this.inflate(compressed, {maxOutputLength: MAX_ENTRY}) : compressed;
        if (result.length !== entry.size || crc32(result) !== entry.crc) throw new Error('ZIP checksum mismatch: ' + name);
        return result;
    }
}
module.exports = {ArchiveCache, ZipPack, safeEntry, crc32, MAX_ENTRY};
