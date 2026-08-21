'use strict';
const assert=require('node:assert/strict');
const A=require('./athlete-session-core');
const T=require('./training-history-core');
const athlete={id:'charlotte',full_name:'Charlotte Murphy',squad:'National'};
const session={id:'sat',identity:{date:'2026-08-22',title:'Saturday AM',squads:['National'],course:'SCM'},blocks:[
 {id:'wu',title:'Warm Up',items:[{id:'w',kind:'set',reps:2,distance:100,stroke:'Freestyle',raw:'2 x 100 Free'}]},
 {id:'main',title:'Main Set',items:[{id:'m',kind:'set',reps:4,distance:100,stroke:'Freestyle',zone:'Development',raw:'4 x 100 Development'}]},
 {id:'post',title:'Post Set',items:[{id:'p',kind:'set',reps:5,distance:200,stroke:'Freestyle',raw:'5 x 200 Pull'}]},
 {id:'wd',title:'Warm Down',items:[{id:'d',kind:'set',reps:1,distance:200,stroke:'Choice',raw:'200 Easy'}]}
],finish:{throughItemId:'p',throughBlockId:'post',roundByGroup:{},actualDistance:1600,finishedAt:'2026-08-22T08:00:00Z'}};
const attendance=[{session_id:'sat',athlete_id:'charlotte',status:'modified'}];
const prescribe=(s,item)=>{const reps={w:1,m:2,p:3,d:1}[item.id]||item.reps;return{item:{...item,reps},target:{status:'none'}};};
let record=T.recordSession({session,athlete,attendance,prescribe});
assert.equal(record.prescribedMetres,1100,'planned individual prescription');
assert.equal(record.deliveredMetres,900,'normal attended swimmer stops at squad actual finish');
assert.equal(record.delivery,'delivered-prescription');
assert.equal(record.blocks.at(-1).id,'post');
const early=A.makeEnd({session,athleteId:'charlotte',itemId:'m',blockId:'main',label:'4 x 100 Development'});
record=T.recordSession({session,athlete,attendance,athleteSessionBoundaries:[early],prescribe});
assert.equal(record.deliveredMetres,300,'early swimmer stops at individual boundary');
assert.equal(record.delivery,'ended-early');
assert.match(record.endLabel,/4 x 100 Development/);
assert.equal(record.participation.status,'attended','ending early must not erase attendance');
const normal={id:'seth',full_name:'Seth Knights',squad:'National'};
record=T.recordSession({session,athlete:normal,attendance:[{session_id:'sat',athlete_id:'seth',status:'present'}],prescribe:(s,i)=>({item:i,target:{status:'none'}})});
assert.equal(record.deliveredMetres,1600,'normal swimmer needs no per-rep monitoring; squad finish is enough');
assert.equal(record.prescribedMetres,1800);
const repeat={id:'repeat',identity:{date:'2026-08-22'},blocks:[{id:'b',title:'Main',items:[{id:'g',kind:'group',rounds:2,text:'2 Rounds',items:[{id:'a',kind:'set',reps:4,distance:100,raw:'4 x 100'},{id:'b2',kind:'set',reps:2,distance:50,raw:'2 x 50'}]}]}],finish:{throughItemId:'a',throughBlockId:'b',roundByGroup:{g:2}}};
const win=A.deliveryWindow({session:repeat,athleteId:'x'});
assert.equal(win.rows.length,3,'round-aware finish includes full round one plus selected line in round two');
assert.deepEqual(win.rows.map(r=>[r.item.id,r.roundPath[0]?.round]),[['a',1],['b2',1],['a',2]]);
console.log('athlete-session-bd: 15 assertions passed');
