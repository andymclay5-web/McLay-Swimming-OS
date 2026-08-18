'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Capture=require('../engines/capture-evidence.js');
let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
const session=Truth.parse('WARM UP\n300 Choice\nMAIN SET\n4 x 100 Freestyle @ 1:30\nWARM DOWN\n200 Easy',{id:'scope-session',date:'2026-08-19',dayPart:'AM',course:'SCM',squads:['Development'],venue:'AquaGym'});
const warm=session.blocks.find(x=>x.type==='warm_up'),set=warm.items[0];
function engine(){let n=0;return Capture.create({storage:new Capture.MemoryStorage(),clock:()=>`2026-08-19T08:00:0${n++}+12:00`})}
console.log(`Capture Evidence exact scope ${Capture.VERSION}`);
test('session block and set evidence stay at their exact Board point',()=>{const c=engine();c.create(session,{type:'photo',mediaRef:{id:'p1'},text:'whole session photo'});c.create(session,{type:'observation',blockId:warm.id,text:'whole warm-up observation'});c.create(session,{type:'note',blockId:warm.id,itemId:set.id,text:'exact set note'});const sessionRows=c.atBoardPoint(session,{}),blockRows=c.atBoardPoint(session,{blockId:warm.id}),setRows=c.atBoardPoint(session,{blockId:warm.id,itemId:set.id});assert.deepStrictEqual(sessionRows.map(x=>x.type),['photo']);assert.deepStrictEqual(blockRows.map(x=>x.type),['observation']);assert.deepStrictEqual(setRows.map(x=>x.type),['note'])});
test('broad reporting query may still intentionally include descendants',()=>{const c=engine();c.create(session,{type:'photo',mediaRef:{id:'p1'}});c.create(session,{type:'note',blockId:warm.id,itemId:set.id,text:'set'});assert.strictEqual(c.query({sessionId:session.id}).length,2);assert.strictEqual(c.query({sessionId:session.id,blockId:warm.id}).length,1)});
test('athlete filtering never changes exact Board address semantics',()=>{const c=engine();c.create(session,{type:'note',blockId:warm.id,itemId:set.id,athleteIds:['molly'],text:'Molly'});c.create(session,{type:'note',blockId:warm.id,itemId:set.id,athleteIds:['alex'],text:'Alex'});assert.deepStrictEqual(c.atBoardPoint(session,{blockId:warm.id,itemId:set.id,athleteId:'molly'}).map(x=>x.athlete_ids[0]),['molly']);assert.strictEqual(c.atBoardPoint(session,{blockId:warm.id,athleteId:'molly'}).length,0)});
if(failures){console.error(`\n${failures} exact-scope regression(s) failed`);process.exit(1)}
console.log('\nALL CAPTURE EVIDENCE EXACT-SCOPE REGRESSIONS PASS');
