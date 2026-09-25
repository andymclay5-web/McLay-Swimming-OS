'use strict';
// Real coaching failure this fixes (Andy, live, 21 Sept 2026): "Add squad on roll also freezes" -- reported
// on a completely different screen than the earlier (separately investigated and cleared) Coach Hub freeze
// report, right after profiling had already shown Coach Hub's own render was sub-2ms even at real data
// scale. engines/attendance-roster.js's addSquad() (wired to the Roll tab's "Add squad" button) calls
// M.store.putSession() directly -- the same call app.js makes on every new session, session edit, and
// intake apply -- which engines/swimmer-invite-bn.js's installSessionAutoPublishHook wraps to silently
// republish every currently-active athlete in the (now-larger) squad set to the swimmer portal.
//
// Before this fix, autoPublishSessionToSwimmers() queued EVERY matching athlete as its own
// Promise.resolve().then() microtask in the SAME synchronous turn. Microtasks all run back-to-back before
// the browser gets a chance to paint or handle the next tap -- profiled against real Supabase-sourced scale
// (see /tmp/msos-profile2/profile-autopublish.cjs: a real 2-squad session pulling in 30 athletes cost
// ~167ms of synchronous work on server-grade hardware alone, with real per-athlete variance up to 52ms; a
// phone's slower JS engine plus 30 concurrent network RPCs compounds well into freeze territory) -- the
// exact same "unbounded synchronous burst, no yield to the browser" shape this project already fixed once
// for Coach Hub's own double-tap freeze (engines/coach-loop-ui.js, 16 Sept 2026).
//
// This test proves: (a) the FIXED source yields to the browser (a real macrotask boundary via setTimeout,
// not just a microtask) before EVERY athlete's synchronous work runs, so draining only microtasks after a
// squad-triggered putSession() call processes ZERO athletes, and each subsequent real timer tick processes
// exactly one more; (b) every athlete is still eventually published, so the fix never silently drops anyone;
// (c) fail-before/pass-after on the exact source change -- the pre-fix source processes ALL athletes' work
// within microtask draining alone (the real freeze shape Andy hit), proving this test would have caught it.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const filePath=path.join(__dirname,'..','engines','swimmer-invite-bn.js');
const realSrc=fs.readFileSync(filePath,'utf8');

const fixedFn=`  async function autoPublishSessionToSwimmers(session){
    try{
      const athletes=athletesForSquads(session?.identity?.squads);
      for(const a of athletes){
        await new Promise(resolve=>setTimeout(resolve,0));
        try{
          const payload=corePayloadFor(a,()=>{});
          await rpc('msos_publish_swimmer_payload',{p_athlete_id:String(a.id),p_payload:payload});
        }catch{}
      }
    }catch{}
  }`;
const buggyFn=`  function autoPublishSessionToSwimmers(session){
    try{
      const athletes=athletesForSquads(session?.identity?.squads);
      for(const a of athletes){
        Promise.resolve().then(async()=>{
          try{
            const payload=corePayloadFor(a,()=>{});
            await rpc('msos_publish_swimmer_payload',{p_athlete_id:String(a.id),p_payload:payload});
          }catch{}
        });
      }
    }catch{}
  }`;
assert.ok(realSrc.includes(fixedFn),'test setup error: could not locate the fixed autoPublishSessionToSwimmers in the real file -- its wording changed in a way this test does not expect');
const buggySrc=realSrc.replace(fixedFn,buggyFn);
assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

function makeNode(){
  return{dataset:{},style:{},addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},closest:()=>null,classList:{toggle(){},add(){},remove(){}},set innerHTML(v){},get innerHTML(){return''}};
}

// A controllable "browser tick" queue: setTimeout captures callbacks instead of running them, so the test
// can precisely distinguish "only microtasks have drained" from "N real macrotask boundaries have passed" --
// exactly the distinction this bug turns on (microtask burst vs one athlete per real tick).
function makeTickQueue(){
  const pending=[];
  const fakeSetTimeout=(fn)=>{pending.push(fn);return pending.length;};
  const runOneTick=()=>{const fn=pending.shift();if(fn)fn();};
  return{fakeSetTimeout,runOneTick,pendingCount:()=>pending.length};
}
async function drainMicrotasksOnly(){for(let i=0;i<10;i++)await Promise.resolve();}

