'use strict';
const assert=require('assert');
const Renderer=require('../assembly/shell-renderer.js');
let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
console.log(`Assembly session evidence renderer ${Renderer.VERSION}`);
test('session-scoped photo gets one persistent Board evidence marker with exact session context',()=>{const html=Renderer.renderBoard({boardHtml:'<main class="msos-board">BOARD</main>',occurrence:{sessionId:'s1',squadEntries:[]},sessionCaptures:{count:1,byType:{photo:1}},sessionId:'s1'});assert(/Session evidence/.test(html));assert(/1 photo/.test(html));assert(/data-board-action="evidence"/.test(html));assert(/data-session-id="s1"/.test(html));assert(/data-block-id=""/.test(html));assert(/data-item-id=""/.test(html))});
test('no session capture means no empty evidence chrome',()=>{const html=Renderer.renderBoard({boardHtml:'BOARD',occurrence:{sessionId:'s1'},sessionCaptures:{count:0,byType:{}}});assert(!/Session evidence/.test(html))});
test('session evidence types are summarized without changing capture semantics',()=>{const html=Renderer.renderSessionEvidence({count:3,byType:{photo:1,voice:1,note:1}},'s2');assert(/1 photo · 1 voice · 1 note/.test(html));assert(!/block|set/.test(html))});
if(failures){console.error(`\n${failures} session-evidence renderer regression(s) failed`);process.exit(1)}
console.log('\nALL SESSION EVIDENCE RENDERER REGRESSIONS PASS');
