'use strict';

function readJSON(fs, filename) {
    try {
        return JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''), (_key, value) => {
            if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
                throw new Error('JSON contains a number outside JavaScript’s safe range; refusing to round existing data.');
            }
            return value;
        });
    } catch (error) {
        throw new Error(`Unable to read ${filename}: ${error.message}`);
    }
}

function atomicJSON(fs, filename, data) {
    const temporary = filename + '.tmp';
    let created = false;
    try {
        // Exclusive creation avoids overwriting another manager's in-progress save.
        fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
        created = true;
        fs.renameSync(temporary, filename);
    } finally {
        if (created && fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
}

function isFile(fs, filename) {
    try { return fs.statSync(filename).isFile(); } catch { return false; }
}

function isDirectory(fs, filename) {
    try { return fs.statSync(filename).isDirectory(); } catch { return false; }
}

module.exports = {readJSON, atomicJSON, isFile, isDirectory};
