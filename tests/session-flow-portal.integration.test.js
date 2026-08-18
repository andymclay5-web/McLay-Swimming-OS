'use strict';
const assert=require('assert');
const Portal=require('../rebuild/engine-portal.js');
const Schedule=require('../engines/session-schedule.js');
const Lifecycle=require('../engines/session-lifecycle.js');
const Flow=require('../rebuild/session-flow-portal.js');

let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
function calendar(){return{calendar_id:'aug26',title:'AquaGym August',coverage_start:'2026-08-01',coverage_end:'2026-08-31',published_at:'2026-08-01T00:00:00+12:00',rules:{empty_date_means_no_training:true},dates:[
  {date:'2026-08-18',status:'training',sessions:[{day_part:'AM',start_time:'05:20',end_time:'07:20',squads:['National'],venue:'AquaGym',pool_course:'SCM'},{day_part:'AM',start_time:'05:30',end_time:'07:00',squads:['Development'],venue:'AquaGym',pool_course:'SCM'}],events:[]},
  {date:'2026-08-19',status:'training',sessions:[{day_part:'AM',start_time:'05:20',end_time:'07:20',squads:['National'],venue:'AquaGym',pool_course:'SCM'}],events:[]}
]}}
function fixture({scheduleStorage=new Schedule.MemoryStorage(),lifecycleStorage=new Lifecycle.MemoryStorage()}={}){let n=0;const clock=()=>`2026-08-18T06:${String(n++).padStart(2,'0')}:00+12:00`,core=Flow.create({scheduleStorage,lifecycleStorage,calendarSources:[calendar()],squads:[{id:'squad-national',name:'National',active:true},{id:'squad-development',name:'Development',active:true}],clock});return{core,scheduleStorage,lifecycleStorage}}
const sessionSource=`WARM UP\n300 Choice\n\nMAIN SET\n4 x 100 Freestyle @ 1:30\n\nWARM DOWN\n200 Easy\n\nTOTAL: 900m`;

console.log(`Session Flow Portal ${Flow.VERSION}`);

test('Calendar can create one draft occurrence for National 05:20 plus Development 05:30 without duplicating workout truth',()=>{
  const {core}=fixture(),slots=core.slotsForDate('2026-08-18'),begun=core.beginFromSlots(slots.map(x=>x.id),{inputMode:'text',title:'Tuesday AM'});assert.strictEqual(begun.occurrence.squadEntries.length,2);assert.strictEqual(begun.occurrence.squadEntries.find(x=>x.squadId==='squad-development').startOffsetMinutes,10);assert.strictEqual(begun.draft.identity.scheduleOccurrenceId,begun.occurrence.id);assert.strictEqual(begun.occurrence.sessionId,'');assert.strictEqual(core.sessions().length,0);
});

test('accepted intake parses once through Session Truth, creates one Lifecycle session, and binds exact occurrence',()=>{
  const {core}=fixture(),slots=core.slotsForDate('2026-08-18'),begun=core.beginFromSlots(slots.map(x=>x.id),{inputMode:'text',title:'Tuesday AM'});core.updateDraft(begun.draft.id,{source:sessionSource});const accepted=core.acceptDraft(begun.draft.id);assert.strictEqual(accepted.record.id,accepted.session.id);assert.strictEqual(accepted.bound.sessionId,accepted.record.id);assert.strictEqual(core.sessions().length,1);assert.strictEqual(core.draft(begun.draft.id),null);assert.strictEqual(core.occurrenceForSession(accepted.record.id).id,begun.occurrence.id);assert.strictEqual(accepted.session.identity.scheduleEntries.find(x=>x.squadId==='squad-development').startOffsetMinutes,10);assert.strictEqual(accepted.session.sourceOriginal,sessionSource);
});

