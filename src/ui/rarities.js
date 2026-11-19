'use strict';

function rarityComponent(editor) {
    return {
        data() { return {r: editor.state}; },
        computed: {
            rows() { const term = this.r.search.trim().toLowerCase(); return this.r.rows.filter(row => (row.id + ' ' + row.name).toLowerCase().includes(term)); },
            targets() {
                const rows = this.r.rows.map(row => ({id: row.id, name: row.name}));
                const id = this.r.draft.id.trim();
                if (id && !rows.some(row => row.id === id)) rows.push({id, name: this.r.draft.name || id});
                return rows;
            },
            selected() { return !!this.r.selectedId; },
            builtin() { return this.selected && !this.r.rows.find(row => row.id === this.r.selectedId).filename; },
            filename() { const row = this.r.rows.find(row => row.id === this.r.selectedId); return row && row.filename || ''; }
        },
        methods: {
            select(id) { return editor.select(id); }, create() { return editor.create(); }, save() { return editor.save(); }, discard() { editor.discard(); },
            edit(key, event) { editor.edit(key, event.target.type === 'checkbox' ? event.target.checked : event.target.value); },
            addTarget() { editor.addTarget(); }, removeTarget(index) { editor.removeTarget(index); },
            target(index, key, event) { editor.editTarget(index, key, event.target.value); }
        },
        template: `<section class="mcpskins-rarity-manager">
            <p class="mcpskins-rarity-muted">Manage rarity tiers for this pack. Editing a built-in tier creates a pack override.</p>
            <details v-if="r.warnings.length"><summary>{{r.warnings.length}} definition warning(s)</summary><p v-for="warning in r.warnings">{{warning}}</p></details>
            <div class="mcpskins-rarity-layout">
                <section class="mcpskins-rarity-browser" aria-label="Rarity list">
                    <div class="mcpskins-rarity-toolbar"><input type="search" v-model="r.search" placeholder="Search rarities..." aria-label="Search rarities"><button type="button" :disabled="r.busy" @click="create">New Rarity</button></div>
                    <div class="mcpskins-rarity-scroll"><table><thead><tr><th>Name</th><th>ID</th><th>Order</th><th>Source</th></tr></thead><tbody>
                        <tr v-for="row in rows" :key="row.id" :class="{selected:r.selectedId === row.id}" tabindex="0" :aria-selected="r.selectedId === row.id" @click="select(row.id)" @keydown.enter.prevent="select(row.id)" @keydown.space.prevent="select(row.id)">
                            <td><span class="mcpskins-rarity-dot" :style="{background:row.color}"></span>{{row.name}}</td><td>{{row.id}}</td><td>{{row.order}}</td><td>{{row.filename ? 'Pack' : 'Built-in'}}</td>
                        </tr>
                    </tbody></table></div>
                </section>
                <section class="mcpskins-rarity-inspector" aria-label="Rarity inspector">
                    <h3>Rarity Inspector <span v-if="r.dirty" class="mcpskins-rarity-muted">Unsaved</span></h3>
                    <p v-if="!r.active" class="mcpskins-rarity-muted">Select a rarity or click New Rarity.</p>
                    <form v-else @submit.prevent="save" @keydown.enter.stop>
                        <p v-if="builtin" class="mcpskins-rarity-muted">Save to override this built-in tier in the selected pack.</p>
                        <p v-if="filename" class="mcpskins-rarity-muted mcpskins-rarity-path">{{filename}}</p>
                        <label>Rarity ID<input :value="r.draft.id" :readonly="selected" @input="edit('id',$event)" placeholder="mythic" spellcheck="false"><small class="mcpskins-rarity-muted">Used by skin entries. Existing IDs stay fixed to preserve references.</small></label>
                        <label>Display name<input :value="r.draft.name" @input="edit('name',$event)" placeholder="Defaults to the rarity ID"></label>
                        <label>Color<div class="mcpskins-rarity-color"><input type="color" :value="r.draft.color" @input="edit('color',$event)" aria-label="Choose rarity color"><input :value="r.draft.color" @input="edit('color',$event)" placeholder="#FFFFFF" aria-label="Rarity color hex" spellcheck="false"></div></label>
                        <label>Order<input type="number" step="1" :value="r.draft.order" @input="edit('order',$event)"><small class="mcpskins-rarity-muted">Position on the rarity ladder. Default tiers use 0, 100, 200, 300, and 400.</small></label>
                        <label>Translation key<input :value="r.draft.translation_key" @input="edit('translation_key',$event)" placeholder="(Optional)"></label>
                        <label class="mcpskins-rarity-check"><input type="checkbox" :checked="r.draft.fusable" @change="edit('fusable',$event)">Allow Fusion</label>
                        <label class="mcpskins-rarity-check"><input type="checkbox" :checked="r.draft.override_cost" @change="edit('override_cost',$event)">Override Fusion Cost</label>
                        <label v-if="r.draft.override_cost">Fusion cost<input type="number" min="1" step="1" :value="r.draft.fuse_cost" @input="edit('fuse_cost',$event)"></label>
                        <label>Fuses into<select :value="r.draft.fusion_mode" @change="edit('fusion_mode',$event)"><option value="auto">Auto</option><option value="single">One specific tier</option><option value="weighted">Weighted tiers</option></select></label>
                        <label v-if="r.draft.fusion_mode === 'single'">Target rarity<select :value="r.draft.target" @change="edit('target',$event)"><option value="" disabled>Choose a tier</option><option v-if="r.draft.target && !targets.some(row => row.id === r.draft.target)" :value="r.draft.target">{{r.draft.target}} (missing)</option><option v-for="row in targets" :key="row.id" :value="row.id">{{row.name}} ({{row.id}})</option></select></label>
                        <div v-if="r.draft.fusion_mode === 'weighted'" class="mcpskins-rarity-targets">
                            <p class="mcpskins-rarity-muted">Weights are relative chances. For example, 85 and 15 gives roughly 85% and 15%.</p>
                            <div v-for="(row,index) in r.draft.targets" :key="index" class="mcpskins-rarity-target">
                                <label>Target<select :value="row.rarity" @change="target(index,'rarity',$event)"><option value="" disabled>Choose a tier</option><option v-if="row.rarity && !targets.some(tier => tier.id === row.rarity)" :value="row.rarity">{{row.rarity}} (missing)</option><option v-for="tier in targets" :key="tier.id" :value="tier.id">{{tier.name}} ({{tier.id}})</option></select></label>
                                <label>Weight<input type="number" min="1" step="1" :value="row.weight" @input="target(index,'weight',$event)"></label>
                                <button type="button" @click="removeTarget(index)" :aria-label="'Remove target ' + (index + 1)">Remove</button>
                            </div>
                            <button type="button" @click="addTarget">Add Target</button>
                        </div>
                        <p v-if="r.draft.invalid.length" role="alert" class="mcpskins-health-error">Invalid saved fields: {{r.draft.invalid.join(', ')}}. Edit these fields to replace their values.</p>
                        <p v-if="r.error" role="alert" class="mcpskins-health-error">{{r.error}}</p><p v-if="r.notice" role="status">{{r.notice}}</p>
                        <div class="mcpskins-rarity-actions"><button type="submit" :disabled="r.busy">{{builtin ? 'Save Pack Override' : 'Save Rarity'}}</button><button type="button" :disabled="r.busy" @click="discard">Discard Changes</button></div>
                    </form>
                </section>
            </div>
        </section>`
    };
}
module.exports = {rarityComponent};
