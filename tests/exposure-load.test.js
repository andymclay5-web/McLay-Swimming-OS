'use strict';
const assert=require('assert');
const Exposure=require('../engines/exposure-load.js');
let fails=0;function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const e=Exposure.create();
const records=[
 {session_id:'s1',date:'2026-08-10',athlete_id:'molly',squad_id:'Development',totalDistance:4000,dose:{'aerobic:development':1200,'race_pace':200}},
 {session_id:'s2',date:'2026-08-12',athlete_id:'molly',squad_id:'Development',totalDistance:4200,dose:{'aerobic:development':800,'aerobic:overload':600}},
 {session_id:'s3',date:'2026-08-14',athlete_id:'molly',squad_id:'Development',totalDistance:3800,dose:{'aerobic:overload':400,'race_pace':300}},
 {session_id:'s4',date:'2026-08-14',athlete_id:'alex',squad_id:'National',totalDistance:5000,dose:{'aerobic:overload':1500}},
 {session_id:'old',date:'2026-07-01',athlete_id:'molly',squad_id:'Development',totalDistance:3000,dose:{'aerobic:development':3000}}
];

test('summary filters athlete and date window before aggregating dose facts',()=>{const x=e.summarize(records,{athleteId:'molly',from:'2026-08-10',to:'2026-08-16'});assert.equal(x.sessions,3);assert.equal(x.totalDistance,12000);assert.equal(x.dose['aerobic:development'],2000);assert.equal(x.dose['aerobic:overload'],1000);assert.equal(x.dose.race_pace,500);assert(!x.session_ids.includes('old'));assert(!x.session_ids.includes('s4'))});
test('ranked dose is based only on supplied Session Dose facts',()=>{const x=e.summarize(records,{athleteId:'molly',from:'2026-08-10'});assert.equal(x.rankedDose[0].key,'aerobic:development');assert.equal(x.rankedDose[0].metres,2000);assert.equal(x.classifiedDistance,3500);assert.equal(x.unclassifiedDistance,8500)});
test('plan comparison reports explicit below within and above ranges without coaching inference',()=>{const s=e.summarize(records,{athleteId:'molly',from:'2026-08-10'}),c=e.compare(s,{id:'wk',exposure_targets:[{key:'aerobic:development',min_metres:1800,max_metres:2500},{key:'aerobic:overload',min_metres:1200,max_metres:1800},{key:'race_pace',max_metres:400}]});assert.equal(c.targets.find(x=>x.key==='aerobic:development').status,'within_range');assert.equal(c.targets.find(x=>x.key==='aerobic:overload').status,'below_minimum');assert.equal(c.targets.find(x=>x.key==='race_pace').status,'above_maximum');assert.equal(c.below.length,1);assert.equal(c.above.length,1)});
test('target-only comparison reports exact target delta',()=>{const s=e.summarize(records,{athleteId:'molly',from:'2026-08-10'}),r=e.compare(s,{targets:[{key:'aerobic:overload',target_metres:1500}] }).targets[0];assert.equal(r.actual_metres,1000);assert.equal(r.delta_metres,-500);assert.equal(r.status,'below_target')});
test('athleteContext preserves exact session evidence references',()=>{const x=e.athleteContext(records,'molly',{targets:[{key:'aerobic:overload',min_metres:1200}]},{from:'2026-08-10'});assert.equal(x.athlete_id,'molly');assert.deepEqual(x.evidence.session_ids,['s1','s2','s3']);assert(/3 supplied sessions/.test(x.evidence.fact))});
test('multiple records on a date remain visible rather than collapsed into one fake session',()=>{const x=e.summarize(records,{from:'2026-08-14',to:'2026-08-14'}),day=x.byDate[0];assert.equal(x.sessions,2);assert.equal(day.sessions,2);assert.equal(day.totalDistance,8800)});
test('invalid exposure target with no dose key fails closed',()=>{const s=e.summarize([]);assert.throws(()=>e.compare(s,{targets:[{min_metres:100}]}),/requires dose key/)});
test('summary does not mutate supplied dose records',()=>{const before=JSON.stringify(records);e.summarize(records,{athleteId:'molly'});assert.equal(JSON.stringify(records),before)});
if(fails){console.error(`\n${fails} Exposure and Load regression(s) failed`);process.exit(1)}console.log('\nALL EXPOSURE / LOAD REGRESSIONS PASS');
