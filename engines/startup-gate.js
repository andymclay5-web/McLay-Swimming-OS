'use strict';
(function(g){
  const M=g.MSOS4,UI=M?.ui,S=M?.storageEngine;if(!M||!UI?.renderCurrent||!S?.readyPromise)return;
  const G=M.startupGate={build:'v4-startup-gate-20260820s2'},base=UI.renderCurrent.bind(UI);let released=!!S.ready,pending=false;
  function loading(){const h=document.querySelector('#boardView');if(h&&!h.innerHTML.trim())h.innerHTML='<section class="empty-card"><h2>Loading saved session…</h2></section>';}
  function clearTransient(){M.state.settings=M.state.settings||{};if(G.transientsCleared)return;M.state.settings.boardExpandedTargetId='';M.state.settings.expandedItemId='';G.transientsCleared=true;S.saveUi?.(M.state);}
  const renderersReady=()=>typeof UI.renderBoard==='function';
  UI.renderCurrent=(...args)=>{if((!released&&!S.ready)||!renderersReady()){pending=true;loading();return;}released=true;clearTransient();G.rendered=true;return base(...args);};
  S.readyPromise.finally(()=>{released=true;clearTransient();pending=false;let tries=0;const go=()=>{if(G.rendered)return;if(renderersReady()||++tries>150){UI.renderCurrent();return;}requestAnimationFrame(go);};requestAnimationFrame(go);});
  G.pending=()=>pending;G.ready=()=>released;
})(globalThis);
