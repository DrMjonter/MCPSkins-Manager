'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {RegistryRepository}=require('../src/storage/registry');
const {PackPaths}=require('../src/domain/paths');
const {emptyDraft}=require('../src/domain/skin');
const {deleteSkin,skinFiles}=require('../src/storage/delete-skin');
const {modelKey,modelOutput}=require('../src/gunpacks/catalog');
const {saveStatuses}=require('../src/domain/status');
function fixture(t) {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcpskins-delete-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const paths=new PackPaths(path,root,'Pack','example'),repository=new RegistryRepository(fs,paths);
    for(const id of ['ak47_root','ak47_blue','ak47_other']) repository.save({...emptyDraft(),weapon:'tacz:ak47',id,label:id,collection:'Test',description:'Test'});
    const file=paths.registry('tacz:ak47'),folder=paths.textures('tacz:ak47');
    const write=(filename,value='asset')=>{fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,typeof value==='string'?value:JSON.stringify(value));return filename;};
    const read=()=>JSON.parse(fs.readFileSync(file,'utf8'));
    const row=id=>repository.discover().rows.find(row=>row.skin.id===id);
    return {paths,repository,file,folder,write,read,row};
}
test('Delete Entry preserves assets and unknown registry fields while clearing variant links, level rewards and status',t=>{
    const f=fixture(t),data=f.read();data.author='Team';data.future={keep:true};
    data.skins[0].variants=['ak47_blue'];data.skins[0].levels=[{variant:'ak47_blue',requires:{kills:5},unknown:9}];
    f.write(f.file,data);const row=f.row('ak47_blue');saveStatuses(fs,f.paths,[row],'complete');
    const texture=f.write(path.join(f.folder,'ak47_blue.png'));
    deleteSkin(f.repository,row,false);
    const saved=f.read();assert.equal(saved.skins.length,2);assert.equal(saved.author,'Team');assert.deepEqual(saved.future,{keep:true});
    assert.deepEqual(saved.skins[0].variants,[]);assert.deepEqual(saved.skins[0].levels,[]);assert.equal(fs.readFileSync(texture,'utf8'),'asset');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.paths.pack,'mcpskins_manager.json'),'utf8')).skin_statuses,{});
});
test('Full Delete removes only skin-specific assets, model overrides, animations and frame workspaces',t=>{
    const f=fixture(t),id='ak47_blue',owned=[];
    for(const suffix of ['', '_n','_s','_icon','_hud','_hud_empty','_lod','_lod_n','_lod_s']) {
        owned.push(f.write(path.join(f.folder,id+suffix+'.png')),f.write(path.join(f.folder,id+suffix+'.png.mcmeta'),'{}'));
        owned.push(f.write(path.join(f.folder,id+suffix+'_frames','animation.json'),'{}'),f.write(path.join(f.folder,id+suffix+'_frames',id+suffix+'_1.png')));
    }
    owned.push(f.write(path.join(f.folder,id+'.geo.json')));
    f.paths.modelReferences={[modelKey('tacz:ak47')]:'tacz:gun/ak47_geo'};
    owned.push(f.write(modelOutput(f.paths,'tacz:gun/ak47_geo',id)),f.write(modelOutput(f.paths,'tacz:gun/lod/ak47',id)));
    owned.push(f.write(path.join(f.paths.pack,'assets/mcpskins/animations/skins/tacz/ak47',id+'.animation.json')));
    const base=f.write(path.join(f.folder,'ak47.png'),'shared default'),other=f.write(path.join(f.folder,'ak47_other.png'),'other skin');
    const result=deleteSkin(f.repository,f.row(id),true);assert.equal(result.files.length,owned.length);
    for(const filename of owned) assert.equal(fs.existsSync(filename),false,filename);
    assert.equal(fs.readFileSync(base,'utf8'),'shared default');assert.equal(fs.readFileSync(other,'utf8'),'other skin');assert.equal(f.read().skins.length,2);
    assert.equal(fs.existsSync(path.join(f.folder,id+'_frames')),false);
    assert.deepEqual(fs.readdirSync(path.join(f.paths.pack,'.mcpskins_manager/deletions')),[]);
});
test('deleting a root keeps its variants, and the last entry leaves a valid empty registry',t=>{
    const f=fixture(t),data=f.read();data.skins[0].variants=['ak47_blue'];f.write(f.file,data);
    deleteSkin(f.repository,f.row('ak47_root'));assert.ok(f.row('ak47_blue'));
    deleteSkin(f.repository,f.row('ak47_blue'));deleteSkin(f.repository,f.row('ak47_other'));
    assert.equal(f.read().base_gun,'tacz:ak47');assert.deepEqual(f.read().skins,[]);
});
test('stale rows, shared IDs and default asset names cannot be fully deleted',t=>{
    const f=fixture(t),old=f.row('ak47_blue'),data=f.read();data.skins[1].name='Changed';f.write(f.file,data);
    assert.throws(()=>deleteSkin(f.repository,old),/changed on disk/);
    const duplicate=path.join(f.paths.pack,'data/other/skins/duplicate.json');f.write(duplicate,{base_gun:'tacz:uzi',skins:[{id:'ak47_blue',name:'Other'}]});
    assert.throws(()=>deleteSkin(f.repository,f.row('ak47_blue'),true),/Another skin/);
    fs.unlinkSync(duplicate);
    const fresh=f.read();fresh.skins[1].id='ak47_n';f.write(f.file,fresh);
    assert.throws(()=>deleteSkin(f.repository,f.row('ak47_n'),true),/default weapon asset/);
    assert.equal(f.read().skins.length,3);
});
test('Full Delete restores staged assets when registry saving fails and preserves occupied temp files',t=>{
    const f=fixture(t),row=f.row('ak47_blue'),original=fs.readFileSync(f.file,'utf8');
    const texture=f.write(path.join(f.folder,'ak47_blue.png'),'painted'),occupied=f.write(f.file+'.tmp','occupied');
    assert.throws(()=>deleteSkin(f.repository,row,true),/EEXIST/);
    assert.equal(fs.readFileSync(f.file,'utf8'),original);assert.equal(fs.readFileSync(texture,'utf8'),'painted');assert.equal(fs.readFileSync(occupied,'utf8'),'occupied');
});
test('Full Delete restores registry and assets if metadata saving fails',t=>{
    const f=fixture(t),row=f.row('ak47_blue');saveStatuses(fs,f.paths,[row],'wip');
    const before=f.read(),texture=f.write(path.join(f.folder,'ak47_blue.png'),'painted');
    f.write(path.join(f.paths.pack,'mcpskins_manager.json.tmp'),'occupied');
    assert.throws(()=>deleteSkin(f.repository,row,true),/EEXIST/);
    assert.deepEqual(f.read(),before);assert.equal(fs.readFileSync(texture,'utf8'),'painted');
});
test('Full Delete rejects symbolic links in owned workspaces without touching their targets',t=>{
    const f=fixture(t),outside=path.join(f.paths.root,'external'),workspace=path.join(f.folder,'ak47_blue_frames');fs.mkdirSync(outside);f.write(path.join(outside,'keep.txt'),'keep');fs.mkdirSync(f.folder,{recursive:true});
    fs.symlinkSync(outside,workspace,'junction');
    assert.throws(()=>skinFiles(fs,f.paths,f.row('ak47_blue')),/symbolic links/);assert.equal(fs.readFileSync(path.join(outside,'keep.txt'),'utf8'),'keep');assert.equal(f.read().skins.length,3);
});


