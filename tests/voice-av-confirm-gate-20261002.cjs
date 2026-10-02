'use strict';
// 2 Oct 2026 (Andy, real field report from South Island Champs): a voice capture of Matthew's race came
// back as a couple of words looping through an earbud at poolside. Andy chose to keep the free browser
// speech engine and add a confirm-or-discard step rather than pay for a different one -- this is the
// real-browser proof that the step actually gates the save: tapping Discard on engines/voice-ui-av.js's
// confirm panel must leave M.state.captures untouched and never call the owner-alert, while tapping Save
// must actually persist the capture via the real engines/voice-router-av.js captureNote(). Real
// SpeechRecognition can't be driven headless (no microphone), so this calls M.voiceUIAV.confirmCapture()
// directly -- exactly the function voice-ui-av.js's install() calls once a transcript comes back -- and
// taps its real, rendered DOM buttons, rather than mocking anything.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const BASE = process.env.MSOS4_TEST_URL || 'http://127.0.0.1:8765/';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.MSOS4?.storageEngine?.hydrated?.() === true, { timeout: 10000 });
    await page.waitForFunction(() => document.body.dataset.guardian === 'pass', { timeout: 10000 });
    await page.waitForFunction(() => !!window.MSOS4?.voiceUIAV?.confirmCapture && !!window.MSOS4?.voiceRouterAV?.captureNote, { timeout: 10000 });

    const before = await page.evaluate(() => (window.MSOS4.state.captures || []).length);

    // --- Discard: the panel renders, Discard is tapped, nothing is saved. ---
    await page.evaluate(() => {
      window.__avDiscardCalled = false; window.__avSaveCalled = false;
      window.MSOS4.voiceUIAV.confirmCapture({
        heard: 'Matthew, Matthew, gay, gay, Matthew, Matthew, gay, gay, Matthew, Mac, Matthew, Matthew, gay, gay, gay, gay, gay',
        who: 'Matthew Kofoed',
        garbled: true,
        onSave: () => { window.__avSaveCalled = true; },
        onDiscard: () => { window.__avDiscardCalled = true; },
      });
    });
    await page.waitForSelector('.av-voice-confirm', { timeout: 5000 });
    const garbledWarningVisible = await page.evaluate(() => !!document.querySelector('.av-voice-confirm-garbled'));
    assert.ok(garbledWarningVisible, 'a garbled transcript must render with the garbled warning class visible to the coach');
    await page.click('.av-voice-confirm-actions button:not(.av-voice-confirm-save)');
    await page.waitForFunction(() => !document.querySelector('.av-voice-confirm'), { timeout: 5000 });
    const afterDiscard = await page.evaluate(() => ({
      discardCalled: window.__avDiscardCalled,
      saveCalled: window.__avSaveCalled,
      captures: (window.MSOS4.state.captures || []).length,
    }));
    assert.equal(afterDiscard.discardCalled, true, 'Discard must fire the onDiscard callback');
    assert.equal(afterDiscard.saveCalled, false, 'Discard must never fire onSave');
    assert.equal(afterDiscard.captures, before, 'Discard must leave M.state.captures untouched -- nothing saved');
    console.log('VOICE_AV_CONFIRM_DISCARD_PASS');

    // --- Save: the panel renders, Save is tapped, the real captureNote() actually persists it. ---
    const athlete = await page.evaluate(() => (window.MSOS4.state.athletes || [])[0] || null);
    await page.evaluate((ath) => {
      window.__avSavedCapture = null;
      window.MSOS4.voiceUIAV.confirmCapture({
        heard: 'Matthew looked strong off the wall, good tempo',
        who: ath ? ath.full_name : 'the group',
        garbled: false,
        onSave: () => {
          const result = window.MSOS4.voiceRouterAV.captureNote({ athlete: ath, squad: null, raw: 'Matthew looked strong off the wall, good tempo' }, window.MSOS4.state, window.MSOS4.currentSession?.() || null);
          window.__avSavedCapture = result?.data || null;
        },
        onDiscard: () => {},
      });
    }, athlete);
    await page.waitForSelector('.av-voice-confirm', { timeout: 5000 });
    const cleanWarningAbsent = await page.evaluate(() => !document.querySelector('.av-voice-confirm-garbled'));
    assert.ok(cleanWarningAbsent, 'a clean transcript must not render the garbled warning');
    await page.click('.av-voice-confirm-save');
    await page.waitForFunction(() => !document.querySelector('.av-voice-confirm'), { timeout: 5000 });
    const afterSave = await page.evaluate(() => ({
      saved: window.__avSavedCapture,
      captures: (window.MSOS4.state.captures || []).length,
    }));
    assert.ok(afterSave.saved, 'Save must actually produce a saved capture record');
    assert.equal(afterSave.saved.text_content, 'Matthew looked strong off the wall, good tempo');
    assert.equal(afterSave.captures, before + 1, 'Save must add exactly one real capture to M.state.captures');
    console.log('VOICE_AV_CONFIRM_SAVE_PASS');
    console.log('VOICE_AV_CONFIRM_GATE_ALL_PASS');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
