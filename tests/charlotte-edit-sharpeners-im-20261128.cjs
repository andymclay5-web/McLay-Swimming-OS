'use strict';
// 28 Nov 2026 (Andy, Sat AM, photo of the Board + his modified-lane whiteboard: "tried 3 times to change Charlotte's
// 16x100 to 16x50 but it's not saving"; "the 400 IM in warm up isn't carrying over"; sharpeners -- "bursts of 4 to 6 max
// strokes I either prescribe a number of them or a distance to complete of them"). Proves:
//  - an edited shape saves exactly as typed even where a value matches the automatic version (her automatic distance
//    was already 50, so 50 was dropped and 16 reps landed on the squad's 100s);
//  - her own send-off isn't repeated above her own line;
//  - "100 sharpeners" between 400s is 100 m of its own (session 4,700 m), kept whole for a modified swimmer;
//    "6 sharpeners" is a count (no metres);
//  - a single 400 IM shortens to a whole 200 IM for Charlotte.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SRC='WARM-UP\n400 fr\n100 sharpeners\n400 IM\n100 sharpeners\n400 #1 drill-swim\n100 sharpeners\n400 choice\n\nMAIN SET\n12 x 100 free build @ 1:45\n200 scull-swim\n8x100 kick fins build 1.45\n200 drill\n4x100 bands build @ 2:00';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({serviceWorkers:'block',viewport:{width:390,height:900}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.modificationEditUI?.open,{timeout:30000});await p.waitForTimeout(1000);
  const setup=()=>p.evaluate(src=>{const M=window.MSOS4,E=window.MSOSEngines;
    const s=M.parser.parse(src,{date:new Date().toISOString().slice(0,10),dayPart:'AM',squads:['National']});s.id='sat-am';M.store.putSession(M.state,s);M.state.settings.selectedSessionId=s.id;
    const ch={id:'athlete-charlotte-murphy',full_name:'Charlotte Murphy',squad:'National',active:true,sex:'F'},sq={id:'sq1',full_name:'Squad Swimmer',squad:'National',active:true};
    M.state.athletes=[ch,sq];M.state.adaptationProfiles=[{athlete_id:ch.id,default_volume_ratio:0.6,default_cycle_multiplier:1.15,active:true,activation_mode:'always'}];
    M.state.attendance=[ch,sq].map(a=>({session_id:s.id,athlete_id:a.id,status:'present'}));M.state.adaptationOverrides=[];M.state.settings.boardFocusMode=false;
    const items=s.blocks.flatMap(x=>x.items||[]),ad=it=>M.boardEngine.workLabel(E.Modification.adaptItem(it,ch,M.state,s));
    const count=M.parser.parse('WARM UP\n400 fr\n6 sharpeners\n400 choice',{date:'2026-11-28',dayPart:'AM',squads:['National']});
    // her automatic distance on the 12 x 100 is made 50 here, as her evidence made it on the phone
    const main=items.find(x=>x.reps===12);const real=E.Modification.adaptItem;E.Modification.adaptItem=(it,a,st,se)=>{const o=real(it,a,st,se);const ov=(st?.adaptationOverrides||[]).some(x=>x.itemId===it.id&&x.athleteId===a.id&&x.active!==false);if(it.id===main.id&&a.id===ch.id&&!ov){o.distance=50;o.reps=7;}return o;};
    M.nav.show('board');M.ui.renderCurrent();
    return{total:M.session.total(s),sharp:items.filter(x=>/sharpeners/.test(x.raw)).map(x=>[x.kind,x.distance,ad(x)]),im:ad(items.find(x=>x.raw==='400 IM')),countTotal:M.session.total(count),speed:M.dosageEngine.session(M.parser.parse('WARM UP\n100 sharpeners',{date:'2026-11-28',dayPart:'AM',squads:['National']})).systems['Speed / Max'].metres,group:M.dosageEngine.coachLabel('Speed / Max'),mainId:main.id};},SRC);
  let r=null;for(let k=0;k<3&&!r;k++){try{r=await setup()}catch(e){if(!/context was destroyed|navigation/i.test(String(e.message)))throw e;await p.waitForFunction(()=>window.MSOS4?.modificationEditUI?.open,{timeout:30000});await p.waitForTimeout(1500)}}
  assert.equal(r.total,4700,'three 100 sharpeners count');
  assert.deepEqual(r.sharp,[['set',100,'100 sharpeners'],['set',100,'100 sharpeners'],['set',100,'100 sharpeners']],'their own sets, kept whole for Charlotte');
  assert.equal(r.countTotal,800,'"6 sharpeners" is a number of bursts, no metres');
  assert.equal(r.im,'200 IM');
  // Andy: "so sharpeners will be logged as top end speed too"
  assert.equal(r.speed,100,'sharpeners are top-end speed');assert.equal(r.group,'Anaerobic Capacity');
  await p.evaluate(id=>window.MSOS4.modificationEditUI.open(id,'athlete-charlotte-murphy'),r.mainId);await p.waitForSelector('#modEditReps');
  assert.equal(await p.$eval('#modEditDistance',x=>x.value),'50');
  await p.fill('#modEditReps','16');await p.fill('#modEditDistance','50');await p.fill('#modEditCycle','1:15');await p.click('[data-mod-edit-save]');
  await p.waitForFunction(()=>(window.MSOS4.state.adaptationOverrides||[]).length===1,null,{timeout:5000});
  const patch=await p.evaluate(()=>window.MSOS4.state.adaptationOverrides[0].patch);
  assert.equal(patch.reps,16);assert.equal(patch.distance,50,'50 saved even though it matched the automatic distance: '+JSON.stringify(patch));assert.equal(patch.cycleSeconds,75);
  await p.waitForTimeout(800);
  const cell=await p.evaluate(id=>{const M=window.MSOS4,E=window.MSOSEngines,s=M.currentSession(),it=M.boardEngine.findItem(s,id),a=M.state.athletes[0];return M.boardEngine.workLabel(E.Modification.adaptItem(it,a,M.state,s))},r.mainId);
  assert.equal(cell,'16×50 Fr @ 1:15');
  const txt=(await p.$eval('#boardView',e=>e.innerText)).replace(/\s+/g,' ');
  assert.ok(!/@ 1:15 16×50/.test(txt),'her send-off is not repeated above her own line');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('CHARLOTTE_EDIT_SHARPENERS_IM_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
