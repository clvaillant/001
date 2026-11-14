// cognition: needs, perception-grounded beliefs (source + confidence), episodic/semantic/procedural/social
// memory, goal arbitration, plans, action execution, direct-control override and autonomous resumption.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V,E=LW.env,B=LW.build,L=LW.life;
const M=LW.mind={};
const clamp=LW.clamp;

M.newPerson=function(w,sp,n,o){
  o=o||{};const r=()=>LW.rand(w);
  const traits={curiosity:r(),diligence:r(),sociability:r(),courage:r(),empathy:r()};
  const age=o.age===undefined?sp.lifecycle.mature+(4+r()*14)*Math.min(3,sp.lifecycle.span/70):o.age;
  const p={id:LW.newId(w,'p'),kind:'person',speciesId:sp.id,name:o.name||L.makeName(w),sex:r()<0.5?'f':'m',
    born:w.tick-Math.round(age*LW.ticksPerYear(w)),alive:true,n:n.slice(),y:null,face:0,
    needs:{hunger:78,thirst:78,energy:85,social:65},health:100,mood:0,
    traits,traitBase:LW.clone(traits),values:{family:r(),craft:r(),knowledge:r(),nature:r()},
    skills:{foraging:0.15,farming:0,building:0,cooking:0,lore:0,social:0.1},inv:{food:0,wood:0,stone:0},
    home:null,household:null,settlement:null,control:{mode:'auto',by:null},queue:[],act:null,plan:null,suspended:null,goals:[],schedule:[],
    beliefs:{},mem:{ep:[],sum:{}},anomalies:0,hypo:0,lf:0.85+r()*0.3,hist:[],parents:o.parents||[],children:[],partner:null,
    fails:{},lastFail:null,origin:null,lod:'active',posture:'stand',explored:0};
  w.persons[p.id]=p;
  M.remember(w,p,'origin',o.parents&&o.parents.length?'I was born':'My first memory: standing here, the world already around me',0.9);
  return p;
};
// ---- memory ---------------------------------------------------------------------
M.remember=function(w,p,k,x,s,ev){
  const ep=p.mem.ep;ep.push({t:w.tick,k,x,s,ev:ev||null});
  if(ep.length>70){            // consolidation: the least salient/oldest episode is folded into a semantic count
    let wi=0,ws=1e9;for(let i=0;i<ep.length-10;i++){const sc=ep[i].s-(w.tick-ep[i].t)/(LW.TPD*30);if(sc<ws){ws=sc;wi=i;}}
    const g=ep.splice(wi,1)[0];p.mem.sum[g.k]=(p.mem.sum[g.k]||0)+1;
  }
};
M.conf=(w,b)=>b.c*Math.pow(0.5,(w.tick-b.t)/(LW.TPD*(b.s==='observation'?40:15)));
// beliefs are assertions with provenance; a first-hand observation always replaces hearsay
M.believe=function(w,p,key,b){
  const old=p.beliefs[key];
  if(old&&b.s!=='observation'&&M.conf(w,old)>=b.c)return false;
  b.t=w.tick;p.beliefs[key]=b;
  const ks=Object.keys(p.beliefs);
  if(ks.length>90){let wk=null,wc=9;for(const k of ks){const c=M.conf(w,p.beliefs[k]);if(c<wc){wc=c;wk=k;}}delete p.beliefs[wk];}
  return true;
};
M.rel=function(w,a,b,create){
  const k=a<b?a+'|'+b:b+'|'+a;let r=w.relationships[k];
  if(!r&&create)r=w.relationships[k]={a:a<b?a:b,b:a<b?b:a,aff:0,fam:0,kind:'acquaintance',t:w.tick};
  return r;
};
M.relsOf=function(w,id){const out=[];for(const k in w.relationships){const r=w.relationships[k];if(r.a===id||r.b===id)out.push({other:r.a===id?r.b:r.a,r});}return out;};
M.witness=function(w,p,what,ev){
  M.remember(w,p,'anomaly',what,0.95,ev);p.anomalies+=1;
  p.hypo=1-Math.exp(-p.anomalies*(0.1+0.3*p.traits.curiosity));
  // a hypothesis that may emerge from evidence; never automatic knowledge
  if(p.hypo>0.5)M.believe(w,p,'hypothesis:shaped',{p:'hypothesis',v:true,c:p.hypo,s:'inference',x:'Some unseen will reshapes this world',evidence:p.anomalies});
};
M.perceive=function(w,p,sp){
  const c=E.cellOf(w,p.n),cn=E.cellDir(w,c),R=w.body.radius;
  const obs=(key,pred,v)=>{const o=p.beliefs[key];if(v||o)M.believe(w,p,key,{p:pred,v,c:0.95,s:'observation',n:cn,cell:c});};
  obs('water:'+c,'water',E.fresh(w,c));
  obs('food:'+c,'food',w.env.veg[c]>40);
  const pl=w.env.vsp[c]?w.species[w.env.plants[w.env.vsp[c]-1]]:null;
  obs('wood:'+c,'wood',!!(pl&&pl.plant.tree&&w.env.veg[c]>50));
  for(const id in w.buildings){const b=w.buildings[id];if(b.kind!=='well'||b.progress<1||V.dist(b.n,p.n)*R>sp.senses.sight)continue;
    M.believe(w,p,'well:'+id,{p:'water',v:true,c:0.9,s:'observation',n:b.n.slice(),ref:id});}
  for(const id in w.persons){const q=w.persons[id];if(q===p||!q.alive||V.dist(q.n,p.n)*R>sp.senses.sight)continue;
    const r=M.rel(w,p.id,q.id,true);r.fam=Math.min(1,r.fam+0.004);}
};

