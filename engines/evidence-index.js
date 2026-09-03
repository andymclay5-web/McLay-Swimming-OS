'use strict';
(function(g){
  const E=g.MSOSEngines?.Evidence;if(!E)return;
  const X=g.MSOSEvidenceIndex={build:'v4-evidence-index-20260826a'};
  const cache=new WeakMap(),key=v=>E.key?.(v)||String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  let buildCount=0;
  const arr=(o,...names)=>{for(const n of names){if(Array.isArray(o?.[n]))return o[n];}return[];};
  const rowName=r=>E.rowName?.(r)||r?.full_name||r?.athlete_name||r?.swimmer_name||r?.match_name||r?.source_swimmer_name||r?.name||'';
  const add=(map,k,row)=>{if(!k)return;let a=map.get(k);if(!a)map.set(k,a=[]);a.push(row);};
  function signature(state){const refs=state?._refs||{};const groups=[arr(state,'resultsPbBoard','results_pb_board'),arr(state,'resultsEventHistory','results_event_history'),arr(state,'coachResults','coach_results'),arr(refs,'results_pb_board'),arr(refs,'results_event_history'),arr(refs,'coach_results'),arr(state,'trainingTestResults','training_test_results'),arr(refs,'training_test_results'),arr(state,'trainingTestTypes','training_test_types'),arr(refs,'training_test_types'),arr(state,'athletes')];return groups.map(a=>`${a.length}:${a===groups[0]?'a':'x'}`).join('|')+`|rev:${Number(state?._evidenceBridge?.contentRevision)||0}`;}
  function build(state){const sig=signature(state),old=cache.get(state);if(old?.sig===sig)return old;buildCount++;
    const pbById=new Map(),pbByName=new Map(),testById=new Map(),testByName=new Map(),nameToIds=new Map(),seenPb=new Set(),seenTest=new Set();
    for(const a of state?.athletes||[]){const n=key(a?.full_name);if(!n)continue;let ids=nameToIds.get(n);if(!ids)nameToIds.set(n,ids=new Set());for(const v of [a?.id,a?.athlete_id,a?.legacy_id,a?.legacy_athlete_id,a?.source_id])if(v)ids.add(String(v));}
    const refs=state?._refs||{},pbRows=[...arr(state,'resultsPbBoard','results_pb_board'),...arr(state,'resultsEventHistory','results_event_history'),...arr(state,'coachResults','coach_results'),...arr(refs,'results_pb_board'),...arr(refs,'results_event_history'),...arr(refs,'coach_results')];
    for(const r of pbRows){if(!r||!Number.isFinite(E.seconds(r))||E.seconds(r)<=0)continue;const rid=r.id||`${r.athlete_id||r.swimmer_id||r.athleteId||''}|${E.distance(r)}|${E.rowStroke(r)}|${E.course(r)}|${E.seconds(r)}|${rowName(r)}`;if(seenPb.has(rid))continue;seenPb.add(rid);for(const id of [r.athlete_id,r.swimmer_id,r.athleteId])if(id)add(pbById,String(id),r);const n=key(rowName(r));if(n)add(pbByName,n,r);}
    const testRows=[...arr(state,'trainingTestResults','training_test_results'),...arr(refs,'training_test_results')];
    for(const r of testRows){if(!r||!Number.isFinite(E.seconds(r))||E.seconds(r)<=0)continue;const rid=r.id||`${r.athlete_id||r.swimmer_id||r.athleteId||''}|${r.test_type_id||''}|${r.result_date||''}|${E.seconds(r)}|${rowName(r)}`;if(seenTest.has(rid))continue;seenTest.add(rid);for(const id of [r.athlete_id,r.swimmer_id,r.athleteId])if(id)add(testById,String(id),r);const n=key(rowName(r));if(n)add(testByName,n,r);}
    const out={sig,pbById,pbByName,testById,testByName,nameToIds};cache.set(state,out);return out;
  }
  function rowsFor(ath,state,kind){if(!state||!ath)return[];const idx=build(state),ids=new Set();for(const v of [ath?.id,ath?.athlete_id,ath?.legacy_id,ath?.legacy_athlete_id,ath?.source_id])if(v)ids.add(String(v));const n=key(ath?.full_name);for(const v of idx.nameToIds.get(n)||[])ids.add(String(v));const out=[],seen=new Set(),byId=kind==='test'?idx.testById:idx.pbById,byName=kind==='test'?idx.testByName:idx.pbByName;const push=r=>{const id=r.id||r;if(seen.has(id))return;seen.add(id);out.push(r);};for(const id of ids)for(const r of byId.get(id)||[])push(r);for(const r of byName.get(n)||[])push(r);return out;}
  const originalPb=E.pbRows.bind(E),originalT400=E.t400Rows.bind(E);
  E.pbRows=(ath,state)=>{try{return rowsFor(ath,state,'pb')}catch{return originalPb(ath,state)}};
  E.t400Rows=(ath,state,wantedStroke='Freestyle',wantedCourse='')=>{try{const wanted=E.stroke(wantedStroke),wc=E.text(wantedCourse).toUpperCase();return rowsFor(ath,state,'test').filter(r=>E.isT400(state,r)&&E.t400Stroke(state,r)===wanted&&r.valid_for_anchor!==false&&(!wc||E.t400Course(r)===wc)).sort((a,b)=>{const ad=E.resultDateMs(a),bd=E.resultDateMs(b);if(ad!=null||bd!=null){if(ad==null)return 1;if(bd==null)return-1;if(ad!==bd)return bd-ad;}return E.seconds(a)-E.seconds(b);})}catch{return originalT400(ath,state,wantedStroke,wantedCourse)}};
  X.build=build;X.invalidate=state=>{if(state)cache.delete(state)};X.stats=()=>({buildCount});
})(globalThis);
