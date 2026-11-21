'use strict';
const {positive,pngSize,writeBundle,stripLayout,timingOrder}=require('../assets/animation');
const {readJSON,isFile}=require('../storage/files');
const {isObject}=require('../domain/skin');

function saveNativeMetadata(session,info,resetFrames=false) {
    const {fs,texture}=session;
    if(session.disposed) return false;
    if(session.options.canWrite) session.options.canWrite([texture]);
    const size=pngSize(fs.readFileSync(texture)),width=positive(info.width,'Frame width'),height=positive(info.height,'Frame height');
    if(size.width!==width || size.height%height) throw new Error('Save the native texture before updating its animation metadata.');
    const root=isFile(fs,session.metadata)?readJSON(fs,session.metadata):{};
    if(!isObject(root)) throw new Error('Texture metadata must be an object.');
    const animation={...(isObject(root.animation)?root.animation:{}),width,height,frametime:positive(info.frametime,'Frame time'),interpolate:!!info.interpolate};
    if(info.timingsDirty) {
        const order=timingOrder(info.timings,size.height/height);
        if(order===null) delete animation.frames;else animation.frames=order;
    }
    else if(resetFrames || info.frameOrder===null) delete animation.frames;
    else if(Array.isArray(info.frameOrder)) animation.frames=info.frameOrder;
    const metadata={...root,animation};stripLayout(fs.readFileSync(texture),metadata);
    writeBundle(fs,[[session.metadata,JSON.stringify(metadata,null,2)+'\n']]);
    session.rootMetadata=metadata;session.saveNativeState(info);
    Object.assign(session.state,{width,height,frametime:String(animation.frametime),interpolate:animation.interpolate,dirty:false,error:'',status:'Native texture animation metadata saved.'});
    if(session.options.saved) session.options.saved();
    return true;
}

