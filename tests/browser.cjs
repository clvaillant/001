// Real-browser tests of the shipped single file (Playwright + Chromium). Run: node tests/browser.cjs
// The page is opened from file:// with ALL network access denied. Rendering here uses a SOFTWARE GPU
// (SwiftShader); frame times below are NOT evidence of Android device performance.
const fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require('playwright');
const FILE='file://'+path.join(__dirname,'..','Living_World.html'),OUT=path.join(__dirname,'out');
fs.mkdirSync(OUT,{recursive:true});
const results=[];let browser;
async function test(id,name,reqs,fn){const t0=Date.now();let status='pass',error=null,note=null;
  const only=process.argv[2];if(only&&only.split(',').indexOf(id)<0)return;
  try{note=await Promise.race([fn(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('test timed out after 300 s')),300000))])||null;}catch(e){status='fail';error=String(e&&e.stack||e).split('\n').slice(0,4).join(' | ');}
  results.push({id,name,reqs,status,ms:Date.now()-t0,error,note});console.log((status==='pass'?'  ok   ':'  FAIL ')+id+' '+name+(error?'\n       '+error:'')+(note&&status==='pass'?'\n       '+note:''));}
async function open(opts){
  opts=opts||{};
  const ctx=await browser.newContext(Object.assign({viewport:{width:900,height:560}},opts.ctx||{}));
  const reqs=[],errs=[];
  await ctx.route('**/*',r=>{const u=r.request().url();reqs.push(u);if(u.startsWith('file://'))r.continue();else r.abort();});     // network denial
  if(opts.init)await ctx.addInitScript(opts.init);
  const pg=await ctx.newPage();pg.setDefaultTimeout(45000);pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
  await pg.goto(FILE);await pg.waitForFunction(()=>globalThis.LW&&LW.app&&LW.app.booted,null,{timeout:30000});
  return {ctx,pg,reqs,errs};
}
const quick=async pg=>{await pg.click('text=Quick Start');await pg.waitForFunction(()=>LW.app.world&&LW.app.phase==='play');};
const settle=(pg,ms)=>pg.waitForTimeout(ms||600);
// put the camera over a temperate river cell and return its direction
const toRiver=(pg,dist)=>pg.evaluate(dist=>{const A=LW.app,w=A.world,d=LW.env.d(w);LW.env.settle(w);let best=-1,bf=0;
  for(let c=0;c<d.C;c++){if(w.env.river[c]!==1)continue;const cl=LW.env.climate(w,LW.env.cellDir(w,c),d.h[c],c);if(cl.temp>10&&cl.temp<26&&d.flux[c]>bf&&d.flux[c]<d.thr*3){bf=d.flux[c];best=c;}}
  if(best<0)for(let c=0;c<d.C;c++)if(w.env.river[c]===1){best=c;break;}
  const n=LW.env.cellDir(w,best);let m=n;for(let k=1;k<60;k++){const a=k*2.4,q=LW.offsetDir(n,Math.sin(a)*(40+k*6),Math.cos(a)*(40+k*6),w.body.radius);if(LW.planet.height(w,q)>LW.planet.waterLevel(w,q)+1.5){m=q;break;}}
  A.cam.n=m.slice();A.cam.dist=dist;A.cam.heading=0;A.cam.autoTilt=true;A.follow=null;globalThis.T_RIVER=n;globalThis.T_SITE=m;globalThis.T_CELL=best;return {n,m,cell:best};},dist);
const STABLE="(w=>{const c=JSON.parse(JSON.stringify(w));delete c.receipts;delete c.receiptOrder;delete c.revision;delete c.interest;for(const k in c.persons)delete c.persons[k].lod;return LW.checksum(LW.canonical(c));})";
const worldHash=pg=>pg.evaluate('('+STABLE+')(LW.app.world)');
const center={x:450,y:300};

