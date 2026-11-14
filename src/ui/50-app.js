// application shell: main loop, time control, storage adapters, command helper, camera input
// (touch / mouse / keyboard), tools. The UI only ever changes the world through LW.dispatch.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V,G=LW.gfx,E=LW.env,P=LW.planet,B=LW.build;
const App=LW.app={world:null,draft:null,preview:null,cam:null,terrain:null,scene:null,store:null,storeKind:'none',
  tool:{cat:'nav',id:'nav',r:400,s:40,lockR:false,biome:6,plant:'sp_broadleaf',creature:'sp_grazer',person:'sp_human',count:1,template:'cottage',comp:'bed',carveR:2.5},
  sel:null,speed:0,opts:{studio:false,clouds:true,shadows:true,quality:'auto',hints:true},stats:{fps:0,ms:0,ticksPerSec:0},acc:0,stroke:null,pending:null,
  dirtySince:0,lastSnapRev:-1,lastSnapTick:-1,phase:'boot',listeners:[]};
App.SPEEDS=[0,2,16,120,1200];App.SPEED_LABELS=['⏸','1×','8×','60×','600×'];
App.view=()=>App.preview||App.world||App.draft;
App.changed=function(what){for(const f of App.listeners)f(what);};
LW.idPrefix='s'+Math.floor(Math.random()*1e9).toString(36)+Date.now().toString(36);

// ---- storage adapters ---------------------------------------------------------------
function idbKV(){
  return new Promise((res,rej)=>{
    let rq;try{rq=indexedDB.open('living-world',1);}catch(e){return rej(e);}
    rq.onupgradeneeded=()=>rq.result.createObjectStore('kv');
    rq.onerror=()=>rej(rq.error);rq.onblocked=()=>rej(new Error('blocked'));
    rq.onsuccess=()=>{const db=rq.result,tx=(mode,fn)=>new Promise((ok,no)=>{let r;try{const t=db.transaction('kv',mode);r=fn(t.objectStore('kv'));t.oncomplete=()=>ok(r&&r.result!==undefined?r.result:null);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);}catch(e){no(e);}});
      res({kind:'indexeddb',get:k=>tx('readonly',s=>s.get(k)),set:(k,v)=>tx('readwrite',s=>s.put(v,k)),del:k=>tx('readwrite',s=>s.delete(k)),keys:()=>tx('readonly',s=>s.getAllKeys())});};
    setTimeout(()=>rej(new Error('timeout')),2500);
  });
}
function lsKV(){
  const ls=globalThis.localStorage;ls.setItem('lw:probe','1');ls.removeItem('lw:probe');
  return {kind:'localstorage',get:async k=>ls.getItem('lw:'+k),set:async(k,v)=>{ls.setItem('lw:'+k,v);},del:async k=>{ls.removeItem('lw:'+k);},
    keys:async()=>{const o=[];for(let i=0;i<ls.length;i++){const k=ls.key(i);if(k.indexOf('lw:')===0)o.push(k.slice(3));}return o;}};
}
App.initStore=async function(){
  let kv=null;
  try{kv=await idbKV();await kv.set('probe','1');await kv.del('probe');}catch(e){kv=null;}
  if(!kv){try{kv=lsKV();}catch(e){kv=null;}}
  if(!kv){kv=LW.save.memoryKV();}          // truthful fallback: nothing persists; UI tells the player to export
  App.store=new LW.save.Store(kv);App.storeKind=kv.kind;
};
LW.onCommit=function(world,cmd,actor,tick){
  if(world!==App.world||!App.store)return;
  App.store.journal(world,cmd,actor,tick).catch(()=>{App.storeError=true;});
};
App.snapshot=async function(force){
  const w=App.world;if(!w||!App.store)return false;
  if(App.saving){if(!force)return false;try{await App.saving;}catch(e){}if(App.world!==w)return false;}      // a forced save waits for the one in flight
  if(!force&&w.revision===App.lastSnapRev&&w.tick===App.lastSnapTick)return false;
  const rev=w.revision,tick=w.tick,job=App.saving=App.store.snapshot(w,Date.now());
  try{await job;App.lastSnapRev=rev;App.lastSnapTick=tick;App.storeError=false;App.lastSaved=Date.now();return true;}
  catch(e){App.storeError=true;App.toast('Autosave failed ('+(e&&e.name||'storage error')+'). Use Menu → Export to keep this world.','err');return false;}
  finally{if(App.saving===job)App.saving=null;}
};

