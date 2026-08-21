'use strict';
(function(g){
  const M=g.MSOS4,X=M?.eyesUpAY;if(!M?.ui?.renderTV||!X)return;
  const T=M.eyesUpTVAZ={build:'v4-eyes-up-tv-20260822az'},UI=M.ui,base=UI.renderTV.bind(UI);
  const text=v=>String(v??'').replace(/\s+/g,' ').trim(),esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??''),clock=s=>M.util?.clock?M.util.clock(Number(s)):String(s??'');
  const displayName=a=>M.boardEngine?.name?.(a,M.ui?.presentAthletes?.()||[])||text(a?.board_name||a?.preferred_name||a?.full_name||a?.id);
  function workLabel(item){return M.boardEngine?.workLabel?.(item)||text(item?.raw||item?.text||'Current set');}
  function groupHtml(model){
    const groups=model?.prescriptionGroups||[];if(groups.length<=1)return'';
    return`<div class="eyes-up-work-groups">${groups.map(g=>`<div><b>${esc(g.athletes.map(displayName).join(' + ')||'Group')}</b><span>${esc(workLabel(g.item))}</span></div>`).join('')}</div>`;
  }
  function targetHtml(model){
    const bands=(model?.targetBands||[]).filter(x=>x.athletes?.length);if(!bands.length)return'';
    return`<div class="eyes-up-target-bands">${bands.map(b=>{const p=b.target,names=b.athletes.map(displayName).join(' · ');let target='Own feel / cue';if(p?.kind==='physiology')target=p.label;else if(p?.kind==='pace')target=`${p.label}${p.sendOff?` · leave ${clock(p.sendOff)}`:''}`;return`<div><strong>${esc(target)}</strong><span>${esc(names)}</span></div>`;}).join('')}</div>`;
  }
  function overlay(){
    const host=document.querySelector('#tvView');if(!host)return;host.querySelector('[data-eyes-up-tv]')?.remove();const model=X.boardModel();if(model?.status!=='active')return;
    const next=model.nowNext?.next?.itemLabel||'',current=workLabel(model.item),el=document.createElement('section');el.dataset.eyesUpTv='1';el.className='eyes-up-tv';
    el.innerHTML=`<div class="eyes-up-tv-now"><div><small>NOW</small><h2>${esc(current)}</h2></div><b class="${model.timingOwnership==='coach'?'coach':'self'}">${esc(model.timingLabel)}</b></div>${next?`<div class="eyes-up-tv-next"><small>NEXT</small><span>${esc(next)}</span></div>`:''}${groupHtml(model)}${targetHtml(model)}`;
    const top=host.querySelector('.msos-tv-top');if(top)top.insertAdjacentElement('afterend',el);else host.prepend(el);
  }
  UI.renderTV=()=>{base();requestAnimationFrame(overlay);};
  T.overlay=overlay;T.targetHtml=targetHtml;T.groupHtml=groupHtml;
  if(M.state?.settings?.view==='tv')requestAnimationFrame(overlay);
})(globalThis);
