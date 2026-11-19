'use strict';
const {isDirectory} = require('../storage/files');

// Poll metadata rather than repeatedly reading unchanged textures and JSON files.
function healthSnapshot(fs, paths) {
    if (!isDirectory(fs, paths.pack)) return 'missing';
    const entries = []; let count = 0;
    const walk = (directory, depth) => {
        entries.push(['directory', directory]);
        if (depth > 32) throw new Error('Pack folders are nested too deeply to monitor.');
        for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
            if (++count > 100000) throw new Error('Pack contains too many files to monitor.');
            const filename = paths.path.join(directory, entry.name);
            if (entry.isDirectory()) walk(filename, depth + 1);
            else if (entry.isFile() && /\.(json|png)$/i.test(entry.name)) {
                const stat = fs.statSync(filename);
                entries.push([filename, stat.size, stat.mtimeMs, stat.ctimeMs]);
            }
        }
    };
    walk(paths.pack, 0);
    return JSON.stringify(entries);
}
function healthSummary(report) {
    const errors = report.issues.filter(issue => !issue.ignored && issue.severity === 'error').length;
    const warnings = report.issues.filter(issue => !issue.ignored && issue.severity === 'warning').length;
    return {status: errors ? 'error' : warnings ? 'warning' : 'good', errors, warnings, ignored: report.issues.filter(issue => issue.ignored).length};
}
function healthIssueKey(paths, issue) {
    const relative = filename => paths.path.relative(paths.pack, filename || paths.pack).replace(/\\/g, '/');
    const text = String(issue.message).replace(/\\/g, '/').split(paths.pack.replace(/\\/g, '/')).join('<pack>');
    return JSON.stringify([relative(issue.registry), issue.skinId || '', relative(issue.filename), issue.severity, text]);
}
function applyHealthIgnores(report, paths, metadata) {
    const ignored = new Set(Array.isArray(metadata.ignored_health_issues) ? metadata.ignored_health_issues.filter(key => typeof key === 'string') : []);
    report.issues = report.issues.map(issue => ({...issue, ignored: ignored.has(healthIssueKey(paths, issue))}));
    return report;
}
module.exports = {healthSnapshot, healthSummary, healthIssueKey, applyHealthIgnores};