// ---- commands -------------------------------------------------------------------------
App.do=function(type,payload,quiet){
  const w=App.world;if(!w)return {ok:false};
  const r=LW.dispatch(w,LW.cmd(w,type,payload));
  if(!r.ok&&!quiet)App.toast(r.error||r.code,'err');
  if(r.ok)App.changed(type);
  return r;
};
App.undo=function(){
  const w=App.world,info=LW.undoInfo(w);if(!info)return App.toast('Nothing to undo');
  const r=LW.undo(w);if(!r.ok)return App.toast(r.error,'err');
  App.terrain.invalidateAll();if(w.env.dirty.pending)App.do('env.settle',{},true);
  App.toast('Undid: '+info.label+(info.warning?' — consequences since then are kept':''),info.warning?'warn':'');App.changed('undo');
};
App.redo=function(){
  const w=App.world,r=LW.redo(w);if(!r.ok)return App.toast('Nothing to redo');
  App.terrain.invalidateAll();if(w.env.dirty.pending)App.do('env.settle',{},true);App.toast('Redone');App.changed('redo');
};

// ---- world lifecycle ---------------------------------------------------------------------
App.newDraft=function(cfg){
  cfg=cfg||{};const seed=cfg.seed!==undefined?cfg.seed>>>0:(Math.floor(Math.random()*4294967295)>>>0)||1;
  App.draftCfg=Object.assign({seed,name:cfg.name||'World '+seed.toString(36).toUpperCase(),body:{}},cfg,{seed});
  App.draft=LW.createWorld({seed,name:App.draftCfg.name,nonce:Math.floor(Math.random()*1e9).toString(36),body:App.draftCfg.body});
  if(App.terrain)App.terrain.reset();if(App.scene)App.scene.reset();
  App.cam.dist=App.draft.body.radius*3.1;App.cam.autoTilt=true;
};
App.startWorld=async function(world,fresh){
  App.world=world;App.draft=null;App.preview=null;App.sel=null;App.speed=0;App.acc=0;App.phase='play';
  App.terrain.reset();App.scene.reset();
  if(fresh){LW.emit(world,'world.created',{seed:world.seed,radius:world.body.radius});E.settle(world);App.snapshot(true);}        // first save runs in the background; the game is usable at once
  App.cam.dist=Math.min(App.cam.dist,world.body.radius*3.1);
  App.changed('world');
};
App.openSaved=async function(id){
  try{
    const r=await App.store.load(id);await App.startWorld(r.world,false);
    App.lastSnapRev=-1;
    if(r.report.recoveredFromOlder)App.toast('The newest save was damaged; recovered the previous generation.','warn');
    else if(r.report.failed)App.toast('Restored '+r.report.replayed+' later edits; one could not be replayed ('+r.report.error+') and edits after it were dropped.','warn');
    else if(r.report.replayed)App.toast('Restored '+r.report.replayed+' edits made after the last snapshot.');
    return r;
  }catch(e){App.toast('Could not open save: '+(e.message||e.code),'err');return null;}
};
App.importText=async function(text){
  let w;try{w=LW.save.parse(text);}catch(e){App.toast('Import rejected: '+(e.message||e.code),'err');return {ok:false,code:e.code,error:e.message};}
  await App.startWorld(w,false);App.lastSnapRev=-1;await App.snapshot(true);
  App.toast('Imported “'+w.name+'” (tick '+w.tick+', revision '+w.revision+')');return {ok:true};
};
App.exportText=()=>LW.save.pack(App.world);
App.setSpeed=function(i){
  const w=App.world;if(!w)return;
  App.speed=i;App.changed('speed');
};
App.play=function(){
  const w=App.world;if(!w)return;
  if(w.mode!=='play'){
    const alive=Object.keys(w.organisms).length+Object.values(w.persons).filter(p=>p.alive).length+Object.values(w.cohorts).reduce((s,c)=>s+c.count,0);
    App.do('world.setMode',{mode:'play'});
    if(!alive)App.toast('Time is running, but this world is uninhabited. Use the Life tools to introduce plants, animals or people.','warn');
  }
  if(!App.speed)App.setSpeed(1);
};

