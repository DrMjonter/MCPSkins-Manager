'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), os=require('node:os'), zlib=require('node:zlib');
const {crc32}=require('../src/gunpacks/archive');
const {PackPaths}=require('../src/domain/paths');
const {AnimationSession,stripLayout,animationMetadata,writeBundle}=require('../src/assets/animation');
const {canvasRaster}=require('../src/integration/raster');
const {duplicateAssets}=require('../src/assets/preparation');
const {emptyDraft}=require('../src/domain/skin');
const {checkPack}=require('../src/assets/health');
const {RegistryRepository}=require('../src/storage/registry');

function png(width,height,pixels) {
    const chunk=(type,data)=>{ const name=Buffer.from(type), out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),data.length+8);return out; };
    const header=Buffer.alloc(13); header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
    const raw=Buffer.alloc((width*4+1)*height);
    for(let y=0;y<height;y++) Buffer.from(pixels.slice(y*width*4,(y+1)*width*4)).copy(raw,y*(width*4+1)+1);
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function decode(bytes) {
    const b=Buffer.from(bytes), width=b.readUInt32BE(16),height=b.readUInt32BE(20),chunks=[];
    for(let offset=8;offset<b.length;) { const n=b.readUInt32BE(offset);if(b.toString('ascii',offset+4,offset+8)==='IDAT') chunks.push(b.subarray(offset+8,offset+8+n));offset+=n+12; }
    const raw=zlib.inflateSync(Buffer.concat(chunks)), pixels=[];
    for(let y=0;y<height;y++) {assert.equal(raw[y*(width*4+1)],0);pixels.push(...raw.subarray(y*(width*4+1)+1,(y+1)*(width*4+1)));}
    return {width,height,pixels};
}
// Exercise production canvas coordinates using an in-memory canvas and real PNG bytes.
function raster(environmentOnly=false) {
    class Image {
        set src(url) { fetch(url).then(r=>r.arrayBuffer()).then(data=>{Object.assign(this,decode(data));this.onload();}).catch(()=>this.onerror()); }
    }
    const document={createElement(){
        const canvas={width:0,height:0,pixels:null};
        const reset=()=>{if(!canvas.pixels || canvas.pixels.length!==canvas.width*canvas.height*4) canvas.pixels=new Uint8Array(canvas.width*canvas.height*4);};
        canvas.getContext=()=>({clearRect(){reset();canvas.pixels.fill(0);},drawImage(image,...args){
            reset();const [sx,sy,sw,sh,dx,dy]=args.length===2?[0,0,image.width,image.height,...args]:args;
            for(let y=0;y<sh;y++)for(let x=0;x<sw;x++)for(let c=0;c<4;c++) canvas.pixels[((dy+y)*canvas.width+dx+x)*4+c]=image.pixels[((sy+y)*image.width+sx+x)*4+c];
        }});
        canvas.toDataURL=()=>{reset();return 'data:image/png;base64,'+png(canvas.width,canvas.height,canvas.pixels).toString('base64');};return canvas;
    }};
    return environmentOnly?{document,Image}:canvasRaster({document,Image});
}
function fixture(t) {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcpskins-animation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const paths=new PackPaths(path,root,'Pack','example'),texture=path.join(paths.textures('tacz:ai_awp'),'awp_test.png');
    fs.mkdirSync(path.dirname(texture),{recursive:true});
    const red=png(2,1,[255,0,0,255,255,0,0,255]),blue=png(2,1,[0,0,255,255,0,0,255,128]);
    const session=new AnimationSession(fs,paths,texture,raster(),{url:file=>'file://'+file});t.after(()=>session.dispose());
    return {paths,texture,red,blue,session};
}

test('numbered PNG frames produce a real vertical strip with correct pixels, timing and interpolation',async t=>{
    const f=fixture(t);assert.equal(await f.session.importFrames([f.red,f.blue]),true);
    const image=decode(fs.readFileSync(f.texture));assert.equal(image.width,2);assert.equal(image.height,2);
    assert.deepEqual(image.pixels,[...decode(f.red).pixels,...decode(f.blue).pixels]);
    assert.deepEqual(f.session.state.frames.map(frame=>frame.file),['awp_test_1.png','awp_test_2.png']);
    f.session.edit('frametime','4');f.session.edit('interpolate',true);f.session.editTime(1,'8');
    assert.equal(await f.session.build(true),true);
    const metadata=JSON.parse(fs.readFileSync(f.texture+'.mcmeta','utf8'));
    assert.deepEqual(metadata.animation,{frametime:4,interpolate:true,width:2,height:1,frames:[0,{index:1,time:8}]});
});

