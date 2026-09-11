'use strict';
// Real coaching failure this fixes (Phase 4, 10 Sept 2026 -- Andy's own words: "proper TV live-times
// broadcast"). Ground truth established via code audit before writing this: engines/live-training-authority.js
// already relayed the session board plus saved results to any tab in 'tv'/'swimmer' view the instant the
// coach saved -- but only via BroadcastChannel, which is same-browser-context only. A TV screen at poolside
// is a separate physical device from the coach's phone, so it never received anything, and separately,
// engines/board.js's renderTV never rendered any time at all (it only ever showed the workout board) --
// fixing the transport alone would have changed nothing visible. This suite covers both halves: the new
// cross-device cloud relay (L.publishCloud/L.pullCloud, reusing L.apply's existing authority/staleness
// gating rather than re-deriving "should I trust this"), and the new liveTimesPanel that actually puts times
// on the TV screen.
//
// House convention: engines/*.js are IIFEs that touch `document`/`window`/`setInterval` and install
// themselves at load, so this test uses the vm.runInNewContext whole-file pattern (see
// tests/team-access-20260911.cjs, tests/meet-sunday-simple-20260829.cjs) rather than extracting individual
// functions -- L.payload/L.apply/L.publishCloud/L.pullCloud all share the same install()-scoped closures
// (sourceAuthority/currentView/clone) and are easiest to exercise together as the real module.
//
// `run(liveSrc, boardSrc)` takes the source text as parameters (rather than hardcoding a read of the real
// files) so fail-before/pass-after verification can pass in scratch copies with an injected historical bug
// in the same process without disturbing the real files on disk.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

function buildLiveEnv(liveSrc, { view = 'board', role = 'owner', cloudReady = true, cloudWritesEnabled = true, canWrite = true } = {}) {
  const fetchCalls = [];
  let fetchImpl = () => Promise.resolve(null);

  const state = {
    settings: { view, activeRole: role, selectedSessionId: '', liveRevision: 0, cloudWritesEnabled },
    canonicalSessions: {},
    attendance: [],
    adaptationOverrides: [],
    timedSets: [],
    trainingTestResults: [],
  };

  const renderCalls = { tv: 0, swimmer: 0 };
  const M = {
    BUILD: 'test-build',
    state,
    util: { now: () => 'now', clone: v => JSON.parse(JSON.stringify(v)) },
    access: { role: () => role, sessionAllowed: () => true },
    live: { channel: null, instanceId: 'device-A', lastPublished: 0 },
    ui: { renderTV: () => { renderCalls.tv++; }, renderSwimmer: () => { renderCalls.swimmer++; } },
    cloud: {
      ready: () => cloudReady,
      org: () => 'org-1',
      fetch: (...args) => { fetchCalls.push(args); return fetchImpl(...args); },
    },
    release: { canWrite: () => canWrite },
  };

  const sandbox = { console };
  sandbox.globalThis = sandbox;
  sandbox.MSOS4 = M;
  sandbox.document = { addEventListener() {} };
  sandbox.setInterval = (fn, ms) => { sandbox.__pollFn = fn; sandbox.__pollMs = ms; return 1; };
  sandbox.clearInterval = () => {};
  vm.createContext(sandbox);
  vm.runInContext(liveSrc, sandbox);

  return {
    M, state, fetchCalls, renderCalls, sandbox,
    setFetchImpl: fn => { fetchImpl = fn; },
    tickPoll: () => sandbox.__pollFn && sandbox.__pollFn(),
  };
}