// ---- picking --------------------------------------------------------------------------------
App.groundHit=function(x,y){const c=App.cam;return G.raycast(App.view(),c.pos,G.rayDir(c,x,y));};
App.pick=function(x,y){
  const w=App.world,c=App.cam,R=w.body.radius;let best=null,bd=30;
  const test=(pos,sel,bias)=>{const s=G.project(c,pos);if(!s)return;const d=Math.hypot(s.x-x,s.y-y)-(bias||0);if(d<bd){bd=d;best=sel;}};
  for(const id in w.persons){const p=w.persons[id];if(p.alive){const q=App.scene.entPos(w,p,App.scene.rs.get(id));test(V.madd(q,p.n,0.9),{type:'person',id},6);}}
  for(const id in w.organisms){const o=w.organisms[id],q=App.scene.entPos(w,o,App.scene.rs.get(id));test(V.madd(q,o.n,0.4),{type:'animal',id},2);}
  if(best)return best;
  const hit=App.groundHit(x,y);
  if(c.dist<160){
    bd=26;for(const id in w.buildings){const b=w.buildings[id];if(b.progress<1||V.dist(P.surface(w,b.n),c.pos)>300)continue;const fy=B.floorY(w,b);
      for(const cp of b.comps){const n=B.dir(w,b,cp.x,cp.z);test(V.mul(n,R+fy+0.5),{type:'comp',id:b.id,cid:cp.id});}}
    if(best)return best;
  }
  if(hit){
    for(const id in w.buildings){const b=w.buildings[id];if(LW.arcDist(b.n,hit.n,R)<B.radius(b)+0.3)return {type:'building',id};}
    for(const id in w.cohorts){const co=w.cohorts[id];if(co.count>0&&E.cellOf(w,hit.n)===co.cell&&LW.arcDist(E.cellDir(w,co.cell),hit.n,R)<70)return {type:'cohort',id};}
    const s=LW.society.nearestSettlement(w,hit.n,Math.max(30,c.dist*0.03));
    if(s&&c.dist>400)return {type:'settlement',id:s.id};
    for(const id in w.volumes)if(LW.volumes.contains(w,w.volumes[id],hit.n))return {type:'volume',id,n:hit.n};
    return {type:'cell',cell:E.cellOf(w,hit.n),n:hit.n};
  }
  return null;
};
App.select=function(sel){
  App.sel=sel;
  if(sel&&sel.type==='animal'&&App.world.organisms[sel.id])LW.audio.voice(App.world.species[App.world.organisms[sel.id].speciesId]);
  if(sel&&sel.type==='person'&&App.world.persons[sel.id])LW.audio.voice(App.world.species[App.world.persons[sel.id].speciesId]);
  App.changed('select');
};
App.focusOn=function(n,dist){App.cam.goal={n:n.slice(),dist:dist||null};};
App.controlled=function(){const w=App.world;if(!w)return null;for(const id in w.persons){const p=w.persons[id];if(p.alive&&p.control.mode==='player'&&p.control.by===LW.LOCAL_ACTOR.id)return p;}return null;};

