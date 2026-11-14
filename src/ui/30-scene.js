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
const WOOD=[156,112,72],DARKWOOD=[112,78,50],STONE=[156,154,158];
const tn=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];
function wallRun(mb,ax,az,bx,bz,y0,y1,col,th){const horiz=Math.abs(bz-az)<1e-6,t=th||0.2;mb.box((ax+bx)/2,(y0+y1)/2,(az+bz)/2,horiz?Math.abs(bx-ax)+t:t,y1-y0,horiz?t:Math.abs(bz-az)+t,col);}
// walls with real door openings, door leaves, glazed windows with frames and sills, and a skirting band
function walls(mb,b,H,st,full,wm){
  const trim=tn(st.wall,0.72),glass=[150,190,214],acc=tn(st.roof,0.85);
  for(const m of b.rooms){
    const edges=[[m.x,m.z,m.x+m.w,m.z],[m.x,m.z+m.d,m.x+m.w,m.z+m.d],[m.x,m.z,m.x,m.z+m.d],[m.x+m.w,m.z,m.x+m.w,m.z+m.d]];
    for(const e of edges){
      const horiz=e[1]===e[3],a0=horiz?e[0]:e[1],a1=horiz?e[2]:e[3],gaps=[];
      for(const d of b.doors){const on=horiz?Math.abs(d.z-e[1])<0.06&&d.x>a0&&d.x<a1:Math.abs(d.x-e[0])<0.06&&d.z>a0&&d.z<a1;if(on)gaps.push([horiz?d.x:d.z,0.55,0,2.1,1]);}
      const mid=(a0+a1)/2,out=horiz?(e[1]<m.z+m.d/2?-1:1):(e[0]<m.x+m.w/2?-1:1),inner=horiz?B.roomAt(b,mid,e[1]+out*0.4)>=0:B.roomAt(b,e[0]+out*0.4,mid)>=0;
      if(a1-a0>3.2&&!gaps.length&&!inner)for(const f of (a1-a0>5.4?[0.3,0.7]:[0.5]))gaps.push([a0+(a1-a0)*f,0.6,0.95,2.05,0]);
      gaps.sort((p,q)=>p[0]-q[0]);let s0=a0;
      mb.ey=wm;
      const seg=(p,q,y0,y1,col,th)=>{if(q-p<0.04||y1-y0<0.04)return;if(horiz)wallRun(mb,p,e[1],q,e[1],y0,y1,col||st.wall,th);else wallRun(mb,e[0],p,e[0],q,y0,y1,col||st.wall,th);};
      const at=(a,off)=>horiz?[a,e[1]+off]:[e[0]+off,a];
      for(const g of gaps){
        seg(s0,g[0]-g[1],0,H);
        if(g[2]>0)seg(g[0]-g[1],g[0]+g[1],0,Math.min(H,g[2]));                       // sill wall
        if(full){
          seg(g[0]-g[1],g[0]+g[1],g[3],H);                                             // lintel
          mb.ey=0.01;
          if(g[4]){const hp=at(g[0]-0.5,0),r=0.55;                                     // door leaf, ajar
            mb.box(hp[0]+(horiz?0.42:0.2),1.02,hp[1]+(horiz?0.2:0.42),horiz?0.86:0.06,2.04,horiz?0.06:0.86,DARKWOOD,horiz?r:-r);
            const kp=at(g[0]+0.25,horiz?0.34:0.34);mb.ball(kp[0],1.0,kp[1],0.05,0.05,0.05,6,[226,196,110],0,2);}
          else{                                                                        // window: glass, frame, sill
            const c=at(g[0],0);
            if(horiz){mb.box(c[0],1.5,c[1],1.2,1.1,0.05,glass,0,60);mb.box(c[0],1.5,c[1],0.06,1.1,0.1,trim);mb.box(c[0],1.5,c[1],1.2,0.06,0.1,trim);mb.box(c[0],0.95,c[1],1.36,0.07,0.34,trim);mb.box(c[0],2.06,c[1],1.3,0.07,0.26,trim);}
            else{mb.box(c[0],1.5,c[1],0.05,1.1,1.2,glass,0,60);mb.box(c[0],1.5,c[1],0.1,1.1,0.06,trim);mb.box(c[0],1.5,c[1],0.1,0.06,1.2,trim);mb.box(c[0],0.95,c[1],0.34,0.07,1.36,trim);mb.box(c[0],2.06,c[1],0.26,0.07,1.3,trim);}
            // shutters and a planted window box on the outside face
            for(const sd of [-1,1]){const q=at(g[0]+sd*0.82,out*0.13);if(horiz)mb.box(q[0],1.5,q[1],0.4,1.16,0.05,acc);else mb.box(q[0],1.5,q[1],0.05,1.16,0.4,acc);}
            const fb=at(g[0],out*0.28);if(horiz)mb.box(fb[0],0.84,fb[1],1.24,0.18,0.26,DARKWOOD);else mb.box(fb[0],0.84,fb[1],0.26,0.18,1.24,DARKWOOD);
            mb.ey=0.07;for(let k=0;k<5;k++){const q=at(g[0]-0.48+k*0.24,out*0.28);mb.lump(q[0],1.0,q[1],0.14,0.11,0.14,6,[70,140,72],0,2,0.2,k+3);}
            mb.ey=0;for(let k=0;k<6;k++){const q=at(g[0]-0.5+k*0.2,out*(0.26+(k%2)*0.06));mb.ball(q[0],1.1+(k%3)*0.02,q[1],0.05,0.05,0.05,5,[[240,110,140],[250,214,90],[244,244,250]][k%3],25,2);}
          }
          mb.ey=wm;
        }
        s0=g[0]+g[1];
      }
      seg(s0,a1,0,H);
      if(full){mb.ey=0.08;seg(a0,a1,0,0.22,trim,0.26);}
      mb.ey=0;
    }
  }
}
function furniture(mb,c){
  const cr=Math.cos(c.rot||0),sr=Math.sin(c.rot||0),o=(dx,dz)=>[c.x+dx*cr+dz*sr,c.z-dx*sr+dz*cr],bx=(dx,y,dz,sx,sy,sz,col,em)=>{const q=o(dx,dz);mb.box(q[0],y,q[1],sx,sy,sz,col,c.rot||0,em);};
  const leg=(dx,dz,h,r,col)=>{const q=o(dx,dz);mb.taper(q[0],0,q[1],r*0.8,r,h,6,col||DARKWOOD);};
  const hue=LW.hashStr(c.id||'x')%5,cloth=[[176,84,84],[84,120,176],[96,150,110],[196,150,84],[150,104,170]][hue];
  mb.ey=0.01;
  switch(c.kind){
    case 'bed':
      for(const q of [[-0.48,-0.92],[0.48,-0.92],[-0.48,0.92],[0.48,0.92]])leg(q[0],q[1],0.3,0.05);
      bx(0,0.3,0,1.1,0.12,2.0,WOOD);mb.ey=0.05;bx(0,0.46,0,1.02,0.22,1.92,[236,236,244]);bx(0,0.6,-0.3,1.06,0.1,1.3,cloth);for(let k=0;k<3;k++)bx(0,0.655,-0.75+k*0.42,1.07,0.012,0.06,tn(cloth,0.7));bx(0,0.62,0.34,1.06,0.07,0.16,[244,244,250]);mb.ey=0.01;
      for(const q of [[-0.52,0.98],[0.52,0.98],[-0.52,-0.98],[0.52,-0.98]]){const t=o(q[0],q[1]);mb.loft([[0,0.05,0.05],[q[1]>0?1.05:0.6,0.045,0.045],[q[1]>0?1.14:0.69,0.075,0.075],[q[1]>0?1.22:0.77,0.02,0.02]],8,DARKWOOD,0,1,0,[t[0],0,t[1]]);}
      bx(0,0.62,0.98,1.14,1.0,0.08,WOOD);bx(0,0.42,-0.98,1.14,0.5,0.06,WOOD);
      {const q=o(0,0.72);mb.ball(q[0],0.64,q[1],0.3,0.09,0.18,8,[250,250,255],0,2);}break;
    case 'table':
      bx(0,0.74,0,1.44,0.07,0.94,WOOD);bx(0,0.68,0,1.3,0.06,0.8,DARKWOOD);
      for(const q of [[-0.62,-0.38],[0.62,-0.38],[-0.62,0.38],[0.62,0.38]])leg(q[0],q[1],0.7,0.045);
      {const q=o(0.25,0.05);mb.cyl(q[0],0.775,q[1],0.15,0.02,10,[240,236,226]);const r=o(-0.3,-0.1);mb.taper(r[0],0.775,r[1],0.045,0.055,0.11,8,[214,120,90]);const v=o(-0.05,0.2);mb.taper(v[0],0.775,v[1],0.05,0.035,0.16,8,[110,150,170]);mb.ball(v[0],1.02,v[1],0.1,0.08,0.1,6,[214,90,110],0,2);}
      mb.ey=0.05;bx(0,0.012,0,2.3,0.02,1.7,tn(cloth,0.85));bx(0,0.014,0,1.9,0.02,1.3,tn(cloth,1.1));break;
    case 'chair':
      bx(0,0.45,0,0.46,0.06,0.46,WOOD);for(const q of [[-0.19,-0.19],[0.19,-0.19],[-0.19,0.19],[0.19,0.19]])leg(q[0],q[1],0.44,0.028);
      bx(-0.19,0.75,-0.2,0.05,0.56,0.05,DARKWOOD);bx(0.19,0.75,-0.2,0.05,0.56,0.05,DARKWOOD);bx(0,0.9,-0.2,0.42,0.16,0.04,WOOD);bx(0,0.66,-0.2,0.42,0.08,0.04,WOOD);
      mb.ey=0.05;bx(0,0.5,0,0.4,0.05,0.4,cloth);break;
    case 'stove':
      mb.ey=0.08;bx(0,0.5,0,1.0,1.0,0.7,[150,144,150]);bx(0,0.42,-0.3,0.52,0.5,0.14,[40,30,28]);mb.ey=0.06;for(const d of [-0.12,0.12]){const a=o(d-0.1,-0.34),bq=o(d+0.1,-0.3);mb.limb([a[0],0.22,a[1]],[bq[0],0.24,bq[1]],0.045,0.045,6,[96,70,50]);}mb.ey=0;for(let k=0;k<3;k++){const q=o(-0.1+k*0.1,-0.33);mb.loft([[0.24,0.07,0.05],[0.4+k%2*0.08,0.04,0.03],[0.56+k%2*0.1,0.004,0.004]],6,k===1?[255,226,130]:[255,150,50],250,1,0,[q[0],0,q[1]]);}mb.ey=0.08;
      bx(0,1.04,0,1.12,0.09,0.82,[96,90,98]);bx(0,2.1,0.18,0.42,2.1,0.34,[132,126,134]);
      {const q=o(0.28,-0.05);mb.ball(q[0],1.2,q[1],0.16,0.12,0.16,8,[60,58,64],0,2);mb.cyl(q[0],1.26,q[1],0.17,0.02,8,[80,78,84]);}break;
    case 'chest':
      bx(0,0.26,0,0.9,0.5,0.5,[160,112,66]);{const a=o(-0.47,0),bq=o(0.47,0);mb.limb([a[0],0.5,a[1]],[bq[0],0.5,bq[1]],0.27,0.27,10,[128,88,52]);}
      for(const d of [-0.32,0.32])bx(d,0.3,0,0.06,0.62,0.56,[90,84,90]);bx(0,0.42,-0.27,0.1,0.12,0.04,[226,196,110]);break;
    case 'workbench':
      bx(0,0.84,0,1.64,0.09,0.74,WOOD);for(const q of [[-0.72,-0.28],[0.72,-0.28],[-0.72,0.28],[0.72,0.28]])leg(q[0],q[1],0.8,0.05);bx(0,0.3,0,1.44,0.04,0.56,DARKWOOD);
      bx(0.3,0.93,0.1,0.5,0.06,0.1,[170,170,180]);bx(0.5,0.96,0.1,0.1,0.12,0.2,[120,84,56]);bx(-0.4,0.95,-0.1,0.3,0.12,0.2,[190,140,90]);
      {const q=o(-0.1,0.15);mb.cyl(q[0],0.885,q[1],0.09,0.1,8,[150,150,160]);}break;
    case 'shelf':
      bx(-0.58,0.95,0,0.05,1.9,0.34,DARKWOOD);bx(0.58,0.95,0,0.05,1.9,0.34,DARKWOOD);bx(0,0.95,0.16,1.2,1.9,0.03,tn(DARKWOOD,0.85));
      for(let k=0;k<5;k++){bx(0,0.06+k*0.45,0,1.14,0.04,0.32,WOOD);if(k<4)for(let i=0;i<7;i++){const hgt=0.26+((i*7+k*3)%5)*0.025;bx(-0.46+i*0.15,0.08+k*0.45+hgt/2,-0.02,0.1+((i+k)%3)*0.015,hgt,0.22,[[180,70,60],[70,110,170],[210,180,90],[90,150,110],[150,100,160],[230,224,210]][(i+k*2)%6]);}}
      break;
    case 'lamp':mb.ey=0;{const q=o(0,0);mb.cyl(q[0],0,q[1],0.16,0.04,10,[70,66,64]);mb.taper(q[0],0.04,q[1],0.025,0.02,1.25,6,[70,66,64]);mb.taper(q[0],1.24,q[1],0.24,0.13,0.3,10,[255,232,170],235);}break;
    case 'well':
      mb.ey=0.08;mb.cyl(c.x,0,c.z,0.85,0.8,14,STONE);mb.cyl(c.x,0.8,c.z,0.9,0.08,14,tn(STONE,0.85));mb.ey=0;mb.ex=3;mb.cyl(c.x,0.5,c.z,0.68,0.12,14,[70,130,170]);mb.ex=0;mb.ey=0.01;
      bx(-0.92,1.25,0,0.12,2.5,0.12,WOOD);bx(0.92,1.25,0,0.12,2.5,0.12,WOOD);bx(0,2.0,0,1.9,0.08,0.08,DARKWOOD);
      mb.ey=0.04;mb.gable(c.x-1.1,c.z-0.75,c.x+1.1,c.z+0.75,2.45,0.6,0.12,[150,96,70]);mb.ey=0.01;mb.taper(c.x,1.0,c.z,0.14,0.17,0.26,8,[120,84,56]);mb.box(c.x,1.6,c.z,0.02,0.8,0.02,[200,190,160]);break;
  }
  mb.ey=0;
}
function buildingMesh(world,b){
  const st=ERA[Math.min(b.era||0,ERA.length-1)],base=new G.MB(),full=new G.MB(),low=new G.MB(),roof=new G.MB(),prog=LW.clamp(b.progress,0,1);
  if(b.kind==='field'){
    base.ey=0.13;base.box(0,-0.9,0,12.4,2,10.4,[104,78,58]);
    for(let r=-4;r<=4;r++){base.box(0,0.14,r*1.1,11.6,0.16,0.62,[128,96,66]);
      base.ey=0;if(prog>=1&&b.growth>0.03)for(let i=-9;i<=9;i++){const x=i*0.6+((r*7+i*3)%5)*0.03,hgt=b.growth*(0.75+((i*5+r*3)%7)*0.05);
        base.taper(x,0.2,r*1.1,0.035,0.02,hgt,4,[LW.lerp(110,214,b.growth),LW.lerp(170,184,b.growth),LW.lerp(64,84,b.growth)]);
        if(b.growth>0.55)base.loft([[0.2+hgt*0.78,0.02,0.02],[0.2+hgt*0.9,0.06,0.06],[0.2+hgt*1.12,0.01,0.01]],5,[226,196,96],0,1,0.6,[x,0,r*1.1]);
        else for(const sd of [-1,1])base.limb([x,0.2+hgt*0.4,r*1.1],[x+sd*0.16,0.2+hgt*0.7,r*1.1+sd*0.05],0.03,0.004,3,[96,160,70]);}
      base.ey=0.13;}
    for(const s of [[-6.2,-5.2],[6.2,-5.2],[-6.2,5.2],[6.2,5.2],[0,-5.2],[0,5.2]])base.taper(s[0],0,s[1],0.07,0.06,0.9,5,WOOD);
    for(const z of [-5.2,5.2])base.box(0,0.7,z,12.4,0.06,0.05,WOOD);for(const x of [-6.2,6.2])base.box(x,0.7,0,0.05,0.06,10.4,WOOD);
    return {base:base.build()};
  }
  const H=2.7,wm=(b.era||0)<2?0.14:(b.era||0)<4?0.03:0.02;
  for(const m of b.rooms){
    base.ey=0.08;base.box(m.x+m.w/2,-1.45,m.z+m.d/2,m.w+0.5,2.9,m.d+0.5,st.found);base.ey=0.01;base.box(m.x+m.w/2,0.02,m.z+m.d/2,m.w,0.05,m.d,st.floor);
    for(let k=1;k<m.w/0.6;k++)base.box(m.x+k*0.6,0.047,m.z+m.d/2,0.02,0.004,m.d,tn(st.floor,0.82));       // floorboards
    if(prog>=1){roof.ey=0.04;roof.gable(m.x,m.z,m.x+m.w,m.z+m.d,H,1.8,0.5,st.roof);roof.ey=0.01;
      const along=m.w>=m.d;if(along)roof.box(m.x+m.w/2,H+1.82,m.z+m.d/2,m.w+1.06,0.1,0.16,tn(st.roof,0.8));else roof.box(m.x+m.w/2,H+1.82,m.z+m.d/2,0.16,0.1,m.d+1.06,tn(st.roof,0.8));
      roof.box(m.x+m.w/2,H-0.02,m.z+m.d/2,m.w+0.3,0.06,m.d+0.3,tn(st.wall,0.9));}
    else for(const s of [[m.x,m.z],[m.x+m.w,m.z],[m.x,m.z+m.d],[m.x+m.w,m.z+m.d]])base.taper(s[0],0,s[1],0.08,0.07,3.4,5,WOOD);
  }
  if(b.rooms.length){walls(full,b,H*Math.max(0.12,prog),st,prog>=1,wm);walls(low,b,Math.min(0.9,H*Math.max(0.12,prog)),st,false,wm);}
  if(prog>=1){
    for(const d of b.doors)if(d.b<0){const m=b.rooms[d.a],horiz=Math.abs(d.z-m.z)<0.06||Math.abs(d.z-(m.z+m.d))<0.06,out=horiz?(Math.abs(d.z-m.z)<0.06?-1:1):(Math.abs(d.x-m.x)<0.06?-1:1);
      base.ey=0.08;if(horiz)base.box(d.x,-0.06,d.z+out*0.7,1.9,0.2,1.3,st.found);else base.box(d.x+out*0.7,-0.06,d.z,1.3,0.2,1.9,st.found);
      // porch: two turned posts and a small shingled awning over the entrance
      base.ey=0.01;for(const sd of [-0.8,0.8]){const px=horiz?d.x+sd:d.x+out*1.2,pz=horiz?d.z+out*1.2:d.z+sd;base.loft([[0,0.08,0.08],[0.25,0.06,0.06],[1.9,0.055,0.055],[2.1,0.085,0.085],[2.25,0.06,0.06]],8,WOOD,0,1,0,[px,0.04,pz]);}
      roof.ey=0.04;if(horiz)roof.box(d.x,2.36,d.z+out*0.7,2.1,0.09,1.5,tn(st.roof,0.95));else roof.box(d.x+out*0.7,2.36,d.z,1.5,0.09,2.1,tn(st.roof,0.95));roof.ey=0.01;}
    for(const c of b.comps){furniture(base,c);
      if(c.kind==='stove'&&b.rooms.length){const cr=Math.cos(c.rot||0),sr=Math.sin(c.rot||0);roof.ey=0.02;roof.box(c.x+0.18*sr,H+1.5,c.z+0.18*cr,0.5,2.4,0.42,[170,110,90],c.rot||0);roof.ey=0.08;roof.box(c.x+0.18*sr,H+2.74,c.z+0.18*cr,0.62,0.1,0.54,[96,90,98],c.rot||0);}}
  }else{
    const mats=Object.keys(b.mat).reduce((s,k)=>s+b.mat[k],0);
    if(mats)for(let k=0;k<Math.min(8,Math.ceil(mats/3));k++)base.box(B.radius(b)+0.6,0.1+k*0.16,(k%2)*0.1,1.6,0.14,0.22,WOOD,k%2?0.2:0);
    if(b.kind==='well')base.cyl(0,0,0,0.85,0.3,12,STONE);
  }
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
// ---- creatures: articulated, smooth-shaded bodies built from species anatomy -----------------
const tint=(c,em)=>new Float32Array([c[0]/255,c[1]/255,c[2]/255,em||0]);
const SKIN=[[243,208,182],[228,178,144],[202,148,110],[156,106,76],[110,74,54]],HAIR=[[44,32,26],[92,62,38],[150,108,62],[212,182,122],[128,46,34],[28,26,30]];
const TOPS=[[196,70,70],[70,120,190],[84,160,120],[230,190,90],[150,100,180],[236,236,240],[60,70,90],[230,130,90]],BOTS=[[52,62,96],[70,66,62],[120,96,70],[40,44,52],[110,120,140]];
G.lookOf=function(world,ent,sp){
  const h=LW.hashStr(ent.id),human=sp.id==='sp_human',age=LW.life.ageYears(world,ent),m=Math.max(0.5,sp.lifecycle.mature),old=age>sp.lifecycle.span*0.72;
  return {skin:tint(human?SKIN[h%5]:sp.body.c1),hair:tint(old?[206,206,210]:human?HAIR[(h>>>3)%6]:sp.body.c2||sp.body.c1),top:tint(human||sp.kind==='person'?TOPS[(h>>>6)%8]:sp.body.c2||sp.body.c1),
    bot:tint(BOTS[(h>>>9)%5]),shoe:tint([46,40,38]),eye:tint([30,26,30]),scale:age<m?0.5+0.5*age/m:1,long:ent.sex==='f'?(h>>>12)%3>0:(h>>>12)%5===0,fem:ent.sex==='f',skirt:ent.sex==='f'&&human&&(h>>>15)%2===0};
};
const M_FAB=5,M_FUR=9,M_HAIR=10;
// two-segment limb with shaped (lofted) upper and lower parts; returns the lower joint matrix
function limb2(U,base,x,y,z,r1,r2,rz,w,l1,l2,c1,c2,m1,m2){
  const j=G.part(base,x,y,z,r1,rz,1,1,1);G.draw(U.upper,G.part(j,0,-l1/2,0,0,0,w,l1,w),c1,1,null,m1);
  const k=G.part(j,0,-l1,0,r2,0,1,1,1);G.draw(U.dot,G.part(k,0,0,0,0,0,w*0.8,w*0.8,w*0.8),c1,1,null,m1);
  G.draw(U.lower,G.part(k,0,-l2/2,0,0,0,w*0.92,l2,w*0.92),c2,1,null,m2);return k;
}
function creature(sp,base,ph,moving,posture,simple,look,bob){
  const U=G.unit(),b=sp.body,L=look||{skin:tint(b.c1),hair:tint(b.c2||b.c1),top:tint(b.c2||b.c1),bot:tint(b.c2||b.c1),shoe:tint([46,40,38]),eye:tint([30,26,30]),scale:1},S=b.size*(L.scale||1);
  const c1=tint(b.c1),c2=tint(b.c2||b.c1),sw=moving?Math.sin(ph):0,g=bob||1,WHITE=G.WHITE;
  if(simple){
    if(b.plan==='biped'){G.draw(U.torso,G.part(base,0,S*0.66,0,0,0,S*0.36,S*0.38,S*0.3),L.top);G.draw(U.head,G.part(base,0,S*0.93,0,0,0,S*0.17,S*0.2,S*0.18),L.skin);G.draw(U.pelvis,G.part(base,0,S*0.24,0,0,0,S*0.28,S*0.5,S*0.2),L.bot);}
    else G.draw(U.qbody,G.part(base,0,S*0.6,0,0,0,S*0.48,S*0.5,S*1.1),c1);
    return;
  }
  if(b.plan==='biped'){
    const hip=0.47*S,l1=0.245*S,l2=0.225*S;let root=G.part(base,0,moving?Math.abs(Math.cos(ph))*0.018*S/g:0,0,moving?-0.06:0,0,1,1,1);
    let tA=-sw*0.55,tB=sw*0.55,kA=moving?0.12+0.8*Math.max(0,Math.sin(ph-0.9)):0.03,kB=moving?0.12+0.8*Math.max(0,Math.sin(ph-0.9+Math.PI)):0.03,aA=sw*0.5,aB=-sw*0.5,eA=-0.22-(moving?0.25:0),eB=eA;
    if(posture==='lie'){root=G.part(base,0,0.66,-S*0.45,-Math.PI/2,0,1,1,1);tA=tB=0;kA=kB=0.05;aA=aB=0.08;}
    else if(posture==='sit'){root=G.part(base,0,0.5-hip+0.05,0,0,0,1,1,1);tA=tB=-1.5;kA=kB=1.5;aA=aB=-0.5;eA=eB=-0.7;}
    const fem=L.fem?1:0,sh=(0.178-fem*0.014)*S,skirt=L.skirt&&posture!=='sit';
    for(const q of [[-0.082,tA,kA],[0.082,tB,kB]]){const k=limb2(U,root,q[0]*S,hip,0,q[1],q[2],0,0.125*S,l1,l2,skirt?L.skin:L.bot,skirt?L.skin:L.bot,skirt?0:M_FAB,skirt?0:M_FAB);
      G.draw(U.shoe,G.part(k,0,-l2-0.005*S,0.045*S,0,0,0.09*S,0.07*S,0.2*S),L.shoe);}
    G.draw(U.pelvis,G.part(root,0,hip+0.01*S,0,0,0,(0.3+fem*0.02)*S,0.17*S,0.25*S),L.bot,1,null,M_FAB);
    if(skirt)G.draw(U.skirt,G.part(root,0,hip-0.08*S,0,0,0,0.36*S,0.3*S,0.34*S),L.bot,1,null,M_FAB);
    G.draw(U.torso,G.part(root,0,hip+0.255*S,0,0,0,(0.36-fem*0.03)*S,0.36*S,(0.33+fem*0.02)*S),L.top,1,null,M_FAB);
    G.draw(U.box,G.part(root,0,hip+0.085*S,0,0,0,(0.285+fem*0.02)*S,0.022*S,0.2*S),L.shoe);                       // belt
    const arms=Math.max(0,Math.min(6,b.arms|0));
    for(let a=0;a<arms;a++){const side=a%2?1:-1,row=Math.floor(a/2),k=limb2(U,root,side*sh,hip+0.385*S-row*0.12*S,0,(side>0?aB:aA)*(row?0.6:1),side>0?eB:eA,side*0.1,0.092*S,0.15*S,0.14*S,L.top,L.skin,M_FAB,0);
      G.draw(U.hand,G.part(k,0,-0.165*S,0,0,0,0.085*S,0.1*S,0.05*S),L.skin);}
    const hw=b.head*S*0.74,hh=hw*1.26,hy=hip+0.43*S+hh*0.5;
    G.draw(U.cyl,G.part(root,0,hip+0.435*S,0,0,0,0.07*S,0.06*S,0.07*S),L.skin);
    G.draw(U.head,G.part(root,0,hy,0,0,0,hw,hh,hw),L.skin);
    G.draw(L.long?U.hairLong:U.hair,G.part(root,0,hy,0,0,0,hw*1.07,hh*1.05,hw*1.08),L.hair,1,null,M_HAIR,0.6);
    for(const sx of [-1,1]){
      G.draw(U.dot,G.part(root,sx*hw*0.2,hy+hh*0.06,hw*0.43,0,0,hw*0.17,hh*0.1,hw*0.08),WHITE);
      G.draw(U.dot,G.part(root,sx*hw*0.2,hy+hh*0.055,hw*0.465,0,0,hw*0.085,hh*0.075,hw*0.05),L.eye);
      G.draw(U.box,G.part(root,sx*hw*0.2,hy+hh*0.15,hw*0.45,0,sx*-0.12,hw*0.2,hh*0.025,hw*0.04),L.hair);}
    G.draw(U.box,G.part(root,0,hy-hh*0.27,hw*0.4,0,0,hw*0.24,hh*0.03,hw*0.05),tint([150,70,70]));
    if(b.tail)G.draw(U.cone,G.part(root,0,hip+0.05*S,-0.16*S,-2.2+sw*0.2,0,0.09*S,0.45*S,0.09*S),c2);
    return;
  }
  if(b.plan==='avian'){
    const up=moving?2.2+Math.sin(ph*0.3)*0.3:0.25*S,root=G.part(base,0,up,0,0,0,1,1,1),fl=moving?Math.sin(ph*1.6)*0.8:0.15;
    G.draw(U.qbody,G.part(root,0,0.3*S,0,0,0,0.44*S,0.42*S,0.9*S),c1,1,null,M_FUR);G.draw(U.ball,G.part(root,0,0.5*S,0.4*S,0,0,b.head*S,b.head*S,b.head*S),c1,1,null,M_FUR);
    G.draw(U.cone,G.part(root,0,0.49*S,0.4*S+b.head*S*0.62,1.57,0,0.08*S,0.2*S,0.08*S),c2);G.draw(U.cone,G.part(root,0,0.3*S,-0.55*S,-1.75,0,0.3*S,0.46*S,0.05*S),c2);
    for(const sx of [-1,1]){G.draw(U.ball,G.part(root,sx*0.5*S,0.38*S,0,0,-sx*fl,0.95*S,0.05*S,0.42*S),c1,1,null,M_FUR);G.draw(U.ball,G.part(root,sx*0.9*S,0.38*S-sx*0*fl,-0.05*S,0,-sx*fl*1.3,0.5*S,0.04*S,0.3*S),c2,1,null,M_FUR);
      G.draw(U.ball,G.part(root,sx*b.head*S*0.36,0.53*S,0.4*S+b.head*S*0.3,0,0,b.head*S*0.16,b.head*S*0.16,b.head*S*0.16),L.eye);}
    return;
  }
  if(b.plan==='serpent'||b.plan==='blob'){for(let i=0;i<6;i++)G.draw(U.ball,G.part(base,Math.sin(ph+i*0.9)*0.14*S*(moving?1:0.3),(0.24-i*0.012)*S,(2.2-i)*0.34*S,0,0,(0.5-i*0.045)*S,(0.46-i*0.04)*S,0.55*S),i?c1:c2,1,null,M_FUR);return;}
  // quadruped / hexapod: one continuous lofted body, neck, shaped head with muzzle and ears, jointed legs with hooves
  const hex=b.plan==='hexapod',legs=hex?6:Math.max(2,Math.min(8,b.legs|0)),pairs=Math.ceil(legs/2),len=(hex?0.3:0.5)*S,bl=1.15*S,bw=0.46*S,rest=posture==='lie'||posture==='rest';
  const root=rest?G.part(base,0,-len*0.62,0,0,0,1,1,1):G.part(base,0,moving?Math.abs(Math.cos(ph))*0.02*S/g:0,0,0,0,1,1,1);
  G.draw(U.qbody,G.part(root,0,len+0.22*S,0,0,0,bw,0.5*S,bl),c1,1,null,M_FUR);
  for(let p=0;p<pairs;p++){const z=pairs===1?0:(p/(pairs-1)-0.5)*bl*0.66,s=(p%2?-sw:sw)*(rest?0:0.6),sp2=hex?0.55:0.05,kn=rest?1.6:0.1+(moving?0.4*Math.max(0,p%2?-sw:sw):0);
    for(const side of [-1,1]){const k=limb2(U,root,side*bw*0.3,len+0.1*S,z,side*s-(rest?1.2:0),kn,side*sp2,0.13*S,len*0.56,len*0.5,c1,c1,M_FUR,M_FUR);G.draw(U.cyl,G.part(k,0,-len*0.5,0,0,0,0.09*S,0.07*S,0.1*S),L.shoe);}}
  const hs=b.head*S,hx=len+0.56*S,hz=bl*0.56;
  G.draw(U.lower,G.part(root,0,len+0.42*S,bl*0.42,-2.3,0,0.26*S,0.42*S,0.24*S),c1,1,null,M_FUR);
  G.draw(U.qhead,G.part(root,0,hx,hz+hs*0.3,0.28,0,hs*0.95,hs*0.95,hs*1.7),c1,1,null,M_FUR);
  G.draw(U.ball,G.part(root,0,hx-hs*0.3,hz+hs*1.02,0.28,0,hs*0.34,hs*0.26,hs*0.2),c2);
  for(const side of [-1,1])G.draw(U.dot,G.part(root,side*hs*0.38,hx+hs*0.12,hz+hs*0.42,0,0,hs*0.11,hs*0.11,hs*0.08),L.eye);
  if(b.tail){G.draw(U.cone,G.part(root,0,len+0.34*S,-bl*0.48,-2.0+sw*0.3,0,0.06*S,0.46*S,0.06*S),c1);G.draw(U.ball,G.part(root,0,len+0.14*S,-bl*0.68-sw*0.05*S,0,0,0.11*S,0.16*S,0.11*S),c2,1,null,M_FUR);}
}
G.creature=creature;
// era conveyances, drawn under their rider
function vehicle(kind,base,ph){
  const U=G.unit(),wood=tint([150,108,70]),dark=tint([60,56,60]),metal=tint([150,156,166]),spin=ph*2,wheel=(x,y,z,r)=>{G.draw(U.cyl,G.part(base,x,y,z,spin,1.5708,r*2,0.12,r*2),dark);G.draw(U.cyl,G.part(base,x,y,z,spin,1.5708,r*0.5,0.16,r*0.5),metal);};
  if(kind==='cart'){G.draw(U.box,G.part(base,0,0.62,-0.2,0,0,0.9,0.12,1.5),wood,1,null,1);for(const sx of [-1,1]){G.draw(U.box,G.part(base,sx*0.45,0.8,-0.2,0,0,0.05,0.3,1.5),wood,1,null,1);wheel(sx*0.55,0.42,-0.3,0.42);G.draw(U.box,G.part(base,sx*0.3,0.62,0.9,0,0,0.05,0.05,0.9),wood);}return 0.25;}
  if(kind==='velocipede'){wheel(0,0.45,0.55,0.45);wheel(0,0.3,-0.5,0.3);G.draw(U.box,G.part(base,0,0.72,0.05,0.25,0,0.05,0.05,1.1),metal);G.draw(U.box,G.part(base,0,1.0,0.5,0,0,0.5,0.04,0.04),dark);return 0.42;}
  if(kind==='steam carriage'){G.draw(U.box,G.part(base,0,0.75,0,0,0,1.3,0.5,2.2),tint([120,50,44]));G.draw(U.cyl,G.part(base,0,1.15,0.75,1.5708,0,0.7,0.9,0.7),dark);G.draw(U.cyl,G.part(base,0,1.8,0.95,0,0,0.18,0.7,0.18),dark);for(const sx of [-1,1]){wheel(sx*0.75,0.45,0.7,0.45);wheel(sx*0.75,0.45,-0.7,0.45);}return 0.55;}
  if(kind==='electric car'){G.draw(U.ball,G.part(base,0,0.62,0,0,0,1.5,0.7,2.6),tint([70,150,190]));G.draw(U.ball,G.part(base,0,1.0,-0.1,0,0,1.25,0.6,1.4),tint([190,220,235]));for(const sx of [-1,1]){wheel(sx*0.72,0.32,0.8,0.32);wheel(sx*0.72,0.32,-0.8,0.32);}return 0.3;}
  G.draw(U.ball,G.part(base,0,0.75+Math.sin(ph*0.2)*0.05,0,0,0,1.5,0.4,2.4),tint([226,230,240]));G.draw(U.ball,G.part(base,0,0.55,0,0,0,1.1,0.16,1.9),tint([120,230,255],1.2));return 0.5;
}

class Scene{
  constructor(){this.bm=new Map();this.vm=new Map();this.rs=new Map();this.water=null;this.waterKey='';this.time=0;}
  reset(){for(const x of this.bm.values())for(const k of ['base','full','low','roof'])G.free(x.m[k]);this.bm.clear();for(const x of this.vm.values())G.free(x.mesh);this.vm.clear();this.rs.clear();this.freeWater();}
  freeWater(){if(this.water)for(const s of this.water)G.free(s.mesh);this.water=null;}
  // rivers (ribbons along drainage links) and natural lakes (flat sheets at fill level) from the hydrology state
  buildWater(world,cam){
    const d=E.d(world),R=world.body.radius,riv=world.env.river;if(!riv)return;
    const bucket=Math.round(Math.log2(Math.max(8,cam.alt))*2),key=world.id+'|'+d.rev+'|'+(world.env.rv|0)+'|'+world.colorEpoch+'|'+bucket+'|'+world.terrainEdits.length;
    if(key===this.waterKey)return;this.waterKey=key;this.freeWater();
    const N=d.N,groups={},cell=E.cellSize(world),lines=P.riverLines(world),lift=Math.max(0.04,cam.alt*0.004),thr=Math.max(2,P.amplitude(world.body)*0.02);
    const grp=c=>{const f=Math.floor(c/(N*N)),j=Math.floor(c/N)%N,i=c%N,k=f+'/'+(i>>3)+'/'+(j>>3);
      return groups[k]||(groups[k]={mb:new G.MB(),o:[d.dirs[c*3]*R,d.dirs[c*3+1]*R,d.dirs[c*3+2]*R]});};
    for(let c=0;c<d.C;c++){
      const rl=lines&&lines[c];
      if(rl){
        const g=grp(c),wd=Math.max(rl.half*2,cam.alt*0.009);g.mb.ex=2.5+rl.flux*0.05;
        for(const sg of rl.list){const a=sg[0],b=sg[1],side=V.norm(V.cross(a,V.sub(b,a)));let pl=null,pr=null;
          for(let k=0;k<=2;k++){const n=V.norm(V.lerp(a,b,k/2)),r=R+Math.max(P.height(world,n),P.waterLevel(world,n))+lift;
            const l=[n[0]*r-side[0]*wd/2-g.o[0],n[1]*r-side[1]*wd/2-g.o[1],n[2]*r-side[2]*wd/2-g.o[2]],q=[n[0]*r+side[0]*wd/2-g.o[0],n[1]*r+side[1]*wd/2-g.o[1],n[2]*r+side[2]*wd/2-g.o[2]];
            if(pl)g.mb.quad(pl,pr,q,l,[60,120,150]);pl=l;pr=q;}}
      }else if(riv[c]===2&&d.filled[c]-d.h[c]>thr){
        const g=grp(c),f=Math.floor(c/(N*N)),j=Math.floor(c/N)%N,i=c%N,r=R+d.filled[c]-0.3;g.mb.ex=6;
        const pt=(u,v)=>{const n=LW.faceDir(f,(i+u)/N*2-1,(j+v)/N*2-1);return [n[0]*r-g.o[0],n[1]*r-g.o[1],n[2]*r-g.o[2]];};
        for(let y=0;y<3;y++)for(let x=0;x<3;x++)g.mb.quad(pt(-0.1+x*0.4,-0.1+y*0.4),pt(0.3+x*0.4,-0.1+y*0.4),pt(0.3+x*0.4,0.3+y*0.4),pt(-0.1+x*0.4,0.3+y*0.4),[60,120,150]);
      }
    }
    this.water=[];for(const k in groups){const m=groups[k].mb.build();if(m)this.water.push({mesh:m,o:groups[k].o});}
  }
  // roads: ribbons draped on the canonical terrain; surface follows the builders' era
  buildRoads(world,cam){
    const key=world.id+'|'+(world.roadRev|0)+'|'+P.terrainRev(world)+'|'+(world.env.rv|0)+'|'+Math.round(Math.log2(Math.max(8,cam.alt)));
    if(key===this.roadKey)return;this.roadKey=key;if(this.roadMeshes)for(const m of this.roadMeshes)G.free(m.mesh);this.roadMeshes=[];
    const R=world.body.radius,lift=Math.max(0.07,cam.alt*0.003);
    for(const id in world.roads){const r=world.roads[id],s=world.settlements[r.settlement],era=s?s.era:0,mb=new G.MB(),o=V.mul(r.pts[0],R);
      const wd=Math.max(r.by==='player'?3:2,cam.alt*0.006),col=era>=6?[70,70,78]:era>=2?[150,146,140]:[156,128,94];mb.ey=era>=2?0.08:0.13;
      for(let i=0;i<r.pts.length-1;i++){const a=r.pts[i],b=r.pts[i+1],side=V.norm(V.cross(a,V.sub(b,a))),n=Math.max(1,Math.ceil(LW.arcDist(a,b,R)/5));let pl=null,pr=null;
        for(let k=0;k<=n;k++){const q=V.norm(V.lerp(a,b,k/n)),rr=R+Math.max(P.height(world,q),P.waterLevel(world,q))+lift;
          const l=[q[0]*rr-side[0]*wd/2-o[0],q[1]*rr-side[1]*wd/2-o[1],q[2]*rr-side[2]*wd/2-o[2]],p2=[q[0]*rr+side[0]*wd/2-o[0],q[1]*rr+side[1]*wd/2-o[1],q[2]*rr+side[2]*wd/2-o[2]];
          if(pl)mb.quad(pl,pr,p2,l,col);pl=l;pr=p2;}}
      const mesh=mb.build();if(mesh)this.roadMeshes.push({mesh,o});}
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
    const gl=G.gl,R=world.body.radius,sp_=!!opt.shadowPass,mode=m=>gl.uniform1i(G.cur.u.uMode||null,m),lim=opt.shadowR||0;this.time+=dt;
    mode(1);
    if(!sp_){
      this.buildWater(world,cam);
      this.buildRoads(world,cam);for(const s of this.roadMeshes)G.draw(s.mesh,G.translate(s.o[0]-cam.pos[0],s.o[1]-cam.pos[1],s.o[2]-cam.pos[2]));
      if(this.water)for(const s of this.water)G.draw(s.mesh,G.translate(s.o[0]-cam.pos[0],s.o[1]-cam.pos[1],s.o[2]-cam.pos[2]),null,1,[s.o[0]%256,s.o[1]%256,s.o[2]%256]);
      // dig sites
      for(const id in world.volumes){
        const v=world.volumes[id],o=P.surface(world,v.n);if(V.dist(o,cam.pos)>2500)continue;
        const g=VOL.grid(world,v);let x=this.vm.get(id);
        if(!x||x.rev!==g.rev){if(x)G.free(x.mesh);const vm=volumeMesh(world,v);x={rev:g.rev,mesh:vm.mesh};this.vm.set(id,x);}
        if(x.mesh){mode(0);G.draw(x.mesh,G.frameMat(LW.frame(v.n),v.yaw||0,V.sub(o,cam.pos)));mode(1);}
      }
      for(const id of this.vm.keys())if(!world.volumes[id]){G.free(this.vm.get(id).mesh);this.vm.delete(id);}
    }
    // buildings: anchored in planetary coordinates, re-seated on the terrain every frame
    const roofs=[];
    for(const id in world.buildings){
      const b=world.buildings[id],fy=B.floorY(world,b),o=[b.n[0]*(R+fy),b.n[1]*(R+fy),b.n[2]*(R+fy)],dc=V.dist(o,cam.pos);
      if(dc>Math.max(6000,cam.far)||(sp_&&V.dist(o,cam.T)>lim))continue;
      const sig=b.rooms.length+'|'+b.doors.length+'|'+b.comps.map(c=>c.kind+c.x.toFixed(2)+c.z.toFixed(2)+(c.rot||0).toFixed(1)).join()+'|'+b.era+'|'+Math.round(b.progress*30)+'|'+Math.round(b.growth*20)+'|'+Object.values(b.mat).join();
      let x=this.bm.get(id);
      if(!x||x.sig!==sig){if(x)for(const k of ['base','full','low','roof'])G.free(x.m[k]);x={sig,m:buildingMesh(world,b)};this.bm.set(id,x);}
      const M=G.frameMat(LW.frame(b.n),b.yaw||0,V.sub(o,cam.pos));
      const cut=b.rooms.length&&cam.dist<70&&V.dist(o,cam.T)<B.radius(b)+8;       // adaptive cutaway near the focus
      if(x.m.base)G.draw(x.m.base,M);
      if(cut){if(x.m.low)G.draw(x.m.low,M);}else{if(x.m.full)G.draw(x.m.full,M);if(x.m.roof)roofs.push([x.m.roof,M,1]);}
    }
    if(!sp_)for(const id of this.bm.keys())if(!world.buildings[id]){const x=this.bm.get(id);for(const k of ['base','full','low','roof'])G.free(x.m[k]);this.bm.delete(id);}
    for(const r of roofs)G.draw(r[0],r[1]);
    // creatures and people
    const live={},far=sp_?lim:Math.max(500,cam.dist*6),bob=Math.sqrt(Math.max(0.3,world.body.gravity)/9.8);
    const ent=(e,sp)=>{
      const s=this.rstate(world,e,sp_?0:dt*bob);live[e.id]=1;
      const p=this.entPos(world,e,s),dc=V.dist(p,sp_?cam.T:cam.pos);if(dc>far)return;
      if(!s.look||s.lookT!==Math.floor(world.tick/LW.TPD)){s.look=G.lookOf(world,e,sp);s.lookT=Math.floor(world.tick/LW.TPD);}
      const base=G.frameMat(LW.frame(s.n),-s.face,V.sub(p,cam.pos));
      let seat=0;if(e.ride&&dc<400)seat=vehicle(e.ride,base,s.ph);
      creature(sp,seat?G.part(base,0,seat,e.ride==='cart'?-0.1:0,0,0,1,1,1):base,s.ph,seat?false:s.moving,seat?'sit':(e.posture||(e.st==='rest'?'rest':'stand')),!sp_&&dc>220,s.look,bob);
    };
    for(const id in world.organisms){const o=world.organisms[id];ent(o,world.species[o.speciesId]);}
    for(const id in world.persons){const p=world.persons[id];if(p.alive)ent(p,world.species[p.speciesId]);}
    if(sp_)return;
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
  const upC=V.norm(cam.pos),sun=opt.studio?V.norm(V.add(upC,V.add(V.mul(cam.r,0.75),V.mul(cam.u,0.35)))):LW.sunDir(world),center=V.mul(cam.pos,-1);
  const sunUp=V.dot(upC,sun),dayC=LW.smooth(-0.2,0.25,sunUp),low=1-Math.abs(dayC*2-1);
  // ---- sun shadow pass (near views only; skipped on the low quality tier) ----
  const q=terrain.quality,wantSh=opt.shadows!==false&&q>=0.7&&cam.dist<900&&cam.depth<=0&&sunUp>0.06;
  const tgt=G.shadowTarget(wantSh&&q>0.9?2048:1024);let lightVP=null;
  if(wantSh&&tgt){
    const S=LW.clamp(cam.dist*1.5,24,520),D=S*4+300,Trel=V.sub(cam.T,cam.pos),f=V.mul(sun,-1);
    let r=V.cross(f,cam.n);r=V.len(r)<1e-4?cam.r:V.norm(r);const u=V.cross(r,f);
    lightVP=G.mul(G.ortho(S,S,-D,D),G.mul(G.viewRot(r,u,f),G.translate(-Trel[0],-Trel[1],-Trel[2])));
    gl.bindFramebuffer(gl.FRAMEBUFFER,tgt.fbo);gl.viewport(0,0,tgt.size,tgt.size);gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(G.shadowProg.p);G.cur=G.shadowProg;gl.uniformMatrix4fv(G.shadowProg.u.uVP,false,lightVP);
    gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(2,4);
    terrain.draw(cam,S*1.25,S*2.2);scene.draw(world,cam,0,{shadowPass:true,shadowR:S*1.6});
    gl.disable(gl.POLYGON_OFFSET_FILL);gl.bindFramebuffer(gl.FRAMEBUFFER,null);G.cur=G.main;
  }
  gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const thick=Math.max(R*0.05,amp*1.5)*Math.min(2,Math.max(0.05,b.atmosphere.density)),atm=b.atmosphere.color.map(x=>x*Math.min(1.3,b.atmosphere.density));
  const k0=Math.min(1.6,0.4+0.6*b.star.lum),warm=[1,0.66,0.4],sc=b.star.color.map((x,i)=>LW.lerp(x,x*warm[i],opt.studio?0:low*0.8)*k0);
  // sky / atmosphere / stars
  gl.depthMask(false);gl.useProgram(G.sky.p);const s=G.sky.u;
  gl.uniform3fv(s.uF,cam.f);gl.uniform3f(s.uR,cam.r[0]*cam.tanX,cam.r[1]*cam.tanX,cam.r[2]*cam.tanX);gl.uniform3f(s.uU,cam.u[0]*cam.tanY,cam.u[1]*cam.tanY,cam.u[2]*cam.tanY);
  gl.uniform3fv(s.uCenter,center);gl.uniform3fv(s.uSun,sun);gl.uniform3fv(s.uAtm,atm);gl.uniform3fv(s.uSunCol,sc);gl.uniform1f(s.uRad,R);gl.uniform1f(s.uThick,thick);
  gl.bindVertexArray(G.skyVao);gl.drawArrays(gl.TRIANGLES,0,3);gl.depthMask(true);
  // world
  const rc=V.len(cam.pos),inAtm=1-LW.smooth(0,thick,rc-R),lin=c=>-Math.log(1-Math.min(0.97,Math.pow(Math.max(0,c),2.2)))/1.35;
  const hz=[LW.lerp(atm[0]*1.05+0.16,1,low*0.5),LW.lerp(atm[1]*1.05+0.16,0.66,low*0.5),LW.lerp(atm[2]*1.05+0.16,0.44,low*0.5)];
  const amb=opt.studio?[0.36,0.37,0.42]:[LW.lerp(0.045,atm[0]*0.36+0.16,dayC),LW.lerp(0.055,atm[1]*0.36+0.16,dayC),LW.lerp(0.1,atm[2]*0.36+0.18,dayC)];
  const cutOn=cam.depth>0.5;
  gl.activeTexture(gl.TEXTURE0);if(tgt)gl.bindTexture(gl.TEXTURE_2D,tgt.tex);
  for(const prog of [G.terr,G.main]){gl.useProgram(prog.p);const u=prog.u;
  gl.uniformMatrix4fv(u.uVP,false,cam.vp);gl.uniform3fv(u.uSun,sun);gl.uniform3fv(u.uSunCol,sc);gl.uniform3fv(u.uCenter,center);
  gl.uniform3f(u.uFog,lin(hz[0]*dayC),lin(hz[1]*dayC),lin(hz[2]*dayC));
  gl.uniform1f(u.uFogD,inAtm*b.atmosphere.density*(cam.depth>0?0:1)/Math.max(1400,Math.sqrt(2*R*Math.max(2,cam.alt))*3.2));
  gl.uniform1f(u.uTime,world.tick/LW.TPD*0.9);gl.uniform1f(u.uAnim,(performance.now()/1000)%4000);
  gl.uniform3fv(u.uAmbCol,amb);gl.uniform3f(u.uSkyRefl,(atm[0]*0.8+0.1)*dayC+0.01,(atm[1]*0.8+0.1)*dayC+0.012,(atm[2]*0.8+0.1)*dayC+0.02);
  gl.uniform1f(u.uCloud,opt.clouds===false?0:LW.smooth(R*0.25,R*1.2,cam.alt)*Math.min(1,b.atmosphere.density));
  gl.uniform2f(u.uWater,1/Math.max(1.5,amp*0.12),Math.max(0.15,Math.min(amp*0.012,cam.dist*0.02)));
  gl.uniform4f(u.uCut,cam.T[0]-cam.pos[0],cam.T[1]-cam.pos[1],cam.T[2]-cam.pos[2],cutOn?Math.max(4,cam.dist*0.34):0);
  gl.uniform4fv(u.uTint,G.WHITE);gl.uniform1f(u.uAlpha,1);
  gl.uniform1i(u.uShadow,0);
  gl.uniform1f(u.uShadowOn,lightVP?1:0);gl.uniform1f(u.uShadowTx,tgt?1/tgt.size:0);if(lightVP)gl.uniformMatrix4fv(u.uShadowM,false,lightVP);
  }
  G.cur=G.main;
  G.shadowActive=!!lightVP;
  terrain.draw(cam,Math.max(900,cam.dist*8)*terrain.quality);
  scene.draw(world,cam,dt,opt);
};
})();
