'use strict';
function animationComponent(state,actions) {
    return {
        data() {return {a:state};},
        computed:{s(){return this.a.session;}},
        methods:{
            async target(event){await actions.target(event.target.value);event.target.value=this.a.target;},
            edit(key,event){actions.edit(key,event.target.type==='checkbox'?event.target.checked:event.target.value);},
            timing(index,event){actions.timing(index,event.target.value);},
            native(){return actions.native();},importFrames(){actions.importFrames();},importStrip(){actions.importStrip();},
            save(){return actions.save();},folder(){return actions.folder();}
        },
        template:`<section class="mcpskins-animation">
            <label>Texture<select :value="a.target" @change="target" :disabled="s.busy"><option v-for="target in a.targets" :key="target.id" :value="target.id">{{target.label}}</option></select></label>
            <p>Use Blockbench's Flipbook Editor to add, paint, reorder, resize, and preview frames.</p>
            <div class="mcpskins-animation-toolbar"><button type="button" :disabled="s.busy" @click="native">Open Flipbook Editor</button><button type="button" @click="folder">Open Texture Folder</button></div>
            <p class="mcpskins-rarity-muted">Apply changes in the native editor, then save the texture in Blockbench. MCPSkins animation metadata updates automatically. Native edits will not be overwritten by the imported numbered frames.</p>
            <h3>Import animation</h3>
            <p class="mcpskins-rarity-muted">Import PNG frames to replace the texture with a vertical strip. Files are sorted by number, so _2.png comes before _10.png. A copy of each source frame is kept in the working folder.</p>
            <div class="mcpskins-animation-toolbar"><button type="button" :disabled="s.busy" @click="importFrames">Import Multiple Frames</button><button type="button" :disabled="s.busy" @click="importStrip">Import Texture Strip</button></div>
            <div class="mcpskins-animation-dimensions"><label>Frame width<input type="number" min="1" :value="s.width" @input="edit('width',$event)"></label><label>Frame height<input type="number" min="1" :value="s.height" @input="edit('height',$event)"></label></div>
            <p class="mcpskins-rarity-muted">Set frame dimensions before importing an existing strip. Separate frame PNGs must all have the same dimensions.</p>
            <h3>MCPSkins playback</h3>
            <label>Frame time (ticks)<input type="number" min="1" step="1" :value="s.frametime" @input="edit('frametime',$event)"></label>
            <label class="mcpskins-animation-check"><input type="checkbox" :checked="s.interpolate" @change="edit('interpolate',$event)">Interpolate between frames</label>
            <details class="mcpskins-frame-timings" open><summary>Per-frame timing</summary>
                <p class="mcpskins-rarity-muted">Frame numbers start at 0, matching Blockbench and .mcmeta. Leave a time blank to use the default frame time. Existing playback order and repeated frames are kept.</p>
                <table v-if="s.timings.length"><thead><tr><th>Step</th><th>Frame</th><th>Time (ticks)</th></tr></thead><tbody>
                    <tr v-for="(row,index) in s.timings" :key="index"><td>{{index+1}}</td><td>{{row.index}}</td><td><input type="number" min="1" step="1" :value="row.time" :placeholder="'Default ('+s.frametime+')'" :aria-label="'Time for step '+(index+1)+', frame '+row.index" @input="timing(index,$event)"></td></tr>
                </tbody></table>
                <p v-else class="mcpskins-rarity-muted">Open the model or import a texture to set per-frame timings.</p>
                <p class="mcpskins-rarity-muted">Custom durations are saved for MCPSkins playback. The native Flipbook Editor preview uses its FPS setting.</p>
            </details>
            <p class="mcpskins-rarity-muted">20 ticks = 1 second. Native editor FPS is rounded to the nearest whole tick when saved for MCPSkins.</p>
            <p v-if="s.error || a.error" class="mcpskins-health-error" role="alert">{{s.error || a.error}}</p><p v-if="s.status" role="status">{{s.status}}</p>
            <button type="button" :disabled="s.busy" @click="save">Save Playback Settings</button>
        </section>`
    };
}
module.exports={animationComponent};