test('saved frame edits automatically rebuild while reorder, duplicate and reopen keep source files independent',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red,f.blue]);
    const first=f.session.file(f.session.state.frames[0]);fs.writeFileSync(first,f.blue);await f.session.poll();
    assert.deepEqual(decode(fs.readFileSync(f.texture)).pixels,[...decode(f.blue).pixels,...decode(f.blue).pixels]);
    f.session.move(1,-1);await f.session.build(true);await f.session.duplicate();
    assert.equal(f.session.state.frames.length,3);assert.equal(f.session.state.frames[2].file,'awp_test_3.png');
    f.session.remove(2);await f.session.build(true);assert.equal(fs.existsSync(path.join(f.session.folder,'awp_test_3.png')),true);
    const reopened=new AnimationSession(fs,f.paths,f.texture,raster());t.after(()=>reopened.dispose());
    assert.deepEqual(reopened.state.frames.map(frame=>frame.file),['awp_test_2.png','awp_test_1.png']);
    assert.equal(reopened.state.dirty,false);
});

test('strip import preserves explicit frame order, durations, transparency and unknown metadata fields',async t=>{
    const f=fixture(t),strip=await raster().stitch([f.red,f.blue],{width:2,height:1});
    fs.writeFileSync(f.texture,strip);fs.writeFileSync(f.texture+'.mcmeta',JSON.stringify({future:{keep:true},animation:{width:2,height:1,frametime:3,frames:[1,{index:0,time:7},1],future:true}}));
    const session=new AnimationSession(fs,f.paths,f.texture,raster());t.after(()=>session.dispose());await session.useCurrent();
    assert.equal(session.state.frames.length,3);
    assert.deepEqual(decode(fs.readFileSync(session.file(session.state.frames[0]))).pixels,decode(f.blue).pixels);
    const metadata=JSON.parse(fs.readFileSync(f.texture+'.mcmeta','utf8'));assert.deepEqual(metadata.future,{keep:true});assert.equal(metadata.animation.future,true);
    assert.equal(metadata.animation.frames[1].time,7);
});

test('mismatched dimensions, invalid metadata and unsafe workspace paths are rejected',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red]);const original=fs.readFileSync(f.texture);
    await assert.rejects(()=>f.session.importFrames([png(1,1,[0,0,0,0])]),/same dimensions/);
    f.session.edit('frametime','0');assert.equal(await f.session.build(true),false);assert.deepEqual(fs.readFileSync(f.texture),original);
    assert.throws(()=>stripLayout(f.red,{animation:{width:3,height:1}}),/divide/);
    assert.throws(()=>stripLayout(f.red,{animation:{width:2,height:1,frames:[2]}}),/outside/);
    assert.throws(()=>animationMetadata({width:2,height:1,frametime:1,interpolate:false,frames:[{time:-1}]}),/duration/);
    const manifest=JSON.parse(fs.readFileSync(f.session.manifest,'utf8'));manifest.frames=[{file:'../../escape.png',time:''}];fs.writeFileSync(f.session.manifest,JSON.stringify(manifest));
    assert.throws(()=>new AnimationSession(fs,f.paths,f.texture,raster()),/filename/);
});

test('external output edits and unsaved painting are protected; failed grouped saves retain previous files',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red]);fs.writeFileSync(f.texture,f.blue);
    fs.writeFileSync(f.session.file(f.session.state.frames[0]),f.blue);await f.session.poll();assert.ok(f.session.state.error.includes('externally'));
    assert.equal(await f.session.build(true),true);
    f.session.options.canWrite=()=>{throw new Error('Save open painting first');};f.session.edit('frametime','5');assert.equal(await f.session.build(true),false);assert.ok(f.session.state.error.includes('painting'));
    const before=fs.readFileSync(f.texture);fs.writeFileSync(f.texture+'.mcmeta.animation.tmp','occupied');
    assert.throws(()=>writeBundle(fs,[[f.texture,f.red],[f.texture+'.mcmeta','changed']]),/EEXIST/);
    assert.deepEqual(fs.readFileSync(f.texture),before);assert.equal(fs.readFileSync(f.texture+'.mcmeta.animation.tmp','utf8'),'occupied');
});

