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
  const TV_VERSION='20261019c';
  const TV=g.MSOS_TV={rev:0,frame:null,state:'starting',version:TV_VERSION};
  // TVs keep old copies of pages. When the phone expects a newer TV page, reload once to fetch it.
  function maybeUpdate(f){const want=String(f?.tvv||'');if(!want||want<=TV_VERSION)return false;let tried='';try{tried=sessionStorage.getItem('msos-tv-upd')||'';}catch{}if(tried===want)return false;
    try{sessionStorage.setItem('msos-tv-upd',want);}catch{}location.replace(`${location.pathname}?v=${encodeURIComponent(want)}&r=${Date.now()}`);return true;}

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

  // ---------- drawing (19 Oct 2026, after the first pool TV night) ----------
  // Andy: "the screen ... tiny, probably thirty-two inches ... adaptable for whatever the screen is" / "one block per
  // page" / "modified swimmers on the right" / "a button where I could swap between black and white or white and black".
  // One block per screen, as big as the screen allows: the type grows until the block just fits, and never shrinks below
  // a size readable from the far end of the pool (about 3% of the screen height). A block too long for that is split
  // into pages that turn by themselves. WHOLE session turns through the blocks one at a time. In landscape, modified
  // swimmers sit in their own column on the right. Light (black on white) or dark (white on black) and a text-size step
  // are set per TV from the coach's phone (msos_tv_set).
  const DISPLAY={theme:'light',size:0};
  function applyDisplay(d){const theme=d&&d.theme==='dark'?'dark':'light',size=Math.max(-2,Math.min(3,Number(d&&d.size)||0)),key=`${theme}|${size}`;if(key===TV.displayKey)return false;
    TV.displayKey=key;DISPLAY.theme=theme;DISPLAY.size=size;document.body.classList.toggle('tv-dark',theme==='dark');document.body.classList.toggle('tv-light',theme!=='dark');TV.display={...DISPLAY};layoutCache.clear();return true;}
  TV.applyDisplay=applyDisplay;
  const KIND={WU:'wu',PRE:'pre',MAIN:'main',POST:'post',WD:'wd'};
  function targets(list){return list&&list.length?`<div class="tv-targets">${list.map(t=>`<span class="tv-t"><i>${esc(t.n)}</i><b>${esc(t.t)}</b></span>`).join('')}</div>`:'';}
  function mods(list,showTimes){return(list||[]).map(m=>`<div class="tv-mod"><div class="tv-mod-work"><b>${esc(m.work)}</b>${m.cue?`<small>${esc(m.cue)}</small>`:''}</div><div class="tv-mod-people">${m.people.map(p=>`<span class="tv-t mod"><i>${esc(p.n)}</i>${showTimes&&p.t?`<b>${esc(p.t)}</b>`:''}</span>`).join('')}</div></div>`).join('');}
  function rowHtml(r,showTimes){if(r.k==='cue')return`<div class="tv-cue">${esc(r.text)}</div>`;const m=!!(r.mods&&r.mods.length);
    return`<div class="tv-row${m?' has-mods':''}"><div class="tv-main"><div class="tv-work"><b>${esc(r.work)}</b>${r.cue?`<small>${esc(r.cue)}</small>`:''}</div>${showTimes?targets(r.targets):''}</div>${m?`<div class="tv-mods">${mods(r.mods,showTimes)}</div>`:''}</div>`;}
  // a block as a list of units that can go on separate pages: a rounds group splits between its lines (the label repeats)
  function units(b,showTimes,live){const out=[];let g=0;
    for(const r of b.rows||[]){if(r.k==='rounds'){g++;(r.rows||[]).forEach((x,i)=>out.push({group:g,label:r.label,first:i===0,html:rowHtml(x,showTimes)}));if(!(r.rows||[]).length)out.push({group:g,label:r.label,first:true,html:''});}
      else out.push({group:0,html:rowHtml(r,showTimes)});}
    if(live&&live.length)out.push({group:0,html:`<section class="tv-live"><header><small>LIVE TIMES</small></header>${live.map(r=>`<div><b>${esc(r.who)}</b><span>${esc(r.label)}</span><b>${esc(r.time)}</b></div>`).join('')}</section>`});
    return out;}
  function unitsHtml(list){let h='',open=0;for(const u of list){if(u.group!==open){if(open)h+='</div>';open=u.group;if(open)h+=`<div class="tv-rounds"><div class="tv-round-label">${esc(u.label)}${u.first?'':' · cont.'}</div>`;}h+=u.html;}if(open)h+='</div>';return h;}
  function anyMods(b){const walk=rs=>(rs||[]).some(r=>r.k==='rounds'?walk(r.rows):!!(r.mods&&r.mods.length));return walk(b.rows);}
  function pageHtml(f,b,list,pageNo,pageCount){const s=f.session,set=f.mode==='set',kind=KIND[b.code]||'other',cols=anyMods(b);
    const nav=(f.mode==='set'?f.nav:(f.blocks||[]).map(x=>({code:x.code,active:x===b})))||[];
    return`<header class="tv-top"><div class="tv-top-title"><small>${set?'CURRENT SET':'WHOLE SESSION'}${s.finished?' · FINISHED ✓':''}</small><h1>${esc(s.title)}</h1></div>${nav.length>1?`<nav>${nav.map(n=>`<span class="${n.active?'on':''}">${esc(n.code)}</span>`).join('')}</nav>`:''}<b class="tv-total">${Number(s.distance||0).toLocaleString()}m${s.finished?' ✓':''}</b></header>
      <div class="tv-body ${set?'tv-set':'tv-whole'}"><section class="tv-block tv-k-${kind}${cols?' tv-cols':''}"><header class="tv-block-head"><small>${esc(b.code)}</small><h2>${esc(b.title)}</h2>${pageCount>1?`<span class="tv-page">${pageNo}/${pageCount}</span>`:''}<b>${Number(b.distance||0).toLocaleString()}m</b></header>
      ${cols?`<div class="tv-colheads"><span>${set?'SQUAD':'SET'}</span><span>MODIFIED</span></div>`:''}<div class="tv-block-rows">${unitsHtml(list)}</div></section></div>`;}
  function emptyHtml(f){return`<section class="tv-pairing"><p class="tv-eyebrow">MCLAY SWIMMING OS</p><h1>${esc(f.empty||'No session yet')}</h1></section>`;}
  // sizes: px from the screen height (or width, on a screen stood on its end), stepped by the coach's text-size setting
  function sizes(){const H=Math.min(g.innerHeight||720,(g.innerWidth||1280)*0.75),k=1+0.15*DISPLAY.size;return{max:Math.max(16,H*0.075*k),min:Math.max(14,H*0.032*k)};}
  const fits=()=>root.scrollHeight<=(g.innerHeight||720)+2;
  function tryAt(html,px){root.style.fontSize=`${px}px`;root.innerHTML=html;return fits();}
  function biggest(html,lo,hi){if(tryAt(html,hi))return hi;if(!tryAt(html,lo))return 0;for(let i=0;i<7;i++){const mid=(lo+hi)/2;if(tryAt(html,mid))lo=mid;else hi=mid;}return Math.floor(lo*2)/2;}
  // a block's pages: [{list,px}] -- one page when it fits at the minimum size, otherwise as many as it needs
  const layoutCache=new Map();
  function blockPages(f,b){const set=f.mode==='set',all=units(b,set,set?f.live:null),{min,max}=sizes();
    const key=JSON.stringify([g.innerWidth,g.innerHeight,DISPLAY,document.body.classList.contains('tv-has-side'),f.session&&f.session.title,f.session&&f.session.distance,f.mode,f.nav,(f.blocks||[]).map(x=>x.code),b]);
    if(layoutCache.has(key))return layoutCache.get(key);
    let pages=[];const whole=biggest(pageHtml(f,b,all,1,1),min,max);
    if(whole)pages=[{list:all,px:whole}];
    else{let cur=[];for(const u of all){const next=cur.concat(u);if(!cur.length||tryAt(pageHtml(f,b,next,1,2),min))cur=next;else{pages.push(cur);cur=[u];}}if(cur.length)pages.push(cur);
      pages=pages.map((list,i)=>({list,px:biggest(pageHtml(f,b,list,i+1,pages.length),min,max)||min}));}
    if(layoutCache.size>40)layoutCache.clear();layoutCache.set(key,pages);return pages;}
  // all pages of the frame: SET = the coach's block; WHOLE = every block in turn
  let pages=[],page=0,turnTimer=0;const TURN_MS=g.MSOS_TV_TURN_MS||12000;
  function layout(){clearTimeout(turnTimer);const f=TV.frame;if(!f)return;
    if(f.empty||!f.session||!(f.blocks||[]).length){pages=[];root.style.fontSize='';root.innerHTML=emptyHtml(f);return;}
    const before=pages[page]&&pages[page].block;pages=[];
    for(const b of f.blocks){const ps=blockPages(f,b);ps.forEach((p,i)=>pages.push({block:b.id,b,list:p.list,px:p.px,no:i+1,of:ps.length}));}
    // stay on the block on screen; a new frame in SET mode starts at its first page; WHOLE starts at the coach's block
    let at=pages.findIndex(p=>p.block===before);if(at<0||f.mode==='set')at=Math.max(0,pages.findIndex(p=>p.b.active));if(f.mode==='set'&&pages[at]&&pages[at].block!==before)at=0;
    page=Math.max(0,at);show();}
  function show(){clearTimeout(turnTimer);const p=pages[page];if(!p)return;root.style.fontSize=`${p.px}px`;root.innerHTML=pageHtml(TV.frame,p.b,p.list,p.no,p.of);TV.page={index:page,count:pages.length,block:p.block,no:p.no,of:p.of,px:p.px};
    if(pages.length>1)turnTimer=setTimeout(()=>{page=(page+1)%pages.length;show();},TURN_MS);}
  TV.pages=()=>pages.map(p=>({block:p.block,no:p.no,of:p.of,px:p.px,units:p.list.length}));
  TV.turn=()=>{if(pages.length){page=(page+1)%pages.length;show();}};
  function overlayInner(o){if(o.kind==='swimmer')return`<div class="tvo-card sb">${o.html||'<p class="sb-none">Loading…</p>'}</div>`;
    if(o.kind==='youtube'&&o.youtube)return`<iframe src="https://www.youtube.com/embed/${esc(o.youtube)}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    if(o.kind==='note'||o.kind==='link')return`<div class="tvo-text">${o.who?`<b>${esc(o.who)}</b>`:''}<span>${esc(o.text||o.url||o.label||'')}</span></div>`;
    if(!o.url)return`<div class="tvo-text"><span>${o.waiting?`This ${esc(o.kind)} is still on its way from the phone…`:'Not available'}</span></div>`;
    if(o.kind==='video')return`<video src="${esc(o.url)}" autoplay muted loop playsinline></video>`;
    if(o.kind==='photo'||o.kind==='image')return`<img src="${esc(o.url)}" alt="">`;
    if(o.kind==='voice')return`<audio src="${esc(o.url)}" controls autoplay></audio>`;
    return`<div class="tvo-text"><span>${esc(o.label||'')}</span></div>`;}
  // 15 Oct 2026, pool TV: its browser drew the clip at the clip's own size and cut it off (about a quarter showing),
  // whatever the CSS said. So the picture is sized here in plain pixels to fit inside the box, centred.
  function fitMedia(){const el=ovl.querySelector('.tvo-frame video,.tvo-frame img');if(!el)return;const box=ovl.getBoundingClientRect();
    const w0=el.videoWidth||el.naturalWidth,h0=el.videoHeight||el.naturalHeight;if(!w0||!h0||!box.width||!box.height)return;
    const k=Math.min(box.width/w0,box.height/h0),w=Math.floor(w0*k),h=Math.floor(h0*k);
    el.style.position='absolute';el.style.maxWidth='none';el.style.maxHeight='none';el.style.width=`${w}px`;el.style.height=`${h}px`;
    el.style.left=`${Math.floor((box.width-w)/2)}px`;el.style.top=`${Math.floor((box.height-h)/2)}px`;el.setAttribute('width',w);el.setAttribute('height',h);}
  TV.fitMedia=fitMedia;
  // The swimmer panel holds a lot: shrink its type until it all fits in the panel.
  function fitCard(){const c=ovl.querySelector('.tvo-card.sb');if(!c)return;let size=ovl.classList.contains('tvo-full')?34:24,guard=0;c.style.fontSize=`${size}px`;while(c.scrollHeight>c.clientHeight+2&&size>10&&guard++<40){size-=1;c.style.fontSize=`${size}px`;}}
  TV.fitCard=fitCard;
  let overlayKey='';
  function drawOverlay(o){if(!o)stopMirror();const key=o?JSON.stringify([o.id,o.mode,o.url||'',o.waiting||false,o.kind==='swimmer'?o.page:'',o.kind==='swimmer'?o.html:'']):'';if(key===overlayKey)return;overlayKey=key;
    // a swimmer side panel narrows the Board to the left so nothing is hidden under it
    const side=!!(o&&o.kind==='swimmer'&&o.mode!=='full');if(document.body.classList.contains('tv-has-side')!==side){document.body.classList.toggle('tv-has-side',side);if(TV.frame)setTimeout(fit,0);}
    if(!o){ovl.className='';ovl.innerHTML='';return;}
    ovl.className=`tv-overlay tvo-${o.mode==='full'?'full':'corner'} ${o.kind==='swimmer'?'tvo-swimmer':''}`;
    ovl.innerHTML=`<div class="tvo-frame">${overlayInner(o)}</div>${o.label&&o.kind!=='swimmer'?`<div class="tvo-label">${esc(o.label)}</div>`:''}`;
    stopMirror();
    if(o.kind==='video'&&o.url&&o.mode!=='full'){startMirror(o);watchMedia(o);return;}
    if(o.kind==='swimmer')setTimeout(fitCard,0);
    const m=ovl.querySelector('.tvo-frame video,.tvo-frame img');if(m){m.addEventListener('loadedmetadata',fitMedia);m.addEventListener('load',fitMedia);setTimeout(fitMedia,300);setTimeout(fitMedia,1500);}
    watchMedia(o);}
  // 15 Oct 2026, pool TV: full-screen clips play fine, but in the corner the TV's video player ignores the box size and
  // shows only a cut-off piece. So in the corner the clip plays hidden and each frame is painted into an ordinary
  // picture (canvas) the size of the box. If this TV can't hand its video frames over (the picture stays black), the
  // clip goes full screen instead -- a whole clip beats a quarter of one.
  let mirror=null;
  function stopMirror(){if(!mirror)return;mirror.stop=true;try{mirror.video.pause();mirror.video.removeAttribute('src');mirror.video.load();}catch{}mirror.video.remove();mirror=null;}
  function startMirror(o){const frame=ovl.querySelector('.tvo-frame');if(!frame)return;frame.innerHTML='';
    const v=document.createElement('video');v.muted=true;v.loop=true;v.autoplay=true;v.setAttribute('playsinline','');v.setAttribute('muted','');v.crossOrigin='anonymous';
    v.style.cssText='position:fixed;left:-4000px;top:-4000px;width:2px;height:2px;opacity:0;pointer-events:none';document.body.appendChild(v);
    const c=document.createElement('canvas');c.className='tvo-mirror';c.style.cssText='position:absolute;left:0;top:0';frame.appendChild(c);
    const m=mirror={video:v,canvas:c,stop:false,seen:false,start:Date.now(),blank:0};
    const size=()=>{const b=ovl.getBoundingClientRect();const w0=v.videoWidth,h0=v.videoHeight;if(!w0||!h0)return;const k=Math.min(b.width/w0,b.height/h0),w=Math.floor(w0*k),h=Math.floor(h0*k);
      if(c.width!==w||c.height!==h){c.width=w;c.height=h;c.style.width=`${w}px`;c.style.height=`${h}px`;c.style.left=`${Math.floor((b.width-w)/2)}px`;c.style.top=`${Math.floor((b.height-h)/2)}px`;}};
    const ctx=c.getContext('2d');
    const tick=()=>{if(m.stop)return;try{if(v.readyState>=2){size();if(c.width){ctx.drawImage(v,0,0,c.width,c.height);
      if(!m.seen&&v.currentTime>0.4){let lit=false;try{const d=ctx.getImageData(0,0,c.width,c.height).data;for(let i=0;i<d.length;i+=4*97){if(d[i]+d[i+1]+d[i+2]>30){lit=true;break;}}}catch{lit=true;}
        if(lit)m.seen=true;else if(++m.blank>90)return fallbackFull(o);}}}}catch{}
      if(!m.seen&&Date.now()-m.start>12000)return fallbackFull(o);
      requestAnimationFrame(tick);};
    v.addEventListener('loadeddata',()=>requestAnimationFrame(tick),{once:true});v.src=o.url;try{const p=v.play();if(p&&p.catch)p.catch(()=>{});}catch{}
    TV.mirror=m;}
  function fallbackFull(o){stopMirror();ovl.className='tv-overlay tvo-full';const frame=ovl.querySelector('.tvo-frame');if(frame){frame.innerHTML=`<video src="${esc(o.url)}" autoplay muted loop playsinline></video>`;const v=frame.querySelector('video');v.addEventListener('loadedmetadata',fitMedia);setTimeout(fitMedia,300);}TV.fellBackFull=true;}
  function fit(){layoutCache.clear();layout();}
  function draw(f,slot=false){if(maybeUpdate(f))return;TV.frame=f;root.className='tv-root tv-board';layout();if(!slot)drawOverlay(f.overlay||null);}
  // 19 Oct 2026: the shared slot -- whatever any coach has put on top, with their name on it.
  // 27 Oct 2026 (Andy: "I still haven't actually had the video show on the TV board"): the TV now says whether a video
  // actually started -- back to the coach's phone on the TV's live channel, and on the TV itself when it can't play.
  // YouTube's player reports through postMessage once it is asked to (enablejsapi); a clip reports through its own events.
  const YT_ERR={2:'that link isn\'t a playable YouTube video',5:'this TV\'s browser can\'t play it',100:'the video was removed or is private',101:'the owner doesn\'t allow it to play inside other apps',150:'the owner doesn\'t allow it to play inside other apps',152:'the owner doesn\'t allow it to play inside other apps',153:'YouTube didn\'t accept the TV page'};
  let watch=null;
  function report(state,detail,o){TV.mediaStatus={state,detail,id:o?.id||'',at:Date.now()};
    try{live.send?.({topic:live.topic,event:'broadcast',ref:String(++live.ref),payload:{type:'broadcast',event:'tv-status',payload:{id:o?.id||'',kind:o?.kind||'',state,detail}}});}catch{}}
  TV.report=report;
  function watchMedia(o){if(watch)clearTimeout(watch.t);watch=null;if(!o||!['youtube','video'].includes(o.kind)||!o.url&&!o.youtube)return;const w=watch={id:o.id};let done=false;
    const fin=(st,d='')=>{if(done||watch!==w)return;done=true;clearTimeout(w.t);report(st,d,o);
      if(st!=='playing'){const fr=ovl.querySelector('.tvo-frame');if(fr&&!fr.querySelector('.tvo-fail'))fr.insertAdjacentHTML('beforeend',`<div class="tvo-fail">${st==='failed'?'Can\'t play this video here':'Video not playing yet'} — ${esc(d)}</div>`);}};
    if(o.kind==='youtube'){const fr=ovl.querySelector('iframe');if(!fr)return;const hello=()=>{try{fr.contentWindow.postMessage(JSON.stringify({event:'listening',id:1,channel:'widget'}),'*');}catch{}};
      fr.addEventListener('load',()=>{hello();setTimeout(hello,1500);setTimeout(hello,4000);});
      w.onmsg=e=>{if(e.source!==fr.contentWindow)return;let m;try{m=typeof e.data==='string'?JSON.parse(e.data):e.data;}catch{return;}
        if(m?.event==='onError')fin('failed',YT_ERR[m.info]||`YouTube error ${m.info}`);
        else if((m?.event==='infoDelivery'&&m.info&&m.info.playerState===1)||(m?.event==='onStateChange'&&m.info===1))fin('playing');};}
    else{const v=ovl.querySelector('video')||document.querySelector('video[data-tv-mirror-src]');if(v){v.addEventListener('playing',()=>fin('playing'),{once:true});v.addEventListener('error',()=>fin('failed','the clip couldn\'t load'),{once:true});if(!v.paused&&v.currentTime>0)fin('playing');}}
    w.t=setTimeout(()=>fin('stuck','it hasn\'t started after 25 seconds (slow connection, or the TV needs a tap to allow video)'),25000);}
  addEventListener('message',e=>{try{watch?.onmsg?.(e);}catch{}});
  function slotOverlay(r){const o=r.overlay;if(!o)return null;return{...o,label:[o.label,r.overlay_by].filter(Boolean).join(' · ')};}
  TV.draw=draw;TV.fit=fit;
  let resizeT=0;addEventListener('resize',()=>{clearTimeout(resizeT);resizeT=setTimeout(()=>{if(TV.frame)fit();fitMedia();fitCard();},150);});

  // ---------- keep it current ----------
  let misses=0,timer=0,polling=false,again=false;
  function net(ok){misses=ok?0:misses+1;statusEl.hidden=misses<4;statusEl.textContent=misses>=4?'Reconnecting…':'';}
  // 19 Oct 2026 ("within a couple of seconds to 3-5 seconds at the most"): the TV listens on its own live channel; a
  // coach phone sends a data-free "look now" after each change and the TV fetches its frame straight away. While that
  // channel is up the regular check slows to every 5 s (less traffic on the pool wifi); without it, every 1.5 s as before.
  const NUDGE_POLL_MS=g.MSOS_TV_NUDGE_POLL_MS||5000;
  const live=TV.live={key:'',ws:null,up:false,ref:0,hb:0,retry:0,nudges:0};
  function listen(key){if(!key||!/^[0-9a-f]{32}$/.test(key)||typeof WebSocket!=='function')return;if(live.key===key&&live.ws&&live.ws.readyState<=1)return;
    live.key=key;try{live.ws?.close();}catch{}const base=String(CFG.supabaseUrl||'').replace(/\/$/,'').replace(/^http/,'ws');if(!base||!CFG.supabaseAnonKey)return;
    let ws;try{ws=new WebSocket(`${base}/realtime/v1/websocket?apikey=${encodeURIComponent(CFG.supabaseAnonKey)}&vsn=1.0.0`);}catch{return;}live.ws=ws;
    const topic=`realtime:msos-tv-${key}`,send=m=>{try{if(ws.readyState===1)ws.send(JSON.stringify(m));}catch{}};let joinRef='';live.topic=topic;live.send=send;
    ws.onopen=()=>{joinRef=String(++live.ref);send({topic,event:'phx_join',ref:joinRef,join_ref:joinRef,payload:{config:{broadcast:{self:false,ack:false},presence:{key:''},private:false,postgres_changes:[]}}});
      clearInterval(live.hb);live.hb=setInterval(()=>send({topic:'phoenix',event:'heartbeat',payload:{},ref:String(++live.ref)}),25000);};
    ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch{return;}
      if(m.event==='phx_reply'&&m.topic===topic&&m.ref===joinRef){live.up=m.payload?.status==='ok';if(live.up)live.retry=0;return;}
      if(m.event==='broadcast'&&m.topic===topic&&m.payload?.event==='nudge'){live.nudges++;poll();}};
    ws.onclose=()=>{clearInterval(live.hb);if(live.ws!==ws)return;live.up=false;live.ws=null;const k=live.key;setTimeout(()=>{if(!live.ws)listen(k);},[1000,2000,5000,10000,30000][Math.min(live.retry++,4)]);};
    ws.onerror=()=>{};}
  async function poll(){clearTimeout(timer);if(polling){again=true;return;}polling=true;
    try{const r=await rpc('msos_tv_frame',TV.slot?{p_secret:secret(),p_rev:TV.rev,p_orev:TV.orev}:{p_secret:secret(),p_rev:TV.rev});net(true);if(r?.nudge)listen(r.nudge);if(r&&'display' in r&&applyDisplay(r.display)&&TV.frame)fit();
      if(r?.status==='frame'&&r.slot){const boardChanged=Number(r.rev)!==TV.rev||!TV.frame;TV.slot=true;TV.orev=Number(r.orev)||0;TV.rev=Number(r.rev)||0;TV.state='live';if(boardChanged)draw(r.frame||{},true);drawOverlay(slotOverlay(r));}
      else if(r?.status==='frame'){TV.rev=Number(r.rev)||0;TV.state='live';draw(r.frame||{});}
      else if(r?.status==='same'){if(TV.state!=='live'&&!TV.frame){TV.state='paired';waiting(r.label);}}
      else if(r?.status==='pairing'){if(TV.state!=='pairing'||!root.querySelector('[data-tv-code]'))showCode(r.code);}
      else{TV.rev=0;TV.frame=null;await pair();}}
    catch{net(false);}
    polling=false;if(again){again=false;return poll();}
    timer=setTimeout(poll,live.up?NUDGE_POLL_MS:POLL_MS);}
  // Keep the screen awake while the board is up.
  async function wake(){try{if(navigator.wakeLock&&document.visibilityState==='visible')await navigator.wakeLock.request('screen');}catch{}}
  document.addEventListener('visibilitychange',wake);
  document.addEventListener('click',()=>{try{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();}catch{}});
  (async()=>{if(!CFG.supabaseUrl){root.innerHTML='<section class="tv-pairing"><h1>Not configured</h1></section>';return;}
    try{await pair();}catch{net(false);}wake();poll();})();
})(globalThis);
