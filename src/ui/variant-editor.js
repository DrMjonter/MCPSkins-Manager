'use strict';
const {COUNTERS} = require('../domain/variants');
const {fieldHelp} = require('./field-help');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const variantEditor = {
    components: {'field-help': fieldHelp},
    props: {
        variants: {type: Array, default: () => []}, levels: {type: Array, default: () => []},
        candidates: {type: Array, default: () => []}, owner: {type: String, default: ''},
        invalidVariants: Boolean, invalidLevels: Boolean
    },
    computed: {
        levelCandidates() {
            const choices = new Map(this.candidates.filter(candidate => !candidate.reason).map(candidate => [candidate.id, candidate]));
            for (const id of this.variants) if (!choices.has(id)) choices.set(id, {id, name: String(id)});
            return [...choices.values()];
        }
    },
    data() { return {counters: COUNTERS, labels: {kills: 'Kills', headshots: 'Headshots', player_kills: 'Player kills'}}; },
    methods: {
        selected(id) { return this.variants.includes(id); },
        toggle(id, checked) {
            this.$emit('variants', checked ? [...this.variants, id] : this.variants.filter(value => value !== id));
            if (!checked) this.$emit('levels', this.levels.filter(level => !object(level) || level.variant !== id));
        },
        clearVariants() { this.$emit('variants', []); this.$emit('levels', []); },
        clearLevels() { this.$emit('levels', []); },
        target(level) { return object(level) && typeof level.variant === 'string' ? level.variant : ''; },
        goal(level, counter) { return object(level) && object(level.requires) ? level.requires[counter] ?? '' : ''; },
        unsupported(level) { return object(level) && object(level.requires) ? Object.keys(level.requires).filter(key => !COUNTERS.includes(key)) : []; },
        patch(index, patch) {
            this.$emit('levels', this.levels.map((level, i) => i === index ? {...(object(level) ? level : {}), ...patch} : level));
        },
        selectTarget(index, id) {
            if (!this.variants.includes(id)) this.$emit('variants', [...this.variants, id]);
            this.patch(index, {variant: id});
        },
        setGoal(index, counter, value) {
            const level = this.levels[index], requires = object(level) && object(level.requires) ? {...level.requires} : {};
            if (value === '') delete requires[counter]; else requires[counter] = value;
            this.patch(index, {requires});
        },
        removeUnsupported(index) {
            const requires = {...this.levels[index].requires};
            for (const key of Object.keys(requires)) if (!COUNTERS.includes(key)) delete requires[key];
            this.patch(index, {requires});
        },
        addLevel() { this.$emit('levels', [...this.levels, {variant: this.variants.find(id => !this.levels.some(level => this.target(level) === id)) || '', requires: {}}]); },
        removeLevel(index) { this.$emit('levels', this.levels.filter((_level, i) => i !== index)); },
        moveLevel(index, direction) {
            const values = this.levels.slice(), other = index + direction;
            if (other < 0 || other >= values.length) return;
            [values[index], values[other]] = [values[other], values[index]];
            this.$emit('levels', values);
        }
    },
    template: `<details class="mcpskins-variants">
        <summary>Variants and Levels <field-help name="Variants"></field-help> <span class="mcpskins-muted">{{variants.length}} variants / {{levels.length}} levels</span></summary>
        <p class="mcpskins-muted">Variants are other skins in this registry file. Plain variants come with this skin; level variants require the goals below.</p>
        <p v-if="owner" class="mcpskins-notice mcpskins-variant-warning">This skin is a variant of {{owner}}. A variant cannot have its own variants or levels.</p>
        <p v-if="invalidVariants" class="mcpskins-notice">The saved variants field is invalid. Clear it or edit its links to replace the value.</p>
        <div class="mcpskins-variant-list" v-if="candidates.length">
            <label v-for="candidate in candidates" :key="candidate.id" class="mcpskins-check">
                <input type="checkbox" :checked="selected(candidate.id)" :disabled="!!owner || (!!candidate.reason && !selected(candidate.id))" @change="toggle(candidate.id,$event.target.checked)">
                <span>{{candidate.name}}<small class="mcpskins-muted">{{candidate.id}}<span v-if="candidate.reason"> / {{candidate.reason}}</span></small></span>
            </label>
        </div>
        <p v-else class="mcpskins-muted">Create another skin for this item to use as a variant.</p>
        <button type="button" v-if="variants.length || invalidVariants" @click="clearVariants">Clear Variants and Levels</button>
        <h4>Level requirements <field-help name="Level requirements"></field-help></h4>
        <p class="mcpskins-muted">This skin is level 1. Levels are reached in the order below. Choose the skin each level unlocks; selecting it also adds it to Variants. All goals in a level must be met; leave unused counters blank.</p>
        <p v-if="invalidLevels" class="mcpskins-notice">The saved levels field is not a list. Clear it to replace the invalid value.</p>
        <div v-for="(level,index) in levels" :key="index" class="mcpskins-level">
            <div class="mcpskins-level-heading"><strong>Level {{index + 2}}</strong><div>
                <button type="button" :disabled="index === 0 || !!owner" @click="moveLevel(index,-1)" aria-label="Move level up">Up</button>
                <button type="button" :disabled="index === levels.length-1 || !!owner" @click="moveLevel(index,1)" aria-label="Move level down">Down</button>
                <button type="button" @click="removeLevel(index)" aria-label="Remove level">Remove</button>
            </div></div>
            <label><span>Unlock variant <field-help name="Unlock variant"></field-help> <span class="mcpskins-required" title="Required" aria-label="Required">*</span></span><select :disabled="!!owner" :value="target(level)" @change="selectTarget(index,$event.target.value)">
                <option value="" disabled>Choose a variant skin</option>
                <option v-if="target(level) && !levelCandidates.some(candidate => candidate.id === target(level))" :value="target(level)">{{target(level)}} (not selected)</option>
                <option v-for="candidate in levelCandidates" :key="candidate.id" :value="candidate.id">{{candidate.name}} ({{candidate.id}})</option>
            </select></label>
            <p v-if="!levelCandidates.length" class="mcpskins-muted">Create or duplicate another skin for this item first, then select it as the level reward.</p>
            <div class="mcpskins-level-goals"><label v-for="counter in counters" :key="counter"><span>{{labels[counter]}} <field-help :name="labels[counter]"></field-help></span><input type="number" min="1" step="1" :disabled="!!owner" :value="goal(level,counter)" @input="setGoal(index,counter,$event.target.value)" placeholder="Not required"></label></div>
            <p v-if="unsupported(level).length" class="mcpskins-notice">Unsupported counters: {{unsupported(level).join(', ')}} <button type="button" @click="removeUnsupported(index)">Remove unsupported counters</button></p>
        </div>
        <div class="mcpskins-save"><button type="button" :disabled="!!owner" @click="addLevel">Add Level</button><button v-if="levels.length || invalidLevels" type="button" @click="clearLevels">Clear Levels</button></div>
    </details>`
};
module.exports = {variantEditor};
