'use strict';
// Phase 5 (10 Sept 2026) -- "remote/off-site monitoring and interaction for Andy," the "add alerts, not
// just a view" option. Real coaching failure this fixes: Andy needs to know when something needs him
// (starting with Jordan proposing a stroke change the evidence gate held back -- see
// tests/stroke-gate-modification-edit-20260910.cjs's new Group D for that wiring) without being physically
// at the pool or happening to reopen the right swimmer's editor. No push/notification mechanism of any
// kind existed anywhere in this app before this (confirmed repo-wide during design).
//
// This suite covers the two new client-side files: engines/push-alerts.js (subscribe/unsubscribe to real
// Web Push, and the one call site -- sendCoachAlert -- that asks the server to record+fan out an alert)
// and sw.js's new push/notificationclick handlers (what actually shows the notification and focuses the
// app when tapped). The server side (supabase/functions/send-coach-alert, supabase/20260910_remote_alerts.sql)
// was verified live against the real Supabase project this session: every RLS policy and query the
// function relies on was exercised for real via Postgres role-simulation (SET LOCAL ROLE authenticated +
// request.jwt.claims, matching exactly what PostgREST does) against scratch data inside a transaction that
// was rolled back, leaving zero residue -- see the Phase 5 commit message and project memory for the full
// list of checks. The deployed Edge Function's live HTTP behavior itself could not be exercised from this
// sandboxed environment (outbound network to *.supabase.co is blocked by this session's own egress policy,
// and no MCP tool exists to invoke a deployed function directly) -- that gap is called out explicitly
// rather than silently skipped.
//
// House convention: engines/*.js are IIFEs that touch `window`/`navigator`/`document` and can't be
// require()'d directly in Node. push-alerts.js shares too many closure-scoped helpers (urlBase64ToUint8Array,
// the VAPID_PUBLIC_KEY constant) across its exported functions to extract individually, so -- matching
// tests/live-broadcast-tv-20260910.cjs's approach for the same reason -- this loads the ENTIRE file into a
// vm-sandboxed context instead. sw.js is loaded the same way, since its handlers are plain top-level
// self.addEventListener(...) registrations.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const PUSH_ALERTS_PATH = path.join(__dirname, '..', 'engines', 'push-alerts.js');
const SW_PATH = path.join(__dirname, '..', 'sw.js');

function buildPushAlertsEnv(src, { supported = true, permission = 'granted', existingSubscription = null } = {}) {
  const fetchCalls = [];
  const saveCalls = [];
  const state = { settings: { organisationId: 'org-1', pushAlertsEnabled: false } };
  const subscribeCalls = [];
  let currentPermission = permission;

  const fakeSubscription = existingSubscription || {
    endpoint: 'https://push.example.invalid/ep-1',
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }; },
    unsubscribe: async () => true,
  };

  const registration = {
    pushManager: {
      _sub: existingSubscription,
      async getSubscription() { return this._sub; },
      async subscribe(opts) { subscribeCalls.push(opts); this._sub = fakeSubscription; return fakeSubscription; },
    },
  };

  const sandbox = {
    console,
    Buffer,
    MSOS4: {
      state,
      store: { save: s => { saveCalls.push(s); } },
      cloud: {
        ready: () => true,
        org: () => state.settings.organisationId,
        user: () => 'user-1',
        fetch: async (pathArg, opts) => { fetchCalls.push({ path: pathArg, opts }); return null; },
      },
    },
  };
  if (supported) {
    sandbox.navigator = { serviceWorker: { ready: Promise.resolve(registration) }, userAgent: 'TestAgent/1.0' };
    sandbox.PushManager = function PushManager() {};
    sandbox.Notification = { permission: currentPermission, requestPermission: async () => currentPermission };
  } else {
    sandbox.navigator = {};
  }
  sandbox.atob = b64 => Buffer.from(b64, 'base64').toString('binary');
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'push-alerts.js' });

  return {
    M: sandbox.MSOS4, P: sandbox.MSOS4.pushAlerts,
    fetchCalls, saveCalls, subscribeCalls,
    setPermission: p => { currentPermission = p; sandbox.Notification.permission = p; sandbox.Notification.requestPermission = async () => p; },
    registration,
  };
}

