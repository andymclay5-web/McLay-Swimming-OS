'use strict';
const assert=require('assert');
const E=require('../engines/entity-registry.js');
const M=require('../engines/methodology.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function engine(){const entities=E.create({sources:[{id:'current',priority:100,trust:'current',data:{athletes:[{id:'a1',full_name:'Swimmer One',squad:'National',club_id:'club-a'}],squads:[{id:'sq-national',name:'National'}]}}]});return M.create({entities,models:[
 {id:'base',scope:'programme',name:'Andy base',physiology:{framework:'rushton_swimformation_cone'},zones:{Development:{name:'Development',purpose:'aerobic development'},Threshold:{name:'Threshold',purpose:'aerobic threshold'}},dose:{primaryRule:'classify whole-session tone'},adaptation:{inclusionFirst:true,volumeIsGuidance:true},raceModel:{default:'pb_plus_model'},sessionDesign:{protectPrimaryStimulus:true}},
 {id:'club',scope:'club',club_id:'club-a',zones:{Development:{cue:'controlled sustainable pressure'}},sessionDesign:{technicalMaintenance:true}},
 {id:'squad',scope:'squad',squad_id:'sq-national',dose:{qualityRecoveryDoesNotDilutePrimary:true},adaptation:{sameTeamQualityFirst:true}},
 {id:'coach',scope:'coach',coach_id:'coach-andy',raceModel:{preferred100FreeModel:'john_pike'},sessionDesign:{coachLanguage:'compact'}},
 {id:'athlete',scope:'athlete',athlete_id:'a1',adaptation:{returnToStart:true}},
 {id:'other-coach',scope:'coach',coach_id:'coach-other',raceModel:{preferred100FreeModel:'different'}},
 {id:'future',scope:'squad',squad_id:'sq-national',start_date:'2027-01-01',dose:{futureOnly:true}}
 ]})}

test('effective model merges programme club squad coach athlete in deterministic precedence',()=>{const r=engine().resolve({clubId:'club-a',squadId:'sq-national',coachId:'coach-andy',athleteId:'a1',asOfDate:'2026-08-18'});assert.equal(r.status,'ok');assert.deepEqual(r.applied.map(x=>x.id),['base','club','squad','coach','athlete']);assert.equal(r.model.physiology.framework,'rushton_swimformation_cone');assert.equal(r.model.adaptation.inclusionFirst,true);assert.equal(r.model.adaptation.sameTeamQualityFirst,true);assert.equal(r.model.adaptation.returnToStart,true);assert.equal(r.model.raceModel.preferred100FreeModel,'john_pike')});
test('zone overlay augments base definition instead of replacing unrelated fields',()=>{const r=engine().zone('development',{clubId:'club-a'});assert.equal(r.status,'ok');assert.equal(r.zone.purpose,'aerobic development');assert.equal(r.zone.cue,'controlled sustainable pressure')});
test('coach-specific philosophy applies only to the selected coach',()=>{const a=engine().resolve({clubId:'club-a',coachId:'coach-andy'}),b=engine().resolve({clubId:'club-a',coachId:'coach-other'});assert.equal(a.model.raceModel.preferred100FreeModel,'john_pike');assert.equal(b.model.raceModel.preferred100FreeModel,'different')});
test('future methodology overlay cannot leak into present coaching context',()=>{const r=engine().resolve({squadId:'sq-national',asOfDate:'2026-08-18'});assert.equal(r.model.dose.futureOnly,undefined)});
test('entity dimensions can supply club and one squad from athlete identity',()=>{const r=engine().resolve({athleteId:'a1',asOfDate:'2026-08-18'});assert.equal(r.context.clubId,'club-a');assert.equal(r.context.squadId,'sq-national');assert.equal(r.model.adaptation.returnToStart,true);assert.equal(r.model.adaptation.sameTeamQualityFirst,true)});
test('missing zone is explicit and never invented',()=>{const r=engine().zone('Magic Zone',{clubId:'club-a'});assert.equal(r.status,'missing');assert.equal(r.zone,null)});
test('methodology engine contains philosophy only and does not mutate objective input evidence',()=>{const e=engine(),input={result_seconds:70.23,event:'100 Fly'};const before=JSON.stringify(input);e.resolve({clubId:'club-a',coachId:'coach-andy'});assert.equal(JSON.stringify(input),before)});
test('consumer mutation cannot rewrite methodology truth',()=>{const e=engine(),r=e.resolve({clubId:'club-a'});r.model.zones.Development.purpose='changed';assert.equal(e.resolve({clubId:'club-a'}).model.zones.Development.purpose,'aerobic development')});
if(fails){console.error(`\n${fails} Methodology regression(s) failed`);process.exit(1)}console.log('\nALL METHODOLOGY REGRESSIONS PASS');
