'use strict';
const {themes} = require('../domain/preferences');
const {sortedRarities} = require('../domain/rarities');
const {helpComponent} = require('./help');
function settingsComponent(state, change, open, reset, close) {
    return {
        components:{'help-links':helpComponent(open,undefined,false)},
        data() { return {s:state,tab:'general',themes}; },
        computed:{
            rarities() { const values=sortedRarities(this.s.rarities); const current=this.s.settings.defaults.rarity;
                return values.some(row=>row.id===current) ? values : [...values,{id:current,name:current+' (not in this pack)'}]; }
        },
        methods:{edit(section,key,event) { change(section,key,event.target.type==='checkbox' ? event.target.checked : event.target.value); }, reset() { return reset(); }, close() { return close(); }},
        template:`<section class="mcpskins-settings">
            <div class="mcpskins-settings-layout">
                <nav class="mcpskins-settings-tabs" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
                    <button v-for="item in [{id:'general',label:'General'},{id:'appearance',label:'Appearance'},{id:'debug',label:'Debug'}]" :key="item.id" :id="'mcpskins-settings-tab-'+item.id" type="button" role="tab" :aria-selected="tab===item.id" :aria-controls="'mcpskins-settings-panel-'+item.id" :class="{selected:tab===item.id}" @click="tab=item.id">{{item.label}}</button>
                </nav>
                <div class="mcpskins-settings-content">
                    <section v-show="tab==='general'" id="mcpskins-settings-panel-general" role="tabpanel" aria-labelledby="mcpskins-settings-tab-general">
                        <details class="mcpskins-settings-defaults"><summary>Defaults</summary><p>Applied to new skin entries. Existing skins and unsaved edits are kept as they are.</p>
                        <label>Rarity<select :value="s.settings.defaults.rarity" @change="edit('defaults','rarity',$event)"><option v-for="row in rarities" :key="row.id" :value="row.id">{{row.name}}</option></select><small>If this tier is unavailable in a pack, new skins use Common.</small></label>
                        <label>Collection<input :value="s.settings.defaults.collection" @input="edit('defaults','collection',$event)" placeholder="(Optional)"></label>
                        <label>Skin author<input :value="s.settings.defaults.author" @input="edit('defaults','author',$event)" placeholder="(Optional)"></label>
                        <label class="mcpskins-settings-check"><input type="checkbox" :checked="s.settings.defaults.is_new" @change="edit('defaults','is_new',$event)">Mark as new</label>
                        <label class="mcpskins-settings-check"><input type="checkbox" :checked="s.settings.defaults.unlocked" @change="edit('defaults','unlocked',$event)">Unlocked by Default</label>
                        </details>
                        <section class="mcpskins-settings-assets"><h3>Assets</h3>
                            <label class="mcpskins-settings-check"><input type="checkbox" :checked="s.settings.assets.createSpecular" @change="edit('assets','createSpecular',$event)">Create specular map (_s)</label>
                            <label class="mcpskins-settings-check"><input type="checkbox" :checked="s.settings.assets.createNormal" @change="edit('assets','createNormal',$event)">Create normal map (_n)</label>
                            <p>Controls automatic map copies from source assets. Existing skin maps are kept and imported.</p>
                        </section>
                    </section>
                    <section v-show="tab==='appearance'" id="mcpskins-settings-panel-appearance" role="tabpanel" aria-labelledby="mcpskins-settings-tab-appearance">
                        <h3>Appearance</h3>
                        <label class="mcpskins-settings-check"><input type="checkbox" :checked="s.settings.appearance.compact" @change="edit('appearance','compact',$event)">Compact mode</label><p>Smaller rows in the skin list.</p>
                        <label>Texture preview size<select :value="s.settings.appearance.previewSize" @change="edit('appearance','previewSize',$event)"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
                        <label>Panel theme<select :value="s.theme" @change="edit('appearance','theme',$event)"><option v-for="theme in themes" :key="theme" :value="theme">{{theme}}</option></select></label>
                    </section>
                    <section v-show="tab==='debug'" id="mcpskins-settings-panel-debug" role="tabpanel" aria-labelledby="mcpskins-settings-tab-debug">
                        <h3>Health Check</h3>
                        <label class="mcpskins-settings-check"><input type="checkbox" :checked="s.settings.health.live" @change="edit('health','live',$event)">Check saved files automatically</label><p>When disabled, click the health icon to run a check manually.</p>
                        <label class="mcpskins-settings-check"><input type="checkbox" :checked="s.settings.health.skipLowOrder" @change="edit('health','skipLowOrder',$event)">Skip skins with status order 5 or lower</label><p>Skips Planned, Unassigned, and custom statuses at 5 or below. Pack-wide registry and definition checks still run.</p>
                        <label class="mcpskins-settings-check"><input type="checkbox" :checked="s.settings.health.missingHud" @change="edit('health','missingHud',$event)">Warn about missing HUD textures</label>
                        <label class="mcpskins-settings-check"><input type="checkbox" :checked="s.settings.health.missingIcon" @change="edit('health','missingIcon',$event)">Warn about missing icon textures</label>
                        <label class="mcpskins-settings-check"><input type="checkbox" :checked="s.settings.health.missingMaps" @change="edit('health','missingMaps',$event)">Warn about missing normal/specular maps when defaults exist</label>
                        <label class="mcpskins-settings-check"><input type="checkbox" :checked="s.settings.health.collections" @change="edit('health','collections',$event)">Check Collection Cases definitions</label>
                        <p>Registry and texture file errors are still checked. HUD and icon aspect ratios are not checked.</p>
                        <div class="mcpskins-settings-reset"><button type="button" @click="reset">Factory Reset</button></div>
                    </section>
                </div>
            </div>
            <footer class="mcpskins-settings-footer"><p>Settings save automatically in Blockbench and apply across packs.</p><p>Guides, community help, and files to get started.</p><div class="mcpskins-settings-bottom-row"><help-links></help-links><button type="button" class="mcpskins-settings-close" @click="close">Close</button></div></footer>
        </section>`
    };
}
module.exports = {settingsComponent};
