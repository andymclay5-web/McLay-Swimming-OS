'use strict';
// Andy at a meet, Fri 30 Oct 2026: "meet scrolling is too big ... other clubs swimmers more compact, info pops up and
// can be seen with multiple swimmers open ... Timing and typing times aren't options, we're running off a scoreboard.
// Input for feedback data and option to add SR, split etc ... the earbud idea to just speak and have it all transcribed
// is still winner".
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const RAW=`Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 1
2026 Canterbury Long Course Champs - 30/10/2026 to 01/11/2026
Meet Program - Session 1
Event 1 Boys 13 & Over 100 LC Meter Backstroke
Heat 6 of 8 Finals Starts at 05:40 PM
1 Rival, One M15 North Canterbury 1:03.20
5 Callow, Matthew M14 Aquagym 1:14.22
6 Cave, Thomas M15 Aquagym 1:01.50
7 Rival, Two M16 Jasi 1:02.88`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:15000});await p.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:15000});
  await p.evaluate(()=>{const M=MSOS4;if(M.awayInbox)M.awayInbox.maybePop=()=>{};M.state.athletes=[{id:'tc',full_name:'Thomas Cave',squad:'National',active:true},{id:'mc',full_name:'Matthew Callow',squad:'National',active:true}];
    M.state.meetImports=[];M.state.meetFieldDeck=null;M.state.meetProgramBA={sources:[],commentaries:[],nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'',selectedEventNumber:0};M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};M.store.save(M.state);
    if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent()}});
  await p.waitForSelector('[data-meet-intake-au]',{timeout:5000});await p.click('[data-mfa-paste-btn]');await p.fill('[data-mfa-paste]',RAW);await p.click('[data-mfa-process]');await p.waitForSelector('[data-mfa-use]',{timeout:3000});await p.click('[data-mfa-use]');
  await p.waitForSelector('[data-meet-program-ba] .ba-row.aqua',{timeout:5000});
  assert.equal(await p.locator('.ba-row.aqua').count(),2,'both of ours are in the heat');
  // other clubs: one thin line each
  const h=await p.evaluate(()=>[...document.querySelectorAll('.ba-row:not(.aqua) .ba-row-main')].map(n=>Math.round(n.getBoundingClientRect().height)));
  assert.ok(h.length===2&&h.every(x=>x<=30),`other clubs on one thin line: ${h}`);
  // 31 Oct 2026: one box for the heat with every one of ours in it (was one card per swimmer)
  await p.locator('.ba-row.aqua').nth(0).click();await p.waitForSelector('.ba-heatbox');await p.waitForTimeout(200);
  assert.equal(await p.locator('.ba-heatbox').count(),1,'one box for the heat');assert.equal(await p.locator('.ba-heatbox .ba-sw').count(),2,'both swimmers in it');
  const box=await p.locator('.ba-heatbox').boundingBox();assert.ok(box.height<=560,`the heat fits on a phone screen: ${box.height}px`);
  const txt=(await p.locator('.ba-heatbox').innerText()).replace(/\s+/g,' ');
  assert.doesNotMatch(txt,/stopwatch|Backup timer/i,'no timing');assert.match(txt,/Seed 1:01\.50/);assert.match(txt,/seed time is the guide/,'the entry (seed) time stands in when MSOS has no race history');
  // what he saw is saved to that race and goes to the team as a capture
  const first=p.locator('.ba-sw').filter({hasText:'Thomas Cave'});
  await first.locator('[data-ba-eye="notes"]').fill('Great start, late breath');await first.locator('[data-ba-eye="stroke_rate_notes"]').fill('44');await first.locator('[data-ba-eye="coach_splits_text"]').fill('31.2');await p.waitForTimeout(2000);
  const saved=await p.evaluate(()=>{const x=Object.values(MSOS4.state.meetOps.races).find(x=>x.notes),cap=(MSOS4.state.captures||[]).find(c=>String(c.id).startsWith('meetobs-'));return{x,cap:cap&&{athlete:cap.athlete_id,text:cap.text_content,meta:JSON.parse(cap.capture_note)},queued:(MSOS4.state.pending||[]).some(q=>q.table==='captures'&&q.record?.id===cap?.id&&q.record?.session_id===null)};});
  assert.equal(saved.x.notes,'Great start, late breath');assert.equal(saved.x.stroke_rate_notes,'44');assert.equal(saved.x.coach_splits_text,'31.2');
  assert.equal(saved.cap.athlete,'tc');assert.match(saved.cap.text,/E1 · 100 Backstroke · H6 L6 — Great start, late breath · SR 44 · Splits 31\.2/);assert.equal(saved.cap.meta.kind,'meet_race');assert.equal(saved.queued,true,'queued for the cloud');
  // another coach's notes for the same race show in the box
  await p.evaluate(()=>{const M=MSOS4,cap=M.state.captures.find(c=>String(c.id).startsWith('meetobs-'));M.state.captures.push({...cap,id:'meetobs-jordan',meet_race:{...cap.meet_race,coach:'Jordan',notes:'Breathing every 2 off the wall'},capture_note:JSON.stringify({...JSON.parse(cap.capture_note),coach:'Jordan',notes:'Breathing every 2 off the wall'})});M.meetProgramBA.render();});
  await p.waitForSelector('.ba-sw-others');assert.match(await p.locator('.ba-sw-others').innerText(),/Jordan: Breathing every 2 off the wall/);
  // spoken heat commentary goes to the swimmer named
  const split=await p.evaluate(()=>{const P=MSOS4.meetProgramBA,h=P.allHeats()[0],races=h.rows.filter(r=>r.is_aquagym).map(row=>MSOS4.state.meetFieldDeck.races.find(r=>r.lane===row.lane));
    const m=P.splitBySwimmer(races,"Thomas got out well. Breathing too early into the wall. Matthew lost his legs at 75. Good finish though.");return races.map(r=>[r.athlete_name,(m.get(MSOS4.meetOpsEngine.keyFor(r))||[]).join(' ')]);});
  const byName=Object.fromEntries(split.map(([n,t])=>[n.includes('Cave')?'tc':'mc',t]));
  assert.equal(byName.tc,'Thomas got out well. Breathing too early into the wall.');assert.equal(byName.mc,'Matthew lost his legs at 75. Good finish though.');
  // training that feeds the event: Back work plus a quarter of IM work, from sessions she was on the Roll for
  const load=await p.evaluate(()=>{const M=MSOS4,d=new Date(Date.now()-3*864e5).toISOString().slice(0,10);const s=M.parser.parse('MAIN SET\n4 x 100 IM 10sR\n8 x 50 Backstroke @100 Pace @1:30',{id:'ld'});s.id='ld';s.identity={date:d,dayPart:'PM',squads:['National']};M.state.canonicalSessions.ld=s;M.state.attendance=(M.state.attendance||[]).concat([{id:'a-ld',session_id:'ld',athlete_id:'tc',status:'present'}]);
    const a=M.state.athletes.find(x=>x.id==='tc');return M.meetProgramBA.trainingLoad(a,{stroke:'Backstroke',distance:100,athlete_id:'tc'});});
  assert.equal(load.n,1);assert.equal(load.total,800);assert.equal(load.stroke,400+100,'400m Back + a quarter of the 400m IM');assert.ok(load.rp>=400,`race pace counted: ${load.rp}`);
  // the head coach's meet goes to the team; a coach phone without it takes it
  const shared=await p.evaluate(async()=>{const M=MSOS4,P=M.meetProgramBA;let sent=null;M.cloud.ready=()=>true;M.cloud.org=()=>'org-1';M.cloud.fetch=async(path,o)=>{if(o?.method==='POST'){sent={path,body:JSON.parse(o.body)};return null}return[{imported_at:sent?.body?.imported_at,dataset:sent?.body?.dataset}]};
    const ok=await P.shareMeet();const again=await P.shareMeet();const deck=JSON.parse(JSON.stringify(M.state.meetFieldDeck));
    // now be Jordan's phone: no meet loaded
    M.access.role=()=>'assistant';M.state.meetFieldDeck=null;M.state.meetProgramBA.sources=[];M.state.meetProgramBA.sharedAt='';const pulled=await P.pullMeet({force:true});
    return{ok,again,type:sent.body.dataset_type,races:sent.body.dataset.deck.races.length,pulled,after:M.state.meetFieldDeck?.races?.length,sources:M.state.meetProgramBA.sources.length,orig:deck.races.length};});
  assert.equal(shared.ok,true);assert.equal(shared.again,false,'unchanged meet is not sent twice');assert.equal(shared.type,'meet_programme');
  assert.equal(shared.pulled,true,'a coach phone with no meet takes the head coach\'s');assert.equal(shared.after,shared.orig);assert.ok(shared.sources>=1);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('MEET_HEAT_CARDS_COMMENTARY_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
