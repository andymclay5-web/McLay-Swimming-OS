'use strict';
const assert=require('assert');
const Render=require('../ui/board-renderer.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}

function labels(rows){return Object.fromEntries(Render.compactNames(rows).entries())}

test('unique first names stay as the first name only',()=>{
 const got=labels([{id:'k',name:'Kaleb Smith'},{id:'m',name:'Molly McKernan'}]);
 assert.equal(got.k,'Kaleb');assert.equal(got.m,'Molly');
});

test('duplicate first names add only one surname letter when enough',()=>{
 const got=labels([{id:'ah',name:'Alex Hanson'},{id:'ag',name:'Alex Gibson'}]);
 assert.equal(got.ah,'Alex H');assert.equal(got.ag,'Alex G');
});

test('Luke collisions progressively extend surname only as far as needed',()=>{
 const got=labels([{id:'ltw',name:'Luke Thwaites'},{id:'lto',name:'Luke Thompson'}]);
 assert.equal(got.ltw,'Luke Thw');assert.equal(got.lto,'Luke Tho');
});

test('renderer applies the same compact name to Roll targets and modifications',()=>{
 const model={schema:'msos.board.v2',sessionId:'s',identity:{title:'Names',squads:[]},totalDistance:100,validation:{totalMatches:true,warnings:[]},attendance:{here:2,athletes:[{id:'ltw',name:'Luke Thwaites',label:'LT',status:'present'},{id:'lto',name:'Luke Thompson',label:'LT',status:'present'}]},blocks:[{id:'b',title:'Main set',context:{sessionId:'s',blockId:'b'},distance:100,captures:{count:0,byType:{},items:[]},items:[{id:'set',kind:'set',context:{sessionId:'s',blockId:'b',setId:'set',itemId:'set'},groupWork:{reps:1,distance:100,raw:'100 Easy',composition:[],pattern:[],repInstructions:[],cues:[]},phases:[],captures:{count:0,byType:{},items:[]},targets:[{athleteId:'ltw',athleteName:'Luke Thwaites',label:'LT',status:'missing',message:'Target unavailable'}],modifications:[{athleteId:'lto',athleteName:'Luke Thompson',label:'LT',attendanceStatus:'present',status:'modified',work:{reps:1,distance:75,raw:'75 Easy',composition:[],pattern:[],repInstructions:[],cues:[]},target:{status:'none'}}]}]}]};
 const html=Render.renderBoard(model);
 assert((html.match(/Luke Thw/g)||[]).length>=2);assert((html.match(/Luke Tho/g)||[]).length>=2);assert(!/>LT</.test(html));
});

if(fails){console.error(`\n${fails} Board name regression(s) failed`);process.exit(1)}
console.log('\nALL BOARD NAME REGRESSIONS PASS');
