// planet-geometry: canonical terrain sampling h(n) (independent of any mesh LOD), manual edit layers
// that override procedural generation, protected regeneration, sparse carve volumes (caves).
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V;
const P=LW.planet={};
const BK=12;                      // edit-index buckets per cube-face edge
const BUCKET_RAD=0.115;           // angular half-diagonal of a bucket (rad, generous)

function genOf(c,gen){
  const key=JSON.stringify(gen);c.gens=c.gens||{};
  let g=c.gens[key];
  if(!g){
    const s=gen.seed>>>0;
    g=c.gens[key]={p:gen,noise:LW.makeNoise(s),ox:LW.hrand(s,1,0,0)*64,oy:LW.hrand(s,2,0,0)*64,oz:LW.hrand(s,3,0,0)*64,bias:(0.5-gen.landFraction)*1.25,amp:0};
  }
  return g;
}
P.amplitude=body=>Math.min(body.radius*0.04,8000)*body.gen.relief;
// procedural base height in metres relative to the datum radius
function base(g,amp,x,y,z){
  const p=g.p,no=g.noise,cs=p.continentScale;
  let px=x*cs+g.ox,py=y*cs+g.oy,pz=z*cs+g.oz;
  px+=0.45*no(px*1.7+5.2,py*1.7,pz*1.7);py+=0.45*no(px*1.7,py*1.7+9.1,pz*1.7);pz+=0.45*no(px*1.7,py*1.7,pz*1.7+3.3);
  let c=0,a=1,f=1,nm=0;
  for(let i=0;i<5;i++){c+=a*no(px*f,py*f,pz*f);nm+=a;a*=0.5;f*=2.03;}
  const cont=c/nm*2.4-g.bias;
  let h;
  if(cont>0){
    let r=0;a=1;f=3.1;nm=0;
    for(let i=0;i<4;i++){const v=1-Math.abs(no(px*f+17,py*f,pz*f));r+=a*v*v;nm+=a;a*=0.5;f*=2.1;}
    r/=nm;
    h=amp*(cont*0.42+LW.smooth(0.04,0.5,cont)*p.ridges*r*r*1.5);
  }else h=amp*cont*0.9;
  let da=amp*0.07*p.roughness*(cont>0?1:0.45),df=14;
  while(da>0.12){h+=da*no(x*df+g.ox,y*df+g.oy,z*df+g.oz);da*=0.5;df*=2.07;}
  if(p.terrace>0){const st=amp*0.09,q=Math.round(h/st)*st,d=(h-q)/st;h=LW.lerp(h,q+st*d*d*d*4,p.terrace);}
  return h;
}
function bucketOf(n){const fuv=LW.dirFace(n);
  return fuv[0]*BK*BK+Math.min(BK-1,Math.floor((fuv[2]+1)*0.5*BK))*BK+Math.min(BK-1,Math.floor((fuv[1]+1)*0.5*BK));}
function index(world,c){
  if(c.editIdx&&c.editIdxCount===world.terrainEdits.length&&c.editIdxSeq===world.editSeq)return c.editIdx;
  let idx=c.editIdx,from=0;
  if(!idx||c.editIdxSeq!==world.editSeq-(world.terrainEdits.length-c.editIdxCount)||world.terrainEdits.length<c.editIdxCount){
    idx=c.editIdx={b:new Array(6*BK*BK).fill(null),centers:c.bucketCenters};
    if(!idx.centers){
      idx.centers=c.bucketCenters=[];
      for(let f=0;f<6;f++)for(let j=0;j<BK;j++)for(let i=0;i<BK;i++)idx.centers.push(LW.faceDir(f,(i+0.5)/BK*2-1,(j+0.5)/BK*2-1));
    }
  }else from=c.editIdxCount;
  const R=world.body.radius;
  for(let k=from;k<world.terrainEdits.length;k++){
    const e=world.terrainEdits[k],lim=2*Math.sin(Math.min(Math.PI,(e.r*1.5/R+BUCKET_RAD))/2),l2=lim*lim;
    for(let b=0;b<idx.centers.length;b++){
      const cc=idx.centers[b],dx=cc[0]-e.n[0],dy=cc[1]-e.n[1],dz=cc[2]-e.n[2];
      if(dx*dx+dy*dy+dz*dz<=l2)(idx.b[b]||(idx.b[b]=[])).push(e);
    }
  }
  c.editIdxCount=world.terrainEdits.length;c.editIdxSeq=world.editSeq;
  return idx;
}
P.invalidate=function(world){const c=LW.cache(world);c.editIdx=null;c.volGrids={};c.terrainRev=(c.terrainRev||0)+1;};
P.terrainRev=world=>(LW.cache(world).terrainRev||0)+world.editSeq*1000+world.genEpoch;

