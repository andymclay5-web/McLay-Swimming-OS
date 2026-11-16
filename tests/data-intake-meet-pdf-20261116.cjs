'use strict';
// Andy, Mon 16 Nov 2026: chose "2026 aquagym challenge meet results.pdf" in Data intake; the box filled with
// "%PDF-1.3 ..." and Preview said "MSOS could not safely identify this data type". Proves, with his real file:
//  - a PDF is read as the text it shows (both Meet Manager columns, in order) and routed to Meet / PB results;
//  - only swimmers in MSOS are kept, with the meet's own distance / stroke / course / date and the meet name;
//  - skins rounds are left out (their printed strokes cannot be right, so they would make false PBs);
//  - Commit stages each result for the cloud, the same path every other results import uses.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const PDFJS=path.join(require('child_process').execSync('npm root -g').toString().trim(),'pdfjs-dist/legacy/build');
const FILE=path.join(__dirname,'fixtures/2026-aquagym-challenge-results.pdf');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland',viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  // pdf.js comes from the CDN on the phone; the test serves the same library locally
  await p.route('https://cdn.jsdelivr.net/npm/pdfjs-dist@*/legacy/build/*',r=>{const f=r.request().url().split('/').pop();r.fulfill({path:path.join(PDFJS,f),contentType:'text/javascript'});});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.dataAdminUI&&window.MSOS4?.inputData,{timeout:30000});await p.waitForTimeout(500);
  await p.evaluate(()=>{const M=window.MSOS4;const mk=(n,sq)=>({id:`athlete-${n.toLowerCase().replace(/\s+/g,'-')}`,full_name:n,squad:sq,active:true});
    M.state.athletes=[mk('Matthew Callow','Development'),mk('Thomas Cave','National'),mk('Matthew Robertson','National'),mk('Luke Thompson','National'),mk('Charlotte Murphy','National'),mk('Ruby Stace','Intermediate'),mk('Awatea Calman','Development')];
    M.state.athletes.push({id:'athlete-zakhar-voynov',full_name:'Zakhar Voynov',squad:'Intermediate',active:true},{id:'athlete-oli-stone',full_name:'Oli Stone',squad:'Intermediate',active:true});
    M.state.pending=[];M.nav.show('data');});
  await p.waitForSelector('#dataFile',{state:'attached'});
  await p.setInputFiles('#dataFile',FILE);
  await p.waitForFunction(()=>/Event 1 Boys 13-14 100 LC Meter Backstroke/.test(document.querySelector('#dataPaste')?.value||''),{timeout:20000});
  const text=await p.inputValue('#dataPaste');
  assert.match(text,/2026 Aquagym Challenge Meet - 31\/10\/2026 to 1\/11\/2026/);
  assert.match(text,/^1 Matthew Callow 14 AQGCB 1:08\.54$/m,'a left-column row reads as one printed line');
  assert.match(text,/^7 Matthew Robertson 16 AQGCB 29\.42$/m,'a right-column row reads as one printed line');
  await p.click('#previewData');await p.waitForSelector('#dataPreview .check-card');
  const pv=await p.evaluate(()=>document.querySelector('#dataPreview').innerText);
  assert.match(pv,/Meet \/ PB results/,pv);
  // 16 Nov 2026 ("fix it so it works next time"): club-mates under a different name are named, with what to do
  assert.match(pv,/AQGCB swimmers? not matched[\s\S]*Name in results/,pv);assert.match(pv,/Zakhar Voinov/);assert.match(pv,/Ollie Stone/);
  // ... he adds the results name in Manage swimmers, previews again, and their swims come in
  await p.evaluate(()=>{const row=document.querySelector('[data-roster-id="athlete-zakhar-voynov"]');row.querySelector('[data-roster-aliases]').value='Zakhar Voinov';row.querySelector('[data-roster-save]').click();});
  const stagedAth=await p.evaluate(()=>(window.MSOS4.state.pending||[]).filter(x=>x.table==='athletes'&&x.record.id==='athlete-zakhar-voynov').map(x=>x.record.source_profile));
  assert.deepEqual(stagedAth.at(-1)?.results_aliases?.map(x=>x.name),['Zakhar Voinov'],'the results name is saved to the cloud with the swimmer');
  await p.evaluate(()=>{window.MSOS4.state.pending=[];});
  await p.waitForSelector('#dataFile',{state:'attached'});await p.setInputFiles('#dataFile',FILE);
  await p.waitForFunction(()=>/Event 1 Boys 13-14/.test(document.querySelector('#dataPaste')?.value||''),{timeout:20000});
  await p.click('#previewData');await p.waitForSelector('#dataPreview .check-card');
  const zak=await p.evaluate(()=>window.MSOS4.dataRegistry.parseText(document.querySelector('#dataPaste').value,'x.pdf').rows.filter(r=>r.athlete_id==='athlete-zakhar-voynov').map(r=>`${r.distance} ${r.stroke} ${r.result_seconds}`));
  assert.ok(zak.includes('100 Backstroke 75.21')&&zak.length>=8,JSON.stringify(zak));
  assert.doesNotMatch(await p.evaluate(()=>document.querySelector('#dataPreview').innerText),/Zakhar Voinov/,'matched now, no longer listed');
  const rows=await p.evaluate(()=>{const M=window.MSOS4;const parsed=M.dataRegistry.parseText(document.querySelector('#dataPaste').value,'x.pdf');return{kind:parsed.kind,meet:parsed.meet,rows:parsed.rows};});
  assert.equal(rows.kind,'results');assert.equal(rows.meet,'2026 Aquagym Challenge Meet');
  const mc=rows.rows.find(r=>r.athlete_id==='athlete-matthew-callow'&&r.distance===100&&r.stroke==='Backstroke');
  assert.ok(mc,'Matthew Callow 100 Back');assert.equal(mc.result_seconds,68.54);assert.equal(mc.course,'LCM');assert.equal(mc.result_date,'2026-10-31');
  const mr=rows.rows.find(r=>r.athlete_id==='athlete-matthew-robertson'&&r.distance===50&&r.stroke==='Butterfly');assert.ok(mr);assert.equal(mr.result_seconds,29.42);
  assert.ok(rows.rows.some(r=>r.athlete_id==='athlete-charlotte-murphy'&&r.result_seconds===127.52),'para class in the name is ignored (Charlotte T Murphy S6/Sm6/... 2:07.52)');
  assert.ok(rows.rows.every(r=>r.athlete_id),'only swimmers in MSOS');
  assert.ok(!rows.rows.some(r=>r.athlete_id==='athlete-matthew-callow'&&r.distance===50),'skins rounds (Events 35-38, their stroke labels cannot be trusted) are left out');
  assert.ok(!rows.rows.some(r=>r.athlete_id==='athlete-ruby-stace'&&r.result_seconds===45.44),'multi-class skins rounds are left out');
  assert.ok(!rows.rows.some(r=>/Liam Botha/.test(r.athlete_name)),'other clubs are left out');
  // Commit -> staged for the cloud like every results import
  await p.click('#commitDataPreview');await p.waitForTimeout(800);
  const staged=await p.evaluate(()=>(window.MSOS4.state.pending||[]).filter(x=>x.table==='coach_results').length);
  assert.equal(staged,rows.rows.length,`${staged} staged of ${rows.rows.length}`);
  assert.deepEqual(errors,[],errors.join('\n'));
  console.log('DATA_INTAKE_MEET_PDF_PASS',rows.rows.length,'results');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
