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

// Blockbench's scoped filesystem has Dirent inspection but no lstatSync/realpathSync.
function assertNoSymbolicLinks(fs, path, root, filename) {
    const relative=path.relative(root,filename);
    if(relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative))throw new Error('File path is outside the selected pack.');
    const same=(a,b)=>path.sep==='\\'?a.toLowerCase()===b.toLowerCase():a===b;
    let current=root;
    for(const part of [null,...relative.split(path.sep).filter(Boolean)]) {
        if(part!==null)current=path.join(current,part);
        const parent=path.dirname(current);
        if(!isDirectory(fs,parent))break;
        const entry=fs.readdirSync(parent,{withFileTypes:true}).find(entry=>same(entry.name,path.basename(current)));
        if(!entry)break;
        if(entry.isSymbolicLink())throw new Error('Cannot modify files through symbolic links: '+current);
    }
}

module.exports = {readJSON, atomicJSON, isFile, isDirectory, assertNoSymbolicLinks};
