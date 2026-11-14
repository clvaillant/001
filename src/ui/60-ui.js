// presentation / interface: minimalist, touch-first, contextual panels. All world-derived strings are set
// through textContent (never innerHTML), so imported worlds cannot inject markup or script.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V,E=LW.env,P=LW.planet,B=LW.build,M=LW.mind,App=LW.app;
const UI=LW.ui={tab:'needs',menu:null,modal:null,busy:false};
function h(tag,props){
  const e=document.createElement(tag);
  if(props)for(const k in props){const v=props[k];
    if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k.slice(0,2)==='on')e.addEventListener(k.slice(2),v);
    else if(k==='style')e.style.cssText=v;else if(k==='value')e.value=v;else if(v!==false&&v!=null)e.setAttribute(k,v===true?'':v);}
  for(let i=2;i<arguments.length;i++){const c=arguments[i];if(c==null||c===false)continue;
    if(Array.isArray(c))c.forEach(x=>x!=null&&x!==false&&e.append(x.nodeType?x:document.createTextNode(String(x))));else e.append(c.nodeType?c:document.createTextNode(String(c)));}
  return e;
}
UI.h=h;
const btn=(label,fn,cls,title)=>h('button',{class:'b '+(cls||''),onclick:fn,title:title||null,'aria-label':title||null},label);
function slider(label,min,max,step,val,fn,fmt){
  const out=h('span',{class:'val',text:fmt?fmt(val):val});
  const inp=h('input',{type:'range',min,max,step,value:val,'aria-label':label,oninput:e=>{const v=+e.target.value;out.textContent=fmt?fmt(v):v;fn(v);}});
  return h('label',{class:'sl'},h('span',{class:'lb',text:label}),inp,out);
}
function select(label,opts,val,fn){
  const s=h('select',{'aria-label':label,onchange:e=>fn(e.target.value)},opts.map(o=>{const op=h('option',{value:o[0],text:o[1]});if(String(o[0])===String(val))op.selected=true;return op;}));
  return h('label',{class:'sl'},h('span',{class:'lb',text:label}),s);
}
const fmtM=m=>Math.abs(m)>=10000?(m/1000).toFixed(0)+' km':Math.abs(m)>=1000?(m/1000).toFixed(1)+' km':m.toFixed(m<10?1:0)+' m';
const el=id=>document.getElementById(id);
function set(id,nodes){const e=el(id);e.replaceChildren.apply(e,[].concat(nodes).filter(Boolean));return e;}

// ---- start screen --------------------------------------------------------------------------
const PRESETS={
  Temperate:{},
  Arid:{gen:{landFraction:0.78,moisture:-0.25},atmosphere:{baseTemp:25,color:[0.86,0.62,0.42]}},
  Ocean:{gen:{landFraction:0.16,moisture:0.15}},
  Frozen:{gen:{landFraction:0.5},atmosphere:{baseTemp:-12,color:[0.7,0.82,0.96]}},
  'Terraced fantasy':{gen:{terrace:0.9,relief:1.6,ridges:1},atmosphere:{color:[0.62,0.5,0.92]},star:{color:[1,0.86,0.95]}},
  Alien:{gravity:4,gen:{landFraction:0.6,roughness:0.9,minerals:1},atmosphere:{color:[0.3,0.82,0.7],density:1.4},star:{color:[1,0.62,0.45]}}};
let advT=0,cfg=null;
function draftFromCfg(){clearTimeout(advT);advT=setTimeout(()=>{
  const amp=Math.min(cfg.radius*0.04,8000)*cfg.relief;
  App.newDraft({seed:cfg.seed,name:cfg.name,body:{radius:cfg.radius,gravity:cfg.gravity,axialTilt:cfg.tilt,seaLevel:cfg.sea*amp,yearDays:cfg.yearDays,
    star:{color:cfg.starColor,lum:cfg.lum},atmosphere:{density:cfg.dens,baseTemp:cfg.temp,color:cfg.atmColor},
    gen:{landFraction:cfg.land,relief:cfg.relief,roughness:cfg.rough,continentScale:cfg.cscale,ridges:cfg.ridges,terrace:cfg.terrace,moisture:cfg.moist,minerals:cfg.minerals}}});
},140);}
function cfgFromDraft(){const b=App.draft.body,amp=P.amplitude(b);
  cfg={seed:App.draft.seed,name:App.draft.name,radius:b.radius,gravity:b.gravity,tilt:b.axialTilt,sea:b.seaLevel/amp,yearDays:b.yearDays,starColor:b.star.color.slice(),lum:b.star.lum,
    dens:b.atmosphere.density,temp:b.atmosphere.baseTemp,atmColor:b.atmosphere.color.slice(),land:b.gen.landFraction,relief:b.gen.relief,rough:b.gen.roughness,cscale:b.gen.continentScale,
    ridges:b.gen.ridges,terrace:b.gen.terrace,moist:b.gen.moisture,minerals:b.gen.minerals};}
