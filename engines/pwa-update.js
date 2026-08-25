'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const P=M.pwaUpdate={build:'v4-pwa-update-final-20260825a',remoteBuild:'',stale:false,checkedAt:'',controllerChanged:false};
  P.apply=()=>{location.reload();return true};
  P.notify=build=>M.toast?.(`MSOS ${String(build||'update').split('-').at(-1)} installed · reopen when ready to apply`);
  P.check=async()=>{try{const r=await fetch(`./VERSION.txt?build-check=${Date.now()}`,{cache:'no-store'});if(!r.ok)return false;const txt=(await r.text()).trim(),m=txt.match(/v4-[^\s]+/);P.remoteBuild=m?.[0]||txt;P.checkedAt=new Date().toISOString();P.stale=!!(P.remoteBuild&&M.BUILD&&P.remoteBuild!==M.BUILD);if(P.stale)P.notify(P.remoteBuild);return !P.stale}catch{return false}};
  if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{if(P.controllerChanged)return;P.controllerChanged=true;P.notify(P.remoteBuild||M.BUILD||'new')});
  // Registration has one owner in app.js. This module only observes update state and never forces a reload.
  const boot=()=>setTimeout(P.check,450);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
