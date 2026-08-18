'use strict';
const assert=require('assert');
const fs=require('fs');
const Truth=require('../engines/session-truth.js');
const Entities=require('../engines/entity-registry.js');
const Evidence=require('../engines/evidence-retrieval.js');
const Attendance=require('../engines/attendance.js');
const Targets=require('../engines/targets.js');
const Adaptation=require('../engines/adaptation.js');
const Board=require('../engines/board-projection.js');
const Render=require('../ui/board-renderer.js');
let fails=0;function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const id={id:'density',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National','Development'],venue:'AquaGym'};
function renderer(src){const sources=[{id:'empty',priority:1,trust:'verified',data:{athletes:[]}}],entities=Entities.create({sources}),evidence=Evidence.create({sources,entities}),attendance=Attendance.create({storage:new Attendance.MemoryStorage(),evidence:entities}),targets=Targets.create({evidence}),adaptation=Adaptation.create({evidence:entities}),board=Board.create({truth:Truth,attendance,adaptation,targets}),session=Truth.parse(src,id);return{session,model:board.project(session),html:Render.renderBoard(board.project(session))}}
function visibleSetCount(nodes=[]){return(nodes||[]).reduce((n,x)=>n+(x.kind==='set'?1:x.kind==='group'?visibleSetCount(x.items):0),0)}
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
test('full 5400 session is ten parent set rows with no exploded child work',()=>{const {model,html}=renderer(tuesday);assert.equal(model.totalDistance,5400);assert.deepEqual(model.blocks.map(b=>visibleSetCount(b.items)),[1,1,6,1,1]);assert.equal((html.match(/class="msos-set-row"/g)||[]).length,10);assert.equal((html.match(/class="msos-phase"/g)||[]).length,2);assert(/4 ROUNDS/.test(html))});
test('generated pattern reps are not duplicated as Board REPS detail',()=>{const {html}=renderer('Pre Set\n4 Rounds:\n3 x 50 #1 @ 1:00\n2 Drill\n1 @ 200 Pace');assert(/PATTERN/.test(html));assert(!/msos-detail-label">REPS/.test(html))});
test('explicit rep references remain visible because they add information',()=>{const {html}=renderer('Post Set\n8 x 50 Swim\n#4 + #8 @ 100 Pace');assert(/msos-detail-label">REPS/.test(html));assert(/#4/.test(html)&&/#8/.test(html))});
test('sticky bar labels live attendance count includes T400 Times and block jumps',()=>{const {html}=renderer(tuesday);assert(/Roll · 0/.test(html));assert(/T400 \/ Times/.test(html));assert(/msos-board-block-nav/.test(html));assert.equal((html.match(/href="#msos-board-block-/g)||[]).length,5)});
test('target chip shows compact source while retaining full evidence detail',()=>{const model={schema:'msos.board.v2',sessionId:'s',identity:{title:'Targets',squads:[]},totalDistance:600,validation:{totalMatches:true,warnings:[]},attendance:{here:2,athletes:[{id:'a',name:'Alex Hanson',label:'AH',status:'present'},{id:'b',name:'Alex Gibson',label:'AG',status:'present'}]},blocks:[{id:'b1',title:'Main set',context:{sessionId:'s',blockId:'b1'},distance:600,captures:{count:0,byType:{},items:[]},items:[{id:'set',kind:'set',context:{sessionId:'s',blockId:'b1',setId:'set',itemId:'set'},groupWork:{reps:6,distance:100,raw:'6 x 100 Free Development 10s rest',composition:[],pattern:[],repInstructions:[],cues:[]},phases:[],modifications:[],captures:{count:0,byType:{},items:[]},targets:[{athleteId:'a',athleteName:'Alex Hanson',label:'AH',status:'ok',seconds:87.642,sendOff:100,source:'Latest valid Freestyle T400 · 5:24.6'},{athleteId:'b',athleteName:'Alex Gibson',label:'AG',status:'ok',seconds:80,sendOff:95,source:'SCM 100 Freestyle PB'}]}]}]},html=Render.renderBoard(model);assert(/>T400</.test(html));assert(/>PB</.test(html));assert(/Latest valid Freestyle T400 · 5:24.6/.test(html));assert(/SCM 100 Freestyle PB/.test(html));assert(/Alex H/.test(html)&&/Alex G/.test(html))});
test('target CSS wraps compact chips instead of forcing a vertical swimmer list',()=>{const css=fs.readFileSync(require.resolve('../ui/board.css'),'utf8');assert(/\.msos-targets\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s.test(css));assert(/\.msos-target-row\s*\{[^}]*display:\s*inline-flex/s.test(css))});
if(fails){console.error(`\n${fails} Board density regression(s) failed`);process.exit(1)}console.log('\nALL BOARD DENSITY REGRESSIONS PASS');