// ---- actions ---------------------------------------------------------------------
function speed(w,p,sp){let s=sp.move.speed;const st=w.settlements[p.settlement];if(st&&st.techs.indexOf('wheel')>=0)s*=1.25;if(p.needs.energy<8)s*=0.6;return s;}
function go(w,p,a,sp){
  if(!a.path){a.path=LW.nav.path(w,p.n,a.to);a.i=0;if(!a.path)return 'no route';p.posture='stand';}
  let budget=speed(w,p,sp);
  while(a.i<a.path.length){
    const d=LW.arcDist(p.n,a.path[a.i],w.body.radius);
    if(d<=budget){if(d>1e-6&&L.stepToward(w,p,a.path[a.i],d,sp)<0)return 'blocked';budget-=d;a.i++;}
    else return L.stepToward(w,p,a.path[a.i],budget,sp)<0?'blocked':null;
  }
  return 'done';
}
function approach(w,p,a,sp,to,within){
  if(LW.arcDist(p.n,to,w.body.radius)<=within){a.sub=null;return 'done';}
  if(!a.sub||(a.sub.age=(a.sub.age||0)+1)>40&&a.track)a.sub={a:'go',to:to.slice()};
  const r=go(w,p,a.sub,sp);
  if(r==='done'){a.sub=null;if(LW.arcDist(p.n,to,w.body.radius)<=within+1.5)return 'done';if(a.track&&(a.tries=(a.tries||0)+1)<8)return null;return a.track?'gone':'no route';}
  return r;
}
const FAIL_TEXT={dry:'I went for water but found the place dry',barren:'There was nothing left to gather there',blocked:'Water or rock blocked my way','no route':'I could not find a way in',
  occupied:'Someone else was using it',missing:'The thing I went to use was gone','no food':'There was no food','needs materials':'The building site still lacks materials',
  'no trees':'There were no trees to cut',gone:'The one I sought was gone',asleep:'They were asleep',flooded:'It was under water',empty:'The stores were empty','no water known':'I know of no water','no food known':'I know of no food',
  'not here':'This is no place to settle','too tired':'I was too exhausted'};
