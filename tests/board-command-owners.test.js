'use strict';
const assert=require('assert');
const Owners=require('../rebuild/board-command-owners.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}

function fixture(){
 const session={id:'s1',blocks:[{id:'b1',type:'main_set',items:[{id:'set1',kind:'set',reps:4,distance:100},{id:'g1',kind:'group',rounds:2,items:[{id:'set2',kind:'set',reps:2,distance:50}]}]}]};
 let selected=session;
 const calls=[];
 const runtime={
  selectedSession(){return selected},
  roll(){return{session:selected,eligible:[{id:'a1'}],here:[{id:'a1'}],summary:{present:1}}},
  evidenceAt(context){calls.push(['evidenceAt',context]);return[{id:'cap1'}]}
 };
 const openers={};
 for(const name of ['roll','times','capture','editSet','editBlock','evidence','finish'])openers[name]=payload=>{calls.push([name,payload]);return payload};
 const owners=Owners.create({runtime,openers});
 return{session,runtime,owners,calls,setSelected:v=>{selected=v}};
}

test('displayed session must still be selected before any Board command runs',()=>{
 const x=fixture();x.setSelected({id:'s2',blocks:[]});
 for(const [name,args] of [
  ['roll',{context:{sessionId:'s1'}}],['openTimes',{context:{sessionId:'s1'}}],['capture',{context:{sessionId:'s1'},mode:'note'}],
  ['editSet',{context:{sessionId:'s1',blockId:'b1',itemId:'set1'}}],['editBlock',{context:{sessionId:'s1',blockId:'b1'}}],
  ['openEvidence',{context:{sessionId:'s1',blockId:'b1',itemId:'set1'}}],['finish',{context:{sessionId:'s1'}}]
 ])assert.throws(()=>x.owners[name](args),/session mismatch/,name);
 assert.equal(x.calls.length,0);
});

test('Roll owner receives exact displayed session context and Runtime roll snapshot',()=>{
 const x=fixture(),result=x.owners.roll({context:{sessionId:'s1'}});
 assert.equal(x.calls.length,1);assert.equal(x.calls[0][0],'roll');
 assert.equal(result.context.sessionId,'s1');assert.equal(result.session.id,'s1');assert.equal(result.data.summary.present,1);
});

test('Times owner opens exact selected session and performs no hidden target write',()=>{
 const x=fixture(),result=x.owners.openTimes({context:{sessionId:'s1'}});
 assert.equal(x.calls[0][0],'times');assert.equal(result.session.id,'s1');assert.equal(x.calls.length,1);
});

test('Capture passes exact mode and exact set context to capture UI owner',()=>{
 const x=fixture(),ctx={sessionId:'s1',blockId:'b1',itemId:'set1'},result=x.owners.capture({context:ctx,mode:'video'});
 assert.equal(x.calls[0][0],'capture');assert.equal(result.mode,'video');assert.deepEqual(result.context,ctx);assert.equal(result.session.id,'s1');assert.equal(result.roll.summary.present,1);
});

test('Edit set resolves exact canonical nested item rather than current UI state',()=>{
 const x=fixture(),result=x.owners.editSet({context:{sessionId:'s1',blockId:'b1',itemId:'set2'}});
 assert.equal(x.calls[0][0],'editSet');assert.equal(result.block.id,'b1');assert.equal(result.item.id,'set2');
});

test('Edit set fails closed if rendered block or item no longer exists',()=>{
 const x=fixture();
 assert.throws(()=>x.owners.editSet({context:{sessionId:'s1',blockId:'missing',itemId:'set1'}}),/no longer exists/);
 assert.throws(()=>x.owners.editSet({context:{sessionId:'s1',blockId:'b1',itemId:'missing'}}),/no longer exists/);
 assert.equal(x.calls.length,0);
});

test('Edit block resolves the exact canonical block',()=>{
 const x=fixture(),result=x.owners.editBlock({context:{sessionId:'s1',blockId:'b1'}});
 assert.equal(x.calls[0][0],'editBlock');assert.equal(result.block.id,'b1');
});

test('Evidence lookup goes through Runtime exact-context API before evidence UI owner',()=>{
 const x=fixture(),ctx={sessionId:'s1',blockId:'b1',itemId:'set1'},result=x.owners.openEvidence({context:ctx});
 assert.equal(x.calls[0][0],'evidenceAt');assert.deepEqual(x.calls[0][1],ctx);
 assert.equal(x.calls[1][0],'evidence');assert.deepEqual(result.items,[{id:'cap1'}]);
});

test('Finish tap opens Finish owner but does not finish the session itself',()=>{
 const x=fixture(),result=x.owners.finish({context:{sessionId:'s1',blockId:'b1',itemId:'set1'}});
 assert.equal(x.calls.length,1);assert.equal(x.calls[0][0],'finish');assert.equal(result.session.id,'s1');
});

test('missing UI owner is an error, never a silent no-op',()=>{
 const session={id:'s1',blocks:[]},owners=Owners.create({runtime:{selectedSession(){return session},roll(){return{}}},openers:{}});
 assert.throws(()=>owners.roll({context:{sessionId:'s1'}}),/UI owner missing: roll/);
});

test('commands exposes only the explicit Board application command surface',()=>{
 const x=fixture(),commands=x.owners.commands();
 assert.deepEqual(Object.keys(commands).sort(),['capture','editBlock','editSet','finish','openEvidence','openTimes','roll'].sort());
 assert(!('sync' in commands));assert(!('parse' in commands));assert(!('selectSession' in commands));
});

if(fails){console.error(`\n${fails} Board command-owner regression(s) failed`);process.exit(1)}
console.log('\nALL BOARD COMMAND-OWNER REGRESSIONS PASS');
