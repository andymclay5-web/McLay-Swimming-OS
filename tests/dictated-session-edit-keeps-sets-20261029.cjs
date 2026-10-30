'use strict';
// Andy, Thu 29 Oct 2026, 5:18am: "just dictated a session, and it came out quite well ... it sort of got all the
// distances ... then I went and edited the session, changed the preset to two rounds, and then ... it jumbled up
// everything else. So rather than having all those distances that it had extracted initially, it just had the writing
// of what I'd said". His saved session went from ~3,380m to 1,100m.
// Cause: the dictated session's sets came from the transcript's set-by-set reading, but the text behind each set was
// his spoken sentence; Edit shows that text, and applying an edit re-reads the session from it.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const W=(raw,reps,distance,extra={})=>({raw,kind:'work',counts_distance:true,reps,distance,cycle:'',rest_seconds:null,stroke:'',zone:'',rep_pattern:[],equipment:[],start_type:'',pace_distance:null,instruction:'',uncertain:false,...extra});
const C=raw=>({raw,kind:'cue',counts_distance:false,reps:null,distance:null,cycle:'',rest_seconds:null,stroke:'',zone:'',rep_pattern:[],equipment:[],start_type:'',pace_distance:null,instruction:'',uncertain:false});
const B=(block_type,title,items,repeat_count=1)=>({block_type,title,repeat_count,common_rest_seconds:null,notes:'',items});
const SPOKEN="Okay warm up 600 choices. Pre-set, 100 minimum stroke count on 145, 50 build on 60. I think we'll go 6 x 100 descending 1 to 3 freestyle on 140. And then we'll go 8 times 20 metre turn max on a minute. And then 3 200s descending 1 to 3 on 330. And then 8 times 15 underwater max. Post main set we'll just go a 600 with fins, 8 plus underwater kicks. 200 choice.";
const STRUCTURED=[
  B('warmup','Warm-up',[W('Okay warm up 600 choices.',1,600,{stroke:'Choice'})]),
  B('preset','Pre-set',[W('100 minimum stroke count on 145.',1,100,{cycle:'1:45',instruction:'Minimum Stroke Count'}),W('50 build on 60.',1,50,{cycle:'1:00',instruction:'Build'})]),
  B('main','Main set',[W("I think we'll go 6 x 100. Descending 1 to 3, freestyle. On 140.",6,100,{cycle:'1:40',stroke:'Freestyle',instruction:'Desc 1-3'}),W("And then we'll go 8 times 20 metre turn max on a minute.",8,20,{cycle:'1:00',instruction:'Turn MAX'}),W("And then we'll go 3 200s. Descending 1 to 3 on 330. Freestyle, same as the 100 before.",3,200,{cycle:'3:30',stroke:'Freestyle',instruction:'Desc 1-3'}),W("And then we'll go 8 times 15 underwater max. Push that.",8,15,{instruction:'UW MAX'})]),
  B('postset','Post-set',[W("post main set we'll just go a 600 with fins.",1,600,{equipment:['Fins']}),C('And we want to do 8 plus underwater kicks.')]),
  B('warmdown','Warm-down',[W('200 choice',1,200,{stroke:'Choice'})])];
(async()=>{const b=await chromium.launch({args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland',permissions:['microphone']});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install({time:new Date('2026-10-29T05:00:00+13:00')});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.intake&&window.MSOS4?.storageEngine?.ready,{timeout:30000});await p.waitForTimeout(600);
  await p.evaluate(({SPOKEN,STRUCTURED})=>{const M=window.MSOS4;if(M.awayInbox)M.awayInbox.maybePop=()=>{};M.intake.transcribe=async()=>({rawText:SPOKEN,structuredBlocks:STRUCTURED,structuredData:{}});M.sessionMethodology.tidyDictation=async()=>{window.__tidyCalled=true;return false;};},{SPOKEN,STRUCTURED});
  await p.evaluate(()=>window.MSOS4.actions.openNewSession({}));await p.waitForSelector('#coreSlot');
  await p.click('[data-core-tab="voice"]');await p.click('#coreStart');await p.waitForTimeout(1500);await p.click('#coreStop');
  await p.waitForFunction(()=>/laid out/.test(document.querySelector('#coreStatus')?.textContent||''),null,{timeout:10000});
  const box=await p.inputValue('#coreRaw');
  assert.doesNotMatch(box,/I think we'll go|And then we'll|Okay warm up/,`the box holds sets, not sentences:\n${box}`);
  assert.match(box,/6 x 100 Freestyle Desc 1-3 @1:40/);assert.match(box,/3 x 200 Freestyle Desc 1-3 @3:30/);assert.match(box,/8 x 20 Turn MAX @1:00/);
  assert.equal(await p.evaluate(()=>!!window.__tidyCalled),false,'already laid out set by set -- no second AI pass');
  assert.ok(await p.isVisible('#coreRaw'),'the box is showing after dictation');
  await p.click('#coreCreate');await p.waitForTimeout(500);
  const saved=await p.evaluate(()=>window.MSOS4.session.total(window.MSOS4.currentSession()));
  assert.equal(saved,600+150+600+160+600+120+600+200,`dictated session saved with every set: ${saved}`);
  // Edit -> make the pre-set 2 rounds -> apply: everything else stays
  await p.evaluate(()=>window.MSOS4.actions.openSessionEdit());await p.waitForSelector('#sessionEditText');
  const edit=await p.inputValue('#sessionEditText');
  assert.doesNotMatch(edit,/I think we'll go|And then we'll/,`Edit shows sets:\n${edit}`);
  assert.doesNotMatch(edit,/TOTAL \d+m/,'no app-written TOTAL line for an edit to contradict');
  const changed=edit.replace(/(PRE-?SET\n)([\s\S]*?)(\n\n)/i,(m,h,body,end)=>`${h}2 Rounds:\n${body.split('\n').map(l=>'  '+l).join('\n')}${end}`);
  await p.fill('#sessionEditText',changed);await p.waitForTimeout(400);await p.click('[data-save-session-edit]');await p.waitForTimeout(600);  const after=await p.evaluate(()=>window.MSOS4.session.total(window.MSOS4.currentSession()));
  assert.equal(after,saved+150,`only the pre-set changed (2 rounds): ${after}`);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('DICTATED_SESSION_EDIT_KEEPS_SETS_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