UI.start=async function(){
  App.phase='start';el('hud').hidden=true;el('adv').hidden=true;el('start').hidden=false;
  if(!App.draft)App.newDraft();
  const saves=App.store?await App.store.list().catch(()=>[]):[];
  const fileIn=h('input',{type:'file',accept:'.lwworld,.json,application/json',hidden:true,onchange:async e=>{const f=e.target.files[0];if(!f)return;
    if(f.size>LW.save.MAX_BYTES)return App.toast('File too large','err');const r=await App.importText(await f.text());if(r.ok)UI.enter();}});
  set('start',[h('div',{class:'card'},
    h('h1',{text:'Living World'}),h('p',{class:'tag',text:'Shape a planet. Introduce life. Watch it live.'}),
    btn('Quick Start',()=>UI.create(),'primary big','Create this randomly generated planet now'),
    btn('Advanced Planet Setup',()=>UI.advanced(),'big'),
    btn('New random planet',()=>{App.newDraft();UI.start();},'ghost'),
    saves.length?h('div',{class:'saves'},h('h3',{text:'Continue'}),saves.slice(0,6).map(s=>h('div',{class:'row'},
      btn(s.name+' · tick '+s.tick,async()=>{const r=await App.openSaved(s.id);if(r)UI.enter(true,s.wall);},'grow'),
      btn('✕',async()=>{if(confirm('Delete saved world “'+s.name+'”? This cannot be undone.')){await App.store.remove(s.id);UI.start();}},'ghost','Delete save')))):null,
    btn('Import world file…',()=>fileIn.click(),'ghost'),fileIn,
    h('p',{class:'note',text:'Seed '+App.draft.seed+' · runs fully offline · '+(App.storeKind==='memory'?'⚠ this browser context blocks local storage: worlds are NOT kept after closing — use Export':'saves locally ('+App.storeKind+')')}))]);
};
UI.advanced=function(){
  cfgFromDraft();el('start').hidden=true;el('adv').hidden=false;
  const up=(k,f)=>v=>{cfg[k]=f?f(v):v;draftFromCfg();};
  const seedIn=h('input',{type:'number',value:cfg.seed,min:1,max:4294967295,'aria-label':'Seed',onchange:e=>{cfg.seed=(+e.target.value>>>0)||1;draftFromCfg();}});
  const nameIn=h('input',{type:'text',value:cfg.name,maxlength:40,'aria-label':'World name',onchange:e=>{cfg.name=e.target.value||'World';draftFromCfg();}});
  const colors=(label,key,list)=>h('label',{class:'sl'},h('span',{class:'lb',text:label}),h('span',{class:'sw'},list.map(c=>h('button',{class:'swatch',style:'background:rgb('+c.map(x=>Math.round(x*255)).join(',')+')','aria-label':label+' colour',onclick:()=>{cfg[key]=c;draftFromCfg();}}))));
  set('adv',[h('div',{class:'panel'},
    h('div',{class:'row'},h('h2',{text:'Planet setup'}),btn('Back',()=>UI.start(),'ghost')),
    h('p',{class:'note',text:'The sphere behind this panel is the real planet, regenerated live. Drag to rotate, pinch or scroll to zoom.'}),
    h('label',{class:'sl'},h('span',{class:'lb',text:'Name'}),nameIn),
    h('label',{class:'sl'},h('span',{class:'lb',text:'Seed'}),seedIn,btn('🎲',()=>{cfg.seed=(Math.floor(Math.random()*4294967295)>>>0)||1;seedIn.value=cfg.seed;draftFromCfg();},'ghost','Random seed')),
    h('div',{class:'chips'},Object.keys(PRESETS).map(k=>btn(k,()=>{const p=PRESETS[k];cfgFromDraft();
      const d=LW.defaultBody({},cfg.seed);cfg.land=d.gen.landFraction;cfg.moist=0;cfg.terrace=0;cfg.relief=1;cfg.ridges=0.7;cfg.rough=0.5;cfg.minerals=0.5;cfg.temp=16;cfg.dens=1;cfg.atmColor=d.atmosphere.color;cfg.starColor=d.star.color;cfg.gravity=9.8;
      if(p.gen){if(p.gen.landFraction!==undefined)cfg.land=p.gen.landFraction;if(p.gen.moisture!==undefined)cfg.moist=p.gen.moisture;if(p.gen.terrace!==undefined)cfg.terrace=p.gen.terrace;if(p.gen.relief)cfg.relief=p.gen.relief;if(p.gen.ridges)cfg.ridges=p.gen.ridges;if(p.gen.roughness)cfg.rough=p.gen.roughness;if(p.gen.minerals)cfg.minerals=p.gen.minerals;}
      if(p.atmosphere){if(p.atmosphere.baseTemp!==undefined)cfg.temp=p.atmosphere.baseTemp;if(p.atmosphere.color)cfg.atmColor=p.atmosphere.color;if(p.atmosphere.density)cfg.dens=p.atmosphere.density;}
      if(p.star)cfg.starColor=p.star.color;if(p.gravity)cfg.gravity=p.gravity;
      draftFromCfg();setTimeout(UI.advanced,200);},'chip'))),
    h('h3',{text:'Body'}),
    slider('Radius',0,4,0.01,Math.log10(cfg.radius/2000),up('radius',v=>Math.round(2000*Math.pow(10,v))),v=>fmtM(2000*Math.pow(10,v))),
    slider('Gravity',0.5,30,0.1,cfg.gravity,up('gravity'),v=>v.toFixed(1)+' m/s²'),
    slider('Axial tilt',0,80,1,cfg.tilt,up('tilt'),v=>v+'°'),
    slider('Year length',8,400,1,cfg.yearDays,up('yearDays'),v=>v+' days'),
    h('h3',{text:'Land and water'}),
    slider('Land share',0.02,0.98,0.01,cfg.land,up('land'),v=>Math.round(v*100)+'%'),
    slider('Sea level',-0.5,0.5,0.01,cfg.sea,up('sea'),v=>(v>0?'+':'')+Math.round(v*100)+'% relief'),
    slider('Relief',0.2,3,0.05,cfg.relief,up('relief'),v=>v.toFixed(2)+'×'),
    slider('Mountain ridges',0,1.5,0.05,cfg.ridges,up('ridges')),
    slider('Roughness',0,1.2,0.05,cfg.rough,up('rough')),
    slider('Continent size',0.5,3,0.05,cfg.cscale,up('cscale'),v=>(1/v).toFixed(2)+'×'),
    slider('Terracing (fantastical)',0,1,0.05,cfg.terrace,up('terrace')),
    h('h3',{text:'Climate and materials'}),
    slider('Base temperature',-60,60,1,cfg.temp,up('temp'),v=>v+' °C'),
    slider('Atmosphere density',0,3,0.05,cfg.dens,up('dens'),v=>v.toFixed(2)+' atm'),
    slider('Moisture',-0.4,0.4,0.02,cfg.moist,up('moist')),
    slider('Mineral richness',0,1,0.05,cfg.minerals,up('minerals')),
    slider('Star luminosity',0.3,2.5,0.05,cfg.lum,up('lum'),v=>v.toFixed(2)+'×'),
    colors('Star light','starColor',[[1,0.95,0.86],[1,0.8,0.6],[1,0.6,0.45],[0.8,0.88,1],[1,0.86,0.95]]),
    colors('Sky','atmColor',[[0.42,0.66,0.96],[0.86,0.62,0.42],[0.3,0.82,0.7],[0.62,0.5,0.92],[0.7,0.82,0.96],[0.9,0.85,0.5]]),
    h('div',{class:'row sticky'},btn('Create world',()=>UI.create(),'primary big grow')))]);
};
UI.create=async function(){
  clearTimeout(advT);const w=App.draft;await App.startWorld(w,true);UI.enter();
  App.toast('A new, uninhabited world. Sculpt it, then introduce life and press Play.');
};
UI.enter=function(opened,wall){
  el('start').hidden=true;el('adv').hidden=true;el('hud').hidden=false;App.phase='play';App.setTool('nav');UI.renderAll();
  const w=App.world;
  if(opened&&w.mode==='play'&&wall){       // bounded catch-up: nothing ran while closed; the player may simulate a limited interval
    const away=(Date.now()-wall)/1000,ticks=Math.min(Math.floor(away*2),LW.TPD*2);
    if(ticks>240)UI.showModal('While you were away',[h('p',{text:'This world was closed for '+(away/3600).toFixed(1)+' hours. Nothing was simulated during that time — no process was running.'}),
      h('p',{text:'You can simulate a bounded catch-up of '+(ticks/LW.TPD).toFixed(2)+' world days now, or resume exactly where you left off.'}),
      h('div',{class:'row'},btn('Simulate catch-up',()=>UI.catchUp(ticks),'primary'),btn('Resume frozen',()=>UI.closeModal()))]);
  }
};
UI.catchUp=function(ticks){
  let left=ticks;const bar=h('progress',{max:ticks,value:0});
  UI.showModal('Catching up…',[bar]);
  const stepFn=()=>{const n=Math.min(480,left);App.do('time.advance',{ticks:n},true);left-=n;bar.value=ticks-left;if(left>0)setTimeout(stepFn,0);else{UI.closeModal();App.toast('Caught up '+(ticks/LW.TPD).toFixed(2)+' days.');}};
  stepFn();
};

