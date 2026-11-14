// planet-environment: climate, hydrology abstraction (priority-flood drainage + flow accumulation),
// biome suitability (distinct from organisms actually present), vegetation succession, weather, resources.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V;
const E=LW.env={};

LW.BIOMES=[
  {id:'ocean',name:'Ocean',t:10,m:1,g:[60,90,120],fert:0},
  {id:'ice',name:'Ice',t:-18,m:0.4,g:[226,236,244],fert:0},
  {id:'tundra',name:'Tundra',t:-4,m:0.4,g:[146,142,132],fert:0.15},
  {id:'alpine',name:'Alpine rock',t:-2,m:0.35,g:[118,108,126],fert:0.05},
  {id:'desert',name:'Desert',t:26,m:0.1,g:[224,180,112],fert:0.05},
  {id:'steppe',name:'Steppe',t:14,m:0.3,g:[192,152,98],fert:0.35},
  {id:'grassland',name:'Grassland',t:14,m:0.5,g:[160,130,94],fert:0.75},
  {id:'savanna',name:'Savanna',t:25,m:0.42,g:[198,142,86],fert:0.5},
  {id:'forest',name:'Temperate forest',t:12,m:0.7,g:[134,106,86],fert:0.85},
  {id:'taiga',name:'Taiga',t:2,m:0.65,g:[122,112,102],fert:0.4},
  {id:'rainforest',name:'Rainforest',t:25,m:0.9,g:[144,90,72],fert:0.9},
  {id:'wetland',name:'Wetland',t:15,m:0.95,g:[100,98,86],fert:0.7}];
E.classify=function(temp,moist,altRel){
  if(temp<-10)return 1;if(altRel>0.74)return 3;if(temp<0)return 2;
  if(moist<0.2)return 4;if(moist<0.38)return temp>20?7:5;
  if(moist<0.6)return temp>21?7:temp<5?9:6;
  if(moist>0.88&&altRel<0.08)return 11;
  return temp>21?10:temp<6?9:8;
};

E.init=function(world){
  const N=world.body.envN,C=6*N*N;
  world.env={N,veg:new Array(C).fill(0),vsp:new Array(C).fill(0),soil:new Array(C).fill(128),plants:[],river:null,chg:{},dirty:{pending:true,causes:[]},mined:{}};
};
E.cellOf=function(world,n){const N=world.env.N,q=LW.dirFace(n);
  return q[0]*N*N+Math.min(N-1,Math.floor((q[2]+1)*0.5*N))*N+Math.min(N-1,Math.floor((q[1]+1)*0.5*N));};
E.cellDir=function(world,c){const d=E.d(world).dirs;return [d[c*3],d[c*3+1],d[c*3+2]];};
E.cellSize=world=>world.body.radius*(Math.PI/2)/world.env.N;

