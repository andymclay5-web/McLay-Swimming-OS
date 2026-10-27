'use strict';
// Cloud status dot (27 Oct 2026). Andy: "the constant need to refresh and add to cloud, still we need to come up with that."
// Everything already saves on the phone first and goes to the cloud by itself (app.js cloud queue + flush on the 25 s
// team tick; engines/live-sync.js brings other coaches' changes in live). What was missing: (1) a coach can't SEE that
// it worked, so he refreshes and syncs to be sure; (2) a change waited up to 25 s before it was sent.
//
// Owner of one thing: the small dot beside the build badge that says, in plain words, where this phone's work is --
// "All saved", "Saving… 3 waiting", "Offline — kept on this phone", "Not signed in — kept on this phone only".
// It sends waiting changes a few seconds after they are made (it asks the cloud owner, M.cloud.flush; it never builds
// or changes a record itself), and nothing else.
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const X=M.syncStatus={build:'v4-sync-status-20261027'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pending=()=>(M.state.pending||[]).length;
  const signedIn=()=>!!M.store?.auth?.()?.access_token;
  X.state=()=>{
    if((M.access?.role?.()||'owner')==='swimmer')return{k:'none'};
    const n=pending(),online=typeof navigator==='undefined'||navigator.onLine!==false;
    if(!signedIn())return{k:'local',label:'Not signed in',detail:'Everything is kept on this phone only. Sign in to share it with your other coaches and keep a copy in the cloud.',n};
    if(!M.state.settings?.cloudWritesEnabled)return{k:'local',label:'Cloud saving off',detail:'Changes are kept on this phone. Cloud saving is turned off on the Connection screen.',n};
    if(!online)return{k:'wait',label:n?`Offline · ${n} waiting`:'Offline',detail:'No signal. Everything is kept on this phone and goes up by itself when the signal is back.',n};
    if(n)return{k:'wait',label:`Saving · ${n} waiting`,detail:'Sending your latest changes to the cloud now. Nothing to do.',n};
    const live=!!M.liveSync?.live?.();
    return{k:'ok',label:live?'All saved · live':'All saved',detail:live?'Everything on this phone is in the cloud, and other coaches\' changes arrive as they happen.':'Everything on this phone is in the cloud. Other coaches\' changes come in about once a minute.',n};};
  function paint(){const badge=document.querySelector('#buildBadge');if(!badge)return;let d=document.querySelector('#syncDot');const st=X.state();
    if(st.k==='none'){d?.remove();return;}
    if(!d){d=document.createElement('button');d.id='syncDot';d.type='button';d.className='sync-dot';d.onclick=()=>explain();badge.insertAdjacentElement('beforebegin',d);}
    d.dataset.k=st.k;d.innerHTML=`<i aria-hidden="true"></i>${esc(st.label)}`;d.title=st.detail;}
  X.paint=paint;
  function explain(){const st=X.state();const host=document.querySelector('#modalHost');if(!host)return;
    host.innerHTML=`<div class="modal-backdrop"><section class="modal"><header><h2>${esc(st.label)}</h2><button data-sync-close>×</button></header><div class="modal-body"><p>${esc(st.detail)}</p>${st.k==='local'&&!signedIn()?'<div class="hub-actions"><button type="button" data-sync-signin>Sign in</button></div>':''}${st.k==='wait'&&st.n?'<div class="hub-actions"><button type="button" data-sync-now>Try sending now</button></div>':''}</div></section></div>`;
    const close=()=>{host.innerHTML='';};host.querySelector('[data-sync-close]').onclick=close;
    host.querySelector('[data-sync-signin]')?.addEventListener('click',()=>{close();try{M.teamAccess?.signInScreen?.()}catch{}});
    host.querySelector('[data-sync-now]')?.addEventListener('click',()=>{close();send(true);});}
  // A send that doesn't shrink the queue (no signal, a refused row) backs off up to a minute, so a stuck queue never
  // means the phone hammering the pool's connection every few seconds.
  let lastSend=0,gap=4000;
  function send(force=false){if(!signedIn()||!M.state.settings?.cloudWritesEnabled||!M.cloud?.flush||!M.cloud?.ready?.())return;if(!pending())return;
    if(!force&&(M._flushing||Date.now()-lastSend<gap))return;if(typeof navigator!=='undefined'&&navigator.onLine===false)return;
    lastSend=Date.now();const before=pending();M.cloud.flush().catch(()=>{}).finally(()=>{gap=pending()<before?4000:Math.min(gap*2,60000);setTimeout(paint,50);});}
  X.send=send;
  function tick(){try{paint();}catch{}if(document.visibilityState==='visible'&&!M.resume?.isQuiet?.())X.send();}
  function install(){paint();setInterval(tick,3000);addEventListener('online',()=>{paint();send(true);});addEventListener('offline',paint);
    try{M.liveSync?.on?.('_status',()=>setTimeout(paint,0));}catch{}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(globalThis);
