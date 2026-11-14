// society: households, settlements (player-built and autonomous follow the same rules), stock economy,
// construction projects, technology/eras, institutional memory, person bands (cohorts), trade and conflict.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V,E=LW.env,B=LW.build,L=LW.life,M=LW.mind;
const S=LW.society={};

S.TECHS=[{id:'fire',name:'Fire',cost:15,era:0},{id:'tools',name:'Stone tools',cost:40,era:1},{id:'farming',name:'Farming',cost:90,era:2},
  {id:'pottery',name:'Pottery',cost:160,era:2},{id:'masonry',name:'Masonry',cost:260,era:2},{id:'wheel',name:'The wheel',cost:380,era:2},
  {id:'writing',name:'Writing',cost:520,era:3},{id:'bronze',name:'Bronze working',cost:720,era:3},{id:'iron',name:'Iron working',cost:980,era:4},
  {id:'mechanics',name:'Mechanics',cost:1400,era:5},{id:'steam',name:'Steam power',cost:2000,era:6},{id:'electricity',name:'Electricity',cost:2800,era:7},
  {id:'computing',name:'Computing',cost:3900,era:8},{id:'spaceflight',name:'Spaceflight',cost:5200,era:9}];
S.ERAS=['Dawn age','Stone age','Agrarian age','Bronze age','Iron age','Mechanical age','Industrial age','Electric age','Information age','Space age'];
S.transport=function(s){
  const t=s?s.techs:[];
  let v='on foot';for(const x of LW.roads.VEHICLES)if(t.indexOf(x[0])>=0)v=x[1];return v;
};
const NAMES=['Aldmere','Brisk','Calder','Dunmoor','Esk','Farrow','Glint','Harrow','Isel','Jund','Kessa','Lorn','Marrow','Nesh','Orrin','Pell','Quill','Rook','Sable','Tarn'];

