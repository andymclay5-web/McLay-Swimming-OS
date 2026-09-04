'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.ui)return;
  const BUILD='v4-meet-sunday-smooth-20260830a';
  let timers=[];
  function inMeet(){return M.state?.settings?.view==='meet'}
  function programme(){return document.querySelector('#meetView [data-meet-program-ba]')}
  const text=el=>(el?.textContent||'').replace(/\s+/g,' ').trim();
  function cleanRaceCards(){
    if(!inMeet())return;
    for(const intel of document.querySelectorAll('#meetView [data-meet-program-ba] .ba-intel')){
      if(!intel.querySelector('[data-msos-race-simple]'))continue;
      for(const el of intel.querySelectorAll('button,label')){
        if(/^quick note$/i.test(text(el))){el.dataset.msosOldQuickNote='1';el.hidden=true}
      }
      for(const mic of intel.querySelectorAll('[data-msos-race-mic]')){mic.dataset.msosMicChoice='1';mic.hidden=true}
    }
  }
  function hideEmptyRaceQueue(){
    if(!inMeet()||!programme()||!(M.state?.meetFieldDeck?.races||[]).length)return;
    const host=document.querySelector('#meetView');if(!host)return;
    const heads=[...host.querySelectorAll('h1,h2,h3,h4,strong,b,div,span')].filter(el=>/^race queue$/i.test(text(el)));
    for(const h of heads){
      if(h.closest('[data-meet-program-ba]'))continue;
      let hidden=false,p=h;
      for(let i=0;i<4&&p&&p!==host;i++,p=p.parentElement){
        const t=text(p);
        if(/race queue/i.test(t)&&/no entries loaded/i.test(t)&&t.length<240){p.dataset.msosEmptyRaceQueue='1';p.hidden=true;hidden=true;break}
      }
      if(!hidden){h.dataset.msosEmptyRaceQueue='1';h.hidden=true;let n=h.nextElementSibling;if(n&&/no entries loaded/i.test(text(n))){n.dataset.msosEmptyRaceQueue='1';n.hidden=true}}
    }
  }
  function run(){
    if(!inMeet())return;
    try{M.meetSundaySimple?.enhance?.()}catch{}
    cleanRaceCards();
    hideEmptyRaceQueue();
  }
  function schedule(){
    for(const id of timers)clearTimeout(id);timers=[];
    for(const ms of [0,120,350,800,1500,3000,5000,7500])timers.push(setTimeout(run,ms));
  }
  function style(){
    if(document.getElementById('meet-tomorrow-usable-style'))return;
    const s=document.createElement('style');s.id='meet-tomorrow-usable-style';
    s.textContent='#meetView [data-msos-old-quick-note="1"],#meetView [data-msos-mic-choice="1"],#meetView [data-msos-empty-race-queue="1"]{display:none!important}';document.head.appendChild(s);
  }
  function install(){
    style();schedule();
    document.addEventListener('click',e=>{if(e.target.closest?.('#meetView')||e.target.closest?.('#meetModeBtn')||e.target.closest?.('[data-nav="meet"]'))schedule()},false);
    document.addEventListener('change',e=>{if(e.target.closest?.('#meetView'))schedule()},false);
    g.addEventListener?.('pageshow',schedule);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  M.meetTomorrowUsable={build:BUILD,run,schedule,cleanRaceCards,hideEmptyRaceQueue};
})(globalThis);
