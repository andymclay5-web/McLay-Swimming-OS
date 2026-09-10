'use strict';
// Real coaching failure this fixes (Andy's own build-list item 8, voice-memo spec): "the swim[m]er portal,
// they need to be able to challenge their stroke selection" -- but before this fix there was nothing to
// challenge, because the resolved #1-stroke choice never survived the trip from
// engines/coordinator.js's resolvePrescriptionContext (which attaches item.strokeResolution =
// {kind:'number-one', source, stroke}) out to the swimmer portal. architecture/training-history-core.js's
// projection() built each block "line" from only the item's weighted metres/zones/strokes contribution,
// silently dropping strokeResolution -- and engines/swimmer-invite-bn.js's safeSession() (which builds the
// exact payload published to the swimmer's device) only ever forwarded a fixed, explicit list of line fields,
// so even if strokeResolution had survived this far it still would never have reached the portal.
//
// This test drives the REAL training-history-core.js projection() with a `prescribe` function that attaches
// strokeResolution (exactly the shape coordinator.js's resolvePrescriptionContext produces), confirming the
// resulting line carries stroke/strokeResolution -- and then drives the REAL swimmer-invite-bn.js safeSession()
// on top of it (via a stubbed swimmerTrainingBG.projectionFor, matching how swimmer-training-bd.js really
// wires prescribe to E.Coordinator.prescription), confirming the field survives all the way to what actually
// gets published to the swimmer's device. A second item with no stroke context (an ordinary set) must come
// through with stroke:'' / strokeResolution:null, proving the pill only appears where it genuinely applies.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');

const T=require(path.join(root,'architecture','training-history-core.js'));

const session={
  id:'s1',
  identity:{date:'2026-09-10',dayPart:'AM',squads:['Development'],course:'SCM',title:'Development AM'},
  blocks:[{id:'main',title:'Main',items:[
    {id:'i-numberone',kind:'set',reps:4,distance:100,raw:'4 x 100 #1 Stroke',stroke:'',cycleSeconds:100},
    {id:'i-plain',kind:'set',reps:4,distance:50,raw:'4 x 50 Freestyle Easy',stroke:'Freestyle',cycleSeconds:50},
  ]}],
};
const athlete={id:'ath-matthew',full_name:'Matthew Example',squad:'Development'};

// Mirrors engines/coordinator.js's resolvePrescriptionContext: only the "#1 Stroke" item gets strokeResolution.
const prescribe=(s,item)=>{
  if(item.id==='i-numberone')return{item:{...item,stroke:'Breaststroke',strokeResolution:{kind:'number-one',source:'performance-context',stroke:'Breaststroke'}},target:null};
  return{item,target:null};
};

function flattenRows(s){const rows=[];for(const block of s.blocks)for(const item of block.items)rows.push({block,item,roundMultiplier:1});return rows;}
const projected=T.projection(flattenRows(session),{session,athlete,prescribe});
const lineByLabel=label=>projected.blocks.flatMap(b=>b.items).find(l=>l.label===label);

const strokeLine=lineByLabel('4 x 100 #1 Stroke');
assert.ok(strokeLine,'the #1-stroke line must be present in the projection');
assert.equal(strokeLine.stroke,'Breaststroke','projection() must carry the resolved stroke onto the line');
assert.deepEqual(strokeLine.strokeResolution,{kind:'number-one',source:'performance-context',stroke:'Breaststroke'},'projection() must carry the full strokeResolution object, not just the stroke name');

const plainLine=lineByLabel('4 x 50 Freestyle Easy');
assert.ok(plainLine,'the plain line must be present in the projection');
assert.equal(plainLine.stroke,'','a line with no #1-stroke context must not have a stroke pulled from thin air');
assert.equal(plainLine.strokeResolution,null,'a line with no #1-stroke context must carry a null strokeResolution, not an empty object');

// --- Now drive the REAL swimmer-invite-bn.js safeSession() on top of this, exactly as the app really wires it:
// swimmer-training-bd.js's real prescribe is `(session,item,a)=>E.Coordinator.prescription(session,item,a,M.state)`,
// and projectionFor calls architecture/athlete-report-core.js's athleteSessionProjection with that prescribe.
// Stubbing swimmerTrainingBG.projectionFor to call the REAL athleteSessionProjection with the SAME prescribe
// used above proves the field survives that second real hop too.
const AR=require(path.join(root,'architecture','athlete-report-core.js'));
global.document={readyState:'complete',querySelector:()=>null,addEventListener(){}};
global.requestAnimationFrame=()=>{};
global.MSOS4={
  ui:{},
  state:{settings:{selectedAthleteId:athlete.id},athletes:[athlete],canonicalSessions:{[session.id]:session},captures:[]},
  swimmerTrainingBG:{projectionFor:(a,s)=>AR.athleteSessionProjection({session:s,athlete:a,prescribe})},
  currentSession:()=>session,
};
require(path.join(root,'engines','swimmer-invite-bn.js'));
const built=global.MSOS4.swimmerInviteBN.safeSession(athlete,session);
assert.ok(built,'safeSession must build a session payload');
const publishedStrokeItem=built.blocks.flatMap(b=>b.items).find(i=>i.label==='4 x 100 #1 Stroke');
const publishedPlainItem=built.blocks.flatMap(b=>b.items).find(i=>i.label==='4 x 50 Freestyle Easy');
assert.ok(publishedStrokeItem,'the #1-stroke item must be present in the published payload');
assert.equal(publishedStrokeItem.stroke,'Breaststroke','safeSession() must surface the resolved stroke to the swimmer portal payload');
assert.deepEqual(publishedStrokeItem.strokeResolution,{kind:'number-one',source:'performance-context',stroke:'Breaststroke'});
assert.ok(publishedPlainItem,'the plain item must be present in the published payload');
assert.equal(publishedPlainItem.stroke,'','a plain item must publish an empty stroke, not undefined or a guess');
assert.equal(publishedPlainItem.strokeResolution,null);

console.log('STROKE_RESOLUTION_PROJECTION_PASS');