(async()=>{
  console.log('Living World browser tests (software WebGL, network denied)');
  browser=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const env={chromium:browser.version()};

  await test('B01','single file opens from file:// with the network denied; title screen shows a live 3D planet',['LW-001','LW-011','LW-066','LW-070','LW-114','LW-124','LW-154'],async()=>{
    const {ctx,pg,reqs,errs}=await open();
    await settle(pg,1500);
    assert(await pg.isVisible('text=Quick Start'));assert(await pg.isVisible('text=Advanced Planet Setup'));
    const px=await pg.evaluate(()=>{LW.app.frame(performance.now());const gl=LW.gfx.gl,w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,b=new Uint8Array(4*64),seen=new Set();let lit=0;
      for(let i=0;i<64;i++){const x=Math.floor(w*(0.3+0.4*(i%8)/7)),y=Math.floor(h*(0.3+0.4*Math.floor(i/8)/7));gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b,i*4);if(b[i*4]+b[i*4+1]+b[i*4+2]>60)lit++;seen.add((b[i*4]>>4)+','+(b[i*4+1]>>4)+','+(b[i*4+2]>>4));}
      return {lit,colors:seen.size,err:gl.getError(),info:LW.app.glInfo,store:LW.app.storeKind};});
    assert(px.lit>20,'planet pixels are lit: '+px.lit+'/64');assert(px.colors>=6,'varied colours: '+px.colors);assert.strictEqual(px.err,0,'no WebGL error');
    assert.deepStrictEqual(errs,[]);const remote=reqs.filter(u=>!u.startsWith('file://'));assert.deepStrictEqual(remote,[],'no remote requests attempted');
    env.renderer=px.info;await pg.screenshot({path:path.join(OUT,'01-title.png')});await ctx.close();
    return 'requests: '+reqs.length+' (all file://), storage: '+px.store+', renderer: '+px.info;
  });

  await test('B02','Quick Start creates a unique, editable, uninhabited world; Advanced setup regenerates the planet live',['LW-012','LW-072','LW-073','LW-125','LW-151','LW-147'],async()=>{
    const {ctx,pg,errs}=await open();
    const seed0=await pg.evaluate(()=>LW.app.draft.seed);
    await pg.click('text=Advanced Planet Setup');await pg.waitForSelector('h2:has-text("Planet setup")');
    const h0=await pg.evaluate(()=>LW.planet.height(LW.app.draft,[0,1,0]));
    await pg.fill('input[aria-label="Seed"]','424242');await pg.press('input[aria-label="Seed"]','Tab');
    await pg.locator('input[aria-label="Radius"]').evaluate(e=>{e.value=2.5;e.dispatchEvent(new Event('input',{bubbles:true}));});
    await pg.locator('input[aria-label="Terracing (fantastical)"]').evaluate(e=>{e.value=0.8;e.dispatchEvent(new Event('input',{bubbles:true}));});
    await settle(pg,700);
    const d=await pg.evaluate(()=>({seed:LW.app.draft.seed,radius:LW.app.draft.body.radius,terrace:LW.app.draft.body.gen.terrace,h:LW.planet.height(LW.app.draft,[0,1,0])}));
    assert.strictEqual(d.seed,424242);assert(Math.abs(d.radius-2000*Math.pow(10,2.5))<2);assert.strictEqual(d.terrace,0.8);assert(d.h!==h0,'preview planet changed');
    await pg.screenshot({path:path.join(OUT,'02-advanced.png')});
    await pg.click('text=Create world');await pg.waitForFunction(()=>LW.app.world&&LW.app.phase==='play');
    const w=await pg.evaluate(()=>{const w=LW.app.world;return {seed:w.seed,persons:Object.keys(w.persons).length,orgs:Object.keys(w.organisms).length,veg:w.env.veg.some(v=>v>0),mode:w.mode,id:w.id,ev:w.events[0].type};});
    assert.strictEqual(w.seed,424242);assert.strictEqual(w.persons+w.orgs,0);assert(!w.veg);assert.strictEqual(w.mode,'create');assert.strictEqual(w.ev,'world.created');
    assert.notStrictEqual(seed0,424242);assert.deepStrictEqual(errs,[]);await ctx.close();
    const a=await open(),b=await open();const s=[await a.pg.evaluate(()=>LW.app.draft.seed),await b.pg.evaluate(()=>LW.app.draft.seed)];await a.ctx.close();await b.ctx.close();
    assert.notStrictEqual(s[0],s[1],'each new world gets its own seed');
    return 'radius '+(d.radius/1000).toFixed(0)+' km planet created from the advanced panel';
  });

  await test('B03','continuous zoom from orbit to ground in ONE world/scene; LOD refines; floating-origin precision holds on an Earth-sized planet',['LW-002','LW-014','LW-060','LW-068','LW-074','LW-112','LW-130','LW-131','LW-148'],async()=>{
    const {ctx,pg,errs}=await open();
    // an Earth-sized planet is the hard case for precision
    await pg.evaluate(()=>{LW.app.newDraft({seed:31337,body:{radius:6371000}});});await quick(pg);
    const r=await pg.evaluate(async()=>{
      const A=LW.app,w=A.world,d=LW.env.d(w);let c=0;for(let k=0;k<d.C;k++)if(d.h[k]>200&&d.h[k]<1500){c=k;break;}
      A.cam.n=LW.env.cellDir(w,c);const world0=w,terrain0=A.terrain,scene0=A.scene,canvas0=A.canvas,steps=[];
      const G=LW.gfx,conv=()=>{for(let i=0;i<200;i++){G.camUpdate(w,A.cam,A.canvas.clientWidth,A.canvas.clientHeight,0.05);A.terrain.update(w,A.cam,40);if(!A.terrain.queue.length)break;}};
      for(let dist=w.body.radius*3;dist>=6;dist*=0.5){A.cam.dist=dist;conv();
        let minQ=1e12,maxRel=0,maxLvl=0;for(const nd of A.terrain.visible){minQ=Math.min(minQ,nd.edge/16);maxLvl=Math.max(maxLvl,nd.l);}
        steps.push({dist,scale:A.scale(),chunks:A.terrain.visible.length,minQuad:minQ,lvl:maxLvl,alt:A.cam.alt});}
      // settle at ground level and measure precision of what the GPU receives
      conv();for(let i=0;i<3;i++)await new Promise(r=>requestAnimationFrame(r));
      let near=null;for(const nd of A.terrain.visible)if(!near||nd.dist<near.dist)near=nd;
      const rel=[near.c[0]-A.cam.pos[0],near.c[1]-A.cam.pos[1],near.c[2]-A.cam.pos[2]],relMag=Math.hypot(rel[0],rel[1],rel[2]);
      const f32=Math.fround(relMag),ulp=Math.abs(Math.fround(relMag*(1+1.2e-7))-f32)||relMag*1.2e-7;
      const planetUlp=w.body.radius*1.2e-7;
      // canonical consistency: ground point under the camera target equals the canonical function
      const hit=LW.gfx.raycast(w,A.cam.pos,A.cam.f),hErr=hit?Math.abs((Math.hypot(hit.p[0],hit.p[1],hit.p[2])-w.body.radius)-Math.max(LW.planet.height(w,hit.n),LW.planet.waterLevel(w,hit.n))):null;
      return {steps,same:world0===A.world&&terrain0===A.terrain&&scene0===A.scene&&canvas0===A.canvas,nearEdge:near.edge,relMag,ulp,planetUlp,hErr,glerr:LW.gfx.gl.getError(),pending:A.terrain.pending};
    });
    assert(r.same,'same world, terrain system, scene and canvas throughout (no scene replacement)');
    const scales=[...new Set(r.steps.map(s=>s.scale))];assert(scales.length>=5,'passes through scales: '+scales.join(' > '));
    assert(r.steps[0].minQuad>50000&&r.steps[r.steps.length-1].minQuad<3,'detail refines from '+r.steps[0].minQuad.toFixed(0)+' m to '+r.steps[r.steps.length-1].minQuad.toFixed(2)+' m quads');
    for(let i=1;i<r.steps.length;i++)assert(r.steps[i].minQuad<=r.steps[i-1].minQuad*1.01,'monotonic refinement');
    assert(r.relMag<2000,'camera-relative chunk offset is small: '+r.relMag.toFixed(1)+' m');assert(r.ulp<0.001,'GPU float step near camera '+(r.ulp*1000).toFixed(3)+' mm');
    assert(r.planetUlp>0.5,'naive planet-space floats would step by '+r.planetUlp.toFixed(2)+' m');assert(r.hErr!==null&&r.hErr<0.05,'raycast matches canonical terrain: '+r.hErr);
    assert.strictEqual(r.glerr,0);assert.deepStrictEqual(errs,[]);await pg.screenshot({path:path.join(OUT,'03-ground-earth-size.png')});await ctx.close();
    return scales.join(' > ')+'; quads '+r.steps[0].minQuad.toFixed(0)+' m -> '+r.steps[r.steps.length-1].minQuad.toFixed(2)+' m; float step at camera '+(r.ulp*1000).toFixed(3)+' mm vs '+r.planetUlp.toFixed(2)+' m without floating origin';
  });

  await test('B04','mouse sculpting with visible brush: immediate terrain change, undo, redo, sea level, biome paint, protected regeneration',['LW-013','LW-063','LW-076','LW-077','LW-079','LW-082','LW-083','LW-086','LW-127','LW-128'],async()=>{
    const {ctx,pg,errs}=await open();await quick(pg);await toRiver(pg,5000);await settle(pg,900);
    await pg.click('button[aria-label="Sculpt"]');
    assert(/EDIT/.test(await pg.textContent('#mode')),'edit mode is indicated');assert(await pg.isVisible('input[aria-label="Brush radius"]'));
    const before=await pg.evaluate(()=>{const A=LW.app,h=A.groundHit(450,300);globalThis.T_HIT=h.n;return {h:LW.planet.height(A.world,h.n),edits:A.world.terrainEdits.length,r:A.tool.r,built:A.terrain.built};});
    await pg.mouse.move(center.x,center.y);await pg.mouse.down();for(let i=1;i<=8;i++)await pg.mouse.move(center.x+i*14,center.y+i*4,{steps:2});await pg.mouse.up();await settle(pg,500);
    const after=await pg.evaluate(()=>{const A=LW.app;return {h:LW.planet.height(A.world,T_HIT),edits:A.world.terrainEdits.length,undo:A.world.undo.length,built:A.terrain.built,stale:[...A.terrain.nodes.values()].filter(n=>n.urgent).length};});
    assert(after.edits>before.edits,'stroke recorded '+(after.edits-before.edits)+' dabs');assert(after.h>before.h+1,'ground rose by '+(after.h-before.h).toFixed(1)+' m');
    assert(after.built>before.built,'visible meshes were rebuilt');assert.strictEqual(after.undo,1,'whole stroke is one undo step');
    await pg.screenshot({path:path.join(OUT,'04-sculpt.png')});
    await pg.click('button[aria-label="Undo"]');assert(Math.abs(await pg.evaluate(()=>LW.planet.height(LW.app.world,T_HIT))-before.h)<1e-6,'undo restores the surface');
    await pg.click('button[aria-label="Redo"]');assert(Math.abs(await pg.evaluate(()=>LW.planet.height(LW.app.world,T_HIT))-after.h)<1e-6,'redo reapplies it');
    // brush auto-scales with zoom
    const r2=await pg.evaluate(async()=>{LW.app.zoom(0.1);await new Promise(r=>setTimeout(r,700));return LW.app.tool.r;});assert(r2<before.r*0.5,'brush follows zoom: '+before.r.toFixed(0)+' -> '+r2.toFixed(0)+' m');
    // biome paint via keyboard-free UI path
    await pg.click('button[aria-label="Paint"]');await pg.click('.chip.bio:has-text("Desert")');
    await pg.mouse.click(center.x-60,center.y-40);await settle(pg,300);
    const bio=await pg.evaluate(()=>{const A=LW.app,e=A.world.terrainEdits[A.world.terrainEdits.length-1];return {tool:e.tool,b:LW.env.climate(A.world,e.n,LW.planet.height(A.world,e.n)).biome};});
    assert.strictEqual(bio.tool,'biome');assert(bio.b===4||bio.b===0,'painted biome is in effect');
    // sea level slider
    await pg.click('button[aria-label="Planet"]');
    const sea=await pg.evaluate(async()=>{const A=LW.app,inp=document.querySelector('input[aria-label="Sea level"]'),s0=A.world.body.seaLevel;inp.value=+inp.max*0.5;inp.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,400));return {s0,s1:A.world.body.seaLevel};});
    assert(sea.s1>sea.s0+10,'sea level changed through the UI');
    // regeneration preview + apply keeps the hand-edited spot
    const hEdit=await pg.evaluate(()=>LW.planet.height(LW.app.world,T_HIT)),hFar=await pg.evaluate(()=>LW.planet.height(LW.app.world,[0,-1,0]));
    await pg.click('button:has-text("Preview")');await settle(pg,400);assert(await pg.evaluate(()=>!!LW.app.preview&&LW.app.world.genEpoch===0),'preview does not commit');
    await pg.click('button:has-text("Apply")');await settle(pg,400);
    const reg=await pg.evaluate(()=>({e:LW.planet.height(LW.app.world,T_HIT),f:LW.planet.height(LW.app.world,[0,-1,0]),ep:LW.app.world.genEpoch}));
    assert.strictEqual(reg.ep,1);assert(Math.abs(reg.e-hEdit)<1e-6,'edited spot unchanged by regeneration');assert(Math.abs(reg.f-hFar)>0.01,'elsewhere regenerated');
    assert.deepStrictEqual(errs,[]);await ctx.close();
    return 'raised '+(after.h-before.h).toFixed(1)+' m with '+(after.edits-before.edits)+' dabs; undo/redo exact; regeneration preserved the edit';
  });

  await test('B05','touch: one-finger drag pans, pinch zooms, tap selects; phone layout keeps every control on screen',['LW-038','LW-049','LW-052','LW-126','LW-127'],async()=>{
    const {ctx,pg,errs}=await open({ctx:{viewport:{width:360,height:640},hasTouch:true,isMobile:true,deviceScaleFactor:2}});
    await pg.tap('text=Quick Start');await pg.waitForFunction(()=>LW.app.world&&LW.app.phase==='play');await toRiver(pg,4000);await settle(pg,800);
    const cdp=await ctx.newCDPSession(pg),touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map((p,i)=>({x:p[0],y:p[1],id:i}))});
    const c0=await pg.evaluate(()=>({n:LW.app.cam.n.slice(),d:LW.app.cam.dist}));
    await touch('touchStart',[[180,300]]);for(let i=1;i<=6;i++)await touch('touchMove',[[180+i*12,300+i*6]]);await touch('touchEnd',[]);
    const c1=await pg.evaluate(()=>({n:LW.app.cam.n.slice(),d:LW.app.cam.dist}));
    assert(Math.hypot(c1.n[0]-c0.n[0],c1.n[1]-c0.n[1],c1.n[2]-c0.n[2])>1e-4,'drag panned the camera');assert.strictEqual(c1.d,c0.d);
    await touch('touchStart',[[150,300],[210,300]]);for(let i=1;i<=6;i++)await touch('touchMove',[[150-i*12,300],[210+i*12,300]]);await touch('touchEnd',[]);
    const c2=await pg.evaluate(()=>LW.app.cam.dist);assert(c2<c1.d*0.6,'pinch-out zoomed in: '+c1.d.toFixed(0)+' -> '+c2.toFixed(0));
    await touch('touchStart',[[150,300],[210,300]]);for(let i=1;i<=6;i++)await touch('touchMove',[[150,300-i*3],[210,300+i*10]]);await touch('touchEnd',[]);
    const hd=await pg.evaluate(()=>LW.app.cam.heading);assert(Math.abs(hd)>0.05,'twist rotated the view');
    await pg.touchscreen.tap(180,330);await settle(pg,400);
    assert(await pg.evaluate(()=>LW.app.sel&&LW.app.sel.type==='cell'),'tap selected the land');assert(await pg.isVisible('#insp'));
    // every control inside the viewport and large enough to touch
    const lay=await pg.evaluate(()=>{const bad=[],vw=innerWidth,vh=innerHeight;let n=0;
      for(const e of document.querySelectorAll('#top button,#toolbar button,#nav button,#insp button,#hint button')){const r=e.getBoundingClientRect();if(!r.width)continue;n++;
        if(r.left<-0.5||r.top<-0.5||r.right>vw+0.5||r.bottom>vh+0.5)bad.push('offscreen '+(e.getAttribute('aria-label')||e.textContent)+' '+Math.round(r.right)+'x'+Math.round(r.bottom));
        if(Math.min(r.width,r.height)<34)bad.push('small '+(e.getAttribute('aria-label')||e.textContent)+' '+Math.round(r.width)+'x'+Math.round(r.height));}
      const tb=document.getElementById('toolbar');return {bad,n,scroll:tb.scrollWidth>tb.clientWidth+1,body:document.documentElement.scrollWidth>vw};});
    assert.deepStrictEqual(lay.bad,[],'controls on screen and touch-sized');assert(!lay.scroll,'toolbar fits without scrolling');assert(!lay.body,'no horizontal page overflow');
    // each tool strip and the menu fit on a phone
    for(const cat of ['Sculpt','Paint','Life','Build','Dig','Planet']){await pg.tap('button[aria-label="'+cat+'"]');
      const ok=await pg.evaluate(()=>{const s=document.getElementById('strip').getBoundingClientRect(),t=document.getElementById('toolbar').getBoundingClientRect();return s.bottom<=t.top+1&&s.top>=40&&s.right<=innerWidth+0.5;});assert(ok,cat+' strip fits');}
    await pg.screenshot({path:path.join(OUT,'05-phone.png')});
    await pg.tap('button[aria-label="Menu"]');assert(await pg.isVisible('text=Export world file'));await pg.tap('#modal button[aria-label="Close"]');
    assert.deepStrictEqual(errs,[]);await ctx.close();
    return lay.n+' controls checked on 360x640 (emulated touch, not a physical phone)';
  });

  await test('B06','keyboard and mouse navigation alternatives: wheel zoom, right-drag rotate/tilt, keys, double-click focus',['LW-126','LW-130'],async()=>{
    const {ctx,pg,errs}=await open();await quick(pg);await settle(pg,400);
    const s=()=>pg.evaluate(()=>({n:LW.app.cam.n.slice(),d:LW.app.cam.dist,h:LW.app.cam.heading,t:LW.app.cam.tilt}));
    const a=await s();await pg.mouse.move(450,300);await pg.mouse.wheel(0,-600);await settle(pg,200);const b=await s();assert(b.d<a.d*0.8,'wheel zooms');
    await pg.mouse.down({button:'right'});await pg.mouse.move(550,240,{steps:4});await pg.mouse.up({button:'right'});const c=await s();assert(Math.abs(c.h-b.h)>0.2&&c.t!==b.t,'right-drag rotates and tilts');
    await pg.keyboard.down('d');await settle(pg,350);await pg.keyboard.up('d');const d=await s();assert(Math.hypot(d.n[0]-c.n[0],d.n[1]-c.n[1],d.n[2]-c.n[2])>1e-3,'keys pan');
    await pg.keyboard.down('-');await settle(pg,300);await pg.keyboard.up('-');const e=await s();assert(e.d>d.d,'minus key zooms out');
    await pg.click('button[aria-label="Zoom in"]');assert((await s()).d<e.d,'zoom button');
    await pg.click('button[aria-label="North up, automatic tilt, surface view"]');assert.strictEqual((await s()).h,0);
    await pg.mouse.dblclick(430,310);await settle(pg,1200);assert((await s()).d<e.d*0.5,'double-click focuses smoothly');
    assert.deepStrictEqual(errs,[]);await ctx.close();
  });

  await test('B07','integrated path by UI: plants -> home -> person -> command to use bed -> Play -> release -> autonomous life -> inspector',['LW-003','LW-015','LW-020','LW-029','LW-035','LW-038','LW-136','LW-137','LW-139','LW-050','LW-067'],async()=>{
    const {ctx,pg,errs}=await open();await quick(pg);await toRiver(pg,1500);await settle(pg,900);
    assert(/sterile|Shape the land/.test(await pg.textContent('#hint')),'contextual hint shown');
    // 1. plants with the brush
    await pg.click('button[aria-label="Life"]');await pg.mouse.move(center.x,center.y);await pg.mouse.down();await pg.mouse.move(center.x+40,center.y+10,{steps:3});await pg.mouse.up();
    assert(await pg.evaluate(()=>LW.app.world.env.veg.some(v=>v>0)),'vegetation now exists');
    // 2. a home, placed by tapping the ground
    await pg.evaluate(()=>{LW.app.cam.dist=120;});await settle(pg,900);
    await pg.click('button[aria-label="Build"]');await pg.click('.chip:has-text("Cottage")');assert(/PLACE/.test(await pg.textContent('#mode')));
    await pg.click('button[aria-label="Build"]');assert(await pg.isHidden('#strip'),'tapping the active tool collapses its options');
    await pg.mouse.click(center.x,center.y);await settle(pg,400);
    const b=await pg.evaluate(()=>{const w=LW.app.world,b=Object.values(w.buildings)[0];globalThis.T_B=b.id;return b?{kind:b.kind,comps:b.comps.map(c=>c.kind),d:LW.arcDist(b.n,LW.app.cam.n,w.body.radius)}:null;});
    assert(b&&b.kind==='house'&&b.comps.indexOf('bed')>=0,'a cottage with a bed exists');assert(b.d<25,'placed where tapped ('+b.d.toFixed(1)+' m from view centre)');
    // extra furniture inside the room
    await pg.click('button[aria-label="Build"]');await pg.click('.chip:has-text("Study shelf")');await pg.click('button[aria-label="Build"]');
    const fp=await pg.evaluate(()=>{const A=LW.app,w=A.world,b=w.buildings[T_B],n=LW.build.dir(w,b,1.5,-1.2),s=LW.gfx.project(A.cam,LW.planet.surface(w,n,0.3));return [s.x,s.y];});
    await pg.mouse.click(fp[0],fp[1]);await settle(pg,300);assert(await pg.evaluate(()=>LW.app.world.buildings[T_B].comps.some(c=>c.kind==='shelf')),'furniture placed inside the room');
    // 3. a person next to it
    await pg.click('button[aria-label="Life"]');await pg.click('.chip:has-text("People")');await pg.click('button[aria-label="Life"]');
    await pg.mouse.click(center.x+150,center.y+70);await settle(pg,400);
    const p=await pg.evaluate(()=>{const w=LW.app.world,p=Object.values(w.persons)[0];globalThis.T_P=p.id;return {id:p.id,name:p.name,n:Object.keys(w.persons).length,mem:p.mem.ep.length,goalsOk:Array.isArray(p.goals),needs:p.needs};});
    assert.strictEqual(p.n,1);assert(/^p_/.test(p.id)&&p.mem>=1&&p.needs.hunger>0,'persistent id, needs and a first memory');
    await pg.screenshot({path:path.join(OUT,'07a-home-and-person.png')});
    // 4. select, take control, order: use the bed
    await pg.click('button[aria-label="Navigate"]');
    const pp=await pg.evaluate(()=>{const A=LW.app,w=A.world,p=w.persons[T_P],s=LW.gfx.project(A.cam,LW.planet.surface(w,p.n,0.9));return [s.x,s.y];});
    await pg.mouse.click(pp[0],pp[1]);await settle(pg,300);assert(await pg.evaluate(()=>LW.app.sel&&LW.app.sel.type==='person'&&LW.app.sel.id===T_P),'tap selected the person');
    assert(await pg.isVisible('#insp >> text=Hunger'));
    await pg.click('#insp >> text=Take control',{force:true});await pg.click('button:has-text("▶ Play")');await settle(pg,300);
    await pg.evaluate(()=>{LW.app.world.persons[T_P].needs.energy=35;});
    await pg.click('#insp .chip:has-text("Sleep")',{force:true});
    assert(await pg.evaluate(()=>{const p=LW.app.world.persons[T_P];return p.control.mode==='player'&&(p.queue.length===1||p.act&&p.act.a==='use');}),'order queued');
    await pg.evaluate(()=>LW.app.setSpeed(3));
    await pg.waitForFunction(()=>LW.app.world.persons[T_P].posture==='lie',null,{timeout:60000});
    const inBed=await pg.evaluate(()=>{const w=LW.app.world,p=w.persons[T_P],l=LW.build.locate(w,p.n),bed=w.buildings[T_B].comps.find(c=>c.kind==='bed');return {inside:!!l&&l.b.id===T_B,by:bed.by===p.id,act:p.act.a+':'+p.act.cap};});
    assert(inBed.inside&&inBed.by,'walked through the door and is sleeping in the bed ('+inBed.act+')');
    await pg.evaluate(()=>LW.app.setSpeed(1));await settle(pg,700);await pg.screenshot({path:path.join(OUT,'07b-sleeping-cutaway.png')});
    // 5. release; the same individual resumes their own life
    const mem=await pg.evaluate(()=>LW.app.world.persons[T_P].mem.ep.length);
    await pg.click('#insp >> text=Release',{force:true});await pg.evaluate(()=>LW.app.setSpeed(3));
    await pg.waitForFunction(()=>{const p=LW.app.world.persons[T_P];return p.control.mode==='auto'&&p.plan&&p.act&&p.act.src!=='player';},null,{timeout:60000});
    const auto=await pg.evaluate(()=>{const p=LW.app.world.persons[T_P];return {id:p.id,goal:p.plan.goal,mem:p.mem.ep.length};});
    assert.strictEqual(auto.id,p.id);assert(auto.mem>mem,'memory continued');
    // 6. leave, come back: life went on
    const t0=await pg.evaluate(()=>({t:LW.app.world.tick,h:LW.app.world.persons[T_P].needs.hunger}));
    await pg.evaluate(()=>{LW.app.select(null);LW.app.cam.n=LW.V.mul(LW.app.cam.n,-1);LW.app.cam.dist=40000;LW.app.setSpeed(4);});
    await pg.waitForFunction(t=>LW.app.world.tick>t+2500,t0.t,{timeout:90000});
    const t1=await pg.evaluate(()=>{const p=LW.app.world.persons[T_P];return {h:p.needs.hunger,alive:p.alive,ev:LW.app.world.events.length};});
    assert(t1.h!==t0.h,'needs changed while the player looked elsewhere');
    // history tab shows provenance
    await pg.evaluate(()=>{LW.app.setSpeed(0);LW.app.setTool('nav');LW.app.select({type:'person',id:T_P});LW.ui.tab='history';LW.ui.renderInspector();});
    assert(await pg.locator('#insp .evs details').count()>0,'history with causes is shown');
    await pg.evaluate(()=>{LW.ui.tab='talk';LW.ui.renderInspector();});
    assert(/Scripted dialogue/.test(await pg.textContent('#insp')),'dialogue is labelled as scripted');assert(await pg.locator('#insp input[aria-label="Free-text dialogue"]').isDisabled(),'free text disabled without a local model');
    await pg.click('#insp .chip:has-text("How are you?")',{force:true});assert(/scripted reply/.test(await pg.textContent('#insp .say')));
    assert.deepStrictEqual(errs,[]);await ctx.close();
    return p.name+' slept in the bed on command, then chose "'+auto.goal+'" on release';
  });

  await test('B08','cause and effect in the app: terrain edit dries the river; inspector explains why',['LW-019','LW-050','LW-078','LW-092'],async()=>{
    const {ctx,pg,errs}=await open();await quick(pg);await toRiver(pg,6000);
    await pg.evaluate(()=>{const A=LW.app,w=A.world;A.cam.n=T_RIVER.slice();A.tool.lockR=true;A.setTool('sculpt','raise');A.tool.r=LW.env.cellSize(w)*2.6;A.tool.s=LW.planet.amplitude(w.body)*0.9;});
    await settle(pg,800);await pg.mouse.click(center.x,center.y-25);await settle(pg,800);
    const r=await pg.evaluate(()=>{const w=LW.app.world,c=T_CELL;return {edits:w.terrainEdits.map(e=>[e.tool,Math.round(e.r),Math.round(e.s),Math.round(LW.arcDist(e.n,T_RIVER,w.body.radius))]),flux:LW.env.d(w).flux[c],thr:LW.env.d(w).thr,kind:w.env.river[c],fresh:LW.env.fresh(w,c),chg:!!w.env.chg[c],chain:w.env.chg[c]?LW.causalChain(w,w.env.chg[c]).map(e=>e.type):[],toast:LW.app.lastToast.msg};});
    assert(!r.fresh,'river cell is now dry '+JSON.stringify(r));assert(r.chain.indexOf('terrain.edited')>0,'event chain: '+r.chain.join(' <- '));assert(/Water responded/.test(r.toast),'player is told water changed');
    await pg.evaluate(()=>{LW.app.setTool('nav');LW.app.select({type:'cell',cell:T_CELL,n:T_RIVER});});
    assert(/Why the water here changed/.test(await pg.textContent('#insp')));assert(/because: Terrain edited/.test(await pg.textContent('#insp')));
    await pg.screenshot({path:path.join(OUT,'08-cause.png')});assert.deepStrictEqual(errs,[]);await ctx.close();
    return r.chain.join(' <- ');
  });

  await test('B09','dig site: carve by dragging; opening is rendered in the same space; underground view',['LW-081','LW-134','LW-150'],async()=>{
    const {ctx,pg,errs}=await open();await quick(pg);await toRiver(pg,70);await settle(pg,1200);
    await pg.click('button[aria-label="Dig"]');await pg.click('.chip:has-text("New dig site")');await pg.mouse.click(center.x,center.y);await settle(pg,900);
    const v=await pg.evaluate(()=>{const w=LW.app.world,v=Object.values(w.volumes)[0];return v?{id:v.id,tool:LW.app.tool.id}:null;});assert(v&&v.tool==='carve','dig site created, carve tool armed');
    await pg.mouse.move(center.x-10,center.y);await pg.mouse.down();for(let i=1;i<=6;i++)await pg.mouse.move(center.x-10+i*8,center.y+i*3,{steps:2});await pg.mouse.up();await settle(pg,900);
    const r=await pg.evaluate(()=>{const A=LW.app,w=A.world,v=Object.values(w.volumes)[0],g=LW.volumes.grid(w,v);let open=0;for(let i=0;i<g.nx;i++)for(let k=0;k<g.nz;k++){const x=(i+0.5-g.nx/2)*g.cs,z=(k+0.5-g.nz/2)*g.cs;if(LW.volumes.groundY(w,v,x,z,1e9)<g.colH[k*g.nx+i]-1)open++;}
      const holes=[...A.terrain.nodes.values()].some(n=>n.mesh&&n.edge/16<=3.5&&LW.V.dist(n.nMid,v.n)*w.body.radius<n.edge);
      return {ops:v.ops.length,open,meshed:A.scene.vm.has(v.id)&&!!A.scene.vm.get(v.id).mesh,holes,undo:w.undo[w.undo.length-1].label};});
    assert(r.ops>=2,'carve operations recorded: '+r.ops);assert(r.open>0,'surface columns opened: '+r.open);assert(r.meshed,'volume mesh rendered');assert(r.holes,'fine terrain chunks cover the site');
    await pg.screenshot({path:path.join(OUT,'09a-dig.png')});
    await pg.locator('input[aria-label="View depth"]').evaluate(e=>{e.value=6;e.dispatchEvent(new Event('input',{bubbles:true}));});await settle(pg,900);
    assert.strictEqual(await pg.evaluate(()=>LW.app.cam.depth),6);await pg.screenshot({path:path.join(OUT,'09b-underground.png')});
    assert.strictEqual(await pg.evaluate(()=>LW.gfx.gl.getError()),0);assert.deepStrictEqual(errs,[]);await ctx.close();
    return r.ops+' carve ops opened '+r.open+' surface columns';
  });

  await test('B10','persistence across a real page reload: same planet, edits, home, resident, memories and history; world keeps advancing',['LW-056','LW-087','LW-090','LW-103','LW-109','LW-129','LW-133'],async()=>{
    const {ctx,pg,errs}=await open();await quick(pg);await toRiver(pg,300);
    await pg.evaluate(()=>{const A=LW.app,w=A.world,R=w.body.radius;A.do('life.seedPlants',{speciesId:'sp_broadleaf',n:T_RIVER,r:1500,cover:150});A.do('terrain.edit',{tool:'mountain',n:LW.offsetDir(T_SITE,500,0,R),r:260,s:60});
      A.do('build.place',{template:'house',n:T_SITE,yaw:0.3});A.do('life.spawn',{speciesId:'sp_human',n:LW.offsetDir(T_SITE,12,-10,R),count:2});A.do('world.setMode',{mode:'play'});A.do('time.advance',{ticks:1500});});
    await pg.evaluate(()=>LW.app.snapshot(true));
    // one more acknowledged edit AFTER the snapshot: must survive through the journal
    await pg.evaluate(()=>{const A=LW.app;A.do('terrain.edit',{tool:'lower',n:LW.offsetDir(T_SITE,-400,0,A.world.body.radius),r:150,s:25});});await settle(pg,400);
    const before=await pg.evaluate(()=>{const w=LW.app.world;return {id:w.id,tick:w.tick,persons:Object.keys(w.persons),mem:Object.values(w.persons).map(p=>p.mem.ep.length),ev:w.events.length,edits:w.terrainEdits.length,h:LW.planet.height(w,T_SITE),site:T_SITE,name:w.name};});before.hash=await worldHash(pg);
    const dump=()=>pg.evaluate(async()=>{const kv=LW.app.store.kv,ks=await kv.keys(),o=[];for(const k of ks){const r=JSON.parse(await kv.get(k));o.push(k.slice(-8)+' '+(r.cmd?r.cmd.type+'@'+r.tick:'seq'+r.seq+' jseq'+r.jseq+' edits'+JSON.parse(r.text).world.terrainEdits.length));}return o.join(' ; ');});
    const d1=await dump();
    await pg.reload();await pg.waitForFunction(()=>globalThis.LW&&LW.app&&LW.app.booted);
    assert(await pg.isVisible('text=Continue'),'saved world is offered');
    const d2=await dump();
    await pg.click('.saves button.grow');await pg.waitForFunction(()=>LW.app.world&&LW.app.phase==='play');
    const after=await pg.evaluate(site=>{const w=LW.app.world;return {id:w.id,tick:w.tick,persons:Object.keys(w.persons),mem:Object.values(w.persons).map(p=>p.mem.ep.length),ev:w.events.length,edits:w.terrainEdits.length,h:LW.planet.height(w,site),toast:LW.app.lastToast&&LW.app.lastToast.msg};},before.site);after.hash=await worldHash(pg);
    assert.strictEqual(after.id,before.id);assert.strictEqual(after.edits,before.edits,'post-snapshot edit recovered from the journal ('+after.toast+') BEFORE '+d1+' AFTER '+d2);assert.strictEqual(after.tick,before.tick,'same logical time');assert.deepStrictEqual(after.persons,before.persons);assert.deepStrictEqual(after.mem,before.mem);
    assert.strictEqual(after.h,before.h);assert.strictEqual(after.hash,before.hash,'world state is identical after reload');
    await pg.evaluate(()=>{LW.ui.closeModal();LW.app.setSpeed(3);});await pg.waitForFunction(t=>LW.app.world.tick>t+400,after.tick,{timeout:60000});
    const LW_ok=await pg.evaluate(()=>{try{LW.save.validate(LW.app.world);return true;}catch(e){return e.message;}});assert.strictEqual(LW_ok,true,'world still valid while advancing');
    assert.deepStrictEqual(errs,[]);await ctx.close();
    return 'hash '+before.hash+' identical after reload ('+after.toast+')';
  });

  await test('B11','export/import between independent browser profiles; corrupted file refused and current world untouched',['LW-056','LW-123','LW-152'],async()=>{
    const a=await open();await quick(a.pg);await toRiver(a.pg,300);
    await a.pg.evaluate(()=>{const A=LW.app,R=A.world.body.radius;A.do('build.place',{template:'cottage',n:T_SITE});A.do('life.spawn',{speciesId:'sp_human',n:LW.offsetDir(T_SITE,10,-9,R),name:'Wanderer'});A.do('terrain.edit',{tool:'raise',n:LW.offsetDir(T_SITE,300,0,R),r:120,s:30});A.do('world.setMode',{mode:'play'});A.do('time.advance',{ticks:800});});
    const [dl]=await Promise.all([a.pg.waitForEvent('download'),(async()=>{await a.pg.click('button[aria-label="Menu"]');await a.pg.click('text=Export world file');})()]);
    const file=path.join(OUT,'exported.lwworld');await dl.saveAs(file);const text=fs.readFileSync(file,'utf8'),h1=await worldHash(a.pg);await a.ctx.close();
    assert(/\.lwworld$/.test(dl.suggestedFilename()));
    const b=await open();        // a brand-new profile: empty storage
    assert(!(await b.pg.isVisible('text=Continue')),'fresh profile has no saves');
    await b.pg.setInputFiles('#start input[type=file]',file);await b.pg.waitForFunction(()=>LW.app.world&&LW.app.phase==='play');
    const h2=await worldHash(b.pg);assert.strictEqual(h2,h1,'imported world is byte-identical');
    assert(await b.pg.evaluate(()=>Object.values(LW.app.world.persons)[0].name==='Wanderer'&&Object.keys(LW.app.world.buildings).length===1));
    // corrupted import is refused; the open world is unchanged
    const bad=path.join(OUT,'corrupt.lwworld');fs.writeFileSync(bad,text.replace('Wanderer','Intruder!'));
    const r=await b.pg.evaluate(t=>LW.app.importText(t),fs.readFileSync(bad,'utf8'));assert.strictEqual(r.code,'checksum_mismatch');
    assert(/Import rejected/.test(await b.pg.textContent('#toast')));assert.strictEqual(await worldHash(b.pg),h1,'current world untouched');
    const evil=await b.pg.evaluate(t=>{const o=JSON.parse(t);o.world.name='<img src=x onerror=window.PWNED=1>';o.checksum=LW.checksum(LW.canonical(o.world));return LW.app.importText(JSON.stringify(o));},text);
    await settle(b.pg,300);assert(evil.ok);await b.pg.evaluate(()=>LW.ui.enter());assert.strictEqual(await b.pg.evaluate(()=>window.PWNED),undefined,'world text is never interpreted as markup');
    assert(/<img/.test(await b.pg.textContent('#top .title b')),'shown as literal text');
    assert.deepStrictEqual(b.errs,[]);await b.ctx.close();
    return 'archive '+(text.length/1024).toFixed(0)+' KB round-tripped; hash '+h1;
  });

  await test('B12','storage blocked: game still runs and truthfully warns that nothing is kept; export still works',['LW-056','LW-143'],async()=>{
    const {ctx,pg,errs}=await open({init:()=>{Object.defineProperty(window,'indexedDB',{get(){throw new Error('denied');}});Object.defineProperty(window,'localStorage',{get(){throw new Error('denied');}});}});
    assert.strictEqual(await pg.evaluate(()=>LW.app.storeKind),'memory');assert(/NOT kept/.test(await pg.textContent('#start')),'truthful warning on the title screen');
    await quick(pg);await pg.click('button[aria-label="Menu"]');assert(/unavailable in this browser context/.test(await pg.textContent('#modal')));
    assert((await pg.evaluate(()=>LW.app.exportText().length))>1000);assert.deepStrictEqual(errs,[]);await ctx.close();
  });

  await test('B13','frame timing and scene complexity at four scales (SOFTWARE renderer; not device evidence); adaptive quality reacts',['LW-069','LW-111','LW-142'],async()=>{
    const {ctx,pg,errs}=await open();await quick(pg);await toRiver(pg,300);
    await pg.evaluate(()=>{const A=LW.app,R=A.world.body.radius;A.do('life.seedPlants',{speciesId:'sp_broadleaf',n:T_RIVER,r:2000,cover:170});A.do('build.place',{template:'house',n:T_SITE});
      A.do('life.spawn',{speciesId:'sp_human',n:LW.offsetDir(T_SITE,14,-10,R),count:6});A.do('life.spawn',{speciesId:'sp_grazer',n:LW.offsetDir(T_SITE,-40,10,R),count:12});A.do('world.setMode',{mode:'play'});A.setSpeed(1);});
    const out=[];
    for(const [label,dist] of [['orbit',48000],['region',5000],['settlement',150],['home',25]]){
      await pg.evaluate(d=>{LW.app.cam.dist=d;LW.app.cam.n=T_SITE.slice();},dist);await settle(pg,2500);
      const m=await pg.evaluate(async()=>{const t=[];let last=performance.now();for(let i=0;i<40;i++){await new Promise(r=>requestAnimationFrame(r));const n=performance.now();t.push(n-last);last=n;}t.sort((a,b)=>a-b);
        return {med:t[20],p90:t[36],tris:Math.round(LW.gfx.stats.tris),draws:LW.gfx.stats.draws,chunks:LW.app.terrain.visible.length,cached:LW.app.terrain.nodes.size,q:LW.app.dynQ||1,heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null};});
      out.push(Object.assign({label,dist},m));assert(m.tris>100&&m.tris<600000,'triangle budget at '+label+': '+m.tris);assert(m.draws<1500);
    }
    const save=await pg.evaluate(()=>LW.app.exportText().length);
    fs.writeFileSync(path.join(OUT,'perf.json'),JSON.stringify({renderer:env.renderer,note:'software rasteriser on a CI container CPU; NOT an Android device measurement',scales:out,archiveBytes:save},null,1));
    assert.deepStrictEqual(errs,[]);await ctx.close();
    return out.map(o=>o.label+': '+o.med.toFixed(0)+' ms median, '+o.tris+' tris, '+o.draws+' draws, '+o.chunks+' chunks').join(' | ')+' | heap '+out[3].heap+' MB | save '+(save/1024).toFixed(0)+' KB';
  });

  await test('B14','WebGL context loss is survived; species editor and activity editor create validated content',['LW-023','LW-042','LW-089'],async()=>{
    const {ctx,pg,errs}=await open();await quick(pg);await settle(pg,400);
    await pg.evaluate(async()=>{const ext=LW.gfx.gl.getExtension('WEBGL_lose_context');ext.loseContext();await new Promise(r=>setTimeout(r,300));ext.restoreContext();await new Promise(r=>setTimeout(r,900));});
    const ok=await pg.evaluate(()=>{LW.app.frame(performance.now());return !LW.app.glLost&&LW.app.terrain.visible.length>0&&LW.gfx.gl.getError()===0;});assert(ok,'rendering resumed after context loss');
    await pg.click('button[aria-label="Life"]');await pg.click('text=Species editor…');await pg.fill('#modal input[type=text]','Glass Deer');await pg.click('#modal >> text=Create species');
    assert(await pg.evaluate(()=>Object.values(LW.app.world.species).some(s=>s.name==='Glass Deer')&&LW.app.tool.id==='creature'),'custom species defined and selected');
    await pg.mouse.click(center.x,center.y);await settle(pg,300);
    await pg.evaluate(()=>LW.ui.activityEditor());await pg.click('#modal >> text=Save activity');
    assert(await pg.evaluate(()=>Object.values(LW.app.world.activities).length===1),'activity saved through the visual editor');
    assert.deepStrictEqual(errs.filter(e=>!/context/i.test(e)),[]);await ctx.close();
  });

  await browser.close();
  const pass=results.filter(r=>r.status==='pass').length;
  fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({suite:'browser',env,total:results.length,pass,fail:results.length-pass,results},null,1));
  console.log('\nbrowser: '+pass+'/'+results.length+' passed');process.exit(pass===results.length?0:1);
})().catch(e=>{console.error(e);process.exit(2);});
