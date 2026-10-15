'use strict';
// Pool TV display (15 Oct 2026). Display-only: this page holds no coach sign-in and no swimmer data of its own. It
// pairs once with a 6-letter code (the coach types it into TV controls on the phone), then draws whatever frame the
// controlling phone publishes (engines/tv-link.js). See supabase/20261015_tv_screens.sql for what this screen can read:
// its own frame, nothing else.
(function(g){
  const CFG=g.MCLAY_CONFIG||{};
  const root=document.getElementById('tv'),ovl=document.getElementById('tvOverlay'),statusEl=document.getElementById('tvStatus');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const POLL_MS=g.MSOS_TV_POLL_MS||1500;
  const TV=g.MSOS_TV={rev:0,frame:null,state:'starting'};

  function secret(){let v='';try{v=localStorage.getItem('msos-tv-secret')||'';}catch{}
    if(v.length<32){const b=new Uint8Array(24);crypto.getRandomValues(b);v=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');try{localStorage.setItem('msos-tv-secret',v);}catch{}}
    return v;}
  async function rpc(name,body){const res=await fetch(`${String(CFG.supabaseUrl||'').replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:CFG.supabaseAnonKey,Authorization:`Bearer ${CFG.supabaseAnonKey}`,'Content-Type':'application/json'},body:JSON.stringify(body||{})});
    const raw=await res.text();let data=null;try{data=raw?JSON.parse(raw):null;}catch{}if(!res.ok)throw new Error(data?.message||`${res.status}`);return data;}

  // ---------- pairing ----------
  function showCode(code){TV.state='pairing';ovl.innerHTML='';const url=location.href.split('?')[0].split('#')[0];
    root.className='tv-root';root.innerHTML=`<section class="tv-pairing"><p class="tv-eyebrow">MCLAY SWIMMING OS · POOL TV</p><h1>Connect this TV</h1><p>On your phone: Board → 📺 → <b>Pool TV</b> → type this code</p><div class="tv-code" data-tv-code>${esc(String(code||'').replace(/^(.{3})/,'$1 '))}</div><p class="tv-small">${esc(url.replace(/^https?:\/\//,''))}</p></section>`;}
  async function pair(){const r=await rpc('msos_tv_pair_request',{p_secret:secret()});if(r?.status==='pairing')showCode(r.code);else if(r?.status==='paired'){TV.state='paired';if(!TV.frame)waiting(r.label);}return r;}
  function waiting(label){root.className='tv-root';root.innerHTML=`<section class="tv-pairing"><p class="tv-eyebrow">MCLAY SWIMMING OS · ${esc(label||'POOL TV')}</p><h1>Connected</h1><p>Waiting for the coach's phone…</p></section>`;}

  // ---------- drawing ----------
  function targets(list){return list?.length?`<div class="tv-targets">${list.map(t=>`<span class="tv-t"><i>${esc(t.n)}</i><b>${esc(t.t)}</b></span>`).join('')}</div>`:'';}
  function mods(list,showTimes){return(list||[]).map(m=>`<div class="tv-mod"><div class="tv-mod-work"><b>${esc(m.work)}</b>${m.cue?`<small>${esc(m.cue)}</small>`:''}</div><div class="tv-mod-people">${m.people.map(p=>`<span class="tv-t mod"><i>${esc(p.n)}</i>${showTimes&&p.t?`<b>${esc(p.t)}</b>`:''}</span>`).join('')}</div></div>`).join('');}
  function rows(list,showTimes){return(list||[]).map(r=>{if(r.k==='rounds')return`<div class="tv-rounds"><div class="tv-round-label">${esc(r.label)}</div>${rows(r.rows,showTimes)}</div>`;if(r.k==='cue')return`<div class="tv-cue">${esc(r.text)}</div>`;
    return`<div class="tv-row"><div class="tv-work"><b>${esc(r.work)}</b>${r.cue?`<small>${esc(r.cue)}</small>`:''}</div>${showTimes?targets(r.targets):''}${mods(r.mods,showTimes)}</div>`;}).join('');}
  function block(b,showTimes){return`<section class="tv-block ${b.active?'active':''}"><header><small>${esc(b.code)}</small><h2>${esc(b.title)}</h2><b>${Number(b.distance||0).toLocaleString()}m</b></header><div class="tv-block-rows">${rows(b.rows,showTimes)}</div></section>`;}
  function boardHtml(f){if(f.empty||!f.session)return`<section class="tv-pairing"><p class="tv-eyebrow">MCLAY SWIMMING OS</p><h1>${esc(f.empty||'No session yet')}</h1></section>`;
    const s=f.session,set=f.mode==='set';
    return`<header class="tv-top"><div><small>${set?'CURRENT SET':'WHOLE SESSION'}${s.finished?' · FINISHED ✓':''}</small><h1>${esc(s.title)}</h1></div>${set&&f.nav?.length?`<nav>${f.nav.map(n=>`<span class="${n.active?'on':''}">${esc(n.code)}</span>`).join('')}</nav>`:''}<b>${Number(s.distance||0).toLocaleString()}m${s.finished?' ✓':''}</b></header>
      <div class="tv-body ${set?'tv-set':'tv-whole'}">${(f.blocks||[]).map(b=>block(b,set)).join('')}${set&&f.live?.length?`<section class="tv-live"><header><small>LIVE TIMES</small></header>${f.live.map(r=>`<div><b>${esc(r.who)}</b><span>${esc(r.label)}</span><b>${esc(r.time)}</b></div>`).join('')}</section>`:''}</div>`;}
  function card(o){const c=o.card;if(!c)return'<div class="tvo-text">Swimmer not found</div>';
    const sec=(label,items)=>items?.length?`<div class="tvo-card-sec"><label>${label}</label>${items.join('')}</div>`:'';
    return`<div class="tvo-card"><h3>${esc(c.name)}</h3>${c.squad?`<small>${esc(c.squad)}</small>`:''}${sec('THIS SET',(o.targets||[]).map(t=>`<p><span>${esc(t.work)}</span><b>${esc(t.target)}</b></p>`))}${sec('T400',(c.t400||[]).map(t=>`<p><span>${esc(t.stroke)}</span><b>${esc(t.time)}</b></p>`))}${sec('BEST TIMES',(c.pbs||[]).map(p=>`<p><span>${esc(p.event)} ${esc(p.course)}</span><b>${esc(p.time)}</b></p>`))}</div>`;}
  function overlayInner(o){if(o.kind==='swimmer')return card(o);
    if(o.kind==='youtube'&&o.youtube)return`<iframe src="https://www.youtube.com/embed/${esc(o.youtube)}?autoplay=1&mute=1&playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    if(o.kind==='note'||o.kind==='link')return`<div class="tvo-text">${o.who?`<b>${esc(o.who)}</b>`:''}<span>${esc(o.text||o.url||o.label||'')}</span></div>`;
    if(!o.url)return`<div class="tvo-text"><span>${o.waiting?`This ${esc(o.kind)} is still on its way from the phone…`:'Not available'}</span></div>`;
    if(o.kind==='video')return`<video src="${esc(o.url)}" autoplay muted loop playsinline></video>`;
    if(o.kind==='photo'||o.kind==='image')return`<img src="${esc(o.url)}" alt="">`;
    if(o.kind==='voice')return`<audio src="${esc(o.url)}" controls autoplay></audio>`;
    return`<div class="tvo-text"><span>${esc(o.label||'')}</span></div>`;}
  let overlayKey='';
  function drawOverlay(o){const key=o?JSON.stringify([o.id,o.mode,o.url||'',o.waiting||false,o.kind==='swimmer'?o.targets:'',o.kind==='swimmer'?o.card:'']):'';if(key===overlayKey)return;overlayKey=key;
    if(!o){ovl.className='';ovl.innerHTML='';return;}
    ovl.className=`tv-overlay tvo-${o.mode==='full'?'full':'corner'} ${o.kind==='swimmer'?'tvo-swimmer':''}`;
    ovl.innerHTML=`<div class="tvo-frame">${overlayInner(o)}</div>${o.label&&o.kind!=='swimmer'?`<div class="tvo-label">${esc(o.label)}</div>`:''}`;}
  // Fit the whole board on the screen: shrink the type until nothing spills off the bottom.
  function fit(){let size=g.innerWidth>=1200?22:16;root.style.fontSize=`${size}px`;let guard=0;while(root.scrollHeight>g.innerHeight+2&&size>8&&guard++<40){size-=.5;root.style.fontSize=`${size}px`;}}
  function draw(f){TV.frame=f;root.className='tv-root tv-board';root.innerHTML=boardHtml(f);drawOverlay(f.overlay||null);fit();}
  TV.draw=draw;TV.fit=fit;
  addEventListener('resize',()=>{if(TV.frame)fit();});

  // ---------- keep it current ----------
  let misses=0,timer=0;
  function net(ok){misses=ok?0:misses+1;statusEl.hidden=misses<4;statusEl.textContent=misses>=4?'Reconnecting…':'';}
  async function poll(){clearTimeout(timer);
    try{const r=await rpc('msos_tv_frame',{p_secret:secret(),p_rev:TV.rev});net(true);
      if(r?.status==='frame'){TV.rev=Number(r.rev)||0;TV.state='live';draw(r.frame||{});}
      else if(r?.status==='same'){if(TV.state!=='live'&&!TV.frame){TV.state='paired';waiting(r.label);}}
      else if(r?.status==='pairing'){if(TV.state!=='pairing'||!root.querySelector('[data-tv-code]'))showCode(r.code);}
      else{TV.rev=0;TV.frame=null;await pair();}}
    catch{net(false);}
    timer=setTimeout(poll,POLL_MS);}
  // Keep the screen awake while the board is up.
  async function wake(){try{if(navigator.wakeLock&&document.visibilityState==='visible')await navigator.wakeLock.request('screen');}catch{}}
  document.addEventListener('visibilitychange',wake);
  document.addEventListener('click',()=>{try{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();}catch{}});
  (async()=>{if(!CFG.supabaseUrl){root.innerHTML='<section class="tv-pairing"><h1>Not configured</h1></section>';return;}
    try{await pair();}catch{net(false);}wake();poll();})();
})(globalThis);
