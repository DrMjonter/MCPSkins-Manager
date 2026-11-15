'use strict';
const SHORTCUTS = [
    ['Up / Down', 'Previous / next visible skin'],
    ['Home / End', 'First / last visible skin'],
    ['Page Up / Page Down', 'Move one visible page'],
    ['Shift + navigation', 'Extend the selected range'],
    ['Ctrl/Cmd + navigation', 'Move focus without changing selection'],
    ['Ctrl/Cmd + A', 'Select all skins in the pack, including filtered-out skins (list only)'],
    ['Enter or Ctrl/Cmd + Enter', 'Open the focused skin model (list only)'],
    ['Ctrl/Cmd + D', 'Duplicate the selected skin (outside text fields)'],
    ['Ctrl/Cmd + F', 'Focus skin search'],
    ['Ctrl/Cmd + S', 'Save skin metadata'],
    ['Ctrl/Cmd + Shift + N', 'New Skin'],
    ['Ctrl/Cmd + Shift + O', 'Select Pack'],
    ['Ctrl/Cmd + Shift + R', 'Refresh Files'],
    ['Ctrl/Cmd + Shift + H', 'Pack Health Check'],
    ['Escape in search', 'Clear search'],
    ['Down in search', 'Move into the skin list'],
    ['? in the list', 'Show these shortcuts']
];
function shortcutComponent() {
    return {data() { return {shortcuts: SHORTCUTS}; }, template: `<div class="mcpskins-shortcuts"><p>Shortcuts apply while focus is inside MCPSkins Manager. List navigation follows the current search, filters, and sorting. Text fields retain their normal editing keys.</p><table><tbody><tr v-for="item in shortcuts" :key="item[0]"><td><kbd>{{item[0]}}</kbd></td><td>{{item[1]}}</td></tr></tbody></table></div>`};
}
class ManagerKeyboard {
    constructor(controller) { this.controller = controller; this.focusedKey = ''; }
    consume(event, action) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) action();
        return true;
    }
    focus(root, row) {
        const token = encodeURIComponent(row.key);
        const element = [...root.querySelectorAll('[data-skin-key]')].find(element => element.getAttribute('data-skin-key') === token);
        if (element) { element.focus(); element.scrollIntoView({block: 'nearest'}); this.focusedKey = row.key; }
    }
    focusDraft(root, action) {
        Promise.resolve(action()).then(ok => {
            const s = this.controller.manager.state;
            if (ok === false || this.controller.disposed || !s.active || s.selectedKey) return;
            const input = root.querySelector('input[aria-label="Skin name"]');
            if (input) { input.focus(); input.select(); }
        });
    }
    move(root, row, event, focusOnly = false) {
        if (focusOnly) { this.focus(root, row); return; }
        const selection = {shiftKey: Boolean(event.shiftKey), ctrlKey: Boolean(event.ctrlKey), metaKey: Boolean(event.metaKey)};
        Promise.resolve(this.controller.select(row, selection)).then(ok => {
            if (ok !== false && !this.controller.disposed && this.controller.manager.state.selectedKeys.includes(row.key)) this.focus(root, row);
        });
    }
    handle(event) {
        if (event.defaultPrevented || event.isComposing || event.altKey || !event.target || !event.target.closest) return false;
        const root = event.target.closest('.mcpskins');
        if (!root || this.controller.disposed) return false;
        const manager = this.controller.manager, s = manager.state, key = event.key.toLowerCase(), mod = event.ctrlKey || event.metaKey;
        const editing = Boolean(event.target.isContentEditable || event.target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]'));
        const list = event.target.closest('.mcpskins-table-wrap');
        const search = event.target.closest('input[type="search"]');
        if (mod && !event.shiftKey && key === 'f') return this.consume(event, () => {
            const input = root.querySelector('input[type="search"]');
            if (input) { input.focus(); input.select(); }
        });
        if (mod && !event.shiftKey && key === 's') return this.consume(event, () => {
            if (event.target.closest('.mcpskins-pack-title-input')) event.target.blur();
            else this.controller.save();
        });
        if (mod && event.shiftKey) {
            const command = {n: 'newSkin', o: 'configure', r: 'refresh', h: 'healthCheck'}[key];
            if (command) return this.consume(event, () => command === 'newSkin'
                ? this.focusDraft(root, () => this.controller.newSkin()) : this.controller[command]());
        }
        if (search && !mod && !event.shiftKey && key === 'escape') return this.consume(event, () => { s.search = ''; });
        const rows = s.ready ? manager.filteredRows() : [];
        if (search && !mod && !event.shiftKey && key === 'arrowdown') {
            event.preventDefault(); event.stopImmediatePropagation();
            if (rows.length) this.move(root, rows[0], {});
            return true;
        }
        if (editing) return false;
        if (mod && !event.shiftKey && key === 'd') return this.consume(event, () => {
            if (manager.selection.length === 1) this.focusDraft(root, () => this.controller.duplicateSkin(manager.selection[0]));
        });
        if (!list) return false;
        if (mod && !event.shiftKey && key === 'a') return this.consume(event, () => this.controller.selectAll());
        if (!mod && key === '?') return this.consume(event, () => this.controller.showShortcuts());
        if (key === 'enter' && !event.shiftKey) return this.consume(event, () => {
            const focused = event.target.closest('[data-skin-key]');
            const row = focused ? rows.find(row => encodeURIComponent(row.key) === focused.getAttribute('data-skin-key'))
                : manager.selection.length === 1 ? manager.selection[0] : null;
            if (!row) return;
            Promise.resolve(this.controller.select(row)).then(ok => {
                if (ok !== false && !this.controller.disposed && manager.selection.length === 1 && manager.selected.key === row.key) this.controller.openModel();
            });
        });
        if (!['arrowup', 'arrowdown', 'home', 'end', 'pageup', 'pagedown'].includes(key)) return false;
        event.preventDefault(); event.stopImmediatePropagation();
        if (!rows.length) return true;
        const focused = event.target.closest('[data-skin-key]');
        const token = focused ? focused.getAttribute('data-skin-key') : encodeURIComponent(this.focusedKey || s.selectedKey);
        const index = rows.findIndex(row => encodeURIComponent(row.key) === token);
        const rowHeight = focused && focused.getBoundingClientRect ? focused.getBoundingClientRect().height : 32;
        const page = Math.max(1, Math.floor((list.clientHeight || 300) / (rowHeight || 32)) - 1);
        let next;
        if (key === 'home') next = 0;
        else if (key === 'end') next = rows.length - 1;
        else if (index < 0) next = key === 'arrowup' || key === 'pageup' ? rows.length - 1 : 0;
        else next = Math.max(0, Math.min(rows.length - 1, index + ({arrowup: -1, arrowdown: 1, pageup: -page, pagedown: page}[key])));
        this.move(root, rows[next], event, mod && !event.shiftKey);
        return true;
    }
}
module.exports = {ManagerKeyboard, SHORTCUTS, shortcutComponent};
