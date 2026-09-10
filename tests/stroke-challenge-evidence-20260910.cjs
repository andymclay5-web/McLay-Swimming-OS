'use strict';
// Real coaching failure this fixes (Andy's own voice-memo spec, build-list item 8): "I'd say yes or no
// depending on the evidence I had... [MSOS] would either say, yeah, that logic makes sense and let them do it,
// or say something along the lines of check with Andy because that doesn't match up." Before this fix, a
// swimmer's stroke challenge (see tests/swimmer-portal-stroke-challenge-20260910.cjs for the swimmer-side half)
// landed in Andy's feedback inbox as an inert note with no evidence check at all -- Andy had to work out
// himself, from memory, whether the proposed stroke made sense. This drives the REAL
// engines/swimmer-feedback-cu.js evaluateStrokeChallenge() against the REAL engines/performance.js and
// engines/stroke-balance.js (not stubs of those two -- only their own Evidence/RacePace dependencies are
// stubbed, the same pattern tests/deck-fast-stroke-resolution-20260826.cjs uses), covering both of Andy's
// named evidence sources: for a medley swimmer, the training-volume "which stroke needs work" logic (lowest
// weighted 7-day share); for a non-medley swimmer, ranked World Aquatics points (the highest-points stroke is
// "#1"). It also drives the REAL applyStrokeOverride() end to end, confirming it writes the same
// sessionId/itemId/athleteId/patch.stroke override row the coach's own poolside stroke-change UI
// (engines/modification-edit.js) writes -- reusing one write path, not inventing a second one -- and reuses
// (does not duplicate) the override row on a second approval.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');

// ---------------------------------------------------------------------------------------------------------
// Fixture: one medley swimmer (best event is IM -> exercises the stroke-balance "needs work" branch) and one
// non-medley swimmer (best event is a single stroke -> exercises the ranked World Aquatics points branch).
// ---------------------------------------------------------------------------------------------------------
const imSwimmer={id:'ath-im',full_name:'IM Swimmer',squad:'Development'};
const frSwimmer={id:'ath-fr',full_name:'Freestyle Swimmer',squad:'Development'};

const rankedByAthlete={
  'ath-im':[{stroke:'IM',distance:200,course:'SCM',score:700}],
  'ath-fr':[{stroke:'Freestyle',distance:100,course:'SCM',score:650},{stroke:'Backstroke',distance:100,course:'SCM',score:500}],
};
global.MSOSEngines={
  Evidence:{stroke:v=>{const s=String(v||'');return['Freestyle','Backstroke','Breaststroke','Butterfly','IM'].includes(s)?s:'';}},
  RacePace:{rankedEvents:(ath)=>(rankedByAthlete[ath.id]||[]).slice().sort((a,b)=>b.score-a.score)},
  Modification:{adaptItem:(item)=>item}, // no per-athlete adaptation needed for this fixture
  Coordinator:{clearCache(){}},
};

// The IM swimmer's session/block/item data: Backstroke gets almost no weighted work this week (easy, 100m)
// while Freestyle/Breaststroke/Butterfly each get a real development set (400m @ .45 weight = 360 weighted) --
// so Backstroke must come out as the clear "needs work" stroke, and Butterfly must come out as clearly NOT.
const imSession={id:'s-im',identity:{date:'2026-09-09',squads:['Development'],course:'SCM'},
  blocks:[{id:'m',title:'Main',items:[
    {id:'fr',kind:'set',reps:4,distance:100,stroke:'Freestyle',raw:'4 x 100 Freestyle'},
    {id:'br',kind:'set',reps:4,distance:100,stroke:'Breaststroke',raw:'4 x 100 Breaststroke'},
    {id:'fl',kind:'set',reps:4,distance:100,stroke:'Butterfly',raw:'4 x 100 Butterfly'},
    {id:'bk',kind:'set',reps:2,distance:50,stroke:'Backstroke',raw:'2 x 50 Backstroke Easy'},
  ]}]};

global.MSOS4={
  ui:{renderCurrent(){}},
  state:{
    settings:{selectedAthleteId:imSwimmer.id,storageRevision:1},
    athletes:[imSwimmer,frSwimmer],
    canonicalSessions:{[imSession.id]:imSession},
    attendance:[{session_id:imSession.id,athlete_id:imSwimmer.id,status:'present'}],
    adaptationOverrides:[],
  },
  pathway:{isPara:()=>false},
  boardEngine:{findItem:(session,itemId)=>(session.blocks||[]).flatMap(b=>b.items).find(i=>i.id===itemId)||null},
};
require(path.join(root,'engines','performance.js'));
require(path.join(root,'engines','stroke-balance.js'));
require(path.join(root,'engines','swimmer-feedback-cu.js'));
const X=global.MSOS4.swimmerFeedbackCU;
assert.ok(X?.evaluateStrokeChallenge,'swimmer-feedback-cu.js must install and export evaluateStrokeChallenge');

