'use strict';
// 2 Oct 2026 (Andy, after choosing to stay on the free confirm-gated engine, then reversing that call once
// given real OpenAI pricing): "if it's going to be much better quality, then we probably just need to run
// with that... I just need to know that any coach can just talk to it and it's going to transcribe...
// also the other thing I'm aware of is okay if we're doing that if we're in a swimming pool where the
// internet connection's dodgy at best it needs to always make sure that it's locally captured because
// yeah I had issues with internet connection over the weekend being in the swimming pool environment
// wi-fi access is poor at best so mobile data and then mobile data crashing because of the concrete."
//
// This replaces the free live-browser-SpeechRecognition engine with: record real audio locally first
// (engines/voice-router-av.js's savePendingCapture -> M.media, durable IndexedDB), THEN send it to the
// existing transcribe-capture edge function's 'transcribe_direct' action (the same one session-dictation
// already uses, via M.intake.functionUrl/headers -- zero app.js edits). A bespoke small pending queue
// (M.state.pendingVoiceCaptures) tracks each recording through pending -> transcribed -> gone (Saved or
// Discarded), deliberately NOT routed through the generic C.queue/C.flush (which silently drops any
// table/action shape it doesn't recognise -- see C.flush's job loop in app.js).
//
// This test proves, against the REAL engines/voice-router-av.js on disk:
//  1. a successful transcription leaves the pending record as 'transcribed' (not yet removed -- so a
//     coach who navigates away before Saving/Discarding doesn't silently lose the capture) and the
//     resulting parsed intent carries parsed.mediaId (so captureNote can attach the real recording);
//  2. the parsed context reflects the moment the coach actually spoke (pending.createdAt), not whenever a
//     delayed retry happens to complete -- a real correctness requirement given Andy's own "dodgy
//     connection" report, fail-before/pass-after by stubbing C.now to tell the two apart;
//  3. a network failure (M.cloud.networkError) leaves the pending record at status 'pending' and keeps it
//     in the queue -- never discarded, never marked failed;
//  4. a real (non-network) failure marks the pending record 'failed' with the error message, still kept;
//  5. retryPendingVoiceCaptures only touches 'pending' items, fires V.onTranscribed on each success, and
//     stops at the first network failure in the sweep -- mirroring C.flush's own "stop on first network
//     error" discipline -- fail-before/pass-after by stripping that break;
//  6. captureNote attaches parsed.mediaId onto the saved capture as media_id (so the existing, unmodified
//     C.stageCapture in app.js queues the real audio for cloud upload too) -- fail-before/pass-after by
//     stripping that line from the real source.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROUTER_PATH = path.join(__dirname, '..', 'engines', 'voice-router-av.js');
const CONTEXT_PATH = path.join(__dirname, '..', 'engines', 'context-engine-av.js');
const originalRouter = fs.readFileSync(ROUTER_PATH, 'utf8');

function makeMedia() {
  const blobs = new Map();
  let n = 0;
  return {
    blobs,
    save: async (blob, meta = {}) => { const id = `media-${++n}`; blobs.set(id, { id, blob, meta }); return id; },
    get: async (id) => blobs.get(id) || null,
  };
}

