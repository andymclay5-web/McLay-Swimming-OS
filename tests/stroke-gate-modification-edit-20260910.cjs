'use strict';
// Real coaching failure this fixes (Phase 3, 10 Sept 2026 -- Andy's own words): "Real write access for
// Jordan -- session create/edit, captures, notes, stroke changes. For strokes specifically, I'd reuse the
// exact 'check the evidence, approve instantly if it lines up, otherwise flag it for you' pattern I just
// built for swimmers." Jordan's individual-swimmer stroke overrides go through engines/modification-edit.js
// (the LIVE modal wired to [data-msos-mod-edit] -- app.js's own A.openModEdit is dead code, confirmed via
// grep: it has zero call sites anywhere in index.html's loaded files, and the real click handler is
// modification-edit.js's own capturing document listener, which stopImmediatePropagation()s). Without a
// gate, an assistant's stroke override there applies to the live Board instantly and silently, exactly like
// any other field -- indistinguishable from Andy's own free-form edits, and with no more scrutiny than a
// reps change. This suite verifies the new evidence gate added to that file: resolveStrokeGate/evaluateStroke
// (the decision), upsert (the storage of a pending proposal alongside -- never instead of -- an existing
// approved override), and save() (the real integration point, including the critical case where a NEW
// rejected proposal must never silently overwrite or drop a stroke that was already approved).
//
// House convention: engines/*.js are IIFEs that touch `document`/`window` and can't be require()'d directly
// in Node, so this test extracts the exact source text of each function under test via brace-depth counting
// and eval()s it against small constructed fixtures (see tests/session-authorship-reconcile-20260911.cjs and
// tests/team-access-20260911.cjs for the same pattern). Fail-before/pass-after is verified by injecting the
// real historical bug shape into a scratch copy of engines/modification-edit.js, confirming the test catches
// it, then restoring and confirming it passes again.
//
// Group D added 10 Sept 2026 (Phase 5, "add alerts, not just a view"): save() now calls a new
// notifyPendingStroke() whenever resolveStrokeGate holds a proposal back, which pages Andy via
// engines/push-alerts.js's sendCoachAlert (see supabase/functions/send-coach-alert and
// tests/remote-alerts-phase5-20260910.cjs for that engine's own coverage). buildEnv's M.pushAlerts stub
// makes this a real, exercised call path rather than relying on notifyPendingStroke's own optional-chaining
// to silently no-op it undetected.

const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const SRC_PATH = path.join(__dirname, '..', 'engines', 'modification-edit.js');

// Extracts one function's exact source text via brace-depth counting. `marker` must be the function's full
// signature up to and including its opening brace (e.g. "function foo(a,b){") -- brace counting starts
// exactly there, so nested object-literal braces in the body (e.g. `{role:'owner',name:'Owner'}`) are
// handled correctly rather than truncating at the first inner `}`.
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

