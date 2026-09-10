'use strict';
// Real coaching failure this fixes (Andy's own voice-memo spec, follow-up to the stroke-challenge feature):
// "Matthew will be doing his sessions when I'm not thinking about swimming" -- a stroke challenge needs an
// instant, evidence-checked answer on the swimmer's own device, not only once Andy opens his feedback inbox
// later. Neither the swimmer portal nor a Supabase function has access to M.performanceEngine/M.strokeBalance,
// so the only safe way to give an instant answer without a second, competing implementation of the evidence
// logic (see engines/stroke-balance.js's own comment) is to publish the exact evidence
// engines/swimmer-feedback-cu.js already checks a challenge against, alongside the session, so
// supabase/20260910_swimmer_stroke_challenge_rpc.sql's RPC can apply the identical rule server-side. This test
// pins two things: (1) M.strokeBalance.challengeEvidence()'s exact shape for a medley swimmer (isMedley,
// needsWorkStrokes, shares) and a non-medley swimmer (topStroke, rankedPoints) -- the SQL migration's approve
// rule depends on this shape exactly; (2) engines/swimmer-invite-bn.js's safeSession() publishes that evidence
// on every item that has a resolved #1 stroke, and omits it (null) on plain items and when there is no ranked
// evidence at all -- a swimmer must never see a stale or fabricated verdict.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');

const imSwimmer={id:'ath-im',full_name:'IM Swimmer',squad:'Development'};
const frSwimmer={id:'ath-fr',full_name:'Freestyle Swimmer',squad:'Development'};
const noEvidenceSwimmer={id:'ath-none',full_name:'No Evidence Swimmer',squad:'Development'};

const rankedByAthlete={
  'ath-im':[{stroke:'IM',distance:200,course:'SCM',score:700}],
  'ath-fr':[{stroke:'Freestyle',distance:100,course:'SCM',score:650},{stroke:'Backstroke',distance:100,course:'SCM',score:500}],
  'ath-none':[],
};
global.MSOSEngines={
  Evidence:{stroke:v=>{const s=String(v||'');return['Freestyle','Backstroke','Breaststroke','Butterfly','IM'].includes(s)?s:'';}},
  RacePace:{rankedEvents:(ath)=>(rankedByAthlete[ath.id]||[]).slice().sort((a,b)=>b.score-a.score)},
  Modification:{adaptItem:(item)=>item},
  Coordinator:{clearCache(){}},
};

const imSession={id:'s-im',identity:{date:'2026-09-09',squads:['Development'],course:'SCM'},
  blocks:[{id:'m',title:'Main',items:[
    {id:'i-numberone',kind:'set',reps:4,distance:100,raw:'4 x 100 #1 Stroke',stroke:'',cycleSeconds:100},
    {id:'i-plain',kind:'set',reps:4,distance:50,raw:'4 x 50 Freestyle Easy',stroke:'Freestyle',cycleSeconds:50},
    {id:'br',kind:'set',reps:4,distance:100,stroke:'Breaststroke',raw:'4 x 100 Breaststroke'},
    {id:'fl',kind:'set',reps:4,distance:100,stroke:'Butterfly',raw:'4 x 100 Butterfly'},
    {id:'bk',kind:'set',reps:2,distance:50,stroke:'Backstroke',raw:'2 x 50 Backstroke Easy'},
  ]}]};
const frSession={id:'s-fr',identity:{date:'2026-09-09',squads:['Development'],course:'SCM'},
  blocks:[{id:'m',title:'Main',items:[{id:'i-numberone',kind:'set',reps:4,distance:100,raw:'4 x 100 #1 Stroke',stroke:'',cycleSeconds:100}]}]};
const noEvidenceSession={id:'s-none',identity:{date:'2026-09-09',squads:['Development'],course:'SCM'},
  blocks:[{id:'m',title:'Main',items:[{id:'i-numberone',kind:'set',reps:4,distance:100,raw:'4 x 100 #1 Stroke',stroke:'',cycleSeconds:100}]}]};

