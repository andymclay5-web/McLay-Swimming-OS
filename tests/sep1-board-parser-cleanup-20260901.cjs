'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const start=app.indexOf("(function(g){\n const M=g.MSOS4,U=M.util,S=M.session;\n const P=M.parser={};");
const end=app.indexOf("\n\n(function(g){\n const M=g.MSOS4,U=M.util,S=M.session;\n const C=M.changes={};",start);
assert.ok(start>=0&&end>start,'base parser section not found');
const U={text:v=>String(v??'').replace(/\s+/g,' ').trim(),lines:v=>String(v??'').replace(/\r/g,'').split('\n'),hash:s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)},stableId:(prefix,...parts)=>`${prefix}-${parts.map(x=>String(x??'').trim().toLowerCase()).join('|')}`,now:()=> '2026-09-01T05:00:00.000Z',deepFreeze:o=>o,clone:v=>v==null?v:JSON.parse(JSON.stringify(v)),blockType:v=>{const s=String(v??'').trim().toLowerCase();if(/warm.?up/.test(s))return'warm_up';if(/pre.?set/.test(s))return'pre_set';if(/main/.test(s))return'main_set';if(/post.?set|reinforcement/.test(s))return'post_set';if(/warm.?down|cool.?down/.test(s))return'warm_down';if(/test/.test(s))return'test';return'other'},blockTitle:t=>({warm_up:'Warm-up',pre_set:'Pre-set',main_set:'Main set',post_set:'Post-set',warm_down:'Warm-down',test:'Test',other:'Other'})[t]||'Block'};
const S={};S.empty=(identity={},source='')=>({schema:4,id:identity.id||'s',identity:{...identity},originalPlan:{text:String(source).trim()},currentSource:{text:String(source).trim()},blocks:[],changes:[],finish:null,metadata:{},updatedAt:U.now()});S.itemDistance=item=>!item?0:item.kind==='set'?Math.max(0,Number(item.reps)||1)*Math.max(0,Number(item.distance)||0):item.kind==='group'?Math.max(1,Number(item.rounds)||1)*(item.items||[]).reduce((n,x)=>n+S.itemDistance(x),0):0;S.blockDistance=b=>(b?.items||[]).reduce((n,x)=>n+S.itemDistance(x),0);S.total=s=>(s?.blocks||[]).reduce((n,b)=>n+S.blockDistance(b),0);
global.MSOS4={util:U,session:S};vm.runInThisContext(app.slice(start,end),{filename:'app-parser-section.js'});require('../engines/parser-semantics.js');
const source=`WARM UP
400 Choice
8 x 50
4 Kick
4 Drill
10 sec Rest
4 x 100 IM
Descend 1-4
10 sec Rest

PRE-SET
12 x 50 @ 1:15
3 Rounds:
1 Build
1 Middle 20m MAX
1 First 15m MAX
1 Easy

MAIN SET
5 Rounds:
200 Overload
10 sec Rest
100 Threshold
10 sec Rest

POST-SET
8 x 75 Pull @ 1:30
Descend 1-4
8 x 25 Underwater with Fins @ 0:45

WARM DOWN
200 Easy`;
const s=global.MSOS4.parser.parse(source,{id:'sep1-am',course:'SCM',squads:['National']});
const distances=s.blocks.map(b=>[b.type,S.blockDistance(b)]);console.log('SEP1_BLOCK_DISTANCES',JSON.stringify(distances));
assert.equal(S.total(s),4300,'Sep 1 session distance must remain 4,300m');
assert.deepEqual(s.blocks.map(S.blockDistance),[1200,600,1500,800,200]);
const pre=s.blocks.find(b=>b.type==='pre_set');assert.ok(pre);assert.equal(pre.items.filter(x=>x.kind==='group').length,0,'cue-only 3 Rounds must fold into 12x50, not remain a 0m group');
const preSet=pre.items.find(x=>x.kind==='set');assert.ok(preSet);assert.equal(preSet.reps,12);assert.equal(preSet.distance,50);assert.equal(preSet.cycleSeconds,75);assert.deepEqual(preSet.repeatBreakdown.unit.map(x=>[x.count,x.text]),[[1,'Build'],[1,'Middle 20m MAX'],[1,'First 15m MAX'],[1,'Easy']]);assert.equal(preSet.repeatBreakdown.rounds,3);assert.match(preSet.repeatBreakdownCue,/3 rounds/i);
const main=s.blocks.find(b=>b.type==='main_set');const mainGroup=main.items.find(x=>x.kind==='group');assert.ok(mainGroup,'true work-bearing 5 Rounds main group must remain canonical');assert.equal(mainGroup.rounds,5);assert.equal(S.blockDistance(main),1500);
const post=s.blocks.find(b=>b.type==='post_set'),uw=post.items.find(x=>x.kind==='set'&&Number(x.distance)===25);assert.ok(uw);assert.match(String(uw.raw||uw.text),/Underwater/i);assert.equal(uw.cycleSeconds,45);
const board=fs.readFileSync(path.join(root,'engines/board.js'),'utf8');assert.match(board,/hasRest&&\(\(\/\\b\\d\{1,3\}/,'Board must suppress duplicate free-text rest cues when canonical restSeconds exists');assert.match(board,/\\bUnderwater\\b.*label\+=' Underwater'/s,'Board work label must preserve Underwater');assert.match(board,/canOpen=intent&&groupAth\.length>0/,'Board must not open empty target panels when no swimmers are present');
console.log('SEP1_BOARD_PARSER_CLEANUP_PASS total=4300 preset-pattern-fold main-rounds-preserved underwater-visible rest-single target-empty-hidden');