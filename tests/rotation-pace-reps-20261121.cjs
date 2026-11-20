'use strict';
// Andy, Sat 21 Nov 2026: "if I have a set, let's say 12 times 50, one drill, one build, one at 200 pace, would that read
// that 200 pace as the rep within the 50, or will that read that as a whole new line now?" Agreed answer: it is the reps
// of the 12 x 50 -- rounds of drill / build / 200 pace -- and only the pace reps get the 200-pace target (the same rule
// as "Odd 200 Pace / Even Drill"). Proves every way he might write it reads the same, at 600m, with targets on reps
// 3, 6, 9 and 12 only; "#N" names rep N; and the lines that must not change still don't.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const WAYS=['12 x 50\n1 drill\n1 build\n1 @200 pace','12 x 50\n1 drill\n1 build\n1 200 pace','12 x 50 (1 drill, 1 build, 1 @200 pace)','12 x 50 1 drill, 1 build, 1 @200pace','12 x 50 @ 1:10\n#1 drill\n#2 build\n#3 200 pace','12 x 50\n1 x 50 drill\n1 x 50 build\n1 x 50 @200 pace'];
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.parser&&window.MSOS4?.targets?.forItem,{timeout:30000});
  const read=src=>p.evaluate(src=>{const M=window.MSOS4,s=M.parser.parse('MAIN SET\n'+src,{id:'rot',course:'SCM'}),items=s.blocks[0].items,i=items[0];const ath={id:'a',full_name:'Test Swimmer',sex:'M'};
    const st={athletes:[ath],coachResults:[{athlete_id:'a',distance:200,stroke:'Freestyle',course:'SCM',result_seconds:120,result_date:'2026-10-01'}]};let r=null;try{r=M.targets.forItem(s,i,ath,st)}catch(e){r={error:e.message}}
    return{items:items.length,metres:items.reduce((n,x)=>n+Math.max(1,Number(x.reps)||1)*(Number(x.distance)||0),0),rows:(r?.rows||[]).map(x=>x.status),status:r?.status,error:r?.error,reps:(i.repInstructions||[]).map(x=>x.raceIntent?'pace':x.drill?'drill':x.label)}},src);
  for(const w of WAYS){const r=await read(w);
    assert.equal(r.items,1,`${JSON.stringify(w)}: one set, nothing split off`);assert.equal(r.metres,600,JSON.stringify(w));
    assert.deepEqual(r.reps,['drill','build','pace','drill','build','pace','drill','build','pace','drill','build','pace'],`${JSON.stringify(w)}: ${JSON.stringify(r.reps)}`);
    assert.equal(r.status,'rep_race',`${JSON.stringify(w)}: ${JSON.stringify(r)}`);
    assert.deepEqual(r.rows.map((x,k)=>x==='ok'?k+1:null).filter(Boolean),[3,6,9,12],`${JSON.stringify(w)}: targets only on the pace reps: ${JSON.stringify(r.rows)}`);}
  // unchanged: a whole race-pace set, odd/even, and 1 build / 1 fast
  const whole=await read('4x50 #1 @200pace @ 1:15');assert.deepEqual(whole.reps,[]);
  const oe=await read('4 x 50 Freestyle @ 1:15 — Odd 200 Pace / Even Drill');assert.deepEqual(oe.rows,['ok','none','ok','none']);
  const bf=await read('2x100 #1\n1 build, 1 fast @ 2:00');assert.equal(bf.items,1);assert.deepEqual(bf.reps,[]);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('ROTATION_PACE_REPS_PASS',WAYS.length,'wordings');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
