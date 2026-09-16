'use strict';
// Real coaching failure this instruments (Andy's "QR stopping at 5/5 0s" reports, 13-14 Sept 2026): after
// checking Andy's real Supabase project directly (training_test_types has only 10 rows; its RLS policies are
// cheap, non-recursive functions) and reproducing the exact "Give swimmer access" flow in a real Chromium
// browser -- including a network request that never resolves at all -- the status ticker kept advancing and
// the Close button kept working every time. That rules out slow/hung network calls, a huge reference table,
// and an expensive RLS policy as the explanation for a status text that Andy reports stays frozen at literal
// "0s" with an unresponsive Close button for two full watched minutes: a pending fetch() does not block the
// JS event loop, so timers and click handlers keep firing regardless of how slow or stuck the network is.
//
// The one mechanism that WOULD explain both symptoms together (ticker AND clicks both stop) is a genuine
// main-thread block -- and engines/storage.js's M.store.save() writes the FULL, uncompacted M.state (every
// session, every result, and the "Pending v4 writes" queue, which can only grow while cloud sync stays off)
// to IndexedDB via objectStore.put(), which the IndexedDB spec requires to structurally clone its value
// SYNCHRONOUSLY before the disk write even begins -- and this save fires roughly 40ms after almost every
// action in the app, including whatever Andy did just before tapping "Generate". If that clone is slow on his
// phone (state grown large after months of use with sync off), it would freeze the whole page for exactly as
// long as the clone takes, regardless of which swimmer or modal happens to be open -- matching "every
// swimmer, every time" exactly, and getting worse over time as the pending-writes queue keeps growing.
//
// This can't be proven from here without Andy's real device, so instead of shipping another guess, this adds
// (and here tests) lightweight timing instrumentation around the real save path: S.lastPersistTotalMs (the
// whole IndexedDB round trip) and S.lastPutSyncMs (just the synchronous put() hand-off, which is the part
// that would actually block the main thread). Next time this happens, the Connection page will show a real
// number instead of another guess.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');

const storagePath=path.join(__dirname,'..','engines','storage.js');
const realSrc=fs.readFileSync(storagePath,'utf8');

// A fake IndexedDB matching storage.js's actual usage: a single unnamed object store, out-of-line keys
// (put(value,key) / get(key), no keyPath), async via setTimeout like the real API. `putDelayMs` lets a test
// simulate a slow, synchronous structured-clone hand-off inside put() itself -- exactly the mechanism this
// instrumentation is meant to surface.
function makeFakeIndexedDB({putDelayMs=0}={}){
  const stores=new Map();
  return{
    open(name){
      const req={};
      setTimeout(()=>{
        if(!stores.has(name))stores.set(name,new Map());
        const objectStores=stores.get(name);
        const db={
          objectStoreNames:{contains:n=>objectStores.has(n)},
          createObjectStore(storeName){objectStores.set(storeName,new Map());return objectStores.get(storeName)},
          transaction(storeName){
            const data=objectStores.get(storeName),tx={};
            const objectStore={
              put(value,key){
                if(putDelayMs>0){const until=Date.now()+putDelayMs;while(Date.now()<until){/* simulate a slow synchronous structured-clone hand-off */}}
                data.set(key,value);
                setTimeout(()=>{tx.oncomplete&&tx.oncomplete()},0);
              },
              get(key){const r={};setTimeout(()=>{r.result=data.get(key);r.onsuccess&&r.onsuccess()},0);return r;},
            };
            tx.objectStore=()=>objectStore;
            return tx;
          },
          close(){},
        };
        req.result=db;req.onupgradeneeded&&req.onupgradeneeded();req.onsuccess&&req.onsuccess();
      },0);
      return req;
    },
  };
}

function bootSandbox(storageSrc,{putDelayMs=0}={}){
  const state={athletes:[],attendance:[],canonicalSessions:{},pending:[],settings:{}};
  const M={BUILD:'test-build',STORAGE_KEY:'test-storage-key',state,store:{}};
  const sandbox={
    MSOS4:M,console,setTimeout,clearTimeout,Date,
    indexedDB:makeFakeIndexedDB({putDelayMs}),
    localStorage:{data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=String(v)},removeItem(k){delete this.data[k]}},
  };
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(storageSrc,sandbox,{filename:'engines/storage.js (test copy)'});
  return{M,sandbox};
}

async function waitFor(fn,{timeoutMs=2000,stepMs=5}={}){
  const start=Date.now();
  while(Date.now()-start<timeoutMs){if(fn())return true;await new Promise(r=>setTimeout(r,stepMs));}
  return false;
}

