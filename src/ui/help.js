'use strict';
const icons = require('../assets/help/icons');

const HELP_LINKS = [
    {label: 'MCPSkins Wiki', icon: icons['mcpskins-wiki'], url: 'https://github.com/json-nn/mcpskins/wiki'},
    {label: 'MCPManager Wiki', icon: icons['plugin-wiki'], url: 'https://github.com/DrMjonter/MCPSkins-Manager/wiki/01.-Creating-a-Skin-(Basics)'},
    {label: 'MCPSkins Discord', icon: icons.discord, url: 'https://discord.gg/YY8uhTdcme'},
    {label: 'Templates', icon: icons.templates, url: 'https://drive.google.com/drive/u/0/folders/1z8s_DC2uj4ZyfqBWJqcFzpXoPtsx-FhV'}
];

function helpComponent(open, links = HELP_LINKS, showDescription = true) {
    return {
        data() { return {links, showDescription}; },
        methods: {open(link) { if (/^https:\/\//i.test(link.url)) open(link.url); }},
        template: `<section class="mcpskins-help">
            <p v-if="showDescription">Guides, community help, and files to get started.</p>
            <div class="mcpskins-help-links"><button v-for="link in links" :key="link.label" type="button" :disabled="!link.url" @click="open(link)" :title="link.label" :aria-label="link.label"><img :src="link.icon" alt="" aria-hidden="true" draggable="false"></button></div>
        </section>`
    };
}

module.exports = {HELP_LINKS, helpComponent};
