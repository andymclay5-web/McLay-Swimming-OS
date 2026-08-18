'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Dose=require('../engines/session-dose.js');
const Delivered=require('../engines/delivered-session.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const id={id:'dose-session',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National','Development'],venue:'AquaGym'};
const engine=Dose.create();
const plan=(primary,supporting=[],required=[])=>({status:'ok',intent:{primary_dose_key:primary,supporting_dose_keys:supporting,required_dose_keys:required}});

test('simple aerobic zone metres are classified exactly',()=>{
 const s=Truth.parse('Main set\n6 x 100 Free Development 10 sr\n400 Easy',id),r=engine.analyze(s);assert.equal(r.totalDistance,1000);assert.equal(r.classifiedQualityDistance,600);assert.equal(r.supportOrUnclassifiedDistance,400);assert.equal(r.dose['aerobic:development'],600);assert.equal(r.classifiedShare,.6);
});

test('race pace quality is judged against classified work, not diluted by easy recovery metres',()=>{
 const s=Truth.parse('Main set\n4 x 25 Free @ 100 Pace\n400 Easy',id),r=engine.analyze(s,{planContext:plan('race_pace')});assert.equal(r.totalDistance,500);assert.equal(r.classifiedQualityDistance,100);assert.equal(r.supportOrUnclassifiedDistance,400);assert.equal(r.dose.race_pace,100);assert.equal(r.alignment.status,'aligned');assert.equal(r.alignment.primaryShare,1);assert(r.feedback.some(x=>x.type==='classification'&&/80%/.test(x.message)));
});

test('Tuesday 5400 canonical session yields explicit Development, technique and race-pace doses without inventing semantics for support work',()=>{
 const src=`TUESDAY AM — AEROBIC CAPACITY / REGENERATION

WARM UP
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
TOTAL: 5,400m`;
 const s=Truth.parse(src,{...id,id:'dose-tuesday'}),r=engine.analyze(s,{planContext:plan('aerobic:development',['race_pace','technique'])});assert.equal(r.totalDistance,5400);assert.equal(r.dose['aerobic:development'],1200);assert.equal(r.dose.technique,400);assert.equal(r.dose.race_pace,300);assert.equal(r.classifiedQualityDistance,1900);assert.equal(r.supportOrUnclassifiedDistance,3500);assert.equal(r.alignment.status,'aligned');assert.equal(r.rankedDose[0].key,'aerobic:development');assert.equal(r.rankedDose[0].metres,1200);assert(!Object.keys(r.dose).some(k=>/easy|recovery|pull|paddles/i.test(k)));
});

test('rounds multiply classified dose exactly once',()=>{
 const s=Truth.parse('Main set\n3 Rounds:\n5 x 100 Free Threshold 10 sr\n400 Easy',id),r=engine.analyze(s);assert.equal(r.totalDistance,2700);assert.equal(r.dose['aerobic:threshold'],1500);assert.equal(r.classifiedQualityDistance,1500);assert.equal(r.supportOrUnclassifiedDistance,1200);
});

test('one-pass phases do not double count parent and child metres',()=>{
 const s=Truth.parse(`Post set\n16 x 50 @ 1:15\n8 x 50 Bands Only\n4 Build\n4 Descend 1-4\n8 x 50 Swim\nDescend 1-4 twice\n#4 + #8 @ 100 Pace`,id),r=engine.analyze(s);assert.equal(r.totalDistance,800);assert.equal(r.dose.race_pace,100);assert.equal(r.classifiedQualityDistance,100);assert.equal(r.supportOrUnclassifiedDistance,700);
});

test('rep-zone pattern classifies each rep once',()=>{
 const s=Truth.parse('Main set\n6 x 100 Free 10 sr\n1 Reg / 1 Dev / 1 OL',id),r=engine.analyze(s);assert.equal(r.totalDistance,600);assert.equal(r.classifiedQualityDistance,600);assert.equal(r.dose['aerobic:regeneration'],200);assert.equal(r.dose['aerobic:development'],200);assert.equal(r.dose['aerobic:overload'],200);
});

test('planned primary missing is explicit',()=>{
 const s=Truth.parse('Main set\n6 x 100 Free Development 10 sr',id),r=engine.analyze(s,{planContext:plan('race_pace')});assert.equal(r.alignment.status,'primary_missing');assert(r.feedback.some(x=>x.status==='attention'&&/race_pace/.test(x.message)));
});

