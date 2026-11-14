// presentation / procedural audio: wind, surf, rain, life chirps, settlement activity, species vocalisations.
// All synthesised with WebAudio; no samples. Driven by world state near the camera focus. Fully mutable.
;(function(){'use strict';
const LW=globalThis.LW,E=LW.env;
const A=LW.audio={ctx:null,muted:false,voicesMuted:false,layers:{},next:0,ok:false};
A.start=function(){
  if(A.ctx||A.failed)return;
  try{
    const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC){A.failed=true;return;}
    const ctx=A.ctx=new AC(),len=ctx.sampleRate*2,buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
    let s=12345;for(let i=0;i<len;i++){s=(Math.imul(s,1664525)+1013904223)>>>0;d[i]=s/2147483648-1;}
    A.master=ctx.createGain();A.master.gain.value=0.5;A.master.connect(ctx.destination);
    const layer=(type,freq,q)=>{const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;
      const g=ctx.createGain();g.gain.value=0;src.connect(f);f.connect(g);g.connect(A.master);src.start();return {g,f};};
    A.layers={wind:layer('bandpass',420,0.6),surf:layer('lowpass',260,0.4),rain:layer('highpass',2600,0.3),crowd:layer('bandpass',240,2.5)};
    A.ok=true;
  }catch(e){A.failed=true;}
};
function blip(freq,dur,rough,vol,sweep){
  const ctx=A.ctx,t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();
  o.type=rough>0.6?'sawtooth':rough>0.25?'triangle':'sine';o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*(sweep||1.3)),t+dur);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+0.02);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g);g.connect(A.master);o.start(t);o.stop(t+dur+0.05);
}
// species-specific call derived from the species' voice parameters
A.voice=function(sp){
  if(!A.ok||A.muted||A.voicesMuted||!sp||!sp.voice)return;
  const p=sp.voice.pitch,r=sp.voice.rough;blip(p,0.16+r*0.2,r,0.16,1.25);setTimeout(()=>A.ok&&!A.muted&&!A.voicesMuted&&blip(p*1.2,0.12+r*0.2,r,0.12,0.8),170);
};
A.click=function(){if(A.ok&&!A.muted)blip(880,0.05,0,0.05,1.0);};
A.setMuted=function(m){A.muted=m;if(A.master)A.master.gain.value=m?0:0.5;};
// called a few times per second with the camera state
A.update=function(world,cam,now){
  if(!A.ok||A.muted)return;
  const L=A.layers,t=A.ctx.currentTime,set=(l,v)=>l.g.gain.setTargetAtTime(v,t,0.4);
  const R=world.body.radius,near=LW.clamp(1-cam.alt/Math.max(2000,R*0.2),0,1),dens=Math.min(1.5,world.body.atmosphere.density);
  const c=E.cellOf(world,cam.n),d=E.d(world),rain=E.rain(world,cam.n,c);
  set(L.wind,(0.03+0.07*LW.smooth(100,R*0.3,cam.alt)+0.05*rain)*dens*(cam.depth>0?0.2:1));
  let sea=d.h[c]<world.body.seaLevel?1:0;for(let k=0;k<4;k++)if(d.h[d.nb[c*4+k]]<world.body.seaLevel)sea=Math.max(sea,0.6);
  set(L.surf,0.12*sea*near);set(L.rain,0.1*rain*near*dens);
  const s=LW.society.nearestSettlement(world,cam.n,500);
  set(L.crowd,s&&world.mode==='play'?Math.min(0.06,0.012*s.members.length)*near:0);
  if(now>A.next&&near>0.3&&world.mode==='play'){
    A.next=now+1500+Math.random()*4000;
    // living sounds exist only where living things exist
    let best=null,bd=400;for(const id in world.organisms){const o=world.organisms[id],dd=LW.arcDist(o.n,cam.n,R);if(dd<bd){bd=dd;best=o;}}
    if(best)A.voice(world.species[best.speciesId]);
    else if(s&&s.buildings.some(b=>world.buildings[b]&&world.buildings[b].progress<1))blip(160,0.06,1,0.1,0.7);        // hammering on a building site
  }
};
})();
