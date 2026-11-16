'use strict';
// Andy, Mon 16 Nov 2026, on Matthew Callow (just turned 14): "he's not interested in opens yet he wants to know the 14
// and 15 age group medals and winner etc, it should all be on a big table linked to fina points with age specific and
// age up specific data. Meet results also need to show where and when it was done with splits showing where possible.
// We want to see his last 4 or 5 swims of that event and potentially sc swims, converted info etc."
// Real data: his 400 Free race results (meets, rounds, splits) and the real 2026 standards for 14 / 15 year old boys.
// Proves, on the LCM 400 Free card:
//  - the age table: NAGS, national age finalist / medal / winner, NZ and Canterbury age records, for 14 (now) and 15
//    (next), each with its time, WA points and his gap; no open benchmark and no "16 & under" band in it;
//  - the event's next-step line is an age step (14s finalist), not "NZ Championships";
//  - his last five LCM swims, newest first, with meet, round, venue, points and his PB marked;
//  - the SCM swims folded underneath with the best converted to LCM, and their 50 splits + halves read correctly
//    (the NZ SC Champs file marks 25m splits as 50-800m; Secondary Schools the same; SCWC as 25-400m).
const assert=require('node:assert/strict');const path=require('node:path');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const STD=require(path.join(__dirname,'fixtures/callow-400fr-standards.json'));
const RACES=require(path.join(__dirname,'fixtures/callow-400fr-races.json'));
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland',viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.performanceEngine?.ageTable,{timeout:30000});await p.waitForTimeout(500);
  await p.evaluate(({STD,RACES})=>{const M=window.MSOS4;const mc={id:'athlete-matthew-callow',full_name:'Matthew Callow',squad:'Development',sex:'M',date_of_birth:'2012-09-26',active:true};M.state.athletes=[mc];
    M.refs.data.pathway_standards=STD;
    M.state.coachResults=[{id:'cr-nags',athlete_id:mc.id,swimmer_name:'Matthew Callow',result_date:'2026-04-10',meet_name:'NAGS 2026',course:'LCM',distance:400,stroke:'Freestyle',result_seconds:273.84,result_time_text:'4:33.84'},
      {id:'cr-sss',athlete_id:mc.id,swimmer_name:'Matthew Callow',result_date:'2026-07-30',meet_name:'2026 NZ Secondary Schools',course:'SCM',distance:400,stroke:'Freestyle',result_seconds:259.17,result_time_text:'4:19.17'}];
    M.state.raceSplits={[mc.id]:{v:2,at:new Date().toISOString(),rows:RACES}};
    M.state.settings.selectedAthleteId=mc.id;M.state.settings.pathwayCourse='LCM';M.state.settings.loopAthleteTab='performance';M.state.settings.storageRevision=(M.state.settings.storageRevision||0)+1;
    M.nav.show('athletes');},{STD,RACES});
  await p.waitForSelector('[data-cn-event="400|Freestyle"]',{timeout:15000});
  await p.waitForFunction(()=>/14s finalist/.test(document.querySelector('[data-cn-next="400|Freestyle"]')?.textContent||''),{timeout:15000});
  const next=await p.evaluate(()=>document.querySelector('[data-cn-next="400|Freestyle"]').textContent);
  assert.match(next,/(^|· )14s finalist · 4:29\.90 · 3\.94s$/,next);
  await p.click('[data-cn-event="400|Freestyle"] > summary');await p.waitForSelector('[data-cn-event="400|Freestyle"] .cn-age',{timeout:10000});
  const card=await p.evaluate(()=>document.querySelector('[data-cn-event="400|Freestyle"] .cn-detail').innerText);
  if(process.env.SHOT){await p.evaluate(()=>document.querySelector('[data-cn-event="400|Freestyle"] .cn-other')?.setAttribute('open',''));await p.locator('[data-cn-event="400|Freestyle"]').screenshot({path:process.env.SHOT});}
  // the age table
  const table=await p.evaluate(()=>[...document.querySelectorAll('[data-cn-event="400|Freestyle"] .cn-age tr')].map(tr=>[...tr.children].map(c=>c.innerText.replace(/\s+/g,' ').trim())));
  assert.deepEqual(table[0].slice(1),['14 now','15 next'],JSON.stringify(table[0]));assert.match(table[0][0],/PB 4:33\.84/);
  const row=l=>table.find(r=>r[0]===l);
  assert.ok(row('NAGS qualifying'),JSON.stringify(table));assert.match(row('NAGS qualifying')[1],/4:49\.41.*✓ done/);assert.match(row('NAGS qualifying')[2],/4:35\.74.*✓ done/);
  assert.match(row('Age finalist')[1],/4:29\.90.*3\.94s to go/);assert.match(row('Age medal')[1],/4:19\.02.*14\.82s to go/);assert.match(row('Age medal')[2],/4:08\.29.*25\.55s to go/);
  assert.match(row('Age winner')[1],/4:02\.64/);assert.ok(row('NZ age record'));assert.ok(row('Canterbury age record'));
  assert.ok(table.slice(1).every(r=>/\d+ WA/.test(r[1])||r[1]==='—'),'every standard carries its WA points: '+JSON.stringify(table));
  assert.doesNotMatch(card.split('Last swims')[0],/Open|16 & Under|NZ Championships/,'no open benchmark or wide band in the age table');
  // last swims, LCM
  const swims=await p.evaluate(()=>[...document.querySelectorAll('[data-cn-event="400|Freestyle"] [data-cn-swims] > .cn-swim')].map(x=>x.innerText.replace(/\s+/g,' ').trim()));
  assert.equal(swims.length,5,JSON.stringify(swims));
  assert.match(swims[0],/10 Apr 2026 NAGS 2026 · Final \(3rd\) 4:33\.84 \d+ WA · PB/,swims[0]);
  assert.match(swims[1],/10 Apr 2026 NAGS 2026 · Preliminary \(6th\) 4:38\.47/);
  assert.match(swims[2],/13 Mar 2026 South Island LC 2026 · Final \(2nd\) · Parakiore Recreation & Sport Centre 4:37\.42/,swims[2]);
  // SCM, folded, with converted
  const other=await p.evaluate(()=>document.querySelector('[data-cn-event="400|Freestyle"] .cn-other summary').innerText);
  assert.match(other,/SCM · best 4:19\.17 ≈ 4:\d\d\.\d\d LCM converted · 4 swims/,other);
  await p.evaluate(()=>document.querySelector('[data-cn-event="400|Freestyle"] .cn-other').open=true);
  const scm=await p.evaluate(()=>[...document.querySelectorAll('[data-cn-event="400|Freestyle"] .cn-other .cn-swim')].map(x=>x.innerText.replace(/\s+/g,' ').trim()));
  assert.match(scm[0],/29 Sept? 2026 2026 New Zealand Short Course Championships · Heat \(4th\) · Parakiore Recreation and Sport Centre 4:19\.91/,scm[0]);
  assert.match(scm[0],/50 29\.85 100 32\.75 150 33\.28 200 33\.57 250 32\.41 300 33\.41 350 33\.03 400 31\.61/,'25m splits marked 50-800 are read as 50s: '+scm[0]);
  assert.match(scm[0],/1st half 2:09\.45 · 2nd half 2:10\.46 \+1\.01s/,scm[0]);
  assert.match(scm[1],/4:19\.17.*PB/,'his SCM best is marked within the SCM list');
  assert.match(scm[2],/SCWC Short Course Champs · Final[\s\S]*50 29\.31 100 32\.74/,'SCWC 25m splits marked 25-400 read the same');
  assert.match(card,/Championship & open pathway · LCM/,'opens are folded away, not gone');
  // splits back to training: the back-half trend over his SC swims (the LCM swims have no splits)
  assert.match(card,/Back-end speed · front half \/ back half/,card);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('EVENT_AGE_TABLE_SWIMS_PASS');console.log(card);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
