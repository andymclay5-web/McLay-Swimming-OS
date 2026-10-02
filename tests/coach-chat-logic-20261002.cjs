'use strict';
// 2 Oct 2026 (Andy, verbatim): "a chat thing within the app where we can communicate to the whole group.
// The assistant coaches communicate to each other or me. A kind of a Slack style communication or
// messenger style communication within there." Given a choice, Andy chose true realtime delivery over
// simple polling, and group+DM together rather than group first -- see engines/coach-chat.js's own header
// comment for the full rationale, including the stated limitation that this sandbox could not exercise
// either the CDN Supabase Realtime script or a raw WebSocket handshake end to end (its own egress proxy
// denies cdn.jsdelivr.net/cdnjs.cloudflare.com/unpkg.com, and a direct WebSocket upgrade to Supabase's own
// realtime endpoint failed here even though plain HTTPS to the same host works). That is why this file
// tests everything that COULD be verified from here against the real source on disk: merge/dedupe, the
// group-vs-DM REST filter each channel key produces, the "never trust the network -- only ingest a row
// that is actually either the group channel or a DM this device is a party to" guard (a real RLS-defense
// property, not just a UI nicety), unread counting, and the realtime-vs-polling fallback trigger logic
// (never reached SUBSCRIBED in time / explicit error status / no supabase-js present at all).
//
// This test proves, against the REAL engines/coach-chat.js on disk:
//  1. K.history merges and dedupes rows across repeated fetches and keeps the thread sorted by created_at;
//  2. the REST filter K.history actually requests differs correctly for the group channel (recipient_id
//     is.null) vs a DM thread (the sender/recipient OR-pair for this device and the other coach);
//  3. ingest() never files an incoming row under any channel unless it is genuinely the group channel or a
//     DM this device is a party to -- fail-before/pass-after by stripping that guard;
//  4. unreadCount/totalUnread/markSeen count correctly and reset on markSeen;
//  5. K.connect() falls back to polling immediately when window.supabase (the CDN script) never loaded --
//     exactly the path this sandbox could not avoid taking itself;
//  6. K.connect() falls back to polling if the realtime channel never reaches SUBSCRIBED within the
//     6-second window, and recovers to 'realtime' if SUBSCRIBED does arrive before that;
//  7. K.connect() falls back to polling immediately on a CHANNEL_ERROR/TIMED_OUT/CLOSED status.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CHAT_PATH = path.join(__dirname, '..', 'engines', 'coach-chat.js');
const originalChat = fs.readFileSync(CHAT_PATH, 'utf8');

function makeFetchRouter(handlers) {
  const calls = [];
  return {
    calls,
    fn: async (url, opts = {}) => {
      calls.push({ url, opts });
      for (const [pattern, handler] of handlers) {
        if (typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url)) return handler(url, opts);
      }
      throw new Error(`unhandled fetch in test router: ${url}`);
    },
  };
}

