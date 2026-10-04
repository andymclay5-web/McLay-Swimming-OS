'use strict';
// 2 Oct 2026 (Andy, verbatim): "a chat thing within the app where we can communicate to the whole group.
// The assistant coaches communicate to each other or me. A kind of a Slack style communication or
// messenger style communication within there." engines/coach-chat.js (data/realtime) and
// engines/coach-chat-ui.js (panel) are the shipped feature; tests/coach-chat-logic-20261002.cjs already
// proves the pure data/merge/fallback logic against stubbed fetch/timers. This file is the real-browser
// proof that the actual UI wiring in index.html works end to end: tapping the new sticky Chat button opens
// a panel, the channel list shows the whole group plus one row per other coach (from the real
// mclay_chat_roster RPC call shape, intercepted at the network layer -- same technique as the existing
// voice/transcribe tests), composing and sending in both the group channel and a DM actually calls the
// real REST endpoint with the right payload and renders the sent message, and the unread badge on the
// sticky button and on the channel list both update when a new message arrives for a channel the coach
// isn't currently looking at.
//
// Honest, stated limitation this test deliberately leans into rather than papering over: this sandbox's
// own egress proxy denies the jsdelivr/cdnjs/unpkg hosts (confirmed via the proxy's own status endpoint),
// so the @supabase/supabase-js CDN script index.html now loads for true Realtime cannot actually load in
// THIS environment -- window.supabase stays undefined here, exactly as it might for a coach on a real but
// very locked-down network. That means this test is, honestly, proof of the polling-fallback path (the
// same one tests/coach-chat-logic-20261002.cjs exercises with stubbed timers) end to end in a real browser
// with the real UI on top -- not proof that the CDN Realtime path itself renders correctly, which needs
// either a real device outside this sandbox or Andy's own confirmation once a second coach is live.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const BASE = process.env.MSOS4_TEST_URL || 'http://127.0.0.1:8765/';

