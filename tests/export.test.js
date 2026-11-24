'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const {PackPaths}=require('../src/domain/paths');
const {exportInventory,runtimePlan,exportFilename,validateFilename}=require('../src/assets/pack-export');
const {ExportSelection}=require('../src/state/export');
const {createZip}=require('../src/integration/zip');
const {ArchiveCache,ZipPack}=require('../src/gunpacks/archive');
const {statusKey}=require('../src/domain/status');
function fixture(t) {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcpskins-export-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const paths=new PackPaths(path,root,'Pack','example');
    const write=(name,data)=>{const file=path.join(paths.pack,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof data==='string'?data:JSON.stringify(data));return file;};
    const data={base_gun:'tacz:ak47',author:'Registry Artist',future:{keep:true},skins:[
        {id:'ak47_red',name:'Red',collection:'First',rarity:'rare',variants:['ak47_blue'],levels:[{variant:'ak47_blue',requires:{kills:10}}],future:42},
        {id:'ak47_blue',name:'Blue',collection:'First',rarity:'common'},
        {id:'ak47_green',name:'Green',collection:'Second',rarity:'epic'}]};
    const registry=write('data/example/skins/ak47.json',data);
    for(const id of ['ak47_red','ak47_blue','ak47_green'])write('assets/mcpskins/textures/skins/tacz/ak47/'+id+'.png','pixels '+id);
    write('mcpskins_manager.json',{title:'My Pack',author:'Team'});
    return {root,paths,write,registry,data};
}
function names(plan){return plan.entries.map(entry=>entry.name);}
test('clean export filters registry entries, prunes excluded variant links, and preserves unknown metadata without modifying source',t=>{
    const f=fixture(t),before=fs.readFileSync(f.registry,'utf8'),inventory=exportInventory(fs,f.paths);
    const row=inventory.rows.find(row=>row.skin.id==='ak47_red'),plan=runtimePlan(inventory,[row.key]);
    const exported=JSON.parse(new TextDecoder().decode(plan.entries.find(entry=>entry.name==='data/example/skins/ak47.json').read()));
    assert.equal(exported.author,'Registry Artist');assert.deepEqual(exported.future,{keep:true});assert.equal(exported.skins.length,1);assert.equal(exported.skins[0].future,42);assert.deepEqual(exported.skins[0].variants,[]);assert.deepEqual(exported.skins[0].levels,[]);
    assert.ok(names(plan).includes('assets/mcpskins/textures/skins/tacz/ak47/ak47_red.png'));assert.equal(names(plan).some(name=>name.endsWith('ak47_blue.png')),false);
    assert.equal(fs.readFileSync(f.registry,'utf8'),before);assert.equal(fs.existsSync(path.join(f.paths.pack,'assets/mcpskins/textures/skins/tacz/ak47/ak47_blue.png')),true);
});
test('clean export keeps runtime assets, PBR for auxiliary textures, animation data, rarities, languages and Collection Cases resources',t=>{
    const f=fixture(t),base='assets/mcpskins/textures/skins/tacz/ak47/ak47_red';
    for(const suffix of ['_n','_s','_icon','_icon_n','_icon_s','_hud','_hud_n','_hud_empty','_hud_empty_s','_lod','_lod_n'])f.write(base+suffix+'.png','map');
    f.write(base+'.png.mcmeta',{animation:{frametime:2}});f.write(base+'_icon_n.png.mcmeta',{animation:{frametime:3}});
    const kept=[
        'assets/tacz/geo_models/gun/ak47_geo__skin_ak47_red.json',
        'assets/tacz/geo_models/gun/lod/ak47__skin_ak47_red.json',
        'assets/mcpskins/animations/skins/tacz/ak47/ak47_red.animation.json',
        'data/example/skin_rarities/mythic.json','data/example/skin_lang/en_us.json',
        'data/example/collection_cases/first.json','data/example/shop_tabs/tools.json','data/example/shop_entries/torch.json'];
    for(const name of kept)f.write(name,name.includes('collection_cases')?{collection:'First',shop_icon:'example:textures/gui/case.png'}:name.includes('shop_entries')?{item:'minecraft:torch',price:8}:{});
    f.write('assets/example/textures/gui/case.png','case icon');
    for(const name of [base+'.geo.json',base+'.bbmodel',base+'_hud_lod.png',base+'_frames/animation.json',base+'_frames/ak47_red_1.png','assets/example/textures/unused.png','project.bbmodel'])f.write(name,'project data');
    const inventory=exportInventory(fs,f.paths),plan=runtimePlan(inventory,[inventory.rows[0].key]),included=names(plan);
    for(const name of kept)assert.ok(included.includes(name),name);
    assert.ok(included.includes(base+'_icon_n.png'));assert.ok(included.includes(base+'_icon_n.png.mcmeta'));assert.ok(included.includes('assets/example/textures/gui/case.png'));
    for(const name of [base+'.geo.json',base+'.bbmodel',base+'_hud_lod.png',base+'_frames/animation.json',base+'_frames/ak47_red_1.png','assets/example/textures/unused.png','project.bbmodel','mcpskins_manager.json'])assert.equal(included.includes(name),false,name);
});
test('selection controls include and exclude collections, statuses and individuals with mixed groups',t=>{
    const f=fixture(t);let inventory=exportInventory(fs,f.paths);const metadata={skin_statuses:{[statusKey(f.paths,inventory.rows[0])]:'wip',[statusKey(f.paths,inventory.rows[1])]:'planned'}};
    inventory=exportInventory(fs,f.paths,metadata);const selection=new ExportSelection(inventory,{title:'My Pack',author:'Team'});
    assert.equal(selection.state.selected.length,3);selection.all(false);
    selection.toggle(selection.groups('collection').find(group=>group.label==='First').rows,true);assert.equal(selection.state.selected.length,2);
    selection.toggle(selection.groups('status').find(group=>group.label==='WIP').rows,false);assert.deepEqual(selection.state.selected,[inventory.rows[1].key]);
    selection.toggle([inventory.rows[2]],true);assert.equal(selection.state.selected.length,2);
    assert.deepEqual(selection.groups('status').map(group=>group.label),['Unassigned','Planned','WIP']);
    assert.equal(selection.state.filename,'My Pack_Team_1.0.0.zip');selection.version('2.0.0');assert.equal(selection.state.filename,'My Pack_Team_2.0.0.zip');
    selection.state.filename='Custom.zip';selection.version('3');assert.equal(selection.state.filename,'Custom.zip');
});
test('ZIPs include UTF-8 names, compressed contents and full project files with valid CRCs',async t=>{
    const f=fixture(t);f.write('notes/project.bbmodel','project '.repeat(300));f.write('notes/readme.txt','Full backup');f.write('notes/caf\u00e9.txt','UTF-8 filename');
    const inventory=exportInventory(fs,f.paths),zip=await createZip([...inventory.files.values()],zlib.deflateRawSync);
    const output=path.join(f.root,'export.zip');fs.writeFileSync(output,zip);
    const pack=new ZipPack(new ArchiveCache(fs),output,zlib.inflateRawSync);
    assert.equal(pack.entries.size,inventory.files.size);assert.equal(pack.read('notes/project.bbmodel').toString(),'project '.repeat(300));assert.equal(pack.read('notes/caf\u00e9.txt').toString(),'UTF-8 filename');
    assert.ok(pack.read('mcpskins_manager.json'));assert.ok(pack.read('data/example/skins/ak47.json'));
    assert.equal([...pack.entries.keys()].some(name=>name.startsWith('Pack/')),false);
});
test('export refuses unsafe paths, stale files, duplicate selected IDs and broken runtime JSON',async t=>{
    const f=fixture(t),inventory=exportInventory(fs,f.paths);
    assert.throws(()=>runtimePlan(inventory,[]),/Select at least one/);
    f.write('data/example/skin_rarities/bad.json','{broken');const broken=exportInventory(fs,f.paths);
    assert.throws(()=>runtimePlan(broken,[broken.rows[0].key]),/Invalid runtime data/);
    f.write('data/example/skins/other.json',{base_gun:'tacz:uzi',skins:[{id:'ak47_red',name:'Duplicate'}]});
    const duplicate=exportInventory(fs,f.paths);assert.throws(()=>runtimePlan(duplicate,duplicate.rows.map(row=>row.key)),/duplicate ID/);
    f.write('data/example/skins/broken.json','{broken');const invalid=exportInventory(fs,f.paths);assert.ok(invalid.errors.length);assert.throws(()=>runtimePlan(invalid,invalid.rows.map(row=>row.key)),/unreadable skin registries/);
    fs.writeFileSync(f.registry,'changed on disk');assert.throws(()=>inventory.files.get('data/example/skins/ak47.json').read(),/changed/);
    await assert.rejects(()=>createZip([{name:'../escape',read:()=>new Uint8Array()}],zlib.deflateRawSync),/Unsafe/);
    await assert.rejects(()=>createZip([],zlib.deflateRawSync,()=>{},()=>true),/canceled/);
    assert.throws(()=>validateFilename('../bad.zip'),/valid ZIP filename/);assert.equal(validateFilename('Nice Name'),'Nice Name.zip');assert.equal(exportFilename('My/Pack','Team:Name','1.0'),'My_Pack_Team_Name_1.0.zip');
});
