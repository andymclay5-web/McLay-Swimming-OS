'use strict';

(function attach(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.MSOSArchitecture = root.MSOSArchitecture || {};
    root.MSOSArchitecture.Interaction = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const VERSION = '1.0.0-aw';
  const text = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const key = v => text(v).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const STROKES = [
    ['freestyle', 'Freestyle'], ['free', 'Freestyle'],
    ['backstroke', 'Backstroke'], ['back', 'Backstroke'],
    ['breaststroke', 'Breaststroke'], ['breast', 'Breaststroke'],
    ['butterfly', 'Butterfly'], ['fly', 'Butterfly'],
    ['medley', 'IM'], ['im', 'IM']
  ];

  function athleteNames(a) {
    return [a?.full_name, a?.preferred_name, a?.board_name, a?.nickname, ...(a?.aliases || [])]
      .map(text).filter(Boolean);
  }

  function resolveAthlete(spoken, athletes = []) {
    const k = key(spoken);
    if (!k) return { status: 'none', athlete: null, candidates: [] };
    const scored = [];
    for (const a of athletes || []) {
      let best = 0;
      for (const n of athleteNames(a)) {
        const nk = key(n);
        const first = key(n.split(/\s+/)[0]);
        if (k === nk) best = Math.max(best, 100);
        else if (k === first) best = Math.max(best, 90);
        else if (nk.startsWith(k) || k.startsWith(nk)) best = Math.max(best, 70);
        else if (first && k.startsWith(first)) best = Math.max(best, 60);
      }
      if (best) scored.push({ athlete: a, score: best });
    }
    scored.sort((a, b) => b.score - a.score || text(a.athlete.full_name).localeCompare(text(b.athlete.full_name)));
    if (!scored.length) return { status: 'none', athlete: null, candidates: [] };
    if (scored.length > 1 && scored[0].score === scored[1].score) {
      const top = scored[0].score;
      return { status: 'ambiguous', athlete: null, candidates: scored.filter(x => x.score === top).map(x => x.athlete) };
    }
    return { status: 'ok', athlete: scored[0].athlete, candidates: [scored[0].athlete] };
  }

  function leadingAthletePhrase(input, athletes) {
    const words = text(input).split(/\s+/), hits = [];
    for (let n = 1; n <= Math.min(4, words.length); n++) {
      const phrase = words.slice(0, n).join(' ');
      const r = resolveAthlete(phrase, athletes);
      if (r.status === 'ok') {
        const exact = athleteNames(r.athlete).some(name => key(name) === key(phrase));
        const first = athleteNames(r.athlete).some(name => key(name.split(/\s+/)[0]) === key(phrase));
        hits.push({ ...r, phrase, rest: words.slice(n).join(' '), phraseScore: exact ? 100 : first ? 90 : 50, words: n });
      } else if (r.status === 'ambiguous') hits.push({ ...r, phrase, rest: words.slice(n).join(' '), phraseScore: 80, words: n });
    }
    hits.sort((a,b) => b.phraseScore - a.phraseScore || a.words - b.words);
    return hits[0] || { status: 'none', athlete: null, phrase: '', rest: text(input), candidates: [] };
  }

  function eventSpec(s) {
    const t = text(s).toLowerCase();
    const dm = t.match(/\b(25|50|100|200|400|800|1500)\b/);
    const st = STROKES.find(([needle]) => new RegExp(`\\b${needle}\\b`, 'i').test(t));
    return dm && st ? { distance: Number(dm[1]), stroke: st[1] } : null;
  }

  function ordinalRep(s) {
    const t = text(s).toLowerCase();
    const names = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
    for (const [word, n] of Object.entries(names)) if (new RegExp(`\\b${word}\\b`).test(t)) return n;
    const m = t.match(/\b(?:rep\s*)?(\d{1,2})(?:st|nd|rd|th)\b/);
    if (m) return Number(m[1]);
    return null;
  }

  function metrics(s) {
    const t = text(s);
    const out = {};
    let m = t.match(/\bstroke\s*rate\s*(?:is|of|=)?\s*(\d{2,3})\b/i);
    if (m) out.strokeRate = Number(m[1]);
    m = t.match(/\b(?:heart\s*rate|hr)\s*(?:is|of|=)?\s*(\d{2,3})\b/i);
    if (m) out.heartRate = Number(m[1]);
    m = t.match(/\brpe\s*(?:is|of|=)?\s*(\d{1,2})(?:\s*\/\s*10)?\b/i);
    if (m) out.rpe = Number(m[1]);
    const clock = t.match(/(?:^|\s)(\d{1,2}):(\d{2}(?:\.\d+)?)(?=\s|$|[,.])/);
    const decimal = t.match(/(?:^|\s)(\d{1,3}\.\d+)(?=\s|$|[,.])/);
    if (clock) out.timeSeconds = Number(clock[1]) * 60 + Number(clock[2]);
    else if (decimal) out.timeSeconds = Number(decimal[1]);
    const rep = ordinalRep(t);
    if (rep) out.rep = rep;
    return out;
  }

  function wantsPublic(s) {
    const t = text(s);
    return /^\s*(?:tv|board|screen)\b/i.test(t) || /\b(?:on|to)\s+(?:the\s+)?(?:tv|board|screen)\b/i.test(t);
  }

  function wantsAthleteMessage(s) {
    return /\b(?:message|tell|send)\b/i.test(s) && /\b(?:swimmer|athlete|her|him|them|phone|device)\b/i.test(s);
  }

  function parseDeterministic(input, { athletes = [], context = null } = {}) {
    const original = text(input);
    const publicOutput = wantsPublic(original);
    const stripped = original.replace(/^\s*(?:tv|board|screen)\s+/i, '');
    const lead = leadingAthletePhrase(stripped, athletes);
    const ath = lead.athlete;
    const rest = text(lead.rest);
    const lower = rest.toLowerCase();
    const base = {
      raw: original,
      athlete: ath || null,
      athleteResolution: lead.status,
      context: context || null,
      destination: publicOutput ? 'tv' : 'private_earbud',
      needsAI: false,
      confidence: lead.status === 'ambiguous' ? 0.35 : 0.85
    };
    if (lead.status === 'ambiguous') return { ...base, intent: 'clarify_athlete', candidates: lead.candidates, confidence: 0.35 };
    if (/\b(?:start|starting|begin)\b/.test(lower) && /\b(?:warm|pre|main|post|down|set|block)\b/.test(lower)) return { ...base, intent: 'context_anchor', payload: { label: rest, action: 'start' }, confidence: 0.94 };
    if (/^(?:next|next set|next block|move on)$/i.test(rest)) return { ...base, intent: 'context_advance', payload: {}, confidence: 0.98 };
    if (/\b(?:pb|personal best)\b/i.test(rest)) {
      const event = eventSpec(rest);
      return { ...base, intent: 'query_pb', payload: { event }, confidence: event && ath?.id ? 0.95 : 0.72 };
    }
    if (/\b(?:targets?|times? for (?:this|the) set|what (?:does|should).*(?:hit|hold|do))\b/i.test(rest)) return { ...base, intent: 'query_current_targets', payload: {}, confidence: ath?.id ? 0.94 : 0.70 };
    if (/\b(?:pathway|next target|qualifying|mqs|met)\b/i.test(rest)) return { ...base, intent: 'query_pathway', payload: { event: eventSpec(rest) }, confidence: ath?.id ? 0.90 : 0.70 };
    if (/\b(?:last|latest)\b.*\bvideo\b/i.test(rest) || /\bvideo\b.*\b(?:last|latest)\b/i.test(rest)) return { ...base, intent: 'query_media', payload: { mediaType: 'video', event: eventSpec(rest) }, destination: publicOutput ? 'tv' : 'private_phone', confidence: ath?.id ? 0.94 : 0.65 };
    if (/^video\b/i.test(rest) || /\b(?:record|capture)\s+video\b/i.test(rest)) return { ...base, intent: 'capture_video', payload: {}, destination: 'private_phone', confidence: ath?.id ? 0.95 : 0.70 };
    if (/\bconversation\b/i.test(rest) && /\b(?:start|record|begin)\b/i.test(rest)) return { ...base, intent: 'conversation_start', payload: {}, destination: 'local_capture', confidence: ath?.id ? 0.95 : 0.65 };
    if (/\b(?:stop|finish|end)\b.*\bconversation\b/i.test(rest)) return { ...base, intent: 'conversation_stop', payload: {}, destination: 'local_capture', confidence: 0.98 };
    if (wantsAthleteMessage(rest)) return { ...base, intent: 'athlete_message', payload: { text: rest.replace(/^.*?\b(?:message|tell|send)\b\s*/i, '') }, destination: 'athlete_device', confidence: ath?.id ? 0.90 : 0.55 };
    const met = metrics(rest);
    if (ath && Object.keys(met).length) return { ...base, intent: 'capture_metric_note', payload: { metrics: met, note: rest }, destination: 'local_capture', confidence: 0.96 };
    if (ath && rest) return { ...base, intent: 'capture_note', payload: { note: rest }, destination: 'local_capture', confidence: 0.82 };
    return { ...base, intent: 'unknown', payload: { text: rest || original }, needsAI: true, confidence: 0.20 };
  }

  const CAPABILITY_BY_INTENT = Object.freeze({
    query_pb: 'local_query', query_current_targets: 'local_query', query_pathway: 'local_query',
    query_media: 'local_media', capture_video: 'local_media', capture_metric_note: 'local_capture',
    capture_note: 'local_capture', conversation_start: 'local_capture', conversation_stop: 'local_capture',
    athlete_message: 'device_delivery', context_anchor: 'context_control', context_advance: 'context_control',
    unknown: 'ai_interpretation'
  });

  function actionEnvelope(parsed, { actorId = 'coach', at = Date.now() } = {}) {
    return {
      id: `act_${Math.random().toString(36).slice(2)}_${Number(at).toString(36)}`,
      at: Number(at), actorId, intent: parsed.intent,
      athleteId: parsed.athlete?.id || null,
      destination: parsed.destination || 'private_earbud',
      payload: parsed.payload || {}, context: parsed.context || null,
      requiredCapability: CAPABILITY_BY_INTENT[parsed.intent] || 'local_query',
      confidence: parsed.confidence ?? 0.5, needsAI: !!parsed.needsAI, raw: parsed.raw || ''
    };
  }

  return { VERSION, resolveAthlete, leadingAthletePhrase, eventSpec, metrics, wantsPublic, parseDeterministic, actionEnvelope, CAPABILITY_BY_INTENT };
});
