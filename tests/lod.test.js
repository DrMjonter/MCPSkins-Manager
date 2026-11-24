'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {PackPaths}=require('../src/domain/paths');
const {planLOD,writeLOD,lodStatus}=require('../src/assets/lod');
const {duplicateAssets}=require('../src/assets/preparation');
const {modelKey}=require('../src/gunpacks/catalog');
function fixture(t) {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcpskins-lod-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const paths=new PackPaths(path,root,'Pack','example'),draft={weapon:'tacz:uzi',kind:'gun',id:'uzi_copper',label:'Copper'},folder=paths.textures(draft.weapon);
    const write=(file,bytes)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof bytes==='string'||Buffer.isBuffer(bytes)?bytes:JSON.stringify(bytes));};
    const png=(width=256,height=256)=>{const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);return bytes;};
    const geometry={'minecraft:geometry':[{description:{identifier:'geometry.uzi',texture_width:256,texture_height:256},bones:[{name:'body',cubes:[{uv:[10,20],origin:[0,0,0],size:[1,2,3]}]}]}]};
    const model=path.join(folder,draft.id+'.geo.json');write(model,geometry);write(path.join(folder,draft.id+'.png'),png());
    return {paths,draft,folder,write,png,geometry,model};
}
test('LOD generation uses the required double underscore name and copies the full model, painted textures, maps and animation metadata',t=>{
    const f=fixture(t);
    for(const suffix of ['','_n','_s']){f.write(path.join(f.folder,f.draft.id+suffix+'.png'),f.png(256,512));f.write(path.join(f.folder,f.draft.id+suffix+'.png.mcmeta'),{animation:{frametime:3}});}
    const plan=planLOD(fs,f.paths,f.draft);writeLOD(fs,f.paths,plan.files);
    const model=path.join(f.paths.pack,'assets/tacz/geo_models/gun/lod/uzi__skin_uzi_copper.json');
    assert.equal(plan.files[0][0],model);assert.deepEqual(JSON.parse(fs.readFileSync(model,'utf8')),f.geometry);
    for(const suffix of ['','_n','_s']) {
        const full=path.join(f.folder,f.draft.id+suffix+'.png'),lod=path.join(f.folder,f.draft.id+'_lod'+suffix+'.png');
        assert.deepEqual(fs.readFileSync(lod),fs.readFileSync(full));assert.deepEqual(fs.readFileSync(lod+'.mcmeta'),fs.readFileSync(full+'.mcmeta'));
    }
    assert.deepEqual(lodStatus(fs,f.paths,f.draft).map(row=>row.status),['valid','valid']);
});
test('LOD status distinguishes missing, invalid and valid files and generation follows a custom source LOD reference',t=>{
    const f=fixture(t);assert.deepEqual(lodStatus(fs,f.paths,f.draft).map(row=>row.status),['missing','missing']);
    const source={lodModelRef:'custom:gun/lod/uzi_custom',modelRef:'custom:gun/full/uzi'};
    const plan=planLOD(fs,f.paths,f.draft,source);f.paths.lodReferences={[modelKey(f.draft.weapon)]:'custom:gun/lod/uzi_custom'};
    assert.ok(plan.files[0][0].endsWith(path.join('assets/custom/geo_models/gun/lod/uzi_custom__skin_uzi_copper.json')));
    f.write(plan.files[0][0],'{broken');f.write(path.join(f.folder,'uzi_copper_lod.png'),'bad PNG');
    assert.deepEqual(lodStatus(fs,f.paths,f.draft).map(row=>row.status),['invalid','invalid']);
    writeLOD(fs,f.paths,plan.files);assert.deepEqual(lodStatus(fs,f.paths,f.draft).map(row=>row.status),['valid','valid']);
    assert.throws(()=>planLOD(fs,f.paths,f.draft,{lodModelRef:null}),/does not define an LOD/);
});
test('LOD generation validates all inputs before writing and rolls back failures, including metadata removal',t=>{
    const f=fixture(t),output=path.join(f.folder,'uzi_copper_lod.png'),metadata=output+'.mcmeta';f.write(output,f.png());f.write(metadata,{animation:{frametime:5}});
    const plan=planLOD(fs,f.paths,f.draft);assert.ok(plan.files.some(([file,bytes])=>file===metadata && bytes===null));
    const failing=Object.create(fs);failing.renameSync=(from,to)=>{if(to===output)throw new Error('Disk full');fs.renameSync(from,to);};
    assert.throws(()=>writeLOD(failing,f.paths,plan.files),/Disk full/);assert.equal(fs.existsSync(plan.files[0][0]),false);assert.ok(fs.existsSync(metadata));
    writeLOD(fs,f.paths,plan.files);assert.equal(fs.existsSync(metadata),false);
    f.write(path.join(f.folder,'uzi_copper_s.png'),'corrupt');assert.throws(()=>planLOD(fs,f.paths,f.draft),/Invalid PNG/);
    f.write(f.model,{bad:true});assert.throws(()=>planLOD(fs,f.paths,f.draft),/Bedrock geometry/);
});
test('duplicating a skin keeps generated LOD models and maps independent',t=>{
    const f=fixture(t),plan=planLOD(fs,f.paths,f.draft);f.write(path.join(f.folder,'uzi_copper_s.png'),f.png());
    writeLOD(fs,f.paths,planLOD(fs,f.paths,f.draft).files);f.paths.lodReferences={[modelKey(f.draft.weapon)]:plan.reference};
    const target={...f.draft,id:'uzi_other'};duplicateAssets(fs,f.paths,f.draft,target);
    assert.deepEqual(fs.readFileSync(path.join(f.folder,'uzi_other_lod_s.png')),fs.readFileSync(path.join(f.folder,'uzi_copper_lod_s.png')));
    assert.ok(fs.existsSync(path.join(f.paths.pack,'assets/tacz/geo_models/gun/lod/uzi__skin_uzi_other.json')));
});


test('LOD output works with Blockbench scoped filesystem methods without lstatSync',t=>{
    const f=fixture(t),scoped={};
    for(const method of ['readFileSync','writeFileSync','existsSync','mkdirSync','readdirSync','renameSync','unlinkSync','statSync'])scoped[method]=fs[method].bind(fs);
    const plan=planLOD(scoped,f.paths,f.draft);writeLOD(scoped,f.paths,plan.files);
    assert.deepEqual(lodStatus(scoped,f.paths,f.draft).map(row=>row.status),['valid','valid']);
});
