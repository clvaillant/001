// LAN host tests over real local HTTP (127.0.0.1). Run: node tests/lan.cjs
const fs=require('fs'),path=require('path'),assert=require('assert');
const {createHost,loadKernel}=require('../src/lan/host.cjs');const LW=loadKernel();
const results=[];
async function test(id,name,reqs,fn){const t0=Date.now();let status='pass',error=null,note=null;try{note=await fn()||null;}catch(e){status='fail';error=String(e&&e.stack||e).split('\n').slice(0,3).join(' | ');}
  results.push({id,name,reqs,status,ms:Date.now()-t0,error,note});console.log((status==='pass'?'  ok   ':'  FAIL ')+id+' '+name+(error?'\n       '+error:''));}
(async()=>{
  console.log('Living World LAN host tests');
  const world=LW.createWorld({seed:777,nonce:'lan'});let clock=1000;
  const H=createHost({world,leaseMs:5000,now:()=>clock});
  await new Promise(r=>H.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+H.server.address().port;
  const post=async(p,b)=>{const r=await fetch(base+p,{method:'POST',body:JSON.stringify(b)});return {status:r.status,body:await r.json()};};
  const get=async p=>{const r=await fetch(base+p);return {status:r.status,body:await r.json()};};
  let seq=0;const cmd=(type,payload)=>({worldId:world.id,commandId:'lan_'+(++seq),expectedRevision:world.revision,payloadVersion:1,type,payload});
  let A,B,Vz;
  await test('L01','owner issues locally validated single-use invitations; no account needed',['LW-021','LW-053','LW-120'],async()=>{
    assert.strictEqual((await post('/api/join',{invite:'nope'})).status,403);
    const i1=(await post('/api/invite',{token:H.ownerToken,role:'editor'})).body.invite,i2=(await post('/api/invite',{token:H.ownerToken,role:'editor'})).body.invite,i3=(await post('/api/invite',{token:H.ownerToken,role:'visitor'})).body.invite;
    A=(await post('/api/join',{invite:i1,name:'Ann'})).body;B=(await post('/api/join',{invite:i2,name:'Ben'})).body;Vz=(await post('/api/join',{invite:i3,name:'Vis'})).body;
    assert(A.token&&B.token&&A.actor.id!==B.actor.id);assert.strictEqual((await post('/api/join',{invite:i1})).status,403,'invitation is single-use');
    assert.strictEqual((await post('/api/invite',{token:A.token,role:'editor'})).status,403,'guests cannot invite');
    assert.strictEqual((await post('/api/command',{token:'bogus',cmd:cmd('world.rename',{name:'x'})})).status,401);
    assert(/trusted/i.test((await get('/api/info')).body.warning),'trusted-network warning is shown');
  });
  await test('L02','two users edit the same object: host orders commands, last valid edit wins, state stays consistent',['LW-054','LW-121','LW-141','LW-116'],async()=>{
    const d=LW.env.d(world);LW.env.settle(world);let c=-1;for(let k=0;k<d.C;k++)if(world.env.river[k]===0&&d.h[k]>50){c=k;break;}const n=LW.env.cellDir(world,c);
    const bid=(await post('/api/command',{token:A.token,cmd:cmd('build.place',{template:'cottage',n})})).body.result.id,b=world.buildings[bid],cid=b.comps[0].id;
    const rs=await Promise.all([post('/api/command',{token:A.token,cmd:cmd('build.moveComp',{id:bid,cid,x:-1,z:1})}),post('/api/command',{token:B.token,cmd:cmd('build.moveComp',{id:bid,cid,x:1.5,z:-1})}),
      post('/api/command',{token:B.token,cmd:cmd('build.moveComp',{id:bid,cid,x:99,z:99})})]);
    assert(rs[0].body.ok&&rs[1].body.ok,'both valid edits accepted');assert.strictEqual(rs[2].status,409,'invalid edit rejected, not applied');
    const last=rs[0].body.revision>rs[1].body.revision?[-1,1]:[1.5,-1];assert.deepStrictEqual([b.comps[0].x,b.comps[0].z],last,'component is where the later-ordered valid edit put it');
    assert.notStrictEqual(rs[0].body.revision,rs[1].body.revision,'distinct sequential revisions');
    const dup=cmd('terrain.edit',{tool:'raise',n,r:80,s:3});const r1=await post('/api/command',{token:A.token,cmd:dup}),r2=await post('/api/command',{token:A.token,cmd:dup});
    assert(r1.body.ok&&r2.body.duplicate&&r2.body.revision===r1.body.revision,'network retry returns the stored receipt');
    assert.strictEqual((await post('/api/command',{token:Vz.token,cmd:cmd('terrain.edit',{tool:'raise',n,r:80,s:3})})).body.code,'forbidden','visitor cannot edit');
    LW.save.validate(world);
    const sync=(await get('/api/sync?token='+B.token+'&n='+n.join(',')+'&r=500')).body;assert(sync.near.buildings[bid]&&sync.events.length<=200,'bounded interest-based sync');
    const far=(await get('/api/sync?token='+B.token+'&n='+n.map(x=>-x).join(',')+'&r=500')).body;assert(!far.near.buildings[bid],'entities outside the interest region are not sent');
  });
  await test('L03','exclusive character control lease; owner controls the shared clock; lease expires on disconnect',['LW-055','LW-109','LW-153'],async()=>{
    const n=Object.values(world.buildings)[0].n,pid=(await post('/api/command',{token:A.token,cmd:cmd('life.spawn',{speciesId:'sp_human',n:LW.offsetDir(n,15,0,world.body.radius)})})).body.result.ids[0];
    assert.strictEqual((await post('/api/clock',{token:A.token,ticksPerSecond:20})).status,403);
    assert((await post('/api/command',{token:H.ownerToken,cmd:cmd('world.setMode',{mode:'play'})})).body.ok);
    assert((await post('/api/command',{token:A.token,cmd:cmd('person.control',{id:pid,on:true})})).body.ok);
    assert.strictEqual((await post('/api/command',{token:B.token,cmd:cmd('person.control',{id:pid,on:true})})).status,409,'second controller refused');
    assert.strictEqual((await post('/api/command',{token:B.token,cmd:cmd('person.enqueue',{id:pid,action:{a:'wait',n:5}})})).status,409);
    assert.strictEqual((await post('/api/clock',{token:H.ownerToken,ticksPerSecond:200})).body.speed,200);
    const t0=world.tick;await new Promise(r=>setTimeout(r,450));assert(world.tick>t0+40,'shared time advances on the host: '+(world.tick-t0));
    await post('/api/clock',{token:H.ownerToken,ticksPerSecond:0});
    clock+=6000;await get('/api/sync?token='+B.token);          // A has been silent longer than the lease
    assert.strictEqual(world.persons[pid].control.mode,'auto','expired lease returns the character to autonomy');
    assert((await post('/api/command',{token:B.token,cmd:cmd('person.control',{id:pid,on:true})})).body.ok,'another player may now take control');
    const arch=(await get('/api/snapshot?token='+B.token)).body.archive;assert.strictEqual(LW.save.parse(arch).id,world.id,'host snapshot is a portable archive');
  });
  H.close();
  const out=path.join(__dirname,'out');fs.mkdirSync(out,{recursive:true});const pass=results.filter(r=>r.status==='pass').length;
  fs.writeFileSync(path.join(out,'lan-results.json'),JSON.stringify({suite:'lan',total:results.length,pass,fail:results.length-pass,results},null,1));
  console.log('\nlan: '+pass+'/'+results.length+' passed');process.exit(pass===results.length?0:1);
})();