M.FAIL_TEXT=FAIL_TEXT;
function release(w,p,a){
  if(a&&a.a==='use'){const b=w.buildings[a.b],c=b&&B.comp(b,a.c);if(c&&c.by===p.id)c.by=null;}
  p.posture='stand';
}
M.release=release;
M.interrupt=function(w,p){if(p.act)release(w,p,p.act);p.act=null;p.plan=null;};
function useStep(w,p,a,sp){
  const b=w.buildings[a.b];if(!b)return 'missing';
  const c=B.comp(b,a.c);if(!c)return 'missing';
  if(b.flooded)return 'flooded';
  if(c.by&&c.by!==p.id&&w.persons[c.by]&&w.persons[c.by].alive)return 'occupied';
  const r=approach(w,p,a,sp,B.usePoint(w,b,c),1.3);if(r!=='done')return r;
  c.by=p.id;a.t=(a.t||0)+1;const N=p.needs,st=w.settlements[p.settlement];
  switch(a.cap){
    case 'sleep':p.posture='lie';N.energy=Math.min(100,N.energy+0.065);return (N.energy>=99||(a.max&&a.t>=a.max)||N.thirst<10||N.hunger<8)?'done':null;
    case 'sit':p.posture='sit';N.energy=Math.min(100,N.energy+0.02);return a.t>=(a.max||24)?'done':null;
    case 'eat':
      if(a.t===1&&p.inv.food<1){if(b.stock.food>=1){b.stock.food--;p.inv.food++;}else if(st&&st.stock.food>=1&&LW.arcDist(st.n,p.n,w.body.radius)<300){st.stock.food--;p.inv.food++;}else return 'no food';}
      p.posture='sit';if(a.t>=16){p.inv.food--;N.hunger=Math.min(100,N.hunger+52);p.mood=Math.min(1,p.mood+0.1);return 'done';}return null;
    case 'cook':
      if(a.t===1&&p.inv.food<1){if(b.stock.food>=1){b.stock.food--;p.inv.food++;}else return 'no food';}
      if(a.t>=24){p.inv.food+=1;p.skills.cooking=Math.min(1,p.skills.cooking+0.01);return 'done';}return null;
    case 'store':
      if(a.t>=4){if(a.take){for(const k in a.take){const q=Math.min(a.take[k],b.stock[k]||0);b.stock[k]-=q;p.inv[k]=(p.inv[k]||0)+q;}}
        else for(const k of ['food','wood','stone']){const q=k==='food'?Math.max(0,p.inv[k]-1):p.inv[k];b.stock[k]=(b.stock[k]||0)+q;p.inv[k]-=q;}
        return 'done';}return null;
    case 'drink':
      if(E.waterFactor(w,E.cellOf(w,b.n))<0.3)return 'dry';
      if(a.t>=4){N.thirst=100;return 'done';}return null;
    case 'work':
      if(a.t===1){if(p.inv.wood>=1)p.inv.wood--;else if(b.stock.wood>=1)b.stock.wood--;else if(st&&st.stock.wood>=1)st.stock.wood--;else return 'needs materials';}
      if(a.t>=40){if(st)st.stock.tools++;else b.stock.tools++;p.skills.building=Math.min(1,p.skills.building+0.01);return 'done';}return null;
    case 'study':
      if(a.t>=40){p.skills.lore=Math.min(1,p.skills.lore+0.012);if(st)st.know+=1+p.traits.curiosity;return 'done';}return null;
    default:return a.t>=4?'done':null;
  }
}
function step(w,p,a,sp){
  const N=p.needs,R=w.body.radius,c=E.cellOf(w,p.n);
  switch(a.a){
    case 'go':return go(w,p,a,sp);
    case 'use':return useStep(w,p,a,sp);
    case 'drink':
      if(!E.fresh(w,c)){M.believe(w,p,'water:'+c,{p:'water',v:false,c:0.95,s:'observation',n:E.cellDir(w,c),cell:c});return 'dry';}
      a.t=(a.t||0)+1;if(a.t>=4){N.thirst=100;M.believe(w,p,'water:'+c,{p:'water',v:true,c:0.95,s:'observation',n:E.cellDir(w,c),cell:c});return 'done';}return null;
    case 'forage':
      if(w.env.veg[c]<=10){M.believe(w,p,'food:'+c,{p:'food',v:false,c:0.95,s:'observation',n:E.cellDir(w,c),cell:c});return 'barren';}
      a.t=(a.t||0)+1;if(a.t%12===0){p.inv.food++;if(LW.rand(w)<0.5)w.env.veg[c]--;p.skills.foraging=Math.min(1,p.skills.foraging+0.004);}
      return p.inv.food>=(a.n||3)?'done':null;
    case 'eat':if(p.inv.food<1)return 'no food';a.t=(a.t||0)+1;if(a.t>=12){p.inv.food--;N.hunger=Math.min(100,N.hunger+42);return 'done';}return null;
    case 'gather':{
      a.t=(a.t||0)+1;
      if(a.res==='wood'){const pl=w.env.vsp[c]?w.species[w.env.plants[w.env.vsp[c]-1]]:null;
        if(!(pl&&pl.plant.tree&&w.env.veg[c]>30)){M.believe(w,p,'wood:'+c,{p:'wood',v:false,c:0.95,s:'observation',n:E.cellDir(w,c),cell:c});return 'no trees';}
        if(a.t%10===0){p.inv.wood++;w.env.veg[c]=Math.max(0,w.env.veg[c]-2);}}
      else if(a.t%14===0){if(E.minerals(w,c).stone<=0)return 'barren';p.inv.stone++;w.env.mined[c]=(w.env.mined[c]||0)+1;}
      return p.inv[a.res]>=(a.n||6)?'done':null;}
    case 'deposit':{
      const b=w.buildings[a.b],s=w.settlements[a.s];if(!b&&!s)return 'missing';
      const r=approach(w,p,a,sp,b?b.n:LW.society.storePoint(w,s),b&&b.rooms.length?B.radius(b)+3:7);if(r!=='done')return r;
      if(b&&b.progress<1){for(const k in b.need){const q=Math.min(p.inv[k]||0,b.need[k]-(b.mat[k]||0));if(q>0){b.mat[k]=(b.mat[k]||0)+q;p.inv[k]-=q;}}}
      else{const tgt=s||w.settlements[b.settlement];const stock=tgt?tgt.stock:b.stock;for(const k of ['food','wood','stone']){stock[k]=(stock[k]||0)+p.inv[k];p.inv[k]=0;}}
      return 'done';}
    case 'withdraw':{
      const s=w.settlements[a.s];if(!s)return 'missing';
      const r=approach(w,p,a,sp,LW.society.storePoint(w,s),7);if(r!=='done')return r;
      const q=Math.min(a.n||2,Math.floor(s.stock.food));if(q<1)return 'empty';s.stock.food-=q;p.inv.food+=q;return 'done';}
    case 'build':{
      const b=w.buildings[a.b];if(!b)return 'missing';if(b.progress>=1)return 'done';
      const r=approach(w,p,a,sp,b.n,B.radius(b)+3);if(r!=='done')return r;
      for(const k in b.need)if((b.mat[k]||0)<b.need[k])return 'needs materials';
      b.progress+=0.0035*(1+p.skills.building*2);p.skills.building=Math.min(1,p.skills.building+0.0004);
      if(b.progress>=1){LW.society.complete(w,b,p);return 'done';}
      a.t=(a.t||0)+1;return a.t>=200?'done':null;}
    case 'farm':{
      const b=w.buildings[a.b];if(!b)return 'missing';
      const r=approach(w,p,a,sp,b.n,5);if(r!=='done')return r;
      a.t=(a.t||0)+1;const wf=E.waterFactor(w,E.cellOf(w,b.n));
      b.growth+=0.0016*(1+p.skills.farming)*wf;p.skills.farming=Math.min(1,p.skills.farming+0.0003);
      if(b.growth>=1){LW.society.harvest(w,b,p,wf);return 'done';}
      return a.t>=160?'done':null;}
    case 'talk':{
      const o=w.persons[a.id];if(!o||!o.alive)return 'gone';
      a.track=true;if((a.chase=(a.chase||0)+1)>400)return 'gone';if(o.posture==='lie'&&LW.arcDist(p.n,o.n,R)<40)return 'asleep';const r=approach(w,p,a,sp,o.n,3);if(r!=='done')return r;
      if(o.posture==='lie')return 'asleep';
      // the other person notices and pauses whatever unhurried thing they were doing
      if(o.act&&o.act.src!=='player'&&o.plan&&['explore','idle','socialize','study'].indexOf(o.plan.goal)>=0&&o.act.a!=='talk'){M.interrupt(w,o);o.plan={goal:'socialize',steps:[{a:'wait',n:14}],t:w.tick};}
      a.t=(a.t||0)+1;if(a.t>=10){M.converse(w,p,o);return 'done';}return null;}
    case 'sleep':p.posture='lie';N.energy=Math.min(100,N.energy+0.042);a.t=(a.t||0)+1;return (N.energy>=95||(a.max&&a.t>=a.max)||N.thirst<10||N.hunger<8)?'done':null;
    case 'explore':{
      if(!a.to){
        if(a.mode==='downhill'){const d=E.d(w),t=d.to[c];a.to=t>=0?E.cellDir(w,t):LW.offsetDir(p.n,(LW.rand(w)-0.5)*600,(LW.rand(w)-0.5)*600,R);}
        else{const ang=LW.rand(w)*6.283,dist=120+300*p.traits.curiosity;a.to=LW.offsetDir(p.n,Math.sin(ang)*dist,Math.cos(ang)*dist,R);}
      }
      const r=approach(w,p,a,sp,a.to,2);
      if(r==='done'||r==='blocked'||r==='no route'){M.perceive(w,p,sp);p.explored++;return 'done';}
      return r;}
    case 'wait':a.t=(a.t||0)+1;return a.t>=(a.n||20)?'done':null;
    case 'study':a.t=(a.t||0)+1;if(a.t>=30){p.skills.lore=Math.min(1,p.skills.lore+0.006);const st=w.settlements[p.settlement];if(st)st.know+=0.5+p.traits.curiosity;return 'done';}return null;
    case 'found':return LW.society.found(w,p);
    case 'activity':return LW.activities.step(w,p,a,sp,step);
    default:return 'missing';
  }
}
function failAct(w,p,a,reason){
  const goal=p.plan?p.plan.goal:(a.src==='player'?'command':a.a);
  const causes=[];if(reason==='dry'||reason==='barren'||reason==='flooded'||reason==='no trees')causes.push(w.env.chg[E.cellOf(w,p.n)]);
  const ev=LW.emit(w,'person.failed',{id:p.id,goal,act:a.a,reason},causes,{e:[p.id],n:p.n});
  p.lastFail={ev,goal,reason,t:w.tick};p.fails[goal]=(p.fails[goal]||0)+1;
  M.remember(w,p,'failure',FAIL_TEXT[reason]||reason,0.7,ev);pushHist(p,ev);
  p.traits.courage=clamp(p.traits.courage-0.003,0,1);p.mood=Math.max(-1,p.mood-0.08);     // experience slowly reshapes personality
  p.plan=null;                                                                              // revision: replan from updated beliefs
}
function pushHist(p,ev){p.hist.push(ev);if(p.hist.length>60)p.hist.shift();}
M.pushHist=pushHist;

