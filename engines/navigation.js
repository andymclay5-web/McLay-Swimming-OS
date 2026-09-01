'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.nav||!M?.ui)return;
  const N=M.nav,UI=M.ui,V=M.navigationEngine={build:'v4-navigation-session-selection-authority-20260901'};
  const views=new Set([...(N.views||['board','tv','hub','swimmer','meet','athletes','roll','times','connection','guardian']),'reports','data']);
  const active=view=>{if(!views.has(view))view='board';document.querySelectorAll('.view').forEach(x=>{const on=x.id===`${view}View`;x.classList.toggle('active',on);x.hidden=!on;if('inert'in x)x.inert=!on});document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===view));document.body.dataset.msosView=view;document.body.dataset.msosSurface=view==='meet'?'meet':'training';};
  const saveUi=()=>{try{M.storageEngine?.saveUi?.(M.state)}catch{}};
  const scrollKey=view=>`${M.state?.settings?.selectedSessionId||'none'}:${view||M.state?.settings?.view||'board'}`;
  const rememberScroll=()=>{try{M.state.settings=M.state.settings||{};M.state.settings.viewScroll=M.state.settings.viewScroll||{};M.state.settings.viewScroll[scrollKey()]=Math.max(0,Math.round(window.scrollY||0));saveUi()}catch{}};
  const restoreScroll=view=>{const y=Number(M.state?.settings?.viewScroll?.[scrollKey(view)]||0);requestAnimationFrame(()=>window.scrollTo(0,y));};
  const closeTransient=()=>{const h=document.querySelector('#modalHost');if(h)h.innerHTML='';if(M.state?.settings)M.state.settings.expandedItemId='';};
  const renderExtra=view=>{if(view==='reports')M.reportingUI?.render?.();if(view==='data')M.dataAdminUI?.render?.();M.dataAdminUI?.ensureShortcut?.(view);};
  const paint=view=>{active(view);if(view==='reports'||view==='data'){UI.renderHeader?.();renderExtra(view);active(view);return}UI.renderCurrent?.();active(view);};

  V.go=(view,{push=true,restore=true,restoreScroll:restoreOpt}={})=>{
    if(!views.has(view))view='board';
    M.boardStateEngine?.cancelWork?.();rememberScroll();closeTransient();
    M.state.settings=M.state.settings||{};M.state.settings.view=view;M.state.settings.surfaceMode=view==='meet'?'meet':'training';
    paint(view);
    if(push){try{history.pushState(N.state?.(view)||{msos:true,msosView:view},'',`#${view}`)}catch{}}
    saveUi();
    const doRestore=restoreOpt===undefined?restore:restoreOpt;if(doRestore)restoreScroll(view);else requestAnimationFrame(()=>window.scrollTo(0,0));
  };
  V.rememberScroll=rememberScroll;V.restoreScroll=restoreScroll;V.clearTransient=closeTransient;V.activateView=active;

  N.show=V.go;N.rememberScroll=rememberScroll;N.restoreScroll=restoreScroll;N.clearTransient=closeTransient;N.activateView=active;
  N.dismissLayer=()=>{const layer=history.state?.layer;if(layer){closeTransient();history.back();return true}closeTransient();M.boardStateEngine?.cancelWork?.();paint(M.state?.settings?.view||'board');saveUi();return false;};
  // Browser/Android history owns view/detail only. It must never select a different training session.
  N.applyHistory=state=>{M.boardStateEngine?.cancelWork?.();const view=views.has(state?.msosView)?state.msosView:'board';M.state.settings=M.state.settings||{};M.state.settings.view=view;M.state.settings.surfaceMode=view==='meet'?'meet':'training';if(!state?.layer)closeTransient();else if(state.layer.type==='item')M.state.settings.expandedItemId=state.layer.id;paint(view);saveUi();restoreScroll(view);};

  let rootBackArmed=false;
  N.init=()=>{if(V.initialized)return;V.initialized=true;const initial=views.has(M.state?.settings?.view)?M.state.settings.view:'board';M.state.settings.surfaceMode=initial==='meet'?'meet':'training';active(initial);try{history.replaceState(N.state?.(initial,{exitGuard:true})||{msos:true,msosView:initial,exitGuard:true},'',`#${initial}`);history.pushState(N.state?.(initial)||{msos:true,msosView:initial},'',`#${initial}`)}catch{}
    addEventListener('popstate',e=>{if(e.state?.exitGuard){if(rootBackArmed){history.back();return}rootBackArmed=true;M.toast?.('Press back again to exit');try{history.pushState(N.state?.(M.state.settings.view)||{msos:true,msosView:M.state.settings.view},'',`#${M.state.settings.view}`)}catch{}setTimeout(()=>rootBackArmed=false,1800);return}if(e.state?.msos)N.applyHistory(e.state)});
    addEventListener('pagehide',rememberScroll);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')rememberScroll();else if(document.visibilityState==='visible')restoreScroll(M.state.settings.view)});renderExtra(initial);
  };

  function openAthlete(id){if(!id)return;M.state.settings.selectedAthleteId=id;M.state.settings.selectedSwimmerId=id;saveUi();V.go((M.access?.role?.()||'owner')==='swimmer'?'swimmer':'athletes',{restore:false});}
  document.addEventListener('click',e=>{
    const nav=e.target.closest?.('.bottom-nav [data-nav]');if(nav){e.preventDefault();V.go(nav.dataset.nav,{restore:true});return}
    const report=e.target.closest?.('#reportsShortcut,[data-msos-reports]');if(report){e.preventDefault();V.go('reports',{restore:false});return}
    const data=e.target.closest?.('[data-msos-data]');if(data){e.preventDefault();V.go('data',{restore:false});return}
    const roll=e.target.closest?.('[data-msos-roll]');if(roll){e.preventDefault();V.go('roll',{restore:false});return}
    const times=e.target.closest?.('[data-msos-t400]');if(times){e.preventDefault();V.go('times',{restore:false});return}
    const swimmers=e.target.closest?.('[data-msos-swimmers]');if(swimmers){e.preventDefault();V.go((M.access?.role?.()||'owner')==='swimmer'?'swimmer':'athletes',{restore:false});return}
    const ath=e.target.closest?.('[data-msos-ath]');if(ath){e.preventDefault();openAthlete(ath.dataset.msosAth);return}
    const timeRow=e.target.closest?.('#timesView .time-row,#timesView .timing-evidence-row');if(timeRow&&!e.target.closest?.('button,input,select,label')){const n=timeRow.querySelector('strong')?.textContent?.trim(),a=(M.state.athletes||[]).find(x=>String(x.full_name||'').trim()===n);if(a){e.preventDefault();openAthlete(a.id)}}
  });
})(globalThis);
