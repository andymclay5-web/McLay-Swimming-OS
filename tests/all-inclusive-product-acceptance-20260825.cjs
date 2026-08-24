'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const BUILD='v4-final-acceptance-20260825a';
const SOURCE=`WARM-UP
400 Choice
4 x 50 as 25 Drill / 25 Swim

MAIN SET
2 x 400 Freestyle — 1 Regeneration / 1 Development +20s
8 x 100 Freestyle — 1-4 Overload / 5-8 Threshold +20s
4 x 50 #1 Stroke @ 1:15 — Odd 200 Pace / Even Drill

WARM-DOWN
200 Easy`;
const specs=[
 {key:'charlotte',full_name:'Charlotte Murphy',squad:'National',t400:'4:50.0',status:'modified'},
 {key:'mckenzie',full_name:'McKenzie Drage',squad:'National',t400:'5:03.0',status:'modified'},
 {key:'thomas',full_name:'Thomas Cave',squad:'National',t400:'4:35.0',status:'present'},
 {key:'alex',full_name:'Alex Gibson',squad:'National',t400:'4:29.0',status:'present'},
 {key:'matthew',full_name:'Matthew Kofoed',squad:'National',t400:'5:20.0',status:'modified'}
];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const page=await context.newPage(),pageErrors=[],consoleErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.stack||e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  let snap=await page.evaluate(()=>({build:MSOS4.BUILD,view:MSOS4.state.settings.view,storage:MSOS4.state.settings.storageMode,guardian:MSOS4.state.guardian?.runs?.at(-1),dosage:MSOS4.dosageEngine?.build}));
  assert.equal(snap.build,BUILD);assert.equal(snap.view,'board');assert.equal(snap.storage,'indexeddb');assert.equal(snap.guardian?.ok,true);assert.match(snap.dosage||'',/dosage/);
  async function nav(view){await page.click(`[data-nav="${view}"]`);await page.waitForFunction(v=>MSOS4.state.settings.view===v&&document.querySelector(`#${v}View`)?.classList.contains('active'),view,{timeout:3000});}
  for(const v of ['hub','roll','times','board'])await nav(v);

  await page.click('#newSessionBtn');await page.waitForSelector('#coreRaw');await page.fill('#coreRaw',SOURCE);await page.waitForFunction(()=>document.querySelector('#coreCreate')?.disabled===false);await page.click('#coreCreate');
  await page.waitForFunction(()=>MSOS4.currentSession?.()&&MSOS4.session.total(MSOS4.currentSession())===2600,{timeout:5000});
  const sessionId=await page.evaluate(()=>MSOS4.currentSession().id);
  let board=await page.locator('#boardView').innerText(),flat=board.replace(/\s+/g,' ');
  for(const rule of [/2\s*[×x]\s*400\s*(?:Fr|Freestyle)/i,/8\s*[×x]\s*100\s*(?:Fr|Freestyle)/i,/4\s*[×x]\s*50[^\n]*#1\s*Stroke/i,/REG|Regeneration/i,/THR|Threshold/i,/RP200|200 Pace/i])assert.match(flat,rule);
  assert.ok(!/NaN|undefined|@ 00\.0/.test(board),'Board exposed invalid values');

  await page.evaluate(list=>{
   const M=MSOS4,s=M.currentSession(),ids={};M.state.athletes=M.state.athletes||[];M.state.resultsPbBoard=M.state.resultsPbBoard||[];
   for(const spec of list){let a=M.state.athletes.find(x=>String(x.full_name||'').toLowerCase()===spec.full_name.toLowerCase());if(!a){a={id:`accept-${spec.key}`,full_name:spec.full_name,squad:spec.squad,active:true};M.state.athletes.push(a)}a.active=true;a.squad=spec.squad;a.legacy_pace={...(a.legacy_pace||{}),t400:spec.t400,course:'SCM',t400_date:'2026-08-01'};ids[spec.key]=a.id;}
   const th=ids.thomas,mat=ids.matthew;for(const [id,time] of [[th,58.4],[mat,65.2]])if(!M.state.resultsPbBoard.some(x=>String(x.athlete_id)===String(id)&&Number(x.distance)===100&&String(x.stroke)==='Freestyle'))M.state.resultsPbBoard.push({athlete_id:id,distance:100,stroke:'Freestyle',course:'SCM',result_seconds:time,sex:'M',date:'2026-07-01'});
   let dev=M.state.athletes.find(x=>x.id==='accept-jordan-dev');if(!dev){dev={id:'accept-jordan-dev',full_name:'Jordan Scope Development Swimmer',squad:'Development',active:true};M.state.athletes.push(dev)}
   M.state.__acceptIds=ids;M.state.attendance=(M.state.attendance||[]).filter(x=>x.session_id!==s.id||!Object.values(ids).includes(x.athlete_id));M.store.save(M.state);M.ui.renderCurrent();
  },specs);
  const live=await page.evaluate(list=>list.map(x=>({...x,id:MSOS4.state.__acceptIds[x.key]})),specs);
  await nav('roll');for(const sw of live){const b=page.locator(`[data-roll="${sw.id}:${sw.status}"]`);assert.equal(await b.count(),1,`Roll missing ${sw.full_name}`);await b.click();await page.waitForFunction(({sid,id,status})=>MSOS4.state.attendance.some(x=>x.session_id===sid&&x.athlete_id===id&&x.status===status),{sid:sessionId,id:sw.id,status:sw.status});}

  await nav('board');board=await page.locator('#boardView').innerText();const mods=(await page.locator('.msos-mod-row').allInnerTexts()).join('\n');assert.match(mods,/Charlotte/);assert.match(mods,/McKenzie/);assert.match(mods,/Matt/);
  const targetRow=page.locator('.msos-work-row',{hasText:/8×100|8 × 100/}).first();assert.equal(await targetRow.count(),1,'8x100 Board row missing');await targetRow.locator('[data-msos-times]').click();await page.waitForSelector('[data-msos-target-matrix]');await page.waitForTimeout(150);const targetText=await targetRow.locator('[data-msos-target-matrix]').innerText();assert.match(targetText,/Charlotte|McKenzie|Thomas|Alex|Matt/);assert.match(targetText,/\d{1,2}:\d{2}|\d{2}\.\d/,'No calculated target appeared');assert.ok(!/NaN|undefined/.test(targetText));

  await page.click('#tvModeBtn');await page.waitForFunction(()=>MSOS4.state.settings.view==='tv'&&document.querySelector('#tvView.active'));const tv=await page.locator('#tvView').innerText();assert.match(tv,/TV BOARD\s*·\s*READ ONLY/i);assert.match(tv,/2,600m|2600m/);assert.match(tv,/Charlotte|McKenzie|Matt/);assert.match(tv,/\d{1,2}:\d{2}|\d{2}\.\d/,'TV did not project resolved targets');assert.equal(await page.locator('#tvView button,#tvView input,#tvView textarea,#tvView select').count(),0,'TV exposed interactive controls');assert.doesNotMatch(tv,/Loading targets|Loading PB|Sex required|stroke needed|Target unavailable|\bEDIT\b/i,'TV leaked loading, editing or internal validation state');await page.click('#tvModeBtn');await page.waitForFunction(()=>MSOS4.state.settings.view==='board');

  const swimmersBtn=page.locator('#boardView [data-msos-swimmers]').first();assert.equal(await swimmersBtn.count(),1,'Board missing one-tap Swimmers access');await swimmersBtn.click();await page.waitForFunction(()=>MSOS4.state.settings.view==='athletes'&&document.querySelector('#athletesView.active'));
  const thomas=live.find(x=>x.key==='thomas');await page.selectOption('#pathAthlete',thomas.id);await page.waitForFunction(()=>document.querySelector('#athletesView')?.innerText.includes('Thomas Cave'));let athleteText=await page.locator('#athletesView').innerText();assert.match(athleteText,/SWIMMER PERFORMANCE/);assert.match(athleteText,/PB|PATHWAY|QUALIFIER/i);

  const matt=live.find(x=>x.key==='matthew');const matthewProof=await page.evaluate(id=>{const M=MSOS4,a=M.state.athletes.find(x=>x.id===id),p=M.swimmerInviteBN?.payloadFor?.(a);return{payload:!!p,athlete:p?.athlete?.full_name,blocks:p?.session?.blocks?.length||0,events:p?.performance?.events?.length||0,feedback:typeof M.swimmerInviteBN?.verifySessionInteractionLayer==='function'}},matt.id);assert.equal(matthewProof.payload,true);assert.equal(matthewProof.athlete,'Matthew Kofoed');assert.ok(matthewProof.blocks>0);assert.ok(matthewProof.events>0);assert.equal(matthewProof.feedback,true);
  await page.evaluate(id=>{MSOS4.state.settings.view='swimmer';MSOS4.access.setRole('swimmer',{athleteId:id});MSOS4.ui.renderCurrent();},matt.id);await page.waitForFunction(id=>MSOS4.access.role()==='swimmer'&&MSOS4.access.visibleAthletes().length===1&&MSOS4.access.visibleAthletes()[0].id===id,matt.id);assert.equal(await page.evaluate(()=>MSOS4.access.can('session.edit')),false);assert.equal(await page.evaluate(()=>MSOS4.access.sessionAllowed(MSOS4.currentSession())),true);
  await page.evaluate(()=>{MSOS4.access.setRole('owner');MSOS4.state.settings.view='board';MSOS4.ui.renderCurrent()});await page.waitForFunction(()=>MSOS4.access.role()==='owner'&&MSOS4.state.settings.view==='board');

  const jordan=await page.evaluate(()=>{const M=MSOS4;M.state.settings.assistantSquads=['National'];M.state.settings.assistantPermissions=[];M.access.setRole('assistant',{assistantId:'jordan'});M.state.settings.view='board';M.ui.renderCurrent();let denied=false;try{M.meet.assertRaceScope('accept-jordan-dev')}catch{denied=true}return{role:M.access.role(),names:M.access.visibleAthletes().map(a=>a.full_name),edit:M.access.can('session.edit'),finish:M.access.can('session.finish'),timing:M.access.can('timing.write'),attendance:M.access.can('attendance.write'),denied,nav:[...document.querySelectorAll('.bottom-nav button')].map(x=>x.textContent.trim())}});assert.equal(jordan.role,'assistant');assert.ok(jordan.names.includes('Matthew Kofoed'));assert.ok(!jordan.names.includes('Jordan Scope Development Swimmer'));assert.equal(jordan.edit,false);assert.equal(jordan.finish,false);assert.equal(jordan.timing,true);assert.equal(jordan.attendance,true);assert.equal(jordan.denied,true);assert.ok(!jordan.nav.some(x=>/Coach Hub/i.test(x)));
  await page.evaluate(()=>{MSOS4.access.setRole('owner');MSOS4.state.settings.assistantSquads=[];MSOS4.ui.renderCurrent()});

  const meetProof=await page.evaluate(id=>{const M=MSOS4;M.meet.ensureState();let meet=M.state.meets.find(x=>x.id==='accept-meet');if(!meet)meet=M.meet.create({id:'accept-meet',title:'Acceptance Meet',date:'2026-08-29',venue:'Test Pool',course:'SCM'});M.meet.setCurrent(meet.id);let e=M.state.meetEntries.find(x=>x.meet_id===meet.id&&x.athlete_id===id);if(!e)e=M.meet.addEntry({meetId:meet.id,athleteId:id,eventNumber:1,event:'100 Freestyle',distance:100,stroke:'Freestyle',heat:2,lane:4,entrySeconds:58.4});M.meet.planEntry(e.id,{warmupPlan:'Standard race warm-up',racePlan:'Controlled first 50 · race home',goalSeconds:57.9});const race=M.meet.startRace(e.id);M.meet.addSplit(race.id,28.1,{distance:50,label:'50'});M.meet.finishRace(race.id,{resultSeconds:57.8,place:2,notes:'Held line under pressure'});M.state.settings.view='meet';M.ui.renderCurrent();return{entry:e.id,race:race.id,result:M.meet.raceForEntry(e.id).result_seconds,evidence:M.meet.visibleEvidence(e.id).length}},thomas.id);assert.equal(meetProof.result,57.8);assert.ok(meetProof.evidence>=1);await page.waitForFunction(()=>MSOS4.state.settings.view==='meet');const meetText=await page.locator('#meetView').innerText();assert.match(meetText,/LIVE MEET DECK/);assert.match(meetText,/Acceptance Meet/);assert.match(meetText,/Result 57\.8|57\.80/);
  await page.evaluate(()=>{MSOS4.navigationEngine.go('board',{restore:false})});await page.waitForFunction(()=>MSOS4.state.settings.view==='board');

  const doseCheck=await page.evaluate(()=>{const M=MSOS4,s=M.currentSession(),block=s.blocks.find(b=>/main/i.test(b.title||b.type))||s.blocks[1],item=block.items[0],partial=M.changes.finishAtItem(s,item.id,{observations:'partial test'}),dose=M.dosageEngine.session(partial,M.state,{delivered:true});return{actual:partial.finish.actualDistance,dose:dose.rawMetres,systems:dose.systems}});assert.equal(doseCheck.dose,doseCheck.actual,'Dosage ignored exact line-level finish');assert.ok(doseCheck.systems.Regeneration.metres>0||doseCheck.systems.Development.metres>0);
  await page.evaluate(()=>{const M=MSOS4,s=M.currentSession(),last=s.blocks.at(-1);M.state.canonicalSessions[s.id]=M.changes.finishAtBlock(s,last.id,{observations:'Acceptance session delivered',carryForward:'Review threshold quality'});M.store.save(M.state);M.ui.renderCurrent()});await page.waitForFunction(()=>MSOS4.currentSession()?.finish?.actualDistance===2600);
  const dose=await page.evaluate(()=>{const M=MSOS4,s=M.currentSession(),x=M.dosageEngine.scopeSummary(s,M.state,{delivered:true});return{session:x.session,people:x.individual.length,squads:Object.keys(x.squad),team:x.team,metric:M.reportingEngine.METRICS.some(m=>m.id==='dosage')}});assert.equal(dose.session.rawMetres,2600);assert.ok(dose.session.systems.Threshold.metres>=400);assert.ok(dose.session.systems.Overload.metres>=400);assert.ok(dose.session.stimulusUnits>0);assert.ok(dose.people>=5);assert.ok(dose.squads.includes('National'));assert.equal(dose.team.swimmers,dose.people);assert.equal(dose.metric,true);

  await nav('hub');await page.waitForSelector('[data-msos-dosage="hub"]',{timeout:3000});const hub=await page.locator('#hubView').innerText();assert.match(hub,/SEASON|THIS WEEK|TODAY/i);const hubDose=await page.locator('[data-msos-dosage="hub"]').textContent();assert.match(hubDose,/Energy-system stimulus/i);assert.match(hubDose,/Threshold/);assert.match(hubDose,/Weighted stroke focus/i);assert.match(hubDose,/Individual \/ squad \/ team load/i);
  await page.evaluate(()=>MSOS4.navigationEngine.go('reports',{restore:false}));await page.waitForFunction(()=>MSOS4.state.settings.view==='reports'&&document.querySelector('#reportsView.active'));await page.waitForSelector('[data-report-metric][value="dosage"]');await page.waitForSelector('[data-msos-dosage="report"]',{timeout:3000});const reportDose=await page.locator('[data-msos-dosage="report"]').textContent();assert.match(reportDose,/Energy-system \/ dosage/i);assert.match(reportDose,/stimulus/i);assert.match(reportDose,/Matthew Kofoed|Matt/);

  await page.evaluate(()=>MSOS4.navigationEngine.go('board',{restore:false}));const before=Date.now();await page.evaluate(()=>MSOS4.store.save(MSOS4.state));await page.waitForFunction(t=>Number(MSOS4.storageEngine.lastPersistedAt||0)>=t,before,{timeout:5000});
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(sid=>MSOS4?.storageEngine?.hydrated?.()===true&&MSOS4.currentSession?.()?.id===sid,sessionId,{timeout:10000});snap=await page.evaluate(()=>({view:MSOS4.state.settings.view,session:MSOS4.currentSession()?.id,finished:MSOS4.currentSession()?.finish?.actualDistance,attendance:MSOS4.state.attendance.filter(x=>x.session_id===MSOS4.currentSession()?.id).length,dosage:MSOS4.dosageEngine.session(MSOS4.currentSession(),MSOS4.state,{delivered:true}).rawMetres}));assert.equal(snap.view,'board');assert.equal(snap.session,sessionId);assert.equal(snap.finished,2600);assert.ok(snap.attendance>=5);assert.equal(snap.dosage,2600);
  await page.click('[data-nav="roll"]');await page.waitForFunction(()=>MSOS4.state.settings.view==='roll');await page.goBack();await page.waitForFunction(()=>MSOS4.state.settings.view==='board',{timeout:3000});
  const worker=await page.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('worker build timeout')),3000),fn=e=>{if(e.data?.type!=='MSOS_BUILD')return;clearTimeout(t);navigator.serviceWorker.removeEventListener('message',fn);resolve(e.data)};navigator.serviceWorker.addEventListener('message',fn);(navigator.serviceWorker.controller||reg.active)?.postMessage({type:'MSOS_BUILD'})})});assert.equal(worker.build,BUILD);
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});assert.equal(await page.evaluate(()=>MSOS4.BUILD),BUILD);assert.equal(await page.evaluate(()=>MSOS4.currentSession()?.finish?.actualDistance),2600);assert.ok(await page.evaluate(()=>!!MSOS4.dosageEngine));
  assert.deepEqual(pageErrors,[],`page errors:\n${pageErrors.join('\n')}`);assert.deepEqual(consoleErrors.filter(x=>!/service worker/i.test(x)),[],`console errors:\n${consoleErrors.join('\n')}`);
  console.log('ALL_INCLUSIVE_PRODUCT_ACCEPTANCE_PASS');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
