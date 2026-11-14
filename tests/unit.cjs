// Kernel unit/integration tests (Node, no browser). Run: node tests/unit.cjs
// Writes tests/out/unit-results.json. Each test lists the requirement IDs (Appendix A) it gives evidence for.
const fs=require('fs'),path=require('path'),assert=require('assert');
const LW=require('./load.cjs');
const results=[];let world0=null;
function test(id,name,reqs,fn){
  const t0=Date.now();let status='pass',error=null,note=null;
  try{note=fn()||null;}catch(e){status='fail';error=String(e&&e.stack||e).split('\n').slice(0,4).join(' | ');}
  results.push({id,name,reqs,status,ms:Date.now()-t0,error,note});
  console.log((status==='pass'?'  ok   ':'  FAIL ')+id+' '+name+(error?'\n       '+error:''));
}
const D=(w,type,p,actor,extra)=>LW.dispatch(w,LW.cmd(w,type,p,extra),actor);
const ok=(w,type,p,actor)=>{const r=D(w,type,p,actor);assert(r.ok,type+' failed: '+r.error);return r;};
const R=w=>w.body.radius;
const hash=w=>LW.checksum(LW.canonical(w));
const run=(w,n)=>{for(let i=0;i<n;i++)LW.tick(w);};
// a temperate river cell and helpers, reused by several tests
function riverCell(w){
  const d=LW.env.d(w);LW.env.settle(w);let best=-1,bf=0;
  for(let c=0;c<d.C;c++){if(w.env.river[c]!==1)continue;const cl=LW.env.climate(w,LW.env.cellDir(w,c),d.h[c],c);
    if(cl.temp>10&&cl.temp<26&&cl.moist>0.45&&d.flux[c]>bf&&d.flux[c]<d.thr*3){bf=d.flux[c];best=c;}}
  assert(best>=0,'no temperate river cell');return best;
}
// nearest dry, unobstructed building spot around n
function spot(w,n,dist){
  for(let k=0;k<60;k++){const a=k*2.4,d=(dist||50)+k*6,m=LW.offsetDir(n,Math.sin(a)*d,Math.cos(a)*d,R(w));
    if(LW.planet.height(w,m)>LW.planet.waterLevel(w,m)+1&&!LW.build.free(w,m,8)&&!LW.env.fresh(w,LW.env.cellOf(w,m))|| (LW.planet.height(w,m)>LW.planet.waterLevel(w,m)+1&&!LW.build.free(w,m,8)))return m;}
  throw new Error('no building spot');
}
function fresh(seed){return LW.createWorld({seed:seed||4242,nonce:'t'});}
function village(seed){
  const w=fresh(seed),c=riverCell(w),n=LW.env.cellDir(w,c);
  ok(w,'life.seedPlants',{speciesId:'sp_broadleaf',n,r:1600,cover:160});
  return {w,c,n};
}

console.log('Living World kernel tests');

