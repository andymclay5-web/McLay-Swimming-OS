'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.Performance=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-aw';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const stroke=v=>{const s=text(v).toLowerCase();if(/free/.test(s))return'Freestyle';if(/back/.test(s))return'Backstroke';if(/breast/.test(s))return'Breaststroke';if(/fly|butterfly/.test(s))return'Butterfly';if(/\bim\b|medley/.test(s))return'IM';return text(v);};
  const course=v=>text(v).toUpperCase();
  const seconds=row=>{for(const k of ['seconds','result_seconds','pb_seconds','time_seconds'])if(Number.isFinite(Number(row?.[k]))&&Number(row[k])>0)return Number(row[k]);const raw=text(row?.result_time_text||row?.pb_time||row?.time);if(!raw)return NaN;const p=raw.split(':').map(Number);return p.length===2?p[0]*60+p[1]:Number(raw);};
  const eventKey=row=>`${course(row?.course||row?.pool_course)}|${Number(row?.distance)||0}|${stroke(row?.stroke||row?.event_stroke)}`;
  function dedupePBs(rows=[]){const map=new Map();for(const row of rows||[]){const s=seconds(row),k=eventKey(row);if(!Number.isFinite(s)||s<=0||/^\|0\|/.test(k))continue;const old=map.get(k);if(!old||s<old.seconds){map.set(k,{key:k,course:course(row.course||row.pool_course),distance:Number(row.distance),stroke:stroke(row.stroke||row.event_stroke),seconds:s,bestRow:row,provenance:[row]});}else old.provenance.push(row);}return[...map.values()].sort((a,b)=>a.distance-b.distance||a.stroke.localeCompare(b.stroke)||a.course.localeCompare(b.course));}
  function rankedEvents(pbs=[],pointsFor){return pbs.map(p=>({pb:p,points:Number(pointsFor?.(p.bestRow,p))||Number(p.bestRow?.points)||Number(p.bestRow?.wa_points)||NaN})).filter(x=>Number.isFinite(x.points)&&x.points>0).sort((a,b)=>b.points-a.points||a.pb.seconds-b.pb.seconds);}
  function nextMilestoneFor(pb,milestones=[]){const rows=(milestones||[]).filter(m=>course(m.course)===pb.course&&Number(m.distance)===pb.distance&&stroke(m.stroke)===pb.stroke&&Number.isFinite(Number(m.seconds))&&Number(m.seconds)>0).map(m=>({...m,seconds:Number(m.seconds),gapSeconds:pb.seconds-Number(m.seconds)})).filter(m=>m.gapSeconds>0).sort((a,b)=>a.gapSeconds-b.gapSeconds);return rows[0]||null;}
  function allEventGaps(pbs=[],milestones=[]){return pbs.map(pb=>({pb,next:nextMilestoneFor(pb,milestones)}));}
  function findPB(pbs,event={}){const c=course(event.course),d=Number(event.distance),st=stroke(event.stroke);const same=pbs.filter(p=>(!c||p.course===c)&&p.distance===d&&p.stroke===st).sort((a,b)=>a.seconds-b.seconds);return same[0]||null;}
  return{VERSION,stroke,course,seconds,eventKey,dedupePBs,rankedEvents,nextMilestoneFor,allEventGaps,findPB};
});
