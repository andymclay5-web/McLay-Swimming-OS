'use strict';
// TV display control (12 Oct 2026). Andy (voice): "once you've got that TV link for the session, you should control
// it effectively from the board ... take a video of a swimmer and then, on my phone, show that in a little box window
// down in the corner of the board itself, or take over the whole board ... maybe go to YouTube and find a video".
//
// Owner of one thing: what the coach has put on top of the TV Board -- M.state.settings.tvOverlay =
// {id, mode:'corner'|'full', capture:{...} | url, label, at}. The coach sets it from the Board (a small TV button,
// or "Show on TV" in any capture); it travels to the TV inside the existing live payload
// (engines/live-training-authority.js: same-browser BroadcastChannel and the cross-device live_broadcast row), and the
// TV view draws it here after the Board renders (engines/board.js renderTV calls paint()). It never changes the
// session, Roll or the Board itself.
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const T=M.tvDisplay={build:'v4-tv-display-20261015-tv-link'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const uid=()=>M.util?.uid?.('tv')||`tv-${Date.now()}`;
  const BUCKET='swimming-media';
  const can=()=>{try{return M.access?.can?M.access.can('display.tv'):true}catch{return false}};
  const view=()=>M.state?.settings?.view||'board';

  // ---------- links ----------
  function youtubeId(u){const s=String(u||'');let m=s.match(/youtu\.be\/([\w-]{6,})/);if(m)return m[1];m=s.match(/youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)([\w-]{6,})/);return m?m[1]:'';}
  function linkKind(u){if(youtubeId(u))return'youtube';if(/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u))return'video';if(/\.(jpe?g|png|gif|webp)(\?|$)/i.test(u))return'image';return'link';}
  T.youtubeId=youtubeId;T.linkKind=linkKind;

  // ---------- coach side ----------
  function captureSummary(cap){const type=String(cap.capture_type||'note').toLowerCase();const names=(cap.athlete_ids||(cap.athlete_id?[cap.athlete_id]:[])).map(id=>(M.state.athletes||[]).find(a=>a.id===id)?.full_name).filter(Boolean);
    return{id:cap.id,type,text:text(cap.text_content).slice(0,600),media_id:cap.media_id||'',media_path:cap.media_path||'',who:names.join(' + '),context:text(cap.context_label||'')};}
  function set(next){M.state.settings=M.state.settings||{};M.state.settings.tvOverlay=next;M.store?.save?.(M.state);paintControl();return next;}
  T.showCapture=(captureId,mode='corner')=>{const cap=(M.state.captures||[]).find(c=>c.id===captureId);if(!cap)throw new Error('Capture not found');const c=captureSummary(cap);
    return set({id:uid(),mode:mode==='full'?'full':'corner',capture:c,label:[c.who,c.type==='note'?'note':c.type].filter(Boolean).join(' · '),at:new Date().toISOString()});};
  T.showLink=(url,mode='corner',label='')=>{const u=text(url);if(!/^https?:\/\//i.test(u))throw new Error('Paste a full link starting with https://');return set({id:uid(),mode:mode==='full'?'full':'corner',url:u,kind:linkKind(u),label:text(label)||(youtubeId(u)?'YouTube video':'Link'),at:new Date().toISOString()});};
  // Swimmer screen (16 Oct 2026). Andy: "when you bring up a swimmer, the first screen ... is like their profile ... then
  // be able to, on my phone, flip between different things that are displayed up there". The overlay names the swimmer
  // and the page; engines/swimmer-brief.js gathers the facts for that page. Set targets are not repeated here (they are
  // already on the Board).
  T.showSwimmer=(athleteId,mode='corner',page='profile')=>{const a=(M.state.athletes||[]).find(x=>x.id===athleteId);if(!a)throw new Error('Swimmer not found');
    const pg=(M.swimmerBrief?.PAGES||[]).includes(page)?page:'profile';
    return set({id:uid(),mode:mode==='full'?'full':'corner',swimmer:{id:a.id,page:pg},label:text(a.full_name),at:new Date().toISOString()});};
  function cardHtml(o){const B=M.swimmerBrief;if(!B)return'<div class="tvo-text">Swimmer pages not loaded</div>';return`<div class="tvo-card sb">${B.html(B.page(o.swimmer.id,o.swimmer.page||'profile'))}</div>`;}
  T.cardHtml=cardHtml;
  T.setMode=mode=>{const cur=M.state.settings?.tvOverlay;if(!cur)return null;return set({...cur,mode:mode==='full'?'full':'corner',at:new Date().toISOString()});};
  T.clear=()=>set(null);
  T.current=()=>M.state.settings?.tvOverlay||null;

  // ---------- TV side ----------
  let lastKey='',objectUrl='';
  async function mediaUrl(c){
    if(c.media_id){try{const row=await M.media?.get?.(c.media_id);if(row?.blob){if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(row.blob);return objectUrl;}}catch{}}
    if(c.media_path){try{const cfg=M.store?.config?.()||{};const f=M.cloudSessionEngine?.fetch||M.cloud?.fetch;const r=await f(`/storage/v1/object/sign/${BUCKET}/${String(c.media_path).split('/').map(encodeURIComponent).join('/')}`,{method:'POST',body:JSON.stringify({expiresIn:3600})});const p=r?.signedURL||r?.signedUrl||'';if(p)return`${String(cfg.supabaseUrl||'').replace(/\/$/,'')}/storage/v1${p.startsWith('/')?'':'/'}${p}`;}catch{}}
    return'';}
  function frameHtml(o){
    if(o.url){const k=o.kind||linkKind(o.url);if(k==='youtube')return`<iframe src="https://www.youtube.com/embed/${esc(youtubeId(o.url))}?autoplay=1&mute=1&playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      if(k==='video')return`<video src="${esc(o.url)}" autoplay muted loop playsinline controls></video>`;if(k==='image')return`<img src="${esc(o.url)}" alt="">`;return`<div class="tvo-text"><b>${esc(o.label||'Link')}</b><span>${esc(o.url)}</span></div>`;}
    if(o.swimmer)return cardHtml(o);
    const c=o.capture||{};if(c.type==='note'||!c.media_id&&!c.media_path)return`<div class="tvo-text">${c.who?`<b>${esc(c.who)}</b>`:''}<span>${esc(c.text||'')}</span></div>`;
    return`<div class="tvo-media" data-tvo-media>Loading ${esc(c.type)}…</div>`;}
  async function fillMedia(el,o){const box=el.querySelector('[data-tvo-media]');if(!box)return;const c=o.capture||{};const url=await mediaUrl(c);if(!el.isConnected||el.dataset.key!==o.id+o.mode)return;
    if(!url){box.textContent=`This ${c.type} hasn't reached the cloud yet — it shows once the phone has sent it.`;return;}
    box.outerHTML=c.type==='video'?`<video src="${esc(url)}" autoplay muted loop playsinline controls></video>`:c.type==='photo'?`<img src="${esc(url)}" alt="">`:c.type==='voice'?`<audio src="${esc(url)}" controls autoplay></audio>`:`<a href="${esc(url)}">Open</a>`;}
  T.paint=()=>{
    let el=document.querySelector('[data-tv-overlay]');const o=view()==='tv'?T.current():null;
    if(!o){if(el){el.remove();lastKey='';}return;}
    const key=o.id+o.mode+(o.swimmer?.page||'');if(el&&el.dataset.key===key)return;
    if(!el){el=document.createElement('div');el.setAttribute('data-tv-overlay','1');document.body.appendChild(el);}
    el.className=`tv-overlay tvo-${o.mode}${o.swimmer?' tvo-swimmer-card':''}`;el.dataset.key=key;lastKey=key;
    el.innerHTML=`<div class="tvo-frame">${frameHtml(o)}</div>${o.label?`<div class="tvo-label">${esc(o.label)}</div>`:''}`;
    fillMedia(el,o);
  };

  // ---------- Board control: a small TV button that opens the controls ----------
  function paintControl(){
    let pill=document.querySelector('[data-tv-pill]');const show=view()==='board'&&can()&&(M.access?.role?.()||'owner')!=='swimmer';
    if(!show){if(pill)pill.hidden=true;return;}
    if(!pill){pill=document.createElement('button');pill.type='button';pill.className='tv-pill';pill.setAttribute('data-tv-pill','1');pill.onclick=()=>openControls();document.body.appendChild(pill);}
    const o=T.current(),ls=M.tvLink?.status?.()||{},drive=!!ls.control?.screenId,dot=drive?(ls.state==='live'?'🟢':ls.state==='taken'?'⚪':ls.state==='error'?'🔴':'🟡'):'';pill.hidden=false;pill.classList.toggle('on',!!o||drive&&ls.state==='live');const html=o?`📺${dot} <span>On TV · ${esc(o.mode==='full'?'full':'corner')}</span>`:`📺${dot}`;if(pill.innerHTML!==html)pill.innerHTML=html;if(!pill.isConnected)document.body.appendChild(pill);pill.title=drive?(ls.state==='taken'?`${ls.controller||'Another phone'} is driving the TV`:ls.state==='error'?`TV: ${ls.error}`:'This phone is driving the TV'):o?`TV is showing ${o.label||'something'}`:'Show something on the TV';}
  T.paintControl=paintControl;
  function sessionCaptures(){const s=M.currentSession?.();const all=(M.state.captures||[]).filter(c=>!s||c.session_id===s.id);return all.slice(-12).reverse();}
  function swimmerChips(){const pool=M.boardEngine?.present?.()||M.ui?.presentAthletes?.()||[];if(!pool.length)return'<p class="muted">Mark the Roll to pick a swimmer here.</p>';
    return`<div class="tv-swimmers">${pool.map(a=>`<button type="button" data-tv-swimmer="${esc(a.id)}">${esc(M.boardEngine?.name?.(a,pool)||a.full_name)}</button>`).join('')}</div>`;}
  function openControls(){
    const host=document.querySelector('#modalHost');if(!host)return;const o=T.current(),caps=sessionCaptures();
    host.innerHTML=`<div class="modal-backdrop" data-tv-controls><section class="modal"><header><h2>TV Board</h2><button data-tv-close>×</button></header><div class="modal-body">
      <div data-tv-link-panel></div><p class="muted">Put a swimmer, clip, photo, note or video link on top of the Board — in the corner or full screen. Nothing goes on the TV unless you send it here.</p>
      ${o?`<div class="check-card ok"><b>On the TV now:</b> ${esc(o.label||'')} · ${o.mode==='full'?'full screen':'corner'}</div><div class="hub-actions"><button type="button" data-tv-mode="${o.mode==='full'?'corner':'full'}">${o.mode==='full'?'Shrink to corner':'Make it full screen'}</button><button type="button" class="danger" data-tv-clear>Take it off the TV</button></div>`:''}
      <h3>From this session</h3>${caps.length?caps.map(c=>{const sm=captureSummary(c);return`<div class="tv-cap-row"><span><b>${esc(sm.type==='note'?'Note':sm.type[0].toUpperCase()+sm.type.slice(1))}</b>${sm.who?` · ${esc(sm.who)}`:''}<small>${esc((sm.text||sm.context||'').slice(0,70))}</small></span><span class="tv-cap-acts"><button type="button" data-tv-cap="${esc(c.id)}" data-tv-m="corner">Corner</button><button type="button" data-tv-cap="${esc(c.id)}" data-tv-m="full">Full</button></span></div>`;}).join(''):'<p class="muted">No captures in this session yet. Use Capture to take a video, photo or note.</p>'}
      <h3>A swimmer</h3>${swimmerChips()}
      <h3>A video link</h3><label class="id-free">YouTube or video link<input type="url" data-tv-url placeholder="https://youtu.be/…"></label><div class="hub-actions"><button type="button" data-tv-link="corner">Show in corner</button><button type="button" data-tv-link="full">Show full screen</button></div>
      <div class="hub-actions"><button type="button" data-tv-open>Open the TV Board on this device</button></div>
    </div><footer><button data-tv-close>Done</button></footer></section></div>`;
    try{M.nav?.openLayer?.('modal');}catch{}
    const close=()=>{host.innerHTML='';try{M.nav?.clearTransient?.()}catch{}};
    host.querySelectorAll('[data-tv-close]').forEach(b=>b.onclick=close);
    host.querySelectorAll('[data-tv-cap]').forEach(b=>b.onclick=()=>{try{T.showCapture(b.dataset.tvCap,b.dataset.tvM);M.toast?.(`On the TV · ${b.dataset.tvM==='full'?'full screen':'corner'}`);openControls();}catch(e){M.toast?.(e.message);}});
    host.querySelectorAll('[data-tv-swimmer]').forEach(b=>b.onclick=()=>openSwimmer(b.dataset.tvSwimmer,'profile'));
    try{M.tvLink?.fillPanel?.(host.querySelector('[data-tv-link-panel]'),openControls);}catch{}
    host.querySelectorAll('[data-tv-link]').forEach(b=>b.onclick=()=>{try{T.showLink(host.querySelector('[data-tv-url]').value,b.dataset.tvLink);M.toast?.('On the TV');openControls();}catch(e){M.toast?.(e.message);}});
    host.querySelector('[data-tv-mode]')?.addEventListener('click',e=>{T.setMode(e.currentTarget.dataset.tvMode);openControls();});
    host.querySelector('[data-tv-clear]')?.addEventListener('click',()=>{T.clear();M.toast?.('Taken off the TV');openControls();});
    host.querySelector('[data-tv-open]').onclick=()=>{close();M.nav?.show?.('tv',{restoreScroll:false});};
  }
  T.openControls=openControls;

  // ---------- the swimmer screen on the phone (16 Oct 2026) ----------
  // "On my phone, I'll just be on the swimmer's screen and linking between the things." Each tab puts that page on the
  // TV straight away; Videos lists every capture ever tagged to the swimmer (tap one and it goes up); YouTube finds a
  // clip by description (AI search) or takes a pasted link, and the link is filled in for you -- one tap to show it.
  const TABS=[['profile','Profile'],['training','Training'],['performance','Performance'],['pathway','Pathway'],['videos','Videos'],['youtube','YouTube']];
  let sw={id:'',tab:'profile',results:[],searching:false,msg:''};
  function openSwimmer(athleteId,tab,{noTv=false}={}){const a=(M.state.athletes||[]).find(x=>x.id===athleteId);if(!a)return;
    if(sw.id!==athleteId)sw={id:athleteId,tab:'profile',results:[],searching:false,msg:''};if(tab)sw.tab=tab;
    const cur=T.current();if(!noTv&&sw.tab!=='youtube'&&!(sw.tab==='videos'&&cur&&!cur.swimmer&&cur.from===athleteId)&&!(cur?.swimmer?.id===athleteId&&cur.swimmer.page===sw.tab)){try{T.showSwimmer(athleteId,cur?.mode||'corner',sw.tab);}catch{}}
    paintSwimmer();}
  T.openSwimmer=openSwimmer;T.swimmerScreen=()=>({id:sw.id,tab:sw.tab});
  function paintSwimmer(){const host=document.querySelector('#modalHost');if(!host)return;const a=(M.state.athletes||[]).find(x=>x.id===sw.id);if(!a)return;const B=M.swimmerBrief,o=T.current();
    const onTv=o?(o.swimmer?`${B?.titles?.[o.swimmer.page]||'Profile'} · ${o.mode==='full'?'full screen':'side panel'}`:`${o.label||'clip'} · ${o.mode==='full'?'full screen':'corner'}`):'nothing';
    let body='';
    if(sw.tab==='youtube'){body=`<div class="sb-yt"><label class="id-free">What video?<input data-sw-q placeholder="e.g. Caeleb Dressel butterfly start" value="${esc(sw.q||'')}" enterkeyhint="search"></label>
        <div class="hub-actions"><button type="button" data-sw-find>${sw.searching?'Searching…':'Find on YouTube'}</button><button type="button" data-sw-paste>Paste a link</button><a class="button" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(sw.q||'')}">Open YouTube</a></div>
        ${sw.msg?`<p class="muted" data-sw-msg>${esc(sw.msg)}</p>`:''}
        ${sw.results.map((v,i)=>`<div class="sb-yt-row">${v.thumbnail?`<img src="${esc(v.thumbnail)}" alt="">`:''}<span><b>${esc(v.title||v.url)}</b><small>${esc(v.channel||'')}</small></span><span class="tv-cap-acts"><button type="button" data-sw-yt="${i}" data-m="corner">Corner</button><button type="button" data-sw-yt="${i}" data-m="full">Full</button></span></div>`).join('')}</div>`;}
    else if(sw.tab==='videos'){const rows=B?.captureRows?.(a)||[];body=rows.length?rows.map(v=>`<div class="tv-cap-row"><span><b>${esc(v.type==='note'?'Note':v.type[0].toUpperCase()+v.type.slice(1))}</b> · ${esc(v.date)}<small>${esc(v.text||v.context||'')}</small></span><span class="tv-cap-acts"><button type="button" data-sw-cap="${esc(v.id)}" data-m="corner">Corner</button><button type="button" data-sw-cap="${esc(v.id)}" data-m="full">Full</button></span></div>`).join(''):'<p class="muted">No videos, photos or notes tagged to this swimmer yet.</p>';}
    else body=`<div class="sb-preview">${B?B.html(B.page(a.id,sw.tab)):'Swimmer pages not loaded'}</div>`;
    host.innerHTML=`<div class="modal-backdrop" data-tv-swimmer-screen><section class="modal sb-modal"><header><h2>📺 ${esc(a.full_name)}</h2><button data-sw-close>×</button></header>
      <nav class="sb-tabs">${TABS.map(([k,l])=>`<button type="button" data-sw-tab="${k}" class="${sw.tab===k?'on':''}">${l}</button>`).join('')}</nav>
      <div class="sb-ontv"><span>On TV: <b>${esc(onTv)}</b></span><span class="tv-cap-acts">${o&&!o.swimmer&&o.from===a.id?`<button type="button" data-sw-back>Back to ${esc(a.full_name.split(' ')[0])}</button>`:''}${o?`<button type="button" data-sw-mode="${o.mode==='full'?'corner':'full'}">${o.mode==='full'?(o.swimmer?'Side panel':'Corner'):'Full screen'}</button><button type="button" class="danger" data-sw-off>Off TV</button>`:`<button type="button" data-sw-show>Show on TV</button>`}</span></div>
      <div class="modal-body">${body}</div><footer><button type="button" data-sw-controls>TV controls</button><button data-sw-close>Done</button></footer></section></div>`;
    try{M.nav?.openLayer?.('modal');}catch{}
    const close=()=>{host.innerHTML='';try{M.nav?.clearTransient?.()}catch{}};
    host.querySelectorAll('[data-sw-close]').forEach(b=>b.onclick=close);
    host.querySelector('[data-sw-controls]').onclick=()=>openControls();
    host.querySelectorAll('[data-sw-tab]').forEach(b=>b.onclick=()=>openSwimmer(sw.id,b.dataset.swTab));
    host.querySelector('[data-sw-mode]')?.addEventListener('click',e=>{T.setMode(e.currentTarget.dataset.swMode);paintSwimmer();});
    host.querySelector('[data-sw-off]')?.addEventListener('click',()=>{T.clear();M.toast?.('Taken off the TV');paintSwimmer();});
    host.querySelector('[data-sw-show]')?.addEventListener('click',()=>{T.showSwimmer(sw.id,'corner',sw.tab==='youtube'?'profile':sw.tab);paintSwimmer();});
    host.querySelector('[data-sw-back]')?.addEventListener('click',()=>{T.showSwimmer(sw.id,'corner',sw.tab==='youtube'||sw.tab==='videos'?'profile':sw.tab);paintSwimmer();});
    host.querySelectorAll('[data-sw-cap]').forEach(b=>b.onclick=()=>{try{const r=T.showCapture(b.dataset.swCap,b.dataset.m);r.from=sw.id;M.store?.save?.(M.state);M.toast?.('On the TV');paintSwimmer();}catch(e){M.toast?.(e.message);}});
    host.querySelectorAll('[data-sw-yt]').forEach(b=>b.onclick=()=>{const v=sw.results[Number(b.dataset.swYt)];if(!v)return;try{const r=T.showLink(v.url,b.dataset.m,v.title||'YouTube video');r.from=sw.id;M.store?.save?.(M.state);M.toast?.('On the TV');paintSwimmer();}catch(e){M.toast?.(e.message);}});
    const q=host.querySelector('[data-sw-q]');if(q){q.oninput=()=>{sw.q=q.value;};q.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();find();}};}
    host.querySelector('[data-sw-find]')?.addEventListener('click',find);
    host.querySelector('[data-sw-paste]')?.addEventListener('click',async()=>{let t='';try{t=await navigator.clipboard.readText();}catch{}t=text(t);const m=t.match(/https?:\/\/\S+/);
      if(!m){sw.msg='No link found to paste. In YouTube tap Share → Copy link, then come back and tap Paste a link.';paintSwimmer();return;}
      sw.results=[{url:m[0],title:youtubeId(m[0])?'YouTube video (pasted link)':'Pasted link',channel:''}];sw.msg='Link pasted — tap Corner or Full to show it.';paintSwimmer();});}
  async function find(){const q=text(sw.q||document.querySelector('[data-sw-q]')?.value);if(!q){sw.msg='Say or type what you want to find first.';paintSwimmer();return;}
    sw.q=q;sw.searching=true;sw.msg='';sw.results=[];paintSwimmer();
    try{const f=M.cloud?.fetch||M.cloudSessionEngine?.fetch;const r=await f('/functions/v1/msos-video-search',{method:'POST',body:JSON.stringify({query:q})});
      sw.results=Array.isArray(r?.videos)?r.videos:[];sw.msg=sw.results.length?`Found ${sw.results.length} — tap Corner or Full to show one.`:(r?.error||'Nothing found. Try different words.');}
    catch(e){sw.msg=`Search isn't available: ${e.message}. Use Open YouTube, copy the link, then Paste a link.`;}
    sw.searching=false;if(document.querySelector('[data-tv-swimmer-screen]'))paintSwimmer();}
  T.findVideo=find;

  // "Show on TV" inside any opened capture (engines/capture-ui.js viewer).
  function addToViewer(){const v=document.querySelector('#modalHost .msos-evidence-viewer');if(!v||v.querySelector('[data-tv-from-viewer]')||!can())return;const id=v.dataset.captureId;if(!id)return;
    const foot=v.querySelector('footer');if(!foot)return;const wrap=document.createElement('span');wrap.setAttribute('data-tv-from-viewer','1');wrap.className='tv-viewer-acts';
    wrap.innerHTML='<button type="button" data-tvv="corner">📺 TV corner</button><button type="button" data-tvv="full">📺 TV full</button>';foot.prepend(wrap);
    wrap.querySelectorAll('[data-tvv]').forEach(b=>b.onclick=()=>{try{T.showCapture(id,b.dataset.tvv);M.toast?.(`On the TV · ${b.dataset.tvv==='full'?'full screen':'corner'}`);}catch(e){M.toast?.(e.message);}});}
  T.addToViewer=addToViewer;

  // Keep the Board's TV button in step with the screen being shown (cheap attribute watch on <body>).
  function boot(){paintControl();try{new MutationObserver(()=>{paintControl();if(view()!=='tv')T.paint();}).observe(document.body,{attributes:true,attributeFilter:['data-msos-view']});}catch{}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
