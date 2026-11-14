// presentation / WebGL2 core: context, shaders, matrices, mesh builder. Zero third-party code.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V;
const G=LW.gfx={};

const VS=`#version 300 es
layout(location=0) in vec3 aPos;layout(location=1) in vec4 aCol;layout(location=2) in vec2 aEx;
uniform mat4 uVP;uniform mat4 uModel;
out vec3 vRel;out vec4 vCol;out vec2 vEx;
void main(){vec4 p=uModel*vec4(aPos,1.0);vRel=p.xyz;vCol=aCol;vEx=aEx;gl_Position=uVP*p;}`;
const CLOUD=`float cloudF(vec3 n,float t){return 0.5+0.25*sin(dot(n,vec3(0.8,0.5,0.33))*5.1+t)+0.15*sin(dot(n,vec3(-0.4,0.7,0.6))*8.3-t*1.7+1.7)+0.1*sin(dot(n,vec3(0.2,-0.6,0.77))*13.7+t*2.9+4.1);}`;
const FS=`#version 300 es
precision highp float;
in vec3 vRel;in vec4 vCol;in vec2 vEx;
uniform vec3 uSun;uniform vec3 uSunCol;uniform vec3 uCenter;uniform vec3 uFog;uniform float uFogD;uniform float uTime;uniform float uAmb;
uniform float uAlpha;uniform int uMode;uniform vec4 uCut;uniform float uCloud;uniform vec4 uTint;uniform vec2 uWater;
out vec4 o;
${CLOUD}
void main(){
  if(vEx.y>0.5)discard;
  if(uCut.w>0.0&&uMode<2){vec3 d=normalize(uCut.xyz);float t=dot(vRel,d);if(t<length(uCut.xyz)-0.6){if(length(vRel-d*t)<uCut.w)discard;}}
  vec3 N=normalize(cross(dFdx(vRel),dFdy(vRel)));if(dot(N,vRel)>0.0)N=-N;
  vec3 up=normalize(vRel-uCenter);
  float day=smoothstep(-0.12,0.25,dot(up,uSun));
  float diff=max(dot(N,uSun),0.0);diff=floor(diff*4.0+0.5)/4.0;
  vec3 c=vCol.rgb*uTint.rgb;float em=vCol.a+uTint.a;
  if(vEx.x>0.0){
    float k=1.0-exp(-vEx.x*uWater.x);k=floor(k*6.0)/6.0;
    c=mix(vec3(0.24,0.66,0.72),vec3(0.05,0.16,0.36),k);
    c=mix(c,vec3(0.93,0.97,1.0),(1.0-smoothstep(0.0,uWater.y,vEx.x))*0.75);
    diff=max(dot(up,uSun),0.0);
    vec3 H=normalize(normalize(-vRel)+uSun);c+=vec3(1.0,0.95,0.8)*pow(max(dot(up,H),0.0),90.0)*0.5*day;
  }
  vec3 lit=c*(uAmb+(1.0-uAmb)*(0.25+0.75*diff)*day*uSunCol);
  if(uMode==0){
    float cv=smoothstep(0.6,0.8,cloudF(up,uTime));
    lit=mix(lit*(1.0-0.3*cv*(1.0-uCloud)),vec3(0.3+0.7*day),cv*uCloud*0.8);
  }
  lit+=c*em*(0.35+1.2*(1.0-day));
  float f=1.0-exp(-length(vRel)*uFogD);
  o=vec4(mix(lit,uFog,f),uAlpha);
}`;
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
  // limb glow seen from space
  if(b>0.0||inAtm>0.0){
    float g=1.0-smoothstep(uRad*0.985,uRad+uThick,d);
    vec3 pn=normalize(ray*b-uCenter);float lit=smoothstep(-0.25,0.35,dot(pn,uSun));
    col+=uAtm*g*g*(0.15+0.95*lit)*(1.0-inAtm)*step(0.0,b);
  }
  // sky seen from inside the atmosphere
  float el=dot(ray,upC);
  vec3 sky=mix(uAtm*1.25+0.12,uAtm*0.55,smoothstep(-0.05,0.7,el))*dayC+vec3(0.9,0.45,0.25)*(1.0-abs(dayC*2.0-1.0))*0.35*(1.0-smoothstep(0.0,0.35,el));
  col=mix(col,sky+col*(1.0-dayC),inAtm);
  float sd=max(dot(ray,uSun),0.0);col+=uSunCol*(pow(sd,3000.0)*4.0+pow(sd,60.0)*0.25);
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
  G.main=program(gl,VS,FS,['uVP','uModel','uSun','uSunCol','uCenter','uFog','uFogD','uTime','uAmb','uAlpha','uMode','uCut','uCloud','uTint','uWater']);
  G.sky=program(gl,SKY_VS,SKY_FS,['uF','uR','uU','uCenter','uSun','uAtm','uSunCol','uRad','uThick']);
  G.skyVao=gl.createVertexArray();
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
  G.stats={draws:0,tris:0};
  return gl;
};
// ---- mesh ---------------------------------------------------------------------
G.mesh=function(pos,col,ex,idx){
  const gl=G.gl,vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const bufs=[];
  const b=(data,loc,size,type,norm)=>{const buf=gl.createBuffer();bufs.push(buf);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,type,norm,0,0);};
  b(pos,0,3,gl.FLOAT,false);b(col,1,4,gl.UNSIGNED_BYTE,true);
  if(ex)b(ex,2,2,gl.FLOAT,false);else{gl.disableVertexAttribArray(2);gl.vertexAttrib2f(2,0,0);}
  let count=pos.length/3,indexed=false;
  if(idx){const ib=gl.createBuffer();bufs.push(ib);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);count=idx.length;indexed=true;}
  gl.bindVertexArray(null);
  return {vao,bufs,count,indexed};
};
G.free=function(m){if(!m)return;const gl=G.gl;for(const b of m.bufs)gl.deleteBuffer(b);gl.deleteVertexArray(m.vao);};
G.draw=function(m,model,tint,alpha){
  const gl=G.gl,u=G.main.u;
  gl.uniformMatrix4fv(u.uModel,false,model);
  gl.uniform4fv(u.uTint,tint||G.WHITE);gl.uniform1f(u.uAlpha,alpha===undefined?1:alpha);
  gl.bindVertexArray(m.vao);
  if(m.indexed)gl.drawElements(gl.TRIANGLES,m.count,gl.UNSIGNED_SHORT,0);else gl.drawArrays(gl.TRIANGLES,0,m.count);
  G.stats.draws++;G.stats.tris+=m.count/3;
};
G.WHITE=new Float32Array([1,1,1,0]);
// ---- matrices (column-major) -----------------------------------------------------
G.persp=function(fovy,asp,n,f){const t=1/Math.tan(fovy/2),o=new Float32Array(16);o[0]=t/asp;o[5]=t;o[10]=(f+n)/(n-f);o[11]=-1;o[14]=2*f*n/(n-f);return o;};
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
  // R = Rx * Rz
  const m=new Float32Array([cz*sx,cx*szn*sx,sxn*szn*sx,0,-szn*sy,cx*cz*sy,sxn*cz*sy,0,0,-sxn*sz,cx*sz,0,tx,ty,tz,1]);
  return G.mul(base,m);
};
// ---- mesh builder (non-indexed triangles, optional placement transform) ----------
class MB{
  constructor(){this.p=[];this.c=[];this.e=[];this.T=null;this.ex=0;this.ey=0;}
  v(x,y,z,col,em){
    const T=this.T;
    if(T)this.p.push(T.o[0]+T.e[0]*x+T.u[0]*y+T.t[0]*z,T.o[1]+T.e[1]*x+T.u[1]*y+T.t[1]*z,T.o[2]+T.e[2]*x+T.u[2]*y+T.t[2]*z);else this.p.push(x,y,z);
    this.c.push(col[0],col[1],col[2],em||0);this.e.push(this.ex,this.ey);
  }
  tri(a,b,c,col,em){this.v(a[0],a[1],a[2],col,em);this.v(b[0],b[1],b[2],col,em);this.v(c[0],c[1],c[2],col,em);}
  quad(a,b,c,d,col,em){this.tri(a,b,c,col,em);this.tri(a,c,d,col,em);}
  // axis-aligned box centred at (cx,cy,cz) optionally rotated about Y
  box(cx,cy,cz,sx,sy,sz,col,rot,em){
    const hx=sx/2,hy=sy/2,hz=sz/2,cr=Math.cos(rot||0),sr=Math.sin(rot||0);
    const P=(x,y,z)=>[cx+x*cr+z*sr,cy+y,cz-x*sr+z*cr];
    const a=P(-hx,-hy,-hz),b=P(hx,-hy,-hz),c=P(hx,-hy,hz),d=P(-hx,-hy,hz),e=P(-hx,hy,-hz),f=P(hx,hy,-hz),g=P(hx,hy,hz),h=P(-hx,hy,hz);
    const dk=[col[0]*0.86,col[1]*0.86,col[2]*0.86];
    this.quad(e,f,g,h,col,em);this.quad(a,b,c,d,dk,em);this.quad(a,b,f,e,col,em);this.quad(d,c,g,h,col,em);this.quad(a,d,h,e,dk,em);this.quad(b,c,g,f,dk,em);
  }
  cone(cx,cy,cz,r,h,n,col,em){for(let i=0;i<n;i++){const a0=i/n*6.2832,a1=(i+1)/n*6.2832;
    this.tri([cx+Math.cos(a0)*r,cy,cz+Math.sin(a0)*r],[cx+Math.cos(a1)*r,cy,cz+Math.sin(a1)*r],[cx,cy+h,cz],i%2?col:[col[0]*0.88,col[1]*0.88,col[2]*0.88],em);}}
  cyl(cx,cy,cz,r,h,n,col,em){for(let i=0;i<n;i++){const a0=i/n*6.2832,a1=(i+1)/n*6.2832,x0=cx+Math.cos(a0)*r,z0=cz+Math.sin(a0)*r,x1=cx+Math.cos(a1)*r,z1=cz+Math.sin(a1)*r;
    this.quad([x0,cy,z0],[x1,cy,z1],[x1,cy+h,z1],[x0,cy+h,z0],i%2?col:[col[0]*0.88,col[1]*0.88,col[2]*0.88],em);this.tri([x0,cy+h,z0],[x1,cy+h,z1],[cx,cy+h,cz],col,em);}}
  // faceted blob (bipyramid) for canopies, heads, boulders
  blob(cx,cy,cz,rx,ry,rz,n,col,em){for(let i=0;i<n;i++){const a0=i/n*6.2832,a1=(i+1)/n*6.2832,p0=[cx+Math.cos(a0)*rx,cy,cz+Math.sin(a0)*rz],p1=[cx+Math.cos(a1)*rx,cy,cz+Math.sin(a1)*rz];
    const c2=i%2?col:[col[0]*0.86,col[1]*0.86,col[2]*0.86];this.tri(p0,p1,[cx,cy+ry,cz],c2,em);this.tri(p0,p1,[cx,cy-ry,cz],[c2[0]*0.8,c2[1]*0.8,c2[2]*0.8],em);}}
  // gable roof over a rectangle
  gable(x0,z0,x1,z1,y,h,ov,col){
    x0-=ov;z0-=ov;x1+=ov;z1+=ov;const along=(x1-x0)>=(z1-z0),dk=[col[0]*0.82,col[1]*0.82,col[2]*0.82];
    if(along){const zm=(z0+z1)/2;this.quad([x0,y,z0],[x1,y,z0],[x1,y+h,zm],[x0,y+h,zm],col);this.quad([x0,y,z1],[x1,y,z1],[x1,y+h,zm],[x0,y+h,zm],dk);
      this.tri([x0,y,z0],[x0,y,z1],[x0,y+h,zm],dk);this.tri([x1,y,z0],[x1,y,z1],[x1,y+h,zm],dk);}
    else{const xm=(x0+x1)/2;this.quad([x0,y,z0],[x0,y,z1],[xm,y+h,z1],[xm,y+h,z0],col);this.quad([x1,y,z0],[x1,y,z1],[xm,y+h,z1],[xm,y+h,z0],dk);
      this.tri([x0,y,z0],[x1,y,z0],[xm,y+h,z0],dk);this.tri([x0,y,z1],[x1,y,z1],[xm,y+h,z1],dk);}
  }
  get empty(){return !this.p.length;}
  build(){return this.p.length?G.mesh(new Float32Array(this.p),new Uint8Array(this.c.map(x=>x<0?0:x>255?255:x)),new Float32Array(this.e)):null;}
}
G.MB=MB;
G.unit=function(){
  if(G._unit)return G._unit;
  const w=[255,255,255],b=new MB();b.box(0,0,0,1,1,1,w);
  const s=new MB();s.blob(0,0,0,0.5,0.5,0.5,6,w);
  const c=new MB();c.cone(0,-0.5,0,0.5,1,6,w);
  return G._unit={box:b.build(),blob:s.build(),cone:c.build()};
};
})();
