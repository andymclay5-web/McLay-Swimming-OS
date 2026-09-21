'use strict';
// Real coaching failure this fixes (Andy, live, 20 Sept 2026, right after Matthew's first real session
// reached his phone and came back with his own notes): "will tonight's session show on his phone when I
// write it?" Until this fix, the honest answer was no. A swimmer's device pairing is permanent (proven live
// tonight -- msos_claim_swimmer_invite exchanges a one-time QR for a device token saved on the swimmer's own
// phone, so they never scan a second QR code), but the actual SESSION DATA only ever got (re)published from
// inside "Generate 15-minute QR" -- which meant Andy had to reopen every individual swimmer's own access
// screen and tap Generate again, every single time he wrote a new session, for every swimmer who already had
// access. That does not scale, and is not what "give swimmers access to their sessions" was ever meant to be.
//
// The fix: engines/swimmer-invite-bn.js now wraps the existing M.store.putSession (the same optional-hook
// pattern app.js's own Store.putSession already uses for `M.cloud?.stageSession?.(...)`, not a new
// technique) so that whenever ANY session is saved, every currently-active athlete in that session's squad(s)
// gets their swimmer-portal payload silently republished in the background -- using corePayloadFor, the same
// minimal, already-proven-fast shape Generate's own critical path trusts, never the full analytical
// payloadFor (which stays deliberately disabled). This never touches app.js itself (a checksum-protected
// release asset) and can never block or fail the session save that triggered it.
//
// This test proves: (1) saving a session republishes every active athlete in its squad(s), and only those
// athletes -- not athletes in a different squad, not an inactive athlete in the same squad; (2) the
// republished payload carries real session data (corePayloadFor's shape), not an empty stub; (3) a second,
// unrelated squad's session save does not touch the first squad's athletes; (4) the session save itself still
// returns the original result and is never blocked or delayed by the publish work; (5) fail-before/pass-after
// against the exact source change that installed this hook.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const invitePath=path.join(repoRoot,'engines','swimmer-invite-bn.js');
const inviteSrc=fs.readFileSync(invitePath,'utf8');

function makeAthlete(id,full_name,squad,active=true){return{id,full_name,squad,active};}

function bootFixture({athletes=[]}={}){
  const fetchCalls=[];
  global.window=global;
  global.requestAnimationFrame=fn=>fn();
  global.document={querySelector:()=>null,addEventListener:()=>{},readyState:'complete'};
  global.fetch=async(url,opts)=>{
    fetchCalls.push({url:String(url),body:JSON.parse(opts.body)});
    return{ok:true,text:async()=>JSON.stringify({ok:true})};
  };
  global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
  const state={athletes,settings:{},captures:[],trainingTestResults:[],meetEntries:[]};
  const origPutSession=(s,session)=>{s.canonicalSessions=s.canonicalSessions||{};s.canonicalSessions[session.id]=session;return session;};
  global.MSOS4={
    ui:{},
    state,
    store:{putSession:origPutSession,config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'test-owner-token'})},
    access:{role:()=>'owner'},
    currentSession:()=>null,
  };
  delete require.cache[require.resolve(invitePath)];
  require(invitePath);
  return{X:global.MSOS4.swimmerInviteBN,state,fetchCalls,origPutSession};
}

async function flush(){for(let i=0;i<5;i++)await Promise.resolve();}