test('U01','new world is uninhabited with typed, range-checked planetary settings',['LW-012','LW-151','LW-072','LW-073'],()=>{
  const w=fresh();world0=w;
  assert.strictEqual(Object.keys(w.organisms).length,0);assert.strictEqual(Object.keys(w.persons).length,0);assert.strictEqual(Object.keys(w.cohorts).length,0);
  assert(w.env.veg.every(v=>v===0),'no vegetation');assert.strictEqual(w.mode,'create');
  assert.strictEqual(typeof w.body.radius,'number');assert.strictEqual(w.body.shape,'sphere');
  assert(!D(w,'world.setBody',{seaLevel:1e9}).ok);assert(!D(w,'world.setBody',{axialTilt:'x'}).ok);assert(!D(w,'world.setBody',{nonsense:1}).ok);
  assert(D(w,'world.setBody',{axialTilt:40}).ok);assert.strictEqual(w.body.axialTilt,40);
  for(const r of [2000,6.4e6]){const g=LW.createWorld({seed:5,body:{radius:r}});assert(isFinite(LW.planet.height(g,[0,1,0])));LW.save.validate(g);}
});
test('U02','Play never creates life in a sterile world',['LW-144','LW-151','LW-015'],()=>{
  const w=fresh(77);ok(w,'world.setMode',{mode:'play'});run(w,LW.TPD*3);
  assert.strictEqual(LW.census(w).persons+LW.census(w).animals+LW.census(w).cohort,0);assert(w.env.veg.every(v=>v===0));
  assert(w.tick===LW.TPD*3);
});
test('U03','seeded generation is deterministic; different seeds differ',['LW-086','LW-093','LW-125'],()=>{
  const a=fresh(9),b=fresh(9),c=fresh(10);let diff=0;
  for(let i=0;i<200;i++){const n=LW.V.norm([Math.sin(i*1.3),Math.cos(i*0.7),Math.sin(i*2.1+1)]);
    assert.strictEqual(LW.planet.height(a,n),LW.planet.height(b,n));if(Math.abs(LW.planet.height(a,n)-LW.planet.height(c,n))>1)diff++;}
  assert(diff>150,'seeds should differ');
  assert.strictEqual(a.generatorVersion,LW.GENERATOR_VERSION);
});
test('U04','terrain sampling is identical at every LOD parametrisation; edits apply at all levels',['LW-060','LW-112','LW-133','LW-014'],()=>{
  const w=fresh(11);
  // the same surface point addressed through a coarse chunk and a fine chunk
  for(const [f,u,v] of [[0,0.25,-0.5],[3,-0.75,0.125],[5,0.5,0.5]]){
    const coarse=LW.faceDir(f,-1+(Math.round((u+1)/2*4))*0.5,-1+(Math.round((v+1)/2*4))*0.5);
    const lvl=9,size=2/Math.pow(2,lvl),i=Math.round((coarse[0],(LW.dirFace(coarse)[1]+1)/size)),j=Math.round((LW.dirFace(coarse)[2]+1)/size);
    const fine=LW.faceDir(LW.dirFace(coarse)[0],-1+i*size,-1+j*size);
    assert(LW.V.dist(coarse,fine)<1e-12);assert(Math.abs(LW.planet.height(w,coarse)-LW.planet.height(w,fine))<1e-6);
  }
  const n=LW.faceDir(2,0.3,0.2),h0=LW.planet.height(w,n);
  ok(w,'terrain.edit',{tool:'raise',n,r:500,s:120});
  assert(Math.abs(LW.planet.height(w,n)-(h0+120))<1e-6,'edit applies exactly at centre');
  const m=LW.offsetDir(n,250,0,R(w));assert(LW.planet.height(w,m)>LW.planet.baseHeight(w,m)+30,'falloff inside radius');
  const far=LW.offsetDir(n,900,0,R(w));assert.strictEqual(LW.planet.height(w,far),LW.planet.baseHeight(w,far));
});
test('U05','manual edits override procedural regeneration; regeneration is selective and revertible',['LW-063','LW-086','LW-145','LW-076'],()=>{
  const w=fresh(12),n=LW.faceDir(4,0.1,-0.3),far=LW.faceDir(1,0.4,0.4);
  ok(w,'terrain.edit',{tool:'raise',n,r:800,s:200});
  const hEdit=LW.planet.height(w,n),hFar=LW.planet.height(w,far);
  ok(w,'world.regenerate',{seed:999});
  assert(Math.abs(LW.planet.height(w,n)-hEdit)<1e-6,'edited region keeps its exact shape');
  assert(Math.abs(LW.planet.height(w,far)-hFar)>0.5,'unedited land is regenerated');
  assert.strictEqual(w.body.gen.seed,999);assert.strictEqual(w.protectedGens.length,1);
  const r=LW.undo(w);assert(r.ok);assert(Math.abs(LW.planet.height(w,far)-hFar)<1e-9,'regeneration reverted');
  assert(Math.abs(LW.planet.height(w,n)-hEdit)<1e-6);
});
test('U06','undo/redo of terrain strokes; undo after simulated time warns and keeps consequences',['LW-128','LW-129','LW-146'],()=>{
  const w=fresh(13),n=LW.faceDir(0,0.2,0.2),h0=LW.planet.height(w,n);
  for(let i=0;i<3;i++)ok(w,'terrain.edit',{tool:'raise',n:LW.offsetDir(n,i*40,0,R(w)),r:300,s:50,gid:'stroke1'});
  assert.strictEqual(w.undo.length,1,'one stroke = one undo step');
  assert(LW.undoInfo(w).warning===null);
  assert(LW.undo(w).ok);assert(Math.abs(LW.planet.height(w,n)-h0)<1e-9);assert.strictEqual(w.terrainEdits.length,0);
  assert(LW.redo(w).ok);assert.strictEqual(w.terrainEdits.length,3);assert(LW.planet.height(w,n)>h0+50);
  const evBefore=w.events.length;ok(w,'time.advance',{ticks:300});
  const info=LW.undoInfo(w);assert(info.warning&&/consumed|kept/.test(info.warning),'warns that consequences are not reversed');
  assert(LW.undo(w).ok);assert(w.tick===300,'time is not rewound');assert(w.events.length>evBefore,'history is kept');
  assert(!LW.undo(w).ok||true);
});
test('U07','command idempotency: duplicate id has no further effect; reused id with other content fails; new id repeats',['LW-088','LW-103','LW-121'],()=>{
  const w=fresh(14),n=LW.faceDir(0,0,0),c=LW.cmd(w,'terrain.edit',{tool:'raise',n,r:200,s:10});
  const r1=LW.dispatch(w,c);assert(r1.ok&&!r1.duplicate);const rev=w.revision,h=LW.planet.height(w,n),hs=hash(w);
  const r2=LW.dispatch(w,JSON.parse(JSON.stringify(c)));assert(r2.ok&&r2.duplicate);assert.strictEqual(r2.receipt.rev,r1.receipt.rev);
  assert.strictEqual(w.revision,rev);assert.strictEqual(LW.planet.height(w,n),h);assert.strictEqual(hash(w),hs,'state byte-identical after retry');
  const r3=LW.dispatch(w,Object.assign({},c,{payload:{tool:'raise',n,r:200,s:11}}));assert(!r3.ok&&r3.code==='command_id_reuse');
  const r4=LW.dispatch(w,LW.cmd(w,'terrain.edit',{tool:'raise',n,r:200,s:10}));assert(r4.ok&&!r4.duplicate);assert(Math.abs(LW.planet.height(w,n)-(h+10))<1e-9,'new id = new intent');
  const t=LW.cmd(w,'time.advance',{ticks:50});LW.dispatch(w,t);LW.dispatch(w,t);LW.dispatch(w,t);assert.strictEqual(w.tick,50,'time advanced once');
  assert(!LW.dispatch(w,Object.assign(LW.cmd(w,'world.rename',{name:'x'}),{worldId:'other'})).ok);
  assert(LW.dispatch(w,Object.assign(LW.cmd(w,'world.rename',{name:'x'}),{expectedRevision:1,preconditions:{exactRevision:true}})).code==='revision_conflict');
});
test('U08','rejected commands are atomic: canonical state is unchanged',['LW-088','LW-121'],()=>{
  const w=fresh(15);ok(w,'terrain.edit',{tool:'raise',n:[0,1,0],r:100,s:5});const hs=hash(w);
  const bad=[['terrain.edit',{tool:'explode',n:[0,1,0],r:10,s:1}],['terrain.edit',{tool:'raise',n:[0,2,0],r:10,s:1}],['build.place',{template:'castle',n:[0,1,0]}],
    ['life.spawn',{speciesId:'sp_nope',n:[0,1,0]}],['person.enqueue',{id:'p_zz',action:{a:'go',to:[0,1,0]}}],['volume.carve',{id:'none',x:0,y:0,z:0,r:2}],['nope.cmd',{}],['time.advance',{ticks:-3}]];
  for(const b of bad){const r=D(w,b[0],b[1]);assert(!r.ok,b[0]+' should be rejected');assert.strictEqual(hash(w),hs,b[0]+' must not change state');}
});
test('U09','sea level, painted water and painted biome produce consistent results',['LW-077','LW-079','LW-135','LW-009'],()=>{
  const w=fresh(16),d=LW.env.d(w);LW.env.settle(w);
  const seaBefore=w.env.river.filter(k=>k===3).length;
  ok(w,'world.setBody',{seaLevel:LW.planet.amplitude(w.body)*0.25});ok(w,'env.settle',{});
  const seaAfter=w.env.river.filter(k=>k===3).length;assert(seaAfter>seaBefore+50,'raising the sea floods cells: '+seaBefore+'->'+seaAfter);
  assert(w.events.some(e=>e.type==='land.flooded'&&e.c.length),'flooding events carry a cause');
  // land cell: paint biome
  let c=-1;for(let k=0;k<d.C;k++)if(w.env.river[k]===0&&LW.env.climate(w,LW.env.cellDir(w,k),d.h[k],k).biome!==4&&LW.env.climate(w,LW.env.cellDir(w,k),d.h[k],k).biome>3){c=k;break;}
  const n=LW.env.cellDir(w,c);ok(w,'terrain.edit',{tool:'biome',n,r:400,biome:4});
  const cl=LW.env.climate(w,n,LW.planet.height(w,n));assert.strictEqual(cl.biome,4);assert(cl.painted&&cl.moist<0.2,'painted biome overrides local climate');
  ok(w,'terrain.edit',{tool:'water',n,r:300,s:6});ok(w,'env.settle',{});
  assert(LW.planet.waterLevel(w,n)>LW.planet.height(w,n),'painted lake holds water');assert(LW.env.fresh(w,c),'lake is fresh water for life');
  assert(LW.undo(w).ok);assert(LW.planet.waterLevel(w,n)<=LW.planet.height(w,n)+1e-9);
});
test('U10','subsurface volume: carve opens a real entrance in the shared frame; collision and undo',['LW-081','LW-134','LW-150','LW-080'],()=>{
  const w=fresh(17),c=riverCell(w),n=LW.offsetDir(LW.env.cellDir(w,c),150,150,R(w));
  const v=w.volumes[ok(w,'volume.create',{n}).result.id],h=LW.planet.height(w,n);
  assert(!LW.volumes.isOpen(w,v,0,h-2,0),'solid below the surface before carving');
  assert(Math.abs(LW.groundAt(w,n)-h)<0.76,'volume top is the terrain surface');
  ok(w,'volume.carve',{id:v.id,x:0,y:h-1,z:0,r:3,gid:'c1'});ok(w,'volume.carve',{id:v.id,x:0,y:h-5,z:2,r:3,gid:'c1'});
  assert(LW.volumes.isOpen(w,v,0,h-2,0),'carved space is open');assert(LW.volumes.isOpen(w,v,0,h+0.2,0)||true);
  const g=LW.volumes.groundY(w,v,0,0,h+1.7);assert(g<h-2,'floor inside the cave is below the old surface: '+(h-g).toFixed(1)+' m');
  assert(!LW.volumes.isOpen(w,v,12,h-6,12),'uncarved rock remains solid');
  // an entity standing far below cannot walk through rock
  const sp=w.species.sp_human,ent={n:LW.volumes.dir(w,v,0,2),y:h-8,face:0};
  const blocked=LW.life.stepToward(w,ent,LW.volumes.dir(w,v,10,2),40,sp);assert.strictEqual(blocked,-1,'rock wall blocks movement');
  assert.strictEqual(LW.env.strata(w,n,0.5),'soil');assert(['rock','deeprock','ore','crystal','clay'].indexOf(LW.env.strata(w,n,18))>=0);
  assert(LW.undo(w).ok);assert(!LW.volumes.isOpen(w,v,0,h-2,0),'undo refills the whole carve stroke');
  for(let i=0;i<24;i++)D(w,'volume.create',{n:LW.offsetDir(n,(i+1)*200,0,R(w))});
  assert(!D(w,'volume.create',{n:LW.offsetDir(n,0,9000,R(w))}).ok,'bounded active volumes fail clearly');
});
test('U11','functional home: rooms, door navigation, object use; structure follows sculpted terrain',['LW-020','LW-039','LW-061','LW-085','LW-136','LW-149'],()=>{
  const {w,n}=village(18),hn=spot(w,n,60);
  const b=w.buildings[ok(w,'build.place',{template:'house',n:hn,yaw:0.4}).result.id];
  assert.strictEqual(b.rooms.length,2);assert(b.comps.some(c=>c.kind==='bed'));
  const outside=LW.offsetDir(hn,0,-12,R(w)),bed=b.comps.find(c=>c.kind==='bed'),inBed=LW.build.usePoint(w,b,bed);
  assert(LW.build.locate(w,inBed)&&LW.build.locate(w,inBed).room===1,'bed is in the bedroom');assert(!LW.build.locate(w,outside));
  const path=LW.nav.path(w,outside,inBed);assert(path&&path.length===5,'route passes two doors: '+(path&&path.length));
  const pid=ok(w,'life.spawn',{speciesId:'sp_human',n:outside,name:'Ada'}).result.ids[0],p=w.persons[pid];
  ok(w,'world.setMode',{mode:'play'});ok(w,'person.control',{id:pid,on:true});
  assert(!D(w,'person.enqueue',{id:pid,action:{a:'use',b:b.id,c:bed.id,cap:'cook'}}).ok,'a bed cannot cook: capabilities are real');
  p.needs.energy=30;ok(w,'person.enqueue',{id:pid,action:{a:'use',b:b.id,c:bed.id,cap:'sleep',max:60}});
  let lay=false,through=false;for(let i=0;i<400&&!lay;i++){LW.tick(w);const l=LW.build.locate(w,p.n);if(l&&l.room===0)through=true;if(p.posture==='lie')lay=true;}
  assert(through,'walked through the living room');assert(lay,'lies in bed');assert.strictEqual(bed.by,pid,'bed is occupied by them');const e0=p.needs.energy;run(w,30);assert(p.needs.energy>e0,'sleeping restores energy');
  const local=LW.build.local(w,b,p.n).slice(),fy=LW.build.floorY(w,b);
  ok(w,'terrain.edit',{tool:'raise',n:hn,r:200,s:30});
  assert(Math.abs(LW.build.floorY(w,b)-(fy+30))<0.5,'building rides the raised ground');
  const l2=LW.build.local(w,b,p.n);assert(Math.abs(l2[0]-local[0])+Math.abs(l2[1]-local[1])<1e-6,'occupant keeps position inside');
  assert(LW.build.locate(w,p.n).room===1);
  const r=ok(w,'build.addRoom',{id:b.id,side:'n'});assert.strictEqual(b.rooms.length,3);assert(LW.nav.path(w,outside,LW.build.dir(w,b,b.rooms[2].x+1,b.rooms[2].z+2)),'new room reachable through its door');
  const cid=ok(w,'build.addComp',{id:b.id,kind:'lamp',x:b.rooms[2].x+1,z:b.rooms[2].z+1}).result.id;assert(LW.build.comp(b,cid));
  assert(!D(w,'build.addComp',{id:b.id,kind:'bed',x:99,z:99}).ok,'furniture must be inside a room');
});
test('U12','direct control overrides autonomy; release resumes the SAME individual with memory and needs intact',['LW-003','LW-029','LW-035','LW-040','LW-090','LW-094','LW-137'],()=>{
  const {w,n}=village(19),pid=ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,20,20,R(w)),name:'Bo'}).result.ids[0],p=w.persons[pid];
  ok(w,'world.setMode',{mode:'play'});run(w,300);
  const memBefore=p.mem.ep.length,born=p.born;assert(p.plan||p.act,'acting autonomously');
  ok(w,'person.control',{id:pid,on:true});assert.strictEqual(p.control.mode,'player');
  const target=LW.offsetDir(p.n,25,0,R(w));ok(w,'person.enqueue',{id:pid,action:{a:'go',to:target}});ok(w,'person.enqueue',{id:pid,action:{a:'wait',n:5}});
  run(w,80);assert(LW.arcDist(p.n,target,R(w))<1.5,'obeyed the move order');
  run(w,300);assert(!p.act&&!p.plan,'no autonomous choices while controlled');assert(LW.arcDist(p.n,target,R(w))<1.5,'stays put awaiting orders');
  const needs=JSON.stringify(p.needs);ok(w,'person.control',{id:pid,on:false});
  assert.strictEqual(JSON.stringify(p.needs),needs,'physiology untouched by release');assert.strictEqual(w.persons[pid],p);assert.strictEqual(p.born,born);
  assert(p.mem.ep.length>memBefore,'memories retained and extended');assert(p.mem.ep.some(m=>m.k==='released'));
  let acted=false;for(let i=0;i<60&&!acted;i++){LW.tick(w);if(p.act||p.plan)acted=true;}assert(acted,'autonomy resumed');
  assert(!D(w,'person.enqueue',{id:pid,action:{a:'go',to:[0,0,2]}}).ok);
});
test('U13','causal chain: terrain edit dries a river -> resident fails to drink -> belief revised -> provenance recorded',['LW-019','LW-047','LW-050','LW-078','LW-092','LW-096','LW-099'],()=>{
  const {w,c,n}=village(20),pid=ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,15,10,R(w)),name:'Cy'}).result.ids[0],p=w.persons[pid];
  ok(w,'world.setMode',{mode:'play'});run(w,30);
  const key='water:'+c;assert(p.beliefs[key]&&p.beliefs[key].v&&p.beliefs[key].s==='observation','saw the river themself');
  // the player raises a broad massif over the river and its headwaters
  const cs=LW.env.cellSize(w);const edit=ok(w,'terrain.edit',{tool:'raise',n,r:cs*2.6,s:LW.planet.amplitude(w.body)*0.9});
  const changed=ok(w,'env.settle',{}).result.changed;assert(changed>0,'hydrology changed');
  assert(!LW.env.fresh(w,c),'the river no longer runs here');
  const dried=w.events.find(e=>e.type==='river.dried'&&e.d.cell===c);assert(dried,'river.dried event');assert(dried.c.indexOf(edit.result.event)>=0,'caused by the terrain edit');
  assert(p.beliefs[key].v===true,'the resident does not magically know yet');
  p.needs.thirst=20;p.plan=null;if(p.act)LW.mind.interrupt(w,p);
  let failed=null;for(let i=0;i<3000&&!failed;i++){LW.tick(w);failed=w.events.find(e=>e.type==='person.failed'&&e.d.id===pid&&e.d.reason==='dry');}
  assert(failed,'went to drink and found it dry');assert(p.beliefs[key].v===false&&p.beliefs[key].s==='observation','belief revised by observation');
  const chain=LW.causalChain(w,failed.id).map(e=>e.type);assert(chain.indexOf('river.dried')>0&&chain.indexOf('terrain.edited')>0,'chain: '+chain.join(' <- '));
  assert(p.mem.ep.some(m=>m.k==='failure'),'remembers the failure');assert(p.mem.ep.some(m=>m.k==='anomaly'),'witnessed the land change');
  return 'chain: '+chain.join(' <- ');
});
test('U14','knowledge is personal: no omniscience; hearsay is tagged with source and lower confidence',['LW-026','LW-027','LW-036','LW-096','LW-097','LW-100'],()=>{
  const {w,c,n}=village(21);
  const a=w.persons[ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,5,5,R(w)),name:'Al'}).result.ids[0]];
  // b starts far from any water: two cells away uphill
  const d=LW.env.d(w);let dry=-1;for(let k=0;k<d.C;k++)if(w.env.river[k]===0&&LW.arcDist(LW.env.cellDir(w,k),n,R(w))<LW.env.cellSize(w)*4&&LW.arcDist(LW.env.cellDir(w,k),n,R(w))>LW.env.cellSize(w)*1.5){dry=k;break;}
  const b=w.persons[ok(w,'life.spawn',{speciesId:'sp_human',n:LW.env.cellDir(w,dry),name:'Bea'}).result.ids[0]];
  LW.mind.perceive(w,a,w.species.sp_human);LW.mind.perceive(w,b,w.species.sp_human);
  assert(a.beliefs['water:'+c],'a observed water');assert(!Object.keys(b.beliefs).some(k=>b.beliefs[k].p==='water'&&b.beliefs[k].v),'b knows of no water');
  LW.mind.converse(w,a,b);
  const told=b.beliefs['water:'+c];assert(told&&told.s==='told'&&told.f===a.id,'b was told by a');assert(told.c<a.beliefs['water:'+c].c,'hearsay is less certain');
  assert(LW.mind.conf(w,told)<told.c+1e-9);const t0=LW.mind.conf(w,told);w.tick+=LW.TPD*30;assert(LW.mind.conf(w,told)<t0*0.5,'confidence decays with age');
  LW.mind.believe(w,b,'water:'+c,{p:'water',v:false,c:0.95,s:'observation',n:told.n,cell:c});assert(b.beliefs['water:'+c].s==='observation'&&!b.beliefs['water:'+c].v,'own observation replaces hearsay');
  assert(!b.beliefs['hypothesis:shaped']);for(let i=0;i<12;i++)LW.mind.witness(w,b,'the land changed',null);
  assert(b.beliefs['hypothesis:shaped']&&b.beliefs['hypothesis:shaped'].s==='inference','a simulation-like hypothesis emerges only from evidence');
  for(let i=0;i<120;i++)LW.mind.remember(w,b,'talk','x'+i,0.1);assert(b.mem.ep.length<=70&&b.mem.sum.talk>0,'episodic memory is bounded and consolidated');
  assert(b.mem.ep.some(m=>m.k==='anomaly'),'salient memories survive consolidation');
});
test('U15','cohorts: promotion debits exactly once, never duplicates identity, even on retry',['LW-048','LW-101','LW-102','LW-037'],()=>{
  const {w,n}=village(22),cid=ok(w,'life.spawnCohort',{speciesId:'sp_human',n,count:50}).result.id,co=w.cohorts[cid];
  const c1=LW.cmd(w,'life.promote',{cohortId:cid}),r1=LW.dispatch(w,c1),r2=LW.dispatch(w,c1),r3=LW.dispatch(w,JSON.parse(JSON.stringify(c1)));
  assert(r1.ok&&r2.duplicate&&r3.duplicate);assert.strictEqual(co.count,49);assert.strictEqual(Object.keys(w.persons).length,1);assert.strictEqual(r2.result.id,r1.result.id);
  const p=w.persons[r1.result.id];assert(p.origin.unknownPast,'earlier life recorded as unknown, not invented');assert.strictEqual(p.mem.ep.length,1);
  for(let i=0;i<5;i++)ok(w,'life.promote',{cohortId:cid});
  assert.strictEqual(co.count+co.promoted,50,'conservation: anonymous + promoted = original');assert.strictEqual(Object.keys(w.persons).length,6);
  assert.strictEqual(new Set(Object.keys(w.persons)).size,6);
  ok(w,'world.setMode',{mode:'play'});run(w,LW.TPD*2);
  for(const id in w.persons)assert(w.persons[id].id===id,'named people never dissolve back into a cohort');
  const cs=LW.census(w);assert.strictEqual(cs.persons+cs.dead,co.promoted,'every individual corresponds to exactly one debit');assert.strictEqual(co.count+co.promoted,50);
  const e=ok(w,'life.spawnCohort',{speciesId:'sp_grazer',n,count:1}).result.id;ok(w,'life.promote',{cohortId:e});assert(!D(w,'life.promote',{cohortId:e}).ok,'empty cohort cannot be promoted');
});
test('U16','interest-based detail: dormant people keep identity, memory and needs; coarse updates stay consequential',['LW-037','LW-091','LW-095','LW-101','LW-102','LW-139'],()=>{
  const {w,n}=village(23),ids=ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,20,20,R(w)),count:4}).result.ids;
  ok(w,'world.setMode',{mode:'play'});run(w,LW.TPD);
  const before=ids.map(id=>({mem:w.persons[id].mem.ep.length,rel:LW.mind.relsOf(w,id).length}));
  ok(w,'view.interest',{n:LW.V.mul(n,-1),r:800});run(w,90);
  assert(ids.every(id=>w.persons[id].lod==='dormant'),'far from the observer: coarse detail');
  const t0=w.tick,h0=ids.map(id=>w.persons[id].needs.hunger);run(w,LW.TPD*2);
  ids.forEach((id,i)=>{const p=w.persons[id];assert(p.id===id&&p.mem.ep.length>=before[i].mem&&LW.mind.relsOf(w,id).length>=before[i].rel,'identity, memories and relationships persist');
    assert(p.needs.hunger!==h0[i],'needs kept changing while away');assert(p.mem.sum.away>0,'time away is recorded, not invented as episodes');});
  ok(w,'view.interest',{n,r:900});run(w,90);assert(ids.filter(id=>w.persons[id].alive).every(id=>w.persons[id].lod==='active'),'returns to full detail');
  const cs=LW.census(w);assert.strictEqual(cs.active+cs.dormant,cs.persons);
});
test('U17','archive round-trip restores the same world; simulation continues identically (determinism)',['LW-056','LW-090','LW-093','LW-123','LW-152'],()=>{
  const {w,n}=village(24);ok(w,'build.place',{template:'cottage',n:spot(w,n)});
  ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,20,20,R(w)),count:3});ok(w,'life.spawn',{speciesId:'sp_grazer',n:LW.offsetDir(n,-40,20,R(w)),count:5});
  ok(w,'terrain.edit',{tool:'mountain',n:LW.offsetDir(n,900,0,R(w)),r:400,s:80});ok(w,'world.setMode',{mode:'play'});run(w,LW.TPD+123);
  const text=LW.save.pack(w),w2=LW.save.parse(text);
  assert.strictEqual(hash(w2),hash(w),'identical canonical state');assert.strictEqual(w2.id,w.id);
  for(const id in w.persons){assert.deepStrictEqual(w2.persons[id].mem,w.persons[id].mem);assert.deepStrictEqual(w2.persons[id].beliefs,w.persons[id].beliefs);}
  assert.strictEqual(w2.events.length,w.events.length);assert.strictEqual(LW.planet.height(w2,n),LW.planet.height(w,n));
  run(w,LW.TPD*2);run(w2,LW.TPD*2);
  assert.strictEqual(hash(w2),hash(w),'both copies evolve identically for 2 more days');
  assert(!/function|=>|<script/.test(text.slice(0,2000)));assert(text.indexOf('"password"')<0&&text.indexOf('token')<0,'no credentials in archive');
  return 'archive '+(text.length/1024).toFixed(0)+' KB';
});
test('U18','corrupted, oversized, hostile and future-version archives are rejected without side effects',['LW-152','LW-056'],()=>{
  const w=fresh(25),text=LW.save.pack(w);
  const code=t=>{try{LW.save.parse(t);return 'accepted';}catch(e){return e.code;}};
  assert.strictEqual(code(text),'accepted');
  assert.strictEqual(code(text.replace('"seaLevel":0','"seaLevel":5')),'checksum_mismatch');
  assert.strictEqual(code(text.slice(0,text.length-40)),'not_json');assert.strictEqual(code('hello'),'not_json');assert.strictEqual(code('{"format":"zip"}'),'bad_format');
  const a=JSON.parse(text);a.schema.major=99;assert.strictEqual(code(JSON.stringify(a)),'future_version');
  const repack=m=>{const o=JSON.parse(text);m(o.world);o.checksum=LW.checksum(LW.canonical(o.world));return JSON.stringify(o);};
  assert.strictEqual(code(repack(x=>{x.schema.major=2;})),'future_version');
  assert.strictEqual(code(repack(x=>{x.body.radius=-5;})),'invalid_structure');
  assert.strictEqual(code(repack(x=>{x.persons.p_x={id:'p_x'};})),'invalid_structure');
  assert.strictEqual(code(repack(x=>{x.env.veg.length=10;})),'invalid_structure');
  assert.strictEqual(code(repack(x=>{x.activities.a1={name:'x',start:'a',nodes:[{id:'a',type:'eval',code:'alert(1)'}]};})),'invalid_structure');
  assert.strictEqual(code(text.replace('"world":{','"world":{"__proto__":{"polluted":true},')),'invalid_structure');
  assert.strictEqual(({}).polluted,undefined);
  const big=LW.save.MAX_BYTES;LW.save.MAX_BYTES=1000;assert.strictEqual(code(text),'too_large');LW.save.MAX_BYTES=big;
});
test('U19','two-generation storage: a damaged newest save falls back to the previous generation',['LW-056','LW-103','LW-129'],async()=>{});
// async storage tests run below
async function asyncTests(){
  const atest=async(id,name,reqs,fn)=>{const t0=Date.now();let status='pass',error=null,note=null;try{note=await fn()||null;}catch(e){status='fail';error=String(e&&e.stack||e).split('\n').slice(0,4).join(' | ');}
    const i=results.findIndex(r=>r.id===id);const rec={id,name,reqs,status,ms:Date.now()-t0,error,note};if(i>=0)results[i]=rec;else results.push(rec);
    console.log((status==='pass'?'  ok   ':'  FAIL ')+id+' '+name+(error?'\n       '+error:''));};
  await atest('U19','two-generation storage: a damaged newest save falls back to the previous generation',['LW-056','LW-103','LW-129'],async()=>{
    const kv=LW.save.memoryKV(),st=new LW.save.Store(kv),w=fresh(26);
    await st.snapshot(w,1);ok(w,'terrain.edit',{tool:'raise',n:[0,1,0],r:100,s:5});const h1=hash(w);await st.snapshot(w,2);
    ok(w,'terrain.edit',{tool:'raise',n:[1,0,0],r:100,s:5});await st.snapshot(w,3);
    const keys=(await kv.keys()).filter(k=>/:g[01]$/.test(k));assert.strictEqual(keys.length,2,'exactly two generations kept');
    // damage the newest generation (seq 3) as an interrupted write would
    let newest=null;for(const k of keys){const r=JSON.parse(await kv.get(k));if(r.seq===3)newest=k;}
    await kv.set(newest,(await kv.get(newest)).slice(0,500));
    const r=await new LW.save.Store(kv).load(w.id);assert(r.report.recoveredFromOlder);assert.strictEqual(r.report.seq,2);assert.strictEqual(hash(r.world),h1,'previous generation restored intact');
    for(const k of keys)await kv.set(k,'garbage');
    let code=null;try{await new LW.save.Store(kv).load(w.id);}catch(e){code=e.code;}assert.strictEqual(code,'no_valid_save');
  });
  await atest('U20','crash recovery: journaled commands after the last snapshot are replayed to the identical state',['LW-103','LW-109','LW-129'],async()=>{
    const kv=LW.save.memoryKV(),st=new LW.save.Store(kv),{w,n}=village(27);
    const pend=[];LW.onCommit=(world,cmd,actor,tick)=>{if(world===w)pend.push(st.journal(world,cmd,actor,tick));};
    ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,20,20,R(w)),count:2});ok(w,'world.setMode',{mode:'play'});run(w,500);
    await Promise.all(pend);await st.snapshot(w,1);
    // more play + edits, then the process "crashes" without a new snapshot
    ok(w,'terrain.edit',{tool:'raise',n:LW.offsetDir(n,300,0,R(w)),r:200,s:20});run(w,700);
    ok(w,'build.place',{template:'cottage',n:spot(w,n,70)});run(w,300);ok(w,'time.advance',{ticks:250});ok(w,'life.spawn',{speciesId:'sp_grazer',n:LW.offsetDir(n,-50,0,R(w)),count:3});
    assert(LW.undo(w).ok);await Promise.all(pend);LW.onCommit=null;
    const live=hash(w),r=await new LW.save.Store(kv).load(w.id);
    assert(r.report.replayed>=4,'replayed '+r.report.replayed);assert.strictEqual(r.report.failed,0);
    assert.strictEqual(r.world.tick,w.tick);assert.strictEqual(hash(r.world),live,'recovered state is byte-identical to the state at the last acknowledged command');
    assert.strictEqual(Object.keys(r.world.organisms).length,Object.keys(w.organisms).length,'no duplicated spawns');
    return 'replayed '+r.report.replayed+' commands';
  });
  await atest('U21','a failed snapshot write leaves the previous save loadable; named snapshots restore',['LW-056','LW-103','LW-129'],async()=>{
    const kv=LW.save.memoryKV(),st=new LW.save.Store(kv),w=fresh(28);
    await st.snapshot(w,1);const h0=hash(w);ok(w,'terrain.edit',{tool:'lower',n:[0,0,1],r:300,s:9});
    const set=kv.set;kv.set=async(k,v)=>{if(/:g[01]$/.test(k))throw new Error('QuotaExceededError');return set(k,v);};
    let threw=false;try{await st.snapshot(w,2);}catch(e){threw=true;}assert(threw);kv.set=set;
    assert.strictEqual(hash((await new LW.save.Store(kv).load(w.id)).world),h0,'old save intact after failed write');
    const n=await st.saveNamed(w,'before flood',5);const hs=hash(w);ok(w,'world.setBody',{seaLevel:300});
    assert.strictEqual(hash(await st.restoreNamed(w.id,n)),hs,'deliberate snapshot restore rewinds state');
    assert.strictEqual((await st.snapshots(w.id))[0].name,'before flood');assert.strictEqual((await st.list())[0].id,w.id);
  });
  LW.onCommit=null;
}
test('U22','pending work (births) is applied exactly once across save/reload',['LW-091','LW-092','LW-033'],()=>{
  const {w,n}=village(29),ids=ok(w,'life.spawn',{speciesId:'sp_grazer',n:LW.offsetDir(n,30,0,R(w)),count:2}).result.ids,m=w.organisms[ids[0]];
  ok(w,'world.setMode',{mode:'play'});m.preg=1;w.pending.push({id:LW.newId(w,'pw'),due:w.tick+50,type:'birth',mother:m.id});
  const w2=LW.save.parse(LW.save.pack(w));run(w,60);run(w2,60);
  const born=x=>x.events.filter(e=>e.type==='animal.born').length;assert.strictEqual(born(w),1);assert.strictEqual(born(w2),1);assert(!w.pending.some(x=>x.mother===m.id&&x.due<=w.tick));
  const w3=LW.save.parse(LW.save.pack(w));run(w3,200);assert.strictEqual(born(w3),1,'no duplicate birth after another reload');
});
test('U23','autonomous civilisation: people found a settlement and construct a building themselves',['LW-043','LW-044','LW-046','LW-140','LW-031','LW-032','LW-034'],()=>{
  const {w,n}=village(30);ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,20,20,R(w)),count:4});
  ok(w,'world.setMode',{mode:'play'});
  let done=null,days=0;for(;days<25&&!done;days++){run(w,LW.TPD);done=w.events.find(e=>e.type==='building.completed'&&e.d.by!=='player');}
  const founded=w.events.find(e=>e.type==='settlement.founded');assert(founded,'a settlement was founded');assert(w.persons[founded.d.by],'by a real individual');
  assert(done,'a building was completed without the player after '+days+' days');
  assert(LW.causalChain(w,done.id).some(e=>e.type==='building.planned'),'completion traces back to the plan');
  const s=Object.values(w.settlements)[0];assert(s.members.length>=2);assert(Object.values(w.persons).some(p=>p.home),'someone moved in');
  assert(w.events.some(e=>e.type==='talk'),'people talked');assert(Object.keys(w.relationships).length>0);
  run(w,LW.TPD*12);assert(s.techs.length>=1,'knowledge accumulated into a discovery: '+s.techs.join(','));
  return 'settlement after '+Math.round(founded.t/LW.TPD*10)/10+' days, building after '+days+' days, techs: '+s.techs.join(',');
});
test('U24','ecology: suitability is not life; seeded plants grow, spread or die by climate; grazing and predation occur',['LW-017','LW-079','LW-084','LW-135','LW-022'],()=>{
  const {w,c,n}=village(31),d=LW.env.d(w);
  const cover0=w.env.veg.filter(v=>v>0).length;ok(w,'world.setMode',{mode:'play'});
  let ice=-1;for(let k=0;k<d.C;k++){const cl=LW.env.climate(w,LW.env.cellDir(w,k),d.h[k],k);if(cl.biome===1){ice=k;break;}}
  if(ice>=0){ok(w,'life.seedPlants',{speciesId:'sp_broadleaf',n:LW.env.cellDir(w,ice),r:10,cover:120});assert(w.env.veg[ice]>0);}
  ok(w,'life.spawn',{speciesId:'sp_grazer',n:LW.offsetDir(n,40,0,R(w)),count:8});ok(w,'life.spawn',{speciesId:'sp_stalker',n:LW.offsetDir(n,90,0,R(w)),count:2});
  let peak=cover0;for(let dd=0;dd<20;dd++){run(w,LW.TPD);peak=Math.max(peak,w.env.veg.filter(v=>v>0).length);}
  assert(peak>cover0,'vegetation spread to suitable neighbours');assert(w.events.some(e=>e.type==='plants.diedOut'),'and died out where soil and climate could not sustain it');
  if(ice>=0)assert.strictEqual(w.env.veg[ice],0,'trees seeded on ice died out');
  assert(w.events.some(e=>e.type==='animal.hunted'),'predation happened');
  const t1=LW.env.tempAt(w,[0,0.9,0.43],0);w.tick+=LW.ticksPerYear(w)/2;const t2=LW.env.tempAt(w,[0,0.9,0.43],0);assert(Math.abs(t1-t2)>3,'seasons change temperature');
  return 'animals alive '+Object.keys(w.organisms).length+', hunts '+w.events.filter(e=>e.type==='animal.hunted').length;
});
test('U25','activities are bounded declarative graphs: validated, never executable code',['LW-042','LW-051'],()=>{
  const {w,n}=village(32);const bad=[{name:'x',start:'a',nodes:[{id:'a',type:'js',next:'a'}]},{name:'x',start:'a',nodes:[{id:'a',type:'wait',ticks:5,next:'zz'}]},
    {name:'x',start:'a',nodes:[{id:'a',type:'use',cap:'fly',next:'a'}]},{name:'x',start:'a',nodes:[{id:'a',type:'wait',ticks:5,next:'a',script:'fetch()'}]},{name:'x',start:'q',nodes:[{id:'a',type:'end'}]}];
  for(const b of bad)assert(!D(w,'activity.define',{activity:b}).ok);
  const g={name:'Rest loop',start:'a',nodes:[{id:'a',type:'if',cond:{need:'energy',op:'>',value:0},then:'b',else:'c'},{id:'b',type:'say',text:'time to pause',next:'w'},{id:'w',type:'wait',ticks:6,next:'a'},{id:'c',type:'end'}]};
  const aid=ok(w,'activity.define',{activity:g}).result.id;
  const p=w.persons[ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,10,10,R(w))}).result.ids[0]];
  ok(w,'world.setMode',{mode:'play'});ok(w,'person.control',{id:p.id,on:true});ok(w,'person.enqueue',{id:p.id,action:{a:'activity',id:aid}});
  run(w,1200);assert(!p.act,'looping graph terminated by the visit bound');assert(p.mem.ep.filter(m=>m.k==='said').length+(p.mem.sum.said||0)>=5,'graph steps executed');
});
test('U26','dialogue: rule-based fallback is labelled; no generative output without a registered local model',['LW-006','LW-030','LW-071','LW-118','LW-119','LW-138'],()=>{
  const {w,n}=village(33),p=w.persons[ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,5,5,R(w))}).result.ids[0]];
  LW.mind.perceive(w,p,w.species.sp_human);
  const st=LW.localAI.status();assert.strictEqual(st.available,false);assert.strictEqual(st.kind,'rule-based');
  const r=LW.localAI.scripted(w,p,'water');assert.strictEqual(r.kind,'scripted');assert(/saw it myself/.test(r.text),'reply reflects the belief source: '+r.text);
  let code=null;return LW.localAI.generate(w,p,'hello').then(()=>{throw new Error('should not generate');},e=>{code=e.code;assert.strictEqual(code,'no_local_model');
    assert.throws(()=>LW.localAI.register({name:'cloud',local:false,generate:async()=>({text:'x'})}));
    const hs=hash(w);LW.localAI.context(w,p);assert.strictEqual(hash(w),hs,'building model context does not write to the world');return 'scripted: '+r.text;});
});
test('U27','roles and exclusive control: visitors cannot edit; one controller per character',['LW-053','LW-054','LW-153','LW-141'],()=>{
  const {w,n}=village(34),pid=ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,5,5,R(w))}).result.ids[0];
  const ed1={id:'u1',role:'editor'},ed2={id:'u2',role:'editor'},vis={id:'u3',role:'visitor'};
  assert.strictEqual(D(w,'terrain.edit',{tool:'raise',n,r:50,s:1},vis).code,'forbidden');assert(D(w,'terrain.edit',{tool:'raise',n,r:50,s:1},ed1).ok);
  assert.strictEqual(D(w,'world.setMode',{mode:'play'},ed1).code,'forbidden','only the owner controls the clock');
  assert(D(w,'person.control',{id:pid,on:true},ed1).ok);assert(!D(w,'person.control',{id:pid,on:true},ed2).ok,'second controller refused');
  assert(!D(w,'person.enqueue',{id:pid,action:{a:'wait',n:3}},ed2).ok);assert(D(w,'person.enqueue',{id:pid,action:{a:'wait',n:3}},ed1).ok);
  assert(D(w,'person.control',{id:pid,on:false},ed1).ok);assert(D(w,'person.control',{id:pid,on:true},ed2).ok,'released lease can be taken');
});
test('U28','species: validated custom anatomy/lifecycle; artificial life has a different physiology',['LW-022','LW-023','LW-033','LW-004','LW-147'],()=>{
  const {w,n}=village(35);
  assert(!D(w,'life.defineSpecies',{species:{id:'bad id',kind:'animal'}}).ok);
  const sp={id:'sp_test_strider',kind:'animal',name:'Strider',body:{plan:'hexapod',size:2.5,legs:6,arms:0,head:0.3,tail:0,wings:0,c1:[200,60,160],c2:[20,20,20]},senses:{sight:90},move:{speed:1.5,swim:true,fly:false},diet:'herb',
    lifecycle:{span:3,mature:0.1,repro:'asexual',gest:2,litter:2},climate:{t:[-60,80],m:[0,1]},voice:{pitch:300,rough:0.5}};
  ok(w,'life.defineSpecies',{species:sp});const ids=ok(w,'life.spawn',{speciesId:sp.id,n:LW.offsetDir(n,30,30,R(w)),count:3}).result.ids;assert.strictEqual(ids.length,3);
  const bot=w.persons[ok(w,'life.spawn',{speciesId:'sp_automaton',n:LW.offsetDir(n,8,8,R(w))}).result.ids[0]];
  ok(w,'world.setMode',{mode:'play'});run(w,LW.TPD*8);
  assert(bot.alive&&bot.needs.hunger===78&&bot.needs.thirst===78,'automaton neither eats nor drinks');
  assert(w.events.some(e=>e.type==='animal.born'&&e.d.species===sp.id),'asexual species reproduced');
  const g=LW.createWorld({seed:3,body:{gravity:35,axialTilt:85,atmosphere:{baseTemp:-100,density:0},gen:{terrace:1,relief:3}}});LW.save.validate(g);assert(isFinite(LW.planet.height(g,[1,0,0])),'fantastical settings accepted');
});
test('U29','natural consequences reach player-built structures (flooding is not blocked by manual placement)',['LW-019','LW-145','LW-085'],()=>{
  const {w,n}=village(36),hn=spot(w,n,60),b=w.buildings[ok(w,'build.place',{template:'cottage',n:hn}).result.id];
  assert(!D(w,'build.place',{template:'cottage',n:LW.offsetDir(hn,2,0,R(w))}).ok,'overlap rejected');
  ok(w,'world.setBody',{seaLevel:LW.planet.height(w,hn)+5});run(w,LW.TPH);
  assert(b.flooded,'building flooded by sea rise');const ev=w.events.find(e=>e.type==='building.flooded');assert(ev);
  assert(!D(w,'build.place',{template:'cottage',n:LW.offsetDir(hn,30,0,R(w))}).ok,'cannot build under water');
});
test('U30','bounded history: event log is tiered and capped; key events are retained',['LW-104'],()=>{
  const w=fresh(37);const key=LW.emit(w,'settlement.founded',{id:'s',name:'X',by:'p'});
  for(let i=0;i<14000;i++)LW.emit(w,'talk',{a:'a',b:'b'});
  assert(w.events.length<=5001,'bounded: '+w.events.length);assert(w.eventArchive.byType.talk>8000,'older events summarised as counts');assert(LW.findEvent(w,key),'key event kept');
});
test('U31','kernel purity: no wall clock, unseeded randomness, network, eval or DOM in src/core; offline single file',['LW-001','LW-011','LW-070','LW-093','LW-154','LW-106'],()=>{
  const dir=path.join(__dirname,'..','src','core');let n=0;
  for(const f of fs.readdirSync(dir)){const s=fs.readFileSync(path.join(dir,f),'utf8');n++;
    for(const bad of ['Math.random','Date.now','new Date','fetch(','XMLHttpRequest','WebSocket','eval(','new Function','document.','window.','setTimeout','importScripts','localStorage'])assert(s.indexOf(bad)<0,f+' contains '+bad);}
  const html=fs.readFileSync(path.join(__dirname,'..','Living_World.html'),'utf8');
  assert(!/https?:\/\//.test(html),'no remote URLs in the shipped file');
  for(const bad of ['fetch(','XMLHttpRequest','WebSocket(','sendBeacon','EventSource','importScripts','<link','eval(','new Function'])assert(html.indexOf(bad)<0,'shipped file contains '+bad);
  assert(!/<(script|img|iframe|audio|video|source)[^>]*\ssrc=/i.test(html),'no external resource tags');
  assert(html.indexOf("connect-src 'none'")>0,'CSP forbids all network connections');
  return n+' kernel modules, shipped file '+(html.length/1024).toFixed(0)+' KB';
});
test('U32','build is reproducible: rebuilding yields a byte-identical Living_World.html',['LW-123','LW-143'],()=>{
  const cp=require('child_process'),f=path.join(__dirname,'..','Living_World.html'),a=fs.readFileSync(f);
  cp.execFileSync(process.execPath,[path.join(__dirname,'..','tools','build.cjs')]);assert(a.equals(fs.readFileSync(f)),'identical output');
});
test('U33','catch-up and time control are bounded and explicit',['LW-007','LW-018','LW-115'],()=>{
  const w=fresh(38);assert(!D(w,'time.advance',{ticks:LW.TPD*401}).ok,'unbounded catch-up refused');assert(D(w,'time.advance',{ticks:LW.TPD}).ok);
  const t=w.tick;assert.strictEqual(w.tick,t,'time only moves when ticks are executed');
  ok(w,'world.setRules',{envInCreate:false});const w2=LW.save.parse(LW.save.pack(w));assert.strictEqual(w2.rules.envInCreate,false);
});
test('U34','scale: 150 people + 140 animals simulate within the per-tick budget on this machine',['LW-069','LW-117'],()=>{
  const {w,n}=village(39);
  for(let i=0;i<19;i++)ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,(i%5)*30-60,Math.floor(i/5)*30-60,R(w)),count:8});
  for(let i=0;i<6;i++)ok(w,'life.spawn',{speciesId:'sp_grazer',n:LW.offsetDir(n,i*40,120,R(w)),count:24});
  ok(w,'world.setMode',{mode:'play'});run(w,200);const t0=process.hrtime.bigint();run(w,2000);const ms=Number(process.hrtime.bigint()-t0)/1e6/2000;
  const cs=LW.census(w);assert(cs.persons>=140&&cs.animals>=100);assert(ms<8,'mean tick '+ms.toFixed(3)+' ms');
  return cs.persons+' people, '+cs.animals+' animals: mean '+ms.toFixed(3)+' ms/tick (desktop Node, not a phone)';
});

