'use strict';
const assert=require('assert');
const Portal=require('../rebuild/engine-portal.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function clock(){let n=0;return()=>`2026-08-18T13:45:${String(n++).padStart(2,'0')}+12:00`}
function base(){return Portal.create({clock:clock(),maxDepth:8})}

test('registered service exposes only declared query and command surface',()=>{
 const p=base();p.register({id:'evidence',version:'1',queries:{pb:()=>({seconds:60})},commands:{store:()=>({ok:true})}});assert.deepEqual(Object.keys(p.describe('evidence').queries),['pb']);assert.deepEqual(Object.keys(p.describe('evidence').commands),['store']);
});

test('caller must explicitly declare each cross-engine query permission',()=>{
 const p=base();p.register({id:'evidence',queries:{pb:()=>({seconds:60})}});p.register({id:'pathway',calls:{query:{evidence:['pb']}}});p.seal();assert.equal(p.client('pathway').query('evidence','pb',{}).seconds,60);
});

test('undeclared cross-engine access fails closed',()=>{
 const p=base();p.register({id:'evidence',queries:{pb:()=>({seconds:60})}});p.register({id:'board'});p.seal();assert.throws(()=>p.client('board').query('evidence','pb',{}),e=>e.code==='CALL_NOT_ALLOWED');
});

test('query permission does not grant command permission',()=>{
 const p=base();let writes=0;p.register({id:'attendance',queries:{summary:()=>({here:0})},commands:{mark:()=>{writes++;return{ok:true}}}});p.register({id:'board',calls:{query:{attendance:['summary']}}});p.seal();assert.equal(p.client('board').query('attendance','summary',{}).here,0);assert.throws(()=>p.client('board').command('attendance','mark',{athleteId:'a'}),e=>e.code==='CALL_NOT_ALLOWED');assert.equal(writes,0);
});

test('service may call a declared dependency through its injected portal client',()=>{
 const p=base();p.register({id:'evidence',queries:{t400:input=>({athleteId:input.athleteId,seconds:324.6})}});p.register({id:'targets',calls:{query:{evidence:['t400']}},queries:{development:{handler:(input,{client})=>{const ev=client.query('evidence','t400',{athleteId:input.athleteId});return{target:ev.seconds/4*1.024}}}}});p.register({id:'board',calls:{query:{targets:['development']}}});p.seal();const r=p.client('board').query('targets','development',{athleteId:'molly'});assert(Math.abs(r.target-83.0976)<1e-9);const trail=p.auditTrail();assert.equal(trail.length,2);assert.equal(new Set(trail.map(x=>x.causeId)).size,1);assert.equal(trail.find(x=>x.target==='evidence').caller,'targets');
});

test('service cannot secretly reach a dependency it did not declare',()=>{
 const p=base();p.register({id:'evidence',queries:{pb:()=>({seconds:60})}});p.register({id:'targets',queries:{race:{handler:(_,{client})=>client.query('evidence','pb',{})}}});p.register({id:'board',calls:{query:{targets:['race']}}});p.seal();assert.throws(()=>p.client('board').query('targets','race',{}),e=>e.code==='CALL_NOT_ALLOWED');
});

test('input and output validators enforce engine contracts at the portal boundary',()=>{
 const p=base();p.register({id:'results',queries:{pb:{validateInput:x=>x.athleteId?true:'athleteId required',validateOutput:x=>Number.isFinite(x.seconds)?true:'seconds required',handler:x=>({athleteId:x.athleteId,seconds:58.72})}}});p.register({id:'profile',calls:{query:{results:['pb']}}});p.seal();assert.throws(()=>p.client('profile').query('results','pb',{}),e=>e.code==='CONTRACT_VALIDATION');assert.equal(p.client('profile').query('results','pb',{athleteId:'luke'}).seconds,58.72);
});

test('portal clones request and response data so callers cannot mutate engine-owned objects',()=>{
 const source={pb:{seconds:60,splits:[29,31]}};const p=base();p.register({id:'results',queries:{pb:()=>source.pb}});p.register({id:'profile',calls:{query:{results:['pb']}}});p.seal();const got=p.client('profile').query('results','pb',{});got.seconds=1;got.splits.push(99);assert.equal(source.pb.seconds,60);assert.deepEqual(source.pb.splits,[29,31]);
});

test('graph validation rejects declared operations that do not exist',()=>{
 const p=base();p.register({id:'evidence',queries:{pb:()=>({})}});p.register({id:'targets',calls:{query:{evidence:['t400']}}});const g=p.validateGraph();assert.equal(g.ok,false);assert(g.errors.some(x=>/t400/.test(x)));assert.throws(()=>p.seal(),e=>e.code==='INVALID_GRAPH');
});

test('sealed portal cannot gain late wrappers or replacement owners',()=>{
 const p=base();p.register({id:'truth',queries:{parse:()=>({})}});p.seal();assert.throws(()=>p.register({id:'late-parser'}),e=>e.code==='PORTAL_SEALED');assert.throws(()=>p.register({id:'truth'}),e=>e.code==='PORTAL_SEALED');
});

test('audit stores routing facts but not swimmer payloads or returned evidence',()=>{
 const p=base();p.register({id:'results',queries:{pb:input=>({athleteId:input.athleteId,seconds:50.98,privateNote:'do not audit'})}});p.register({id:'meet-board',calls:{query:{results:['pb']}}});p.seal();p.client('meet-board').query('results','pb',{athleteId:'luke',privateNote:'secret'},{meetId:'m1'});const json=JSON.stringify(p.auditTrail());assert(!/50\.98|secret|privateNote/.test(json));assert(/meetId/.test(json));
});

test('operation failure is contained and recorded without becoming a silent fallback',()=>{
 const p=base();p.register({id:'targets',queries:{forSet:()=>{throw new Error('missing evidence')}}});p.register({id:'board',calls:{query:{targets:['forSet']}}});p.seal();assert.throws(()=>p.client('board').query('targets','forSet',{}),e=>e.code==='ENGINE_OPERATION_FAILED');const row=p.auditTrail().at(-1);assert.equal(row.status,'error');assert.equal(row.target,'targets');
});

test('async hidden work is rejected from the synchronous local-first portal',()=>{
 const p=base();p.register({id:'remote',queries:{fetch:()=>Promise.resolve({ok:true})}});p.register({id:'shell',calls:{query:{remote:['fetch']}}});p.seal();assert.throws(()=>p.client('shell').query('remote','fetch',{}),e=>e.code==='ASYNC_NOT_SUPPORTED');
});

if(fails){console.error(`\n${fails} Engine Portal regression(s) failed`);process.exit(1)}
console.log('\nALL ENGINE PORTAL REGRESSIONS PASS');