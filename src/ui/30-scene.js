// presentation / scene: camera, ray picking, buildings, furniture, creatures, caves, water bodies.
// Everything here is a projection of canonical world state; nothing in this file writes to the world.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V,G=LW.gfx,E=LW.env,P=LW.planet,B=LW.build,VOL=LW.volumes;

// ---- one continuous camera: target direction on the planet + distance + heading + tilt (+ depth below ground)
G.newCamera=function(){return {n:[0.3,0.4,0.86].map((x,i,a)=>x/Math.hypot(a[0],a[1],a[2])),dist:60000,heading:0,tilt:0,depth:0,fov:50*Math.PI/180,hT:0,autoTilt:true,
  pos:[0,0,1],f:[0,0,-1],r:[1,0,0],u:[0,1,0],tanX:1,tanY:1,near:1,far:1e6,w:1,h:1,goal:null};};
G.autoTilt=function(world,dist){return LW.clamp(1.22*(1-LW.smooth(40,world.body.radius*0.5,dist)),0,1.22);};
G.camUpdate=function(world,cam,w,h,dt){
  const R=world.body.radius,amp=P.amplitude(world.body);
  if(cam.goal){      // smooth focus on a selected object/location
    const k=1-Math.exp(-dt*4);cam.n=V.norm(V.lerp(cam.n,cam.goal.n,k));
    if(cam.goal.dist)cam.dist=Math.exp(LW.lerp(Math.log(cam.dist),Math.log(cam.goal.dist),k));
    if(V.dist(cam.n,cam.goal.n)*R<0.05*cam.dist&&(!cam.goal.dist||Math.abs(Math.log(cam.dist/cam.goal.dist))<0.03))cam.goal=null;
  }
  cam.dist=LW.clamp(cam.dist,2.5,R*6);
  if(cam.autoTilt)cam.tilt=G.autoTilt(world,cam.dist);
  cam.tilt=LW.clamp(cam.tilt,0,1.5);
  const g=cam.groundOverride!==undefined&&cam.groundOverride!==null?cam.groundOverride:Math.max(LW.groundAt(world,cam.n),P.waterLevel(world,cam.n));
  cam.hT+=(g-cam.hT)*Math.min(1,dt*8+(Math.abs(g-cam.hT)>cam.dist?1:0));
  const fr=LW.frame(cam.n),ch=Math.cos(cam.heading),sh=Math.sin(cam.heading),fw=[fr.t[0]*ch+fr.e[0]*sh,fr.t[1]*ch+fr.e[1]*sh,fr.t[2]*ch+fr.e[2]*sh];
  const rt=R+cam.hT-cam.depth+Math.min(1.2,cam.dist*0.05),T=[cam.n[0]*rt,cam.n[1]*rt,cam.n[2]*rt],ct=Math.cos(cam.tilt),st=Math.sin(cam.tilt);
  let pos=[T[0]+(cam.n[0]*ct-fw[0]*st)*cam.dist,T[1]+(cam.n[1]*ct-fw[1]*st)*cam.dist,T[2]+(cam.n[2]*ct-fw[2]*st)*cam.dist];
  if(cam.depth<=0){        // never let the eye sink below the land or sea
    const pr=V.len(pos),pn=V.mul(pos,1/pr),floor=R+Math.max(P.height(world,pn),P.waterLevel(world,pn))+Math.min(1.5,cam.dist*0.2);
    if(pr<floor)pos=V.mul(pn,floor);
  }
  cam.T=T;cam.pos=pos;cam.f=V.norm(V.sub(T,pos));
  const up0=[fw[0]*ct+cam.n[0]*st,fw[1]*ct+cam.n[1]*st,fw[2]*ct+cam.n[2]*st];
  cam.r=V.norm(V.cross(cam.f,up0));cam.u=V.cross(cam.r,cam.f);
  cam.w=w;cam.h=h;cam.tanY=Math.tan(cam.fov/2);cam.tanX=cam.tanY*w/h;
  const rc=V.len(pos),hd=Math.sqrt(Math.max(0,rc*rc-(R-amp)*(R-amp)))+Math.sqrt(Math.max(0,(R+amp)*(R+amp)-(R-amp)*(R-amp)));
  cam.near=LW.clamp(cam.dist*0.02,0.12,R*0.5);cam.far=Math.max(hd*1.15+200,cam.dist*3);
  cam.alt=rc-R-cam.hT;
  cam.vp=G.mul(G.persp(cam.fov,w/h,cam.near,cam.far),G.viewRot(cam.r,cam.u,cam.f));
};
G.project=function(cam,p){
  const rel=V.sub(p,cam.pos),z=V.dot(rel,cam.f);if(z<=cam.near)return null;
  return {x:(V.dot(rel,cam.r)/(z*cam.tanX)*0.5+0.5)*cam.w,y:(0.5-V.dot(rel,cam.u)/(z*cam.tanY)*0.5)*cam.h,z};
};
G.rayDir=function(cam,sx,sy){
  const nx=(sx/cam.w*2-1)*cam.tanX,ny=(1-sy/cam.h*2)*cam.tanY;
  return V.norm([cam.f[0]+cam.r[0]*nx+cam.u[0]*ny,cam.f[1]+cam.r[1]*nx+cam.u[1]*ny,cam.f[2]+cam.r[2]*nx+cam.u[2]*ny]);
};
// ray-march the canonical terrain (the same function every LOD mesh samples)
G.raycast=function(world,o,d){
  const R=world.body.radius,top=R+P.amplitude(world.body)*1.5+600,b=V.dot(o,d),c=V.dot(o,o)-top*top;let t=0;
  if(c>0){const q=b*b-c;if(q<0||b>0)return null;t=-b-Math.sqrt(q);}
  const alt=t=>{const p=V.madd(o,d,t),r=V.len(p),n=V.mul(p,1/r);return r-R-Math.max(P.height(world,n),P.waterLevel(world,n));};
  let prev=t,a=alt(t);if(a<0)return null;
  for(let i=0;i<260;i++){
    prev=t;t+=Math.max(a*0.45,0.2+t*0.0015);a=alt(t);
    if(a<0){let lo=prev,hi=t;for(let k=0;k<14;k++){const m=(lo+hi)/2;if(alt(m)<0)hi=m;else lo=m;}
      const p=V.madd(o,d,hi);return {n:V.norm(p),t:hi,p};}
    if(V.dot(V.madd(o,d,t),d)>0&&V.len(V.madd(o,d,t))>top)return null;
  }
  return null;
};
// first solid voxel (or surface) hit inside any nearby dig site, for carving/filling
G.raycastVolume=function(world,o,d){
  const R=world.body.radius;let best=null;
  for(const id in world.volumes){
    const v=world.volumes[id];if(V.dist(P.surface(world,v.n),o)>700)continue;
    let wasOpen=false;
    for(let t=0;t<700;t+=0.6){
      const p=V.madd(o,d,t),r=V.len(p),n=V.mul(p,1/r),l=VOL.contains(world,v,n);if(!l){wasOpen=false;continue;}
      const y=r-R,open=VOL.isOpen(world,v,l[0],y,l[1]);
      if(!open){if(!best||t<best.t)best={v,x:l[0],y,z:l[1],t,n,air:wasOpen};break;}
      wasOpen=true;
    }
  }
  return best;
};

