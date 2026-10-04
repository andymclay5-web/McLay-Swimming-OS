'use strict';
// 4 Oct 2026 -- "next on the list" after the swimmer real-account build: the vocabulary-mapping decision
// flagged open when engines/season-planner.js shipped earlier today (see that file's own header and
// tests/session-methodology-20260911.cjs's B2/bug-3 case, which proved the plan-vs-session mismatch check
// safely stays inert for season-planner wording, never misfires).
//
// Round 1 (same day, superseded minutes later -- kept only as history): Andy was asked via AskUserQuestion
// how to resolve it and chose a first proposed mapping as-is, including Anaerobic Capacity->Clearance and
// Anaerobic Power->Speed/Max.
//
// Round 2 (same day, the mapping actually shipped): Andy corrected that first mapping against his own real
// reading of Clive Rushton's model, verbatim: "anaerobic capacity is atp, top end speed, assisted and
// resisted... anaerobic power is race pace work, lactate tolerance etc with clearance fitting into the top
// of aerobic power but there are some crossovers." i.e. the two terms are the OPPOSITE of round 1's guess,
// and Clearance is the ceiling of Aerobic Power, not its own Anaerobic Capacity zone. This file tests the
// CORRECTED mapping actually in engines/session-methodology.js: Aerobic Capacity->Development, Aerobic
// Power->Threshold (Clearance accepted as a stated crossover, not a mismatch), Anaerobic Power->Race pace,
// Anaerobic Capacity->Speed/Max, Aerobic Skills->Skill/Technical, the combo day
// "Aerobic + Anaerobic Capacity"->Overload (unaddressed by Andy's correction, kept as the original
// reasonable default). Proves: each of the six mappings resolves correctly, the combo phrase is never
// shadowed by the shorter "Anaerobic Capacity" substring it contains (nor "Anaerobic Power" by "Aerobic
// Power"), the Threshold/Clearance crossover is accepted as a match (not flagged) while an UNRELATED
// Clearance-vs-something-else mismatch still correctly flags, dosageEngine's own keyword classifier remains
// the fallback for ordinary weekly-plan text, and the exact field season-planner.js actually writes
// (weekSession.primary_system, read by coach-loop-ui.js's planContext() into todayFocus) drives a real
// match/mismatch end to end. Fail-before/pass-after against the real source closes it out.
//
// Bootstrap technique matches tests/session-methodology-20260911.cjs exactly (real dosage.js + the real
// session-methodology.js against a stable global.MSOS4), reused rather than re-invented.

const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const os = require('os');

const ENGINES_DIR = path.join(__dirname, '..', 'engines');
const SM_PATH = path.join(ENGINES_DIR, 'session-methodology.js');
const BOARD_PATH = path.join(ENGINES_DIR, 'board.js');
const SCRATCH_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-vocab-test-'));

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

global.MSOSEngines = global.MSOSEngines || {};
global.MSOSEngines.Modification = require(path.join(ENGINES_DIR, 'modification.js'));
global.MSOS4 = global.MSOS4 || {};
global.MSOS4.util = { escape: v => String(v ?? ''), clone: v => JSON.parse(JSON.stringify(v)) };
global.MSOS4.session = {};
require(path.join(ENGINES_DIR, 'dosage.js')); // -> global.MSOS4.dosageEngine

const boardSrc = fs.readFileSync(BOARD_PATH, 'utf8');
const realFindItem = eval(`(${extractBlock(boardSrc, 'function findItem(session,id){')})`);
global.MSOS4.boardEngine = { findItem: realFindItem };
global.MSOS4.ui = { renderBoard: function () {} };
global.MSOS4.state = {};
global.MSOS4.coachLoopUI = { planContext: () => ({}) };
global.MSOS4.pushAlerts = { sendCoachAlert: async () => ({ alertId: null }) };
global.MSOS4.store = { putSession: () => {} };
global.MSOS4.teamAccess = { actor: () => ({ role: 'owner', name: 'Owner' }) };
global.MSOS4.cloud = { ready: () => false, org: () => '', fetch: async () => [] };
global.MSOS4.access = { role: () => 'owner' };

require(SM_PATH);
const REAL_SM = global.MSOS4.sessionMethodology;
assert.ok(REAL_SM && typeof REAL_SM.seasonPlannerSystem === 'function', 'sanity: real session-methodology.js must export seasonPlannerSystem');

// A session whose real set text classifies to a given dosageEngine system, so planTargetCheck's "dominant
// classified system" side has something concrete to compare each mapped term against.
function sessionFor(raw) {
  const session = { id: 's-vocab', blocks: [{ id: 'b1', items: [{ id: 'i1', kind: 'set', raw, reps: 1, distance: 400 }] }] };
  const state = { athletes: [], adaptationOverrides: [] };
  return { session, state };
}