M.converse=function(w,a,b){
  const r=M.rel(w,a.id,b.id,true),compat=1-Math.abs(a.traits.sociability-b.traits.sociability)*0.5+(a.traits.empathy+b.traits.empathy)*0.15;
  r.fam=Math.min(1,r.fam+0.08);r.aff=clamp(r.aff+(compat-0.6)*0.14+0.035,-1,1);r.t=w.tick;
  r.kind=r.kind==='partner'||r.kind==='kin'?r.kind:(r.aff>0.4&&r.fam>0.5?'friend':r.aff<-0.3?'rival':'acquaintance');
  a.needs.social=Math.min(100,a.needs.social+35);b.needs.social=Math.min(100,b.needs.social+25);
  const trust=0.5+Math.max(0,r.aff)/2;let shared=0;
  const share=(x,y)=>{       // knowledge spreads by communication, tagged with who said it and discounted by trust
    const ks=Object.keys(x.beliefs).filter(k=>x.beliefs[k].v&&M.conf(w,x.beliefs[k])>0.4).sort((k1,k2)=>M.conf(w,x.beliefs[k2])-M.conf(w,x.beliefs[k1]));
    let n=0;for(const k of ks){if(n>=2)break;const s=x.beliefs[k];
      if(M.believe(w,y,k,Object.assign({},s,{c:M.conf(w,s)*0.7*trust,s:'told',f:x.id}))){n++;shared++;}}
    for(const k in x.skills)if(x.skills[k]>y.skills[k]+0.15){y.skills[k]=Math.min(1,y.skills[k]+0.01);M.remember(w,y,'taught',x.name+' showed me something of '+k,0.35);break;}
  };
  share(a,b);share(b,a);
  a.traits.sociability=clamp(a.traits.sociability+0.002,0,1);
  const ev=LW.emit(w,'talk',{a:a.id,b:b.id,shared},[],{e:[a.id,b.id]});
  M.remember(w,a,'talk','I talked with '+b.name,0.3,ev);M.remember(w,b,'talk',a.name+' talked with me',0.3,ev);
  LW.society.maybePartner(w,a,b,r);
};