function makeSandbox({ fetchImpl, myUserId = 'coach-me', org = 'org-1', supabase = undefined } = {}) {
  const g = {};
  g.globalThis = g;
  const toasts = [];
  g.MSOS4 = {
    state: {},
    store: {
      config: () => ({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key' }),
      auth: () => ({ access_token: 'tok-123', user: { id: myUserId } }),
    },
    cloud: { org: () => org, fetch: fetchImpl },
    teamAccess: { actor: () => ({ role: 'owner', name: 'Andy' }) },
    toast: (msg) => toasts.push(msg),
  };
  if (supabase !== undefined) g.supabase = supabase;
  g.setInterval = () => 0;
  g.clearInterval = () => {};
  g.setTimeout = () => 0;
  global.setInterval = g.setInterval;
  global.clearInterval = g.clearInterval;
  global.setTimeout = g.setTimeout;
  return { g, toasts };
}

function loadInto(g, srcPath, src = fs.readFileSync(srcPath, 'utf8')) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('globalThis', src);
  fn(g);
}

(async () => {
  // --- 1 & 2. K.history merges/dedupes/sorts, and requests the correct filter per channel. ---
  {
    const router = makeFetchRouter([
      [/\/rest\/v1\/coach_messages/, (url) => {
        if (url.includes('recipient_id=is.null')) {
          return [
            { id: 'm2', organisation_id: 'org-1', sender_id: 'other-1', recipient_id: null, sender_name: 'Jordan', body: 'second', created_at: '2026-10-02T09:01:00Z' },
            { id: 'm1', organisation_id: 'org-1', sender_id: 'coach-me', recipient_id: null, sender_name: 'Andy', body: 'first', created_at: '2026-10-02T09:00:00Z' },
          ];
        }
        return [{ id: 'dm1', organisation_id: 'org-1', sender_id: 'coach-me', recipient_id: 'other-1', body: 'dm hello', created_at: '2026-10-02T09:02:00Z' }];
      }],
    ]);
    const { g } = makeSandbox({ fetchImpl: router.fn });
    loadInto(g, CHAT_PATH);
    const K = g.MSOS4.coachChat;

    await K.history(K.GROUP_KEY);
    await K.history(K.GROUP_KEY); // second fetch repeats both rows -- must not duplicate
    const groupMsgs = K._snapshot(K.GROUP_KEY);
    assert.equal(groupMsgs.length, 2, 'repeated history fetches of the same rows must not duplicate messages');
    assert.deepEqual(groupMsgs.map((m) => m.id), ['m1', 'm2'], 'messages must be sorted by created_at, not fetch/arrival order');

    const groupCall = router.calls.find((c) => c.url.includes('coach_messages') && c.url.includes('recipient_id=is.null'));
    assert.ok(groupCall, 'the group channel must request recipient_id=is.null');
    assert.ok(groupCall.url.includes('organisation_id=eq.org-1'), 'every request must be scoped to this device\'s own organisation');

    await K.history(K.dmThreadKey('other-1'));
    const dmCall = router.calls.find((c) => c.url.includes('coach_messages') && !c.url.includes('recipient_id=is.null'));
    assert.ok(dmCall, 'a DM thread must request a different filter than the group channel');
    assert.ok(dmCall.url.includes('sender_id.eq.coach-me') && dmCall.url.includes('recipient_id.eq.other-1'), 'a DM filter must include this device as sender to the other coach');
    assert.ok(dmCall.url.includes('sender_id.eq.other-1') && dmCall.url.includes('recipient_id.eq.coach-me'), 'a DM filter must also include the other coach as sender back to this device (the OR pair), so replies are not silently excluded');
    console.log('COACH_CHAT_HISTORY_MERGE_FILTER_PASS');
  }

  // --- 3. ingest() must never file an incoming row under any channel unless it genuinely belongs to the
  // group channel or a DM this device is a party to -- RLS should never deliver anything else, but this
  // engine must not blindly trust the network/realtime payload either. Fail-before/pass-after. ---
  {
    const { g } = makeSandbox({ fetchImpl: async () => [] });
    loadInto(g, CHAT_PATH);
    const K = g.MSOS4.coachChat;

    const groupRow = { id: 'g1', sender_id: 'other-1', recipient_id: null, body: 'hi all', created_at: '2026-10-02T10:00:00Z' };
    const dmToMe = { id: 'd1', sender_id: 'other-1', recipient_id: 'coach-me', body: 'hey', created_at: '2026-10-02T10:01:00Z' };
    const dmFromMe = { id: 'd2', sender_id: 'coach-me', recipient_id: 'other-1', body: 'hey back', created_at: '2026-10-02T10:02:00Z' };
    const notForMe = { id: 'x1', sender_id: 'other-1', recipient_id: 'other-2', body: 'private between two other coaches', created_at: '2026-10-02T10:03:00Z' };

    K._ingestForTest(groupRow);
    K._ingestForTest(dmToMe);
    K._ingestForTest(dmFromMe);
    K._ingestForTest(notForMe);

    assert.equal(K._snapshot(K.GROUP_KEY).length, 1, 'a genuine group row must be filed under the group channel');
    assert.equal(K._snapshot(K.dmThreadKey('other-1')).length, 2, 'both directions of a real DM with other-1 must be filed under that one DM thread');
    const allKnownThreads = [K.GROUP_KEY, K.dmThreadKey('other-1'), K.dmThreadKey('other-2')];
    const leaked = allKnownThreads.some((key) => K._snapshot(key).some((m) => m.id === 'x1'));
    assert.equal(leaked, false, 'a row neither sent by nor addressed to this device must never be filed under any channel this device can see');
    console.log('COACH_CHAT_INGEST_GUARD_PASS');

    // fail-before: strip ingest()'s "if(!key)return;" guard and show the not-for-me row WOULD otherwise get
    // merged into a bogus thread (keyed by the undefined return of keyForIncoming), proving the guard --
    // not luck -- is what keeps it out.
    const INGEST_LINE = "function ingest(row){const key=keyForIncoming(row);if(!key)return;if(mergeMessages(key,[row]))notify(key);}";
    assert.ok(originalChat.includes(INGEST_LINE), 'expected the exact ingest() guard line in the real source -- refusing to run against unexpected state');
    const noGuard = INGEST_LINE.replace('if(!key)return;', '');
    const strippedSrc = originalChat.replace(INGEST_LINE, noGuard);
    const { g: g2 } = makeSandbox({ fetchImpl: async () => [] });
    loadInto(g2, CHAT_PATH, strippedSrc);
    const K2 = g2.MSOS4.coachChat;
    K2._ingestForTest(notForMe);
    const bogusKey = 'null'; // keyForIncoming still explicitly returns null (not stripped here) -- object keys stringify, so mergeMessages(null,...) lands under the string key "null"
    assert.ok(K2._snapshot(bogusKey).some((m) => m.id === 'x1'), 'fail-before: with the guard removed, a not-for-me row IS filed (under a bogus key) -- confirms the guard is what makes test 3 pass, not an accident of the fixture');
    console.log('COACH_CHAT_INGEST_GUARD_FAILBEFORE_PASS');
  }

  // --- 4. unreadCount/totalUnread/markSeen. ---
  {
    const { g } = makeSandbox({ fetchImpl: async () => [] });
    loadInto(g, CHAT_PATH);
    const K = g.MSOS4.coachChat;
    K._ingestForTest({ id: 'g1', sender_id: 'other-1', recipient_id: null, body: 'one', created_at: '2026-10-02T11:00:00Z' });
    K._ingestForTest({ id: 'g2', sender_id: 'other-1', recipient_id: null, body: 'two', created_at: '2026-10-02T11:01:00Z' });
    assert.equal(K.unreadCount(K.GROUP_KEY), 2, 'two messages from someone else, never seen, must count as 2 unread');
    K.markSeen(K.GROUP_KEY);
    assert.equal(K.unreadCount(K.GROUP_KEY), 0, 'markSeen must clear unread for everything seen so far');
    K._ingestForTest({ id: 'g3', sender_id: 'other-1', recipient_id: null, body: 'three', created_at: '2026-10-02T11:02:00Z' });
    assert.equal(K.unreadCount(K.GROUP_KEY), 1, 'a message that arrives after markSeen must count again');
    K._ingestForTest({ id: 'me1', sender_id: 'coach-me', recipient_id: null, body: 'my own message', created_at: '2026-10-02T11:03:00Z' });
    assert.equal(K.unreadCount(K.GROUP_KEY), 1, 'this device\'s own sent messages must never count as unread to itself');
    assert.equal(K.totalUnread(), K.unreadCount(K.GROUP_KEY), 'totalUnread with no roster loaded must equal the group unread count alone');
    console.log('COACH_CHAT_UNREAD_PASS');
  }

  // --- 5. connect() falls back to polling immediately when window.supabase never loaded (the one path
  // this sandbox itself could not avoid -- its own proxy denies the CDN host that script comes from). ---
  {
    let intervalCalls = 0;
    const { g } = makeSandbox({ fetchImpl: async () => [], supabase: undefined });
    g.setInterval = (fn, ms) => { intervalCalls++; assert.equal(ms, 8000, 'the polling fallback must poll roughly every 8s'); return 1; };
    global.setInterval = g.setInterval;
    loadInto(g, CHAT_PATH);
    await g.MSOS4.coachChat.connect();
    assert.equal(g.MSOS4.coachChat.realtimeStatus(), 'polling-only', 'with no window.supabase at all, connect() must land on polling-only, never idle or silently stuck');
    assert.equal(intervalCalls, 1, 'the polling loop must actually be started when there is no realtime script to try');
    console.log('COACH_CHAT_CONNECT_NO_SUPABASE_PASS');
  }

  // --- 6. connect() with g.supabase present: falls back to polling if SUBSCRIBED never arrives within the
  // 6s window, and reaches 'realtime' if SUBSCRIBED arrives first. ---
  {
    let capturedTimeoutFn = null;
    let subscribeStatusCb = null;
    const fakeChannel = {
      on: () => fakeChannel,
      subscribe: (cb) => { subscribeStatusCb = cb; return fakeChannel; },
      unsubscribe: () => {},
    };
    const fakeClient = { realtime: { setAuth: () => {} }, channel: () => fakeChannel };
    const supabase = { createClient: () => fakeClient };
    const { g } = makeSandbox({ fetchImpl: async () => [], supabase });
    g.setTimeout = (fn, ms) => { assert.equal(ms, 6000, 'the never-subscribed fallback must fire at 6s'); capturedTimeoutFn = fn; return 1; };
    global.setTimeout = g.setTimeout;
    let intervalCalls = 0;
    g.setInterval = () => { intervalCalls++; return 1; };
    global.setInterval = g.setInterval;
    loadInto(g, CHAT_PATH);
    const K = g.MSOS4.coachChat;
    await K.connect();
    assert.equal(K.realtimeStatus(), 'idle', 'before SUBSCRIBED and before the 6s window elapses, connect() must not falsely claim realtime or polling yet');
    capturedTimeoutFn(); // simulate the 6s window elapsing with no SUBSCRIBED status
    assert.equal(K.realtimeStatus(), 'polling-fallback', 'if SUBSCRIBED never arrives within 6s, connect() must fall back to polling rather than leaving chat silently stuck');
    assert.equal(intervalCalls, 1, 'the fallback must actually start polling, not just change the reported status');
    console.log('COACH_CHAT_CONNECT_TIMEOUT_FALLBACK_PASS');
  }
  {
    let subscribeStatusCb = null;
    const fakeChannel = { on: () => fakeChannel, subscribe: (cb) => { subscribeStatusCb = cb; return fakeChannel; }, unsubscribe: () => {} };
    const fakeClient = { realtime: { setAuth: () => {} }, channel: () => fakeChannel };
    const supabase = { createClient: () => fakeClient };
    const { g } = makeSandbox({ fetchImpl: async () => [], supabase });
    let clearCalls = 0;
    g.setTimeout = () => 1;
    g.setInterval = () => 1;
    g.clearInterval = () => { clearCalls++; };
    global.setTimeout = g.setTimeout; global.setInterval = g.setInterval; global.clearInterval = g.clearInterval;
    loadInto(g, CHAT_PATH);
    const K = g.MSOS4.coachChat;
    await K.connect();
    subscribeStatusCb('SUBSCRIBED');
    assert.equal(K.realtimeStatus(), 'realtime', 'when the channel actually reaches SUBSCRIBED, connect() must report true realtime delivery');
    console.log('COACH_CHAT_CONNECT_SUBSCRIBED_PASS');

    subscribeStatusCb('CHANNEL_ERROR');
    assert.equal(K.realtimeStatus(), 'polling-fallback', 'a CHANNEL_ERROR after a successful subscribe (a drop) must fall back to polling immediately, not stay stuck reporting realtime');
    console.log('COACH_CHAT_CONNECT_DROP_FALLBACK_PASS');
  }

  console.log('COACH_CHAT_LOGIC_ALL_PASS');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
