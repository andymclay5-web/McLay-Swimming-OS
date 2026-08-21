'use strict';
(function(g){
  const M=g.MSOS4,V=M?.voiceRouterAV,C=M?.contextEngineAV;if(!M||!V||!C)return;
  const BUILD='v4-context-voice-foundation-20260822av',U=M.voiceUIAV={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  function install(){
    const voice=document.querySelector('[data-sticky-voice]');if(!voice)return;voice.hidden=false;voice.textContent='Talk';voice.title='One-shot coaching voice capture';
    const sticky=document.querySelector('.sticky-actions');if(sticky)sticky.style.gridTemplateColumns='repeat(4,1fr)';
    voice.onclick=e=>{e.preventDefault();if(!V.browserRecognitionAvailable()){M.toast?.('Speech recognition is not available in this browser yet. Voice bridge is still being built.');return;}voice.disabled=true;voice.textContent='Listening…';let done=false;const finish=()=>{if(done)return;done=true;voice.disabled=false;voice.textContent='Talk';};try{V.listenOnce({onResult:(transcript,result)=>{finish();M.toast?.(`${text(transcript)}${result?.speak?` · ${result.speak}`:''}`);if(result?.speak&&/^query_/.test(result.parsed?.intent||''))V.speak(result.speak);if(result?.action==='video'&&M.actions?.openCapture)M.actions.openCapture({athleteId:result.athlete?.id||'',mode:'video'});},onError:err=>{finish();M.toast?.(`Voice: ${err?.error||err?.message||'not captured'}`);}});}catch(err){finish();M.toast?.(err.message||String(err));}}
  }
  function contextBadge(){const board=document.querySelector('#boardView');if(!board)return;board.querySelector('[data-av-context]')?.remove();const ctx=C.now();if(ctx.status!=='active')return;const el=document.createElement('div');el.dataset.avContext='1';el.className='av-context-badge';el.innerHTML=`<b>${Math.round(ctx.confidence*100)}%</b><span>${text(ctx.blockLabel)}${ctx.rep?` · rep ${ctx.rep}`:''}</span><small>${ctx.source}${ctx.driftSeconds?` · ${ctx.driftSeconds>0?'+':''}${Math.round(ctx.driftSeconds/60)}m`:''}</small>`;const anchor=board.querySelector('.msos-board-block')||board.firstElementChild;if(anchor)anchor.insertAdjacentElement('beforebegin',el);else board.prepend(el);}
  const priorBoard=M.ui?.renderBoard?.bind(M.ui);if(priorBoard)M.ui.renderBoard=()=>{priorBoard();requestAnimationFrame(contextBadge);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{install();requestAnimationFrame(contextBadge);},{once:true});else{install();requestAnimationFrame(contextBadge);}
  U.install=install;U.contextBadge=contextBadge;
})(globalThis);