// ---- tools --------------------------------------------------------------------------------------
const BRUSH={raise:1,lower:1,smooth:1,flatten:1,mountain:1,valley:1,shore:1,biome:1,water:1,plants:1};
App.isBrush=()=>!!BRUSH[App.tool.id];
App.setTool=function(cat,id){App.tool.cat=cat;App.tool.id=id||cat;App.pending=null;App.autoBrush();App.changed('tool');};
App.autoBrush=function(){
  const t=App.tool,w=App.view();if(!w||t.lockR)return;
  t.r=LW.clamp(App.cam.dist*0.13,3,w.body.radius*0.6);
  t.s=LW.clamp(t.r*0.16,0.4,P.amplitude(w.body)*0.6+5);
};
function dab(n,first){
  const t=App.tool,st=App.stroke;
  if(!first&&LW.arcDist(st.last,n,App.world.body.radius)<t.r*0.34)return;
  st.last=n;let r;
  if(t.id==='plants')r=App.do('life.seedPlants',{speciesId:t.plant,n,r:t.r,cover:70,gid:st.gid});
  else if(t.id==='biome')r=App.do('terrain.edit',{tool:'biome',n,r:t.r,biome:t.biome,gid:st.gid});
  else{const p={tool:t.id,n,r:t.r,s:t.s,gid:st.gid};if((t.id==='flatten'||t.id==='smooth')&&st.level!==undefined)p.level=st.level;
    r=App.do('terrain.edit',p);if(r.ok&&st.level===undefined&&(t.id==='flatten'||t.id==='smooth'))st.level=App.world.terrainEdits[App.world.terrainEdits.length-1].level;}
  if(r&&r.ok){st.n++;App.terrain.invalidate(App.world,n,t.r);}
}
function carveAt(x,y,first){
  const w=App.world,c=App.cam,t=App.tool,d=G.rayDir(c,x,y),hit=G.raycastVolume(w,c.pos,d);
  if(!hit){if(first)App.toast('Carving works inside a dig site. Use “New dig site” and tap the ground first.','warn');return;}
  const st=App.stroke;if(!first&&st.lastT&&Math.hypot(x-st.lx,y-st.ly)<10)return;st.lx=x;st.ly=y;st.lastT=1;
  const fill=t.id==='fill',k=fill?-t.carveR*0.4:t.carveR*0.45,p=V.madd(V.madd(c.pos,d,hit.t),d,k),r=V.len(p),n=V.mul(p,1/r),l=LW.volumes.local(w,hit.v,n);
  const res=App.do('volume.carve',{id:hit.v.id,x:l[0],y:r-w.body.radius,z:l[1],r:t.carveR,fill,gid:st.gid});
  if(res.ok){st.n++;App.terrain.invalidate(w,hit.v.n,40);}
}
App.strokeStart=function(x,y){
  const t=App.tool;App.stroke={gid:LW.idPrefix+'g'+Date.now().toString(36),n:0,last:null};
  if(t.id==='carve'||t.id==='fill')return carveAt(x,y,true);
  const hit=App.groundHit(x,y);if(hit)dab(hit.n,true);
};
App.strokeMove=function(x,y){
  if(!App.stroke)return;const t=App.tool;
  if(t.id==='carve'||t.id==='fill')return carveAt(x,y,false);
  const hit=App.groundHit(x,y);if(hit){App.hover=hit.n;if(App.stroke.last)dab(hit.n,false);else dab(hit.n,true);}
};
App.strokeEnd=function(){
  const st=App.stroke;App.stroke=null;if(!st||!st.n)return;
  const w=App.world;
  if(w.env.dirty.pending){const r=App.do('env.settle',{},true);if(r.ok&&r.result.changed)App.toast('Water responded: '+r.result.changed+' region'+(r.result.changed>1?'s':'')+' changed. Tap the land to inspect causes.');}
  App.changed('stroke');
};
// a tap with a placement tool, or a contextual command for a controlled character
App.tap=function(x,y){
  const w=App.world,t=App.tool,c=App.cam;if(!w)return;
  if(App.pending){const hit=App.groundHit(x,y);const pd=App.pending;App.pending=null;if(hit)pd.fn(hit);App.changed('tool');return;}
  if(App.isBrush()||t.id==='carve'||t.id==='fill'){App.strokeStart(x,y);App.strokeEnd();return;}
  const hit=App.groundHit(x,y);
  if(t.cat!=='nav'&&t.id!=='nav'){
    if(!hit)return App.toast('Tap the planet surface');
    const n=hit.n;let r=null;
    if(t.id==='creature')r=App.do('life.spawn',{speciesId:t.creature,n,count:t.count});
    else if(t.id==='person')r=App.do('life.spawn',{speciesId:t.person,n,count:t.count});
    else if(t.id==='cohort')r=App.do('life.spawnCohort',{speciesId:t.creature,n,count:t.count*20});
    else if(t.id==='template'){r=App.do('build.place',{template:t.template,n,yaw:-c.heading});if(r.ok)App.select({type:'building',id:r.result.id});}
    else if(t.id==='comp'){const loc=B.locate(w,n);if(!loc)return App.toast('Tap the floor inside a finished room to place furniture','warn');
      r=App.do('build.addComp',{id:loc.b.id,kind:t.comp,x:loc.x,z:loc.z,rot:0});if(r.ok)App.select({type:'comp',id:loc.b.id,cid:r.result.id});}
    else if(t.id==='digsite'){r=App.do('volume.create',{n,yaw:-c.heading});if(r.ok){App.terrain.invalidate(w,n,60);App.setTool('dig','carve');App.toast('Dig site ready. Drag on it to carve; raise Depth (right side) to look underground.');}}
    if(r&&r.ok){LW.audio.click();if(t.id==='creature'||t.id==='person'){App.select({type:t.id==='person'?'person':'animal',id:r.result.ids[0]});if(w.mode!=='play')App.toast('Introduced. Life begins to act when you press Play.');}}
    return;
  }
  const sel=App.pick(x,y),p=App.controlled();
  if(p&&sel){       // direct control: contextual orders
    if(sel.type==='cell'||sel.type==='volume'||sel.type==='building'&&!B.locate(w,hit?hit.n:p.n)){if(hit){const r=App.do('person.enqueue',{id:p.id,action:{a:'go',to:hit.n}});if(r.ok)App.toast(p.name+': walk there');}return;}
    if(sel.type==='building'&&hit){const r=App.do('person.enqueue',{id:p.id,action:{a:'go',to:hit.n}});if(r.ok)App.toast(p.name+': walk there');return;}
    if(sel.type==='comp'){App.select(sel);return;}
    if(sel.type==='person'&&sel.id!==p.id){const r=App.do('person.enqueue',{id:p.id,action:{a:'talk',id:sel.id}});if(r.ok)App.toast(p.name+': talk to '+w.persons[sel.id].name);return;}
  }
  App.select(sel);
};

