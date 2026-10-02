'use strict';
(function(g){
  const M=g.MSOS4,V=M?.voiceRouterAV,C=M?.contextEngineAV;if(!M||!V||!C)return;
  const BUILD='v4-context-voice-foundation-20260822av',U=M.voiceUIAV={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  // 2 Oct 2026 (Andy, real field report from South Island Champs): an earbud capture of Matthew's race
  // came back as a couple of words looping ("Matthew, Matthew, gay, gay, ...") -- the free browser speech
  // engine failing on poolside noise/echo at earbud distance, not a bug in the swimmer-matching logic.
  // Andy chose to keep the free engine (no per-use cost) and add this confirm-or-discard step rather than
  // switch to a paid one: a capture_note is now shown back to the coach -- what was heard, who it would
  // be attached to, flagged if it looks like the same word/short run dominating the sentence (see
  // context-engine-av.js's looksGarbled, written to match exactly the failure shape Andy described) --
  // and only saved (and only then does the owner-alert for an assistant's capture fire) if the coach taps
  // Save. Tapping Discard throws it away with nothing written and nobody notified. Self-contained DOM (no
  // dependency on app.js's own modal() helper) so this stays entirely inside the revived AV engine files.
  function confirmCapture({ heard, who, garbled, onSave, onDiscard }) {
    const host = document.querySelector('#modalHost') || document.body;
    const wrap = document.createElement('div'); wrap.className = 'av-voice-confirm-backdrop';
    const panel = document.createElement('div'); panel.className = 'av-voice-confirm' + (garbled ? ' av-voice-confirm-garbled' : '');
    const label = document.createElement('b'); label.textContent = garbled ? 'Heard (may not be clear):' : 'Heard:';
    const heardEl = document.createElement('p'); heardEl.className = 'av-voice-confirm-text'; heardEl.textContent = `"${heard}"`;
    const whoEl = document.createElement('div'); whoEl.className = 'av-voice-confirm-who'; whoEl.textContent = `For: ${who}`;
    const actions = document.createElement('div'); actions.className = 'av-voice-confirm-actions';
    const discardBtn = document.createElement('button'); discardBtn.type = 'button'; discardBtn.textContent = 'Discard';
    const saveBtn = document.createElement('button'); saveBtn.type = 'button'; saveBtn.className = 'av-voice-confirm-save'; saveBtn.textContent = 'Save';
    actions.append(discardBtn, saveBtn); panel.append(label, heardEl, whoEl, actions); wrap.appendChild(panel); host.appendChild(wrap);
    const cleanup = () => wrap.remove();
    saveBtn.onclick = () => { cleanup(); onSave?.(); };
    discardBtn.onclick = () => { cleanup(); onDiscard?.(); };
    return wrap;
  }
  // 2 Oct 2026 (Andy, after the South Island Champs report + his follow-up on quality and poolside
  // connectivity): the Talk button now records real audio (push to talk: tap to start, tap again to stop)
  // instead of driving the free live browser recognizer. Recording is saved locally before anything is
  // sent anywhere (engines/voice-router-av.js's startCapture -> savePendingCapture), so a dropped pool
  // wifi/mobile-data connection during the transcribe step never loses the capture -- it just stays
  // pending and the badge below reflects it until a retry (the 'online' listener, or this button's own
  // boot-time sweep) gets it through. The confirm-or-discard gate Andy asked for stays exactly as before,
  // just fed the real server transcript instead of a live-recognizer guess.
  function handleTranscribed(result){
    const {parsed,rawText,pending}=result;
    if(parsed?.intent==='capture_note'){
      const who=parsed.athlete?.full_name||(parsed.squad?`${parsed.squad} squad`:'the group');
      confirmCapture({heard:rawText,who,garbled:C.looksGarbled(rawText),
        onSave:()=>{const saved=V.captureNote(parsed);V.resolvePending(pending.id);M.toast?.(saved?.speak||'Saved.');paintPendingBadge();},
        onDiscard:()=>{V.resolvePending(pending.id);M.toast?.('Discarded — nothing saved.');paintPendingBadge();}});
      return;
    }
    const result2=V.routeTranscript(rawText);V.resolvePending(pending.id);
    M.toast?.(`${text(rawText)}${result2?.speak?` · ${result2.speak}`:''}`);
    if(result2?.speak&&/^query_/.test(result2.parsed?.intent||''))V.speak(result2.speak);
    if(result2?.action==='video'&&M.actions?.openCapture)M.actions.openCapture({athleteId:result2.athlete?.id||'',mode:'video'});
    paintPendingBadge();
  }
  // Boot-time sweep: anything already transcribed before the app closed (transcription succeeded but the
  // coach never got to Save/Discard -- app killed, tab closed) is re-shown rather than silently vanishing;
  // anything still waiting on a connection gets one retry pass. Both are additive to the manual Talk
  // button flow and never block it.
  function drainAwaitingReview(){const[next]=V.awaitingReview();if(!next)return;const session=M.currentSession?.()||null;const parsed=C.parseVoice(next.rawText,{session});parsed.context=C.now(session,new Date(next.createdAt));parsed.mediaId=next.mediaId;handleTranscribed({parsed,rawText:next.rawText,pending:next});}
  function paintPendingBadge(){
    const voice=document.querySelector('[data-sticky-voice]');if(!voice)return;
    const s=V.pendingSummary();voice.dataset.avPending=s.total?String(s.total):'';voice.dataset.avPendingFailed=s.failed?'1':'';
  }
  function install(){
    const voice=document.querySelector('[data-sticky-voice]');if(!voice)return;voice.hidden=false;voice.textContent='Talk';voice.title='One-shot coaching voice capture';
    const sticky=document.querySelector('.sticky-actions');if(sticky)sticky.style.gridTemplateColumns='repeat(4,1fr)';
    voice.onclick=e=>{
      e.preventDefault();
      if(V.isCapturing()){V.stopCapture();return;}
      if(!V.browserRecordingAvailable()){M.toast?.('Microphone recording is not available in this browser yet.');return;}
      voice.disabled=false;voice.textContent='Stop';
      V.startCapture({
        onSaved:async pending=>{
          voice.textContent='Transcribing…';voice.disabled=true;paintPendingBadge();
          const result=await V.attemptTranscription(pending);
          voice.disabled=false;voice.textContent='Talk';paintPendingBadge();
          if(result.ok){handleTranscribed(result);return;}
          if(result.networkError){M.toast?.('Saved locally — no connection yet. It will finish transcribing automatically once you are back online.');return;}
          M.toast?.(`Voice: ${result.error?.message||'could not be transcribed'}. The recording is still saved locally — tap Talk's badge to retry.`);
        },
        onError:err=>{voice.disabled=false;voice.textContent='Talk';M.toast?.(err?.message||'Microphone was not available.');},
      });
    };
    voice.addEventListener('dblclick',e=>{e.preventDefault();const s=V.pendingSummary();if(!s.total){M.toast?.('Nothing pending.');return;}V.retryPendingVoiceCaptures().then(paintPendingBadge);});
    const prior=V.onTranscribed;V.onTranscribed=r=>{prior?.(r);handleTranscribed(r);};
    V.retryPendingVoiceCaptures().then(paintPendingBadge).catch(()=>{});
    drainAwaitingReview();paintPendingBadge();
  }
  function contextBadge(){const board=document.querySelector('#boardView');if(!board)return;board.querySelector('[data-av-context]')?.remove();const ctx=C.now();if(ctx.status!=='active')return;const el=document.createElement('div');el.dataset.avContext='1';el.className='av-context-badge';el.innerHTML=`<b>${Math.round(ctx.confidence*100)}%</b><span>${text(ctx.blockLabel)}${ctx.rep?` · rep ${ctx.rep}`:''}</span><small>${ctx.source}${ctx.driftSeconds?` · ${ctx.driftSeconds>0?'+':''}${Math.round(ctx.driftSeconds/60)}m`:''}</small>`;const anchor=board.querySelector('.msos-board-block')||board.firstElementChild;if(anchor)anchor.insertAdjacentElement('beforebegin',el);else board.prepend(el);}
  const priorBoard=M.ui?.renderBoard?.bind(M.ui);if(priorBoard)M.ui.renderBoard=()=>{priorBoard();requestAnimationFrame(contextBadge);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{install();requestAnimationFrame(contextBadge);},{once:true});else{install();requestAnimationFrame(contextBadge);}
  U.install=install;U.contextBadge=contextBadge;U.confirmCapture=confirmCapture;U.handleTranscribed=handleTranscribed;U.paintPendingBadge=paintPendingBadge;U.drainAwaitingReview=drainAwaitingReview;
})(globalThis);
