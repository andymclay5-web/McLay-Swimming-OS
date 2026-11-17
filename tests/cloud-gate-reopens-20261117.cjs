'use strict';
// Andy, Tue 17 Nov 2026: "The fact that it's not at the cloud yet and it's been there for ages is a concern ... when we've
// got multiple coaches on deck, I need them to see what I've put on straight away." His phone sent nothing from Monday
// night: that build changed the cloud column list, so the release gate wanted its read-only cloud check re-run for the
// new build -- and only "turn sync on" ran it. His sync was already on, so every send was skipped, silently. Proves:
//  1. With sync on and the cloud check out of date, the next send runs the read-only check itself and sends.
//  2. A failed screen-state check ("Selected session identity resolves") no longer holds sends back.
//  3. An assistant coach's phone never tries the owner-only swimmer-page publish (Kaleb's ~40 refused calls, Mon night).
//  4. If a phone still cannot send, a red "Not sent to the cloud · n waiting" shows after two minutes, and clears once sent.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await b.newPage({viewport:{width:390,height:844}});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.cloud?.flushOnce&&window.MSOS4?.storageEngine?.ready&&document.body.dataset.guardian,{timeout:25000});await p.waitForTimeout(500);
  const r=await p.evaluate(async()=>{const M=window.MSOS4,C=M.cloud,s=M.state.settings,U=M.util,old='v4-mon-20261116b';
    const calls=[];C.ready=()=>true;C.preflight=()=>({ok:true,errors:[]});C.org=()=>'org-1';M.teamAccess.isSignedIn=()=>true;
    C.fetch=async(path,opt={})=>{calls.push(`${opt.method||'GET'} ${String(path).split('?')[0]}`);return(opt.method||'GET')==='GET'?[]:null;};
    // Monday night: sync on, accepted and cloud-checked on the previous build, with the previous column list
    s.cloudWritesEnabled=true;s.cloudWriteBuild=old;s.cutoverBuild=old;s.guardianCutoverUnlocked=true;s.deviceAcceptedBuild=old;s.cloudWritesSuspended=null;
    s.cloudSchemaProbe={build:old,at:'x',schemaDigest:'digest-before-source_profile',tables:[...(C.CORE_WRITE_TABLES||[])],columns:{}};
    M.state.guardian.runs=[{build:M.BUILD,ok:true,tests:[{name:'Release Guardian · exact package is CI-attested',ok:true}]}];M.release.ensure();
    const before={canWrite:M.release.canWrite(),probe:M.release.cloudProbePassed()};
    const sess=M.parser.parse('MAIN SET\n8 x 250 Free Development',{date:'2026-11-17',dayPart:'AM',squads:['National'],course:'SCM'});sess.id='session-tue-am';M.store.putSession(M.state,sess);
    M.state.pending=[];C.stageSession?.(sess);if(!M.state.pending.length)C.queue('sessions',{id:sess.id,organisation_id:'org-1',session_date:'2026-11-17',day_part:'AM'});
    const pendingBefore=M.state.pending.length;C._gateTry=0;const out=await C.flush();
    const sent=calls.filter(c=>c.startsWith('POST /rest/v1/sessions')).length,probed=calls.filter(c=>c.startsWith('GET /rest/v1/')).length;
    // 2. a screen-state check failing on this build does not hold sends back
    M.state.guardian.runs.push({build:M.BUILD,ok:false,tests:[{name:'Release Guardian · exact package is CI-attested',ok:true},{name:'Selected session identity resolves',ok:false,detail:'x → missing'}]});
    const deviceOnly=M.release.guardianCurrent();
    // 3. the warning: a phone that cannot send for over two minutes says so
    M.state.pending=[{table:'sessions',action:'upsert',record:{id:'s2'},at:new Date().toISOString()}];M.release.canWrite=()=>false;C.ensureWriteGate=async()=>false;C._gateWhy='Cloud check failed: no connection';
    await C.flush();s.syncBlockedSince=new Date(Date.now()-5*60000).toISOString();C.renderSyncWarn();const warn=document.getElementById('cloudSyncWarn')?.textContent||'';
    delete M.release.canWrite;M.release.canWrite=()=>true;C.ensureWriteGate=async()=>true;await C.flush();const cleared=!document.getElementById('cloudSyncWarn');
    // Kaleb's phone, Monday 6:35 pm: ~40 swimmer-page publishes, all refused (owner only). An assistant's phone sends none.
    s.teamMembership={role:'assistant_coach',active:true};const before40=calls.length;const asst={soon:M.swimmerInviteBN.publishWorkingOnSoon({id:'athlete-x'}),refresh:await M.swimmerInviteBN.refreshAppSwimmers()};
    asst.rpc=calls.slice(before40).filter(c=>/msos_publish_swimmer_payload|msos_owner_swimmer_access/.test(c)).length;
    return{asst,before,pendingBefore,out,sent,probed,after:{canWrite:true,probe:M.release.cloudProbePassed(),probeBuild:s.cloudSchemaProbe.build},deviceOnly,warn,cleared,left:M.state.pending.length};});
  assert.deepEqual(r.before,{canWrite:false,probe:false},'Monday night: the out-of-date cloud check blocks sending: '+JSON.stringify(r));
  assert.ok(r.pendingBefore>=1);assert.ok(r.probed>=1,'the send ran the read-only cloud check itself: '+JSON.stringify(r));
  assert.ok(r.sent>=1,'the session went to the cloud: '+JSON.stringify(r));assert.equal(r.after.probe,true);assert.ok(!r.out?.skipped,JSON.stringify(r.out));
  assert.equal(r.deviceOnly,true,'a screen-state check does not make the build "not current"');
  assert.match(r.warn,/Not sent to the cloud · 1 waiting · 5 min/,r.warn);assert.equal(r.cleared,true,'the warning clears once the change is sent');
  assert.deepEqual(r.asst,{soon:false,refresh:null,rpc:0},'an assistant coach phone never tries owner-only swimmer publishing');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('CLOUD_GATE_REOPENS_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
