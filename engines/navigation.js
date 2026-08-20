'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.nav||!M?.ui)return;
  const N=M.nav,UI=M.ui,V=M.navigationEngine={build:'v4-navigation-20260820p'};
  const views=new Set([...(N.views||['board','tv','hub','swimmer','meet','athletes','roll','times','connection','guardian']),'reports']);
  const active=view=>{if(!views.has(view))view='board';document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===`${view}View`));document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===view));document.body.dataset.msosView=view;};
  const saveScroll=()=>{try{N.rememberScroll?.()}catch{}};const saveUi=()=>{try{M.storageEngine?.saveUi?.(M.state)}catch{}};
  const closeTransient=()=>{const h=document.querySelector('#modalHost');if(h)h.innerHTML='';if(M.state?.settings)M.state.settings.expandedItemId='';};
  V.go=(view,{push=true,restore=true}={})=>{if(!views.has(view))view='board';saveScroll();closeTransient();M.state.settings=M.state.settings||{};M.state.settings.view=view;active(view);saveUi();if(push){try{history.pushState(N.state?.(view)||{msos:true,msosView:view,sessionId:M.state.settings.selectedSessionId||''},'',`#${view}`)}catch{}}UI.renderCurrent?.();if(view==='reports')M.reportingUI?.render?.();active(view);if(restore)try{N.restoreScroll?.(view)}catch{}else requestAnimationFrame(()=>scrollTo(0,0));};
  N.show=V.go;N.activateView=active;
  function openAthlete(id){if(!id)return;M.state.settings.selectedAthleteId=id;M.state.settings.selectedSwimmerId=id;saveUi();V.go((M.access?.role?.()||'owner')==='swimmer'?'swimmer':'athletes',{restore:false});}
  document.addEventListener('click',e=>{
    const nav=e.target.closest?.('.bottom-nav [data-nav]');if(nav){e.preventDefault();e.stopImmediatePropagation();V.go(nav.dataset.nav,{restore:true});return;}
    const report=e.target.closest?.('#reportsShortcut,[data-msos-reports]');if(report){e.preventDefault();e.stopImmediatePropagation();V.go('reports',{restore:false});return;}
    const roll=e.target.closest?.('[data-msos-roll]');if(roll){e.preventDefault();e.stopImmediatePropagation();V.go('roll',{restore:false});return;}
    const times=e.target.closest?.('[data-msos-t400]');if(times){e.preventDefault();e.stopImmediatePropagation();V.go('times',{restore:false});return;}
    const swimmers=e.target.closest?.('[data-msos-swimmers]');if(swimmers){e.preventDefault();e.stopImmediatePropagation();V.go((M.access?.role?.()||'owner')==='swimmer'?'swimmer':'athletes',{restore:false});return;}
    const ath=e.target.closest?.('[data-msos-ath]');if(ath){e.preventDefault();e.stopImmediatePropagation();openAthlete(ath.dataset.msosAth);return;}
    const timeRow=e.target.closest?.('#timesView .time-row,#timesView .timing-evidence-row');if(timeRow&&!e.target.closest?.('button,input,select,label')){const n=timeRow.querySelector('strong')?.textContent?.trim(),a=(M.state.athletes||[]).find(x=>String(x.full_name||'').trim()===n);if(a){e.preventDefault();e.stopImmediatePropagation();openAthlete(a.id);return;}}
  },true);
  const board=UI.renderBoard?.bind(UI),tv=UI.renderTV?.bind(UI);if(board)UI.renderBoard=(...a)=>{const r=board(...a);active(M.state?.settings?.view||'board');return r;};if(tv)UI.renderTV=(...a)=>{const r=tv(...a);active(M.state?.settings?.view||'tv');return r;};
})(globalThis);
