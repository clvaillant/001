// entities: species configurations, persistent organisms, lifecycle, animal behaviour, population cohorts.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V,E=LW.env;
const L=LW.life={};

const SP=(id,kind,name,o)=>Object.assign({id,kind,name},o);
L.DEFAULT_SPECIES=[
  SP('sp_grass','plant','Meadow grass',{plant:{tree:false,form:'grass'},body:{c1:[122,168,74]},climate:{t:[2,30],m:[0.28,0.95]},lifecycle:{repro:'seed'}}),
  SP('sp_broadleaf','plant','Roundleaf tree',{plant:{tree:true,form:'broadleaf'},body:{c1:[70,140,72]},climate:{t:[6,26],m:[0.5,1]},lifecycle:{repro:'seed'}}),
  SP('sp_spire','plant','Spire pine',{plant:{tree:true,form:'conifer'},body:{c1:[44,104,84]},climate:{t:[-6,16],m:[0.4,1]},lifecycle:{repro:'seed'}}),
  SP('sp_succulent','plant','Dune succulent',{plant:{tree:true,form:'cactus'},body:{c1:[120,160,96]},climate:{t:[14,40],m:[0.03,0.4]},lifecycle:{repro:'seed'}}),
  SP('sp_glowcap','plant','Glowcap (alien fungus)',{plant:{tree:true,form:'glowcap'},body:{c1:[150,90,200]},climate:{t:[-12,22],m:[0.3,1]},lifecycle:{repro:'spore'}}),
  SP('sp_crystal','plant','Crystal bloom (mineral life)',{plant:{tree:true,form:'crystal'},body:{c1:[110,220,230]},climate:{t:[-40,60],m:[0,0.5]},lifecycle:{repro:'spore'}}),
  SP('sp_grazer','animal','Plains grazer',{body:{plan:'quadruped',size:1.3,legs:4,arms:0,tail:1,wings:0,head:0.4,c1:[176,128,84],c2:[236,220,190]},senses:{sight:70},move:{speed:0.9,swim:false,fly:false},diet:'herb',
    lifecycle:{span:12,mature:1.5,repro:'sexual',gest:12,litter:1},climate:{t:[-5,34],m:[0.1,1]},voice:{pitch:190,rough:0.3}}),
  SP('sp_hopper','animal','Burrow hopper',{body:{plan:'biped',size:0.45,legs:2,arms:0,tail:1,wings:0,head:0.5,c1:[200,190,150],c2:[120,100,80]},senses:{sight:40},move:{speed:1.1,swim:false,fly:false},diet:'herb',
    lifecycle:{span:5,mature:0.5,repro:'sexual',gest:5,litter:3},climate:{t:[-8,36],m:[0.05,1]},voice:{pitch:900,rough:0.1}}),
  SP('sp_stalker','animal','Ridge stalker',{body:{plan:'quadruped',size:1.0,legs:4,arms:0,tail:1,wings:0,head:0.45,c1:[80,74,96],c2:[220,150,60]},senses:{sight:110},move:{speed:1.3,swim:false,fly:false},diet:'carn',
    lifecycle:{span:10,mature:1.5,repro:'sexual',gest:14,litter:2},climate:{t:[-10,34],m:[0.05,1]},voice:{pitch:120,rough:0.8}}),
  SP('sp_skimmer','animal','Sky skimmer',{body:{plan:'avian',size:0.5,legs:2,arms:0,tail:1,wings:2,head:0.35,c1:[230,230,240],c2:[240,120,90]},senses:{sight:160},move:{speed:1.8,swim:false,fly:true},diet:'herb',
    lifecycle:{span:8,mature:1,repro:'sexual',gest:6,litter:2},climate:{t:[-5,36],m:[0.1,1]},voice:{pitch:1500,rough:0.05}}),
  SP('sp_crawler','animal','Six-legged shard crawler (alien)',{body:{plan:'hexapod',size:0.8,legs:6,arms:0,tail:0,wings:0,head:0.3,c1:[60,170,170],c2:[240,230,120]},senses:{sight:50},move:{speed:0.7,swim:true,fly:false},diet:'herb',
    lifecycle:{span:20,mature:2,repro:'asexual',gest:10,litter:1},climate:{t:[-30,50],m:[0,1]},voice:{pitch:320,rough:0.9}}),
  SP('sp_human','person','Human',{body:{plan:'biped',size:1.7,legs:2,arms:2,tail:0,wings:0,head:0.25,c1:[200,150,120],c2:[70,90,150]},senses:{sight:140},move:{speed:0.75,swim:false,fly:false},manip:1,diet:'omni',
    lifecycle:{span:70,mature:16,repro:'sexual',gest:30,litter:1},climate:{t:[-5,38],m:[0,1]},voice:{pitch:170,rough:0.2},caps:['speak','tool','build','farm']}),
  SP('sp_velari','person','Velari (four-armed alien)',{body:{plan:'biped',size:2.1,legs:2,arms:4,tail:1,wings:0,head:0.2,c1:[110,150,200],c2:[230,200,110]},senses:{sight:220},move:{speed:0.85,swim:true,fly:false},manip:1,diet:'herb',
    lifecycle:{span:140,mature:25,repro:'sexual',gest:60,litter:1},climate:{t:[-30,25],m:[0,1]},voice:{pitch:90,rough:0.5},caps:['speak','tool','build','farm']}),
  SP('sp_automaton','person','Automaton (artificial life)',{body:{plan:'biped',size:1.5,legs:2,arms:2,tail:0,wings:0,head:0.3,c1:[170,176,186],c2:[250,190,70]},senses:{sight:180},move:{speed:0.7,swim:false,fly:false},manip:1,diet:'energy',
    lifecycle:{span:400,mature:0,repro:'assembly',gest:20,litter:1},climate:{t:[-80,90],m:[0,1]},voice:{pitch:260,rough:1},caps:['speak','tool','build']})];
