'use strict';
const assert=require('assert');
const Protocol=require('../engines/test-protocol.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function clock(){let n=0;return()=>`2026-08-18T15:20:${String(n++).padStart(2,'0')}+12:00`}
function engine(initial=null,protocols=[]){return Protocol.create({storage:new Protocol.MemoryStorage(initial),protocols,clock:clock()})}

test('boot is read-only and exposes canonical T400 definition without persisting',()=>{const storage=new Protocol.MemoryStorage();const p=Protocol.create({storage,clock:clock()});assert.equal(storage.reads,1);assert.equal(storage.writes,0);const t=p.resolve('t400_freestyle');assert(t);assert.equal(t.id,'protocol-t400-freestyle');assert.equal(t.distance_m,400);assert.equal(t.stroke,'Freestyle');assert.deepEqual(t.allowed_courses,['SCM','LCM'])});

test('T400 is a test protocol and not a training zone definition',()=>{const p=engine(),t=p.resolve('t400_freestyle'),json=JSON.stringify(t);assert(t.downstream_roles.includes('training_target_anchor'));assert(!/threshold|development|overload|regeneration|training_zone/i.test(json))});

test('valid SCM T400 observation passes with normalized evidence fields only',()=>{const p=engine(),v=p.validateObservation('t400_freestyle',{distance:400,stroke:'free',course:'SCM',poolLength:25,elapsedSeconds:324.6,splits:[{distance:100,elapsedSeconds:80},{distance:200,elapsedSeconds:161},{distance:300,elapsedSeconds:243}]});assert.equal(v.ok,true);assert.equal(v.normalized.test_key,'t400_freestyle');assert.equal(v.normalized.elapsed_seconds,324.6);assert.equal(v.normalized.stroke,'Freestyle');assert.equal(v.normalized.course,'SCM');assert.equal(v.normalized.splits.length,3)});

test('protocol rejects wrong distance course stroke or pool length without interpreting performance quality',()=>{const p=engine();for(const [spec,pattern] of [[{distance:300,stroke:'free',course:'SCM',elapsedSeconds:240},/Distance/],[{distance:400,stroke:'fly',course:'SCM',elapsedSeconds:240},/Stroke/],[{distance:400,stroke:'free',course:'XYZ',elapsedSeconds:240},/Course/],[{distance:400,stroke:'free',course:'SCM',poolLength:50,elapsedSeconds:240},/Pool length/]]){const v=p.validateObservation('t400_freestyle',spec);assert.equal(v.ok,false);assert(v.reasons.some(x=>pattern.test(x)))}});

test('split validation protects monotonic raw measurement structure',()=>{const p=engine();let v=p.validateObservation('t400_freestyle',{distance:400,stroke:'free',course:'SCM',elapsedSeconds:300,splits:[{distance:100,elapsedSeconds:80},{distance:90,elapsedSeconds:150}]});assert.equal(v.ok,false);assert(v.reasons.some(x=>/Split distances/.test(x)));v=p.validateObservation('t400_freestyle',{distance:400,stroke:'free',course:'SCM',elapsedSeconds:300,splits:[{distance:100,elapsedSeconds:80},{distance:200,elapsedSeconds:70}]});assert(v.reasons.some(x=>/Split elapsed/.test(x)))});

test('custom protocol definitions are explicit versioned writes with journal history',()=>{const p=engine();const a=p.upsert({id:'protocol-200-kick',test_key:'t200_kick',name:'200 Kick',distance_m:200,stroke:'Freestyle',allowed_courses:['SCM'],required_fields:['elapsed_seconds','course']},{coachId:'andy',note:'new test'});assert.equal(a.protocol_version,1);const b=p.upsert({...a,optional_fields:['splits','stroke_count']},{coachId:'andy',note:'add optional metric'});assert.equal(b.protocol_version,2);assert.deepEqual(p.history('protocol-200-kick').map(x=>x.action),['create','update'])});

test('retired protocol stays in history but cannot validate as active',()=>{const p=engine();p.upsert({id:'old',test_key:'old_test',distance_m:100,stroke:'Freestyle',allowed_courses:['SCM']});p.retire('old',{note:'superseded'});assert.equal(p.resolve('old').active,false);assert.equal(p.list().some(x=>x.id==='old'),false);const v=p.validateObservation('old',{distance:100,stroke:'Free',course:'SCM',elapsedSeconds:60});assert.equal(v.ok,false);assert(v.reasons.includes('Protocol is inactive'))});

test('unknown protocol fails explicitly rather than falling through to T400',()=>{const p=engine(),v=p.validateObservation('mystery',{distance:400,course:'SCM',stroke:'Free',elapsedSeconds:300});assert.equal(v.ok,false);assert.equal(v.status,'missing_protocol');assert.equal(v.protocol,null)});

if(fails){console.error(`\n${fails} Test Protocol regression(s) failed`);process.exit(1)}
console.log('\nALL TEST PROTOCOL REGRESSIONS PASS');