// ---- goal arbitration and planning ------------------------------------------------
function nearestBelief(w,p,pred){
  let best=null,bs=-1;const R=w.body.radius;
  for(const k in p.beliefs){const b=p.beliefs[k];if(b.p!==pred||!b.v||!b.n)continue;const cf=M.conf(w,b);if(cf<0.25)continue;
    if(b.ref&&!w.buildings[b.ref])continue;
    const s=cf/(60+LW.arcDist(p.n,b.n,R));if(s>bs){bs=s;best=b;}}
  return best;
}
function plan(w,p,type,sp,data){
  const home=w.buildings[p.home],st=w.settlements[p.settlement],R=w.body.radius;
  switch(type){
    case 'drink':{
      const b=nearestBelief(w,p,'water');
      if(!b)return {steps:[{a:'explore',mode:'downhill'}],note:'no water known'};
      if(b.ref){const wb=w.buildings[b.ref],c=B.findCap(wb,'drink',p.id);if(c)return {steps:[{a:'use',b:wb.id,c:c.id,cap:'drink'}]};}
      return {steps:[{a:'go',to:b.n.slice()},{a:'drink'}]};}
    case 'eat':{
      const table=home&&B.findCap(home,'eat',p.id);
      if(p.inv.food>=1||(home&&home.stock.food>=1&&table))return table&&LW.arcDist(home.n,p.n,R)<150?{steps:[{a:'use',b:home.id,c:table.id,cap:'eat'}]}:{steps:[{a:'eat'}]};
      if(st&&st.stock.food>=1)return {steps:[{a:'withdraw',s:st.id,n:2},table?{a:'use',b:home.id,c:table.id,cap:'eat'}:{a:'eat'}]};
      const b=nearestBelief(w,p,'food');
      if(b)return {steps:[{a:'go',to:b.n.slice()},{a:'forage',n:3},{a:'eat'}]};
      return {steps:[{a:'explore'}],note:'no food known'};}
    case 'sleep':{
      const bed=home&&!home.flooded&&B.findCap(home,'sleep',p.id);
      return bed?{steps:[{a:'use',b:home.id,c:bed.id,cap:'sleep'}]}:{steps:[{a:'sleep'}]};}
    case 'socialize':{
      let best=null,bd=260;for(const id in w.persons){const q=w.persons[id];if(q===p||!q.alive||q.posture==='lie')continue;const d=V.dist(q.n,p.n)*R;if(d<bd){bd=d;best=q;}}
      return best?{steps:[{a:'talk',id:best.id}]}:null;}
    case 'build':{
      const b=w.buildings[data];if(!b||b.progress>=1)return null;
      for(const k in b.need){const lack=b.need[k]-(b.mat[k]||0);if(lack<=0)continue;
        if(p.inv[k]>0)return {steps:[{a:'deposit',b:b.id}]};
        if(st&&st.stock[k]>=1){const q=Math.min(lack,Math.floor(st.stock[k]),6);st.stock[k]-=q;p.inv[k]+=q;return {steps:[{a:'deposit',b:b.id}]};}
        if(k==='wood'){const wb=nearestBelief(w,p,'wood');if(!wb)return {steps:[{a:'explore'}],note:'no trees'};
          return {steps:[{a:'go',to:wb.n.slice()},{a:'gather',res:'wood',n:Math.min(6,lack)},{a:'deposit',b:b.id}]};}
        return {steps:[{a:'gather',res:k,n:Math.min(6,lack)},{a:'deposit',b:b.id}]};}
      return {steps:[{a:'build',b:b.id}]};}
    case 'farm':return w.buildings[data]?{steps:[{a:'farm',b:data}]}:null;
    case 'gatherFood':{const b=nearestBelief(w,p,'food');if(!b)return {steps:[{a:'explore'}],note:'no food known'};
      return {steps:[{a:'go',to:b.n.slice()},{a:'forage',n:5},{a:'deposit',s:st.id}]};}
    case 'craft':{const wb=w.buildings[data],c=wb&&B.findCap(wb,'work',p.id);return c?{steps:[{a:'use',b:wb.id,c:c.id,cap:'work'}]}:null;}
    case 'found':{
      const c=E.cellOf(w,p.n);
      if(E.fresh(w,c)||[0,1,2,3].some(k=>E.fresh(w,E.d(w).nb[c*4+k])))return {steps:[{a:'found'}]};
      const b=nearestBelief(w,p,'water');if(!b)return null;
      return {steps:[{a:'go',to:LW.offsetDir(b.n,60,60,R)},{a:'found'}]};}
    case 'explore':return {steps:[{a:'explore'}]};
    case 'study':{const c=home&&B.findCap(home,'study',p.id);return c?{steps:[{a:'use',b:home.id,c:c.id,cap:'study'}]}:{steps:[{a:'study'}]};}
    case 'activity':return w.activities[data]?{steps:[{a:'activity',id:data}]}:null;
    case 'idle':return {steps:[{a:'wait',n:12+LW.randInt(w,20)}]};
  }
  return null;
}
function selfGoals(w,p,sp){
  // self-generated long-term goals shaped by values, personality and circumstance
  if(p.goals.filter(g=>g.src==='self').length>=2||LW.rand(w)>0.25)return;
  const opts=[];
  if(p.values.craft>0.4)opts.push({type:'master',skill:LW.pick(w,['farming','building','cooking','foraging'])});
  if(p.traits.curiosity>0.5)opts.push({type:'explore'});
  if(p.values.knowledge>0.5)opts.push({type:'invent'});
  if(p.values.family>0.4&&!p.partner)opts.push({type:'partner'});
  if(!opts.length)return;
  const g=LW.pick(w,opts);if(p.goals.some(x=>x.type===g.type))return;
  g.id=LW.newId(w,'g');g.src='self';g.pri=10+10*LW.rand(w);g.t0=w.tick;g.n=0;p.goals.push(g);
  M.remember(w,p,'goal','I resolved to '+goalText(g),0.6);
}
function goalText(g){return g.type==='master'?'master '+g.skill:g.type==='explore'?'see what lies beyond':g.type==='invent'?'understand how things work':g.type==='partner'?'find someone to share my life with':g.type;}
M.goalText=goalText;
function checkGoals(w,p){
  for(const g of p.goals.slice()){
    let done=false;
    if(g.type==='master')done=p.skills[g.skill]>=0.6;else if(g.type==='explore')done=p.explored-(g.base||(g.base=p.explored))>=8;
    else if(g.type==='partner')done=!!p.partner;else if(g.type==='invent')done=p.skills.lore>=0.5;
    if(done){p.goals=p.goals.filter(x=>x!==g);const ev=LW.emit(w,'goal.achieved',{id:p.id,goal:g.type},[],{e:[p.id]});M.remember(w,p,'achievement','I achieved my wish to '+goalText(g),0.9,ev);pushHist(p,ev);
      p.traits.courage=clamp(p.traits.courage+0.03,0,1);}
    else if(w.tick-g.t0>LW.ticksPerYear(w)*3&&g.src==='self'){p.goals=p.goals.filter(x=>x!==g);M.remember(w,p,'goal','I let go of my wish to '+goalText(g),0.5);}
  }
}
M.think=function(w,p,sp){
  const N=p.needs,hour=LW.hourAt(w,p.n),night=hour<5.5||hour>21.5,adult=L.isMature(w,p,sp),st=w.settlements[p.settlement],T=p.traits,C=[];
  const add=(type,score,data)=>{if(score>0)C.push({type,score:score+LW.rand(w)*5-(p.fails[type]||0)*4,data});};
  const en=sp.diet==='energy';
  if(!en){if(N.thirst<55)add('drink',(62-N.thirst)*2.4);if(N.hunger<50)add('eat',(56-N.hunger)*2.0);}
  if(N.energy<25||(night&&N.energy<72))add('sleep',(night?40:0)+(62-N.energy)*1.5);
  if(N.social<45)add('socialize',(52-N.social)*(0.5+T.sociability));
  for(const s of p.schedule)if(hour>=s.h0&&hour<s.h1)add(s.what==='work'?'_work':s.what,60,s.data);
  let workBoost=C.some(c=>c.type==='_work')?35:0;
  if(adult&&!night){
    if(st){
      for(const id of st.buildings){const b=w.buildings[id];if(!b)continue;
        if(b.progress<1)add('build',26+24*T.diligence+workBoost,id);
        else if(b.kind==='field')add('farm',22+22*T.diligence+workBoost+(st.stock.food<st.members.length*3?14:0),id);
        else if(b.kind==='workshop'&&st.stock.tools<st.members.length)add('craft',14+16*T.diligence+workBoost,id);}
      if(st.stock.food<st.members.length*4&&!en)add('gatherFood',24+16*T.diligence+workBoost);
    }else if((sp.caps||[]).indexOf('build')>=0)add('found',24+10*T.diligence);
    for(const g of p.goals){
      if(g.type==='explore')add('explore',g.pri+14);else if(g.type==='invent')add('study',g.pri+14);else if(g.type==='partner')add('socialize',g.pri+10);
      else if(g.type==='master'){if(g.skill==='foraging'&&st)add('gatherFood',g.pri+16);else add('study',g.pri+6);}
      else if(g.type==='activity')add('activity',g.pri+20,g.activity);
      else if(g.type==='socialize'||g.type==='explore'||g.type==='study')add(g.type,g.pri+20);
    }
    add('explore',6+20*T.curiosity);add('study',4+14*T.curiosity*p.values.knowledge);
  }
  add('idle',6);
  C.sort((a,b)=>b.score-a.score);
  for(let i=0;i<C.length&&i<4;i++){
    if(C[i].type==='_work')continue;
    const pl=plan(w,p,C[i].type,sp,C[i].data);
    if(pl){p.plan={goal:C[i].type,steps:pl.steps,note:pl.note||null,t:w.tick};
      if(pl.note&&(!p.lastFail||w.tick-p.lastFail.t>LW.TPH)){const ev=LW.emit(w,'person.failed',{id:p.id,goal:C[i].type,reason:pl.note},[],{e:[p.id]});p.lastFail={ev,goal:C[i].type,reason:pl.note,t:w.tick};M.remember(w,p,'failure',FAIL_TEXT[pl.note]||pl.note,0.5,ev);}
      return;}
  }
  p.plan={goal:'idle',steps:[{a:'wait',n:20}],t:w.tick};
};
M.die=function(w,p,cause){
  M.interrupt(w,p);p.alive=false;p.died=w.tick;p.control={mode:'auto',by:null};p.queue=[];
  const ev=LW.emit(w,'person.died',{id:p.id,name:p.name,cause},[p.lastFail&&p.lastFail.ev],{e:[p.id],n:p.n});pushHist(p,ev);
  for(const x of M.relsOf(w,p.id)){const q=w.persons[x.other];if(q&&q.alive&&x.r.fam>0.3){M.remember(w,q,'loss',p.name+' died',0.95,ev);q.mood=Math.max(-1,q.mood-0.3*Math.max(0,x.r.aff));}}
  LW.society.detach(w,p);
};
M.tickPerson=function(w,p){
  const sp=w.species[p.speciesId],N=p.needs,en=sp.diet==='energy',hour=LW.hourAt(w,p.n);
  const asleep=p.posture==='lie'?0.5:1;
  if(!en){N.hunger=Math.max(0,N.hunger-0.014*asleep);N.thirst=Math.max(0,N.thirst-0.02*asleep);}
  else if(hour>7&&hour<18)N.energy=Math.min(100,N.energy+0.05);          // artificial life recharges in starlight
  if(p.posture!=='lie')N.energy=Math.max(0,N.energy-0.024);
  N.social=Math.max(0,N.social-0.012);
  if(!en&&(N.hunger<=0||N.thirst<=0))p.health-=0.03;else if(N.energy<=0)p.health-=0.01;else if(p.health<100)p.health=Math.min(100,p.health+0.01);
  if(p.health<=0)return M.die(w,p,!en&&N.thirst<=0?'thirst':!en&&N.hunger<=0?'starvation':'exhaustion');
  if(w.rules.aging&&(w.tick-p.born)>sp.lifecycle.span*p.lf*LW.ticksPerYear(w))return M.die(w,p,'old age');
  p.mood+=(((N.hunger+N.thirst+N.energy+N.social)/4-50)/50-p.mood)*0.004;
  const h=LW.hashStr(p.id);
  if((w.tick+h)%12===0)M.perceive(w,p,sp);
  if((w.tick+h)%LW.TPD===0){checkGoals(w,p);if(L.isMature(w,p,sp))selfGoals(w,p,sp);}
  if(p.act){
    // urgent needs interrupt autonomous activity (never player orders): adaptive replanning
    if(p.act.src!=='player'&&p.plan&&(w.tick+h)%30===0&&!en){
      const g=p.plan.goal,urgent=N.thirst<22&&g!=='drink'?'thirst':N.hunger<16&&g!=='eat'&&g!=='drink'?'hunger':N.energy<6&&g!=='sleep'&&g!=='drink'&&g!=='eat'?'energy':null;
      if(urgent){M.interrupt(w,p);return;}
    }
    const r=step(w,p,p.act,sp);
    if(r===null)return;
    const a=p.act;release(w,p,a);p.act=null;
    if(r!=='done')failAct(w,p,a,r);
    else if(p.plan&&!p.plan.steps.length){p.fails[p.plan.goal]=0;p.mem.sum['did:'+p.plan.goal]=(p.mem.sum['did:'+p.plan.goal]||0)+1;p.plan=null;}
    return;
  }
  if(p.queue.length){p.act=p.queue.shift();p.act.src='player';return;}
  if(p.control.mode==='player')return;                // under direct control: no autonomous choices
  if(p.plan&&p.plan.steps.length){p.act=p.plan.steps.shift();return;}
  M.think(w,p,sp);
};
// coarse update for people outside the interest region: consequential bookkeeping only, no invented detail
M.coarse=function(w,p,dt){
  const sp=w.species[p.speciesId],N=p.needs,en=sp.diet==='energy',st=w.settlements[p.settlement],hour=LW.hourAt(w,p.n),night=hour<6||hour>21.5;
  if(!en){N.hunger=Math.max(0,N.hunger-0.012*dt);N.thirst=Math.max(0,N.thirst-0.017*dt);
    if(N.thirst<50&&st&&LW.society.hasWater(w,st))N.thirst=100;
    if(N.hunger<45){if(p.inv.food>=1){p.inv.food--;N.hunger+=45;}else if(st&&st.stock.food>=1){st.stock.food--;N.hunger+=45;}}}
  if(night){N.energy=Math.min(100,N.energy+0.06*dt);p.posture='lie';}
  else{p.posture='stand';N.energy=Math.max(20,N.energy-0.024*dt);
    if(st&&L.isMature(w,p,sp)){st.labor+=dt;if(!en&&w.env.veg[E.cellOf(w,st.n)]>10)st.stock.food+=0.0035*dt*(0.5+p.skills.foraging+p.skills.farming);}}
  if(st&&st.members.length>1)N.social=Math.max(N.social,45);
  if(!en&&(N.hunger<=0||N.thirst<=0))p.health-=0.03*dt;else if(p.health<100)p.health=Math.min(100,p.health+0.01*dt);
  p.mem.sum.away=(p.mem.sum.away||0)+dt;
  if(p.health<=0)return M.die(w,p,N.thirst<=0?'thirst':'starvation');
  if(w.rules.aging&&(w.tick-p.born)>sp.lifecycle.span*p.lf*LW.ticksPerYear(w))return M.die(w,p,'old age');
};

