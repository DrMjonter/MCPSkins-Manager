'use strict';
function healthComponent(report, select, reveal) {
    return {
        data() { return {report}; },
        computed: {
            errors() { return this.report.issues.filter(issue => issue.severity === 'error').length; },
            warnings() { return this.report.issues.filter(issue => issue.severity === 'warning').length; }
        },
        methods: {select(issue) { return select(issue); }, reveal(issue) { reveal(issue); }},
        template: `<section class="mcpskins-health">
            <p>{{report.skins}} skins in {{report.files}} registry files checked. <strong>{{errors}} errors, {{warnings}} warnings.</strong></p>
            <p class="mcpskins-muted">Checks saved files. Missing optional HUD and icon images appear as warnings. PNG checks cover headers and dimensions.</p>
            <p v-if="!report.issues.length">No issues found.</p>
            <div v-else class="mcpskins-health-list"><article v-for="(issue,index) in report.issues" :key="index">
                <div><strong :class="'mcpskins-health-' + issue.severity">{{issue.severity === 'error' ? 'Error' : 'Warning'}}</strong><span v-if="issue.skinId"> / {{issue.skinId}}</span></div>
                <p>{{issue.message}}</p><p class="mcpskins-muted">{{issue.filename}}</p>
                <button v-if="issue.rowKey" type="button" @click="select(issue)">Select Skin</button>
                <button type="button" @click="reveal(issue)">Reveal Registry</button>
            </article></div>
        </section>`
    };
}
module.exports = {healthComponent};