L.installDefaults=function(world){for(const s of L.DEFAULT_SPECIES)world.species[s.id]=LW.clone(s);};

const numIn=(x,a,b)=>typeof x==='number'&&isFinite(x)&&x>=a&&x<=b;
L.validateSpecies=function(s){
  if(!s||typeof s!=='object')return 'species must be an object';
  if(typeof s.id!=='string'||!/^sp_[a-z0-9_]{1,24}$/.test(s.id))return 'id must look like sp_name';
  if(['plant','animal','person'].indexOf(s.kind)<0)return 'kind must be plant, animal or person';
  if(typeof s.name!=='string'||!s.name||s.name.length>48)return 'bad name';
  const b=s.body||{};if(!Array.isArray(b.c1)||b.c1.length!==3)return 'body.c1 colour required';
  if(!s.climate||!Array.isArray(s.climate.t)||!Array.isArray(s.climate.m))return 'climate ranges required';
  if(s.kind!=='plant'){
    if(['biped','quadruped','hexapod','avian','serpent','blob'].indexOf(b.plan)<0)return 'unknown body plan';
    if(!numIn(b.size,0.1,12)||!numIn(b.legs,0,8)||!numIn(b.arms,0,6)||!numIn(b.head,0.05,1))return 'anatomy out of range';
    if(!s.move||!numIn(s.move.speed,0.05,6))return 'move.speed out of range';
    if(['herb','carn','omni','energy'].indexOf(s.diet)<0)return 'unknown diet';
    const lc=s.lifecycle||{};if(!numIn(lc.span,0.2,5000)||!numIn(lc.mature,0,2000)||['sexual','asexual','assembly','none'].indexOf(lc.repro)<0)return 'bad lifecycle';
    if(!s.senses||!numIn(s.senses.sight,5,2000))return 'senses.sight out of range';
  }else if(!s.plant||['grass','broadleaf','conifer','cactus','glowcap','crystal'].indexOf(s.plant.form)<0)return 'unknown plant form';
  return null;
};
LW.def('life.defineSpecies',{perm:'edit',
  validate(w,p){const e=L.validateSpecies(p.species);if(e)return e;if(Object.keys(w.species).length>=80&&!w.species[p.species.id])return 'species limit reached';return null;},
  apply(w,p){const old=w.species[p.species.id];w.species[p.species.id]=LW.clone(p.species);w.colorEpoch++;
    LW.emit(w,'species.defined',{id:p.species.id});
    return {public:{id:p.species.id},undo:old?{type:'life.defineSpecies',payload:{species:old}}:null,label:'Define species'};}});

