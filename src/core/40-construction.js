// construction: persistent buildings anchored in planetary coordinates, rooms, doors, functional
// components (capabilities, occupancy, stock), room-graph navigation, terrain following.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V,VOL=LW.volumes;
const B=LW.build={};

LW.COMPONENTS={
  bed:{name:'Bed',caps:['sleep'],w:1.1,d:2.0},
  table:{name:'Table',caps:['eat'],w:1.4,d:0.9},
  chair:{name:'Chair',caps:['sit'],w:0.5,d:0.5},
  stove:{name:'Hearth',caps:['cook'],w:0.9,d:0.7},
  chest:{name:'Storage chest',caps:['store'],w:0.9,d:0.5},
  workbench:{name:'Workbench',caps:['work'],w:1.6,d:0.7},
  shelf:{name:'Study shelf',caps:['study'],w:1.2,d:0.4},
  lamp:{name:'Lamp',caps:['light'],w:0.3,d:0.3},
  well:{name:'Well',caps:['drink'],w:1.4,d:1.4,outdoor:true}};
B.TEMPLATES={
  cottage:{name:'Cottage',kind:'house',cost:{wood:14},rooms:[{x:-3,z:-2.5,w:6,d:5,name:'Room'}],doors:[{x:0,z:-2.5,a:0,b:-1}],
    comps:[['bed',-2.2,1.2,0],['table',1.3,0.9,0],['chair',1.3,-0.1,0],['chest',2.4,-2.0,0],['stove',-2.3,-1.9,0]]},
  house:{name:'Two-room house',kind:'house',cost:{wood:24},rooms:[{x:-4.5,z:-2.5,w:5,d:5,name:'Living room'},{x:0.5,z:-2.5,w:4,d:5,name:'Bedroom'}],
    doors:[{x:-2,z:-2.5,a:0,b:-1},{x:0.5,z:0.4,a:0,b:1}],
    comps:[['table',-2.2,0.6,0],['chair',-2.2,-0.4,0],['stove',-3.8,1.8,0],['chest',-0.3,-2.0,0],['shelf',-3.9,-1.6,1.57],['bed',2.6,1.2,0],['bed',3.8,1.2,0],['lamp',1.0,-2.0,0]]},
  workshop:{name:'Workshop',kind:'workshop',cost:{wood:16},rooms:[{x:-3,z:-2,w:6,d:4,name:'Workshop'}],doors:[{x:0,z:-2,a:0,b:-1}],
    comps:[['workbench',-1.5,1.2,0],['shelf',2.2,1.4,0],['chest',2.3,-1.4,0]]},
  storehouse:{name:'Storehouse',kind:'storehouse',cost:{wood:12},rooms:[{x:-2.5,z:-2,w:5,d:4,name:'Store'}],doors:[{x:0,z:-2,a:0,b:-1}],
    comps:[['chest',-1.6,1.3,0],['chest',0,1.3,0],['chest',1.6,1.3,0]]},
  well:{name:'Well',kind:'well',cost:{stone:6},rooms:[],doors:[],comps:[['well',0,0,0]],rad:1.5},
  field:{name:'Field',kind:'field',cost:{},rooms:[],doors:[],comps:[],rad:6}};