function applyEdit(e,n,h,R,sea){
  const dx=n[0]-e.n[0],dy=n[1]-e.n[1],dz=n[2]-e.n[2],d2=(dx*dx+dy*dy+dz*dz)*R*R;
  if(d2>=e.r*e.r)return h;
  const t=1-Math.sqrt(d2)/e.r,f=t*t*(3-2*t);
  switch(e.tool){
    case 'raise':return h+e.s*f;
    case 'lower':return h-e.s*f;
    case 'flatten':return h+(e.level-h)*Math.min(1,f*1.6);
    case 'smooth':return h+(e.level-h)*f*0.55;
    case 'mountain':{const q=R/e.r*2.2,rd=1-Math.abs(LW.sharedNoise(n[0]*q,n[1]*q,n[2]*q));return h+e.s*f*(0.45+rd*rd*1.1);}
    case 'valley':return h-e.s*Math.pow(f,0.7);
    case 'water':return h-e.s*f;
    case 'shore':return h+((sea+e.level)-h)*Math.min(1,f*1.4);
    default:return h;
  }
}
// THE canonical terrain function. Every mesh LOD, every simulation system and every raycast samples this.
P.height=function(world,n){
  const c=LW.cache(world),body=world.body,R=body.radius,amp=P.amplitude(body);
  let h=base(genOf(c,body.gen),amp,n[0],n[1],n[2]);
  if(!world.terrainEdits.length)return h;
  const b=index(world,c).b[bucketOf(n)];
  if(!b)return h;
  if(world.genEpoch>0){
    // manual edits protect their surroundings from regeneration: blend back to the generator they were made on
    let ws=null;
    for(let i=0;i<b.length;i++){const e=b[i];if(e.g>=world.genEpoch||e.tool==='biome')continue;
      const d=V.dist(n,e.n)*R;if(d<e.r*1.5){const w=LW.smooth(1.5,1.0,d/e.r);ws=ws||[];if(!(ws[e.g]>=w))ws[e.g]=w;}}
    if(ws)for(let g=0;g<ws.length;g++)if(ws[g]>0)h=LW.lerp(h,base(genOf(c,world.protectedGens[g]),Math.min(R*0.04,8000)*world.protectedGens[g].relief,n[0],n[1],n[2]),ws[g]);
  }
  for(let i=0;i<b.length;i++)h=applyEdit(b[i],n,h,R,body.seaLevel);
  return h;
};
P.baseHeight=function(world,n){const c=LW.cache(world);return base(genOf(c,world.body.gen),P.amplitude(world.body),n[0],n[1],n[2]);};
// local water surface level (sea or painted lake) at n
P.waterLevel=function(world,n){
  let lv=world.body.seaLevel;
  if(!world.terrainEdits.length)return lv;
  const b=index(world,LW.cache(world)).b[bucketOf(n)];
  if(b)for(let i=0;i<b.length;i++){const e=b[i];if(e.tool==='water'&&e.level>lv&&V.dist(n,e.n)*world.body.radius<e.r*0.92)lv=e.level;}
  return lv;
};
P.paintedBiome=function(world,n){
  if(!world.terrainEdits.length)return -1;
  const b=index(world,LW.cache(world)).b[bucketOf(n)];let r=-1;
  if(b)for(let i=0;i<b.length;i++){const e=b[i];if(e.tool==='biome'&&V.dist(n,e.n)*world.body.radius<e.r)r=e.biome;}
  return r;
};
P.editsNear=function(world,n){const b=world.terrainEdits.length?index(world,LW.cache(world)).b[bucketOf(n)]:null;return b||[];};
P.surface=function(world,n,lift){const r=world.body.radius+P.height(world,n)+(lift||0);return [n[0]*r,n[1]*r,n[2]*r];};

