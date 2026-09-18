'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const P=M.pwaUpdate={build:'v4-pwa-update-final-20260825a',remoteBuild:'',stale:false,checkedAt:'',controllerChanged:false};
  P.apply=()=>{location.reload();return true};
  // Real coaching failure this guards against (Andy, 17 Sept 2026): "this pops up every time I open the
  // app, I've shut it down and started up again heaps and every time" -- the update toast is deliberately
  // informational-only (swimmer-experience-cl.js's own test forbids this module from ever reloading
  // automatically, since an unprompted reload mid-session could interrupt a coach actively entering a
  // set), but P.check() had no memory of already having told the coach about a given update -- every
  // single fresh boot that still saw the same "update available" state re-showed the exact same toast,
  // which looks identical, from the coach's side, to a genuine loop. Two changes, both purely additive:
  // (1) remember (plain localStorage, survives a reload) which remote build was last actually notified, so
  // the SAME available update only nags once instead of on every single open; (2) make the toast itself
  // tappable -- tapping it now calls the exact same P.apply()/location.reload() a coach would otherwise
  // have to guess at doing manually via "fully close and reopen", which this report suggests doesn't
  // reliably force a fresh load on every device anyway. Still entirely coach-initiated: nothing here
  // reloads on its own, and both call sites below (the poll in P.check and the controllerchange listener)
  // share the same one-notice-per-build gate, so a real update is still only ever announced once, not
  // twice, however it's first detected.
  const NOTIFIED_KEY='msos_pwa_last_notified_build';
  function alreadyNotified(build){try{return localStorage.getItem(NOTIFIED_KEY)===String(build||'')}catch{return false}}
  function markNotified(build){try{localStorage.setItem(NOTIFIED_KEY,String(build||''))}catch{}}
  // 18 Sept 2026 (Andy, live: "I don't know where the reload now button is"): there is no separate button --
  // the "tap to reload now" affordance IS the toast banner itself. But M.toast() (app.js, shared by every
  // toast in the app) only ever shows a toast for its own generic 2200ms before fading it, and the original
  // armReloadTap() detached its click listener on that exact same 2200ms -- so a coach had well under
  // 2.2 seconds to notice a small banner AND tap it before it silently stopped responding, no different from
  // it not being there at all. Fix: this specific update-ready toast now overrides M.toast's generic 2200ms
  // hide timer with a much longer, purpose-specific hold (P.RELOAD_TAP_HOLD_MS, exported so a test can drop
  // it for speed while exercising the identical code path) -- the banner stays visibly up AND tappable for
  // the whole hold, not just the first 2.2 seconds of it. Every other toast in the app (unrelated to updates)
  // is untouched -- this only re-arms the shared #toast element's own hide timer at the moment an update
  // notice is shown, exactly the way M.toast itself already does on every call.
  P.RELOAD_TAP_HOLD_MS=15000;
  function armReloadTap(){try{const el=document.querySelector('#toast');if(!el)return;const hold=P.RELOAD_TAP_HOLD_MS;clearTimeout(M._toast);M._toast=setTimeout(()=>el.classList.remove('show'),hold);el.style.cursor='pointer';el.title='Tap to reload now';const cleanup=()=>{el.removeEventListener('click',onClick);el.style.cursor='';el.title='';};const onClick=()=>{cleanup();P.apply();};el.addEventListener('click',onClick);setTimeout(cleanup,hold);}catch{}}
  P.notify=build=>{if(alreadyNotified(build))return false;markNotified(build);M.toast?.(`MSOS ${String(build||'update').split('-').at(-1)} installed · tap to reload now, or reopen when ready`);armReloadTap();return true;};
  P.check=async()=>{try{const r=await fetch(`./VERSION.txt?build-check=${Date.now()}`,{cache:'no-store'});if(!r.ok)return false;const txt=(await r.text()).trim(),m=txt.match(/v4-[^\s]+/);P.remoteBuild=m?.[0]||txt;P.checkedAt=new Date().toISOString();P.stale=!!(P.remoteBuild&&M.BUILD&&P.remoteBuild!==M.BUILD);if(P.stale)P.notify(P.remoteBuild);return !P.stale}catch{return false}};
  if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{if(P.controllerChanged)return;P.controllerChanged=true;P.notify(P.remoteBuild||M.BUILD||'new')});
  // Registration has one owner in app.js. This module only observes update state and never forces a reload
  // on its own -- P.apply() only ever runs from the coach's own tap on the toast (armReloadTap above).
  const boot=()=>setTimeout(P.check,450);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