// --- Medley swimmer: Backstroke genuinely needs work -> evidence must agree -------------------------------
const bkVerdict=X.evaluateStrokeChallenge(imSwimmer,imSession,'Backstroke');
assert.equal(bkVerdict.approved,true,`Backstroke is the clear lowest-weighted-share stroke this week and must be approved: ${bkVerdict.reason}`);
assert.match(bkVerdict.reason,/needs work|under-trained/i);

// --- Medley swimmer: Butterfly already gets plenty of work -> evidence must NOT agree -----------------------
const flVerdict=X.evaluateStrokeChallenge(imSwimmer,imSession,'Butterfly');
assert.equal(flVerdict.approved,false,`Butterfly already gets a full development set this week and must not be auto-approved: ${flVerdict.reason}`);
assert.match(flVerdict.reason,/check with andy/i);

// --- Non-medley swimmer: Freestyle IS the highest-WA-points stroke -> evidence must agree -------------------
const frVerdict=X.evaluateStrokeChallenge(frSwimmer,{identity:{course:'SCM'}},'Freestyle');
assert.equal(frVerdict.approved,true,`Freestyle is this swimmer's own highest-points stroke and must be approved: ${frVerdict.reason}`);

// --- Non-medley swimmer: Backstroke has real but LOWER points -> evidence must NOT agree --------------------
const frBkVerdict=X.evaluateStrokeChallenge(frSwimmer,{identity:{course:'SCM'}},'Backstroke');
assert.equal(frBkVerdict.approved,false,`Backstroke scores fewer WA points than this swimmer's real #1 (Freestyle) and must not be auto-approved: ${frBkVerdict.reason}`);
assert.match(frBkVerdict.reason,/check with andy/i);

// --- Non-medley swimmer: Breaststroke has NO ranked evidence at all -> evidence must NOT agree --------------
const frNoEvidence=X.evaluateStrokeChallenge(frSwimmer,{identity:{course:'SCM'}},'Breaststroke');
assert.equal(frNoEvidence.approved,false,'a stroke with no ranked World Aquatics evidence at all must never be auto-approved');
assert.match(frNoEvidence.reason,/no ranked/i);

// ---------------------------------------------------------------------------------------------------------
// applyStrokeOverride(): writes the SAME sessionId/itemId/athleteId/patch.stroke shape
// engines/modification-edit.js's own poolside override writes, reuses (does not duplicate) the row on a
// second approval, and acknowledges the swimmer's action.
// ---------------------------------------------------------------------------------------------------------
const acked=[];
global.MSOS4.swimmerInviteBN={acknowledgeSessionAction:async id=>{acked.push(id);}};
global.MSOS4.store={save(){}};
global.MSOS4.cloud={stageAdaptationsForSession(){}};
global.MSOS4.toast=()=>{};

const action={id:'act-1',action_type:'challenge',session_id:imSession.id,item_id:'bk',payload:{kind:'stroke',currentStroke:'',proposedStroke:'Backstroke',reason:'test'}};
assert.equal(X.canApplyStroke(action),true,'a stroke challenge whose session/item can still be found must be applicable');

(async()=>{
  await X.applyStrokeOverride(action);
  assert.equal(global.MSOS4.state.adaptationOverrides.length,1,'exactly one override row must be created');
  const row=global.MSOS4.state.adaptationOverrides[0];
  assert.equal(row.sessionId,imSession.id);
  assert.equal(row.itemId,'bk');
  assert.equal(row.athleteId,imSwimmer.id);
  assert.equal(row.patch.stroke,'Backstroke','the override patch must carry the approved stroke, matching modification-edit.js\'s own patch.stroke shape');
  assert.equal(row.active,true);
  assert.deepEqual(acked,['act-1'],'the swimmer\'s action must be acknowledged once applied');

  // A second approval (e.g. re-applying, or approving a different proposed stroke for the same line) must
  // reuse the same override row, not create a duplicate one -- exactly like modification-edit.js's upsert().
  const secondAction={id:'act-2',action_type:'challenge',session_id:imSession.id,item_id:'bk',payload:{kind:'stroke',currentStroke:'Backstroke',proposedStroke:'Butterfly',reason:'changed my mind'}};
  await X.applyStrokeOverride(secondAction);
  assert.equal(global.MSOS4.state.adaptationOverrides.length,1,'a second approval for the same line must reuse the existing override row, not create a second one');
  assert.equal(global.MSOS4.state.adaptationOverrides[0].patch.stroke,'Butterfly');
  assert.deepEqual(acked,['act-1','act-2']);

  console.log('STROKE_CHALLENGE_EVIDENCE_PASS');
})().catch(err=>{console.error('STROKE_CHALLENGE_EVIDENCE_FAIL',err);process.exit(1);});
