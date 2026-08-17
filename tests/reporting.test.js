'use strict';
const assert=require('assert');
const Reporting=require('../engines/reporting.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const R=Reporting.create();
const session={id:'s1',identity:{date:'2026-08-18',dayPart:'AM',title:'Tuesday AM',squads:['National','Development'],course:'SCM'}};
const lifecycle={journal:[{type:'create'},{type:'edit'},{type:'edit'}]};
const delivery={planned_distance:5400,current_distance:5400,delivered_distance:5000,remaining_distance:400,finish_point:{item_id:'last-done'}};
const dose={scope:'delivered',totalDistance:5000,classifiedQualityDistance:1800,supportOrUnclassifiedDistance:3200,classifiedShare:.36,dose:{'aerobic:development':1200,race_pace:200,technique:400},rankedDose:[{key:'aerobic:development',metres:1200},{key:'technique',metres:400},{key:'race_pace',metres:200}],alignment:{status:'aligned',primaryKey:'aerobic:development'},feedback:[{type:'alignment',status:'ok',message:'aligned'}]};
const plan={status:'ok',purpose:'Build aerobic capacity',primaryStimulus:'Aerobic Capacity',supportingStimuli:['Race Pace'],technicalFocus:['Minimum stroke count'],source:{seasonId:'season',weekId:'week',intentId:'intent'}};
const attendance={here:12,eligible:15,counts:{present:10,modified:1,late:1,absent:2,excused:1,not_marked:0}};
const captures=[
 {id:'c1',status:'active',type:'note',athlete_ids:['a']},
 {id:'c2',status:'active',type:'voice',athlete_ids:['a','b']},
 {id:'c3',status:'retired',type:'photo',athlete_ids:['a']}
];

test('session report aggregates stored facts without recalculating coaching logic',()=>{
 const r=R.session({session,lifecycleRecord:lifecycle,delivery,dose,planContext:plan,attendanceSummary:attendance,captures});assert.equal(r.sessionId,'s1');assert.equal(r.delivery.plannedDistance,5400);assert.equal(r.delivery.deliveredDistance,5000);assert.equal(r.delivery.remainingDistance,400);assert(Math.abs(r.delivery.completion-(5000/5400))<1e-12);assert.equal(r.plan.purpose,'Build aerobic capacity');assert.equal(r.dose.dose['aerobic:development'],1200);assert.equal(r.attendance.here,12);assert.equal(r.captures.total,2);assert.deepEqual(r.captures.byType,{note:1,voice:1});assert.deepEqual(r.lifecycle.byType,{create:1,edit:2});
});

test('unfinished session does not fabricate delivered distance or completion',()=>{
 const r=R.session({session,dose:{...dose,scope:'current',totalDistance:5400},planContext:plan});assert.equal(r.delivery.status,'not_finished');assert.equal(r.delivery.deliveredDistance,null);assert.equal(r.delivery.remainingDistance,null);assert.equal(r.delivery.completion,null);
});

test('period report sums distances and dose across sessions deterministically',()=>{
 const a=R.session({session,lifecycleRecord:lifecycle,delivery,dose,planContext:plan,attendanceSummary:attendance,captures}),b=R.session({session:{...session,id:'s2'},delivery:{planned_distance:4000,current_distance:4000,delivered_distance:4000,remaining_distance:0},dose:{...dose,totalDistance:4000,classifiedQualityDistance:1000,supportOrUnclassifiedDistance:3000,dose:{'aerobic:development':800,race_pace:200},alignment:{status:'primary_not_dominant'}},attendanceSummary:{here:10,eligible:12,counts:{}},captures:[{status:'active',type:'note',athlete_ids:[]}]});const p=R.period([a,b]);assert.equal(p.sessions,2);assert.equal(p.finishedSessions,2);assert.equal(p.plannedDistance,9400);assert.equal(p.currentDistance,9400);assert.equal(p.deliveredDistance,9000);assert.equal(p.dose['aerobic:development'],2000);assert.equal(p.dose.race_pace,400);assert.equal(p.capturesByType.note,2);assert.equal(p.capturesByType.voice,1);assert.equal(p.alignmentCounts.aligned,1);assert.equal(p.alignmentCounts.primary_not_dominant,1);assert.equal(p.attendance.here,22);assert.equal(p.attendance.eligible,27);
});

test('athlete report keeps pathway facts and athlete-specific evidence separate from squad report',()=>{
 const athlete={id:'a',full_name:'A Swimmer'},pathway={status:'ok',closest:{event:'100 Free'}},rows=[{athlete_id:'a',status:'present'},{athlete_id:'a',status:'modified'},{athlete_id:'a',status:'absent'},{athlete_id:'b',status:'present'}],r=R.athlete({athlete,pathway,attendanceRows:rows,captures,sessionReports:[{sessionId:'s1'},{sessionId:'s2'}]});assert.equal(r.attendance.marked,3);assert.equal(r.attendance.here,2);assert(Math.abs(r.attendance.rate-(2/3))<1e-12);assert.equal(r.captures.total,2);assert.deepEqual(r.pathway,pathway);assert.deepEqual(r.sessionIds,['s1','s2']);
});

test('coach report aggregates coach actions and captures but does not invent quality judgement',()=>{
 const a=R.session({session,lifecycleRecord:lifecycle,delivery,dose,planContext:plan,captures}),r=R.coach({coachId:'andy',sessionReports:[a]});assert.equal(r.coachId,'andy');assert.equal(r.sessions,1);assert.equal(r.lifecycleActions.edit,2);assert.equal(r.capturesByType.voice,1);assert.equal(Object.prototype.hasOwnProperty.call(r,'rating'),false);assert.equal(Object.prototype.hasOwnProperty.call(r,'goodCoach'),false);
});

test('inactive/retired captures are excluded from active evidence totals',()=>{
 const s=Reporting.captureSummary(captures);assert.equal(s.total,2);assert.equal(s.byType.photo,undefined);assert.equal(s.byAthlete.a,2);assert.equal(s.byAthlete.b,1);
});

test('reporting is read-only across all supplied facts',()=>{
 const args={session,lifecycleRecord:lifecycle,delivery,dose,planContext:plan,attendanceSummary:attendance,captures},before=JSON.stringify(args);R.session(args);assert.equal(JSON.stringify(args),before);
});

if(fails){console.error(`\n${fails} Reporting regression(s) failed`);process.exit(1)}
console.log('\nALL REPORTING REGRESSIONS PASS');