// ---- input: familiar map gestures + precise button/keyboard alternatives ---------------------------
App.pan=function(dx,dy){
  const c=App.cam,w=App.view(),R=w.body.radius,m=2*c.dist*c.tanY/c.h,fr=LW.frame(c.n),ch=Math.cos(c.heading),sh=Math.sin(c.heading);
  const fw=[fr.t[0]*ch+fr.e[0]*sh,fr.t[1]*ch+fr.e[1]*sh,fr.t[2]*ch+fr.e[2]*sh],rt=[fr.e[0]*ch-fr.t[0]*sh,fr.e[1]*ch-fr.t[1]*sh,fr.e[2]*ch-fr.t[2]*sh];
  let a=-dx*m/R,b=dy*m/R;const l=Math.hypot(a,b);if(l>0.25){a*=0.25/l;b*=0.25/l;}
  c.n=V.norm([c.n[0]+rt[0]*a+fw[0]*b,c.n[1]+rt[1]*a+fw[1]*b,c.n[2]+rt[2]*a+fw[2]*b]);c.goal=null;App.follow=null;
};
App.zoom=function(f){const c=App.cam;c.dist=LW.clamp(c.dist*f,2.5,App.view().body.radius*6);c.goal=null;App.autoBrush();};
App.rotate=function(dh,dt){const c=App.cam;c.heading+=dh;if(dt){c.autoTilt=false;c.tilt=LW.clamp(c.tilt+dt,0,1.5);}};
App.bindInput=function(cv){
  const pts=new Map();let mode=null,moved=0,t0=0,start=null,pinch=null;
  const xy=e=>{const r=cv.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
  cv.addEventListener('contextmenu',e=>e.preventDefault());
  cv.addEventListener('pointerdown',e=>{
    LW.audio.start();cv.setPointerCapture(e.pointerId);const p=xy(e);pts.set(e.pointerId,p);
    if(pts.size===1){moved=0;t0=e.timeStamp;start=p;mode=(e.button===2||e.button===1)?'orbit':'undecided';}
    else if(pts.size===2){if(mode==='stroke')App.strokeEnd();mode='pinch';pinch=null;}
  });
  cv.addEventListener('pointermove',e=>{
    const p=xy(e);
    if(!pts.has(e.pointerId)){if(App.world&&App.isBrush()&&e.pointerType==='mouse'){const h=App.groundHit(p[0],p[1]);App.hover=h?h.n:null;}return;}
    const prev=pts.get(e.pointerId),dx=p[0]-prev[0],dy=p[1]-prev[1];pts.set(e.pointerId,p);moved+=Math.abs(dx)+Math.abs(dy);
    if(pts.size===1){
      if(mode==='undecided'&&moved>7){
        const editing=App.world&&App.phase==='play'&&(App.isBrush()||App.tool.id==='carve'||App.tool.id==='fill')&&!e.shiftKey;
        mode=editing?'stroke':'pan';if(editing)App.strokeStart(start[0],start[1]);
      }
      if(mode==='pan')App.pan(dx,dy);else if(mode==='stroke')App.strokeMove(p[0],p[1]);else if(mode==='orbit')App.rotate(-dx*0.006,-dy*0.005);
    }else if(pts.size===2){
      const a=[...pts.values()],d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]),ang=Math.atan2(a[1][1]-a[0][1],a[1][0]-a[0][0]),cy=(a[0][1]+a[1][1])/2,cx=(a[0][0]+a[1][0])/2;
      if(pinch){
        App.zoom(pinch.d/Math.max(1,d));
        let da=ang-pinch.ang;da=Math.atan2(Math.sin(da),Math.cos(da));
        if(Math.abs(da)<0.5)App.rotate(da,0);
        const mdy=cy-pinch.cy,mdx=cx-pinch.cx;
        if(Math.abs(d-pinch.d)<4&&Math.abs(da)<0.02&&Math.abs(mdy)>Math.abs(mdx))App.rotate(0,-mdy*0.006);     // two-finger vertical drag tilts
        else App.pan(mdx*0.5,mdy*0.5);
      }
      pinch={d,ang,cy,cx};
    }
  });
  const up=e=>{
    if(!pts.has(e.pointerId))return;const p=pts.get(e.pointerId);pts.delete(e.pointerId);
    if(pts.size===0){
      if(mode==='stroke')App.strokeEnd();
      else if(mode==='undecided'&&moved<8&&App.phase==='play')App.tap(p[0],p[1]);      // no time limit: a slow frame must never eat a tap
      mode=null;
    }else if(pts.size===1){mode='pan';pinch=null;}
  };
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('wheel',e=>{e.preventDefault();App.zoom(Math.exp(LW.clamp(e.deltaY,-300,300)*0.0016));},{passive:false});
  cv.addEventListener('dblclick',e=>{const p=xy(e),h=App.groundHit(p[0],p[1]);if(h)App.focusOn(h.n,App.cam.dist*0.35);});
  const keys={};App.keys=keys;
  addEventListener('keydown',e=>{
    if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    keys[e.key.toLowerCase()]=true;
    if(e.key===' '&&App.world){e.preventDefault();App.setSpeed(App.speed?0:1);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&App.world){e.preventDefault();e.shiftKey?App.redo():App.undo();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&App.world){e.preventDefault();App.redo();}
    if(e.key==='Escape'){if(App.tool.id!=='nav')App.setTool('nav');else App.select(null);}
  });
  addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
};
App.keyNav=function(dt){
  const k=App.keys||{},s=dt*420;
  if(k.w||k.arrowup)App.pan(0,s);if(k.s||k.arrowdown)App.pan(0,-s);if(k.a||k.arrowleft)App.pan(s,0);if(k.d||k.arrowright)App.pan(-s,0);
  if(k.q)App.rotate(-dt*1.4,0);if(k.e)App.rotate(dt*1.4,0);if(k.r)App.rotate(0,-dt);if(k.f)App.rotate(0,dt);
  if(k['+']||k['='])App.zoom(Math.exp(-dt*1.6));if(k['-']||k['_'])App.zoom(Math.exp(dt*1.6));
};

