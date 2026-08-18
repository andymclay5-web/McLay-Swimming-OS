'use strict';
const assert=require('assert');
const Timing=require('../engines/timing.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const athletes=[{id:'a',full_name:'A Swimmer'},{id:'b',full_name:'B Swimmer'},{id:'c',full_name:'C Swimmer'}];
const entities={resolveAthlete(ref){const key=typeof ref==='string'?ref:ref?.id;return athletes.find(x=>x.id===key||x.full_name===key)||null},athleteId(ref){return this.resolveAthlete(ref)?.id||null}};
function clock(){let n=0;return()=>`2026-08-18T15:10:${String(n++).padStart(2,'0')}+12:00`}
function engine(initial=null){return Timing.create({storage:new Timing.MemoryStorage(initial),entities,clock:clock()})}

test('boot is read-only and creates no phantom timing session',()=>{const storage=new Timing.MemoryStorage({schema:Timing.SCHEMA,sessions:[],journal:[],updatedAt:'old'});Timing.create({storage,entities,clock:clock()});assert.equal(storage.reads,1);assert.equal(storage.writes,0);assert.equal(storage.value.sessions.length,0)});

test('timing session retains exact external context without interpreting it',()=>{const t=engine(),s=t.createSession({id:'timing-1',context:{sessionId:'training-1',blockId:'b1',itemId:'i1',testProtocolId:'protocol-x'},course:'SCM',poolLength:25,label:'Tuesday test'});assert.deepEqual(s.context,{training_session_id:'training-1',block_id:'b1',item_id:'i1',test_protocol_id:'protocol-x',meet_id:null,event_id:null,race_id:null});assert.equal(s.course,'SCM');assert.equal(s.pool_length_m,25)});

test('one timing session can measure multiple swimmers independently including shared lane',()=>{const t=engine();t.createSession({id:'multi',course:'SCM',poolLength:25});t.assignAthlete('multi','a',{lane:1,position:1});t.assignAthlete('multi','b',{lane:1,position:2});t.start('multi');t.recordSplit('multi','a',{distance:100,elapsedSeconds:80});t.recordSplit('multi','b',{distance:100,elapsedSeconds:85});t.finishAthlete('multi','a',{distance:200,elapsedSeconds:165});assert.equal(t.get('multi').status,'running');t.finishAthlete('multi','b',{distance:200,elapsedSeconds:175});assert.equal(t.timeline('multi','a').at(-1).elapsed_seconds,165);assert.equal(t.timeline('multi','b').at(-1).elapsed_seconds,175);t.closeSession('multi');assert.equal(t.get('multi').status,'finished')});

test('measurement distance and elapsed time must increase per swimmer',()=>{const t=engine();t.createSession({id:'ordered'});t.assignAthlete('ordered','a');t.start('ordered');t.recordSplit('ordered','a',{distance:100,elapsedSeconds:75});assert.throws(()=>t.recordSplit('ordered','a',{distance:100,elapsedSeconds:80}),/distance must increase/);assert.throws(()=>t.recordSplit('ordered','a',{distance:200,elapsedSeconds:70}),/elapsed time must increase/)});

test('one swimmer finish never stops another swimmer',()=>{const t=engine();t.createSession({id:'finish-independent'});t.assignAthlete('finish-independent','a');t.assignAthlete('finish-independent','b');t.start('finish-independent');t.finishAthlete('finish-independent','a',{distance:100,elapsedSeconds:60});t.recordSplit('finish-independent','b',{distance:50,elapsedSeconds:31});assert.equal(t.get('finish-independent').status,'running');assert.equal(t.timeline('finish-independent','b').length,1)});

test('correction is explicit journalled measurement revision and preserves neighbouring order',()=>{const t=engine();t.createSession({id:'correct'});t.assignAthlete('correct','a');t.start('correct');const a=t.recordSplit('correct','a',{distance:100,elapsedSeconds:80});t.finishAthlete('correct','a',{distance:200,elapsedSeconds:170});const changed=t.correctMeasurement('correct',a.id,{elapsedSeconds:82,note:'late tap correction',coachId:'andy'});assert.equal(changed.revision,2);assert.equal(changed.elapsed_seconds,82);assert.throws(()=>t.correctMeasurement('correct',a.id,{elapsedSeconds:180}),/later measurement/);assert(t.history('correct').some(x=>x.action==='correct'&&x.before.elapsed_seconds===80&&x.after.elapsed_seconds===82))});

test('retired measurement remains in audit but disappears from normal timeline',()=>{const t=engine();t.createSession({id:'retire'});t.assignAthlete('retire','a');t.start('retire');const m=t.recordSplit('retire','a',{distance:50,elapsedSeconds:30});t.retireMeasurement('retire',m.id,{note:'accidental tap'});assert.equal(t.timeline('retire','a').length,0);assert.equal(t.timeline('retire','a',{includeRetired:true})[0].status,'retired');assert(t.history('retire').some(x=>x.action==='retire'))});

test('unassigned or unknown swimmers cannot receive measurements',()=>{const t=engine();t.createSession({id:'identity'});t.assignAthlete('identity','a');t.start('identity');assert.throws(()=>t.recordSplit('identity','b',{distance:50,elapsedSeconds:30}),/not assigned/);assert.throws(()=>t.recordSplit('identity','Imaginary',{distance:50,elapsedSeconds:30}),/Athlete not found/)});

test('reopen preserves running timing state without writing or inventing progress',()=>{const storage=new Timing.MemoryStorage(),t=Timing.create({storage,entities,clock:clock()});t.createSession({id:'running'});t.assignAthlete('running','a');t.start('running');t.recordSplit('running','a',{distance:100,elapsedSeconds:75});const writes=storage.writes,reopened=Timing.create({storage,entities,clock:clock()});assert.equal(storage.writes,writes);assert.equal(reopened.get('running').status,'running');assert.equal(reopened.timeline('running','a')[0].elapsed_seconds,75)});

test('Timing stores measurements only and never marks a result as T400-valid or training-anchor evidence',()=>{const t=engine();t.createSession({id:'no-meaning',context:{testProtocolId:'t400-freestyle'}});t.assignAthlete('no-meaning','a');t.start('no-meaning');t.finishAthlete('no-meaning','a',{distance:400,elapsedSeconds:324.6});const json=JSON.stringify(t.get('no-meaning'));assert(!/valid_for_anchor|test_key|aerobic|threshold/i.test(json));assert.equal(t.get('no-meaning').context.test_protocol_id,'t400-freestyle')});

if(fails){console.error(`\n${fails} Timing regression(s) failed`);process.exit(1)}
console.log('\nALL TIMING REGRESSIONS PASS');
