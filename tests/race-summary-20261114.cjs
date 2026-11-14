'use strict';
// Andy, Sat 14 Nov 2026 (on Matthew Robertson's event cards): "This is good information but what do we want to do with it,
// we need a brief summary tied to training and each event, we need to show what is lacking and what is being done etc.
// We need info that anyone swimmer coach parent can see straight up what's happening and what needs to be worked on".
// Also: "12 x 50 Scull / Drill / Swim Perfect Technique" had been counted as race pace + back-end (a library set's
// session focus leaking onto a technique line), and "6 x Turn" under a 400 scull/swim was credited to the 400.
// Proves, with his real 13 Oct / 24 Sep / 6-7 Nov session wording:
//  1. Labels: technique stays technique; "6 x Turn" is turns; "4 x 50 @200 Pace" x2 rounds is race pace + back-end.
//  2. Each event card opens with a plain summary -- being done / light / missing / races / work on next (with a set from
//     his reference library to try) -- and the detail sits behind "Show the detail".
//  3. The Race links tab opens with "What's happening": strong, needs work (and for which events), races, priorities.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
const iso=d=>d.toISOString().slice(0,10);const daysAgo=n=>iso(new Date(Date.now()-n*864e5));
const SESSIONS=[
`WARM-UP\n500 (300 Free / 200 Reverse IM)\n12 x 50 Scull / Drill / Swim Perfect Technique\n\nPRE-SET\n3 x 200 Pull Desc Stroke Count 1-3\n5 x 50 Kick Build @1:00\n\nMAIN SET\n12 x 100 10sR\n#1-3 Dev\n#4-6 OL\n#7-9 AT\n#10-12 CL\n\nPOST-SET\n8 x 75 Pull @1:30 Desc 1-4\n8 x 25 UW Fins @0:45\n\nWARM-DOWN\n200 Easy`,
`WARM-UP\n4 x 300 (200 Free / 100 Reverse IM)\n\nPRE-SET\n3 x 200 Pull Desc Stroke Count 1-3\n5 x 50 Kick Build @1:00\n\nMAIN SET\n2 Rounds:\n  4 x 50 @200 Pace\n  200 Easy @4:00\n  100 Scull\n  1 x 100 MAX\n\nPOST-SET\n8 x 75 Pull @1:30 Desc 1-4\n8 x 25 UW Fins @0:45`,
`WARM-UP\n4 x 200 (100 Free / 100 Reverse IM) 15sR\n\nMAIN SET\n16x100 @dev\n3 fr 1 choice perfect tech\n\nPOST-SET\n8 x 75 Pull @1:30 Desc 1-4`,
`WARM-UP\n800\nRepeat\n200 Freestyle\n200 Choice\n\nMAIN SET\n6 x Dive Start\n15—20m @ Race Pace\n400 Scull / Swim\n6 x Turn\n20—25m @ Race Intensity\n400 Drill / Swim\n6 x 15m Finish\nMAX\n400 Choice`];
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland',viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.route(/\/(rest|auth|storage)\/v1\//,route=>{const u=route.request().url();if(/\/race_results\?/.test(u))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
    {id:'f',result_date:daysAgo(77),distance:400,stroke:'IM',course:'SCM',round:'Final',result_time_seconds:314.03,splits:[{metres:200,cumulative:153.09},{metres:300,cumulative:242.51},{metres:400,cumulative:314.03}]},
    {id:'h',result_date:daysAgo(77),distance:400,stroke:'IM',course:'SCM',round:'Heat',result_time_seconds:316.83,splits:[{metres:200,cumulative:155.18},{metres:300,cumulative:246.2},{metres:400,cumulative:316.83}]}])});return route.fulfill({status:200,contentType:'application/json',body:'[]'});});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.raceElementsUI?.summaryHtml&&window.MSOS4?.sessionMethodology?.REFLIB,{timeout:30000});await p.waitForTimeout(500);
  const r=await p.evaluate(({S,ORG,dates,races})=>{const M=window.MSOS4,RE=M.raceElements;M.store.saveAuth({access_token:'t',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-andy'}});M.state.settings.organisationId=ORG;
    const mr={id:'mr',full_name:'Matthew Robertson',squad:'National',active:true,sex:'M',date_of_birth:'2010-01-01'};M.state.athletes=[mr];const att=[];
    dates.forEach((d,i)=>{const s=M.parser.parse(S[i%S.length],{date:d,dayPart:i%2?'AM':'PM',squads:['National']});s.id='s'+i;M.store.putSession(M.state,s);att.push({session_id:s.id,athlete_id:'mr',status:'present'});});
    M.state.attendance=att;M.state.resultsEventHistory=races.map((x,i)=>({result_id:'r'+i,athlete_id:'mr',meet_name:x[4],result_date:x[3],course:'SCM',distance:x[0],stroke:x[1],result_time_seconds:x[2]}));
    const lab=Object.fromEntries(S.flatMap((t,i)=>{const s=M.parser.parse(t,{date:'2026-10-13',dayPart:'AM',squads:['National']});s.id='lab'+i;return RE.sessionSets(s).map(x=>[x.label,x.tags]);}));
    M.state.settings.selectedAthleteId='mr';M.state.settings.loopAthleteTab='performance';M.state.settings.pathwayCourse='SCM';M.store.save(M.state);
    return{lab,sum:RE.summary(mr,{distance:400,stroke:'IM',course:'SCM'})};},{S:SESSIONS,ORG,dates:[52,48,45,41,38,34,31,27,24,20,17,13,10,6,3].map(daysAgo),races:[[400,'Freestyle',275.99,daysAgo(150),'Vikings'],[400,'IM',313.58,daysAgo(150),'Vikings'],[400,'IM',314.03,daysAgo(77),'Div II'],[200,'IM',147.73,daysAgo(77),'Div II'],[200,'Breaststroke',165.56,daysAgo(77),'Div II'],[400,'Freestyle',278.2,daysAgo(77),'Div II']]});
  const j=JSON.stringify(r.lab);
  assert.deepEqual(r.lab['12 x 50 Scull / Drill / Swim Perfect Technique'],['technique'],j);assert.deepEqual(r.lab['500 (300 Free / 200 Reverse IM)'],[],j);
  assert.deepEqual(r.lab['6 x Turn'],['turns'],j);assert.ok(!r.lab['400 Scull / Swim'].includes('turns'),j);assert.ok(r.lab['4 x 50 @200 Pace'].includes('backEnd'),j);assert.ok(!r.lab['8 x 25 UW Fins @0:45'].includes('backEnd'),j);
  assert.equal(r.sum.sessions,15);assert.ok(r.sum.done.some(x=>x.id==='aerobicPower'),JSON.stringify(r.sum));assert.ok(r.sum.light.some(x=>x.id==='turns'),JSON.stringify(r.sum));
  await p.evaluate(()=>window.MSOS4.nav.show('athletes'));await p.waitForSelector('[data-cn-event^="400|IM"]',{timeout:10000});
  await p.evaluate(()=>{const d=document.querySelector('[data-cn-event^="400|IM"]');d.open=true;d.dispatchEvent(new Event('toggle'));});
  await p.waitForFunction(()=>/Races:/.test(document.querySelector('[data-re-summary]')?.innerText||''),{timeout:10000});
  const card=await p.evaluate(()=>document.querySelector('[data-re-summary]').innerText);
  assert.match(card,/400 IM · summary · last 8 weeks \(15 sessions\)/,card);assert.match(card,/Being done:/);assert.match(card,/Races: back half \+7\.85s/,card);assert.match(card,/fading more than before/);
  assert.match(card,/Work on next:\s*\n?1?\.?\s*Back-end speed/,card);assert.match(card,/try /,card);
  assert.equal(await p.evaluate(()=>document.querySelector('[data-re-behind] details.re-more').open),false,'detail closed by default');
  await p.evaluate(()=>document.querySelector('[data-re-summary]').scrollIntoView());await p.screenshot({path:process.env.SHOT||'/dev/null'}).catch(()=>{});
  await p.click('[data-cn-tab="races"]');await p.waitForFunction(()=>/Priorities/.test(document.querySelector('[data-re-overview]')?.innerText||''),{timeout:10000});
  const ov=await p.evaluate(()=>document.querySelector('[data-re-overview]').innerText);
  assert.match(ov,/What's happening · Matthew Robertson/);assert.match(ov,/Strong:/);assert.match(ov,/Needs work:/);assert.match(ov,/back half fading in 400 IM/);assert.match(ov,/Priorities:/);
  if(process.env.SHOT2)await p.screenshot({path:process.env.SHOT2});
  assert.deepEqual(errors,[],errors.join('\n'));console.log('RACE_SUMMARY_PASS');console.log(card);console.log('----');console.log(ov);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