function run(pushAlertsSrc, swSrc) {
  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });

  // --- supported() / permission() / enabledOnThisDevice() ---
  test('supported() is true when navigator.serviceWorker, PushManager and Notification all exist', () => {
    const env = buildPushAlertsEnv(pushAlertsSrc, { supported: true });
    assert.equal(env.P.supported(), true);
  });
  test('supported() is false on a browser missing PushManager (e.g. no real Web Push support)', () => {
    const env = buildPushAlertsEnv(pushAlertsSrc, { supported: false });
    assert.equal(env.P.supported(), false);
  });
  test('permission() reports "unsupported" rather than throwing when Notification does not exist', () => {
    const env = buildPushAlertsEnv(pushAlertsSrc, { supported: false });
    assert.equal(env.P.permission(), 'unsupported');
  });
  test('enabledOnThisDevice() reflects the persisted settings flag', () => {
    const env = buildPushAlertsEnv(pushAlertsSrc);
    assert.equal(env.P.enabledOnThisDevice(), false);
    env.M.state.settings.pushAlertsEnabled = true;
    assert.equal(env.P.enabledOnThisDevice(), true);
  });

  // --- enable() ---
  test('enable() happy path: subscribes, upserts the subscription row, flips the flag, saves', async () => {
    const env = buildPushAlertsEnv(pushAlertsSrc);
    const ok = await env.P.enable();
    assert.equal(ok, true);
    assert.equal(env.subscribeCalls.length, 1, 'no existing subscription -> must call pushManager.subscribe once');
    assert.equal(env.fetchCalls.length, 1);
    const call = env.fetchCalls[0];
    assert.match(call.path, /^\/rest\/v1\/push_subscriptions\?on_conflict=endpoint$/);
    assert.equal(call.opts.method, 'POST');
    assert.match(call.opts.headers.Prefer, /merge-duplicates/);
    const body = JSON.parse(call.opts.body);
    assert.equal(body.organisation_id, 'org-1');
    assert.equal(body.user_id, 'user-1');
    assert.equal(body.endpoint, 'https://push.example.invalid/ep-1');
    assert.equal(body.p256dh, 'p256dh-value');
    assert.equal(body.auth_key, 'auth-value');
    assert.equal(env.M.state.settings.pushAlertsEnabled, true);
    assert.equal(env.saveCalls.length, 1);
  });

  test('enable() reuses an existing subscription instead of creating a duplicate one', async () => {
    const existing = { endpoint: 'https://push.example.invalid/already-subscribed', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'x', auth: 'y' } }; } };
    const env = buildPushAlertsEnv(pushAlertsSrc, { existingSubscription: existing });
    await env.P.enable();
    assert.equal(env.subscribeCalls.length, 0, 'an existing subscription must be reused, never re-subscribed');
    const body = JSON.parse(env.fetchCalls[0].opts.body);
    assert.equal(body.endpoint, 'https://push.example.invalid/already-subscribed');
  });

  test('enable() throws and touches nothing when the browser does not support push', async () => {
    const env = buildPushAlertsEnv(pushAlertsSrc, { supported: false });
    await assert.rejects(() => env.P.enable(), /does not support/);
    assert.equal(env.fetchCalls.length, 0);
    assert.equal(env.saveCalls.length, 0);
  });

  test('enable() throws and never subscribes when the cloud is not ready', async () => {
    const env = buildPushAlertsEnv(pushAlertsSrc);
    env.M.cloud.ready = () => false;
    await assert.rejects(() => env.P.enable(), /Sign in/);
    assert.equal(env.subscribeCalls.length, 0);
  });

  test('enable() throws when notification permission is denied, without registering a subscription row', async () => {
    const env = buildPushAlertsEnv(pushAlertsSrc);
    env.setPermission('denied');
    await assert.rejects(() => env.P.enable(), /not granted/);
    assert.equal(env.fetchCalls.length, 0);
  });

  // --- disable() ---
  test('disable() flips the flag off, unsubscribes and deletes the server-side row', async () => {
    const env = buildPushAlertsEnv(pushAlertsSrc);
    await env.P.enable();
    env.fetchCalls.length = 0;
    let unsubscribed = false;
    env.registration.pushManager._sub.unsubscribe = async () => { unsubscribed = true; return true; };
    const ok = await env.P.disable();
    assert.equal(ok, true);
    assert.equal(env.M.state.settings.pushAlertsEnabled, false);
    assert.equal(unsubscribed, true);
    assert.equal(env.fetchCalls.length, 1);
    assert.equal(env.fetchCalls[0].opts.method, 'DELETE');
    assert.match(env.fetchCalls[0].path, /push_subscriptions\?endpoint=eq\./);
  });

  test('disable() on an unsupported browser still flips the local flag off without throwing', async () => {
    const env = buildPushAlertsEnv(pushAlertsSrc, { supported: false });
    env.M.state.settings.pushAlertsEnabled = true;
    const ok = await env.P.disable();
    assert.equal(ok, true);
    assert.equal(env.M.state.settings.pushAlertsEnabled, false);
  });

  // --- sendCoachAlert() ---
  test('sendCoachAlert() posts the exact contract send-coach-alert expects', async () => {
    const env = buildPushAlertsEnv(pushAlertsSrc);
    await env.P.sendCoachAlert({ sessionId: 's1', athleteId: 'a1', kind: 'stroke_proposal', title: 'T', body: 'B' });
    assert.equal(env.fetchCalls.length, 1);
    assert.equal(env.fetchCalls[0].path, '/functions/v1/send-coach-alert');
    assert.equal(env.fetchCalls[0].opts.method, 'POST');
    const body = JSON.parse(env.fetchCalls[0].opts.body);
    assert.deepEqual(body, { organisation_id: 'org-1', session_id: 's1', athlete_id: 'a1', kind: 'stroke_proposal', title: 'T', body: 'B' });
  });

  test('sendCoachAlert() returns null (never throws) when the cloud is not ready -- a save must never be blocked by this', async () => {
    const env = buildPushAlertsEnv(pushAlertsSrc);
    env.M.cloud.ready = () => false;
    const r = await env.P.sendCoachAlert({ kind: 'x', title: 'x', body: 'x' });
    assert.equal(r, null);
    assert.equal(env.fetchCalls.length, 0);
  });

  test('sendCoachAlert() rejects a call missing required fields rather than sending a broken alert', async () => {
    const env = buildPushAlertsEnv(pushAlertsSrc);
    await assert.rejects(() => env.P.sendCoachAlert({ kind: 'x' }), /requires kind, title and body/);
  });

  // --- sw.js: push / notificationclick ---
  function buildSwEnv(src) {
    const handlers = {};
    const shown = [];
    const opened = [];
    let focused = 0;
    const clientList = [];
    const self = {
      addEventListener: (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); },
      registration: { showNotification: async (title, opts) => { shown.push({ title, opts }); } },
      clients: {
        matchAll: async () => clientList,
        openWindow: async url => { opened.push(url); },
      },
    };
    const sandbox = { self, console };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(`self.caches=undefined;self.fetch=undefined;\n${src}`, sandbox, { filename: 'sw.js' });
    return { handlers, shown, opened, clientList, self };
  }

  test('sw.js push handler shows a notification built from the real JSON payload', async () => {
    const env = buildSwEnv(swSrc);
    const fns = env.handlers.push;
    assert.ok(fns && fns.length, 'a push listener must be registered');
    const waited = [];
    const evt = { data: { json: () => ({ title: 'Charlotte · stroke change flagged', body: 'Jordan proposed Butterfly — evidence disagreed.', alertId: 'alert-1' }) }, waitUntil: p => waited.push(p) };
    fns[0](evt);
    await Promise.all(waited);
    assert.equal(env.shown.length, 1);
    assert.equal(env.shown[0].title, 'Charlotte · stroke change flagged');
    assert.equal(env.shown[0].opts.body, 'Jordan proposed Butterfly — evidence disagreed.');
    assert.equal(env.shown[0].opts.tag, 'alert-1');
  });

  test('sw.js push handler falls back to a generic notification when the payload is not valid JSON', async () => {
    const env = buildSwEnv(swSrc);
    const waited = [];
    const evt = { data: { json: () => { throw new Error('not json'); }, text: () => 'raw text payload' }, waitUntil: p => waited.push(p) };
    env.handlers.push[0](evt);
    await Promise.all(waited);
    assert.equal(env.shown.length, 1, 'a coach must still see SOMETHING rather than a silently dropped push');
    assert.equal(env.shown[0].opts.body, 'raw text payload');
  });

  test('sw.js notificationclick focuses an already-open window instead of opening a duplicate tab', async () => {
    const env = buildSwEnv(swSrc);
    let closed = false, focused = false;
    env.clientList.push({ focus: () => { focused = true; } });
    const waited = [];
    const evt = { notification: { close: () => { closed = true; } }, waitUntil: p => waited.push(p) };
    env.handlers.notificationclick[0](evt);
    await Promise.all(waited);
    assert.equal(closed, true);
    assert.equal(focused, true);
    assert.equal(env.opened.length, 0, 'must not also open a new window when one is already focusable');
  });

  test('sw.js notificationclick opens the app when no window is currently open', async () => {
    const env = buildSwEnv(swSrc);
    const waited = [];
    const evt = { notification: { close: () => {} }, waitUntil: p => waited.push(p) };
    env.handlers.notificationclick[0](evt);
    await Promise.all(waited);
    assert.equal(env.opened.length, 1);
    assert.match(env.opened[0], /index\.html/);
  });

  let passed = 0;
  const failures = [];
  return (async () => {
    for (const t of tests) {
      try { await t.fn(); passed++; } catch (e) { failures.push({ name: t.name, error: e }); }
    }
    for (const f of failures) console.error(`FAIL: ${f.name}\n  ${f.error.message}`);
    return { passed, total: tests.length };
  })();
}

async function main() {
  const pushAlertsSrc = fs.readFileSync(PUSH_ALERTS_PATH, 'utf8');
  const swSrc = fs.readFileSync(SW_PATH, 'utf8');
  const { passed, total } = await run(pushAlertsSrc, swSrc);
  if (passed !== total) {
    console.error(`remote-alerts-phase5: ${passed}/${total} passed`);
    process.exit(1);
  }
  console.log(`remote-alerts-phase5 PASS ${passed}/${total}`);
}

if (require.main === module) main();
module.exports = { run };
