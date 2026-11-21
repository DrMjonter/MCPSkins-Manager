'use strict';
const MIN_LIST_HEIGHT = 120, MAX_LIST_HEIGHT = 1200;
const clampListHeight = (value, maximum = MAX_LIST_HEIGHT) => Math.max(Math.min(MIN_LIST_HEIGHT,maximum),Math.min(maximum,Math.round(value)));

function listHeightLimit(list) {
    const view = list.ownerDocument.defaultView;
    let bottom = view.innerHeight - 12;
    for (let node = list.parentElement; node; node = node.parentElement) {
        const style = view.getComputedStyle(node), rect = node.getBoundingClientRect();
        if (rect.height > 0 && /(auto|scroll|hidden|clip)/.test(style.overflowY)) {
            const maximum = parseFloat(style.maxHeight);
            bottom = Math.min(bottom,Number.isFinite(maximum) ? rect.top + maximum : rect.bottom);
        }
    }
    const handle = list.nextElementSibling, footer = handle && handle.nextElementSibling;
    const reserved = (handle ? handle.offsetHeight : 12) + (footer ? footer.offsetHeight : 32) + 24;
    return Math.max(40,Math.min(MAX_LIST_HEIGHT,Math.floor(bottom - list.getBoundingClientRect().top - reserved)));
}

function resizeList(event, height, preview, commit, maximum = () => MAX_LIST_HEIGHT) {
    if (event.button !== 0) return null;
    event.preventDefault();
    const document = event.currentTarget.ownerDocument, window = document.defaultView;
    const startY = event.clientY, startHeight = height;
    let current = clampListHeight(height,maximum()), done = false;
    const matches = next => next.pointerId === event.pointerId;
    const move = next => {
        if (!matches(next)) return;
        next.preventDefault();
        current = clampListHeight(startHeight + next.clientY - startY,maximum());
        preview(current);
    };
    const cleanup = () => {
        if (done) return;
        done = true;
        document.removeEventListener('pointermove',move);
        document.removeEventListener('pointerup',finish);
        document.removeEventListener('pointercancel',cancelPointer);
        if (window) window.removeEventListener('blur',cancel);
        preview(null);
    };
    const finish = next => { if (!matches(next)) return; move(next); commit(current); cleanup(); };
    const cancel = () => cleanup();
    const cancelPointer = next => { if (matches(next)) cleanup(); };
    document.addEventListener('pointermove',move);
    document.addEventListener('pointerup',finish);
    document.addEventListener('pointercancel',cancelPointer);
    if (window) window.addEventListener('blur',cancel);
    preview(current);
    return cleanup;
}
module.exports = {resizeList,clampListHeight,listHeightLimit,MIN_LIST_HEIGHT,MAX_LIST_HEIGHT};