function indexOfFrame(frame) {return isObject(frame)?frame.index:frame;}
function withFrameExtras(order,reference) {
    if(!Array.isArray(order) || !Array.isArray(reference)) return order;
    const queues=new Map();
    for(const frame of reference) {const index=indexOfFrame(frame);if(!queues.has(index)) queues.set(index,[]);queues.get(index).push(frame);}
    return order.map(frame=>{
        const old=queues.get(indexOfFrame(frame))?.shift();
        if(!isObject(old)) return frame;
        const merged={...old,index:indexOfFrame(frame)};delete merged.time;
        if(isObject(frame) && frame.time!==undefined) merged.time=frame.time;
        return merged;
    });
}
function remapNativeTimings(order,rows,oldCount,newCount) {
    if(!Array.isArray(order)) return null;
    if(!Array.isArray(rows)) rows=Array.from({length:newCount},(_,index)=>({initial_index:index<oldCount?index:undefined}));
    const natural=order.length===oldCount && order.every((frame,index)=>indexOfFrame(frame)===index);
    const copy=(frame,index)=>isObject(frame)?{...frame,index}:index;
    let result;
    if(natural) result=rows.map((row,index)=>copy(order[row.initial_index],index));
    else {
        const first=new Map(),added=[];
        rows.forEach((row,index)=>{
            if(!Number.isInteger(row.initial_index) || row.initial_index<0 || row.initial_index>=oldCount || first.has(row.initial_index)) added.push({row,index});
            else first.set(row.initial_index,index);
        });
        result=order.filter(frame=>first.has(indexOfFrame(frame))).map(frame=>copy(frame,first.get(indexOfFrame(frame))));
        for(const {row,index} of added) result.push(copy(order.find(frame=>indexOfFrame(frame)===row.initial_index),index));
        if(!result.length) result=rows.map((_row,index)=>index);
    }
    return result.length===newCount && result.every((frame,index)=>frame===index)?null:result;
}
class NativeAnimations {
    constructor(environment={}) { this.environment=environment;this.records=new Set();this.waits=new Set();this.wrappers=[];this.disposed=false;this.bound=false; }
    get(name) { return this.environment[name] || globalThis[name]; }
    bind() {
        const blockbench=this.get('Blockbench');
        if(!this.bound && blockbench && typeof blockbench.on==='function') { this.changed=()=>this.capture();blockbench.on('finish_edit',this.changed);this.bound=true; }
    }
    info(record) {
        const {texture,project}=record,active=this.get('Project'),format=this.get('Format');
        if(active!==project) return record.info;
        const width=texture.canvas?.width || texture.width;
        const uvWidth=typeof texture.getUVWidth==='function'?texture.getUVWidth():width;
        const uvHeight=typeof texture.getUVHeight==='function'?texture.getUVHeight():record.info.height;
        const height=Math.round(width*uvHeight/uvWidth);
        const frametime=format?.texture_mcmeta ? texture.frame_time : Math.max(1,Math.round(20/(texture.fps || 20/record.info.frametime)));
        const info={width,height,frametime,interpolate:!!texture.frame_interpolate};
        if(typeof texture.getAnimationFrameIndices==='function') info.frameOrder=withFrameExtras(texture.getAnimationFrameIndices(),record.sequenceOverride || record.session.rootMetadata.animation?.frames) || null;
        else if(record.sequenceOverride!==undefined) info.frameOrder=record.sequenceOverride;
        return info;
    }
    applySessionSettings(session) {
        const frames=session.rootMetadata.animation?.frames;
        for(const record of this.records) {
            if(record.session!==session) continue;
            const texture=record.texture;
            texture.fps=20/Number(session.state.frametime);texture.frame_time=Number(session.state.frametime);texture.frame_interpolate=session.state.interpolate;
            texture.frame_order_type=Array.isArray(frames)?'custom':'loop';
            texture.frame_order=Array.isArray(frames)?frames.map(frame=>isObject(frame)?frame.time===undefined?frame.index:frame.index+':'+frame.time:frame).join(' '):'';
            record.info={...record.info,frametime:Number(session.state.frametime),interpolate:session.state.interpolate,frameOrder:frames || null};
            record.observed=JSON.stringify(record.info);record.pending=false;record.resetFrames=false;record.sequenceOverride=frames || null;
        }
    }
    canDuplicateCurrentFrame() {
        const texture=this.get('Project') && this.get('Texture')?.selected;
        return !!(this.get('Format')?.animated_textures && texture?.canvas?.width && texture.canvas.height && !this.get('Dialog')?.open);
    }
    duplicateCurrentFrame(session=null) {
        const project=this.get('Project'),texture=this.get('Texture')?.selected,format=this.get('Format');
        if(!project || !texture?.canvas || !format?.animated_textures) throw new Error('Select a texture in a model that supports flipbook animation.');
        if(texture.layers_enabled) throw new Error('Merge the texture layers before duplicating a flipbook frame.');
        const width=texture.canvas.width,totalHeight=texture.canvas.height;
        const uvWidth=texture.getUVWidth(),uvHeight=texture.getUVHeight();
        const height=Math.round(width*uvHeight/uvWidth),count=totalHeight/height;
        if(!Number.isSafeInteger(height) || height<1 || !Number.isSafeInteger(count) || count<1) throw new Error('Set the flipbook frame dimensions before duplicating a frame.');
        if(count>=256 || totalHeight+height>16384 || width*(totalHeight+height)>16777216) throw new Error('The new frame would exceed the animation size limit.');
        const index=Number.isInteger(texture.currentFrame)?Math.max(0,Math.min(texture.currentFrame,count-1)):0;
        const document=this.get('document'),Undo=this.get('Undo');
        if(!document || !Undo) throw new Error('The native paint tools are unavailable.');
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=totalHeight+height;
        const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;
        context.drawImage(texture.canvas,0,0);
        context.drawImage(texture.canvas,0,index*height,width,height,0,totalHeight,width,height);
        const animator=this.get('TextureAnimator');if(animator?.isPlaying) animator.stop();
        Undo.initEdit({textures:[texture],bitmap:true});
        if(texture.frame_order_type==='custom') {
            const tokens=String(texture.frame_order || '').trim().split(/\s+/).filter(Boolean);
            const token=tokens.find(token=>Number(token.split(':')[0])===index),duration=token && token.includes(':')?token.split(':')[1]:'';
            texture.frame_order=[...tokens,String(count)+(duration?':'+duration:'')].join(' ');
        }
        texture.canvas.height=totalHeight+height;
        (texture.ctx || texture.canvas.getContext('2d')).drawImage(canvas,0,0);
        texture.width=width;texture.height=totalHeight+height;texture.currentFrame=count;
        texture.updateChangesAfterEdit();texture.select();
        Undo.finishEdit('Duplicate current texture frame');
        if(typeof animator?.update==='function') animator.update([texture]);
        const uv=this.get('UVEditor');if(uv?.vue && typeof uv.vue.updateTexture==='function') uv.vue.updateTexture();
        let record=[...this.records].find(record=>record.texture===texture);
        if(!record && session) {
            record={texture,project,session,info:{width,height,frametime:Number(session.state.frametime),interpolate:session.state.interpolate},same:(a,b)=>session.paths.path.resolve(a)===session.paths.path.resolve(b)};
            this.records.add(record);this.bind();
        }
        if(record) {record.info=this.info(record);record.observed=JSON.stringify(record.info);record.pending=true;record.resetFrames=false;}
        return {index:count,count:count+1};
    }
    capture() {
        for(const record of this.records) {
            try {
                const info=this.info(record),signature=JSON.stringify(info);
                if(signature!==record.observed) {record.info=info;record.observed=signature;record.pending=true;}
            } catch(error) {this.report(record,error);}
        }
    }
    report(record,error) {
        const message=error.message || String(error),changed=record.session.state.error!==message;
        record.session.state.error=message;
        if(changed && record.session.options.error) record.session.options.error(message);
    }
    poll() {
        if(this.disposed) return;
        this.capture();
        for(const record of this.records) {
            if(record.session.state.dirty) continue;
            if(!record.pending || record.texture.saved!==true) {this.forgetClosed(record);continue;}
            if(record.same && !record.same(record.texture.path,record.session.texture)) {this.report(record,new Error('Save the texture to its original skin path before updating metadata.'));this.forgetClosed(record);continue;}
            try {saveNativeMetadata(record.session,record.info,record.resetFrames);record.pending=false;record.resetFrames=false;}
            catch(error) {this.report(record,error);}
            this.forgetClosed(record);
        }
    }
    forgetClosed(record) {
        const projects=this.get('ModelProject');
        if(projects && Array.isArray(projects.all) && !projects.all.includes(record.project)) this.records.delete(record);
    }
    wait(texturePath,same) {
        return new Promise((resolve,reject)=>{
            let timer,elapsed=0;
            const finish=value=>{clearTimeout(timer);this.waits.delete(cancel);resolve(value);};
            const cancel=()=>finish(null);this.waits.add(cancel);
            const check=()=>{
                if(this.disposed) return finish(null);
                const project=this.get('Project'),TextureClass=this.get('Texture');
                const texture=project && TextureClass && TextureClass.all.find(texture=>same(texture.path,texturePath));
                if(texture && texture.canvas?.width && texture.canvas?.height && (!texture.img || (texture.img.complete && texture.img.naturalWidth))) return finish({texture,project});
                if(elapsed>=120000) {this.waits.delete(cancel);reject(new Error('Select the model geometry, then reopen the Flipbook Editor.'));return;}
                elapsed+=100;timer=setTimeout(check,100);
            };check();
        });
    }
    async open(session,same) {
        const TextureClass=this.get('Texture');
        const known=this.get('Project') && TextureClass && TextureClass.all.find(texture=>same(texture.path,session.texture));
        if(known && known.saved===false) throw new Error('Save the open texture before opening its Flipbook Editor.');
        if(known && typeof known.fromPath==='function') known.fromPath(session.texture);
        const result=await this.wait(session.texture,same);if(!result || this.disposed) return false;
        const {texture,project}=result,format=this.get('Format'),action=this.get('BarItems')?.animated_texture_editor;
        if(!format?.animated_textures || !action || typeof action.click!=='function') throw new Error('The native Flipbook Editor is unavailable for this model format.');
        const size=pngSize(session.fs.readFileSync(session.texture));
        if(texture.saved===false) throw new Error('Save the open texture before opening its Flipbook Editor.');
        const width=size.width,height=Number(session.state.height),frametime=Number(session.state.frametime);
        if(width!==Number(session.state.width) || size.height%height) throw new Error('Import this strip with its frame dimensions before opening the native editor.');
        // Bedrock models support flipbook display, but do not write Java-style .mcmeta themselves.
        if(format.per_texture_uv_size) { texture.uv_width=width;texture.uv_height=height; }
        else project.texture_height=project.texture_width*height/width;
        texture.frame_time=frametime;texture.fps=20/frametime;texture.frame_interpolate=!!session.state.interpolate;
        const root=session.rootMetadata.animation || {};
        texture.frame_order_type=Array.isArray(root.frames)?'custom':'loop';
        texture.frame_order=Array.isArray(root.frames)?root.frames.map(frame=>isObject(frame)?frame.time===undefined?frame.index:frame.index+':'+frame.time:frame).join(' '):'';
        texture.select();
        let record=[...this.records].find(record=>record.texture===texture);
        const info={width,height,frametime,interpolate:!!session.state.interpolate};
        if(!record) {record={texture,project,session,info,pending:false,resetFrames:false};this.records.add(record);}
        record.sequenceOverride=undefined;record.same=same;record.session=session;record.info=info;record.info=this.info(record);record.observed=JSON.stringify(record.info);this.bind();
        action.click();
        const editor=this.get('TextureAnimator')?.editor_dialog;
        if(editor && typeof editor.onConfirm==='function') {
            const original=editor.onConfirm,originalCancel=editor.onCancel,self=this;
            const wrapped=async function(...args) {
                try {
                    const previous=record.session.rootMetadata.animation?.frames,oldCount=Math.round(texture.canvas.height/record.info.height);
                    const rows=Array.isArray(this.content_vue?.frames)?this.content_vue.frames.map(frame=>({initial_index:frame.initial_index})):null;
                    const result=await original.apply(this,args);
                    if(result!==false && !self.disposed) {
                        const stride=Number(this.content_vue?.stride) || record.info.height;
                        const order=remapNativeTimings(previous,rows,oldCount,Math.round(texture.canvas.height/stride));
                        texture.frame_order_type=order?'custom':'loop';
                        texture.frame_order=order?order.map(frame=>isObject(frame)?frame.time===undefined?frame.index:frame.index+':'+frame.time:frame).join(' '):'';
                        record.sequenceOverride=order;
                        record.info=self.info(record);
                        if(stride>0) record.info.height=stride;
                        record.info.width=texture.canvas.width;
                        record.observed=JSON.stringify(record.info);record.pending=true;record.resetFrames=false;
                        self.poll();
                    }
                    return result;
                } catch(error) {self.report(record,error);return false;}
                finally {restore();}
            };
            const cancel=function(...args) {const result=typeof originalCancel==='function'?originalCancel.apply(this,args):undefined;if(result!==false) restore();return result;};
            const restore=()=>{
                if(editor.onConfirm===wrapped) editor.onConfirm=original;
                if(editor.onCancel===cancel) editor.onCancel=originalCancel;
                const index=self.wrappers.indexOf(restore);if(index>=0) self.wrappers.splice(index,1);
            };
            editor.onConfirm=wrapped;editor.onCancel=cancel;this.wrappers.push(restore);
        }
        return true;
    }
    dispose() {
        this.disposed=true;this.waits.forEach(cancel=>cancel());this.waits.clear();
        const blockbench=this.get('Blockbench');if(this.bound && blockbench && typeof blockbench.removeListener==='function') blockbench.removeListener('finish_edit',this.changed);
        this.wrappers.slice().forEach(restore=>restore());this.wrappers=[];this.records.clear();
    }
}
module.exports={NativeAnimations,saveNativeMetadata,remapNativeTimings};