S.nearestSettlement=function(w,n,maxD){
  let best=null,bd=maxD;for(const id in w.settlements){const s=w.settlements[id],d=LW.arcDist(s.n,n,w.body.radius);if(d<bd){bd=d;best=s;}}
  return best;
};
S.storePoint=function(w,s){for(const id of s.buildings){const b=w.buildings[id];if(b&&b.kind==='storehouse'&&b.progress>=1)return LW.offsetDir(b.n,0,-(B.radius(b)+1.5),w.body.radius);}return s.n;};
S.hasWater=function(w,s){
  const c=E.cellOf(w,s.n),d=E.d(w);
  if(E.fresh(w,c)||[0,1,2,3].some(k=>E.fresh(w,d.nb[c*4+k])))return true;
  return s.buildings.some(id=>{const b=w.buildings[id];return b&&b.kind==='well'&&b.progress>=1&&E.waterFactor(w,E.cellOf(w,b.n))>=0.3;});
};
function household(w,p,s){
  if(p.household&&w.households[p.household])return w.households[p.household];
  const h={id:LW.newId(w,'h'),members:[p.id],home:null,settlement:s?s.id:null};w.households[h.id]=h;p.household=h.id;return h;
}
S.join=function(w,p,s){
  if(p.settlement===s.id)return;
  S.detach(w,p,true);
  p.settlement=s.id;s.members.push(p.id);household(w,p,s).settlement=s.id;
  // cultural transmission: institutional memory is taught to newcomers, marked as taught (not observed)
  for(const k in s.lore)M.believe(w,p,k,Object.assign({},s.lore[k],{c:0.7,s:'taught',f:s.id}));
  const ev=LW.emit(w,'settlement.joined',{id:p.id,settlement:s.id},[s.ev],{e:[p.id]});M.pushHist(p,ev);
  M.remember(w,p,'joined','I became one of the people of '+s.name,0.8,ev);
};
S.detach=function(w,p,keepHousehold){
  const s=w.settlements[p.settlement];
  if(s){s.members=s.members.filter(x=>x!==p.id);if(!s.members.length&&!p.alive)LW.emit(w,'settlement.abandoned',{id:s.id,name:s.name},[],{n:s.n});}
  if(!p.alive||!keepHousehold){
    const h=w.households[p.household];
    if(h){h.members=h.members.filter(x=>x!==p.id);if(!h.members.length){for(const id in w.buildings)if(w.buildings[id].household===h.id)w.buildings[id].household=null;delete w.households[h.id];}}
    if(!p.alive){p.household=null;const q=w.persons[p.partner];if(q)q.partner=null;}
  }
  if(p.alive)p.settlement=null;
};
S.found=function(w,p){
  if(LW.planet.height(w,p.n)<LW.planet.waterLevel(w,p.n)+0.3)return 'not here';
  const near=S.nearestSettlement(w,p.n,450);
  if(near){S.join(w,p,near);return 'done';}
  const s={id:LW.newId(w,'s'),name:NAMES[LW.randInt(w,NAMES.length)]+(LW.rand(w)<0.5?' Hollow':' Ford'),n:p.n.slice(),members:[],buildings:[],
    stock:{food:0,wood:0,stone:0,tools:0},know:0,techs:[],era:0,founded:w.tick,labor:0,lore:{},tension:{},by:p.id,ev:null};
  w.settlements[s.id]=s;
  s.ev=LW.emit(w,'settlement.founded',{id:s.id,name:s.name,by:p.id},[p.lastFail&&p.lastFail.ev],{n:s.n,e:[p.id]});
  S.join(w,p,s);
  for(const id in w.persons){const q=w.persons[id];if(q!==p&&q.alive&&!q.settlement&&LW.arcDist(q.n,s.n,w.body.radius)<350)S.join(w,q,s);}
  for(const id in w.buildings){const b=w.buildings[id];if(!b.settlement&&LW.arcDist(b.n,s.n,w.body.radius)<260){b.settlement=s.id;s.buildings.push(b.id);}}
  M.remember(w,p,'founded','I chose this place and named it '+s.name,1,s.ev);
  return 'done';
};
S.complete=function(w,b,p){
  b.progress=1;b.built=w.tick;
  const ev=LW.emit(w,'building.completed',{id:b.id,kind:b.kind,by:p?p.id:'labor'},[b.planEv],{n:b.n,e:[b.id]});
  if(p){M.remember(w,p,'built','I helped raise the '+b.name.toLowerCase(),0.8,ev);M.pushHist(p,ev);}
  S.assignHomes(w);
};
S.assignHomes=function(w){
  for(const id in w.households){
    const h=w.households[id];if(h.home&&w.buildings[h.home])continue;h.home=null;
    const s=w.settlements[h.settlement],first=w.persons[h.members[0]];
    for(const bid in w.buildings){const b=w.buildings[bid];
      if(b.kind!=='house'||b.progress<1||b.household)continue;
      if(s?b.settlement!==s.id:(!first||LW.arcDist(b.n,first.n,w.body.radius)>300))continue;
      b.household=h.id;h.home=b.id;break;}
    for(const m of h.members){const q=w.persons[m];if(q)q.home=h.home;}
  }
};
S.harvest=function(w,b,p,wf){
  const s=w.settlements[b.settlement],tech=s&&s.techs.indexOf('farming')>=0?1.7:1,y=Math.round(10*(0.4+wf)*tech);
  b.growth=0;if(s)s.stock.food+=y;else if(p)p.inv.food+=y;
  const ev=LW.emit(w,'harvest',{field:b.id,yield:y,water:+wf.toFixed(2)},wf<0.4?[w.env.chg[E.cellOf(w,b.n)],s&&s.drought?s.droughtEv:null]:[],{n:b.n,e:[b.id]});
  if(p)M.remember(w,p,'harvest',y<6?'The harvest was thin; the land is too dry':'We brought in a good harvest',0.5,ev);
};
S.maybePartner=function(w,a,b,r){
  if(!w.rules.reproduction||a.partner||b.partner||r.aff<0.5||r.fam<0.55)return;
  const sa=w.species[a.speciesId];if(a.speciesId!==b.speciesId||!L.isMature(w,a,sa)||!L.isMature(w,b,sa))return;
  if(a.parents.indexOf(b.id)>=0||b.parents.indexOf(a.id)>=0||a.parents.some(x=>b.parents.indexOf(x)>=0))return;
  a.partner=b.id;b.partner=a.id;r.kind='partner';
  const ha=w.households[a.household],hb=w.households[b.household];
  if(ha&&hb&&ha!==hb){for(const m of hb.members){ha.members.push(m);const q=w.persons[m];if(q){q.household=ha.id;q.home=ha.home;}}
    for(const id in w.buildings)if(w.buildings[id].household===hb.id)w.buildings[id].household=null;
    if(!ha.home&&hb.home&&w.buildings[hb.home]){ha.home=hb.home;w.buildings[hb.home].household=ha.id;for(const m of ha.members)if(w.persons[m])w.persons[m].home=ha.home;}
    delete w.households[hb.id];}
  const ev=LW.emit(w,'partnership',{a:a.id,b:b.id},[],{e:[a.id,b.id]});
  M.remember(w,a,'bond','I chose to share my life with '+b.name,1,ev);M.remember(w,b,'bond','I chose to share my life with '+a.name,1,ev);M.pushHist(a,ev);M.pushHist(b,ev);
};
function sitePos(w,s,rad){
  for(let k=1;k<50;k++){const a=k*2.399963,d=12+k*3.2,n=LW.offsetDir(s.n,Math.sin(a)*d,Math.cos(a)*d,w.body.radius);if(!B.free(w,n,rad))return n;}
  return null;
}
function plan(w,s,tpl,why){
  const T=B.TEMPLATES[tpl],n=sitePos(w,s,B.radius({rooms:T.rooms,rad:T.rad||0}));if(!n)return;
  const b=B.create(w,tpl,n,LW.rand(w)*6.283,{site:true,settlement:s.id,era:s.era,by:'settlement'});
  b.planEv=LW.emit(w,'building.planned',{id:b.id,kind:b.kind,settlement:s.id,why},[s.ev],{n:b.n,e:[b.id]});
}
S.personBirth=function(w,pw){
  const m=w.persons[pw.mother];if(!m)return;m.preg=0;if(!m.alive)return;
  const sp=w.species[m.speciesId],f=w.persons[pw.father],c=M.newPerson(w,sp,LW.offsetDir(m.n,1,0.5,w.body.radius),{age:0,parents:[m.id].concat(f?[f.id]:[])});
  for(const k in c.traits){c.traits[k]=LW.clamp(((m.traits[k]+(f?f.traits[k]:m.traits[k]))/2)*0.7+LW.rand(w)*0.3,0,1);c.traitBase[k]=c.traits[k];}
  m.children.push(c.id);if(f)f.children.push(c.id);
  const h=w.households[m.household];if(h){h.members.push(c.id);c.household=h.id;c.home=h.home;}
  const s=w.settlements[m.settlement];if(s){c.settlement=s.id;s.members.push(c.id);}
  const ev=LW.emit(w,'person.born',{id:c.id,name:c.name,mother:m.id,father:f?f.id:null},[],{e:[c.id,m.id],n:c.n});
  for(const par of [m,f])if(par){const r=M.rel(w,par.id,c.id,true);r.kind='kin';r.aff=0.6;r.fam=0.8;M.remember(w,par,'birth',c.name+' was born to us',1,ev);M.pushHist(par,ev);}
  M.pushHist(c,ev);
};
S.daily=function(w){
  const R=w.body.radius;
  // unsettled anonymous bands may found a settlement: two members are promoted (debited exactly once) to lead it
  for(const id in w.cohorts){const c=w.cohorts[id],sp=w.species[c.speciesId];
    if(!sp||sp.kind!=='person'||c.settlement||c.count<4||(sp.caps||[]).indexOf('build')<0)continue;
    const d=E.d(w),cn=[d.dirs[c.cell*3],d.dirs[c.cell*3+1],d.dirs[c.cell*3+2]];
    if(d.h[c.cell]<w.body.seaLevel||Object.keys(w.persons).length>=398)continue;
    const lead=M.newPerson(w,sp,cn,{}),second=M.newPerson(w,sp,LW.offsetDir(cn,6,4,R),{});c.count-=2;c.promoted+=2;
    lead.origin={cohort:c.id,unknownPast:true};second.origin={cohort:c.id,unknownPast:true};
    LW.emit(w,'cohort.promoted',{cohort:c.id,ids:[lead.id,second.id],remaining:c.count},[],{e:[lead.id,second.id]});
    M.perceive(w,lead,sp);
    if(S.found(w,lead)==='done'&&lead.settlement){c.settlement=lead.settlement;S.join(w,second,w.settlements[lead.settlement]);}
  }
  for(const id in w.settlements){
    const s=w.settlements[id];
    s.members=s.members.filter(m=>w.persons[m]&&w.persons[m].alive);
    s.buildings=s.buildings.filter(b=>w.buildings[b]);
    let band=0;for(const cid in w.cohorts){const c=w.cohorts[cid];if(c.settlement===s.id)band+=c.count;}
    const pop=s.members.length+band;if(!pop)continue;
    // knowledge, technology and era
    let k=band*0.15;for(const m of s.members){const q=w.persons[m];k+=0.2+q.skills.lore*2+q.traits.curiosity*0.3;}
    s.know+=k*(s.techs.indexOf('writing')>=0?1.5:1);
    const next=S.TECHS[s.techs.length];
    if(next&&s.know>=next.cost){
      s.techs.push(next.id);s.era=Math.max(s.era,next.era);
      let who=null;for(const m of s.members){const q=w.persons[m];if(!who||q.skills.lore+q.traits.curiosity>who.skills.lore+who.traits.curiosity)who=q;}
      const ev=LW.emit(w,'tech.discovered',{settlement:s.id,tech:next.id,name:next.name,by:who?who.id:null,era:S.ERAS[s.era]},[s.ev],{n:s.n});
      if(who){M.remember(w,who,'discovery','I worked out the secret of '+next.name.toLowerCase(),1,ev);M.pushHist(who,ev);who.traits.curiosity=LW.clamp(who.traits.curiosity+0.03,0,1);}
      for(const b of s.buildings)if(w.buildings[b])w.buildings[b].era=s.era;
      w.colorEpoch++;
    }
    // institutional memory collects members' first-hand knowledge of water
    for(const m of s.members){const q=w.persons[m];for(const key in q.beliefs){const b=q.beliefs[key];
      if(b.p==='water'&&b.s==='observation'&&b.v&&Object.keys(s.lore).length<12)s.lore[key]={p:b.p,v:true,n:b.n,cell:b.cell,ref:b.ref};
      else if(b.p==='water'&&b.s==='observation'&&!b.v&&s.lore[key])delete s.lore[key];}}
    // the anonymous band works and eats in aggregate
    if(band){const veg=w.env.veg[E.cellOf(w,s.n)];s.stock.food+=band*(veg>10?1.05:0.5)-band;if(s.stock.food<0)s.stock.food=0;s.labor+=band*120;}
    // construction projects
    S.assignHomes(w);
    const sites=s.buildings.filter(b=>w.buildings[b].progress<1);
    if(!sites.length&&w.mode==='play'){
      const has=kind=>s.buildings.some(b=>w.buildings[b].kind===kind);
      const homeless=s.members.some(m=>{const q=w.persons[m];return !q.home;});
      const fields=s.buildings.filter(b=>w.buildings[b].kind==='field').length;
      if(homeless)plan(w,s,pop>5&&s.era>=2?'house':'cottage','a household has no home');
      else if(!S.hasWater(w,s)&&!has('well'))plan(w,s,'well','no fresh water nearby');
      else if(s.techs.indexOf('farming')>=0&&fields<Math.ceil(pop/3))plan(w,s,'field','more mouths to feed');
      else if(pop>=4&&!has('storehouse'))plan(w,s,'storehouse','stores need shelter');
      else if(pop>=5&&s.techs.indexOf('tools')>=0&&!has('workshop'))plan(w,s,'workshop','tools need a workshop');
    }
    for(const bid of sites){const b=w.buildings[bid];
      // abstract labour of dormant members/bands: gathers and builds without simulating each motion
      for(const res in b.need){while(s.labor>=60&&(b.mat[res]||0)<b.need[res]){if(s.stock[res]>=1)s.stock[res]--;b.mat[res]=(b.mat[res]||0)+1;s.labor-=60;}}
      let ready=true;for(const res in b.need)if((b.mat[res]||0)<b.need[res])ready=false;
      if(ready&&s.labor>0){b.progress+=Math.min(s.labor,1500)*0.0006;s.labor=Math.max(0,s.labor-1500);if(b.progress>=1)S.complete(w,b,null);}
    }
    s.labor=Math.min(s.labor,3000);
    // births
    if(w.rules.reproduction)for(const m of s.members){
      const q=w.persons[m],sp=w.species[q.speciesId],age=L.ageYears(w,q);
      if(sp.lifecycle.repro==='sexual'&&q.sex==='f'&&q.partner&&!q.preg&&w.persons[q.partner]&&w.persons[q.partner].alive&&q.home&&age>=sp.lifecycle.mature&&age<sp.lifecycle.span*0.6&&
         q.children.length<4&&s.stock.food>=pop&&LW.rand(w)<0.03){q.preg=1;w.pending.push({id:LW.newId(w,'pw'),due:w.tick+sp.lifecycle.gest*LW.TPD,type:'personBirth',mother:q.id,father:q.partner});}
      else if(sp.lifecycle.repro==='assembly'&&s.stock.tools>=3&&s.members.length<40&&LW.rand(w)<0.1){s.stock.tools-=3;w.pending.push({id:LW.newId(w,'pw'),due:w.tick+sp.lifecycle.gest*LW.TPD,type:'personBirth',mother:q.id,father:null});}
    }
  }
  LW.roads.daily(w);
  // inter-settlement relations: trade when calm, disputes/raids under scarcity (intensity is a world rule)
  const ids=Object.keys(w.settlements);
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    const a=w.settlements[ids[i]],b=w.settlements[ids[j]];if(!a.members.length||!b.members.length||LW.arcDist(a.n,b.n,R)>6000)continue;
    const scarce=(a.stock.food<a.members.length*2?1:0)+(b.stock.food<b.members.length*2?1:0);
    a.tension[b.id]=Math.max(0,(a.tension[b.id]||0)+(scarce?0.15*scarce*w.rules.conflict:-0.05));
    const t=a.tension[b.id];
    if(t<0.5){const rich=a.stock.food>b.stock.food?a:b,poor=rich===a?b:a;
      if(rich.stock.food>rich.members.length*8&&poor.stock.wood>=4){rich.stock.food-=4;poor.stock.food+=4;poor.stock.wood-=4;rich.stock.wood+=4;LW.emit(w,'trade',{a:rich.id,b:poor.id,gave:'food',got:'wood'},[],{n:rich.n});}}
    else if(t>1&&w.rules.conflict>=1){
      const raid=t>2&&w.rules.conflict>=2,rich=a.stock.food>b.stock.food?a:b,poor=rich===a?b:a;
      if(raid){const q=Math.floor(rich.stock.food*0.3);rich.stock.food-=q;poor.stock.food+=q;}
      LW.emit(w,raid?'raid':'dispute',{a:poor.id,b:rich.id},[],{n:rich.n});a.tension[b.id]=0.3;
      for(const m of a.members)for(const o of b.members.slice(0,3)){const r=M.rel(w,m,o,true);r.aff=LW.clamp(r.aff-0.1,-1,1);}
    }
  }
};
})();