// ---- era styling: colours evolve with culture and historical era -----------------
const ERA=[{wall:[168,128,92],roof:[196,170,96],found:[120,108,100],floor:[150,120,90]},{wall:[176,136,96],roof:[150,96,70],found:[128,118,110],floor:[156,126,96]},
  {wall:[222,206,176],roof:[184,84,60],found:[140,130,122],floor:[170,140,104]},{wall:[204,190,170],roof:[90,110,140],found:[130,126,128],floor:[172,150,120]},
  {wall:[190,186,186],roof:[70,80,96],found:[110,110,116],floor:[150,140,130]},{wall:[176,100,84],roof:[60,62,70],found:[100,100,104],floor:[140,120,100]},
  {wall:[160,90,76],roof:[52,54,60],found:[96,96,100],floor:[130,112,96]},{wall:[224,226,230],roof:[70,150,170],found:[120,124,130],floor:[190,190,190]},
  {wall:[236,240,244],roof:[90,200,190],found:[150,154,160],floor:[210,214,220]},{wall:[240,244,250],roof:[250,180,70],found:[170,176,186],floor:[224,228,236]}];
const WOOD=[150,108,70],STONE=[150,148,152];
function wallRun(mb,ax,az,bx,bz,y0,y1,col){const horiz=Math.abs(bz-az)<1e-6;mb.box((ax+bx)/2,(y0+y1)/2,(az+bz)/2,horiz?Math.abs(bx-ax)+0.2:0.2,y1-y0,horiz?0.2:Math.abs(bz-az)+0.2,col);}
function walls(mb,b,H,st,full){
  for(const m of b.rooms){
    const edges=[[m.x,m.z,m.x+m.w,m.z],[m.x,m.z+m.d,m.x+m.w,m.z+m.d],[m.x,m.z,m.x,m.z+m.d],[m.x+m.w,m.z,m.x+m.w,m.z+m.d]];
    for(const e of edges){
      const horiz=e[1]===e[3],a0=horiz?e[0]:e[1],a1=horiz?e[2]:e[3],gaps=[];
      for(const d of b.doors){const on=horiz?Math.abs(d.z-e[1])<0.06&&d.x>a0&&d.x<a1:Math.abs(d.x-e[0])<0.06&&d.z>a0&&d.z<a1;if(on)gaps.push(horiz?d.x:d.z);}
      gaps.sort((p,q)=>p-q);let s=a0;
      const seg=(p,q,y0,y1)=>{if(q-p<0.05||y1-y0<0.05)return;if(horiz)wallRun(mb,p,e[1],q,e[1],y0,y1,st.wall);else wallRun(mb,e[0],p,e[0],q,y0,y1,st.wall);};
      for(const gp of gaps){seg(s,gp-0.55,0,H);if(full)seg(gp-0.55,gp+0.55,2.1,H);s=gp+0.55;}
      seg(s,a1,0,H);
      if(full&&H>2&&a1-a0>3&&!gaps.length){const mid=(a0+a1)/2;        // lit windows
        if(horiz)mb.box(mid,1.55,e[1],0.8,0.7,0.26,[255,224,150],0,170);else mb.box(e[0],1.55,mid,0.26,0.7,0.8,[255,224,150],0,170);}
    }
  }
}
function furniture(mb,c){
  const cr=Math.cos(c.rot||0),sr=Math.sin(c.rot||0),o=(dx,dz)=>[c.x+dx*cr+dz*sr,c.z-dx*sr+dz*cr],bx=(dx,y,dz,sx,sy,sz,col,em)=>{const q=o(dx,dz);mb.box(q[0],y,q[1],sx,sy,sz,col,c.rot||0,em);};
  switch(c.kind){
    case 'bed':bx(0,0.22,0,1.1,0.3,2.0,WOOD);bx(0,0.45,0,1.0,0.18,1.9,[226,226,238]);bx(0,0.58,0.72,0.7,0.12,0.36,[250,250,255]);bx(0,0.56,-0.25,1.02,0.08,1.2,[176,84,84]);break;
    case 'table':bx(0,0.74,0,1.4,0.08,0.9,WOOD);for(const s of [[-0.6,-0.36],[0.6,-0.36],[-0.6,0.36],[0.6,0.36]])bx(s[0],0.36,s[1],0.08,0.72,0.08,[120,86,56]);bx(0.2,0.82,0,0.3,0.06,0.3,[230,220,200]);break;
    case 'chair':bx(0,0.44,0,0.46,0.06,0.46,WOOD);bx(0,0.74,-0.2,0.46,0.6,0.06,WOOD);bx(0,0.22,0,0.38,0.42,0.38,[120,86,56]);break;
    case 'stove':bx(0,0.45,0,0.9,0.9,0.7,[92,86,94]);bx(0,0.42,-0.3,0.5,0.4,0.14,[255,150,50],240);bx(0.3,1.9,0.2,0.26,2.2,0.26,[110,104,112]);break;
    case 'chest':bx(0,0.28,0,0.9,0.5,0.5,[156,108,62]);bx(0,0.56,0,0.94,0.08,0.54,[112,78,46]);bx(0,0.3,-0.26,0.14,0.14,0.04,[220,190,90]);break;
    case 'workbench':bx(0,0.82,0,1.6,0.1,0.7,WOOD);bx(-0.7,0.4,0,0.1,0.8,0.6,[120,86,56]);bx(0.7,0.4,0,0.1,0.8,0.6,[120,86,56]);bx(0.3,0.95,0.1,0.5,0.14,0.12,[150,150,160]);break;
    case 'shelf':bx(0,0.9,0,1.2,1.8,0.34,[130,94,62]);for(let i=0;i<4;i++)bx(-0.4+i*0.27,1.25,-0.06,0.2,0.34,0.24,[[180,70,60],[70,110,170],[210,180,90],[90,150,110]][i]);break;
    case 'lamp':bx(0,0.7,0,0.08,1.4,0.08,[90,84,80]);mb.blob(c.x,1.5,c.z,0.2,0.22,0.2,5,[255,230,160],255);break;
    case 'well':mb.cyl(c.x,0,c.z,0.8,0.85,8,STONE);mb.ex=3;mb.cyl(c.x,0.5,c.z,0.62,0.12,8,[70,130,170]);mb.ex=0;bx(-0.85,1.2,0,0.12,2.4,0.12,WOOD);bx(0.85,1.2,0,0.12,2.4,0.12,WOOD);mb.gable(c.x-1,c.z-0.7,c.x+1,c.z+0.7,2.3,0.6,0.1,[150,96,70]);break;
  }
}
function buildingMesh(world,b){
  const st=ERA[Math.min(b.era||0,ERA.length-1)],base=new G.MB(),full=new G.MB(),low=new G.MB(),roof=new G.MB(),prog=LW.clamp(b.progress,0,1);
  if(b.kind==='field'){
    base.box(0,-0.9,0,12.4,2,10.4,[104,78,58]);
    for(let r=-4;r<=4;r++){base.box(0,0.16,r*1.1,11.6,0.14,0.6,[124,92,64]);
      if(prog>=1&&b.growth>0.03)base.box(0,0.24+b.growth*0.5,r*1.1,11.2,b.growth,0.3,[LW.lerp(120,214,b.growth),LW.lerp(170,180,b.growth),LW.lerp(70,80,b.growth)]);}
    if(prog<1)for(const s of [[-6,-5],[6,-5],[-6,5],[6,5]])base.box(s[0],0.6,s[1],0.14,1.2,0.14,WOOD);
    return {base:base.build()};
  }
  for(const m of b.rooms){
    base.box(m.x+m.w/2,-1.45,m.z+m.d/2,m.w+0.5,2.9,m.d+0.5,st.found);base.box(m.x+m.w/2,0.02,m.z+m.d/2,m.w,0.05,m.d,st.floor);
    if(prog>=1)roof.gable(m.x,m.z,m.x+m.w,m.z+m.d,2.6,1.7,0.45,st.roof);
    else for(const s of [[m.x,m.z],[m.x+m.w,m.z],[m.x,m.z+m.d],[m.x+m.w,m.z+m.d]])base.box(s[0],1.7,s[1],0.14,3.4,0.14,WOOD);
  }
  if(b.rooms.length){walls(full,b,2.6*Math.max(0.12,prog),st,prog>=1);walls(low,b,Math.min(0.9,2.6*Math.max(0.12,prog)),st,false);}
  if(prog<1){const mats=Object.keys(b.mat).reduce((s,k)=>s+b.mat[k],0);if(mats)base.box(B.radius(b)+0.5,0.3,0,1.2,0.3+mats*0.04,1.2,WOOD);}
  if(prog>=1)for(const c of b.comps)furniture(base,c);
  else if(b.kind==='well')base.cyl(0,0,0,0.8,0.3,8,STONE);
  return {base:base.build(),full:full.build(),low:low.build(),roof:roof.build()};
}
const MAT={soil:[124,92,66],clay:[176,128,84],rock:[128,124,134],deeprock:[84,78,104],ore:[168,104,70],crystal:[110,220,230]};
function volumeMesh(world,v){
  const g=VOL.grid(world,v),mb=new G.MB(),nx=g.nx,ny=g.ny,nz=g.nz,cs=g.cs,d=E.d(world),amp=Math.max(1,P.amplitude(world.body));
  const S=(i,j,k)=>i<0||k<0||i>=nx||k>=nz?2:(j<0?1:(j>=ny?0:g.solid[(j*nz+k)*nx+i]));
  const h0=P.height(world,v.n);
  for(let k=0;k<nz;k++)for(let i=0;i<nx;i++){
    const x0=(i-nx/2)*cs,x1=x0+cs,z0=(k-nz/2)*cs,z1=z0+cs,dir=VOL.dir(world,v,x0+cs/2,z0+cs/2),ch=g.colH[k*nx+i];
    // local y is measured from the anchor altitude; curvature across a 48 m site is negligible
    for(let j=0;j<ny;j++){
      if(!g.solid[(j*nz+k)*nx+i])continue;
      const yb=g.y0+j*cs-h0,airUp=!S(i,j+1,k),yt=(airUp?VOL.topY(g,i,j,k):g.y0+(j+1)*cs)-h0,depth=ch-(g.y0+(j+0.5)*cs);
      const mat=E.strata(world,dir,depth),col=MAT[mat],em=mat==='crystal'?120:0;
      if(airUp){const natural=Math.abs(yt+h0-ch)<0.01;mb.quad([x0,yt,z0],[x1,yt,z0],[x1,yt,z1],[x0,yt,z1],natural?G.terrainColor(world,dir,ch,P.waterLevel(world,dir),0,d,amp):col,em);}
      if(S(i,j-1,k)===0)mb.quad([x0,yb,z0],[x1,yb,z0],[x1,yb,z1],[x0,yb,z1],[col[0]*0.7,col[1]*0.7,col[2]*0.7],em);
      const side=[col[0]*0.9,col[1]*0.9,col[2]*0.9];
      if(S(i-1,j,k)===0)mb.quad([x0,yb,z0],[x0,yb,z1],[x0,yt,z1],[x0,yt,z0],side,em);
      if(S(i+1,j,k)===0)mb.quad([x1,yb,z0],[x1,yb,z1],[x1,yt,z1],[x1,yt,z0],side,em);
      if(S(i,j,k-1)===0)mb.quad([x0,yb,z0],[x1,yb,z0],[x1,yt,z0],[x0,yt,z0],col,em);
      if(S(i,j,k+1)===0)mb.quad([x0,yb,z1],[x1,yb,z1],[x1,yt,z1],[x0,yt,z1],col,em);
    }
  }
  return {mesh:mb.build(),h0};
}
// ---- creatures: procedural articulated bodies from species anatomy -----------------
const tint=(c,em)=>new Float32Array([c[0]/255,c[1]/255,c[2]/255,em||0]);
function limb(U,base,x,y,z,rx,rz,w,len,col){const j=G.part(base,x,y,z,rx,rz,1,1,1);G.draw(U.box,G.part(j,0,-len/2,0,0,0,w,len,w),col);}
function creature(sp,base,ph,moving,posture,simple){
  const U=G.unit(),b=sp.body,S=b.size,c1=tint(b.c1),c2=tint(b.c2||b.c1),sw=moving?Math.sin(ph)*0.7:0;
  if(simple){G.draw(U.box,G.part(base,0,S*0.5,0,0,0,S*(b.plan==='biped'?0.35:0.5),S*(b.plan==='biped'?1:0.6),S*(b.plan==='biped'?0.3:1)),c2);return;}
  if(b.plan==='biped'){
    let root=base;const leg=0.45*S;
    if(posture==='lie')root=G.part(base,0,0.62,-S*0.45,-Math.PI/2,0,1,1,1);
    else if(posture==='sit')root=G.part(base,0,-leg*0.45,0,0,0,1,1,1);
    const lr=posture==='sit'?-1.4:0;
    limb(U,root,-0.09*S,leg,0,lr+sw,0,0.11*S,leg,c1);limb(U,root,0.09*S,leg,0,lr-sw,0,0.11*S,leg,c1);
    G.draw(U.box,G.part(root,0,leg+0.19*S,0,0,0,0.3*S,0.38*S,0.17*S),c2);
    const arms=Math.max(0,Math.min(6,b.arms|0));
    for(let a=0;a<arms;a++){const side=a%2?1:-1,row=Math.floor(a/2);limb(U,root,side*0.2*S,leg+0.35*S-row*0.13*S,0,(side>0?sw:-sw)*(row?0.5:1),side*0.12,0.085*S,0.36*S,c1);}
    G.draw(U.blob,G.part(root,0,leg+0.38*S+b.head*S*0.45,0,0,0,b.head*S,b.head*S*1.05,b.head*S),c1);
    if(b.tail)G.draw(U.cone,G.part(root,0,leg+0.05*S,-0.2*S,-2.2,0,0.1*S,0.45*S,0.1*S),c2);
    return;
  }
  if(b.plan==='avian'){
    const up=moving?2.2+Math.sin(ph*0.3)*0.3:0.25*S,root=G.part(base,0,up,0,0,0,1,1,1),fl=moving?Math.sin(ph*1.6)*0.8:0.15;
    G.draw(U.blob,G.part(root,0,0.3*S,0,0,0,0.4*S,0.4*S,0.8*S),c1);G.draw(U.blob,G.part(root,0,0.45*S,0.42*S,0,0,b.head*S,b.head*S,b.head*S),c2);
    G.draw(U.box,G.part(root,-0.5*S,0.36*S,0,0,fl,0.9*S,0.04*S,0.4*S),c1);G.draw(U.box,G.part(root,0.5*S,0.36*S,0,0,-fl,0.9*S,0.04*S,0.4*S),c1);
    return;
  }
  if(b.plan==='serpent'||b.plan==='blob'){for(let i=0;i<3;i++)G.draw(U.blob,G.part(base,Math.sin(ph+i)*0.1*S*(moving?1:0),0.25*S,(1-i)*0.45*S,0,0,0.5*S,0.5*S,0.6*S),i?c1:c2);return;}
  // quadruped / hexapod
  const legs=b.plan==='hexapod'?6:Math.max(2,Math.min(8,b.legs|0)),pairs=Math.ceil(legs/2),len=(b.plan==='hexapod'?0.3:0.5)*S,bl=1.05*S,bw=0.42*S,rest=posture==='lie'||posture==='rest';
  const root=rest?G.part(base,0,-len*0.6,0,0,0,1,1,1):base;
  G.draw(U.box,G.part(root,0,len+0.2*S,0,0,0,bw,0.4*S,bl),c1);
  for(let p=0;p<pairs;p++){const z=pairs===1?0:(p/(pairs-1)-0.5)*bl*0.8,s=(p%2?-sw:sw)*(rest?0:1),sp2=b.plan==='hexapod'?0.5:0.06;
    limb(U,root,-bw*0.45,len+0.05*S,z,s,-sp2,0.1*S,len*1.05,c1);limb(U,root,bw*0.45,len+0.05*S,z,-s,sp2,0.1*S,len*1.05,c1);}
  G.draw(U.box,G.part(root,0,len+0.42*S,bl*0.56,0.25,0,b.head*S*0.9,b.head*S*0.9,b.head*S*1.2),c2);
  if(b.tail)G.draw(U.cone,G.part(root,0,len+0.3*S,-bl*0.55,-1.9+sw*0.3,0,0.09*S,0.5*S,0.09*S),c2);
}
G.creature=creature;