// ---- HUD -----------------------------------------------------------------------------------------
const CATS=[['nav','✋','Navigate'],['sculpt','⛰','Sculpt'],['paint','🖌','Paint'],['life','🌱','Life'],['build','🏠','Build'],['dig','⛏','Dig'],['planet','🪐','Planet']];
const SUGGEST={Orbit:['sculpt','paint','planet'],Continent:['sculpt','paint','planet'],Region:['sculpt','paint','life'],Landscape:['life','sculpt','build'],Settlement:['build','life','dig'],Home:['build','dig','life']};
const SCULPT=[['raise','Raise'],['lower','Lower'],['smooth','Smooth'],['flatten','Flatten'],['mountain','Mountains'],['valley','Valley / riverbed'],['shore','Coastline']];
UI.renderTop=function(){
  const w=App.world;if(!w)return;
  const play=w.mode==='play';
  set('top',[btn('☰',()=>UI.openMenu(),'icon','Menu'),
    h('div',{class:'title'},h('b',{text:w.name}),h('span',{id:'clock',text:LW.clockText(w)})),
    h('span',{class:'chip '+(play?'live':'create'),id:'modechip',text:play?'LIVE':'CREATOR'}),
    play?h('div',{class:'speeds'},App.SPEED_LABELS.map((l,i)=>btn(l,()=>App.setSpeed(i),'sp'+(App.speed===i?' on':''),i?'Speed '+l:'Pause'))):
      h('div',{class:'speeds'},btn('▶ Play',()=>App.play(),'primary','Start life'),btn(App.speed?'⏸ env':'☀ env',()=>App.setSpeed(App.speed?0:2),'sp'+(App.speed?' on':''),'Run environment only (seasons, growth) without starting individual life')),
    btn('↶',()=>App.undo(),'icon','Undo'),btn('↷',()=>App.redo(),'icon','Redo')]);
};
UI.renderTools=function(){
  const t=App.tool,w=App.world;if(!w)return;
  const sug=SUGGEST[App.scale()]||[];
  set('toolbar',CATS.map(c=>h('button',{class:'cat'+(t.cat===c[0]?' on':'')+(sug.indexOf(c[0])>=0?' sug':''),onclick:()=>{App.setTool(c[0],c[0]==='sculpt'?'raise':c[0]==='paint'?'biome':c[0]==='life'?'plants':c[0]==='build'?'template':c[0]==='dig'?'carve':c[0]);},'aria-label':c[2]},h('span',{class:'ic',text:c[1]}),h('span',{class:'tx',text:c[2]}))));
  const editing=App.isBrush()||['carve','fill'].indexOf(t.id)>=0,placing=['creature','person','cohort','template','comp','digsite'].indexOf(t.id)>=0;
  const md=el('mode');md.className=editing?'edit':placing?'place':'navm';
  md.textContent=App.pending?App.pending.label:editing?'EDIT · drag on the world to '+t.id+' · two fingers / right-drag to move':placing?'PLACE · tap the world':'NAVIGATE · drag to move · pinch / scroll to zoom · tap to inspect';
  const tools=(list)=>h('div',{class:'chips'},list.map(x=>btn(x[1],()=>App.setTool(t.cat,x[0]),'chip'+(t.id===x[0]?' on':''))));
  const R=w.body.radius,rad=()=>slider('Brush radius',0,1,0.002,Math.log(t.r/2)/Math.log(R*0.6/2),v=>{t.r=2*Math.pow(R*0.6/2,v);t.lockR=true;},v=>fmtM(2*Math.pow(R*0.6/2,v)));
  const amp=P.amplitude(w.body),str=()=>slider('Strength',0,1,0.002,Math.log(t.s/0.2)/Math.log((amp+10)/0.2),v=>{t.s=0.2*Math.pow((amp+10)/0.2,v);t.lockR=true;},v=>fmtM(0.2*Math.pow((amp+10)/0.2,v)));
  const auto=()=>h('label',{class:'ck'},h('input',{type:'checkbox',checked:!t.lockR||null,onchange:e=>{t.lockR=!e.target.checked;App.autoBrush();UI.renderTools();}}),'size follows zoom');
  const sp=(kind)=>Object.values(w.species).filter(s=>s.kind===kind).map(s=>[s.id,s.name]);
  let strip=null;
  if(t.cat==='sculpt')strip=[tools(SCULPT),rad(),str(),auto()];
  else if(t.cat==='paint')strip=[tools([['biome','Biome'],['water','Water / lake']]),
    t.id==='biome'?h('div',{class:'chips'},LW.BIOMES.slice(1).map((b,i)=>h('button',{class:'chip bio'+(t.biome===i+1?' on':''),onclick:()=>{t.biome=i+1;UI.renderTools();}},h('i',{style:'background:rgb('+b.g.join(',')+')'}),b.name))):str(),rad(),auto()];
  else if(t.cat==='life')strip=[tools([['plants','Plants'],['creature','Animals'],['person','People'],['cohort','Population']]),
    t.id==='plants'?[select('Species',sp('plant'),t.plant,v=>{t.plant=v;}),rad(),auto()]:
    t.id==='person'?[select('Species',sp('person'),t.person,v=>{t.person=v;}),slider('How many',1,8,1,t.count,v=>{t.count=v;})]:
    [select('Species',sp('animal'),t.creature,v=>{t.creature=v;}),slider(t.id==='cohort'?'Groups of 20':'How many',1,12,1,t.count,v=>{t.count=v;})],
    btn('Species editor…',()=>UI.speciesEditor(),'ghost')];
  else if(t.cat==='build')strip=[h('div',{class:'chips'},Object.keys(B.TEMPLATES).map(k=>btn(B.TEMPLATES[k].name,()=>{t.template=k;App.setTool('build','template');},'chip'+(t.id==='template'&&t.template===k?' on':'')))),
    h('div',{class:'chips'},Object.keys(LW.COMPONENTS).filter(k=>k!=='well').map(k=>btn(LW.COMPONENTS[k].name,()=>{t.comp=k;App.setTool('build','comp');},'chip'+(t.id==='comp'&&t.comp===k?' on':'')))),
    h('p',{class:'note',text:'Tap the ground to place a building; tap a floor to place furniture. Select a building in Navigate mode to add rooms, move or remove it.'})];
  else if(t.cat==='dig')strip=[tools([['digsite','New dig site'],['carve','Carve'],['fill','Fill']]),slider('Carve radius',1,8,0.5,t.carveR,v=>{t.carveR=v;},v=>v+' m'),
    slider('View depth',0,24,0.5,App.cam.depth,v=>{App.cam.depth=v;},v=>v?v+' m below ground':'surface'),
    h('p',{class:'note',text:'Dig sites are editable 3D volumes in the same planetary space. Carve from the surface to open an entrance, then raise View depth to look inside.'})];
  else if(t.cat==='planet')strip=UI.planetPanel();
  set('strip',strip?[h('div',{class:'stripin'},strip)]:[]);el('strip').hidden=!strip;
  UI.renderInspector();
};
UI.planetPanel=function(){
  const w=App.world,b=w.body,amp=P.amplitude(b),gid='pg'+Date.now();
  const body=(label,key,min,max,step,val,fmt)=>slider(label,min,max,step,val,v=>{const p={gid};p[key]=v;App.do('world.setBody',p,true);},fmt);
  const seed=h('input',{type:'number',value:(b.gen.seed+1)>>>0,'aria-label':'New terrain seed'});
  const rule=(k,label)=>h('label',{class:'ck'},h('input',{type:'checkbox',checked:w.rules[k]||null,onchange:e=>{const p={};p[k]=e.target.checked;App.do('world.setRules',p);}}),label);
  return [h('h3',{text:'Planet'}),
    body('Sea level','seaLevel',-amp*0.6,amp*0.6,amp/200,b.seaLevel,v=>(v>=0?'+':'')+fmtM(v)),
    body('Axial tilt','axialTilt',0,80,1,b.axialTilt,v=>v+'°'),
    body('Base temperature','baseTemp',-60,60,1,b.atmosphere.baseTemp,v=>v+' °C'),
    body('Atmosphere','atmDensity',0,3,0.05,b.atmosphere.density,v=>v.toFixed(2)+' atm'),
    body('Star luminosity','starLum',0.3,2.5,0.05,b.star.lum,v=>v.toFixed(2)+'×'),
    h('h3',{text:'Regenerate terrain'}),
    h('p',{class:'note',text:'Generates new procedural land from another seed. Regions you edited by hand ('+w.terrainEdits.length+' strokes) are protected and keep their shape.'}),
    h('div',{class:'row'},seed,btn(App.preview?'Update preview':'Preview',()=>{const s=(+seed.value>>>0)||1;
        App.preview=Object.assign({},w,{body:Object.assign({},b,{gen:Object.assign({},b.gen,{seed:s})}),protectedGens:w.protectedGens.concat([b.gen]),genEpoch:w.genEpoch+1,colorEpoch:w.colorEpoch+1000+s%1000});
        App.previewSeed=s;App.terrain.invalidateAll();UI.renderTools();}),
      App.preview?btn('Apply',()=>{const s=App.previewSeed;App.preview=null;if(App.do('world.regenerate',{seed:s}).ok){App.do('env.settle',{},true);App.terrain.invalidateAll();App.toast('Terrain regenerated; hand-edited regions preserved.');}UI.renderTools();},'primary'):null,
      App.preview?btn('Cancel',()=>{App.preview=null;App.terrain.invalidateAll();UI.renderTools();}):null),
    h('h3',{text:'Rules of nature'}),
    h('div',{class:'chips'},rule('envInCreate','environment runs in creator mode'),rule('spread','plants spread'),rule('reproduction','reproduction'),rule('aging','aging and natural death')),
    slider('Conflict intensity',0,2,1,w.rules.conflict,v=>App.do('world.setRules',{conflict:v}),v=>['off','disputes','raids'][v])];
};

