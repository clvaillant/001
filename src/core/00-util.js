// world-core / utilities: deterministic maths, hashing, seeded noise, canonical JSON.
// No DOM, no wall-clock and no unseeded randomness in this file or anything under src/core.
;(function(){'use strict';
const LW=globalThis.LW=globalThis.LW||{};
LW.VERSION='0.1.0';
LW.SCHEMA={major:1,minor:1};
LW.GENERATOR_VERSION=1;
LW.TICK_SECONDS=15;            // one logical tick = 15 simulated seconds
LW.TPH=240;                    // ticks per simulated hour
LW.TPD=5760;                   // ticks per simulated day

LW.clamp=(x,a,b)=>x<a?a:x>b?b:x;
LW.lerp=(a,b,t)=>a+(b-a)*t;
LW.smooth=(a,b,x)=>{const t=LW.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

const V=LW.V={
  add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],
  sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  mul:(a,s)=>[a[0]*s,a[1]*s,a[2]*s],
  madd:(a,b,s)=>[a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s],
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  len:a=>Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]),
  norm:a=>{const l=Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];},
  lerp:(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t],
  dist:(a,b)=>Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2)
};

// ---- hashing ---------------------------------------------------------------
LW.hashInt=function(a,b,c,d){
  let h=(a|0)*374761393+(b|0)*668265263+(c|0)*2147483647+(d|0)*1274126177;
  h=(h^(h>>>13))>>>0; h=Math.imul(h,1274126177)>>>0; h=(h^(h>>>16))>>>0; h=Math.imul(h,2246822519)>>>0;
  return (h^(h>>>15))>>>0;
};
// stateless [0,1) random for deterministic placement / presentation
LW.hrand=(a,b,c,d)=>LW.hashInt(a,b,c,d)/4294967296;
LW.hashStr=function(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;};
// 53-bit string hash rendered as hex; used for archive integrity
LW.checksum=function(str){
  let h1=0xdeadbeef,h2=0x41c6ce57;
  for(let i=0;i<str.length;i++){const ch=str.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (h2>>>0).toString(16).padStart(8,'0')+(h1>>>0).toString(16).padStart(8,'0');
};
// canonical JSON (sorted keys) so equal payloads hash equally
LW.canonical=function(o){
  if(o===null||typeof o!=='object')return JSON.stringify(o===undefined?null:o);
  if(Array.isArray(o))return '['+o.map(LW.canonical).join(',')+']';
  const k=Object.keys(o).sort();let s='{';
  for(let i=0;i<k.length;i++){if(o[k[i]]===undefined)continue;if(s.length>1)s+=',';s+=JSON.stringify(k[i])+':'+LW.canonical(o[k[i]]);}
  return s+'}';
};
LW.clone=o=>JSON.parse(JSON.stringify(o));

// ---- the single canonical world RNG (mulberry32, state persisted in world.rng) ----
LW.rand=function(world){
  let t=(world.rng=(world.rng+0x6D2B79F5)>>>0);
  t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61);
  return ((t^(t>>>14))>>>0)/4294967296;
};
LW.randInt=(world,n)=>Math.floor(LW.rand(world)*n);
LW.pick=(world,arr)=>arr[Math.floor(LW.rand(world)*arr.length)];

