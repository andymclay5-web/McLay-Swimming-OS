'use strict';
const assert=require('assert');
const fs=require('fs');
const Storage=require('../assembly/browser-storage.js');
let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
console.log(`Assembly adaptation persistence wiring ${Storage.VERSION}`);
test('browser storage exposes a dedicated adaptation override key',()=>{const keys=Storage.keys('ci');assert.strictEqual(keys.adaptation,'ci.adaptation');assert.notStrictEqual(keys.adaptation,keys.lifecycle);assert.notStrictEqual(keys.adaptation,keys.capture)});
test('browser creates a dedicated adapter and injects it into App Composition',()=>{const src=fs.readFileSync('assembly/browser-app.js','utf8');assert(/adaptationStorage=new Storage\.JsonStorageAdapter\(\{storage:localStorage,key:keys\.adaptation\}\)/.test(src));assert(/App\.create\(\{[\s\S]*adaptationStorage/.test(src))});
test('App Composition gives persistent storage only to Adaptation owner',()=>{const src=fs.readFileSync('rebuild/app-composition.js','utf8');assert(/adaptationStorage=null/.test(src));assert(/E\.Adaptation\.create\(\{[^}]*storage:adaptationStorage/.test(src));const uses=(src.match(/adaptationStorage/g)||[]).length;assert(uses>=3);assert(!/E\.Attendance\.create\(\{[^}]*adaptationStorage/.test(src));assert(!/E\.SessionLifecycle\.create\(\{[^}]*adaptationStorage/.test(src))});
test('shell and renderer never read the adaptation storage key directly',()=>{for(const path of ['assembly/shell-model.js','assembly/shell-renderer.js'])assert(!/adaptationStorage|keys\.adaptation|msos\.assembly\.v1\.adaptation/.test(fs.readFileSync(path,'utf8')),`${path} reached into Adaptation storage`)});
if(failures){console.error(`\n${failures} adaptation-storage wiring regression(s) failed`);process.exit(1)}
console.log('\nALL ASSEMBLY ADAPTATION STORAGE WIRING REGRESSIONS PASS');
