'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Plan=require('../engines/plan-context.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const session=Truth.parse('Main set\n6 x 100 Free Development 10 sr',{id:'tue-am',date:'2026-08-18',dayPart:'AM',start:'05:20',end:'07:20',venue:'AquaGym',course:'SCM',squads:['National','Development']});
const engine=()=>Plan.create({
 seasons:[{id:'season-26',name:'2026 Short Course Season',start_date:'2026-05-01',end_date:'2026-10-31',target_meet_ids:['nzsc'],active:true}],
 phases:[{id:'phase-build',season_id:'season-26',name:'Aerobic Capacity Build',start_date:'2026-08-03',end_date:'2026-08-30',order:2,target_meet_ids:['regional'],active:true}],
 weeks:[{id:'week-aug17',season_id:'season-26',start_date:'2026-08-17',end_date:'2026-08-23',name:'Capacity + race skill',target_meet_ids:['club'],active:true}],
 sessionIntents:[
  {id:'intent-tue',session_id:'tue-am',week_id:'week-aug17',purpose:'Build aerobic capacity while retaining race-speed feel',primary_stimulus:'Aerobic Capacity',supporting_stimuli:['Regeneration','Race Pace'],technical_focus:['Minimum stroke count'],athlete_threads:['Para inclusion'],target_meet_ids:['nzsc'],active:true},
  {id:'wrong-session',session_id:'wed-am',purpose:'Wrong',primary_stimulus:'Sprint',active:true}
 ],
 meets:[{id:'nzsc',name:'NZ Short Course',active:true},{id:'regional',name:'Canterbury Championships',active:true},{id:'club',name:'Club meet',active:true}]
});

test('exact session id resolves season, phase, week and session purpose',()=>{
 const c=engine().resolve(session);assert.equal(c.status,'ok');assert.equal(c.season.id,'season-26');assert.equal(c.phase.id,'phase-build');assert.equal(c.week.id,'week-aug17');assert.equal(c.intent.id,'intent-tue');assert.equal(c.primaryStimulus,'Aerobic Capacity');assert.equal(c.purpose,'Build aerobic capacity while retaining race-speed feel');
});

test('supporting stimuli and technical threads remain explicit plan facts',()=>{
 const c=engine().resolve(session);assert.deepEqual(c.supportingStimuli,['Regeneration','Race Pace']);assert.deepEqual(c.technicalFocus,['Minimum stroke count']);assert.deepEqual(c.athleteThreads,['Para inclusion']);
});

test('meet context is union of explicitly linked plan levels with no invented meet',()=>{
 const c=engine().resolve(session),ids=c.meets.map(x=>x.id).sort();assert.deepEqual(ids,['club','nzsc','regional']);
});

test('missing session intent is explicit and never inferred from Threshold/Development workout words',()=>{
 const other=Truth.parse('Main set\n10 x 100 Free Threshold 10 sr',{...session.identity,id:'thu-am',date:'2026-08-20'}),c=engine().resolve(other);assert.equal(c.status,'missing_session_intent');assert.equal(c.intent,null);assert.equal(c.primaryStimulus,'');assert(/do not infer purpose/.test(c.message));
});

test('exact date/daypart/squad slot can resolve an unbound intent when no session id exists',()=>{
 const p=Plan.create({sessionIntents:[{id:'slot-intent',date:'2026-08-18',dayPart:'AM',start:'05:20',venue:'AquaGym',squads:['Development','National'],purpose:'Exact slot',primary_stimulus:'Development',active:true}]});const c=p.resolve(session);assert.equal(c.status,'ok');assert.equal(c.intent.id,'slot-intent');assert.equal(c.primaryStimulus,'Development');
});

test('wrong squad slot does not match merely because date and AM agree',()=>{
 const p=Plan.create({sessionIntents:[{id:'wrong',date:'2026-08-18',dayPart:'AM',squads:['Fitness'],purpose:'Wrong squad',primary_stimulus:'Recovery',active:true}]});assert.equal(p.resolve(session).status,'missing_session_intent');
});

test('inactive and superseded plan rows are ignored',()=>{
 const p=Plan.create({seasons:[{id:'old',start_date:'2026-01-01',end_date:'2026-12-31',active:false}],sessionIntents:[{id:'old-intent',session_id:'tue-am',purpose:'Old',status:'superseded'}]});const c=p.resolve(session);assert.equal(c.season,null);assert.equal(c.intent,null);assert.equal(c.status,'missing_session_intent');
});

test('plan resolution is read-only and cannot mutate canonical session or plan inputs',()=>{
 const opts={seasons:[{id:'s',start_date:'2026-01-01',end_date:'2026-12-31',active:true}],sessionIntents:[{id:'i',session_id:'tue-am',purpose:'Read only',primary_stimulus:'Development',active:true}]},p=Plan.create(opts),beforeSession=JSON.stringify(session),beforeOpts=JSON.stringify(opts);p.resolve(session);assert.equal(JSON.stringify(session),beforeSession);assert.equal(JSON.stringify(opts),beforeOpts);
});

if(fails){console.error(`\n${fails} Plan Context regression(s) failed`);process.exit(1)}
console.log('\nALL PLAN CONTEXT REGRESSIONS PASS');
