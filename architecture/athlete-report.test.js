'use strict';
const assert=require('node:assert/strict');
const A=require('./athlete-session-core');
const R=require('./athlete-report-core');
const session={id:'mix',identity:{date:'2026-08-22',title:'Mixed AM',squads:['National','Development'],course:'SCM'},blocks:[
 {id:'wu',title:'Warm Up',items:[{id:'n1',kind:'set',reps:4,distance:100,stroke:'Freestyle',raw:'4 x 100 National warm up'}]},
 {id:'main',title:'Main',items:[{id:'m1',kind:'set',reps:4,distance:100,stroke:'Freestyle',zone:'Development',raw:'4 x 100 Development'},{id:'m2',kind:'set',reps:3,distance:50,stroke:'Butterfly',raceIntent:{distance:200},raw:'3 x 50 Fly @ 200 Pace'},{id:'m3',kind:'set',reps:4,distance:100,stroke:'Freestyle',zone:'Threshold',raw:'4 x 100 Threshold'}]},
 {id:'post',title:'Post',items:[{id:'p1',kind:'set',reps:4,distance:200,stroke:'Freestyle',raw:'4 x 200 Pull'}]}
],finish:{throughItemId:'p1',throughBlockId:'post',finishedAt:'2026-08-22T09:00:00Z'}};
const developmentStart=A.makeSquadStart({session,squad:'Development',itemId:'m1',blockId:'main',label:'4 x 100 Development',joinWork:{text:'300 easy + build warm-up',metres:300,strokes:{Freestyle:300}}});
const charlotte={id:'charlotte',full_name:'Charlotte Murphy',squad:'Development'};
const charlotteEnd=A.makeEnd({session,athleteId:'charlotte',itemId:'m2',blockId:'main',label:'3 x 50 Fly @ 200 Pace'});
const amber={id:'amber',full_name:'Amber Proudfoot',squad:'Development'};
const amberStart=A.makeStart({session,athleteId:'amber',itemId:'m2',blockId:'main',label:'3 x 50 Fly @ 200 Pace',joinWork:{text:'200 own warm-up',metres:200,strokes:{Freestyle:200}}});
const amberEnd=A.makeEnd({session,athleteId:'amber',itemId:'m3',blockId:'main',label:'4 x 100 Threshold'});
const attendance=[{session_id:'mix',athlete_id:'charlotte',status:'modified'},{session_id:'mix',athlete_id:'amber',status:'modified'}];
const captures=[
 {id:'g-before',session_id:'mix',block_id:'wu',capture_type:'note',text_content:'National-only warm-up note',created_at:'2026-08-22T07:00:00Z'},
 {id:'g-main',session_id:'mix',item_id:'m1',capture_type:'note',text_content:'General group cue',created_at:'2026-08-22T07:20:00Z'},
 {id:'g-session',session_id:'mix',capture_type:'note',text_content:'Whole session group note',created_at:'2026-08-22T07:30:00Z'},
 {id:'c-video',session_id:'mix',athlete_ids:['charlotte'],item_id:'m2',capture_type:'video',title:'Charlotte fly',created_at:'2026-08-22T07:40:00Z'},
 {id:'a-note',session_id:'mix',athlete_id:'amber',item_id:'m3',capture_type:'voice',text_content:'Amber body line',created_at:'2026-08-22T08:00:00Z'}
];
const prescribe=(s,item,athlete)=>{
 if(athlete.id==='charlotte'&&item.id==='m1')return{item:{...item,reps:2},target:{status:'ok',seconds:95,sendOff:105}};
 if(athlete.id==='charlotte'&&item.id==='m2')return{item:{...item,reps:2},target:{status:'rep_race',rows:[{rep:1,status:'ok',seconds:42,sendOff:60},{rep:2,status:'ok',seconds:42,sendOff:75}]}};
 if(athlete.id==='amber'&&item.id==='m2')return{item:{...item,reps:2,raw:'2 x 50 Upper-body choice @ 200 Pace'},target:{status:'rep_race',rows:[{rep:1,status:'ok',seconds:38,sendOff:60},{rep:2,status:'ok',seconds:38,sendOff:75}]}};
 if(athlete.id==='amber'&&item.id==='m3')return{item:{...item,reps:2},target:{status:'ok',seconds:88,sendOff:98}};
 return{item,target:{status:'none'}};
};
const charlotteProjection=R.athleteSessionProjection({session,athlete:charlotte,attendance,athleteSessionBoundaries:[charlotteEnd],squadSessionBoundaries:[developmentStart],prescribe,captures});
assert.equal(charlotteProjection.kind,'athlete_session_projection');
assert.equal(charlotteProjection.lineage.canonicalSessionId,'mix');
assert.equal(charlotteProjection.lineage.noDuplicateCanonicalSession,true);
assert.equal(charlotteProjection.start.source,'squad_start');
assert.equal(charlotteProjection.start.joinWork.metres,300);
assert.equal(charlotteProjection.finish.source,'athlete_end');
assert.equal(charlotteProjection.metres.recorded,600,'300 warm-up + 200 modified development + 100 modified fly');
assert.equal(charlotteProjection.blocks[0].label,'Join warm-up');
const charM1=charlotteProjection.blocks.flatMap(b=>b.items).find(x=>x.canonicalItemId==='m1');
assert.equal(charM1.metres,200);
assert.equal(charM1.target.seconds,95);
assert.equal(charM1.target.sendOff,105);
assert.equal(charlotteProjection.evidence.namedCount,1);
assert.equal(charlotteProjection.evidence.groupCount,2,'group cue in her window plus session-level group note');
assert(!charlotteProjection.evidence.combined.some(x=>x.id==='g-before'),'group capture before squad start must not leak into individual history');
assert(charlotteProjection.evidence.combined.some(x=>x.id==='c-video'&&x.evidence_scope==='named'));
const amberProjection=R.athleteSessionProjection({session,athlete:amber,attendance,athleteSessionBoundaries:[amberStart,amberEnd],squadSessionBoundaries:[developmentStart],prescribe,captures});
assert.equal(amberProjection.start.source,'athlete_start','individual late arrival overrides Development squad start');
assert.equal(amberProjection.start.joinWork.metres,200);
assert.equal(amberProjection.finish.source,'athlete_end');
assert.equal(amberProjection.metres.recorded,500,'200 warm-up + 100 modified fly + 200 modified threshold');
const amberM2=amberProjection.blocks.flatMap(b=>b.items).find(x=>x.canonicalItemId==='m2');
assert.match(amberM2.label,/Upper-body choice/);
assert.equal(amberM2.target.rows[0].seconds,38);
assert.equal(amberProjection.evidence.namedCount,1);
assert.equal(amberProjection.evidence.groupCount,1,'session-level general note follows attended swimmer; m1 cue is before Amber start');
assert(!amberProjection.evidence.combined.some(x=>x.id==='g-main'));
assert(amberProjection.evidence.combined.some(x=>x.id==='a-note'));
console.log('athlete-report-be: 25 assertions passed');
