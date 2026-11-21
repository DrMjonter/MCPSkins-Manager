'use strict';
const {pngSize}=require('../assets/animation');
function canvasRaster(environment={}) {
    const doc=environment.document || document, ImageClass=environment.Image || Image;
    const load=bytes=>new Promise((resolve,reject)=>{
        pngSize(bytes);
        const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'})), image=new ImageClass();
        image.onload=()=>{ URL.revokeObjectURL(url); resolve(image); };
        image.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error('Could not decode a PNG frame.')); }; image.src=url;
    });
    const canvas=(width,height)=>{ const value=doc.createElement('canvas'); value.width=width; value.height=height; if(!value.getContext('2d')) throw new Error('Canvas image processing is unavailable.'); return value; };
    const encode=value=>{ const raw=atob(value.toDataURL('image/png').split(',')[1]); return Uint8Array.from(raw,char=>char.charCodeAt(0)); };
    return {
        async stitch(frames,size) {
            const output=canvas(size.width,size.height*frames.length), context=output.getContext('2d'); context.imageSmoothingEnabled=false;
            for(let i=0;i<frames.length;i++) context.drawImage(await load(frames[i]),0,i*size.height);
            return encode(output);
        },
        async split(bytes,layout) {
            const image=await load(bytes), output=canvas(layout.width,layout.height), context=output.getContext('2d'); context.imageSmoothingEnabled=false;
            return layout.frames.map(frame=>{
                context.clearRect(0,0,layout.width,layout.height);
                context.drawImage(image,(frame.index%layout.columns)*layout.width,Math.floor(frame.index/layout.columns)*layout.height,layout.width,layout.height,0,0,layout.width,layout.height);
                return encode(output);
            });
        }
    };
}
module.exports={canvasRaster};