class Scene{
  constructor(){this.bm=new Map();this.vm=new Map();this.rs=new Map();this.water=null;this.waterKey='';this.time=0;}
  reset(){for(const x of this.bm.values())for(const k of ['base','full','low','roof'])G.free(x.m[k]);this.bm.clear();for(const x of this.vm.values())G.free(x.mesh);this.vm.clear();this.rs.clear();this.freeWater();}
  freeWater(){if(this.water)for(const s of this.water)G.free(s.mesh);this.water=null;}
  // rivers (ribbons along drainage links) and natural lakes (flat sheets at fill level) from the hydrology state
  buildWater(world,cam){
    const d=E.d(world),R=world.body.radius,riv=world.env.river;if(!riv)return;
    const bucket=Math.round(Math.log2(Math.max(8,cam.alt))*2),key=world.id+'|'+d.rev+'|'+world.colorEpoch+'|'+bucket+'|'+world.terrainEdits.length;
    if(key===this.waterKey)return;this.waterKey=key;this.freeWater();
    const N=d.N,groups={},cell=E.cellSize(world),lift=Math.max(0.35,cam.alt*0.004),thr=Math.max(2,P.amplitude(world.body)*0.02);
    const grp=c=>{const f=Math.floor(c/(N*N)),j=Math.floor(c/N)%N,i=c%N,k=f+'/'+(i>>3)+'/'+(j>>3);
      return groups[k]||(groups[k]={mb:new G.MB(),o:[d.dirs[c*3]*R,d.dirs[c*3+1]*R,d.dirs[c*3+2]*R]});};
    for(let c=0;c<d.C;c++){
      if(riv[c]===1&&d.to[c]>=0){
        const g=grp(c),a=[d.dirs[c*3],d.dirs[c*3+1],d.dirs[c*3+2]],t=d.to[c],b=[d.dirs[t*3],d.dirs[t*3+1],d.dirs[t*3+2]];
        const wd=Math.max(LW.clamp(cell*0.03*Math.sqrt(d.flux[c]/d.thr),2,cell*0.14),cam.alt*0.009),SEG=cam.alt<3000?14:6;
        const side0=V.norm(V.cross(a,V.sub(b,a))),me=(LW.hrand(c,7,0,0)-0.5)*0.36*cell/R;
        let pl=null,pr=null;g.mb.ex=2.5+d.flux[c]*0.05;
        for(let k=0;k<=SEG;k++){
          const n=V.norm(V.madd(V.lerp(a,b,k/SEG),side0,Math.sin(k/SEG*Math.PI)*me)),r=R+Math.max(P.height(world,n),P.waterLevel(world,n))+lift;
          const l=[n[0]*r-side0[0]*wd/2-g.o[0],n[1]*r-side0[1]*wd/2-g.o[1],n[2]*r-side0[2]*wd/2-g.o[2]],q=[n[0]*r+side0[0]*wd/2-g.o[0],n[1]*r+side0[1]*wd/2-g.o[1],n[2]*r+side0[2]*wd/2-g.o[2]];
          if(pl)g.mb.quad(pl,pr,q,l,[60,120,150]);pl=l;pr=q;
        }
      }else if(riv[c]===2&&d.filled[c]-d.h[c]>thr){
        const g=grp(c),f=Math.floor(c/(N*N)),j=Math.floor(c/N)%N,i=c%N,r=R+d.filled[c]-0.3;g.mb.ex=6;
        const pt=(u,v)=>{const n=LW.faceDir(f,(i+u)/N*2-1,(j+v)/N*2-1);return [n[0]*r-g.o[0],n[1]*r-g.o[1],n[2]*r-g.o[2]];};
        for(let y=0;y<3;y++)for(let x=0;x<3;x++)g.mb.quad(pt(-0.1+x*0.4,-0.1+y*0.4),pt(0.3+x*0.4,-0.1+y*0.4),pt(0.3+x*0.4,0.3+y*0.4),pt(-0.1+x*0.4,0.3+y*0.4),[60,120,150]);
      }
    }
    this.water=[];for(const k in groups){const m=groups[k].mb.build();if(m)this.water.push({mesh:m,o:groups[k].o});}
  }
  rstate(world,ent,dt){
    let s=this.rs.get(ent.id);
    if(!s){s={n:ent.n.slice(),face:ent.face||0,ph:LW.hrand(LW.hashStr(ent.id),1,0,0)*6,moving:false};this.rs.set(ent.id,s);}
    const R=world.body.radius,d=V.dist(s.n,ent.n)*R;
    s.moving=d>0.03;
    if(d>60)s.n=ent.n.slice();else if(d>0)s.n=V.norm(V.lerp(s.n,ent.n,1-Math.exp(-dt*9)));
    let df=(ent.face||0)-s.face;df=Math.atan2(Math.sin(df),Math.cos(df));s.face+=df*(1-Math.exp(-dt*10));
    if(s.moving)s.ph+=dt*9;
    return s;
  }
  // world position (planet frame, doubles) of an entity as rendered
  entPos(world,ent,s){const n=s?s.n:ent.n,r=world.body.radius+LW.groundAt(world,n,ent);return [n[0]*r,n[1]*r,n[2]*r];}
  draw(world,cam,dt,opt){
    const gl=G.gl,u=G.main.u,R=world.body.radius;this.time+=dt;
    gl.uniform1i(u.uMode,1);
    // water bodies
    this.buildWater(world,cam);
    if(this.water)for(const s of this.water)G.draw(s.mesh,G.translate(s.o[0]-cam.pos[0],s.o[1]-cam.pos[1],s.o[2]-cam.pos[2]));
    // dig sites
    for(const id in world.volumes){
      const v=world.volumes[id],o=P.surface(world,v.n);if(V.dist(o,cam.pos)>2500)continue;
      const g=VOL.grid(world,v);let x=this.vm.get(id);
      if(!x||x.rev!==g.rev){if(x)G.free(x.mesh);const vm=volumeMesh(world,v);x={rev:g.rev,mesh:vm.mesh};this.vm.set(id,x);}
      if(x.mesh){gl.uniform1i(u.uMode,0);G.draw(x.mesh,G.frameMat(LW.frame(v.n),v.yaw||0,V.sub(o,cam.pos)));gl.uniform1i(u.uMode,1);}
    }
    for(const id of this.vm.keys())if(!world.volumes[id]){G.free(this.vm.get(id).mesh);this.vm.delete(id);}
    // buildings: anchored in planetary coordinates, re-seated on the terrain every frame
    const roofs=[];
    for(const id in world.buildings){
      const b=world.buildings[id],fy=B.floorY(world,b),o=[b.n[0]*(R+fy),b.n[1]*(R+fy),b.n[2]*(R+fy)],dc=V.dist(o,cam.pos);
      if(dc>Math.max(6000,cam.far))continue;
      const sig=b.rooms.length+'|'+b.doors.length+'|'+b.comps.map(c=>c.kind+c.x.toFixed(2)+c.z.toFixed(2)+(c.rot||0).toFixed(1)).join()+'|'+b.era+'|'+Math.round(b.progress*30)+'|'+Math.round(b.growth*20)+'|'+Object.values(b.mat).join();
      let x=this.bm.get(id);
      if(!x||x.sig!==sig){if(x)for(const k of ['base','full','low','roof'])G.free(x.m[k]);x={sig,m:buildingMesh(world,b)};this.bm.set(id,x);}
      const M=G.frameMat(LW.frame(b.n),b.yaw||0,V.sub(o,cam.pos));
      const cut=b.rooms.length&&cam.dist<70&&V.dist(o,cam.T)<B.radius(b)+8;       // adaptive cutaway near the focus
      if(x.m.base)G.draw(x.m.base,M);
      if(cut){if(x.m.low)G.draw(x.m.low,M);}else{if(x.m.full)G.draw(x.m.full,M);if(x.m.roof)roofs.push([x.m.roof,M,1]);}
    }
    for(const id of this.bm.keys())if(!world.buildings[id]){const x=this.bm.get(id);for(const k of ['base','full','low','roof'])G.free(x.m[k]);this.bm.delete(id);}
    for(const r of roofs)G.draw(r[0],r[1]);
    // creatures and people
    const live={},far=Math.max(500,cam.dist*6);
    const ent=(e,sp)=>{
      const s=this.rstate(world,e,dt);live[e.id]=1;
      const p=this.entPos(world,e,s),dc=V.dist(p,cam.pos);if(dc>far)return;
      const base=G.frameMat(LW.frame(s.n),-s.face,V.sub(p,cam.pos));
      creature(sp,base,s.ph,s.moving,e.posture||(e.st==='rest'?'rest':'stand'),dc>260);
    };
    for(const id in world.organisms){const o=world.organisms[id];ent(o,world.species[o.speciesId]);}
    for(const id in world.persons){const p=world.persons[id];if(p.alive)ent(p,world.species[p.speciesId]);}
    // anonymous cohorts are shown as a few representative, clearly non-individual figures
    const d=E.d(world);
    for(const id in world.cohorts){const c=world.cohorts[id],sp=world.species[c.speciesId];if(c.count<1||!sp)continue;
      const cn=[d.dirs[c.cell*3],d.dirs[c.cell*3+1],d.dirs[c.cell*3+2]];if(V.dist(V.mul(cn,R),cam.pos)>far+2000)continue;
      for(let k=0;k<Math.min(8,c.count);k++){const n=LW.offsetDir(cn,(LW.hrand(c.cell,k,1,0)-0.5)*90,(LW.hrand(c.cell,k,2,0)-0.5)*90,R),r=R+P.height(world,n);
        creature(sp,G.frameMat(LW.frame(n),k*1.3,V.sub([n[0]*r,n[1]*r,n[2]*r],cam.pos)),0,false,'stand',true);}}
    for(const id of this.rs.keys())if(!live[id])this.rs.delete(id);
    // rings: selection + brush footprint draped on the terrain
    for(const rg of opt.rings||[])this.ring(world,cam,rg);
  }
  ring(world,cam,rg){
    const R=world.body.radius,mb=new G.MB(),f=LW.frame(rg.n),a=Math.min(Math.PI*0.6,rg.r/R),SEG=56,th=Math.max(rg.r*0.035,cam.dist*0.004),o=P.surface(world,rg.n),lift=Math.max(0.15,cam.dist*0.003)+(rg.lift||0);
    let pi=null,po=null;
    const pt=(ang,rr)=>{const an=rr/R,dir=[f.e[0]*Math.cos(ang)+f.t[0]*Math.sin(ang),f.e[1]*Math.cos(ang)+f.t[1]*Math.sin(ang),f.e[2]*Math.cos(ang)+f.t[2]*Math.sin(ang)];
      const n=V.norm([rg.n[0]*Math.cos(an)+dir[0]*Math.sin(an),rg.n[1]*Math.cos(an)+dir[1]*Math.sin(an),rg.n[2]*Math.cos(an)+dir[2]*Math.sin(an)]);
      const r=R+(rg.flat!==undefined?rg.flat:Math.max(P.height(world,n),P.waterLevel(world,n)))+lift;return [n[0]*r-o[0],n[1]*r-o[1],n[2]*r-o[2]];};
    for(let k=0;k<=SEG;k++){const ang=k/SEG*6.28319,i=pt(ang,Math.max(0,a*R-th)),q=pt(ang,a*R);if(pi)mb.quad(pi,po,q,i,rg.col||[255,240,180],200);pi=i;po=q;}
    const m=mb.build();G.gl.uniform1i(G.main.u.uMode,2);G.draw(m,G.translate(o[0]-cam.pos[0],o[1]-cam.pos[1],o[2]-cam.pos[2]));G.gl.uniform1i(G.main.u.uMode,1);G.free(m);
  }
}
G.Scene=Scene;

