'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.actions?.openCapture||!M?.ui)return;
  const UI=M.ui,C=M.captureUI={build:'v4-capture-ui-20260820j'},baseOpen=M.actions.openCapture.bind(M.actions),baseChrome=UI.configureRoleChrome?.bind(UI);
  const selectedCount=modal=>[...modal.querySelectorAll('[data-capture-athlete]')].filter(x=>x.checked).length;
  const tidySelection=modal=>{const label=modal.querySelector('#captureSelectionLabel');if(label)label.textContent=`${selectedCount(modal)} selected`;};

  M.actions.openCapture=(ctx={})=>{
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
    tidySelection(modal);return result;
  };

  const applyDeckChrome=()=>{const sticky=document.querySelector('.sticky-actions');if(!sticky)return;const cap=sticky.querySelector('[data-sticky-note]'),voice=sticky.querySelector('[data-sticky-voice]'),video=sticky.querySelector('[data-sticky-video]');if(cap)cap.textContent='Capture';if(voice)voice.hidden=true;if(video)video.hidden=true;sticky.style.gridTemplateColumns='repeat(3,1fr)';};
  if(baseChrome)UI.configureRoleChrome=()=>{const r=baseChrome();applyDeckChrome();return r;};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyDeckChrome,{once:true});else applyDeckChrome();
})(globalThis);
