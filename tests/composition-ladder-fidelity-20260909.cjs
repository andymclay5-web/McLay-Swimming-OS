'use strict';
// Real coaching failure this pins (architecture/RUNTIME_AUDIT_20260909.md §6, both bugs share one mechanism):
//
// 1. "300/200/100" loses structure. app.js's attachPostCues merges any run of consecutive numeric 'component'
//    lines into the PRECEDING set's `composition` whenever the numbers happen to sum to it exactly -- with no
//    requirement that they were ever meant as a sub-breakdown. A genuine descending ladder written as bare
//    numbers on their own lines (300 / 200 / 100 as three separate swims) coincidentally sums (200+100=300) and
//    false-triggers, collapsing a real ~600m ladder into a single reported 300m item. The legitimate case this
//    heuristic exists for ("500" / "300 Free" / "200 Reverse IM") always carries descriptive text on every
//    sub-line -- fixed by requiring that text before merging.
// 2. Free text disappears unless bracketed. Any line matching the parser's numeric-led single-distance pattern
//    that doesn't merge into a composition (because it fails the sum-match, or now, because it fails the new
//    text requirement) becomes an orphaned kind:'component' node -- and engines/board.js's node renderer had no
//    case for 'component', falling through to a bare `return ''`, so the line vanished from the Board with no
//    trace. Fixed by giving the renderer a visible fallback for any node kind it doesn't specifically handle.
//
// Known, deliberate limitation of this fix (documented here rather than silently claimed away): an unmerged
// 'component' node now renders visibly, but still contributes 0m to distance totals throughout the engine
// (app.js's S.itemDistance / engines/board.js's own itemDistance only sum kind:'set'/'group') -- so a bare-number
// descending ladder ("300"/"200"/"100") is now VISIBLE but still under-counted in the block total. Promoting it
// to a fully-counted 'set' risked a worse failure mode (turning a numeric-led coach REMARK that happens not to
// be a real swim into phantom counted metres), so this test intentionally does NOT assert a corrected total --
// only that nothing merges falsely and nothing is silently dropped from the item tree. A coach who wants a
// ladder counted correctly today should write it as explicit "1 x 300" / "1 x 200" / "1 x 100" lines, which the
// parser already treats as full, separately-counted sets regardless of this fix.
//
// Part 1 exercises the REAL, live parser exactly as tests/parser-natural-cw.cjs does: extracting app.js's parser
// IIFE by its exact source markers and running it in a VM, then loading the real engines/parser-semantics.js on
// top -- proving the actual shipped parser's behavior, not a paraphrase. Part 2 exercises engines/board.js's
// renderer the same way tests/modified-target-authority-20260909.cjs and tests/race-evidence-local-first-
// 20260909.cjs do for DOM-heavy files with no jsdom available: extracting the exact current source of the
// renderer function and executing it against a constructed node-kind fixture.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

// --- Part 1: the real parser must not false-merge a genuine bare-number ladder, and must not lose the lines. ---
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const start=app.indexOf("(function(g){\n const M=g.MSOS4,U=M.util,S=M.session;\n const P=M.parser={};");
assert.ok(start>=0,'base parser section not found in app.js');
const end=app.indexOf("\n\n(function(g){\n const M=g.MSOS4,U=M.util,S=M.session;\n const C=M.changes={};",start);
assert.ok(end>start,'base parser section end not found in app.js');
const U={text:v=>String(v??'').replace(/\s+/g,' ').trim(),lines:v=>String(v??'').replace(/\r/g,'').split('\n'),hash:s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)},stableId:(prefix,...parts)=>`${prefix}-${parts.map(x=>String(x??'').trim().toLowerCase()).join('|')}`,now:()=>'2026-09-09T07:00:00.000Z',deepFreeze:o=>o,clone:v=>v==null?v:JSON.parse(JSON.stringify(v)),blockType:v=>{const s=String(v??'').trim().toLowerCase();if(/warm.?up/.test(s))return'warm_up';if(/pre.?set/.test(s))return'pre_set';if(/main/.test(s))return'main_set';if(/post.?set|reinforcement/.test(s))return'post_set';if(/warm.?down|cool.?down/.test(s))return'warm_down';if(/test/.test(s))return'test';return'other'},blockTitle:t=>({warm_up:'Warm-up',pre_set:'Pre-set',main_set:'Main set',post_set:'Post-set',warm_down:'Warm-down',test:'Test',other:'Other'})[t]||'Block'};
const S={};
S.empty=(identity={},source='')=>({schema:4,id:identity.id||'s',identity:{...identity},originalPlan:{text:String(source).trim()},currentSource:{text:String(source).trim()},blocks:[],changes:[],finish:null,metadata:{},updatedAt:U.now()});
S.itemDistance=item=>!item?0:item.kind==='set'?Math.max(0,Number(item.reps)||1)*Math.max(0,Number(item.distance)||0):item.kind==='group'?Math.max(1,Number(item.rounds)||1)*(item.items||[]).reduce((n,x)=>n+S.itemDistance(x),0):0;
S.blockDistance=b=>(b?.items||[]).reduce((n,x)=>n+S.itemDistance(x),0);
S.total=s=>(s?.blocks||[]).reduce((n,b)=>n+S.blockDistance(b),0);
global.MSOS4={util:U,session:S};
vm.runInThisContext(app.slice(start,end),{filename:'app-parser-section.js'});
require(path.join(root,'engines','parser-semantics.js'));
const P=global.MSOS4.parser;

