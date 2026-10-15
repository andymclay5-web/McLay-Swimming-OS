'use strict';
// TV link (15 Oct 2026). Andy: "build the full tv link ... TV board version of what I have on my phone board. Captures
// don't show unless specifically asked to ... Move from whole session to ind sets from phone, be able to put swimmer
// info in corner screen with board still showing. Like captures, modify and show straight away, all target times
// should show every time the set is shown but hidden on whole session showing."
//
// Owner of one thing: the frame a paired pool TV shows (tv.html). A TV pairs once with a 6-letter code
// (supabase/20261015_tv_screens.sql); after that the phone that controls it publishes a display-only frame built from
// the phone's own Board state, and the TV just draws it:
//  - the phone Board on WHOLE  -> the TV shows the whole session, no target times;
//  - the phone Board on a SET  -> the TV shows that set, with every present swimmer's target on every timed line
//                                 (group swimmers and modified swimmers, each beside their own work);
//  - live edits, Roll and modifications go out on the next check (about 1.5s); nothing else is sent;
//  - captures, links and swimmer cards only appear when the coach sends them (engines/tv-display.js owns that
//    overlay; this file only resolves it for the remote TV: a signed media link, or the swimmer's card facts).
// It never writes session, Roll, modifications or evidence. It reads the Board's own helpers (engines/board.js) and
// the Coordinator's prescriptions, so the TV shows exactly the same work and targets as the phone.
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M?.state)return;
  const L=M.tvLink={build:'v4-tv-link-20261015b-remember'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock=s=>M.util?.clock?M.util.clock(Number(s)):String(s??'');
  const BUCKET='swimming-media',CHECK_MS=1500,HEARTBEAT_MS=10*60*1000;
  const B=()=>M.boardEngine;
  const signedIn=()=>!!M.store?.auth?.()?.access_token;
  const role=()=>{try{return M.access?.role?.()||'owner'}catch{return'owner'}};
  const isCoach=()=>role()!=='swimmer';
  const org=()=>M.state?.settings?.organisationId||'';
  const settings=()=>(M.state.settings=M.state.settings||{});
  const saveUi=()=>{try{M.storageEngine?.saveUi?.(M.state)}catch{try{M.store?.save?.(M.state)}catch{}}};

  // ---------- identity of this phone (which phone is driving the TV) ----------
  let memDevice='';
  function deviceId(){try{let v=localStorage.getItem('msos-tv-device');if(!v){v=`dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;localStorage.setItem('msos-tv-device',v);}return v;}catch{return memDevice||(memDevice=`dev-${Math.random().toString(36).slice(2)}`);}}
  function coachName(){if(role()==='owner')return'Head coach';const email=String(M.store?.auth?.()?.user?.email||'');const n=email.split('@')[0].replace(/[^a-z]/gi,'');return n?n[0].toUpperCase()+n.slice(1).toLowerCase():'Assistant coach';}
  L.deviceId=deviceId;

  // ---------- cloud calls ----------
  async function rpc(name,body){const f=M.cloud?.fetch||M.cloudSessionEngine?.fetch;if(!f)throw new Error('Cloud is not available on this phone.');return f(`/rest/v1/rpc/${name}`,{method:'POST',body:JSON.stringify(body||{})});}
  L.rpc=rpc;

  // ---------- which TV this phone drives ----------
  // Which TV this phone drives is a fact about THIS phone, kept in this phone's own storage (like deviceId above).
  // 15 Oct 2026, first real use: it was kept in settings, which the app does not keep across a close/reopen, so after
  // Andy reopened MSOS his phone silently stopped driving the TV and the TV sat on the last thing it was sent.
  let memControl;
  function control(){if(memControl)return memControl;let v=null;try{v=JSON.parse(localStorage.getItem('msos-tv-control')||'null');}catch{}
    if(!v&&settings().tvControl?.screenId){v=settings().tvControl;try{localStorage.setItem('msos-tv-control',JSON.stringify(v));}catch{}}
    return v&&v.screenId?v:null;}
  function setControl(v){memControl=v&&v.screenId?{screenId:v.screenId,label:v.label||'Pool TV'}:null;try{if(memControl)localStorage.setItem('msos-tv-control',JSON.stringify(memControl));else localStorage.removeItem('msos-tv-control');}catch{}
    if(settings().tvControl){delete settings().tvControl;saveUi();}}
  let status={state:'idle',controller:'',error:''};
  L.status=()=>({...status,control:control()});
  function setStatus(next){status={...status,...next};try{M.tvDisplay?.paintControl?.()}catch{}}

  // ---------- frame building (projection of the phone Board) ----------
  function activeBlock(session){const id=M.state.settings?.boardBlockBySession?.[session.id];return(session.blocks||[]).find(b=>b.id===id)||(session.blocks||[]).find(b=>b.type==='main_set')||(session.blocks||[])[0]||null;}
  function boardMode(){return M.state.settings?.boardFocusMode===false?'whole':'set';}
  function present(){return B()?.present?.()||M.ui?.presentAthletes?.()||[];}
  function modified(){return B()?.modified?.()||[];}
  function targetText(r){const s=B()?.targetSummary?.(r)||'';const modeled=!!(r?.modeled||(r?.rows||[]).some(x=>x?.modeled));return modeled&&s?`≈ ${s}`:s;}
  function prescription(session,item,a){try{return E.Coordinator.prescription(session,item,a,M.state)||null}catch{return null}}
  function athleteTarget(session,item,a,actual){const p=prescription(session,item,a);const t=targetText(p?.target);if(t)return t;const it=actual||p?.item||item;return Number(it?.cycleSeconds)>0?`@ ${clock(it.cycleSeconds)}`:'—';}
  const tick=()=>new Promise(r=>setTimeout(r,0));
  async function setRow(session,item,ctx,withTargets){
    const b=B(),row={k:'set',id:item.id,work:text(b.workLabel(item)),cue:text(b.cueText(item))};
    const timed=!!b.timingIntent?.(item);
    if(withTargets&&timed&&ctx.group.length){row.targets=[];for(const a of ctx.group){row.targets.push({n:b.name(a,ctx.pool),t:athleteTarget(session,item,a)});}await tick();}
    const groups=new Map();
    for(const a of ctx.mods){let actual=null;try{actual=(withTargets?prescription(session,item,a)?.item:null)||E.Modification.adaptItem(item,a,M.state,session);}catch{actual=item;}
      const changed=!E.Modification.samePrescription?.(item,actual),showTiming=!!b.timingIntent?.(actual);if(!changed&&!showTiming)continue;
      const key=b.modGroupKey?b.modGroupKey(actual):JSON.stringify([b.workLabel(actual),b.cueText(actual)]);
      if(!groups.has(key))groups.set(key,{work:text(b.workLabel(actual)),cue:text(b.cueText(actual)),people:[]});
      groups.get(key).people.push({n:b.name(a,ctx.mods),t:withTargets&&showTiming?athleteTarget(session,item,a,actual):''});}
    if(groups.size)row.mods=[...groups.values()];
    return row;}
  async function nodeRows(session,node,ctx,withTargets){
    if(node?.kind==='set')return[await setRow(session,node,ctx,withTargets)];
    if(node?.kind==='group'){const rows=[];for(const x of node.items||[])rows.push(...await nodeRows(session,x,ctx,withTargets));return[{k:'rounds',label:`${Math.max(1,Number(node.rounds)||1)} ROUNDS${node.label?` · ${text(node.label)}`:''}`,rows}];}
    const t=text(node?.text||node?.raw||(Number(node?.distance)>0?`${node.distance}m`:''));return t?[{k:'cue',text:t}]:[];}
  async function blockFrame(session,blk,ctx,withTargets,active){const rows=[];for(const n of blk.items||[])rows.push(...await nodeRows(session,n,ctx,withTargets));
    return{id:blk.id,code:B().blockCode(blk),title:text(blk.title||'Set'),distance:B().blockDistance(blk),active:!!active,rows};}
  function liveRows(session){try{return(B()?.liveTimesRows?.(session)||[]).map(r=>{const a=(M.state.athletes||[]).find(x=>x.id===r.athlete_id);const who=a?B().name(a,present()):'Swimmer';
    if(r.msosLiveKind==='t400')return{who,label:`400 ${text(r.pool_course||'')}`,time:clock(r.result_seconds)};return{who,label:[r.distance?`${r.distance}${r.stroke?' '+text(E.Evidence.stroke(r.stroke)):''}`:'',text(r.set_label||'')].filter(Boolean).join(' · '),time:`${clock(r.best)} best`};});}catch{return[]}}
  const signed=new Map();
  async function signedUrl(path){const hit=signed.get(path);if(hit&&hit.until>Date.now())return hit.url;const cfg=M.store?.config?.()||{};
    const r=await rpcFetch(`/storage/v1/object/sign/${BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}`,{expiresIn:7200});const p=r?.signedURL||r?.signedUrl||'';if(!p)return'';
    const url=`${String(cfg.supabaseUrl||'').replace(/\/$/,'')}/storage/v1${p.startsWith('/')?p:`/${p}`}`;signed.set(path,{url,until:Date.now()+100*60*1000});return url;}
  async function rpcFetch(path,body){const f=M.cloud?.fetch||M.cloudSessionEngine?.fetch;return f(path,{method:'POST',body:JSON.stringify(body)});}
  async function overlayFrame(session,ctx){const o=M.tvDisplay?.current?.();if(!o)return null;const base={id:o.id,mode:o.mode==='full'?'full':'corner',label:text(o.label)};
    if(o.url)return{...base,kind:M.tvDisplay.linkKind(o.url),url:o.url,youtube:M.tvDisplay.youtubeId(o.url)};
    if(o.swimmer){const card=M.tvDisplay.swimmerCard?.(o.swimmer.id);const a=(M.state.athletes||[]).find(x=>x.id===o.swimmer.id);const targets=[];
      if(a&&session){const blk=activeBlock(session);const walk=items=>{const out=[];for(const n of items||[]){if(n?.kind==='set')out.push(n);else if(n?.kind==='group')out.push(...walk(n.items));}return out;};
        for(const item of walk(blk?.items).filter(i=>B()?.timingIntent?.(i)).slice(0,6)){const p=prescription(session,item,a);const t=targetText(p?.target);if(t)targets.push({work:text(B().workLabel(p?.item||item)),target:t});}}
      return{...base,kind:'swimmer',card,targets};}
    const c=o.capture||{};const out={...base,kind:c.type==='note'||(!c.media_id&&!c.media_path)?'note':c.type,who:text(c.who),text:text(c.text)};
    if(out.kind!=='note'){const live=(M.state.captures||[]).find(x=>x.id===c.id);const path=live?.media_path||c.media_path;if(path){try{out.url=await signedUrl(path);}catch{}}if(!out.url)out.waiting=true;}
    return out;}
  async function buildFrame(){const session=M.currentSession?.();const frame={v:1,at:new Date().toISOString(),mode:boardMode()};
    if(!session){frame.tvv=TV_PAGE;frame.empty='No session selected on the coach\'s phone.';frame.overlay=await overlayFrame(null,null);return frame;}
    frame.tvv=TV_PAGE;
    const pool=present(),mods=modified(),modIds=new Set(mods.map(a=>a.id)),ctx={pool,mods,group:pool.filter(a=>!modIds.has(a.id))};
    const id=session.identity||{},finished=session.finish,active=activeBlock(session);
    frame.session={title:text(id.title||`${id.dayPart||''} · ${(id.squads||[]).join(' + ')}`)||'Session',date:id.date||'',distance:Number(finished?.actualDistance)||B().sessionDistance(session),finished:!!finished,swimmers:pool.length};
    if(frame.mode==='set'&&active){frame.blocks=[await blockFrame(session,active,ctx,true,true)];frame.nav=(session.blocks||[]).map(b=>({code:B().blockCode(b),active:b.id===active.id}));frame.live=liveRows(session);}
    else{frame.mode='whole';frame.blocks=[];for(const b of session.blocks||[])frame.blocks.push(await blockFrame(session,b,ctx,false,b.id===active?.id));}
    frame.overlay=await overlayFrame(session,ctx);
    return frame;}
  L.buildFrame=buildFrame;

  // Cheap fingerprint of everything the TV shows; rebuilt only when it changes.
  function evidenceRev(){const s=M.state||{},e=s._evidenceBridge||{};return[Number(e.contentRevision)||0,(s.resultsPbBoard||s.results_pb_board||[]).length,(s.trainingTestResults||[]).length,(s.coachResults||[]).length].join('|');}
  function signature(){const session=M.currentSession?.(),o=M.tvDisplay?.current?.()||null;let blocks='';try{blocks=session?JSON.stringify(session.blocks||[]):'';}catch{}
    const cap=o?.capture?.id?(M.state.captures||[]).find(c=>c.id===o.capture.id)?.media_path||'':'';
    return JSON.stringify([session?.id||'',session?.currentSource?.hash||'',blocks.length,hash(blocks),boardMode(),session?activeBlock(session)?.id:'',present().map(a=>a.id).sort(),modified().map(a=>a.id).sort(),
      (M.state.adaptationOverrides||[]).filter(r=>r?.sessionId===session?.id).map(r=>[r.id,r.active,r.updatedAt||'',JSON.stringify(r.patch||{})]),
      (M.state.adaptationProfiles||M.state.adaptations||[]).length,o?.id||'',o?.mode||'',cap,evidenceRev(),(M.state.timedSets||[]).filter(x=>x.session_id===session?.id).length,!!session?.finish]);}
  function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return h;}
  L.signature=signature;

  // ---------- publishing ----------
  let lastSig='',lastSent=0,busy=false,timer=0,take=false,lastFrame=null;
  // The TV page checks this and reloads itself when the phone expects a newer TV page (TVs cache pages hard).
  const TV_PAGE='20261015d';
  async function publish({force=false}={}){const c=control();if(!c?.screenId||!isCoach()||!signedIn()||busy)return null;if(status.state==='taken'&&!take)return null;
    const sig=signature();if(!force&&sig===lastSig&&Date.now()-lastSent<HEARTBEAT_MS)return null;
    busy=true;try{const frame=await buildFrame();
      const r=await rpc('msos_tv_publish',{p_screen:c.screenId,p_device:deviceId(),p_name:coachName(),p_frame:frame,p_take:take});
      if(r?.ok===false){setStatus({state:'taken',controller:r.controller||'another phone',error:''});return r;}
      take=false;lastSig=sig;lastSent=Date.now();lastFrame=frame;setStatus({state:'live',controller:'',error:'',rev:r?.rev});return r;}
    catch(e){setStatus({state:'error',error:String(e?.message||e)});return null;}
    finally{busy=false;}}
  L.publish=publish;
  // Every 20s the driving phone checks it still has the TV (another coach may have taken over), so its TV button is honest.
  let lastCheck=0;
  L.check=async()=>{const c=control();if(!c?.screenId||!signedIn()||status.state==='taken')return status;lastCheck=Date.now();
    try{if(!org())return status;const list=await L.list(),s=list.find(x=>x.id===c.screenId);if(!s){setStatus({state:'error',error:'This TV is no longer connected'});return status;}if(s.controller_device&&s.controller_device!==deviceId())setStatus({state:'taken',controller:s.controller_name||'another phone'});}catch{}
    return status;};
  // The loop also keeps the Board's 📺 button drawn (cheap, idempotent) so it can't go missing after a reopen.
  function loop(){clearTimeout(timer);timer=setTimeout(async()=>{try{M.tvDisplay?.paintControl?.();}catch{}try{await publish();if(Date.now()-lastCheck>20000)await L.check();}catch{}loop();},CHECK_MS);}
  L.takeControl=async(screen)=>{setControl({screenId:screen.id,label:text(screen.label)||'Pool TV'});take=true;lastSig='';setStatus({state:'connecting',controller:'',error:''});return publish({force:true});};
  L.stopControl=()=>{setControl(null);lastSig='';setStatus({state:'idle',controller:'',error:''});};

  // ---------- pairing & list ----------
  L.pair=async(code,label)=>{if(!signedIn())throw new Error('Sign in on this phone first.');if(!org())throw new Error('This phone is not joined to the club yet.');
    const r=await rpc('msos_tv_pair',{p_org:org(),p_code:text(code),p_label:text(label)||'Pool TV'});await L.takeControl({id:r.id,label:r.label});return r;};
  L.list=async()=>{if(!signedIn()||!org())return[];const r=await rpc('msos_tv_list',{p_org:org()});return Array.isArray(r)?r:[];};
  L.revoke=async(id)=>{await rpc('msos_tv_revoke',{p_screen:id});if(control()?.screenId===id)L.stopControl();};
  L.tvUrl=()=>{try{return new URL('tv.html',location.href.split('#')[0].split('?')[0]).href;}catch{return'tv.html';}};

  // ---------- the "Pool TV" part of the TV controls (engines/tv-display.js opens the modal) ----------
  function ago(iso){const ms=Date.now()-Date.parse(iso||'');if(!Number.isFinite(ms))return'never';if(ms<60000)return'on now';const m=Math.round(ms/60000);return m<60?`${m} min ago`:`${Math.round(m/60)} h ago`;}
  L.fillPanel=async(el,reopen)=>{if(!el)return;const url=L.tvUrl();
    const pairForm=`<div class="tv-pair"><p class="muted">On the TV, open <b>${esc(url.replace(/^https?:\/\//,''))}</b>. It shows a 6-letter code — type it here.</p><div class="tv-pair-row"><input data-tv-code maxlength="8" autocapitalize="characters" placeholder="CODE"><input data-tv-label placeholder="Name (e.g. Pool TV)"><button type="button" data-tv-pair>Connect</button></div><small data-tv-pair-status></small></div>`;
    if(!signedIn()){el.innerHTML=`<section class="tv-link-panel"><h3>Pool TV</h3><p class="muted">Sign in on this phone to connect a TV.</p></section>`;return;}
    el.innerHTML=`<section class="tv-link-panel"><h3>Pool TV</h3><p class="muted">Loading TVs…</p></section>`;
    let list=[];try{list=await L.list();}catch(e){el.innerHTML=`<section class="tv-link-panel"><h3>Pool TV</h3><p class="muted">Couldn't reach the TV service: ${esc(e.message)}</p>${pairForm}</section>`;bindPair(el,reopen);return;}
    const mine=control()?.screenId,st=status;
    const rows=list.map(s=>{const isMine=s.id===mine,other=!isMine&&s.controller_device&&s.controller_device!==deviceId()?s.controller_name:'';
      return`<div class="tv-screen-row ${isMine?'mine':''}"><span><b>${esc(s.label||'Pool TV')}</b><small>${esc(ago(s.last_seen_at))}${isMine?(st.state==='taken'?` · ${esc(st.controller)} has it`:st.state==='error'?` · ${esc(st.error)}`:' · this phone drives it'):other?` · ${esc(other)} drives it`:''}</small></span><span class="tv-cap-acts">${isMine&&st.state!=='taken'?`<button type="button" data-tv-stop>Stop</button>`:`<button type="button" data-tv-take="${esc(s.id)}" data-tv-take-label="${esc(s.label||'')}">${other||st.state==='taken'?'Take over':'Drive from this phone'}</button>`}<button type="button" class="danger" data-tv-revoke="${esc(s.id)}">Disconnect</button></span></div>`;}).join('');
    el.innerHTML=`<section class="tv-link-panel"><h3>Pool TV</h3>${rows||''}<p class="muted">The TV follows your Board: <b>WHOLE</b> shows the whole session (no target times); a <b>set</b> shows that set with every swimmer's target. Roll, edits and modifications show straight away.</p>${list.length?`<details><summary>Connect another TV</summary>${pairForm}</details>`:pairForm}</section>`;
    bindPair(el,reopen);
    el.querySelectorAll('[data-tv-take]').forEach(b=>b.onclick=async()=>{b.disabled=true;await L.takeControl({id:b.dataset.tvTake,label:b.dataset.tvTakeLabel});M.toast?.('This phone is driving the TV');reopen?.();});
    el.querySelector('[data-tv-stop]')?.addEventListener('click',()=>{L.stopControl();M.toast?.('This phone stopped driving the TV');reopen?.();});
    el.querySelectorAll('[data-tv-revoke]').forEach(b=>b.onclick=async()=>{if(!confirm('Disconnect this TV? It will show a new code until it is connected again.'))return;try{await L.revoke(b.dataset.tvRevoke);M.toast?.('TV disconnected');}catch(e){M.toast?.(e.message);}reopen?.();});};
  function bindPair(el,reopen){const btn=el.querySelector('[data-tv-pair]');if(!btn)return;btn.onclick=async()=>{const out=el.querySelector('[data-tv-pair-status]');btn.disabled=true;out.textContent='Connecting…';
    try{await L.pair(el.querySelector('[data-tv-code]').value,el.querySelector('[data-tv-label]').value);out.textContent='Connected — the TV now shows your Board.';M.toast?.('TV connected');reopen?.();}catch(e){out.textContent=e.message;btn.disabled=false;}};}

  // Andy, 15 Oct 2026: "If I need to use my phone the video or display I'm showing should close and the tv board should
  // stay where it was". Leaving MSOS (another app, lock screen) takes whatever is on top of the Board off the TV; the
  // Board itself stays exactly as it was. The phone may be suspended a moment later, so this send is a keepalive one
  // built from the last frame (no new target work) and it does not wait for anything.
  function leaving(){const c=control();if(!c?.screenId||!lastFrame?.overlay||!signedIn()||status.state==='taken')return;
    try{M.tvDisplay?.clear?.();}catch{}
    const frame={...lastFrame,overlay:null,at:new Date().toISOString()};lastFrame=frame;
    const raw=M.cloud?.rawFetch||M.cloud?.fetch;if(!raw)return;
    try{const p=raw('/rest/v1/rpc/msos_tv_publish',{method:'POST',keepalive:true,body:JSON.stringify({p_screen:c.screenId,p_device:deviceId(),p_name:coachName(),p_frame:frame,p_take:false})});
      Promise.resolve(p).then(()=>{lastSig=signature();lastSent=Date.now();}).catch(()=>{});}catch{}}
  L.leaving=leaving;
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')leaving();});
  addEventListener('pagehide',leaving);
  function boot(){if(control()?.screenId)setStatus({state:'connecting'});loop();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
