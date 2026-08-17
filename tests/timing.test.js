'use strict';
const assert=require('assert');
const Evidence=require('../engines/evidence-retrieval.js');
const Timing=require('../engines/timing.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const evidence=Evidence.create({sources:[{id:'athletes',priority:100,trust:'verified',data:{athletes:[{id:'a',full_name:'A Swimmer',active:true},{id:'b',full_name:'B Swimmer',active:true},{id:'c',full_name:'C Swimmer',active:true}]}}]});
const session={id:'timing-session',identity:{date:'2026-08-18',dayPart:'AM',course:'SCM'}};
function clocks(){let iso=0;return{clockIso:()=>`2026-08-18T06:00:${String(iso++).padStart(2,'0')}+12:00`,clockMs:()=>100000}}
function engine(initial=null){return Timing.create({storage:new Timing.MemoryStorage(initial),evidence,...clocks()})}

test('boot is read-only and creates no phantom heat',()=>{const storage=new Timing.MemoryStorage({schema:Timing.SCHEMA,heats:[],updatedAt:'old'});Timing.create({storage,evidence,...clocks()});assert.equal(storage.reads,1);assert.equal(storage.writes,0);assert.equal(storage.value.heats.length,0)});

test('one heat can time multiple swimmers independently from the same start',()=>{
 const t=engine(),h=t.begin(session,{id:'heat-1',blockId:'block',itemId:'item',athleteIds:['a','b'],distance:400,stroke:'Freestyle',typeKey:'t400_freestyle',startMs:100000});t.lap(h.id,'a',{atMs:180000,label:'200'});t.finish(h.id,'a',{atMs:320000});assert.equal(t.heat(h.id).status,'running');t.lap(h.id,'b',{atMs:185000,label:'200'});t.finish(h.id,'b',{atMs:330000});const a=t.result(h.id,'a'),b=t.result(h.id,'b');assert.equal(a.result_seconds,220);assert.equal(b.result_seconds,230);assert.equal(a.laps[0].elapsed_seconds,80);assert.equal(b.laps[0].elapsed_seconds,85);assert.equal(t.heat(h.id).status,'finished');
});

test('lap split is independent and calculated from previous lap for that swimmer',()=>{
 const t=engine(),h=t.begin(session,{athleteIds:['a'],startMs:1000,distance:200});t.lap(h.id,'a',{atMs:31000,label:'50'});t.lap(h.id,'a',{atMs:63000,label:'100'});const r=t.result(h.id,'a');assert.equal(r.laps[0].split_seconds,30);assert.equal(r.laps[1].split_seconds,32);assert.equal(r.laps[1].elapsed_seconds,62);
});

test('one swimmer finishing never stops another swimmer stopwatch',()=>{
 const t=engine(),h=t.begin(session,{athleteIds:['a','b'],startMs:0,distance:100});t.finish(h.id,'a',{atMs:60000});assert.equal(t.result(h.id,'a').status,'finished');assert.equal(t.result(h.id,'b').status,'running');assert.equal(t.heat(h.id).status,'running');t.finish(h.id,'b',{atMs:65000});assert.equal(t.heat(h.id).status,'finished');
});

test('T400 finished result produces evidence-shaped training test record with exact lineage',()=>{
 const t=engine(),h=t.begin(session,{id:'t400-heat',blockId:'test-block',itemId:'test-item',athleteIds:['a'],distance:400,stroke:'Freestyle',course:'SCM',typeKey:'t400_freestyle',startMs:100000});t.finish(h.id,'a',{atMs:424600});const r=t.trainingTestResult(h.id,'a');assert(r);assert.equal(r.athlete_id,'a');assert.equal(r.test_key,'t400_freestyle');assert(Math.abs(r.result_seconds-324.6)<1e-9);assert.equal(r.pool_course,'SCM');assert.equal(r.valid_for_anchor,true);assert.equal(r.source_session_id,'timing-session');assert.equal(r.source_block_id,'test-block');assert.equal(r.source_item_id,'test-item');
});

test('non-T400 timing never masquerades as a T400 training-test result',()=>{
 const t=engine(),h=t.begin(session,{athleteIds:['a'],distance:100,typeKey:'timed_set',startMs:0});t.finish(h.id,'a',{atMs:60000});assert.equal(t.trainingTestResult(h.id,'a'),null);
});

test('unfinished and DNS swimmers do not produce T400 anchors',()=>{
 const t=engine(),h=t.begin(session,{athleteIds:['a','b'],distance:400,typeKey:'t400_freestyle',startMs:0});t.markDns(h.id,'a',{note:'shoulder'});assert.equal(t.trainingTestResult(h.id,'a'),null);assert.equal(t.trainingTestResult(h.id,'b'),null);
});

test('timing exact context is retained on result',()=>{
 const t=engine(),h=t.begin(session,{blockId:'b1',itemId:'i1',athleteIds:['a'],distance:50,stroke:'Butterfly',course:'LCM',label:'Race pace 50',startMs:0});t.finish(h.id,'a',{atMs:30000});const r=t.result(h.id,'a');assert.equal(r.session_id,'timing-session');assert.equal(r.block_id,'b1');assert.equal(r.item_id,'i1');assert.equal(r.distance,50);assert.equal(r.stroke,'Butterfly');assert.equal(r.pool_course,'LCM');assert.equal(r.label,'Race pace 50');
});

test('unknown swimmer and swimmer outside heat are rejected',()=>{
 const t=engine(),h=t.begin(session,{athleteIds:['a'],startMs:0});assert.throws(()=>t.lap(h.id,'Imaginary',{atMs:1000}),/Athlete not found/);assert.throws(()=>t.lap(h.id,'b',{atMs:1000}),/not in timing heat/);
});

test('lap timestamps cannot go backwards',()=>{
 const t=engine(),h=t.begin(session,{athleteIds:['a'],startMs:10000});t.lap(h.id,'a',{atMs:20000});assert.throws(()=>t.lap(h.id,'a',{atMs:19000}),/cannot go backwards/);assert.throws(()=>t.finish(h.id,'a',{atMs:5000}),/Invalid stopwatch timestamp/);
});

test('reopen preserves running heat without creating or stopping it',()=>{
 const storage=new Timing.MemoryStorage(),t=Timing.create({storage,evidence,...clocks()}),h=t.begin(session,{id:'running',athleteIds:['a','b'],startMs:100000});t.lap(h.id,'a',{atMs:120000});const writes=storage.writes,reopened=Timing.create({storage,evidence,...clocks()});assert.equal(storage.writes,writes);assert.equal(reopened.heat('running').status,'running');assert.equal(reopened.result('running','a').laps.length,1);assert.equal(reopened.result('running','b').status,'running');
});

test('Timing Engine never changes athlete evidence',()=>{
 const before=JSON.stringify(evidence.listAthletes()),t=engine(),h=t.begin(session,{athleteIds:['a'],startMs:0});t.finish(h.id,'a',{atMs:60000});assert.equal(JSON.stringify(evidence.listAthletes()),before);
});

if(fails){console.error(`\n${fails} Timing regression(s) failed`);process.exit(1)}
console.log('\nALL TIMING REGRESSIONS PASS');
