'use strict';
const collectionPicker = {
    props:{value:{type:String,default:''},collections:{type:Array,default:()=>[]},mixed:{type:Boolean,default:false}},
    data() {return {open:false};},
    computed:{
        options() {
            const names=new Map();
            for(const name of [...this.collections,this.value]) if(typeof name==='string' && name.trim() && name.trim()!=='*' && !names.has(name.trim().toLowerCase())) names.set(name.trim().toLowerCase(),name.trim());
            return [...names.values()].sort((a,b)=>a.localeCompare(b));
        },
        listId() {return 'mcpskins_collections_'+this._uid;}
    },
    methods:{
        toggle() {this.open=!this.open;if(this.open)this.$emit('open');},
        choose(name) {this.open=false;this.$emit('input',name);this.$refs.trigger.focus();},
        create() {this.open=false;this.$refs.trigger.focus();this.$emit('create');},
        blur(event) {if(!this.$el.contains(event.relatedTarget))this.open=false;},
        keydown(event) {
            if(event.key==='Escape' && this.open) {event.preventDefault();event.stopPropagation();this.open=false;this.$refs.trigger.focus();return;}
            if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
            event.preventDefault();event.stopPropagation();
            const wasOpen=this.open;if(!wasOpen){this.open=true;this.$emit('open');}
            this.$nextTick(()=>{
                const items=[...this.$el.querySelectorAll('[data-collection-item]')],index=items.indexOf(event.target);
                const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(index+1)%items.length:index<0?items.length-1:(index-1+items.length)%items.length;
                if(items[next])items[next].focus();
            });
        }
    },
    template:`<div class="mcpskins-collection-picker" @focusout="blur" @keydown="keydown">
        <button ref="trigger" type="button" class="mcpskins-collection-trigger" :aria-expanded="open?'true':'false'" :aria-controls="listId" aria-haspopup="listbox" aria-label="Collection" @click="toggle"><span>{{mixed ? 'Mixed values' : value || 'Choose a collection'}}</span><span aria-hidden="true">▾</span></button>
        <div v-if="open" class="mcpskins-collection-menu">
            <div :id="listId" role="listbox" aria-label="Collections"><button v-for="name in options" :key="name" type="button" data-collection-item role="option" :aria-selected="name.toLowerCase()===value.toLowerCase() && !mixed ? 'true':'false'" @click="choose(name)">{{name}}</button><p v-if="!options.length" class="mcpskins-muted">No collections yet.</p></div>
            <button type="button" data-collection-item class="mcpskins-new-collection" @click="create">+ New Collection</button>
        </div>
    </div>`
};
module.exports = {collectionPicker};
