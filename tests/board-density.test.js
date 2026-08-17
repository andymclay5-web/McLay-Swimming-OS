'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Evidence=require('../engines/evidence-retrieval.js');
const Attendance=require('../engines/attendance.js');
const Targets=require('../engines/targets.js');
const Adaptation=require('../engines/adaptation.js');
const Board=require('../engines/board-projection.js');
const Render=require('../ui/board-renderer.js');
let fails=0;function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const id={id:'density',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National','Development'],venue:'AquaGym'};
function renderer(src){const evidence=Evidence.create({sources:[{id:'empty',priority:1,trust:'verified',data:{athletes:[]}}]}),attendance=Attendance.create({storage:new Attendance.MemoryStorage(),evidence}),targets=Targets.create({evidence}),adaptation=Adaptation.create({evidence}),board=Board.create({truth:Truth,attendance,adaptation,targets}),session=Truth.parse(src,id);return{session,model:board.project(session),html:Render.renderBoard(board.project(session))}}
const tuesday=`WARM UP
4 x 300
200 Free
100 Reverse IM
15s Rest

PRE-SET
4 Rounds:
3 x 50 #1 @ 1:00
2 Drill
1 @ 200 Pace

12 x 50 Total

MAIN SET
400 Pull
Minimum Stroke Count
6 x 100 Freestyle Development
10s Rest
400 Paddles Only
Minimum Stroke Count
3 x 200 Development
10s Rest
4 x 100 IM Descend 1–4
@ 1:40 / 1:50
2 x 100 Paddles + Fins @ 2:00
1 Build
1 Fast

POST-SET
16 x 50 @ 1:15
8 x 50 Bands Only
4 Build
4 Descend 1–4
8 x 50 Swim
Descend 1–4 twice
#4 + #8 @ 100 Pace

WARM DOWN
200 Easy Choice
TOTAL 5400m`;

test('full 5400 session is nine visible set rows, not exploded child lines',()=>{
 const {model,html}=renderer(tuesday);assert.equal(model.totalDistance,5400);assert.equal((html.match(/class="msos-set-row"/g)||[]).length,9);assert.equal((html.match(/class="msos-phase"/g)||[]).length,2);assert(/4 ROUNDS/.test(html));
});

test('generated pattern reps are not duplicated as Board REPS detail',()=>{
 const {html}=renderer('Pre Set\n4 Rounds:\n3 x 50 #1 @ 1:00\n2 Drill\n1 @ 200 Pace');assert(/PATTERN/.test(html));assert(!/msos-detail-label">REPS/.test(html));
});

test('explicit rep references remain visible because they add information',()=>{
 const {html}=renderer('Post Set\n8 x 50 Swim\n#4 + #8 @ 100 Pace');assert(/msos-detail-label">REPS/.test(html));assert(/#4/.test(html)&&/#8/.test(html));
});

test('sticky bar labels live attendance count and includes T400 Times',()=>{
 const {html}=renderer('Main Set\n4 x 25 Max @1:00');assert(/Roll · 0/.test(html));assert(/T400 \/ Times/.test(html));
});

if(fails){console.error(`\n${fails} Board density regression(s) failed`);process.exit(1)}console.log('\nALL BOARD DENSITY REGRESSIONS PASS');