function sampleCell(world,d,c){
  const N=d.N,f=Math.floor(c/(N*N)),j=Math.floor(c/N)%N,i=c%N,o=0.3/N*2;
  const u=(i+0.5)/N*2-1,v=(j+0.5)/N*2-1;
  d.h[c]=(LW.planet.ground(world,LW.faceDir(f,u,v))*2+LW.planet.ground(world,LW.faceDir(f,u-o,v-o))+LW.planet.ground(world,LW.faceDir(f,u+o,v-o))+
    LW.planet.ground(world,LW.faceDir(f,u-o,v+o))+LW.planet.ground(world,LW.faceDir(f,u+o,v+o)))/6;
}
function route(world,d){
  const C=d.C,h=d.h,sea=world.body.seaLevel,filled=d.filled,to=d.to,flux=d.flux,od=d.od;
  // priority-flood from the ocean (or from the lowest cell on an ocean-less world)
  const heap=[],seen=new Uint8Array(C);
  const push=c=>{let i=heap.length;heap.push(c);while(i>0){const p=(i-1)>>1;if(filled[heap[p]]<=filled[heap[i]])break;const t=heap[p];heap[p]=heap[i];heap[i]=t;i=p;}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){let l=i*2+1,r=l+1,m=i;
    if(l<heap.length&&filled[heap[l]]<filled[heap[m]])m=l;if(r<heap.length&&filled[heap[r]]<filled[heap[m]])m=r;if(m===i)break;const t=heap[m];heap[m]=heap[i];heap[i]=t;i=m;}}return top;};
  let any=false,low=0;
  for(let c=0;c<C;c++){to[c]=-1;flux[c]=0;od[c]=255;if(h[c]<h[low])low=c;if(h[c]<sea){filled[c]=h[c];seen[c]=1;od[c]=0;any=true;}}
  if(!any){filled[low]=h[low];seen[low]=1;}
  for(let c=0;c<C;c++)if(seen[c]){let edge=false;for(let k=0;k<4;k++)if(!seen[d.nb[c*4+k]])edge=true;if(edge||!any)push(c);}
  const order=[];
  while(heap.length){const c=pop();order.push(c);
    for(let k=0;k<4;k++){const b=d.nb[c*4+k];if(seen[b])continue;seen[b]=1;filled[b]=Math.max(h[b],filled[c]+0.01);to[b]=c;od[b]=Math.min(254,od[c]+1);push(b);}}
  const dryScale=Math.PI/2/d.N/0.45,P=world.body.gen,g=d.mn;
  for(let c=0;c<C;c++){
    const x=d.dirs[c*3],y=d.dirs[c*3+1],z=d.dirs[c*3+2];
    d.moist[c]=LW.clamp(0.52+0.75*g(x*2.1+31,y*2.1,z*2.1)+0.3*g(x*5.3,y*5.3+11,z*5.3)-0.32*Math.min(1,od[c]*dryScale)+P.moisture,0,1);
  }
  // small dams: a hand-made ridge across a watercourse, standing above the upstream bed, holds the water back
  // even when it is far smaller than a hydrology cell
  const dam=d.dam||(d.dam=new Uint8Array(C));dam.fill(0);
  if(world.terrainEdits.length){const PL=LW.planet,dir=k=>[d.dirs[k*3],d.dirs[k*3+1],d.dirs[k*3+2]];
    for(let c=0;c<C;c++){if(to[c]<0||h[c]<sea)continue;const a=dir(c),b=dir(to[c]);
      if(!PL.editsNear(world,a).length&&!PL.editsNear(world,b).length)continue;
      let lo=PL.ground(world,a);        // lowest point the water has reached so far on its way down
      for(let k=1;k<=12;k++){const n=LW.V.norm(LW.V.lerp(a,b,k/12)),g=PL.ground(world,n);if(g>lo+1.2&&g-PL.baseHeight(world,n)>1.2){dam[c]=1;break;}if(g<lo)lo=g;}}}
  for(let i=order.length-1;i>=0;i--){const c=order[i];if(h[c]<sea)continue;flux[c]+=0.25+d.moist[c];if(to[c]>=0&&!dam[c])flux[to[c]]+=flux[c];}
  d.rev++;d.rivers=null;
}
// derived fields; always reflects the current canonical terrain (lazy, dirty-cell resampling)
E.d=function(world){
  const c=LW.cache(world);let d=c.env;
  if(!d){
    const N=world.env.N,C=6*N*N;
    d=c.env={N,C,dirs:new Float64Array(C*3),nb:new Int32Array(C*4),h:new Float32Array(C),filled:new Float32Array(C),to:new Int32Array(C),
      flux:new Float32Array(C),od:new Uint8Array(C),moist:new Float32Array(C),resample:null,all:true,rev:0,mn:LW.makeNoise((world.body.gen.seed^0x51ed)>>>0),thr:N*0.42,rivers:null};
    const tmp={env:{N}};
    for(let f=0;f<6;f++)for(let j=0;j<N;j++)for(let i=0;i<N;i++){
      const k=(f*N+j)*N+i,u=(i+0.5)/N*2-1,v=(j+0.5)/N*2-1,n=LW.faceDir(f,u,v),s=2/N;
      d.dirs[k*3]=n[0];d.dirs[k*3+1]=n[1];d.dirs[k*3+2]=n[2];
      d.nb[k*4]=E.cellOf(tmp,LW.faceDir(f,u-s,v));d.nb[k*4+1]=E.cellOf(tmp,LW.faceDir(f,u+s,v));
      d.nb[k*4+2]=E.cellOf(tmp,LW.faceDir(f,u,v-s));d.nb[k*4+3]=E.cellOf(tmp,LW.faceDir(f,u,v+s));
    }
  }
  if(d.all||d.resample){
    if(d.all){for(let k=0;k<d.C;k++)sampleCell(world,d,k);d.mn=LW.makeNoise((world.body.gen.seed^0x51ed)>>>0);}
    else for(const k of d.resample)sampleCell(world,d,k);
    d.all=false;d.resample=null;route(world,d);
  }else if(d.sea!==world.body.seaLevel||d.moistP!==world.body.gen.moisture)route(world,d);
  d.sea=world.body.seaLevel;d.moistP=world.body.gen.moisture;
  return d;
};
E.markDirty=function(world,n,r,ev){
  const c=LW.cache(world);
  if(c.env&&!c.env.all){
    const d=c.env,lim=(r+E.cellSize(world)*0.95)/world.body.radius,l2=lim*lim;
    if(lim>1.2)d.all=true;
    else{d.resample=d.resample||new Set();
      for(let k=0;k<d.C;k++){const dx=d.dirs[k*3]-n[0],dy=d.dirs[k*3+1]-n[1],dz=d.dirs[k*3+2]-n[2];if(dx*dx+dy*dy+dz*dz<l2)d.resample.add(k);}}
  }
  const q=world.env.dirty;q.pending=true;if(ev&&q.causes.length<12)q.causes.push(ev);
};
E.markAllDirty=function(world,ev){const c=LW.cache(world);if(c.env)c.env.all=true;const q=world.env.dirty;q.pending=true;if(ev&&q.causes.length<12)q.causes.push(ev);};
// water status of a cell: 0 none, 1 river, 2 lake, 3 sea
E.waterKind=function(world,d,c){
  if(d.h[c]<world.body.seaLevel)return 3;
  if(d.filled[c]-d.h[c]>Math.max(2,LW.planet.amplitude(world.body)*0.02))return 2;
  if(d.dam&&d.dam[c]&&d.flux[c]>d.thr)return 2;            // pond held behind a dam
  return d.flux[c]>d.thr?1:0;
};
// commit hydrology changes to canonical state and emit provenance-carrying events (idempotent pending work)
E.settle=function(world){
  const q=world.env.dirty;if(!q.pending)return 0;
  const d=E.d(world),first=!world.env.river,old=world.env.river||new Array(d.C).fill(0),now=new Array(d.C);
  let changed=0,emitted=0;const painted={};
  for(const s of world.terrainEdits)if(s.tool==='water')painted[E.cellOf(world,s.n)]=1;
  for(let c=0;c<d.C;c++){
    let k=E.waterKind(world,d,c);if(k===0&&painted[c])k=2;now[c]=k;
    if(first||k===old[c])continue;
    changed++;
    if(emitted<60){
      const type=(old[c]===1&&k===0)?'river.dried':(k===1&&old[c]===0)?'river.formed':(k>=2&&old[c]<2)?'land.flooded':(old[c]>=2&&k<2)?'land.emerged':'water.changed';
      world.env.chg[c]=LW.emit(world,type,{cell:c,from:old[c],to:k},q.causes,{cell:c});emitted++;
    }else world.env.chg[c]=world.env.chg[c]||q.causes[0];
  }
  world.env.river=now;world.env.rv=(world.env.rv|0)+1;q.pending=false;q.causes=[];
  if(changed)world.colorEpoch++;
  return changed;
};
E.tempAt=function(world,n,h){
  const b=world.body,ty=LW.ticksPerYear(world),decl=b.axialTilt*Math.PI/180*Math.sin((world.tick%ty)/ty*2*Math.PI);
  const lat=Math.asin(LW.clamp(n[1],-1,1)),ins=Math.cos(lat-decl*0.7);
  return b.atmosphere.baseTemp+34*(ins-0.72)+(b.star.lum-1)*30+(b.atmosphere.density-1)*8-30*Math.max(0,h-b.seaLevel)/Math.max(1,LW.planet.amplitude(b));
};
// climate + biome suitability at a point (h = canonical height there)
E.climate=function(world,n,h,cell){
  const d=E.d(world),c=cell===undefined?E.cellOf(world,n):cell,b=world.body;
  let temp=E.tempAt(world,n,h),moist=d.moist[c];
  const wk=E.waterKind(world,d,c);
  moist=LW.clamp(moist+(world.env.soil[c]/255-0.5)*0.24,0,1);
  if(wk===1||wk===2)moist=Math.min(1,moist+0.25);
  const pb=LW.planet.paintedBiome(world,n);
  let biome;
  if(h<LW.planet.waterLevel(world,n))biome=0;
  else if(pb>0){biome=pb;temp=LW.BIOMES[pb].t;moist=LW.BIOMES[pb].m;}   // painted biome persistently overrides local climate
  else biome=E.classify(temp,moist,Math.max(0,h-b.seaLevel)/Math.max(1,LW.planet.amplitude(b)));
  return {cell:c,temp,moist,biome,water:wk,painted:pb>0};
};
E.info=function(world,c){
  const d=E.d(world),n=[d.dirs[c*3],d.dirs[c*3+1],d.dirs[c*3+2]],cl=E.climate(world,n,d.h[c],c),sp=world.env.vsp[c]?world.species[world.env.plants[world.env.vsp[c]-1]]:null;
  return Object.assign(cl,{n,h:d.h[c],flux:d.flux[c],veg:world.env.veg[c],plant:sp,minerals:E.minerals(world,c)});
};
E.suit=function(sp,cl){
  const k=sp.climate||{t:[0,30],m:[0.2,1]};
  if(cl.biome===0&&!sp.aquatic)return 0;
  return LW.smooth(k.t[0]-6,k.t[0]+4,cl.temp)*(1-LW.smooth(k.t[1]-4,k.t[1]+6,cl.temp))*LW.smooth(k.m[0]-0.12,k.m[0]+0.08,cl.moist)*(1-LW.smooth(k.m[1]-0.05,k.m[1]+0.12,cl.moist));
};
E.minerals=function(world,c){
  const r=world.body.gen.minerals,s=world.body.gen.seed,used=world.env.mined[c]||0;
  return {stone:Math.max(0,Math.round(200+400*LW.hrand(s,c,1,0))-used),ore:Math.round(r*120*Math.pow(LW.hrand(s,c,2,0),3)),clay:Math.round(60*LW.hrand(s,c,3,0))};
};
// subsurface material by depth below the surface (m): shared by voxel rendering and mining
E.strata=function(world,n,depth){
  const s=world.body.gen.seed,q=LW.sharedNoise(n[0]*900+s%97,n[1]*900,n[2]*900+depth*0.11);
  if(depth<1.2)return 'soil';if(depth<4+q*2)return 'clay';
  if(q>0.38&&depth>7)return world.body.gen.minerals>0.55?'crystal':'ore';
  return depth>16?'deeprock':'rock';
};
// weather: analytic moving cloud field (mirrored in the terrain shader so what you see is what rains)
E.cloud=function(n,tick){
  const t=tick/LW.TPD*0.9;
  return 0.5+0.25*Math.sin((n[0]*0.8+n[1]*0.5+n[2]*0.33)*5.1+t)+0.15*Math.sin((-n[0]*0.4+n[1]*0.7+n[2]*0.6)*8.3-t*1.7+1.7)+0.1*Math.sin((n[0]*0.2-n[1]*0.6+n[2]*0.77)*13.7+t*2.9+4.1);
};
E.rain=function(world,n,cell){
  const m=E.d(world).moist[cell===undefined?E.cellOf(world,n):cell];
  return LW.smooth(0.6,0.86,E.cloud(n,world.tick)+(m-0.5)*0.3)*Math.min(1.5,world.body.atmosphere.density);
};
// fresh water reachable in a cell (rivers, lakes, painted water) - used by organisms and settlements
E.fresh=function(world,c){if(!world.env.river)E.settle(world);const k=world.env.river[c];return k===1||k===2;};
// 0..1 growing-water factor for crops/plants in a cell
E.waterFactor=function(world,c){
  const d=E.d(world);let f=d.moist[c]*0.4+world.env.soil[c]/255*0.4;       // climate + recent rain actually held by the soil
  if(E.fresh(world,c))f+=0.5;else for(let k=0;k<4;k++)if(E.fresh(world,d.nb[c*4+k])){f+=0.25;break;}
  return LW.clamp(f,0,1);
};