test('skin duplication copies and renames the editable frame workspace',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red,f.blue]);
    const source={...emptyDraft(),weapon:'tacz:ai_awp',id:'awp_test'},target={...source,id:'awp_copy'};
    duplicateAssets(fs,f.paths,source,target);
    const folder=path.join(path.dirname(f.texture),'awp_copy_frames'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'animation.json'),'utf8'));
    assert.deepEqual(manifest.frames.map(frame=>frame.file),['awp_copy_1.png','awp_copy_2.png']);
    assert.deepEqual(fs.readFileSync(path.join(folder,'awp_copy_1.png')),f.red);
});

test('health checks use per-frame HUD/icon dimensions and report broken animation metadata',t=>{
    const f=fixture(t),repo=new RegistryRepository(fs,f.paths);
    repo.save({...emptyDraft(),weapon:'tacz:ai_awp',id:'awp_test',label:'Test',collection:'Test',description:'Test'});
    const icon=path.join(path.dirname(f.texture),'awp_test_icon.png'),hud=path.join(path.dirname(f.texture),'awp_test_hud.png');
    fs.writeFileSync(icon,png(2,4,new Uint8Array(32)));fs.writeFileSync(icon+'.mcmeta',JSON.stringify({animation:{width:2,height:2}}));
    fs.writeFileSync(hud,png(6,4,new Uint8Array(96)));fs.writeFileSync(hud+'.mcmeta',JSON.stringify({animation:{width:6,height:2}}));
    let report=checkPack(fs,f.paths);assert.equal(report.issues.some(issue=>issue.message.includes('aspect ratio')),false);
    fs.writeFileSync(icon+'.mcmeta',JSON.stringify({animation:{width:2,height:2,frames:[9]}}));
    report=checkPack(fs,f.paths);assert.ok(report.issues.some(issue=>issue.message.includes('invalid frame')));
});


test('saved frame changes made between editor sessions are rebuilt when the workspace is reopened',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red]);f.session.dispose();
    const file=path.join(f.session.folder,'awp_test_1.png');fs.writeFileSync(file,f.blue);
    const reopened=new AnimationSession(fs,f.paths,f.texture,raster());t.after(()=>reopened.dispose());await reopened.poll();
    assert.deepEqual(decode(fs.readFileSync(f.texture)).pixels,decode(f.blue).pixels);
});

test('disposing during an asynchronous stitch leaves generated files unchanged',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red]);const before=fs.readFileSync(f.texture);
    let finish;f.session.raster={stitch:()=>new Promise(resolve=>{finish=resolve;})};
    const pending=f.session.build(true);f.session.dispose();finish(f.blue);assert.equal(await pending,false);
    assert.deepEqual(fs.readFileSync(f.texture),before);
});


const {NativeAnimations,saveNativeMetadata}=require('../src/integration/native-animation');
const {EventEmitter}=require('node:events');

test('native Flipbook Editor receives the skin texture and saves matching MCPSkins metadata after the texture is saved',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red,f.blue]);await f.session.preferNative();
    const metadata=JSON.parse(fs.readFileSync(f.session.metadata,'utf8'));metadata.future={keep:true};fs.writeFileSync(f.session.metadata,JSON.stringify(metadata));f.session.load();
    const project={texture_width:2,texture_height:1},events=new EventEmitter();
    const texture={path:f.texture,saved:true,canvas:{width:2,height:2},img:{complete:true,naturalWidth:2},select(){this.selected=true;},getUVWidth(){return project.texture_width;},getUVHeight(){return project.texture_height;}};
    const original=async function(){texture.canvas.height=3;texture.fps=5;texture.saved=false;events.emit('finish_edit');};
    const editor={content_vue:{stride:1},onConfirm:original},animator={editor_dialog:editor};let clicks=0;
    const native=new NativeAnimations({Project:project,Texture:{all:[texture]},Format:{animated_textures:true,texture_mcmeta:false},Blockbench:events,TextureAnimator:animator,BarItems:{animated_texture_editor:{click(){clicks++;}}}});
    t.after(()=>native.dispose());
    assert.equal(await native.open(f.session,(a,b)=>a===b),true);assert.equal(clicks,1);assert.equal(texture.selected,true);assert.equal(texture.fps,10);
    assert.notEqual(editor.onConfirm,original);await editor.onConfirm();
    assert.equal(JSON.parse(fs.readFileSync(f.session.metadata,'utf8')).animation.frametime,2);
    const nativePixels=png(2,3,new Uint8Array(24));fs.writeFileSync(f.texture,nativePixels);texture.saved=true;native.poll();
    const saved=JSON.parse(fs.readFileSync(f.session.metadata,'utf8'));assert.equal(saved.animation.frametime,4);assert.equal(saved.animation.height,1);assert.deepEqual(saved.future,{keep:true});assert.equal(Object.hasOwn(saved.animation,'frames'),false);
    assert.equal(f.session.state.mode,'native');assert.equal(JSON.parse(fs.readFileSync(f.session.manifest,'utf8')).mode,'native');
    fs.writeFileSync(f.session.file(f.session.state.frames[0]),f.blue);await f.session.poll();assert.deepEqual(fs.readFileSync(f.texture),nativePixels);
    native.dispose();assert.equal(editor.onConfirm,original);assert.equal(events.listenerCount('finish_edit'),0);
});

