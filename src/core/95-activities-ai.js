// safe player-authored activities (bounded declarative graphs, never code) and the optional local-model
// dialogue adapter with an honestly labelled rule-based fallback.
;(function(){'use strict';
const LW=globalThis.LW,M=LW.mind,B=LW.build;
const A=LW.activities={};
const NODE={go:1,use:1,wait:1,if:1,say:1,end:1},CAPS=['sleep','sit','eat','cook','store','drink','work','study'],PLACES=['home','settlement','water'];
A.validate=function(g){
  if(!g||typeof g!=='object')return 'activity must be an object';
  if(typeof g.name!=='string'||!g.name||g.name.length>40)return 'name required (max 40 chars)';
  if(!Array.isArray(g.nodes)||!g.nodes.length||g.nodes.length>40)return '1..40 nodes';
  const ids={};
  for(const n of g.nodes){
    if(!n||typeof n.id!=='string'||!/^[a-z0-9_]{1,16}$/.test(n.id)||ids[n.id])return 'node ids must be unique short identifiers';
    ids[n.id]=1;if(!NODE[n.type])return 'unknown node type '+n.type;
    for(const k of Object.keys(n))if(['id','type','next','then','else','cap','place','ticks','text','cond'].indexOf(k)<0)return 'unknown field '+k;
  }
  if(!ids[g.start])return 'start node missing';
  for(const n of g.nodes){
    if(n.type==='if'){if(!ids[n.then]||!ids[n.else])return 'if needs then/else targets';
      const c=n.cond||{};
      if(c.need){if(['hunger','thirst','energy','social'].indexOf(c.need)<0||(c.op!=='<'&&c.op!=='>')||!(c.value>=0&&c.value<=100))return 'bad need condition';}
      else if(c.time){if(c.time!=='day'&&c.time!=='night')return 'time is day or night';}
      else if(c.has){if(['food','wood','stone'].indexOf(c.has)<0)return 'bad has condition';}
      else return 'if needs a condition';}
    else if(n.type!=='end'&&!ids[n.next])return 'node '+n.id+' needs a valid next';
    if(n.type==='use'&&CAPS.indexOf(n.cap)<0)return 'unknown capability '+n.cap;
    if(n.type==='go'&&PLACES.indexOf(n.place)<0)return 'unknown place '+n.place;
    if(n.type==='wait'&&!(Number.isInteger(n.ticks)&&n.ticks>0&&n.ticks<=2000))return 'wait 1..2000 ticks';
    if(n.type==='say'&&(typeof n.text!=='string'||n.text.length>80))return 'say text max 80 chars';
  }
  return null;
};
LW.def('activity.define',{perm:'edit',
  validate(w,p){const e=A.validate(p.activity);if(e)return e;if(Object.keys(w.activities).length>=40)return 'activity limit reached';return null;},
  apply(w,p){const g=LW.clone(p.activity);g.id=p.activity.id&&w.activities[p.activity.id]?p.activity.id:LW.newId(w,'act');const old=w.activities[g.id];w.activities[g.id]=g;
    return {public:{id:g.id},undo:old?{type:'activity.define',payload:{activity:old}}:{type:'activity.remove',payload:{id:g.id}},label:'Activity'};}});
LW.def('activity.remove',{perm:'edit',validate:(w,p)=>w.activities[p.id]?null:'no such activity',
  apply(w,p){const g=w.activities[p.id];delete w.activities[p.id];
    for(const id in w.persons){const q=w.persons[id];q.goals=q.goals.filter(x=>x.activity!==p.id);q.schedule=q.schedule.filter(s=>s.data!==p.id);}
    return {undo:{type:'activity.define',payload:{activity:g}},label:'Activity'};}});
function cond(w,p,c){
  if(c.need)return c.op==='<'?p.needs[c.need]<c.value:p.needs[c.need]>c.value;
  if(c.time){const h=LW.hourAt(w,p.n),night=h<6||h>21;return c.time==='night'?night:!night;}
  return (p.inv[c.has]||0)>0;
}
// interpreter: expands graph nodes into the same primitive actions autonomous plans use. Bounded: max 64 node visits.
A.step=function(w,p,a,sp,stepFn){
  const g=w.activities[a.id];if(!g)return 'missing';
  if(a.cur){const r=stepFn(w,p,a.cur,sp);if(r===null)return null;M.release(w,p,a.cur);if(r!=='done')return r;a.cur=null;a.node=a.nextNode;}
  if(a.node===undefined)a.node=g.start;
  for(let guard=0;guard<10;guard++){
    const nd=g.nodes.find(n=>n.id===a.node);if(!nd||nd.type==='end')return 'done';
    a.visits=(a.visits||0)+1;if(a.visits>64)return 'done';
    if(nd.type==='if'){a.node=cond(w,p,nd.cond)?nd.then:nd.else;continue;}
    if(nd.type==='say'){M.remember(w,p,'said',nd.text,0.2);a.node=nd.next;continue;}
    a.nextNode=nd.next;
    if(nd.type==='wait')a.cur={a:'wait',n:nd.ticks};
    else if(nd.type==='go'){
      const home=w.buildings[p.home],s=w.settlements[p.settlement];let to=null;
      if(nd.place==='home'&&home)to=LW.offsetDir(home.n,0,-(B.radius(home)+1.5),w.body.radius);
      else if(nd.place==='settlement'&&s)to=s.n;
      else if(nd.place==='water'){for(const k in p.beliefs){const b=p.beliefs[k];if(b.p==='water'&&b.v&&b.n){to=b.n;break;}}}
      if(!to)return 'missing';a.cur={a:'go',to:to.slice()};
    }else{
      let found=null;const cands=[w.buildings[p.home]].concat(((w.settlements[p.settlement]||{}).buildings||[]).map(id=>w.buildings[id]));
      for(const b of cands){if(!b||b.progress<1)continue;const c=B.findCap(b,nd.cap,p.id);if(c){found={a:'use',b:b.id,c:c.id,cap:nd.cap,max:nd.cap==='sleep'?1900:undefined};break;}}
      if(!found)return 'missing';a.cur=found;
    }
    return null;
  }
  return null;
};

// ---- dialogue -----------------------------------------------------------------------
const AI=LW.localAI={provider:null,budget:{maxContextChars:6000,maxTokens:160,timeoutMs:20000}};
// A provider must be a genuinely local runtime: {name, local:true, generate({system,context,user,maxTokens,timeoutMs})->Promise<{text}>}
AI.register=function(p){
  if(!p||typeof p.generate!=='function'||typeof p.name!=='string'||p.local!==true)throw new LW.Error('bad_provider','provider must declare local:true and implement generate()');
  AI.provider=p;
};
AI.status=function(){return AI.provider?{available:true,kind:'local-model',name:AI.provider.name}:{available:false,kind:'rule-based',name:'Scripted dialogue (no local model installed)'};};
const srcText={observation:'I saw it myself',told:'I was told',taught:'I was taught',inference:'I have come to suspect',instinct:'I simply feel it'};
function confText(c){return c>0.8?'I am sure':c>0.5?'I believe':c>0.25?'I think, though I am not certain,':'I vaguely recall';}
// read-only, explicitly selected character context: only what THIS character knows
AI.context=function(w,p){
  const beliefs=Object.keys(p.beliefs).map(k=>({key:k,value:p.beliefs[k].v,confidence:+M.conf(w,p.beliefs[k]).toFixed(2),source:p.beliefs[k].s})).slice(0,20);
  const s=JSON.stringify({name:p.name,species:w.species[p.speciesId].name,needs:p.needs,mood:p.mood,doing:p.act?p.act.a:(p.plan?p.plan.goal:'nothing'),memories:p.mem.ep.slice(-12).map(e=>e.x),beliefs});
  return s.slice(0,AI.budget.maxContextChars);
};
AI.TOPICS=[['feel','How are you?'],['doing','What are you doing?'],['water','Where is water?'],['know','What do you know?'],['who','Who matters to you?'],['past','What do you remember?'],['world','What is this world?']];
// bounded, NON-generative replies assembled from the character's actual state
AI.scripted=function(w,p,topic){
  const N=p.needs,low=Object.keys(N).filter(k=>N[k]<35);let t;
  switch(topic){
    case 'feel':t=low.length?'Not well. My '+low.join(' and ')+' trouble'+(low.length>1?'':'s')+' me.':(p.mood>0.3?'I feel good today.':'I am getting by.');break;
    case 'doing':t=p.act?'I am busy: '+(p.plan?p.plan.goal:p.act.a)+'.':'Nothing in particular.';
      if(p.lastFail&&w.tick-p.lastFail.t<LW.TPD)t+=' Earlier: '+(M.FAIL_TEXT[p.lastFail.reason]||p.lastFail.reason)+'.';break;
    case 'water':{const ks=Object.keys(p.beliefs).filter(k=>p.beliefs[k].p==='water');
      if(!ks.length)t='I do not know of any water. I would look downhill.';
      else t=ks.slice(0,3).map(k=>{const b=p.beliefs[k];return confText(M.conf(w,b))+' there is '+(b.v?'':'no ')+'water at '+(b.ref?'the well':'the place I call '+k.split(':')[1])+' ('+srcText[b.s]+(b.f&&w.persons[b.f]?' by '+w.persons[b.f].name:'')+').';}).join(' ');break;}
    case 'know':{const ks=Object.keys(p.beliefs);t=ks.length?'I hold '+ks.length+' beliefs; '+ks.filter(k=>p.beliefs[k].s==='observation').length+' I witnessed myself, the rest I was told or worked out.':'Very little yet.';
      const sk=Object.keys(p.skills).sort((a,b)=>p.skills[b]-p.skills[a])[0];t+=' My best skill is '+sk+'.';break;}
    case 'who':{const rs=M.relsOf(w,p.id).filter(x=>w.persons[x.other]).sort((a,b)=>b.r.aff-a.r.aff);
      t=rs.length?rs.slice(0,3).map(x=>w.persons[x.other].name+' ('+x.r.kind+')').join(', ')+'.':'I know no one yet.';break;}
    case 'past':{const ep=p.mem.ep.slice().sort((a,b)=>b.s-a.s).slice(0,3);t=ep.length?ep.map(e=>e.x).join('. ')+'.':'My memory is empty.';
      if(p.origin&&p.origin.unknownPast)t+=' Of my earlier years I can tell you nothing certain.';break;}
    case 'world':{const h=p.beliefs['hypothesis:shaped'];
      t=h?confText(M.conf(w,h))+' '+h.x.toLowerCase()+'. I have seen '+Math.round(p.anomalies)+' things I cannot explain.':'It is the ground under my feet and the sky above. What else would it be?';break;}
    default:t='...';
  }
  return {text:t,kind:'scripted'};
};
// genuine local generation, if and only if a provider was registered. Returns a speech PROPOSAL; it has no write access.
AI.generate=async function(w,p,userText){
  if(!AI.provider)throw new LW.Error('no_local_model','No local model is installed; open-ended dialogue is disabled.');
  const r=await AI.provider.generate({system:'You are '+p.name+'. Speak only from the given context. One or two sentences.',context:AI.context(w,p),user:String(userText).slice(0,400),maxTokens:AI.budget.maxTokens,timeoutMs:AI.budget.timeoutMs});
  return {text:String((r&&r.text)||'').slice(0,600),kind:'local-model',model:AI.provider.name};
};
// the only way a conversation touches canonical state: a validated command recording that it happened
LW.def('person.dialogue',{perm:'control',
  validate:(w,p)=>w.persons[p.id]&&w.persons[p.id].alive&&typeof p.topic==='string'&&p.topic.length<=40?null:'bad dialogue',
  apply(w,p){const q=w.persons[p.id];q.needs.social=Math.min(100,q.needs.social+4);
    M.remember(w,q,'voice','A voice with no body asked me about "'+p.topic+'"',0.5);q.anomalies+=0.25;
    q.hypo=1-Math.exp(-q.anomalies*(0.1+0.3*q.traits.curiosity));
    if(q.hypo>0.5)M.believe(w,q,'hypothesis:shaped',{p:'hypothesis',v:true,c:q.hypo,s:'inference',x:'Some unseen will reshapes this world',evidence:q.anomalies});
    return {public:{hypo:q.hypo}};}});
})();
