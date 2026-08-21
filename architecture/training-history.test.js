'use strict';
const assert=require('assert');
const T=require('./training-history-core');
const athlete={id:'charlotte',full_name:'Charlotte Murphy',squad:'National'};
const sessions=[
 {id:'s1',identity:{date:'2026-08-22',title:'Saturday AM Rainbow',squads:['National'],course:'SCM'},finish:{actualDistance:5450},blocks:[
   {id:'warm',title:'Warm Up',items:[{id:'w1',kind:'set',reps:4,distance:100,stroke:'Freestyle',zone:'Regeneration',raw:'4 x 100 Regeneration'}]},
   {id:'main',title:'Main Set',items:[{id:'m1',kind:'set',reps:4,distance:150,stroke:'Freestyle',repPattern:[{rep:1,zone:'Overload'},{rep:2,zone:'Overload'},{rep:3,zone:'Threshold'},{rep:4,zone:'Threshold'}],raw:'4 x 150 Overload to Threshold'},{id:'m2',kind:'set',reps:3,distance:50,stroke:'Butterfly',raceIntent:{distance:200},raw:'3 x 50 Fly @ 200 Pace'}]}
 ]},
 {id:'s0',identity:{date:'2026-08-18',title:'Tuesday AM',squads:['National'],course:'SCM'},finish:{actualDistance:5000},blocks:[{id:'b',title:'Main',items:[{id:'x',kind:'set',reps:5,distance:200,stroke:'Freestyle',zone:'Development',raw:'5 x 200 Development'}]}]},
 {id:'future',identity:{date:'2026-08-24',title:'Monday AM',squads:['National'],course:'SCM'},blocks:[{id:'b',title:'Main',items:[{id:'f',kind:'set',reps:4,distance:200,stroke:'Freestyle',zone:'Development',raw:'4 x 200 Development'}]}]}
];
const attendance=[{session_id:'s1',athlete_id:'charlotte',status:'modified'},{session_id:'s0',athlete_id:'charlotte',status:'present'}];
const prescribe=(session,item)=>{
 if(session.id==='s1'&&item.id==='w1')return{item:{...item,reps:2},target:{status:'ok',seconds:95,sendOff:105}};
 if(session.id==='s1'&&item.id==='m1')return{item:{...item,reps:2,repPattern:[{rep:1,zone:'Overload'},{rep:2,zone:'Threshold'}]},target:{status:'pattern',rows:[{rep:1,zone:'Overload',seconds:110},{rep:2,zone:'Threshold',seconds:106}]}};
 if(session.id==='s1'&&item.id==='m2')return{item:{...item,reps:2},target:{status:'rep_race',rows:[{rep:1,status:'ok',seconds:36},{rep:2,status:'ok',seconds:36}]}};
 return{item,target:{status:'none'}};
};
const performance={bestEvents:[{key:'SCM|200|Butterfly',distance:200,stroke:'Butterfly',course:'SCM',seconds:153,points:110},{key:'SCM|100|Breaststroke',distance:100,stroke:'Breaststroke',course:'SCM',seconds:120,points:100}],gaps:[{key:'SCM|200|Butterfly',next:{label:'MQS +20%',seconds:140}}]};
const view=T.athleteTrainingView({athlete,sessions,attendance,prescribe,captures:[],performance,asOf:new Date('2026-08-22T10:00:00Z'),currentSessionId:'s1'});
assert(view.today,'today missing');
assert.equal(view.today.prescribedMetres,600);
assert.equal(view.today.evidenceCount,0);
assert(view.today.targets.length===3,'targets should exist without captures');
assert.equal(view.today.zones.Regeneration,200);
assert.equal(view.today.zones.Overload,150);
assert.equal(view.today.zones.Threshold,150);
assert.equal(view.today.strokes.Butterfly,100);
assert.equal(view.week.sessions,2);
assert.equal(view.week.confirmedDeliveredMetres,1600);
assert.equal(view.upcoming.length,1);
assert.equal(view.upcoming[0].sessionId,'future');
assert.equal(view.performanceLinks[0].event,'200 Butterfly');
assert(view.performanceLinks[0].recentStrokeMetres7===100);
assert(/not proof of causation/.test(view.performanceLinks[0].claim));
const finishedWithSnapshot={id:'snap',identity:{date:'2026-08-20',title:'Snapshot session',squads:['National'],course:'SCM'},finish:{actualDistance:1200,attendanceSnapshot:[{session_id:'snap',athlete_id:'charlotte',status:'present'}]},blocks:[{id:'b',title:'Main',items:[{id:'i',kind:'set',reps:6,distance:200,stroke:'Freestyle',zone:'Development',raw:'6 x 200 Development'}]}]};
const snapshotRecord=T.recordSession({session:finishedWithSnapshot,athlete,attendance:[]});
assert.equal(snapshotRecord.participation.status,'attended');
assert.equal(snapshotRecord.participation.source,'finish-snapshot');
assert.equal(snapshotRecord.delivery,'delivered-prescription');
const globalSnap={snap2:{rows:[{session_id:'snap2',athlete_id:'charlotte',status:'modified'}]}};
const globalSnapSession={id:'snap2',identity:{date:'2026-08-19',title:'Stored snapshot',squads:['National'],course:'SCM'},finish:{actualDistance:400},blocks:[{id:'b2',title:'Main',items:[{id:'i2',kind:'set',reps:4,distance:100,stroke:'IM',raw:'4 x 100 IM'}]}]};
const globalSnapshotRecord=T.recordSession({session:globalSnapSession,athlete,attendance:[],attendanceSnapshots:globalSnap});
assert.equal(globalSnapshotRecord.participation.status,'attended');
assert.equal(globalSnapshotRecord.participation.source,'attendance-snapshot');
console.log('training-history-bc: 19 assertions passed');