// ---- inspector --------------------------------------------------------------------------------------
const bar=(label,v,max)=>h('div',{class:'need'},h('span',{text:label}),h('div',{class:'meter'},h('i',{style:'width:'+LW.clamp(v/(max||100)*100,0,100)+'%;background:'+(v<25?'#e2574c':v<50?'#e2a23c':'#5cba7d')})),h('em',{text:Math.round(v)}));
function evText(w,e){
  const d=e.d,nm=id=>(w.persons[id]||{}).name||id;
  switch(e.type){
    case 'terrain.edited':return 'Terrain edited ('+(d.tool||'restored')+(d.r?', radius '+fmtM(d.r):'')+')';
    case 'river.dried':return 'A river stopped flowing here';case 'river.formed':return 'A river began to flow here';
    case 'land.flooded':return 'Land flooded';case 'land.emerged':return 'Water drained away';
    case 'person.failed':return nm(d.id)+' failed to '+d.goal+': '+(M.FAIL_TEXT[d.reason]||d.reason);
    case 'person.died':return d.name+' died of '+d.cause;case 'person.born':return d.name+' was born';
    case 'settlement.founded':return d.name+' was founded by '+nm(d.by);case 'settlement.joined':return nm(d.id)+' joined a settlement';
    case 'building.completed':return 'A '+d.kind+' was completed'+(d.by&&d.by!=='player'?' by '+nm(d.by):d.by==='player'?' (placed by the creator)':'');
    case 'building.planned':return 'A '+d.kind+' was planned'+(d.why?': '+d.why:'');case 'building.flooded':return 'A building was flooded';
    case 'harvest':return 'Harvest of '+d.yield+' food (water '+d.water+')';case 'tech.discovered':return d.name+' discovered — '+d.era;
    case 'partnership':return nm(d.a)+' and '+nm(d.b)+' became partners';case 'talk':return nm(d.a)+' talked with '+nm(d.b);
    case 'life.introduced':return 'Life introduced: '+d.count+' × '+((w.species[d.species]||{}).name||d.species);
    case 'plants.seeded':return 'Plants seeded: '+((w.species[d.species]||{}).name||d.species);case 'plants.diedOut':return 'Plants died out here';
    case 'animal.died':return 'A '+((w.species[d.species]||{}).name||'creature')+' died of '+d.cause;
    case 'world.created':return 'The world was created (seed '+d.seed+')';case 'world.play':return 'Life was set in motion';
    case 'world.regenerated':return 'Terrain regenerated';case 'world.bodyChanged':return 'Planet settings changed: '+(d.fields||[]).join(', ');
    case 'goal.achieved':return nm(d.id)+' achieved a life goal ('+d.goal+')';case 'cohort.promoted':return 'A member of an anonymous population became an individual';
    default:return e.type.replace(/\./g,' ');
  }
}
UI.evText=evText;
const when=(w,t)=>'Y'+(Math.floor(t/LW.ticksPerYear(w))+1)+' D'+(Math.floor(t/LW.TPD)%w.body.yearDays+1)+' '+String(Math.floor(t%LW.TPD/LW.TPH)).padStart(2,'0')+'h';
function chain(w,id){
  const c=LW.causalChain(w,id,10);
  if(!c.length)return h('p',{class:'note',text:'(older history has been summarised)'});
  return h('ol',{class:'chain'},c.map((e,i)=>h('li',null,h('b',{text:(i?'because: ':'')+evText(w,e)}),h('span',{text:' · '+when(w,e.t)}))));
}
function evList(w,ids){
  const ev=ids.map(id=>LW.findEvent(w,id)).filter(Boolean).slice(-14).reverse();
  if(!ev.length)return h('p',{class:'note',text:'No recorded events yet.'});
  return h('div',{class:'evs'},ev.map(e=>h('details',null,h('summary',{text:when(w,e.t)+' — '+evText(w,e)}),chain(w,e.id))));
}
UI.renderInspector=function(){
  const w=App.world,s=App.sel,box=el('insp');if(!w)return;
  if(!s||App.tool.cat!=='nav'){box.hidden=true;return;}
  if(box.contains(document.activeElement)&&/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)&&document.activeElement.type!=='checkbox')return;
  let body=null,title='',sub='';
  const close=btn('✕',()=>App.select(null),'icon ghost','Close');
  const tabs=(list)=>h('div',{class:'tabs'},list.map(t=>btn(t[1],()=>{UI.tab=t[0];UI.renderInspector();},'tab'+(UI.tab===t[0]?' on':''))));
  if(s.type==='person'){
    const p=w.persons[s.id];if(!p){App.sel=null;box.hidden=true;return;}
    const sp=w.species[p.speciesId],ctl=p.control.mode==='player';title=p.name;sub=sp.name+' · '+Math.floor(LW.life.ageYears(w,p))+' yr · '+(p.alive?(p.lod==='active'?'':'(coarse detail) '):'deceased');
    const doing=!p.alive?'Died '+when(w,p.died):p.act?(p.act.src==='player'?'Ordered: ':'')+actText(w,p.act)+(p.plan?' ('+p.plan.goal+')':''):ctl?'Awaiting your orders':'Deciding…';
    const head=[h('p',{class:'doing',text:doing}),
      p.lastFail&&w.tick-p.lastFail.t<LW.TPD?h('p',{class:'fail',text:'⚠ '+(M.FAIL_TEXT[p.lastFail.reason]||p.lastFail.reason)}):null,
      p.alive?h('div',{class:'row'},btn(ctl?'Release':'Take control',()=>{App.do('person.control',{id:p.id,on:!ctl});if(!ctl){App.follow=p.id;App.cam.goal={n:p.n,dist:Math.min(App.cam.dist,40)};}UI.renderInspector();},ctl?'warn':'primary'),
        btn(App.follow===p.id?'Following':'Follow',()=>{App.follow=App.follow===p.id?null:p.id;App.cam.goal={n:p.n,dist:Math.min(App.cam.dist,60)};},'')):null];
    if(ctl)head.push(h('div',{class:'queue'},h('span',{class:'lb',text:'Queue:'}),p.queue.length?p.queue.map((a,i)=>h('button',{class:'chip',onclick:()=>{App.do('person.clearQueue',{id:p.id,index:i});UI.renderInspector();},text:actText(w,a)+' ✕'})):h('span',{class:'note',text:'empty — tap the ground to walk, tap objects or people to interact'})),
      h('div',{class:'chips'},[['Sleep',()=>useCap(p,'sleep')],['Eat',()=>useCap(p,'eat')||enq(p,{a:'eat'})],['Drink here',()=>enq(p,{a:'drink'})],['Forage here',()=>enq(p,{a:'forage',n:3})],['Gather wood',()=>enq(p,{a:'gather',res:'wood',n:4})],['Explore',()=>enq(p,{a:'explore'})],['Stop',()=>App.do('person.clearQueue',{id:p.id})]].map(x=>btn(x[0],x[1],'chip'))));
    let tab;
    if(UI.tab==='mind')tab=[h('h4',{text:'Temperament (editable)'}),Object.keys(p.traits).map(k=>slider(k,0,1,0.01,p.traits[k],v=>{const t={};t[k]=v;App.do('person.edit',{id:p.id,traits:t,gid:'pe'+p.id},true);},v=>v.toFixed(2))),
      h('h4',{text:'Values'}),Object.keys(p.values).map(k=>slider(k,0,1,0.01,p.values[k],v=>{const t={};t[k]=v;App.do('person.edit',{id:p.id,values:t,gid:'pe'+p.id},true);},v=>v.toFixed(2))),
      h('h4',{text:'Skills'}),h('p',{text:Object.keys(p.skills).map(k=>k+' '+p.skills[k].toFixed(2)).join(' · ')}),
      h('h4',{text:'Goals'}),p.goals.length?p.goals.map(g=>h('div',{class:'row'},h('span',{text:(g.src==='player'?'★ ':'')+M.goalText(g)+(g.src==='self'?' (their own)':' (set by you)')}),btn('✕',()=>{App.do('person.setGoal',{id:p.id,remove:g.id});UI.renderInspector();},'ghost icon'))):h('p',{class:'note',text:'No long-term goals yet; they form their own over time.'}),
      select('Give a goal',[['','choose…'],['explore','Explore the world'],['invent','Seek understanding'],['partner','Find a partner'],['socialize','Be among others'],['master:farming','Master farming'],['master:building','Master building']].concat(Object.values(w.activities).map(a=>['activity:'+a.id,'Activity: '+a.name])),'',v=>{if(!v)return;const q=v.split(':');
        App.do('person.setGoal',{id:p.id,goal:q[0]==='master'?{type:'master',skill:q[1]}:q[0]==='activity'?{type:'activity',activity:q[1]}:{type:q[0]}});UI.renderInspector();}),
      btn('Activity editor…',()=>UI.activityEditor(),'ghost'),
      p.hypo>0.05?h('p',{class:'note',text:'Unexplained events witnessed: '+Math.round(p.anomalies)+' · suspicion that the world is shaped by an unseen will: '+Math.round(p.hypo*100)+'%'}):null];
    else if(UI.tab==='memory')tab=[p.origin&&p.origin.unknownPast?h('p',{class:'note',text:'Emerged from an anonymous population: their earlier life was not simulated in detail and is recorded as unknown.'}):null,
      h('div',{class:'evs'},p.mem.ep.slice().reverse().slice(0,24).map(m=>h('div',{class:'mem'},h('span',{text:when(w,m.t)}),h('b',{text:m.x}),h('em',{text:'salience '+m.s.toFixed(1)})))),
      Object.keys(p.mem.sum).length?h('p',{class:'note',text:'Consolidated: '+Object.keys(p.mem.sum).map(k=>k+' ×'+p.mem.sum[k]).join(', ')}):null];
    else if(UI.tab==='beliefs')tab=[h('p',{class:'note',text:'What '+p.name+' believes — not what is true. Each belief records its source.'}),
      h('table',null,h('tr',null,['Belief','Holds','Confidence','Source'].map(x=>h('th',{text:x}))),Object.keys(p.beliefs).map(k=>{const b=p.beliefs[k];return h('tr',null,h('td',{text:b.p==='hypothesis'?b.x:(b.p+' at '+(b.ref?'well':'region '+k.split(':')[1]))}),h('td',{text:b.v?'yes':'no'}),h('td',{text:Math.round(M.conf(w,b)*100)+'%'}),h('td',{text:b.s+(b.f&&w.persons[b.f]?' ('+w.persons[b.f].name+')':b.f&&w.settlements[b.f]?' ('+w.settlements[b.f].name+')':'')}));}))];
    else if(UI.tab==='social'){const st=w.settlements[p.settlement],hh=w.households[p.household];
      tab=[h('p',{text:(st?'Lives in '+st.name:'No settlement')+(hh?' · household of '+hh.members.length:'')+(p.home&&w.buildings[p.home]?' · has a home':' · homeless')}),
        M.relsOf(w,p.id).filter(x=>w.persons[x.other]).sort((a,b)=>b.r.fam-a.r.fam).slice(0,14).map(x=>h('div',{class:'row'},btn(w.persons[x.other].name,()=>App.select({type:'person',id:x.other}),'ghost'),h('span',{text:x.r.kind+' · affinity '+x.r.aff.toFixed(2)+' · familiarity '+x.r.fam.toFixed(2)})))];}
    else if(UI.tab==='history')tab=[evList(w,p.hist)];
    else if(UI.tab==='talk'){const ai=LW.localAI.status();
      tab=[h('p',{class:'note',text:ai.available?'Local model: '+ai.name:'Scripted dialogue — no local language model is installed, so these replies are assembled from '+p.name+'’s actual state, not generated. Free-text conversation is disabled.'}),
        h('div',{class:'chips'},LW.localAI.TOPICS.map(t=>btn(t[1],()=>{const r=LW.localAI.scripted(w,p,t[0]);App.do('person.dialogue',{id:p.id,topic:t[0]},true);UI.said={id:p.id,q:t[1],a:r.text,kind:r.kind};LW.audio.voice(sp);UI.renderInspector();},'chip'))),
        UI.said&&UI.said.id===p.id?h('div',{class:'say'},h('span',{text:'You: '+UI.said.q}),h('b',{text:p.name+': “'+UI.said.a+'”'}),h('em',{text:UI.said.kind==='scripted'?'scripted reply':'local model'})):null,
        h('div',{class:'row'},h('input',{type:'text',placeholder:ai.available?'Say something…':'Free text needs a local model',disabled:!ai.available||null,'aria-label':'Free-text dialogue',onkeydown:async e=>{if(e.key!=='Enter'||!ai.available)return;const q=e.target.value;e.target.value='';
          try{const r=await LW.localAI.generate(w,p,q);App.do('person.dialogue',{id:p.id,topic:'free'},true);UI.said={id:p.id,q,a:r.text,kind:r.kind};}catch(x){App.toast(x.message,'err');}UI.renderInspector();}}))];}
    else tab=[bar('Hunger',p.needs.hunger),bar('Thirst',p.needs.thirst),bar('Energy',p.needs.energy),bar('Social',p.needs.social),bar('Health',p.health),
      h('p',{text:'Mood '+(p.mood>0.25?'content':p.mood<-0.25?'troubled':'even')+' · carrying '+(['food','wood','stone'].filter(k=>p.inv[k]>0).map(k=>p.inv[k]+' '+k).join(', ')||'nothing')}),
      btn('Remove from world',()=>{if(confirm('Remove '+p.name+' permanently?')){App.do('life.remove',{ids:[p.id]});App.select(null);}},'ghost')];
    body=head.concat([tabs([['needs','Needs'],['mind','Mind'],['memory','Memory'],['beliefs','Beliefs'],['social','Social'],['history','History'],['talk','Talk']]),h('div',{class:'tabbody'},tab)]);
  }else if(s.type==='animal'){
    const o=w.organisms[s.id];if(!o){App.sel=null;box.hidden=true;return;}
    const sp=w.species[o.speciesId];title=o.name||sp.name;sub=(o.sex==='f'?'female':'male')+' · '+LW.life.ageYears(w,o).toFixed(1)+' yr of ~'+sp.lifecycle.span+' · '+o.st;
    body=[bar('Hunger',o.needs.hunger),bar('Thirst',o.needs.thirst),bar('Energy',o.needs.energy),bar('Health',o.health),
      h('p',{text:'Diet: '+sp.diet+' · body plan: '+sp.body.plan+' · '+(o.preg?'expecting young':'')}),
      h('div',{class:'row'},btn(App.follow===o.id?'Following':'Follow',()=>{App.follow=App.follow===o.id?null:o.id;App.cam.goal={n:o.n,dist:Math.min(App.cam.dist,60)};}),btn('Name',()=>{const n=prompt('Name this creature',o.name||'');if(n)App.do('life.name',{id:o.id,name:n.slice(0,32)});}),btn('Remove',()=>{App.do('life.remove',{ids:[o.id]});App.select(null);},'ghost'))];
  }else if(s.type==='building'||s.type==='comp'){
    const b=w.buildings[s.id];if(!b){App.sel=null;box.hidden=true;return;}
    const st=w.settlements[b.settlement],hh=w.households[b.household];title=b.name;sub=(b.progress<1?'under construction '+Math.round(b.progress*100)+'%':LW.society.ERAS[b.era||0]+' style')+(st?' · '+st.name:'')+(b.flooded?' · FLOODED':'');
    const cp=s.type==='comp'?B.comp(b,s.cid):null,ctl=Object.values(w.persons).find(q=>q.alive&&q.control.mode==='player');
    const moveB=()=>{App.pending={label:'MOVE · tap the new location for '+b.name,fn:hit=>{App.do('build.move',{id:b.id,n:hit.n,yaw:b.yaw});}};UI.renderTools();};
    body=[cp?h('div',{class:'sub'},h('h4',{text:LW.COMPONENTS[cp.kind].name+' — can be used to: '+LW.COMPONENTS[cp.kind].caps.join(', ')+(cp.by&&w.persons[cp.by]?' · in use by '+w.persons[cp.by].name:'')}),
        h('div',{class:'row'},ctl?LW.COMPONENTS[cp.kind].caps.filter(c=>c!=='light').map(c=>btn(ctl.name+': '+c,()=>{const r=App.do('person.enqueue',{id:ctl.id,action:{a:'use',b:b.id,c:cp.id,cap:c}});if(r.ok)App.toast(ctl.name+' will '+c);},'primary')):h('span',{class:'note',text:'Take control of a character to use this.'}),
          btn('Move',()=>{App.pending={label:'MOVE · tap the new spot for the '+LW.COMPONENTS[cp.kind].name,fn:hit=>{const l=B.local(w,b,hit.n);App.do('build.moveComp',{id:b.id,cid:cp.id,x:l[0],z:l[1]});}};UI.renderTools();}),
          btn('Rotate',()=>App.do('build.moveComp',{id:b.id,cid:cp.id,x:cp.x,z:cp.z,rot:(cp.rot||0)+Math.PI/2})),btn('Delete',()=>{App.do('build.removeComp',{id:b.id,cid:cp.id});App.select({type:'building',id:b.id});},'ghost'))):null,
      b.progress<1?h('p',{text:'Materials: '+(Object.keys(b.need).map(k=>(b.mat[k]||0)+'/'+b.need[k]+' '+k).join(', ')||'none needed')}):null,
      b.kind==='field'?bar('Crop growth',b.growth*100):null,
      b.rooms.length?h('p',{text:b.rooms.length+' room'+(b.rooms.length>1?'s':'')+' · '+b.comps.length+' objects'+(hh?' · home of '+hh.members.map(m=>(w.persons[m]||{}).name).filter(Boolean).join(', '):' · unoccupied')+' · stores: '+(['food','wood','stone','tools'].filter(k=>b.stock[k]>0).map(k=>Math.floor(b.stock[k])+' '+k).join(', ')||'empty')}):null,
      h('div',{class:'chips'},b.comps.map(c=>btn(LW.COMPONENTS[c.kind].name,()=>App.select({type:'comp',id:b.id,cid:c.id}),'chip'+(cp===c?' on':'')))),
      h('div',{class:'row'},b.rooms.length&&b.progress>=1?[btn('+ Room east',()=>App.do('build.addRoom',{id:b.id,side:'e'})),btn('+ Room west',()=>App.do('build.addRoom',{id:b.id,side:'w'})),btn('+ Room north',()=>App.do('build.addRoom',{id:b.id,side:'n'}))]:null,
        btn('Move',moveB),btn('Rotate',()=>App.do('build.move',{id:b.id,n:b.n,yaw:b.yaw+Math.PI/4})),btn('Focus',()=>App.focusOn(b.n,35)),btn('Remove',()=>{App.do('build.remove',{id:b.id});App.select(null);},'ghost'))];
  }else if(s.type==='settlement'){
    const st=w.settlements[s.id];if(!st){App.sel=null;box.hidden=true;return;}
    title=st.name;sub=LW.society.ERAS[st.era]+' · '+st.members.length+' people · travel: '+LW.society.transport(st);
    const next=LW.society.TECHS[st.techs.length];
    body=[h('p',{text:'Stores: '+['food','wood','stone','tools'].map(k=>Math.floor(st.stock[k])+' '+k).join(' · ')}),
      h('p',{text:'Knowledge: '+(st.techs.map(t=>LW.society.TECHS.find(x=>x.id===t).name).join(', ')||'none yet')+(next?' · next: '+next.name+' ('+Math.floor(st.know)+'/'+next.cost+')':'')}),
      h('p',{text:'Buildings: '+(st.buildings.map(id=>w.buildings[id]).filter(Boolean).map(b=>b.name+(b.progress<1?' ('+Math.round(b.progress*100)+'%)':'')).join(', ')||'none')}),
      h('div',{class:'chips'},st.members.map(m=>btn(w.persons[m].name,()=>App.select({type:'person',id:m}),'chip'))),h('h4',{text:'Founding'}),chain(w,st.ev)];
  }else if(s.type==='cohort'){
    const c=w.cohorts[s.id];if(!c){App.sel=null;box.hidden=true;return;}
    const sp=w.species[c.speciesId];title=sp.name+' population';sub='anonymous cohort · '+c.count+' members · '+c.promoted+' became individuals';
    body=[h('p',{class:'note',text:'A distant population is simulated as a group. The figures you see are representative, not individuals. Promote a member to follow one life in detail.'}),
      btn('Promote one member to an individual',()=>{const r=App.do('life.promote',{cohortId:c.id});if(r.ok)App.select({type:sp.kind==='person'?'person':'animal',id:r.result.id});},'primary')];
  }else if(s.type==='volume'){
    const v=w.volumes[s.id];if(!v){App.sel=null;box.hidden=true;return;}
    title='Dig site';sub=v.nx*v.cell+' × '+v.nz*v.cell+' m, '+Math.round((v.ny-v.top)*v.cell)+' m deep · '+v.ops.length+' carve operations';
    body=[h('p',{text:'Material here: '+['soil','clay','rock','deeprock'].map((m,i)=>m).join(' → ')+'; ore or crystal veins appear with depth.'}),
      h('div',{class:'row'},btn('Carve tool',()=>App.setTool('dig','carve'),'primary'),btn('Focus',()=>App.focusOn(v.n,45)),btn('Remove site',()=>{App.do('volume.remove',{id:v.id});App.terrain.invalidate(w,v.n,60);App.select(null);},'ghost'))];
  }else if(s.type==='cell'){
    const c=E.info(w,s.cell),h0=P.height(w,s.n),cl=E.climate(w,s.n,h0),B0=LW.BIOMES[cl.biome],wk=['none','river','lake','sea'][(w.env.river||[])[s.cell]||0];
    title=B0.name+(cl.painted?' (painted)':'');sub='elevation '+fmtM(h0-w.body.seaLevel)+' · '+cl.temp.toFixed(0)+' °C · moisture '+Math.round(cl.moist*100)+'%';
    const plants=Object.values(w.species).filter(x=>x.kind==='plant').map(x=>[x.name,E.suit(x,cl)]).sort((a,b)=>b[1]-a[1]).slice(0,4);
    body=[h('p',{text:'Water: '+wk+(wk==='river'?' (flow '+c.flux.toFixed(0)+')':'')+' · rain now: '+Math.round(E.rain(w,s.n,s.cell)*100)+'%'}),
      h('p',{text:c.plant?'Living here: '+c.plant.name+' (cover '+Math.round(c.veg/2.55)+'%)':'No plants live here'+(cl.biome?' — the climate could support life, but none has been introduced.':'.')}),
      h('p',{text:'Suitability: '+plants.map(x=>x[0]+' '+Math.round(x[1]*100)+'%').join(' · ')}),
      h('p',{text:'Minerals: stone '+c.minerals.stone+', ore '+c.minerals.ore+', clay '+c.minerals.clay+' · subsurface: '+['soil','clay','rock'].join(' / ')}),
      w.env.chg[s.cell]?[h('h4',{text:'Why the water here changed'}),chain(w,w.env.chg[s.cell])]:null,
      h('div',{class:'row'},btn('Zoom here',()=>App.focusOn(s.n,Math.max(30,App.cam.dist*0.25))))];
  }
  set('insp',[h('div',{class:'ihead'},h('div',null,h('b',{text:title}),h('span',{text:sub})),close)].concat(body||[]));box.hidden=false;
};
function actText(w,a){
  switch(a.a){case 'go':return 'walking';case 'use':return a.cap+(w.buildings[a.b]?' ('+((B.comp(w.buildings[a.b],a.c)||{}).kind||'?')+')':'');case 'talk':return 'talking to '+((w.persons[a.id]||{}).name||'someone');
    case 'gather':return 'gathering '+a.res;case 'build':return 'building';case 'farm':return 'farming';case 'activity':return 'activity: '+((w.activities[a.id]||{}).name||'?');default:return a.a;}
}
function enq(p,a){const r=App.do('person.enqueue',{id:p.id,action:a});UI.renderInspector();return r.ok;}
function useCap(p,cap){
  const w=App.world;let best=null,bd=1e9;
  for(const id in w.buildings){const b=w.buildings[id];if(b.progress<1)continue;const c=B.findCap(b,cap,p.id);if(!c)continue;const d=LW.arcDist(b.n,p.n,w.body.radius)+(id===p.home?0:40);if(d<bd){bd=d;best={b,c};}}
  if(!best||bd>3000){if(cap==='sleep')return enq(p,{a:'sleep'});if(cap!=='eat')App.toast('No '+cap+' object nearby','warn');return false;}
  return enq(p,{a:'use',b:best.b.id,c:best.c.id,cap});
}

