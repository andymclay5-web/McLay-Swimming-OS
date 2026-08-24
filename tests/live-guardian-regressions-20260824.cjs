'use strict';
const assert=require('node:assert/strict');
const Evidence=require('../engines/evidence.js');
global.MSOSEngines={Evidence};
const RacePace=require('../engines/race-pace.js');
global.MSOSEngines.RacePace=RacePace;
const Modification=require('../engines/modification.js');
global.MSOSEngines.Modification=Modification;

// Current race-model contracts: the athlete fixture must carry the model inputs the engine actually requires.
const imAth={id:'im-ath',sex:'F'};
const imState={athletes:[imAth],resultsPbBoard:[{athlete_id:imAth.id,distance:400,stroke:'IM',course:'SCM',result_seconds:320}],resultsEventHistory:[],coachResults:[],worldAquaticsBaseTimes:[],courseConversions:[]};
const imItem={id:'im',kind:'set',reps:4,distance:50,stroke:'Butterfly',raw:'4 x 50 Fly @ 400 IM pace',text:'4 x 50 Fly @ 400 IM pace',raceIntent:{distance:400,eventStroke:'IM',workingStroke:'Butterfly'},repInstructions:[],cues:[],equipment:[],composition:[]};
let r=RacePace.forItem({id:'s',identity:{course:'SCM'}},imItem,imAth,imState,'');assert.equal(r.status,'ok');assert.match(r.source||'',/Race pace model/i);
const oddAth={id:'odd-ath',sex:'M'},oddState={athletes:[oddAth],resultsPbBoard:[{athlete_id:oddAth.id,distance:200,stroke:'Freestyle',course:'SCM',result_seconds:120}],resultsEventHistory:[],coachResults:[],worldAquaticsBaseTimes:[],courseConversions:[]};
const oddItem={id:'odd',kind:'set',reps:4,distance:50,stroke:'Freestyle',raw:'4 x 50 Freestyle Odd 200 Pace / Even Drill',text:'4 x 50 Freestyle Odd 200 Pace / Even Drill',raceIntent:null,repInstructions:[{rep:1,label:'200 Pace',raceIntent:{distance:200,eventStroke:'Freestyle',workingStroke:'Freestyle'}},{rep:2,label:'Drill',raceIntent:null},{rep:3,label:'200 Pace',raceIntent:{distance:200,eventStroke:'Freestyle',workingStroke:'Freestyle'}},{rep:4,label:'Drill',raceIntent:null}],cues:[],equipment:[],composition:[]};
r=RacePace.forItem({id:'s2',identity:{course:'SCM'}},oddItem,oddAth,oddState,'');assert.equal(r.status,'rep_race');assert.deepEqual(r.rows.map(x=>x.status),['ok','none','ok','none']);

// Modification owner already contains the live Amber adaptive-upper-body and current McKenzie fast-75 contracts.
const amber={id:'amber',full_name:'Amber Proudfoot'},baseState={athletes:[amber],adaptationProfiles:[],adaptationOverrides:[],trainingTestTypes:[],trainingTestResults:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[]};
let x=Modification.adaptItem({id:'a',kind:'set',reps:4,distance:25,stroke:'',raw:'4 x 25 Underwater with Fins',text:'4 x 25 Underwater with Fins',cues:[],pattern:[],repPattern:[],repInstructions:[],equipment:['Fins'],composition:[]},amber,baseState,{id:'s',identity:{course:'SCM'}});assert.match(x.raw||x.text||'',/upper-body/i);assert.ok(Array.isArray(x.adaptiveOptions)&&x.adaptiveOptions.length>0);assert.equal((x.equipment||[]).some(v=>/fin/i.test(String(v))),false);
const mck={id:'mck',full_name:'McKenzie Drage'};x=Modification.adaptItem({id:'m',kind:'set',reps:4,distance:75,stroke:'',raw:'4 x 75 #1 Fast @ 1:30',text:'4 x 75 #1 Fast @ 1:30',cues:[],pattern:[],repPattern:[],repInstructions:[],equipment:[],composition:[],cycleSeconds:90,restSeconds:10},mck,{...baseState,athletes:[mck]},{id:'s',identity:{course:'SCM'}});assert.notEqual(Number(x.cycleSeconds),115);assert.equal((Number(x.reps)*Number(x.distance))%50,0);

// Access authority: swimmer devices are self-only and coach legacy evidence is deny-by-default.
delete require.cache[require.resolve('../engines/access-authority.js')];
global.MSOS4={state:{settings:{activeRole:'owner',activeUserAthleteId:'',assistantPermissions:[],assistantSquads:[]},athletes:[{id:'a',full_name:'Athlete A',active:true,squad:'National'},{id:'b',full_name:'Athlete B',active:true,squad:'National'}],attendance:[],meetEntries:[{id:'ea',meet_id:'meet',athlete_id:'a',event_number:1},{id:'eb',meet_id:'meet',athlete_id:'b',event_number:2}],meetEvidence:[{id:'shared',entry_id:'ea',athlete_id:'a',audience:'shared'},{id:'private',entry_id:'ea',athlete_id:'a',audience:'coach'},{id:'other',entry_id:'ea',athlete_id:'b',audience:'shared'}]},access:{},meet:{},store:{save:s=>s},util:{clone:v=>JSON.parse(JSON.stringify(v))}};
require('../engines/access-authority.js');const A=global.MSOS4.access,D=global.MSOS4.meet;A.setRole('swimmer',{athleteId:'a'});assert.deepEqual(A.visibleAthletes().map(v=>v.id),['a']);assert.equal(A.can('session.edit'),false);assert.equal(A.captureVisible({athlete_id:'a',legacy_capture:true,text_content:'coach legacy'}),false);assert.equal(A.captureVisible({athlete_id:'a',legacy_capture:true,audience:'shared'}),true);assert.deepEqual(D.visibleEntries('meet').map(v=>v.id),['ea']);assert.deepEqual(D.visibleEvidence('ea').map(v=>v.id),['shared']);

// Controlled reference fixtures must not be polluted by same-athlete live rows.
delete require.cache[require.resolve('../engines/reference-authority.js')];
global.MSOS4={state:{resultsPbBoard:[{id:'live',athlete_id:'elsie',course:'SCM',distance:200,stroke:'Freestyle',result_seconds:154.73}]},refs:{data:{results_pb_board:[{id:'fixture',athlete_id:'elsie',course:'SCM',distance:200,stroke:'Breaststroke',result_seconds:200.78}]},get:()=>[]},util:{hash:s=>s.length}};require('../engines/reference-authority.js');const rows=global.MSOS4.refs.get('results_pb_board');assert.equal(rows.length,1);assert.equal(rows[0].stroke,'Breaststroke');

// Final release identity and attestation are one value owned after UI layers.
delete require.cache[require.resolve('../engines/release-authority.js')];
global.MSOS4={BUILD:'v4-coach-loop-20260821ai',CORE:'old',release:{}};require('../engines/release-authority.js');assert.equal(global.MSOS4.BUILD,'v4-engine-authority-20260824');assert.equal(global.MSOS4.RELEASE_ATTESTATION.build,global.MSOS4.BUILD);assert.equal(global.MSOS4.RELEASE_ATTESTATION.softwareReady,true);
console.log('LIVE_GUARDIAN_77_REGRESSIONS_PASS');