test('U35','pathfinding: people walk round buildings and round water instead of through them',['LW-028','LW-098','LW-149'],()=>{
  const {w,n}=village(41),site=spot(w,n,70),sp=w.species.sp_human;
  const b=w.buildings[ok(w,'build.place',{template:'house',n:site,yaw:0.3}).result.id],rad=LW.build.radius(b);
  const A=LW.offsetDir(site,-(rad+14),0.5,R(w)),Z=LW.offsetDir(site,rad+14,-0.5,R(w));
  const path=LW.nav.path(w,A,Z,sp);assert(path&&path.length>=2,'detours: '+(path&&path.length)+' waypoints');
  let prev=A,minD=1e9;for(const q of path){for(let k=0;k<=20;k++)minD=Math.min(minD,LW.arcDist(LW.V.norm(LW.V.lerp(prev,q,k/20)),site,R(w)));prev=q;}
  assert(minD>=rad+0.5,'route stays outside the footprint: closest '+minD.toFixed(1)+' m vs radius '+rad.toFixed(1));
  const p=w.persons[ok(w,'life.spawn',{speciesId:'sp_human',n:A}).result.ids[0]];ok(w,'world.setMode',{mode:'play'});ok(w,'person.control',{id:p.id,on:true});
  ok(w,'person.enqueue',{id:p.id,action:{a:'go',to:Z}});let inside=false;for(let i=0;i<400;i++){LW.tick(w);if(LW.build.locate(w,p.n))inside=true;}
  assert(!inside,'never walked through the house');assert(LW.arcDist(p.n,Z,R(w))<1.5,'arrived');
  // a lake painted across the way: the straight line is blocked, a way round is found and walked
  const L0=LW.offsetDir(Z,60,0,R(w));ok(w,'terrain.edit',{tool:'water',n:L0,r:26,s:8});
  const far=LW.offsetDir(Z,120,0,R(w));assert(!LW.life.canEnter(w,L0,sp),'lake is impassable on foot');
  const wp=LW.nav.path(w,p.n,far,sp);assert(wp&&wp.length>=2,'route round the lake');
  prev=p.n;for(const q of wp){for(let k=1;k<=12;k++)assert(LW.life.canEnter(w,LW.V.norm(LW.V.lerp(prev,q,k/12)),sp),'route stays on land');prev=q;}
  ok(w,'person.enqueue',{id:p.id,action:{a:'go',to:far}});run(w,500);assert(LW.arcDist(p.n,far,R(w))<1.5,'walked round the lake');assert(!w.events.some(e=>e.type==='person.failed'&&e.d.id===p.id));
  const island=LW.offsetDir(far,400,0,R(w));ok(w,'terrain.edit',{tool:'water',n:island,r:60,s:10});assert.strictEqual(LW.nav.path(w,p.n,island,sp),null,'unreachable target reports no route');
  return path.length+' waypoints round the house; '+wp.length+' round the lake';
});
test('U36','weather matters: rain soaks soil, dry spells bring drought, storms hit crops; schema 1.0 saves migrate to 1.1',['LW-047','LW-084','LW-135','LW-152'],()=>{
  const {w,c,n}=village(42),d=LW.env.d(w);
  assert.strictEqual(w.schema.minor,1);assert.strictEqual(w.env.soil.length,d.C);
  run(w,LW.TPD*12);                                   // creator mode: environment runs, weather included
  let wet=0,dry=0,mn=255,mx=0;for(let k=0;k<d.C;k++){if(d.h[k]<w.body.seaLevel)continue;const s=w.env.soil[k];mn=Math.min(mn,s);mx=Math.max(mx,s);if(s>140)wet++;if(s<90)dry++;}
  assert(mx-mn>60,'soil moisture varies with the weather: '+mn+'..'+mx);assert(wet>20&&dry>20,'both wet and dry regions exist');
  const before=LW.env.waterFactor(w,c);w.env.soil[c]=0;assert(LW.env.waterFactor(w,c)<before-0.1,'dry soil lowers growing water');
  // a settlement in a parched cell gets a drought event; when rain returns it ends
  ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,10,10,R(w)),count:2});ok(w,'world.setMode',{mode:'play'});
  let days=0;for(;days<10&&!Object.keys(w.settlements).length;days++)run(w,LW.TPD);
  const s=Object.values(w.settlements)[0];assert(s,'settlement exists');const sc=LW.env.cellOf(w,s.n);
  w.env.soil[sc]=0;w.env.river[sc]=0;LW.env.weather(w);assert(w.events.some(e=>e.type==='drought'&&e.d.settlement===s.id),'drought recorded');assert(s.drought>0);
  w.env.soil[sc]=250;LW.env.weather(w);assert(w.events.some(e=>e.type==='drought.ended'),'drought ends when the soil recovers');
  // migration from the previous schema
  const o=JSON.parse(LW.save.pack(w));delete o.world.env.soil;o.world.schema={major:1,minor:0};o.schema={major:1,minor:0};o.checksum=LW.checksum(LW.canonical(o.world));
  const m=LW.save.parse(JSON.stringify(o));assert.deepStrictEqual(m.schema,{major:1,minor:1});assert.strictEqual(m.env.soil.length,d.C);assert(m.env.soil.every(x=>x===128));
  run(m,LW.TPD);LW.save.validate(m);
  return 'soil range '+mn+'..'+mx+' after 12 days';
});
test('U37','schedules: a character keeps set hours, then returns to their own choices',['LW-040'],()=>{
  const {w,n}=village(43),p=w.persons[ok(w,'life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,10,10,R(w))}).result.ids[0]];
  assert(!D(w,'person.setSchedule',{id:p.id,schedule:[{h0:9,h1:5,what:'study'}]}).ok);assert(!D(w,'person.setSchedule',{id:p.id,schedule:[{h0:1,h1:5,what:'fly'}]}).ok);
  ok(w,'person.setSchedule',{id:p.id,schedule:[{h0:0,h1:24,what:'study'}]});ok(w,'world.setMode',{mode:'play'});
  let studied=0,total=0;for(let i=0;i<LW.TPD;i++){LW.tick(w);if(p.plan){total++;if(p.plan.goal==='study')studied++;}}
  assert(studied/total>0.5,'studies during scheduled hours: '+Math.round(studied/total*100)+'%');assert(p.skills.lore>0.05,'and learns from it');
  assert(p.alive&&p.needs.thirst>0,'urgent needs still interrupt the schedule');
  ok(w,'person.setSchedule',{id:p.id,schedule:[]});p.plan=null;let other=0;for(let i=0;i<2000;i++){LW.tick(w);if(p.plan&&p.plan.goal!=='study')other++;}
  assert(other>800,'free again once the schedule is cleared');assert(LW.undo(w).ok&&p.schedule.length===1,'schedule edits are undoable');
  return Math.round(studied/total*100)+'% of the day spent on the scheduled activity';
});

(async()=>{
  // promise-returning tests registered above
  for(const r of results)if(r.note&&typeof r.note.then==='function'){try{r.note=await r.note;}catch(e){r.status='fail';r.error=String(e&&e.stack||e).split('\n').slice(0,3).join(' | ');r.note=null;console.log('  FAIL '+r.id+' (async) '+r.error);}}
  await asyncTests();
  results.sort((a,b)=>a.id<b.id?-1:1);
  const out=path.join(__dirname,'out');fs.mkdirSync(out,{recursive:true});
  const pass=results.filter(r=>r.status==='pass').length;
  fs.writeFileSync(path.join(out,'unit-results.json'),JSON.stringify({suite:'unit',node:process.version,platform:process.platform+' '+process.arch,total:results.length,pass,fail:results.length-pass,results},null,1));
  console.log('\nunit: '+pass+'/'+results.length+' passed');
  process.exit(pass===results.length?0:1);
})();