// ---- main loop ----------------------------------------------------------------------------------
App.scale=function(){const c=App.cam,w=App.view(),R=w.body.radius;return c.dist>R*0.9?'Orbit':c.dist>R*0.12?'Continent':c.dist>2500?'Region':c.dist>300?'Landscape':c.dist>45?'Settlement':'Home';};
let last=0,fpsT=0,fpsN=0,slow=0,tickN=0,uiT=0,intT=0,saveT=0,audT=0;
App.frame=function(now){
  requestAnimationFrame(App.frame);
  const dt=Math.min(0.1,(now-last)/1000||0.016);last=now;
  const cv=App.canvas,w=App.view();if(!w||App.glLost)return;
  // adaptive graphics: keep the frame near the 33 ms budget by trading resolution and LOD distance
  const q=App.opts.quality,auto=q==='auto';
  if(auto){if(dt>0.040)slow++;else if(dt<0.024)slow--;slow=LW.clamp(slow,-90,90);
    if(slow>40){App.dynQ=Math.max(0.5,(App.dynQ||1)-0.1);slow=0;}else if(slow<-80){App.dynQ=Math.min(1,(App.dynQ||1)+0.05);slow=0;}}
  const qv=auto?(App.dynQ||1):q==='low'?0.55:q==='medium'?0.8:1.05;
  const dpr=Math.min(globalThis.devicePixelRatio||1,qv>0.9?2:1.25)*(qv<0.7?0.75:1),cw=Math.max(2,Math.round(cv.clientWidth*dpr)),chh=Math.max(2,Math.round(cv.clientHeight*dpr));
  if(cv.width!==cw||cv.height!==chh){cv.width=cw;cv.height=chh;}
  App.terrain.quality=qv;
  // simulation: deterministic ticks at the chosen rate, bounded per frame
  if(App.world&&App.speed&&App.phase==='play'){
    App.acc+=dt*App.SPEEDS[App.speed];const t0=performance.now();let n=0;
    while(App.acc>=1&&performance.now()-t0<11){LW.tick(App.world);App.acc-=1;n++;}
    if(App.acc>App.SPEEDS[App.speed])App.acc=0;        // could not keep up: drop the backlog rather than spiral
    tickN+=n;
  }
  if(App.phase!=='play'&&!App.keysDown){App.cam.n=V.norm(V.madd(App.cam.n,LW.frame(App.cam.n).e,dt*0.05));}       // idle spin on the title screen
  App.keyNav(dt);
  const c=App.cam;
  if(App.follow&&App.world){const e=App.world.persons[App.follow]||App.world.organisms[App.follow];if(e&&e.alive!==false){const s=App.scene.rs.get(e.id);c.n=(s?s.n:e.n).slice();c.groundOverride=LW.groundAt(App.world,c.n,e);}else App.follow=null;}
  if(!App.follow)c.groundOverride=null;
  G.camUpdate(w,c,cv.clientWidth,cv.clientHeight,dt);
  App.terrain.update(w,c,Math.max(App.stroke?9:5,Math.min(45,dt*130)));        // slow frames get a bigger build share so detail still converges
  const rings=[];
  if(App.world){
    const s=App.sel;
    if(s){const ww=App.world,e=s.type==='person'?ww.persons[s.id]:s.type==='animal'?ww.organisms[s.id]:null;
      if(e){const st=App.scene.rs.get(e.id);rings.push({n:st?st.n:e.n,r:Math.max(0.7,c.dist*0.012),col:[255,236,150],flat:LW.groundAt(ww,st?st.n:e.n,e)});}
      else if(s.type==='building'&&ww.buildings[s.id])rings.push({n:ww.buildings[s.id].n,r:B.radius(ww.buildings[s.id])+1,col:[150,230,255]});
      else if(s.type==='comp'&&ww.buildings[s.id]){const b=ww.buildings[s.id],cp=B.comp(b,s.cid);if(cp)rings.push({n:B.dir(ww,b,cp.x,cp.z),r:0.8,col:[150,230,255],flat:B.floorY(ww,b)});}
      else if(s.type==='cell'&&s.n)rings.push({n:s.n,r:Math.max(1,c.dist*0.01),col:[255,255,255]});
      else if(s.type==='settlement'&&ww.settlements[s.id])rings.push({n:ww.settlements[s.id].n,r:Math.max(40,c.dist*0.03),col:[255,200,120]});}
    if(App.isBrush()&&(App.hover||App.stroke&&App.stroke.last))rings.push({n:(App.stroke&&App.stroke.last)||App.hover,r:App.tool.r,col:[255,120,90]});
  }
  G.render(w,c,App.terrain,App.scene,dt,{studio:App.opts.studio||App.phase!=='play',clouds:App.opts.clouds,shadows:App.opts.shadows,rings});
  // bookkeeping
  fpsN++;fpsT+=dt;if(fpsT>=0.5){App.stats.fps=fpsN/fpsT;App.stats.ms=fpsT/fpsN*1000;App.stats.ticksPerSec=tickN/fpsT;fpsN=0;fpsT=0;tickN=0;}
  if(now-uiT>250){uiT=now;App.changed('tick');}
  if(now-audT>400&&App.world){audT=now;LW.audio.update(App.world,c,now);}
  if(App.world&&now-intT>2000){intT=now;const it=App.world.interest,r=Math.max(700,c.dist*3);
    if(!it||V.dist(it.n,c.n)*App.world.body.radius>it.r*0.25||r>it.r*2||r<it.r*0.5)App.do('view.interest',{n:c.n.slice(),r},true);}
  if(LW.ui)LW.ui.frameLabels();
  if(App.world&&now-saveT>20000){saveT=now;App.snapshot(false);}
};
App.toastLog=[];
App.toast=function(msg,kind){App.lastToast={msg,kind:kind||'',t:Date.now()};App.toastLog.push(msg);if(App.toastLog.length>20)App.toastLog.shift();App.changed('toast');};
})();