async function run(){
  // Fixed baseline: an ordinary save should record both timings as small, real numbers.
  {
    const{M}=bootSandbox(realSrc);
    await M.storageEngine.readyPromise;
    M.state.settings.selectedSessionId='';
    M.store.save(M.state);
    const revision=M.state.settings.storageRevision;
    const persisted=await waitFor(()=>M.storageEngine.lastPersistTotalMs!=null);
    assert.ok(persisted,'S.lastPersistTotalMs was never recorded after an ordinary M.store.save()');
    assert.ok(Number.isFinite(M.storageEngine.lastPersistTotalMs)&&M.storageEngine.lastPersistTotalMs>=0,'lastPersistTotalMs must be a real, non-negative duration');
    assert.ok(Number.isFinite(M.storageEngine.lastPutSyncMs)&&M.storageEngine.lastPutSyncMs>=0,'lastPutSyncMs must be a real, non-negative duration');
    await M.storageEngine.whenPersisted(revision);
  }

  // The instrumentation must actually reflect a slow, blocking put() -- not just always report ~0 -- since a
  // number that never moves would be useless the next time this happens on Andy's phone.
  {
    const{M}=bootSandbox(realSrc,{putDelayMs:60});
    await M.storageEngine.readyPromise;
    M.store.save(M.state);
    const revision=M.state.settings.storageRevision;
    // Wait for the WHOLE persist round trip to finish (not just the synchronous put() hand-off, which
    // resolves earlier) before reading either number, since lastPersistTotalMs is only written once
    // persistLatest's own await on putRecord() completes.
    await M.storageEngine.whenPersisted(revision);
    await waitFor(()=>M.storageEngine.lastPersistTotalMs!=null);
    assert.ok(M.storageEngine.lastPutSyncMs>=40,`a deliberately slow (60ms) synchronous put() must show up in lastPutSyncMs, got ${M.storageEngine.lastPutSyncMs}`);
    assert.ok(M.storageEngine.lastPersistTotalMs>=M.storageEngine.lastPutSyncMs,'the total persist time must be at least as long as the synchronous put() hand-off it contains');
  }

  console.log('STORAGE_BACKGROUND_SAVE_TIMING_PASS');
}

async function runFailBefore(){
  // Fail-before: revert to the exact pre-instrumentation source (no timing captured anywhere) and confirm the
  // same check correctly fails, proving this test would have caught the missing diagnostic.
  const fixedPutRecord=`async function putRecord(key,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');const t0=Date.now();tx.objectStore(STORE).put(value,key);if(key===KEY)S.lastPutSyncMs=Date.now()-t0;tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>{const e=tx.error;db.close();reject(e||new Error('IndexedDB write failed'))};tx.onabort=()=>{const e=tx.error;db.close();reject(e||new Error('IndexedDB write aborted'))}})}`;
  const buggyPutRecord=`async function putRecord(key,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>{const e=tx.error;db.close();reject(e||new Error('IndexedDB write failed'))};tx.onabort=()=>{const e=tx.error;db.close();reject(e||new Error('IndexedDB write aborted'))}})}`;
  const fixedPersistLatest=`async function persistLatest(){if(writeRunning){writeAgain=true;return}writeRunning=true;writeAgain=false;const doCompact=compactAfterPending;compactAfterPending=false;const t0=Date.now();try{const state=M.state;if(!state)return;const revision=Number(state.settings?.storageRevision||0),savedAt=Date.now();await putRecord(KEY,{savedAt,revision,payload:state});S.lastPersistTotalMs=Date.now()-t0;acknowledgeRevision(revision);S.lastOperationalSavedAt=savedAt;S.lastError='';if(doCompact)scheduleCompactRecovery(state)}catch(e){S.lastPersistTotalMs=Date.now()-t0;S.lastError=String(e?.message||e)}finally{writeRunning=false;if(writeAgain)scheduleFull(0)}}`;
  const buggyPersistLatest=`async function persistLatest(){if(writeRunning){writeAgain=true;return}writeRunning=true;writeAgain=false;const doCompact=compactAfterPending;compactAfterPending=false;try{const state=M.state;if(!state)return;const revision=Number(state.settings?.storageRevision||0),savedAt=Date.now();await putRecord(KEY,{savedAt,revision,payload:state});acknowledgeRevision(revision);S.lastOperationalSavedAt=savedAt;S.lastError='';if(doCompact)scheduleCompactRecovery(state)}catch(e){S.lastError=String(e?.message||e)}finally{writeRunning=false;if(writeAgain)scheduleFull(0)}}`;

  assert.ok(realSrc.includes(fixedPutRecord),'test setup error: could not locate the fixed putRecord in the real file -- its wording changed in a way this test does not expect');
  assert.ok(realSrc.includes(fixedPersistLatest),'test setup error: could not locate the fixed persistLatest in the real file -- its wording changed in a way this test does not expect');
  let buggySrc=realSrc.replace(fixedPutRecord,buggyPutRecord).replace(fixedPersistLatest,buggyPersistLatest);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

  const{M}=bootSandbox(buggySrc);
  await M.storageEngine.readyPromise;
  M.store.save(M.state);
  const revision=M.state.settings.storageRevision;
  await M.storageEngine.whenPersisted(revision);
  assert.equal(M.storageEngine.lastPersistTotalMs,undefined,'the buggy pre-instrumentation storage.js must NOT record lastPersistTotalMs -- confirms this test would have caught the missing diagnostic');
  assert.equal(M.storageEngine.lastPutSyncMs,undefined,'the buggy pre-instrumentation storage.js must NOT record lastPutSyncMs -- confirms this test would have caught the missing diagnostic');

  console.log('STORAGE_BACKGROUND_SAVE_TIMING_FAILBEFORE_PASS');
}

run()
  .then(runFailBefore)
  .then(()=>{cp.execFileSync(process.execPath,['--check',storagePath],{stdio:'pipe'});})
  .catch(err=>{console.error(err);process.exit(1)});