B.radius=function(b){
  let r=b.rad||2;for(const m of b.rooms)r=Math.max(r,Math.hypot(Math.max(Math.abs(m.x),Math.abs(m.x+m.w)),Math.max(Math.abs(m.z),Math.abs(m.z+m.d))));
  return r;
};
B.local=(world,b,n)=>VOL.local(world,b,n);
B.dir=(world,b,x,z)=>VOL.dir(world,b,x,z);
B.floorY=(world,b)=>LW.planet.height(world,b.n)+0.25;     // derived every time: structures follow sculpted terrain
B.roomAt=function(b,x,z){for(let i=0;i<b.rooms.length;i++){const m=b.rooms[i];if(x>m.x&&x<m.x+m.w&&z>m.z&&z<m.z+m.d)return i;}return -1;};
B.locate=function(world,n){
  const R=world.body.radius;
  for(const id in world.buildings){
    const b=world.buildings[id];if(!b.rooms.length||b.progress<1)continue;
    if(V.dist(n,b.n)*R>B.radius(b)+1)continue;
    const l=B.local(world,b,n),r=B.roomAt(b,l[0],l[1]);
    if(r>=0)return {b,room:r,x:l[0],z:l[1]};
  }
  return null;
};
B.comp=(b,cid)=>b.comps.find(c=>c.id===cid);
B.findCap=function(b,cap,pid){
  for(const c of b.comps)if(LW.COMPONENTS[c.kind].caps.indexOf(cap)>=0&&(!c.by||c.by===pid))return c;
  return null;
};
// where a body stands to use a component
B.usePoint=function(world,b,c){
  const r=B.roomAt(b,c.x,c.z);
  if(r<0)return B.dir(world,b,c.x,c.z-1.3);
  const m=b.rooms[r],cx=m.x+m.w/2-c.x,cz=m.z+m.d/2-c.z,l=Math.hypot(cx,cz)||1,k=Math.min(l,LW.COMPONENTS[c.kind].d/2+0.45);
  return B.dir(world,b,c.x+cx/l*k,c.z+cz/l*k);
};
function doorNormal(b,d){
  const m=b.rooms[d.a];
  return (Math.abs(d.x-m.x)<0.06||Math.abs(d.x-(m.x+m.w))<0.06)?[1,0]:[0,1];
}
function doorPts(world,b,d,fromRoom){
  const nn=doorNormal(b,d),p1=[d.x+nn[0]*0.75,d.z+nn[1]*0.75],p2=[d.x-nn[0]*0.75,d.z-nn[1]*0.75];
  const in1=B.roomAt(b,p1[0],p1[1]);
  const firstIs1=fromRoom>=0?in1===fromRoom:in1<0;
  const a=firstIs1?p1:p2,c=firstIs1?p2:p1;
  return [B.dir(world,b,a[0],a[1]),B.dir(world,b,c[0],c[1])];
}
function roomPath(world,b,from,to){     // BFS over the room graph; -1 = outdoors
  const prev={},q=[from];prev[from]=null;
  while(q.length){const r=q.shift();if(r===to)break;
    for(const d of b.doors){const o=d.a===r?d.b:d.b===r?d.a:undefined;if(o===undefined||o in prev)continue;prev[o]={r,d};q.push(o);}}
  if(!(to in prev))return null;
  const seq=[];for(let r=to;prev[r];r=prev[r].r)seq.unshift(prev[r]);
  let pts=[];for(const s of seq)pts=pts.concat(doorPts(world,b,s.d,s.r));
  return pts;
}
LW.nav={};
// waypoints (canonical directions) from a to b through real doors; null if no route
const obstacle=o=>o.kind!=='field'&&(o.rooms.length||o.rad);
const passable=(world,n,sp)=>!sp||LW.life.canEnter(world,n,sp);
// is the straight walk a->b free of water (for this species)?
function clearOfWater(world,a,b,sp){
  if(!sp||sp.move.swim||sp.move.fly)return true;
  const L=LW.arcDist(a,b,world.body.radius),n=Math.min(160,Math.ceil(L/4));
  for(let k=1;k<n;k++)if(!LW.life.canEnter(world,V.norm(V.lerp(a,b,k/n)),sp))return false;
  return true;
}
// steer round building footprints: detour to the nearer side of the first structure the segment would cross
function around(world,a,b,depth){
  const R=world.body.radius,f=LW.frame(a),to2=n=>[V.dot(V.sub(n,a),f.e)*R,V.dot(V.sub(n,a),f.t)*R],B2=to2(b),L=Math.hypot(B2[0],B2[1]);
  if(L<1||depth>7)return [b];
  let hit=null;
  for(const id in world.buildings){const o=world.buildings[id];if(!obstacle(o))continue;
    const r=B.radius(o)+0.9,c=to2(o.n);if(Math.hypot(c[0],c[1])<r||Math.hypot(c[0]-B2[0],c[1]-B2[1])<r)continue;     // an endpoint at its door: not an obstacle for this leg
    const t=(c[0]*B2[0]+c[1]*B2[1])/(L*L);if(t<=0||t>=1)continue;
    const dx=c[0]-B2[0]*t,dz=c[1]-B2[1]*t;if(Math.hypot(dx,dz)<r&&(!hit||t<hit.t))hit={c,r,t,dx,dz};}
  if(!hit)return [b];
  const px=-B2[1]/L,pz=B2[0]/L,side=(hit.dx*px+hit.dz*pz)>0?-1:1,wp=LW.offsetDir(a,hit.c[0]+px*side*(hit.r+1.1),hit.c[1]+pz*side*(hit.r+1.1),R);
  return around(world,a,wp,depth+1).concat(around(world,wp,b,depth+1));
}
// A* over a local grid when water (or anything impassable) lies on the straight line
function gridPath(world,a,b,sp){
  const R=world.body.radius,L=LW.arcDist(a,b,R);if(L>900)return null;
  const N=48,cell=LW.clamp(L/22,3,20),mid=V.norm(V.lerp(a,b,0.5)),f=LW.frame(mid),half=N/2;
  const to2=n=>[V.dot(V.sub(n,mid),f.e)*R,V.dot(V.sub(n,mid),f.t)*R],dirOf=(i,k)=>LW.offsetDir(mid,(i-half+0.5)*cell,(k-half+0.5)*cell,R);
  const ix=p=>[LW.clamp(Math.floor(p[0]/cell+half),0,N-1),LW.clamp(Math.floor(p[1]/cell+half),0,N-1)],s=ix(to2(a)),g=ix(to2(b));
  const obs=[];for(const id in world.buildings){const o=world.buildings[id];if(obstacle(o))obs.push([to2(o.n),B.radius(o)+0.6]);}
  const pass=new Int8Array(N*N),ok=(i,k)=>{const q=k*N+i;if(pass[q])return pass[q]>0;
    if((i===s[0]&&k===s[1])||(i===g[0]&&k===g[1])){pass[q]=1;return true;}
    const x=(i-half+0.5)*cell,z=(k-half+0.5)*cell;let fine=passable(world,dirOf(i,k),sp);
    if(fine)for(const o of obs)if(Math.hypot(x-o[0][0],z-o[0][1])<o[1]){fine=false;break;}
    pass[q]=fine?1:-1;return fine;};
  const gs=new Float32Array(N*N).fill(1e9),from=new Int32Array(N*N).fill(-1),open=[s[1]*N+s[0]],closed=new Uint8Array(N*N);gs[open[0]]=0;
  const hfn=q=>Math.hypot(q%N-g[0],Math.floor(q/N)-g[1]);
  while(open.length){
    let bi=0;for(let k=1;k<open.length;k++)if(gs[open[k]]+hfn(open[k])<gs[open[bi]]+hfn(open[bi]))bi=k;
    const q=open.splice(bi,1)[0];if(closed[q])continue;closed[q]=1;
    const i=q%N,k=Math.floor(q/N);
    if(i===g[0]&&k===g[1]){const cells=[];for(let c=q;c>=0;c=from[c])cells.unshift(c);
      const out=[];for(let m=1;m<cells.length-1;m++){const p0=cells[m-1],p1=cells[m],p2=cells[m+1];if((p1-p0)!==(p2-p1))out.push(dirOf(p1%N,Math.floor(p1/N)));}   // keep only the turns
      out.push(b);return out;}
    for(let dk=-1;dk<=1;dk++)for(let di=-1;di<=1;di++){if(!di&&!dk)continue;const ni=i+di,nk=k+dk;if(ni<0||nk<0||ni>=N||nk>=N)continue;
      if(!ok(ni,nk)||(di&&dk&&(!ok(ni,k)||!ok(i,nk))))continue;const nq=nk*N+ni,c=gs[q]+(di&&dk?1.414:1);if(c<gs[nq]){gs[nq]=c;from[nq]=q;open.push(nq);}}
  }
  return null;
}
// outdoor leg a->b: straight when clear, round buildings, or routed across a local grid past water
LW.nav.outdoor=function(world,a,b,sp){
  if(!passable(world,b,sp))return null;
  if(clearOfWater(world,a,b,sp)){const p=around(world,a,b,0);let prev=a,fine=true;for(const q of p){if(!clearOfWater(world,prev,q,sp)){fine=false;break;}prev=q;}if(fine)return p;}
  return gridPath(world,a,b,sp);
};
// waypoints (canonical directions) from a to b: through real doors indoors, round obstacles outdoors; null if no route
LW.nav.path=function(world,from,to,sp){
  const A=B.locate(world,from),Z=B.locate(world,to);
  if(A&&Z&&A.b===Z.b){if(A.room===Z.room)return [to];const p=roomPath(world,A.b,A.room,Z.room);return p?p.concat([to]):null;}
  let pts=[];
  if(A){const p=roomPath(world,A.b,A.room,-1);if(!p)return null;pts=p;}
  if(Z){const p=roomPath(world,Z.b,-1,Z.room);if(!p)return null;pts=pts.concat(p);}
  pts.push(to);
  const out=[];let prev=from;
  for(const q of pts){
    if(!B.locate(world,prev)&&!B.locate(world,q)){const leg=LW.nav.outdoor(world,prev,q,sp);if(!leg)return null;for(const x of leg)out.push(x);}
    else out.push(q);
    prev=q;
  }
  return out;
};

