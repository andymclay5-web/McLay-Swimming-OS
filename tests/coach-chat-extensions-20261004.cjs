'use strict';
// 4 Oct 2026 (Andy, verbatim): "we need to be able to say send to the whole team, including swimmers, the
// whole group coaching group. Or an individual coach. And you also need to be able to add captures to that
// so like add a video." The concrete motivating scenario: a home-based coach asks a club coach "what do you
// see?" about a swimmer's stroke, attaching the actual video right there rather than switching apps.
//
// This builds directly on the 2026-10-03 migration (20261003_swimmer_accounts_and_chat_extensions.sql),
// which added coach_messages.channel ('all'|'coaches', default 'all') and coach_messages.capture_id. The
// EXISTING "whole group" channel becomes "whole team including swimmers" automatically the moment a swimmer
// has a real account, because it was always built on the broad is_org_member() -- no code change needed
// there. What genuinely needed new engine code is the OPPOSITE: a second, coaches-only channel that
// explicitly excludes swimmers (since "the whole coaching group" and "whole team" are now two different
// audiences), plus wiring a capture_id through send/ingest.
//
// This test proves, against the REAL engines/coach-chat.js on disk:
//  1. restFilterFor requests channel=eq.all for the group channel and channel=eq.coaches for the new
//     coaches-only channel -- two different server-side queries, not just a client-side label;
//  2. K.send() stamps channel:'coaches' on a message sent to the coaches channel, channel:'all' on one sent
//     to the group channel, and passes a capture_id through to the POST payload when attached (and null
//     when not);
//  3. keyForIncoming() routes an incoming broadcast row to the coaches-only thread when row.channel is
//     'coaches', and to the group thread when it is 'all' (or absent, for any pre-migration row) --
//     fail-before/pass-after: without the channel check, a coaches-only broadcast would leak into the
//     group thread that swimmers can also see, defeating the entire point of a coaches-only channel;
//  4. K.totalUnread() includes the coaches-only channel's unread count, not just the group channel's.
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

