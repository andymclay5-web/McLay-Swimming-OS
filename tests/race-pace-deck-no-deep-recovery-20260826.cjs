'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');

const Evidence=require(path.join('..','engines','evidence.js'));
global.MSOSEngines={Evidence};
let deepCalls=0;
global.MSOS4={
  state:{settings:{view:'board',storageRevision:12},_evidenceBridge:{hydratedAt:'2026-08-26T05:00:00.000Z',contentRevision:4}},
  engineBridge:{ensurePathwayAthlete(){deepCalls++;return 0;}}
};
const RacePace=require(path.join('..','engines','race-pace.js'));
global.MSOSEngines.RacePace=RacePace;

const athlete={id:'no-pb',full_name:'No PB Swimmer',sex:'M'};
const session={id:'deck-rp',identity:{course:'SCM'}};
const item={id:'rp200',kind:'set',reps:4,distance:50,stroke:'Freestyle',raw:'4 x 50 Freestyle 200 Pace',text:'4 x 50 Freestyle 200 Pace',raceIntent:{distance:200,eventStroke:'Freestyle'},repInstructions:[],cycleSeconds:60};
const state={athletes:[athlete],settings:{view:'board',storageRevision:12},resultsPbBoard:[],resultsEventHistory:[],coachResults:[],courseConversions:[],worldAquaticsBaseTimes:[],_refs:{},_evidenceBridge:{hydratedAt:'2026-08-26T05:00:00.000Z',contentRevision:4}};
global.MSOS4.state=state;

let out=RacePace.forItem(session,item,athlete,state);
assert.equal(out.status,'missing');
assert.equal(deepCalls,0,'Board race pace must not synchronously invoke deep pathway recovery for a zero-PB swimmer');

const hashItem={...item,id:'rp-hash',stroke:'',raw:'4 x 50 #1 Stroke 200 Pace',text:'4 x 50 #1 Stroke 200 Pace'};
out=RacePace.forItem(session,hashItem,athlete,state);
assert.equal(out.status,'missing');
assert.equal(deepCalls,0,'Board #1 race pace stroke resolution must stay local and non-blocking');

state.resultsPbBoard.push({id:'pb1',athlete_id:athlete.id,distance:200,stroke:'Freestyle',course:'SCM',result_seconds:130,wa_points:400,sex:'M'});
RacePace.invalidate(state);
const first=RacePace.pb(athlete,state,{course:'SCM',distance:200,stroke:'Freestyle'});
assert.ok(first&&first._anchor_seconds===130);
state._evidenceBridge.hydratedAt='2026-08-26T05:00:30.000Z';
const second=RacePace.pb(athlete,state,{course:'SCM',distance:200,stroke:'Freestyle'});
assert.strictEqual(second,first,'hydratedAt-only churn must not invalidate race-pace PB cache identity');
assert.equal(deepCalls,0);

const deepState={athletes:[athlete],settings:{view:'athletes',storageRevision:12},resultsPbBoard:[],resultsEventHistory:[],coachResults:[],courseConversions:[],worldAquaticsBaseTimes:[],_refs:{},_evidenceBridge:{hydratedAt:'2026-08-26T05:01:00.000Z',contentRevision:4}};
global.MSOS4.state=deepState;
RacePace.invalidate(deepState);
RacePace.pb(athlete,deepState,{course:'SCM',distance:200,stroke:'Freestyle'});
assert.equal(deepCalls,1,'Non-deck performance views should retain deep pathway recovery capability');

console.log('RACE_PACE_DECK_NO_DEEP_RECOVERY_PASS');
