'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M)return;
  const BUILD='v4-meet-program-cold-open-20260827a';

  function activate(){
    if(M.state?.settings?.view!=='meet')return false;
    if(!document.querySelector('#meetView [data-meet-program-ba]'))return false;
    const B=M.meetProgramOpsBridge;
    if(!B?.activate)return false;
    B.activate();
    B.enhance?.();
    return true;
  }

  function schedule(){
    queueMicrotask(()=>{
      if(activate())return;
      setTimeout(activate,0);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule()});
  addEventListener('pageshow',schedule);

  M.meetProgramColdOpen={build:BUILD,activate};
})(globalThis);
