'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const root=path.join(__dirname,'..','engines');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

for(const file of ['delivered-session.js','plan-context.js']){
 test(`${file} contains no browser/storage/network implementation`,()=>{
  const s=read(file);assert(!/\bdocument\s*\.|\bwindow\s*\.|querySelector\s*\(|innerHTML\s*=|\blocalStorage\b|\bindexedDB\b|\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(s));
 });
}

test('Delivered Session owns delivery occurrences and finish snapshots, not parser/targets/adaptation',()=>{
 const s=read('delivered-session.js');assert(/delivered_occurrences/.test(s));assert(/finish_point/.test(s));assert(!/AEROBIC|t400_|default_volume_ratio|parseBlock|normaliseNaturalLine/.test(s));
});

test('Plan Context resolves explicit planning facts without inspecting workout content',()=>{
 const s=read('plan-context.js');assert(/primaryStimulus/.test(s));assert(/missing_session_intent/.test(s));assert(!/AEROBIC|t400_|default_volume_ratio|parseBlock|raceIntent|repInstructions/.test(s));
});

if(fails){console.error(`\n${fails} extended architecture regression(s) failed`);process.exit(1)}
console.log('\nALL EXTENDED ARCHITECTURE BOUNDARIES PASS');
