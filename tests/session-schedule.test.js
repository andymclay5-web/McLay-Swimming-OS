'use strict';
const assert=require('assert');
const Entities=require('../engines/entity-registry.js');
const Schedule=require('../engines/session-schedule.js');

let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
function entities(){return Entities.create({squads:[
  {id:'squad-national',name:'National',active:true},
  {id:'squad-development',name:'Development',active:true},
  {id:'squad-fitness',name:'Fitness',active:true},
  {id:'squad-intermediate',name:'Intermediate',active:true}
]})}
function calendar(){return{
  schema_version:1,calendar_id:'aquagym-2026-08-published',title:'AquaGym August 2026 Training Schedule',timezone:'Pacific/Auckland',status:'published',coverage_mode:'replace',coverage_start:'2026-07-27',coverage_end:'2026-09-06',published_at:'2026-07-31T10:37:00+12:00',rules:{empty_date_means_no_training:true},dates:[
    {date:'2026-08-18',status:'training',sessions:[
      {day_part:'AM',start_time:'05:20',end_time:'07:20',squads:['National'],venue:'AquaGym',pool_course:'SCM',note:''},
      {day_part:'AM',start_time:'05:30',end_time:'07:00',squads:['Development','Fitness'],venue:'AquaGym',pool_course:'SCM',note:''},
      {day_part:'PM',start_time:'18:30',end_time:'20:00',squads:['National','Development'],venue:'AquaGym',pool_course:'SCM',note:''}
    ],events:[{name:'SCWC T32 Squad',start_time:'07:15',end_time:'09:15',venue:'Parakiore',authorable:true,session_squad:'Development'}],notes:[]},
    {date:'2026-08-19',status:'training',sessions:[
      {day_part:'AM',start_time:'05:20',end_time:'07:20',squads:['National'],venue:'AquaGym',pool_course:'SCM'},
      {day_part:'AM',start_time:'07:20',end_time:'08:30',squads:['Intermediate'],venue:'AquaGym',pool_course:'SCM'}
    ],events:[]}
  ]
}}
function fixture(){const storage=new Schedule.MemoryStorage(),clock=(()=>{let n=0;return()=>`2026-08-18T05:${String(20+n++).padStart(2,'0')}:00+12:00`})(),engine=Schedule.create({storage,entities:entities(),calendarSources:[calendar()],clock});return{engine,storage,clock}}

console.log(`Session Schedule ${Schedule.VERSION}`);

test('published combined-squad rows become separate stable squad slots while retaining one source group',()=>{
  const {engine}=fixture(),slots=engine.slotsForDate('2026-08-18'),dev=slots.find(x=>x.squadId==='squad-development'&&x.start==='05:30'),fit=slots.find(x=>x.squadId==='squad-fitness'&&x.start==='05:30');
  assert(dev&&fit,'Development/Fitness slots missing');assert.notStrictEqual(dev.id,fit.id);assert.strictEqual(dev.source.groupId,fit.source.groupId);assert.strictEqual(dev.identityStatus,'resolved');
  const again=Schedule.create({storage:new Schedule.MemoryStorage(),entities:entities(),calendarSources:[calendar()]});assert.strictEqual(again.getSlot(dev.id).id,dev.id,'published slot id drift');
});

test('National 05:20 and Development 05:30 explicitly link to one shared occurrence with exact offsets',()=>{
  const {engine}=fixture(),slots=engine.slotsForDate('2026-08-18'),nat=slots.find(x=>x.squadId==='squad-national'&&x.start==='05:20'),dev=slots.find(x=>x.squadId==='squad-development'&&x.start==='05:30'),occ=engine.linkSlots([nat.id,dev.id],{sessionId:'session-tue-am'});
  assert.strictEqual(occ.start,'05:20');assert.strictEqual(occ.end,'07:20');assert.strictEqual(occ.sessionId,'session-tue-am');
  assert.strictEqual(occ.squadEntries.find(x=>x.squadId==='squad-national').startOffsetMinutes,0);assert.strictEqual(occ.squadEntries.find(x=>x.squadId==='squad-development').startOffsetMinutes,10);
  const id=engine.identityForOccurrence(occ.id,{title:'Tuesday AM Aerobic'});assert.deepStrictEqual(id.squadIds,['squad-national','squad-development']);assert.deepStrictEqual(id.squads,['National','Development']);assert.strictEqual(id.start,'05:20');assert.strictEqual(id.scheduleEntries[1].startOffsetMinutes,10);
});

test('schedule entry offset is context only and does not manufacture a second workout',()=>{
  const {engine}=fixture(),slots=engine.slotsForDate('2026-08-18'),nat=slots.find(x=>x.squadId==='squad-national'&&x.start==='05:20'),dev=slots.find(x=>x.squadId==='squad-development'&&x.start==='05:30'),occ=engine.linkSlots([nat.id,dev.id],{sessionId:'canonical-one'}),ctx=engine.entryContext(occ.id,'Development');
  assert.strictEqual(ctx.sessionId,'canonical-one');assert.strictEqual(ctx.startOffsetMinutes,10);assert(!Object.prototype.hasOwnProperty.call(ctx,'blocks'));assert(!Object.prototype.hasOwnProperty.call(ctx,'workout'));assert.strictEqual(engine.occurrenceForSession('canonical-one').id,occ.id);
});

