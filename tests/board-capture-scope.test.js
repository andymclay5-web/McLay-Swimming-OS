'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Capture=require('../engines/capture-evidence.js');
const Board=require('../engines/board-projection.js');
let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
const session=Truth.parse('WARM UP\n300 Choice\nMAIN SET\n4 x 100 Freestyle @ 1:30\nWARM DOWN\n200 Easy',{id:'board-scope',date:'2026-08-19',dayPart:'AM',course:'SCM',squads:['Development'],venue:'AquaGym'}),warm=session.blocks.find(x=>x.type==='warm_up'),set=warm.items[0];
const attendance={here:()=>[],hereAthletes:()=>[],summary:()=>({here:0})},adaptation={forItem:(s,item)=>({sameAsGroup:true,prescription:item})},targets={forItem:()=>({status:'none'})};
function system(){let n=0;const captures=Capture.create({storage:new Capture.MemoryStorage(),clock:()=>`2026-08-19T08:10:0${n++}+12:00`}),board=Board.create({truth:Truth,attendance,adaptation,targets,captures});return{captures,board}}
console.log(`Board evidence scope ${Board.VERSION}`);
test('session photo block observation and set note project to three different Board scopes',()=>{const {captures,board}=system();captures.create(session,{type:'photo',mediaRef:{id:'photo'}});captures.create(session,{type:'observation',blockId:warm.id,text:'block'});captures.create(session,{type:'note',blockId:warm.id,itemId:set.id,text:'set'});const model=board.project(session),warmView=model.blocks.find(x=>x.id===warm.id),setView=warmView.items[0];assert.deepStrictEqual(model.captures.byType,{photo:1});assert.deepStrictEqual(warmView.captures.byType,{observation:1});assert.deepStrictEqual(setView.captures.byType,{note:1});assert.strictEqual(model.captures.count,1);assert.strictEqual(warmView.captures.count,1);assert.strictEqual(setView.captures.count,1)});
test('set evidence cannot inflate its parent block capture count',()=>{const {captures,board}=system();captures.create(session,{type:'note',blockId:warm.id,itemId:set.id,text:'set only'});const model=board.project(session),warmView=model.blocks.find(x=>x.id===warm.id);assert.strictEqual(model.captures.count,0);assert.strictEqual(warmView.captures.count,0);assert.strictEqual(warmView.items[0].captures.count,1)});
if(failures){console.error(`\n${failures} Board capture-scope regression(s) failed`);process.exit(1)}
console.log('\nALL BOARD CAPTURE-SCOPE REGRESSIONS PASS');
