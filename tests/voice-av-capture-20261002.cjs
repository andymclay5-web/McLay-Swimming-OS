'use strict';
// 2 Oct 2026 (Andy, voice/earbud build): Andy asked for an earbud/mic integration so any coach can talk
// through sets, times, stroke rate etc during Training and Meet, with the note auto-attached to the
// swimmer -- or the squad, by saying the squad name -- and routed straight to him when an assistant coach
// makes it, while being "weary of paying for API services". Investigating turned up four complete files
// already sitting in engines/ (context-engine-av.js, voice-router-av.js, voice-ui-av.js,
// context-voice-av.css, all dated 20260822av) that already did almost all of this -- a name-based athlete
// detector, numeric/stroke-rate/HR/RPE extraction, live session-context tracking, using the browser's
// free, built-in SpeechRecognition (no per-use API cost) -- but they were never added to index.html/sw.js's
// load list, so none of it had ever run. Worse: engines/voice-router-av.js's targetAnswer() could not even
// have parsed -- the 'pattern' branch's brace was never closed, so 'rep_race'/'hr_sr'/the fallback return
// were accidentally nested inside it, a real `node --check` syntax error.
//
// This test proves, against the REAL files on disk:
//  1. the syntax bug was real (fail-before: revert the brace fix, confirm node --check fails; restore,
//     confirm it passes) and that targetAnswer's 'pattern' and 'rep_race' branches now return correctly
//     instead of silently falling through;
//  2. parseVoice() detects an athlete purely by a name spoken anywhere in the sentence (pre-existing,
//     unmodified logic -- confirmed still intact);
//  3. parseVoice() now also detects a SQUAD by name, derived live from the real roster's own
//     athlete.squad values (never a hardcoded list) -- and only when no individual athlete matched;
//  4. captureNote() tags only the PRESENT members of a detected squad (never an absent swimmer), and
//     still falls back to a GROUP-level note (no athlete_ids) when neither a name nor a squad was heard --
//     fail-before/pass-after against the real source by stripping the squad-handling branch in memory;
//  5. captureNote() routes a coach-alert to Andy when the capture was made by anyone other than the
//     owner, and does NOT when the owner made it -- fail-before/pass-after the same way.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const ROUTER_PATH = path.join(__dirname, '..', 'engines', 'voice-router-av.js');
const CONTEXT_PATH = path.join(__dirname, '..', 'engines', 'context-engine-av.js');

function syntaxCheck(p) {
  execSync(`node --check ${JSON.stringify(p)}`, { stdio: 'pipe' });
}

// Builds a fresh sandbox MSOS4 + MSOSEngines and evaluates the given engine source strings into it,
// in context-engine-av.js -> voice-router-av.js order (their real load order), returning the globalThis
// stand-in so tests can call V.*/C.* and inspect state/alert calls.
function makeSandbox({ athletes, present, role = 'owner' }) {
  const alerts = [];
  const saves = [];
  const g = {};
  g.globalThis = g;
  const state = { athletes, captures: [], contextAnchors: [], settings: {} };
  g.MSOS4 = {
    state,
    currentSession: () => null,
    util: { uid: (p) => `${p}-test`, clock: (s) => String(s) },
    ui: { presentAthletes: () => present },
    access: { role: () => role },
    store: { save: (s) => saves.push(s) },
    cloud: { ready: () => true, stageCapture: (cap) => saves.push({ staged: cap }) },
    pushAlerts: { sendCoachAlert: (payload) => { alerts.push(payload); return Promise.resolve(null); } },
  };
  g.MSOSEngines = { RacePace: {}, Coordinator: {}, Evidence: {} };
  return { g, alerts, saves, state };
}

function loadInto(g, srcPath) {
  const src = fs.readFileSync(srcPath, 'utf8');
  // eslint-disable-next-line no-new-func
  const fn = new Function('globalThis', src);
  fn(g);
}

const ROSTER = [
  { id: 'a1', full_name: 'Matthew Kofoed', squad: 'National' },
  { id: 'a2', full_name: 'Priya Patel', squad: 'Development' },
  { id: 'a3', full_name: 'Jordan Ngata', squad: 'Development' },
];

