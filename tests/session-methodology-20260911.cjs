'use strict';
// Real coaching failure this protects (11 Sept 2026, "learning loop" -- Andy's own words, 10 Sept:
// "Jordan sees methodology/evidence behind sessions he writes, plus some form of self-assessment").
// Without this engine, an assistant coach's individual-swimmer modification could silently change what a
// set is actually training (e.g. a squad-authored Regeneration set delivered to one swimmer as a Speed/Max
// set through a coach-override) with nothing checking that against the session's intended purpose -- a
// direct violation of the North Star principle "individualisation must preserve session purpose/stimulus"
// this whole app already enforces everywhere else. Separately, a weekly plan's free-text focus (e.g.
// "Threshold week") could silently drift from what a session actually delivers with nobody ever comparing
// the two. This suite exercises engines/session-methodology.js's real logic: stimulusDrift/planTargetCheck
// (the two mechanical, non-invented checks; see the file's own header for the ground-truth reasoning),
// evaluate/resolveSessionGate (the owner-never-gated decision, mirroring modification-edit.js's stroke
// gate), summary (the Board banner's "why this session" text), notifyPendingReview/markReviewed (the
// coach_alerts round trip, reusing Phase 5's push-alerts infrastructure) and fetchOpenReview (the
// cross-device durable-read fallback -- a local-only session field never reaches Andy's own device, see
// engines/session-methodology.js's own header and /areas/msos-known-issues.md).
//
// House convention: engines/dosage.js and engines/modification.js have no gated logic of their own that
// this feature depends on being re-implemented, so both are REQUIRED as real code -- dosage.js is a plain
// (function(g){...})(globalThis) IIFE that populates global.MSOS4.dosageEngine when handed minimal
// M.util/M.session stubs, and modification.js is dual-UMD and exports directly via module.exports in
// Node -- rather than re-implementing training-system classification or adaptation math by hand. Only
// engines/session-methodology.js's own two functions that are NOT exposed on the public M.sessionMethodology
// surface (fetchOpenReview, and board.js's evidenceProvenance) are extracted by exact source text via
// brace-depth counting, the same technique tests/stroke-gate-modification-edit-20260910.cjs and
// tests/team-access-20260911.cjs already use for engines that can't be require()'d directly.
//
// Fail-before/pass-after (new file, no HEAD version to diff against): three real historical-shape bugs are
// injected into scratch copies of the real source and confirmed caught -- (1) dropping the owner-never-
// gated exemption in resolveSessionGate, which would flag Andy's own sessions exactly like an assistant's;
// (2) dropping the active-row filter in stimulusDrift, which would keep flagging a modification an
// assistant already reverted; (3) dropping the "Unclassified means nothing to check" guard in
// planTargetCheck, which would spuriously flag any session whose weekly-plan focus text doesn't name a
// recognisable system as a "mismatch" against whatever the session actually trained.

const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const os = require('os');

const ENGINES_DIR = path.join(__dirname, '..', 'engines');
const SM_PATH = path.join(ENGINES_DIR, 'session-methodology.js');
const BOARD_PATH = path.join(ENGINES_DIR, 'board.js');
const SCRATCH_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-test-'));

function extractBlock(source, marker) {
  if (marker[marker.length - 1] !== '{') throw new Error('marker must end at the opening brace: ' + marker);
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('marker not found in source: ' + marker);
  const braceStart = start + marker.length - 1;
  let depth = 0, i = braceStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  if (depth !== 0) throw new Error('unbalanced braces extracting: ' + marker);
  return source.slice(start, i);
}

// ---------------------------------------------------------------------------
// Bootstrap the REAL dosage.js + modification.js exactly once (pure, deterministic, no DOM) against a
// stable global.MSOS4/global.MSOSEngines so session-methodology.js's own real closures (captured once at
// require time: const U=M.util,D=M.dosageEngine,B=M.boardEngine,UI=M.ui) see the real engines.
// ---------------------------------------------------------------------------
global.MSOSEngines = global.MSOSEngines || {};
global.MSOSEngines.Modification = require(path.join(ENGINES_DIR, 'modification.js'));
global.MSOS4 = global.MSOS4 || {};
global.MSOS4.util = { escape: v => String(v ?? ''), clone: v => JSON.parse(JSON.stringify(v)) };
global.MSOS4.session = {};
require(path.join(ENGINES_DIR, 'dosage.js')); // -> global.MSOS4.dosageEngine

