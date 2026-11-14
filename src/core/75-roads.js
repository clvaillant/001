// roads and era vehicles: persistent polylines in planetary coordinates that speed travel, laid by the
// player or by settlements; the conveyance a traveller uses depends on what their settlement has invented.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V,E=LW.env,B=LW.build;
const RD=LW.roads={};
// conveyances in order of invention: [required tech, name, speed on a road, speed off road]
RD.VEHICLES=[['wheel','cart',1.6,1.15],['mechanics','velocipede',2.1,1.2],['steam','steam carriage',2.8,1.1],['electricity','electric car',3.6,1.3],['spaceflight','hover skimmer',5.5,5.0]];
RD.vehicleFor=function(world,p){
  const s=world.settlements[p.settlement];if(!s)return null;let best=null;
  for(const v of RD.VEHICLES)if(s.techs.indexOf(v[0])>=0)best=v;
  return best;
};
function index(world){
  const c=LW.cache(world);if(c.roadIdx&&c.roadRev===(world.roadRev|0))return c.roadIdx;
  const idx={};for(const id in world.roads){const r=world.roads[id];for(let i=0;i<r.pts.length-1;i++){
    const a=r.pts[i],b=r.pts[i+1],n=Math.max(1,Math.ceil(LW.arcDist(a,b,world.body.radius)/(E.cellSize(world)*0.5)));
    for(let k=0;k<=n;k++){const cl=E.cellOf(world,V.norm(V.lerp(a,b,k/n)));(idx[cl]||(idx[cl]=[])).push([a,b]);}}}
  c.roadIdx=idx;c.roadRev=world.roadRev|0;return idx;
}
// is n within `tol` metres of any road?
RD.near=function(world,n,tol){
  const segs=index(world)[E.cellOf(world,n)];if(!segs)return false;const R=world.body.radius,t2=(tol/R)*(tol/R);
  for(const s of segs){const a=s[0],b=s[1],ex=b[0]-a[0],ey=b[1]-a[1],ez=b[2]-a[2],l2=ex*ex+ey*ey+ez*ez||1e-12;
    let t=((n[0]-a[0])*ex+(n[1]-a[1])*ey+(n[2]-a[2])*ez)/l2;t=t<0?0:t>1?1:t;
    const dx=n[0]-a[0]-ex*t,dy=n[1]-a[1]-ey*t,dz=n[2]-a[2]-ez*t;if(dx*dx+dy*dy+dz*dz<t2)return true;}
  return false;
};
// travel-speed multiplier for a person at their current position (roads help everyone; vehicles need roads to shine)
RD.speedFactor=function(world,p){
  const on=RD.near(world,p.n,3.5),v=p.ride?RD.VEHICLES.find(x=>x[1]===p.ride):null;
  return v?(on?v[2]:v[3]):(on?1.3:1);
};
RD.add=function(world,pts,by,settlement){
  const r={id:LW.newId(world,'rd'),pts:pts.map(p=>p.slice()),by:by||'player',settlement:settlement||null,built:world.tick};
  world.roads[r.id]=r;world.roadRev=(world.roadRev|0)+1;return r;
};
LW.def('road.add',{perm:'edit',
  validate(w,p){
    if(!Array.isArray(p.pts)||p.pts.length<2||p.pts.length>200)return 'a road needs 2..200 points';
    if(Object.keys(w.roads).length>=400)return 'road limit reached';
    for(let i=0;i<p.pts.length;i++){if(!LW.isDir(p.pts[i]))return 'bad point';
      if(LW.planet.height(w,p.pts[i])<LW.planet.waterLevel(w,p.pts[i])-0.7)return 'roads cannot cross deep water';
      if(i&&LW.arcDist(p.pts[i-1],p.pts[i],w.body.radius)>600)return 'points too far apart';}
    return null;},
  apply(w,p){const r=RD.add(w,p.pts,'player',(LW.society.nearestSettlement(w,p.pts[0],400)||{}).id);
    const ev=LW.emit(w,'road.built',{id:r.id,by:'player',points:r.pts.length},[],{n:r.pts[0]});
    return {public:{id:r.id,event:ev},undo:{type:'road.remove',payload:{id:r.id}},label:'Build road'};}});
LW.def('road.remove',{perm:'edit',validate:(w,p)=>w.roads[p.id]?null:'no such road',
  apply(w,p){const r=w.roads[p.id];delete w.roads[p.id];w.roadRev=(w.roadRev|0)+1;return {undo:{type:'road.restore',payload:{r}},label:'Remove road'};}});
LW.def('road.restore',{perm:'edit',validate:(w,p)=>p.r&&typeof p.r.id==='string'&&!w.roads[p.r.id]&&Array.isArray(p.r.pts)&&p.r.pts.every(LW.isDir)?null:'bad road',
  apply(w,p){w.roads[p.r.id]=LW.clone(p.r);w.roadRev=(w.roadRev|0)+1;return {undo:{type:'road.remove',payload:{id:p.r.id}},label:'Build road'};}});
// settlements tread paths from their centre to each finished building, and a road to a neighbour once they have the wheel
RD.daily=function(world){
  const R=world.body.radius,human=Object.values(world.species).find(s=>s.kind==='person');
  for(const id in world.settlements){
    const s=world.settlements[id];if(!s.members.length)continue;s.paths=s.paths||{};
    for(const bid of s.buildings){const b=world.buildings[bid];if(!b||b.progress<1||s.paths[bid]||b.kind==='field'||Object.keys(world.roads).length>=380)continue;
      const door=b.doors.find(d=>d.b<0),end=door?B.dir(world,b,door.x,door.z-1.6*(door.z<0?1:-1)):LW.offsetDir(b.n,0,-(B.radius(b)+1),R);
      if(LW.arcDist(s.n,end,R)<6){s.paths[bid]='-';continue;}
      const leg=LW.nav.outdoor(world,s.n,end,human);if(!leg){s.paths[bid]='-';continue;}
      const r=RD.add(world,[s.n].concat(leg),'settlement',s.id);s.paths[bid]=r.id;
      LW.emit(world,'road.built',{id:r.id,by:s.id,name:s.name,to:b.kind},[s.ev],{n:s.n});}
    if(s.techs.indexOf('wheel')>=0)for(const oid in world.settlements){
      const o=world.settlements[oid];if(oid<=id||!o.members.length||(s.paths['s:'+oid])||LW.arcDist(s.n,o.n,R)>4000)continue;
      const n=Math.max(2,Math.ceil(LW.arcDist(s.n,o.n,R)/120)),pts=[];let fine=true;
      for(let k=0;k<=n;k++){const q=V.norm(V.lerp(s.n,o.n,k/n));if(LW.planet.height(world,q)<LW.planet.waterLevel(world,q)-0.7){fine=false;break;}pts.push(q);}
      s.paths['s:'+oid]=fine?RD.add(world,pts,'settlement',s.id).id:'-';
      if(fine)LW.emit(world,'road.built',{by:s.id,name:s.name,to:o.name},[s.ev],{n:s.n});}
  }
};
})();