(async () => {
  const originalRouter = fs.readFileSync(ROUTER_PATH, 'utf8');

  // --- 1a. syntax fail-before: the real, historical brace bug really doesn't parse. ---
  const FIXED_PATTERN = "if(t.status==='pattern'){const rows=(t.rows||[]).filter(x=>Number.isFinite(Number(x.seconds)));const desc=rows.map(x=>`${x.zone} ${M.util?.clock?M.util.clock(x.seconds):x.seconds}`).join(', ');return{ok:true,speak:`${athleteName(ath)}. ${work}. ${desc}.`,data:p};}";
  const FIXED_REPRACE = "if(t.status==='rep_race'){const rows=(t.rows||[]).filter(x=>x.status==='ok'),desc=rows.map(x=>`rep ${x.rep}, ${M.util?.clock?M.util.clock(x.seconds):x.seconds}`).join(', ');return{ok:true,speak:`${athleteName(ath)}. ${desc||'race target unavailable'}.`,data:p};}";
  assert.ok(originalRouter.includes(FIXED_PATTERN), 'expected voice-router-av.js to currently contain the fixed pattern-branch brace -- refusing to run against unexpected state');
  assert.ok(originalRouter.includes(FIXED_REPRACE), 'expected voice-router-av.js to currently contain the fixed rep_race branch -- refusing to run against unexpected state');
  try {
    const BROKEN_PATTERN = "if(t.status==='pattern'){const rows=(t.rows||[]).filter(x=>Number.isFinite(Number(x.seconds)));const desc=rows.map(x=>`${x.zone} ${M.util?.clock?M.util.clock(x.seconds):x.seconds}`).join(', ');return{ok:true,speak:`${athleteName(ath)}. ${work}. ${desc}.`,data:p};";
    const BROKEN_REPRACE = "if(t.status==='rep_race'){const rows=(t.rows||[]).filter(x=>x.status==='ok'),desc=rows.map(x=>`rep ${x.rep}, ${M.util?.clock?M.util.clock(x.seconds):x.seconds}`).join(', ');return{ok:true,speak:`${athleteName(ath)}. ${desc||'race target unavailable'}.`,data:p};";
    let reverted = originalRouter.replace(FIXED_PATTERN, BROKEN_PATTERN);
    assert.notStrictEqual(reverted, originalRouter, 'fail-before: expected to revert the pattern-branch brace');
    reverted = reverted.replace(FIXED_REPRACE, BROKEN_REPRACE);
    fs.writeFileSync(ROUTER_PATH, reverted);
    let threw = false;
    try { syntaxCheck(ROUTER_PATH); } catch { threw = true; }
    assert.ok(threw, 'fail-before: expected node --check to fail against the original unclosed-brace code');
    console.log('VOICE_AV_SYNTAX_FAILBEFORE_PASS');
  } finally {
    fs.writeFileSync(ROUTER_PATH, originalRouter);
    syntaxCheck(ROUTER_PATH);
  }
  syntaxCheck(CONTEXT_PATH);

  // --- 1b. pass-after: targetAnswer's 'pattern' and 'rep_race' branches now actually return. ---
  {
    const { g } = makeSandbox({ athletes: ROSTER, present: ROSTER });
    loadInto(g, CONTEXT_PATH);
    g.MSOS4.contextEngineAV.now = () => ({ status: 'active', item: {}, confidence: 0.9 });
    loadInto(g, ROUTER_PATH);
    g.MSOSEngines.Coordinator.prescription = () => ({ item: { raw: 'Main set' }, target: { status: 'pattern', rows: [{ zone: 'aerobic', seconds: 65 }] } });
    const patternResult = g.MSOS4.voiceRouterAV.targetAnswer(ROSTER[0]);
    assert.equal(patternResult.ok, true, `targetAnswer must return ok:true for a 'pattern' target, got ${JSON.stringify(patternResult)}`);
    assert.match(patternResult.speak, /aerobic/, 'targetAnswer pattern branch must describe the zone');

    g.MSOSEngines.Coordinator.prescription = () => ({ item: { raw: 'Race set' }, target: { status: 'rep_race', rows: [{ rep: 1, status: 'ok', seconds: 30 }] } });
    const repRaceResult = g.MSOS4.voiceRouterAV.targetAnswer(ROSTER[0]);
    assert.equal(repRaceResult.ok, true, `targetAnswer must return ok:true for a 'rep_race' target, got ${JSON.stringify(repRaceResult)}`);
    assert.match(repRaceResult.speak, /rep 1/, 'targetAnswer rep_race branch must describe the rep');
    console.log('VOICE_AV_TARGET_BRANCHES_PASS');
  }

  // --- 2. athlete-by-name detection (pre-existing logic, confirmed intact). ---
  {
    const { g } = makeSandbox({ athletes: ROSTER, present: ROSTER });
    loadInto(g, CONTEXT_PATH);
    const parsed = g.MSOS4.contextEngineAV.parseVoice('Matthew Kofoed looked strong on that last hundred', { session: null, state: g.MSOS4.state });
    assert.equal(parsed.athlete?.id, 'a1', `expected Matthew Kofoed to be matched by name, got ${JSON.stringify(parsed.athlete)}`);
    assert.equal(parsed.squad, null, 'an individual name match must not also report a squad');
    console.log('VOICE_AV_ATHLETE_NAME_PASS');
  }

  // --- 3. squad-by-name detection, derived live from the roster (no hardcoded list). ---
  {
    const { g } = makeSandbox({ athletes: ROSTER, present: ROSTER });
    loadInto(g, CONTEXT_PATH);
    const parsed = g.MSOS4.contextEngineAV.parseVoice('Development squad is working really hard today', { session: null, state: g.MSOS4.state });
    assert.equal(parsed.athlete, null, 'no individual athlete should match a pure squad mention');
    assert.equal(parsed.squad, 'Development', `expected the Development squad to be detected, got ${JSON.stringify(parsed.squad)}`);
    // fail-before: a roster with no "Development" squad member at all must not match it by accident.
    const noDevRoster = ROSTER.filter((a) => a.squad !== 'Development');
    const parsed2 = g.MSOS4.contextEngineAV.parseVoice('Development squad is working really hard today', { session: null, state: { athletes: noDevRoster } });
    assert.equal(parsed2.squad, null, 'squad detection must be driven by the real roster, not a hardcoded fallback list');
    console.log('VOICE_AV_SQUAD_NAME_PASS');
  }

  // --- 4. captureNote: squad tagging is PRESENT-filtered, and the GROUP fallback survives. ---
  {
    const present = [ROSTER[1]]; // only Priya (Development) is present; Jordan (also Development) is absent
    const { g, saves } = makeSandbox({ athletes: ROSTER, present });
    loadInto(g, CONTEXT_PATH);
    loadInto(g, ROUTER_PATH);
    const squadCap = g.MSOS4.voiceRouterAV.captureNote({ athlete: null, squad: 'Development', raw: 'Development, good work on that set' }, g.MSOS4.state, null);
    assert.deepEqual(squadCap.data.athlete_ids, ['a2'], `squad capture must tag only PRESENT squad members, got ${JSON.stringify(squadCap.data.athlete_ids)}`);
    assert.equal(squadCap.data.squad, 'Development');

    const groupCap = g.MSOS4.voiceRouterAV.captureNote({ athlete: null, squad: null, raw: 'everyone dig in on this next one' }, g.MSOS4.state, null);
    assert.equal(groupCap.data.athlete_ids, undefined, 'a capture with neither a name nor a squad detected must stay GROUP-level (no athlete_ids), per the existing Capture modal safe-default rule');
    assert.ok(saves.length > 0, 'captureNote must still persist locally and stage for cloud sync');

    // fail-before: strip the squad branch out of the real source in memory and confirm the squad tagging
    // disappears (proving this test would actually catch a regression, not just always pass).
    const SQUAD_BRANCH = "else if(parsed.squad){const ids=squadPresentIds(parsed.squad);if(ids.length){cap.athlete_ids=ids;cap.squad=parsed.squad;}}";
    assert.ok(originalRouter.includes(SQUAD_BRANCH), 'expected the squad-tagging branch to be present in the real source -- refusing to run against unexpected state');
    const stripped = originalRouter.replace(SQUAD_BRANCH, '');
    const { g: g2 } = makeSandbox({ athletes: ROSTER, present });
    loadInto(g2, CONTEXT_PATH);
    const fn2 = new Function('globalThis', stripped);
    fn2(g2);
    const noSquadCap = g2.MSOS4.voiceRouterAV.captureNote({ athlete: null, squad: 'Development', raw: 'Development, good work' }, g2.MSOS4.state, null);
    assert.equal(noSquadCap.data.athlete_ids, undefined, 'fail-before: with the squad branch removed, squad mentions must NOT tag anyone -- confirms the branch is what makes squad tagging work');
    console.log('VOICE_AV_CAPTURE_SQUAD_FAILBEFORE_PASS');
    console.log('VOICE_AV_CAPTURE_GROUP_FALLBACK_PASS');
  }

  // --- 5. owner-alert routing: assistant captures reach Andy, owner's own captures don't. ---
  {
    const { g: gOwner, alerts: ownerAlerts } = makeSandbox({ athletes: ROSTER, present: ROSTER, role: 'owner' });
    loadInto(gOwner, CONTEXT_PATH);
    loadInto(gOwner, ROUTER_PATH);
    gOwner.MSOS4.voiceRouterAV.captureNote({ athlete: ROSTER[0], squad: null, raw: 'Matthew, tidy up that turn' }, gOwner.MSOS4.state, null);
    assert.equal(ownerAlerts.length, 0, "the owner's own voice captures must not alert the owner");

    const { g: gAsst, alerts: asstAlerts } = makeSandbox({ athletes: ROSTER, present: ROSTER, role: 'assistant' });
    loadInto(gAsst, CONTEXT_PATH);
    loadInto(gAsst, ROUTER_PATH);
    gAsst.MSOS4.voiceRouterAV.captureNote({ athlete: ROSTER[0], squad: null, raw: 'Matthew, tidy up that turn' }, gAsst.MSOS4.state, null);
    assert.equal(asstAlerts.length, 1, 'an assistant coach voice capture must alert the owner exactly once');
    assert.equal(asstAlerts[0].kind, 'voice_capture');
    assert.match(asstAlerts[0].title, /Matthew Kofoed/);

    // fail-before: strip the notify call and confirm the assistant capture goes silent.
    const NOTIFY_CALL = 'notifyOwnerIfAssistant(cap,parsed);';
    assert.ok(originalRouter.includes(NOTIFY_CALL), 'expected the notify-owner call to be present in the real source -- refusing to run against unexpected state');
    const strippedNotify = originalRouter.replace(NOTIFY_CALL, '');
    const { g: gAsst2, alerts: asstAlerts2 } = makeSandbox({ athletes: ROSTER, present: ROSTER, role: 'assistant' });
    loadInto(gAsst2, CONTEXT_PATH);
    const fn3 = new Function('globalThis', strippedNotify);
    fn3(gAsst2);
    gAsst2.MSOS4.voiceRouterAV.captureNote({ athlete: ROSTER[0], squad: null, raw: 'Matthew, tidy up that turn' }, gAsst2.MSOS4.state, null);
    assert.equal(asstAlerts2.length, 0, 'fail-before: with the notify call removed, an assistant capture must NOT alert the owner -- confirms the call is what makes routing work');
    console.log('VOICE_AV_OWNER_ALERT_FAILBEFORE_PASS');
    console.log('VOICE_AV_OWNER_ALERT_PASS');
  }

  // --- 6. looksGarbled: matches Andy's exact real South Island Champs failure, and does not false-positive
  // on an ordinary sentence. --- (voice-ui-av.js's confirm panel uses this to warn the coach before Save.)
  {
    const { g } = makeSandbox({ athletes: ROSTER, present: ROSTER });
    loadInto(g, CONTEXT_PATH);
    const real = 'Matthew, Matthew, gay, gay, Matthew, Matthew, gay, gay, Matthew, Mac, Matthew, Matthew, gay, gay, gay, gay, gay';
    assert.equal(g.MSOS4.contextEngineAV.looksGarbled(real), true, "Andy's actual reported garbled transcript must be flagged");
    const clean = 'Matthew looked strong off the wall on that last hundred, good tempo through the back half';
    assert.equal(g.MSOS4.contextEngineAV.looksGarbled(clean), false, 'an ordinary coaching sentence must not be flagged as garbled');
    console.log('VOICE_AV_GARBLED_HEURISTIC_PASS');
  }

  // --- 7. confirm-before-save gate: after the South Island Champs report, listenOnce() must only PARSE
  // (no auto-save) -- engines/voice-ui-av.js's confirmCapture() is what actually calls captureNote(), and
  // only on Save. Structural proof against the real source (full DOM proof is in
  // tests/voice-av-confirm-gate-20261002.cjs, a real-browser test).
  {
    const routerSrc = fs.readFileSync(ROUTER_PATH, 'utf8');
    assert.ok(routerSrc.includes("onResult?.(transcript,C.parseVoice(transcript));"), 'listenOnce must hand the caller a parse-only result, never an already-routed (already-saved) one');
    assert.ok(!/onresult=e=>\{[^}]*routeTranscript/.test(routerSrc), 'listenOnce must not call routeTranscript (and so must not call captureNote) itself inside onresult -- saving must wait for the confirm gate');
    const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'engines', 'voice-ui-av.js'), 'utf8');
    assert.ok(uiSrc.includes("if(parsed?.intent==='capture_note')"), "voice-ui-av.js's onResult handler must branch capture_note intents into the confirm gate rather than saving directly");
    assert.ok(uiSrc.includes('V.captureNote(parsed)'), 'the confirm gate must call captureNote only from inside its Save handler');
    console.log('VOICE_AV_CONFIRM_GATE_STRUCTURE_PASS');
  }

  console.log('VOICE_AV_CAPTURE_ALL_PASS');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
