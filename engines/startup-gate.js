'use strict';
(function(g){
  const M=g.MSOS4,UI=M?.ui,S=M?.storageEngine;if(!M||!UI?.renderCurrent||!S?.readyPromise)return;
  const G=M.startupGate={build:'v4-startup-gate-20260826-coherent-r2'},base=UI.renderCurrent.bind(UI);let released=false,pending=false,releaseScheduled=false;
  const boardReady=()=>typeof UI.renderBoard==='function';
  const canRender=()=>!!S.ready&&boardReady();
  function loading(){const h=document.querySelector('#boardView');if(h&&!h.innerHTML.trim())h.innerHTML='<section class="empty-card"><h2>Loading saved session…</h2></section>';}
  function clearTransient(){M.state.settings=M.state.settings||{};if(G.transientsCleared)return;M.state.settings.boardExpandedTargetId='';M.state.settings.expandedItemId='';G.transientsCleared=true;S.saveUi?.(M.state);}
  function scheduleRelease(){
    if(releaseScheduled)return;releaseScheduled=true;
    const tick=()=>{
      if(canRender()){
        releaseScheduled=false;released=true;clearTransient();pending=false;
        requestAnimationFrame(()=>{if(!G.rendered)UI.renderCurrent();});
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  UI.renderCurrent=(...args)=>{
    if(!canRender()){
      pending=true;loading();scheduleRelease();return;
    }
    released=true;clearTransient();G.rendered=true;return base(...args);
  };
  S.readyPromise.finally(scheduleRelease);
  if(canRender())scheduleRelease();
  G.pending=()=>pending;G.ready=()=>released&&canRender();
})(globalThis);
