'use strict';
const {readJSON, isFile, isDirectory} = require('../storage/files');
const {isObject, clone} = require('../domain/skin');

const MAX_FRAMES = 256, MAX_PIXELS = 16777216, MAX_SIDE = 16384;
function positive(value, label) {
    if (!/^[0-9]+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error(label + ' must be a positive whole number.');
    return Number(value);
}
function pngSize(bytes) {
    const signature = [137,80,78,71,13,10,26,10];
    if (bytes.length < 24 || signature.some((v,i) => bytes[i] !== v) || String.fromCharCode(...bytes.slice(12,16)) !== 'IHDR') throw new Error('Expected a PNG image.');
    const integer = offset => bytes[offset] * 16777216 + bytes[offset+1] * 65536 + bytes[offset+2] * 256 + bytes[offset+3];
    const width = integer(16), height = integer(20);
    if (!width || !height || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) throw new Error('Image dimensions exceed the animation editor limit.');
    return {width, height};
}
function validateFrames(frames, width, height) {
    width = positive(width, 'Frame width'); height = positive(height, 'Frame height');
    if (!frames.length || frames.length > MAX_FRAMES || height * frames.length > MAX_SIDE || width > MAX_SIDE || width * height * frames.length > MAX_PIXELS) throw new Error('Use 1–256 frames, at most 16 million pixels and 16384 pixels per side in the stitched image.');
    for (const frame of frames) {
        const size = pngSize(frame);
        if (size.width !== width || size.height !== height) throw new Error('All frames must have the same dimensions (' + width + ' × ' + height + ').');
    }
    return {width, height};
}
function animationMetadata(settings, root = {}) {
    const frametime = positive(settings.frametime, 'Frame time');
    if(typeof settings.interpolate!=='boolean') throw new Error('Interpolation must be true or false.');
    const width = positive(settings.width, 'Frame width'), height = positive(settings.height, 'Frame height');
    const animation = {...(isObject(root.animation) ? clone(root.animation) : {}), frametime, interpolate: !!settings.interpolate, width, height,
        frames: settings.frames.map((_frame,index) => settings.frames[index].time === '' || settings.frames[index].time == null ? index : {index, time: positive(settings.frames[index].time, 'Frame duration')})};
    return {...clone(root), animation};
}
function stripLayout(bytes, metadata = {}, width = null, height = null) {
    const size = pngSize(bytes), animation = isObject(metadata.animation) ? metadata.animation : {};
    width = positive(width ?? animation.width ?? Math.min(size.width,size.height), 'Frame width');
    height = positive(height ?? animation.height ?? Math.min(size.width,size.height), 'Frame height');
    if (size.width % width || size.height % height) throw new Error('Frame dimensions must divide the strip dimensions exactly.');
    const count = size.width / width * (size.height / height);
    if(count>MAX_FRAMES) throw new Error('The strip must contain 1?256 frames.');
    const order = animation.frames === undefined ? Array.from({length: count},(_,index) => index) : animation.frames;
    if (!Array.isArray(order) || !order.length || order.length > MAX_FRAMES || count > MAX_FRAMES) throw new Error('The strip must contain 1–256 frames.');
    positive(animation.frametime ?? 1, 'Frame time');
    if (animation.interpolate !== undefined && typeof animation.interpolate !== 'boolean') throw new Error('Interpolation must be true or false.');
    const frames = order.map(frame => {
        const index = isObject(frame) ? frame.index : frame;
        if (!Number.isSafeInteger(index) || index < 0 || index >= count) throw new Error('Animation frame index is outside the strip.');
        return {index, time: isObject(frame) && frame.time !== undefined ? positive(frame.time, 'Frame duration') : ''};
    });
    if (height * frames.length > MAX_SIDE || width * height * frames.length > MAX_PIXELS) throw new Error('Stitched animation exceeds the image size limit.');
    return {width, height, columns: size.width / width, frames, frametime: animation.frametime ?? 1, interpolate: animation.interpolate ?? false};
}
function timingRows(bytes,metadata,width,height) {
    const layout=stripLayout(bytes,metadata,width,height),raw=metadata.animation && metadata.animation.frames;
    return layout.frames.map((frame,index)=>({index:frame.index,time:frame.time===''?'':String(frame.time),extra:Array.isArray(raw)&&isObject(raw[index])?clone(raw[index]):{}}));
}
function timingOrder(rows,count) {
    if(!Array.isArray(rows) || !rows.length) throw new Error('At least one playback frame is required.');
    const result=rows.map(row=>{
        if(!Number.isSafeInteger(row.index) || row.index<0 || row.index>=count) throw new Error('A timing row refers to a frame outside the texture strip.');
        const entry={...(isObject(row.extra)?clone(row.extra):{}),index:row.index};delete entry.time;
        if(row.time!=='' && row.time!=null) entry.time=positive(row.time,'Frame '+row.index+' time');
        return Object.keys(entry).length===1?row.index:entry;
    });
    return result.length===count && result.every((entry,index)=>entry===index)?null:result;
}
function stamp(fs, file) {
    if (!isFile(fs,file)) return '';
    const s=fs.statSync(file); return s.size + ':' + s.mtimeMs + ':' + s.ctimeMs;
}
function writeBundle(fs, files) {
    const staged=[], replaced=[];
    try {
        for (const [file,bytes] of files) {
            const before=isFile(fs,file) ? fs.readFileSync(file) : null;
            fs.writeFileSync(file+'.animation.tmp',bytes,{flag:'wx'});
            staged.push({file,before});
        }
        for (const entry of staged) { fs.renameSync(entry.file+'.animation.tmp',entry.file); replaced.push(entry); }
    } catch (error) {
        const failures=[];
        for (const entry of replaced.reverse()) {
            try { if (entry.before === null) fs.unlinkSync(entry.file); else fs.writeFileSync(entry.file,entry.before); }
            catch { failures.push(entry.file); }
        }
        if (failures.length) throw new Error(error.message + ' Could not restore: ' + failures.join(', '));
        throw error;
    } finally {
        for (const entry of staged) if (fs.existsSync(entry.file+'.animation.tmp')) fs.unlinkSync(entry.file+'.animation.tmp');
    }
}

class AnimationSession {
    constructor(fs, paths, texture, raster, options = {}) {
        this.fs=fs; this.paths=paths; this.texture=texture; this.raster=raster; this.options=options;
        this.base=paths.path.basename(texture,'.png'); this.folder=paths.path.join(paths.path.dirname(texture),this.base+'_frames');
        this.manifest=paths.path.join(this.folder,'animation.json'); this.metadata=texture+'.mcmeta';
        this.disposed=false; this.running=null; this.revision=0; this.document={}; this.rootMetadata={};
        this.state={mode:'frames',timings:[],timingsDirty:false,frames:[],width:256,height:256,frametime:'2',interpolate:false,selected:0,dirty:false,busy:false,error:'',status:'',playing:false,elapsed:0};
        this.load();
    }
    file(frame) {
        if (!frame || typeof frame.file !== 'string' || !frame.file.startsWith(this.base+'_') || !/^[0-9]+\.png$/.test(frame.file.slice(this.base.length+1))) throw new Error('Invalid animation frame filename.');
        return this.paths.path.join(this.folder,frame.file);
    }
    sourceStamp() { return this.state.frames.map(frame => this.file(frame)+':'+stamp(this.fs,this.file(frame))).join('|'); }
    load() {
        if (this.running) throw new Error('Wait for stitching to finish.');
        this.rootMetadata=isFile(this.fs,this.metadata) ? readJSON(this.fs,this.metadata) : {};
        if (!isObject(this.rootMetadata)) throw new Error('Animation metadata must be a JSON object.');
        this.document={}; this.state.frames=[];
        if (isFile(this.fs,this.manifest)) {
            const value=readJSON(this.fs,this.manifest);
            if (!isObject(value) || value.version !== 1 || !Array.isArray(value.frames) || value.frames.length > MAX_FRAMES) throw new Error('Invalid numbered-frame workspace.');
            value.frames.forEach(frame => this.file(frame));
            animationMetadata(value,this.rootMetadata);
            this.document=value;
            Object.assign(this.state,{mode:value.mode==='native'?'native':'frames',frames:clone(value.frames),width:value.width,height:value.height,frametime:String(value.frametime),interpolate:!!value.interpolate});
            if(value.mode==='native' && isFile(this.fs,this.texture) && this.rootMetadata.animation) {
                const layout=stripLayout(this.fs.readFileSync(this.texture),this.rootMetadata);
                Object.assign(this.state,{width:layout.width,height:layout.height,frametime:String(layout.frametime),interpolate:layout.interpolate});
            }
        } else if (isFile(this.fs,this.texture)) {
            const size=pngSize(this.fs.readFileSync(this.texture)), animation=this.rootMetadata.animation;
            const layout=animation ? stripLayout(this.fs.readFileSync(this.texture),this.rootMetadata) : {...size,frametime:2,interpolate:false};
            Object.assign(this.state,{width:layout.width,height:layout.height,frametime:String(layout.frametime),interpolate:layout.interpolate});
        }
        this.outputStamp=stamp(this.fs,this.texture); this.metaStamp=stamp(this.fs,this.metadata); this.manifestStamp=stamp(this.fs,this.manifest);
        this.lastSources=this.state.frames.map(frame=>this.file(frame)+':'+(typeof frame.signature==='string'?frame.signature:stamp(this.fs,this.file(frame)))).join('|'); this.state.dirty=false; this.state.error=''; this.state.elapsed=0;
        this.refreshTimings();this.refreshFrames();
    }
    refreshTimings() {
        this.state.timings=isFile(this.fs,this.texture)?timingRows(this.fs.readFileSync(this.texture),this.rootMetadata,Number(this.state.width),Number(this.state.height)):[];
        this.state.timingsDirty=false;
    }
    editTiming(index,value) {
        this.state.timings=this.state.timings.map((row,i)=>i===index?{...row,time:value}:row);
        this.state.timingsDirty=true;this.state.dirty=true;this.state.error='';this.revision++;
    }
    refreshFrames() {
        this.state.frames=this.state.frames.map(frame => ({...frame,src:this.options.url ? this.options.url(this.file(frame))+'?v='+stamp(this.fs,this.file(frame)) : ''}));
        this.state.selected=Math.max(0,Math.min(this.state.selected,this.state.frames.length-1));
    }
    edit(key,value) { this.state[key]=value; this.state.dirty=true; this.state.error=''; this.revision++; }
    editTime(index,value) { this.edit('frames',this.state.frames.map((frame,i)=>i===index?{...frame,time:value}:frame)); }
    move(index,direction) {
        const frames=this.state.frames.slice(), next=index+direction;
        if(next<0 || next>=frames.length) return;
        [frames[index],frames[next]]=[frames[next],frames[index]]; this.edit('frames',frames); this.state.selected=next;
    }
    remove(index) { if(this.state.frames.length<=1) return; this.edit('frames',this.state.frames.filter((_frame,i)=>i!==index)); this.refreshFrames(); }
    async importFrames(frames, replace=false, layout=null) {
        if(this.running || this.state.busy) throw new Error('Wait for stitching to finish.');
        if(this.disposed) return false;
        const first=pngSize(frames[0]), all=replace ? frames : [...this.state.frames.map(frame=>this.fs.readFileSync(this.file(frame))),...frames];
        validateFrames(all,replace || !this.state.frames.length ? first.width : this.state.width,replace || !this.state.frames.length ? first.height : this.state.height);
        const created=[];
        this.fs.mkdirSync(this.folder,{recursive:true});
        let number=1;
        const names=new Set(this.fs.readdirSync(this.folder));
        try {
            for(let index=0; index<frames.length; index++) {
                while(names.has(this.base+'_'+number+'.png')) number++;
                const frame={file:this.base+'_'+number+'.png',time:layout ? layout.frames[index].time : ''};
                this.fs.writeFileSync(this.file(frame),frames[index],{flag:'wx'}); names.add(frame.file); created.push(frame);
            }
        } catch(error) { created.forEach(frame=>this.fs.unlinkSync(this.file(frame))); throw error; }
        if(layout) Object.assign(this.state,{frametime:String(layout.frametime),interpolate:layout.interpolate});
        Object.assign(this.state,{selected:replace?0:this.state.frames.length,width:first.width,height:first.height,frames:replace?created:[...this.state.frames,...created],dirty:true,elapsed:0});
        this.revision++; this.refreshFrames();
        return this.build(true);
    }
    async useCurrent() {
        const bytes=this.fs.readFileSync(this.texture), metadata=isFile(this.fs,this.metadata)?readJSON(this.fs,this.metadata):{};
        if(metadata.animation) return this.importStrip(bytes,null,null,metadata);
        return this.importFrames([bytes],true);
    }
    async importStrip(bytes,width=this.state.width,height=this.state.height,metadata={}) {
        const layout=stripLayout(bytes,metadata,width,height);
        const frames=await this.raster.split(bytes,layout);
        if(this.disposed) return false;
        this.rootMetadata={...this.rootMetadata,...metadata};
        return this.importFrames(frames,true,layout);
    }
    async duplicate() {
        const frame=this.state.frames[this.state.selected];
        if(!frame) return this.useCurrent();
        return this.importFrames([this.fs.readFileSync(this.file(frame))]);
    }
    async build(force=false) {
        if(this.disposed) return false;
        if(this.running) return this.running;
        this.running=this.rebuild(force);
        try { return await this.running; } finally { this.running=null; }
    }
    async rebuild(force) {
        this.state.busy=true; this.state.error=''; this.state.status='Stitching...';
        try {
            const revision=this.revision, sources=this.sourceStamp(), initialOutput=stamp(this.fs,this.texture), initialMeta=stamp(this.fs,this.metadata);
            if(stamp(this.fs,this.manifest)!==this.manifestStamp) throw new Error('The frame workspace changed externally. Reopen Animated Textures before rebuilding.');
            if(!force && (stamp(this.fs,this.texture)!==this.outputStamp || stamp(this.fs,this.metadata)!==this.metaStamp)) throw new Error('The stitched texture or metadata changed externally. Click Save & Build to replace it from the numbered frames.');
            if(this.options.canWrite) this.options.canWrite([this.texture,this.metadata,...this.state.frames.map(frame=>this.file(frame))]);
            const frames=this.state.frames.map(frame=>this.fs.readFileSync(this.file(frame)));
            const size=validateFrames(frames,this.state.width,this.state.height), metadata=animationMetadata(this.state,this.rootMetadata);
            const output=await this.raster.stitch(frames,size);
            if(this.disposed) return false;
            if(initialOutput!==stamp(this.fs,this.texture) || initialMeta!==stamp(this.fs,this.metadata) || this.manifestStamp!==stamp(this.fs,this.manifest)) throw new Error('Generated files changed during stitching. Save & Build again.');
            if(revision!==this.revision || sources!==this.sourceStamp()) throw new Error('Frames changed during stitching. Save & Build again.');
            if(this.options.canWrite) this.options.canWrite([this.texture,this.metadata,...this.state.frames.map(frame=>this.file(frame))]);
            if(output.length>16*1024*1024) throw new Error('The stitched PNG exceeds the 16 MB texture limit.');
            const saved={...this.document,mode:this.state.mode,version:1,width:size.width,height:size.height,frametime:Number(this.state.frametime),interpolate:!!this.state.interpolate,
                frames:this.state.frames.map(frame=>({file:frame.file,time:frame.time==='' || frame.time==null ? '' : Number(frame.time),signature:stamp(this.fs,this.file(frame))}))};
            this.fs.mkdirSync(this.folder,{recursive:true});
            writeBundle(this.fs,[[this.texture,output],[this.metadata,JSON.stringify(metadata,null,2)+'\n'],[this.manifest,JSON.stringify(saved,null,2)+'\n']]);
            this.document=saved; this.rootMetadata=metadata;
            this.outputStamp=stamp(this.fs,this.texture); this.metaStamp=stamp(this.fs,this.metadata); this.manifestStamp=stamp(this.fs,this.manifest); this.lastSources=sources;
            this.state.dirty=false; this.state.status=this.state.mode==='native'?'Frames imported into the texture strip. Continue in the native Flipbook Editor.':'Stitched PNG and metadata saved. Saved frame edits rebuild automatically.';
            this.refreshTimings();this.refreshFrames(); if(this.options.saved) this.options.saved(); return true;
        } catch(error) { this.state.error=error.message; this.state.status=''; return false; }
        finally { this.state.busy=false; }
    }
    async preferNative() {
        if(this.running) await this.running;
        this.state.mode='native'; this.document.mode='native';
        if(isFile(this.fs,this.manifest)) {
            const value=readJSON(this.fs,this.manifest);value.mode='native';
            writeBundle(this.fs,[[this.manifest,JSON.stringify(value,null,2)+'\n']]);
            this.document=value;this.manifestStamp=stamp(this.fs,this.manifest);
        }
    }
    saveNativeState(info) {
        Object.assign(this.state,{width:info.width,height:info.height,frametime:String(info.frametime),interpolate:!!info.interpolate,mode:'native'});
        if(isFile(this.fs,this.manifest)) {
            const value=readJSON(this.fs,this.manifest);
            Object.assign(value,{mode:'native',width:info.width,height:info.height,frametime:Number(info.frametime),interpolate:!!info.interpolate});
            writeBundle(this.fs,[[this.manifest,JSON.stringify(value,null,2)+'\n']]);
            this.document=value;this.manifestStamp=stamp(this.fs,this.manifest);
        }
        this.refreshTimings();
    }
    async poll() {
        if(this.disposed || this.state.mode==='native' || this.running || this.state.dirty || !this.state.frames.length) return;
        try { if(!isFile(this.fs,this.texture) || !isFile(this.fs,this.metadata)) { await this.build(true); return; } if(this.sourceStamp()!==this.lastSources) { this.refreshFrames(); await this.build(); } }
        catch(error) { this.state.error=error.message; }
    }
    dispose() { this.disposed=true; }
}
function animationCopies(fs,paths,source,target) {
    const copies=[];
    for(const suffix of ['', '_n', '_s', '_icon', '_hud', '_hud_empty', '_lod']) {
        const fromBase=source.id+suffix,toBase=target.id+suffix;
        const from=paths.path.join(source.folder,fromBase+'_frames'),to=paths.path.join(target.folder,toBase+'_frames');
        const manifest=paths.path.join(from,'animation.json');
        if(!isFile(fs,manifest)) continue;
        if(fs.existsSync(to)) throw new Error('Duplicate frame workspace already exists: '+to);
        const data=readJSON(fs,manifest);
        if(!isObject(data) || data.version!==1 || !Array.isArray(data.frames)) throw new Error('Invalid animation workspace: '+manifest);
        const frames=data.frames.map(frame=>{
            if(!frame || typeof frame.file!=='string' || !frame.file.startsWith(fromBase+'_') || !/^[0-9]+\.png$/.test(frame.file.slice(fromBase.length+1))) throw new Error('Invalid animation frame path.');
            const filename=toBase+frame.file.slice(fromBase.length);
            copies.push([paths.path.join(to,filename),fs.readFileSync(paths.path.join(from,frame.file))]);
            return {...frame,file:filename};
        });
        copies.push([paths.path.join(to,'animation.json'),JSON.stringify({...data,frames},null,2)+'\n']);
    }
    return copies;
}
module.exports={timingRows,timingOrder,positive,animationCopies,AnimationSession,pngSize,stripLayout,animationMetadata,validateFrames,writeBundle};