function buildBoardEnv(boardSrc) {
  const M = {
    state: { athletes: [{ id: 'a1', full_name: 'Matthew Test', squad: 'National' }], timedSets: [], trainingTestResults: [] },
    // U.clock inlined verbatim from app.js (line 23) rather than approximated -- a hand-rolled stub previously
    // disagreed with the real zero-padding rule (e.g. producing "1:1.5" instead of the real "1:01.5"), which
    // would have made this test's expectations diverge from what a coach actually sees on screen.
    util: { escape: v => String(v ?? ''), clock: sec => { sec = Number(sec); if (!Number.isFinite(sec)) return '—'; const m = Math.floor(sec / 60), s = sec - m * 60, dec = Math.abs(s - Math.round(s)) > .000001 ? 2 : 0, txt = s.toFixed(dec); if (!m) return txt; const parts = txt.split('.'), whole = parts[0].padStart(2, '0'); return `${m}:${whole}${parts.length > 1 ? '.' + parts[1] : ''}`; } },
    ui: {},
    boardEngine: {},
  };
  const MSOSEngines = { Coordinator: {}, Modification: {}, Evidence: { stroke: v => v || '' }, RacePace: {} };
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  sandbox.MSOS4 = M;
  sandbox.MSOSEngines = MSOSEngines;
  sandbox.document = { querySelector: () => null };
  sandbox.window = { scrollY: 0 };
  sandbox.requestAnimationFrame = () => {};
  vm.createContext(sandbox);
  vm.runInContext(boardSrc, sandbox);
  return { M, B: M.boardEngine };
}