// ---- player commands on people ------------------------------------------------------
const ACTS={go:1,use:1,drink:1,forage:1,eat:1,gather:1,sleep:1,explore:1,wait:1,talk:1,build:1,farm:1,study:1,activity:1,deposit:1};
M.validateAction=function(w,p,a){
  if(!a||!ACTS[a.a])return 'unknown action';
  const sp=w.species[p.speciesId];
  if(a.a==='go'){if(!LW.isDir(a.to))return 'bad destination';if(!L.canEnter(w,a.to,sp))return p.name+' cannot go into water';}
  if(a.a==='use'){const b=w.buildings[a.b],c=b&&B.comp(b,a.c);if(!c)return 'that object no longer exists';
    if(LW.COMPONENTS[c.kind].caps.indexOf(a.cap)<0)return LW.COMPONENTS[c.kind].name+' cannot be used to '+a.cap;
    if(b.progress<1)return 'the building is not finished';
    if(c.by&&c.by!==p.id)return LW.COMPONENTS[c.kind].name+' is in use by '+((w.persons[c.by]||{}).name||'someone');}
  if(a.a==='talk'){const o=w.persons[a.id];if(!o||!o.alive||o===p)return 'nobody to talk to';}
  if(a.a==='gather'&&a.res!=='wood'&&a.res!=='stone')return 'gather wood or stone';
  if((a.a==='build'||a.a==='farm')&&!w.buildings[a.b])return 'no such site';
  if(a.a==='deposit'&&!w.buildings[a.b]&&!w.settlements[a.s])return 'nowhere to deposit';
  if(a.a==='activity'&&!w.activities[a.id])return 'unknown activity';
  return null;
};
function own(w,p,actor){return !p.control.by||p.control.by===actor.id?null:'this character is controlled by another player';}
LW.def('person.control',{perm:'control',
  validate(w,p,actor){const q=w.persons[p.id];if(!q||!q.alive)return 'no such living character';return p.on?own(w,q,actor):(q.control.by&&q.control.by!==actor.id&&actor.role!=='owner'?'not your character':null);},
  apply(w,p,ctx){
    const q=w.persons[p.id];
    if(p.on){
      if(q.control.mode!=='player'){q.suspended=q.plan?{goal:q.plan.goal,steps:(q.act&&q.act.src!=='player'?[stripAct(q.act)]:[]).concat(q.plan.steps)}:null;
        if(q.act&&q.act.src!=='player'){release(w,q,q.act);q.act=null;}q.plan=null;}
      q.control={mode:'player',by:ctx.actor.id};
      LW.emit(w,'person.controlled',{id:q.id,by:ctx.actor.id},[],{e:[q.id]});
    }else{
      q.control={mode:'auto',by:null};
      // the SAME entity resumes its own life: needs, memories, relationships untouched; interrupted plan offered back
      q.plan=q.suspended&&q.suspended.steps.length?{goal:q.suspended.goal,steps:q.suspended.steps,t:w.tick}:null;q.suspended=null;
      const ev=LW.emit(w,'person.released',{id:q.id},[],{e:[q.id]});
      M.remember(w,q,'released','For a while my body moved with a purpose I did not choose',0.6,ev);q.anomalies+=0.34;
    }
    return {public:{mode:q.control.mode}};}});