// ---- menu and modals -----------------------------------------------------------------------------
UI.showModal=function(title,nodes){set('modal',[h('div',{class:'sheet'},h('div',{class:'row'},h('h2',{text:title}),btn('✕',()=>UI.closeModal(),'icon ghost','Close')),nodes)]);el('modal').hidden=false;};
UI.closeModal=function(){el('modal').hidden=true;set('modal',[]);};
UI.openMenu=async function(){
  const w=App.world,snaps=await App.store.snapshots(w.id).catch(()=>[]),cs=LW.census(w),st=App.stats,gs=LW.gfx.stats;
  const tog=(label,get,setf)=>h('label',{class:'ck'},h('input',{type:'checkbox',checked:get()||null,onchange:e=>setf(e.target.checked)}),label);
  const fileIn=h('input',{type:'file',accept:'.lwworld,.json,application/json',hidden:true,onchange:async e=>{const f=e.target.files[0];if(!f)return;const r=await App.importText(await f.text());if(r.ok){UI.closeModal();UI.enter();}}});
  UI.showModal('Menu',[
    h('h3',{text:'World'}),h('div',{class:'row wrap'},
      btn('Save now',async()=>{const ok=await App.snapshot(true);App.toast(ok?'Saved.':'Save failed','');},'primary'),
      btn('Export world file',()=>{const text=App.exportText(),a=h('a',{href:URL.createObjectURL(new Blob([text],{type:'application/json'})),download:w.name.replace(/[^\w\-]+/g,'_')+'.lwworld'});document.body.append(a);a.click();a.remove();App.toast('Exported '+(text.length/1024).toFixed(0)+' KB');}),
      btn('Import world file…',()=>fileIn.click()),fileIn,
      btn('Rename',()=>{const n=prompt('World name',w.name);if(n){App.do('world.rename',{name:n.slice(0,60)});UI.renderTop();}}),
      btn('Exit to title',async()=>{await App.snapshot(true);UI.closeModal();App.world=null;App.newDraft();UI.start();},'ghost')),
    h('p',{class:'note',text:'Storage: '+(App.storeKind==='memory'?'⚠ unavailable in this browser context — export to keep your world':App.storeKind+' · autosave every 20 s, two generations kept, edits journaled between snapshots')+(App.lastSaved?' · last saved '+Math.round((Date.now()-App.lastSaved)/1000)+' s ago':'')}),
    h('h3',{text:'Snapshots'}),h('div',{class:'row'},btn('Create snapshot',async()=>{const n=prompt('Snapshot name','Day '+(LW.dayOf(w)+1));if(n){await App.store.saveNamed(w,n.slice(0,40),Date.now());UI.openMenu();}})),
    snaps.map(sn=>h('div',{class:'row'},h('span',{class:'grow',text:sn.name+' · '+when(w,sn.tick)}),btn('Restore',async()=>{if(!confirm('Restore snapshot “'+sn.name+'”? The current state is replaced (it stays in the autosave until the next save).'))return;
        try{const ww=await App.store.restoreNamed(w.id,sn.n);await App.startWorld(ww,false);await App.snapshot(true);UI.closeModal();UI.enter();App.toast('Snapshot restored.');}catch(e){App.toast('Restore failed: '+e.message,'err');}}),btn('✕',async()=>{await App.store.deleteNamed(w.id,sn.n);UI.openMenu();},'ghost icon','Delete snapshot'))),
    h('h3',{text:'Display and sound'}),h('div',{class:'chips'},
      select('Graphics',[['auto','Adaptive'],['low','Low'],['medium','Medium'],['high','High']],App.opts.quality,v=>{App.opts.quality=v;}),
      tog('Creator light (no night)',()=>App.opts.studio,v=>{App.opts.studio=v;}),tog('Clouds',()=>App.opts.clouds,v=>{App.opts.clouds=v;}),
      tog('Mute all sound',()=>LW.audio.muted,v=>LW.audio.setMuted(v)),tog('Mute creature voices',()=>LW.audio.voicesMuted,v=>{LW.audio.voicesMuted=v;}),
      tog('Show hints',()=>App.opts.hints,v=>{App.opts.hints=v;UI.renderHint();})),
    h('h3',{text:'Statistics'}),
    h('p',{text:'People '+cs.persons+' ('+cs.active+' detailed, '+cs.dormant+' coarse, '+cs.dead+' deceased) · animals '+cs.animals+' · anonymous '+cs.cohort+' · settlements '+Object.keys(w.settlements).length+' · buildings '+Object.keys(w.buildings).length}),
    h('p',{text:'Frame '+st.ms.toFixed(1)+' ms ('+st.fps.toFixed(0)+' fps) · '+Math.round(gs.tris)+' triangles · '+gs.draws+' draw calls · '+App.terrain.visible.length+' terrain chunks ('+App.terrain.nodes.size+' cached) · '+st.ticksPerSec.toFixed(0)+' ticks/s'+(performance.memory?' · JS heap '+(performance.memory.usedJSHeapSize/1048576).toFixed(0)+' MB':'')}),
    h('p',{class:'note',text:'Revision '+w.revision+' · tick '+w.tick+' · '+w.events.length+' events ('+w.eventArchive.dropped+' summarised) · '+w.terrainEdits.length+' terrain strokes · build '+LW.VERSION+' · renderer: WebGL2 '+(App.glInfo||'')}),
    h('h3',{text:'World history'}),h('div',{class:'evs'},w.events.filter(e=>e.type!=='talk'&&e.type!=='terrain.edited').slice(-40).reverse().map(e=>h('details',null,h('summary',{text:when(w,e.t)+' — '+evText(w,e)}),chain(w,e.id)))),
    h('h3',{text:'Controls'}),
    h('p',{class:'note',text:'Touch: drag = move (or use the active tool) · pinch = zoom · twist = rotate · two-finger vertical drag = tilt · tap = select/place · double-tap = zoom to point. Mouse: left-drag, wheel, right-drag to rotate/tilt, Shift-drag to move while a tool is active. Keys: WASD/arrows move, Q/E rotate, R/F tilt, +/- zoom, Space pause, Ctrl+Z / Ctrl+Y undo/redo, Esc navigate.'}),
    h('h3',{text:'About'}),
    h('p',{class:'note',text:'Living World runs entirely on this device: no network, account or AI service is used. Character conversation is rule-based and labelled as such unless a local language model is installed in a native build. See README for limitations.'})]);
};
UI.speciesEditor=function(){
  const w=App.world,d={kind:'animal',name:'New creature',plan:'quadruped',size:1,legs:4,arms:0,head:0.35,tail:1,c1:'#b08050',c2:'#e0d0b0',diet:'herb',speed:1,span:10,mature:1,repro:'sexual',sight:80,t0:-5,t1:35,m0:0.1,m1:1,form:'broadleaf',swim:false,fly:false};
  const hex=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
  const render=()=>UI.showModal('Species editor',[
    select('Kind',[['animal','Animal'],['person','People (can build, speak)'],['plant','Plant']],d.kind,v=>{d.kind=v;render();}),
    h('label',{class:'sl'},h('span',{class:'lb',text:'Name'}),h('input',{type:'text',value:d.name,maxlength:40,onchange:e=>{d.name=e.target.value;}})),
    d.kind==='plant'?[select('Form',[['grass','Grass'],['broadleaf','Broadleaf tree'],['conifer','Conifer'],['cactus','Succulent'],['glowcap','Glowing fungus'],['crystal','Crystal']],d.form,v=>{d.form=v;})]:
    [select('Body plan',[['biped','Biped'],['quadruped','Quadruped'],['hexapod','Hexapod'],['avian','Winged'],['serpent','Serpent'],['blob','Amorphous']],d.plan,v=>{d.plan=v;}),
     slider('Body size',0.2,6,0.1,d.size,v=>{d.size=v;},v=>v+' m'),slider('Legs',0,8,1,d.legs,v=>{d.legs=v;}),slider('Arms',0,6,1,d.arms,v=>{d.arms=v;}),slider('Head size',0.1,0.8,0.05,d.head,v=>{d.head=v;}),
     select('Diet',[['herb','Plants'],['carn','Other animals'],['omni','Anything'],['energy','Starlight (artificial life)']],d.diet,v=>{d.diet=v;}),
     slider('Speed',0.2,3,0.1,d.speed,v=>{d.speed=v;}),slider('Sight',10,400,10,d.sight,v=>{d.sight=v;},v=>v+' m'),
     slider('Lifespan',1,500,1,d.span,v=>{d.span=v;},v=>v+' yr'),slider('Maturity',0,60,0.5,d.mature,v=>{d.mature=v;},v=>v+' yr'),
     select('Reproduction',[['sexual','Sexual'],['asexual','Asexual (budding)'],['assembly','Assembly (built)'],['none','None']],d.repro,v=>{d.repro=v;}),
     h('div',{class:'chips'},h('label',{class:'ck'},h('input',{type:'checkbox',onchange:e=>{d.swim=e.target.checked;}}),'swims'),h('label',{class:'ck'},h('input',{type:'checkbox',onchange:e=>{d.fly=e.target.checked;}}),'flies'))],
    h('label',{class:'sl'},h('span',{class:'lb',text:'Colours'}),h('input',{type:'color',value:d.c1,onchange:e=>{d.c1=e.target.value;}}),h('input',{type:'color',value:d.c2,onchange:e=>{d.c2=e.target.value;}})),
    slider('Coldest tolerated',-80,40,1,d.t0,v=>{d.t0=v;},v=>v+' °C'),slider('Hottest tolerated',-20,90,1,d.t1,v=>{d.t1=v;},v=>v+' °C'),
    slider('Driest tolerated',0,1,0.05,d.m0,v=>{d.m0=v;}),slider('Wettest tolerated',0,1,0.05,d.m1,v=>{d.m1=v;}),
    btn('Create species',()=>{
      const id='sp_'+d.name.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,18)+'_'+Object.keys(w.species).length;
      const sp={id,kind:d.kind,name:d.name,body:{c1:hex(d.c1),c2:hex(d.c2)},climate:{t:[d.t0,d.t1],m:[d.m0,d.m1]}};
      if(d.kind==='plant'){sp.plant={tree:d.form!=='grass',form:d.form};sp.lifecycle={repro:'seed'};}
      else{Object.assign(sp.body,{plan:d.plan,size:d.size,legs:d.legs,arms:d.arms,tail:d.tail,wings:d.plan==='avian'?2:0,head:d.head});sp.senses={sight:d.sight};sp.move={speed:d.speed,swim:d.swim,fly:d.fly||d.plan==='avian'};sp.diet=d.diet;
        sp.lifecycle={span:d.span,mature:Math.min(d.mature,d.span*0.8),repro:d.repro,gest:Math.max(3,Math.round(d.size*10)),litter:d.size<0.6?3:1};sp.voice={pitch:Math.round(900/Math.max(0.3,d.size)),rough:d.diet==='carn'?0.8:0.2};
        if(d.kind==='person'){sp.manip=1;sp.caps=['speak','tool','build','farm'];}}
      const r=App.do('life.defineSpecies',{species:sp});
      if(r.ok){const t=App.tool;if(d.kind==='plant'){t.plant=id;App.setTool('life','plants');}else if(d.kind==='person'){t.person=id;App.setTool('life','person');}else{t.creature=id;App.setTool('life','creature');}UI.closeModal();App.toast('Species “'+d.name+'” created. Tap the world to introduce it.');}
    },'primary')]);
  render();
};
// visual, declarative activity editor: a list of typed steps with links. No scripts are ever stored or run.
UI.activityEditor=function(){
  const w=App.world;let g={name:'Evening routine',start:'n1',nodes:[{id:'n1',type:'go',place:'home',next:'n2'},{id:'n2',type:'use',cap:'eat',next:'n3'},{id:'n3',type:'if',cond:{time:'night'},then:'n4',else:'n5'},{id:'n4',type:'use',cap:'sleep',next:'n5'},{id:'n5',type:'end'}]};
  const render=()=>{
    const ids=g.nodes.map(n=>[n.id,n.id]);
    UI.showModal('Activity editor',[
      h('p',{class:'note',text:'Build a routine from steps. Each step is validated against real capabilities; nothing here is executable code.'}),
      h('label',{class:'sl'},h('span',{class:'lb',text:'Name'}),h('input',{type:'text',value:g.name,maxlength:40,onchange:e=>{g.name=e.target.value;}})),
      g.nodes.map((n,i)=>h('div',{class:'node'},h('b',{text:n.id}),
        select('Step',[['go','Go to'],['use','Use object'],['wait','Wait'],['if','If…'],['say','Think/say'],['end','End']],n.type,v=>{const id=n.id;g.nodes[i]=v==='go'?{id,type:v,place:'home',next:id}:v==='use'?{id,type:v,cap:'sit',next:id}:v==='wait'?{id,type:v,ticks:40,next:id}:v==='if'?{id,type:v,cond:{time:'night'},then:id,else:id}:v==='say'?{id,type:v,text:'…',next:id}:{id,type:'end'};render();}),
        n.type==='go'?select('Place',[['home','Home'],['settlement','Settlement centre'],['water','Known water']],n.place,v=>{n.place=v;}):null,
        n.type==='use'?select('To',['sleep','sit','eat','cook','store','drink','work','study'].map(c=>[c,c]),n.cap,v=>{n.cap=v;}):null,
        n.type==='wait'?slider('Ticks',4,2000,4,n.ticks,v=>{n.ticks=v;}):null,
        n.type==='say'?h('input',{type:'text',value:n.text,maxlength:80,onchange:e=>{n.text=e.target.value;}}):null,
        n.type==='if'?[select('Condition',[['night','it is night'],['day','it is day'],['hungry','hunger below 40'],['tired','energy below 30'],['food','carrying food']],n.cond.time||(n.cond.need==='hunger'?'hungry':n.cond.need==='energy'?'tired':'food'),v=>{n.cond=v==='night'||v==='day'?{time:v}:v==='hungry'?{need:'hunger',op:'<',value:40}:v==='tired'?{need:'energy',op:'<',value:30}:{has:'food'};}),
          select('Then',ids,n.then,v=>{n.then=v;}),select('Else',ids,n.else,v=>{n.else=v;})]:null,
        n.type!=='if'&&n.type!=='end'?select('Next',ids,n.next,v=>{n.next=v;}):null,
        btn('✕',()=>{g.nodes.splice(i,1);render();},'ghost icon','Remove step'))),
      h('div',{class:'row'},btn('+ Step',()=>{let k=g.nodes.length+1;while(g.nodes.some(n=>n.id==='n'+k))k++;g.nodes.push({id:'n'+k,type:'end'});render();}),
        btn('Save activity',()=>{const r=App.do('activity.define',{activity:g});if(r.ok){App.toast('Activity saved. Assign it from a character’s Mind tab.');UI.closeModal();}},'primary')),
      Object.values(w.activities).length?h('div',{class:'chips'},Object.values(w.activities).map(a=>btn('Edit: '+a.name,()=>{g=LW.clone(a);render();},'chip'))):null]);
  };
  render();
};

