'use strict';
// Andy, Thu 19 Nov 2026, 5:19am: Roll taken on this morning's AM · National (starts 5:30). The app reopened at 5:21 on
// last night's PM · National (Jordan's, written up at 8pm) -- the startup chooser picked the latest session that had
// already STARTED, and this morning's hadn't yet -- and his phone sent last night's session to the pool TV.
// Proves, through the startup chooser the app runs when it reopens (engines/startup-gate.js), at 5:21am in Auckland: the AM session he had open stays open (and is what
// the TV is sent); a session from a previous day is still not carried into a new day.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland'});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.startupGate,{timeout:30000});await p.waitForTimeout(600);
  const setup=async(selected)=>p.evaluate((selected)=>{const M=window.MSOS4;
    const mk=(src,id,date,dp,start)=>{const s=M.parser.parse(src,{date,dayPart:dp,squads:['National'],course:'LCM'});s.id=id;s.identity={...s.identity,date,dayPart:dp,start,squads:['National'],title:`${dp} · National`};M.store.putSession(M.state,s);};
    mk('WARM-UP\n800 as 200 fr - 200 IM - 200 Rev IM - 200 Choice\nMAIN SET\n4 x 100 Dev 10 SR\nWARM-DOWN\n200 Easy','session-amvz80','2026-11-18','PM','17:30');
    mk('WARM-UP\n400 Choice\nMAIN SET\n3 Rounds:\n  200 OL 15sR\n  2 x 100 AT 10sR\nWARM-DOWN\n200 Easy','session-bvvsia','2026-11-19','AM','05:30');
    mk('WARM-UP\n400 Free\nMAIN SET\n8 x 100 Free 10sR','session-tue','2026-11-17','PM','17:30');
    M.state.settings.selectedSessionId=selected;M.store.save(M.state);M.storageEngine.saveUi?.(M.state);},selected);
  const reopen=async(t)=>p.evaluate((t)=>{const M=window.MSOS4;M.startupGate.selectLatestStarted(t);return{sel:M.state.settings.selectedSessionId,cur:M.currentSession()?.id};},t);
  await setup('session-bvvsia');
  let r=await reopen('2026-11-19T05:21');
  assert.equal(r.sel,'session-bvvsia','this morning\'s session he had open stays open at 5:21: '+JSON.stringify(r));assert.equal(r.cur,'session-bvvsia');
  // a previous day's pin still gives way in a new day: Tuesday PM open, Thursday 5:21 -> the latest started (Wed PM)
  await setup('session-tue');
  r=await reopen('2026-11-19T05:21');
  assert.equal(r.sel,'session-amvz80','an older day\'s session is not carried into today: '+JSON.stringify(r));
  assert.deepEqual(errors,[],errors.join('\n'));console.log('REOPEN_KEEPS_TODAYS_SESSION_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
