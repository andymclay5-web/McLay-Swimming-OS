'use strict';
(function(g){
  const M=g.MSOS4,X=M?.eyesUpPilotBM;if(!M?.ui?.renderTV||!X)return;
  const T=M.tvPilotBM={build:'v4-swimmer-tv-pilot-20260822bm',refreshMs:15000,timer:null,lastRefreshAt:0,lastRefreshError:''};
  const UI=M.ui,base=UI.renderTV.bind(UI);
  const text=v=>String(v??'').replace(/\s+/g,' ').trim(),esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??''),clock=s=>M.util?.clock?M.util.clock(Number(s)):String(s??'');
  const displayName=a=>M.boardEngine?.name?.(a,M.ui?.presentAthletes?.()||[])||text(a?.board_name||a?.preferred_name||a?.full_name||a?.id);
  const workLabel=item=>M.boardEngine?.workLabel?.(item)||text(item?.raw||item?.text||'Current set');

  function timingLabel(model){
    if(model?.timingLabel)return model.timingLabel;
    return model?.timingOwnership==='coach'?'COACH TIME':model?.timingOwnership==='athlete'?'SELF CLOCK':'SHARED';
  }
  function groupHtml(model){
    const groups=(model?.prescriptionGroups||[]).filter(x=>x.athletes?.length);if(groups.length<=1)return'';
    return`<div class="eyes-up-work-groups">${groups.map(gr=>`<div><b>${esc(gr.athletes.map(displayName).join(' + ')||'Group')}</b><span>${esc(workLabel(gr.item))}</span></div>`).join('')}</div>`;
  }
  function targetHtml(model){
    const bands=(model?.targetBands||[]).filter(x=>x.athletes?.length);if(!bands.length)return'';
    return`<div class="eyes-up-target-bands">${bands.map(b=>{const p=b.target,names=b.athletes.map(displayName).join(' · ');let target='No target loaded';if(p?.kind==='physiology')target=p.label||'Physiology target';else if(p?.kind==='pace')target=`${p.label||''}${p.sendOff?` · leave ${clock(p.sendOff)}`:''}`.trim();else if(p?.label)target=p.label;return`<div><strong>${esc(target)}</strong><span>${esc(names)}</span></div>`;}).join('')}</div>`;
  }
  function statusText(){
    const age=T.lastRefreshAt?Math.max(0,Math.round((Date.now()-T.lastRefreshAt)/1000)):null;
    if(T.lastRefreshError)return`Cloud refresh failed · ${T.lastRefreshError}`;
    if(age!=null)return`Coach data refreshed ${age}s ago`;
    return M.cloud?.ready?.()?'Waiting for first coach refresh':'Local pilot copy · cloud not connected';
  }
  function ensureControls(){
    let c=document.querySelector('#tvPilotControl');if(c)return c;
    c=document.createElement('div');c.id='tvPilotControl';c.className='tv-pilot-control';c.innerHTML='<span data-tv-pilot-status></span><button data-tv-pilot-refresh>Refresh</button><button data-tv-pilot-fullscreen>Full screen</button><button data-tv-pilot-awake>Keep awake</button>';
    document.body.append(c);
    c.querySelector('[data-tv-pilot-refresh]').onclick=()=>refreshCloud({manual:true});
    c.querySelector('[data-tv-pilot-fullscreen]').onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.();else await document.exitFullscreen?.()}catch(e){M.toast?.(e.message||'Fullscreen unavailable')}};
    c.querySelector('[data-tv-pilot-awake]').onclick=async()=>{try{if(M.wake?.sentinel||M.state?.settings?.keepAwake)await M.wake?.release?.();else await M.wake?.acquire?.();paintControls()}catch(e){M.toast?.(e.message||'Wake lock unavailable')}};
    return c;
  }
  function paintControls(){const c=ensureControls();const s=c.querySelector('[data-tv-pilot-status]');if(s)s.textContent=statusText();const a=c.querySelector('[data-tv-pilot-awake]');if(a)a.textContent=M.wake?.sentinel?'Screen awake':M.state?.settings?.keepAwake?'Awake pending':'Keep awake';}
  function chooseSession(){
    let cur=M.currentSession?.();if(cur)return cur;
    const rows=Object.values(M.state?.canonicalSessions||{}).sort((a,b)=>`${b?.identity?.date||''}|${b?.identity?.dayPart||''}`.localeCompare(`${a?.identity?.date||''}|${a?.identity?.dayPart||''}`));
    if(rows[0]){M.state.settings.selectedSessionId=rows[0].id;cur=rows[0];}
    return cur||null;
  }
  function overlay(){
    const host=document.querySelector('#tvView');if(!host)return;
    host.querySelector('[data-eyes-up-tv]')?.remove();
    const model=X.boardModel(),session=chooseSession();
    if(!session){host.innerHTML='<section class="eyes-up-tv"><h2>No coach session loaded</h2><p>Refresh after the coaching device has published a session.</p></section>';paintControls();return;}
    if(model?.status!=='active'){paintControls();return;}
    const next=model.nowNext?.next?.itemLabel||'',current=workLabel(model.item),el=document.createElement('section');el.dataset.eyesUpTv='1';el.className='eyes-up-tv';
    el.innerHTML=`<div class="eyes-up-tv-now"><div><small>NOW</small><h2>${esc(current)}</h2></div><b class="${model.timingOwnership==='coach'?'coach':model.timingOwnership==='athlete'?'self':'shared'}">${esc(timingLabel(model))}</b></div>${next?`<div class="eyes-up-tv-next"><small>NEXT</small><span>${esc(next)}</span></div>`:''}${groupHtml(model)}${targetHtml(model)}`;
    const hero=host.querySelector('.tv-hero');if(hero)hero.insertAdjacentElement('afterend',el);else host.prepend(el);
    paintControls();
  }
  function render(){base();requestAnimationFrame(overlay);}
  async function refreshCloud({manual=false}={}){
    if(!M.cloud?.ready?.()){T.lastRefreshError='cloud not connected';paintControls();return false;}
    try{
      const keep={view:M.state.settings.view,role:M.state.settings.activeRole,aid:M.state.settings.activeUserAthleteId};
      const payload=await M.cloud.pullShadow();M.cloud.applyShadow(payload);
      M.state.settings.view=keep.view||'tv';M.state.settings.activeRole=keep.role||'owner';M.state.settings.activeUserAthleteId=keep.aid||'';
      T.lastRefreshAt=Date.now();T.lastRefreshError='';chooseSession();render();return true;
    }catch(e){T.lastRefreshError=text(e.message||e);paintControls();if(manual)M.toast?.(`TV refresh failed · ${T.lastRefreshError}`);return false;}
  }
  function startRefresh(){if(T.timer)clearInterval(T.timer);T.timer=setInterval(()=>refreshCloud(),T.refreshMs);setTimeout(()=>refreshCloud(),500);}
  function install(){M.state.settings.activeRole='owner';M.state.settings.view='tv';chooseSession();UI.renderTV=render;render();startRefresh();ensureControls();if(M.wake?.supported?.())M.wake.acquire?.().catch(()=>paintControls());}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  T.overlay=overlay;T.render=render;T.refreshCloud=refreshCloud;T.groupHtml=groupHtml;T.targetHtml=targetHtml;T.chooseSession=chooseSession;
})(globalThis);