test('Delete Entry and Full Delete work with the scoped filesystem methods Blockbench exposes',t=>{
    const f=fixture(t),scoped={};
    for(const method of ['readFileSync','writeFileSync','existsSync','mkdirSync','readdirSync','renameSync','rmdirSync','unlinkSync','statSync'])scoped[method]=fs[method].bind(fs);
    assert.equal(scoped.lstatSync,undefined);assert.equal(scoped.realpathSync,undefined);
    const repository=new RegistryRepository(scoped,f.paths);
    deleteSkin(repository,f.row('ak47_other'),false);assert.equal(f.read().skins.length,2);
    const texture=f.write(path.join(f.folder,'ak47_blue.png'),'painted');
    deleteSkin(repository,f.row('ak47_blue'),true);assert.equal(fs.existsSync(texture),false);assert.equal(f.read().skins.length,1);
    const external=path.join(f.paths.root,'outside');fs.mkdirSync(external);f.write(path.join(external,'keep.txt'),'keep');
    const workspace=path.join(f.folder,'ak47_root_frames');fs.mkdirSync(f.folder,{recursive:true});fs.symlinkSync(external,workspace,'junction');
    assert.throws(()=>deleteSkin(repository,f.row('ak47_root'),true),/symbolic links/);assert.equal(fs.readFileSync(path.join(external,'keep.txt'),'utf8'),'keep');
});
