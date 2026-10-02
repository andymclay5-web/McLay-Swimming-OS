'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines,C=M?.contextEngineAV;if(!M||!C)return;
  const BUILD='v4-context-voice-foundation-20260822av',V=M.voiceRouterAV={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const current=()=>M.currentSession?.()||null;
  const athleteName=a=>text(a?.full_name)||'Swimmer';
  function eventFromQuery(q){const s=text(q);const m=s.match(/\b(50|100|200|400|800|1500)\s*(free(?:style)?|back(?:stroke)?|breast(?:stroke)?|fly|butterfly|im|medley)\b/i);if(!m)return null;const map={free:'Freestyle',freestyle:'Freestyle',back:'Backstroke',backstroke:'Backstroke',breast:'Breaststroke',breaststroke:'Breaststroke',fly:'Butterfly',butterfly:'Butterfly',im:'IM',medley:'IM'};return{distance:Number(m[1]),stroke:map[m[2].toLowerCase()]};}
  function pbAnswer(ath,q,state=M.state,session=current()){
    if(!ath)return{ok:false,speak:'Which swimmer?'};const ev=eventFromQuery(q);if(!ev)return{ok:false,speak:`Which event for ${athleteName(ath)}?`};const course=text(session?.identity?.course||M.state?.settings?.pathwayCourse||'SCM').toUpperCase(),p=E?.RacePace?.pb?.(ath,state,{...ev,course});if(!p)return{ok:false,speak:`I do not have a ${ev.distance} ${ev.stroke} PB for ${athleteName(ath)}.`};const sec=Number(p._anchor_seconds||E?.Evidence?.seconds?.(p)||p.result_seconds||p.seconds),t=M.util?.clock?M.util.clock(sec):String(sec);return{ok:true,speak:`${athleteName(ath)}. ${ev.distance} ${ev.stroke}, ${t}, ${course}.`,data:{...ev,course,seconds:sec}};
  }
  // 2 Oct 2026 (voice/earbud build): found while reviving this dormant engine to wire up -- this function
  // has never once run against a real session, because engines/context-engine-av.js, voice-router-av.js and
  // voice-ui-av.js (all dated 20260822av) were never added to index.html/sw.js's load list. That alone would
  // have been a silent no-op, but this function specifically could not even have PARSED: the brace after
  // `if(t.status==='pattern'){` was never closed, so the 'rep_race' and 'hr_sr' branches below it, and the
  // final fallback return, were all accidentally nested INSIDE the 'pattern' branch instead of being
  // separate top-level checks -- a real `node --check` syntax error on this file, confirmed by reverting
  // this fix and re-running it (see tests/voice-av-capture-20261002.cjs). Fixed by closing the 'pattern'
  // branch's brace and giving 'rep_race' its own, so all four target-status branches are independent.
  function targetAnswer(ath,state=M.state,session=current()){
    if(!ath)return{ok:false,speak:'Which swimmer?'};const ctx=C.now(session);if(!ctx?.item)return{ok:false,speak:'I cannot identify the current set yet.'};const p=E?.Coordinator?.prescription?.(session,ctx.item,ath,state);if(!p)return{ok:false,speak:'No target available.'};const item=p.item||ctx.item,t=p.target||{},work=text(item.raw||item.text||ctx.itemLabel);
    if(t.status==='ok')return{ok:true,speak:`${athleteName(ath)}. ${work}. Target ${M.util?.clock?M.util.clock(t.seconds):t.seconds}${t.sendOff?`, leave on ${M.util?.clock?M.util.clock(t.sendOff):t.sendOff}`:''}.`,data:p};
    if(t.status==='pattern'){const rows=(t.rows||[]).filter(x=>Number.isFinite(Number(x.seconds)));const desc=rows.map(x=>`${x.zone} ${M.util?.clock?M.util.clock(x.seconds):x.seconds}`).join(', ');return{ok:true,speak:`${athleteName(ath)}. ${work}. ${desc}.`,data:p};}
    if(t.status==='rep_race'){const rows=(t.rows||[]).filter(x=>x.status==='ok'),desc=rows.map(x=>`rep ${x.rep}, ${M.util?.clock?M.util.clock(x.seconds):x.seconds}`).join(', ');return{ok:true,speak:`${athleteName(ath)}. ${desc||'race target unavailable'}.`,data:p};}
    if(t.kind==='hr_sr')return{ok:true,speak:`${athleteName(ath)}. ${work}. Heart rate ${t.hr}${t.sr?`, stroke rate ${t.sr}`:''}.`,data:p};
    return{ok:false,speak:t.message||`No precise target for ${athleteName(ath)} on this set.`};
  }
  // 2 Oct 2026 (voice/earbud build): a coach who says a swimmer's name gets that swimmer tagged (existing
  // behaviour); Andy's own follow-up ask was that saying a SQUAD name should tag the group instead -- so
  // when no individual athlete matched but context-engine-av.js's parseVoice() found a squad mention, tag
  // every PRESENT athlete in that squad (same "present" pool the Capture modal's own "All here" button
  // uses -- see UI.presentAthletes() in app.js) rather than the whole roster, so an absent squad member
  // never gets a note meant for the session in front of the coach right now. Saying neither a name nor a
  // squad still correctly falls through to a GROUP-level note (cap.athlete_ids left unset) -- matching the
  // existing "Capture defaulting to all swimmers" safe-default rule (architecture/RUNTIME_AUDIT_20260909.md
  // §4) that this engine must not reintroduce.
  function squadPresentIds(squad){if(!squad)return[];const pool=M.ui?.presentAthletes?.()||M.state?.athletes||[];return pool.filter(a=>text(a.squad)===squad).map(a=>a.id);}
  // "When the assistant coaches use that, then it comes straight to me" (Andy, 2 Oct 2026): every voice
  // capture made by anyone other than the owner fires the existing coach-alert push (engines/push-alerts.js
  // -- the same mechanism modification-edit.js and session-methodology.js already use for "Andy needs to
  // see this" events). Best-effort and never awaited for anything but its own durable insert, so a flaky
  // or absent connection never blocks or delays the save the coach is waiting on -- same discipline as
  // modification-edit.js's notifyPendingStroke().
  function notifyOwnerIfAssistant(cap,parsed){
    try{
      const role=M.access?.role?.()||'owner';if(role==='owner')return;
      const who=parsed.athlete?athleteName(parsed.athlete):(cap.squad?`${cap.squad} squad`:'the group');
      M.pushAlerts?.sendCoachAlert?.({sessionId:cap.session_id,athleteId:parsed.athlete?.id||null,kind:'voice_capture',title:`Voice note · ${who}`,body:text(parsed.raw).slice(0,180)})?.catch?.(()=>{});
    }catch{/* best-effort, never blocks the save */}
  }
  function captureNote(parsed,state=M.state,session=current()){
    const cap={id:M.util?.uid?.('capture')||`capture-${Date.now()}`,session_id:session?.id||'',capture_type:'note',text_content:parsed.raw,title:'Voice note',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),context_label:C.compact(parsed.context),block_id:parsed.context?.blockId||'',item_id:parsed.context?.itemId||'',rep:parsed.payload?.rep||parsed.context?.rep||null,source:'voice-router-av'};
    if(parsed.athlete){cap.athlete_id=parsed.athlete.id;cap.athlete_ids=[parsed.athlete.id];}
    else if(parsed.squad){const ids=squadPresentIds(parsed.squad);if(ids.length){cap.athlete_ids=ids;cap.squad=parsed.squad;}}
    if(parsed.payload?.strokeRate!=null)cap.stroke_rate=parsed.payload.strokeRate;if(parsed.payload?.heartRate!=null)cap.heart_rate=parsed.payload.heartRate;if(parsed.payload?.rpe!=null)cap.rpe=parsed.payload.rpe;
    // 2 Oct 2026 (quality + connectivity build): when this note came from the new record-first pipeline
    // below, parsed.mediaId points at the real audio clip already saved durably in M.media (IndexedDB)
    // before transcription was ever attempted. Attaching it here means the EXISTING, unmodified
    // C.stageCapture (app.js) does exactly what it already does for photo/video captures -- queues the
    // 'media' table upload alongside the capture row -- so Andy gets the actual recording backed up to
    // cloud storage, not just the transcript, with zero app.js changes. parsed.mediaId is undefined for
    // every existing call site (live browser STT never had an audio file), so this is purely additive.
    if(parsed.mediaId)cap.media_id=parsed.mediaId;
    state.captures=state.captures||[];state.captures.push(cap);M.store?.save?.(state);M.cloud?.stageCapture?.(cap);notifyOwnerIfAssistant(cap,parsed);return{ok:true,speak:`Saved${parsed.athlete?` for ${athleteName(parsed.athlete)}`:cap.squad?` for ${cap.squad}`:''}.`,data:cap};
  }
  // 2 Oct 2026 (Andy, after the South Island Champs garbled-transcript report, and his own explicit
  // follow-up): "quality is going to be probably the most important thing... I'd really like it to be the
  // quality of this what I'm talking to you right now" plus "if we're in a swimming pool where the
  // internet connection's dodgy at best it needs to always make sure that it's locally captured". This
  // replaces the free live-browser-SpeechRecognition engine (which produced the "Matthew, Matthew, gay,
  // gay..." failure) with: record real audio locally first (M.media -- durable IndexedDB, survives app
  // close/reopen), THEN send it to the same transcribe-capture edge function the session-dictation feature
  // already calls (M.intake.transcribe's own 'transcribe_direct' action), using OpenAI's full-quality
  // transcription model server-side. If the attempt fails for any reason -- no connection, mobile data
  // dying mid-pool because of the concrete, a dropped request -- the recording is never lost: it stays in
  // M.media and in this pending queue (durably saved via M.store.save, same as every other piece of state)
  // until a retry succeeds. Deliberately NOT routed through C.queue/C.flush: that generic job queue only
  // recognises a fixed set of table/action pairs and silently drops anything else (see C.flush's job loop
  // in app.js -- a job is removed from M.state.pending after its try block runs regardless of which branch,
  // if any, matched), so a bespoke small queue here is safer than teaching it a shape it was never built
  // for. Still zero app.js edits: M.media, M.intake.functionUrl/headers and M.cloud.networkError are all
  // already public methods on M, exactly like M.cloud's own C.flush/C.queue are.
  const PENDING_KEY='pendingVoiceCaptures';
  function pendingList(state=M.state){state[PENDING_KEY]=state[PENDING_KEY]||[];return state[PENDING_KEY];}
  function removePending(id,state=M.state){const list=pendingList(state),ix=list.findIndex(x=>x.id===id);if(ix>=0)list.splice(ix,1);M.store?.save?.(state);}
  function browserRecordingAvailable(){return!!(g.navigator?.mediaDevices?.getUserMedia&&g.MediaRecorder);}
  async function savePendingCapture(blob,state=M.state){
    const mediaId=await M.media.save(blob,{type:'voice_capture_av'});
    const rec={id:M.util?.uid?.('voice-pending')||`voice-pending-${Date.now()}`,mediaId,status:'pending',attempts:0,error:'',rawText:'',createdAt:new Date().toISOString()};
    pendingList(state).push(rec);M.store?.save?.(state);return rec;
  }
  // Mirrors app.js's own A.recordVoice start/stop MediaRecorder pattern (same getUserMedia({audio:true})
  // + chunked Blob on stop) without touching app.js -- this is a fresh, self-contained capture inside the
  // revived AV engine, reusing only the already-public M.media.save for the durable local write.
  let activeRecording=null;
  function startCapture({onSaved,onError}={}){
    if(activeRecording)return false;
    const handle={stopRequested:false,recorder:null,stream:null};activeRecording=handle;
    navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
      if(activeRecording!==handle){stream.getTracks().forEach(t=>t.stop());return;}
      const chunks=[],r=new MediaRecorder(stream);handle.recorder=r;handle.stream=stream;
      r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      r.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());activeRecording=null;try{const blob=new Blob(chunks,{type:r.mimeType||'audio/webm'});const rec=await savePendingCapture(blob);onSaved?.(rec);}catch(err){onError?.(err);}};
      r.start();if(handle.stopRequested)r.stop();
    }).catch(err=>{if(activeRecording===handle)activeRecording=null;onError?.(err);});
    return true;
  }
  function stopCapture(){if(!activeRecording)return false;if(activeRecording.recorder)activeRecording.recorder.stop();else activeRecording.stopRequested=true;return true;}
  function isCapturing(){return!!activeRecording;}
  // The orchestration step: resolve the durably-saved blob, send it, and hand back a parsed intent built
  // from the REAL server transcript using C.parseVoice -- the exact same pure parser the old live-STT path
  // used, so squad/athlete detection, looksGarbled and the confirm-or-discard gate all keep working
  // unchanged. parsed.context is rebuilt from the moment the coach actually spoke (pending.createdAt), not
  // from whenever a delayed retry happens to finish, so a note that took two minutes to get back online
  // still attaches to the set the coach was actually talking about.
  async function transcribeVoiceNote(blob){
    const url=M.intake?.functionUrl?.();if(!url)throw new Error('Cloud sync is not configured yet.');
    const auth=M.store?.auth?.();if(!auth?.access_token)throw new Error('Sign in before automatic transcription.');
    const form=new FormData();form.append('action','transcribe_direct');form.append('source_type','voice');form.append('purpose','quick_note');form.append('file',blob,'voice-capture.webm');
    const r=await fetch(url,{method:'POST',headers:M.intake.headers(),body:form});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||`Transcription failed (${r.status}).`);
    const raw=text(data.raw_text);if(!raw)throw new Error('No transcript returned.');
    return raw;
  }
  async function attemptTranscription(pending,{state=M.state,session=current()}={}){
    pending.attempts=(pending.attempts||0)+1;pending.lastAttemptAt=new Date().toISOString();M.store?.save?.(state);
    let blobRow;try{blobRow=await M.media?.get?.(pending.mediaId);}catch{blobRow=null;}
    if(!blobRow?.blob){pending.status='failed';pending.error='Recording is no longer available locally.';M.store?.save?.(state);return{ok:false,pending,networkError:false,error:new Error(pending.error)};}
    try{
      const rawText=await transcribeVoiceNote(blobRow.blob);
      pending.status='transcribed';pending.rawText=rawText;pending.error='';M.store?.save?.(state);
      const parsed=C.parseVoice(rawText,{session,state});parsed.context=C.now(session,new Date(pending.createdAt));parsed.mediaId=pending.mediaId;
      return{ok:true,pending,rawText,parsed};
    }catch(e){
      if(M.cloud?.networkError?.(e)){pending.status='pending';M.store?.save?.(state);return{ok:false,pending,networkError:true,error:e};}
      pending.status='failed';pending.error=e.message||String(e);M.store?.save?.(state);return{ok:false,pending,networkError:false,error:e};
    }
  }
  function resolvePending(id,state=M.state){removePending(id,state);}
  function awaitingReview(state=M.state){return pendingList(state).filter(x=>x.status==='transcribed');}
  function pendingSummary(state=M.state){const list=pendingList(state);return{total:list.length,failed:list.filter(x=>x.status==='failed').length,awaitingReview:list.filter(x=>x.status==='transcribed').length};}
  // First proactive connectivity listener in this codebase (the only existing idiom, C.networkError, is
  // reactive -- it only runs after a fetch has already failed). Stops at the first network failure in the
  // sweep, same discipline as C.flush's own job loop in app.js, so one still-offline item doesn't burn
  // through every later one's retry attempt in the same tick.
  async function retryPendingVoiceCaptures({state=M.state,session=current()}={}){
    const due=pendingList(state).filter(x=>x.status==='pending');
    for(const p of due){const result=await attemptTranscription(p,{state,session});if(result.ok)V.onTranscribed?.(result);else if(result.networkError)break;}
  }
  if(typeof g.addEventListener==='function')g.addEventListener('online',()=>{retryPendingVoiceCaptures().catch(()=>{});});
  function findContextAnchor(parsed,session=current()){
    if(!session)return{ok:false,speak:'No active session.'};const label=text(parsed.payload?.label||parsed.raw),q=label.toLowerCase(),blocks=session.blocks||[];let block=blocks.find(b=>q.includes(text(b.title||b.label||b.type).toLowerCase()));let item=null;if(!block){for(const b of blocks){item=(C.ordered(session).find(x=>x.block.id===b.id&&q.includes(text(x.item.raw||x.item.text).toLowerCase().slice(0,28)))||{}).item;if(item){block=b;break;}}}const a=C.addAnchor({session,blockId:block?.id||'',itemId:item?.id||'',rep:parsed.payload?.rep||null,label,source:'voice'});E?.Coordinator?.clearCache?.();return{ok:true,speak:`Context updated${block?` to ${text(block.title||block.label||block.type)}`:''}.`,data:a};
  }
  function routeTranscript(transcript,opts={}){const parsed=C.parseVoice(transcript,opts),state=opts.state||M.state,session=opts.session||current();let result;switch(parsed.intent){case'query_pb':result=pbAnswer(parsed.athlete,parsed.query,state,session);break;case'query_targets':result=targetAnswer(parsed.athlete,state,session);break;case'context_anchor':result=findContextAnchor(parsed,session);break;case'capture_note':result=captureNote(parsed,state,session);break;case'video':result={ok:true,action:'video',athlete:parsed.athlete,speak:`Video${parsed.athlete?` for ${athleteName(parsed.athlete)}`:''}.`,data:parsed};break;case'conversation':result={ok:true,action:'conversation',athlete:parsed.athlete,speak:`Conversation${parsed.athlete?` with ${athleteName(parsed.athlete)}`:''}.`,data:parsed};break;case'display_evidence':result={ok:true,action:'display_evidence',athlete:parsed.athlete,speak:`TV evidence request${parsed.athlete?` for ${athleteName(parsed.athlete)}`:''}.`,data:parsed};break;default:result={ok:false,speak:'I did not understand that yet.',data:parsed};}return{...result,parsed};}
  function speak(message){if(!message)return;if(!('speechSynthesis'in g))return;try{g.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(message);u.rate=1.05;g.speechSynthesis.speak(u);}catch{}}
  function browserRecognitionAvailable(){return!!(g.SpeechRecognition||g.webkitSpeechRecognition);}
  // 2 Oct 2026 (Andy, after the South Island Champs garbled-transcript report): listenOnce() used to call
  // routeTranscript() itself inside onresult -- which for a capture_note intent meant captureNote() (the
  // actual save + owner-alert) had ALREADY run by the time the caller's onResult even fired, so there was
  // no way to show the coach what was heard and let them discard a garbled one first. Andy chose to stay
  // on this free engine and add exactly that confirm-or-discard step rather than switch to a paid one, so
  // this now only PARSES (C.parseVoice is pure, no side effects) and hands the caller the parsed intent --
  // engines/voice-ui-av.js's install() decides whether to route immediately (queries, context anchors,
  // video/conversation/display requests -- none of these write a swimmer-attributed note) or to gate a
  // capture_note behind its new confirm panel and only call V.captureNote() if the coach taps Save.
  function listenOnce({onResult,onError,lang='en-NZ'}={}){const K=g.SpeechRecognition||g.webkitSpeechRecognition;if(!K)throw new Error('Browser speech recognition is not available on this device.');const r=new K();r.lang=lang;r.interimResults=false;r.continuous=false;r.maxAlternatives=1;r.onresult=e=>{const transcript=text(e.results?.[0]?.[0]?.transcript);onResult?.(transcript,C.parseVoice(transcript));};r.onerror=e=>onError?.(e);r.start();return r;}
  V.routeTranscript=routeTranscript;V.pbAnswer=pbAnswer;V.targetAnswer=targetAnswer;V.captureNote=captureNote;V.speak=speak;V.listenOnce=listenOnce;V.browserRecognitionAvailable=browserRecognitionAvailable;
  V.onTranscribed=null;V.browserRecordingAvailable=browserRecordingAvailable;V.startCapture=startCapture;V.stopCapture=stopCapture;V.isCapturing=isCapturing;V.attemptTranscription=attemptTranscription;V.resolvePending=resolvePending;V.retryPendingVoiceCaptures=retryPendingVoiceCaptures;V.awaitingReview=awaitingReview;V.pendingSummary=pendingSummary;V.transcribeVoiceNote=transcribeVoiceNote;
})(globalThis);