// ---- terrain edit commands -------------------------------------------------
const TOOLS={raise:1,lower:1,flatten:1,smooth:1,mountain:1,valley:1,water:1,shore:1,biome:1};
P.TOOLS=Object.keys(TOOLS);
function witness(world,n,r,evId,what){
  // people who can see a sudden reshaping of the land remember it (evidence, not omniscience)
  for(const id in world.persons){const p=world.persons[id];if(!p.alive)continue;
    const d=LW.arcDist(p.n,n,world.body.radius);
    if(d<r+((world.species[p.speciesId].senses||{}).sight||120))LW.mind.witness(world,p,what,evId);}
}
LW.def('terrain.edit',{perm:'edit',
  validate(w,p){
    if(!TOOLS[p.tool])return 'unknown tool';
    if(!LW.isDir(p.n))return 'n must be a unit direction';
    if(!(typeof p.r==='number'&&p.r>=0.5&&p.r<=w.body.radius*1.6))return 'radius out of range';
    if(p.tool==='biome'){if(!Number.isInteger(p.biome)||p.biome<1||p.biome>=LW.BIOMES.length)return 'bad biome';}
    else if(!(typeof p.s==='number'&&isFinite(p.s)&&Math.abs(p.s)<=30000))return 'strength out of range';
    if(w.terrainEdits.length>=20000)return 'edit layer is full (20000 strokes); merge by exporting a new world';
    return null;},
  apply(w,p){
    const e={id:LW.newId(w,'te'),seq:++w.editSeq,g:w.genEpoch,gid:p.gid||null,tool:p.tool,n:p.n.slice(),r:p.r,s:p.s||0};
    if(p.tool==='biome')e.biome=p.biome;
    if(p.tool==='flatten'||p.tool==='smooth')e.level=typeof p.level==='number'?p.level:P.height(w,p.n);
    if(p.tool==='shore')e.level=typeof p.level==='number'?p.level:-1.5;
    if(p.tool==='water')e.level=typeof p.level==='number'?p.level:P.height(w,p.n)-Math.min(0.6,e.s*0.15);
    w.terrainEdits.push(e);
    const ev=LW.emit(w,'terrain.edited',{tool:e.tool,r:e.r,edit:e.id},[],{n:e.n});
    e.ev=ev;
    LW.env.markDirty(w,e.n,e.r,ev);
    if(e.tool==='biome')w.colorEpoch++;
    witness(w,e.n,e.r,ev,'the land changed shape before my eyes');
    return {public:{editId:e.id,event:ev},undo:{type:'terrain.removeGroup',payload:{gid:e.gid||e.id}},gid:e.gid||e.id,label:'Terrain: '+e.tool};}});
LW.def('terrain.removeGroup',{perm:'edit',
  validate:(w,p)=>w.terrainEdits.some(e=>(e.gid||e.id)===p.gid)?null:'no such edit group',
  apply(w,p){
    const gone=w.terrainEdits.filter(e=>(e.gid||e.id)===p.gid);
    w.terrainEdits=w.terrainEdits.filter(e=>(e.gid||e.id)!==p.gid);w.editSeq++;
    const ev=LW.emit(w,'terrain.editRemoved',{count:gone.length});
    P.invalidate(w);
    for(const e of gone)LW.env.markDirty(w,e.n,e.r,ev);
    w.colorEpoch++;
    return {undo:{type:'terrain.restore',payload:{edits:gone}},label:'Terrain edit'};}});
LW.def('terrain.restore',{perm:'edit',
  validate:(w,p)=>Array.isArray(p.edits)&&p.edits.length&&p.edits.every(e=>e&&TOOLS[e.tool]&&LW.isDir(e.n)&&typeof e.r==='number')?null:'bad edits',
  apply(w,p){
    const ev=LW.emit(w,'terrain.edited',{restored:p.edits.length});
    for(const e of p.edits){const c=LW.clone(e);c.seq=++w.editSeq;c.g=Math.min(c.g||0,w.genEpoch);w.terrainEdits.push(c);LW.env.markDirty(w,c.n,c.r,ev);}
    P.invalidate(w);w.colorEpoch++;
    const gid=p.edits[0].gid||p.edits[0].id;
    return {undo:{type:'terrain.removeGroup',payload:{gid}},label:'Terrain edit'};}});

