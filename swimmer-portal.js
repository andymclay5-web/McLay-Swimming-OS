'use strict';
(function(){
  const ROOT=document.querySelector('#portal');
  const CFG=window.MCLAY_CONFIG||{};
  const DEVICE_KEY='msos_swimmer_device_token_v1';
  const ATHLETE_KEY='msos_swimmer_athlete_id_v1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock=v=>{const n=Number(v);if(!Number.isFinite(n))return'—';const m=Math.floor(n/60),s=n-m*60,txt=s.toFixed(Math.abs(s-Math.round(s))>.001?2:0);return m?`${m}:${txt.padStart(txt.includes('.')?5:2,'0')}`:txt};
  async function rpc(name,body){
    if(!CFG.supabaseUrl||!CFG.supabaseAnonKey)throw new Error('Secure swimming service is not configured.');
    const res=await fetch(`${String(CFG.supabaseUrl).replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:CFG.supabaseAnonKey,Authorization:`Bearer ${CFG.supabaseAnonKey}`,'Content-Type':'application/json'},body:JSON.stringify(body||{})});
    const raw=await res.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{data=raw}
    if(!res.ok)throw new Error(data?.message||data?.hint||`Secure access failed (${res.status})`);
    return data;
  }
  const chips=map=>Object.entries(map||{}).filter(([,v])=>Number(v)>0).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`<span class="chip"><b>${esc(k)}</b> ${Number(v).toLocaleString()}m</span>`).join('');
  function eventCard(e){
    const next=e.next||null,season=Number(e.seasonImprovementSeconds),gap=Number(next?.gapSeconds);
    return `<article class="event"><div class="event-top"><div><h3>${esc(`${e.distance||''} ${e.stroke||''}`.trim())}</h3><strong>PB ${clock(e.seconds)}</strong><small>${esc(e.course||'')}</small></div>${next?`<span class="gap">${gap.toFixed(2)}s to ${esc(next.label||'next benchmark')}</span>`:`<span class="achieved">No faster loaded benchmark</span>`}</div>${Number.isFinite(season)&&season>0?`<div class="chips"><span class="chip">Season improvement <b>−${season.toFixed(2)}s</b></span></div>`:''}</article>`;
  }
  function render(snapshot){
    const p=snapshot?.payload||{},a=p.athlete||{},events=p.performance?.events||[],week=p.training?.week||{},month=p.training?.month||{},today=p.training?.today||null,priority=events.find(e=>e.next)||events[0]||null;
    ROOT.innerHTML=`
      <section class="portal-card hero"><p class="eyebrow">MCLAY SWIMMING OS · MY SWIMMING</p><h1>${esc(a.preferred_name||a.full_name||'Swimmer')}</h1><p class="muted">Your performance, pathway and training in one place.</p><div class="kpis"><div class="kpi"><small>Priority opportunity</small><b>${priority?esc(`${priority.distance} ${priority.stroke}`):'Loading evidence'}</b>${priority?.next?`<small>${Number(priority.next.gapSeconds).toFixed(2)}s to ${esc(priority.next.label)}</small>`:''}</div><div class="kpi"><small>Events tracked</small><b>${events.length}</b><small>${esc(p.performance?.course||'')}</small></div></div></section>
      <section class="portal-card"><p class="eyebrow">PERFORMANCE + PATHWAY</p><h2>Every event. Where you are. What's next.</h2><div class="events">${events.length?events.map(eventCard).join(''):'<p class="muted">No verified event evidence is currently published.</p>'}</div></section>
      <section class="portal-card"><p class="eyebrow">YOUR TRAINING</p><h2>The work underneath it</h2><div class="training-grid"><article class="training"><small>Last 7 days</small><h3>${Number(week.confirmedDeliveredMetres||0).toLocaleString()}m</h3><span>${Number(week.sessions||0)} recorded sessions</span><div class="chips">${chips(week.strokes||week.tags||{})}</div></article><article class="training"><small>Last 30 days</small><h3>${Number(month.confirmedDeliveredMetres||0).toLocaleString()}m</h3><span>${Number(month.sessions||0)} recorded sessions</span><div class="chips">${chips(month.strokes||month.tags||{})}</div></article></div>${today?`<article class="training" style="margin-top:10px"><small>CURRENT / LATEST SESSION</small><h3>${esc(today.title||'Training')}</h3><span>${Number(today.deliveredMetres||today.prescribedMetres||0).toLocaleString()}m · ${esc(today.delivery||'')}</span><div class="chips">${chips(today.strokes||{})}</div></article>`:''}</section>
      ${Array.isArray(p.sharedEvidence)&&p.sharedEvidence.length?`<section class="portal-card"><p class="eyebrow">FROM YOUR COACH</p><h2>Shared notes + evidence</h2>${p.sharedEvidence.slice(0,8).map(x=>`<article class="training"><h3>${esc(x.title||x.type||'Coach note')}</h3><span>${esc(x.text||x.note||'')}</span></article>`).join('')}</section>`:''}
      <p class="portal-foot">Private swimmer view · ${esc(a.full_name||'')} · Published ${esc(String(snapshot?.published_at||'').slice(0,16).replace('T',' '))}</p>`;
  }
  function fail(err){ROOT.innerHTML=`<section class="portal-card error"><p class="eyebrow">SECURE ACCESS</p><h1>We couldn't open your swimmer view.</h1><p>${esc(err?.message||err)}</p><p class="muted">Ask your coach to generate a fresh QR code. Old QR codes cannot be reused.</p></section>`;}
  async function start(){
    try{
      const params=new URLSearchParams(location.search),invite=params.get('invite');let device=localStorage.getItem(DEVICE_KEY)||'';
      if(invite){
        const claimed=await rpc('msos_claim_swimmer_invite',{p_invite_token:invite,p_device_label:[navigator.platform,navigator.userAgent].filter(Boolean).join(' · ').slice(0,120)});
        device=claimed?.device_token||'';if(!device)throw new Error('The QR code could not be claimed.');
        localStorage.setItem(DEVICE_KEY,device);if(claimed?.athlete_id)localStorage.setItem(ATHLETE_KEY,claimed.athlete_id);
        history.replaceState({},'',location.pathname);
      }
      if(!device)throw new Error('No swimmer access is set up on this phone yet.');
      const snapshot=await rpc('msos_swimmer_portal_snapshot',{p_device_token:device});render(snapshot);
    }catch(err){if(/invalid|revoked/i.test(String(err?.message||''))){localStorage.removeItem(DEVICE_KEY);localStorage.removeItem(ATHLETE_KEY);}fail(err)}
  }
  start();
})();