global.MSOS4={
  ui:{},
  state:{
    settings:{selectedAthleteId:imSwimmer.id,storageRevision:1},
    athletes:[imSwimmer,frSwimmer,noEvidenceSwimmer],
    canonicalSessions:{[imSession.id]:imSession,[frSession.id]:frSession,[noEvidenceSession.id]:noEvidenceSession},
    attendance:[
      {session_id:imSession.id,athlete_id:imSwimmer.id,status:'present'},
      {session_id:frSession.id,athlete_id:frSwimmer.id,status:'present'},
      {session_id:noEvidenceSession.id,athlete_id:noEvidenceSwimmer.id,status:'present'},
    ],
    adaptationOverrides:[],
    captures:[],
  },
  pathway:{isPara:()=>false},
  currentSession:()=>imSession,
};
require(path.join(root,'engines','performance.js'));
require(path.join(root,'engines','stroke-balance.js'));

// --- Part 1: M.strokeBalance.challengeEvidence()'s exact shape -----------------------------------------------
const B=global.MSOS4.strokeBalance;
assert.ok(B?.challengeEvidence,'stroke-balance.js must install and export challengeEvidence');

const imEvidence=B.challengeEvidence(imSwimmer,global.MSOS4.state,imSession);
assert.equal(imEvidence.hasEvidence,true);
assert.equal(imEvidence.isMedley,true,'a swimmer whose #1 ranked event is IM must be classified as medley');
assert.deepEqual(imEvidence.needsWorkStrokes,['Backstroke','Freestyle'],`Backstroke (barely trained) and Freestyle (incidental weight) must be the two lowest-share strokes: ${JSON.stringify(imEvidence.shares)}`);
assert.equal(typeof imEvidence.shares.Backstroke,'number');

const frEvidence=B.challengeEvidence(frSwimmer,global.MSOS4.state,frSession);
assert.equal(frEvidence.hasEvidence,true);
assert.equal(frEvidence.isMedley,false,'a swimmer whose #1 ranked event is a single stroke must not be classified as medley');
assert.equal(frEvidence.topStroke,'Freestyle',"the swimmer's highest-WA-points stroke must be published as topStroke");
assert.equal(frEvidence.rankedPoints.Freestyle,650);
assert.equal(frEvidence.rankedPoints.Backstroke,500);

const noEvidence=B.challengeEvidence(noEvidenceSwimmer,global.MSOS4.state,noEvidenceSession);
assert.equal(noEvidence.hasEvidence,false,'a swimmer with no ranked PB evidence at all must publish hasEvidence:false, never a guessed verdict');

// --- Part 2: safeSession() publishes this evidence only where a #1 stroke was actually resolved --------------
global.document={readyState:'complete',querySelector:()=>null,addEventListener(){}};
global.requestAnimationFrame=()=>{};
const AR=require(path.join(root,'architecture','athlete-report-core.js'));
const prescribe=(s,item)=>{
  if(item.id==='i-numberone')return{item:{...item,stroke:'__RESOLVED__',strokeResolution:{kind:'number-one',source:'performance-context',stroke:'__RESOLVED__'}},target:null};
  return{item,target:null};
};
global.MSOS4.swimmerTrainingBG={projectionFor:(a,s)=>AR.athleteSessionProjection({session:s,athlete:a,prescribe})};
require(path.join(root,'engines','swimmer-invite-bn.js'));
const X=global.MSOS4.swimmerInviteBN;

const imBuilt=X.safeSession(imSwimmer,imSession);
const imStrokeItem=imBuilt.blocks.flatMap(b=>b.items).find(i=>i.label==='4 x 100 #1 Stroke');
const imPlainItem=imBuilt.blocks.flatMap(b=>b.items).find(i=>i.label==='4 x 50 Freestyle Easy');
assert.ok(imStrokeItem.strokeEvidence,'the item with a resolved #1 stroke must publish strokeEvidence');
assert.equal(imStrokeItem.strokeEvidence.isMedley,true);
assert.deepEqual(imStrokeItem.strokeEvidence.needsWorkStrokes,['Backstroke','Freestyle']);
assert.equal(imPlainItem.strokeEvidence,null,'a plain item with no resolved stroke must never publish evidence (nothing to challenge)');

const noEvBuilt=X.safeSession(noEvidenceSwimmer,noEvidenceSession);
const noEvItem=noEvBuilt.blocks.flatMap(b=>b.items).find(i=>i.label==='4 x 100 #1 Stroke');
assert.equal(noEvItem.strokeEvidence,null,'an item with a resolved stroke but no ranked evidence behind it must publish null, not a fabricated verdict a swimmer could rely on');

console.log('STROKE_CHALLENGE_EVIDENCE_PUBLISH_PASS');
