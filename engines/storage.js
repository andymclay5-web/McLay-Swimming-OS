'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.store)return;
  const S=M.storageEngine={build:'v4-storage-owner-final-20260825'};
  const DB='mclay_swimming_v4_operational_state',STORE='state',KEY='latest',UI_KEY='mclay_swimming_os_v4_ui',GUARDIAN_KEY='guardian';
  let ready=false,hydrateDone=false,dirtyBeforeReady=false,writeTimer=0,writeRunning=false,writeAgain=false,metaTimer=0,uiCache=null,knownAttendance=new Map();
  const now=()=>M.util?.now?.()||new Date().toISOString();
  const attendanceKey=r=>`${r.session_id||r.sessionId}|${r.athlete_id||r.athleteId}`;
  const selectedSession=s=>s?.settings?.selectedSessionId||'';
  const sessionCount=s=>Object.keys(s?.canonicalSessions||{}).length;
  const safeClone=v=>{try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v))}catch{return v}}};

  function openDb(){return new Promise((resolve,reject)=>{try{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('IndexedDB open failed'))}catch(e){reject(e)}})}
  async function putRecord(key,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>{const e=tx.error;db.close();reject(e||new Error('IndexedDB write failed'))};tx.onabort=()=>{const e=tx.error;db.close();reject(e||new Error('IndexedDB write aborted'))}})}
  async function getRecord(key){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),q=tx.objectStore(STORE).get(key);q.onsuccess=()=>{const v=q.result||null;db.close();resolve(v)};q.onerror=()=>{const e=q.error;db.close();reject(e||new Error('IndexedDB read failed'))}})}
  async function getFull(){return getRecord(KEY)}

  function ensurePresence(state){
    state.attendance=state.attendance||[];state.presenceEvents=state.presenceEvents||[];state.attendanceSnapshots=state.attendanceSnapshots||{};
    const next=new Map(),touched=new Set();
    for(const r of state.attendance){
      const sid=r?.session_id||r?.sessionId,aid=r?.athlete_id||r?.athleteId;if(!sid||!aid)continue;
      const k=attendanceKey(r),sig=`${r.status||''}|${r.updated_at||''}`;next.set(k,sig);
      if(knownAttendance.get(k)!==undefined&&knownAttendance.get(k)!==sig){state.presenceEvents.push({id:M.util?.uid?.('presence')||`presence-${Date.now()}-${Math.random()}`,session_id:sid,athlete_id:aid,status:r.status||'absent',at:r.updated_at||now(),source:'attendance_change'});touched.add(sid)}
    }
    knownAttendance=next;
    for(const sid of touched){const rows=state.attendance.filter(x=>(x.session_id||x.sessionId)===sid),present=rows.filter(x=>['present','modified','late'].includes(String(x.status||'').toLowerCase()));state.attendanceSnapshots[sid]={session_id:sid,rows:safeClone(rows),present_ids:present.map(x=>x.athlete_id||x.athleteId),count:present.length,source:'attendance_change',updated_at:now()}}
  }

  function uiSnapshot(state=M.state){const s=state?.settings||{};return{selectedSessionId:s.selectedSessionId||'',selectedAthleteId:s.selectedAthleteId||'',selectedSwimmerId:s.selectedSwimmerId||'',loopAthleteTab:s.loopAthleteTab||'performance',pathwayCourse:s.pathwayCourse||'SCM',boardFocusMode:s.boardFocusMode!==false,t400Stroke:s.t400Stroke||'Freestyle',t400PreferredAthleteId:s.t400PreferredAthleteId||'',v4TimingMode:s.v4TimingMode||'t400',reportScope:s.reportScope||'squad',reportDays:s.reportDays===undefined?7:Number(s.reportDays),reportCourse:s.reportCourse||s.pathwayCourse||'SCM',reportSquad:s.reportSquad||'',reportAthleteId:s.reportAthleteId||'',currentMeetId:s.currentMeetId||'',savedAt:Date.now()}}
  function writeUiLater(){if(metaTimer)return;metaTimer=setTimeout(()=>{metaTimer=0;try{localStorage.setItem(UI_KEY,JSON.stringify(uiCache||{}));S.lastUiPersistedAt=Date.now()}catch(e){S.lastUiError=String(e?.message||e)}},0)}
  function saveUi(state=M.state){try{uiCache=uiSnapshot(state);writeUiLater();return true}catch(e){S.lastUiError=String(e?.message||e);return false}}
  function readUi(){if(uiCache)return uiCache;try{uiCache=JSON.parse(localStorage.getItem(UI_KEY)||'null')||null}catch{uiCache=null}return uiCache}
  function applyUi(state){const ui=readUi();if(!state)return;state.settings=state.settings||{};if(ui)for(const[k,v]of Object.entries(ui))if(k!=='savedAt'&&v!==undefined)state.settings[k]=v;
    // A true cold launch always starts at a clean Board. Resume inside the same page keeps its own scroll/view.
    state.settings.view='board';state.settings.expandedItemId='';state.settings.boardExpandedTargetId='';state.settings.viewScroll={};state.settings.sessionScroll={};
  }

  function publish(state){try{M.live?.publishState?.(state)}catch{}}
  async function persistLatest(){
    if(writeRunning){writeAgain=true;return}
    writeRunning=true;writeAgain=false;
    try{
      const state=M.state;if(!state)return;
      const revision=Number(state.settings?.storageRevision||0);
      // IndexedDB performs the structured clone. Avoid JSON.stringify/explicit whole-state clone on the interaction thread.
      await putRecord(KEY,{savedAt:Date.now(),revision,payload:state});
      S.lastPersistedAt=Date.now();S.lastError='';
    }catch(e){S.lastError=String(e?.message||e)}finally{writeRunning=false;if(writeAgain)scheduleFull(0)}
  }
  function scheduleFull(delay=60){if(!ready){dirtyBeforeReady=true;return true}if(writeTimer){clearTimeout(writeTimer);writeTimer=0}writeTimer=setTimeout(()=>{writeTimer=0;persistLatest()},Math.max(0,delay));return true}

  M.store.save=state=>{
    if(state!==M.state){S.blockedForeignStateSaves=Number(S.blockedForeignStateSaves||0)+1;return state}
    state.build=M.BUILD;state.settings=state.settings||{};ensurePresence(state);
    if(!ready){dirtyBeforeReady=true;saveUi(state);return state}
    if(M.live&&!M.live.suppress)state.settings.liveRevision=Number(state.settings.liveRevision||0)+1;
    state.settings.storageRevision=Number(state.settings.storageRevision||0)+1;
    state.settings.storageMode='indexeddb';
    scheduleFull(40);saveUi(state);publish(state);return state;
  };

  function guardianShape(result){return{ok:result?.ok===true,passed:Number(result?.passed)||0,total:Number(result?.total)||0,at:result?.at||now(),build:String(result?.build||M.BUILD||''),contract:String(result?.contract||''),tests:Array.isArray(result?.tests)?result.tests.slice(0,12).map(t=>({name:String(t?.name||''),ok:t?.ok===true,detail:String(t?.detail||'').slice(0,280)})):[]}}
  function saveGuardianResult(result){const row=guardianShape(result);M.state.guardian=M.state.guardian&&typeof M.state.guardian==='object'?M.state.guardian:{runs:[]};M.state.guardian.runs=[...(M.state.guardian.runs||[]),row].slice(-3);putRecord(GUARDIAN_KEY,{savedAt:Date.now(),payload:{runs:M.state.guardian.runs}}).catch(e=>S.lastGuardianError=String(e?.message||e));return row}
  async function loadGuardian(){try{const r=await getRecord(GUARDIAN_KEY);if(Array.isArray(r?.payload?.runs)){M.state.guardian=M.state.guardian||{runs:[]};M.state.guardian.runs=r.payload.runs.slice(-3)}}catch(e){S.lastGuardianError=String(e?.message||e)}}

  S.save=M.store.save;S.saveUi=saveUi;S.readUi=readUi;S.applyUi=applyUi;S.getFull=getFull;S.ensurePresence=ensurePresence;S.saveGuardianResult=saveGuardianResult;S.scheduleFull=scheduleFull;
  Object.defineProperty(S,'ready',{get:()=>ready});

  async function hydrate(){
    try{
      const row=await getFull(),local=M.state||{};
      if(row?.payload){
        const full=row.payload,localRev=Number(local?.settings?.storageRevision||0),fullRev=Number(row.revision||full?.settings?.storageRevision||0),localSessions=sessionCount(local),fullSessions=sessionCount(full);
        const localRicher=localSessions>fullSessions,useFull=(local?.settings?.storageMode==='indexeddb'||fullRev>=localRev)&&!localRicher;
        if(useFull){for(const k of Object.keys(local))delete local[k];Object.assign(local,full);M.state=local;M.release?.ensure?.();S.hydratedFromIndexedDb=true}else if(localRicher)S.recoveredRicherLocalState=true;
      }
      applyUi(M.state);await loadGuardian();
      knownAttendance=new Map((M.state.attendance||[]).filter(x=>(x?.session_id||x?.sessionId)&&(x?.athlete_id||x?.athleteId)).map(x=>[attendanceKey(x),`${x.status||''}|${x.updated_at||''}`]));
      M.state.settings=M.state.settings||{};M.state.settings.storageMode='indexeddb';ready=true;hydrateDone=true;
      requestAnimationFrame(()=>{M.ui?.renderCurrent?.();requestAnimationFrame(()=>window.scrollTo?.(0,0))});
      if(dirtyBeforeReady||!row?.payload){dirtyBeforeReady=false;scheduleFull(250)}
    }catch(e){S.lastError=String(e?.message||e);applyUi(M.state);ready=true;hydrateDone=true;requestAnimationFrame(()=>M.ui?.renderCurrent?.());if(dirtyBeforeReady){dirtyBeforeReady=false;scheduleFull(250)}}
  }
  S.readyPromise=hydrate();S.hydrated=()=>hydrateDone;
})(globalThis);
