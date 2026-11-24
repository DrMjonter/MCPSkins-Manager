'use strict';
function exportComponent(selection,exportPack) {
    return {
        data() {return {e:selection.state,inventory:selection.inventory};},
        computed:{
            collections(){return selection.groups('collection');},statuses(){return selection.groups('status');},
            rows(){const term=this.e.search.trim().toLowerCase();return this.inventory.rows.filter(row=>(row.skin.name+' '+row.skin.id+' '+row.collection+' '+row.weapon).toLowerCase().includes(term));}
        },
        methods:{
            checked(rows){return rows.length>0 && rows.every(row=>this.e.selected.includes(row.key));},
            mixed(rows){return rows.some(row=>this.e.selected.includes(row.key)) && !this.checked(rows);},
            toggleGroup(rows,event){selection.toggle(rows,event.target.checked);},all(value){selection.all(value);},
            version(event){selection.version(event.target.value);},exportPack(full){return exportPack(full);}
        },
        template:`<section class="mcpskins-export">
            <p>Exports saved files. Save painted textures and models in Blockbench before exporting.</p>
            <div class="mcpskins-export-name"><label>Pack version<input :value="e.version" @input="version" :disabled="e.busy" placeholder="1.0.0"></label><label>ZIP filename<input v-model="e.filename" :disabled="e.busy" spellcheck="false"></label></div>
            <p v-if="inventory.errors.length" class="mcpskins-health-warning">Some skin registries could not be read. Fix them before Export Pack. Export Full can still back up the pack.</p>
            <div class="mcpskins-export-toolbar"><strong>{{e.selected.length}} of {{inventory.rows.length}} skins selected</strong><button type="button" :disabled="e.busy" @click="all(true)">Select All</button><button type="button" :disabled="e.busy" @click="all(false)">Select None</button></div>
            <div class="mcpskins-export-selection"><aside>
                <h3>Collections</h3><label v-for="group in collections" :key="'collection_'+group.key"><input type="checkbox" :disabled="e.busy" :checked="checked(group.rows)" :indeterminate.prop="mixed(group.rows)" @change="toggleGroup(group.rows,$event)">{{group.label}} <small>({{group.rows.length}})</small></label>
                <h3>Status</h3><label v-for="group in statuses" :key="'status_'+group.key"><input type="checkbox" :disabled="e.busy" :checked="checked(group.rows)" :indeterminate.prop="mixed(group.rows)" @change="toggleGroup(group.rows,$event)"><span class="mcpskins-export-flag" :style="{color:group.color}">?</span>{{group.label}} <small>({{group.rows.length}})</small></label>
            </aside><section><input type="search" v-model="e.search" placeholder="Search skins..." :disabled="e.busy" aria-label="Search export skins"><div class="mcpskins-export-skins"><label v-for="row in rows" :key="row.key"><input type="checkbox" :disabled="e.busy" :checked="e.selected.includes(row.key)" @change="toggleGroup([row],$event)"><span>{{row.skin.name || row.skin.id}}<small>{{row.weapon}} | {{row.collection || 'No collection'}} | {{row.statusLabel}}</small></span></label><p v-if="!rows.length">No skins found.</p></div></section></div>
            <hr class="mcpskins-export-separator">
            <p class="mcpskins-export-note"><strong>Export Pack</strong> includes selected skins and runtime files from assets/ and data/, including Collection Cases metadata. Editing models, frame workspaces, and unused images are omitted. Links to excluded variants are removed in the exported copy.</p>
            <p class="mcpskins-export-note"><strong>Export Full</strong> backs up the entire pack, including all skins and project files, regardless of the selection above.</p>
            <p v-if="e.error" class="mcpskins-health-error" role="alert">{{e.error}}</p><p v-if="e.progress || e.notice" role="status">{{e.progress || e.notice}}</p>
            <div class="mcpskins-export-actions"><button type="button" :disabled="e.busy" @click="exportPack(true)">Export Full</button><button type="button" :disabled="e.busy || !e.selected.length || !!inventory.errors.length" @click="exportPack(false)">Export Pack</button></div>
        </section>`
    };
}
module.exports={exportComponent};
