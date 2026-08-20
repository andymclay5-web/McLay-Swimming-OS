'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const P=M.pwaUpdate={build:'v4-pwa-update-20260820y',remoteBuild:'',stale:false,checkedAt:''};
  M.pwa=M.pwa||{};
  M.pwa.register=async()=>{
    if(!('serviceWorker'in navigator))return null;
    try{
      const registration=await navigator.serviceWorker.register('./sw.js?build=20260820y',{updateViaCache:'none'});
      M.pwa.registration=registration;
      try{await registration.update();}catch{}
      return registration;
    }catch(error){console.warn('[MSOS PWA] Service worker registration failed',error);return null;}
  };
  P.check=async()=>{
    try{
      const r=await fetch(`./VERSION.txt?build-check=${Date.now()}`,{cache:'no-store'});if(!r.ok)return false;
      const txt=(await r.text()).trim(),m=txt.match(/v4-[^\s]+/);P.remoteBuild=m?.[0]||txt;P.checkedAt=new Date().toISOString();P.stale=!!(P.remoteBuild&&M.BUILD&&P.remoteBuild!==M.BUILD);
      if(P.stale)M.toast?.(`MSOS update ready · ${P.remoteBuild.split('-').at(-1)}`);
      return !P.stale;
    }catch{return false;}
  };
  P.apply=()=>location.reload();
  const boot=()=>{M.pwa.register?.().finally(()=>setTimeout(P.check,300));};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
