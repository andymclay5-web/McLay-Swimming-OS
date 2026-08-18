import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE='http://127.0.0.1:4173';
const calendar={
  calendar_id:'rendered-ci-aug26',title:'Rendered CI August',coverage_start:'2026-08-01',coverage_end:'2026-08-31',published_at:'2026-08-19T06:00:00+12:00',rules:{empty_date_means_no_training:true},dates:[
    {date:'2026-08-19',status:'training',sessions:[
      {day_part:'AM',start_time:'05:20',end_time:'07:20',squads:['National'],venue:'AquaGym',pool_course:'SCM'},
      {day_part:'AM',start_time:'05:30',end_time:'07:00',squads:['Development'],venue:'AquaGym',pool_course:'SCM'}
    ],events:[]}
  ]
};
const tables={
  athletes:[
    {id:'mk',organisation_id:'org-ci',full_name:'McKenzie Drage',squad:'National',active:true,sex:'F'},
    {id:'molly',organisation_id:'org-ci',full_name:'Molly McKernan',squad:'Development',active:true,sex:'F'}
  ],
  training_test_types:[{id:'tt400',organisation_id:'org-ci',test_key:'t400_freestyle',name:'T400 Freestyle'}],
  training_test_results:[{id:'molly-t400',organisation_id:'org-ci',athlete_id:'molly',test_type_id:'tt400',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true}],
  athlete_adaptation_profiles:[],coach_results:[],results_pb_board:[],results_event_history:[],pathway_standards:[],world_aquatics_base_times:[]
};
const workout=`WARM UP\n300 Choice\nMAIN SET\n4 x 100 Freestyle @ 1:30\nWARM DOWN\n200 Easy\nTOTAL: 900m`;

function tableFrom(url){const parts=new URL(url).pathname.split('/').filter(Boolean);return decodeURIComponent(parts.at(-1)||'')}
async function waitText(locator,pattern){await locator.waitFor({state:'visible'});const value=(await locator.textContent())||'';assert.match(value,pattern);return value}
async function click(locator){await locator.waitFor({state:'visible'});await locator.click()}
async function tapCheckbox(input){assert.equal(await input.count(),1,'expected one swimmer-tag checkbox');const label=input.locator('xpath=ancestor::label[1]');await label.waitFor({state:'visible'});await label.click();assert.equal(await input.isChecked(),true,'tapping swimmer label must select the swimmer')}

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(error.message));
page.on('console',msg=>{if(msg.type()==='error')pageErrors.push(`console: ${msg.text()}`)});