// --- fixture sanity: the legitimate composition case (every sub-line carries descriptive text) must still work.
const genuine=P.parse('Warm up\n500\n300 Free\n200 Reverse IM',{id:'genuine'});
const genuineItem=genuine.blocks[0].items[0];
assert.equal(genuine.blocks[0].items.length,1,'fixture sanity: the genuine "500 = 300 Free + 200 Reverse IM" breakdown must still collapse into one item');
assert.deepEqual(genuineItem.composition.map(c=>c.distance),[300,200],'fixture sanity: the genuine composition case must still attach both sub-distances');
assert.equal(S.total(genuine),500,'fixture sanity: the genuine composition case must still total 500, not 500+300+200');

// THE FIX: a genuine descending ladder of bare numbers (no descriptive text on any line) must NOT be silently
// swallowed into a false composition just because two of the numbers happen to sum to the first.
const ladder=P.parse('Main set\n300\n200\n100',{id:'ladder'});
const ladderItems=ladder.blocks[0].items;
assert.equal(ladderItems.length,3,`a genuine bare-number descending ladder must remain three distinct lines in the item tree, not collapse into one merged item: got ${ladderItems.length} (${JSON.stringify(ladderItems.map(x=>[x.kind,x.distance]))})`);
assert.equal(ladderItems[0].composition.length,0,'the false composition-merge must not attach 200/100 to the leading 300 line');
assert.deepEqual(ladderItems.map(x=>Number(x.distance)),[300,200,100],'every ladder line must retain its own authored distance');

console.log('COMPOSITION_LADDER_STRUCTURE_PASS');

// --- Part 2: engines/board.js's node renderer must never silently drop an unrecognized node kind. ---
const boardSrc=fs.readFileSync(path.join(root,'engines','board.js'),'utf8');

function extractBalancedFunctionBody(source,marker){
  const markerIndex=source.indexOf(marker);
  if(markerIndex<0)throw new Error(`${marker} not found in engines/board.js`);
  let i=markerIndex+marker.length,depth=1;const start=i;
  for(;i<source.length;i++){const c=source[i];if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0)break;}}
  if(depth!==0)throw new Error(`${marker} body was not closed (unbalanced braces)`);
  return source.slice(start,i);
}

const nodeRowsBody=extractBalancedFunctionBody(boardSrc,'function nodeRows(session,node,groupAth,mods){');
const nodeRows=new Function('session','node','groupAth','mods','setRow','esc','short',nodeRowsBody);
const text=v=>String(v??'').replace(/\s+/g,' ').trim();
const esc=v=>text(v); // real board.js's esc falls back to the same `text()` helper when M.util is unavailable
const short=v=>text(v);
const call=node=>nodeRows({},node,[],{},()=>{throw new Error('setRow must not be invoked for a non-set node kind')},esc,short);

// fixture sanity: the existing, already-handled 'cue' kind must still render as before.
assert.match(call({kind:'cue',text:'Push off hard'}),/Push off hard/,'fixture sanity: an already-handled node kind (cue) must still render its text');

// THE FIX: a 'component' node -- the exact shape the parser leaves behind for a numeric-led line that failed the
// composition merge -- must render SOMETHING visible, carrying the authored content, not a blank string.
const orphanComponent={kind:'component',distance:200,text:'',raw:'200'};
const rendered=call(orphanComponent);
assert.notEqual(rendered,'','an orphaned component node (a genuine ladder line, or a numeric-led coach remark that failed the sum-match) must never render as an empty string -- that silent disappearance is the exact "disappears unless bracketed" bug');
assert.match(rendered,/200/,'the fallback rendering must show the actual authored content (the "200" line), not a generic placeholder');

// A remark-shaped component (descriptive text, no clean numeric-only raw) must also render its content.
const remarkComponent={kind:'component',distance:25,text:'stay long through the catch',raw:'25 stay long through the catch'};
assert.match(call(remarkComponent),/stay long through the catch/,'a numeric-led remark that failed the composition merge must still show its own text, not vanish');

// Any other unrecognized kind (defensive: not just 'component' specifically) must also fall back visibly rather
// than silently returning ''.
assert.notEqual(call({kind:'future-node-kind',raw:'some future authored line'}),'','the renderer fallback must cover any unrecognized node kind, not only "component" specifically, so a future parser addition can never silently vanish either');

console.log('BOARD_NODE_RENDERER_FALLBACK_PASS');