// ---- seeded 3D gradient noise ---------------------------------------------
LW.makeNoise=function(seed){
  const p=new Uint8Array(512),a=new Uint8Array(256);let s=(seed>>>0)||1;
  for(let i=0;i<256;i++)a[i]=i;
  for(let i=255;i>0;i--){s=(Math.imul(s,1664525)+1013904223)>>>0;const j=(s>>>8)%(i+1);const t=a[i];a[i]=a[j];a[j]=t;}
  for(let i=0;i<512;i++)p[i]=a[i&255];
  const g=(h,x,y,z)=>{h&=15;const u=h<8?x:y,v=h<4?y:(h===12||h===14?x:z);return((h&1)?-u:u)+((h&2)?-v:v);};
  return function(x,y,z){
    let X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z);x-=X;y-=Y;z-=Z;X&=255;Y&=255;Z&=255;
    const u=x*x*x*(x*(x*6-15)+10),v=y*y*y*(y*(y*6-15)+10),w=z*z*z*(z*(z*6-15)+10);
    const A=p[X]+Y,AA=p[A]+Z,AB=p[A+1]+Z,B=p[X+1]+Y,BA=p[B]+Z,BB=p[B+1]+Z;
    const l=(t,a,b)=>a+t*(b-a);
    return l(w,l(v,l(u,g(p[AA],x,y,z),g(p[BA],x-1,y,z)),l(u,g(p[AB],x,y-1,z),g(p[BB],x-1,y-1,z))),
               l(v,l(u,g(p[AA+1],x,y,z-1),g(p[BA+1],x-1,y,z-1)),l(u,g(p[AB+1],x,y-1,z-1),g(p[BB+1],x-1,y-1,z-1))));
  };
};
LW.sharedNoise=LW.makeNoise(1337);

// ---- cube-sphere mapping ---------------------------------------------------
// face = [normal, uAxis, vAxis], right-handed (normal = u x v). +Y is the rotational north pole.
const F=LW.FACES=[
  [[1,0,0],[0,1,0],[0,0,1]],[[-1,0,0],[0,0,1],[0,1,0]],
  [[0,1,0],[0,0,1],[1,0,0]],[[0,-1,0],[1,0,0],[0,0,1]],
  [[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[0,1,0],[1,0,0]]];
const Q=Math.PI/4;
LW.faceDir=function(f,u,v){
  const N=F[f][0],U=F[f][1],W=F[f][2],a=Math.tan(u*Q),b=Math.tan(v*Q);
  const x=N[0]+U[0]*a+W[0]*b,y=N[1]+U[1]*a+W[1]*b,z=N[2]+U[2]*a+W[2]*b,l=Math.sqrt(x*x+y*y+z*z);
  return [x/l,y/l,z/l];
};
LW.dirFace=function(n){
  const ax=Math.abs(n[0]),ay=Math.abs(n[1]),az=Math.abs(n[2]);let f;
  if(ax>=ay&&ax>=az)f=n[0]>0?0:1;else if(ay>=az)f=n[1]>0?2:3;else f=n[2]>0?4:5;
  const N=F[f][0],U=F[f][1],W=F[f][2],d=n[0]*N[0]+n[1]*N[1]+n[2]*N[2];
  return [f,Math.atan((n[0]*U[0]+n[1]*U[1]+n[2]*U[2])/d)/Q,Math.atan((n[0]*W[0]+n[1]*W[1]+n[2]*W[2])/d)/Q];
};
// local tangent frame at unit direction n: e=east, t=north, u=up
LW.frame=function(n){
  let e=V.cross([0,1,0],n);const l=V.len(e);
  e=l<1e-6?[1,0,0]:[e[0]/l,e[1]/l,e[2]/l];
  return {e,t:V.cross(n,e),u:n};
};
// move a direction by local metres (east,north) on a sphere of radius R
LW.offsetDir=function(n,east,north,R){
  const f=LW.frame(n);
  return V.norm([n[0]+(f.e[0]*east+f.t[0]*north)/R,n[1]+(f.e[1]*east+f.t[1]*north)/R,n[2]+(f.e[2]*east+f.t[2]*north)/R]);
};
LW.arcDist=function(a,b,R){const c=V.dist(a,b);return R*2*Math.asin(Math.min(1,c/2));};

// per-world derived caches (never persisted, always recomputable from canonical state)
const caches=new WeakMap();
LW.cache=function(world){let c=caches.get(world);if(!c){c={};caches.set(world,c);}return c;};
LW.dropCache=function(world){caches.delete(world);};

class LWError extends Error{constructor(code,msg){super(msg||code);this.code=code;}}
LW.Error=LWError;
})();
