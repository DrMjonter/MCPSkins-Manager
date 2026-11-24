'use strict';
const {readJSON,atomicJSON,isDirectory,isFile,assertNoSymbolicLinks} = require('./files');
const {isObject,clone,equalJSON,baseWeapon,itemKind,draftFromRow} = require('../domain/skin');
const {assetSelection} = require('../assets/preparation');
const {scanCollections} = require('./collections');
const {metadataFile} = require('./pack-metadata');
const {statusKey} = require('../domain/status');

function assertInside(fs,paths,filename) {
    const relative=paths.path.relative(paths.pack,filename);
    if (!relative || relative==='..' || relative.startsWith('..'+paths.path.sep) || paths.path.isAbsolute(relative)) throw new Error('Deletion path is outside the selected pack.');
    assertNoSymbolicLinks(fs,paths.path,paths.pack,filename);
}
function skinFiles(fs,paths,row) {
    if(typeof row.skin.id!=='string' || !/^[a-z0-9_]+$/.test(row.skin.id)) throw new Error('Full Delete requires a valid skin ID. Use Delete Entry for an invalid entry.');
    const draft=draftFromRow(row),{folder,id,gun}=assetSelection(paths,draft);
    if (['','_geo','_n','_s','_icon','_hud','_hud_empty','_lod','_lod_n','_lod_s'].some(suffix=>id===gun+suffix)) throw new Error('This skin ID matches a default weapon asset name. Use Delete Entry to preserve shared default files.');
    const scan=scanCollections(fs,paths);
    if (scan.issues.some(issue=>issue.severity==='error' && paths.path.relative(paths.pack,issue.filename).split(paths.path.sep).includes('skins'))) throw new Error('Fix unreadable skin registries before Full Delete, or use Delete Entry.');
    for (const registry of scan.registries) registry.data.skins.forEach((skin,index)=>{
        if (isObject(skin) && skin.id===id && (registry.filename!==row.filename || index!==row.index)) throw new Error('Another skin uses this ID. Use Delete Entry to preserve shared files.');
    });
    const files=new Set(),directories=[],related=new Set();
    const add=filename=>{
        assertInside(fs,paths,filename); related.add(filename);
        if (!fs.existsSync(filename)) return;
        if (!isFile(fs,filename)) throw new Error('Expected an asset file: '+filename);
        files.add(filename);
    };
    const walk=(directory,visit,owned=false,depth=0)=>{
        assertInside(fs,paths,directory);
        if (!fs.existsSync(directory)) return;
        if (!isDirectory(fs,directory)) throw new Error('Expected an asset folder: '+directory);
        if (depth>32) throw new Error('Asset folders are nested too deeply.');
        if (owned) directories.push(directory);
        for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
            const filename=paths.path.join(directory,entry.name);
            if (entry.isSymbolicLink()) { if (owned) throw new Error('Cannot delete an animation workspace containing symbolic links.'); continue; }
            if (entry.isDirectory()) walk(filename,visit,owned,depth+1);
            else if (entry.isFile() && visit(filename)) add(filename);
        }
    };
    for (const suffix of ['', '_n','_s','_icon','_hud','_hud_empty','_lod','_lod_n','_lod_s']) {
        const texture=paths.path.join(folder,id+suffix+'.png');add(texture);add(texture+'.mcmeta');
        walk(paths.path.join(folder,id+suffix+'_frames'),()=>true,true);
    }
    add(paths.path.join(folder,id+'.json'));add(paths.path.join(folder,id+'.geo.json'));
    const canonical=paths.modelForSkin(draft.weapon,id,draft.kind);if(canonical)add(canonical);
    const assets=paths.inside(paths.folder,'assets');
    if (isDirectory(fs,assets)) for (const namespace of fs.readdirSync(assets,{withFileTypes:true}).filter(entry=>entry.isDirectory())) {
        walk(paths.path.join(assets,namespace.name,'geo_models'),filename=>paths.path.basename(filename).endsWith('__skin_'+id+'.json'));
    }
    add(paths.inside(paths.folder,'assets','mcpskins','animations','skins',...draft.weapon.split(/[:/]/),id+'.animation.json'));
    add(paths.inside(paths.folder,'.mcpskins_manager','model_backups',id+'.geo.json'));
    directories.push(folder);
    return {files:[...files],directories,related:[...related]};
}
function deleteSkin(repository,row,full=false,canDelete=()=>{}) {
    const {fs,paths}=repository;
    if (paths.path.dirname(row.filename)!==paths.registryDirectory) throw new Error('This skin is outside the selected registry directory.');
    assertInside(fs,paths,row.filename);
    const original=repository.read(row.filename);
    if (baseWeapon(original)!==baseWeapon(row.data) || itemKind(original)!==itemKind(row.data) || !equalJSON(original.skins[row.index],row.skin)) throw new Error('This skin changed on disk. Refresh the list before deleting.');
    const data=clone(original),id=row.skin.id;data.skins.splice(row.index,1);
    if (!data.skins.some(skin=>isObject(skin) && skin.id===id)) for (const skin of data.skins) if (isObject(skin)) {
        if (Array.isArray(skin.variants)) skin.variants=skin.variants.filter(value=>value!==id);
        if (Array.isArray(skin.levels)) skin.levels=skin.levels.filter(level=>!isObject(level) || level.variant!==id);
    }
    const assets=full?skinFiles(fs,paths,row):{files:[],directories:[],related:[]};
    if(full)canDelete(assets);
    const writes=[{filename:row.filename,original,data}];
    const metadata=metadataFile(paths);
    if (fs.existsSync(metadata)) {
        assertInside(fs,paths,metadata);
        const saved=readJSON(fs,metadata),key=statusKey(paths,row);
        if(isObject(saved) && isObject(saved.skin_statuses) && Object.hasOwn(saved.skin_statuses,key)) {
            const changed=clone(saved);delete changed.skin_statuses[key];writes.push({filename:metadata,original:saved,data:changed});
        }
    }
    let staging=null;const moved=[],written=[];
    try {
        if (assets.files.length) {
            const parent=paths.inside(paths.folder,'.mcpskins_manager','deletions');assertInside(fs,paths,parent);fs.mkdirSync(parent,{recursive:true});
            staging=paths.path.join(parent,Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));fs.mkdirSync(staging);
            for (const filename of assets.files) {
                const destination=paths.path.join(staging,String(moved.length));fs.renameSync(filename,destination);moved.push({filename,destination});
            }
        }
        for (const write of writes) {
            if(!equalJSON(readJSON(fs,write.filename),write.original))throw new Error('A registry or metadata file changed before deletion. Refresh and try again.');
            atomicJSON(fs,write.filename,write.data);written.push(write);
        }
    } catch(error) {
        const failures=[];
        for (const write of written.reverse()) try {
            if(!equalJSON(readJSON(fs,write.filename),write.data))throw new Error('Changed externally');
            atomicJSON(fs,write.filename,write.original);
        } catch {failures.push(write.filename);}
        for (const file of moved.reverse()) try {
            if(fs.existsSync(file.filename))throw new Error('Destination changed externally');
            fs.renameSync(file.destination,file.filename);
        } catch {failures.push(file.filename);}
        if(staging)try {fs.rmdirSync(staging);} catch { /* Retain recoverable staged files. */ }
        throw new Error(error.message+(failures.length?' Some files could not be restored: '+failures.join(', ')+'. Remaining files are in '+staging+'.':''));
    }
    const leftovers=[];
    for (const file of moved) try {fs.unlinkSync(file.destination);} catch {leftovers.push(file.destination);}
    if(staging)try {fs.rmdirSync(staging);} catch { /* Report retained files below. */ }
    for(const directory of assets.directories.sort((a,b)=>b.length-a.length)) try {fs.rmdirSync(directory);} catch { /* Preserve shared or nonempty folders. */ }
    return {id,full,files:assets.files,related:assets.related,warning:leftovers.length?'Skin deleted. Some files could not be removed from '+staging+'.':''};
}
module.exports = {skinFiles,deleteSkin};
