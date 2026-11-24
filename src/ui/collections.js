'use strict';
function collectionComponent(editor) {
    return {
        data() { return {c:editor.state}; },
        computed: {
            rows() { const term=this.c.search.trim().toLowerCase(); return this.c.rows.filter(row => (row.name+' '+row.title).toLowerCase().includes(term)); },
            preview() { return editor.preview(); },
            selected() { return this.c.rows.find(row => row.key === this.c.selectedKey); },
            members() { return this.selected?.members || []; },
            global() { return this.c.selectedKey === '*'; },
            previewColor() { return '#' + String(this.c.draft.case_color || this.preview.settings?.case_color || '#FFFFFF').replace(/^#/, ''); },
            excluded() { return this.c.draft.exclusions.split(/[\r\n,]+/).map(id => id.trim()); },
            inheritedExclusions() { return this.global ? [] : editor.scan.definitions.get('*')?.[0]?.data.excluded_skins || []; }
        },
        methods: {
            select(key) { return editor.select(key); }, create() { return editor.create(); }, save() { return editor.save(); }, discard() { editor.discard(); },
            edit(key,event) { editor.edit(key,event.target.value); }, weight(index,event) { editor.weight(index,event.target.value); },
            exclude(id,event) { editor.exclude(id,event.target.checked); }, percent(value) { return (value*100).toFixed(2)+'%'; }
        },
        template: `<section class="mcpskins-rarity-manager mcpskins-collections">
            <p class="mcpskins-rarity-muted">Collections and metadata for this pack. Most of this is optional and only needed when using Collection Cases.</p>
            <details v-if="c.warnings.length"><summary>{{c.warnings.length}} collection issue(s)</summary><p v-for="(warning,index) in c.warnings" :key="index">{{warning}}</p></details>
            <div class="mcpskins-rarity-layout"><section class="mcpskins-rarity-browser" aria-label="Collection list">
                <div class="mcpskins-rarity-toolbar"><input type="search" v-model="c.search" placeholder="Search collections..." aria-label="Search collections"><button type="button" :disabled="c.busy" @click="create">New Collection</button></div>
                <div class="mcpskins-rarity-scroll"><table><thead><tr><th>Collection</th><th>Skins</th><th>Settings</th></tr></thead><tbody>
                    <tr v-for="row in rows" :key="row.key" :class="{selected:c.selectedKey===row.key}" tabindex="0" :aria-selected="c.selectedKey===row.key" @click="select(row.key)" @keydown.enter.prevent="select(row.key)" @keydown.space.prevent="select(row.key)"><td>{{row.key==='*' ? 'Global Defaults' : row.name}}</td><td>{{row.key==='*' ? '-' : row.count}}</td><td>{{row.filename ? 'Pack' : 'Inherited'}}</td></tr>
                </tbody></table></div>
            </section><section class="mcpskins-rarity-inspector" aria-label="Collection inspector">
                <h3>{{global ? 'Global Defaults' : 'Collection Inspector'}} <span v-if="c.dirty" class="mcpskins-rarity-muted">Unsaved</span></h3>
                <p v-if="!c.active" class="mcpskins-rarity-muted">Select a collection or click New Collection.</p>
                <form v-else @submit.prevent="save" @keydown.enter.stop>
                    <p v-if="global" class="mcpskins-rarity-muted">Global Defaults (*) apply to every collection across all loaded packs.</p>
                    <p v-if="selected && selected.filename" class="mcpskins-rarity-path mcpskins-rarity-muted">{{selected.filename}}</p>
                    <label v-if="!global">Collection name<input :value="c.draft.collection" @input="edit('collection',$event)" placeholder="Collection One"><small class="mcpskins-rarity-muted">Changing this name also updates matching skin entries throughout this pack. Other installed packs may share this collection.</small></label>
                    <label>Display title<input :value="c.draft.title" @input="edit('title',$event)" :placeholder="preview.settings && preview.settings.title || '(Inherited)'"></label>
                    <label>Description<textarea rows="3" :value="c.draft.description" @input="edit('description',$event)" :placeholder="preview.settings && preview.settings.description || '(Inherited)'"></textarea></label>
                    <label>Case price<input type="number" min="0" max="2147483647" step="1" :value="c.draft.price" @input="edit('price',$event)" :placeholder="preview.settings ? String(preview.settings.price) : '(Inherited)'"><small class="mcpskins-rarity-muted">Configured currency units. 0 disables purchasing; blank inherits the default.</small></label>
                    <label>Case color<div class="mcpskins-rarity-color"><input type="color" :value="previewColor" @input="edit('case_color',$event)" aria-label="Choose case color"><input :value="c.draft.case_color" @input="edit('case_color',$event)" :placeholder="preview.settings && preview.settings.case_color || '#FFFFFF'" aria-label="Case color hex"></div></label>
                    <label>Shop icon<input :value="c.draft.shop_icon" @input="edit('shop_icon',$event)" placeholder="my_pack:textures/gui/case.png"><small class="mcpskins-rarity-muted">The texture must be supplied to clients through a resource pack or mod.</small></label>
                    <details class="mcpskins-collection-advanced"><summary>Advanced</summary>
                        <label>Requires key<select :value="c.draft.requiresKey" @change="edit('requiresKey',$event)"><option value="">Inherit ({{preview.settings && preview.settings.requiresKey ? 'Yes' : 'No'}})</option><option value="true">Yes</option><option value="false">No</option></select><small class="mcpskins-rarity-muted">The server's global key setting also applies.</small></label>
                        <h4>Rarity weights</h4><p class="mcpskins-rarity-muted">Relative chances; 0 excludes a tier. Blank inherits. Empty tiers do not participate.</p>
                        <label v-for="(row,index) in c.draft.weights" :key="row.id">{{row.id}}<input type="number" min="0" max="2147483647" step="1" :value="row.value" @input="weight(index,$event)" :placeholder="preview.settings ? String(preview.settings.rarity_weights[row.id] || 0) : '0'"></label>
                        <h4>Excluded skins</h4><p class="mcpskins-rarity-muted">Inherited exclusions cannot be removed here; edit Global Defaults to change them.</p>
                        <label v-for="member in members" :key="member.filename+'|'+member.skin.id" class="mcpskins-rarity-check"><input type="checkbox" :checked="excluded.includes(member.skin.id) || inheritedExclusions.includes(member.skin.id)" :disabled="inheritedExclusions.includes(member.skin.id)" @change="exclude(member.skin.id,$event)">{{member.skin.name || member.skin.id}}</label>
                        <label>Excluded skin IDs<textarea rows="3" :value="c.draft.exclusions" @input="edit('exclusions',$event)" placeholder="One skin ID per line"></textarea></label>
                    </details>
                    <details v-if="!global && preview.odds" open class="mcpskins-collection-odds"><summary>Odds Preview</summary>
                        <p class="mcpskins-rarity-muted">{{preview.odds.eligible}} eligible skin(s). Based on saved skins in this pack; other installed packs can change the odds. Skin weights also affect individual chances.</p>
                        <p v-if="!preview.odds.total" class="mcpskins-health-warning">This case has no eligible rewards.</p>
                        <div v-for="tier in preview.odds.tiers" :key="tier.rarity"><strong>{{tier.rarity.charAt(0).toUpperCase() + tier.rarity.slice(1)}}: {{percent(tier.chance)}}</strong><details><summary>{{tier.count}} skin(s)</summary><p v-for="skin in tier.skins" :key="skin.id">{{skin.name}}: {{percent(skin.chance)}}</p></details></div>
                    </details>
                    <p v-if="preview.error" class="mcpskins-rarity-muted">{{preview.error}}</p><p v-if="c.error" role="alert" class="mcpskins-health-error">{{c.error}}</p><p v-if="c.notice" role="status">{{c.notice}}</p>
                    <div class="mcpskins-rarity-actions"><button type="submit" :disabled="c.busy || selected && selected.duplicate">Save Collection</button><button type="button" :disabled="c.busy" @click="discard">Discard Changes</button></div>
                </form>
            </section></div>
        </section>`
    };
}
module.exports = {collectionComponent};