B.create=function(world,tpl,n,yaw,opts){
  const T=B.TEMPLATES[tpl],site=opts&&opts.site;
  const b={id:LW.newId(world,'b'),kind:T.kind,tpl,name:T.name,n:n.slice(),yaw:yaw||0,rad:T.rad||0,rooms:LW.clone(T.rooms),doors:LW.clone(T.doors),comps:[],
    progress:site?0:1,need:site?LW.clone(T.cost):{},mat:{},stock:{food:0,wood:0,stone:0,tools:0},settlement:(opts&&opts.settlement)||null,household:null,
    era:(opts&&opts.era)||0,built:world.tick,flooded:false,growth:0,by:(opts&&opts.by)||'player'};
  for(const c of T.comps)b.comps.push({id:LW.newId(world,'c'),kind:c[0],x:c[1],z:c[2],rot:c[3],by:null});
  world.buildings[b.id]=b;
  if(b.settlement&&world.settlements[b.settlement])world.settlements[b.settlement].buildings.push(b.id);
  return b;
};
function free(world,n,rad,ignore){
  if(LW.planet.height(world,n)<LW.planet.waterLevel(world,n))return 'cannot build under water';
  for(const id in world.buildings){if(id===ignore)continue;const o=world.buildings[id];
    if(LW.arcDist(o.n,n,world.body.radius)<B.radius(o)+rad+0.5)return 'overlaps '+o.name;}
  return null;
}
B.free=free;
LW.def('build.place',{perm:'edit',
  validate(w,p){const T=B.TEMPLATES[p.template];if(!T)return 'unknown template';if(!LW.isDir(p.n))return 'bad n';
    if(Object.keys(w.buildings).length>=600)return 'building limit reached';
    return free(w,p.n,B.radius({rooms:T.rooms,rad:T.rad||0}));},
  apply(w,p){
    const near=LW.society.nearestSettlement(w,p.n,260);
    const b=B.create(w,p.template,p.n,p.yaw||0,{site:!!p.site,settlement:near?near.id:null,era:near?near.era:0});
    const ev=LW.emit(w,p.site?'building.planned':'building.completed',{id:b.id,kind:b.kind,by:'player'},[],{n:b.n,e:[b.id]});
    for(const id in w.persons){const q=w.persons[id];if(q.alive&&LW.arcDist(q.n,b.n,w.body.radius)<120)LW.mind.witness(w,q,'a '+b.name.toLowerCase()+' appeared from nothing',ev);}
    return {public:{id:b.id,event:ev},undo:{type:'build.remove',payload:{id:b.id}},label:'Place '+b.name};}});
