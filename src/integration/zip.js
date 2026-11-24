'use strict';
const {crc32,safeEntry} = require('../gunpacks/archive');
const MAX_ZIP_BYTES=512*1024*1024,MAX_SOURCE_BYTES=1024*1024*1024;
function join(parts,length=parts.reduce((sum,part)=>sum+part.length,0)) {const output=new Uint8Array(length);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length;}return output;}
async function createZip(entries,deflate,progress=()=>{},canceled=()=>false) {
    if(entries.length>65000)throw new Error('This pack has too many files for a standard ZIP.');
    const chunks=[],central=[],names=new Set(),encoder=new TextEncoder();let offset=0,sourceBytes=0;
    for(let index=0;index<entries.length;index++) {
        if(canceled())throw new Error('Export canceled.');
        const entry=entries[index];if(!safeEntry(entry.name) || names.has(entry.name))throw new Error('Unsafe or duplicate ZIP path: '+entry.name);names.add(entry.name);
        const name=encoder.encode(entry.name);if(name.length>65535)throw new Error('ZIP filename is too long.');
        const bytes=await entry.read();sourceBytes+=bytes.length;
        if(sourceBytes>MAX_SOURCE_BYTES)throw new Error('Pack source files exceed the 1 GB export limit.');
        const compressed=deflate(bytes),payload=compressed.length<bytes.length?compressed:bytes,method=payload===bytes?0:8,crc=crc32(bytes);
        const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(8,method,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,payload.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,name.length,true);header.set(name,30);
        const record=new Uint8Array(46+name.length),r=new DataView(record.buffer);r.setUint32(0,0x02014b50,true);r.setUint16(4,0x314,true);r.setUint16(6,20,true);r.setUint16(8,0x800,true);r.setUint16(10,method,true);r.setUint16(14,33,true);r.setUint32(16,crc,true);r.setUint32(20,payload.length,true);r.setUint32(24,bytes.length,true);r.setUint16(28,name.length,true);r.setUint32(38,0o100644*65536,true);r.setUint32(42,offset,true);record.set(name,46);
        chunks.push(header,payload);central.push(record);offset+=header.length+payload.length;
        if(offset>MAX_ZIP_BYTES)throw new Error('Compressed pack exceeds the 512 MB export limit.');
        progress(index+1,entries.length,entry.name);if(index%8===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    const directory=join(central),end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,entries.length,true);view.setUint16(10,entries.length,true);view.setUint32(12,directory.length,true);view.setUint32(16,offset,true);
    if(canceled())throw new Error('Export canceled.');
    if(offset+directory.length+22>MAX_ZIP_BYTES)throw new Error('Compressed pack exceeds the 512 MB export limit.');
    return join([...chunks,directory,end]);
}
module.exports={createZip};
