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
  // 15 Oct 2026 (TV link): "be able to put swimmer info in corner screen with board still showing".
  T.showSwimmer=(athleteId,mode='corner')=>{const a=(M.state.athletes||[]).find(x=>x.id===athleteId);if(!a)throw new Error('Swimmer not found');
    return set({id:uid(),mode:mode==='full'?'full':'corner',swimmer:{id:a.id},label:text(a.full_name),at:new Date().toISOString()});};
  // The swimmer's card facts: who, squad, fastest valid T400 for each stroke held, and their best times (PBs).
  function swimmerCard(athleteId){const E=g.MSOSEngines,a=(M.state.athletes||[]).find(x=>x.id===athleteId);if(!a)return null;const clock=s=>M.util?.clock?M.util.clock(Number(s)):String(s);
    const t400=[];for(const st of ['Freestyle','Backstroke','Breaststroke','Butterfly','IM']){try{const r=(E?.Evidence?.t400Rows?.(a,M.state,st)||[])[0];if(r)t400.push({stroke:st,time:clock(E.Evidence.seconds(r))});}catch{}}
    const best=new Map();try{for(const r of E?.Evidence?.pbRows?.(a,M.state)||[]){const d=Number(r.distance||r.event_distance),st=E.Evidence.stroke(r.stroke||r.event_stroke||''),c=text(r.pool_course||r.course||'').toUpperCase(),sec=E.Evidence.seconds(r);if(!d||!st||!(sec>0))continue;const k=`${d}|${st}|${c}`,cur=best.get(k);if(!cur||sec<cur.sec)best.set(k,{sec,d,st,c,date:String(r.result_date||r.date||r.meet_date||'')});}}catch{}
    const short=v=>String(v).replace('Freestyle','Free').replace('Backstroke','Back').replace('Breaststroke','Breast').replace('Butterfly','Fly');
    const pbs=[...best.values()].sort((x,y)=>(x.c==='SCM'?0:1)-(y.c==='SCM'?0:1)||y.date.localeCompare(x.date)).slice(0,5).map(x=>({event:`${x.d} ${short(x.st)}`,course:x.c,time:clock(x.sec)}));
    return{id:a.id,name:text(a.full_name),squad:text(a.squad),t400,pbs};}
  T.swimmerCard=swimmerCard;
  function cardHtml(c,targets=[]){if(!c)return'<div class="tvo-text">Swimmer not found</div>';
    return`<div class="tvo-card"><h3>${esc(c.name)}</h3>${c.squad?`<small>${esc(c.squad)}</small>`:''}${targets.length?`<div class="tvo-card-sec"><label>THIS SET</label>${targets.map(t=>`<p><span>${esc(t.work)}</span><b>${esc(t.target)}</b></p>`).join('')}</div>`:''}${c.t400.length?`<div class="tvo-card-sec"><label>T400</label>${c.t400.map(t=>`<p><span>${esc(t.stroke)}</span><b>${esc(t.time)}</b></p>`).join('')}</div>`:''}${c.pbs.length?`<div class="tvo-card-sec"><label>BEST TIMES</label>${c.pbs.map(p=>`<p><span>${esc(p.event)} ${esc(p.course)}</span><b>${esc(p.time)}</b></p>`).join('')}</div>`:''}</div>`;}
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
    if(o.swimmer)return cardHtml(swimmerCard(o.swimmer.id));
    const c=o.capture||{};if(c.type==='note'||!c.media_id&&!c.media_path)return`<div class="tvo-text">${c.who?`<b>${esc(c.who)}</b>`:''}<span>${esc(c.text||'')}</span></div>`;
    return`<div class="tvo-media" data-tvo-media>Loading ${esc(c.type)}…</div>`;}
  async function fillMedia(el,o){const box=el.querySelector('[data-tvo-media]');if(!box)return;const c=o.capture||{};const url=await mediaUrl(c);if(!el.isConnected||el.dataset.key!==o.id+o.mode)return;
    if(!url){box.textContent=`This ${c.type} hasn't reached the cloud yet — it shows once the phone has sent it.`;return;}
    box.outerHTML=c.type==='video'?`<video src="${esc(url)}" autoplay muted loop playsinline controls></video>`:c.type==='photo'?`<img src="${esc(url)}" alt="">`:c.type==='voice'?`<audio src="${esc(url)}" controls autoplay></audio>`:`<a href="${esc(url)}">Open</a>`;}
  T.paint=()=>{
    let el=document.querySelector('[data-tv-overlay]');const o=view()==='tv'?T.current():null;
    if(!o){if(el){el.remove();lastKey='';}return;}
    const key=o.id+o.mode;if(el&&el.dataset.key===key)return;
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
    const o=T.current(),ls=M.tvLink?.status?.()||{},drive=!!ls.control?.screenId,dot=drive?(ls.state==='live'?'🟢':ls.state==='taken'?'⚪':ls.state==='error'?'🔴':'🟡'):'';pill.hidden=false;pill.classList.toggle('on',!!o||drive&&ls.state==='live');pill.innerHTML=o?`📺${dot} <span>On TV · ${esc(o.mode==='full'?'full':'corner')}</span>`:`📺${dot}`;pill.title=drive?(ls.state==='taken'?`${ls.controller||'Another phone'} is driving the TV`:ls.state==='error'?`TV: ${ls.error}`:'This phone is driving the TV'):o?`TV is showing ${o.label||'something'}`:'Show something on the TV';}
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
    host.querySelectorAll('[data-tv-swimmer]').forEach(b=>b.onclick=()=>{try{T.showSwimmer(b.dataset.tvSwimmer,'corner');M.toast?.('Swimmer on the TV · corner');openControls();}catch(e){M.toast?.(e.message);}});
    try{M.tvLink?.fillPanel?.(host.querySelector('[data-tv-link-panel]'),openControls);}catch{}
    host.querySelectorAll('[data-tv-link]').forEach(b=>b.onclick=()=>{try{T.showLink(host.querySelector('[data-tv-url]').value,b.dataset.tvLink);M.toast?.('On the TV');openControls();}catch(e){M.toast?.(e.message);}});
    host.querySelector('[data-tv-mode]')?.addEventListener('click',e=>{T.setMode(e.currentTarget.dataset.tvMode);openControls();});
    host.querySelector('[data-tv-clear]')?.addEventListener('click',()=>{T.clear();M.toast?.('Taken off the TV');openControls();});
    host.querySelector('[data-tv-open]').onclick=()=>{close();M.nav?.show?.('tv',{restoreScroll:false});};
  }
  T.openControls=openControls;

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
