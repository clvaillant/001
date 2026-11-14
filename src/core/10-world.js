// world-core: world record, stable IDs, events with provenance, validated atomic commands,
// durable receipts (idempotency), undo/redo as compensating commands.
;(function(){'use strict';
const LW=globalThis.LW;

LW.defaultBody=function(over,seed){
  const b={id:'body_1',shape:'sphere',radius:16000,gravity:9.8,seaLevel:0,axialTilt:23,yearDays:48,
    star:{color:[1,0.95,0.86],lum:1},
    atmosphere:{density:1,baseTemp:16,color:[0.42,0.66,0.96]},
    gen:{seed:seed>>>0,landFraction:0.42,relief:1,roughness:0.5,continentScale:1.15,ridges:0.7,terrace:0,moisture:0,minerals:0.5},
    envN:40};
  over=over||{};
  for(const k of Object.keys(over)){
    if(over[k]&&typeof over[k]==='object'&&!Array.isArray(over[k])&&b[k])Object.assign(b[k],over[k]);else b[k]=over[k];
  }
  return b;
};
LW.BODY_LIMITS={radius:[1500,2.0e7],gravity:[0.2,40],axialTilt:[0,89],yearDays:[4,2000],seaLevel:[-9000,9000]};

LW.createWorld=function(cfg){
  cfg=cfg||{};const seed=(cfg.seed>>>0)||1;
  const w={format:'living-world',schema:{major:LW.SCHEMA.major,minor:LW.SCHEMA.minor},generatorVersion:LW.GENERATOR_VERSION,
    id:'w_'+seed.toString(36)+'_'+String(cfg.nonce||'0'),name:cfg.name||'New World',seed,rng:(seed^0x9e3779b9)>>>0,
    revision:0,tick:0,nextId:1,mode:'create',
    rules:{envInCreate:true,spread:true,reproduction:true,aging:true,conflict:1,hazards:1,maxAnimals:140},
    body:LW.defaultBody(cfg.body,seed),genEpoch:0,protectedGens:[],
    terrainEdits:[],editSeq:0,volumes:{},env:null,
    species:{},organisms:{},persons:{},cohorts:{},buildings:{},settlements:{},households:{},relationships:{},activities:{},
    events:[],eventArchive:{dropped:0,byType:{}},receipts:{},receiptOrder:[],pending:[],undo:[],redo:[],
    interest:null,colorEpoch:0};
  LW.life.installDefaults(w);
  LW.env.init(w);
  return w;
};

LW.newId=(world,prefix)=>prefix+'_'+(world.nextId++).toString(36);

// ---- events ---------------------------------------------------------------
const KEY_EVENTS={'person.born':1,'person.died':1,'settlement.founded':1,'building.completed':1,'tech.discovered':1,
  'world.created':1,'world.play':1,'river.dried':1,'river.formed':1,'partnership':1,'world.regenerated':1};
LW.emit=function(world,type,data,causes,refs){
  const e={id:'e'+(world.nextId++).toString(36),t:world.tick,type,d:data||{},c:(causes||[]).filter(Boolean),r:refs||{}};
  world.events.push(e);
  if(world.events.length>5000)compactEvents(world);
  return e.id;
};
function compactEvents(world){
  // tiered history: oldest ordinary events are folded into counts; key events are retained longer
  const ar=world.eventArchive,keep=[];let removed=0;
  for(let i=0;i<world.events.length;i++){
    const e=world.events[i];
    if(i<2500&&!(KEY_EVENTS[e.type]&&removed<2200)){ar.byType[e.type]=(ar.byType[e.type]||0)+1;ar.dropped++;removed++;}
    else keep.push(e);
  }
  world.events=keep;
}
LW.findEvent=function(world,id){const ev=world.events;for(let i=ev.length-1;i>=0;i--)if(ev[i].id===id)return ev[i];return null;};
// causal chain for the inspector: walks cause links breadth-first (bounded)
LW.causalChain=function(world,id,max){
  const out=[],seen={};let q=[id];max=max||12;
  while(q.length&&out.length<max){const e=LW.findEvent(world,q.shift());if(!e||seen[e.id])continue;seen[e.id]=1;out.push(e);q=q.concat(e.c);}
  return out;
};

// ---- actors / permissions --------------------------------------------------
LW.LOCAL_ACTOR={id:'local',role:'owner'};
const RANK={visitor:0,editor:1,owner:2},NEED={view:0,edit:1,control:1,owner:2};
LW.can=(actor,perm)=>(RANK[actor.role]||0)>=(NEED[perm]===undefined?1:NEED[perm]);

// ---- commands ---------------------------------------------------------------
LW.commands={};
LW.def=function(type,def){LW.commands[type]=def;};
LW.idPrefix='k';let seq=0;
LW.cmd=function(world,type,payload,extra){
  return Object.assign({worldId:world.id,commandId:LW.idPrefix+'_'+(++seq).toString(36),expectedRevision:world.revision,payloadVersion:1,type,payload:payload||{}},extra||{});
};
const fail=(code,error)=>({ok:false,code,error:error||code});
LW.dispatch=function(world,cmd,actor){
  actor=actor||LW.LOCAL_ACTOR;
  if(!cmd||typeof cmd!=='object')return fail('bad_command');
  if(cmd.worldId!==world.id)return fail('wrong_world','command addressed to another world');
  if(typeof cmd.commandId!=='string'||!cmd.commandId||cmd.commandId.length>96)return fail('bad_command_id');
  if(cmd.payloadVersion!==1)return fail('bad_payload_version');
  const def=LW.commands[cmd.type];
  if(!def)return fail('unknown_command',String(cmd.type));
  const p=cmd.payload&&typeof cmd.payload==='object'?cmd.payload:{};
  const h=LW.hashStr(cmd.type+'|'+LW.canonical(p));
  const prev=world.receipts[cmd.commandId];
  if(prev){
    if(prev.h===h)return {ok:true,duplicate:true,receipt:prev,result:prev.result};
    return fail('command_id_reuse','same commandId with different content');
  }
  if(cmd.preconditions&&cmd.preconditions.exactRevision&&cmd.expectedRevision!==world.revision)return fail('revision_conflict','expected '+cmd.expectedRevision+' have '+world.revision);
  if(!LW.can(actor,def.perm||'edit'))return fail('forbidden','role '+actor.role+' may not '+cmd.type);
  let err=null;
  try{err=def.validate?def.validate(world,p,actor):null;}catch(e){err='validation error: '+e.message;}
  if(err)return fail('invalid',err);
  const ctx={actor,cmd,evt:null};
  let res;
  try{res=def.apply(world,p,ctx)||{};}
  catch(e){world.fault=(world.fault||0)+1;return fail('apply_exception',e&&e.message);}
  world.revision++;
  const receipt={id:cmd.commandId,h,rev:world.revision,tick:world.tick,type:cmd.type,result:res.public||{}};
  world.receipts[cmd.commandId]=receipt;world.receiptOrder.push(cmd.commandId);
  if(world.receiptOrder.length>3000){const old=world.receiptOrder.splice(0,500);for(const k of old)delete world.receipts[k];}
  if(res.undo&&!cmd.noUndo){
    const top=world.undo[world.undo.length-1];
    if(!(res.gid&&top&&top.gid===res.gid)){
      world.undo.push({label:res.label||cmd.type,tick:world.tick,gid:res.gid||null,undo:res.undo});
      if(world.undo.length>80)world.undo.shift();
    }
    world.redo=[];
  }
  if(LW.onCommit)LW.onCommit(world,cmd,actor,receipt);
  return {ok:true,receipt,result:receipt.result,inverse:res.undo||null,label:res.label};
};
function internalCmd(world,spec){
  return {worldId:world.id,commandId:'u_'+world.revision+'_'+world.nextId,expectedRevision:world.revision,payloadVersion:1,type:spec.type,payload:spec.payload,noUndo:true};
}
// Undo is a compensating command: it reverts the edit itself, never the consequences already simulated.
LW.undoInfo=function(world){
  const e=world.undo[world.undo.length-1];if(!e)return null;
  const dt=world.tick-e.tick;
  return {label:e.label,ticksSince:dt,warning:dt>0?'Time has advanced '+dt+' ticks since this edit. Undo reverts the edit only; consumed resources, events and memories that followed are kept. Restore a snapshot to rewind history.':null};
};
LW.undo=function(world,actor){
  const e=world.undo.pop();if(!e)return fail('nothing_to_undo');
  const r=LW.dispatch(world,internalCmd(world,e.undo),actor);
  if(!r.ok){world.undo.push(e);return r;}
  if(r.inverse)world.redo.push({label:e.label,tick:world.tick,gid:e.gid,undo:r.inverse});
  return r;
};
LW.redo=function(world,actor){
  const e=world.redo.pop();if(!e)return fail('nothing_to_redo');
  const r=LW.dispatch(world,internalCmd(world,e.undo),actor);
  if(!r.ok){world.redo.push(e);return r;}
  if(r.inverse)world.undo.push({label:e.label,tick:world.tick,gid:e.gid,undo:r.inverse});
  return r;
};

// ---- time helpers -----------------------------------------------------------
LW.dayOf=w=>Math.floor(w.tick/LW.TPD);
LW.yearOf=w=>Math.floor(w.tick/(LW.TPD*w.body.yearDays));
LW.ticksPerYear=w=>LW.TPD*w.body.yearDays;
// star direction in the planet-fixed frame (the planet spins, so the star circles the Y axis)
LW.sunDir=function(w,tick){
  tick=tick===undefined?w.tick:tick;
  const day=(tick%LW.TPD)/LW.TPD,yr=(tick%LW.ticksPerYear(w))/LW.ticksPerYear(w);
  const decl=w.body.axialTilt*Math.PI/180*Math.sin(yr*2*Math.PI),th=-day*2*Math.PI,c=Math.cos(decl);
  return [c*Math.cos(th),Math.sin(decl),c*Math.sin(th)];
};
LW.hourAt=function(w,n){
  const s=LW.sunDir(w),d=Math.atan2(n[2],n[0])-Math.atan2(s[2],s[0]);
  let h=12-d/(2*Math.PI)*24;h=((h%24)+24)%24;return h;
};
LW.clockText=function(w){
  const h=Math.floor((w.tick%LW.TPD)/LW.TPH),m=Math.floor((w.tick%LW.TPH)/4);
  return 'Year '+(LW.yearOf(w)+1)+' · Day '+(LW.dayOf(w)%w.body.yearDays+1)+' · '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
};

// ---- world-level commands ---------------------------------------------------
const num=(x,a,b)=>typeof x==='number'&&isFinite(x)&&x>=a&&x<=b;
LW.isDir=n=>Array.isArray(n)&&n.length===3&&n.every(x=>typeof x==='number'&&isFinite(x))&&Math.abs(LW.V.len(n)-1)<1e-3;
LW.def('world.setMode',{perm:'owner',
  validate:(w,p)=>(p.mode==='play'||p.mode==='create')?null:'mode must be play or create',
  apply(w,p){const old=w.mode;w.mode=p.mode;if(old!==p.mode)LW.emit(w,p.mode==='play'?'world.play':'world.create',{});return {public:{mode:w.mode}};}});
LW.def('world.setRules',{perm:'owner',
  validate(w,p){for(const k of Object.keys(p))if(!(k in w.rules))return 'unknown rule '+k;return null;},
  apply(w,p){const old={};for(const k of Object.keys(p)){old[k]=w.rules[k];w.rules[k]=p[k];}return {undo:{type:'world.setRules',payload:old},label:'Change rules'};}});
LW.def('world.rename',{perm:'owner',validate:(w,p)=>typeof p.name==='string'&&p.name.length>0&&p.name.length<=60?null:'bad name',
  apply(w,p){const old=w.name;w.name=p.name;return {undo:{type:'world.rename',payload:{name:old}},label:'Rename world'};}});
// body patch: sea level, tilt, atmosphere... (typed + range checked)
LW.def('world.setBody',{perm:'edit',
  validate(w,p){
    for(const k of Object.keys(p)){
      if(k==='baseTemp'){if(!num(p[k],-120,120))return 'baseTemp out of range';}
      else if(k==='atmDensity'){if(!num(p[k],0,5))return 'atmDensity out of range';}
      else if(k==='starLum'){if(!num(p[k],0.1,4))return 'starLum out of range';}
      else if(k==='starColor'||k==='atmColor'){if(!Array.isArray(p[k])||p[k].length!==3||!p[k].every(x=>num(x,0,1)))return k+' must be rgb 0..1';}
      else if(LW.BODY_LIMITS[k]){if(k==='radius')return 'radius is fixed after creation';if(!num(p[k],LW.BODY_LIMITS[k][0],LW.BODY_LIMITS[k][1]))return k+' out of range';}
      else return 'unknown body field '+k;
    }return null;},
  apply(w,p,ctx){
    const b=w.body,old={};
    const get=k=>k==='baseTemp'?b.atmosphere.baseTemp:k==='atmDensity'?b.atmosphere.density:k==='starLum'?b.star.lum:k==='starColor'?b.star.color.slice():k==='atmColor'?b.atmosphere.color.slice():b[k];
    const set=(k,v)=>{if(k==='baseTemp')b.atmosphere.baseTemp=v;else if(k==='atmDensity')b.atmosphere.density=v;else if(k==='starLum')b.star.lum=v;else if(k==='starColor')b.star.color=v;else if(k==='atmColor')b.atmosphere.color=v;else b[k]=v;};
    for(const k of Object.keys(p)){old[k]=get(k);set(k,p[k]);}
    const ev=LW.emit(w,'world.bodyChanged',{fields:Object.keys(p)});
    LW.env.markAllDirty(w,ev);w.colorEpoch++;
    return {undo:{type:'world.setBody',payload:old},label:'Planet settings',gid:p.gid};}});
// selective regeneration: new procedural base everywhere EXCEPT regions the player edited by hand
LW.def('world.regenerate',{perm:'edit',
  validate(w,p){if(!num(p.seed,0,4294967295))return 'seed required';
    if(p.gen)for(const k of Object.keys(p.gen)){if(!(k in w.body.gen)||k==='seed')return 'unknown gen field '+k;if(!num(p.gen[k],-10,10))return 'bad '+k;}
    return null;},
  apply(w,p){
    const old=LW.clone(w.body.gen);
    w.protectedGens.push(old);w.genEpoch=w.protectedGens.length;
    w.body.gen=Object.assign(LW.clone(old),p.gen||{},{seed:p.seed>>>0});
    const ev=LW.emit(w,'world.regenerated',{seed:p.seed>>>0,protectedEdits:w.terrainEdits.length});
    LW.planet.invalidate(w);LW.env.markAllDirty(w,ev);w.colorEpoch++;
    return {public:{epoch:w.genEpoch},undo:{type:'world.regenRevert',payload:{}},label:'Regenerate terrain'};}});
LW.def('world.regenRevert',{perm:'edit',
  validate:w=>w.protectedGens.length&&!w.terrainEdits.some(e=>e.g>=w.genEpoch)?null:'cannot revert: edits were made after regeneration',
  apply(w){
    const cur=LW.clone(w.body.gen);w.body.gen=w.protectedGens.pop();w.genEpoch=w.protectedGens.length;
    const ev=LW.emit(w,'world.regenerated',{reverted:true});
    LW.planet.invalidate(w);LW.env.markAllDirty(w,ev);w.colorEpoch++;
    return {undo:{type:'world.regenerate',payload:{seed:cur.seed,gen:(()=>{const g=LW.clone(cur);delete g.seed;return g;})()}},label:'Regenerate terrain'};}});
// interest region: which part of the world is simulated at full individual detail
LW.def('view.interest',{perm:'view',
  validate:(w,p)=>LW.isDir(p.n)&&num(p.r,10,1e8)?null:'bad interest',
  apply(w,p){w.interest={n:p.n.slice(),r:p.r};return {};}});
// explicit, idempotent time advancement (catch-up, tests, LAN owner clock)
LW.def('time.advance',{perm:'owner',
  validate:(w,p)=>Number.isInteger(p.ticks)&&p.ticks>0&&p.ticks<=LW.TPD*400?null:'ticks must be 1..'+LW.TPD*400,
  apply(w,p){const t0=w.tick;for(let i=0;i<p.ticks;i++)LW.tick(w);return {public:{from:t0,to:w.tick}};}});
})();
