'use strict';

const SORT_HELP = 'Default sort orders: Unassigned 0, Planned 5, WIP 10, Complete 20.';
function customStatusComponent(state) {
    return {
        data() {return {status:state,sortHelp:SORT_HELP};},
        template:`<section class="mcpskins-custom-status">
            <label>Status name<input v-model="status.name" maxlength="64" placeholder="For Review" aria-label="Status name"></label>
            <label><span>Sort order <span class="mcpskins-field-help" :title="sortHelp" :aria-label="sortHelp" tabindex="0">?</span></span><input type="number" step="1" v-model="status.order" aria-label="Sort order"></label>
            <label>Flag color<input type="color" v-model="status.color" aria-label="Flag color"></label>
            <p v-if="status.error" class="mcpskins-health-error" role="alert">{{status.error}}</p>
        </section>`
    };
}
module.exports = {SORT_HELP,customStatusComponent};
