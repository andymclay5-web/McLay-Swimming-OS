'use strict';
const assert=require('assert');
const C=require('../ui/board-controller.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}

test('set Edit resolves exact stable session/block/item context',()=>{
 const cmd=C.commandFor('edit',{sessionId:'s1',blockId:'b1',itemId:'set1'});
 assert.deepEqual(cmd,{type:'editSet',context:{sessionId:'s1',blockId:'b1',itemId:'set1'}});
});

test('block Edit never invents an item id',()=>{
 const cmd=C.commandFor('edit-block',{sessionId:'s1',blockId:'b1',itemId:''});
 assert.deepEqual(cmd,{type:'editBlock',context:{sessionId:'s1',blockId:'b1',itemId:null}});
});

test('capture modes all route through capture owner with explicit mode',()=>{
 const expected={capture:'choose',note:'note',voice:'voice',photo:'photo',video:'video'};
 for(const [action,mode] of Object.entries(expected))assert.deepEqual(C.commandFor(action,{sessionId:'s1',blockId:'b1',itemId:'set1'}),{type:'capture',mode,context:{sessionId:'s1',blockId:'b1',itemId:'set1'}});
});

test('Roll and Finish are session commands and preserve supplied context',()=>{
 assert.equal(C.commandFor('roll',{sessionId:'s1'}).type,'roll');
 assert.equal(C.commandFor('finish',{sessionId:'s1',blockId:'b1',itemId:'set1'}).type,'finish');
});

test('evidence marker routes to retrieval owner only',()=>{
 assert.deepEqual(C.commandFor('evidence',{sessionId:'s1',blockId:'b1',itemId:'set1'}),{type:'openEvidence',context:{sessionId:'s1',blockId:'b1',itemId:'set1'}});
});

test('missing mandatory ids fail instead of guessing current UI state',()=>{
 assert.throws(()=>C.commandFor('edit',{sessionId:'s1'}),/blockId \+ itemId/);
 assert.throws(()=>C.commandFor('edit-block',{sessionId:'s1'}),/blockId/);
 assert.throws(()=>C.commandFor('finish',{}),/sessionId/);
});

test('controller delegates click exactly once to injected owner',()=>{
 const listeners={},root={addEventListener(type,fn){listeners[type]=fn},removeEventListener(type){delete listeners[type]}},calls=[];
 const controller=C.create({root,commands:{capture:calls.push.bind(calls)}}).bind();
 let prevented=0;const el={dataset:{boardAction:'note',sessionId:'s1',blockId:'b1',itemId:'set1'},closest(){return this}};
 listeners.click({target:el,preventDefault(){prevented++}});
 assert.equal(prevented,1);assert.equal(calls.length,1);assert.equal(calls[0].type,'capture');assert.equal(calls[0].mode,'note');assert.equal(calls[0].context.itemId,'set1');
 controller.unbind();assert.equal(listeners.click,undefined);
});

test('unknown actions are ignored rather than becoming hidden mutations',()=>{
 assert.equal(C.commandFor('sync-cloud-now',{sessionId:'s1'}),null);
});

if(fails){console.error(`\n${fails} Board controller regression(s) failed`);process.exit(1)}
console.log('\nALL BOARD CONTROLLER REGRESSIONS PASS');
