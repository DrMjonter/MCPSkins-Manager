'use strict';
const {isObject,clone,baseWeapon,itemKind,validateRegistry,validWeapon} = require('../domain/skin');
const {rowStatus,statusKey} = require('../domain/status');
const {safeEntry} = require('../gunpacks/archive');
const DATA_TYPES=new Set(['skin_rarities','skin_lang','collection_cases','shop_entries','shop_tabs','recipes','recipe','loot_tables','loot_table','tags','advancements','advancement','predicates','predicate','item_modifiers','item_modifier','functions','function']);
const encode=value=>new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');
function walkPack(fs,paths) {
    const files=new Map();
    const walk=(directory,prefix='',depth=0)=>{
        if(depth>48)throw new Error('Pack folders are nested too deeply to export.');
        for(const item of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
            const name=prefix+item.name,filename=paths.path.join(directory,item.name);
            if(!safeEntry(name))throw new Error('Unsafe pack path: '+name);
            if(item.isSymbolicLink())throw new Error('Cannot export a symbolic link: '+name);
            if(item.isDirectory())walk(filename,name+'/',depth+1);
            else if(item.isFile()) {
                const stat=fs.statSync(filename);if(stat.size>256*1024*1024)throw new Error('File exceeds the 256 MB export limit: '+name);
                const signature=value=>value.size+':'+value.mtimeMs+':'+value.ctimeMs;
                const expected=signature(stat);
                files.set(name,{name,filename,size:stat.size,read:()=>{
                    if(signature(fs.statSync(filename))!==expected)throw new Error('A pack file changed. Reopen Export Pack: '+name);
                    const bytes=fs.readFileSync(filename);
                    if(signature(fs.statSync(filename))!==expected)throw new Error('A pack file changed while exporting: '+name);
                    return bytes;
                }});
                if(files.size>65000)throw new Error('This pack has too many files to export.');
            }
        }
    };
    walk(paths.pack);return files;
}
function exportInventory(fs,paths,metadata={},customStatuses=[]) {
    const files=walkPack(fs,paths),registries=[],rows=[],errors=[];
    for(const [name,file] of files) if(/^data\/[^/]+\/skins\/.+\.json$/.test(name)) {
        try {
            const data=validateRegistry(JSON.parse(file.read().toString('utf8').replace(/^\uFEFF/,'')),name);
            if(!validWeapon(baseWeapon(data)||''))throw new Error('Invalid base weapon ID.');
            const record={name,file,data};registries.push(record);
            data.skins.forEach((skin,index)=>{
                if(!isObject(skin) || typeof skin.id!=='string' || !skin.id)throw new Error('Invalid skin entry.');
                const row={key:file.filename+'\0'+index,filename:file.filename,data,index,skin:clone(skin)};
                const status=rowStatus(metadata,paths,row,customStatuses);
                rows.push({...row,collection:typeof skin.collection==='string'?skin.collection.trim():'',statusId:status?metadata.skin_statuses[statusKey(paths,row)]:'',statusOrder:status?.order || 0,statusLabel:status?.label || 'Unassigned',statusColor:status?.color || '#777777',weapon:baseWeapon(data)});
            });
        } catch(error){errors.push(name+': '+error.message);}
    }
    return {files,registries,rows,errors};
}
function exportFilename(title,author,version) {
    const part=value=>String(value||'').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'');
    return [part(title)||'Pack',part(author)||'Author',part(version)||'1.0.0'].join('_')+'.zip';
}
function validateFilename(name) {
    const filename=String(name||'').trim();
    if(!filename || /[<>:"/\\|?*\x00-\x1f]/.test(filename) || /[. ]$/.test(filename) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(filename))throw new Error('Enter a valid ZIP filename without folders or reserved characters.');
    return /\.zip$/i.test(filename)?filename:filename+'.zip';
}
function runtimePlan(inventory,selected) {
    if(inventory.errors.length)throw new Error('Fix unreadable skin registries before Export Pack, or use Export Full. '+inventory.errors[0]);
    const keys=new Set(selected),chosen=inventory.rows.filter(row=>keys.has(row.key));
    if(!chosen.length)throw new Error('Select at least one skin to export.');
    if(chosen.length!==keys.size)throw new Error('The skin selection is no longer available. Reopen Export Pack.');
    const selectedIds=new Set();
    for(const row of chosen) {
        if(selectedIds.has(row.skin.id))throw new Error('Selected skins have a duplicate ID: '+row.skin.id);
        selectedIds.add(row.skin.id);
    }
    const files=inventory.files,output=new Map(),dependencies=[];
    const add=name=>{if(files.has(name) && !output.has(name))output.set(name,files.get(name));};
    const json=(name,data)=>{output.set(name,{name,read:()=>encode(data)});dependencies.push(data);};
    for(const registry of inventory.registries) {
        const selectedRows=chosen.filter(row=>row.filename===registry.file.filename);if(!selectedRows.length)continue;
        const allowed=new Set(selectedRows.map(row=>row.skin.id)),data=clone(registry.data);
        data.skins=selectedRows.map(row=>{
            const skin=clone(row.skin);
            if(Array.isArray(skin.variants))skin.variants=skin.variants.filter(id=>allowed.has(id));
            if(Array.isArray(skin.levels))skin.levels=skin.levels.filter(level=>!isObject(level) || allowed.has(level.variant));
            return skin;
        });
        json(registry.name,data);
    }
    const pngs=new Set();
    for(const row of chosen) {
        const id=row.skin.id,colon=id.indexOf(':'),namespace=colon<0?'mcpskins':id.slice(0,colon),skinPath=colon<0?id:id.slice(colon+1);
        const weapon=row.weapon.replace(':','/');
        if(!/^[a-z0-9_.-]+$/.test(namespace) || !safeEntry(skinPath) || !safeEntry(weapon))throw new Error('Unsafe skin asset ID: '+id);
        const base='assets/'+namespace+'/textures/skins/'+weapon+'/'+skinPath;
        const kinds=itemKind(row.data)==='gun'?['','_icon','_hud','_hud_empty','_lod']:['','_icon'];
        for(const kind of kinds) for(const map of ['','_n','_s'])pngs.add(base+kind+map+'.png');
        if(itemKind(row.data)==='gun')add('assets/'+namespace+'/animations/skins/'+weapon+'/'+skinPath+'.animation.json');
        const ending='__skin_'+id.replace(/[:/]/g,'_')+'.json';
        for(const name of files.keys())if(/^assets\/[^/]+\/geo_models\//.test(name) && name.endsWith(ending))add(name);
    }
    for(const png of pngs)if(files.has(png)){add(png);add(png+'.mcmeta');}
    for(const [name,file] of files) {
        const parts=name.split('/');if(parts[0]!=='data' || !DATA_TYPES.has(parts[2]))continue;
        if(name.endsWith('.json')) {
            let data;try{data=JSON.parse(file.read().toString('utf8').replace(/^\uFEFF/,''));}catch(error){throw new Error('Invalid runtime data: '+name);}
            add(name);dependencies.push(data);
        } else if(['function','functions'].includes(parts[2]) && name.endsWith('.mcfunction'))add(name);
    }
    // Follow local resource references from case icons, shop entries, and included models.
    const queue=[...output.keys()].filter(name=>name.startsWith('assets/') && name.endsWith('.json')),seen=new Set();
    const resource=value=>{
        if(typeof value!=='string' || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value))return;
        const [namespace,path]=value.split(':');if(!safeEntry(path))return;
        const candidates=/\.(png|json|ogg|mcmeta)$/.test(path)?[path]:[path,path+'.json',path+'.png','textures/'+path+'.png','models/'+path+'.json','models/item/'+path+'.json','sounds/'+path+'.ogg'];
        for(const candidate of candidates) {
            const name='assets/'+namespace+'/'+candidate;
            if(!/\.(png|json|ogg|mcmeta)$/.test(name))continue;
            if(files.has(name) && !output.has(name)){add(name);if(name.endsWith('.png'))add(name+'.mcmeta');if(name.endsWith('.json'))queue.push(name);}
        }
    };
    const visit=value=>{if(typeof value==='string')resource(value);else if(Array.isArray(value))value.forEach(visit);else if(isObject(value))Object.values(value).forEach(visit);};
    dependencies.forEach(visit);
    for(let index=0;index<queue.length;index++) {
        const name=queue[index];if(seen.has(name))continue;seen.add(name);
        try {visit(JSON.parse(files.get(name).read().toString('utf8').replace(/^\uFEFF/,'')));}catch(error){throw new Error('Invalid referenced asset: '+name);}
    }
    return {entries:[...output.values()].sort((a,b)=>a.name.localeCompare(b.name)),skins:chosen.length,omitted:files.size-output.size};
}
module.exports={walkPack,exportInventory,exportFilename,validateFilename,runtimePlan};
