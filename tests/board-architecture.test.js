'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
let fails=0;function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Board Projection has no direct neighboring engine imports',()=>{
 const src=read('engines/board-projection.js');assert(!/require\(['"]\.\/session-truth\.js/.test(src));assert(!/require\(['"]\.\/targets\.js/.test(src));assert(!/require\(['"]\.\/adaptation\.js/.test(src));assert(!/require\(['"]\.\/attendance\.js/.test(src));assert(!/require\(['"]\.\/capture-evidence\.js/.test(src));
});

test('Board Projection contains no parser formula storage network or DOM ownership',()=>{
 const src=read('engines/board-projection.js');for(const forbidden of ['document.','window.','localStorage','indexedDB','fetch(','XMLHttpRequest','WebSocket','MutationObserver','new RegExp(`^(${NUMBER_WORD}','T400_COEFFICIENTS','parseBlock('])assert(!src.includes(forbidden),forbidden);
});

test('Board UI files import no domain engines',()=>{
 for(const file of ['ui/board-renderer.js','ui/board-controller.js','ui/board-screen.js']){const src=read(file);assert(!/require\([^)]*engines\//.test(src),file);assert(!/MSOSEngines/.test(src),file)}
});

test('Board Renderer owns no storage network timers or event listeners',()=>{
 const src=read('ui/board-renderer.js');for(const forbidden of ['localStorage','indexedDB','fetch(','XMLHttpRequest','setTimeout(','setInterval(','addEventListener('])assert(!src.includes(forbidden),forbidden);
});

test('Board Controller owns event delegation but no storage network or engine work',()=>{
 const src=read('ui/board-controller.js');assert(src.includes("addEventListener('click'"));for(const forbidden of ['localStorage','indexedDB','fetch(','XMLHttpRequest','setTimeout(','setInterval(','MSOSEngines','T400','coefficient'])assert(!src.includes(forbidden),forbidden);
});

test('Board Screen has no background scheduler or sync hooks',()=>{
 const src=read('ui/board-screen.js');for(const forbidden of ['setTimeout(','setInterval(','visibilitychange','pagehide','pageshow','fetch(','XMLHttpRequest','localStorage','indexedDB'])assert(!src.includes(forbidden),forbidden);
});

test('only rebuild composition files wire Board UI and domain runtime together',()=>{
 const app=read('rebuild/board-app.js'),owners=read('rebuild/board-command-owners.js');assert(/require\(['"]\.\.\/ui\/board-renderer\.js/.test(app));assert(/require\(['"]\.\.\/ui\/board-controller\.js/.test(app));assert(/require\(['"]\.\.\/ui\/board-screen\.js/.test(app));assert(!/require\([^)]*engines\//.test(app));assert(!/require\([^)]*engines\//.test(owners));
});

if(fails){console.error(`\n${fails} Board architecture regression(s) failed`);process.exit(1)}console.log('\nALL BOARD ARCHITECTURE REGRESSIONS PASS');