const boardSrc = fs.readFileSync(BOARD_PATH, 'utf8');
const realFindItem = eval(`(${extractBlock(boardSrc, 'function findItem(session,id){')})`);

// findItem is pure and takes no engine dependencies of its own -- wire it in as the real M.boardEngine
// this feature actually calls (B.findItem), not a re-implementation of "walk the session tree".
global.MSOS4.boardEngine = { findItem: realFindItem };
global.MSOS4.ui = { renderBoard: function () {} };
global.MSOS4.state = {};

// Mutable stubs read dynamically (M.coachLoopUI?.planContext?.(...), etc.) on every call rather than
// captured once at require time, so tests can freely reassign them between cases.
global.MSOS4.coachLoopUI = { planContext: () => ({}) };
global.MSOS4.pushAlerts = { sendCoachAlert: async () => ({ alertId: null }) };
global.MSOS4.store = { putSession: () => {} };
global.MSOS4.teamAccess = { actor: () => ({ role: 'owner', name: 'Owner' }) };
global.MSOS4.cloud = { ready: () => false, org: () => '', fetch: async () => [] };
global.MSOS4.access = { role: () => 'owner' };

require(SM_PATH); // -> global.MSOS4.sessionMethodology
const REAL_SM = global.MSOS4.sessionMethodology;
assert.ok(REAL_SM && typeof REAL_SM.evaluate === 'function', 'sanity: real session-methodology.js must have loaded');

const realFetchOpenReview = (() => {
  const M = global.MSOS4; // referenced by name inside the extracted function body below
  return eval(`(${extractBlock(fs.readFileSync(SM_PATH, 'utf8'), 'async function fetchOpenReview(session){')})`);
})();

function realEvidenceProvenance() {
  const text = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const clock = s => text(s); // U.clock unavailable in this harness; exact mm:ss formatting isn't under test here
  const body = extractBlock(boardSrc, 'function evidenceProvenance(actual){');
  return eval(`(${body})`);
}
const evidenceProvenance = realEvidenceProvenance();

// Loads a scratch copy of session-methodology.js's source (after a required, verified-unique substring
// replacement) at a fresh file path, so require()'s module cache treats it as an independent module and
// re-runs the IIFE against the SAME already-bootstrapped global.MSOS4 (same real D/B), overwriting
// global.MSOS4.sessionMethodology with the buggy version. Returns that buggy SM; REAL_SM (captured above,
// before any scratch copy is ever loaded) is unaffected by the overwrite since it's a plain object holding
// already-bound closures.
let scratchN = 0;
function loadBuggyCopy(realSource, oldStr, newStr) {
  const count = realSource.split(oldStr).length - 1;
  assert.equal(count, 1, `bug-injection target must appear exactly once in the real source: ${JSON.stringify(oldStr)}`);
  const buggy = realSource.replace(oldStr, newStr);
  const p = path.join(SCRATCH_DIR, `buggy-${++scratchN}.js`);
  fs.writeFileSync(p, buggy);
  require(p);
  return global.MSOS4.sessionMethodology;
}

const OWNER = { role: 'owner', name: 'Andy' };
const ASSISTANT = { role: 'assistant', name: 'Jordan' };

function makeAthlete(id, name) { return { id, full_name: name, active: true }; }

// A squad-authored Regeneration set with one athlete's active override that changes what actually gets
// delivered to Speed/Max -- the real coaching-failure shape this feature exists to catch.
function driftSession() {
  const session = { id: 's1', blocks: [{ id: 'b1', items: [
    { id: 'i1', kind: 'set', raw: '8 x 100 Easy recovery swim', reps: 8, distance: 100 },
  ] }] };
  const athlete = makeAthlete('a1', 'Jordan Test');
  const state = {
    athletes: [athlete],
    adaptationOverrides: [
      { id: 'mod-1', sessionId: 's1', itemId: 'i1', athleteId: 'a1', patch: {}, raw: '8 x 50 Max sprint', active: true },
    ],
  };
  return { session, state, athlete };
}

// A clean session with no overrides and a Threshold-classified set -- used for "nothing to flag" and for
// the plan-focus match/mismatch checks.
function thresholdSession() {
  const session = { id: 's2', blocks: [{ id: 'b1', items: [
    { id: 'i1', kind: 'set', raw: '8 x 200 Threshold pace swim', reps: 8, distance: 200 },
  ] }] };
  const state = { athletes: [], adaptationOverrides: [] };
  return { session, state };
}

