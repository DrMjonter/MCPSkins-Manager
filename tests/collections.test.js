'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {PackPaths} = require('../src/domain/paths');
const {defaultRarities} = require('../src/domain/rarities');
const {caseDraft, buildCase, effectiveCase, caseOdds} = require('../src/domain/collections');
const {CollectionRepository, scanCollections, collectionIssues} = require('../src/storage/collections');
const {CollectionEditor} = require('../src/state/collections');
const {checkPack} = require('../src/assets/health');
function setup(t) {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcpskins-collections-'));
    t.after(() => fs.rmSync(root,{recursive:true,force:true}));
    const paths=new PackPaths(path,root,'Pack','example'), repository=new CollectionRepository(fs,paths);
    const write=(relative,data) => {const filename=path.join(paths.pack,relative);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,JSON.stringify(data));return filename;};
    const registry=write('data/example/skins/glock_17_skins.json',{base_gun:'tacz:glock_17',author:'Registry author',custom:9,skins:[
        {id:'glock_a',name:'Glock | A',collection:'Test',rarity:'common',weight:1,description:'A',label_color:'#FFFFFF'},
        {id:'glock_b',name:'Glock | B',collection:'Test',rarity:'common',weight:3,description:'B',label_color:'#FFFFFF'},
        {id:'glock_c',name:'Glock | C',collection:'Test',rarity:'rare',description:'C',label_color:'#FFFFFF'}]});
    return {paths,repository,write,registry};
}
test('case settings inherit wildcard defaults and merge weights/exclusions without materializing them',t => {
    const {repository,write}=setup(t);
    write('data/other/collection_cases/global.json',{collection:'*',price:240,requiresKey:false,rarity_weights:{rare:20},excluded_skins:['glock_c']});
    const scan=repository.scan(), row=scan.rows.find(row=>row.key==='test');
    const draft=caseDraft(row,defaultRarities()); draft.title='Test Case';
    const result=repository.save(draft,row,scan), saved=JSON.parse(fs.readFileSync(result.filename,'utf8'));
    assert.deepEqual(saved,{collection:'Test',title:'Test Case'});
    const settings=effectiveCase(scan.definitions.get('*')[0].data,saved);
    assert.equal(settings.price,240);assert.equal(settings.requiresKey,false);assert.equal(settings.rarity_weights.common,55);assert.equal(settings.rarity_weights.rare,20);
    assert.deepEqual(settings.excluded_skins,['glock_c']);
});
test('odds normalize eligible tiers and use skin weights, exclusions, custom rarities and zero weights',() => {
    const skins=[{id:'a',rarity:'common',weight:1},{id:'b',rarity:'common',weight:3},{id:'c',rarity:'rare'},{id:'d',rarity:'mythic'},{id:'default:tacz:gun',rarity:'common'}];
    const settings=effectiveCase({},{rarity_weights:{common:60,rare:20,mythic:20,legendary:100}});
    const odds=caseOdds(skins,settings);
    assert.equal(odds.eligible,4);assert.equal(odds.total,100);
    assert.ok(Math.abs(odds.tiers[0].skins[0].chance-0.15)<1e-12);assert.ok(Math.abs(odds.tiers[0].skins[1].chance-0.45)<1e-12);
    assert.equal(odds.tiers[2].chance,0.2);
    settings.excluded_skins=['c'];settings.rarity_weights.mythic=0;
    const reduced=caseOdds(skins,settings);assert.equal(reduced.total,60);assert.equal(reduced.eligible,2);assert.equal(reduced.tiers[0].chance,1);
    assert.equal(caseOdds([] ,settings).total,0);
});
test('case fields validate and preserve unknown metadata, including zero price and explicit false',t => {
    const {repository}=setup(t),scan=repository.scan(),row=scan.rows.find(row=>row.key==='test');
    row.data={collection:'Test',future:{keep:true}};
    const draft=caseDraft(row,defaultRarities());Object.assign(draft,{price:'0',requiresKey:'false',case_color:'#123456',shop_icon:'example:textures/gui/case.png',exclusions:'glock_a, glock_c\nglock_a'});
    const data=buildCase(draft,row.data);assert.equal(data.price,0);assert.equal(data.requiresKey,false);assert.deepEqual(data.future,{keep:true});assert.deepEqual(data.excluded_skins,['glock_a','glock_c']);
    for(const price of ['-1','2.5','2147483648','Infinity']) assert.throws(()=>buildCase({...draft,price},{}));
    assert.throws(()=>buildCase({...draft,case_color:'#FFF'},{}));assert.throws(()=>buildCase({...draft,shop_icon:'Bad Icon.png'},{}));
});
test('renaming a collection updates all namespace registries and keeps unrelated metadata',t => {
    const {repository,write,registry}=setup(t);
    const other=write('data/other/skins/melee.json',{base_melee:'lrtactical:karambit',skins:[{id:'knife_a',collection:'test',name:'Knife',future:42}]});
    const definition=write('data/other/collection_cases/case.json',{collection:'Test',description:'Case description',future:{keep:true}});
    const scan=repository.scan(),row=scan.rows.find(row=>row.key==='test'),draft=caseDraft(row,defaultRarities());draft.collection='Renamed';
    const result=repository.save(draft,row,scan);assert.equal(result.renamed,true);assert.equal(result.filename,definition);
    const first=JSON.parse(fs.readFileSync(registry,'utf8'));assert.equal(first.author,'Registry author');assert.equal(first.custom,9);assert.ok(first.skins.every(skin=>skin.collection==='Renamed'));
    const second=JSON.parse(fs.readFileSync(other,'utf8'));assert.equal(second.skins[0].collection,'Renamed');assert.equal(second.skins[0].future,42);
    assert.deepEqual(JSON.parse(fs.readFileSync(definition,'utf8')).future,{keep:true});
});
test('stale files, duplicate definitions and collection collisions fail without writing',t => {
    const {repository,write,registry}=setup(t);
    const file=write('data/example/collection_cases/test.json',{collection:'Test',price:100});
    let scan=repository.scan(),row=scan.rows.find(row=>row.key==='test'),draft=caseDraft(row,defaultRarities());draft.price='200';
    fs.writeFileSync(file,JSON.stringify({collection:'Test',price:300}));assert.throws(()=>repository.save(draft,row,scan),/changed on disk/);
    write('data/other/collection_cases/duplicate.json',{collection:'TEST'});
    scan=repository.scan();row=scan.rows.find(row=>row.key==='test');assert.throws(()=>repository.save(caseDraft(row,defaultRarities()),row,scan),/duplicate/);
    fs.unlinkSync(path.join(repository.paths.pack,'data/other/collection_cases/duplicate.json'));
    write('data/example/collection_cases/other.json',{collection:'Other'});
    scan=repository.scan();row=scan.rows.find(row=>row.key==='test');draft=caseDraft(row,defaultRarities());draft.collection='Other';assert.throws(()=>repository.save(draft,row,scan),/already exists/);
    draft.collection='Renamed';const before=fs.readFileSync(registry,'utf8');const raw=JSON.parse(before);raw.skins[0].name='Edited elsewhere';fs.writeFileSync(registry,JSON.stringify(raw));
    assert.throws(()=>repository.save(draft,row,scan),/changed on disk/);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).collection,'Test');
});
test('collection rename restores already-written registries if another write fails',t => {
    const {repository,write,registry,paths}=setup(t);
    const definition=write('data/example/collection_cases/test.json',{collection:'Test'}),before=JSON.parse(fs.readFileSync(registry,'utf8'));
    const scan=repository.scan(),row=scan.rows.find(row=>row.key==='test'),draft=caseDraft(row,defaultRarities());draft.collection='Renamed';
    const failing=Object.create(fs);failing.renameSync=(from,to)=>{if(to===definition)throw new Error('Disk full');fs.renameSync(from,to);};
    assert.throws(()=>new CollectionRepository(failing,paths).save(draft,row,scan),/Disk full/);
    assert.deepEqual(JSON.parse(fs.readFileSync(registry,'utf8')),before);assert.equal(JSON.parse(fs.readFileSync(definition,'utf8')).collection,'Test');
});
test('collection scan and live health flag invalid files, missing exclusions and no eligible rewards',t => {
    const {repository,write,paths}=setup(t);
    write('data/example/collection_cases/test.json',{collection:'Test',rarity_weights:{common:0,rare:0},excluded_skins:['missing_skin']});
    write('data/example/collection_cases/broken.json',{collection:'Broken',price:-1});
    const scan=repository.scan(),issues=collectionIssues(scan);
    assert.ok(issues.some(issue=>issue.message.includes('no eligible rewards')));assert.ok(issues.some(issue=>issue.message.includes('missing_skin')));assert.ok(issues.some(issue=>issue.severity==='error' && issue.message.includes('Price')));
    const health=checkPack(fs,paths);assert.ok(health.issues.some(issue=>issue.message.includes('no eligible rewards')));
});
test('collection editor protects unsaved edits and refuses saves after the pack changes',async t => {
    const {repository}=setup(t);let choice='cancel',active=true,saved=0;
    const editor=new CollectionEditor(repository,defaultRarities(),async()=>choice,()=>saved++,()=>active);
    await editor.select('test');editor.edit('title','Test Case');assert.equal(await editor.select('*'),false);assert.equal(editor.state.selectedKey,'test');
    choice='save';assert.equal(await editor.select('*'),true);assert.equal(saved,1);assert.equal(editor.state.selectedKey,'*');
    editor.edit('price','400');active=false;assert.equal(editor.save(),false);assert.match(editor.state.error,/pack changed/);
    choice='discard';let closed=false;assert.equal(await editor.guard(()=>{closed=true;}),true);assert.equal(closed,true);
});
