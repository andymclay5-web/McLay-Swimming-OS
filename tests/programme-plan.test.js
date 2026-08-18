'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Entities=require('../engines/entity-registry.js');
const Plan=require('../engines/plan-context.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function setup(storage=null){const entities=Entities.create({sources:[{id:'current',priority:100,trust:'current',data:{athletes:[{id:'a1',full_name:'Swimmer One',squad:'National'}],squads:[{id:'sq-national',name:'National'}]}}]});return Plan.create({storage,entities,clock:(()=>{let n=0;return()=>`2026-08-18T14:20:${String(n++).padStart(2,'0')}+12:00`})(),
 seasons:[{id:'season',start_date:'2026-05-01',end_date:'2026-10-31',target_meet_ids:['nzsc'],active:true}],
 phases:[{id:'phase',season_id:'season',start_date:'2026-08-01',end_date:'2026-08-31',active:true}],
 cycles:[{id:'cycle',phase_id:'phase',start_date:'2026-08-10',end_date:'2026-08-30',target_meet_ids:['regional'],active:true}],
 weeks:[{id:'week',season_id:'season',cycle_id:'cycle',start_date:'2026-08-17',end_date:'2026-08-23',planned_exposure:{aerobic_capacity:2,race_pace:2},active:true}],
 sessionIntents:[{id:'intent',session_id:'s1',week_id:'week',purpose:'Aerobic capacity with race skill',primary_stimulus:'Aerobic Capacity',supporting_stimuli:['Race Pace'],planned_exposure:{aerobic_capacity:1},target_meet_ids:['nzsc'],active:true}],
 meets:[{id:'nzsc',name:'NZSC',active:true},{id:'regional',name:'Regional Champs',active:true}],
 squadObjectives:[{id:'sq-obj',squad_id:'sq-national',start_date:'2026-08-01',end_date:'2026-08-31',objective:'Build aerobic capacity',active:true}],
 athleteObjectives:[{id:'ath-obj',athlete_id:'a1',start_date:'2026-08-01',end_date:'2026-09-01',objective:'Improve 100 Fly qualification position',active:true}]
})}
const session=Truth.parse('Main set\n6 x 100 Free Development 10 sr',{id:'s1',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National']});

test('season phase cycle week and explicit session intent resolve as one planning context',()=>{const r=setup().resolve(session);assert.equal(r.status,'ok');assert.equal(r.season.id,'season');assert.equal(r.phase.id,'phase');assert.equal(r.cycle.id,'cycle');assert.equal(r.week.id,'week');assert.equal(r.intent.id,'intent');assert.equal(r.primaryStimulus,'Aerobic Capacity')});
test('target meets are unioned across planning levels without invention',()=>{const ids=setup().resolve(session).meets.map(x=>x.id).sort();assert.deepEqual(ids,['nzsc','regional'])});
test('squad objectives resolve through canonical Entity Registry identity',()=>{const r=setup().resolve(session);assert.equal(r.squadObjectives.length,1);assert.equal(r.squadObjectives[0].id,'sq-obj')});
test('athlete objectives are separate from squad/session plan and query by canonical athlete id',()=>{const rows=setup().athleteObjectivesFor('Swimmer One',{asOfDate:'2026-08-18'});assert.equal(rows.length,1);assert.equal(rows[0].id,'ath-obj')});
test('weekly plan exposes intended exposure without calculating delivered exposure',()=>{const w=setup().weeklyPlan({date:'2026-08-18',squadId:'sq-national'});assert.equal(w.status,'ok');assert.equal(w.plannedExposure.aerobic_capacity,2);assert.equal(w.intents.length,1);assert.equal(w.deliveredExposure,undefined)});
test('plan writes are explicit journalled commands and persist locally',()=>{const storage=new Plan.MemoryStorage(),p=setup(storage);const row=p.upsert('sessionIntents',{id:'extra',date:'2026-08-19',dayPart:'PM',squads:['National'],purpose:'Recovery skills',primary_stimulus:'Regeneration',active:true},{coachId:'coach-andy',note:'Wednesday adjustment'});assert.equal(row.id,'extra');assert.equal(storage.writes,1);const snap=p.snapshot();assert.equal(snap.journal.length,1);assert.equal(snap.journal[0].coachId,'coach-andy');assert.equal(snap.journal[0].action,'create')});
test('retiring a plan row preserves history rather than deleting it',()=>{const p=setup();p.retire('sessionIntents','intent',{coachId:'coach-andy'});assert.equal(p.snapshot().sessionIntents.find(x=>x.id==='intent').active,false);assert.equal(p.resolve(session).status,'missing_session_intent');assert.equal(p.snapshot().journal.at(-1).action,'update')});
test('plan never infers session purpose from workout vocabulary',()=>{const other=Truth.parse('Main set\n20 x 100 Threshold',{...session.identity,id:'unplanned'}),r=setup().resolve(other);assert.equal(r.status,'missing_session_intent');assert.equal(r.primaryStimulus,'');assert(/do not infer/.test(r.message))});
test('returned planning context is cloned and cannot mutate stored plan truth',()=>{const p=setup(),r=p.resolve(session);r.week.planned_exposure.aerobic_capacity=99;assert.equal(p.resolve(session).week.planned_exposure.aerobic_capacity,2)});
if(fails){console.error(`\n${fails} Programme Plan regression(s) failed`);process.exit(1)}console.log('\nALL PROGRAMME PLAN REGRESSIONS PASS');
