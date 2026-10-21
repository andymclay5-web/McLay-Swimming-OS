'use strict';
// Swimmer goals (19 Oct 2026). Andy, after the first pool TV night (William's mum's idea): pick a goal for a swimmer --
// "win a gold medal at New Zealand Age Groups" -- and put it on the TV "at a push", so the swimmer sees where they are
// going and how far away it is.
//
// Owner of one thing: each swimmer's goal (one per swimmer). A goal is an event + a standard from that swimmer's own
// pathway ladder (qualifying / final / medal, from the pathway engine), or a time the coach types. Saved on this phone
// first, then to the team cloud (supabase/20261019_swimmer_goals.sql) through the normal sync queue, so every coach
// sees the same goal. It decides nothing about the pathway itself and never changes a PB or a standard.
(function(g){
  const M=g.MSOS4,EN=g.MSOSEngines;if(!M?.state)return;
  const G=M.swimmerGoals={build:'v4-swimmer-goals-20261019'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const now=()=>new Date().toISOString();
  const C=()=>M.cloud;
  const Ev=()=>EN?.Evidence;
  const store=()=>M.state.swimmerGoals||(M.state.swimmerGoals={});
  function who(){const role=M.access?.role?.()||'owner';if(role==='owner')return'Head coach';const e=String(M.store?.auth?.()?.user?.email||'').split('@')[0].replace(/[^a-z]/gi,'');return e?e[0].toUpperCase()+e.slice(1).toLowerCase():'Coach';}
  G.get=id=>{const r=store()[id];return r&&r.goal?r:null;};
  function clean(goal){if(!goal)return null;const sec=Number(goal.seconds);if(!(Number(goal.distance)>0)||!text(goal.stroke)||!(sec>0))throw new Error('A goal needs an event and a time');
    return{distance:Number(goal.distance),stroke:Ev()?.stroke?.(goal.stroke)||text(goal.stroke),course:/^L/i.test(goal.course)?'LCM':'SCM',label:text(goal.label)||'Goal time',kind:text(goal.kind)||'coach',seconds:Math.round(sec*100)/100,targetDate:text(goal.targetDate).slice(0,10)||null};}
  // set (or clear with null): this phone first, then the team
  G.set=(athleteId,goal)=>{const a=(M.state.athletes||[]).find(x=>x.id===athleteId);if(!a)throw new Error('Swimmer not found');
    const row={goal:clean(goal),set_by_name:who(),updated_at:now()};store()[athleteId]=row;M.store?.save?.(M.state);
    try{const org=C()?.org?.();if(org)C().queue('msos_swimmer_goals',{id:athleteId,organisation_id:org,athlete_id:athleteId,goal:row.goal,set_by_name:row.set_by_name,updated_at:row.updated_at});}catch{}
    return row;};
  // the other coaches' goals (newer wins; this phone's unsent change wins)
  G.pull=async()=>{const c=C();if(!c?.ready?.()||!c.org?.())return 0;let rows=[];try{rows=await c.fetch(`/rest/v1/msos_swimmer_goals?select=athlete_id,goal,set_by_name,updated_at&organisation_id=eq.${encodeURIComponent(c.org())}`)||[];}catch{return 0;}
    const pending=new Set((M.state.pending||[]).filter(p=>p.table==='msos_swimmer_goals').map(p=>p.record?.id));let n=0;
    for(const r of Array.isArray(rows)?rows:[]){if(pending.has(r.athlete_id))continue;const cur=store()[r.athlete_id];if(cur&&Date.parse(cur.updated_at||0)>=Date.parse(r.updated_at||0))continue;store()[r.athlete_id]={goal:r.goal||null,set_by_name:r.set_by_name||'',updated_at:r.updated_at};n++;}
    if(n)M.store?.save?.(M.state);G.pulledAt=Date.now();return n;};
  // where the swimmer is against the goal: PB in that course, the gap, and the pathway steps on the way
  G.progress=(athleteId)=>{const r=G.get(athleteId),a=(M.state.athletes||[]).find(x=>x.id===athleteId);if(!r||!a)return null;const goal=r.goal;
    let pb=null;try{const rows=M.performanceEngine?.rows?.(a,M.state,'')||[];for(const x of rows){if(Number(x.distance)!==goal.distance||(Ev()?.stroke?.(x.stroke)||x.stroke)!==goal.stroke||(x.course==='LCM'?'LCM':'SCM')!==goal.course)continue;if(!pb||x.seconds<pb.seconds)pb={seconds:x.seconds,date:text(x.raw?.result_date||x.raw?.date||'').slice(0,10)};}}catch{}
    let steps=[];try{const lad=M.performanceEngine?.pathwayLadderForEvent?.(a,{distance:goal.distance,stroke:goal.stroke,course:goal.course,seconds:pb?.seconds,pbSeconds:pb?.seconds},{course:goal.course});
      steps=((lad?.tracks?.[goal.course])||lad?.steps||[]).filter(s=>Number(s.seconds)>goal.seconds+0.004&&(!pb||Number(s.seconds)<pb.seconds)).sort((x,y)=>y.seconds-x.seconds).map(s=>({label:G.friendly(s.displayLabel||s.label),kind:s.kind,seconds:s.seconds}));}catch{}
    const gap=pb?Math.max(0,pb.seconds-goal.seconds):null;
    return{goal,by:r.set_by_name,at:r.updated_at,pb,gap,gapPct:pb&&goal.seconds>0?gap/goal.seconds*100:null,reached:!!pb&&pb.seconds<=goal.seconds,steps:steps.slice(0,4)};};
  // the pathway benchmarks in coach words ("National Age winner benchmark" is the gold-medal time at NZ Age Groups)
  const FRIENDLY=[[/^National Age (winner|medal|finalist) benchmark/i,'NZ Age Groups'],[/^National SC age (winner|medal|finalist) benchmark/i,'NZ SC (age)'],[/^National SC open (winner|medal|finalist) benchmark/i,'NZ SC (open)'],[/^NZ Open (winner|medal|finalist) benchmark/i,'NZ Open']];
  const WHAT={winner:'gold',medal:'medal',finalist:'final'};
  G.friendly=label=>{for(const[re,meet]of FRIENDLY){const m=text(label).match(re);if(m)return`${meet} · ${WHAT[m[1].toLowerCase()]}`;}return text(label);};
  // choices for the goal picker: every standard on the swimmer's ladder for an event, both courses, strongest last
  G.choices=(athleteId,distance,stroke)=>{const a=(M.state.athletes||[]).find(x=>x.id===athleteId);if(!a)return[];const out=[];
    for(const course of ['SCM','LCM']){try{const lad=M.performanceEngine?.pathwayLadderForEvent?.(a,{distance:Number(distance),stroke},{course});for(const s of (lad?.tracks?.[course]||[])){if(!(Number(s.seconds)>0))continue;out.push({distance:Number(distance),stroke,course,label:G.friendly(s.displayLabel||s.label),source:text(s.displayLabel||s.label),kind:s.kind,seconds:Number(s.seconds),targetDate:s.targetDate||null,achieved:!!s.achieved});}}catch{}}
    const seen=new Set();return out.filter(c=>{const k=`${c.course}|${c.label}|${c.seconds.toFixed(2)}`;if(seen.has(k))return false;seen.add(k);return true;}).sort((x,y)=>x.course.localeCompare(y.course)||y.seconds-x.seconds);};
  // fetched when a swimmer screen opens (engines/tv-display.js), never in the background
})(globalThis);
