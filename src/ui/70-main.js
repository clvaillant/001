// boot
;(function(){'use strict';
const LW=globalThis.LW,G=LW.gfx,App=LW.app,UI=LW.ui;
App.errors=[];
addEventListener('error',e=>{App.errors.push(String(e.message||e.error));});
addEventListener('unhandledrejection',e=>{App.errors.push('rejection: '+String(e.reason&&e.reason.message||e.reason));});
async function boot(){
  const cv=document.getElementById('cv');App.canvas=cv;
  let gl=null;try{gl=G.init(cv);}catch(e){App.errors.push('gl: '+e.message);}
  if(!gl){
    const s=document.getElementById('start');s.hidden=false;
    s.replaceChildren(UI.h('div',{class:'card'},UI.h('h1',{text:'Living World'}),UI.h('p',{text:'This game needs WebGL2, which this browser or device did not provide. Try a current version of Chrome, Firefox, Edge or Safari, and make sure hardware acceleration is enabled.'})));
    return;
  }
  const dbg=gl.getExtension('WEBGL_debug_renderer_info');App.glInfo=dbg?String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).slice(0,80):'';
  cv.addEventListener('webglcontextlost',e=>{e.preventDefault();App.glLost=true;App.toast('Graphics context lost; waiting for the device to restore it…','warn');});
  cv.addEventListener('webglcontextrestored',()=>{G.init(cv);G._unit=null;App.terrain.nodes.clear();App.scene.bm.clear();App.scene.vm.clear();App.scene.water=null;App.scene.waterKey='';App.glLost=false;App.toast('Graphics restored.');});
  App.cam=G.newCamera();App.terrain=new G.Terrain();App.scene=new G.Scene();
  App.bindInput(cv);
  await App.initStore();
  App.newDraft();
  if(LW.lanClient)await LW.lanClient.ready;
  await UI.start();
  requestAnimationFrame(App.frame);
  const flush=()=>{if(App.world)App.snapshot(false);};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
  addEventListener('pagehide',flush);
  App.booted=true;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
