'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');

const start=app.indexOf("(function(g){\n const M=g.MSOS4,U=M.util,S=M.session;\n const P=M.parser={};");
assert.ok(start>=0,'base parser section not found');
const end=app.indexOf("\n\n(function(g){\n const M=g.MSOS4,U=M.util,S=M.session;\n const C=M.changes={};",start);
assert.ok(end>start,'base parser section end not found');
const parserSource=app.slice(start,end);

const U={
 text:v=>String(v??'').replace(/\s+/g,' ').trim(),
 lines:v=>String(v??'').replace(/\r/g,'').split('\n'),
 hash:s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36)},
 stableId:(prefix,...parts)=>`${prefix}-${parts.map(x=>String(x??'').trim().toLowerCase()).join('|')}`,
 now:()=> '2026-08-24T07:00:00.000Z',
 deepFreeze:o=>o,
 blockType:v=>{const s=String(v??'').trim().toLowerCase();if(/warm.?up/.test(s))return'warm_up';if(/pre.?set/.test(s))return'pre_set';if(/main/.test(s))return'main_set';if(/post.?set|reinforcement/.test(s))return'post_set';if(/warm.?down|cool.?down/.test(s))return'warm_down';if(/test/.test(s))return'test';return'other'},
 blockTitle:t=>({warm_up:'Warm-up',pre_set:'Pre-set',main_set:'Main set',post_set:'Post-set',warm_down:'Warm-down',test:'Test',other:'Other'})[t]||'Block'
};
const S={};
S.empty=(identity={},source='')=>({schema:4,id:identity.id||'s',identity:{...identity},originalPlan:{text:String(source).trim()},currentSource:{text:String(source).trim()},blocks:[],changes:[],finish:null,metadata:{},updatedAt:U.now()});
S.itemDistance=item=>!item?0:item.kind==='set'?Math.max(0,Number(item.reps)||1)*Math.max(0,Number(item.distance)||0):item.kind==='group'?Math.max(1,Number(item.rounds)||1)*(item.items||[]).reduce((n,x)=>n+S.itemDistance(x),0):0;
S.blockDistance=b=>(b?.items||[]).reduce((n,x)=>n+S.itemDistance(x),0);
S.total=s=>(s?.blocks||[]).reduce((n,b)=>n+S.blockDistance(b),0);
global.MSOS4={util:U,session:S};
vm.runInThisContext(parserSource,{filename:'app-parser-section.js'});
require('../engines/parser-natural-structure-cw.js');

const source=`600 Choice
3 x 200 IM
1-Build
1-Fast

12 x 100 Kick
Desc 1-3 on 2:10
8 x 25
15m Underwater MAX on45
4 x 200 Kick with Fins
Desc 1-4 on 3:30
8 x 25 Kick MAX on60

12 x 75 #1
Makeup: 50 Drill / 25 Swim · Rest · 10 sec

200 Easy`;

const s=global.MSOS4.parser.parse(source,{id:'morning-natural',course:'SCM',squads:['National']});
assert.equal(S.total(s),4700,'natural morning source must total 4,700m');
assert.deepEqual(s.blocks.map(b=>b.type),['warm_up','main_set','post_set','warm_down'],'blank-line structure must infer warm-up/main/post/warm-down');
assert.deepEqual(s.blocks.map(S.blockDistance),[1200,2400,900,200],'inferred blocks must match coach intent');
assert.equal(s.originalPlan.text,source,'original coach source must stay unchanged');
assert.equal(s.currentSource.text,source,'current source must not be rewritten with synthetic headings');
assert.equal(s.metadata.parserStructure,'natural');

const sets=[];for(const b of s.blocks)for(const i of b.items||[])if(i.kind==='set')sets.push(i);
const find=re=>sets.find(i=>re.test(i.raw||i.text||''));
const kick100=find(/^12 x 100 Kick/i);assert.ok(kick100,'12x100 Kick missing');assert.equal(kick100.cycleSeconds,130);assert.match(kick100.cues.join(' '),/Desc 1-3/i);assert.deepEqual(kick100.descent,{from:1,to:3,repeat:true});assert.equal(kick100.stroke,'','plain Kick must stay unresolved for athlete #1/context engine');
const uw25=find(/^8 x 25$/i);assert.ok(uw25,'8x25 skill parent missing');assert.equal(uw25.cycleSeconds,45,'on45 cue must set parent cycle');assert.match(uw25.cues.join(' '),/15m Underwater MAX on45/i);assert.equal(sets.some(i=>Number(i.distance)===15),false,'15m underwater cue must not add phantom metres');
const fins=find(/^4 x 200 Kick with Fins/i);assert.equal(fins.cycleSeconds,210);assert.match(fins.cues.join(' '),/Desc 1-4/i);
const kick25=find(/^8 x 25 Kick MAX/i);assert.equal(kick25.cycleSeconds,60);
const post=find(/^12 x 75 #1/i);assert.ok(post,'12x75 #1 missing');assert.equal(post.restSeconds,10);assert.deepEqual(post.composition.map(x=>x.distance),[50,25]);assert.match(post.cues.join(' '),/Makeup: 50 Drill \/ 25 Swim/i);
const im=find(/^3 x 200 IM/i);assert.ok(im);assert.deepEqual(im.pattern.map(x=>[x.count,x.text]),[[1,'Build'],[1,'Fast']]);

const explicit=`WARM-UP\n400 Choice\nMAIN SET\n4 x 100 Freestyle @ 1:30\nMystery cue: hips through the turn\nWARM-DOWN\n200 Easy`;
const e=global.MSOS4.parser.parse(explicit,{id:'explicit'});assert.equal(e.metadata.parserStructure,'explicit');assert.equal(S.total(e),1000);const main=e.blocks[1].items.find(i=>i.kind==='set');assert.match(main.cues.join(' '),/Mystery cue: hips through the turn/,'unknown coaching language must remain attached verbatim');

assert.equal(global.MSOS4.parserNaturalCW.parseCycle('8 x 25 on45'),45);
assert.equal(global.MSOS4.parserNaturalCW.parseCycle('4 x 200 on 3.45'),225);
assert.equal(global.MSOS4.parserNaturalCW.parseRest('Makeup: 50 Drill / 25 Swim · Rest · 10 sec'),10);
console.log('PARSER_NATURAL_CW_PASS');
