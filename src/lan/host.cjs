#!/usr/bin/env node
// Optional trusted-LAN session host. Zero dependencies (Node >= 18). NOT required for single-player.
//   node src/lan/host.cjs --world MyWorld.lwworld --port 8787 [--bind 0.0.0.0]
// The host is the single authority for the shared world: it orders, validates and applies every command
// with the same kernel the browser uses. No accounts, no cloud. Traffic is plain HTTP: trusted networks only.
const http=require('http'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
function loadKernel(){
  if(globalThis.LW&&globalThis.LW.dispatch)return globalThis.LW;
  const dir=path.join(__dirname,'..','core');
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort())vm.runInThisContext(fs.readFileSync(path.join(dir,f),'utf8'),{filename:f});
  return globalThis.LW;
}
function createHost(opts){
  const LW=loadKernel(),world=opts.world,tok=()=>crypto.randomBytes(12).toString('hex');
  const H={world,ownerToken:tok(),invites:{},sessions:{},speed:0,leaseMs:opts.leaseMs||30000,log:[],timer:null,now:opts.now||(()=>Date.now())};
  H.sessions[H.ownerToken]={actor:{id:'owner',role:'owner'},name:'owner',seen:H.now()};
  const send=(res,code,obj)=>{const b=JSON.stringify(obj);res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(b);};
  // exclusive controller leases expire when a player disappears; their characters return to autonomy
  H.expire=function(){
    const t=H.now();
    for(const k in H.sessions){const s=H.sessions[k];if(s.actor.role==='owner'||t-s.seen<H.leaseMs||s.gone)continue;s.gone=true;
      for(const id in world.persons){const p=world.persons[id];if(p.control.by===s.actor.id)LW.dispatch(world,LW.cmd(world,'person.control',{id,on:false}),{id:'owner',role:'owner'});}}
  };
  H.setSpeed=function(tps){H.speed=tps;if(H.timer)clearInterval(H.timer);H.timer=null;
    if(tps>0)H.timer=setInterval(()=>{const n=Math.max(1,Math.round(tps/10));for(let i=0;i<n;i++)LW.tick(world);H.expire();},100);};
  H.handle=function(method,url,body){
    const u=new URL(url,'http://x'),p=u.pathname;
    if(method==='GET'&&p==='/api/info')return [200,{app:'living-world-lan',version:LW.VERSION,schema:LW.SCHEMA,world:world.name,warning:'Unencrypted trusted-LAN session. Do not expose this port to the internet.'}];
    if(method==='POST'&&p==='/api/join'){
      const inv=H.invites[body.invite];if(!inv||inv.used)return [403,{error:'invalid or used invitation'}];
      inv.used=true;const t=tok(),actor={id:'u_'+Object.keys(H.sessions).length,role:inv.role};H.sessions[t]={actor,name:String(body.name||'guest').slice(0,24),seen:H.now()};
      return [200,{token:t,actor,worldId:world.id,revision:world.revision}];}
    if(method==='POST'&&p==='/api/resume'){const o=H.sessions[body.token];if(!o)return [403,{error:'unknown token'}];o.seen=H.now();o.gone=false;return [200,{actor:o.actor,worldId:world.id,revision:world.revision}];}
    const s=H.sessions[(body&&body.token)||u.searchParams.get('token')];
    if(!s)return [401,{error:'not joined'}];
    s.seen=H.now();s.gone=false;H.expire();
    if(method==='POST'&&p==='/api/invite'){if(s.actor.role!=='owner')return [403,{error:'only the owner invites'}];
      if(['editor','visitor'].indexOf(body.role)<0)return [400,{error:'role must be editor or visitor'}];const code=tok().slice(0,8);H.invites[code]={role:body.role,used:false};return [200,{invite:code,role:body.role}];}
    if(method==='POST'&&p==='/api/clock'){if(s.actor.role!=='owner')return [403,{error:'only the owner controls shared time'}];H.setSpeed(Math.max(0,Math.min(1200,+body.ticksPerSecond||0)));return [200,{speed:H.speed}];}
    if(method==='POST'&&p==='/api/command'){
      // server ordering: commands are applied strictly in arrival order; the last VALID edit wins
      const r=LW.dispatch(world,body.cmd,s.actor);H.log.push({by:s.actor.id,type:body.cmd&&body.cmd.type,ok:r.ok,rev:world.revision});if(H.log.length>2000)H.log.shift();
      return [r.ok?200:409,{ok:r.ok,duplicate:!!r.duplicate,code:r.code,error:r.error,receipt:r.receipt,result:r.result,revision:world.revision}];}
    if(method==='GET'&&p==='/api/snapshot')return [200,{archive:LW.save.pack(world)}];
    if(method==='GET'&&p==='/api/sync'){
      // bounded, interest-based sync: recent events + only the entities near the client's focus
      const since=u.searchParams.get('since')||'',n=(u.searchParams.get('n')||'').split(',').map(Number),r=+u.searchParams.get('r')||1500;
      let i=world.events.length-1;while(i>=0&&world.events[i].id!==since)i--;
      const events=world.events.slice(Math.max(i+1,world.events.length-200)),near={persons:{},organisms:{},buildings:{}};
      if(n.length===3&&n.every(isFinite))for(const k of ['persons','organisms','buildings'])for(const id in world[k]){if(LW.arcDist(world[k][id].n,n,world.body.radius)<r)near[k][id]=world[k][id];if(Object.keys(near[k]).length>=200)break;}
      return [200,{revision:world.revision,tick:world.tick,mode:world.mode,speed:H.speed,events,near}];}
    return [404,{error:'not found'}];
  };
  H.server=http.createServer((req,res)=>{
    if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html')){const f=path.join(__dirname,'..','..','Living_World.html');
      if(fs.existsSync(f)){res.writeHead(200,{'content-type':'text/html'});return res.end(fs.readFileSync(f));}}
    let data='';req.on('data',c=>{data+=c;if(data.length>2e6)req.destroy();});
    req.on('end',()=>{let body={};try{body=data?JSON.parse(data):{};}catch(e){return send(res,400,{error:'bad json'});}
      try{const r=H.handle(req.method,req.url,body);send(res,r[0],r[1]);}catch(e){send(res,500,{error:String(e.message)});}});
  });
  H.close=()=>{if(H.timer)clearInterval(H.timer);H.server.close();};
  return H;
}
module.exports={createHost,loadKernel};
if(require.main===module){
  const arg=k=>{const i=process.argv.indexOf('--'+k);return i>0?process.argv[i+1]:null;};
  const LW=loadKernel(),file=arg('world');let world;
  if(file)world=LW.save.parse(fs.readFileSync(file,'utf8'));else world=LW.createWorld({seed:(Date.now()>>>0)||1,nonce:'lan',name:'LAN world'});
  const H=createHost({world}),port=+(arg('port')||8787),bind=arg('bind')||'0.0.0.0';
  H.server.listen(port,bind,()=>{
    console.log('Living World LAN host on http://'+bind+':'+port+'  world: '+world.name);
    console.log('OWNER TOKEN (keep private): '+H.ownerToken);
    console.log('Trusted networks only: traffic is unencrypted. Create invitations with POST /api/invite.');
  });
  const save=()=>{if(file){fs.writeFileSync(file+'.tmp',LW.save.pack(world));fs.renameSync(file+'.tmp',file);}};
  setInterval(save,30000);process.on('SIGINT',()=>{save();process.exit(0);});
}
