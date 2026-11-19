'use strict';
// Andy, Thu 19 Nov 2026, 5:22am on deck: his Board was on this morning's AM · National (4,800m, Roll taken) while the
// pool TV still showed last night's PM · National (4,250m). Cloud: the TV's last frame was last night's session and
// nothing more came from the phone. A TV call that never answers (pool wifi, a token refresh at 5am) held the phone's
// TV loop for good: `busy` stayed set and the loop only re-arms after a publish returns.
// Proves, with this morning's real session text: the phone drives the TV on last night's session; the next TV call
// hangs; Andy is on the AM session; within a few seconds the TV gets the AM session anyway.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const AM="WARM-UP\n400 Choice\n4 x 100 (75 Free / 25 Back) Desc 1-4 10sR — Long-course pacing; perfect line on the 25 Back\n\nPRE-SET\n6 x 50 Kick Backstroke Build @1:10 — Body line + steady build, hips up\n3 x 100 Pull Backstroke — Desc Stroke Count 1-3 15sR — Hold length, light paddles optional\n\nMAIN SET\n3 Rounds:\n  200 OL 15sR — LC pacing; posture + discipline\n  2 x 100 AT 10sR — Even split; composure under load\n1 100 CL 15sR — Clear with form; do not sprint\n1 100 Easy\n  6 x 100 IM 10sR — 2 OL / 2 AT / 2 CL — Count strokes; hold line off the wall\n\nPOST-SET\n200 Choice Scull / Drill — Perfect Technique\n\nWARM-DOWN\n200 Easy\nTOTAL 4800m";
const PM="WARM-UP\n800 as 200 fr - 200 IM - 200 Rev IM - 200 Choice\n\nMAIN SET\n400 Regen 15 SR (150 HR)\n2 x 200 Dev 10 SR (160 HR)\n2 x 25 15V MAX\n200 Easy\n\nWARM-DOWN\n200 Easy";
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{window.MSOS_TV_RPC_MS=1500;});
  const frames=[];let hang=false,hung=0;
  await p.route(/\/rest\/v1\/rpc\/msos_tv_/,async r=>{const n=r.request().url().split('/rpc/')[1].split('?')[0],body=JSON.parse(r.request().postData()||'{}');
    if(n==='msos_tv_publish'){if(hang){hang=false;hung++;return;/* never answers */}frames.push(body.p_frame);return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,rev:frames.length})});}
    if(n==='msos_tv_list')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'pool1',label:'Pool 1',controller_device:null}])});
    return r.fulfill({status:200,contentType:'application/json',body:'{}'});});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.tvLink?.takeControl&&window.MSOS4?.storageEngine?.ready&&window.MSOS4?.boardEngine,{timeout:30000});await p.waitForTimeout(800);
  await p.evaluate(({AM,PM})=>{const M=window.MSOS4;M.store.saveAuth({access_token:'coach-token',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'048dd1ac',email:'a@x'}});M.state.settings.organisationId='9d40beff-e632-414d-9daa-7ee78104ad2a';
    const mk=(src,id,date,dp,course)=>{const s=M.parser.parse(src,{date,dayPart:dp,squads:['National'],course});s.id=id;s.identity={...s.identity,date,dayPart:dp,squads:['National'],course,title:`${dp} · National`};M.store.putSession(M.state,s);return s;};
    mk(PM,'session-amvz80','2026-11-18','PM','SCM');const am=mk(AM,'session-bvvsia','2026-11-19','AM','LCM');
    M.state.settings.selectedSessionId='session-amvz80';
    M.state.athletes=[{id:'athlete-charlotte-murphy',full_name:'Charlotte Murphy',squad:'National',active:true,sex:'F',modifications:'Half volume'},{id:'athlete-matthew-robertson',full_name:'Matthew Robertson',squad:'National',active:true,sex:'M'}];
    M.state.attendance=[{id:'r1',session_id:am.id,athlete_id:'athlete-charlotte-murphy',status:'modified'},{id:'r2',session_id:am.id,athlete_id:'athlete-matthew-robertson',status:'present'}];M.store.save(M.state);},{AM,PM});
  await p.evaluate(()=>window.MSOS4.tvLink.takeControl({id:'pool1',label:'Pool 1'}));
  await p.waitForFunction(()=>true);await p.waitForTimeout(1200);
  assert.equal(frames.at(-1)?.session?.date,'2026-11-18','the TV starts on last night\'s session');
  hang=true;
  await p.evaluate(()=>{const M=window.MSOS4;M.state.settings.selectedSessionId='session-bvvsia';M.store.save(M.state);});
  const t0=Date.now();while(Date.now()-t0<12000&&frames.at(-1)?.session?.date!=='2026-11-19')await p.waitForTimeout(250);
  assert.equal(hung,1,'one TV call never answered');
  assert.equal(frames.at(-1)?.session?.date,'2026-11-19',`the TV gets this morning's session after a hung call (frames: ${frames.map(f=>f.session?.date).join(',')})`);
  assert.equal(frames.at(-1)?.session?.title,'AM · National');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('TV_FOLLOWS_BOARD_AFTER_HUNG_CALL_PASS',`${((Date.now()-t0)/1000).toFixed(1)}s`);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