test('invalid session source cannot become canonical truth or bind schedule occurrence',()=>{
  const {core}=fixture(),slot=core.slotsForDate('2026-08-19')[0],begun=core.beginFromSlots([slot.id],{title:'Wednesday AM'});core.updateDraft(begun.draft.id,{source:''});assert.throws(()=>core.acceptDraft(begun.draft.id),/rejected intake|runnable|distance|block/i);assert.strictEqual(core.sessions().length,0);assert.strictEqual(core.occurrence(begun.occurrence.id).sessionId,'');assert(core.draft(begun.draft.id));
});

test('discarding a failed draft may explicitly retire its reserved occurrence without deleting calendar source slot',()=>{
  const {core}=fixture(),slot=core.slotsForDate('2026-08-19')[0],begun=core.beginFromSlots([slot.id]);assert.strictEqual(core.discardDraft(begun.draft.id,{retireOccurrence:true,note:'coach cancelled intake'}),true);assert.strictEqual(core.occurrence(begun.occurrence.id).active,false);assert(core.slotsForDate('2026-08-19').some(x=>x.id===slot.id),'published calendar slot was incorrectly deleted');
});

test('next-day intake cannot overwrite previous-day canonical session or binding',()=>{
  const {core}=fixture(),day1=core.beginFromSlots(core.slotsForDate('2026-08-18').map(x=>x.id),{title:'Tuesday AM'});core.updateDraft(day1.draft.id,{source:sessionSource});const one=core.acceptDraft(day1.draft.id);const day2=core.beginFromSlots([core.slotsForDate('2026-08-19')[0].id],{title:'Wednesday AM'});core.updateDraft(day2.draft.id,{source:sessionSource});const two=core.acceptDraft(day2.draft.id);assert.notStrictEqual(one.record.id,two.record.id);assert.strictEqual(core.sessions().length,2);assert.strictEqual(core.occurrenceForSession(one.record.id).date,'2026-08-18');assert.strictEqual(core.occurrenceForSession(two.record.id).date,'2026-08-19');assert.strictEqual(core.session(one.record.id).current.identity.date,'2026-08-18');
});

test('calendar surface writes through intake coordinator while app shell has no direct domain authority',()=>{
  const {core}=fixture(),shell=core.portal.client('app-shell');assert.throws(()=>shell.command('session-lifecycle','createDraft',{args:[{}]}),e=>e instanceof Portal.PortalError&&e.code==='CALL_NOT_ALLOWED');assert.throws(()=>shell.query('session-truth','parse',{source:sessionSource,identity:{}}),e=>e instanceof Portal.PortalError&&e.code==='CALL_NOT_ALLOWED');const slot=core.slotsForDate('2026-08-19')[0],begun=core.beginFromSlots([slot.id]);const audit=core.diagnostics().audit;assert(audit.some(x=>x.caller==='calendar-surface'&&x.target==='session-intake-flow'&&x.operation==='beginFromSlots'&&x.status==='ok'));assert(audit.some(x=>x.caller==='session-intake-flow'&&x.target==='session-schedule'&&x.operation==='linkSlots'&&x.status==='ok'));assert(audit.some(x=>x.caller==='session-intake-flow'&&x.target==='session-lifecycle'&&x.operation==='createDraft'&&x.status==='ok'));assert(begun.draft.id);
});

test('persisted schedule binding and lifecycle session reopen together after composition reload',()=>{
  const first=fixture(),slots=first.core.slotsForDate('2026-08-18'),begun=first.core.beginFromSlots(slots.map(x=>x.id),{title:'Tuesday AM'});first.core.updateDraft(begun.draft.id,{source:sessionSource});const accepted=first.core.acceptDraft(begun.draft.id),second=fixture({scheduleStorage:first.scheduleStorage,lifecycleStorage:first.lifecycleStorage});assert.strictEqual(second.core.session(accepted.record.id).id,accepted.record.id);assert.strictEqual(second.core.occurrenceForSession(accepted.record.id).id,begun.occurrence.id);assert.strictEqual(second.core.selectedSession().id,accepted.record.id);
});

if(failures){console.error(`\n${failures} Session Flow Portal regression(s) failed`);process.exit(1)}
console.log('\nALL SESSION FLOW PORTAL REGRESSIONS PASS');
