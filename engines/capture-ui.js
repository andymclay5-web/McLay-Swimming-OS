'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.actions?.openCapture||!M?.ui)return;
  const UI=M.ui,C=M.captureUI={build:'v4-capture-ui-20260820v'},baseOpen=M.actions.openCapture.bind(M.actions),baseChrome=UI.configureRoleChrome?.bind(UI),boardUrls=new Map();
  const esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??''),selectedCount=modal=>[...modal.querySelectorAll('[data-capture-athlete]')].filter(x=>x.checked).length;
  const tidySelection=modal=>{const label=modal.querySelector('#captureSelectionLabel');if(label)label.textContent=`${selectedCount(modal)} selected`;};
  function activeBoardContext(ctx={}){if(ctx.itemId||ctx.blockId)return ctx;const view=M.state?.settings?.view||'';if(view!=='board'&&view!=='tv')return ctx;const s=M.currentSession?.();if(!s)return ctx;const selected=M.state?.settings?.boardBlockBySession?.[s.id],block=(s.blocks||[]).find(b=>b.id===selected)||(s.blocks||[]).find(b=>b.type==='main_set')||(s.blocks||[])[0];return block?{...ctx,blockId:block.id}:ctx;}
  function refreshDeck(){const v=M.state?.settings?.view||'';if(v==='board')UI.renderBoard?.();else if(v==='tv')UI.renderTV?.();}

  M.actions.openCapture=(ctx={})=>{
    ctx=activeBoardContext(ctx);
    const result=baseOpen(ctx),modal=document.querySelector('#modalHost .modal');if(!modal)return result;
    const here=new Set((UI.presentAthletes?.()||[]).map(a=>a.id)),explicit=new Set(Array.isArray(ctx.athleteIds)?ctx.athleteIds:(ctx.athleteId?[ctx.athleteId]:[]));
    const labels=[...modal.querySelectorAll('.capture-athlete-chip')];
    for(const label of labels){const input=label.querySelector('[data-capture-athlete]'),id=input?.dataset.captureAthlete;if(!id)continue;label.dataset.captureAway=here.has(id)||explicit.has(id)?'0':'1';label.hidden=label.dataset.captureAway==='1';}
    const head=modal.querySelector('.capture-athlete-head b');if(head)head.textContent='Here now';
    const actions=modal.querySelector('.capture-pick-actions');
    if(actions&&!actions.querySelector('[data-capture-show-squad]')){const b=document.createElement('button');b.type='button';b.dataset.captureShowSquad='1';b.textContent='Show squad';b.onclick=()=>{const show=b.dataset.open!=='1';b.dataset.open=show?'1':'0';b.textContent=show?'Here only':'Show squad';for(const label of labels)if(label.dataset.captureAway==='1')label.hidden=!show;};actions.appendChild(b);}
    modal.addEventListener('change',e=>{if(e.target.matches?.('[data-capture-athlete]'))queueMicrotask(()=>tidySelection(modal));});
    modal.querySelector('[data-capture-here]')?.addEventListener('click',()=>queueMicrotask(()=>tidySelection(modal)));
    modal.querySelector('[data-capture-group]')?.addEventListener('click',()=>queueMicrotask(()=>tidySelection(modal)));
    for(const id of ['captureVideo','capturePhoto']){const input=modal.querySelector('#'+id),old=input?.onchange;if(input&&old)input.onchange=async e=>{await old.call(input,e);requestAnimationFrame(refreshDeck);};}
    const note=modal.querySelector('[data-save-note]'),oldNote=note?.onclick;if(note&&oldNote)note.onclick=async e=>{await oldNote.call(note,e);requestAnimationFrame(refreshDeck);};
    tidySelection(modal);return result;
  };

  function athleteLabel(cap){const ids=[...(cap?.athlete_ids||[])];if(cap?.athlete_id&&!ids.includes(cap.athlete_id))ids.push(cap.athlete_id);if(!ids.length)return'GROUP';return ids.map(id=>(M.state.athletes||[]).find(a=>a.id===id)?.full_name||id).join(' + ');}
  async function openEvidence(id){const cap=(M.state.captures||[]).find(c=>c.id===id);if(!cap)return M.toast?.('Capture not found');const host=document.querySelector('#modalHost'),type=String(cap.capture_type||'note').toLowerCase(),title=type==='video'?'Video evidence':type==='photo'?'Photo evidence':type==='voice'?'Voice evidence':'Coach note';host.innerHTML=`<div class="modal-backdrop"><section class="modal wide msos-evidence-viewer"><header><h2>${esc(title)}</h2><button data-close-evidence>×</button></header><div class="modal-body"><div class="capture-truth"><b>${esc(cap.context_label||'Session evidence')}</b><span>${esc(athleteLabel(cap))}</span><span>${esc(cap.created_at||'')}</span></div><div data-evidence-media class="msos-evidence-media">${type==='note'?`<p>${esc(cap.text_content||'')}</p>`:'Loading saved media…'}</div></div><footer><button data-close-evidence>Close</button></footer></section></div>`;M.nav?.openLayer?.('modal');let url='';const close=()=>{if(url)URL.revokeObjectURL(url);host.innerHTML='';M.nav?.dismissLayer?.();};host.querySelectorAll('[data-close-evidence]').forEach(b=>b.onclick=close);if(type==='note')return;const box=host.querySelector('[data-evidence-media]');try{const row=cap.media_id?await M.media?.get?.(cap.media_id):null;if(!row?.blob){box.innerHTML=`<p class="muted">Media metadata is saved${cap.media_path?' and has a cloud path':''}, but the local blob is not available on this device.</p>`;return;}url=URL.createObjectURL(row.blob);if(type==='video')box.innerHTML=`<video controls playsinline preload="metadata" src="${url}"></video>`;else if(type==='photo')box.innerHTML=`<img src="${url}" alt="Saved coaching capture">`;else if(type==='voice')box.innerHTML=`<audio controls src="${url}"></audio>`;else box.innerHTML='<p class="muted">Saved media</p>';}catch(e){box.innerHTML=`<p class="muted">Could not open saved media: ${esc(e.message||e)}</p>`;}}
  function cleanupBoardUrls(){for(const [id,url] of boardUrls){if(!document.querySelector(`[data-msos-capture="${g.CSS?.escape?g.CSS.escape(id):id}"]`)){URL.revokeObjectURL(url);boardUrls.delete(id);}}}
  async function hydrateBoardEvidence(host=document.querySelector('#boardView')){cleanupBoardUrls();const buttons=[...(host?.querySelectorAll?.('[data-msos-capture]')||[])];for(const b of buttons){if(b.dataset.thumbReady==='1')continue;const cap=(M.state.captures||[]).find(c=>c.id===b.dataset.msosCapture);if(!cap?.media_id||!['video','photo'].includes(String(cap.capture_type||'').toLowerCase()))continue;b.dataset.thumbReady='loading';try{const row=await M.media?.get?.(cap.media_id);if(!row?.blob||!b.isConnected)continue;const url=URL.createObjectURL(row.blob);boardUrls.set(cap.id,url);const type=String(cap.capture_type).toLowerCase();b.innerHTML=type==='photo'?`<img src="${url}" alt=""><small>Photo</small>`:`<video muted playsinline preload="metadata" src="${url}"></video><small>Video</small>`;b.dataset.thumbReady='1';}catch{b.dataset.thumbReady='';}}
  }
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-msos-capture]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();openEvidence(b.dataset.msosCapture);},true);

  const applyDeckChrome=()=>{const sticky=document.querySelector('.sticky-actions');if(!sticky)return;const cap=sticky.querySelector('[data-sticky-note]'),voice=sticky.querySelector('[data-sticky-voice]'),video=sticky.querySelector('[data-sticky-video]');if(cap)cap.textContent='Capture';if(voice)voice.hidden=true;if(video)video.hidden=true;sticky.style.gridTemplateColumns='repeat(3,1fr)';};
  if(baseChrome)UI.configureRoleChrome=()=>{const r=baseChrome();applyDeckChrome();return r;};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyDeckChrome,{once:true});else applyDeckChrome();
  C.openEvidence=openEvidence;C.hydrateBoardEvidence=hydrateBoardEvidence;C.activeBoardContext=activeBoardContext;
})(globalThis);
