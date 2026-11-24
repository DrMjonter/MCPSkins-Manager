'use strict';
const {assetSelection} = require('./preparation');
const {modelOutput,modelKey} = require('../gunpacks/catalog');
const {isObject} = require('../domain/skin');
const {isFile,readJSON,assertNoSymbolicLinks} = require('../storage/files');
const {parseJSONC} = require('../gunpacks/jsonc');
function lodReference(paths,draft,source=null) {
    if(draft.kind!=='gun')return null;
    if(source)return source.lodModelRef || null;
    const key=modelKey(draft.weapon,draft.kind);
    if(Object.hasOwn(paths.lodReferences,key))return paths.lodReferences[key];
    const {gun}=assetSelection(paths,draft);
    return draft.weapon.startsWith('tacz:')?'tacz:gun/lod/'+gun:null;
}
function pngDimensions(bytes,metadata=null) {
    const signature=[137,80,78,71,13,10,26,10];
    if(bytes.length<24 || signature.some((value,i)=>bytes[i]!==value) || String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw new Error('Invalid PNG header.');
    const integer=offset=>bytes[offset]*16777216+bytes[offset+1]*65536+bytes[offset+2]*256+bytes[offset+3];
    const width=integer(16),height=integer(20);if(!width || !height)throw new Error('Invalid PNG dimensions.');
    if(metadata && metadata.animation!==undefined) {
        const animation=metadata.animation;if(!isObject(animation))throw new Error('Invalid texture animation metadata.');
        const frameWidth=animation.width ?? Math.min(width,height),frameHeight=animation.height ?? Math.min(width,height);
        if(!Number.isSafeInteger(frameWidth) || !Number.isSafeInteger(frameHeight) || frameWidth<1 || frameHeight<1 || width%frameWidth || height%frameHeight)throw new Error('Animation frame dimensions do not divide the texture.');
        const positive=value=>Number.isSafeInteger(value) && value>0;
        if(animation.frametime!==undefined && !positive(animation.frametime))throw new Error('Invalid animation frame time.');
        if(animation.interpolate!==undefined && typeof animation.interpolate!=='boolean')throw new Error('Invalid animation interpolation setting.');
        const count=width/frameWidth*(height/frameHeight);
        if(animation.frames!==undefined && (!Array.isArray(animation.frames) || !animation.frames.length || animation.frames.some(frame=>{
            const index=isObject(frame)?frame.index:frame;
            return !Number.isSafeInteger(index) || index<0 || index>=count || isObject(frame) && frame.time!==undefined && !positive(frame.time);
        })))throw new Error('Invalid animation frame index or duration.');
        return {width:frameWidth,height:frameHeight};
    }
    return {width,height};
}
function geometry(bytes) {
    const data=parseJSONC(bytes.toString('utf8'));
    if(!isObject(data) || !Array.isArray(data['minecraft:geometry']) || !data['minecraft:geometry'].length || data['minecraft:geometry'].some(part=>!isObject(part) || !Array.isArray(part.bones)))throw new Error('Expected a Bedrock geometry model with a bones list.');
    return data;
}
function lodStatus(fs,paths,draft) {
    if(draft.kind!=='gun')return [];
    let selection;try{selection=assetSelection(paths,draft);}catch{return [];}
    const texture=paths.path.join(selection.folder,selection.id+'_lod.png');let model=null,error='';
    try{const reference=lodReference(paths,draft);if(reference)model=modelOutput(paths,reference,selection.id);}catch(problem){error=problem.message;}
    return [['texture','LOD Texture',texture],['model','LOD Model',model]].map(([kind,label,filename])=>{
        const row={kind,label,path:filename || '',filename:filename?paths.path.basename(filename):'LOD reference not available',status:'missing',message:'File does not exist.'};
        if(!filename){row.status=error?'invalid':'missing';row.message=error || 'No LOD model reference is available. Scan the source gun pack to check LOD support.';return row;}
        if(!fs.existsSync(filename))return row;
        try {
            if(!isFile(fs,filename))throw new Error('Expected a file.');
            if(kind==='model')geometry(fs.readFileSync(filename));
            else pngDimensions(fs.readFileSync(filename),isFile(fs,filename+'.mcmeta')?readJSON(fs,filename+'.mcmeta'):null);
            row.status='valid';row.message='File exists and passed validation.';
        }catch(problem){row.status='invalid';row.message=problem.message;}
        return row;
    });
}
function planLOD(fs,paths,draft,source=null) {
    if(draft.kind!=='gun')throw new Error('LOD generation is available for guns.');
    const {folder,id}=assetSelection(paths,draft),reference=lodReference(paths,draft,source);
    if(!reference)throw new Error(source?'This weapon does not define an LOD model. No files were generated.':'No LOD model reference is available. Scan or open the source gun pack first.');
    const destination=modelOutput(paths,reference,id),canonical=source && source.modelRef?modelOutput(paths,source.modelRef,id):paths.modelForSkin(draft.weapon,id,draft.kind);
    const full=[canonical,paths.path.join(folder,id+'.geo.json'),paths.path.join(folder,id+'.json')].find(file=>file && isFile(fs,file));
    const bytes=full?fs.readFileSync(full):source?source.model():null;
    if(!bytes)throw new Error('Open and save the full model before generating LODs.');
    geometry(bytes);
    const files=[[destination,bytes]],sources=full?[full]:[];
    for(const suffix of ['','_n','_s']) {
        const input=paths.path.join(folder,id+suffix+'.png'),output=paths.path.join(folder,id+'_lod'+suffix+'.png');
        if(!isFile(fs,input)){if(!suffix)throw new Error('Save the skin texture before generating LODs.');continue;}
        const metadata=isFile(fs,input+'.mcmeta')?readJSON(fs,input+'.mcmeta'):null,pixels=fs.readFileSync(input);
        pngDimensions(pixels,metadata);files.push([output,pixels]);sources.push(input);
        if(metadata){files.push([output+'.mcmeta',fs.readFileSync(input+'.mcmeta')]);sources.push(input+'.mcmeta');}
        else if(fs.existsSync(output+'.mcmeta'))files.push([output+'.mcmeta',null]);
    }
    return {reference,files,sources,existing:files.map(([file])=>file).filter(file=>fs.existsSync(file))};
}
function writeLOD(fs,paths,files) {
    const staged=[],committed=[];
    const safe=filename=>{
        const relative=paths.path.relative(paths.pack,filename);
        if(!relative || relative.startsWith('..'+paths.path.sep) || relative==='..' || paths.path.isAbsolute(relative))throw new Error('LOD output is outside the selected pack.');
        assertNoSymbolicLinks(fs,paths.path,paths.pack,filename);
    };
    try {
        for(const [filename,bytes] of files) {
            safe(filename);if(fs.existsSync(filename) && !isFile(fs,filename))throw new Error('LOD destination is not a file: '+filename);
            const before=isFile(fs,filename)?fs.readFileSync(filename):null;
            fs.mkdirSync(paths.path.dirname(filename),{recursive:true});
            if(bytes!==null)fs.writeFileSync(filename+'.lod.tmp',bytes,{flag:'wx'});
            staged.push({filename,bytes,before});
        }
        for(const record of staged){if(record.bytes===null){if(record.before!==null)fs.unlinkSync(record.filename);}else fs.renameSync(record.filename+'.lod.tmp',record.filename);committed.push(record);}
    }catch(error){
        const failures=[];for(const record of committed.reverse())try{if(record.before===null)fs.unlinkSync(record.filename);else fs.writeFileSync(record.filename,record.before);}catch{failures.push(record.filename);}
        throw new Error(error.message+(failures.length?' Could not restore: '+failures.join(', '):''));
    }finally{for(const record of staged)if(record.bytes!==null && fs.existsSync(record.filename+'.lod.tmp'))fs.unlinkSync(record.filename+'.lod.tmp');}
}
module.exports={lodReference,pngDimensions,geometry,lodStatus,planLOD,writeLOD};