// ---- sparse volumetric subsurface -------------------------------------------
// A volume is a local voxel lattice anchored at a canonical direction. It stores only carve/fill
// operations; solidity = (below canonical terrain surface) AND NOT carved. Its top therefore IS the
// terrain surface, so entrances are real openings in the same coordinate frame.
const VOL=LW.volumes={};
VOL.local=function(world,v,n){   // canonical direction -> local metres (x east', z north') in the volume frame
  const f=LW.frame(v.n),R=world.body.radius,k=1/V.dot(n,v.n);
  const dx=(n[0]*k-v.n[0])*R,dy=(n[1]*k-v.n[1])*R,dz=(n[2]*k-v.n[2])*R;
  const e=dx*f.e[0]+dy*f.e[1]+dz*f.e[2],t=dx*f.t[0]+dy*f.t[1]+dz*f.t[2],cs=Math.cos(v.yaw||0),sn=Math.sin(v.yaw||0);
  return [e*cs+t*sn,-e*sn+t*cs];
};
VOL.dir=function(world,v,x,z){
  const cs=Math.cos(v.yaw||0),sn=Math.sin(v.yaw||0);
  return LW.offsetDir(v.n,x*cs-z*sn,x*sn+z*cs,world.body.radius);
};
VOL.contains=function(world,v,n){
  if(V.dot(n,v.n)<0.5)return null;
  const l=VOL.local(world,v,n),hx=v.nx*v.cell/2,hz=v.nz*v.cell/2;
  return Math.abs(l[0])<hx&&Math.abs(l[1])<hz?l:null;
};
VOL.at=function(world,n){
  for(const id in world.volumes){const v=world.volumes[id],l=VOL.contains(world,v,n);if(l)return {v,x:l[0],z:l[1]};}
  return null;
};
// derived voxel grid: solid[] plus per-column terrain heights. y index 0 is the deepest layer.
VOL.grid=function(world,v){
  const c=LW.cache(world);c.volGrids=c.volGrids||{};
  const rev=P.terrainRev(world)+'|'+v.ops.length;
  let g=c.volGrids[v.id];
  if(g&&g.rev===rev)return g;
  const nx=v.nx,ny=v.ny,nz=v.nz,cs=v.cell,solid=new Uint8Array(nx*ny*nz),colH=new Float32Array(nx*nz);
  const yTop=v.h0+v.top*cs,y0=yTop-ny*cs;       // absolute altitudes (m above datum)
  for(let k=0;k<nz;k++)for(let i=0;i<nx;i++){
    const h=P.height(world,VOL.dir(world,v,(i+0.5-nx/2)*cs,(k+0.5-nz/2)*cs));colH[k*nx+i]=h;
    for(let j=0;j<ny;j++)if(y0+(j+0.5)*cs<h)solid[(j*nz+k)*nx+i]=1;
  }
  for(const op of v.ops){
    const r=op.r,i0=Math.max(0,Math.floor((op.x-r)/cs+nx/2)),i1=Math.min(nx-1,Math.floor((op.x+r)/cs+nx/2));
    const k0=Math.max(0,Math.floor((op.z-r)/cs+nz/2)),k1=Math.min(nz-1,Math.floor((op.z+r)/cs+nz/2));
    const j0=Math.max(0,Math.floor((op.y-r-y0)/cs)),j1=Math.min(ny-1,Math.floor((op.y+r-y0)/cs));
    for(let j=j0;j<=j1;j++)for(let k=k0;k<=k1;k++)for(let i=i0;i<=i1;i++){
      const x=(i+0.5-nx/2)*cs,y=y0+(j+0.5)*cs,z=(k+0.5-nz/2)*cs;
      if((x-op.x)**2+(y-op.y)**2+(z-op.z)**2<r*r)solid[(j*nz+k)*nx+i]=op.t==='f'?1:0;
    }
  }
  g=c.volGrids[v.id]={rev,solid,colH,y0,yTop,nx,ny,nz,cs};
  return g;
};
// walkable ground altitude at local (x,z) for a body currently at altitude yFrom; null = bottomless/outside
VOL.groundY=function(world,v,x,z,yFrom){
  const g=VOL.grid(world,v),i=Math.floor(x/g.cs+g.nx/2),k=Math.floor(z/g.cs+g.nz/2);
  if(i<0||k<0||i>=g.nx||k>=g.nz)return null;
  let j=Math.min(g.ny-1,Math.floor((yFrom-g.y0)/g.cs));
  if(j<0)return g.y0;
  for(;j>=0;j--)if(g.solid[(j*g.nz+k)*g.nx+i])return VOL.topY(g,i,j,k);
  return g.y0;
};
// top altitude of a solid voxel: the true terrain height where the voxel is the natural surface
VOL.topY=function(g,i,j,k){const top=g.y0+(j+1)*g.cs,h=g.colH[k*g.nx+i];return Math.abs(h-top)<=g.cs*0.5+1e-6?h:top;};
VOL.isOpen=function(world,v,x,y,z){   // true if the point is in carved/open space
  const g=VOL.grid(world,v),i=Math.floor(x/g.cs+g.nx/2),k=Math.floor(z/g.cs+g.nz/2),j=Math.floor((y-g.y0)/g.cs);
  if(i<0||k<0||i>=g.nx||k>=g.nz||j<0)return false;
  if(j>=g.ny)return true;
  return !g.solid[(j*g.nz+k)*g.nx+i];
};
LW.def('volume.create',{perm:'edit',
  validate(w,p){
    if(!LW.isDir(p.n))return 'bad n';
    if(Object.keys(w.volumes).length>=24)return 'volume limit reached (24 active volumes)';
    for(const id in w.volumes)if(LW.arcDist(w.volumes[id].n,p.n,w.body.radius)<70)return 'too close to another dig site';
    return null;},
  apply(w,p){
    const v={id:LW.newId(w,'vol'),n:p.n.slice(),yaw:p.yaw||0,nx:32,ny:22,nz:32,cell:1.5,top:5,h0:P.height(w,p.n),ops:[]};
    w.volumes[v.id]=v;
    const ev=LW.emit(w,'volume.created',{id:v.id},[],{n:v.n});
    return {public:{id:v.id,event:ev},undo:{type:'volume.remove',payload:{id:v.id}},label:'Dig site'};}});