LW.def('env.settle',{perm:'edit',validate:()=>null,apply(w){return {public:{changed:E.settle(w)}};}});

// weather with consequences: the day's rain soaks the soil, dry spells drain it; settlements feel droughts and storms
E.weather=function(world){
  const d=E.d(world),en=world.env,C=d.C,t=world.tick,sea=world.body.seaLevel;
  for(let c=0;c<C;c++){
    if(d.h[c]<sea)continue;
    const n=[d.dirs[c*3],d.dirs[c*3+1],d.dirs[c*3+2]];let r=0;
    for(let k=0;k<4;k++)r+=LW.smooth(0.6,0.86,E.cloud(n,t-k*LW.TPD/4)+(d.moist[c]-0.5)*0.3);
    r=r/4*Math.min(1.5,world.body.atmosphere.density);
    en.soil[c]=Math.round(LW.clamp(en.soil[c]*0.9+r*90+3+(E.fresh(world,c)?5:0),0,255));
  }
  if(!world.rules.hazards)return;
  for(const id in world.settlements){
    const s=world.settlements[id];if(!s.members.length)continue;
    const c=E.cellOf(world,s.n),rain=E.rain(world,s.n,c);
    if(en.soil[c]<46&&!s.drought){s.drought=world.tick+1;s.droughtEv=LW.emit(world,'drought',{settlement:s.id,name:s.name,soil:en.soil[c]},[],{n:s.n,cell:c});}
    else if(en.soil[c]>90&&s.drought){s.drought=0;LW.emit(world,'drought.ended',{settlement:s.id,name:s.name},[s.droughtEv],{n:s.n});}
    if(rain>0.92*world.rules.hazards&&LW.rand(world)<0.5){
      const ev=LW.emit(world,'storm',{settlement:s.id,name:s.name},[],{n:s.n,cell:c});let hit=0;
      for(const b of s.buildings){const f=world.buildings[b];if(f&&f.kind==='field'&&f.growth>0.1){f.growth=Math.max(0,f.growth-0.2);hit++;}}
      for(const m of s.members){const q=world.persons[m];if(q&&q.lod==='active')LW.mind.remember(world,q,'storm','A storm tore through '+s.name+(hit?' and flattened the crops':''),0.7,ev);}
    }
  }
};
E.daily=function(world){
  E.settle(world);E.weather(world);
  const d=E.d(world),en=world.env,C=d.C;let touched=0;
  for(let c=0;c<C;c++){
    let v=en.veg[c];if(!v)continue;
    const sp=world.species[en.plants[en.vsp[c]-1]];
    if(!sp){en.veg[c]=0;en.vsp[c]=0;continue;}
    const cl=E.climate(world,[d.dirs[c*3],d.dirs[c*3+1],d.dirs[c*3+2]],d.h[c],c),s=E.suit(sp,cl),target=255*s;
    const nv=s<0.1?Math.max(0,v-9):Math.round(LW.clamp(v+(target-v)*0.07+(v<target?1:-1),0,255));
    if(nv!==v){en.veg[c]=nv;touched++;if(!nv){en.vsp[c]=0;LW.emit(world,'plants.diedOut',{cell:c,species:sp.id},[en.chg[c]],{cell:c});}}
    if(world.rules.spread&&nv>80&&(sp.lifecycle||{}).repro!=='none'){
      for(let k=0;k<4;k++){const b=d.nb[c*4+k];if(en.veg[b]||d.h[b]<world.body.seaLevel)continue;
        if(LW.rand(world)<0.06){const cb=E.climate(world,[d.dirs[b*3],d.dirs[b*3+1],d.dirs[b*3+2]],d.h[b],b);if(E.suit(sp,cb)>0.2){en.veg[b]=6;en.vsp[b]=en.vsp[c];touched++;}}}
    }
  }
  if(touched||LW.dayOf(world)%4===0)world.colorEpoch++;
};
E.hourly=function(world){
  if(world.env.dirty.pending)E.settle(world);
  // flooding of structures is a natural consequence that manual placement is NOT protected from
  for(const id in world.buildings){const b=world.buildings[id],under=LW.planet.height(world,b.n)<LW.planet.waterLevel(world,b.n)-0.3;
    if(under&&!b.flooded){b.flooded=true;LW.emit(world,'building.flooded',{id},[world.env.chg[E.cellOf(world,b.n)]],{e:[id]});}
    else if(!under&&b.flooded)b.flooded=false;}
};
// seed plants (life is never spontaneous: suitability alone creates nothing)
LW.def('life.seedPlants',{perm:'edit',
  validate(w,p){const sp=w.species[p.speciesId];if(!sp||sp.kind!=='plant')return 'unknown plant species';
    if(!LW.isDir(p.n)||!(p.r>0))return 'bad location';return null;},
  apply(w,p){
    const d=E.d(w),en=w.env;let ix=en.plants.indexOf(p.speciesId)+1;if(!ix){en.plants.push(p.speciesId);ix=en.plants.length;}
    const lim=(p.r+E.cellSize(w)*0.5)/w.body.radius,l2=lim*lim,prev=[];let near=-1,nd=9;
    for(let c=0;c<d.C;c++){const dx=d.dirs[c*3]-p.n[0],dy=d.dirs[c*3+1]-p.n[1],dz=d.dirs[c*3+2]-p.n[2],q=dx*dx+dy*dy+dz*dz;
      if(q<nd){nd=q;near=c;}
      if(q<l2&&d.h[c]>=w.body.seaLevel){prev.push([c,en.veg[c],en.vsp[c]]);en.veg[c]=Math.max(en.veg[c],p.cover||60);en.vsp[c]=ix;}}
    if(!prev.length&&near>=0&&d.h[near]>=w.body.seaLevel){prev.push([near,en.veg[near],en.vsp[near]]);en.veg[near]=Math.max(en.veg[near],p.cover||60);en.vsp[near]=ix;}
    const ev=LW.emit(w,'plants.seeded',{species:p.speciesId,cells:prev.length},[],{n:p.n});w.colorEpoch++;
    return {public:{cells:prev.length,event:ev},undo:{type:'life.setVeg',payload:{cells:prev}},gid:p.gid,label:'Seed plants'};}});
LW.def('life.setVeg',{perm:'edit',validate:(w,p)=>Array.isArray(p.cells)&&p.cells.every(c=>Array.isArray(c)&&c[0]>=0&&c[0]<w.env.veg.length)?null:'bad cells',
  apply(w,p){const prev=[];for(const c of p.cells){prev.push([c[0],w.env.veg[c[0]],w.env.vsp[c[0]]]);w.env.veg[c[0]]=c[1];w.env.vsp[c[0]]=c[2];}w.colorEpoch++;
    return {undo:{type:'life.setVeg',payload:{cells:prev}},label:'Seed plants'};}});
})();