function run(SM, label) {
  const tests = [];
  function test(name, fn) { tests.push({ name: `${label}: ${name}`, fn }); }

  // --- Group A: stimulusDrift, via evaluate()'s .drift ---
  test('A1 clean session, no overrides -> no drift, approved', () => {
    const { session, state } = thresholdSession();
    const v = SM.evaluate(session, state);
    assert.deepEqual(v.drift, []);
    assert.equal(v.approved, true);
  });

  test('A2 an override that changes the classified training system is flagged', () => {
    const { session, state } = driftSession();
    const v = SM.evaluate(session, state);
    assert.equal(v.drift.length, 1);
    assert.equal(v.drift[0].squadSystem, 'Regeneration');
    assert.equal(v.drift[0].athSystem, 'Speed / Max');
    assert.equal(v.drift[0].athleteName, 'Jordan Test');
    assert.equal(v.approved, false);
    assert.ok(v.reasons.some(r => /Jordan Test: intended Regeneration but delivered as Speed \/ Max/.test(r)));
  });

  test('A3 an override that keeps the same classified system is NOT flagged', () => {
    const { session, state } = driftSession();
    state.adaptationOverrides[0].raw = '8 x 100 Easy loosen swim'; // still Regeneration
    const v = SM.evaluate(session, state);
    assert.deepEqual(v.drift, []);
    assert.equal(v.approved, true);
  });

  test('A4 an inactive (reverted) override is never flagged', () => {
    const { session, state } = driftSession();
    state.adaptationOverrides[0].active = false;
    const v = SM.evaluate(session, state);
    assert.deepEqual(v.drift, [], 'a reverted modification must not keep triggering review');
  });

  test('A5 an override pointing at a non-set item (e.g. a cue) is safely skipped', () => {
    const session = { id: 's3', blocks: [{ id: 'b1', items: [{ id: 'i1', kind: 'cue', raw: 'Grab a kickboard' }] }] };
    const state = { athletes: [makeAthlete('a1', 'X')], adaptationOverrides: [
      { id: 'mod-1', sessionId: 's3', itemId: 'i1', athleteId: 'a1', patch: {}, raw: 'anything', active: true },
    ] };
    assert.doesNotThrow(() => SM.evaluate(session, state));
    assert.deepEqual(SM.evaluate(session, state).drift, []);
  });

  // --- Group B: planTargetCheck, via evaluate()'s .plan ---
  test('B1 no weekly focus at all -> plan not checked, never a failure', () => {
    global.MSOS4.coachLoopUI.planContext = () => ({});
    const { session, state } = thresholdSession();
    const v = SM.evaluate(session, state);
    assert.equal(v.plan.checked, false);
    assert.equal(v.approved, true);
  });

  test('B2 weekly focus text names no recognisable training system -> plan not checked', () => {
    global.MSOS4.coachLoopUI.planContext = () => ({ weeklyFocus: 'Big meet coming up, keep spirits high' });
    const { session, state } = thresholdSession();
    const v = SM.evaluate(session, state);
    assert.equal(v.plan.checked, false, '"unknown remains unknown" -- must never be treated as a failure');
    assert.equal(v.approved, true);
  });

  test('B3 weekly focus names the system the session actually delivers -> matches, not a failure', () => {
    global.MSOS4.coachLoopUI.planContext = () => ({ weeklyFocus: 'Focus is Threshold sets this week' });
    const { session, state } = thresholdSession();
    const v = SM.evaluate(session, state);
    assert.equal(v.plan.checked, true);
    assert.equal(v.plan.plannedSystem, 'Threshold');
    assert.equal(v.plan.dominantSystem, 'Threshold');
    assert.equal(v.plan.matches, true);
    assert.equal(v.approved, true);
  });

  test('B4 weekly focus names a DIFFERENT system than the session actually delivers -> flagged', () => {
    global.MSOS4.coachLoopUI.planContext = () => ({ weeklyFocus: 'Focus is Threshold sets this week' });
    const { session, state } = thresholdSession();
    session.blocks[0].items[0].raw = '10 x 50 Easy recovery'; // session actually trains Regeneration
    const v = SM.evaluate(session, state);
    assert.equal(v.plan.checked, true);
    assert.equal(v.plan.matches, false);
    assert.equal(v.approved, false);
    assert.ok(v.reasons.some(r => /Weekly focus names Threshold, but this session's dominant classified system is Regeneration/.test(r)));
  });
  global.MSOS4.coachLoopUI.planContext = () => ({}); // reset for the groups below

  // --- Group C: resolveSessionGate -- owner is never gated, mirroring modification-edit.js's stroke gate ---
  test('C1 owner is never gated, even with real drift present', () => {
    const { session, state } = driftSession();
    const g = SM.resolveSessionGate(OWNER, session, state);
    assert.deepEqual(g, { gated: false });
  });

  test('C2 assistant, no drift/mismatch -> gated but approved', () => {
    const { session, state } = thresholdSession();
    const g = SM.resolveSessionGate(ASSISTANT, session, state);
    assert.equal(g.gated, true);
    assert.equal(g.verdict.approved, true);
  });

  test('C3 assistant, real drift present -> gated and held for review', () => {
    const { session, state } = driftSession();
    const g = SM.resolveSessionGate(ASSISTANT, session, state);
    assert.equal(g.gated, true);
    assert.equal(g.verdict.approved, false);
    assert.ok(g.verdict.reasons.length > 0);
  });

  // --- Group D: summary() -- the Board banner's "why this session" text ---
  test('D1 summary surfaces dosage mix and plan context together ("Both")', () => {
    global.MSOS4.coachLoopUI.planContext = () => ({ weeklyFocus: 'Push threshold this week', seasonGoal: 'States qualifying times' });
    const { session, state } = thresholdSession();
    const sum = SM.summary(session, state);
    assert.match(sum.dosageLine, /Threshold \d+%/);
    assert.equal(sum.weeklyFocus, 'Push threshold this week');
    assert.equal(sum.seasonGoal, 'States qualifying times');
    global.MSOS4.coachLoopUI.planContext = () => ({});
  });

  // --- Group E: notifyPendingReview -- the alert Andy actually sees off the Board ---
  test('E1 a flagged verdict sends exactly one coach alert with the right payload', async () => {
    const alertCalls = [];
    global.MSOS4.pushAlerts = { sendCoachAlert: async payload => { alertCalls.push(payload); return { alertId: 'AL1' }; } };
    const session = { id: 's9', identity: { date: '2026-09-11', dayPart: 'AM' } };
    const alertId = await SM.notifyPendingReview(session, { reasons: ['first reason', 'second reason'] });
    assert.equal(alertCalls.length, 1);
    assert.equal(alertCalls[0].sessionId, 's9');
    assert.equal(alertCalls[0].athleteId, null);
    assert.equal(alertCalls[0].kind, 'methodology_review');
    assert.match(alertCalls[0].title, /methodology flagged/);
    assert.equal(alertCalls[0].body, 'first reason (+1 more)');
    assert.equal(alertId, 'AL1');
  });

  test('E2 (fail-safe) a missing/throwing push-alerts engine must never break the finish flow', async () => {
    global.MSOS4.pushAlerts = undefined;
    const session = { id: 's9' };
    let alertId;
    await assert.doesNotReject(async () => { alertId = await SM.notifyPendingReview(session, { reasons: ['x'] }); });
    assert.equal(alertId, null);
  });

  // --- Group F: markReviewed -- clears the flag locally and, when known, the durable coach_alerts row too ---
  test('F1 marking reviewed clears the local fields and persists via Store', async () => {
    const putCalls = [];
    global.MSOS4.store = { putSession: (state, s) => putCalls.push(s) };
    global.MSOS4.teamAccess = { actor: () => ({ role: 'owner', name: 'Andy' }) };
    global.MSOS4.cloud = { ready: () => false, org: () => '', fetch: async () => { throw new Error('must not be called'); } };
    const session = { id: 's1', pendingMethodologyReview: { reasons: ['x'] } };
    await SM.markReviewed(session, null);
    assert.equal(session.pendingMethodologyReview, null);
    assert.ok(session.methodologyReviewedAt);
    assert.deepEqual(session.methodologyReviewedBy, { role: 'owner', name: 'Andy' });
    assert.equal(putCalls.length, 1);
  });

  test('F2 marking reviewed with a known alertId PATCHes the durable coach_alerts row', async () => {
    const fetchCalls = [];
    global.MSOS4.store = { putSession: () => {} };
    global.MSOS4.cloud = { ready: () => true, org: () => 'org-1', fetch: async (url, opts) => { fetchCalls.push({ url, opts }); return []; } };
    const session = { id: 's1', pendingMethodologyReview: { reasons: ['x'] } };
    await SM.markReviewed(session, 'AL1');
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0].url, /\/rest\/v1\/coach_alerts\?id=eq\.AL1/);
    assert.equal(fetchCalls[0].opts.method, 'PATCH');
    assert.ok(JSON.parse(fetchCalls[0].opts.body).read_at);
  });

  test('F3 (fail-safe) a throwing cloud PATCH must not break marking reviewed locally', async () => {
    global.MSOS4.store = { putSession: () => {} };
    global.MSOS4.cloud = { ready: () => true, org: () => 'org-1', fetch: async () => { throw new Error('offline'); } };
    const session = { id: 's1', pendingMethodologyReview: { reasons: ['x'] } };
    await assert.doesNotReject(() => SM.markReviewed(session, 'AL1'));
    assert.equal(session.pendingMethodologyReview, null, 'the local flag must still clear even if the durable row can\'t be reached');
  });

  return tests;
}