LW.def('volume.remove',{perm:'edit',validate:(w,p)=>w.volumes[p.id]?null:'no such volume',
  apply(w,p){const v=w.volumes[p.id];delete w.volumes[p.id];LW.emit(w,'volume.removed',{id:p.id});
    return {undo:{type:'volume.restore',payload:{v}},label:'Dig site'};}});
LW.def('volume.restore',{perm:'edit',validate:(w,p)=>p.v&&typeof p.v.id==='string'&&!w.volumes[p.v.id]&&LW.isDir(p.v.n)&&Array.isArray(p.v.ops)?null:'bad volume',
  apply(w,p){w.volumes[p.v.id]=LW.clone(p.v);return {undo:{type:'volume.remove',payload:{id:p.v.id}},label:'Dig site'};}});
// carve (t:'c') or fill (t:'f') a sphere; coordinates are local metres, y is absolute altitude above datum
LW.def('volume.carve',{perm:'edit',
  validate(w,p){const v=w.volumes[p.id];if(!v)return 'no such volume';
    if(![p.x,p.y,p.z,p.r].every(x=>typeof x==='number'&&isFinite(x)))return 'bad coordinates';
    if(p.r<0.5||p.r>12)return 'radius 0.5..12 m';
    if(Math.abs(p.x)>v.nx*v.cell/2+p.r||Math.abs(p.z)>v.nz*v.cell/2+p.r)return 'outside the dig site';
    if(v.ops.length>=4000)return 'dig site operation limit reached';
    return null;},
  apply(w,p){const v=w.volumes[p.id];v.ops.push({t:p.fill?'f':'c',x:p.x,y:p.y,z:p.z,r:p.r,gid:p.gid||null});
    const ev=LW.emit(w,'volume.carved',{id:v.id,fill:!!p.fill},[],{n:v.n});
    witness(w,v.n,30,ev,'the ground opened by itself');
    return {public:{event:ev,ops:v.ops.length},undo:{type:'volume.truncate',payload:{id:v.id,gid:p.gid||null,len:v.ops.length-1}},gid:p.gid?'v'+p.gid:null,label:'Carve'};}});
LW.def('volume.truncate',{perm:'edit',validate:(w,p)=>w.volumes[p.id]&&Number.isInteger(p.len)&&p.len>=0?null:'bad truncate',
  apply(w,p){const v=w.volumes[p.id];let len=p.len;
    if(p.gid){len=v.ops.length;while(len>0&&v.ops[len-1].gid===p.gid)len--;}
    const cut=v.ops.splice(len);
    return {undo:{type:'volume.append',payload:{id:v.id,ops:cut}},label:'Carve'};}});
LW.def('volume.append',{perm:'edit',validate:(w,p)=>w.volumes[p.id]&&Array.isArray(p.ops)?null:'bad append',
  apply(w,p){const v=w.volumes[p.id],len=v.ops.length;for(const o of p.ops)v.ops.push(LW.clone(o));
    return {undo:{type:'volume.truncate',payload:{id:v.id,len}},label:'Carve'};}});

// altitude (m above datum) an entity stands at. Buildings and volumes are resolved in the same frame.
LW.groundAt=function(world,n,ent){
  const loc=LW.build.locate(world,n);
  if(loc)return LW.build.floorY(world,loc.b);
  const vl=VOL.at(world,n);
  if(vl){const yFrom=(ent&&typeof ent.y==='number')?ent.y+1.6:1e9;const g=VOL.groundY(world,vl.v,vl.x,vl.z,yFrom);if(g!==null)return g;}
  return P.height(world,n);
};
})();
