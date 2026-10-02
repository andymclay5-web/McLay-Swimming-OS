'use strict';
// 2 Oct 2026 (Andy, "quality + connectivity" decision, following the South Island Champs field failure):
// this is the real-browser proof that the new record-first voice pipeline actually works end to end --
// not just the orchestration logic covered in tests/voice-av-local-first-pipeline-20261002.cjs. Chromium
// is launched with a fake microphone (no real hardware needed, no real audio content required) so
// engines/voice-router-av.js's startCapture()/stopCapture() exercise the REAL MediaRecorder + M.media
// (IndexedDB) code path, and the transcribe-capture edge function call is intercepted at the network layer
// (no real OpenAI cost, no real Supabase dependency) so both a successful transcription and a dropped
// connection can be proven deterministically.
//
// Proves:
//  1. tapping Talk, waiting, then stopping actually produces a real local recording: a pending record in
//     M.state.pendingVoiceCaptures, with a real non-empty audio blob already durably saved in M.media --
//     BEFORE any network call is made (the "always locally captured first" requirement);
//  2. a network failure during transcription (route.abort) leaves that pending record still queued and
//     visible as a pending-count badge on the sticky Talk button -- nothing is lost;
//  3. once transcription succeeds, the real confirm-or-discard gate still appears (Andy's standing
//     requirement from the South Island Champs report) with the real server transcript, and tapping Save
//     both persists a real capture AND attaches the real recording's media_id to it (so the actual audio,
//     not just the transcript, gets queued for cloud upload via the existing, unmodified C.stageCapture).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const BASE = process.env.MSOS4_TEST_URL || 'http://127.0.0.1:8765/';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await context.grantPermissions(['microphone'], { origin: BASE });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.MSOS4?.storageEngine?.hydrated?.() === true, { timeout: 10000 });
    await page.waitForFunction(() => document.body.dataset.guardian === 'pass', { timeout: 10000 });
    await page.waitForFunction(() => !!window.MSOS4?.voiceRouterAV?.startCapture && !!window.MSOS4?.voiceUIAV?.handleTranscribed, { timeout: 10000 });

    // A real signed-in access token so M.intake.functionUrl()/headers() build a real request (intercepted
    // below) instead of short-circuiting with "Sign in before automatic transcription."
    await page.evaluate(() => localStorage.setItem('mclay_swimming_v1_auth', JSON.stringify({ access_token: 'test-token-av' })));

    assert.ok(await page.evaluate(() => window.MSOS4.voiceRouterAV.browserRecordingAvailable()), 'with --use-fake-device-for-media-stream, MediaRecorder + getUserMedia must report available');

    // --- 1. record -> stop -> a real local pending capture exists with a real non-empty audio blob,
    // durably saved BEFORE any network call. ---
    let transcribeRequests = 0;
    await page.route('**/functions/v1/transcribe-capture', async (route) => { transcribeRequests++; await route.abort('failed'); });

    const recorded = await page.evaluate(() => new Promise((resolve) => {
      window.MSOS4.voiceRouterAV.startCapture({
        onSaved: (rec) => resolve({ ok: true, rec }),
        onError: (err) => resolve({ ok: false, error: err?.message || String(err) }),
      });
      setTimeout(() => window.MSOS4.voiceRouterAV.stopCapture(), 350);
    }));
    assert.equal(recorded.ok, true, `expected a successful local recording, got ${JSON.stringify(recorded)}`);
    assert.equal(transcribeRequests, 0, 'recording and saving locally must never touch the network by itself');

    const blobInfo = await page.evaluate(async (mediaId) => {
      const row = await window.MSOS4.media.get(mediaId);
      return { exists: !!row, size: row?.blob?.size ?? 0, pendingCount: (window.MSOS4.state.pendingVoiceCaptures || []).length };
    }, recorded.rec.mediaId);
    assert.ok(blobInfo.exists, 'the recorded audio must be durably saved in M.media (IndexedDB) before transcription is ever attempted');
    assert.ok(blobInfo.size > 0, `expected a real non-empty audio blob from the fake microphone, got size ${blobInfo.size}`);
    assert.equal(blobInfo.pendingCount, 1, 'the pending-capture queue must contain exactly the one just-recorded item');
    console.log('VOICE_AV_LOCALFIRST_RECORD_PASS');

    // --- 2. a network failure during transcription leaves the recording queued, nothing lost, and the
    // pending badge on the Talk button reflects it. ---
    const afterNetworkFailure = await page.evaluate(async (rec) => {
      const result = await window.MSOS4.voiceRouterAV.attemptTranscription(rec);
      window.MSOS4.voiceUIAV.paintPendingBadge();
      const btn = document.querySelector('[data-sticky-voice]');
      return { ok: result.ok, networkError: result.networkError, status: rec.status, pendingBadge: btn?.dataset.avPending || '', pendingCount: (window.MSOS4.state.pendingVoiceCaptures || []).length };
    }, recorded.rec);
    assert.equal(transcribeRequests, 1, 'the transcription attempt must actually hit the (intercepted) endpoint');
    assert.equal(afterNetworkFailure.ok, false);
    assert.equal(afterNetworkFailure.networkError, true, 'an aborted/failed request must be classified as a network error, not a real failure');
    assert.equal(afterNetworkFailure.status, 'pending', 'a network failure must leave the recording queued for retry, never discarded');
    assert.equal(afterNetworkFailure.pendingCount, 1, 'the recording must still be in the queue after a network failure -- nothing lost');
    assert.equal(afterNetworkFailure.pendingBadge, '1', 'the sticky Talk button must show a pending-count badge so the coach is never left wondering whether a capture is stuck');
    console.log('VOICE_AV_LOCALFIRST_NETWORK_RETAIN_PASS');

    // --- 3. once the connection is back, transcription succeeds, the real confirm-or-discard gate
    // appears with the real server transcript, and Save both persists the note AND attaches the real
    // recording's media_id. ---
    await page.unroute('**/functions/v1/transcribe-capture');
    const HEARD = 'Matthew looked strong off the wall, good tempo through the back half';
    await page.route('**/functions/v1/transcribe-capture', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ raw_text: HEARD, provider: 'openai', model: 'gpt-4o-transcribe' }) }));

    const transcribed = await page.evaluate(async (rec) => {
      const result = await window.MSOS4.voiceRouterAV.attemptTranscription(rec);
      if (result.ok) window.MSOS4.voiceUIAV.handleTranscribed(result);
      return { ok: result.ok, rawText: result.rawText, intent: result.parsed?.intent, mediaId: result.parsed?.mediaId, status: rec.status };
    }, recorded.rec);
    assert.equal(transcribed.ok, true, `expected the retried transcription to succeed, got ${JSON.stringify(transcribed)}`);
    assert.equal(transcribed.rawText, HEARD);
    assert.equal(transcribed.intent, 'capture_note');
    assert.equal(transcribed.mediaId, recorded.rec.mediaId, 'the parsed intent must carry the real recording\'s mediaId through to the confirm gate');
    assert.equal(transcribed.status, 'transcribed', "a successful transcription must mark the pending record 'transcribed', not remove it, until the coach actually taps Save/Discard");

    await page.waitForSelector('.av-voice-confirm', { timeout: 5000 });
    const panelText = await page.evaluate(() => document.querySelector('.av-voice-confirm-text')?.textContent || '');
    assert.ok(panelText.includes(HEARD), `the confirm panel must show the real server transcript, got ${JSON.stringify(panelText)}`);
    const before = await page.evaluate(() => (window.MSOS4.state.captures || []).length);
    await page.click('.av-voice-confirm-save');
    await page.waitForFunction(() => !document.querySelector('.av-voice-confirm'), { timeout: 5000 });
    const after = await page.evaluate((mediaId) => {
      const caps = window.MSOS4.state.captures || [];
      const saved = caps[caps.length - 1];
      return { count: caps.length, textContent: saved?.text_content || '', mediaMatches: saved?.media_id === mediaId };
    }, recorded.rec.mediaId);
    assert.equal(after.count, before + 1, 'Save must persist exactly one new real capture');
    assert.equal(after.textContent, HEARD, 'the saved capture must contain the real server transcript');
    assert.equal(after.mediaMatches, true, "the saved capture's media_id must be the real recording, not just the transcript text");
    const stillPendingAfterSave = await page.evaluate((id) => (window.MSOS4.state.pendingVoiceCaptures || []).some((x) => x.id === id), recorded.rec.id);
    assert.equal(stillPendingAfterSave, false, 'Save must remove the item from the pending queue once it is actually persisted as a capture');
    console.log('VOICE_AV_LOCALFIRST_CONFIRM_SAVE_PASS');
    console.log('VOICE_AV_LOCALFIRST_CAPTURE_ALL_PASS');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