// fetchOpenReview and evidenceProvenance are exercised once against the real engines only (they aren't
// part of the fail-before/pass-after bug set below, which targets the three gating/checking rules).
function runExtras() {
  const tests = [];
  function test(name, fn) { tests.push({ name, fn }); }

  test('G1 fetchOpenReview: cloud not ready -> null, no fetch attempted', async () => {
    const fetchCalls = [];
    global.MSOS4.cloud = { ready: () => false, org: () => 'org-1', fetch: async (...a) => { fetchCalls.push(a); return []; } };
    const r = await realFetchOpenReview({ id: 's1' });
    assert.equal(r, null);
    assert.equal(fetchCalls.length, 0);
  });

  test('G2 fetchOpenReview: ready with no org -> null (never queries without a real org)', async () => {
    global.MSOS4.cloud = { ready: () => true, org: () => '', fetch: async () => { throw new Error('must not be called'); } };
    const r = await realFetchOpenReview({ id: 's1' });
    assert.equal(r, null);
  });

  test('G3 fetchOpenReview: builds the expected query and returns the newest open row', async () => {
    let seenUrl = null;
    global.MSOS4.cloud = {
      ready: () => true, org: () => 'org-1',
      fetch: async url => { seenUrl = url; return [{ id: 'AL9', title: 't', body: 'Jordan Test: intended Regeneration but delivered as Speed / Max', created_at: '2026-09-11T00:00:00Z' }]; },
    };
    const r = await realFetchOpenReview({ id: 's5' });
    assert.equal(r.id, 'AL9');
    assert.match(seenUrl, /organisation_id=eq\.org-1/);
    assert.match(seenUrl, /session_id=eq\.s5/);
    assert.match(seenUrl, /kind=eq\.methodology_review/);
    assert.match(seenUrl, /read_at=is\.null/);
  });

  test('G4 (fail-safe) fetchOpenReview never throws when the network call fails', async () => {
    global.MSOS4.cloud = { ready: () => true, org: () => 'org-1', fetch: async () => { throw new Error('offline'); } };
    let r;
    await assert.doesNotReject(async () => { r = await realFetchOpenReview({ id: 's1' }); });
    assert.equal(r, null);
  });

  test('H1 evidenceProvenance: relativeStimulusPlan (the applied performance plan) formats a T400/PB line', () => {
    const s = evidenceProvenance({ relativeStimulusPlan: { athleteSeconds: 65, referenceSeconds: 70, referenceCount: 3, evidenceKind: 't400' } });
    assert.match(s, /^T400 evidence: /);
    assert.match(s, /vs squad median/);
    assert.match(s, /\(3 swimmers\)/);
  });

  test('H2 evidenceProvenance: relativeStimulusEvidence (evidence gathered but no plan applied) formats a PB line, singular swimmer', () => {
    const s = evidenceProvenance({ relativeStimulusEvidence: { athleteSeconds: 30, referenceSeconds: 28, referenceCount: 1, kind: 'pb', stroke: 'Freestyle' } });
    assert.match(s, /^PB evidence: Freestyle /);
    assert.match(s, /\(1 swimmer\)$/);
  });

  test('H3 evidenceProvenance: neither field present -> empty string, nothing appended to the reason', () => {
    assert.equal(evidenceProvenance({}), '');
    assert.equal(evidenceProvenance({ adaptationReason: 'Coach override' }), '');
  });

  return tests;
}

