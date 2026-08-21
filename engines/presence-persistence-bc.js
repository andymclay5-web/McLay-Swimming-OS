'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.state||!M?.store)return;
  const P=M.presencePersistenceBC={build:'v4-presence-persistence-20260822bc'};
  const U=M.util||{},clone=v=>U.clone?U.clone(v):JSON.parse(JSON.stringify(v)),now=()=>U.now?U.now():new Date().toISOString();
  const ts=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:0};
  function ensure(){const s=M.state;s.attendance=s.attendance||[];s.presenceEvents=s.presenceEvents||[];s.attendanceSnapshots=s.attendanceSnapshots||{};return s}
  function rows(sessionId,state=M.state){return(state.attendance||[]).filter(x=>x.session_id===sessionId)}
  function key(r){return `${r.session_id}|${r.athlete_id}`}
  function mergeRows(local=[],incoming=[],sessionId=''){
    const map=new Map();
    for(const row of local||[])if(row?.session_id===sessionId&&row?.athlete_id)map.set(row.athlete_id,clone(row));
    for(const row of incoming||[]){if(row?.session_id!==sessionId||!row?.athlete_id)continue;const old=map.get(row.athlete_id);if(!old||ts(row.updated_at)>=ts(old.updated_at))map.set(row.athlete_id,clone(row));}
    return [...map.values()];
  }
  function snapshot(sessionId,{source='state'}={}){
    ensure();const rs=rows(sessionId);if(!rs.length)return M.state.attendanceSnapshots[sessionId]||null;
    const present=rs.filter(x=>['present','modified','late'].includes(String(x.status||'').toLowerCase()));
    const snap={session_id:sessionId,rows:clone(rs),present_ids:present.map(x=>x.athlete_id),count:present.length,source,updated_at:now()};
    M.state.attendanceSnapshots[sessionId]=snap;return snap;
  }
  function restoreSnapshot(sessionId,{persist=true}={}){
    ensure();if(rows(sessionId).length)return{restored:false,reason:'live attendance exists'};
    const snap=M.state.attendanceSnapshots?.[sessionId];if(!snap?.rows?.length)return{restored:false,reason:'no snapshot'};
    M.state.attendance=(M.state.attendance||[]).filter(x=>x.session_id!==sessionId).concat(clone(snap.rows));
    if(persist)originalSave(M.state);return{restored:true,count:snap.count||snap.rows.length};
  }
  function recoveryCandidates(sessionId){
    const ids=new Set();
    for(const c of M.state.captures||[]){if(c.session_id!==sessionId)continue;for(const id of c.athlete_ids||[])if(id)ids.add(id);if(c.athlete_id)ids.add(c.athlete_id)}
    for(const t of M.state.timedSets||[])if(t.session_id===sessionId&&t.athlete_id)ids.add(t.athlete_id);
    for(const r of M.state.trainingTestResults||[])if(r.session_id===sessionId&&r.athlete_id)ids.add(r.athlete_id);
    return [...ids].map(id=>M.state.athletes?.find(a=>a.id===id)).filter(Boolean);
  }

  ensure();
  const originalSave=M.store.save.bind(M.store);
  let known=new Map((M.state.attendance||[]).filter(x=>x?.session_id&&x?.athlete_id).map(x=>[key(x),`${x.status||''}|${x.updated_at||''}`]));
  M.store.save=state=>{
    ensure();const next=new Map();const touched=new Set();
    for(const r of state.attendance||[]){if(!r?.session_id||!r?.athlete_id)continue;const k=key(r),sig=`${r.status||''}|${r.updated_at||''}`;next.set(k,sig);if(known.get(k)!==sig){state.presenceEvents.push({id:U.uid?U.uid('presence'):`presence-${Date.now()}-${Math.random()}`,session_id:r.session_id,athlete_id:r.athlete_id,status:r.status||'absent',at:r.updated_at||now(),source:'attendance_change'});touched.add(r.session_id)}}
    known=next;for(const sid of touched)snapshot(sid,{source:'attendance_change'});
    return originalSave(state);
  };

  if(M.live?.apply){const prior=M.live.apply.bind(M.live);M.live.apply=msg=>{
    if(msg?.sessionId){const sid=msg.sessionId,local=rows(sid),incoming=Array.isArray(msg.attendance)?msg.attendance:[];msg={...msg,attendance:mergeRows(local,incoming,sid)};}
    return prior(msg);
  }}

  function attachFinishSnapshot(next,sessionId){if(!next?.finish)return next;const snap=snapshot(sessionId,{source:'finish'});next.finish={...next.finish,attendanceSnapshot:clone(snap?.rows||[]),attendanceCount:Number(snap?.count)||0};return next}
  if(M.changes?.finishAtItem){const prior=M.changes.finishAtItem.bind(M.changes);M.changes.finishAtItem=(session,...args)=>attachFinishSnapshot(prior(session,...args),session.id)}
  if(M.changes?.finishAtBlock){const prior=M.changes.finishAtBlock.bind(M.changes);M.changes.finishAtBlock=(session,...args)=>attachFinishSnapshot(prior(session,...args),session.id)}

  const priorRoll=M.ui?.renderRoll?.bind(M.ui);if(priorRoll)M.ui.renderRoll=()=>{const s=M.currentSession?.();if(s)restoreSnapshot(s.id,{persist:false});return priorRoll()};
  const priorNavInit=M.nav?.init?.bind(M.nav);if(priorNavInit){let first=true;M.nav.init=()=>{if(first){first=false;const role=M.access?.role?.()||'owner';if(role==='owner'&&M.state.settings.view==='athletes'){M.state.settings.view='board';M.state.settings.expandedItemId='';}}return priorNavInit()}}

  P.ensure=ensure;P.rows=rows;P.mergeRows=mergeRows;P.snapshot=snapshot;P.restoreSnapshot=restoreSnapshot;P.recoveryCandidates=recoveryCandidates;
  P.sessionStatus=sessionId=>{const live=rows(sessionId),snap=M.state.attendanceSnapshots?.[sessionId]||null,candidates=recoveryCandidates(sessionId);return{sessionId,liveRows:live.length,present:live.filter(x=>['present','modified','late'].includes(String(x.status||'').toLowerCase())).length,snapshotCount:snap?.count||0,recoveryCandidates:candidates.map(a=>({id:a.id,name:a.full_name}))}};
})(globalThis);