function stripAct(a){const c=LW.clone(a);delete c.path;delete c.sub;delete c.t;delete c.i;return c;}
LW.def('person.enqueue',{perm:'control',
  validate(w,p,actor){const q=w.persons[p.id];if(!q||!q.alive)return 'no such living character';const o=own(w,q,actor);if(o)return o;
    if(q.queue.length>=12)return 'the action queue is full';return M.validateAction(w,q,p.action);},
  apply(w,p){const q=w.persons[p.id],a=LW.clone(p.action);a.src='player';
    if(p.now){if(q.act){release(w,q,q.act);q.act=null;}q.queue.unshift(a);}else q.queue.push(a);
    if(q.act&&q.act.src!=='player'&&q.control.mode==='player'){release(w,q,q.act);q.act=null;}
    return {public:{queued:q.queue.length}};}});
LW.def('person.clearQueue',{perm:'control',
  validate(w,p,actor){const q=w.persons[p.id];if(!q)return 'no such character';return own(w,q,actor);},
  apply(w,p){const q=w.persons[p.id];
    if(Number.isInteger(p.index))q.queue.splice(p.index,1);else{q.queue=[];if(q.act&&p.current!==false){release(w,q,q.act);q.act=null;}}
    return {public:{queued:q.queue.length}};}});
