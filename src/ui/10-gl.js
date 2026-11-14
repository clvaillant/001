// presentation / WebGL2 core: context, shaders, matrices, mesh builder. Zero third-party code.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V;
const G=LW.gfx={};

const VS=`#version 300 es
layout(location=0) in vec3 aPos;layout(location=1) in vec4 aCol;layout(location=2) in vec2 aEx;layout(location=3) in vec3 aNrm;
uniform mat4 uVP;uniform mat4 uModel;uniform vec3 uOff;
out vec3 vRel;out vec3 vN;out vec3 vLoc;out vec4 vCol;out vec2 vEx;
void main(){vec4 p=uModel*vec4(aPos,1.0);vRel=p.xyz;vN=mat3(uModel)*aNrm;vLoc=aPos+uOff;vCol=aCol;vEx=aEx;gl_Position=uVP*p;}`;
const CLOUD=`float cloudF(vec3 n,float t){return 0.5+0.25*sin(dot(n,vec3(0.8,0.5,0.33))*5.1+t)+0.15*sin(dot(n,vec3(-0.4,0.7,0.6))*8.3-t*1.7+1.7)+0.1*sin(dot(n,vec3(0.2,-0.6,0.77))*13.7+t*2.9+4.1);}`;
// Physically-inspired shading: linear-light albedo, smooth vertex normals, sky/ground hemisphere ambient,
// shadow-mapped sun, procedural surface detail, rippling Fresnel water, filmic tone curve.
const FS=`#version 300 es
precision highp float;precision highp sampler2DShadow;
in vec3 vRel;in vec3 vN;in vec3 vLoc;in vec4 vCol;in vec2 vEx;
uniform vec3 uSun;uniform vec3 uSunCol;uniform vec3 uCenter;uniform vec3 uFog;uniform float uFogD;uniform float uTime;uniform vec3 uAmbCol;uniform vec3 uSkyRefl;
uniform float uAlpha;uniform int uMode;uniform vec4 uCut;uniform float uCloud;uniform vec4 uTint;uniform vec2 uWater;uniform float uAnim;
uniform sampler2DShadow uShadow;uniform mat4 uShadowM;uniform float uShadowOn;uniform float uShadowTx;
out vec4 o;
${CLOUD}
float h31(vec3 p){p=fract(p*vec3(0.1031,0.1030,0.0973));p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float vnoise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){
  if(vEx.y>0.5)discard;
  if(uCut.w>0.0&&uMode<2){vec3 d=normalize(uCut.xyz);float t=dot(vRel,d);if(t<length(uCut.xyz)-0.6){if(length(vRel-d*t)<uCut.w)discard;}}
  vec3 up=normalize(vRel-uCenter);
  vec3 N=dot(vN,vN)>0.01?normalize(vN):normalize(cross(dFdx(vRel),dFdy(vRel)));
  if(dot(N,vRel)>0.0)N=-N;
  float dist=length(vRel);vec3 V=-vRel/dist;
  float day=smoothstep(-0.1,0.2,dot(up,uSun));
  vec3 alb=pow(vCol.rgb*uTint.rgb,vec3(2.2));float em=vCol.a+uTint.a,spec=0.0;
  if(uMode==0){
    float near=1.0-smoothstep(50.0,240.0,dist),mid=1.0-smoothstep(400.0,2500.0,dist);
    alb*=mix(1.0,0.74+0.52*vnoise(vLoc*2.3),near*0.75)*mix(1.0,0.86+0.28*vnoise(vLoc*0.19),mid);
  }
  if(vEx.x>0.0){
    float k=1.0-exp(-vEx.x*uWater.x);
    alb=mix(vec3(0.035,0.2,0.21),vec3(0.004,0.022,0.07),k);
    vec3 w=vLoc*0.4;float t=uAnim,calm=1.0-smoothstep(150.0,1200.0,dist);
    vec3 rp=vec3(sin(w.x*1.3+w.y*0.7+t*1.1)+sin(w.z*2.1-t*1.7),sin(w.y*1.9+w.z*0.6+t*1.4),sin(w.z*1.7+t*1.3)+sin(w.x*2.3+w.y*1.1+t*0.9))*0.05*calm;
    N=normalize(up+rp-up*dot(rp,up));
    float fr=pow(1.0-max(dot(N,V),0.0),4.0);
    alb=mix(alb,uSkyRefl,0.05+fr*0.7);
    float foam=1.0-smoothstep(0.0,uWater.y,vEx.x);
    alb=mix(alb,vec3(0.8,0.88,0.9),foam*(0.5+0.25*sin(t*1.6+w.x*2.0+w.z*2.0)));
    spec=pow(max(dot(N,normalize(V+uSun)),0.0),180.0)*2.0*day;
  }
  float ndl=max(dot(N,uSun),0.0),sh=1.0;
  if(uShadowOn>0.5){
    vec4 sc=uShadowM*vec4(vRel,1.0);vec3 q=sc.xyz*0.5+0.5;
    if(q.x>0.0&&q.y>0.0&&q.x<1.0&&q.y<1.0&&q.z<1.0){
      float b=max(0.0010,0.0035*(1.0-ndl)),s=0.0;
      for(int i=0;i<4;i++){vec2 of=vec2(float(i&1)-0.5,float(i>>1)-0.5)*1.5*uShadowTx;s+=texture(uShadow,vec3(q.xy+of,q.z-b));}
      float edge=smoothstep(0.0,0.1,min(min(q.x,1.0-q.x),min(q.y,1.0-q.y)));
      sh=mix(1.0,s*0.25,edge);
    }
  }
  vec3 lit=alb*(uAmbCol*(0.55+0.45*dot(N,up))+uSunCol*(ndl*sh*day*1.35))+uSunCol*spec*sh;
  if(uMode==0){float cv=smoothstep(0.6,0.8,cloudF(up,uTime));lit=mix(lit*(1.0-0.3*cv*(1.0-uCloud)),vec3(0.2+0.8*day),cv*uCloud*0.8);}
  lit+=alb*em*(0.5+2.6*(1.0-day));
  lit=mix(lit,uFog,1.0-exp(-dist*uFogD));
  vec3 tm=1.0-exp(-lit*1.35);tm=mix(vec3(dot(tm,vec3(0.3,0.59,0.11))),tm,1.18);o=vec4(pow(clamp(tm,0.0,1.0),vec3(0.4545)),uAlpha);
}`;
const SH_VS=`#version 300 es
layout(location=0) in vec3 aPos;layout(location=2) in vec2 aEx;uniform mat4 uVP;uniform mat4 uModel;out vec2 vEx;
void main(){vEx=aEx;gl_Position=uVP*(uModel*vec4(aPos,1.0));}`;
const SH_FS=`#version 300 es
precision mediump float;in vec2 vEx;void main(){if(vEx.y>0.5)discard;}`;
const SKY_VS=`#version 300 es
out vec2 vN;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2))*2.0-1.0;vN=p;gl_Position=vec4(p,0.9999,1.0);}`;
const SKY_FS=`#version 300 es
precision highp float;
in vec2 vN;uniform vec3 uF;uniform vec3 uR;uniform vec3 uU;uniform vec3 uCenter;uniform vec3 uSun;uniform vec3 uAtm;uniform vec3 uSunCol;
uniform float uRad;uniform float uThick;
out vec4 o;
float h3(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
void main(){
  vec3 ray=normalize(uF+uR*vN.x+uU*vN.y);
  float b=dot(ray,uCenter),cc=dot(uCenter,uCenter),d=sqrt(max(cc-b*b,0.0)),camR=sqrt(cc);
  vec3 col=vec3(0.012,0.014,0.03);
  vec3 q=floor(ray*520.0);float s=h3(q);col+=vec3(step(0.9988,s))*(0.35+0.65*h3(q+7.0));
  float inAtm=1.0-smoothstep(0.0,uThick,camR-uRad);
  vec3 upC=-uCenter/camR;float dayC=smoothstep(-0.2,0.25,dot(upC,uSun));
  if(b>0.0||inAtm>0.0){
    float g=1.0-smoothstep(uRad*0.985,uRad+uThick,d);
    vec3 pn=normalize(ray*b-uCenter);float lit=smoothstep(-0.25,0.35,dot(pn,uSun));
    col+=uAtm*g*g*(0.15+0.95*lit)*(1.0-inAtm)*step(0.0,b);
  }
  float el=dot(ray,upC),sd=max(dot(ray,uSun),0.0),low=1.0-abs(dayC*2.0-1.0);
  vec3 zen=uAtm*0.62,hor=mix(uAtm*1.15+0.2,vec3(1.0,0.62,0.36),low*0.7);
  vec3 sky=mix(hor,zen,pow(smoothstep(-0.05,0.75,el),0.55))*dayC;
  sky+=uSunCol*(pow(sd,9.0)*0.22+pow(sd,90.0)*0.35)*max(dayC,low);
  col=mix(col,sky+col*(1.0-dayC),inAtm);
  col+=uSunCol*pow(sd,2600.0)*5.0;
  o=vec4(col,1.0);
}`;
function shader(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('shader: '+gl.getShaderInfoLog(s));return s;}
function program(gl,vs,fs,names){
  const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('link: '+gl.getProgramInfoLog(p));
  const u={};for(const n of names)u[n]=gl.getUniformLocation(p,n);return {p,u};
}
G.init=function(canvas){
  const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
  if(!gl)return null;
  G.gl=gl;
  G.main=program(gl,VS,FS,['uVP','uModel','uOff','uSun','uSunCol','uCenter','uFog','uFogD','uTime','uAmbCol','uSkyRefl','uAlpha','uMode','uCut','uCloud','uTint','uWater','uAnim','uShadow','uShadowM','uShadowOn','uShadowTx']);
  G.shadowProg=program(gl,SH_VS,SH_FS,['uVP','uModel']);
  G.sky=program(gl,SKY_VS,SKY_FS,['uF','uR','uU','uCenter','uSun','uAtm','uSunCol','uRad','uThick']);
  G.skyVao=gl.createVertexArray();G.cur=G.main;G.shadow=null;
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
  G.stats={draws:0,tris:0};
  return gl;
};
// sun shadow map (depth-only framebuffer with hardware comparison filtering)
G.shadowTarget=function(size){
  const gl=G.gl;if(G.shadow&&G.shadow.size===size)return G.shadow;
  if(G.shadow){gl.deleteTexture(G.shadow.tex);gl.deleteFramebuffer(G.shadow.fbo);}
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,size,size,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
  const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,tex,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
  const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return G.shadow=ok?{tex,fbo,size}:null;
};
// ---- mesh ---------------------------------------------------------------------
G.mesh=function(pos,col,ex,idx,nrm){
  const gl=G.gl,vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const bufs=[];
  const b=(data,loc,size,type,norm)=>{const buf=gl.createBuffer();bufs.push(buf);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,type,norm,0,0);};
  b(pos,0,3,gl.FLOAT,false);b(col,1,4,gl.UNSIGNED_BYTE,true);
  if(ex)b(ex,2,2,gl.FLOAT,false);else{gl.disableVertexAttribArray(2);gl.vertexAttrib2f(2,0,0);}
  if(nrm)b(nrm,3,3,gl.BYTE,true);else{gl.disableVertexAttribArray(3);gl.vertexAttrib3f(3,0,0,0);}
  let count=pos.length/3,indexed=false;
  if(idx){const ib=gl.createBuffer();bufs.push(ib);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);count=idx.length;indexed=true;}
  gl.bindVertexArray(null);
  return {vao,bufs,count,indexed};
};
G.free=function(m){if(!m)return;const gl=G.gl;for(const b of m.bufs)gl.deleteBuffer(b);gl.deleteVertexArray(m.vao);};
const ZERO3=new Float32Array(3);
G.draw=function(m,model,tint,alpha,off){
  const gl=G.gl,u=G.cur.u;
  gl.uniformMatrix4fv(u.uModel,false,model);
  if(u.uTint){gl.uniform4fv(u.uTint,tint||G.WHITE);gl.uniform1f(u.uAlpha,alpha===undefined?1:alpha);gl.uniform3fv(u.uOff,off||ZERO3);}
  gl.bindVertexArray(m.vao);
  if(m.indexed)gl.drawElements(gl.TRIANGLES,m.count,gl.UNSIGNED_SHORT,0);else gl.drawArrays(gl.TRIANGLES,0,m.count);
  G.stats.draws++;G.stats.tris+=m.count/3;
};
G.WHITE=new Float32Array([1,1,1,0]);
// ---- matrices (column-major) -----------------------------------------------------
G.persp=function(fovy,asp,n,f){const t=1/Math.tan(fovy/2),o=new Float32Array(16);o[0]=t/asp;o[5]=t;o[10]=(f+n)/(n-f);o[11]=-1;o[14]=2*f*n/(n-f);return o;};
G.ortho=function(hw,hh,n,f){const o=new Float32Array(16);o[0]=1/hw;o[5]=1/hh;o[10]=-2/(f-n);o[14]=-(f+n)/(f-n);o[15]=1;return o;};
G.mul=function(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;};
G.viewRot=function(r,u,f){return new Float32Array([r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,0,0,0,1]);};
G.translate=function(x,y,z){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);};
// model matrix from a local frame (x=e,y=u,z=t) rotated by yaw about up, placed at camera-relative origin o
G.frameMat=function(f,yaw,o){
  const c=Math.cos(yaw||0),s=Math.sin(yaw||0),e=f.e,t=f.t,u=f.u;
  const x=[e[0]*c+t[0]*s,e[1]*c+t[1]*s,e[2]*c+t[2]*s],z=[-e[0]*s+t[0]*c,-e[1]*s+t[1]*c,-e[2]*s+t[2]*c];
  return new Float32Array([x[0],x[1],x[2],0,u[0],u[1],u[2],0,z[0],z[1],z[2],0,o[0],o[1],o[2],1]);
};
// local TRS helper: base * translate(t) * rotX(rx) * rotZ(rz) * scale(s)
G.part=function(base,tx,ty,tz,rx,rz,sx,sy,sz){
  const cx=Math.cos(rx),sxn=Math.sin(rx),cz=Math.cos(rz),szn=Math.sin(rz);
  const m=new Float32Array([cz*sx,cx*szn*sx,sxn*szn*sx,0,-szn*sy,cx*cz*sy,sxn*cz*sy,0,0,-sxn*sz,cx*sz,0,tx,ty,tz,1]);
  return G.mul(base,m);
};
// ---- mesh builder (non-indexed triangles with normals, optional placement transform) ----------
const shade=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];
class MB{
  constructor(){this.p=[];this.c=[];this.e=[];this.n=[];this.T=null;this.ex=0;this.ey=0;}
  v(x,y,z,col,em,nx,ny,nz){
    const T=this.T;
    if(T){this.p.push(T.o[0]+T.e[0]*x+T.u[0]*y+T.t[0]*z,T.o[1]+T.e[1]*x+T.u[1]*y+T.t[1]*z,T.o[2]+T.e[2]*x+T.u[2]*y+T.t[2]*z);
      this.n.push(T.e[0]*nx+T.u[0]*ny+T.t[0]*nz,T.e[1]*nx+T.u[1]*ny+T.t[1]*nz,T.e[2]*nx+T.u[2]*ny+T.t[2]*nz);}
    else{this.p.push(x,y,z);this.n.push(nx,ny,nz);}
    this.c.push(col[0],col[1],col[2],em||0);this.e.push(this.ex,this.ey);
  }
  tri(a,b,c,col,em){
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
    this.v(a[0],a[1],a[2],col,em,nx,ny,nz);this.v(b[0],b[1],b[2],col,em,nx,ny,nz);this.v(c[0],c[1],c[2],col,em,nx,ny,nz);
  }
  quad(a,b,c,d,col,em){this.tri(a,b,c,col,em);this.tri(a,c,d,col,em);}
  // box centred at (cx,cy,cz), optionally rotated about Y
  box(cx,cy,cz,sx,sy,sz,col,rot,em){
    const hx=sx/2,hy=sy/2,hz=sz/2,cr=Math.cos(rot||0),sr=Math.sin(rot||0);
    const P=(x,y,z)=>[cx+x*cr+z*sr,cy+y,cz-x*sr+z*cr];
    const a=P(-hx,-hy,-hz),b=P(hx,-hy,-hz),c=P(hx,-hy,hz),d=P(-hx,-hy,hz),e=P(-hx,hy,-hz),f=P(hx,hy,-hz),g=P(hx,hy,hz),h=P(-hx,hy,hz);
    this.quad(e,f,g,h,col,em);this.quad(a,b,c,d,col,em);this.quad(a,b,f,e,col,em);this.quad(d,c,g,h,col,em);this.quad(a,d,h,e,col,em);this.quad(b,c,g,f,col,em);
  }
  // smooth cone / tapered cylinder (r0 at base, r1 at top)
  taper(cx,cy,cz,r0,r1,h,n,col,em){
    const sl=(r0-r1)/h;
    for(let i=0;i<n;i++){const a0=i/n*6.2832,a1=(i+1)/n*6.2832,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
      const A=[cx+c0*r0,cy,cz+s0*r0],B=[cx+c1*r0,cy,cz+s1*r0],C=[cx+c1*r1,cy+h,cz+s1*r1],D=[cx+c0*r1,cy+h,cz+s0*r1];
      this.v(A[0],A[1],A[2],col,em,c0,sl,s0);this.v(B[0],B[1],B[2],col,em,c1,sl,s1);this.v(C[0],C[1],C[2],col,em,c1,sl,s1);
      this.v(A[0],A[1],A[2],col,em,c0,sl,s0);this.v(C[0],C[1],C[2],col,em,c1,sl,s1);this.v(D[0],D[1],D[2],col,em,c0,sl,s0);
      if(r1>0.001){this.v(D[0],D[1],D[2],col,em,0,1,0);this.v(C[0],C[1],C[2],col,em,0,1,0);this.v(cx,cy+h,cz,col,em,0,1,0);}}
  }
  cone(cx,cy,cz,r,h,n,col,em){this.taper(cx,cy,cz,r,0,h,n,col,em);}
  cyl(cx,cy,cz,r,h,n,col,em){this.taper(cx,cy,cz,r,r,h,n,col,em);}
  // smooth ellipsoid with a darker underside (canopies, boulders, heads)
  ball(cx,cy,cz,rx,ry,rz,n,col,em,rings){
    rings=rings||3;const lo=shade(col,0.74);
    const pt=(i,j)=>{const th=i/n*6.2832,ph=-1.5708+j/(rings+1)*3.1416,cp=Math.cos(ph),x=Math.cos(th)*cp,y=Math.sin(ph),z=Math.sin(th)*cp,k=y*0.5+0.5;
      return [cx+x*rx,cy+y*ry,cz+z*rz,x/rx,y/ry,z/rz,[lo[0]+(col[0]-lo[0])*k,lo[1]+(col[1]-lo[1])*k,lo[2]+(col[2]-lo[2])*k]];};
    const put=q=>{const l=Math.hypot(q[3],q[4],q[5])||1;this.v(q[0],q[1],q[2],q[6],em,q[3]/l,q[4]/l,q[5]/l);};
    for(let j=0;j<=rings;j++)for(let i=0;i<n;i++){const a=pt(i,j),b=pt(i+1,j),c=pt(i+1,j+1),d=pt(i,j+1);
      if(j>0){put(a);put(b);put(c);}if(j<rings){put(a);put(c);put(d);}}
  }
  blob(cx,cy,cz,rx,ry,rz,n,col,em){this.ball(cx,cy,cz,rx,ry,rz,n,col,em,2);}
  // gable roof over a rectangle
  gable(x0,z0,x1,z1,y,h,ov,col){
    x0-=ov;z0-=ov;x1+=ov;z1+=ov;const along=(x1-x0)>=(z1-z0),dk=shade(col,0.9);
    if(along){const zm=(z0+z1)/2;this.quad([x0,y,z0],[x1,y,z0],[x1,y+h,zm],[x0,y+h,zm],col);this.quad([x0,y,z1],[x1,y,z1],[x1,y+h,zm],[x0,y+h,zm],col);
      this.tri([x0+ov,y,z0+ov],[x0+ov,y,z1-ov],[x0+ov,y+h*0.96,zm],dk);this.tri([x1-ov,y,z0+ov],[x1-ov,y,z1-ov],[x1-ov,y+h*0.96,zm],dk);}
    else{const xm=(x0+x1)/2;this.quad([x0,y,z0],[x0,y,z1],[xm,y+h,z1],[xm,y+h,z0],col);this.quad([x1,y,z0],[x1,y,z1],[xm,y+h,z1],[xm,y+h,z0],col);
      this.tri([x0+ov,y,z0+ov],[x1-ov,y,z0+ov],[xm,y+h*0.96,z0+ov],dk);this.tri([x0+ov,y,z1-ov],[x1-ov,y,z1-ov],[xm,y+h*0.96,z1-ov],dk);}
  }
  get empty(){return !this.p.length;}
  build(){
    if(!this.p.length)return null;
    const nn=new Int8Array(this.n.length);for(let i=0;i<nn.length;i++)nn[i]=Math.max(-127,Math.min(127,Math.round(this.n[i]*127)));
    return G.mesh(new Float32Array(this.p),new Uint8Array(this.c.map(x=>x<0?0:x>255?255:x)),new Float32Array(this.e),null,nn);
  }
}
G.MB=MB;
G.unit=function(){
  if(G._unit)return G._unit;
  const w=[255,255,255],b=new MB();b.box(0,0,0,1,1,1,w);
  const s=new MB();s.ball(0,0,0,0.5,0.5,0.5,12,w,0,5);
  const c=new MB();c.cone(0,-0.5,0,0.5,1,10,w);
  const y=new MB();y.cyl(0,-0.5,0,0.5,1,10,w);
  return G._unit={box:b.build(),ball:s.build(),blob:s.build(),cone:c.build(),cyl:y.build()};
};
})();
