'use strict';
const {searchWeapons} = require('../domain/weapon-options');

const weaponPicker = {
    props: {value: {type: String, default: ''}, readonly: {type: Boolean, default: false}},
    data() { return {open: false, showAll: false, activeIndex: -1}; },
    computed: {
        options() { return searchWeapons(this.showAll ? '' : this.value); },
        listId() { return `mcpskins_weapons_${this._uid}`; },
        activeId() { return this.open && this.activeIndex >= 0 ? `${this.listId}_${this.activeIndex}` : null; }
    },
    watch: {
        value() { this.activeIndex = -1; },
        readonly(value) { if (value) this.close(); }
    },
    methods: {
        close() { this.open = false; this.activeIndex = -1; },
        focus() { if (!this.readonly) { this.open = true; this.showAll = false; this.activeIndex = -1; } },
        blur(event) {
            if (!this.$el.contains(event.relatedTarget)) {
                this.close();
                if (!this.readonly) this.$emit('commit', this.value);
            }
        },
        input(event) {
            if (this.readonly) return;
            this.$emit('input', event.target.value);
            this.open = true;
            this.showAll = false;
            this.activeIndex = -1;
        },
        toggle() {
            if (this.readonly) return;
            const open = !this.open;
            this.$refs.input.focus();
            this.showAll = true;
            this.open = open;
            this.activeIndex = -1;
        },
        choose(weapon) {
            if (this.readonly) return;
            this.$emit('input', weapon.id);
            this.$refs.input.focus();
            this.close();
            this.$emit('commit', weapon.id);
        },
        keydown(event) {
            if (this.readonly || event.isComposing) return;
            if (event.key === 'Tab') { this.close(); return; }
            if (event.key === 'Escape' && this.open) {
                event.preventDefault(); event.stopPropagation(); this.close();
            } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault(); event.stopPropagation();
                if (!this.open) { this.showAll = true; this.open = true; }
                const count = this.options.length;
                if (!count) return;
                this.activeIndex = event.key === 'ArrowDown' ? (this.activeIndex + 1) % count
                    : (this.activeIndex <= 0 ? count - 1 : this.activeIndex - 1);
                this.$nextTick(() => {
                    const item = this.$el.querySelector(`[id="${this.activeId}"]`);
                    if (item) item.scrollIntoView({block: 'nearest'});
                });
            } else if (event.key === 'Enter' && this.open) {
                event.preventDefault(); event.stopPropagation();
                if (this.activeIndex >= 0 && this.options[this.activeIndex]) this.choose(this.options[this.activeIndex]);
                else { this.close(); this.$emit('commit', this.value); } // Keep a typed custom ID exactly as entered.
            }
        }
    },
    template: `
        <div class="mcpskins-weapon-picker" @focusout="blur">
            <div class="mcpskins-weapon-input">
                <input ref="input" type="text" :value="value" :readonly="readonly" @input="input" @focus="focus" @keydown="keydown"
                    role="combobox" aria-label="Weapon ID" aria-autocomplete="list" :aria-expanded="open && !readonly ? 'true' : 'false'"
                    :aria-controls="listId" :aria-activedescendant="activeId" :aria-describedby="listId + '_hint'"
                    placeholder="Search TaCZ guns or enter pack:weapon" spellcheck="false" autocomplete="off">
                <button v-if="!readonly" type="button" class="mcpskins-weapon-toggle" @mousedown.prevent @click="toggle"
                    aria-label="Show all default TaCZ guns" :aria-expanded="open ? 'true' : 'false'" :aria-controls="listId">▾</button>
            </div>
            <div v-if="open && !readonly" :id="listId" class="mcpskins-weapon-list" role="listbox" aria-label="Default TaCZ guns" @mousedown.prevent>
                <div v-for="(weapon,index) in options" :key="weapon.id" :id="listId + '_' + index" role="option"
                    :aria-selected="activeIndex === index ? 'true' : 'false'" :class="['mcpskins-weapon-option',{active:activeIndex===index}]"
                    @mouseenter="activeIndex=index" @click="choose(weapon)">
                    <span>{{weapon.name}}</span><small>{{weapon.id}}</small>
                </div>
                <p v-if="!options.length" class="mcpskins-weapon-empty">No matching default gun. You can enter a custom pack:weapon ID.</p>
            </div>
            <span :id="listId + '_hint'" class="mcpskins-muted">{{readonly ? 'Weapon ID is fixed for saved entries.' : 'Search by gun name or ID, or type a custom pack:weapon ID.'}}</span>
        </div>`
};

module.exports = {weaponPicker};
