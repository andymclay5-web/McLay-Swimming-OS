'use strict';
// Andy at a meet, Fri 30 Oct 2026: swimmer cards for "Cave, Thomas" and "Callow, Matthew" showed PB LCM —, Points —
// and "No stored race history" although MSOS holds their LCM results. The programme lists swimmers "Last, First", and
// the card looked for a swimmer called "Cave Thomas".
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.meetProgramBA?.matchAthleteName&&window.MSOS4?.storageEngine?.ready,{timeout:30000});
  const r=await p.evaluate(()=>{const M=window.MSOS4;M.state.athletes=[{id:'tc',full_name:'Thomas Cave',active:true},{id:'mc',full_name:'Matthew Callow',active:true},{id:'wc',full_name:'William Callow',active:true}];
    const m=n=>M.meetProgramBA.matchAthleteName(n)?.id||null;return{a:m('Cave, Thomas'),b:m('Callow, Matthew'),c:m('Thomas Cave'),d:m('Callow, Sam'),e:m('CAVE, Thomas')};});
  assert.deepEqual(r,{a:'tc',b:'mc',c:'tc',d:null,e:'tc'});
  assert.deepEqual(errors,[],errors.join('\n'));console.log('MEET_LAST_FIRST_NAMES_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
