'use strict';
// Andy's Fri 16 Oct 2026 AM session ("what parse issues do you see"). Proves the Board headline and small text now
// read the way it was written: send-offs under a minute as m:ss ("@ 0:30", not "@ 30"); "(15 max)" / "first 15m max"
// shown as "15m MAX", not the whole rep MAX; a bare distance keeps its word ("200 Easy"); the small text no longer
// repeats the headline. Distances and the stored session are unchanged (3,900m).
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SRC=`WARM-UP\n400 Free\n4 x 100 Choice 15sR\n8 x 50 #1 @ 1:15\nOdd Minimum Stroke Count / Even Build\n\nPRE-SET\n4 x 25 Fins @ 1:30\n15m MAX / Easy Finish\n200 Easy\nFull Recovery\n4 x 50 (Dive Start first 15m max)\n400 easy choice\n\nMAIN SET\n8 x 12.5 Bands Only MAX @0:30\n200 sculling\n8 x 25 (15 max) @ 0:50\n200 drill\n8 x 12.5 kick MAX @ 0:30\n\nPOST-SET\n800 Fins & Paddles\nMinimum Stroke Count\n\nWARM-DOWN\n200 easy\nTOTAL 3900m`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.boardEngine&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
  const r=await p.evaluate(src=>{const M=window.MSOS4,B=M.boardEngine,s=M.parser.parse(src,{date:'2026-10-16',dayPart:'AM',squads:['National']});const rows={};for(const bl of s.blocks)for(const it of bl.items)if(it.kind==='set')rows[it.raw]=[B.workLabel(it),B.cueText(it)];return{rows,total:B.sessionDistance(s),blocks:s.blocks.map(x=>B.blockDistance(x))};},SRC);
  const L=k=>r.rows[k];
  assert.equal(r.total,3900);assert.deepEqual(r.blocks,[1200,900,800,800,200]);
  assert.deepEqual(L('8 x 12.5 Bands Only MAX @0:30'),['8×12.5 Bands MAX @ 0:30',''],'m:ss send-off, no repeated line');
  assert.deepEqual(L('8 x 25 (15 max) @ 0:50'),['8×25 15m MAX @ 0:50',''],'15m MAX, not the whole 25');
  assert.deepEqual(L('8 x 12.5 kick MAX @ 0:30'),['8×12.5 Kick MAX @ 0:30','']);
  assert.equal(L('4 x 50 (Dive Start first 15m max)')[0],'4×50 15m MAX');
  assert.deepEqual(L('200 Easy'),['200 Easy','Full Recovery'],'200 keeps "Easy"');
  assert.deepEqual(L('200 sculling'),['200 sculling','']);assert.deepEqual(L('200 drill'),['200 drill','']);
  assert.deepEqual(L('400 Free'),['400 Fr',''],'no "Free" under "400 Fr"');
  assert.deepEqual(L('8 x 50 #1 @ 1:15'),['8×50 #1 @ 1:15','Odd Minimum SC / Even Build'],'unchanged over a minute');
  assert.deepEqual(L('4 x 25 Fins @ 1:30'),['4×25 Fins @ 1:30','15m MAX / Easy Finish']);
  assert.deepEqual(errors,[]);console.log('BOARD_LABELS_FRI_AM_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