async function main() {
  let passed = 0, total = 0;
  function test(name, fn) {
    total++;
    try { fn(); passed++; } catch (e) { console.error(`FAIL: ${name}\n  ${e.stack || e.message}`); }
  }

  // --- The six mappings, direct (corrected round 2) ---
  test('Aerobic Capacity -> Development', () => {
    assert.equal(REAL_SM.seasonPlannerSystem('Aerobic Capacity'), 'Development');
  });
  test('Aerobic Power -> Threshold', () => {
    assert.equal(REAL_SM.seasonPlannerSystem('Aerobic Power'), 'Threshold');
  });
  test('Anaerobic Capacity -> Speed / Max (ATP-PC/alactic top-end speed, corrected from round 1\'s Clearance guess)', () => {
    assert.equal(REAL_SM.seasonPlannerSystem('Anaerobic Capacity'), 'Speed / Max');
  });
  test('Anaerobic Power -> Race pace (race-pace/lactate-tolerance work, corrected from round 1\'s Speed/Max guess)', () => {
    assert.equal(REAL_SM.seasonPlannerSystem('Anaerobic Power'), 'Race pace');
  });
  test('Aerobic Skills -> Skill / Technical', () => {
    assert.equal(REAL_SM.seasonPlannerSystem('Aerobic Skills'), 'Skill / Technical');
  });
  test('combo day "Aerobic + Anaerobic Capacity" -> Overload, not shadowed by the Anaerobic Capacity substring it contains', () => {
    assert.equal(REAL_SM.seasonPlannerSystem('Aerobic + Anaerobic Capacity'), 'Overload');
  });
  test('"Anaerobic Power" not shadowed by the "Aerobic Power" substring it contains', () => {
    assert.equal(REAL_SM.seasonPlannerSystem('Anaerobic Power'), 'Race pace');
    assert.notEqual(REAL_SM.seasonPlannerSystem('Anaerobic Power'), 'Threshold');
  });
  test('unrecognised text -> null, falls through to dosageEngine (not assumed here)', () => {
    assert.equal(REAL_SM.seasonPlannerSystem('Big meet coming up, keep spirits high'), null);
  });
  test('matches the real compound objective text season-planner.js actually writes (stroke · phase label · system)', () => {
    assert.equal(REAL_SM.seasonPlannerSystem('Freestyle · Base Skills · Aerobic Capacity'), 'Development');
  });

  // --- End-to-end through planTargetCheck / evaluate(), via the exact field season-planner.js populates ---
  test('weekSession.primary_system="Aerobic Capacity" matches a session that actually trains Development', () => {
    // todayFocus is read from weekSession.primary_system by coach-loop-ui.js's real planContext(); simulate
    // its already-resolved shape directly rather than re-testing planContext() itself here.
    global.MSOS4.coachLoopUI.planContext = () => ({ todayFocus: 'Aerobic Capacity' });
    const { session, state } = sessionFor('4 x 400 continuous swim, no intensity marker given');
    const v = REAL_SM.evaluate(session, state);
    assert.equal(v.plan.checked, true);
    assert.equal(v.plan.plannedSystem, 'Development');
    assert.equal(v.plan.dominantSystem, 'Development');
    assert.equal(v.plan.matches, true);
    assert.equal(v.approved, true);
    global.MSOS4.coachLoopUI.planContext = () => ({});
  });

  test('weekSession.primary_system="Anaerobic Capacity" (ATP-PC/speed) flags a session that actually trains Development as a mismatch', () => {
    global.MSOS4.coachLoopUI.planContext = () => ({ todayFocus: 'Anaerobic Capacity' });
    const { session, state } = sessionFor('4 x 400 continuous swim, no intensity marker given');
    const v = REAL_SM.evaluate(session, state);
    assert.equal(v.plan.checked, true);
    assert.equal(v.plan.plannedSystem, 'Speed / Max');
    assert.equal(v.plan.matches, false);
    assert.equal(v.approved, false);
    assert.ok(v.reasons.some(r => /Weekly focus names Speed \/ Max, but this session's dominant classified system is Development/.test(r)));
    global.MSOS4.coachLoopUI.planContext = () => ({});
  });

  test('weekSession.primary_system="Anaerobic Power" (race pace/lactate tolerance) matches a session that actually trains Race pace', () => {
    global.MSOS4.coachLoopUI.planContext = () => ({ todayFocus: 'Anaerobic Power' });
    const { session, state } = sessionFor('4 x 100 @ race pace');
    const v = REAL_SM.evaluate(session, state);
    assert.equal(v.plan.checked, true);
    assert.equal(v.plan.plannedSystem, 'Race pace');
    assert.equal(v.plan.dominantSystem, 'Race pace');
    assert.equal(v.plan.matches, true);
    assert.equal(v.approved, true);
    global.MSOS4.coachLoopUI.planContext = () => ({});
  });

  // --- The stated Threshold/Clearance crossover: accepted as a match, never flagged ---
  test('Aerobic Power (->Threshold) against a session that actually trains Clearance is accepted, not flagged (Andy\'s stated crossover)', () => {
    global.MSOS4.coachLoopUI.planContext = () => ({ todayFocus: 'Aerobic Power' });
    const { session, state } = sessionFor('8 x 100 Clearance effort, HR 170-180');
    const v = REAL_SM.evaluate(session, state);
    assert.equal(v.plan.checked, true);
    assert.equal(v.plan.plannedSystem, 'Threshold');
    assert.equal(v.plan.dominantSystem, 'Clearance');
    assert.equal(v.plan.matches, true, 'Clearance is the stated ceiling of Aerobic Power, not a mismatch');
    assert.equal(v.approved, true);
    global.MSOS4.coachLoopUI.planContext = () => ({});
  });

  test('the crossover is specific to Threshold/Clearance -- an unrelated mismatch (Development planned, Clearance delivered) still flags', () => {
    global.MSOS4.coachLoopUI.planContext = () => ({ todayFocus: 'Aerobic Capacity' });
    const { session, state } = sessionFor('8 x 100 Clearance effort, HR 170-180');
    const v = REAL_SM.evaluate(session, state);
    assert.equal(v.plan.checked, true);
    assert.equal(v.plan.plannedSystem, 'Development');
    assert.equal(v.plan.dominantSystem, 'Clearance');
    assert.equal(v.plan.matches, false, 'the crossover exception must not swallow a genuine, unrelated mismatch');
    assert.equal(v.approved, false);
    global.MSOS4.coachLoopUI.planContext = () => ({});
  });

  test('the same Threshold/Clearance crossover also applies to a plain "Threshold week" weekly-plan phrase (general physiology, not season-planner-only)', () => {
    global.MSOS4.coachLoopUI.planContext = () => ({ weeklyFocus: 'Focus is Threshold sets this week' });
    const { session, state } = sessionFor('8 x 100 Clearance effort, HR 170-180');
    const v = REAL_SM.evaluate(session, state);
    assert.equal(v.plan.checked, true);
    assert.equal(v.plan.plannedSystem, 'Threshold');
    assert.equal(v.plan.matches, true);
    global.MSOS4.coachLoopUI.planContext = () => ({});
  });

  test('dosageEngine\'s own keyword vocabulary still works unchanged for ordinary (non-season-planner, exact-match) weekly-plan text', () => {
    global.MSOS4.coachLoopUI.planContext = () => ({ weeklyFocus: 'Focus is Threshold sets this week' });
    const { session, state } = sessionFor('8 x 200 Threshold pace swim');
    const v = REAL_SM.evaluate(session, state);
    assert.equal(v.plan.checked, true);
    assert.equal(v.plan.plannedSystem, 'Threshold');
    assert.equal(v.plan.dominantSystem, 'Threshold');
    assert.equal(v.plan.matches, true);
    global.MSOS4.coachLoopUI.planContext = () => ({});
  });

  // --- Fail-before/pass-after against the real source ---
  {
    const realSource = fs.readFileSync(SM_PATH, 'utf8');
    assert.match(realSource, /seasonPlannerSystem/, 'sanity: the real source must contain this fix\'s own new code');
    const hookStart = realSource.indexOf('  // 4 Oct 2026 (Andy, decided via AskUserQuestion');
    assert.ok(hookStart > 0, 'could not locate the new vocabulary-mapping section in the real source to remove for fail-before');
    const preFixSrc = realSource.slice(0, hookStart);
    assert.doesNotMatch(preFixSrc, /seasonPlannerSystem|SEASON_PHASE_VOCAB|isKnownCrossover|Aerobic\s*\+\s*anaerobic/i, 'pre-fix reconstruction must genuinely lack the season-planner vocabulary mapping and the crossover check');

    // And prove the buggy (pre-fix-shaped) behaviour really did differ: without the lookup, the real
    // dosageEngine.systemFrom('Aerobic Capacity') returns 'Unclassified' (none of its own keywords match
    // "aerobic"/"capacity"), so the check would have stayed checked:false forever for this exact case.
    const D = global.MSOS4.dosageEngine;
    assert.equal(D.systemFrom('Aerobic Capacity'), 'Unclassified', 'sanity: dosageEngine alone truly cannot classify this phrase (fail-before)');
    assert.equal(REAL_SM.seasonPlannerSystem('Aerobic Capacity'), 'Development', 'the real engine resolves it via the new lookup (pass-after)');
    total++; passed++;
    console.log('FAIL-BEFORE/PASS-AFTER vocab-mapping: real engine resolves season-planner text where dosageEngine alone could not');
  }

  if (passed !== total) {
    console.error(`season-planner-vocab-mapping: ${passed}/${total} passed`);
    process.exit(1);
  }
  console.log(`SEASON_PLANNER_VOCAB_MAPPING_PASS ${passed}/${total}`);
}

main();
