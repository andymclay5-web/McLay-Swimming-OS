'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const P=M.pwaUpdate={build:'v4-pwa-update-20260824ct',remoteBuild:'',stale:false,checkedAt:'',controllerChanged:false};
  M.pwa=M.pwa||{};
  M.pwa.register=async()=>{
    if(!('serviceWorker'in navigator))return null;
    try{const registration=await navigator.serviceWorker.register('./sw.js?build=20260824ct',{updateViaCache:'none'});M.pwa.registration=registration;try{await registration.update()}catch{}return registration}catch(error){console.warn('[MSOS PWA] Service worker registration failed',error);return null;}
  };
  P.apply=build=>{location.reload();return true;};
  P.notify=build=>M.toast?.(`MSOS ${String(build||'update').split('-').at(-1)} installed · reopen when ready to apply`);
  P.check=async()=>{try{const r=await fetch(`./VERSION.txt?build-check=${Date.now()}`,{cache:'no-store'});if(!r.ok)return false;const txt=(await r.text()).trim(),m=txt.match(/v4-[^\s]+/);P.remoteBuild=m?.[0]||txt;P.checkedAt=new Date().toISOString();P.stale=!!(P.remoteBuild&&M.BUILD&&P.remoteBuild!==M.BUILD);if(P.stale)P.notify(P.remoteBuild);return !P.stale}catch{return false;}};
  if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{if(P.controllerChanged)return;P.controllerChanged=true;P.notify(P.remoteBuild||'new');});
  // Never force location.reload() from a background update. Board, swimmer, coach hub,
  // timing and meet context must survive app switching / foreground resume. A new build
  // is applied only when the coach deliberately reopens/reloads MSOS.
  const boot=()=>setTimeout(P.check,450);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
