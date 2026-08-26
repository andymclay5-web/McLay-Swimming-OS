'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M?.ui)return;
  const BUILD='v4-meet-program-ops-bridge-20260827a2';
  let retainedOps=null,syncTimer=null,observer=null,mountQueued=false;

  const meetHost=()=>document.querySelector('#meetView');
  const programme=()=>meetHost()?.querySelector('[data-meet-program-ba]')||null;

  function workingCard(){
    const h=meetHost();
    return h?.querySelector('[data-meet-ops-av]')||retainedOps||null;
  }

  function mount(){
    mountQueued=false;
    const h=meetHost(),p=programme();
    if(!h||!p||M.state?.settings?.view!=='meet')return false;
    const ops=h.querySelector('[data-meet-ops-av]')||retainedOps;
    if(!ops)return false;
    retainedOps=ops;
    if(ops.hidden)ops.hidden=false;
    ops.dataset.meetProgramWorkingCard='1';
    const sticky=p.querySelector('.ba-sticky');
    if(sticky&&ops.previousElementSibling!==sticky)sticky.after(ops);
    return true;
  }

  function queueMount(){
    if(mountQueued)return;
    mountQueued=true;
    queueMicrotask(mount);
  }

  function scrollWorkingCard(){
    requestAnimationFrame(()=>workingCard()?.scrollIntoView?.({block:'start',behavior:'smooth'}));
  }

  function syncSelected({scroll=false}={}){
    const key=M.state?.meetOps?.selectedRaceKey||M.state?.meetProgramBA?.selectedKey||'';
    if(!key){mount();return false}
    if(M.meetOpsEngine?.selectKey){
      M.meetOpsEngine.selectKey(key,{scroll:false});
      queueMicrotask(()=>{
        mount();
        if(scroll)scrollWorkingCard();
      });
      return true;
    }
    mount();
    if(scroll)scrollWorkingCard();
    return false;
  }

  function scheduleSync(scroll=false){
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>syncSelected({scroll}),0);
  }

  function onProgrammeClick(e){
    if(!e.target?.closest)return;
    if(e.target.closest('[data-ba-row].aqua,[data-ba-jump-race],[data-ba-athlete]'))scheduleSync(true);
  }

  function observe(){
    const h=meetHost();
    if(!h||observer)return;
    observer=new MutationObserver(queueMount);
    observer.observe(h,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  }

  function boot(){
    observe();
    setTimeout(()=>{
      mount();
      const selected=M.state?.meetOps?.selectedRaceKey||M.state?.meetProgramBA?.selectedKey||'';
      if(selected)syncSelected({scroll:false});
    },0);
  }

  document.addEventListener('click',onProgrammeClick,false);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&M.state?.settings?.view==='meet')setTimeout(mount,0)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

  M.meetProgramOpsBridge={build:BUILD,mount,syncSelected,workingCard};
})(globalThis);