const SYL=['ka','ri','mo','te','lu','sa','ni','vo','el','an','ur','ys','de','ha','wen','tor','mi','la','gar','osh','ib','fen','ru','qua'];
L.makeName=function(world){let s='';const k=2+LW.randInt(world,2);for(let i=0;i<k;i++)s+=LW.pick(world,SYL);return s[0].toUpperCase()+s.slice(1);};
L.ageYears=(world,o)=>(world.tick-o.born)/LW.ticksPerYear(world);
L.isMature=(world,o,sp)=>L.ageYears(world,o)>=sp.lifecycle.mature;

L.newOrganism=function(world,sp,n,ageY){
  const o={id:LW.newId(world,'o'),kind:'animal',speciesId:sp.id,n:n.slice(),face:LW.rand(world)*6.28,born:world.tick-Math.round((ageY===undefined?sp.lifecycle.mature*(1+LW.rand(world)):ageY)*LW.ticksPerYear(world)),
    sex:LW.rand(world)<0.5?'f':'m',needs:{hunger:80,thirst:80,energy:80},health:100,st:'idle',alive:true,named:false,lf:0.85+LW.rand(world)*0.3,home:n.slice(),preg:0};
  world.organisms[o.id]=o;return o;
};
LW.def('life.spawn',{perm:'edit',
  validate(w,p){const sp=w.species[p.speciesId];if(!sp||sp.kind==='plant')return 'unknown animal/person species';
    if(!LW.isDir(p.n))return 'bad n';
    const cnt=p.count||1;if(!Number.isInteger(cnt)||cnt<1||cnt>24)return 'count 1..24';
    if(LW.planet.height(w,p.n)<LW.planet.waterLevel(w,p.n)-0.5&&!sp.move.swim&&!sp.move.fly)return 'this species cannot live in water';
    if(sp.kind==='person'&&Object.keys(w.persons).length+cnt>400)return 'detailed-person limit reached (400)';
    return null;},
  apply(w,p){
    const sp=w.species[p.speciesId],ids=[],cnt=p.count||1;
    for(let i=0;i<cnt;i++){
      const n=i===0?p.n:LW.offsetDir(p.n,(LW.rand(w)-0.5)*14,(LW.rand(w)-0.5)*14,w.body.radius);
      if(sp.kind==='person'){const q=LW.mind.newPerson(w,sp,n,{name:i===0?p.name:undefined,age:p.age});ids.push(q.id);}
      else if(Object.keys(w.organisms).length<w.rules.maxAnimals)ids.push(L.newOrganism(w,sp,n).id);
      else L.addToCohort(w,sp.id,E.cellOf(w,n),1);
    }
    const ev=LW.emit(w,'life.introduced',{species:sp.id,count:cnt,ids},[],{n:p.n,e:ids});
    for(const id of ids)if(w.persons[id])w.persons[id].hist.push(ev);
    return {public:{ids,event:ev},undo:{type:'life.remove',payload:{ids}},label:'Introduce '+sp.name};}});
LW.def('life.remove',{perm:'edit',validate:(w,p)=>Array.isArray(p.ids)&&p.ids.length?null:'ids required',
  apply(w,p){
    for(const id of p.ids){
      if(w.organisms[id])delete w.organisms[id];
      else if(w.persons[id]){const q=w.persons[id];LW.mind.interrupt(w,q,'removed');LW.society.detach(w,q);delete w.persons[id];}
    }
    LW.emit(w,'life.removed',{ids:p.ids});return {label:'Remove life'};}});
LW.def('life.name',{perm:'edit',validate:(w,p)=>(w.organisms[p.id]||w.persons[p.id])&&typeof p.name==='string'&&p.name.length>0&&p.name.length<=32?null:'bad rename',
  apply(w,p){const o=w.organisms[p.id]||w.persons[p.id],old=o.name;o.name=p.name;o.named=true;return {undo:old?{type:'life.name',payload:{id:p.id,name:old}}:null,label:'Rename'};}});

