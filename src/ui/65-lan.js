// optional LAN client. Active ONLY when this page is served by a Living World LAN host over http(s) on the
// same origin; opened from a file it does nothing and the game makes no requests. The host stays the single
// authority: commands are applied here optimistically for instant feedback, sent to the host, and the host's
// state then replaces the local mirror.
;(function(){'use strict';
const LW=globalThis.LW,App=LW.app,UI=LW.ui,h=UI.h;
const L=LW.lanClient={info:null,busy:false};
const http=/^https?:$/.test(location.protocol);
async function api(method,path,body){
  const r=await fetch(path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});
  let j={};try{j=await r.json();}catch(e){}
  return {status:r.status,body:j};
}
L.detect=async function(){
  if(!http)return null;
  try{const r=await api('GET','/api/info');if(r.status===200&&r.body.app==='living-world-lan')L.info=r.body;}catch(e){}
  return L.info;
};
function adopt(world){
  const old=App.world,sel=App.sel;
  App.world=world;App.draft=null;App.preview=null;App.phase='play';
  if(old&&(old.editSeq!==world.editSeq||old.genEpoch!==world.genEpoch||old.id!==world.id))App.terrain.invalidateAll();
  if(sel&&sel.id&&!(world.persons[sel.id]||world.organisms[sel.id]||world.buildings[sel.id]||world.settlements[sel.id]||world.cohorts[sel.id]||world.volumes[sel.id]))App.sel=null;
}
async function pull(){
  const lan=App.lan,r=await api('GET','/api/snapshot?token='+lan.token);
  if(r.status!==200)throw new Error(r.body.error||'snapshot refused');
  const w=LW.save.parse(r.body.archive);adopt(w);lan.rev=w.revision;lan.snapAt=Date.now();
}
L.join=async function(code,name){
  code=String(code||'').trim();if(!code)return {ok:false,error:'Enter an invitation code or the owner token'};
  let r=await api('POST','/api/join',{invite:code,name});
  if(r.status!==200){const o=await api('POST','/api/resume',{token:code});if(o.status===200)r={status:200,body:Object.assign({token:code},o.body)};}
  if(r.status!==200)return {ok:false,error:r.body.error||'Could not join'};
  App.lan={token:r.body.token,actor:r.body.actor,rev:-1,snapAt:0,speed:0,errors:0};
  LW.LOCAL_ACTOR=r.body.actor;                    // every local command is validated with the role the host gave us
  try{await pull();}catch(e){App.lan=null;LW.LOCAL_ACTOR={id:'local',role:'owner'};return {ok:false,error:e.message};}
  App.terrain.reset();App.scene.reset();App.speed=0;
  clearInterval(L.timer);L.timer=setInterval(L.poll,1200);
  return {ok:true,role:r.body.actor.role};
};
L.leave=function(){clearInterval(L.timer);App.lan=null;LW.LOCAL_ACTOR={id:'local',role:'owner'};App.world=null;App.newDraft();UI.start();};
// bounded sync: nearby entities every poll; the full archive only when the host's revision moved (someone edited)
L.poll=async function(){
  const lan=App.lan;if(!lan||L.busy||!App.world)return;L.busy=true;
  try{
    const c=App.cam,r=await api('GET','/api/sync?token='+lan.token+'&n='+c.n.join(',')+'&r='+Math.round(Math.max(1500,c.dist*4)));
    if(r.status!==200)throw new Error(r.body.error||'sync refused');
    lan.errors=0;lan.speed=r.body.speed;
    if(!App.stroke&&(r.body.revision!==lan.rev||Date.now()-lan.snapAt>20000))await pull();
    else if(!App.stroke){const w=App.world;for(const k of ['persons','organisms','buildings'])for(const id in r.body.near[k])w[k][id]=r.body.near[k][id];w.tick=r.body.tick;w.mode=r.body.mode;}
    App.changed('world.setMode');
  }catch(e){lan.errors++;if(lan.errors===3)App.toast('Lost contact with the LAN host; retrying…','warn');}
  finally{L.busy=false;}
};
async function send(cmd){
  const lan=App.lan;if(!lan)return;
  try{const r=await api('POST','/api/command',{token:lan.token,cmd});
    if(!r.body.ok)App.toast('The host refused that change: '+(r.body.error||r.body.code),'err');
    lan.rev=-1;                                   // fetch the authoritative result on the next poll
  }catch(e){App.toast('Could not reach the LAN host; the change was not shared.','err');}
}
// route every state-changing command through the host
const baseDo=App.do;
App.do=function(type,payload,quiet){
  if(!App.lan)return baseDo(type,payload,quiet);
  if(type==='view.interest')return {ok:true};
  const w=App.world,cmd=LW.cmd(w,type,payload),r=LW.dispatch(w,cmd,App.lan.actor);
  if(!r.ok){if(!quiet)App.toast(r.error||r.code,'err');return r;}
  App.changed(type);send(cmd);return r;
};
const baseUndo=App.undo,baseRedo=App.redo;
App.undo=function(){if(!App.lan)return baseUndo();const r=App.do('history.undo',{});if(r.ok){App.terrain.invalidateAll();App.toast('Undid: '+r.result.label);}};
App.redo=function(){if(!App.lan)return baseRedo();const r=App.do('history.redo',{});if(r.ok){App.terrain.invalidateAll();App.toast('Redone');}};
const baseSpeed=App.setSpeed;
App.setSpeed=function(i){
  if(!App.lan)return baseSpeed(i);
  if(App.lan.actor.role!=='owner')return App.toast('Only the world owner controls shared time.','warn');
  api('POST','/api/clock',{token:App.lan.token,ticksPerSecond:App.SPEEDS[i]}).then(r=>{if(r.status===200){App.lan.speed=r.body.speed;App.changed('speed');}});
};
const baseSnap=App.snapshot;App.snapshot=function(force){return App.lan?Promise.resolve(false):baseSnap(force);};
const baseCommit=LW.onCommit;LW.onCommit=function(){if(!App.lan&&baseCommit)return baseCommit.apply(this,arguments);};
// ---- interface ---------------------------------------------------------------------------
const baseStart=UI.start;
UI.start=async function(){
  await baseStart();if(!L.info)return;
  const card=document.querySelector('#start .card');if(!card)return;
  const name=h('input',{type:'text',placeholder:'Your name',maxlength:24,'aria-label':'Your name'}),code=h('input',{type:'text',placeholder:'Invitation code or owner token','aria-label':'Invitation code'});
  card.append(h('div',{class:'saves'},h('h3',{text:'Shared world on this network'}),h('p',{text:'“'+L.info.world+'” is hosted on this local network.'}),
    h('div',{class:'row'},name),h('div',{class:'row'},code),
    h('button',{class:'b primary big',onclick:async()=>{const r=await L.join(code.value,name.value);if(!r.ok)return App.toast(r.error,'err');UI.enter();App.toast('Joined as '+r.role+'. The host decides the order of all changes.');}},'Join shared world'),
    h('p',{class:'note',text:L.info.warning})));
};
const baseTop=UI.renderTop;
UI.renderTop=function(){
  baseTop();const lan=App.lan;if(!lan)return;
  const chip=document.getElementById('modechip');if(chip)chip.textContent='LAN · '+lan.actor.role.toUpperCase();
  const sp=document.querySelector('#top .speeds');
  if(sp)sp.replaceChildren.apply(sp,lan.actor.role==='owner'?[].concat(App.world.mode==='play'?[]:[h('button',{class:'b primary',onclick:()=>{App.do('world.setMode',{mode:'play'});App.setSpeed(1);}},'▶ Play')],
    App.SPEED_LABELS.map((l,i)=>h('button',{class:'b sp'+(App.SPEEDS[i]===lan.speed?' on':''),onclick:()=>App.setSpeed(i),'aria-label':i?'Speed '+l:'Pause'},l))):[h('span',{class:'note',text:lan.speed?'time running':'time paused by owner'})]);
};
const baseMenu=UI.openMenu;
UI.openMenu=async function(){
  await baseMenu();const lan=App.lan,sheet=document.querySelector('#modal .sheet');if(!lan||!sheet)return;
  const out=h('p',{class:'note',text:''});
  const invite=role=>h('button',{class:'b',onclick:async()=>{const r=await api('POST','/api/invite',{token:lan.token,role});out.textContent=r.status===200?'Invitation for one '+role+': '+r.body.invite+' (single use)':'Refused: '+(r.body.error||r.status);}},'Invite '+role);
  sheet.insertBefore(h('div',null,h('h3',{text:'Shared LAN world'}),h('p',{text:'You are '+lan.actor.id+' ('+lan.actor.role+'). Saving, snapshots and the clock belong to the host.'}),
    h('div',{class:'row wrap'},lan.actor.role==='owner'?[invite('editor'),invite('visitor')]:null,h('button',{class:'b ghost',onclick:()=>{UI.closeModal();L.leave();}},'Leave shared world')),out),sheet.children[1]||null);
};
L.ready=L.detect();
})();
