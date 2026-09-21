'use strict';
// Real coaching failure this fixes (11 Sept 2026 -- Andy's own long-standing ask, 7 Sept: "has five 400 IM
// results to add and wants a working, compatible input format"). Before this, the Times screen's "Save
// T400" card took exactly one swimmer + one time per click -- entering five results meant five separate
// round trips. This suite covers the new bulk-entry path added to app.js/engines/t400-capture.js:
// X.resolveAthleteByName (exact, never-fuzzy name matching -- this app has swimmers who share a first
// name, so identity must never be guessed from a partial match), X.saveT400Bulk (one row per line, each
// attempted independently so one bad line never blocks the rest of the batch), and t400-capture.js's new
// meta.silent option (lets a batch fire one combined save/toast instead of N stacked ones).
//
// A real, more serious bug was found and fixed while building this (see app.js's own comment at T.t400):
// X.ensureType only ever creates/reuses ONE shared trainingTestType record ("T400 Freestyle") for every
// T400 row regardless of the swimmer's actual stroke -- the real per-swim stroke lives only in row.stroke.
// T.t400() (the anchor used to compute FREESTYLE aerobic-zone paces for every other session) filtered only
// by that shared type, never by stroke -- so the most recent T400 of ANY stroke, including an IM time
// trial, would silently become the freestyle anchor. This directly matters for a bulk IM entry: without
// the fix, bulk-loading five IM results would corrupt every other swimmer's-- no, this swimmer's -- normal
// aerobic training targets the next time T.aerobic() ran. Group 1 below proves this fail-before/pass-after
// against a scratch copy of app.js with the stroke check removed.
//
// app.js cannot be require()'d directly in Node (its IIFE touches document/window throughout, no jsdom
// here). Per house convention (tests/session-authorship-reconcile-20260911.cjs, tests/capture-default-
// selection-20260909.cjs), this extracts the exact, unmodified source text of the real functions and
// executes it against constructed fixtures. engines/t400-capture.js has no DOM dependency of its own, so
// it is required for real against a minimal global.MSOS4/MSOSEngines bootstrap instead of being extracted.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.join(__dirname, '..');
const APP_PATH = path.join(root, 'app.js');
const T400_CAPTURE_PATH = path.join(root, 'engines', 't400-capture.js');