async function run(liveSrc, boardSrc) {
  const tests = [];
  function test(name, fn) { tests.push({ name, fn }); }

  // --- L.payload / L.apply: timedSets is scoped to the session, same as attendance/adaptationOverrides ---
  test('payload scopes timedSets to the currently selected session', () => {
    const env = buildLiveEnv(liveSrc);
    env.state.settings.selectedSessionId = 's1';
    env.state.timedSets = [
      { id: 't1', session_id: 's1', athlete_id: 'a1' },
      { id: 't2', session_id: 's2', athlete_id: 'a1' },
    ];
    const p = env.M.live.payload(env.state);
    // Array.from rehomes the vm-realm array (built inside the sandboxed source via JSON.parse/.map, both
    // from that realm's own Array constructor) into this host realm before comparing -- Node's assert/strict
    // deepEqual can reject two structurally-identical arrays from different vm realms as "not
    // reference-equal" otherwise (the same cross-realm quirk documented in tests/team-access-20260911.cjs).
    assert.deepEqual(Array.from(p.timedSets.map(x => x.id)), ['t1']);
  });

  test('apply replaces only the incoming session\'s timedSets, leaving other sessions alone', () => {
    const env = buildLiveEnv(liveSrc, { view: 'tv' });
    env.state.timedSets = [
      { id: 'old-1', session_id: 's1', athlete_id: 'a1' },
      { id: 'keep-1', session_id: 'other-session', athlete_id: 'a1' },
    ];
    const msg = { kind: 'v4-live-state', build: 'test-build', from: 'device-B', authority: 'coach-operational', sessionId: 's1', session: { id: 's1' }, timedSets: [{ id: 'new-1', session_id: 's1', athlete_id: 'a2' }], revision: 1 };
    const ok = env.M.live.apply(msg);
    assert.equal(ok, true);
    const ids = Array.from(env.state.timedSets.map(x => x.id)).sort();
    assert.deepEqual(ids, ['keep-1', 'new-1']);
  });

  // --- L.publishCloud: gating ---
  test('publishCloud is a no-op on a derived-display device (view=tv), even with writes enabled', () => {
    const env = buildLiveEnv(liveSrc, { view: 'tv' });
    env.state.settings.selectedSessionId = 's1';
    const r = env.M.live.publishCloud(env.state);
    assert.equal(r, false);
    assert.equal(env.fetchCalls.length, 0);
  });

  test('publishCloud is a no-op when cloud writes are disabled (shadow mode)', () => {
    const env = buildLiveEnv(liveSrc, { view: 'board', cloudWritesEnabled: false });
    env.state.settings.selectedSessionId = 's1';
    const r = env.M.live.publishCloud(env.state);
    assert.equal(r, false);
    assert.equal(env.fetchCalls.length, 0);
  });

  test('publishCloud is a no-op when the release gate refuses production writes', () => {
    const env = buildLiveEnv(liveSrc, { view: 'board', canWrite: false });
    env.state.settings.selectedSessionId = 's1';
    const r = env.M.live.publishCloud(env.state);
    assert.equal(r, false);
    assert.equal(env.fetchCalls.length, 0);
  });

  test('publishCloud is a no-op when the cloud connection is not ready', () => {
    const env = buildLiveEnv(liveSrc, { view: 'board', cloudReady: false });
    env.state.settings.selectedSessionId = 's1';
    const r = env.M.live.publishCloud(env.state);
    assert.equal(r, false);
    assert.equal(env.fetchCalls.length, 0);
  });

  test('publishCloud is a no-op with no session open', () => {
    const env = buildLiveEnv(liveSrc, { view: 'board' });
    const r = env.M.live.publishCloud(env.state);
    assert.equal(r, false);
    assert.equal(env.fetchCalls.length, 0);
  });

  test('publishCloud on a real coach-operational device upserts the live_broadcast row', () => {
    const env = buildLiveEnv(liveSrc, { view: 'board', role: 'owner' });
    env.state.settings.selectedSessionId = 's1';
    const r = env.M.live.publishCloud(env.state);
    assert.equal(r, true);
    assert.equal(env.fetchCalls.length, 1);
    const [urlPath, opts] = env.fetchCalls[0];
    assert.match(urlPath, /^\/rest\/v1\/live_broadcast\?on_conflict=organisation_id,session_id$/);
    assert.equal(opts.method, 'POST');
    const body = JSON.parse(opts.body);
    assert.equal(body.organisation_id, 'org-1');
    assert.equal(body.session_id, 's1');
    assert.equal(body.payload.kind, 'v4-live-state');
    assert.equal(body.from_instance, 'device-A');
  });

  test('publishCloud throttles repeated calls (does not hammer the network on every save)', () => {
    const env = buildLiveEnv(liveSrc, { view: 'board' });
    env.state.settings.selectedSessionId = 's1';
    env.M.live.publishCloud(env.state);
    env.M.live.publishCloud(env.state);
    env.M.live.publishCloud(env.state);
    assert.equal(env.fetchCalls.length, 1, 'a burst of saves must not each fire a cloud write');
  });

  // --- L.pullCloud: gating and self-echo rejection ---
  test('pullCloud is a no-op when the cloud connection is not ready', async () => {
    const env = buildLiveEnv(liveSrc, { view: 'tv', cloudReady: false });
    env.state.settings.selectedSessionId = 's1';
    const r = await env.M.live.pullCloud();
    assert.equal(r, null);
  });

  test('pullCloud is a no-op with no session open', async () => {
    const env = buildLiveEnv(liveSrc, { view: 'tv' });
    const r = await env.M.live.pullCloud();
    assert.equal(r, null);
  });

  test('pullCloud ignores its own device\'s echoed row (never re-applies what it just pushed)', async () => {
    const env = buildLiveEnv(liveSrc, { view: 'tv' });
    env.state.settings.selectedSessionId = 's1';
    env.setFetchImpl(() => Promise.resolve([{ payload: { kind: 'v4-live-state' }, from_instance: 'device-A' }]));
    const r = await env.M.live.pullCloud();
    assert.equal(r, null);
  });

  test('pullCloud applies a real cross-device row through the same L.apply gating', async () => {
    const env = buildLiveEnv(liveSrc, { view: 'tv' });
    env.state.settings.selectedSessionId = 's1';
    const payload = { kind: 'v4-live-state', build: 'test-build', from: 'device-B', authority: 'coach-operational', sessionId: 's1', session: { id: 's1' }, timedSets: [{ id: 'live-1', session_id: 's1', athlete_id: 'a1' }], revision: 5 };
    env.setFetchImpl(() => Promise.resolve([{ payload, from_instance: 'device-B' }]));
    const r = await env.M.live.pullCloud();
    assert.equal(r, true);
    assert.equal(env.renderCalls.tv, 1, 'a successfully applied cross-device row must repaint the TV');
    assert.deepEqual(Array.from(env.state.timedSets.map(x => x.id)), ['live-1']);
  });

  test('pullCloud returns null when no row exists yet for this session', async () => {
    const env = buildLiveEnv(liveSrc, { view: 'tv' });
    env.state.settings.selectedSessionId = 's1';
    env.setFetchImpl(() => Promise.resolve([]));
    const r = await env.M.live.pullCloud();
    assert.equal(r, null);
  });

  // --- The 4s poll timer: only fires the actual pull while view is 'tv' ---
  test('the poll timer skips the network entirely off the tv view', () => {
    const env = buildLiveEnv(liveSrc, { view: 'board' });
    env.state.settings.selectedSessionId = 's1';
    env.tickPoll();
    assert.equal(env.fetchCalls.length, 0);
  });

  test('the poll timer polls while on the tv view', () => {
    const env = buildLiveEnv(liveSrc, { view: 'tv' });
    env.state.settings.selectedSessionId = 's1';
    env.setFetchImpl(() => Promise.resolve([]));
    env.tickPoll();
    assert.equal(env.fetchCalls.length, 1);
  });

  // --- board.js's liveTimesPanel: what actually appears on the TV screen ---
  test('liveTimesPanel renders nothing for a session with no results yet', () => {
    const { B } = buildBoardEnv(boardSrc);
    const html = B.liveTimesPanel({ id: 's1' });
    assert.equal(html, '');
  });

  test('liveTimesRows shows the most recent timed-set finish first, scoped to this session', () => {
    const { M, B } = buildBoardEnv(boardSrc);
    M.state.timedSets = [
      { id: 'ts-old', session_id: 's1', athlete_id: 'a1', distance: 100, stroke: 'Freestyle', best: 62, created_at: '2026-09-10T10:00:00Z' },
      { id: 'ts-new', session_id: 's1', athlete_id: 'a1', distance: 100, stroke: 'Freestyle', best: 60, created_at: '2026-09-10T10:05:00Z' },
      { id: 'ts-other-session', session_id: 's2', athlete_id: 'a1', distance: 100, stroke: 'Freestyle', best: 55, created_at: '2026-09-10T10:06:00Z' },
    ];
    const rows = B.liveTimesRows({ id: 's1' });
    assert.deepEqual(Array.from(rows.map(r => r.id)), ['ts-new', 'ts-old']);
  });

  test('liveTimesPanel shows a swimmer\'s name and best time once a result exists', () => {
    const { M, B } = buildBoardEnv(boardSrc);
    M.state.timedSets = [{ id: 'ts-1', session_id: 's1', athlete_id: 'a1', distance: 100, stroke: 'Freestyle', best: 61.5, created_at: '2026-09-10T10:00:00Z' }];
    const html = B.liveTimesPanel({ id: 's1' });
    assert.match(html, /LIVE TIMES/);
    // board.js's own name() resolves "Matthew" to the "Matt" nickname (a real, pre-existing display rule --
    // see firstDisplay() in engines/board.js) -- asserting the real resolved display name, not the raw
    // full_name, so this test reflects what actually renders rather than a naive expectation.
    assert.match(html, /Matt\b/);
    assert.match(html, /1:01\.5/);
  });

  let ok = 0;
  for (const t of tests) {
    try { await t.fn(); ok++; } catch (e) { console.error(`FAIL: ${t.name}\n  ${e.message}`); }
  }
  return { ok, total: tests.length };
}

async function main() {
  const liveSrc = fs.readFileSync(path.join(__dirname, '..', 'engines', 'live-training-authority.js'), 'utf8');
  const boardSrc = fs.readFileSync(path.join(__dirname, '..', 'engines', 'board.js'), 'utf8');
  const { ok, total } = await run(liveSrc, boardSrc);
  if (ok !== total) {
    console.error(`live-broadcast-tv: ${ok}/${total} passed`);
    process.exit(1);
  }
  console.log(`live-broadcast-tv PASS ${ok}/${total}`);
}

if (require.main === module) main();
module.exports = { run };