test('native metadata settings leave PNG painting untouched and remain authoritative when reopening imported workspaces',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red,f.blue]);await f.session.preferNative();const before=fs.readFileSync(f.texture);
    saveNativeMetadata(f.session,{width:2,height:1,frametime:7,interpolate:true});assert.deepEqual(fs.readFileSync(f.texture),before);
    const reopened=new AnimationSession(fs,f.paths,f.texture,raster());t.after(()=>reopened.dispose());
    assert.equal(reopened.state.mode,'native');assert.equal(reopened.state.frametime,'7');assert.equal(reopened.state.interpolate,true);
    f.session.options.canWrite=()=>{throw new Error('Unsaved paint');};assert.throws(()=>saveNativeMetadata(f.session,{width:2,height:1,frametime:2,interpolate:false}),/Unsaved paint/);
});

test('native bridge respects unsupported formats, unsaved pixels, save-as paths and plugin unload',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red]);await f.session.preferNative();
    const texture={path:f.texture,saved:false,canvas:{width:2,height:1},select(){},getUVWidth(){return 2;},getUVHeight(){return 1;}},project={texture_width:2,texture_height:1};
    const environment={Project:project,Texture:{all:[texture]},Format:{animated_textures:false},BarItems:{animated_texture_editor:{click(){}}}};
    const native=new NativeAnimations(environment);t.after(()=>native.dispose());
    await assert.rejects(()=>native.open(f.session,(a,b)=>a===b),/Save the open texture/);
    texture.saved=true;await assert.rejects(()=>native.open(f.session,(a,b)=>a===b),/unavailable/);
    environment.Format.animated_textures=true;await native.open(f.session,(a,b)=>a===b);
    const record=[...native.records][0];record.pending=true;texture.path=path.join(f.paths.pack,'saved_elsewhere.png');native.poll();assert.ok(f.session.state.error.includes('original skin path'));
    const waiting=new NativeAnimations({Texture:{all:[]}}),pending=waiting.wait(f.texture,(a,b)=>a===b);waiting.dispose();assert.equal(await pending,null);
});