function makeSandbox({ fetchImpl, myUserId = 'coach-me', org = 'org-1' } = {}) {
  const g = {};
  g.globalThis = g;
  g.MSOS4 = {
    state: {},
    store: {
      config: () => ({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key' }),
      auth: () => ({ access_token: 'tok-123', user: { id: myUserId } }),
    },
    cloud: { org: () => org, fetch: fetchImpl },
    teamAccess: { actor: () => ({ role: 'owner', name: 'Andy' }) },
    toast: () => {},
  };
  g.setInterval = () => 0;
  g.clearInterval = () => {};
  g.setTimeout = () => 0;
  global.setInterval = g.setInterval;
  global.clearInterval = g.clearInterval;
  global.setTimeout = g.setTimeout;
  return { g };
}

function loadInto(g, srcPath, src = fs.readFileSync(srcPath, 'utf8')) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('globalThis', src);
  fn(g);
}

(async () => {
  // --- 1. restFilterFor: group vs coaches-only request different server-side filters. ---
  {
    const router = makeFetchRouter([[/\/rest\/v1\/coach_messages/, () => []]]);
    const { g } = makeSandbox({ fetchImpl: router.fn });
    loadInto(g, CHAT_PATH);
    const K = g.MSOS4.coachChat;
    assert.ok(K.COACHES_KEY, 'K.COACHES_KEY must be exported so UI code can reference the coaches-only channel');

    await K.history(K.GROUP_KEY);
    await K.history(K.COACHES_KEY);
    const groupCall = router.calls.find((c) => c.url.includes('recipient_id=is.null') && c.url.includes('channel=eq.all'));
    const coachesCall = router.calls.find((c) => c.url.includes('recipient_id=is.null') && c.url.includes('channel=eq.coaches'));
    assert.ok(groupCall, 'the group channel must request channel=eq.all so swimmer-group rows and coaches-only rows are never mixed server-side');
    assert.ok(coachesCall, 'the coaches-only channel must request channel=eq.coaches');
    assert.notEqual(groupCall.url, coachesCall.url, 'the two channels must produce genuinely different REST queries');
    console.log('COACH_CHAT_EXT_FILTER_PASS');
  }

  // --- 2. K.send: channel + capture_id stamped correctly on the outgoing payload. ---
  {
    const router = makeFetchRouter([[/\/rest\/v1\/coach_messages/, (url, opts) => {
      const body = JSON.parse(opts.body);
      return [{ id: 'saved-1', ...body, created_at: '2026-10-04T09:00:00Z' }];
    }]]);
    const { g } = makeSandbox({ fetchImpl: router.fn });
    loadInto(g, CHAT_PATH);
    const K = g.MSOS4.coachChat;

    await K.send(K.GROUP_KEY, 'hello team');
    let payload = JSON.parse(router.calls[router.calls.length - 1].opts.body);
    assert.equal(payload.channel, 'all', 'a message sent to the group channel must be stamped channel:"all"');
    assert.equal(payload.capture_id, null, 'with no attachment chosen, capture_id must be explicitly null, not omitted or undefined (the DB column is NOT NULL-free but the RLS check expects a real null)');

    await K.send(K.COACHES_KEY, 'coaches eyes only');
    payload = JSON.parse(router.calls[router.calls.length - 1].opts.body);
    assert.equal(payload.channel, 'coaches', 'a message sent to the coaches-only channel must be stamped channel:"coaches", never "all" (that would leak it to swimmers)');

    await K.send(K.GROUP_KEY, 'check this stroke', { captureId: 'cap-123' });
    payload = JSON.parse(router.calls[router.calls.length - 1].opts.body);
    assert.equal(payload.capture_id, 'cap-123', 'an attached capture id must be passed through verbatim to the POST payload');
    console.log('COACH_CHAT_EXT_SEND_PASS');
  }

  // --- 3. keyForIncoming: a coaches-only broadcast must route to the coaches-only thread, not the group
  // thread a swimmer can also see. Fail-before/pass-after against the real source. ---
  {
    const { g } = makeSandbox({ fetchImpl: async () => [] });
    loadInto(g, CHAT_PATH);
    const K = g.MSOS4.coachChat;

    const groupRow = { id: 'g1', sender_id: 'other-1', recipient_id: null, channel: 'all', body: 'hi team', created_at: '2026-10-04T10:00:00Z' };
    const coachesRow = { id: 'c1', sender_id: 'other-1', recipient_id: null, channel: 'coaches', body: 'coach-only note', created_at: '2026-10-04T10:01:00Z' };
    const legacyRow = { id: 'l1', sender_id: 'other-1', recipient_id: null, body: 'pre-migration row, no channel column yet', created_at: '2026-10-04T10:02:00Z' };

    K._ingestForTest(groupRow);
    K._ingestForTest(coachesRow);
    K._ingestForTest(legacyRow);

    assert.deepEqual(K._snapshot(K.GROUP_KEY).map((m) => m.id), ['g1', 'l1'], 'the group thread must contain the "all" row and the legacy (channel-less) row, and nothing from the coaches-only channel');
    assert.deepEqual(K._snapshot(K.COACHES_KEY).map((m) => m.id), ['c1'], 'the coaches-only thread must contain only the coaches-only row');
    console.log('COACH_CHAT_EXT_ROUTING_PASS');

    // fail-before: without the row.channel==='coaches' branch, EVERY recipient_id-null row (including a
    // genuine coaches-only broadcast) falls back to GROUP_KEY -- exactly the leak a coaches-only channel
    // exists to prevent, since the group thread's RLS deliberately includes swimmers.
    const ROUTING_LINE = "if(row.recipient_id==null)return row.channel==='coaches'?COACHES_KEY:GROUP_KEY;";
    assert.ok(originalChat.includes(ROUTING_LINE), 'expected the exact channel-routing line in the real source -- refusing to run against unexpected state');
    const collapsedSrc = originalChat.replace(ROUTING_LINE, "if(row.recipient_id==null)return GROUP_KEY;");
    const { g: g2 } = makeSandbox({ fetchImpl: async () => [] });
    loadInto(g2, CHAT_PATH, collapsedSrc);
    const K2 = g2.MSOS4.coachChat;
    K2._ingestForTest(coachesRow);
    assert.ok(K2._snapshot(K2.GROUP_KEY).some((m) => m.id === 'c1'), 'fail-before: with the channel check removed, a coaches-only broadcast IS filed under the group thread -- confirms the check in test 3 is what prevents the leak, not an accident of the fixture');
    console.log('COACH_CHAT_EXT_ROUTING_FAILBEFORE_PASS');
  }

  // --- 4. totalUnread must include the coaches-only channel. ---
  {
    const { g } = makeSandbox({ fetchImpl: async () => [] });
    loadInto(g, CHAT_PATH);
    const K = g.MSOS4.coachChat;
    K._ingestForTest({ id: 'g1', sender_id: 'other-1', recipient_id: null, channel: 'all', body: 'one', created_at: '2026-10-04T11:00:00Z' });
    K._ingestForTest({ id: 'c1', sender_id: 'other-1', recipient_id: null, channel: 'coaches', body: 'two', created_at: '2026-10-04T11:01:00Z' });
    K._ingestForTest({ id: 'c2', sender_id: 'other-1', recipient_id: null, channel: 'coaches', body: 'three', created_at: '2026-10-04T11:02:00Z' });
    assert.equal(K.unreadCount(K.GROUP_KEY), 1, 'sanity: group unread alone is 1');
    assert.equal(K.unreadCount(K.COACHES_KEY), 2, 'sanity: coaches-only unread alone is 2');
    assert.equal(K.totalUnread(), 3, 'totalUnread must add the coaches-only channel\'s unread count, not just the group channel\'s -- otherwise the sticky badge would silently under-report unread coaches-only messages');
    console.log('COACH_CHAT_EXT_UNREAD_PASS');
  }

  console.log('COACH_CHAT_EXTENSIONS_ALL_PASS');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
