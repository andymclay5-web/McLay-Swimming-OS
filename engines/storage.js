'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.store)return;
  const S=M.storageEngine={build:'v4-storage-20260820l'};
  const DB='mclay_swimming_v4_operational_state',STORE='state',KEY='latest',LOCAL_LIMIT=3200000;
  let writeChain=Promise.resolve();
  const clone=v=>{try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v))}catch{return v}}};
  const selectedSession=s=>s?.settings?.selectedSessionId||'';
  const currentMeet=s=>s?.settings?.currentMeetId||'';
  function openDb(){return new Promise((resolve,reject)=>{try{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('IndexedDB open failed'));}catch(e){reject(e)}})}
  async function putFull(state){const snap=clone(state);const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({savedAt:Date.now(),revision:Number(state?.settings?.storageRevision||0),payload:snap},KEY);tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>{const e=tx.error;db.close();reject(e||new Error('IndexedDB write failed'))};tx.onabort=()=>{const e=tx.error;db.close();reject(e||new Error('IndexedDB write aborted'))};})}
  async function getFull(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),q=tx.objectStore(STORE).get(KEY);q.onsuccess=()=>{const v=q.result||null;db.close();resolve(v)};q.onerror=()=>{const e=q.error;db.close();reject(e||new Error('IndexedDB read failed'))};})}
  function compact(state){const sid=selectedSession(state),mid=currentMeet(state),sessions={};if(sid&&state?.canonicalSessions?.[sid])sessions[sid]=state.canonicalSessions[sid];const attendance=(state?.attendance||[]).filter(x=>!sid||x.sessionId===sid||x.session_id===sid).slice(-300);const overrides=(state?.adaptationOverrides||[]).filter(x=>x?.active!==false&&(!sid||!x.sessionId||x.sessionId===sid)).slice(-300);const meetEntries=(state?.meetEntries||[]).filter(x=>!mid||x.meetId===mid||x.meet_id===mid).slice(-300),meetRaces=(state?.meetRaces||[]).filter(x=>!mid||x.meetId===mid||x.meet_id===mid).slice(-300);return{schema:4,build:M.BUILD,canonicalSessions:sessions,athletes:state?.athletes||[],attendance,captures:[],timedSets:(state?.timedSets||[]).slice(-20),trainingTestTypes:state?.trainingTestTypes||state?.training_test_types||[],trainingTestResults:(state?.trainingTestResults||state?.training_test_results||[]).slice(-80),adaptationProfiles:state?.adaptationProfiles||state?.athlete_adaptation_profiles||[],adaptationOverrides:overrides,coachResults:[],athleteAchievements:(state?.athleteAchievements||[]).slice(-50),meets:mid?(state?.meets||[]).filter(x=>x.id===mid):(state?.meets||[]).slice(-5),meetEntries,meetRaces,meetEvidence:[],settings:{...(state?.settings||{}),storageMode:'indexeddb',storageCompacted:true},pending:[],guardian:{runs:(state?.guardian?.runs||[]).slice(-5)}}}
  function writeLocalCompact(state){const payload=JSON.stringify(compact(state));try{localStorage.setItem(M.STORAGE_KEY,payload);return true}catch(e){try{localStorage.removeItem(M.STORAGE_KEY);localStorage.setItem(M.STORAGE_KEY,payload);return true}catch{return false}}}
  function publish(state){try{M.live?.publishState?.(state)}catch{}}
  function queueFull(state,{compactAfter=false}={}){writeChain=writeChain.catch(()=>{}).then(()=>putFull(state)).then(()=>{if(compactAfter)writeLocalCompact(state);S.lastPersistedAt=Date.now();S.lastError='';return true}).catch(e=>{S.lastError=String(e?.message||e);return false});return writeChain}
  const originalSave=M.store.save.bind(M.store);
  M.store.save=state=>{
    state.build=M.BUILD;state.settings=state.settings||{};if(M.live&&!M.live.suppress)state.settings.liveRevision=Number(state.settings.liveRevision||0)+1;state.settings.storageRevision=Number(state.settings.storageRevision||0)+1;
    let json='';try{json=JSON.stringify(state)}catch{}
    const oversized=json.length>LOCAL_LIMIT;
    if(!oversized){try{localStorage.setItem(M.STORAGE_KEY,json)}catch{queueFull(state,{compactAfter:true});publish(state);return state}}
    else queueFull(state,{compactAfter:true});
    if(!oversized)queueFull(state,{compactAfter:false});
    publish(state);return state;
  };
  S.save=M.store.save;S.compact=compact;S.putFull=putFull;S.getFull=getFull;
  async function hydrate(){try{const row=await getFull();if(!row?.payload){const raw=JSON.stringify(M.state||{});if(raw.length>LOCAL_LIMIT)await queueFull(M.state,{compactAfter:true});else await queueFull(M.state);S.ready=true;return}
      const local=M.state||{},full=row.payload,localRev=Number(local?.settings?.storageRevision||0),fullRev=Number(row.revision||full?.settings?.storageRevision||0);if(local?.settings?.storageMode==='indexeddb'||fullRev>=localRev){const preserved={...(full.settings||{}),...(local.settings||{})};for(const k of Object.keys(local))delete local[k];Object.assign(local,clone(full));local.settings=preserved;M.state=local;M.release?.ensure?.();S.hydratedFromIndexedDb=true;}
      S.ready=true;requestAnimationFrame(()=>M.ui?.renderCurrent?.());
    }catch(e){S.lastError=String(e?.message||e);S.ready=true}}
  S.ready=false;S.readyPromise=hydrate();
  // Immediately migrate an already-over-quota v4 payload without deleting it until the full snapshot is safely in IndexedDB.
  try{const raw=localStorage.getItem(M.STORAGE_KEY)||'';if(raw.length>LOCAL_LIMIT)queueFull(M.state,{compactAfter:true})}catch{}
})(globalThis);