LW.def('person.setGoal',{perm:'control',
  validate(w,p){const q=w.persons[p.id];if(!q||!q.alive)return 'no such living character';
    if(p.remove)return null;
    const g=p.goal||{};if(['master','explore','invent','partner','socialize','study','activity'].indexOf(g.type)<0)return 'unknown goal type';
    if(g.type==='master'&&!(g.skill in q.skills))return 'unknown skill';if(g.type==='activity'&&!w.activities[g.activity])return 'unknown activity';
    if(q.goals.length>=6)return 'too many goals';return null;},
  apply(w,p){const q=w.persons[p.id];
    if(p.remove){q.goals=q.goals.filter(g=>g.id!==p.remove);return {};}
    const g=Object.assign({},p.goal,{id:LW.newId(w,'g'),src:'player',pri:30,t0:w.tick,n:0});q.goals.push(g);
    return {public:{goalId:g.id}};}});
LW.def('person.setSchedule',{perm:'control',
  validate(w,p){const q=w.persons[p.id];if(!q)return 'no such character';if(!Array.isArray(p.schedule)||p.schedule.length>8)return 'bad schedule';
    for(const s of p.schedule){if(!(s.h0>=0&&s.h1<=24&&s.h0<s.h1))return 'bad hours';if(['sleep','work','socialize','study','explore','activity'].indexOf(s.what)<0)return 'unknown schedule entry';
      if(s.what==='activity'&&!w.activities[s.data])return 'unknown activity';}return null;},
  apply(w,p){const q=w.persons[p.id],old=q.schedule;q.schedule=LW.clone(p.schedule);return {undo:{type:'person.setSchedule',payload:{id:q.id,schedule:old}},label:'Schedule'};}});
LW.def('person.edit',{perm:'edit',
  validate(w,p){const q=w.persons[p.id];if(!q)return 'no such character';
    for(const grp of ['traits','values'])if(p[grp])for(const k in p[grp]){if(!(k in q[grp]))return 'unknown '+grp+' '+k;if(!(p[grp][k]>=0&&p[grp][k]<=1))return 'values are 0..1';}
    return null;},
  apply(w,p){const q=w.persons[p.id],old={id:q.id,traits:LW.clone(q.traits),values:LW.clone(q.values)};
    if(p.traits){Object.assign(q.traits,p.traits);Object.assign(q.traitBase,p.traits);}if(p.values)Object.assign(q.values,p.values);
    return {undo:{type:'person.edit',payload:old},label:'Edit personality',gid:p.gid};}});
LW.def('person.pin',{perm:'view',validate:(w,p)=>w.persons[p.id]?null:'no such character',apply(w,p){w.persons[p.id].pinned=!!p.on;return {};}});
})();
