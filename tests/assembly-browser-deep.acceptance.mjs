import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE='http://127.0.0.1:4174';
const calendar={calendar_id:'deep-ci-aug26',title:'Deep CI August',coverage_start:'2026-08-01',coverage_end:'2026-08-31',published_at:'2026-08-19T06:00:00+12:00',rules:{empty_date_means_no_training:true},dates:[{date:'2026-08-19',status:'training',sessions:[{day_part:'AM',start_time:'05:30',end_time:'07:00',squads:['Development'],venue:'AquaGym',pool_course:'SCM'}],events:[]}]};
const tables={
  athletes:[{id:'molly',organisation_id:'org-ci',full_name:'Molly McKernan',squad:'Development',active:true,sex:'F'}],
  training_test_types:[{id:'tt400',organisation_id:'org-ci',test_key:'t400_freestyle',name:'T400 Freestyle'}],
  training_test_results:[{id:'molly-t400',organisation_id:'org-ci',athlete_id:'molly',test_type_id:'tt400',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true}],
  athlete_adaptation_profiles:[{id:'molly-profile',organisation_id:'org-ci',athlete_id:'molly',default_volume_ratio:.75,return_to_starting_end:true,active:true,profile_label:'Modified swimmer'}],
  coach_results:[],results_pb_board:[],results_event_history:[],pathway_standards:[],world_aquatics_base_times:[]
};
const workout=`WARM UP\n300 Choice\nMAIN SET\n4 x 100 Freestyle @ 1:30\nWARM DOWN\n200 Easy\nTOTAL: 900m`;
const tableFrom=url=>decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).at(-1)||'');
async function waitText(locator,pattern,{timeout=6000}={}){await locator.waitFor({state:'visible',timeout});const until=Date.now()+timeout;let value='';while(Date.now()<until){value=(await locator.textContent())||'';pattern.lastIndex=0;if(pattern.test(value))return value;await new Promise(r=>setTimeout(r,40))}assert.match(value,pattern);return value}
async function click(locator){await locator.waitFor({state:'visible'});await locator.click()}

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`)});
await page.addInitScript(()=>{localStorage.setItem('mclay_swimming_v1_auth',JSON.stringify({access_token:'deep-ci-token',user:{user_metadata:{organisation_id:'org-ci'}}}));localStorage.setItem('mclay_swimming_os_v4',JSON.stringify({settings:{organisationId:'org-ci'}}))});
await page.route('**/monthly_calendar.json',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(calendar)}));
await page.route('**/rest/v1/**',r=>{const table=tableFrom(r.request().url());return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Object.prototype.hasOwnProperty.call(tables,table)?tables[table]:[])})});

try{
  await page.goto(`${BASE}/assembly/`,{waitUntil:'networkidle'});
  await click(page.locator('[data-date="2026-08-19"]'));
  const devCard=page.locator('.day-session-card').filter({hasText:'Development'});await click(devCard.locator('[data-app-action="open-item"]'));
  await waitText(page.locator('.intake-view'),/Set up this session/i);assert.equal(await page.locator('input[name="slot"]:checked').count(),1);
  await click(page.locator('[data-app-action="intake-text"]'));await page.fill('#assembly-session-source',workout);await click(page.locator('[data-app-action="accept-draft"]'));
  await page.locator('.msos-board').waitFor({state:'visible'});await waitText(page.locator('.msos-board-total'),/900m/);
  const sessionId=await page.locator('.msos-board').getAttribute('data-session-id');assert(sessionId);

  await click(page.locator('.msos-board-sticky-actions [data-board-action="roll"]'));
  const mollyRoll=page.locator('.poolside-athlete-row').filter({hasText:'Molly McKernan'});await click(mollyRoll.locator('[data-status="present"]'));await click(page.locator('[data-panel-action="close"]'));
  await page.locator('.msos-athlete-chip[data-athlete-id="molly"]').waitFor({state:'visible'});

  const mainSet=page.locator('.msos-set-row').filter({hasText:/4\s*[x×]\s*100 Freestyle/});assert.equal(await mainSet.count(),1,'expected one 4x100 main set');
  await click(mainSet.locator('[data-board-action="edit"]'));await waitText(page.locator('.poolside-sheet'),/Edit set/i);await page.fill('[data-edit-field="reps"]','5');await page.fill('#poolside-edit-note','Rendered group edit');await click(page.locator('[data-panel-action="edit-set-save"]'));
  await waitText(page.locator('.msos-board-total'),/1,000m/);await waitText(page.locator('.msos-set-row').filter({hasText:/5\s*[x×]\s*100 Freestyle/}),/5\s*[x×]\s*100/);
  const lifecycle=await page.evaluate(id=>{const r=window.MSOSAssemblyBrowser.state.app.session(id);return{original:r.originalPlan.metadata?.parsedTotal,current:r.current.metadata?.parsedTotal,revision:r.revision}},sessionId);assert.deepEqual(lifecycle,{original:900,current:1000,revision:2},'group edit must revise current truth while preserving original plan');

  const warmSet=page.locator('.msos-set-row').filter({hasText:/300 Choice/}).first();await warmSet.waitFor({state:'visible'});const mollyMod=warmSet.locator('.msos-mod-card[data-athlete-id="molly"]');await mollyMod.waitFor({state:'visible'});await click(mollyMod.locator('[data-board-action="edit-athlete"]'));await waitText(page.locator('.poolside-sheet'),/Edit · Molly McKernan/i);await page.fill('[data-edit-field="distance"]','250');await page.fill('#poolside-edit-reason','Rendered individual override');await click(page.locator('[data-panel-action="edit-athlete-save"]'));
  await waitText(warmSet.locator('.msos-set-title'),/300 Choice/);await waitText(warmSet.locator('.msos-mod-card[data-athlete-id="molly"]'),/250 Choice/);
  const overrideBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('msos.assembly.v1.adaptation')||'null'));assert(overrideBefore?.overrides?.some(x=>x.athleteId==='molly'&&x.prescription?.distance===250),'explicit swimmer override must save locally');

  await click(page.locator('.msos-board-sticky-actions [data-board-action="finish"]'));await waitText(page.locator('.poolside-sheet'),/Finish session/i);await waitText(page.locator('.poolside-sheet'),/planned session stays preserved/i);await page.fill('#poolside-finish-note','Rendered full finish');await click(page.locator('[data-panel-action="finish-confirm"]'));
  await waitText(page.locator('.board-finished-context'),/Finished · 1,000m/);assert.equal(await page.locator('.msos-board-sticky-actions [data-board-action="finish"]').isVisible(),false,'Finish must no longer be offered after delivered truth exists');
  const delivery=await page.evaluate(id=>{const d=window.MSOSAssemblyBrowser.state.app.deliveryForSession(id);return{status:d.status,planned:d.planned_distance,current:d.current_distance,delivered:d.delivered_distance}},sessionId);assert.deepEqual(delivery,{status:'finished',planned:900,current:1000,delivered:1000});

  await click(page.locator('[data-app-action="back"]'));await page.locator('.day-view').waitFor({state:'visible'});const finishedCard=page.locator('.day-session-card').filter({hasText:'Development'});await waitText(finishedCard,/Finished/);await waitText(finishedCard,/Delivered 1,000m/);await waitText(finishedCard,/Review Board/);await click(finishedCard.locator('[data-app-action="open-item"]'));
  await page.locator('.board-finished-context').waitFor({state:'visible'});

  await page.reload({waitUntil:'networkidle'});
  await page.locator('.msos-board').waitFor({state:'visible'});await waitText(page.locator('.board-finished-context'),/Finished · 1,000m/);await waitText(page.locator('.msos-board-total'),/1,000m/);await page.locator('.msos-athlete-chip[data-athlete-id="molly"]').waitFor({state:'visible'});const restoredWarm=page.locator('.msos-set-row').filter({hasText:/300 Choice/}).first();await waitText(restoredWarm.locator('.msos-mod-card[data-athlete-id="molly"]'),/250 Choice/);
  const restored=await page.evaluate(id=>{const app=window.MSOSAssemblyBrowser.state.app,r=app.session(id),d=app.deliveryForSession(id);return{selected:app.selectedSession()?.id,original:r.originalPlan.metadata?.parsedTotal,current:r.current.metadata?.parsedTotal,delivered:d?.delivered_distance,overrides:JSON.parse(localStorage.getItem('msos.assembly.v1.adaptation')||'null')?.overrides?.length||0}},sessionId);assert.deepEqual(restored,{selected:sessionId,original:900,current:1000,delivered:1000,overrides:1});

  const width=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));assert(width.scrollWidth<=width.clientWidth+2,`phone layout overflow ${width.scrollWidth} > ${width.clientWidth}`);assert.deepEqual(errors,[],`browser errors:\n${errors.join('\n')}`);
  await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/msos-assembly-deep-mobile.png',fullPage:true});
  console.log('PASS rendered Edit -> swimmer modification -> Finish -> Day status -> reload restores exact Board truth');
} finally {await browser.close()}
