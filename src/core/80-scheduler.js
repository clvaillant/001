// scheduler: deterministic logical ticks, multi-rate updates, idempotent pending work, interest-based detail.
;(function(){'use strict';
const LW=globalThis.LW,V=LW.V;
const PENDING={birth:(w,pw)=>LW.life.birth(w,pw),personBirth:(w,pw)=>LW.society.personBirth(w,pw)};
function lod(w){
  const it=w.interest,R=w.body.radius;
  for(const id in w.persons){const p=w.persons[id];if(!p.alive)continue;
    const near=!it||p.pinned||p.control.mode==='player'||V.dist(p.n,it.n)*R<Math.max(it.r,900);
    if(!near&&p.lod==='active'){LW.mind.interrupt(w,p);p.lod='dormant';}     // demotion keeps identity, memory, needs: only the plan is dropped
    else if(near&&p.lod!=='active')p.lod='active';
  }
}
LW.tick=function(w){
  const t=++w.tick,play=w.mode==='play';
  if(w.pending.length){
    // pending work is removed in the same step that applies it, so a crash/replay can never apply it twice
    const due=[];w.pending=w.pending.filter(pw=>pw.due<=t?(due.push(pw),false):true);
    for(const pw of due)if(PENDING[pw.type])PENDING[pw.type](w,pw);
  }
  if(play){
    if(t%40===1)lod(w);
    for(const id in w.persons){const p=w.persons[id];if(!p.alive)continue;
      if(p.lod==='active')LW.mind.tickPerson(w,p);
      else if((t+LW.hashStr(id))%20===0)LW.mind.coarse(w,p,20);}
    const it=w.interest,R=w.body.radius;
    for(const id in w.organisms){const o=w.organisms[id],h=LW.hashStr(id);
      const far=it&&V.dist(o.n,it.n)*R>Math.max(it.r,1500);
      if(far){if((t+h)%40===0)LW.life.tickAnimal(w,o,40);}
      else if((t+h)%4===0)LW.life.tickAnimal(w,o,4);}
  }
  if(play||w.rules.envInCreate){
    if(t%LW.TPH===0)LW.env.hourly(w);
    if(t%LW.TPD===0){LW.env.daily(w);if(play){LW.life.cohortsDaily(w);LW.society.daily(w);}}
  }
};
// exact population accounting used by tests and the statistics inspector
LW.census=function(w){
  const out={persons:0,dead:0,active:0,dormant:0,animals:Object.keys(w.organisms).length,cohort:0,promoted:0};
  for(const id in w.persons){const p=w.persons[id];if(p.alive){out.persons++;out[p.lod==='active'?'active':'dormant']++;}else out.dead++;}
  for(const id in w.cohorts){out.cohort+=w.cohorts[id].count;out.promoted+=w.cohorts[id].promoted;}
  return out;
};
})();