async function main() {
  let allTests = [];
  allTests = allTests.concat(run(REAL_SM, 'real'));
  allTests = allTests.concat(runExtras());

  // --- Fail-before/pass-after: inject three real historical-shape bugs into scratch copies ---
  const realSource = fs.readFileSync(SM_PATH, 'utf8');

  // Bug 1: drop the owner-never-gated exemption -- Andy's own sessions would get flagged exactly like an
  // assistant's, directly contradicting the rule he asked this to mirror from the stroke gate.
  {
    const buggy = loadBuggyCopy(realSource,
      `function resolveSessionGate(who,session,state=M.state){\n    if(who?.role!=='assistant')return{gated:false};\n    return{gated:true,verdict:evaluate(session,state)};\n  }`,
      `function resolveSessionGate(who,session,state=M.state){\n    return{gated:true,verdict:evaluate(session,state)};\n  }`);
    const { session, state } = driftSession();
    const before = buggy.resolveSessionGate(OWNER, session, state);
    assert.equal(before.gated, true, 'sanity: the injected bug really does gate the owner (fail-before)');
    const after = REAL_SM.resolveSessionGate(OWNER, session, state);
    assert.equal(after.gated, false, 'the real engine must never gate the owner\'s own sessions (pass-after)');
    allTests.push({ name: 'FAIL-BEFORE/PASS-AFTER bug1 owner-never-gated: real engine correct where buggy copy was not', fn: () => {
      assert.equal(before.gated, true); assert.equal(after.gated, false);
    } });
  }

  // Bug 2: drop the "item not found" guard in stimulusDrift -- an override row that outlives its item
  // (the coach later deleted/restructured that part of the session, a real and unremarkable edit) must
  // never crash the whole Finish-session flow; it must simply have nothing to check for that stale row.
  {
    const buggy = loadBuggyCopy(realSource,
      `if(!item||item.kind!=='set')continue;`,
      `if(item.kind!=='set')continue;`);
    const session = { id: 's7', blocks: [{ id: 'b1', items: [] }] }; // the item this row refers to no longer exists
    const state = { athletes: [makeAthlete('a1', 'X')], adaptationOverrides: [
      { id: 'mod-1', sessionId: 's7', itemId: 'missing-item', athleteId: 'a1', patch: {}, raw: 'x', active: true },
    ] };
    assert.throws(() => buggy.evaluate(session, state), 'sanity: the injected bug really does crash on a stale item reference (fail-before)');
    let after;
    assert.doesNotThrow(() => { after = REAL_SM.evaluate(session, state); }, 'a stale item reference must never crash the evidence check (pass-after)');
    assert.deepEqual(after.drift, []);
    allTests.push({ name: 'FAIL-BEFORE/PASS-AFTER bug2 stale-item-reference-never-crashes: real engine correct where buggy copy was not', fn: () => {
      assert.throws(() => buggy.evaluate(session, state));
      assert.doesNotThrow(() => REAL_SM.evaluate(session, state));
    } });
  }

  // Bug 3: drop the "Unclassified means nothing to check" guard in planTargetCheck -- any weekly-plan
  // focus text that doesn't name a recognisable system would spuriously fail against whatever the session
  // actually trains, exactly the "unknown treated as a failure" mistake Andy's own design answer ruled out.
  {
    const buggy = loadBuggyCopy(realSource,
      `const named=D.systemFrom(focusText);\n    if(named==='Unclassified')return{checked:false};`,
      `const named=D.systemFrom(focusText);`);
    global.MSOS4.coachLoopUI.planContext = () => ({ weeklyFocus: 'Big meet coming up, keep spirits high' });
    const { session, state } = thresholdSession();
    const before = buggy.evaluate(session, state);
    assert.equal(before.approved, false, 'sanity: the injected bug really does spuriously fail an unrelated focus line (fail-before)');
    const after = REAL_SM.evaluate(session, state);
    assert.equal(after.approved, true, 'the real engine must treat "names no system" as nothing to check, never a failure (pass-after)');
    global.MSOS4.coachLoopUI.planContext = () => ({});
    allTests.push({ name: 'FAIL-BEFORE/PASS-AFTER bug3 unclassified-focus-not-a-failure: real engine correct where buggy copy was not', fn: () => {
      assert.equal(before.approved, false); assert.equal(after.approved, true);
    } });
  }

  let passed = 0;
  for (const t of allTests) {
    try { await t.fn(); passed++; } catch (e) { console.error(`FAIL: ${t.name}\n  ${e.stack || e.message}`); }
  }
  if (passed !== allTests.length) {
    console.error(`session-methodology: ${passed}/${allTests.length} passed`);
    process.exit(1);
  }
  console.log(`session-methodology PASS ${passed}/${allTests.length}`);
}

main();
