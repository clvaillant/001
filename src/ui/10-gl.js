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
const FSRC=T=>`#version 300 es
${T?'#define TERRAIN':''}
precision highp float;precision highp sampler2DShadow;
in vec3 vRel;in vec3 vN;in vec3 vLoc;in vec4 vCol;in vec2 vEx;
uniform vec3 uSun;uniform vec3 uSunCol;uniform vec3 uCenter;uniform vec3 uFog;uniform float uFogD;uniform float uTime;uniform vec3 uAmbCol;uniform vec3 uSkyRefl;
uniform float uAlpha;uniform int uMode;uniform vec4 uCut;uniform float uCloud;uniform vec4 uTint;uniform vec2 uWater;uniform float uAnim;
uniform sampler2DShadow uShadow;uniform mat4 uShadowM;uniform float uShadowOn;uniform float uShadowTx;uniform float uMat;uniform float uMatS;
out vec4 o;
${CLOUD}
float h31(vec3 p){p=fract(p*vec3(0.1031,0.1030,0.0973));p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float vnoise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 bump(vec3 N,float h,float k){vec3 dx=dFdx(vRel),dy=dFdy(vRel);float hx=dFdx(h),hy=dFdy(h);vec3 r1=cross(dy,N),r2=cross(N,dx);float det=dot(dx,r1);
  return normalize(N*abs(det)-k*sign(det)*(hx*r1+hy*r2));}
// procedural surface materials: tint in rgb, relief height in a. All patterns share three noise lookups so the
// cost is bounded even on GPUs that evaluate every branch.
#ifndef TERRAIN
vec4 material(int m,vec3 p){
  float a=vnoise(p*6.0),b=vnoise(p*24.0),c=vnoise(vec3(p.x*8.0,p.y*1.5,p.z*8.0));
  if(m==1){float g=c*0.6+b*0.4;return vec4(vec3(0.84+0.3*g),g*0.25);}
  if(m==14){float bd=fract(p.y/0.21),gap=smoothstep(0.0,0.07,bd)*smoothstep(1.0,0.9,bd);
    return vec4(vec3(0.88+0.2*b)*mix(0.74,1.0,gap)*(0.94+0.12*h31(vec3(floor(p.y/0.21),1.0,2.0))),gap*0.6+bd*0.3);}
  if(m==2){float row=floor(p.y/0.19),u=(p.x+p.z)/0.4+0.5*mod(row,2.0);vec2 f=vec2(fract(u),fract(p.y/0.19));
    float k=smoothstep(0.0,0.08,f.x)*smoothstep(1.0,0.92,f.x)*smoothstep(0.0,0.14,f.y)*smoothstep(1.0,0.86,f.y),r=h31(vec3(floor(u),row,3.0));
    return vec4(mix(vec3(0.86,0.84,0.8),vec3(0.78+0.4*r,0.74+0.36*r,0.72+0.34*r)*(0.92+0.16*b),k),k);}
  if(m==3){float n=a*0.5+b*0.5;return vec4(vec3(0.93+0.13*n),n*0.2);}
  if(m==4){float row=floor(p.y/0.17),u=(p.x+p.z)/0.3+0.5*mod(row,2.0),fy=fract(p.y/0.17),fx=fract(u),e=smoothstep(0.0,0.09,fx)*smoothstep(1.0,0.91,fx);
    return vec4(vec3(0.66+0.5*fy)*(0.84+0.32*h31(vec3(floor(u),row,1.0)))*mix(0.62,1.0,e),(1.0-fy)*e);}
  if(m==5){float n=b*0.6+a*0.4;return vec4(vec3(0.9+0.2*n),n*0.15);}
  if(m==15){float st=step(0.5,fract(p.y*13.0));return vec4(vec3(mix(0.72,1.04,st))*(0.94+0.12*b),b*0.1);}
  if(m==16){float sx=step(0.6,fract(p.x*9.0)),sy=step(0.6,fract(p.y*9.0));return vec4(vec3(1.0-0.2*sx-0.2*sy)*(0.94+0.12*b),b*0.1);}
  if(m==6){float q=abs(c-0.5)*2.0;return vec4(vec3(0.66+0.5*q+0.14*b),q);}
  if(m==7){float l=smoothstep(0.34,0.72,a*0.65+b*0.35);return vec4(mix(vec3(0.66,0.8,0.56),vec3(1.16,1.22,0.78),l)*(0.84+0.32*c),a*0.7+b*0.5);}
  if(m==8){vec3 q=p*vec3(2.4,3.4,2.4)+0.35*vec3(a,c,b);vec3 f=fract(q);
    float k=smoothstep(0.0,0.1,f.x)*smoothstep(1.0,0.9,f.x)*smoothstep(0.0,0.12,f.y)*smoothstep(1.0,0.88,f.y)*smoothstep(0.0,0.1,f.z)*smoothstep(1.0,0.9,f.z),r=h31(floor(q));
    return vec4(mix(vec3(0.7),vec3(0.8+0.36*r)*(0.9+0.2*b),k),k);}
  if(m==9){float f=b*0.7+a*0.3;return vec4(vec3(0.8+0.36*f),f*0.5);}
  if(m==10)return vec4(vec3(0.72+0.52*c),c*0.6);
  if(m==13){float n=a*0.6+b*0.4;return vec4(vec3(0.78+0.4*n),n*0.5);}
  return vec4(1.0,1.0,1.0,0.0);
}
#endif
void main(){
  if(vEx.y>0.5)discard;
  if(uCut.w>0.0&&uMode<2){vec3 d=normalize(uCut.xyz);float t=dot(vRel,d);if(t<length(uCut.xyz)-0.6){if(length(vRel-d*t)<uCut.w)discard;}}
  vec3 up=normalize(vRel-uCenter);
  vec3 N=dot(vN,vN)>0.01?normalize(vN):normalize(cross(dFdx(vRel),dFdy(vRel)));
  if(dot(N,vRel)>0.0)N=-N;
  float dist=length(vRel);vec3 V=-vRel/dist;
  float day=smoothstep(-0.1,0.2,dot(up,uSun));
  vec3 alb=pow(vCol.rgb*uTint.rgb,vec3(2.2));float em=vCol.a+uTint.a,spec=0.0;
#ifdef TERRAIN
  {
    float near=1.0-smoothstep(50.0,240.0,dist),mid=1.0-smoothstep(400.0,2500.0,dist),close=1.0-smoothstep(12.0,70.0,dist),veg=clamp(vEx.y*2.3,0.0,1.0);
    // cost scales with proximity: distant fragments pay for one noise lookup, close ones for the full ground texture
    if(mid>0.0)alb*=mix(1.0,0.86+0.28*vnoise(vLoc*0.19),mid);
    if(near>0.0&&vEx.x<=0.0){
      float coarse=vnoise(vLoc*2.3),h=coarse;alb*=mix(1.0,0.74+0.52*coarse,near*0.75);
      if(close>0.0){float t=veg>0.5?vnoise(vLoc*34.0)*0.6+vnoise(vLoc*61.0)*0.4:vnoise(vLoc*11.0);alb*=mix(1.0,veg>0.5?0.62+0.8*t:0.8+0.4*t,close);h+=t*0.5;}
      N=bump(N,h,0.05*close+0.02*near);
    }
  }
#else
  {
    int mat=int(floor(vEx.y*100.0+0.5));if(mat==0)mat=int(uMat);
    if(mat>0&&dist<170.0){float fade=1.0-smoothstep(45.0,170.0,dist);vec4 mt=material(mat,vLoc*uMatS);alb*=mix(vec3(1.0),mt.rgb,fade);if(dist<60.0)N=bump(N,mt.a,0.016*fade/max(uMatS,0.2));}
  }
#endif
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
  float hem=0.5+0.5*dot(N,up);vec3 ambL=mix(vec3(0.34,0.3,0.22)*dot(uAmbCol,vec3(0.4)),uAmbCol,hem);
  vec3 lit=alb*(ambL+uSunCol*(ndl*sh*day*1.35))+uSunCol*spec*sh;
#ifdef TERRAIN
  {float cv=smoothstep(0.6,0.8,cloudF(up,uTime));lit=mix(lit*(1.0-0.3*cv*(1.0-uCloud)),vec3(0.2+0.8*day),cv*uCloud*0.8);}
#endif
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
  const UN=['uVP','uModel','uOff','uMat','uMatS','uSun','uSunCol','uCenter','uFog','uFogD','uTime','uAmbCol','uSkyRefl','uAlpha','uMode','uCut','uCloud','uTint','uWater','uAnim','uShadow','uShadowM','uShadowOn','uShadowTx'];
  G.main=program(gl,VS,FSRC(false),UN);G.terr=program(gl,VS,FSRC(true),UN);
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
G.draw=function(m,model,tint,alpha,off,mat,ms){
  const gl=G.gl,u=G.cur.u;
  gl.uniformMatrix4fv(u.uModel,false,model);
  if(u.uTint){gl.uniform4fv(u.uTint,tint||G.WHITE);gl.uniform1f(u.uAlpha,alpha===undefined?1:alpha);gl.uniform3fv(u.uOff,off||ZERO3);gl.uniform1f(u.uMat,mat||0);gl.uniform1f(u.uMatS,ms||1);}
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
G.rotY=function(base,a){const c=Math.cos(a),s=Math.sin(a);return G.mul(base,new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]));};
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
  // organic lump: an ellipsoid whose surface is pushed in and out irregularly (leaf clumps, boulders)
  lump(cx,cy,cz,rx,ry,rz,n,col,em,rings,rough,seed){
    rings=rings||4;const lo=shade(col,0.7);
    const pt=(i,j)=>{i%=n;const th=i/n*6.2832,ph=-1.5708+j/(rings+1)*3.1416,cp=Math.cos(ph),x=Math.cos(th)*cp,y=Math.sin(ph),z=Math.sin(th)*cp,k=y*0.5+0.5;
      const d=(j===0||j===rings+1)?1:1+rough*(LW.hrand(seed,i,j,7)*2-1);
      return [cx+x*rx*d,cy+y*ry*d,cz+z*rz*d,x/rx,y/ry,z/rz,[lo[0]+(col[0]-lo[0])*k,lo[1]+(col[1]-lo[1])*k,lo[2]+(col[2]-lo[2])*k]];};
    const put=q=>{const l=Math.hypot(q[3],q[4],q[5])||1;this.v(q[0],q[1],q[2],q[6],em,q[3]/l,q[4]/l,q[5]/l);};
    for(let j=0;j<=rings;j++)for(let i=0;i<n;i++){const a=pt(i,j),b=pt(i+1,j),c=pt(i+1,j+1),d=pt(i,j+1);
      if(j>0){put(a);put(b);put(c);}if(j<rings){put(a);put(c);put(d);}}
  }
  // skinned surface through a list of elliptical cross-sections [along, ra, rb, offA, offB]; axis 1 = up (y), 2 = forward (z).
  // star<1 pulls every other vertex inward (boughs, tufts). This is what makes bodies read as bodies rather than stacked balls.
  loft(rings,n,col,em,axis,star,o){
    o=o||[0,0,0];const P=(r,i)=>{const th=i/n*6.2832,k=(star&&i%2)?star:1,a=Math.cos(th)*r[1]*k+(r[3]||0),b=Math.sin(th)*r[2]*k+(r[4]||0);
      return axis===2?[o[0]+a,o[1]+b,o[2]+r[0]]:[o[0]+a,o[1]+r[0],o[2]+b];};
    const Nn=(r,q,i)=>{const th=i/n*6.2832,sl=-((q[1]+q[2])-(r[1]+r[2]))*0.5/((q[0]-r[0])||1e-6),a=Math.cos(th)/Math.max(0.02,r[1]),b=Math.sin(th)/Math.max(0.02,r[2]),s=Math.hypot(a,b)||1;
      const v=axis===2?[a/s,b/s,sl]:[a/s,sl,b/s],l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];};
    const put=(p,nn)=>this.v(p[0],p[1],p[2],col,em,nn[0],nn[1],nn[2]);
    for(let j=0;j<rings.length-1;j++){const r=rings[j],q=rings[j+1];
      for(let i=0;i<n;i++){const a=P(r,i),b=P(r,i+1),c=P(q,i+1),d=P(q,i),na=Nn(r,q,i),nb=Nn(r,q,i+1);
        put(a,na);put(b,nb);put(c,nb);put(a,na);put(c,nb);put(d,na);}}
    for(const e of [0,rings.length-1]){const r=rings[e];if(r[1]<0.012)continue;const up=e?1:-1,c=axis===2?[o[0]+(r[3]||0),o[1]+(r[4]||0),o[2]+r[0]]:[o[0]+(r[3]||0),o[1]+r[0],o[2]+(r[4]||0)],nn=axis===2?[0,0,up]:[0,up,0];
      for(let i=0;i<n;i++){put(P(r,i),nn);put(P(r,i+1),nn);put(c,nn);}}
  }
  // tapered limb between two arbitrary points (branches, beams, tails)
  limb(a,b,r0,r1,n,col,em){
    const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],L=Math.hypot(d[0],d[1],d[2])||1,w=[d[0]/L,d[1]/L,d[2]/L];
    let u=Math.abs(w[1])<0.9?[0,1,0]:[1,0,0];let x=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];const xl=Math.hypot(x[0],x[1],x[2]);x=[x[0]/xl,x[1]/xl,x[2]/xl];
    const y=[w[1]*x[2]-w[2]*x[1],w[2]*x[0]-w[0]*x[2],w[0]*x[1]-w[1]*x[0]];
    const pt=(p,r,i)=>{const th=i/n*6.2832,c=Math.cos(th),s=Math.sin(th);return [[p[0]+(x[0]*c+y[0]*s)*r,p[1]+(x[1]*c+y[1]*s)*r,p[2]+(x[2]*c+y[2]*s)*r],[x[0]*c+y[0]*s,x[1]*c+y[1]*s,x[2]*c+y[2]*s]];};
    const put=q=>this.v(q[0][0],q[0][1],q[0][2],col,em,q[1][0],q[1][1],q[1][2]);
    for(let i=0;i<n;i++){const A=pt(a,r0,i),B=pt(a,r0,i+1),C=pt(b,r1,i+1),D=pt(b,r1,i);put(A);put(B);put(C);put(A);put(C);put(D);}
  }
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
// shared white unit meshes (tinted and scaled per draw). The body parts are lofted, anatomically shaped surfaces.
G.unit=function(){
  if(G._unit)return G._unit;
  const w=[255,255,255],mk=f=>{const m=new MB();f(m);return m.build();};
  const U={box:mk(m=>m.box(0,0,0,1,1,1,w)),ball:mk(m=>m.ball(0,0,0,0.5,0.5,0.5,14,w,0,6)),cone:mk(m=>m.cone(0,-0.5,0,0.5,1,12,w)),cyl:mk(m=>m.cyl(0,-0.5,0,0.5,1,12,w))};
  U.blob=U.ball;U.dot=mk(m=>m.ball(0,0,0,0.5,0.5,0.5,8,w,0,3));
  // human torso: waist -> ribcage -> shoulders -> neck base (height 1, widest half-width 0.5)
  U.torso=mk(m=>m.loft([[-0.5,0.4,0.3],[-0.3,0.37,0.27],[-0.08,0.39,0.29],[0.14,0.45,0.33,0,0.02],[0.3,0.5,0.31,0,0.01],[0.4,0.46,0.26],[0.46,0.24,0.2],[0.5,0.15,0.15]],22,w,0,1));
  U.pelvis=mk(m=>m.loft([[-0.5,0.3,0.26],[-0.38,0.4,0.33],[-0.2,0.45,0.37,0,-0.01],[0.1,0.46,0.36,0,-0.02],[0.35,0.42,0.32],[0.5,0.4,0.3]],20,w,0,1));
  U.skirt=mk(m=>m.loft([[-0.5,0.62,0.56],[-0.1,0.52,0.46],[0.5,0.4,0.3]],14,w,0,1));
  U.upper=mk(m=>m.loft([[-0.5,0.36,0.36],[-0.35,0.4,0.41],[-0.15,0.45,0.47],[0.1,0.49,0.52],[0.3,0.5,0.51],[0.5,0.46,0.46]],14,w,0,1));
  U.lower=mk(m=>m.loft([[-0.5,0.27,0.27],[-0.38,0.29,0.3],[-0.2,0.34,0.38,0,-0.02],[0.02,0.43,0.48,0,-0.04],[0.22,0.46,0.5,0,-0.04],[0.38,0.42,0.43,0,-0.01],[0.5,0.4,0.4]],14,w,0,1));
  // head: chin -> jaw -> cheekbones -> brow -> crown, deeper than wide, face pushed forward
  U.head=mk(m=>{m.loft([[-0.5,0.14,0.18,0,0.13],[-0.45,0.24,0.28,0,0.1],[-0.38,0.32,0.36,0,0.07],[-0.28,0.38,0.42,0,0.05],[-0.15,0.42,0.46,0,0.03],[0.0,0.46,0.5],[0.12,0.47,0.52,0,-0.01],[0.24,0.47,0.52,0,-0.02],[0.34,0.43,0.49,0,-0.03],[0.42,0.34,0.4,0,-0.03],[0.47,0.24,0.28,0,-0.03],[0.5,0.02,0.02,0,-0.03]],22,w,0,1);
    m.loft([[0.42,0.07,0.1],[0.52,0.05,0.07],[0.6,0.012,0.012]],6,w,0,2,0,[0,-0.1,0]);                       // nose
    for(const sx of [-1,1])m.ball(sx*0.46,-0.02,-0.02,0.07,0.13,0.09,6,w,0,2);});                              // ears
  U.hair=mk(m=>m.loft([[-0.02,0.5,0.56,0,-0.05],[0.14,0.53,0.6,0,-0.06],[0.34,0.47,0.54,0,-0.07],[0.5,0.3,0.36,0,-0.07],[0.57,0.02,0.02,0,-0.07]],14,w,0,1));
  U.hairLong=mk(m=>m.loft([[-0.85,0.34,0.16,0,-0.3],[-0.5,0.46,0.24,0,-0.26],[-0.1,0.52,0.4,0,-0.16],[0.14,0.53,0.6,0,-0.06],[0.34,0.47,0.54,0,-0.07],[0.5,0.3,0.36,0,-0.07],[0.57,0.02,0.02,0,-0.07]],14,w,0,1));
  U.shoe=mk(m=>m.loft([[-0.5,0.34,0.3,0,0.05],[-0.2,0.44,0.42,0,0.05],[0.15,0.48,0.36],[0.4,0.42,0.24,0,-0.08],[0.5,0.2,0.12,0,-0.12]],10,w,0,2));
  U.hand=mk(m=>m.loft([[-0.5,0.2,0.12],[-0.2,0.42,0.2],[0.2,0.44,0.22],[0.5,0.3,0.2]],8,w,0,1));
  // quadruped: rump -> barrel -> chest -> shoulder; neck+head with tapering muzzle
  U.qbody=mk(m=>m.loft([[-0.5,0.14,0.18,0,0.1],[-0.42,0.36,0.4,0,0.04],[-0.2,0.45,0.48,0,-0.02],[0.08,0.47,0.5,0,-0.05],[0.3,0.43,0.5,0,-0.02],[0.44,0.3,0.4,0,0.06],[0.5,0.16,0.24,0,0.12]],14,w,0,2));
  U.qhead=mk(m=>{m.loft([[-0.5,0.34,0.36],[-0.2,0.48,0.5,0,0.02],[0.05,0.42,0.44],[0.3,0.28,0.28,0,-0.06],[0.46,0.22,0.2,0,-0.08],[0.5,0.1,0.08,0,-0.08]],12,w,0,2);
    for(const sx of [-1,1])m.loft([[0,0.1,0.05],[0.3,0.12,0.05],[0.55,0.01,0.01]],6,w,0,1,0,[sx*0.3,0.38,-0.25]);});
  U.wing=mk(m=>m.loft([[-0.5,0.5,0.03],[-0.1,0.42,0.05],[0.3,0.26,0.03],[0.5,0.02,0.01]],10,w,0,2));
  return G._unit=U;
};
})();
