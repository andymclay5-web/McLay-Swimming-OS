'use strict';
const assert=require('assert');
const App=require('../rebuild/app-composition.js');
const Portal=require('../rebuild/engine-portal.js');
const Schedule=require('../engines/session-schedule.js');
const Lifecycle=require('../engines/session-lifecycle.js');
const Attendance=require('../engines/attendance.js');
const Capture=require('../engines/capture-evidence.js');

let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
let tick=0;const clock=()=>`2026-08-18T06:${String(tick++%60).padStart(2,'0')}:00+12:00`;
const calendar={calendar_id:'aug26',title:'AquaGym August',coverage_start:'2026-08-01',coverage_end:'2026-08-31',published_at:'2026-08-01T00:00:00+12:00',rules:{empty_date_means_no_training:true},dates:[{date:'2026-08-18',status:'training',sessions:[{day_part:'AM',start_time:'05:20',end_time:'07:20',squads:['National'],venue:'AquaGym',pool_course:'SCM'},{day_part:'AM',start_time:'05:30',end_time:'07:00',squads:['Development'],venue:'AquaGym',pool_course:'SCM'}],events:[]}]};
const source=`WARM UP\n400 Choice\nMAIN SET\n400 Pull\n6 x 100 Freestyle Development\n10s Rest\n4 x 25 Free @ 100 Pace\nWARM DOWN\n200 Easy\nTOTAL: 1,700m`;
function fixture(stores={}){return App.create({
 scheduleStorage:stores.schedule||new Schedule.MemoryStorage(),lifecycleStorage:stores.lifecycle||new Lifecycle.MemoryStorage(),attendanceStorage:stores.attendance||new Attendance.MemoryStorage(),captureStorage:stores.capture||new Capture.MemoryStorage(),clock,calendarSources:[calendar],
 squads:[{id:'squad-national',name:'National',active:true},{id:'squad-development',name:'Development',active:true}],
 profiles:[{athlete_id:'mk',volume_ratio:0.75,return_to_start:true}],
 evidenceSources:[{id:'verified',priority:100,trust:'verified',data:{athletes:[{id:'mk',full_name:'McKenzie Drage',squad:'National',active:true,sex:'F'},{id:'molly',full_name:'Molly McKernan',squad:'Development',active:true,sex:'F'}],training_test_types:[{id:'tt',test_key:'t400_freestyle'}],training_test_results:[{id:'molly-t',athlete_id:'molly',test_type_id:'tt',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true},{id:'mk-t',athlete_id:'mk',test_type_id:'tt',result_seconds:450.1,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true}],coach_results:[{id:'molly100',athlete_id:'molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:60,result_date:'2026-07-01'}]}}]
})}
function buildAccepted(app){const slots=app.slotsForDate('2026-08-18'),begun=app.beginFromSlots(slots.map(x=>x.id),{title:'Tuesday AM',inputMode:'text'});app.updateDraft(begun.draft.id,{source});return app.acceptDraft(begun.draft.id)}
function findBoardSet(board,pred){for(const block of board.blocks||[])for(const item of block.items||[]){if(item.kind==='set'&&pred(item))return item;if(item.kind==='group')for(const child of item.items||[])if(child.kind==='set'&&pred(child))return child}return null}

console.log(`App Composition ${App.VERSION}`);

test('one sealed portal contains Calendar intake and Coach Board owner graph',()=>{const app=fixture(),services=Object.fromEntries(app.graph.services.map(x=>[x.id,x]));for(const id of ['session-schedule','session-lifecycle','session-truth','session-intake-flow','attendance','targets','adaptation','capture-evidence','board-projection','calendar-surface','coach-board-surface','app-shell'])assert(services[id],`missing ${id}`);assert.strictEqual(app.portal.snapshot().sealed,true);assert.throws(()=>app.portal.register({id:'late-owner'}),e=>e instanceof Portal.PortalError&&e.code==='PORTAL_SEALED')});

test('Calendar accepted session is the exact canonical session projected by Board',()=>{const app=fixture(),accepted=buildAccepted(app),occ=app.occurrenceForSession(accepted.record.id),board=app.boardForSession(accepted.record.id);assert.strictEqual(occ.sessionId,accepted.record.id);assert.strictEqual(occ.squadEntries.find(x=>x.squadId==='squad-development').startOffsetMinutes,10);assert.strictEqual(board.sessionId,accepted.record.id);assert.strictEqual(board.totalDistance,1700);assert.strictEqual(app.session(accepted.record.id).current.id,board.sessionId)});

test('Roll command and Board read travel through the same portal and exact accepted session',()=>{const app=fixture(),accepted=buildAccepted(app);app.markAttendance(accepted.record.id,'molly','present');const board=app.boardForSession(accepted.record.id);assert.strictEqual(board.attendance.here,1);assert.strictEqual(board.attendance.athletes[0].name,'Molly McKernan');const trail=app.portal.auditTrail();assert(trail.some(x=>x.caller==='coach-board-surface'&&x.target==='attendance'&&x.operation==='mark'));assert(trail.some(x=>x.caller==='board-projection'&&x.target==='attendance'&&x.operation==='summary'))});

test('Target and adaptation remain delegated while Calendar schedule truth stays unchanged',()=>{const app=fixture(),accepted=buildAccepted(app),before=JSON.stringify(app.occurrenceForSession(accepted.record.id));app.markAttendance(accepted.record.id,'molly','present');app.markAttendance(accepted.record.id,'mk','modified');const board=app.boardForSession(accepted.record.id),dev=findBoardSet(board,x=>x.groupWork?.zone==='Development'),pull=findBoardSet(board,x=>x.groupWork?.distance===400&&/Pull/i.test(x.groupWork?.raw||''));assert(dev&&dev.targets.some(x=>x.athleteId==='molly'&&x.status==='ok'));assert(pull&&pull.modifications.some(x=>x.athleteId==='mk'));assert.strictEqual(JSON.stringify(app.occurrenceForSession(accepted.record.id)),before)});

test('Capture writes exact Board point through same portal without editing canonical session',()=>{const app=fixture(),accepted=buildAccepted(app),board0=app.boardForSession(accepted.record.id),dev=findBoardSet(board0,x=>x.groupWork?.zone==='Development'),block=board0.blocks.find(b=>(b.items||[]).some(x=>x.id===dev.id)),before=JSON.stringify(app.session(accepted.record.id).current);app.capture(accepted.record.id,{type:'note',blockId:block.id,itemId:dev.id,athleteIds:['molly'],text:'Held shape'});const board=app.boardForSession(accepted.record.id),row=findBoardSet(board,x=>x.id===dev.id);assert.strictEqual(row.captures.count,1);assert.strictEqual(JSON.stringify(app.session(accepted.record.id).current),before)});

test('application shell cannot bypass surfaces to query or mutate coaching engines',()=>{const app=fixture();for(const [kind,target,op] of [['query','session-schedule','day'],['query','session-lifecycle','selected'],['query','board-projection','project'],['command','attendance','mark'],['command','session-lifecycle','createDraft']])assert.throws(()=>app.shell[kind](target,op,{args:[]}),e=>e instanceof Portal.PortalError&&e.code==='CALL_NOT_ALLOWED')});

test('portal audit proves schedule-to-session-to-board lineage without storing workout or swimmer payloads',()=>{const app=fixture(),accepted=buildAccepted(app);app.markAttendance(accepted.record.id,'molly','present');app.boardForSession(accepted.record.id);const trail=app.portal.auditTrail(),json=JSON.stringify(trail);assert(trail.some(x=>x.caller==='session-intake-flow'&&x.target==='session-truth'&&x.operation==='parse'));assert(trail.some(x=>x.caller==='calendar-surface'&&x.target==='session-intake-flow'&&x.operation==='acceptDraft'));assert(trail.some(x=>x.caller==='coach-board-surface'&&x.target==='board-projection'&&x.operation==='project'));assert(!json.includes('324.6'));assert(!json.includes('Held shape'));assert(!json.includes('6 x 100 Freestyle'))});

if(failures){console.error(`\n${failures} App Composition regression(s) failed`);process.exit(1)}
console.log('\nALL APP COMPOSITION REGRESSIONS PASS');
