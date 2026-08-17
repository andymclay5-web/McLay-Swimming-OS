'use strict';
const assert=require('assert');
const App=require('../rebuild/board-app.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}

function fixture(){
 const session1={id:'s1',identity:{date:'2026-08-18',dayPart:'AM',title:'Board App Test',squads:['National'],venue:'AquaGym',course:'SCM'},blocks:[{id:'b1',type:'main_set',title:'Main set',items:[{id:'set1',kind:'set',reps:4,distance:100,raw:'4 x 100 Free Development 10s rest'}]}]},session2={id:'s2',identity:{date:'2026-08-18',dayPart:'PM',title:'Other Session',squads:['National'],venue:'AquaGym',course:'SCM'},blocks:[]};
 let selected=session1,model={schema:'msos.board.v2',engineVersion:'test',sessionId:'s1',identity:session1.identity,totalDistance:400,validation:{writtenTotal:400,totalMatches:true,warnings:[]},attendance:{here:1,summary:{present:1},athletes:[{id:'a1',name:'Athlete One',label:'AO',status:'present'}]},blocks:[{id:'b1',type:'main_set',title:'Main set',authoredTitle:'Main Set',order:1,sourceOrder:1,context:{sessionId:'s1',blockId:'b1'},distance:400,captures:{count:0,byType:{},items:[]},items:[{id:'set1',kind:'set',context:{sessionId:'s1',blockId:'b1',groupId:null,setId:'set1',itemId:'set1',cueId:null,phaseIndex:null},distance:400,groupWork:{reps:4,distance:100,stroke:'Freestyle',zone:'Development',restSeconds:10,cycleSeconds:null,cycleOptions:[],equipment:[],composition:[],compositionRepeats:1,pattern:[],patternRounds:null,phases:[],repPattern:[],repInstructions:[],cues:[],raceIntent:null,targetSeconds:null,raw:'4 x 100 Free Development 10s rest'},phases:[],modifications:[],targets:[],captures:{count:0,byType:{},items:[]}}]}]};
 const root={innerHTML:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn},removeEventListener(type){delete this.listeners[type]}};
 const calls=[],openers={};for(const name of ['roll','times','capture','editSet','editBlock','evidence','finish'])openers[name]=payload=>{calls.push([name,payload]);return payload};
 const runtime={
  boardModel(){return model},selectedSession(){return selected},roll(){return{session:selected,eligible:[{id:'a1'}],here:[{id:'a1'}],summary:{present:1}}},evidenceAt(ctx){calls.push(['evidenceAt',ctx]);return[{id:'cap1'}]}
 };
 const scroll={value:275,restored:null};
 const app=App.create({root,runtime,openers,getScroll:()=>scroll.value,setScroll:v=>{scroll.restored=v}});
 const click=(action,{sessionId='s1',blockId='',itemId=''}={})=>root.listeners.click({target:{dataset:{boardAction:action,sessionId,blockId,itemId},closest(){return this}},preventDefault(){}});
 return{app,root,calls,runtime,session1,session2,scroll,click,setSession(s,m){selected=s;model=m}};
}

test('mount renders the selected Board and binds one delegated click handler',()=>{
 const x=fixture(),m=x.app.mount();assert.equal(m.sessionId,'s1');assert(/Board App Test/.test(x.root.innerHTML));assert.equal(typeof x.root.listeners.click,'function');assert.equal(x.app.snapshot().sessionId,'s1');
});

test('Edit tap resolves exact canonical block and set through command owner',()=>{
 const x=fixture();x.app.mount();x.click('edit',{blockId:'b1',itemId:'set1'});assert.equal(x.calls.length,1);assert.equal(x.calls[0][0],'editSet');assert.equal(x.calls[0][1].block.id,'b1');assert.equal(x.calls[0][1].item.id,'set1');
});

test('Note tap reaches Capture owner with exact set context and mode',()=>{
 const x=fixture();x.app.mount();x.click('note',{blockId:'b1',itemId:'set1'});assert.equal(x.calls[0][0],'capture');assert.equal(x.calls[0][1].mode,'note');assert.equal(x.calls[0][1].context.itemId,'set1');assert.equal(x.calls[0][1].roll.summary.present,1);
});

test('Times and Finish taps open their owners without hidden writes',()=>{
 const x=fixture();x.app.mount();x.click('times');x.click('finish',{blockId:'b1',itemId:'set1'});assert.deepEqual(x.calls.map(c=>c[0]),['times','finish']);assert.equal(x.calls[1][1].session.id,'s1');
});

test('evidence marker uses Runtime exact-context evidence lookup',()=>{
 const x=fixture();x.app.mount();x.click('evidence',{blockId:'b1',itemId:'set1'});assert.equal(x.calls[0][0],'evidenceAt');assert.deepEqual(x.calls[0][1],{sessionId:'s1',blockId:'b1',itemId:'set1'});assert.equal(x.calls[1][0],'evidence');assert.deepEqual(x.calls[1][1].items,[{id:'cap1'}]);
});

test('ordinary refresh preserves scroll position',()=>{
 const x=fixture();x.app.mount();x.scroll.value=811;x.app.refresh();assert.equal(x.scroll.restored,811);assert.equal(x.app.snapshot().sessionId,'s1');
});

test('background-selected session cannot take over mounted Board',()=>{
 const x=fixture();x.app.mount();const model2={schema:'msos.board.v2',sessionId:'s2',identity:x.session2.identity,totalDistance:0,validation:{totalMatches:true,warnings:[]},attendance:{here:0,athletes:[]},blocks:[]};x.setSession(x.session2,model2);assert.throws(()=>x.app.refresh(),/session takeover blocked/);assert.equal(x.app.snapshot().sessionId,'s1');assert(/Board App Test/.test(x.root.innerHTML));
});

test('explicit session navigation changes Board lock and rendered session',()=>{
 const x=fixture();x.app.mount();const model2={schema:'msos.board.v2',sessionId:'s2',identity:x.session2.identity,totalDistance:0,validation:{totalMatches:true,warnings:[]},attendance:{here:0,athletes:[]},blocks:[]};x.setSession(x.session2,model2);x.app.openSelectedSession();assert.equal(x.app.snapshot().sessionId,'s2');assert(/Other Session/.test(x.root.innerHTML));
});

test('stale rendered action fails closed if selected session changed behind Board',()=>{
 const x=fixture();x.app.mount();x.setSession(x.session2,{schema:'msos.board.v2',sessionId:'s2',identity:x.session2.identity,totalDistance:0,validation:{totalMatches:true,warnings:[]},attendance:{here:0,athletes:[]},blocks:[]});assert.throws(()=>x.click('edit',{sessionId:'s1',blockId:'b1',itemId:'set1'}),/session mismatch/);assert.equal(x.calls.length,0);
});

test('unmount removes delegated Board handler',()=>{
 const x=fixture();x.app.mount().sessionId;x.app.unmount();assert.equal(x.root.listeners.click,undefined);assert.equal(x.app.snapshot().mounted,false);
});

if(fails){console.error(`\n${fails} Board app integration regression(s) failed`);process.exit(1)}
console.log('\nALL BOARD APP INTEGRATION REGRESSIONS PASS');
