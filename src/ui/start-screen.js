'use strict';
const {panelComponent} = require('./panel');
const {PLUGIN_TITLE} = require('../version');

// Blockbench hides work_screen (including docked panels) when no project is
// selected. Host the same component on its native start screen in that case.
class StartScreenView {
    constructor(controller, environment = {}) {
        this.controller = controller;
        this.document = environment.document || document;
        this.Vue = environment.Vue || Vue;
        this.workspace = null;
        this.view = null;
        this.element = null;
        const startScreen = environment.startScreen || StartScreen;
        // 5.1 exposes the section helper globally; 5.2 exposes StartScreen.addSection.
        const addSection = typeof startScreen.addSection === 'function' ? startScreen.addSection.bind(startScreen)
            : environment.addStartScreenSection || (typeof addStartScreenSection === 'function' ? addStartScreenSection : null);
        if (!addSection) throw new Error('Blockbench start-screen sections are unavailable.');
        this.section = addSection('mcpskins_asset_manager', {
            closable: false,
            text: [
                {type: 'h3', text: PLUGIN_TITLE},
                {text: 'Add, edit, and browse MCPSkins'},
                {type: 'button', text: 'Open MCPSkins Manager', click: () => this.show()}
            ]
        });
    }
    show() {
        if (this.controller.loadGunPacks) this.controller.loadGunPacks();
        if (!this.workspace) {
            this.element = this.document.querySelector('.start_screen_section[section_id="mcpskins_asset_manager"]');
            if (!this.element) throw new Error('Blockbench’s start screen is not available.');
            this.element.classList.add('mcpskins-start-section');
            this.workspace = this.document.createElement('div');
            this.workspace.id = 'mcpskins_start_workspace';
            const header = this.document.createElement('div');
            header.className = 'mcpskins-start-header';
            const back = this.document.createElement('button');
            back.type = 'button';
            back.textContent = 'Back to start screen';
            back.addEventListener('click', () => this.hide());
            header.append(back);
            const mount = this.document.createElement('div');
            this.workspace.append(header, mount);
            this.element.append(this.workspace);
            // Both views share the controller's reactive state and independent registry
            // draft. Moving between the start screen and a model never resets it.
            this.view = new this.Vue(panelComponent(this.controller));
            this.view.$mount(mount);
        }
        this.workspace.hidden = false;
        this.element.classList.add('mcpskins-start-open');
        this.element.scrollIntoView({block: 'start', behavior: 'smooth'});
    }
    hide() {
        if (!this.workspace) return;
        this.workspace.hidden = true;
        this.element.classList.remove('mcpskins-start-open');
    }
    dispose() {
        if (this.view) this.view.$destroy();
        if (this.section) this.section.delete();
        this.view = this.workspace = this.element = this.section = null;
    }
}

module.exports = {StartScreenView};