function extractArrowFn(source, marker) {
  const idx = source.indexOf(marker);
  assert.ok(idx >= 0, `marker not found in app.js: ${marker}`);
  assert.equal(source.indexOf(marker, idx + 1), -1, `expected exactly one occurrence of marker: ${marker}`);
  const rhsStart = idx + marker.length;
  const arrowIdx = source.indexOf('=>', rhsStart);
  assert.ok(arrowIdx >= 0 && arrowIdx < rhsStart + 200, `expected an arrow function immediately after: ${marker}`);
  const braceStart = source.indexOf('{', arrowIdx);
  assert.ok(braceStart >= 0, `expected a '{' body after the arrow for: ${marker}`);
  let depth = 0, i = braceStart;
  for (; i < source.length; i++) { const c = source[i]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
  assert.ok(depth === 0, `unbalanced braces while extracting: ${marker}`);
  return source.slice(rhsStart, i + 1);
}
function extractFunctionDecl(source, marker) {
  const idx = source.indexOf(marker);
  assert.ok(idx >= 0, `marker not found in app.js: ${marker}`);
  assert.equal(source.indexOf(marker, idx + 1), -1, `expected exactly one occurrence of marker: ${marker}`);
  assert.equal(marker[marker.length - 1], '{', `marker must end at the function body's opening brace: ${marker}`);
  const braceStart = idx + marker.length - 1;
  let depth = 0, i = braceStart;
  for (; i < source.length; i++) { const c = source[i]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
  assert.ok(depth === 0, `unbalanced braces while extracting: ${marker}`);
  return source.slice(idx, i + 1);
}
// Extracts a contiguous run of source from the start of `startMarker` through the end of the statement
// beginning at `endMarker` (which must itself end at an arrow function's opening '{'), inclusive of the
// trailing ';'. Used to pull typeKey()/t400IsFreestyle()/T.t400 out together, since T.t400's body depends
// on both of the preceding helper declarations sharing its closure.
function extractSpan(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `start marker not found: ${startMarker}`);
  const endFnSrc = extractArrowFn(source, endMarker);
  const endMarkerIdx = source.indexOf(endMarker);
  const bodyEnd = endMarkerIdx + endMarker.length + endFnSrc.length; // position just after the closing '}'
  const semi = source.indexOf(';', bodyEnd);
  assert.ok(semi >= bodyEnd && semi < bodyEnd + 3, `expected a ';' right after ${endMarker}'s body`);
  return source.slice(start, semi + 1);
}

const appSrc = fs.readFileSync(APP_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Group 1: T.t400 must anchor freestyle aerobic-zone targets only off a genuinely Freestyle T400 -- never
// off a more recent IM/Backstroke/etc. time trial. Fail-before/pass-after via a scratch copy with the
// stroke guard removed.
// ---------------------------------------------------------------------------
function buildT400(source) {
  const span = extractSpan(source, 'function typeKey(state,row){', 'T.t400=');
  const T = {};
  // eslint-disable-next-line no-new-func
  new Function('T', span)(T);
  return T;
}

function runGroup1(T, label) {
  const tests = [];
  const test = (name, fn) => tests.push({ name: `${label}: ${name}`, fn });

  test('a genuinely Freestyle-only history anchors correctly', () => {
    const state = { trainingTestTypes: [{ id: 'tt', test_key: 't400_freestyle' }], trainingTestResults: [
      { athlete_id: 'a', test_type_id: 'tt', result_seconds: 300, result_date: '2026-08-01', stroke: 'Freestyle', valid_for_anchor: true },
    ] };
    const r = T.t400({ id: 'a' }, state, '');
    assert.equal(r.result_seconds, 300);
  });

  test('legacy rows with no .stroke field at all still anchor (backward compatible with old data)', () => {
    const state = { trainingTestTypes: [{ id: 'tt', test_key: 't400_freestyle' }], trainingTestResults: [
      { athlete_id: 'a', test_type_id: 'tt', result_seconds: 300, result_date: '2026-08-01', valid_for_anchor: true },
    ] };
    const r = T.t400({ id: 'a' }, state, '');
    assert.equal(r.result_seconds, 300, 'a row saved before per-stroke tagging existed must default to Freestyle');
  });

  test('a MORE RECENT IM time trial must never become the freestyle anchor', () => {
    const state = { trainingTestTypes: [{ id: 'tt', test_key: 't400_freestyle' }], trainingTestResults: [
      { athlete_id: 'a', test_type_id: 'tt', result_seconds: 300, result_date: '2026-08-01', stroke: 'Freestyle', valid_for_anchor: true },
      { athlete_id: 'a', test_type_id: 'tt', result_seconds: 340, result_date: '2026-09-11', stroke: 'IM', valid_for_anchor: true },
    ] };
    const r = T.t400({ id: 'a' }, state, '');
    assert.equal(r.result_seconds, 300, `must pick the Freestyle row, not the newer IM row (got ${r.result_seconds})`);
  });

  test('with NO Freestyle history at all, an IM-only history correctly yields no anchor', () => {
    const state = { trainingTestTypes: [{ id: 'tt', test_key: 't400_freestyle' }], trainingTestResults: [
      { athlete_id: 'a', test_type_id: 'tt', result_seconds: 340, result_date: '2026-09-11', stroke: 'IM', valid_for_anchor: true },
    ] };
    const r = T.t400({ id: 'a' }, state, '');
    assert.equal(r, null, 'no Freestyle evidence should mean no Freestyle anchor -- unknown remains unknown, never a guess');
  });

  return tests;
}

// ---------------------------------------------------------------------------
// Group 2: resolveAthleteByName -- exact match only, never fuzzy; squad-hint disambiguates real collisions.
// ---------------------------------------------------------------------------
const resolveSrc = extractFunctionDecl(appSrc, 'function resolveAthleteByName(raw,state){');
const resolveAthleteByName = new Function('return ' + resolveSrc)();

function runGroup2() {
  const tests = [];
  const test = (name, fn) => tests.push({ name: `resolveAthleteByName: ${name}`, fn });
  const state = { athletes: [
    { id: 'a1', full_name: 'Alex Auer', squad: 'Development', active: true },
    { id: 'm1', full_name: 'Matthew Kofoed', squad: 'National', active: true },
    { id: 'm2', full_name: 'Matthew Robertson', squad: 'National', active: true },
    { id: 'dup1', full_name: 'Sam Lee', squad: 'National', active: true },
    { id: 'dup2', full_name: 'Sam Lee', squad: 'Development', active: true },
    { id: 'inactive1', full_name: 'Old Swimmer', squad: 'National', active: false },
  ] };

  test('exact, case-insensitive match', () => {
    assert.equal(resolveAthleteByName('alex auer', state).id, 'a1');
    assert.equal(resolveAthleteByName('  Alex Auer  ', state).id, 'a1');
  });
  test('never matches by partial/first name alone (multiple Matthews)', () => {
    assert.equal(resolveAthleteByName('Matthew', state), null);
  });
  test('no match at all -> null, never a guess', () => {
    assert.equal(resolveAthleteByName('Nobody Here', state), null);
  });
  test('inactive swimmers are not matched', () => {
    assert.equal(resolveAthleteByName('Old Swimmer', state), null);
  });
  test('a genuine full-name collision is ambiguous without a squad hint', () => {
    assert.equal(resolveAthleteByName('Sam Lee', state), null);
  });
  test('"Name (Squad)" disambiguates a genuine collision', () => {
    assert.equal(resolveAthleteByName('Sam Lee (Development)', state).id, 'dup2');
    assert.equal(resolveAthleteByName('Sam Lee (National)', state).id, 'dup1');
  });
  return tests;
}

// ---------------------------------------------------------------------------
// Groups 3 & 4: X.saveT400Bulk and t400-capture.js's meta.silent, built on the REAL wrapped X.saveT400 --
// base extracted from app.js, then engines/t400-capture.js required for real against that same object so
// the actual comparison/toast/silent logic under test is the real, shipped code, not a re-implementation.
// ---------------------------------------------------------------------------
function buildTimingEnv() {
  const ensureTypeSrc = extractArrowFn(appSrc, 'X.ensureType=');
  const addSrc = extractArrowFn(appSrc, 'X.add=');
  const baseSrc = extractArrowFn(appSrc, 'X.saveT400=');
  const bulkSrc = extractArrowFn(appSrc, 'X.saveT400Bulk=');
  const U = { seconds: v => { if (typeof v === 'number') return v; const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(String(v || '')); if (m) return Number(m[1]) * 60 + Number(m[2]); return Number(v) || 0; }, uid: p => `${p}-${Math.random().toString(36).slice(2)}`, now: () => new Date().toISOString(), clock: s => String(s) };
  const state = { athletes: [], trainingTestResults: [], settings: {} };
  const M = { util: U, state };
  const session = { id: 's1', identity: { course: 'SCM' } };
  M.currentSession = () => session;
  const X = M.timing = {};
  // eslint-disable-next-line no-new-func
  new Function('M', 'U', 'X', `X.ensureType=${ensureTypeSrc};X.add=${addSrc};X.saveT400=${baseSrc}`)(M, U, X);

  // Real engines/t400-capture.js, required against this same global.MSOS4/MSOSEngines so X.saveT400 becomes
  // the actual wrapped (comparison + silent-aware) version, not a re-implementation of it.
  global.MSOS4 = M;
  global.MSOSEngines = global.MSOSEngines || {};
  const storeCalls = [], toastCalls = [];
  M.store = { save: s => storeCalls.push(s) };
  M.toast = msg => toastCalls.push(msg);
  M.boardEngine = { name: (ath) => ath?.full_name?.split(/\s+/)[0] };
  global.MSOSEngines.Aerobic = { t400: () => null };
  global.MSOSEngines.Evidence = { stroke: s => s || 'Freestyle', seconds: r => Number(r?.result_seconds) };
  delete require.cache[require.resolve(T400_CAPTURE_PATH)];
  require(T400_CAPTURE_PATH); // -> overwrites M.timing.saveT400 with the wrapped version (X === M.timing)

  const resolveFn = new Function('return ' + resolveSrc)();
  // eslint-disable-next-line no-new-func
  new Function('M', 'X', 'resolveAthleteByName', `X.saveT400Bulk=${bulkSrc}`)(M, X, resolveFn);

  return { M, X, state, session, storeCalls, toastCalls };
}

function runGroup3() {
  const tests = [];
  const test = (name, fn) => tests.push({ name: `X.saveT400Bulk: ${name}`, fn });

  test('multiple valid rows all save, matched by exact name', () => {
    const { X, state, session } = buildTimingEnv();
    state.athletes.push({ id: 'a1', full_name: 'Alex Auer', active: true }, { id: 'c1', full_name: 'Charlotte Murphy', active: true });
    const { saved, errors } = X.saveT400Bulk([
      { name: 'Alex Auer', time: '5:23.0' },
      { name: 'Charlotte Murphy', time: '5:41.2', stroke: 'IM' },
    ], session, state);
    assert.equal(errors.length, 0);
    assert.equal(saved.length, 2);
    assert.equal(state.trainingTestResults.length, 2);
    assert.equal(saved[1].row.stroke, 'IM');
  });

  test('a bad line never blocks the rest of the batch', () => {
    const { X, state, session } = buildTimingEnv();
    state.athletes.push({ id: 'a1', full_name: 'Alex Auer', active: true });
    const { saved, errors } = X.saveT400Bulk([
      { name: 'Nobody Real', time: '5:00.0' },
      { name: 'Alex Auer', time: 'not a time' },
      { name: 'Alex Auer', time: '5:23.0' },
    ], session, state);
    assert.equal(saved.length, 1, 'only the one genuinely valid row should save');
    assert.equal(errors.length, 2);
    assert.ok(errors.some(e => /No single matching active swimmer/.test(e.message)));
    assert.ok(errors.some(e => /valid 400 time/.test(e.message)));
  });

  test('rows without an explicit stroke/date fall back to the batch defaults; explicit values override', () => {
    const { X, state, session } = buildTimingEnv();
    state.athletes.push({ id: 'a1', full_name: 'Alex Auer', active: true }, { id: 'c1', full_name: 'Charlotte Murphy', active: true });
    const { saved } = X.saveT400Bulk([
      { name: 'Alex Auer', time: '5:23.0' },
      { name: 'Charlotte Murphy', time: '5:41.2', stroke: 'Backstroke', date: '2026-09-01' },
    ], session, state, { stroke: 'IM', date: '2026-09-11' });
    assert.equal(saved[0].row.stroke, 'IM', 'batch default stroke applied when a row omits one');
    assert.equal(saved[0].row.result_date, '2026-09-11', 'batch default date applied when a row omits one');
    assert.equal(saved[1].row.stroke, 'Backstroke', 'a row-level stroke overrides the batch default');
    assert.equal(saved[1].row.result_date, '2026-09-01', 'a row-level date overrides the batch default');
  });

  test('an ambiguous name collision is reported per-row, not guessed', () => {
    const { X, state, session } = buildTimingEnv();
    state.athletes.push({ id: 'd1', full_name: 'Sam Lee', squad: 'National', active: true }, { id: 'd2', full_name: 'Sam Lee', squad: 'Development', active: true });
    const { saved, errors } = X.saveT400Bulk([{ name: 'Sam Lee', time: '5:23.0' }], session, state);
    assert.equal(saved.length, 0);
    assert.match(errors[0].message, /No single matching active swimmer/);
  });

  return tests;
}

function runGroup4() {
  const tests = [];
  const test = (name, fn) => tests.push({ name: `t400-capture meta.silent: ${name}`, fn });

  test('default (non-silent) call still saves to store and toasts, exactly as before this change', () => {
    const { X, state, session, storeCalls, toastCalls } = buildTimingEnv();
    state.athletes.push({ id: 'a1', full_name: 'Alex Auer', active: true });
    const row = X.saveT400('a1', '5:23.0', session, state, '2026-09-11');
    assert.equal(storeCalls.length, 1, 'a normal single-entry save must still call Store.save, unchanged');
    assert.equal(toastCalls.length, 1, 'a normal single-entry save must still toast, unchanged');
    assert.equal(row.t400_comparison, 'baseline');
  });

  test('a silent (bulk) call skips the save/toast side effects but still saves the row and its evidence metadata', () => {
    const { X, state, session, storeCalls, toastCalls } = buildTimingEnv();
    state.athletes.push({ id: 'a1', full_name: 'Alex Auer', active: true });
    const row = X.saveT400('a1', '5:23.0', session, state, '2026-09-11', 'Freestyle', { silent: true });
    assert.equal(storeCalls.length, 0, 'a silent bulk row must not trigger its own individual Store.save');
    assert.equal(toastCalls.length, 0, 'a silent bulk row must not trigger its own individual toast');
    assert.ok(state.trainingTestResults.includes(row), 'the row itself must still be recorded in state');
    assert.equal(row.t400_comparison, 'baseline', 'comparison metadata must still be computed even when silent');
  });

  return tests;
}

function main() {
  const allTests = [];
  allTests.push(...runGroup1(buildT400(appSrc), 'real'));
  allTests.push(...runGroup2());
  allTests.push(...runGroup3());
  allTests.push(...runGroup4());

  // --- Fail-before/pass-after: the real historical-shape bug (dropping the stroke guard) ---
  {
    const buggySource = appSrc.replace('&&t400IsFreestyle(r)&&r.valid_for_anchor', '&&r.valid_for_anchor');
    assert.notEqual(buggySource, appSrc, 'the stroke-guard removal must actually change the source (marker drifted?)');
    const buggyT = buildT400(buggySource);
    const realT = buildT400(appSrc);
    const state = { trainingTestTypes: [{ id: 'tt', test_key: 't400_freestyle' }], trainingTestResults: [
      { athlete_id: 'a', test_type_id: 'tt', result_seconds: 300, result_date: '2026-08-01', stroke: 'Freestyle', valid_for_anchor: true },
      { athlete_id: 'a', test_type_id: 'tt', result_seconds: 340, result_date: '2026-09-11', stroke: 'IM', valid_for_anchor: true },
    ] };
    const before = buggyT.t400({ id: 'a' }, state, '');
    assert.equal(before.result_seconds, 340, 'sanity: the reverted (buggy) code really does let the newer IM row win (fail-before)');
    const after = realT.t400({ id: 'a' }, state, '');
    assert.equal(after.result_seconds, 300, 'the real, fixed code must anchor off the Freestyle row instead (pass-after)');
    allTests.push({ name: 'FAIL-BEFORE/PASS-AFTER: freestyle-anchor stroke guard', fn: () => {
      assert.equal(before.result_seconds, 340); assert.equal(after.result_seconds, 300);
    } });
  }

  let passed = 0;
  for (const t of allTests) {
    try { t.fn(); passed++; } catch (e) { console.error(`FAIL: ${t.name}\n  ${e.stack || e.message}`); }
  }
  if (passed !== allTests.length) {
    console.error(`bulk-t400-entry: ${passed}/${allTests.length} passed`);
    process.exit(1);
  }
  console.log(`bulk-t400-entry PASS ${passed}/${allTests.length}`);
}

main();