// ---- hints, toast, labels --------------------------------------------------------------------------
UI.renderHint=function(){
  const w=App.world,box=el('hint');if(!w||!App.opts.hints){box.hidden=true;return;}
  const alive=Object.values(w.persons).some(p=>p.alive),plants=w.env.plants.length>0;
  const step=!w.terrainEdits.length?'1 · Shape the land: choose ⛰ Sculpt and drag on the planet. Zoom in for finer tools.':
    !plants?'2 · This world is sterile. Choose 🌱 Life ▸ Plants and paint vegetation where the climate suits it.':
    !alive?'3 · Zoom toward a river (blue lines) and use 🌱 Life ▸ People to introduce someone.':
    !Object.keys(w.buildings).length?'4 · Give them shelter: 🏠 Build ▸ Cottage, tap near your people.':
    w.mode!=='play'?'5 · Press ▶ Play. Life begins: people look for water, food, rest and each other.':
    'Select a person and press “Take control” to direct them, then Release to let their own life resume.';
  set('hint',[h('span',{text:step}),btn('✕',()=>{App.opts.hints=false;UI.renderHint();},'ghost icon','Hide hints')]);box.hidden=false;
};
let toastT=0;
UI.renderToast=function(){const t=App.lastToast,box=el('toast');if(!t)return;box.textContent=t.msg;box.className=t.kind;box.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{box.hidden=true;},t.kind?6500:3800);};
UI.renderNav=function(){
  set('nav',[btn('+',()=>App.zoom(0.6),'icon','Zoom in'),btn('−',()=>App.zoom(1/0.6),'icon','Zoom out'),btn('⟲',()=>App.rotate(-0.4,0),'icon','Rotate left'),btn('⟳',()=>App.rotate(0.4,0),'icon','Rotate right'),
    btn('⤒',()=>App.rotate(0,-0.2),'icon','Tilt toward top-down'),btn('⤓',()=>App.rotate(0,0.2),'icon','Tilt toward horizon'),btn('N',()=>{App.cam.heading=0;App.cam.autoTilt=true;App.cam.depth=0;UI.renderTools();},'icon','North up, automatic tilt, surface view')]);
};
UI.frameLabels=function(){
  const w=App.world,c=App.cam,box=el('labels');if(!w||App.phase!=='play'){box.replaceChildren();return;}
  const R=w.body.radius,want=[];
  for(const id in w.settlements){const s=w.settlements[id];if(!s.members.length&&!s.buildings.length)continue;const p=LW.gfx.project(c,P.surface(w,s.n,12));if(p&&V.dot(s.n,V.norm(c.pos))>0.2&&p.z<Math.max(4000,R*4))want.push([id,s.name,p]);}
  if(c.dist>260)for(const id in w.persons){const q=w.persons[id];if(!q.alive)continue;const p=LW.gfx.project(c,P.surface(w,q.n,2));if(p&&V.dot(q.n,V.norm(c.pos))>0.2&&p.z<c.dist*4)want.push([id,'•',p]);}
  while(box.children.length>want.length)box.lastChild.remove();
  while(box.children.length<want.length)box.append(h('span',{class:'lbl'}));
  want.forEach((x,i)=>{const e=box.children[i];if(e.textContent!==x[1])e.textContent=x[1];e.className=x[1]==='•'?'lbl dot':'lbl';e.style.transform='translate('+Math.round(x[2].x)+'px,'+Math.round(x[2].y)+'px)';});
};
UI.renderAll=function(){UI.renderTop();UI.renderTools();UI.renderNav();UI.renderHint();};
let lastScale='',lastMode='',lastSel='';
App.listeners.push(what=>{
  if(App.phase!=='play'||!App.world){if(what==='toast')UI.renderToast();return;}
  const w=App.world;
  if(what==='toast')return UI.renderToast();
  if(what==='tick'){
    const ck=el('clock');if(ck)ck.textContent=LW.clockText(w)+(App.speed?'':' · paused');
    el('scale').textContent=App.scale()+' · '+fmtM(Math.max(0,App.cam.alt))+(App.cam.depth>0?' · '+App.cam.depth+' m underground view':'')+(App.terrain.pending>0?' · refining…':'');
    const sc=App.scale();if(sc!==lastScale){lastScale=sc;App.autoBrush();UI.renderTools();}
    if(w.mode!==lastMode){lastMode=w.mode;UI.renderTop();}
    if(!el('insp').hidden||App.sel)UI.renderInspector();
    UI.renderHint();return;
  }
  if(what==='speed'||what==='world'||what==='world.setMode'||what==='undo'||what==='redo')UI.renderTop();
  if(what==='tool'||what==='world')UI.renderTools();
  if(what==='select'||what==='compmenu'||what==='stroke'||what.indexOf('.')>0)UI.renderInspector();
});
})();
