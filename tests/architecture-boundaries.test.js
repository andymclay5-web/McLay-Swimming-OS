'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const root=path.join(__dirname,'..','engines');
const files=['session-truth.js','session-lifecycle.js','evidence-retrieval.js','results-pathway.js','targets.js','adaptation.js','attendance.js','board-projection.js','capture-evidence.js'];
const src=Object.fromEntries(files.map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]));

test('domain engines contain no browser UI ownership',()=>{
 for(const [file,s] of Object.entries(src)){
  assert(!/\bdocument\s*\.|\bwindow\s*\.|querySelector\s*\(|innerHTML\s*=/.test(s),`${file} owns browser UI`);
 }
});

test('domain engines contain no direct localStorage, IndexedDB or network ownership',()=>{
 for(const [file,s] of Object.entries(src)){
  assert(!/\blocalStorage\b|\bindexedDB\b|\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(s),`${file} reaches directly into storage/network`);
 }
});

test('engines do not require each other by file path',()=>{
 for(const [file,s] of Object.entries(src)){
  assert(!/require\s*\(\s*['"][^'"]*engines\//.test(s),`${file} imports another engine implementation`);
  assert(!/require\s*\(\s*['"]\.\//.test(s),`${file} imports sibling implementation directly`);
 }
});

test('Session Truth has no athlete, attendance, T400, pathway or Board ownership',()=>{
 const s=src['session-truth.js'];for(const forbidden of ['localStorage','athlete_id','attendance','t400_','world_para_points','BoardProjection'])assert(!s.includes(forbidden),`Session Truth contains ${forbidden}`);
});

test('Session Lifecycle does not parse sessions or calculate coaching information',()=>{
 const s=src['session-lifecycle.js'];assert(!/AEROBIC|T400|raceIntent|zoneName|parseBlock|BoardProjection/.test(s));assert(/storage adapter/.test(s));
});

test('Evidence Retrieval does not decide targets, adaptations or pathway meaning',()=>{
 const s=src['evidence-retrieval.js'];assert(!/AEROBIC|practicalSendOff|default_volume_ratio|nextNational|BoardProjection/.test(s));
});

test('Results Pathway does not rummage storage or calculate training targets',()=>{
 const s=src['results-pathway.js'];assert(!/localStorage|indexedDB|AEROBIC|practicalSendOff|default_volume_ratio/.test(s));assert(/requires Evidence Retrieval/.test(s));
});

test('Target Engine owns formulas but no attendance, Board rendering or storage',()=>{
 const s=src['targets.js'];assert(/const AEROBIC=/.test(s));assert(!/HERE_STATUSES|innerHTML|localStorage|indexedDB/.test(s));assert(/requires Evidence Retrieval/.test(s));
});

test('Adaptation Engine owns athlete prescription changes but no T400 formula or Board rendering',()=>{
 const s=src['adaptation.js'];assert(/default_volume_ratio/.test(s));assert(!/const AEROBIC=|t400_|innerHTML|querySelector/.test(s));assert(/requires Evidence Retrieval/.test(s));
});

test('Attendance Engine contains no target, adaptation or parser ownership',()=>{
 const s=src['attendance.js'];assert(/HERE_STATUSES/.test(s));assert(!/AEROBIC|default_volume_ratio|raceIntent|parseBlock|BoardProjection/.test(s));
});

test('Board Projection composes contracts but contains no parser/T400/adaptation formulas',()=>{
 const s=src['board-projection.js'];assert(/requires Attendance Engine/.test(s));assert(/requires Adaptation Engine/.test(s));assert(/requires Target Engine/.test(s));assert(!/const AEROBIC=|default_volume_ratio|parseBlock|normaliseNaturalLine|t400_freestyle/.test(s));
});

test('Capture Evidence owns evidence addresses but never edits or reparses the session',()=>{
 const s=src['capture-evidence.js'];assert(/session_id/.test(s)&&/block_id/.test(s)&&/item_id/.test(s)&&/athlete_ids/.test(s));assert(!/parseBlock|AEROBIC|default_volume_ratio|current\.blocks\s*=/.test(s));
});

if(fails){console.error(`\n${fails} architecture boundary regression(s) failed`);process.exit(1)}
console.log('\nALL ARCHITECTURE BOUNDARIES PASS');