test('planned primary present but secondary dose larger is flagged for review',()=>{
 const s=Truth.parse('Main set\n6 x 100 Free Development 10 sr\n4 x 25 Free @ 100 Pace',id),r=engine.analyze(s,{planContext:plan('race_pace',['aerobic:development'])});assert.equal(r.dose['aerobic:development'],600);assert.equal(r.dose.race_pace,100);assert.equal(r.alignment.status,'primary_not_dominant');assert.equal(r.alignment.topDose.key,'aerobic:development');
});

test('missing required/supporting planned dose is surfaced',()=>{
 const s=Truth.parse('Main set\n6 x 100 Free Development 10 sr',id),r=engine.analyze(s,{planContext:plan('aerobic:development',['race_pace'],['technique'])});const messages=r.feedback.filter(x=>x.type==='support').map(x=>x.message);assert(messages.some(x=>/race_pace/.test(x)));assert(messages.some(x=>/technique/.test(x)));
});

test('no classified quality work returns insufficient classification rather than guessing session tone',()=>{
 const s=Truth.parse('Main set\n400 Easy\n400 Pull',id),r=engine.analyze(s,{planContext:plan('aerobic:development')});assert.equal(r.totalDistance,800);assert.equal(r.classifiedQualityDistance,0);assert.equal(r.alignment.status,'insufficient_classification');assert(r.feedback.some(x=>/do not infer session tone/.test(x.message)));
});

test('Dose Engine never reparses raw coaching text after canonical truth exists',()=>{
 const s=Truth.parse('Main set\n4 x 100 Free Threshold 10 sr',id),item=s.blocks[0].items[0];item.zone='';item.repPattern=[];item.repInstructions=[];item.raceIntent=null;const r=engine.analyze(s,{planContext:plan('aerobic:threshold')});assert.equal(r.totalDistance,400);assert.equal(r.classifiedQualityDistance,0);assert.equal(r.dose['aerobic:threshold'],undefined);assert.equal(r.alignment.status,'insufficient_classification');
});

test('delivered-scope analysis uses delivered occurrences rather than full planned metres',()=>{
 const s=Truth.parse('Main set\n400 Pull\n6 x 100 Free Development 10 sr\n400 Easy',id),occ=Delivered.expand(s),development=occ.find(x=>x.item_id===s.blocks[0].items[1].id);const delivered={delivered_occurrences:occ.slice(0,occ.indexOf(development)+1)},r=engine.analyze(s,{delivered});assert.equal(r.scope,'delivered');assert.equal(r.totalDistance,1000);assert.equal(r.dose['aerobic:development'],600);assert.equal(r.supportOrUnclassifiedDistance,400);
});

test('early finish in repeated group analyzes exact delivered occurrence sequence',()=>{
 const s=Truth.parse('Main set\n3 Rounds:\n5 x 100 Free Threshold 10 sr\n400 Easy',id),occ=Delivered.expand(s),finishIndex=occ.findIndex(x=>x.group_rounds?.[0]?.round===2&&x.item_id===s.blocks[0].items[0].items[0].id),delivered={delivered_occurrences:occ.slice(0,finishIndex+1)},r=engine.analyze(s,{delivered});assert.equal(r.totalDistance,1400);assert.equal(r.dose['aerobic:threshold'],1000);assert.equal(r.supportOrUnclassifiedDistance,400);
});

test('block breakdown sums back to whole session total',()=>{
 const s=Truth.parse('Warm up\n400 Choice\nPre set\n4 x 50 Drill\nMain set\n6 x 100 Free Development 10 sr\nWarm down\n200 Easy',id),r=engine.analyze(s);assert.equal(r.blocks.reduce((n,b)=>n+b.distance,0),r.totalDistance);assert.equal(r.blocks.find(b=>b.type==='main_set').dose['aerobic:development'],600);
});

test('analysis is read-only and does not mutate canonical or delivered truth',()=>{
 const s=Truth.parse('Main set\n6 x 100 Free Development 10 sr\n400 Easy',id),occ=Delivered.expand(s),delivered={delivered_occurrences:occ},beforeS=JSON.stringify(s),beforeD=JSON.stringify(delivered);engine.analyze(s,{delivered,planContext:plan('aerobic:development')});assert.equal(JSON.stringify(s),beforeS);assert.equal(JSON.stringify(delivered),beforeD);
});

if(fails){console.error(`\n${fails} Session Dose regression(s) failed`);process.exit(1)}
console.log('\nALL SESSION DOSE REGRESSIONS PASS');