// one full frame
G.render=function(world,cam,terrain,scene,dt,opt){
  const gl=G.gl,R=world.body.radius,b=world.body,amp=P.amplitude(b);
  G.stats.draws=0;G.stats.tris=0;
  gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const sun=opt.studio?V.norm(V.add(V.norm(cam.pos),V.mul(cam.r,0.5))):LW.sunDir(world),center=V.mul(cam.pos,-1);
  const thick=Math.max(R*0.05,amp*1.5)*Math.min(2,Math.max(0.05,b.atmosphere.density)),atm=b.atmosphere.color.map(x=>x*Math.min(1.3,b.atmosphere.density));
  const sc=b.star.color.map(x=>x*Math.min(1.6,0.4+0.6*b.star.lum));
  // sky / atmosphere / stars
  gl.depthMask(false);gl.useProgram(G.sky.p);const s=G.sky.u;
  gl.uniform3fv(s.uF,cam.f);gl.uniform3f(s.uR,cam.r[0]*cam.tanX,cam.r[1]*cam.tanX,cam.r[2]*cam.tanX);gl.uniform3f(s.uU,cam.u[0]*cam.tanY,cam.u[1]*cam.tanY,cam.u[2]*cam.tanY);
  gl.uniform3fv(s.uCenter,center);gl.uniform3fv(s.uSun,sun);gl.uniform3fv(s.uAtm,atm);gl.uniform3fv(s.uSunCol,sc);gl.uniform1f(s.uRad,R);gl.uniform1f(s.uThick,thick);
  gl.bindVertexArray(G.skyVao);gl.drawArrays(gl.TRIANGLES,0,3);gl.depthMask(true);
  // world
  gl.useProgram(G.main.p);const u=G.main.u;
  const rc=V.len(cam.pos),inAtm=1-LW.smooth(0,thick,rc-R),dayC=LW.smooth(-0.2,0.25,V.dot(V.norm(cam.pos),sun));
  gl.uniformMatrix4fv(u.uVP,false,cam.vp);gl.uniform3fv(u.uSun,sun);gl.uniform3fv(u.uSunCol,sc);gl.uniform3fv(u.uCenter,center);
  gl.uniform3f(u.uFog,(atm[0]*0.9+0.1)*dayC,(atm[1]*0.9+0.1)*dayC,(atm[2]*0.9+0.1)*dayC);
  gl.uniform1f(u.uFogD,inAtm*b.atmosphere.density*(cam.depth>0?0:1)/Math.max(400,Math.sqrt(2*R*Math.max(2,cam.alt))*1.6));
  gl.uniform1f(u.uTime,world.tick/LW.TPD*0.9);gl.uniform1f(u.uAmb,opt.studio?0.5:0.2);
  gl.uniform1f(u.uCloud,opt.clouds===false?0:LW.smooth(R*0.25,R*1.2,cam.alt)*Math.min(1,b.atmosphere.density));
  gl.uniform2f(u.uWater,1/Math.max(1.5,amp*0.12),Math.max(0.15,Math.min(amp*0.012,cam.dist*0.02)));
  const cutOn=cam.depth>0.5;
  gl.uniform4f(u.uCut,cam.T[0]-cam.pos[0],cam.T[1]-cam.pos[1],cam.T[2]-cam.pos[2],cutOn?Math.max(4,cam.dist*0.34):0);
  gl.uniform4fv(u.uTint,G.WHITE);gl.uniform1f(u.uAlpha,1);
  terrain.draw(cam,Math.max(900,cam.dist*8)*terrain.quality);
  scene.draw(world,cam,dt,opt);
};
})();
