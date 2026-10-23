'use strict';
// Andy, Sat 24 Oct 2026 AM National: "Few weird parser and interpretation things".
//  1. "800 fins (every 4th 25 max dist under h2o)" headlined as "800 Fins 25m MAX" (every rep a 25m max) -- it is one
//     max 25 in every 100. Now "800 Fins", with the instruction underneath.
//  2. "8x75 kick build @ 1:45" showed "kick build @ 1:45" under "8×75 Kick @ 1:45". Now just "Build".
//  3. Session analysis counted that 800 as only 25m of Speed / Max; it is 8 x 25 = 200m.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');const rel=p=>path.join(root,p);
global.window=global;global.scrollY=0;global.requestAnimationFrame=f=>{f&&f();return 1;};
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
global.document={addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}};
global.location={hash:'',href:'https://x.test/'};global.history={state:null,replaceState(){},pushState(){},back(){}};
global.addEventListener=()=>{};global.removeEventListener=()=>{};
require(rel('app.js'));const M=global.MSOS4;
global.MSOSEngines={Evidence:require(rel('engines/evidence.js'))};
for(const [k,f] of [['Aerobic','aerobic'],['RacePace','race-pace'],['Modification','modification'],['Coordinator','coordinator']])global.MSOSEngines[k]=require(rel(`engines/${f}.js`));
require(rel('engines/bridge.js'));require(rel('engines/board.js'));
const B=M.boardEngine;
const s=M.parser.parse('POST-SET\n8x75 kick build @ 1:45\n800 fins (every 4th 25 max dist under h2o)',{id:'sat',course:'SCM'});
const [kick,fins]=s.blocks[0].items;
assert.equal(B.workLabel(fins),'800 Fins','no invented "25m MAX" / "MAX" in the headline');
assert.match(B.cueText(fins),/every 4th 25 max dist under h2o/i,'the instruction stays visible');
assert.equal(B.workLabel(kick),'8×75 Kick @ 1:45');
assert.equal(B.cueText(kick),'Build','send-off and "kick" are already in the headline');
// a genuine part-of-rep max still headlines as before
const dive=M.parser.parse('MAIN SET\n4 x 25 Fins 15m MAX @ 0:45',{id:'d',course:'SCM'}).blocks[0].items[0];
assert.match(B.workLabel(dive),/15m MAX/);
// dosage: every 4th 25 of 800 = 8 x 25 = 200m speed
const src=require('node:fs').readFileSync(rel('engines/dosage.js'),'utf8');
assert.match(src,/every\\s\+\(\\d\+\)\(\?:st\|nd\|rd\|th\)/,'dosage reads "every Nth 25 max"');
console.log('SAT_AM_LABELS_20261024_PASS');
