'use strict';
const assert=require('assert');
const Portal=require('../rebuild/engine-portal.js');
const Schedule=require('../engines/session-schedule.js');
const SchedulePortal=require('../rebuild/schedule-portal.js');

let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
function calendar(){return{calendar_id:'aug26',title:'AquaGym August',coverage_start:'2026-08-01',coverage_end:'2026-08-31',published_at:'2026-08-01T00:00:00+12:00',rules:{empty_date_means_no_training:true},dates:[{date:'2026-08-18',status:'training',sessions:[{day_part:'AM',start_time:'05:20',end_time:'07:20',squads:['National'],venue:'AquaGym',pool_course:'SCM'},{day_part:'AM',start_time:'05:30',end_time:'07:00',squads:['Development'],venue:'AquaGym',pool_course:'SCM'}],events:[]}]}}
function fixture(){const scheduleStorage=new Schedule.MemoryStorage(),core=SchedulePortal.create({scheduleStorage,calendarSources:[calendar()],squads:[{id:'squad-national',name:'National',active:true},{id:'squad-development',name:'Development',active:true}],clock:()=> '2026-08-18T05:15:00+12:00'});return{core,scheduleStorage}}

console.log(`Schedule Portal ${SchedulePortal.VERSION}`);

test('communication graph seals with Calendar Surface -> Session Schedule -> Entity Registry only',()=>{
  const {core}=fixture(),graph=core.graph.services.reduce((m,x)=>(m[x.id]=x,m),{});assert(graph['calendar-surface']);assert.deepStrictEqual(graph['calendar-surface'].calls.query['session-schedule'].includes('day'),true);assert.deepStrictEqual(graph['session-schedule'].calls.query['entity-registry'],['resolveSquad']);assert.deepStrictEqual(graph['app-shell'].calls,{query:{},command:{}});
});

test('Calendar Surface creates one shared occurrence and reads squad timing through portal-routed engine',()=>{
  const {core}=fixture(),slots=core.slotsForDate('2026-08-18'),nat=slots.find(x=>x.squadId==='squad-national'),dev=slots.find(x=>x.squadId==='squad-development'),occ=core.linkSlots([nat.id,dev.id],{sessionId:'session-am'}),day=core.day('2026-08-18');assert.strictEqual(occ.squadEntries[1].startOffsetMinutes,10);assert.strictEqual(day.items.filter(x=>x.type==='occurrence').length,1);assert.strictEqual(core.entryContext(occ.id,'Development').sessionId,'session-am');
  const audit=core.diagnostics().audit;assert(audit.some(x=>x.caller==='calendar-surface'&&x.target==='session-schedule'&&x.operation==='linkSlots'&&x.status==='ok'));assert(audit.some(x=>x.caller==='session-schedule'&&x.target==='entity-registry'&&x.operation==='resolveSquad'&&x.status==='ok'));
});

test('app shell cannot bypass Calendar Surface and query or mutate Session Schedule directly',()=>{
  const {core}=fixture(),shell=core.portal.client('app-shell');assert.throws(()=>shell.query('session-schedule','day',{args:['2026-08-18']}),e=>e instanceof Portal.PortalError&&e.code==='CALL_NOT_ALLOWED');assert.throws(()=>shell.command('session-schedule','linkSlots',{args:[[]]}),e=>e instanceof Portal.PortalError&&e.code==='CALL_NOT_ALLOWED');
});

test('canonical session identity comes from the explicit shared occurrence, not UI labels or guessed current state',()=>{
  const {core}=fixture(),slots=core.slotsForDate('2026-08-18'),occ=core.linkSlots(slots.map(x=>x.id)),identity=core.identityForOccurrence(occ.id,{title:'Tuesday AM'});assert.strictEqual(identity.date,'2026-08-18');assert.strictEqual(identity.start,'05:20');assert.strictEqual(identity.end,'07:20');assert.deepStrictEqual(identity.squadIds,['squad-national','squad-development']);assert.strictEqual(identity.scheduleOccurrenceId,occ.id);assert.strictEqual(identity.scheduleEntries[1].startOffsetMinutes,10);
});

if(failures){console.error(`\n${failures} Schedule Portal integration regression(s) failed`);process.exit(1)}
console.log('\nALL SCHEDULE PORTAL INTEGRATION REGRESSIONS PASS');