test('quick frame duplication appends freshly painted pixels, selects the copy and supports repeated edits and Undo',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red,f.blue]);await f.session.preferNative();
    const document=raster(true).document,canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;
    canvas.pixels=new Uint8Array([...decode(f.red).pixels,...decode(f.blue).pixels]);
    const texture={path:f.texture,canvas,ctx:canvas.getContext('2d'),width:2,height:2,currentFrame:1,saved:false,frame_order_type:'loop',frame_order:'',fps:10,
        getUVWidth(){return 2;},getUVHeight(){return 1;},getAnimationFrameIndices(){return undefined;},
        select(){this.selected=true;},updateChangesAfterEdit(){this.saved=false;}};
    const history=[],Undo={initEdit(aspects){assert.equal(aspects.bitmap,true);history.push({height:canvas.height,pixels:new Uint8Array(canvas.pixels),frame:texture.currentFrame});},finishEdit(name){assert.equal(name,'Duplicate current texture frame');}};
    let stopped=false,updates=0;
    const native=new NativeAnimations({document,Project:{texture_width:2,texture_height:1},Texture:{selected:texture,all:[texture]},Format:{animated_textures:true},Undo,TextureAnimator:{isPlaying:true,stop(){stopped=true;},update(){updates++;}}});
    t.after(()=>native.dispose());assert.equal(native.canDuplicateCurrentFrame(),true);
    const diskBefore=fs.readFileSync(f.texture);
    // This green frame exists only in unsaved paint memory, not in the source PNG.
    canvas.pixels.set([0,255,0,255,0,255,0,255],8);
    assert.deepEqual(native.duplicateCurrentFrame(f.session),{index:2,count:3});
    assert.equal(texture.currentFrame,2);assert.equal(canvas.height,3);assert.equal(stopped,true);
    assert.deepEqual(Array.from(canvas.pixels.slice(16)),[0,255,0,255,0,255,0,255]);
    assert.deepEqual(fs.readFileSync(f.texture),diskBefore);
    canvas.pixels.set([255,255,255,255,255,255,255,255],16);
    native.duplicateCurrentFrame(f.session);assert.equal(texture.currentFrame,3);assert.equal(canvas.height,4);
    assert.deepEqual(Array.from(canvas.pixels.slice(24)),[255,255,255,255,255,255,255,255]);
    const previous=history.pop();canvas.height=previous.height;canvas.pixels=previous.pixels;texture.height=previous.height;texture.currentFrame=previous.frame;
    assert.equal(canvas.height,3);assert.equal(texture.currentFrame,2);assert.equal(updates,2);
    fs.writeFileSync(f.texture,png(canvas.width,canvas.height,canvas.pixels));texture.saved=true;native.poll();
    const metadata=JSON.parse(fs.readFileSync(f.session.metadata,'utf8'));assert.equal(Object.hasOwn(metadata.animation,'frames'),false);assert.equal(metadata.animation.height,1);
});

test('quick duplicate extends custom frame timing and rejects unsupported layers or excessive strip sizes before changing pixels',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red,f.blue]);await f.session.preferNative();
    const document=raster(true).document,canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.pixels=new Uint8Array([...decode(f.red).pixels,...decode(f.blue).pixels]);
    let edits=0;
    const texture={path:f.texture,canvas,ctx:canvas.getContext('2d'),width:2,height:2,currentFrame:1,saved:false,frame_order_type:'custom',frame_order:'0:2 1:6',fps:10,
        getUVWidth(){return 2;},getUVHeight(){return 1;},getAnimationFrameIndices(){return this.frame_order.split(' ').map(token=>{const [index,time]=token.split(':').map(Number);return time?{index,time}:index;});},updateChangesAfterEdit(){this.saved=false;},select(){}};
    const native=new NativeAnimations({document,Project:{texture_width:2,texture_height:1},Texture:{selected:texture,all:[texture]},Format:{animated_textures:true},Undo:{initEdit(){edits++;},finishEdit(){}}});t.after(()=>native.dispose());
    native.duplicateCurrentFrame(f.session);assert.equal(texture.frame_order,'0:2 1:6 2:6');
    fs.writeFileSync(f.texture,png(canvas.width,canvas.height,canvas.pixels));texture.saved=true;native.poll();
    assert.deepEqual(JSON.parse(fs.readFileSync(f.session.metadata,'utf8')).animation.frames,[{index:0,time:2},{index:1,time:6},{index:2,time:6}]);
    texture.layers_enabled=true;assert.throws(()=>native.duplicateCurrentFrame(f.session),/Merge the texture layers/);assert.equal(edits,1);
    texture.layers_enabled=false;canvas.height=256;texture.height=256;assert.throws(()=>native.duplicateCurrentFrame(f.session),/size limit/);assert.equal(edits,1);
});


test('per-frame timing controls save MCMeta durations while blank entries follow the default and PNG pixels stay unchanged',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red,f.blue]);await f.session.preferNative();
    const before=fs.readFileSync(f.texture);
    assert.deepEqual(f.session.state.timings.map(row=>[row.index,row.time]),[[0,''],[1,'']]);
    f.session.editTiming(1,'20');saveNativeMetadata(f.session,f.session.state);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.session.metadata,'utf8')).animation.frames,[0,{index:1,time:20}]);
    assert.deepEqual(fs.readFileSync(f.texture),before);assert.equal(f.session.state.timingsDirty,false);
    f.session.edit('frametime','5');saveNativeMetadata(f.session,f.session.state);
    assert.equal(JSON.parse(fs.readFileSync(f.session.metadata,'utf8')).animation.frames[1].time,20);
    f.session.editTiming(1,'');saveNativeMetadata(f.session,f.session.state);
    assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(f.session.metadata,'utf8')).animation,'frames'),false);
});

