'use strict';
const assert=require('assert');
const App=require('../rebuild/app-composition.js');
const Schedule=require('../engines/session-schedule.js');
const Lifecycle=require('../engines/session-lifecycle.js');
const Attendance=require('../engines/attendance.js');
const Capture=require('../engines/capture-evidence.js');
const Delivered=require('../engines/delivered-session.js');
const Timing=require('../engines/timing.js');
const Protocol=require('../engines/test-protocol.js');
const TestResults=require('../engines/test-result-input.js');
const RuntimeAdapter=require('../assembly/poolside-runtime-adapter.js');
const PoolsideActions=require('../rebuild/poolside-actions.js');
const CommandOwners=require('../rebuild/board-command-owners.js');
const BoardController=require('../ui/board-controller.js');

let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
let tick=0;const clock=()=>`2026-08-18T18:${String(tick++%60).padStart(2,'0')}:00+12:00`;
const calendar={calendar_id:'aug26',coverage_start:'2026-08-01',coverage_end:'2026-08-31',published_at:'2026-08-01T00:00:00+12:00',dates:[{date:'2026-08-18',status:'training',sessions:[{day_part:'PM',start_time:'17:30',end_time:'19:30',squads:['National'],venue:'AquaGym',pool_course:'SCM'},{day_part:'PM',start_time:'17:40',end_time:'19:10',squads:['Development'],venue:'AquaGym',pool_course:'SCM'}],events:[]}]};
const source=`WARM UP\n400 Choice\nMAIN SET\n400 Pull\n6 x 100 Freestyle Development\n10s Rest\n4 x 25 Free @ 100 Pace\nWARM DOWN\n200 Easy\nTOTAL: 1,700m`;
function app(){return App.create({scheduleStorage:new Schedule.MemoryStorage(),lifecycleStorage:new Lifecycle.MemoryStorage(),attendanceStorage:new Attendance.MemoryStorage(),captureStorage:new Capture.MemoryStorage(),deliveryStorage:new Delivered.MemoryStorage(),timingStorage:new Timing.MemoryStorage(),protocolStorage:new Protocol.MemoryStorage(),testResultStorage:new TestResults.MemoryStorage(),calendarSources:[calendar],clock,squads:[{id:'squad-national',name:'National',active:true},{id:'squad-development',name:'Development',active:true}],profiles:[{athlete_id:'mk',volume_ratio:.75,return_to_start:true}],evidenceSources:[{id:'verified',priority:100,trust:'verified',data:{athletes:[{id:'mk',full_name:'McKenzie Drage',squad:'National',active:true},{id:'molly',full_name:'Molly McKernan',squad:'Development',active:true}],training_test_types:[{id:'tt',test_key:'t400_freestyle'}],training_test_results:[{id:'molly-t',athlete_id:'molly',test_type_id:'tt',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true},{id:'mk-t',athlete_id:'mk',test_type_id:'tt',result_seconds:450.1,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true}]}}]})}
function accepted(a){const begun=a.beginFromSlots(a.slotsForDate('2026-08-18').map(x=>x.id),{title:'Tuesday PM'});a.updateDraft(begun.draft.id,{source});return a.acceptDraft(begun.draft.id)}
function findSet(session,pred){for(const b of session.blocks||[]){const stack=[...(b.items||[])];while(stack.length){const n=stack.shift();if(n?.kind==='set'&&pred(n))return{block:b,item:n};if(n?.kind==='group')stack.unshift(...(n.items||[]))}}return null}
class FakeRoot{constructor(){this.handlers={}}addEventListener(type,fn){this.handlers[type]=fn}removeEventListener(type){delete this.handlers[type]}click(dataset){const target={dataset,closest:sel=>sel==='[data-board-action]'?target:null};return this.handlers.click({target,preventDefault(){}})}}
function harness(){const a=app(),acc=accepted(a),runtime=RuntimeAdapter.create({app:a}),root=new FakeRoot();let panel=null,refreshes=0;const actions=PoolsideActions.create({runtime,onChange:()=>refreshes++,present:x=>(panel=x,x)}),owners=CommandOwners.create({runtime,openers:actions.openers()}),controller=BoardController.create({root,commands:owners.commands()}).bind();return{a,acc,runtime,root,controller,panel:()=>panel,refreshes:()=>refreshes}}

