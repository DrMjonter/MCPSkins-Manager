'use strict';
const {isObject} = require('./skin');
const {loadPackMetadata, savePackMetadata} = require('../storage/pack-metadata');
const STATUSES = Object.freeze({wip: {label: 'WIP', color: '#E9B949'}, planned: {label: 'Planned', color: '#E05A5A'}, complete: {label: 'Complete', color: '#43B873'}});
function statusKey(paths, row) {
    return JSON.stringify([paths.path.relative(paths.pack, row.filename).replace(/\\/g, '/'), String(row.skin.id ?? '')]);
}
function rowStatus(metadata, paths, row) {
    const statuses = metadata.skin_statuses;
    const value = isObject(statuses) ? statuses[statusKey(paths, row)] : null;
    return typeof value === 'string' && Object.hasOwn(STATUSES, value) ? STATUSES[value] : null;
}
function saveStatuses(fs, paths, rows, status) {
    if (status !== null && !Object.hasOwn(STATUSES, status)) throw new Error('Choose a supported skin status.');
    const metadata = loadPackMetadata(fs, paths);
    if (metadata.skin_statuses !== undefined && !isObject(metadata.skin_statuses)) throw new Error('Pack skin_statuses must be a JSON object.');
    const statuses = {...metadata.skin_statuses};
    for (const row of rows) {
        const key = statusKey(paths, row);
        if (status === null) delete statuses[key];
        else statuses[key] = status;
    }
    return savePackMetadata(fs, paths, {skin_statuses: statuses});
}
module.exports = {STATUSES, statusKey, rowStatus, saveStatuses};
