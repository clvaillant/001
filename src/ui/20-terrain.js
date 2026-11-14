// presentation / terrain: cube-sphere quadtree LOD. Every vertex samples the canonical LW.planet.height,
// so all levels of detail show the same world. Chunk vertices are stored relative to a double-precision
// chunk centre and drawn camera-relative (floating origin) to keep GPU precision at any planet size.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V,G=LW.gfx,E=LW.env,P=LW.planet;
const GN=20,GV=GN+1,NV=GV*GV+4*GV;
let IDX=null;
function indices(){
  if(IDX)return IDX;const a=[];
  for(let y=0;y<GN;y++)for(let x=0;x<GN;x++){const i=y*GV+x;a.push(i,i+1,i+GV+1,i,i+GV+1,i+GV);}
  const S=GV*GV,edge=[k=>k,k=>GN*GV+k,k=>k*GV,k=>k*GV+GN];
  for(let e=0;e<4;e++)for(let k=0;k<GN;k++){const a0=edge[e](k),a1=edge[e](k+1),s0=S+e*GV+k,s1=s0+1;a.push(a0,a1,s1,a0,s1,s0);}
  return IDX=new Uint16Array(a);
}
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
// vegetation actually present near n (cell lookup with a small deterministic jitter to soften cell borders)
function vegAt(world,n,d){
  const q=d.N*1.7,j=0.5/d.N;
  const m=V.norm([n[0]+j*LW.sharedNoise(n[0]*q*9,n[1]*q*9,n[2]*q*9),n[1]+j*LW.sharedNoise(n[0]*q*9+40,n[1]*q*9,n[2]*q*9),n[2]+j*LW.sharedNoise(n[0]*q*9,n[1]*q*9+70,n[2]*q*9)]);
  const c=E.cellOf(world,m),v=world.env.veg[c];
  return {c,v,sp:v?world.species[world.env.plants[world.env.vsp[c]-1]]:null};
}
// Chromatic Tectonics palette: mineral ground by biome suitability, banded by altitude, exposed strata on
// slopes, snow by temperature; green (or any species colour) appears ONLY where plants actually live.
G.terrainColor=function(world,n,h,wl,slope,d,amp){
  if(h<wl)return [86,120,128];
  const cl=E.climate(world,n,h),B=LW.BIOMES[cl.biome],rel=LW.clamp((h-world.body.seaLevel)/amp,0,1.2);
  let c=B.g;
  c=mix(c,[150,118,172],LW.smooth(0.3,0.85,rel)*0.6);
  const band=Math.floor(rel*16),sh=band%2?1.0:0.9;
  c=[c[0]*sh,c[1]*sh,c[2]*sh];
  if(slope>0.45)c=mix(c,[92,80,100],LW.smooth(0.45,1.2,slope)*0.75);
  const vg=vegAt(world,n,d);
  if(vg.v>3&&vg.sp){
    let vc=vg.sp.body.c1;
    if(vg.sp.plant.form==='broadleaf'&&cl.temp<9)vc=mix(vc,[214,146,60],LW.smooth(9,3,cl.temp));       // autumn
    c=mix(c,[vc[0]*sh,vc[1]*sh,vc[2]*sh],(0.3+0.6*Math.min(1,vg.v/180))*(1-LW.smooth(0.7,1.3,slope)));
  }
  if(cl.temp<-2&&cl.biome!==4)c=mix(c,[238,243,250],LW.smooth(-2,-9,cl.temp));
  if(h-wl<amp*0.006+0.5&&cl.temp>-2)c=mix(c,[228,210,164],0.65);
  return c;
};
const TRUNK=[112,84,62];
const tone=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];
// rounded, smooth-shaded flora. `lod` true = distant clump: fewer parts.
function plant(mb,form,c1,s,rnd,lod){
  const j=0.85+rnd*0.3,c=tone(c1,j),hh=0.85+rnd*0.4;
  switch(form){
    case 'broadleaf':
      mb.taper(0,0,0,0.34*s,0.2*s,3.2*s*hh,6,TRUNK);
      mb.ball(0,4.5*s*hh,0,2.5*s,2.0*s,2.5*s,lod?6:10,c,0,lod?2:4);
      if(!lod){mb.ball(1.5*s,3.8*s*hh,0.5*s,1.6*s,1.35*s,1.6*s,7,tone(c,0.9),0,3);mb.ball(-1.3*s,3.9*s*hh,-0.7*s,1.5*s,1.25*s,1.5*s,7,tone(c,1.08),0,3);
        mb.ball(0.3*s,5.7*s*hh,0.3*s,1.5*s,1.15*s,1.5*s,7,tone(c,1.12),0,3);mb.taper(0.2*s,2.2*s*hh,0,0.12*s,0.06*s,1.6*s,4,TRUNK);}
      break;
    case 'conifer':
      mb.taper(0,0,0,0.26*s,0.14*s,2.2*s,6,TRUNK);
      for(let k=0;k<(lod?2:4);k++){const y=(1.3+k*(lod?2.2:1.25))*s*hh,r=(2.3-k*(lod?0.9:0.48))*s;mb.taper(0,y,0,r,r*0.12,(lod?3.4:2.3)*s*hh,lod?6:8,tone(c,0.9+k*0.06));}
      break;
    case 'cactus':
      mb.taper(0,0,0,0.34*s,0.3*s,3*s*hh,8,c);mb.ball(0,3*s*hh,0,0.3*s,0.3*s,0.3*s,8,c,0,2);
      if(!lod){mb.ball(0.6*s,1.7*s,0,0.42*s,0.2*s,0.2*s,6,c,0,2);mb.taper(0.9*s,1.7*s,0,0.2*s,0.18*s,1.2*s,6,c);mb.ball(0.9*s,2.9*s,0,0.19*s,0.19*s,0.19*s,6,c,0,2);}
      break;
    case 'glowcap':mb.taper(0,0,0,0.3*s,0.2*s,2.3*s,6,[226,216,236]);mb.ball(0,2.4*s,0,1.7*s,0.75*s,1.7*s,9,c,110,3);break;
    case 'crystal':mb.taper(0,0,0,0.6*s,0,3.2*s*hh,5,c,90);mb.taper(0.7*s,0,0.3*s,0.35*s,0,1.7*s,5,tone(c,0.9),90);mb.taper(-0.5*s,0,-0.4*s,0.3*s,0,1.3*s,5,tone(c,1.1),90);break;
    case 'bush':mb.ball(0,0.4*s,0,0.75*s,0.5*s,0.75*s,9,c,0,3);mb.ball(0.5*s,0.32*s,0.3*s,0.48*s,0.38*s,0.48*s,8,tone(c,0.92),0,3);mb.ball(-0.4*s,0.3*s,-0.3*s,0.42*s,0.34*s,0.42*s,8,tone(c,1.06),0,3);break;
    default:for(let k=0;k<6;k++)mb.taper((k%3-1)*0.16*s+rnd*0.05,0,((k>>1)-1)*0.14*s,0.035*s,0,(0.12+rnd*0.14+k*0.02)*s,3,tone(c,0.92+k*0.04));
  }
}
class Terrain{
  constructor(){this.nodes=new Map();this.frame=0;this.quality=1;this.sig='';this.queue=[];this.visible=[];this.built=0;}
  reset(){for(const nd of this.nodes.values()){G.free(nd.mesh);G.free(nd.props);}this.nodes.clear();}
  node(f,l,i,j){
    const key=f+'/'+l+'/'+i+'/'+j;let nd=this.nodes.get(key);
    if(!nd){const size=2/Math.pow(2,l),nMid=LW.faceDir(f,-1+(i+0.5)*size,-1+(j+0.5)*size);
      nd={key,f,l,i,j,size,nMid,c:null,mesh:null,props:null,stale:true,urgent:false,last:0,rad:0,sig:''};this.nodes.set(key,nd);}
    return nd;
  }
  build(world,nd){
    const R=world.body.radius,amp=Math.max(1,P.amplitude(world.body)),d=E.d(world);
    const u0=-1+nd.i*nd.size,v0=-1+nd.j*nd.size,edge=R*Math.PI/2*nd.size/2,ql=edge/GN;
    const hm=P.height(world,nd.nMid),C=[nd.nMid[0]*(R+hm),nd.nMid[1]*(R+hm),nd.nMid[2]*(R+hm)];
    const pos=new Float32Array(NV*3),col=new Uint8Array(NV*4),ex=new Float32Array(NV*2),N=new Array(GV*GV),H=new Float64Array(GV*GV),W=new Float64Array(GV*GV);
    let mn=1e9,mx=-1e9;
    for(let y=0;y<GV;y++)for(let x=0;x<GV;x++){
      const k=y*GV+x,n=LW.faceDir(nd.f,u0+x/GN*nd.size,v0+y/GN*nd.size),h=P.height(world,n),wl=P.waterLevel(world,n),r=R+Math.max(h,wl);
      N[k]=n;H[k]=h;W[k]=wl;if(h<mn)mn=h;if(h>mx)mx=h;
      pos[k*3]=n[0]*r-C[0];pos[k*3+1]=n[1]*r-C[1];pos[k*3+2]=n[2]*r-C[2];
    }
    const vols=[];
    if(ql<=3.5)for(const id in world.volumes){const v=world.volumes[id];if(V.dist(v.n,nd.nMid)*R<edge+60)vols.push(v);}
    for(let y=0;y<GV;y++)for(let x=0;x<GV;x++){
      const k=y*GV+x,xa=Math.max(0,x-1),xb=Math.min(GN,x+1),ya=Math.max(0,y-1),yb=Math.min(GN,y+1);
      const sx=(H[y*GV+xb]-H[y*GV+xa])/((xb-xa)*ql),sy=(H[yb*GV+x]-H[ya*GV+x])/((yb-ya)*ql);
      const c=G.terrainColor(world,N[k],H[k],W[k],Math.sqrt(sx*sx+sy*sy),d,amp);
      col[k*4]=c[0];col[k*4+1]=c[1];col[k*4+2]=c[2];col[k*4+3]=0;
      ex[k*2]=W[k]-H[k];
      for(const v of vols){const l=LW.volumes.contains(world,v,N[k]);if(l&&Math.abs(l[0])<v.nx*v.cell/2-ql*1.1&&Math.abs(l[1])<v.nz*v.cell/2-ql*1.1)ex[k*2+1]=1;}
    }
    // smooth per-vertex normals from the sampled surface (flat on water)
    const nrm=new Int8Array(NV*3);
    for(let y=0;y<GV;y++)for(let x=0;x<GV;x++){
      const k=y*GV+x,a=y*GV+Math.max(0,x-1),b=y*GV+Math.min(GN,x+1),c=Math.max(0,y-1)*GV+x,e=Math.min(GN,y+1)*GV+x,n=N[k];
      const ux=pos[b*3]-pos[a*3],uy=pos[b*3+1]-pos[a*3+1],uz=pos[b*3+2]-pos[a*3+2],vx=pos[e*3]-pos[c*3],vy=pos[e*3+1]-pos[c*3+1],vz=pos[e*3+2]-pos[c*3+2];
      let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1,sg=(nx*n[0]+ny*n[1]+nz*n[2])<0?-127/l:127/l;
      nrm[k*3]=Math.round(nx*sg);nrm[k*3+1]=Math.round(ny*sg);nrm[k*3+2]=Math.round(nz*sg);
    }
    const S=GV*GV,sk=edge*0.06+1,edgeIx=[k=>k,k=>GN*GV+k,k=>k*GV,k=>k*GV+GN];
    for(let e=0;e<4;e++)for(let k=0;k<GV;k++){
      const a=edgeIx[e](k),s=S+e*GV+k,n=N[a];
      nrm[s*3]=nrm[a*3];nrm[s*3+1]=nrm[a*3+1];nrm[s*3+2]=nrm[a*3+2];
      pos[s*3]=pos[a*3]-n[0]*sk;pos[s*3+1]=pos[a*3+1]-n[1]*sk;pos[s*3+2]=pos[a*3+2]-n[2]*sk;
      col[s*4]=col[a*4];col[s*4+1]=col[a*4+1];col[s*4+2]=col[a*4+2];ex[s*2]=ex[a*2];ex[s*2+1]=ex[a*2+1];
    }
    G.free(nd.mesh);G.free(nd.props);
    nd.mesh=G.mesh(pos,col,ex,indices(),nrm);nd.c=C;nd.off=new Float32Array([((C[0]%256)+256)%256,((C[1]%256)+256)%256,((C[2]%256)+256)%256]);nd.rad=edge*0.75+(mx-mn)+sk;nd.edge=edge;nd.props=null;
    // scale-appropriate flora and boulders, deterministic per chunk; larger "clump" scale on coarser chunks
    if(edge<=700){
      const mb=new G.MB(),seed=LW.hashInt(nd.f,nd.l,nd.i,nd.j),s=LW.clamp(edge/90,1,5),cnt=LW.clamp(Math.round(edge*edge/120),3,44),blds=Object.values(world.buildings).filter(b=>V.dist(b.n,nd.nMid)*R<edge+40);
      for(let k=0;k<cnt;k++){
        const n=LW.faceDir(nd.f,u0+LW.hrand(seed,k,1,0)*nd.size,v0+LW.hrand(seed,k,2,0)*nd.size),h=P.height(world,n);
        if(h<P.waterLevel(world,n)+0.3||LW.volumes.at(world,n)||blds.some(b=>V.dist(b.n,n)*R<LW.build.radius(b)+3.5*s))continue;
        const vg=vegAt(world,n,d),r=LW.hrand(seed,k,3,0);
        const f=LW.frame(n);mb.T={o:[n[0]*(R+h)-C[0],n[1]*(R+h)-C[1],n[2]*(R+h)-C[2]],e:f.e,u:n,t:f.t};
        if(vg.sp&&vg.sp.plant.tree&&r<vg.v/255*1.1)plant(mb,vg.sp.plant.form,vg.sp.body.c1,s*(0.7+LW.hrand(seed,k,4,0)*0.6),LW.hrand(seed,k,5,0),s>1.8);
        else if(vg.sp&&!vg.sp.plant.tree&&edge<120&&r<vg.v/255)plant(mb,'tuft',vg.sp.body.c1,s,LW.hrand(seed,k,5,0));
        else if(r>0.93)mb.ball(0,0.25*s,0,0.9*s,0.6*s,0.8*s,7,[124,118,122],0,2);
      }
      // close-up ground cover: grass tufts and bushes where plants actually live
      if(edge<90)for(let k=0;k<70;k++){
        const n=LW.faceDir(nd.f,u0+LW.hrand(seed,k,11,0)*nd.size,v0+LW.hrand(seed,k,12,0)*nd.size),h=P.height(world,n);
        if(h<P.waterLevel(world,n)+0.15||LW.volumes.at(world,n)||blds.some(b=>V.dist(b.n,n)*R<LW.build.radius(b)+0.6))continue;
        const vg=vegAt(world,n,d),r=LW.hrand(seed,k,13,0);if(!vg.sp||r>vg.v/200)continue;
        const f=LW.frame(n),c1=vg.sp.body.c1,g=vg.sp.plant.tree?[c1[0]*0.9+30,c1[1]*0.95+30,c1[2]*0.8+10]:c1;
        mb.T={o:[n[0]*(R+h)-C[0],n[1]*(R+h)-C[1],n[2]*(R+h)-C[2]],e:f.e,u:n,t:f.t};
        plant(mb,LW.hrand(seed,k,14,0)<0.14&&vg.sp.plant.form!=='cactus'&&vg.sp.plant.form!=='crystal'?'bush':'tuft',g,0.7+LW.hrand(seed,k,15,0)*0.7,LW.hrand(seed,k,16,0));
      }
      nd.props=mb.build();
    }
    nd.stale=false;nd.urgent=false;this.built++;
  }
  invalidate(world,n,r){
    const R=world.body.radius;
    for(const nd of this.nodes.values())if(nd.mesh&&V.dist(nd.nMid,n)*R<r*1.6+nd.edge*0.8){nd.stale=true;nd.urgent=true;}
  }
  invalidateAll(){for(const nd of this.nodes.values())nd.stale=true;}
  // choose visible chunks for this camera; build missing/stale ones within a time budget
  update(world,cam,budgetMs){
    this.frame++;const R=world.body.radius,amp=P.amplitude(world.body);
    const sig=world.id+'|'+world.body.seaLevel+'|'+world.colorEpoch+'|'+world.genEpoch+'|'+world.body.atmosphere.baseTemp+'|'+world.body.axialTilt;
    if(sig!==this.sig){this.sig=sig;this.invalidateAll();}
    const maxL=Math.max(1,Math.floor(Math.log2(R*Math.PI/2/8))),K=2.5*this.quality;
    const rc=V.len(cam.pos),cd=V.mul(cam.pos,1/rc);
    const hz=Math.acos(LW.clamp((R-amp)/rc,-1,1))+Math.acos(LW.clamp((R-amp)/(R+amp+1),-1,1))+0.02;
    const vols=Object.values(world.volumes).filter(v=>V.dist(P.surface(world,v.n),cam.pos)<500);
    this.visible=[];this.queue=[];
    const want=nd=>{if(!nd.mesh||nd.stale)this.queue.push(nd);};
    const rec=nd=>{
      nd.last=this.frame;
      const edge=R*Math.PI/2*nd.size/2,c=nd.c||[nd.nMid[0]*R,nd.nMid[1]*R,nd.nMid[2]*R];
      const rel=[c[0]-cam.pos[0],c[1]-cam.pos[1],c[2]-cam.pos[2]],dist=Math.max(0,V.len(rel)-edge*0.62);
      nd.dist=dist;
      if(nd.l>0){
        if(Math.acos(LW.clamp(V.dot(nd.nMid,cd),-1,1))>hz+edge/R*0.8)return;
        const rad=(nd.rad||edge)*1.3,z=V.dot(rel,cam.f);
        if(z<-rad||Math.abs(V.dot(rel,cam.r))>z*cam.tanX+rad*2||Math.abs(V.dot(rel,cam.u))>z*cam.tanY+rad*2)return;
      }
      let split=nd.l<maxL&&dist<edge*K;
      if(!split&&edge>22&&vols.length)for(const v of vols)if(V.dist(v.n,nd.nMid)*R<edge*0.75+40)split=true;
      if(split){
        const kids=[this.node(nd.f,nd.l+1,nd.i*2,nd.j*2),this.node(nd.f,nd.l+1,nd.i*2+1,nd.j*2),this.node(nd.f,nd.l+1,nd.i*2,nd.j*2+1),this.node(nd.f,nd.l+1,nd.i*2+1,nd.j*2+1)];
        if(kids.every(k=>k.mesh)){kids.forEach(rec);return;}
        for(const k of kids){k.last=this.frame;if(!k.mesh){k.dist=dist;this.queue.push(k);}}     // low-detail fallback: keep drawing the parent
      }
      want(nd);this.visible.push(nd);
    };
    for(let f=0;f<6;f++){const root=this.node(f,0,0,0);if(!root.mesh)this.build(world,root);rec(root);}
    this.queue.sort((a,b)=>(a.urgent===b.urgent?a.dist-b.dist:(a.urgent?-1:1)));
    const t0=performance.now();let n=0;
    for(const nd of this.queue){if(n>0&&performance.now()-t0>budgetMs)break;this.build(world,nd);n++;}
    this.pending=this.queue.length-n;
    if(this.nodes.size>900)for(const [k,nd] of this.nodes)if(nd.last<this.frame-90&&nd.l>0){G.free(nd.mesh);G.free(nd.props);this.nodes.delete(k);}
  }
  draw(cam,propDist,maxDist){
    for(const nd of this.visible){
      const m=G.translate(nd.c[0]-cam.pos[0],nd.c[1]-cam.pos[1],nd.c[2]-cam.pos[2]);
      if(maxDist&&nd.dist>maxDist)continue;
      G.gl.uniform1i(G.cur.u.uMode||null,0);G.draw(nd.mesh,m,null,1,nd.off);
      if(nd.props&&nd.dist<propDist){G.gl.uniform1i(G.cur.u.uMode||null,1);G.draw(nd.props,m);}
    }
  }
}
G.Terrain=Terrain;
})();
