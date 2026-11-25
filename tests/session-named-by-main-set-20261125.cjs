'use strict';
// 25 Nov 2026 (Andy: Tue 24 Nov PM National -- brief Anaerobic Power, main set race pace, Board "on brief" -- was
// listed in the week's sessions as "Aerobic Capacity"). Proves a session is named by its main set (as the Board checks
// it against the brief), and by the whole session only when it has no main set.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({serviceWorkers:'block'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.hubPanels?.sessionFocus&&window.MSOS4?.dosageEngine?.session,{timeout:30000});
  const r=await p.evaluate(()=>{const M=window.MSOS4;
    const tue=M.parser.parse(['WARM UP','400 Choice','8 x 50 (4 Kick / 4 Drill) 10s rest','4 x 100 IM Desc 1-4 10s rest','PRE SET','3 Rounds','4 x 50 @ 1:15 1 Build / 1 Middle 20m MAX / 1 First 15m MAX / 1 Easy','4 Rounds','3 x 50 #1-2 Drill #3 @200 Pace','MAIN SET','6 x 25 @ 1:15 #1 Build #2-6 @100 Pace','100 Scull','4 x 50 @ 2:45 #1 Build #2-4 @100 Pace','100 Scull','4 x 50 @200 Pace','200 Easy @ 4:15','WARM DOWN','200 Easy'].join('\n'),{date:'2026-11-24',dayPart:'PM',squads:['National']});
    const noMain=M.parser.parse('WARM UP\n800 Free Development\n4 x 50 @200 Pace',{date:'2026-11-23',dayPart:'AM',squads:['National']});
    return{tue:M.hubPanels.sessionFocus(tue),noMain:M.hubPanels.sessionFocus(noMain),blocks:tue.blocks.map(x=>x.type||x.title)};});
  assert.equal(r.tue,'Anaerobic Power','named by its race-pace main set, not the aerobic warm-up: '+JSON.stringify(r));
  assert.equal(r.noMain,'Aerobic Capacity','no main set: the whole session decides');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('SESSION_NAMED_BY_MAIN_SET_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
