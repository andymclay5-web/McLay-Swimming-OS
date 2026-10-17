'use strict';
// Coming back to MSOS (16 Oct 2026). Andy: "still having to reload app if I leave, I need to be able to leave for up to
// 10 mins and come back to where I was straight away without reloading."
//
// Owner of one thing: putting the coach back where they were after leaving the app. Two cases:
//  1. The phone kept MSOS alive (the usual case). Nothing reloads; but every background job that had been waiting
//     (team sync, results refresh, swimmer-app refresh, roster pull) used to fire the moment the screen came back,
//     all at once, re-drawing the Board under the coach's thumb on a slow pool connection. Now the app is given a
//     quiet 20 seconds after coming back before that catch-up runs (app.js team-sync tick reads quietUntil()). Local
//     saves are never delayed -- they happen on the phone the moment the coach acts.
//  2. The phone threw MSOS out of memory while it was in the background (Android does this; Chrome then reloads the
//     page on return, which is what "having to reload" looks like). The app can't stop the phone doing that, so
//     instead it remembers, at the moment the coach leaves, exactly where they were -- the session, the screen, the
//     set on the Board (whole session or which set), how far down they had scrolled and the swimmer screen if it was
//     open -- and, when the page was thrown out (not when the coach deliberately reloaded or closed it) and the
//     coach is back within 15 minutes, puts all of that back as soon as the app has loaded. It only ever restores
//     the coach's own last position on the same session; it never picks a different session.
// It also keeps a short log of returns (how long away, kept alive or thrown out, slowest freeze after coming back)
// on the Connection screen, so a real-phone report can say which case happened.
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const R=M.resume={build:'v4-resume-20261016',QUIET_MS:20000,MAX_AGE_MS:15*60*1000};
  const KEY='msos-resume-v1',LOG='msos-resume-log';
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
  let hiddenAt=0,quietUntil=0;
  R.quietUntil=()=>quietUntil;
  R.isQuiet=()=>Date.now()<quietUntil;

  function snapshot(){const s=M.state.settings||{},sid=s.selectedSessionId||'';const sw=document.querySelector('[data-tv-swimmer-screen]')?M.tvDisplay?.swimmerScreen?.():null;
    return{at:Date.now(),unloaded:false,sessionId:sid,view:s.view||'board',scrollY:Math.max(0,Math.round(g.scrollY||0)),boardBlock:s.boardBlockBySession?.[sid]||'',focus:s.boardFocusMode!==false,swimmer:sw&&sw.id?{id:sw.id,tab:sw.tab||'profile'}:null};}
  R.snapshot=snapshot;
  function logReturn(entry){const log=(read(LOG)||[]).slice(-9);log.push(entry);write(LOG,log);}
  R.log=()=>read(LOG)||[];
  // Slowest main-thread block in the 10 seconds after coming back (a "freeze" the coach would feel).
  function watchSlowest(entry){let worst=0,obs=null;try{obs=new PerformanceObserver(list=>{for(const e of list.getEntries())worst=Math.max(worst,Math.round(e.duration));});obs.observe({type:'longtask',buffered:false});}catch{}
    setTimeout(()=>{try{obs?.disconnect();}catch{}entry.slowestMs=worst;const log=read(LOG)||[];const i=log.findIndex(x=>x.at===entry.at);if(i>=0){log[i]=entry;write(LOG,log);}},10000);}

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){hiddenAt=Date.now();write(KEY,{...snapshot(),unloaded:unloading});return;}
    if(document.visibilityState==='visible'&&hiddenAt){const away=Date.now()-hiddenAt;hiddenAt=0;if(away>=30000)quietUntil=Date.now()+R.QUIET_MS;
      const entry={at:Date.now(),awayMs:away,kind:'kept alive'};logReturn(entry);watchSlowest(entry);}
  });
  // A deliberate reload or close: don't restore over it next time.
  // (browsers fire pagehide and the last visibilitychange in either order while unloading, so both mark it)
  let unloading=false;
  addEventListener('pagehide',e=>{if(e.persisted)return;unloading=true;const s=read(KEY);if(s){s.unloaded=true;write(KEY,s);}});

  // ---------- after the phone threw the page out: put the coach back ----------
  function shouldRestore(s){if(!s||!s.at)return false;if(Date.now()-s.at>R.MAX_AGE_MS)return false;if(s.unloaded&&document.wasDiscarded!==true)return false;
    return !!s.sessionId&&s.sessionId===M.state.settings?.selectedSessionId;}
  R.shouldRestore=shouldRestore;
  function restore(s){const st=M.state.settings=M.state.settings||{};
    if(s.boardBlock){st.boardBlockBySession=st.boardBlockBySession||{};st.boardBlockBySession[s.sessionId]=s.boardBlock;}
    st.boardFocusMode=s.focus!==false;try{M.storageEngine?.saveUi?.(M.state);}catch{}
    const view=s.view||'board';
    try{if(view!=='board'&&M.nav?.show)M.nav.show(view,{restoreScroll:false});else M.ui?.renderCurrent?.();}catch{}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{try{g.scrollTo(0,Number(s.scrollY)||0);}catch{}
      if(s.swimmer?.id)try{M.tvDisplay?.openSwimmer?.(s.swimmer.id,s.swimmer.tab,{noTv:true});}catch{}}));
    quietUntil=Date.now()+R.QUIET_MS;R.restored=s;
    const entry={at:Date.now(),awayMs:Date.now()-s.at,kind:'reloaded by the phone · put back'};logReturn(entry);watchSlowest(entry);
    write(KEY,{...s,unloaded:true});}
  R.restore=restore;
  function boot(){const s=read(KEY);let tries=0;
    const go=()=>{if(!M.storageEngine?.ready||!M.state.settings?.selectedSessionId){if(++tries<60)return setTimeout(go,150);return;}
      // after navigation's own cold-boot settle (it puts the app on the Board first)
      setTimeout(()=>{if(shouldRestore(s))restore(s);},350);};
    go();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