function bootHarness(srcToLoad,{athleteCount=5}={}){
  const{fakeSetTimeout,runOneTick,pendingCount}=makeTickQueue();
  global.window=global;
  global.document={readyState:'complete',addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},createElement:()=>makeNode()};
  global.location={href:'https://autopublish-freeze.test/'};
  global.requestAnimationFrame=fn=>fn();
  if(!global.navigator)Object.defineProperty(global,'navigator',{value:{},configurable:true});
  global.setTimeout=fakeSetTimeout;
  global.fetch=async()=>({ok:true,text:async()=>'null'}); // rpc() resolves fast; not the thing under test
  let projectionCalls=0;
  const athletes=Array.from({length:athleteCount},(_,i)=>({id:`ath-${i}`,full_name:`Swimmer ${i}`,squad:'National',active:true}));
  const state={settings:{selectedAthleteId:''},athletes,captures:[],meetEntries:[],trainingTestResults:[]};
  const session={id:'sess-squad-add',identity:{date:'2026-09-21',squads:['National']},title:'AM',finish:false};
  global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
  global.MSOS4={
    ui:{},
    state,
    access:{role:()=>'owner'},
    store:{
      config:()=>({supabaseUrl:'https://autopublish-freeze.test',supabaseAnonKey:'anon-key'}),
      auth:()=>({access_token:'tok'}),
      // The real app.js shape: state.canonicalSessions[session.id]=...; Store.save(state); return it.
      putSession:(st,sess)=>{st.canonicalSessions=st.canonicalSessions||{};st.canonicalSessions[sess.id]=sess;return sess;},
    },
    currentSession:()=>session,
    swimmerTrainingBG:{
      // id matches session.id (the real M.currentSession()) so sessionsPartFor's `sessions.find(currentId)`
      // hits this one candidate directly and does not ALSO fall through to its own separate safeSession(a)
      // call for "current session not among the candidates" -- keeping this test's call-count to exactly
      // one projectionFor() per athlete, cleanly isolating the one thing under test (the per-athlete yield).
      candidateSessionsFor:()=>[{id:session.id,identity:{date:'2026-09-21',course:'SCM'}}],
      projectionFor:()=>{projectionCalls++;return{date:'2026-09-21',squad:'National',course:'SCM',title:'AM',metres:{recorded:1000},delivery:'',zones:{},strokes:{},tags:{},blocks:[]};},
      viewFor:()=>null,
    },
    performanceEngine:{pathwaysForAthlete:()=>({events:[]})},
    swimmerPerformanceBM:{prepareAthlete:async()=>({completion:{ok:true,rows:0,errors:[]},model:{events:[]}}),readinessFor:()=>({ok:true,issues:[]})},
  };
  const tmpPath=filePath.replace(/\.js$/,`.autopublishtest.${process.hrtime.bigint()}.tmp.js`);
  fs.writeFileSync(tmpPath,srcToLoad);
  try{
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
  }finally{
    fs.unlinkSync(tmpPath);
  }
  return{M:global.MSOS4,session,state,runOneTick,pendingCount,callCount:()=>projectionCalls};
}

async function runFixed(){
  const athleteCount=5;
  const{M,session,state,runOneTick,pendingCount,callCount}=bootHarness(realSrc,{athleteCount});
  M.store.putSession(state,session); // fires the auto-publish hook, fire-and-forget, exactly like addSquad() does
  await drainMicrotasksOnly();
  assert.equal(callCount(),0,`the fixed source must not do ANY athlete's synchronous work until a real browser tick passes -- got ${callCount()} of ${athleteCount} already done after only microtasks drained (the exact burst shape that froze Roll on squad add)`);
  for(let i=1;i<=athleteCount;i++){
    runOneTick();
    await drainMicrotasksOnly();
    assert.equal(callCount(),i,`after ${i} real browser tick(s), exactly ${i} athlete(s) should have been processed -- got ${callCount()} (must be exactly one athlete's worth of work per tick, never a burst)`);
  }
  assert.equal(pendingCount(),0,'no leftover pending ticks -- confirms every athlete was still eventually published, the fix never silently drops one');
  console.log('SWIMMER_AUTOPUBLISH_SQUAD_ADD_FIX_PASS');
}

async function runFailBefore(){
  const athleteCount=5;
  const{M,session,state,callCount}=bootHarness(buggySrc,{athleteCount});
  M.store.putSession(state,session);
  await drainMicrotasksOnly();
  assert.equal(callCount(),athleteCount,`the reverted pre-fix source must process ALL ${athleteCount} athletes' synchronous work within microtask draining alone (no real browser tick needed) -- got ${callCount()}, confirming this test would have caught the real burst-freeze bug Andy hit on "add squad"`);
  console.log('SWIMMER_AUTOPUBLISH_SQUAD_ADD_FAILBEFORE_PASS');
}

(async()=>{
  try{
    await runFixed();
    await runFailBefore();
    require('node:child_process').execFileSync(process.execPath,['--check',filePath],{stdio:'pipe'});
    console.log('SWIMMER_AUTOPUBLISH_SQUAD_ADD_FREEZE_ALL_PASS');
  }catch(err){
    console.error(err);
    process.exit(1);
  }
})();
