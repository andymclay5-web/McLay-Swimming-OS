'use strict';
// Andy, Fri 13 Nov 2026 ("Use the reference sets I have u from chat gpt" -- SM.REFLIB):
// Andy, Fri 13 Nov 2026: "The connection to the races and training needs to be broadened ... if we're doing underwater kick,
// that's specific to a lot of races, needs to show. If we're doing back-end speed work, it needs to show ... dive starts,
// that's helping all of these races. We're doing an endurance set, that's helping your distance races ... the notes ... and
// the captures ... we can actually pull them back to races." / "Keep it broad as a range, auto, put things that you see in
// sessions I have done ... under waters, turns, max kick etc". Proves, with his own wording:
//  1. Sets are labelled automatically (underwater, dive start, breakout, turns, max, parachute, MSC, race pace ...).
//  2. A Board set shows its labels.
//  3. An event card shows what the race needs and the training behind the last race, from sessions she was at only.
//  4. A capture note about underwaters comes back under a race where underwaters matter.
//  5. The "Race links" tab shows recent races (vs previous best), patterns, the 8-week mix.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const iso=d=>d.toISOString().slice(0,10);const daysAgo=n=>iso(new Date(Date.now()-n*864e5));
const S1=`WARM-UP
400 Choice
8 x 25 uw fins @0:45
4 x dive start — 15m max

MAIN SET
4 x 50 Bk @1:10 build — perfect breakout, hold body line
6 x 50 Bk 10sR — attack off the walls, fast into turn
16 x 12.5 bands only max @ 0:30
4 x 25 small parachute`;
const S2=`MAIN SET
5 x 400 Development 15sR
6 x 100 pull / paddles dev 10sr — min stroke count, long line through turns
4 x 50 Bk @ 100 race pace @ 1:30`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland',viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.raceElements?.behind&&window.MSOS4?.raceElementsUI?.tabHtml,{timeout:30000});await p.waitForTimeout(500);
  const r=await p.evaluate(({S1,S2,d1,d2,d3,race,prev})=>{const M=window.MSOS4,RE=M.raceElements;
    const ch={id:'ch',full_name:'Charlotte Murphy',squad:'National',active:true,sex:'F',date_of_birth:'2008-01-01'};M.state.athletes=[ch];
    const mk=(t,id,d)=>{const s=M.parser.parse(t,{id,date:d,dayPart:'AM',squads:['National'],course:'SCM'});s.id=id;M.store.putSession(M.state,s);return s;};
    const a=mk(S1,'sA',d1),bb=mk(S2,'sB',d2),c=mk(S1,'sC',d3);
    M.state.attendance=[{session_id:'sA',athlete_id:'ch',status:'present'},{session_id:'sB',athlete_id:'ch',status:'present'},{session_id:'sC',athlete_id:'ch',status:'absent'},{session_id:'sC',athlete_id:'other',status:'present'}];
    const uwSet=RE.sessionSets(a).find(x=>/uw fins/.test(x.label));
    M.state.captures=[{id:'cap1',session_id:'sA',athlete_ids:['ch'],capture_type:'video',item_id:uwSet?.id,capture_note:'Underwaters drifting wide off the back wall',created_at:d1+'T07:00:00Z'},{id:'cap2',session_id:'sC',athlete_ids:['ch'],capture_type:'text',capture_note:'breakout late',created_at:d3+'T07:00:00Z'}];
    M.state.resultsEventHistory=[{result_id:'p0',athlete_id:'ch',meet_name:'SCWC SC Champs',result_date:prev,course:'SCM',distance:100,stroke:'Backstroke',result_time_seconds:124.0},{result_id:'p1',athlete_id:'ch',meet_name:'2026 New Zealand Short Course Championships',result_date:race,course:'SCM',distance:100,stroke:'Backstroke',round:'Final',result_time_seconds:122.13}];
    const sets=RE.sessionSets(a).map(x=>[x.label,x.tags.map(t=>RE.byId[t].chip)]);
    const ev={distance:100,stroke:'Backstroke',course:'SCM'};const beh=RE.behind(ch,ev,{weeks:6,before:race});
    M.state.settings.selectedAthleteId='ch';M.state.settings.loopAthleteTab='performance';M.state.settings.selectedSessionId='sA';M.store.save(M.state);
    const lib=M.sessionMethodology.REFLIB.filter(x=>['ANC03','AP01','P03','ANP05'].includes(x.code)).map(x=>{const s=M.parser.parse(`MAIN SET\n${x.text}`,{date:'2026-11-13',dayPart:'AM',squads:['National']});s.id='lib-'+x.code;return[x.code,[...new Set(RE.sessionSets(s).flatMap(r=>r.tags))]];});
    return{lib:Object.fromEntries(lib),sets,beh:{sessions:beh.sessions,ids:beh.elements.map(e=>e.id),caps:beh.captures.map(c=>c.capture.id),uw:beh.elements.find(e=>e.id==='underwater')},needs50:RE.needs({distance:50,stroke:'Butterfly',course:'SCM'}).slice(0,4).map(n=>n.id),needs800:RE.needs({distance:800,stroke:'Freestyle',course:'LCM'}).slice(0,4).map(n=>n.id)};
  },{S1,S2,d1:daysAgo(30),d2:daysAgo(25),d3:daysAgo(20),race:daysAgo(10),prev:daysAgo(90)});
  const lab=Object.fromEntries(r.sets);const j=JSON.stringify(r);
  assert.ok(lab['8 x 25 uw fins @0:45'].includes('Underwater'),j);
  assert.deepEqual(lab['4 x dive start — 15m max'],['Start','Max'],j);
  assert.ok(lab['4 x 50 Bk @1:10 build — perfect breakout, hold body line'].includes('Breakout'));
  assert.ok(lab['6 x 50 Bk 10sR — attack off the walls, fast into turn'].includes('Turns'));
  assert.ok(lab['16 x 12.5 bands only max @ 0:30'].includes('Resisted'));
  // 1 session she was at + 1 she was at; the one she missed doesn't count
  assert.equal(r.beh.sessions,2,j);for(const id of ['underwater','starts','breakout','turns','racePace','aerobic'])assert.ok(r.beh.ids.includes(id),`${id} behind the 100 Back: ${j}`);
  assert.deepEqual(r.beh.caps,['cap1'],'her underwater note comes back under the race; the note from a session she missed does not');
  assert.equal(r.beh.uw.metres,200);
  // Andy's reference library (ChatGPT, 15 Oct): each set reads as its stated focus
  assert.ok(r.lib.ANC03.includes('maxSpeed')&&r.lib.ANC03.includes('resisted'),j);assert.ok(r.lib.AP01.includes('aerobicPower')&&!r.lib.AP01.includes('aerobic'),j);
  assert.ok(r.lib.P03.includes('underwater')&&r.lib.P03.includes('racePace'),j);assert.ok(r.lib.ANP05.includes('racePace'),j);
  assert.ok(r.needs50.includes('starts')&&r.needs50.includes('underwater'),j);assert.ok(r.needs800.includes('aerobic')&&!r.needs800.includes('starts'),j);
  // Board labels
  await p.evaluate(()=>{const M=window.MSOS4;M.state.settings.view='board';M.store.save(M.state);M.nav?.show?.('board');M.ui.renderCurrent?.();});await p.waitForTimeout(800);
  const board=await p.evaluate(()=>[...document.querySelectorAll('#boardView .msos-work-row')].map(r=>[r.querySelector('b')?.textContent,[...r.querySelectorAll('.re-chips i')].map(i=>i.textContent)]));
  assert.ok(board.some(([l,c])=>/4×50/.test(l||'')&&c.includes('Breakout')),JSON.stringify(board));assert.ok(board.some(([,c])=>c.includes('Resisted')),JSON.stringify(board));
  // swimmer page: event card + Race links tab
  await p.evaluate(()=>{const M=window.MSOS4;M.nav.show('athletes');});await p.waitForSelector('[data-cn-event]',{timeout:10000});
  await p.evaluate(()=>{const d=document.querySelector('[data-cn-event^="100|"]');d.open=true;d.dispatchEvent(new Event('toggle'));});
  await p.waitForSelector('[data-re-behind]',{timeout:10000});const card=await p.evaluate(()=>document.querySelector('[data-re-behind]').textContent.replace(/\s+/g,' '));
  assert.match(card,/What a 100 Back needs/);assert.match(card,/Training behind 2026 New Zealand Short Course Championships/);assert.match(card,/Underwater kick/);assert.match(card,/Underwaters drifting wide/);assert.match(card,/Patterns, not proof/);
  await p.click('[data-cn-tab="races"]');await p.waitForSelector('[data-re-tab]',{timeout:10000});const tab=await p.evaluate(()=>document.querySelector('[data-re-tab]').innerText);
  assert.match(tab,/100 Back SCM · 2:02\.13/);assert.match(tab,/-1\.87s on best/);assert.match(tab,/Patterns/);assert.match(tab,/Training mix · last 8 weeks · 2 sessions/);assert.match(tab,/Underwater kick/);assert.match(tab,/Feeds 100 Back/);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('RACE_TRAINING_LINKS_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