await page.addInitScript(()=>{
  localStorage.setItem('mclay_swimming_v1_auth',JSON.stringify({access_token:'rendered-ci-token',user:{user_metadata:{organisation_id:'org-ci'}}}));
  localStorage.setItem('mclay_swimming_os_v4',JSON.stringify({settings:{organisationId:'org-ci'}}));
});
await page.route('**/monthly_calendar.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(calendar)}));
await page.route('**/rest/v1/**',route=>{
  const table=tableFrom(route.request().url()),body=Object.prototype.hasOwnProperty.call(tables,table)?tables[table]:[];
  return route.fulfill({status:200,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify(body)});
});

try{
  await page.goto(`${BASE}/assembly/`,{waitUntil:'networkidle'});
  await waitText(page.locator('.calendar-view'),/Training calendar/i);
  assert.equal(await page.locator('.assembly-build').textContent(),'ASSEMBLY');

  await click(page.locator('[data-date="2026-08-19"]'));
  await waitText(page.locator('.day-view'),/Wednesday, 19 August 2026/i);
  const dayText=await page.locator('.day-session-list').textContent();
  assert.match(dayText,/National/);assert.match(dayText,/Development/);

  await click(page.locator('[data-app-action="add-custom"]'));
  await waitText(page.locator('.custom-session-view'),/Custom session/i);
  await page.selectOption('#custom-session-squad','squad-development');
  await page.fill('#custom-session-start','07:30');
  await page.fill('#custom-session-end','08:30');
  await page.fill('#custom-session-venue','AquaGym');
  await page.selectOption('#custom-session-course','SCM');
  await click(page.locator('[data-app-action="save-custom"]'));

  await waitText(page.locator('.intake-view'),/Set up this session/i);
  const checked=page.locator('input[name="slot"]:checked');
  assert.equal(await checked.count(),1,'custom session intake should select exactly the new slot');
  await click(page.locator('[data-app-action="intake-text"]'));
  await page.locator('#assembly-session-source').fill(workout);
  await click(page.locator('[data-app-action="accept-draft"]'));

  await page.locator('.msos-board').waitFor({state:'visible'});
  await waitText(page.locator('.msos-board-total'),/900m/);
  await waitText(page.locator('.board-schedule-context'),/Development/);

  await click(page.locator('.msos-board-sticky-actions [data-board-action="roll"]'));
  await waitText(page.locator('.poolside-sheet'),/Roll/i);
  const mollyRoll=page.locator('.poolside-athlete-row').filter({hasText:'Molly McKernan'});
  assert.equal(await mollyRoll.count(),1,'Development roll should contain Molly exactly once');
  await click(mollyRoll.locator('button[data-status="present"]'));
  await click(page.locator('[data-panel-action="close"]'));
  await waitText(page.locator('.msos-athlete-chip[data-athlete-id="molly"]'),/^Molly/);
  await waitText(page.locator('.msos-board-sticky-actions'),/Roll · 1/);

  await click(page.locator('.msos-board-sticky-actions [data-board-action="times"]'));
  const mollyTimes=page.locator('.poolside-athlete-row').filter({hasText:'Molly McKernan'});
  await click(mollyTimes.locator('[data-panel-action="times-t400"]'));
  await waitText(mollyTimes,/5:24\.6/);
  await click(page.locator('[data-panel-action="close"]'));

  const firstSet=page.locator('.msos-set-row').first();
  await click(firstSet.locator('[data-board-action="note"]'));
  await page.fill('#poolside-note-text','Rendered deck note');
  await tapCheckbox(page.locator('input[name="capture-athlete"][value="molly"]'));
  await click(page.locator('[data-panel-action="capture-save"]'));
  await page.locator('.poolside-sheet').waitFor({state:'detached'}).catch(()=>{});
  await waitText(firstSet.locator('.msos-capture-marker'),/1 note/i);

  await click(page.locator('.msos-board-sticky-actions [data-board-action="photo"]'));
  await waitText(page.locator('.poolside-sheet'),/Photo capture/i);
  await tapCheckbox(page.locator('input[name="capture-athlete"][value="molly"]'));
  await page.locator('#poolside-media-file').setInputFiles({name:'lane-four.jpg',mimeType:'image/jpeg',buffer:Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0xff,0xd9])});
  await page.fill('#poolside-media-text','Lane four technique');
  await click(page.locator('[data-panel-action="capture-media-save"]'));
  await waitText(page.locator('.assembly-notice'),/Photo saved · Molly McKernan · linked to current session/i);

  const width=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
  assert(width.scrollWidth<=width.clientWidth+2,`phone layout overflows horizontally: ${width.scrollWidth} > ${width.clientWidth}`);

  await fs.mkdir('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/msos-assembly-mobile-board.png',fullPage:true});

  await page.evaluate(()=>history.back());
  await page.locator('.day-view').waitFor({state:'visible'});
  await waitText(page.locator('.day-view'),/Wednesday, 19 August 2026/i);

  assert.deepEqual(pageErrors,[],`browser emitted errors:\n${pageErrors.join('\n')}`);
  console.log('PASS rendered 390x844 Calendar -> custom session -> Truth -> Board -> Roll -> T400 -> Note -> Photo -> browser Back');
} finally {
  await browser.close();
}
