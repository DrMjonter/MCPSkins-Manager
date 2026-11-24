'use strict';
const {isObject} = require('./skin');
const {loadPackMetadata, savePackMetadata} = require('../storage/pack-metadata');
const STATUSES = Object.freeze({planned: {label: 'Planned', color: '#E05A5A', order:5}, wip: {label: 'WIP', color: '#E9B949', order:10}, complete: {label: 'Complete', color: '#43B873', order:20}});
const UNASSIGNED = Object.freeze({id:null,label:'Unassigned',color:'#777777',order:0});
function normalizeCustomStatuses(value) {
    const result=[],ids=new Set(Object.keys(STATUSES)),names=new Set(['unassigned',...Object.values(STATUSES).map(info=>info.label.toLowerCase())]);
    for(const status of Array.isArray(value)?value:[]) {
        if(!isObject(status) || typeof status.id!=='string' || !/^custom_[a-z0-9_]+$/.test(status.id) || ids.has(status.id)
            || typeof status.label!=='string' || !status.label.trim() || status.label.trim().length>64 || names.has(status.label.trim().toLowerCase())
            || typeof status.color!=='string' || !/^#[a-f0-9]{6}$/i.test(status.color) || !Number.isSafeInteger(status.order)) continue;
        result.push({id:status.id,label:status.label.trim(),color:status.color.toUpperCase(),order:status.order});
        ids.add(status.id);names.add(status.label.trim().toLowerCase());
    }
    return result;
}
function availableStatuses(custom=[]) { return {...STATUSES,...Object.fromEntries(normalizeCustomStatuses(custom).map(status=>[status.id,status]))}; }
function sortedStatuses(custom=[]) {
    return [UNASSIGNED,...Object.entries(availableStatuses(custom)).map(([id,info])=>({...info,id}))]
        .sort((a,b)=>a.order-b.order || a.label.localeCompare(b.label) || String(a.id).localeCompare(String(b.id)));
}
function newCustomStatus(values,custom=[]) {
    const label=String(values.name || '').trim(),order=String(values.order ?? '').trim();
    const color=typeof values.color==='string'?values.color:values.color && values.color.toHexString();
    if(!label || label.length>64) throw new Error('Enter a status name from 1 to 64 characters.');
    if(sortedStatuses(custom).some(status=>status.label.toLowerCase()===label.toLowerCase())) throw new Error('A status with that name already exists.');
    if(!/^-?[0-9]+$/.test(order) || !Number.isSafeInteger(Number(order))) throw new Error('Sort order must be a whole number within the safe range.');
    if(typeof color!=='string' || !/^#[a-f0-9]{6}$/i.test(color)) throw new Error('Choose a six-digit flag color.');
    let id;do {id='custom_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);} while(custom.some(status=>status.id===id));
    return {id,label,color:color.toUpperCase(),order:Number(order)};
}
function statusKey(paths, row) {
    return JSON.stringify([paths.path.relative(paths.pack, row.filename).replace(/\\/g, '/'), String(row.skin.id ?? '')]);
}
function rowStatus(metadata, paths, row, custom=[]) {
    const statuses = metadata.skin_statuses;
    const value = isObject(statuses) ? statuses[statusKey(paths, row)] : null;
    const available=availableStatuses(custom);
    return typeof value === 'string' && Object.hasOwn(available, value) ? available[value] : null;
}
function saveStatuses(fs, paths, rows, status, custom=[]) {
    if (status !== null && !Object.hasOwn(availableStatuses(custom), status)) throw new Error('Choose a supported skin status.');
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
module.exports = {STATUSES, UNASSIGNED, normalizeCustomStatuses, availableStatuses, sortedStatuses, newCustomStatus, statusKey, rowStatus, saveStatuses};