console.log('Assembly Board action integration');
test('literal Roll Board click opens exact selected session and marks attendance through unified portal',()=>{const h=harness(),sid=h.acc.record.id;h.root.click({boardAction:'roll',sessionId:sid});const p=h.panel();assert.strictEqual(p.type,'roll');p.mark('molly','present');assert.strictEqual(h.a.boardForSession(sid).attendance.here,1);assert.strictEqual(h.refreshes(),1)});
test('literal Times Board click returns latest verified T400 from same composition',()=>{const h=harness(),sid=h.acc.record.id;h.root.click({boardAction:'times',sessionId:sid});const p=h.panel(),answer=p.t400('molly',{mode:'latest'});assert.strictEqual(p.type,'times');assert.strictEqual(answer.status,'ok');assert.strictEqual(answer.seconds,324.6)});
test('literal group Edit Board click revises canonical current truth and keeps original plan immutable',()=>{const h=harness(),sid=h.acc.record.id,rec=h.a.session(sid),found=findSet(rec.current,x=>x.zone==='Development'),before=JSON.stringify(rec.originalPlan);h.root.click({boardAction:'edit',sessionId:sid,blockId:found.block.id,itemId:found.item.id});h.panel().save({reps:5},{note:'deck'});assert.strictEqual(h.a.boardForSession(sid).totalDistance,1600);assert.strictEqual(JSON.stringify(h.a.session(sid).originalPlan),before)});
test('literal swimmer Edit Board click writes only Adaptation override',()=>{const h=harness(),sid=h.acc.record.id;h.a.markAttendance(sid,'mk','modified');const rec=h.a.session(sid),found=findSet(rec.current,x=>x.distance===400&&/Pull/i.test(x.raw||'')),before=JSON.stringify(rec.current);h.root.click({boardAction:'edit-athlete',sessionId:sid,blockId:found.block.id,itemId:found.item.id,athleteId:'mk'});const p=h.panel();assert.strictEqual(p.type,'editAthleteSet');p.save({distance:250},{reason:'deck'});assert.strictEqual(h.runtime.adaptationFor(found.item.id,'mk').work.distance,250);assert.strictEqual(JSON.stringify(h.a.session(sid).current),before)});
test('literal Note Board click saves evidence at exact Board point and rerender can retrieve it',()=>{const h=harness(),sid=h.acc.record.id,rec=h.a.session(sid),found=findSet(rec.current,x=>x.zone==='Development');h.root.click({boardAction:'note',sessionId:sid,blockId:found.block.id,itemId:found.item.id});const p=h.panel();assert.strictEqual(p.type,'capture');p.save({type:'note',text:'Held shape',athleteIds:['molly']});assert.strictEqual(h.a.evidenceAt(sid,{blockId:found.block.id,itemId:found.item.id,athleteId:'molly'}).length,1)});
test('literal Finish Board click does not finish until explicit confirm, then writes Delivered Session once',()=>{const h=harness(),sid=h.acc.record.id;h.root.click({boardAction:'finish',sessionId:sid});const p=h.panel();assert.strictEqual(p.type,'finish');assert.strictEqual(h.a.deliveryForSession(sid),null);p.confirm({point:{full:true},note:'done'});assert.strictEqual(h.a.deliveryForSession(sid).delivered_distance,1700)});
test('stale Board action still fails closed when selected session identity no longer matches displayed context',()=>{const h=harness();assert.throws(()=>h.root.click({boardAction:'roll',sessionId:'wrong-session'}),/session mismatch/i)});
if(failures){console.error(`\n${failures} assembly Board action regression(s) failed`);process.exit(1)}
console.log('\nALL ASSEMBLY BOARD ACTION INTEGRATION REGRESSIONS PASS');
