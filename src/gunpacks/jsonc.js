'use strict';

// Read gun-pack JSON comments and trailing commas without evaluating code.
function parseJSONC(text) {
    text = text.replace(/^\uFEFF/, '');
    let clean = '', quoted = false, escaped = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i], next = text[i + 1];
        if (quoted) {
            clean += c;
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === '"') quoted = false;
        } else if (c === '"') { quoted = true; clean += c; }
        else if (c === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; clean += '\n'; }
        else if (c === '/' && next === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { clean += text[i] === '\n' ? '\n' : ' '; i++; }
            if (i >= text.length) throw new Error('Unclosed JSON comment.');
            i++; clean += ' ';
        } else clean += c;
    }
    let output = ''; quoted = false; escaped = false;
    for (let i = 0; i < clean.length; i++) {
        const c = clean[i];
        if (!quoted && c === ',') {
            let next = i + 1;
            while (next < clean.length && /\s/.test(clean[next])) next++;
            if (clean[next] === '}' || clean[next] === ']') continue;
        }
        output += c;
        if (quoted && escaped) escaped = false;
        else if (quoted && c === '\\') escaped = true;
        else if (c === '"') quoted = !quoted;
    }
    return JSON.parse(output, (_key, value) => {
        if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('JSON contains an unsafe number.');
        return value;
    });
}

module.exports = {parseJSONC};
