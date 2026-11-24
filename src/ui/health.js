'use strict';
function healthComponent(report, select, reveal, setIgnored = null) {
    return {
        data() { return {report, canIgnore: typeof setIgnored === 'function'}; },
        computed: {
            activeIssues() { return this.report.issues.filter(issue => !issue.ignored); },
            ignoredIssues() { return this.report.issues.filter(issue => issue.ignored); },
            errors() { return this.activeIssues.filter(issue => issue.severity === 'error').length; },
            warnings() { return this.activeIssues.filter(issue => issue.severity === 'warning').length; }
        },
        methods: {
            select(issue) { return select(issue); }, reveal(issue) { reveal(issue); },
            async ignore(issue, ignored) { const report = await setIgnored(issue, ignored); if (report) this.report = report; }
        },
        template: `<section class="mcpskins-health">
            <p>{{report.skins}} skins in {{report.files}} registry files checked. <strong>{{errors}} errors, {{warnings}} warnings.</strong> <span v-if="ignoredIssues.length">{{ignoredIssues.length}} ignored.</span></p>
            <p v-if="report.skipped" class="mcpskins-muted">{{report.skipped}} skin(s) skipped because their status order is 5 or lower.</p>
            <p class="mcpskins-muted">Checks saved files. Warnings can be optionally ignored</p>
            <p v-if="!activeIssues.length">No active issues found.</p>
            <div v-else class="mcpskins-health-list"><article v-for="(issue,index) in activeIssues" :key="index">
                <div><strong :class="'mcpskins-health-' + issue.severity">{{issue.severity === 'error' ? 'Error' : 'Warning'}}</strong><span v-if="issue.skinId"> / {{issue.skinId}}</span></div>
                <p>{{issue.message}}</p><p class="mcpskins-muted">{{issue.filename}}</p>
                <button v-if="issue.rowKey" type="button" @click="select(issue)">Select Skin</button>
                <button v-if="issue.severity !== 'warning'" type="button" @click="reveal(issue)">Reveal Registry</button><button v-if="canIgnore" type="button" @click="ignore(issue,true)">Ignore</button>
            </article></div>
            <details v-if="ignoredIssues.length" class="mcpskins-health-ignored"><summary>Ignored findings ({{ignoredIssues.length}})</summary>
                <div class="mcpskins-health-list"><article v-for="(issue,index) in ignoredIssues" :key="index">
                    <div><strong>Ignored {{issue.severity}}</strong><span v-if="issue.skinId"> / {{issue.skinId}}</span></div>
                    <p>{{issue.message}}</p><p class="mcpskins-muted">{{issue.filename}}</p>
                    <button v-if="canIgnore" type="button" @click="ignore(issue,false)">Restore</button>
                </article></div>
            </details>
        </section>`
    };
}
module.exports = {healthComponent};
