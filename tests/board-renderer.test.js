'use strict';
const assert=require('assert');
const fs=require('fs');
const Truth=require('../engines/session-truth.js');
const Evidence=require('../engines/evidence-retrieval.js');
const Attendance=require('../engines/attendance.js');
const Targets=require('../engines/targets.js');
const Adaptation=require('../engines/adaptation.js');
const Capture=require('../engines/capture-evidence.js');
const Board=require('../engines/board-projection.js');
const Render=require('../ui/board-renderer.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const identity={id:'render-session',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National','Development'],venue:'AquaGym',title:'Tuesday AM Board'};
function system(src){
 const evidence=Evidence.create({sources:[{id:'verified',priority:100,trust:'verified',data:{athletes:[{id:'mk',full_name:'McKenzie Drage',squad:'National',active:true,sex:'F'},{id:'molly',full_name:'Molly McKernan',squad:'Development',active:true,sex:'F'}],training_test_types:[{id:'tt',test_key:'t400_freestyle'}],training_test_results:[{id:'molly-t400',athlete_id:'molly',test_type_id:'tt',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true}],coach_results:[{id:'molly100',athlete_id:'molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:60,result_date:'2026-07-01'}]}}]});
 const attendance=Attendance.create({storage:new Attendance.MemoryStorage(),evidence,clock:()=>new Date('2026-08-18T05:30:00+12:00').toISOString()}),targets=Targets.create({evidence}),adaptation=Adaptation.create({evidence}),captures=Capture.create({storage:new Capture.MemoryStorage(),evidence,clock:()=>new Date('2026-08-18T05:40:00+12:00').toISOString()}),board=Board.create({truth:Truth,attendance,adaptation,targets,captures}),session=Truth.parse(src,identity);return{evidence,attendance,targets,adaptation,captures,board,session};
}
const fixture=`WARM UP
400 Choice

PRE-SET
2 Rounds:
300 Regeneration
200 Development
100 Overload

MAIN SET
2 Rounds:
4 x 25 #1 Build @0:45
4 x 25 #1, with 15m Max @0:45
8 x 25 Dive Start @100 Pace @2:00
6 x 12.5 Max @0:45
1 x 35 Dive Start
100 HBS
150 Scull

POST-SET
8 x 25 Fins @1:15 · 1 Underwater / 1 15m Max
4 x 100 Fins · 1 Kick / 1 Free · 20s rest
3 x 100 · 1 Pull / 1 Paddles / 1 Swim · 15s rest

WARM DOWN
200 Easy
TOTAL 4220m`;

test('renderer accepts only Board v2 projection',()=>{
 assert.throws(()=>Render.renderBoard({schema:'msos.board.v1'}),/msos\.board\.v2/);
});

test('4220 Board renders five compact blocks with grouped rounds',()=>{
 const {board,session}=system(fixture),html=Render.renderBoard(board.project(session));
 assert(/4,220m/.test(html));
 assert.equal((html.match(/class="msos-board-block"/g)||[]).length,5);
 assert((html.match(/2 ROUNDS/g)||[]).length>=2);
 assert(/Warm-up/.test(html)&&/Pre-set/.test(html)&&/Main set/.test(html)&&/Post-set/.test(html)&&/Warm-down/.test(html));
});

test('common work renders once and genuine modification sits in side rail',()=>{
 const {board,session,attendance}=system('Main Set\n400 Pull');attendance.mark(session,'mk','modified');attendance.mark(session,'molly','present');const html=Render.renderBoard(board.project(session));
 assert.equal((html.match(/400 Pull/g)||[]).length,1);
 assert.equal((html.match(/class="msos-mod-rail"/g)||[]).length,1);
 assert(/McKenzie Drage|MD/.test(html));
});

test('target is rendered directly under its exact set with set context attributes',()=>{
 const {board,session,attendance}=system('Main Set\n6 x 100 Free Development 10 sr');attendance.mark(session,'molly','present');const model=board.project(session),set=model.blocks[0].items[0],html=Render.renderBoard(model);
 assert(/msos-targets/.test(html));assert(/Latest valid Freestyle T400/.test(html));
 assert(html.includes(`data-item-id="${set.id}"`));assert(html.includes('data-board-action="edit"'));assert(html.includes('data-board-action="note"'));
});

test('sticky poolside actions keep Roll Capture Voice Photo Video Finish reachable',()=>{
 const {board,session}=system('Main Set\n4 x 25 Max @ 1:00'),html=Render.renderBoard(board.project(session));
 for(const action of ['roll','capture','voice','photo','video','finish'])assert(html.includes(`data-board-action="${action}"`),action);
 assert(/msos-board-sticky-actions/.test(html));
});

test('composition and pattern details stay beneath parent set rather than extra top-level rows',()=>{
 const {board,session}=system('Post Set\n4 x 100 Fins · 1 Kick / 1 Free · 20s rest'),html=Render.renderBoard(board.project(session));
 assert.equal((html.match(/class="msos-set-row"/g)||[]).length,1);assert(/PATTERN/.test(html));assert(/1 Kick/.test(html));assert(/1 Free/.test(html));
});

test('phase structure is nested under one 16x50 parent row',()=>{
 const {board,session}=system('Post Set\n16 x 50 @ 1:15\n8 x 50 Bands Only\n4 Build\n4 Descend 1-4\n8 x 50 Swim\nDescend 1-4 twice\n#4 + #8 @ 100 Pace'),html=Render.renderBoard(board.project(session));
 assert.equal((html.match(/class="msos-set-row"/g)||[]).length,1);assert.equal((html.match(/class="msos-phase"/g)||[]).length,2);assert(/Phase 1/.test(html)&&/Phase 2/.test(html));
});

test('linked evidence marker returns to exact Board line context',()=>{
 const {board,session,captures}=system('Main Set\n6 x 100 Free Development 10 sr'),b=session.blocks[0],item=b.items[0];captures.create(session,{type:'note',blockId:b.id,itemId:item.id,text:'Breakout held'});const html=Render.renderBoard(board.project(session));
 assert(/1 note/.test(html));assert(html.includes(`data-item-id="${item.id}"`));assert(/data-board-action="evidence"/.test(html));
});

test('renderer escapes coach text and never executes authored HTML',()=>{
 const model={schema:'msos.board.v2',sessionId:'s',identity:{title:'<script>alert(1)</script>',squads:[]},totalDistance:0,validation:{totalMatches:true,warnings:[]},attendance:{here:0,athletes:[]},blocks:[]},html=Render.renderBoard(model);
 assert(!html.includes('<script>alert(1)</script>'));assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('phone CSS stacks modification rail and keeps action bar sticky',()=>{
 const css=fs.readFileSync(require.resolve('../ui/board.css'),'utf8');
 assert(/position:\s*sticky/.test(css));assert(/@media\s*\(max-width:\s*720px\)/.test(css));assert(/\.msos-mod-rail\s*\{[^}]*grid-template-columns:/s.test(css));
});

if(fails){console.error(`\n${fails} Board renderer regression(s) failed`);process.exit(1)}
console.log('\nALL BOARD RENDERER REGRESSIONS PASS');
