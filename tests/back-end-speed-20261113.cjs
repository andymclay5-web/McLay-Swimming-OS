'use strict';
// Andy, Fri 13 Nov 2026 23:47: "we need to show work on back end speed, most repeated race pace effort sets are working back
// end speed in some way". Proves:
//  1. A race-pace set repeated 3+ times counts as back-end work (one race-pace 50 doesn't).
//  2. Race splits load per swimmer from race_results; short-course markers that label each 25 as 50 (a 100 Fly with
//     markers to 200 -- real NZ SC Champs rows) are rescaled, so the halves are right.
//  3. The event card shows front half / back half per swim and whether the latest closes better than before; the
//     Race links tab shows back-end speed by event with the back-end work in the 6 weeks before.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
const iso=d=>d.toISOString().slice(0,10);const daysAgo=n=>iso(new Date(Date.now()-n*864e5));
const SPLITS=[ // Charlotte Murphy 100 Fly, NZ SC Champs (cloud rows, 13 Nov), plus an earlier swim
  {id:'f',result_date:daysAgo(45),distance:100,stroke:'Butterfly',course:'SCM',round:'Final',result_time_seconds:124.36,splits:[{metres:50,cumulative:27.3},{metres:100,cumulative:58.51},{metres:150,cumulative:91.6},{metres:200,cumulative:124.36}]},
  {id:'h',result_date:daysAgo(45),distance:100,stroke:'Butterfly',course:'SCM',round:'Heat',result_time_seconds:125.76,splits:[{metres:50,cumulative:27.55},{metres:100,cumulative:58.58},{metres:150,cumulative:91.97},{metres:200,cumulative:125.76}]},
  {id:'o',result_date:daysAgo(120),distance:100,stroke:'Butterfly',course:'SCM',round:'Final',result_time_seconds:127.0,splits:[{metres:50,cumulative:27.0},{metres:100,cumulative:58.0},{metres:150,cumulative:92.5},{metres:200,cumulative:127.0}]}];
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland',viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));const asked=[];
  await p.route(/\/(rest|auth|storage)\/v1\//,route=>{const u=route.request().url();if(/\/race_results\?/.test(u)){asked.push(u);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(/athlete_id=eq\.ch/.test(u)?SPLITS:[])});}return route.fulfill({status:200,contentType:'application/json',body:'[]'});});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.raceElementsUI?.backEndHtml,{timeout:30000});await p.waitForTimeout(500);
  const r=await p.evaluate(({ORG,d1,race})=>{const M=window.MSOS4,RE=M.raceElements;
    M.store.saveAuth({access_token:'t',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-andy'}});M.state.settings.organisationId=ORG;
    const ch={id:'ch',full_name:'Charlotte Murphy',squad:'National',active:true,sex:'F',date_of_birth:'2008-01-01'};M.state.athletes=[ch];
    const s=M.parser.parse(`PRE-SET\n1 x 50 #1 @ 100 race pace @ 1:00\n\nMAIN SET\n3 Rounds:\n  3 x 100 #1 @ 200 Pace @ 3:00\n  300 Easy`,{id:'sA',date:d1,dayPart:'PM',squads:['National'],course:'SCM'});s.id='sA';M.store.putSession(M.state,s);
    M.state.attendance=[{session_id:'sA',athlete_id:'ch',status:'present'}];
    M.state.resultsEventHistory=[{result_id:'x',athlete_id:'ch',meet_name:'2026 New Zealand Short Course Championships',result_date:race,course:'SCM',distance:100,stroke:'Butterfly',result_time_seconds:124.36}];
    const sets=RE.sessionSets(s).map(x=>[x.label,x.tags,x.reps]);M.state.settings.selectedAthleteId='ch';M.state.settings.loopAthleteTab='performance';M.store.save(M.state);
    const be=RE.backEndOf({...{distance:100,result_time_seconds:124.36},splits:[{metres:50,cumulative:27.3},{metres:100,cumulative:58.51},{metres:150,cumulative:91.6},{metres:200,cumulative:124.36}]});
    return{sets,be};},{ORG,d1:daysAgo(50),race:daysAgo(45)});
  const rp=r.sets.find(x=>/200 Pace/.test(x[0])),one=r.sets.find(x=>/100 race pace/.test(x[0]));
  assert.ok(rp[1].includes('backEnd')&&rp[2]===9,`3 rounds of 3 x 100 @ 200 pace = 9 race-pace efforts, back-end work: ${JSON.stringify(r.sets)}`);assert.ok(!one[1].includes('backEnd'),'a single race-pace 50 is not');
  assert.equal(r.be.front,58.51);assert.equal(Number(r.be.back.toFixed(2)),65.85);assert.equal(Number(r.be.close.toFixed(2)),32.76,'last 25 m');assert.equal(r.be.closeOf,25);
  await p.evaluate(()=>window.MSOS4.nav.show('athletes'));await p.waitForSelector('[data-cn-event^="100|"]',{timeout:10000});
  await p.evaluate(()=>{const d=document.querySelector('[data-cn-event^="100|"]');d.open=true;d.dispatchEvent(new Event('toggle'));});
  await p.waitForFunction(()=>/closing better|fading more/.test(document.querySelector('[data-re-backend]')?.innerText||''),{timeout:10000});
  const card=await p.evaluate(()=>document.querySelector('[data-re-backend]').innerText);
  assert.match(card,/58\.51 \/ 1:05\.85 · \+7\.34s/,card);assert.match(card,/Back-end work, last 8 weeks: 1 set/,card);assert.match(card,/fading more|closing better/);
  assert.ok(asked.some(u=>/athlete_id=eq\.ch/.test(u)&&/splits=not\.is\.null/.test(u)));
  await p.click('[data-cn-tab="races"]');await p.waitForSelector('[data-re-backend-all]',{timeout:10000});const tab=await p.evaluate(()=>document.querySelector('[data-re-backend-all]').innerText);
  assert.match(tab,/100 Fly · 2:04\.36/,tab);assert.match(tab,/back half \+7\.34s/,tab);assert.match(tab,/1 back-end set in the 6 weeks before/,tab);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('BACK_END_SPEED_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
