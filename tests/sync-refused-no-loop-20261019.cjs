'use strict';
// 19 Oct 2026, pool TV night (live Supabase logs): Jordan's iPhone had changes the cloud refuses -- swimmer edits (only
// the head coach may change swimmer details) and a new session (fixed separately in
// supabase/20261019_assistant_upsert_rls.sql) -- and re-sent them every flush: 600+ refusals in 20 minutes. That
// flooded the pool connection: the TV took ~30 s per tap and tonight's video never reached the cloud.
// Proves:
//  1. A refused change (403 / row-level security) is retried with growing gaps, not on every flush, and after three
//     refusals is set aside with a plain reason -- the data stays on the phone.
//  2. Everything else in the queue still goes up in the same flush (a refused swimmer edit doesn't hold back Roll).
//  3. A network failure is not a refusal: it is never set aside.
//  4. The Connection screen lists what was set aside, and "Try again" puts it back in the queue.
//  5. An assistant's phone no longer queues edits to existing club swimmers just because it marked them on the Roll.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.cloud?.flushOnce&&window.MSOS4?.cloud?.refused&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await p.waitForTimeout(500);
  const r=await p.evaluate(async()=>{const M=window.MSOS4,C=M.cloud;const at=new Date().toISOString();
    M.state.athletes=[{id:'ash',full_name:'Ashley Brown',squad:'National',active:true}];
    M.state.pending=[{id:'q-ath',table:'athletes',action:'upsert',record:{id:'ash',organisation_id:'org',full_name:'Ashley Brown'},at},
      {id:'q-att',table:'attendance',action:'upsert',record:{id:'r1',session_id:'s1',athlete_id:'ash',status:'present'},at},
      {id:'q-net',table:'captures',action:'upsert',record:{id:'c1',session_id:'s1'},at}];
    M.state.settings.cloudWritesEnabled=true;M.release.canWrite=()=>true;M.release.ensure=()=>{};C.ready=()=>true;
    let net=true;const calls=[];C.fetch=async(path)=>{calls.push(path.split('?')[0].replace('/rest/v1/',''));
      if(/athletes/.test(path)){const e=new Error('new row violates row-level security policy for table "athletes"');e.status=403;throw e;}
      if(/captures/.test(path)&&net){const e=new TypeError('Failed to fetch');throw e;}return null;};
    const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
    const rounds=[];for(let i=0;i<8;i++){await C.flushOnce();rounds.push({athleteCalls:calls.filter(x=>x==='athletes').length,pending:M.state.pending.map(x=>x.id),parked:(M.state.pendingParked||[]).map(x=>x.id)});clock+=25000;}
    Date.now=realNow;
    const parked=(M.state.pendingParked||[]).find(x=>x.id==='q-ath');
    // 4. Connection screen + Try again
    M.nav.show('connection');await new Promise(r=>setTimeout(r,300));const conn=document.querySelector('#connectionView')?.textContent||'';
    const back=C.retryParked();
    // 5. assistant phone + Roll for an existing club swimmer
    M.state.pending=[{id:'q-att2',table:'attendance',action:'upsert',record:{id:'r2',session_id:'s1',athlete_id:'ash',status:'present'},at}];M.state.settings.activeRole='assistant';M.state.settings.assistantSquads=['National'];C._athletesStaged=new Set();
    C.stageMissingAthletes();const asstAth=M.state.pending.filter(x=>x.table==='athletes').length;
    M.state.settings.activeRole='owner';C._athletesStaged=new Set();C.stageMissingAthletes();const ownerAth=M.state.pending.filter(x=>x.table==='athletes').length;
    return{rounds,parked:parked&&{reason:parked.reason,record:parked.record?.id},conn,back,netParked:(M.state.pendingParked||[]).some(x=>x.id==='q-net'),asstAth,ownerAth,role:M.access?.role?.()};});
  // 1. three refusals over growing gaps, then set aside
  const ath=r.rounds.map(x=>x.athleteCalls);assert.deepEqual(ath,[1,1,2,2,2,3,3,3],`refused swimmer edit sent on flush 1, 3, 6 only: ${ath}`);
  assert.ok(r.rounds[5].parked.includes('q-ath')&&!r.rounds[4].parked.includes('q-ath'),'set aside after the third refusal');
  assert.equal(r.parked.reason,'Only the head coach can change swimmer details');assert.equal(r.parked.record,'ash','the change is kept, not thrown away');
  // 2. Roll still went up on the first flush
  assert.ok(!r.rounds[0].pending.includes('q-att'),'attendance sent despite the refused swimmer edit');
  // 3. network failure stays queued, never set aside
  assert.ok(r.rounds.every(x=>x.pending.includes('q-net')),'the capture waits for the network');assert.equal(r.netParked,false);
  // 4. Connection screen + Try again
  assert.match(r.conn,/Changes not saved to the team[\s\S]*1 · Only the head coach can change swimmer details[\s\S]*Try again/);assert.equal(r.back,1);
  // 5. assistants don't queue club swimmer edits
  assert.equal(r.asstAth,0,'assistant: no swimmer edit queued');assert.equal(r.ownerAth,1,'head coach: still queued as before');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('SYNC_REFUSED_NO_LOOP_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
