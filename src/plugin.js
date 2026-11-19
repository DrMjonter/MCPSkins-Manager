'use strict';
const {Controller} = require('./controller');
const {VERSION, PLUGIN_TITLE} = require('./version');
const {panelComponent} = require('./ui/panel');
const {StartScreenView} = require('./ui/start-screen');
const {ManagerKeyboard} = require('./ui/keyboard');
const styles = require('./ui/styles');

module.exports = function register(nativeRequire) {
    let controller, panel, startScreen, toolbar, css, closeHandler, keyboardHandler;
    const actions = [];
    Plugin.register('mcpskins_asset_manager', {
        title: PLUGIN_TITLE, author: 'Mjonter', icon: 'inventory_2',
        description: 'Add, edit, and browse MCPSkins',
        version: VERSION, min_version: '5.1.0', variant: 'desktop',
        tags: ['Minecraft: Java Edition', 'Texture'],
        onload() {
            controller = new Controller(nativeRequire);
            const commands = [
                ['mcpskins_show', 'MCPSkins Manager', 'inventory_2', () => {
                    controller.loadGunPacks();
                    if (!Blockbench.Project) { controller.run(() => startScreen.show()); return; }
                    if (panel.slot === 'hidden') panel.moveTo('left_bar');
                    panel.fold(false); panel.selectTab(); panel.moveToFront();
                }, false],
                ['mcpskins_pack', 'Select Pack', 'folder', () => controller.configure(), false],
                ['mcpskins_new', 'New Skin', 'add', () => controller.newSkin(), false],
                ['mcpskins_refresh', 'Refresh Files', 'refresh', () => controller.refresh(), true],
                ['mcpskins_save', 'Save Skin', 'save', () => controller.save(), true],
                ['mcpskins_discard', 'Discard Changes', 'undo', () => controller.revert(), true]
            ];
            for (const [id, name, icon, click, ready] of commands) actions.push(new Action(id, {
                name, icon, category: 'mcpskins', click,
                condition: () => !ready || (controller.manager.state.ready &&
                    (!['mcpskins_save', 'mcpskins_discard'].includes(id) || controller.manager.state.active))
            }));
            MenuBar.addAction(actions[0], 'tools');
            MenuBar.addAction(actions[0], 'file');
            toolbar = new Toolbar('mcpskins_asset_toolbar', {children: ['mcpskins_pack', 'mcpskins_new', 'mcpskins_refresh', 'mcpskins_save', 'mcpskins_discard']});
            css = Blockbench.addCSS(styles);
            panel = new Panel('mcpskins_asset_manager', {
                name: PLUGIN_TITLE, icon: 'inventory_2',
                growable: true, resizable: true, min_height: 250,
                default_position: {slot: 'left_bar', height: 650},
                toolbars: [toolbar], component: panelComponent(controller)
            });
            startScreen = new StartScreenView(controller);
            closeHandler = event => controller.beforeUnload(event);
            const keyboard = new ManagerKeyboard(controller);
            keyboardHandler = event => keyboard.handle(event);
            window.addEventListener('beforeunload', closeHandler, true);
            window.addEventListener('keydown', keyboardHandler, true);
            controller.start();
        },
        onunload() {
            if (controller) controller.dispose();
            window.removeEventListener('beforeunload', closeHandler, true);
            window.removeEventListener('keydown', keyboardHandler, true);
            if (startScreen) startScreen.dispose();
            if (panel) {
                if (panel.vue && !panel.vue._isDestroyed) panel.vue.$destroy();
                panel.delete();
            }
            actions.splice(0).forEach(action => action.delete());
            if (toolbar) {
                if (toolbar.delete) toolbar.delete();
                else {
                    toolbar.node.remove();
                    if (typeof Toolbars !== 'undefined') delete Toolbars[toolbar.id];
                }
            }
            if (css) css.delete();
        }
    });
};