LW.def('build.remove',{perm:'edit',validate:(w,p)=>w.buildings[p.id]?null:'no such building',
  apply(w,p){
    const b=w.buildings[p.id];delete w.buildings[p.id];
    const s=w.settlements[b.settlement];if(s)s.buildings=s.buildings.filter(x=>x!==b.id);
    for(const id in w.persons){const q=w.persons[id];if(q.home===b.id)q.home=null;if(q.act&&q.act.b===b.id)LW.mind.interrupt(w,q,'missing');}
    for(const id in w.households)if(w.households[id].home===b.id)w.households[id].home=null;
    LW.emit(w,'building.removed',{id:b.id},[],{n:b.n});
    return {undo:{type:'build.restore',payload:{b}},label:'Remove '+b.name};}});
LW.def('build.restore',{perm:'edit',validate:(w,p)=>p.b&&typeof p.b.id==='string'&&!w.buildings[p.b.id]&&LW.isDir(p.b.n)&&Array.isArray(p.b.rooms)?null:'bad building',
  apply(w,p){const b=LW.clone(p.b);for(const c of b.comps)c.by=null;w.buildings[b.id]=b;const s=w.settlements[b.settlement];if(s)s.buildings.push(b.id);
    return {undo:{type:'build.remove',payload:{id:b.id}},label:'Restore '+b.name};}});
