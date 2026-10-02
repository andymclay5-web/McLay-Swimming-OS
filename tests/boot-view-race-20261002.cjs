'use strict';
// 2 Oct 2026 (full-app audit session): found while investigating why
// tests/training-start-calendar-live-20260907.cjs had started failing intermittently rather than
// consistently. Root cause: engines/navigation.js's N.init() used to decide the cold-boot view via
// normalView(M.state?.settings?.view||'board') -- reading whatever view was last persisted. That read
// races against engines/storage.js's async hydrate(): when a device last closed on a non-Board view
// (e.g. Meet) and reopens, N.init() can run and lock that stale view in via active()/history BEFORE
// hydrate()'s own applyUi() correction has a chance to run -- and applyUi()'s correction only runs
// `if(!live)`, where operationalAlreadyLive() returns true for virtually any real page load the instant
// document.readyState leaves 'loading', i.e. before any deferred script (including this one) executes.
// Previously this was masked for the view==='meet' case specifically because normalView()'s MEET_SHELVED
// branch forced 'meet'->'board' regardless of timing -- a coincidental safety net, not a real fix. With
// Meet now unshelved (26 Sept 2026, Andy's own urgent live request -- see engines/navigation.js's
// MEET_SHELVED comment), that net is gone, and this is a real, user-visible regression against an
// explicit standing product rule (4 Sept 2026: "app must always open on Board, regardless of last-closed
// view"). Measured at ~50-60% failure rate across repeated runs before the fix (genuinely flaky, not a
// one-off), so this test runs the scenario several times rather than once in both directions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { chromium } = require('playwright');
const BASE = process.env.MSOS4_TEST_URL || 'http://127.0.0.1:8765/';
const NAV_PATH = path.join(__dirname, '..', 'engines', 'navigation.js');

async function bootLandsOnBoardAfterSavingMeet() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.MSOS4?.storageEngine?.hydrated?.() === true, { timeout: 10000 });
    await page.waitForFunction(() => document.body.dataset.guardian === 'pass', { timeout: 10000 });
    await page.evaluate(() => {
      MSOS4.state.settings.view = 'meet';
      MSOS4.state.settings.surfaceMode = 'meet';
      MSOS4.store.save(MSOS4.state);
    });
    const rev = await page.evaluate(() => Number(MSOS4.state.settings.storageRevision) || 0);
    await page.evaluate(async r => { if (MSOS4.storageEngine?.whenPersisted) await MSOS4.storageEngine.whenPersisted(r); }, rev);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.MSOS4?.storageEngine?.hydrated?.() === true, { timeout: 10000 });
    await page.waitForFunction(() => document.body.dataset.guardian === 'pass', { timeout: 10000 });
    await page.waitForTimeout(100);
    return await page.evaluate(() => MSOS4.state.settings.view);
  } finally {
    await browser.close();
  }
}

async function runNTimes(n) {
  const views = [];
  for (let i = 0; i < n; i++) views.push(await bootLandsOnBoardAfterSavingMeet());
  return views;
}

function syntaxCheck() {
  execSync(`node --check ${JSON.stringify(NAV_PATH)}`, { stdio: 'pipe' });
}

(async () => {
  const original = fs.readFileSync(NAV_PATH, 'utf8');
  const FIXED_INIT = "const initial='board';M.state.settings.view=initial;";
  const FIXED_MICROTASK = "queueMicrotask(()=>{M.state.settings.view='board';applySurfaceMode(M.state.settings.view);active(M.state.settings.view);saveUi()});";
  assert.ok(original.includes(FIXED_INIT), 'expected navigation.js to currently contain the fixed N.init() cold-boot assignment -- refusing to run against unexpected state');
  assert.ok(original.includes(FIXED_MICROTASK), 'expected navigation.js to currently contain the fixed queueMicrotask body -- refusing to run against unexpected state');

  // Fail-before: restore the exact original racy code (reading the last-saved view through normalView
  // in both places) into the real file, confirm the known flaky failure reproduces at least once across
  // several runs, then restore the fix.
  try {
    const PRE_FIX_INIT = "const initial=normalView(M.state?.settings?.view||'board');M.state.settings.view=initial;";
    const PRE_FIX_MICROTASK = "queueMicrotask(()=>{M.state.settings.view=normalView(M.state.settings.view);applySurfaceMode(M.state.settings.view);active(M.state.settings.view);saveUi()});";
    let reverted = original.replace(FIXED_INIT, PRE_FIX_INIT);
    assert.notStrictEqual(reverted, original, 'fail-before: expected to revert the N.init() assignment');
    reverted = reverted.replace(FIXED_MICROTASK, PRE_FIX_MICROTASK);
    assert.notStrictEqual(reverted.indexOf(PRE_FIX_MICROTASK), -1, 'fail-before: expected to revert the queueMicrotask body');
    fs.writeFileSync(NAV_PATH, reverted);
    syntaxCheck();
    const before = await runNTimes(6);
    console.log('BOOT_VIEW_RACE_FAILBEFORE_RESULTS', JSON.stringify(before));
    assert.ok(before.some(v => v !== 'board'), `fail-before: expected the known race to reproduce at least once in 6 runs against the original code, got all-board: ${JSON.stringify(before)}`);
    console.log('BOOT_VIEW_RACE_FAILBEFORE_PASS');
  } finally {
    fs.writeFileSync(NAV_PATH, original);
    syntaxCheck();
  }

  const after = await runNTimes(6);
  console.log('BOOT_VIEW_RACE_FIXED_RESULTS', JSON.stringify(after));
  assert.ok(after.every(v => v === 'board'), `every one of 6 boots after saving view='meet' must land on 'board'; got ${JSON.stringify(after)}`);
  console.log('BOOT_VIEW_RACE_PASS');
  console.log('BOOT_VIEW_RACE_ALL_PASS');
})().catch(e => { console.error(e.stack || e); process.exit(1); });
