'use strict';
// Andy, Thu 5 Nov 2026 05:10, voice-written AM session: the Board read 44,200m. "3 Rounds:" above "3 x 200 ..."
// (and 16 Rounds / 16 x 50, 12 Rounds / 12 x 200) multiplied the set by its own rep count: 1,800 + 12,800 + 28,800.
// The Rounds line only restates the reps, so the session is 600 + 800 + 2,400 + 800 = 4,600m. A real
// "2 Rounds:" over different sets still repeats them.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SESSION=`WARM-UP
3 Rounds:
  3 x 200 Warm-up: 3 x 200 — 1 Free, 1 IM, 1 Choice 15sR
1 Free
2 IM
3 Choice

PRE-SET
16 Rounds:
  16 x 50 16 x 50 kick, on 1:15 75sR
First subgroup: 4 descending (1-4)
Second subgroup: 4 build

MAIN SET
12 Rounds:
  12 x 200 12 x 200 Free on 3:45 — descend 1 to 3; descending to max effort 225sR

POST-MAIN
800 800 pull, minimum stroke count

WARM-DOWN
Return to warm down — distance not specified`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.parser,{timeout:30000});await p.waitForTimeout(300);
  const r=await p.evaluate(t=>{const M=window.MSOS4,S=M.sessionMath||M.S||Object.values(M).find(v=>v&&typeof v.itemDistance==='function');
    const s=M.parser.parse(t,{id:'thu',date:'2026-11-05',dayPart:'AM',squads:['National'],course:'SCM'});
    const blockM=b=>(b.items||[]).reduce((n,x)=>n+S.itemDistance(x),0);
    const real=M.parser.parse('MAIN SET\n2 Rounds:\n4 x 100 Free\n2 x 50 Choice',{id:'real',date:'2026-11-05',dayPart:'AM'});
    return{blocks:s.blocks.map(blockM),total:s.blocks.reduce((n,b)=>n+blockM(b),0),real:blockM(real.blocks[0])};},SESSION);
  assert.deepEqual(r.blocks.slice(0,4),[600,800,2400,800],JSON.stringify(r));
  assert.equal(r.total,4600);
  assert.equal(r.real,1000,'a real 2 Rounds over two different sets still repeats');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('THU_AM_ROUNDS_RESTATED_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
