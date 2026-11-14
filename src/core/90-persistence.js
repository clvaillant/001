// persistence: versioned portable archives, integrity + structural validation, migrations,
// two-generation snapshot recovery and a command journal for acknowledged edits since the last snapshot.
;(function(){'use strict';
const LW=globalThis.LW;
const SV=LW.save={};
SV.MAX_BYTES=96*1024*1024;
SV.MIGRATIONS={};       // {'1.0':world=>world} keyed by source "major.minor"; none needed yet for schema 1.0

SV.pack=function(world){
  const body=LW.canonical(world);
  return '{"format":"living-world-archive","archiveVersion":1,"schema":'+JSON.stringify(world.schema)+',"app":"'+LW.VERSION+'","tick":'+world.tick+
    ',"revision":'+world.revision+',"checksum":"'+LW.checksum(body)+'","world":'+body+'}';
};
const bad=(code,msg)=>{throw new LW.Error(code,msg);};
function scan(o,depth,st){
  if(depth>48)bad('invalid_structure','nesting too deep');
  if(o===null||typeof o!=='object'){if(typeof o==='function')bad('invalid_structure','code is not allowed in a world');if(typeof o==='string'&&o.length>200000)bad('invalid_structure','string too long');return;}
  if(++st.n>6e6)bad('invalid_structure','too many nodes');
  if(Array.isArray(o)){for(let i=0;i<o.length;i++)scan(o[i],depth+1,st);return;}
  for(const k of Object.keys(o)){if(k==='__proto__'||k==='constructor'||k==='prototype')bad('invalid_structure','forbidden key '+k);scan(o[k],depth+1,st);}
}
const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const fin=x=>typeof x==='number'&&isFinite(x);
// explicit schema validation of every persisted collection; throws LW.Error('invalid_structure')
SV.validate=function(w){
  const need=(c,m)=>{if(!c)bad('invalid_structure',m);};
  need(isObj(w)&&w.format==='living-world','not a Living World world');
  need(isObj(w.schema)&&Number.isInteger(w.schema.major)&&Number.isInteger(w.schema.minor),'missing schema version');
  if(w.schema.major>LW.SCHEMA.major)bad('future_version','world was saved by a newer major version ('+w.schema.major+'); this build reads '+LW.SCHEMA.major);
  need(typeof w.id==='string'&&/^[A-Za-z0-9_\-]{1,64}$/.test(w.id),'bad world id');
  need(typeof w.name==='string'&&w.name.length<=60,'bad name');
  for(const k of ['seed','rng','revision','tick','nextId','editSeq','genEpoch','colorEpoch'])need(Number.isInteger(w[k])&&w[k]>=0,'bad '+k);
  need(w.mode==='create'||w.mode==='play','bad mode');
  need(Number.isInteger(w.generatorVersion)&&w.generatorVersion<=LW.GENERATOR_VERSION,'unknown terrain generator version');
  const b=w.body;need(isObj(b)&&b.shape==='sphere'&&isObj(b.gen)&&isObj(b.star)&&isObj(b.atmosphere),'bad body');
  for(const k in LW.BODY_LIMITS)need(fin(b[k])&&b[k]>=LW.BODY_LIMITS[k][0]&&b[k]<=LW.BODY_LIMITS[k][1],'body.'+k+' out of range');
  for(const k of ['seed','landFraction','relief','roughness','continentScale','ridges','terrace','moisture','minerals'])need(fin(b.gen[k]),'bad gen.'+k);
  need(Number.isInteger(b.envN)&&b.envN>=8&&b.envN<=96,'bad envN');
  const C=6*b.envN*b.envN,en=w.env;
  need(isObj(en)&&en.N===b.envN&&Array.isArray(en.veg)&&en.veg.length===C&&Array.isArray(en.vsp)&&en.vsp.length===C&&Array.isArray(en.plants),'bad environment grid');
  need(en.river===null||(Array.isArray(en.river)&&en.river.length===C),'bad water grid');
  need(isObj(en.dirty)&&Array.isArray(en.dirty.causes)&&isObj(en.chg)&&isObj(en.mined),'bad environment state');
  need(Array.isArray(w.protectedGens)&&w.protectedGens.length===w.genEpoch,'bad regeneration history');
  need(Array.isArray(w.terrainEdits)&&w.terrainEdits.length<=20000,'bad terrain edits');
  for(const e of w.terrainEdits)need(isObj(e)&&LW.planet.TOOLS.indexOf(e.tool)>=0&&LW.isDir(e.n)&&fin(e.r)&&e.r>0&&fin(e.s)&&Number.isInteger(e.g)&&e.g<=w.genEpoch,'bad terrain edit');
  for(const k of ['volumes','species','organisms','persons','cohorts','buildings','settlements','households','relationships','activities','receipts','rules','eventArchive'])need(isObj(w[k]),'bad '+k);
  for(const k of ['events','receiptOrder','pending','undo','redo'])need(Array.isArray(w[k]),'bad '+k);
  for(const id in w.species){const e=LW.life.validateSpecies(w.species[id]);need(!e&&w.species[id].id===id,'bad species '+id+(e?': '+e:''));}
  for(const id in w.volumes){const v=w.volumes[id];need(v.id===id&&LW.isDir(v.n)&&Array.isArray(v.ops)&&v.nx>0&&v.nx<=64&&v.ny>0&&v.ny<=64&&v.nz>0&&v.nz<=64&&fin(v.cell)&&fin(v.h0),'bad volume '+id);}
  for(const id in w.buildings){const x=w.buildings[id];need(x.id===id&&LW.isDir(x.n)&&Array.isArray(x.rooms)&&Array.isArray(x.doors)&&Array.isArray(x.comps)&&isObj(x.stock)&&fin(x.progress),'bad building '+id);
    for(const c of x.comps)need(LW.COMPONENTS[c.kind]&&fin(c.x)&&fin(c.z),'bad component in '+id);
    need(!x.settlement||w.settlements[x.settlement],'dangling settlement on '+id);}
  for(const id in w.organisms){const o=w.organisms[id];need(o.id===id&&LW.isDir(o.n)&&w.species[o.speciesId]&&isObj(o.needs),'bad organism '+id);}
  for(const id in w.persons){const p=w.persons[id];
    need(p.id===id&&LW.isDir(p.n)&&w.species[p.speciesId]&&isObj(p.needs)&&isObj(p.traits)&&isObj(p.beliefs)&&isObj(p.mem)&&Array.isArray(p.mem.ep)&&Array.isArray(p.queue)&&Array.isArray(p.goals)&&Array.isArray(p.hist)&&isObj(p.control)&&typeof p.name==='string','bad person '+id);
    need(!p.home||w.buildings[p.home],'dangling home on '+id);need(!p.alive||!p.settlement||w.settlements[p.settlement],'dangling settlement on '+id);}
  for(const id in w.cohorts){const c=w.cohorts[id];need(c.id===id&&w.species[c.speciesId]&&Number.isInteger(c.count)&&c.count>=0&&Number.isInteger(c.cell)&&c.cell>=0&&c.cell<C,'bad cohort '+id);}
  for(const id in w.settlements){const s=w.settlements[id];need(s.id===id&&LW.isDir(s.n)&&Array.isArray(s.members)&&Array.isArray(s.buildings)&&isObj(s.stock)&&Array.isArray(s.techs),'bad settlement '+id);}
  for(const id in w.activities){const e=LW.activities.validate(w.activities[id]);need(!e,'bad activity '+id+': '+e);}
  for(const e of w.events)need(isObj(e)&&typeof e.id==='string'&&typeof e.type==='string'&&Number.isInteger(e.t)&&Array.isArray(e.c),'bad event');
  return true;
};
// parse + verify an archive. Never mutates stored data; returns a fresh world object.
SV.parse=function(text){
  if(typeof text!=='string')bad('not_json','archive must be text');
  if(text.length>SV.MAX_BYTES)bad('too_large','archive exceeds '+SV.MAX_BYTES+' bytes');
  let a;try{a=JSON.parse(text);}catch(e){bad('not_json','archive is not valid JSON');}
  if(!isObj(a)||a.format!=='living-world-archive')bad('bad_format','not a Living World archive');
  if(!isObj(a.schema)||!Number.isInteger(a.schema.major))bad('bad_format','missing schema');
  if(a.schema.major>LW.SCHEMA.major)bad('future_version','archive schema '+a.schema.major+'.x is newer than this build ('+LW.SCHEMA.major+'.x)');
  if(!isObj(a.world))bad('bad_format','missing world');
  scan(a.world,0,{n:0});
  if(typeof a.checksum!=='string'||LW.checksum(LW.canonical(a.world))!==a.checksum)bad('checksum_mismatch','archive is corrupted (checksum mismatch)');
  let w=a.world;
  for(let guard=0;guard<32;guard++){const m=SV.MIGRATIONS[w.schema.major+'.'+w.schema.minor];if(!m)break;w=m(w);}
  SV.validate(w);
  return w;
};

// ---- storage ----------------------------------------------------------------------
// kv = {get(k)->Promise<string|null>, set(k,v), del(k), keys()->Promise<string[]>}
SV.memoryKV=function(){const m=new Map();return {kind:'memory',get:async k=>m.has(k)?m.get(k):null,set:async(k,v)=>{m.set(k,v);},del:async k=>{m.delete(k);},keys:async()=>[...m.keys()],_m:m};};
SV.Store=class{
  constructor(kv){this.kv=kv;this.jn={};this.gen={};}
  async list(){
    const out={};for(const k of await this.kv.keys()){const m=/^w:(.+):g([01])$/.exec(k);if(!m)continue;
      try{const r=JSON.parse(await this.kv.get(k));if(!out[m[1]]||out[m[1]].seq<r.seq)out[m[1]]={id:m[1],seq:r.seq,name:r.name,tick:r.tick,wall:r.wall};}catch(e){}}
    return Object.values(out).sort((a,b)=>(b.wall||0)-(a.wall||0));
  }
  // write the generation NOT holding the newest good snapshot, so an interrupted write can only damage the older one
  async snapshot(world,wall){
    const id=world.id;let g=this.gen[id];
    if(!g){g={gen:1,seq:0};for(const i of [0,1]){try{const r=JSON.parse(await this.kv.get('w:'+id+':g'+i));if(r&&r.seq>g.seq)g={gen:i,seq:r.seq};}catch(e){}}}
    const next={gen:1-g.gen,seq:g.seq+1},jseq=this.jn[id]||0;
    await this.kv.set('w:'+id+':g'+next.gen,JSON.stringify({seq:next.seq,jseq,name:world.name,tick:world.tick,wall:wall||0,text:SV.pack(world)}));
    this.gen[id]=next;
    for(const k of await this.kv.keys()){const m=/^w:(.+):j:(\d+)$/.exec(k);if(m&&m[1]===id&&+m[2]<=jseq)await this.kv.del(k);}
    return next.seq;
  }
  async journal(world,cmd,actor){
    const id=world.id,n=this.jn[id]=(this.jn[id]||0)+1;
    await this.kv.set('w:'+id+':j:'+String(n).padStart(9,'0'),JSON.stringify({n,tick:world.tick,cmd,actor}));
  }
  // load newest valid generation, then replay journaled commands (deterministic: advance to the command's tick, re-dispatch)
  async load(id){
    const cands=[];
    for(const i of [0,1]){const raw=await this.kv.get('w:'+id+':g'+i);if(!raw)continue;
      try{const r=JSON.parse(raw);cands.push({gen:i,seq:r.seq,jseq:r.jseq||0,world:SV.parse(r.text)});}catch(e){cands.push({gen:i,seq:-1,error:e.code||e.message});}}
    const good=cands.filter(c=>c.seq>=0).sort((a,b)=>b.seq-a.seq)[0];
    if(!good)throw new LW.Error('no_valid_save',cands.length?'both save generations are damaged':'no save found');
    const w=good.world,rep={generation:good.gen,seq:good.seq,recoveredFromOlder:cands.some(c=>c.seq<0),replayed:0,failed:0};
    const js=[];for(const k of await this.kv.keys()){const m=/^w:(.+):j:(\d+)$/.exec(k);if(m&&m[1]===id&&+m[2]>good.jseq)js.push(k);}
    js.sort();let maxN=good.jseq;
    const hook=LW.onCommit;LW.onCommit=null;
    try{for(const k of js){let e;try{e=JSON.parse(await this.kv.get(k));}catch(x){rep.failed++;break;}
      maxN=Math.max(maxN,e.n);
      while(w.tick<e.tick)LW.tick(w);
      const r=LW.dispatch(w,e.cmd,e.actor);if(r.ok)rep.replayed++;else{rep.failed++;break;}}}
    finally{LW.onCommit=hook;}
    this.gen[id]={gen:good.gen,seq:good.seq};this.jn[id]=maxN;
    return {world:w,report:rep};
  }
  async remove(id){for(const k of await this.kv.keys())if(k.indexOf('w:'+id+':')===0)await this.kv.del(k);delete this.gen[id];delete this.jn[id];}
  async saveNamed(world,name,wall){
    const n=(await this.snapshots(world.id)).reduce((m,s)=>Math.max(m,s.n),0)+1;
    await this.kv.set('w:'+world.id+':s:'+n,JSON.stringify({n,name,tick:world.tick,wall:wall||0,text:SV.pack(world)}));return n;
  }
  async snapshots(id){
    const out=[];for(const k of await this.kv.keys()){const m=/^w:(.+):s:(\d+)$/.exec(k);if(!m||m[1]!==id)continue;
      try{const r=JSON.parse(await this.kv.get(k));out.push({n:r.n,name:r.name,tick:r.tick,wall:r.wall});}catch(e){}}
    return out.sort((a,b)=>b.n-a.n);
  }
  async restoreNamed(id,n){const raw=await this.kv.get('w:'+id+':s:'+n);if(!raw)throw new LW.Error('no_snapshot');return SV.parse(JSON.parse(raw).text);}
  async deleteNamed(id,n){await this.kv.del('w:'+id+':s:'+n);}
};
})();