const ME_ID = '11111111-1111-1111-1111-111111111111';
const JORDAN_ID = '22222222-2222-2222-2222-222222222222';
const ORG_ID = '33333333-3333-3333-3333-333333333333';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();

    const groupRows = [];
    const coachesRows = [];
    const dmRows = [];
    let nextId = 1;
    let rosterRequests = 0;

    await page.route('**/rest/v1/rpc/mclay_chat_roster', async (route) => {
      rosterRequests++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ user_id: JORDAN_ID, display_name: 'Jordan', email: 'jordan@example.com', role: 'coach' }]) });
    });
    await page.route('**/rest/v1/coach_messages**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() === 'GET') {
        // Mirrors the real server-side filter restFilterFor() builds: the group and coaches-only channels
        // are both recipient_id=is.null, disambiguated ONLY by channel=eq.all vs channel=eq.coaches -- a
        // real server would never let a channel=eq.coaches request see an 'all' row or vice versa, so this
        // fixture must not either, or this test would miss a channel-leak bug the same way the sandbox's
        // own earlier RLS audit was written to catch.
        const rows = url.includes('channel=eq.coaches') ? coachesRows : url.includes('recipient_id=is.null') ? groupRows : dmRows;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      }
      if (req.method() === 'POST') {
        const payload = JSON.parse(req.postData() || '{}');
        const row = { id: `srv-${nextId++}`, organisation_id: payload.organisation_id, sender_id: payload.sender_id, sender_name: payload.sender_name, sender_role: payload.sender_role, recipient_id: payload.recipient_id ?? null, recipient_name: payload.recipient_name || '', body: payload.body, channel: payload.channel || 'all', capture_id: payload.capture_id ?? null, created_at: new Date().toISOString() };
        if (row.recipient_id != null) dmRows.push(row);
        else if (row.channel === 'coaches') coachesRows.push(row);
        else groupRows.push(row);
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([row]) });
      }
      return route.continue();
    });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.MSOS4?.storageEngine?.hydrated?.() === true, { timeout: 10000 });
    await page.waitForFunction(() => document.body.dataset.guardian === 'pass', { timeout: 10000 });
    await page.waitForFunction(() => !!window.MSOS4?.coachChat?.connect && !!window.MSOS4?.coachChatUI?.openPanel, { timeout: 10000 });

    const afterLoadSupabase = await page.evaluate(() => typeof window.supabase);
    assert.equal(afterLoadSupabase, 'undefined', 'expected the Supabase Realtime CDN script to be unreachable from this sandbox (its own egress proxy denies jsdelivr) -- if this ever becomes "object", the CDN is reachable here and the realtime path should be re-tested for real instead of relying on the polling-fallback proof below');

    // Stand up a real org + a real signed-in identity the way the real app would have after sign-in, then
    // (re-)connect -- install()'s own first connect() ran before this, with no org/auth yet, and landed on
    // 'idle'; connect() is safe to call again once the identity is actually real.
    await page.evaluate(({ meId, orgId }) => {
      window.MSOS4.state.settings = window.MSOS4.state.settings || {};
      window.MSOS4.state.settings.organisationId = orgId;
      localStorage.setItem(window.MSOS4.AUTH_KEY, JSON.stringify({ access_token: 'test-token-chat', user: { id: meId } }));
    }, { meId: ME_ID, orgId: ORG_ID });
    await page.evaluate(() => window.MSOS4.coachChat.connect());
    await page.waitForFunction(() => window.MSOS4.coachChat.realtimeStatus() === 'polling-only', { timeout: 10000 });
    assert.equal(rosterRequests, 1, 'connect() must load the real coach roster (via mclay_chat_roster) before the panel is ever opened, so the DM channel list is ready the moment the coach taps Chat');

    // --- 1. the sticky Chat button exists, is visible, and opens the panel with the whole-group channel
    // plus one row per real other coach from the roster. ---
    const chatBtn = page.locator('[data-sticky-chat]');
    await assert.doesNotReject(chatBtn.waitFor({ state: 'visible', timeout: 5000 }), 'expected a visible sticky Chat button -- install() must un-hide it');
    await chatBtn.click();
    await page.waitForSelector('[data-chat-channels] [data-chat-channel]');
    const channelLabels = await page.$$eval('[data-chat-channels] .cc-channel-label', (els) => els.map((e) => e.textContent));
    assert.deepEqual(channelLabels, ['Whole group', 'Coaches only', 'Jordan'], 'the channel list must show the whole-group channel, then the coaches-only channel, then one row per real other coach from the roster');
    console.log('COACH_CHAT_UI_PANEL_ROSTER_PASS');

    // --- 2. composing and sending in the group channel actually calls the real REST endpoint and renders
    // the sent message as "mine". ---
    await page.click('[data-chat-channel="group"]');
    await page.waitForSelector('[data-chat-thread] [data-chat-compose]');
    await page.fill('[data-chat-input]', 'Good session today everyone');
    await page.click('[data-chat-compose] button[type=submit]');
    await page.waitForSelector('[data-chat-messages] .cc-msg-mine');
    const sentBody = await page.$eval('[data-chat-messages] .cc-msg-mine .cc-msg-body', (e) => e.textContent);
    assert.equal(sentBody, 'Good session today everyone', 'the sent group message must render in the thread with the real text that was actually POSTed');
    assert.equal(groupRows.length, 1, 'sending must have actually hit the real coach_messages REST endpoint exactly once');
    assert.equal(groupRows[0].sender_id, ME_ID, 'the POSTed row must carry this device\'s real signed-in sender id');
    assert.equal(groupRows[0].recipient_id, null, 'a group-channel send must POST with recipient_id null');
    const inputCleared = await page.$eval('[data-chat-input]', (e) => e.value);
    assert.equal(inputCleared, '', 'the compose box must clear after a successful send');
    console.log('COACH_CHAT_UI_GROUP_SEND_PASS');

    // --- 3. a DM to Jordan POSTs with the real recipient id, independent of the group channel. ---
    await page.click('[data-chat-back]');
    await page.waitForSelector('[data-chat-channels] [data-chat-channel]');
    await page.click(`[data-chat-channel="dm:${JORDAN_ID}"]`);
    await page.waitForSelector('[data-chat-thread] [data-chat-compose]');
    await page.fill('[data-chat-input]', 'Can you cover the 6am squad tomorrow?');
    await page.click('[data-chat-compose] button[type=submit]');
    await page.waitForSelector('[data-chat-messages] .cc-msg-mine');
    assert.equal(dmRows.length, 1, 'a DM send must hit the real endpoint independently of the group channel\'s messages');
    assert.equal(dmRows[0].recipient_id, JORDAN_ID, 'a DM send must POST with the real recipient id, not null');
    assert.equal(groupRows.length, 1, 'sending a DM must never also create a group-channel row');
    console.log('COACH_CHAT_UI_DM_SEND_PASS');

    // --- 4. unread badges: a message that arrives for a channel the coach is not currently looking at
    // must show up both on the sticky button and in the channel list, via the real K.onUpdate wiring. ---
    await page.click('[data-chat-back]');
    await page.waitForSelector('[data-chat-channels] [data-chat-channel]');
    await page.evaluate((jordanId) => {
      window.MSOS4.coachChat._ingestForTest({ id: 'incoming-1', sender_id: jordanId, recipient_id: '11111111-1111-1111-1111-111111111111', sender_name: 'Jordan', body: 'Yep, I can cover it', created_at: new Date().toISOString() });
    }, JORDAN_ID);
    await page.waitForFunction(() => document.querySelector('[data-sticky-chat]')?.dataset.ccUnread === '1');
    const channelBadge = await page.$eval(`[data-chat-channel="dm:${JORDAN_ID}"] .cc-channel-badge`, (e) => e.textContent).catch(() => null);
    assert.equal(channelBadge, '1', 'the Jordan DM row in the channel list must show an unread badge for a message that arrived while the coach was looking at the channel list, not that thread');
    console.log('COACH_CHAT_UI_UNREAD_BADGE_PASS');

    // Opening that thread must clear the badge (markSeen on paint).
    await page.click(`[data-chat-channel="dm:${JORDAN_ID}"]`);
    await page.waitForFunction(() => document.querySelector('[data-sticky-chat]')?.dataset.ccUnread === '');
    console.log('COACH_CHAT_UI_UNREAD_CLEARS_ON_OPEN_PASS');

    // --- 5. the coaches-only channel sends with channel:'coaches' and stays fully separate from the whole
    // -group channel -- the actual point of this channel existing (swimmers can read 'group' once they have
    // real accounts, but must never see a 'coaches' row). ---
    await page.click('[data-chat-back]');
    await page.waitForSelector('[data-chat-channels] [data-chat-channel]');
    await page.click('[data-chat-channel="coaches"]');
    await page.waitForSelector('[data-chat-thread] [data-chat-compose]');
    await page.fill('[data-chat-input]', 'Keep an eye on lane 3 today, assistant only chatter');
    await page.click('[data-chat-compose] button[type=submit]');
    await page.waitForSelector('[data-chat-messages] .cc-msg-mine');
    assert.equal(coachesRows.length, 1, 'sending in the coaches-only channel must hit the real endpoint exactly once');
    assert.equal(coachesRows[0].channel, 'coaches', 'the POSTed row must be stamped channel:"coaches"');
    assert.equal(coachesRows[0].recipient_id, null, 'the coaches-only channel is a broadcast, not a DM, so recipient_id must still be null');
    assert.equal(groupRows.length, 1, 'sending to the coaches-only channel must never also create a whole-group row -- that would defeat the audience separation this channel exists for');
    console.log('COACH_CHAT_UI_COACHES_CHANNEL_SEND_PASS');

    // --- 6. capture attachment: picking a capture from the attach picker sends it as capture_id, and the
    // rendered message shows a tappable attachment line wired through the SAME [data-msos-capture] global
    // click handler engines/capture-ui.js already uses everywhere else in the app (board evidence, loop
    // notes), rather than a second bespoke viewer. ---
    await page.evaluate(() => {
      window.MSOS4.state.captures = window.MSOS4.state.captures || [];
      window.MSOS4.state.captures.push({ id: 'cap-stroke-1', capture_type: 'video', text_content: 'Freestyle catch, lane 3', created_at: new Date().toISOString() });
    });
    await page.click('[data-chat-back]');
    await page.waitForSelector('[data-chat-channels] [data-chat-channel]');
    await page.click('[data-chat-channel="group"]');
    await page.waitForSelector('[data-chat-thread] [data-chat-compose]');
    await page.click('[data-chat-attach]');
    await page.waitForSelector('[data-chat-attach-pick]');
    const pickerLabel = await page.$eval('[data-chat-attach-pick]', (e) => e.textContent);
    assert.ok(/Freestyle catch, lane 3/.test(pickerLabel), 'the attach picker must list the real capture by its own text_content, not a generic placeholder');
    await page.click('[data-chat-attach-pick]');
    await page.waitForSelector('[data-chat-attach-chip]:not([hidden])');
    await page.fill('[data-chat-input]', 'What do you see here?');
    await page.click('[data-chat-compose] button[type=submit]');
    await page.waitForSelector('[data-chat-messages] .cc-msg-mine .cc-msg-attach');
    assert.equal(groupRows[groupRows.length - 1].capture_id, 'cap-stroke-1', 'sending with a capture attached must POST the real capture_id, not drop it');
    const attachBtnCaptureId = await page.$eval('[data-chat-messages] .cc-msg-mine .cc-msg-attach', (e) => e.getAttribute('data-msos-capture'));
    assert.equal(attachBtnCaptureId, 'cap-stroke-1', 'the rendered attachment line must carry data-msos-capture with the real id, so the existing global capture-viewer click handler (engines/capture-ui.js) can open it without any new viewer code');
    const chipClearedAfterSend = await page.$eval('[data-chat-attach-chip]', (e) => e.hidden);
    assert.equal(chipClearedAfterSend, true, 'the pending-attachment chip must clear after a successful send, so the next message is not sent with a stale attachment');
    console.log('COACH_CHAT_UI_CAPTURE_ATTACH_PASS');

    console.log('COACH_CHAT_UI_ALL_PASS');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