function makeSandbox({ athletes = [], present = [], fetchImpl } = {}) {
  const saves = [];
  const g = {};
  g.globalThis = g;
  const state = { athletes, captures: [], contextAnchors: [], settings: {}, pendingVoiceCaptures: [] };
  const media = makeMedia();
  g.MSOS4 = {
    state,
    currentSession: () => null,
    util: { uid: (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`, clock: (s) => String(s) },
    ui: { presentAthletes: () => present },
    access: { role: () => 'owner' },
    store: { save: (s) => saves.push(s), auth: () => ({ access_token: 'tok-123' }) },
    cloud: { ready: () => true, stageCapture: (cap) => saves.push({ staged: cap }), networkError: (e) => e instanceof TypeError || /failed to fetch|networkerror|network request failed/i.test(String(e?.message || e)) },
    intake: { functionUrl: () => 'https://example.supabase.co/functions/v1/transcribe-capture', headers: () => ({ apikey: 'anon', Authorization: 'Bearer tok-123' }) },
    media,
    pushAlerts: { sendCoachAlert: () => Promise.resolve(null) },
  };
  g.MSOSEngines = { RacePace: {}, Coordinator: {}, Evidence: {} };
  g.fetch = fetchImpl;
  g.addEventListener = () => {}; // this sandbox never fires 'online'; retry is driven explicitly by the test
  // transcribeVoiceNote() calls bare fetch(), a free variable resolved at CALL time (not load time) via
  // Node's real global scope -- so global.fetch must still be set to this sandbox's fetchImpl whenever
  // attemptTranscription actually runs later, not just during the synchronous module-load window.
  global.fetch = fetchImpl;
  return { g, saves, state, media };
}

function loadInto(g, srcPath, src = fs.readFileSync(srcPath, 'utf8')) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('globalThis', src);
  fn(g);
}

function networkErr() { return new TypeError('Failed to fetch'); }

(async () => {
  // --- 1 & 2. success path: status becomes 'transcribed' (not removed), mediaId carried, context pinned
  // to record-time rather than call-time. ---
  {
    let fetchCalls = 0;
    const { g, state, media } = makeSandbox({
      fetchImpl: async () => { fetchCalls++; return { ok: true, json: async () => ({ raw_text: 'Matthew looked strong off the wall' }) }; },
    });
    loadInto(g, CONTEXT_PATH);
    loadInto(g, ROUTER_PATH);
    const V = g.MSOS4.voiceRouterAV, C = g.MSOS4.contextEngineAV;

    // pin C.now so record-time and call-time context are distinguishably different, and capture what
    // `now` argument attemptTranscription actually passed it with.
    const nowCalls = [];
    C.now = (session, now) => { nowCalls.push(now ? now.toISOString() : 'LIVE'); return { status: 'active', blockLabel: now && now.getTime() < Date.now() - 50000 ? 'RECORD-TIME-BLOCK' : 'CALL-TIME-BLOCK' }; };

    const blob = new Blob(['fake-audio-bytes'], { type: 'audio/webm' });
    const recordedAt = new Date(Date.now() - 120000); // recorded two minutes "ago"
    const mediaId = await media.save(blob, { type: 'voice_capture_av' });
    const pending = { id: 'voice-pending-1', mediaId, status: 'pending', attempts: 0, error: '', rawText: '', createdAt: recordedAt.toISOString() };
    state.pendingVoiceCaptures.push(pending);

    const result = await V.attemptTranscription(pending);
    assert.equal(fetchCalls, 1, 'attemptTranscription must call the transcribe endpoint exactly once');
    assert.equal(result.ok, true, `expected success, got ${JSON.stringify(result)}`);
    assert.equal(pending.status, 'transcribed', "a successful transcription must mark the pending record 'transcribed', not remove it -- it still needs the coach's Save/Discard");
    assert.equal(state.pendingVoiceCaptures.length, 1, 'the pending record must still be in the queue until resolvePending() is called');
    assert.equal(result.parsed.mediaId, mediaId, 'the parsed intent must carry the real mediaId so captureNote can attach the recording');
    assert.ok(nowCalls.some((v) => v !== 'LIVE'), 'attemptTranscription must pass an explicit historical `now` to C.now, not rely on the live default');
    assert.equal(result.parsed.context.blockLabel, 'RECORD-TIME-BLOCK', "the parsed context must reflect the moment the coach actually spoke (pending.createdAt), not whenever the (possibly delayed) transcription call happens to complete");
    console.log('VOICE_AV_PIPELINE_SUCCESS_CONTEXT_PASS');
  }

  // --- 3. network failure: pending record stays, status 'pending', kept in queue. ---
  {
    const { g, state, media } = makeSandbox({ fetchImpl: async () => { throw networkErr(); } });
    loadInto(g, CONTEXT_PATH);
    loadInto(g, ROUTER_PATH);
    const V = g.MSOS4.voiceRouterAV;
    const blob = new Blob(['x'], { type: 'audio/webm' });
    const mediaId = await media.save(blob, {});
    const pending = { id: 'p1', mediaId, status: 'pending', attempts: 0, error: '', rawText: '', createdAt: new Date().toISOString() };
    state.pendingVoiceCaptures.push(pending);
    const result = await V.attemptTranscription(pending);
    assert.equal(result.ok, false);
    assert.equal(result.networkError, true, 'a TypeError/failed-to-fetch must be classified as a network error via the existing M.cloud.networkError');
    assert.equal(pending.status, 'pending', 'a network failure must leave the recording queued for a later retry, never discarded');
    assert.equal(state.pendingVoiceCaptures.length, 1, 'a network failure must never remove the pending record -- that would lose the recording');
    console.log('VOICE_AV_PIPELINE_NETWORK_RETAIN_PASS');
  }

  // --- 4. real failure: pending record marked 'failed' with the error message, still kept (never lost). ---
  {
    const { g, state, media } = makeSandbox({ fetchImpl: async () => ({ ok: false, status: 422, json: async () => ({ error: 'The recording is empty or too short to transcribe.' }) }) });
    loadInto(g, CONTEXT_PATH);
    loadInto(g, ROUTER_PATH);
    const V = g.MSOS4.voiceRouterAV;
    const blob = new Blob(['x'], { type: 'audio/webm' });
    const mediaId = await media.save(blob, {});
    const pending = { id: 'p2', mediaId, status: 'pending', attempts: 0, error: '', rawText: '', createdAt: new Date().toISOString() };
    state.pendingVoiceCaptures.push(pending);
    const result = await V.attemptTranscription(pending);
    assert.equal(result.ok, false);
    assert.equal(result.networkError, false, 'a real server-side rejection must not be classified as a network error');
    assert.equal(pending.status, 'failed');
    assert.match(pending.error, /too short/);
    assert.equal(state.pendingVoiceCaptures.length, 1, 'a real failure must still keep the recording queued (for a manual retry), never silently drop it');
    console.log('VOICE_AV_PIPELINE_REAL_FAILURE_PASS');
  }

  // --- 5. retryPendingVoiceCaptures: only 'pending' items, fires V.onTranscribed on success, stops at the
  // first network failure in the sweep (same discipline as C.flush's own job loop). ---
  {
    let callCount = 0;
    const { g, state, media } = makeSandbox({
      fetchImpl: async () => {
        callCount++;
        if (callCount === 1) throw networkErr(); // first item: offline
        return { ok: true, json: async () => ({ raw_text: 'second item transcript' }) }; // second would succeed
      },
    });
    loadInto(g, CONTEXT_PATH);
    loadInto(g, ROUTER_PATH);
    const V = g.MSOS4.voiceRouterAV;
    const transcribed = [];
    V.onTranscribed = (r) => transcribed.push(r);
    const blobA = new Blob(['a'], {}), blobB = new Blob(['b'], {});
    const idA = await media.save(blobA, {}), idB = await media.save(blobB, {});
    state.pendingVoiceCaptures.push(
      { id: 'pA', mediaId: idA, status: 'pending', attempts: 0, error: '', rawText: '', createdAt: new Date().toISOString() },
      { id: 'pB', mediaId: idB, status: 'pending', attempts: 0, error: '', rawText: '', createdAt: new Date().toISOString() },
      { id: 'pC', mediaId: idA, status: 'failed', attempts: 1, error: 'boom', rawText: '', createdAt: new Date().toISOString() },
      { id: 'pD', mediaId: idA, status: 'transcribed', attempts: 1, error: '', rawText: 'already back', createdAt: new Date().toISOString() },
    );
    await V.retryPendingVoiceCaptures();
    assert.equal(callCount, 1, 'the sweep must stop after the first network failure, never spending a retry attempt on items behind it in the same pass (fetch must not be called for pB)');
    assert.equal(transcribed.length, 0, 'onTranscribed must not fire when nothing in this sweep actually succeeded');
    assert.equal(state.pendingVoiceCaptures.find((x) => x.id === 'pC').status, 'failed', "retryPendingVoiceCaptures must never touch a 'failed' item automatically -- that is manual-retry only, to avoid repeatedly paying for an unrecoverable error");
    assert.equal(state.pendingVoiceCaptures.find((x) => x.id === 'pD').status, 'transcribed', "retryPendingVoiceCaptures must never touch a 'transcribed' (awaiting-review) item -- that is the confirm gate's job");

    // fail-before: strip the "stop at first network failure" break and show the sweep would otherwise
    // have burned a second attempt on pB in the same pass.
    const SWEEP_LINE = 'for(const p of due){const result=await attemptTranscription(p,{state,session});if(result.ok)V.onTranscribed?.(result);else if(result.networkError)break;}';
    assert.ok(originalRouter.includes(SWEEP_LINE), 'expected the network-stop sweep line to be present in the real source -- refusing to run against unexpected state');
    const noBreak = SWEEP_LINE.replace('else if(result.networkError)break;', '');
    const strippedSrc = originalRouter.replace(SWEEP_LINE, noBreak);
    let callCount2 = 0;
    const { g: g2, state: state2, media: media2 } = makeSandbox({
      fetchImpl: async () => { callCount2++; if (callCount2 === 1) throw networkErr(); return { ok: true, json: async () => ({ raw_text: 'second item transcript' }) }; },
    });
    loadInto(g2, CONTEXT_PATH);
    loadInto(g2, ROUTER_PATH, strippedSrc);
    const idA2 = await media2.save(new Blob(['a'], {}), {}), idB2 = await media2.save(new Blob(['b'], {}), {});
    state2.pendingVoiceCaptures.push(
      { id: 'pA', mediaId: idA2, status: 'pending', attempts: 0, error: '', rawText: '', createdAt: new Date().toISOString() },
      { id: 'pB', mediaId: idB2, status: 'pending', attempts: 0, error: '', rawText: '', createdAt: new Date().toISOString() },
    );
    await g2.MSOS4.voiceRouterAV.retryPendingVoiceCaptures();
    assert.equal(callCount2, 2, 'fail-before: with the break removed, the sweep DOES continue past a network failure -- confirms the break is what makes the stop-on-first-failure discipline work');
    console.log('VOICE_AV_PIPELINE_SWEEP_DISCIPLINE_PASS');
  }

  // --- 6. captureNote attaches parsed.mediaId as cap.media_id -- fail-before/pass-after. ---
  {
    const { g } = makeSandbox({ athletes: [{ id: 'a1', full_name: 'Matthew Kofoed', squad: 'National' }], present: [] });
    loadInto(g, CONTEXT_PATH);
    loadInto(g, ROUTER_PATH);
    const cap = g.MSOS4.voiceRouterAV.captureNote({ athlete: null, squad: null, raw: 'good swim', mediaId: 'media-xyz' }, g.MSOS4.state, null);
    assert.equal(cap.data.media_id, 'media-xyz', 'captureNote must attach parsed.mediaId as cap.media_id so the existing C.stageCapture queues the real recording for cloud upload too');

    const MEDIA_LINE = 'if(parsed.mediaId)cap.media_id=parsed.mediaId;';
    assert.ok(originalRouter.includes(MEDIA_LINE), 'expected the media_id attachment line to be present in the real source -- refusing to run against unexpected state');
    const stripped = originalRouter.replace(MEDIA_LINE, '');
    const { g: g2 } = makeSandbox({ athletes: [{ id: 'a1', full_name: 'Matthew Kofoed', squad: 'National' }], present: [] });
    loadInto(g2, CONTEXT_PATH);
    loadInto(g2, ROUTER_PATH, stripped);
    const cap2 = g2.MSOS4.voiceRouterAV.captureNote({ athlete: null, squad: null, raw: 'good swim', mediaId: 'media-xyz' }, g2.MSOS4.state, null);
    assert.equal(cap2.data.media_id, undefined, 'fail-before: with the attachment line removed, media_id must not appear -- confirms the line is what wires the recording to the saved capture');
    console.log('VOICE_AV_PIPELINE_MEDIA_ATTACH_PASS');
  }

  console.log('VOICE_AV_LOCAL_FIRST_PIPELINE_ALL_PASS');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