test('calendar day collapses linked squads into one occurrence and leaves unrelated slots separate',()=>{
  const {engine}=fixture(),slots=engine.slotsForDate('2026-08-18'),nat=slots.find(x=>x.squadId==='squad-national'&&x.start==='05:20'),dev=slots.find(x=>x.squadId==='squad-development'&&x.start==='05:30');engine.linkSlots([nat.id,dev.id],{sessionId:'session-tue-am'});const day=engine.day('2026-08-18'),shared=day.items.filter(x=>x.type==='occurrence');
  assert.strictEqual(shared.length,1);assert.strictEqual(shared[0].squadEntries.length,2);assert(day.items.some(x=>x.type==='slot'&&x.squadEntries[0].squadId==='squad-fitness'));assert(day.items.some(x=>x.kind==='event'&&x.venue==='Parakiore'));
});

test('shared occurrence fails closed across venue course day part kind or non-overlapping clock windows',()=>{
  const {engine}=fixture(),slots=engine.slotsForDate('2026-08-18'),nat=slots.find(x=>x.squadId==='squad-national'&&x.start==='05:20'),event=slots.find(x=>x.kind==='event');assert.throws(()=>engine.linkSlots([nat.id,event.id]),/matching venue|matching kind/);
  const day2=engine.slotsForDate('2026-08-19'),nat2=day2.find(x=>x.squadId==='squad-national'),inter=day2.find(x=>x.squadId==='squad-intermediate');assert.throws(()=>engine.linkSlots([nat2.id,inter.id]),/overlap/);
});

test('a slot cannot silently belong to two active occurrences and one canonical session cannot bind twice',()=>{
  const {engine}=fixture(),slots=engine.slotsForDate('2026-08-18'),nat=slots.find(x=>x.squadId==='squad-national'&&x.start==='05:20'),dev=slots.find(x=>x.squadId==='squad-development'&&x.start==='05:30'),fit=slots.find(x=>x.squadId==='squad-fitness'&&x.start==='05:30'),one=engine.linkSlots([nat.id,dev.id],{sessionId:'session-one'});assert.throws(()=>engine.linkSlots([dev.id,fit.id]),/already belongs/);const two=engine.linkSlots([fit.id]);assert.throws(()=>engine.bindSession(two.id,'session-one'),/already bound/);assert.strictEqual(engine.occurrenceForSession('session-one').id,one.id);
});

test('binding and occurrence history persist across reload without changing published calendar truth',()=>{
  const {engine,storage}=fixture(),slots=engine.slotsForDate('2026-08-18'),nat=slots.find(x=>x.squadId==='squad-national'&&x.start==='05:20'),dev=slots.find(x=>x.squadId==='squad-development'&&x.start==='05:30'),occ=engine.linkSlots([nat.id,dev.id]);engine.bindSession(occ.id,'persisted-session',{note:'coach accepted shared session'});const writes=storage.writes,reloaded=Schedule.create({storage,entities:entities(),calendarSources:[calendar()]});assert.strictEqual(reloaded.occurrenceForSession('persisted-session').id,occ.id);assert(reloaded.history(occ.id).some(x=>x.type==='bind_session'));assert.strictEqual(reloaded.getSlot(nat.id).source.type,'published_calendar');assert(writes>=2);
});

test('custom slots are explicit, persistent and retire without changing published slots',()=>{
  const {engine}=fixture(),slot=engine.createCustomSlot({date:'2026-08-20',start:'06:00',end:'07:30',squad:'Development',venue:'AquaGym',course:'SCM'});assert.strictEqual(engine.day('2026-08-20').items.length,1);engine.retireCustomSlot(slot.id);assert.strictEqual(engine.day('2026-08-20').items.length,0);assert(engine.listCustomSlots({includeRetired:true}).some(x=>x.id===slot.id&&x.status==='retired'));
});

test('published replacement calendar can explicitly turn an older scheduled day into no training',()=>{
  const old=calendar(),newer={calendar_id:'replacement',title:'Replacement',coverage_start:'2026-08-18',coverage_end:'2026-08-18',published_at:'2026-08-17T12:00:00+12:00',rules:{empty_date_means_no_training:true},dates:[]},engine=Schedule.create({storage:new Schedule.MemoryStorage(),entities:entities(),calendarSources:[old,newer]});assert.strictEqual(engine.slotsForDate('2026-08-18').length,0);assert.strictEqual(engine.day('2026-08-18').status,'no_training');assert.strictEqual(engine.day('2026-08-18').source.calendarId,'replacement');
});

test('unresolved published squad is preserved for display but cannot become canonical occurrence truth',()=>{
  const bad=calendar();bad.dates[0].sessions.push({day_part:'AM',start_time:'06:00',end_time:'07:00',squads:['Mystery Squad'],venue:'AquaGym',pool_course:'SCM'});const engine=Schedule.create({storage:new Schedule.MemoryStorage(),entities:entities(),calendarSources:[bad]}),row=engine.slotsForDate('2026-08-18').find(x=>x.squadLabel==='Mystery Squad');assert(row);assert.strictEqual(row.identityStatus,'unresolved_squad');assert.throws(()=>engine.linkSlots([row.id]),/unresolved squad identity/);
});

if(failures){console.error(`\n${failures} Session Schedule regression(s) failed`);process.exit(1)}
console.log('\nALL SESSION SCHEDULE REGRESSIONS PASS');