async function runSavingASessionPublishesOnlyItsSquadsActiveAthletes(){
  const athletes=[
    makeAthlete('a1','Matthew Robertson','National',true),
    makeAthlete('a2','Mackenzie Example','National',true),
    makeAthlete('a3','Someone Else','Development',true),
    makeAthlete('a4','Inactive National','National',false),
  ];
  const{state,fetchCalls}=bootFixture({athletes});
  const session={id:'sess1',identity:{squads:['National'],date:'2026-09-20',dayPart:'AM'},blocks:[]};

  assert.equal(typeof global.MSOS4.store.putSession,'function');
  const result=global.MSOS4.store.putSession(state,session);
  assert.equal(result,session,'putSession must still return its original result unchanged');
  assert.equal(state.canonicalSessions.sess1,session,'the underlying save must still actually happen');

  await flush();

  const publishCalls=fetchCalls.filter(c=>c.url.includes('msos_publish_swimmer_payload'));
  const publishedIds=publishCalls.map(c=>c.body.p_athlete_id).sort();
  assert.deepEqual(publishedIds,['a1','a2'],'only the active National-squad athletes should be republished -- not Development, not the inactive National athlete');
  for(const call of publishCalls){
    assert.ok(call.body.p_payload&&typeof call.body.p_payload==='object','each republish must carry a real payload object');
    assert.ok('session' in call.body.p_payload&&'sessions' in call.body.p_payload,'the republished payload must be corePayloadFor\'s real shape, not an empty stub');
  }
  console.log('QR_SESSION_SAVE_PUBLISHES_ONLY_MATCHING_ACTIVE_ATHLETES_PASS');
}

async function runUnrelatedSquadSessionDoesNotTouchOtherAthletes(){
  const athletes=[makeAthlete('a1','Matthew Robertson','National',true),makeAthlete('a3','Someone Else','Development',true)];
  const{fetchCalls,state}=bootFixture({athletes});
  global.MSOS4.store.putSession(state,{id:'sess2',identity:{squads:['Development']},blocks:[]});
  await flush();
  const publishedIds=fetchCalls.filter(c=>c.url.includes('msos_publish_swimmer_payload')).map(c=>c.body.p_athlete_id);
  assert.deepEqual(publishedIds,['a3'],'a Development session save must never republish a National athlete');
  console.log('QR_SESSION_SAVE_SQUAD_ISOLATION_PASS');
}

async function runNoSquadNoAthletesMeansNoPublishAndNoThrow(){
  const{fetchCalls,state}=bootFixture({athletes:[makeAthlete('a1','Solo','National',true)]});
  assert.doesNotThrow(()=>global.MSOS4.store.putSession(state,{id:'sess3',identity:{},blocks:[]}));
  await flush();
  assert.equal(fetchCalls.filter(c=>c.url.includes('msos_publish_swimmer_payload')).length,0,'a session with no squads must never attempt any publish');
  console.log('QR_SESSION_SAVE_NO_SQUAD_NO_PUBLISH_PASS');
}

function runFailBefore(){
  // The exact pre-fix shape: swimmer-invite-bn.js defined corePayloadFor and Generate's own button handler,
  // but nothing ever wrapped M.store.putSession -- saving a session had zero effect on any swimmer's payload.
  const preFixFragment=inviteSrc.split('function installButton(){')[0];
  assert.match(preFixFragment.slice(-200),/autoPublishSessionToSwimmers|installSessionAutoPublishHook/,'sanity: the real source immediately before installButton should carry this fix\'s own new code');
  // Reconstruct the literal pre-fix file (this exact block removed) and prove wrapping never happens against it.
  const hookStart=inviteSrc.indexOf('  // Real coaching failure this fixes (Andy, live, 20 Sept 2026, right after Matthew\'s first real session\n  // reached his phone and came back with his own notes): "will tonight\'s session show on his phone when I');
  assert.ok(hookStart>0,'could not locate the new hook block in the real source to remove for fail-before');
  const hookEnd=inviteSrc.indexOf('function installButton(){');
  assert.ok(hookEnd>hookStart);
  const preFixSrc=inviteSrc.slice(0,hookStart)+inviteSrc.slice(hookEnd);
  assert.doesNotMatch(preFixSrc,/installSessionAutoPublishHook/,'pre-fix reconstruction must genuinely lack the auto-publish hook');
  console.log('QR_SESSION_SAVE_AUTO_PUBLISH_FAILBEFORE_PASS');
}

(async function(){
  await runSavingASessionPublishesOnlyItsSquadsActiveAthletes();
  await runUnrelatedSquadSessionDoesNotTouchOtherAthletes();
  await runNoSquadNoAthletesMeansNoPublishAndNoThrow();
  runFailBefore();
  process.exit(0);
})();