test('timing edits preserve repeated playback order, unknown fields and independent durations for each occurrence',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red,f.blue]);await f.session.preferNative();
    const metadata=JSON.parse(fs.readFileSync(f.session.metadata,'utf8'));
    metadata.future={keep:true};metadata.animation.frames=[{index:1,time:4,future:'first'},0,{index:1,time:8}];
    fs.writeFileSync(f.session.metadata,JSON.stringify(metadata));f.session.load();
    assert.deepEqual(f.session.state.timings.map(row=>[row.index,row.time]),[[1,'4'],[0,''],[1,'8']]);
    f.session.editTiming(2,'12');saveNativeMetadata(f.session,f.session.state);
    const saved=JSON.parse(fs.readFileSync(f.session.metadata,'utf8'));
    assert.deepEqual(saved.future,{keep:true});assert.deepEqual(saved.animation.frames,[{index:1,time:4,future:'first'},0,{index:1,time:12}]);
    const reopened=new AnimationSession(fs,f.paths,f.texture,raster());t.after(()=>reopened.dispose());
    assert.deepEqual(reopened.state.timings.map(row=>row.time),['4','','12']);
    const before=fs.readFileSync(f.session.metadata);
    for(const value of ['0','-1','1.5','9007199254740993']) {
        f.session.editTiming(0,value);assert.throws(()=>saveNativeMetadata(f.session,f.session.state),/positive whole number/);assert.deepEqual(fs.readFileSync(f.session.metadata),before);
    }
});

test('native frame reordering and duplication retain timings attached to source frames and explicit repeated sequences',()=>{
    const {remapNativeTimings}=require('../src/integration/native-animation');
    assert.deepEqual(remapNativeTimings([0,{index:1,time:7,future:true}],[{initial_index:1},{initial_index:0},{initial_index:1}],2,3),[{index:0,time:7,future:true},1,{index:2,time:7,future:true}]);
    assert.deepEqual(remapNativeTimings([{index:1,time:4},0,{index:1,time:8}],[{initial_index:1},{initial_index:0}],2,2),[{index:0,time:4},1,{index:0,time:8}]);
    assert.equal(remapNativeTimings([0,1],[{initial_index:1},{initial_index:0}],2,2),null);
});

test('applying the native editor preserves per-frame durations and synchronizes the timing panel after saving the PNG',async t=>{
    const f=fixture(t);await f.session.importFrames([f.red,f.blue]);await f.session.preferNative();f.session.editTiming(1,'9');saveNativeMetadata(f.session,f.session.state);
    const project={texture_width:2,texture_height:1},texture={path:f.texture,saved:true,canvas:{width:2,height:2},select(){},getUVWidth(){return 2;},getUVHeight(){return 1;},fps:10,
        getAnimationFrameIndices(){return this.frame_order_type==='custom'?this.frame_order.split(' ').map(token=>{const [index,time]=token.split(':').map(Number);return time?{index,time}:index;}):undefined;}};
    const editor={content_vue:{stride:1,frames:[{initial_index:1},{initial_index:0},{initial_index:1}]},onConfirm:async()=>{texture.canvas.height=3;texture.saved=false;}};
    const native=new NativeAnimations({Project:project,Texture:{all:[texture]},Format:{animated_textures:true},TextureAnimator:{editor_dialog:editor},BarItems:{animated_texture_editor:{click(){}}}});t.after(()=>native.dispose());
    await native.open(f.session,(a,b)=>a===b);await editor.onConfirm();
    fs.writeFileSync(f.texture,png(2,3,new Uint8Array(24)));texture.saved=true;native.poll();
    assert.deepEqual(JSON.parse(fs.readFileSync(f.session.metadata,'utf8')).animation.frames,[{index:0,time:9},1,{index:2,time:9}]);
    assert.deepEqual(f.session.state.timings.map(row=>row.time),['9','','9']);
});