LW.def('build.move',{perm:'edit',
  validate(w,p){const b=w.buildings[p.id];if(!b)return 'no such building';if(!LW.isDir(p.n))return 'bad n';return free(w,p.n,B.radius(b),b.id);},
  apply(w,p){const b=w.buildings[p.id],old={id:b.id,n:b.n.slice(),yaw:b.yaw};
    // occupants are carried with the structure (same local coordinates)
    const occ=[];for(const id in w.persons){const q=w.persons[id],l=B.locate(w,q.n);if(l&&l.b===b)occ.push([q,l.x,l.z]);}
    b.n=p.n.slice();if(typeof p.yaw==='number')b.yaw=p.yaw;
    for(const o of occ){o[0].n=B.dir(w,b,o[1],o[2]);if(o[0].act)o[0].act.path=null;}
    return {undo:{type:'build.move',payload:old},label:'Move '+b.name,gid:p.gid};}});
LW.def('build.addComp',{perm:'edit',
  validate(w,p){const b=w.buildings[p.id];if(!b)return 'no such building';if(!LW.COMPONENTS[p.kind])return 'unknown component';
    if(typeof p.x!=='number'||typeof p.z!=='number')return 'bad position';
    if(b.rooms.length&&B.roomAt(b,p.x,p.z)<0&&!LW.COMPONENTS[p.kind].outdoor)return 'place furniture inside a room';
    if(b.comps.length>=60)return 'too many objects in this building';return null;},
  apply(w,p){const b=w.buildings[p.id],c={id:LW.newId(w,'c'),kind:p.kind,x:p.x,z:p.z,rot:p.rot||0,by:null};b.comps.push(c);
    LW.emit(w,'component.added',{b:b.id,kind:c.kind},[],{e:[b.id]});
    return {public:{id:c.id},undo:{type:'build.removeComp',payload:{id:b.id,cid:c.id}},label:'Add '+LW.COMPONENTS[c.kind].name};}});
LW.def('build.removeComp',{perm:'edit',validate:(w,p)=>w.buildings[p.id]&&B.comp(w.buildings[p.id],p.cid)?null:'no such component',
  apply(w,p){const b=w.buildings[p.id],c=B.comp(b,p.cid);b.comps=b.comps.filter(x=>x!==c);
    if(c.by&&w.persons[c.by])LW.mind.interrupt(w,w.persons[c.by],'missing');
    return {undo:{type:'build.restoreComp',payload:{id:b.id,c}},label:'Remove '+LW.COMPONENTS[c.kind].name};}});