// ---- cohorts: anonymous distant populations -------------------------------------
L.addToCohort=function(world,speciesId,cell,count,settlement){
  let c=null;for(const id in world.cohorts){const x=world.cohorts[id];if(x.speciesId===speciesId&&x.cell===cell&&(x.settlement||null)===(settlement||null)){c=x;break;}}
  if(!c){c={id:LW.newId(world,'co'),speciesId,cell,count:0,acc:0,settlement:settlement||null,promoted:0};world.cohorts[c.id]=c;}
  c.count+=count;return c;
};
LW.def('life.spawnCohort',{perm:'edit',
  validate(w,p){const sp=w.species[p.speciesId];if(!sp||sp.kind==='plant')return 'unknown species';if(!LW.isDir(p.n))return 'bad n';
    if(!Number.isInteger(p.count)||p.count<1||p.count>100000)return 'count 1..100000';return null;},
  apply(w,p){const s=w.species[p.speciesId].kind==='person'?LW.society.nearestSettlement(w,p.n,400):null;
    const c=L.addToCohort(w,p.speciesId,E.cellOf(w,p.n),p.count,s?s.id:null);
    const ev=LW.emit(w,'cohort.introduced',{id:c.id,species:p.speciesId,count:p.count},[],{n:p.n});
    return {public:{id:c.id,event:ev},label:'Introduce population'};}});
// Promote one anonymous member to a persistent individual. Debits the cohort exactly once: a retried
// command returns the stored receipt (see dispatch) and never creates a second individual.
LW.def('life.promote',{perm:'edit',
  validate(w,p){const c=w.cohorts[p.cohortId];if(!c)return 'no such cohort';if(c.count<1)return 'cohort is empty';
    if(w.species[c.speciesId].kind==='person'&&Object.keys(w.persons).length>=400)return 'detailed-person limit reached';return null;},
  apply(w,p){
    const c=w.cohorts[p.cohortId],sp=w.species[c.speciesId],d=E.d(w);
    const n=LW.offsetDir([d.dirs[c.cell*3],d.dirs[c.cell*3+1],d.dirs[c.cell*3+2]],(LW.rand(w)-0.5)*40,(LW.rand(w)-0.5)*40,w.body.radius);
    c.count-=1;c.promoted+=1;
    let ent;
    if(sp.kind==='person'){ent=LW.mind.newPerson(w,sp,c.settlement&&w.settlements[c.settlement]?LW.offsetDir(w.settlements[c.settlement].n,(LW.rand(w)-0.5)*20,(LW.rand(w)-0.5)*20,w.body.radius):n,{});
      ent.origin={cohort:c.id,unknownPast:true};   // their earlier life was never simulated in detail and is recorded as unknown, not invented
      if(c.settlement&&w.settlements[c.settlement])LW.society.join(w,ent,w.settlements[c.settlement]);}
    else{ent=L.newOrganism(w,sp,n);ent.named=true;}
    const ev=LW.emit(w,'cohort.promoted',{cohort:c.id,id:ent.id,remaining:c.count},[],{e:[ent.id]});
    if(ent.hist)ent.hist.push(ev);
    return {public:{id:ent.id,remaining:c.count,event:ev}};}});

// ---- movement shared by animals and people ----------------------------------------
L.canEnter=function(world,n,sp){
  if(sp.move.swim||sp.move.fly)return true;
  return LW.planet.height(world,n)>=LW.planet.waterLevel(world,n)-0.7;
};
// step toward target by dist metres. returns remaining distance, or -1 when blocked by water/rock
L.stepToward=function(world,ent,target,dist,sp){
  const R=world.body.radius,d=LW.arcDist(ent.n,target,R);
  if(d<1e-6)return 0;
  const k=Math.min(1,dist/d),nn=V.norm(V.lerp(ent.n,target,k));
  if(!L.canEnter(world,nn,sp))return -1;
  const vl=LW.volumes.at(world,nn);
  if(vl){
    const y0=typeof ent.y==='number'?ent.y:LW.planet.height(world,ent.n),g=LW.volumes.groundY(world,vl.v,vl.x,vl.z,y0+1.7);
    if(g===null||g-y0>1.7)return -1;                       // a wall of rock: real collision with the carved volume
    ent.y=g;
  }else if(typeof ent.y==='number')ent.y=null;
  const f=LW.frame(ent.n),dx=V.dot(V.sub(target,ent.n),f.e),dz=V.dot(V.sub(target,ent.n),f.t);
  ent.face=Math.atan2(dx,dz);ent.n=nn;
  return d*(1-k);
};

