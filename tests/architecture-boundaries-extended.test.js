'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const root=path.join(__dirname,'..','engines');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

for(const file of ['delivered-session.js','plan-context.js','timing.js','test-protocol.js','test-result-input.js','meet-lifecycle.js','meet-result-input.js','official-results-reconciliation.js','standards-records.js','race-model.js','evidence-publication.js']){
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

test('Meet Lifecycle owns meet/session/event/entry/race lineage and never owns result interpretation',()=>{
 const s=read('meet-lifecycle.js');assert(/upsertMeet/.test(s));assert(/upsertEvent/.test(s));assert(/upsertEntry/.test(s));assert(/upsertRace/.test(s));assert(/lineage/.test(s));assert(!/result_seconds|personalBest|qualifying|record|WA points|targetSeconds|t400_/i.test(s));
});

test('Meet Result Input owns provisional/official race-result evidence without PB, record or qualification logic',()=>{
 const s=read('meet-result-input.js');assert(/evidence_status/.test(s));assert(/capturePaste/.test(s));assert(/captureImage/.test(s));assert(/applyOfficial/.test(s));assert(/captured_observation/.test(s));assert(!/personalBest|qualifying|canterbury record|WA points|targetSeconds|AEROBIC_TABLES/i.test(s));
});

test('Official Results Reconciliation compares official truth and delegates writes rather than becoming Results/Pathway',()=>{
 const s=read('official-results-reconciliation.js');assert(/preview/.test(s));assert(/applyOfficial/.test(s));assert(/captureOfficial/.test(s));assert(/provisional_not_confirmed/.test(s));assert(!/personalBest|qualifying|record benchmark|WA points|targetSeconds|AEROBIC_TABLES/i.test(s));
});

test('Standards and Records owns eligibility points milestones and records but never selects PB evidence',()=>{
 const s=read('standards-records.js');assert(/statusForResult/.test(s));assert(/pointSteps/.test(s));assert(/record/.test(s));assert(/classificationStatus/.test(s));assert(!/personalBest|latestTrainingTestEvidence|trainingTests\(|coach_results|meet-result-input|test-result-input/.test(s));
});

test('Race Model owns loaded race split mathematics only and refuses hidden fallback models',()=>{
 const s=read('race-model.js');assert(/normalizeModel/.test(s));assert(/model_missing/.test(s));assert(/compare\(/.test(s));assert(!/qualifying|personalBest|latestTrainingTestEvidence|t400_|AEROBIC_TABLES|world_para_points|wa_points/i.test(s));
});

test('Evidence Publication owns verified publication boundary without interpreting standards or PB meaning',()=>{
 const s=read('evidence-publication.js');assert(/verifiedSource/.test(s));assert(/permanent_eligible/.test(s));assert(/operational_only/.test(s));assert(!/qualifying|personalBest|pointSteps|record benchmark|targetSeconds|AEROBIC_TABLES/i.test(s));
});

if(fails){console.error(`\n${fails} extended architecture regression(s) failed`);process.exit(1)}
console.log('\nALL EXTENDED ARCHITECTURE BOUNDARIES PASS');
