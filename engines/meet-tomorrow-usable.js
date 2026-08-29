'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.ui)return;
  const BUILD='v4-meet-tomorrow-usable-20260829a';
  let timers=[];
  function inMeet(){return M.state?.settings?.view==='meet'}
  function programme(){return document.querySelector('#meetView [data-meet-program-ba]')}
  function hideEmptyLiveDeck(){
    if(!inMeet()||!programme()||!(M.state?.meetFieldDeck?.races||[]).length)return;
    const host=document.querySelector('#meetView');if(!host)return;
    const nodes=[...host.querySelectorAll('h1,h2,h3,h4,strong,b,div,span')].filter(el=>/^live meet deck$/i.test((el.textContent||'').replace(/\s+/g,' ').trim()));
    for(const heading of nodes){
      let p=heading;
      for(let i=0;i<6&&p&&p!==host;i++,p=p.parentElement){
        if(p.matches?.('[data-meet-program-ba]')||p.querySelector?.('[data-meet-program-ba]'))break;
        const t=(p.textContent||'').replace(/\s+/g,' ').trim();
        if(/live meet deck/i.test(t)&&(/race queue/i.test(t)||/no entries loaded/i.test(t)||/0\s*\/\s*0\s*complete/i.test(t))){
          p.dataset.msosEmptyLiveDeck='1';p.hidden=true;break;
        }
      }
    }
  }
  function run(){
    if(!inMeet())return;
    try{M.meetSundaySimple?.enhance?.()}catch{}
    hideEmptyLiveDeck();
  }
  function schedule(){
    for(const id of timers)clearTimeout(id);timers=[];
    for(const ms of [0,120,350,800,1500,3000,5000,7500])timers.push(setTimeout(run,ms));
  }
  function style(){
    if(document.getElementById('meet-tomorrow-usable-style'))return;
    const s=document.createElement('style');s.id='meet-tomorrow-usable-style';
    s.textContent='#meetView [data-msos-empty-live-deck="1"]{display:none!important}';document.head.appendChild(s);
  }
  function install(){
    style();schedule();
    document.addEventListener('click',e=>{if(e.target.closest?.('#meetView')||e.target.closest?.('#meetModeBtn'))schedule()},false);
    document.addEventListener('change',e=>{if(e.target.closest?.('#meetView'))schedule()},false);
    g.addEventListener?.('pageshow',schedule);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  M.meetTomorrowUsable={build:BUILD,run,schedule,hideEmptyLiveDeck};
})(globalThis);