L.die=function(world,o,cause,causes){
  o.alive=false;
  LW.emit(world,'animal.died',{id:o.id,species:o.speciesId,cause},causes||[],{n:o.n,e:[o.id]});
  delete world.organisms[o.id];
};
function nearestOrg(world,o,maxD,pred){
  let best=null,bd=maxD;const R=world.body.radius;
  for(const id in world.organisms){const x=world.organisms[id];if(x===o||!pred(x))continue;const d=V.dist(x.n,o.n)*R;if(d<bd){bd=d;best=x;}}
  return best?{o:best,d:bd}:null;
}
L.tickAnimal=function(world,o,dt){
  const sp=world.species[o.speciesId];if(!sp){delete world.organisms[o.id];return;}
  const N=o.needs,R=world.body.radius,d=E.d(world),c=E.cellOf(world,o.n);
  if(sp.diet!=='energy'){N.hunger-=0.02*dt;N.thirst-=0.028*dt;}
  N.energy-=0.03*dt;
  if(N.hunger<=0||N.thirst<=0)o.health-=0.15*dt;else if(o.health<100)o.health=Math.min(100,o.health+0.03*dt);
  N.hunger=Math.max(0,N.hunger);N.thirst=Math.max(0,N.thirst);N.energy=Math.max(0,N.energy);
  if(o.health<=0)return L.die(world,o,N.thirst<=0?'thirst':'starvation',[world.env.chg[c]]);
  if(world.rules.aging&&L.ageYears(world,o)>sp.lifecycle.span*o.lf)return L.die(world,o,'old age');
  const step=sp.move.speed*dt,hour=LW.hourAt(world,o.n),night=hour<5||hour>21.5;
  if(sp.diet!=='carn'){
    const pr=nearestOrg(world,o,sp.senses.sight,x=>world.species[x.speciesId].diet==='carn'&&x.needs.hunger<60);
    if(pr){o.st='flee';L.stepToward(world,o,V.norm(V.madd(o.n,V.sub(o.n,pr.o.n),1)),step*1.5,sp);return;}
  }
  if(o.st==='rest'){N.energy=Math.min(100,N.energy+0.14*dt);if((N.energy>90&&!night)||N.thirst<22||N.hunger<15)o.st='idle';else return;}
  const cellN=k=>[d.dirs[k*3],d.dirs[k*3+1],d.dirs[k*3+2]];
  if(N.thirst<40){
    if(E.fresh(world,c)){N.thirst=100;o.st='drink';return;}
    let t=-1;for(let k=0;k<4;k++){const b=d.nb[c*4+k];if(E.fresh(world,b)){t=b;break;}}
    if(t<0)t=d.to[c]>=0&&d.h[d.to[c]]>=world.body.seaLevel?d.to[c]:d.nb[c*4+LW.randInt(world,4)];   // instinct: water lies downhill
    o.st='seek water';if(L.stepToward(world,o,cellN(t),step,sp)<0)o.face+=1.5;return;
  }
  if(N.hunger<55){
    if(sp.diet==='carn'){
      const pr=nearestOrg(world,o,sp.senses.sight*3,x=>world.species[x.speciesId].diet!=='carn'&&world.species[x.speciesId].body.size<=sp.body.size*1.6);
      if(pr){o.st='hunt';
        if(pr.d<2.5+step*1.6){N.hunger=100;const ev=LW.emit(world,'animal.hunted',{by:o.id,prey:pr.o.id},[],{n:o.n,e:[o.id]});L.die(world,pr.o,'predation',[ev]);}
        else L.stepToward(world,o,pr.o.n,step*1.6,sp);
        return;}
    }else if(world.env.veg[c]>4){
      o.st='graze';N.hunger=Math.min(100,N.hunger+5*dt);
      if(LW.rand(world)<0.04*dt)world.env.veg[c]--;                      // grazing really consumes vegetation
      return;
    }else{
      let t=d.nb[c*4+LW.randInt(world,4)],bv=-1;for(let k=0;k<4;k++){const b=d.nb[c*4+k];if(world.env.veg[b]>bv){bv=world.env.veg[b];t=b;}}
      o.st='seek food';if(L.stepToward(world,o,cellN(t),step,sp)<0)o.face+=1.5;return;
    }
  }
  if(N.energy<22||(night&&!sp.nocturnal&&N.thirst>=40)){o.st='rest';return;}
  const lc=sp.lifecycle;
  if(world.rules.reproduction&&!o.preg&&N.hunger>60&&L.isMature(world,o,sp)&&(lc.repro==='asexual'||o.sex==='f')&&LW.rand(world)<0.002*dt){
    const mate=lc.repro==='asexual'?true:nearestOrg(world,o,sp.senses.sight,x=>x.speciesId===o.speciesId&&x.sex==='m'&&L.isMature(world,x,sp));
    if(mate){o.preg=1;world.pending.push({id:LW.newId(world,'pw'),due:world.tick+lc.gest*LW.TPD,type:'birth',mother:o.id});}
  }
  o.st='wander';
  const a=o.face+(LW.rand(world)-0.5)*1.2,home=LW.arcDist(o.n,o.home,R)>400;
  const t=home?o.home:LW.offsetDir(o.n,Math.sin(a)*20,Math.cos(a)*20,R);
  if(L.stepToward(world,o,t,step*0.5,sp)<0)o.face+=2;
};
L.birth=function(world,pw){
  const m=world.organisms[pw.mother];if(!m||!m.alive)return;
  const sp=world.species[m.speciesId];m.preg=0;const ids=[];
  for(let i=0;i<(sp.lifecycle.litter||1);i++){
    if(Object.keys(world.organisms).length<world.rules.maxAnimals){const k=L.newOrganism(world,sp,LW.offsetDir(m.n,LW.rand(world)*3,LW.rand(world)*3,world.body.radius),0);k.home=m.home.slice();ids.push(k.id);}
    else L.addToCohort(world,sp.id,E.cellOf(world,m.n),1);          // beyond the individual budget, offspring join the anonymous cohort
  }
  LW.emit(world,'animal.born',{mother:m.id,ids,species:sp.id},[],{n:m.n,e:ids});
};
// coarse daily update for anonymous cohorts (logistic growth on real vegetation; no invented individuals)
L.cohortsDaily=function(world){
  const d=E.d(world);
  for(const id in world.cohorts){
    const c=world.cohorts[id],sp=world.species[c.speciesId];if(!sp||c.count<=0)continue;
    if(sp.kind==='person')continue;                               // person bands are handled by society
    const veg=world.env.veg[c.cell],K=sp.diet==='carn'?6:Math.max(0,veg/255*80/Math.max(0.3,sp.body.size));
    const water=E.fresh(world,c.cell)||[0,1,2,3].some(k=>E.fresh(world,d.nb[c.cell*4+k]));
    let r=world.rules.reproduction?0.012*(sp.lifecycle.litter||1)*(1-c.count/Math.max(1,K)):-0.004;
    if(!water)r=-0.05;
    c.acc+=c.count*r;const whole=Math.trunc(c.acc);
    if(whole){c.acc-=whole;c.count=Math.max(0,c.count+whole);}
    if(sp.diet!=='carn'&&veg>0&&c.count>K*0.8)world.env.veg[c.cell]=Math.max(0,veg-1);
    if(c.count===0)LW.emit(world,'cohort.extinct',{id:c.id,species:sp.id},[world.env.chg[c.cell]],{cell:c.cell});
  }
};
})();
