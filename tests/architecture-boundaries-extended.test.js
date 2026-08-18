'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const root=path.join(__dirname,'..','engines');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

for(const file of ['delivered-session.js','plan-context.js','timing.js','test-protocol.js','test-result-input.js']){
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

test('Timing owns raw measurement only and cannot decide T400 validity, zones or training targets',()=>{
 const s=read('timing.js');assert(/recordSplit/.test(s));assert(/finishAthlete/.test(s));assert(/elapsed_seconds/.test(s));assert(!/t400_freestyle|valid_for_anchor|threshold|development|overload|regeneration|training_target_anchor|aerobic_anchor/i.test(s));
});

test('Test Protocol owns protocol validity but contains no stopwatch, target or adaptation implementation',()=>{
 const s=read('test-protocol.js');assert(/DEFAULT_T400/.test(s));assert(/validateObservation/.test(s));assert(!/recordSplit|finishAthlete|setOverride|latestTrainingTestEvidence|sendOff|default_volume_ratio/.test(s));
});

test('Test Result Input owns provenance and verification, not timing, target or Evidence Retrieval storage',()=>{
 const s=read('test-result-input.js');assert(/evidence_status/.test(s));assert(/captureFromTiming/.test(s));assert(/source_metadata/.test(s));assert(!/latestTrainingTestEvidence|sendOff|default_volume_ratio|AEROBIC_TABLES|require\(['\"]\.\/evidence-retrieval/.test(s));
});

if(fails){console.error(`\n${fails} extended architecture regression(s) failed`);process.exit(1)}
console.log('\nALL EXTENDED ARCHITECTURE BOUNDARIES PASS');