LW.def('build.restoreComp',{perm:'edit',validate:(w,p)=>w.buildings[p.id]&&p.c&&LW.COMPONENTS[p.c.kind]&&!B.comp(w.buildings[p.id],p.c.id)?null:'bad component',
  apply(w,p){const c=LW.clone(p.c);c.by=null;w.buildings[p.id].comps.push(c);return {undo:{type:'build.removeComp',payload:{id:p.id,cid:c.id}},label:'Restore object'};}});
LW.def('build.moveComp',{perm:'edit',
  validate(w,p){const b=w.buildings[p.id];if(!b||!B.comp(b,p.cid))return 'no such component';
    if(typeof p.x!=='number'||typeof p.z!=='number')return 'bad position';
    if(b.rooms.length&&B.roomAt(b,p.x,p.z)<0)return 'keep furniture inside a room';return null;},
  apply(w,p){const c=B.comp(w.buildings[p.id],p.cid),old={id:p.id,cid:c.id,x:c.x,z:c.z,rot:c.rot};c.x=p.x;c.z=p.z;if(typeof p.rot==='number')c.rot=p.rot;
    return {undo:{type:'build.moveComp',payload:old},label:'Move object',gid:p.gid};}});
// add a room on a side of the building's bounding box, joined by a real door
LW.def('build.addRoom',{perm:'edit',
  validate(w,p){const b=w.buildings[p.id];if(!b||!b.rooms.length)return 'no such house';if(['e','w','n'].indexOf(p.side)<0)return 'side must be e, w or n';
    if(b.rooms.length>=8)return 'room limit reached';return null;},
  apply(w,p){
    const b=w.buildings[p.id];let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
    for(const m of b.rooms){x0=Math.min(x0,m.x);x1=Math.max(x1,m.x+m.w);z0=Math.min(z0,m.z);z1=Math.max(z1,m.z+m.d);}
    let m,door;const idx=b.rooms.length;
    const adj=(x,z)=>B.roomAt(b,x,z);
    if(p.side==='e'){m={x:x1,z:z0,w:4,d:z1-z0,name:'Room '+(idx+1)};door={x:x1,z:z0+(z1-z0)*0.5,a:adj(x1-0.3,z0+(z1-z0)*0.5),b:idx};}
    else if(p.side==='w'){m={x:x0-4,z:z0,w:4,d:z1-z0,name:'Room '+(idx+1)};door={x:x0,z:z0+(z1-z0)*0.5,a:adj(x0+0.3,z0+(z1-z0)*0.5),b:idx};}
    else{m={x:x0,z:z1,w:x1-x0,d:4,name:'Room '+(idx+1)};door={x:x0+1.5,z:z1,a:adj(x0+1.5,z1-0.3),b:idx};}
    if(door.a<0)door.a=0;
    // doors are stored with a = the room whose wall carries it
    const dd={x:door.x,z:door.z,a:idx,b:door.a};
    b.rooms.push(m);b.doors.push(dd);
    LW.emit(w,'room.added',{b:b.id},[],{e:[b.id]});
    return {public:{room:idx},undo:{type:'build.popRoom',payload:{id:b.id}},label:'Add room'};}});
LW.def('build.popRoom',{perm:'edit',validate:(w,p)=>w.buildings[p.id]&&w.buildings[p.id].rooms.length>1?null:'no room to remove',
  apply(w,p){const b=w.buildings[p.id],idx=b.rooms.length-1;b.rooms.pop();b.doors=b.doors.filter(d=>d.a!==idx&&d.b!==idx);
    b.comps=b.comps.filter(c=>B.roomAt(b,c.x,c.z)>=0);
    return {label:'Remove room'};}});
})();