function buildEnv(realSource, { evaluateImpl, actorImpl } = {}) {
  const toasts = [];
  const persistCalls = [];
  let closeCalls = 0;
  const state = { athletes: [], adaptationOverrides: [] };
  let currentActor = actorImpl || (() => ({ role: 'owner', name: 'Owner' }));
  let evaluate = evaluateImpl || (() => ({ approved: false, reason: 'no evidence configured' }));
  const evalCalls = [];
  // Phase 5 (10 Sept 2026, "add alerts, not just a view"): save() now calls notifyPendingStroke(), which
  // calls M.pushAlerts.sendCoachAlert() -- a real stub is provided (not left undefined) so this harness
  // actually exercises that call path rather than relying on notifyPendingStroke's own optional-chaining
  // to silently no-op it, matching the fidelity of every other M.* stub here.
  const alertCalls = [];

  const M = {
    state,
    teamAccess: { actor: () => currentActor() },
    swimmerFeedbackCU: {
      evaluateStrokeChallenge: (ath, session, stroke) => { evalCalls.push({ ath, session, stroke }); return evaluate(ath, session, stroke); },
    },
    pushAlerts: { sendCoachAlert: payload => { alertCalls.push(payload); return Promise.resolve({ ok: true }); } },
    toast: msg => toasts.push(msg),
  };
  const E = { Evidence: { stroke: v => v || '' } };

  // Trivial, ubiquitous formatting helpers inlined verbatim from the real source rather than extracted --
  // they carry no gated logic (they're duplicated near-identically across many engine files already) and
  // have no brace body for the extractBlock marker convention to latch onto.
  const text = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const eq = v => String(v || '').split(/[,;]+/).map(text).filter(Boolean);
  const jsonSame = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const U = { seconds: v => { if (typeof v === 'number') return v; const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(String(v || '')); if (m) return Number(m[1]) * 60 + Number(m[2]); return Number(v) || 0; } };
  const sec = v => { if (v === '' || v == null) return 0; const n = U.seconds?.(v); return Number.isFinite(Number(n)) ? Number(n) : Number(v) || 0; };

  let formValues = {};
  const document = { querySelector(sel) { const m = /^#(.+)$/.exec(sel); if (!m) return null; return Object.prototype.hasOwnProperty.call(formValues, m[1]) ? { value: formValues[m[1]] } : null; } };

  const actor = eval(`(${extractBlock(realSource, 'function actor(){')})`);
  const evaluateStroke = eval(`(${extractBlock(realSource, 'function evaluateStroke(ath,session,proposedStroke){')})`);
  const resolveStrokeGate = eval(`(${extractBlock(realSource, 'function resolveStrokeGate(who,ath,session,resolvedStroke,priorStroke){')})`);
  const override = eval(`(${extractBlock(realSource, 'function override(session,item,ath){')})`);
  const upsert = eval(`(${extractBlock(realSource, 'function upsert(session,item,ath,patch,pendingStroke){')})`);
  const formValue = eval(`(${extractBlock(realSource, 'function formValue(id){')})`);
  const close = () => { closeCalls++; };
  const persist = (session, y) => { persistCalls.push({ sessionId: session.id, y }); };
  // Declared before `save` so save()'s real call to notifyPendingStroke(...) resolves via ordinary JS
  // closure scoping -- exactly the same mechanism that already lets save() call override/upsert/close/
  // persist above, none of which are passed in explicitly either.
  const notifyPendingStroke = eval(`(${extractBlock(realSource, 'function notifyPendingStroke(session,ath,pending){')})`);
  const save = eval(`(${extractBlock(realSource, 'function save(session,item,ath,auto,y){')})`);

  return {
    M, state, toasts, evalCalls, alertCalls,
    setActor: fn => { currentActor = fn; },
    setEvaluate: fn => { evaluate = fn; },
    setForm: values => { formValues = values; },
    resolveStrokeGate, evaluateStroke, upsert, save, override, notifyPendingStroke,
    get closeCalls() { return closeCalls; },
    get persistCalls() { return persistCalls; },
  };
}

const OWNER = { role: 'owner', name: 'Andy' };
const ASSISTANT = { role: 'assistant', name: 'Jordan' };

// `tests` is declared fresh inside run() (not at module scope) so that calling run() more than once in the
// same process -- e.g. fail-before/pass-after verification against several scratch copies in one script --
// never accumulates stale closures from an earlier call's source into a later call's pass/fail count.
function run(realSource) {
  const tests = [];
  function test(name, fn) { tests.push({ name, fn }); }
  // --- Group A: resolveStrokeGate / evaluateStroke -- the pure decision ---
  test('A1 owner is never gated, even when evidence would reject', () => {
    const env = buildEnv(realSource, { evaluateImpl: () => ({ approved: false, reason: 'would reject' }) });
    const r = env.resolveStrokeGate(OWNER, { id: 'a1' }, { id: 's1' }, 'Butterfly', 'Freestyle');
    assert.deepEqual(r, { stroke: 'Butterfly', pending: null });
    assert.equal(env.evalCalls.length, 0, 'owner path must not even consult the evidence engine');
  });

  test('A2 assistant re-affirming the stroke already in effect is not gated', () => {
    const env = buildEnv(realSource, { evaluateImpl: () => { throw new Error('must not be called'); } });
    const r = env.resolveStrokeGate(ASSISTANT, { id: 'a1' }, { id: 's1' }, 'Backstroke', 'Backstroke');
    assert.deepEqual(r, { stroke: 'Backstroke', pending: null });
  });

  test('A3 assistant proposing a NEW, evidence-approved stroke applies instantly', () => {
    const env = buildEnv(realSource, { evaluateImpl: () => ({ approved: true, reason: 'Ranked evidence agrees.' }) });
    const r = env.resolveStrokeGate(ASSISTANT, { id: 'a1' }, { id: 's1' }, 'Butterfly', 'Freestyle');
    assert.equal(r.stroke, 'Butterfly');
    assert.equal(r.pending, null);
  });

  test('A4 assistant proposing a NEW, evidence-rejected stroke is flagged, prior stroke kept', () => {
    const env = buildEnv(realSource, { evaluateImpl: () => ({ approved: false, reason: 'Ranked evidence: Freestyle outranks Butterfly.' }) });
    const r = env.resolveStrokeGate(ASSISTANT, { id: 'a1' }, { id: 's1' }, 'Butterfly', 'Freestyle');
    assert.equal(r.stroke, 'Freestyle', 'must keep the existing approved stroke, not the rejected proposal');
    assert.equal(r.pending.stroke, 'Butterfly');
    assert.equal(r.pending.reason, 'Ranked evidence: Freestyle outranks Butterfly.');
    assert.equal(r.pending.proposedBy, ASSISTANT);
  });

  test('A5 assistant proposing a rejected stroke with no prior override leaves stroke unset', () => {
    const env = buildEnv(realSource, { evaluateImpl: () => ({ approved: false, reason: 'no ranked evidence' }) });
    const r = env.resolveStrokeGate(ASSISTANT, { id: 'a1' }, { id: 's1' }, 'Butterfly', null);
    assert.equal(r.stroke, null);
    assert.equal(r.pending.stroke, 'Butterfly');
  });

  test('A6 evaluateStroke fails safe (never silently approves) when evidence engine is missing', () => {
    const env = buildEnv(realSource);
    env.M.swimmerFeedbackCU = {};
    const v = env.evaluateStroke({ id: 'a1' }, { id: 's1' }, 'Butterfly');
    assert.equal(v.approved, false);
  });

  // --- Group B: upsert -- storing a pending proposal without losing anything else ---
  test('B1 empty patch, no pending, no existing row -> no-op', () => {
    const env = buildEnv(realSource);
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1' };
    const r = env.upsert(session, item, ath, {}, null);
    assert.equal(r, null);
    assert.equal(env.state.adaptationOverrides.length, 0);
  });

  test('B2 empty patch, no pending, existing row -> deactivated and pending cleared', () => {
    const env = buildEnv(realSource);
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1' };
    env.state.adaptationOverrides.push({ id: 'mod-1', sessionId: 's1', itemId: 'i1', athleteId: 'a1', patch: { reps: 8 }, active: true, pendingStrokeProposal: { stroke: 'Butterfly' } });
    env.upsert(session, item, ath, {}, null);
    const row = env.state.adaptationOverrides[0];
    assert.equal(row.active, false);
    assert.equal(row.pendingStrokeProposal, null);
  });

  test('B3 non-empty patch, no pending -> row created, pendingStrokeProposal null', () => {
    const env = buildEnv(realSource);
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1' };
    const r = env.upsert(session, item, ath, { reps: 8 }, null);
    assert.equal(r.patch.reps, 8);
    assert.equal(r.pendingStrokeProposal, null);
  });

  test('B4 (the real bug shape) empty patch but a pending stroke proposal must still create/keep the row', () => {
    const env = buildEnv(realSource);
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1' };
    const pending = { stroke: 'Butterfly', reason: 'no ranked evidence', proposedBy: ASSISTANT, proposedAt: 'now' };
    const r = env.upsert(session, item, ath, {}, pending);
    assert.ok(r, 'a stroke-only proposal must not be silently discarded just because no other field changed');
    assert.deepEqual(r.patch, {});
    assert.deepEqual(r.pendingStrokeProposal, pending);
    assert.equal(env.state.adaptationOverrides.length, 1);
  });

  test('B5 a later resolving save clears a stale pending proposal', () => {
    const env = buildEnv(realSource);
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1' };
    env.upsert(session, item, ath, {}, { stroke: 'Butterfly', reason: 'x', proposedBy: ASSISTANT, proposedAt: 'now' });
    env.upsert(session, item, ath, { stroke: 'Butterfly' }, null);
    assert.equal(env.state.adaptationOverrides[0].pendingStrokeProposal, null);
    assert.equal(env.state.adaptationOverrides[0].patch.stroke, 'Butterfly');
  });

  // --- Group C: save() -- the real end-to-end integration point ---
  const AUTO = { reps: 4, distance: 100, stroke: 'Freestyle', cycleSeconds: 90, restSeconds: 15, equipment: [], cues: [] };
  function baseForm() {
    return { modEditReps: '4', modEditDistance: '100', modEditStroke: 'Freestyle', modEditCycle: '1:30', modEditRest: '0:15', modEditEquipment: '', modEditCues: '' };
  }

  test('C1 owner changes stroke freely even against a rejecting evidence mock', () => {
    const env = buildEnv(realSource, { actorImpl: () => OWNER, evaluateImpl: () => ({ approved: false, reason: 'reject' }) });
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1', full_name: 'Test Swimmer' };
    env.setForm({ ...baseForm(), modEditStroke: 'Butterfly' });
    env.save(session, item, ath, AUTO, 0);
    const row = env.state.adaptationOverrides.find(r => r.athleteId === 'a1');
    assert.equal(row.patch.stroke, 'Butterfly');
    assert.equal(row.pendingStrokeProposal, null);
  });

  test('C2 assistant proposes an evidence-approved stroke on a fresh line -> applies instantly', () => {
    const env = buildEnv(realSource, { actorImpl: () => ASSISTANT, evaluateImpl: () => ({ approved: true, reason: 'agrees' }) });
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1', full_name: 'Test Swimmer' };
    env.setForm({ ...baseForm(), modEditStroke: 'Butterfly' });
    env.save(session, item, ath, AUTO, 0);
    const row = env.state.adaptationOverrides.find(r => r.athleteId === 'a1');
    assert.equal(row.patch.stroke, 'Butterfly');
    assert.equal(row.pendingStrokeProposal, null);
    assert.ok(!env.toasts.some(t => /flagged/.test(t)));
  });

  test('C3 assistant proposes an evidence-rejected stroke on a fresh line -> flagged, nothing silently applied', () => {
    const env = buildEnv(realSource, { actorImpl: () => ASSISTANT, evaluateImpl: () => ({ approved: false, reason: 'Ranked evidence: Freestyle outranks Butterfly.' }) });
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1', full_name: 'Test Swimmer' };
    env.setForm({ ...baseForm(), modEditStroke: 'Butterfly' });
    env.save(session, item, ath, AUTO, 0);
    const row = env.state.adaptationOverrides.find(r => r.athleteId === 'a1');
    assert.ok(row, 'the row must still exist so the flag is visible/synced, even though nothing else changed');
    assert.equal(row.patch.stroke, undefined, 'the rejected stroke must never be applied to the live Board');
    assert.equal(row.pendingStrokeProposal.stroke, 'Butterfly');
    assert.ok(env.toasts.some(t => /flagged for Andy/.test(t)));
  });

  test('C4 (critical) a rejected NEW proposal must never overwrite an already-approved stroke', () => {
    const env = buildEnv(realSource, { actorImpl: () => ASSISTANT, evaluateImpl: () => ({ approved: false, reason: 'Ranked evidence: Backstroke outranks Butterfly.' }) });
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1', full_name: 'Test Swimmer' };
    // Backstroke was already approved and applied on an earlier save (owner-set, or a prior approved
    // assistant proposal -- doesn't matter which for this rule).
    env.state.adaptationOverrides.push({ id: 'mod-1', sessionId: 's1', itemId: 'i1', athleteId: 'a1', patch: { stroke: 'Backstroke' }, active: true, pendingStrokeProposal: null, createdAt: 'x', updatedAt: 'x' });
    env.setForm({ ...baseForm(), modEditStroke: 'Butterfly' });
    env.save(session, item, ath, AUTO, 0);
    const row = env.state.adaptationOverrides.find(r => r.athleteId === 'a1');
    assert.equal(row.patch.stroke, 'Backstroke', 'the previously-approved stroke must survive a rejected new proposal');
    assert.equal(row.pendingStrokeProposal.stroke, 'Butterfly');
  });

  test('C5 re-saving unrelated fields does not re-trigger the evidence check', () => {
    const env = buildEnv(realSource, { actorImpl: () => ASSISTANT, evaluateImpl: () => { throw new Error('must not be called'); } });
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1', full_name: 'Test Swimmer' };
    env.state.adaptationOverrides.push({ id: 'mod-1', sessionId: 's1', itemId: 'i1', athleteId: 'a1', patch: { stroke: 'Backstroke' }, active: true, pendingStrokeProposal: null, createdAt: 'x', updatedAt: 'x' });
    // Form reflects the CURRENTLY effective stroke (Backstroke, from the override) and only bumps reps.
    env.setForm({ ...baseForm(), modEditStroke: 'Backstroke', modEditReps: '6' });
    env.save(session, item, ath, AUTO, 0);
    const row = env.state.adaptationOverrides.find(r => r.athleteId === 'a1');
    assert.equal(row.patch.stroke, 'Backstroke');
    assert.equal(row.patch.reps, 6);
  });

  // --- Group D (Phase 5, 10 Sept 2026): notifyPendingStroke -- the alert Andy actually sees off the Board ---
  test('D1 a flagged proposal (C3\'s scenario) sends exactly one coach alert with the right payload', () => {
    const env = buildEnv(realSource, { actorImpl: () => ASSISTANT, evaluateImpl: () => ({ approved: false, reason: 'Ranked evidence: Freestyle outranks Butterfly.' }) });
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1', full_name: 'Test Swimmer' };
    env.setForm({ ...baseForm(), modEditStroke: 'Butterfly' });
    env.save(session, item, ath, AUTO, 0);
    assert.equal(env.alertCalls.length, 1, 'exactly one alert for one flagged proposal');
    const alert = env.alertCalls[0];
    assert.equal(alert.sessionId, 's1');
    assert.equal(alert.athleteId, 'a1');
    assert.equal(alert.kind, 'stroke_proposal');
    assert.match(alert.title, /Test Swimmer/);
    assert.match(alert.body, /Jordan/);
    assert.match(alert.body, /Butterfly/);
    assert.match(alert.body, /Freestyle outranks Butterfly/);
  });

  test('D2 an instantly-approved proposal (C2\'s scenario) never sends an alert', () => {
    const env = buildEnv(realSource, { actorImpl: () => ASSISTANT, evaluateImpl: () => ({ approved: true, reason: 'agrees' }) });
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1', full_name: 'Test Swimmer' };
    env.setForm({ ...baseForm(), modEditStroke: 'Butterfly' });
    env.save(session, item, ath, AUTO, 0);
    assert.equal(env.alertCalls.length, 0, 'nothing was held back for Andy, so nothing should page him');
  });

  test('D3 an owner\'s own change (C1\'s scenario) never sends an alert', () => {
    const env = buildEnv(realSource, { actorImpl: () => OWNER, evaluateImpl: () => ({ approved: false, reason: 'reject' }) });
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1', full_name: 'Test Swimmer' };
    env.setForm({ ...baseForm(), modEditStroke: 'Butterfly' });
    env.save(session, item, ath, AUTO, 0);
    assert.equal(env.alertCalls.length, 0, 'owner edits are never gated, so there is nothing to alert about');
  });

  test('D4 (real historical failure mode) notifyPendingStroke must never throw when M.pushAlerts is entirely absent', () => {
    const env = buildEnv(realSource, { actorImpl: () => ASSISTANT, evaluateImpl: () => ({ approved: false, reason: 'reject' }) });
    env.M.pushAlerts = undefined; // e.g. push-alerts.js failed to load on this device/browser
    const session = { id: 's1' }, item = { id: 'i1' }, ath = { id: 'a1', full_name: 'Test Swimmer' };
    env.setForm({ ...baseForm(), modEditStroke: 'Butterfly' });
    assert.doesNotThrow(() => env.save(session, item, ath, AUTO, 0), 'a missing alert engine must never break the actual save');
    const row = env.state.adaptationOverrides.find(r => r.athleteId === 'a1');
    assert.equal(row.pendingStrokeProposal.stroke, 'Butterfly', 'the flag itself must still be recorded even if paging Andy is unavailable');
  });

  test('D5 notifyPendingStroke called directly builds the expected shape', () => {
    const env = buildEnv(realSource);
    env.notifyPendingStroke({ id: 's9' }, { id: 'a9', full_name: 'Direct Call Swimmer' }, { stroke: 'IM', reason: 'no ranked evidence', proposedBy: { name: 'Jordan' } });
    assert.equal(env.alertCalls.length, 1);
    assert.deepEqual(
      { sessionId: env.alertCalls[0].sessionId, athleteId: env.alertCalls[0].athleteId, kind: env.alertCalls[0].kind },
      { sessionId: 's9', athleteId: 'a9', kind: 'stroke_proposal' },
    );
  });

  let passed = 0;
  for (const t of tests) {
    try { t.fn(); passed++; } catch (e) { console.error(`FAIL: ${t.name}\n  ${e.message}`); }
  }
  return { passed, total: tests.length };
}

function main() {
  const realSource = fs.readFileSync(SRC_PATH, 'utf8');
  const { passed, total } = run(realSource);
  if (passed !== total) {
    console.error(`stroke-gate-modification-edit: ${passed}/${total} passed`);
    process.exit(1);
  }
  console.log(`stroke-gate-modification-edit PASS ${passed}/${total}`);
}

if (require.main === module) main();
module.exports = { extractBlock, buildEnv, run };
