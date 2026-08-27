'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.ui)return;
  const BUILD='v4-meet-unified-friday-20260828b-single-authority';
  const U=M.util||{};
  const esc=v=>U.escape?U.escape(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const txt=v=>U.text?U.text(v):String(v??'').replace(/\s+/g,' ').trim();
  const now=()=>U.now?U.now():new Date().toISOString();
  let observer=null,queued=false,activeVoice=null,recognition=null,audioRecorder=null,audioStream=null,audioChunks=[];
  const host=()=>document.querySelector('#meetView');
  const programme=()=>host()?.querySelector('[data-meet-program-ba]')||null;
  const raceForKey=k=>(M.state?.meetFieldDeck?.races||[]).find(r=>M.meetOpsEngine?.keyFor?.(r)===k)||null;
  const recFor=r=>r?M.meetOpsEngine?.recordFor?.(r,true):null;
  const evidenceFor=k=>(M.state?.meetOps?.evidence||[]).filter(e=>e.race_key===k);
  function save(){try{M.store?.save?.(M.state)}catch{}try{M.storageEngine?.saveUi?.(M.state)}catch{}try{M.meetOpsEngine?.backup?.()}catch{}}
  function suppressLegacyDeck(){
    const h=host(),p=programme();if(!h||!p)return;
    document.body.classList.add('meet-unified-live','meet-program-ba-active');
    for(const n of [...h.children]){
      if(n===p||n.matches?.('[data-meet-workspace-cy]'))continue;
      if(n.matches?.('.meet-hero,.next-race-card,.page-card'))n.hidden=true;
    }
  }
  function addEvidence(r,type,{text='',mediaId=null,mimeType=null}={}){
    if(!r)return null;M.state.meetOps=M.state.meetOps||{};if(!Array.isArray(M.state.meetOps.evidence))M.state.meetOps.evidence=[];
    const k=M.meetOpsEngine.keyFor(r),id=U.uid?U.uid('meet-evidence'):`meet-evidence-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const e={id,race_key:k,athlete_id:r.relay?'':(r.athlete_id||''),athlete_name:r.athlete_name||r.source_name||'',event_number:r.event_number,capture_type:type,text_content:txt(text),media_id:mediaId,mime_type:mimeType||null,created_at:now()};
    M.state.meetOps.evidence.push(e);
    if(text){const x=recFor(r);if(x){const line=txt(text);x.notes=x.notes?`${x.notes}\n${line}`:line;x.updated_at=now();}}
    save();queue();return e;
  }
  function ensureActions(intel){
    const capture=intel.querySelector('[data-ba-capture]');if(!capture)return;
    const k=capture.dataset.baCapture||'',r=raceForKey(k);if(!r)return;
    const actions=capture.closest('.ba-actions');if(!actions)return;
    const oldTalk=actions.querySelector('[data-ba-talk]');if(oldTalk)oldTalk.hidden=true;
    let voice=actions.querySelector('[data-mu-voice]');
    if(!voice){voice=document.createElement('button');voice.type='button';voice.dataset.muVoice='1';voice.dataset.muRace=k;actions.prepend(voice)}
    voice.textContent=activeVoice===k?'Stop voice':'Voice race';
    let video=actions.querySelector('[data-mu-video-label]');
    if(!video){video=document.createElement('label');video.className='buttonlike mu-video';video.dataset.muVideoLabel='1';video.innerHTML=`Video<input data-mu-video="${esc(k)}" type="file" accept="video/*" capture="environment" hidden>`;actions.appendChild(video)}
    let data=actions.querySelector('[data-mu-race-data]');
    if(!data){data=document.createElement('button');data.type='button';data.dataset.muRaceData='1';data.dataset.muRace=k;data.textContent='Race data';actions.appendChild(data)}
  }
  function evidenceHtml(k){
    const ev=evidenceFor(k).slice(-8).reverse();
    if(!ev.length)return'<small class="muted">No saved race evidence yet.</small>';
    return ev.map(e=>{const label=e.capture_type==='commentary'?'Voice commentary':e.capture_type==='voice'?'Voice note':e.capture_type==='video'?'Video':e.capture_type==='photo'?'Photo':e.capture_type||'Evidence',play=e.media_id?`<button data-mu-play="${esc(e.id)}">Play</button>`:'';return `<div class="mu-evidence-row"><div><b>${esc(label)}</b>${e.text_content?`<span>${esc(e.text_content)}</span>`:'<span>Saved media</span>'}</div>${play}</div>`}).join('');
  }
  function ensureEvidence(intel){
    const capture=intel.querySelector('[data-ba-capture]'),k=capture?.dataset.baCapture||'';if(!k)return;
    let box=intel.querySelector('[data-mu-evidence]');
    if(!box){box=document.createElement('section');box.dataset.muEvidence='1';box.className='mu-evidence';capture.closest('.ba-actions')?.after(box)}
    box.innerHTML=`<div class="mu-evidence-head"><b>Race evidence</b><small>saved locally</small></div>${evidenceHtml(k)}`;
  }
  function enhance(){
    queued=false;const p=programme();if(!p||M.state?.settings?.view!=='meet')return;
    suppressLegacyDeck();
    for(const intel of p.querySelectorAll('.ba-intel')){ensureActions(intel);ensureEvidence(intel)}
  }
  function queue(){if(queued)return;queued=true;requestAnimationFrame(enhance)}
  async function fallbackAudio(r,k){
    try{
      audioStream=await navigator.mediaDevices.getUserMedia({audio:true});audioChunks=[];audioRecorder=new MediaRecorder(audioStream);activeVoice=k;
      audioRecorder.ondataavailable=e=>{if(e.data.size)audioChunks.push(e.data)};
      audioRecorder.onstop=async()=>{const blob=new Blob(audioChunks,{type:audioRecorder.mimeType||'audio/webm'});let mediaId=null;try{mediaId=await M.media?.save?.(blob,{type:'meet_voice',raceKey:k,athleteIds:[r.athlete_id].filter(Boolean)})}catch{}addEvidence(r,'voice',{mediaId,mimeType:blob.type});audioStream?.getTracks?.().forEach(t=>t.stop());audioRecorder=null;audioStream=null;audioChunks=[];activeVoice=null;queue();M.toast?.('Voice note saved locally')};
      audioRecorder.start();queue();M.toast?.('Voice recording · tap Stop voice when done');
    }catch(e){activeVoice=null;M.toast?.(e.message||String(e))}
  }
  async function startVoice(r,k){
    if(activeVoice){if(activeVoice===k)return stopVoice();return M.toast?.('Finish the current voice capture first')}
    const SR=g.SpeechRecognition||g.webkitSpeechRecognition;if(!SR)return fallbackAudio(r,k);
    try{
      let finalText='',interim='';recognition=new SR();recognition.continuous=true;recognition.interimResults=true;recognition.lang='en-NZ';activeVoice=k;
      recognition.onresult=e=>{interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=`${finalText?' ':''}${t}`;else interim+=t}const intel=document.querySelector(`[data-ba-capture="${CSS.escape(k)}"]`)?.closest('.ba-intel'),status=intel?.querySelector('[data-mu-live-transcript]');if(status)status.textContent=txt(`${finalText} ${interim}`)||'Listening…'};
      recognition.onerror=e=>M.toast?.(`Voice commentary: ${e.error||'error'}`);
      recognition.onend=()=>{const text=txt(`${finalText} ${interim}`);recognition=null;activeVoice=null;if(text){addEvidence(r,'commentary',{text});M.toast?.('Race commentary saved')}queue()};
      recognition.start();
      const intel=document.querySelector(`[data-ba-capture="${CSS.escape(k)}"]`)?.closest('.ba-intel');if(intel&&!intel.querySelector('[data-mu-live-transcript]')){const s=document.createElement('div');s.dataset.muLiveTranscript='1';s.className='mu-live-transcript';s.textContent='Listening…';intel.querySelector('.ba-actions')?.before(s)}
      queue();M.toast?.('Voice commentary · speak naturally, then tap Stop voice');
    }catch(e){recognition=null;activeVoice=null;return fallbackAudio(r,k)}
  }
  function stopVoice(){if(recognition){try{recognition.stop()}catch{}return}if(audioRecorder&&audioRecorder.state!=='inactive'){try{audioRecorder.stop()}catch{}}}
  async function saveVideo(input){
    const f=input.files?.[0],r=raceForKey(input.dataset.muVideo||'');if(!f||!r)return;
    let mediaId=null;M.toast?.('Saving video locally…');
    try{mediaId=await M.media?.save?.(f,{type:'meet_video',raceKey:M.meetOpsEngine.keyFor(r),athleteIds:[r.athlete_id].filter(Boolean)})}catch(e){return M.toast?.(`Video save failed: ${e.message||e}`)}
    addEvidence(r,'video',{mediaId,mimeType:f.type});M.toast?.('Video saved · playback ready');
  }
  async function playEvidence(id){
    const e=(M.state?.meetOps?.evidence||[]).find(x=>x.id===id);if(!e?.media_id)return M.toast?.('No local media attached');
    let row=null;try{row=await M.media?.get?.(e.media_id)}catch{}if(!row?.blob)return M.toast?.('Saved media blob is not available on this device');
    const url=URL.createObjectURL(row.blob),isVideo=(e.mime_type||row.blob.type||'').startsWith('video/'),tag=isVideo?'video':'audio',h=document.querySelector('#modalHost');
    h.innerHTML=`<div class="modal-backdrop"><section class="modal"><header><h2>${isVideo?'Race video':'Race voice'}</h2><button data-mu-close>×</button></header><div class="modal-body"><${tag} data-mu-player controls playsinline preload="metadata" src="${esc(url)}" style="width:100%;max-height:70vh"></${tag}>${e.text_content?`<p>${esc(e.text_content)}</p>`:''}</div><footer><button data-mu-close>Close</button></footer></section></div>`;
    M.nav?.openLayer?.('modal');
    const close=()=>{try{h.querySelector('[data-mu-player]')?.pause()}catch{}URL.revokeObjectURL(url);h.innerHTML='';M.nav?.dismissLayer?.()};h.querySelectorAll('[data-mu-close]').forEach(b=>b.onclick=close);
  }
  function bind(){
    document.addEventListener('click',e=>{const v=e.target.closest?.('[data-mu-voice]');if(v){e.preventDefault();e.stopPropagation();const r=raceForKey(v.dataset.muRace||'');if(r)startVoice(r,v.dataset.muRace);return}const d=e.target.closest?.('[data-mu-race-data]');if(d){e.preventDefault();e.stopPropagation();const r=raceForKey(d.dataset.muRace||'');if(r)M.meetOpsEngine?.openRaceEdit?.(r);return}const p=e.target.closest?.('[data-mu-play]');if(p){e.preventDefault();e.stopPropagation();playEvidence(p.dataset.muPlay);return}},true);
    document.addEventListener('change',e=>{const input=e.target.closest?.('[data-mu-video]');if(input)saveVideo(input)},true);
  }
  function style(){
    if(document.getElementById('meet-unified-dh-style'))document.getElementById('meet-unified-dh-style').remove();
    const s=document.createElement('style');s.id='meet-unified-dh-style';
    s.textContent=`body.meet-program-ba-active #meetView>.meet-hero,body.meet-program-ba-active #meetView>.next-race-card,body.meet-program-ba-active #meetView>.page-card{display:none!important}[data-meet-program-ba] .ba-actions{grid-template-columns:repeat(2,minmax(0,1fr))!important}[data-meet-program-ba] .ba-actions button,[data-meet-program-ba] .ba-actions .buttonlike{min-height:48px;font-weight:800}.mu-video{display:flex;align-items:center;justify-content:center;border:1px solid currentColor;border-radius:8px;padding:.35rem;cursor:pointer}.mu-live-transcript{border:2px solid currentColor;border-radius:10px;padding:.5rem;font-weight:750;background:var(--surface,#fff)}.mu-evidence{display:grid;gap:.3rem;border-top:1px solid rgba(13,69,102,.14);padding-top:.4rem}.mu-evidence-head{display:flex;justify-content:space-between}.mu-evidence-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.4rem;align-items:center;border:1px solid rgba(13,69,102,.12);border-radius:9px;padding:.4rem}.mu-evidence-row>div{display:grid;min-width:0}.mu-evidence-row span{font-size:.82rem;white-space:normal}.mu-evidence-row button{min-height:42px}@media(max-width:620px){[data-meet-program-ba] .ba-actions{grid-template-columns:1fr 1fr!important}.mu-evidence-row{grid-template-columns:1fr}.mu-evidence-row button{width:100%}}`;
    document.head.appendChild(s);
  }
  function install(){style();bind();queue();const h=host();if(h&&!observer){observer=new MutationObserver(queue);observer.observe(h,{childList:true,subtree:false})}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){save();return}queue()});g.addEventListener?.('pagehide',save);
  M.meetUnifiedFriday={build:BUILD,enhance,stopVoice,playEvidence,suppressLegacyDeck};
})(globalThis);
