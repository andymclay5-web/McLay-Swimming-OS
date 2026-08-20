'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const P=M.pwaUpdate={build:'v4-pwa-update-20260820z',remoteBuild:'',stale:false,checkedAt:'',controllerChanged:false};
  const LIVE=new Set(['board','tv','roll','times','meet','swimmer']);
  const liveView=()=>LIVE.has(M.state?.settings?.view||'board');
  const reloadKey=build=>`msos_reload_${build||'next'}`;
  M.pwa=M.pwa||{};
  M.pwa.register=async()=>{
    if(!('serviceWorker'in navigator))return null;
    try{const registration=await navigator.serviceWorker.register('./sw.js?build=20260820z',{updateViaCache:'none'});M.pwa.registration=registration;try{await registration.update()}catch{}return registration}catch(error){console.warn('[MSOS PWA] Service worker registration failed',error);return null;}
  };
  P.apply=build=>{const key=reloadKey(build||P.remoteBuild);if(sessionStorage.getItem(key))return false;sessionStorage.setItem(key,'1');location.reload();return true;};
  P.notify=build=>M.toast?.(`MSOS ${String(build||'update').split('-').at(-1)} installed · reopen to apply`);
  P.check=async()=>{try{const r=await fetch(`./VERSION.txt?build-check=${Date.now()}`,{cache:'no-store'});if(!r.ok)return false;const txt=(await r.text()).trim(),m=txt.match(/v4-[^\s]+/);P.remoteBuild=m?.[0]||txt;P.checkedAt=new Date().toISOString();P.stale=!!(P.remoteBuild&&M.BUILD&&P.remoteBuild!==M.BUILD);if(P.stale){if(liveView())P.notify(P.remoteBuild);else setTimeout(()=>P.apply(P.remoteBuild),80);}return !P.stale}catch{return false;}};
  if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{if(P.controllerChanged)return;P.controllerChanged=true;if(liveView())P.notify(P.remoteBuild||'new');else P.apply(P.remoteBuild||'controller');});
  const boot=()=>setTimeout(P.check,450);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
