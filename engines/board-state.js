'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.ui)return;
  const S=M.boardStateEngine={build:'v4-board-state-20260820o'};
  const saveUi=()=>{try{M.storageEngine?.saveUi?.(M.state)}catch{}};
  function remember(btn){const row=btn.closest?.('.msos-work-row');M.state.settings=M.state.settings||{};M.state.settings.boardTargetAnchor={itemId:btn.dataset.msosTimes,top:row?.getBoundingClientRect?.().top??null,y:window.scrollY||0};}
  function render(){M.ui?.renderBoard?.()}
  document.addEventListener('click',e=>{
    const times=e.target.closest?.('#boardView [data-msos-times],#tvView [data-msos-times]');
    if(times){e.preventDefault();e.stopImmediatePropagation();M.state.settings=M.state.settings||{};remember(times);M.state.settings.boardExpandedTargetId=M.state.settings.boardExpandedTargetId===times.dataset.msosTimes?'':times.dataset.msosTimes;saveUi();render();return;}
    const mode=e.target.closest?.('#boardView [data-msos-mode]');
    if(mode){e.preventDefault();e.stopImmediatePropagation();M.state.settings=M.state.settings||{};M.state.settings.boardFocusMode=M.state.settings.boardFocusMode===false;M.state.settings.boardExpandedTargetId='';saveUi();render();return;}
    const block=e.target.closest?.('#boardView [data-msos-block]');
    if(block){e.preventDefault();e.stopImmediatePropagation();const session=M.currentSession?.();if(!session)return;M.state.settings=M.state.settings||{};M.state.settings.boardFocusMode=true;M.state.settings.boardExpandedTargetId='';M.state.settings.boardBlockBySession=M.state.settings.boardBlockBySession||{};M.state.settings.boardBlockBySession[session.id]=block.dataset.msosBlock;saveUi();render();}
  },true);
  S.saveUi=saveUi;
})(globalThis);
