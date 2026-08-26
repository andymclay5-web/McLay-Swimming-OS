'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M?.ui)return;
  const BUILD='v4-meet-program-ops-bridge-20260827b2';
  let retainedOps=null,syncTimer=null,observer=null,mountQueued=false,browseMode=false;

  const meetHost=()=>document.querySelector('#meetView');
  const programme=()=>meetHost()?.querySelector('[data-meet-program-ba]')||null;

  function workingCard(){
    const h=meetHost();
    return h?.querySelector('[data-meet-ops-av]')||retainedOps||null;
  }

  function enableWorkingControls(){
    M.state.meetOps=M.state.meetOps||{};
    M.state.meetOps.showRaceControls=true;
  }

  function selectedRace(){
    return M.meetOpsEngine?.selectedRace?.()||null;
  }

  function selectedHeatKey(){
    const p=programme();
    const expanded=p?.querySelector('.ba-row.expanded')?.closest('[data-ba-heat-key]');
    if(expanded?.dataset.baHeatKey)return expanded.dataset.baHeatKey;
    const r=selectedRace(),heats=M.meetProgramBA?.allHeats?.()||[],sid=M.state?.meetProgramBA?.selectedSourceId||'';
    if(!r)return M.state?.meetProgramBA?.nowKey||'';
    const hit=heats.find(h=>String(h.session_id||'')===String(sid)&&Number(h.event_number)===Number(r.event_number)&&Number(h.heat)===Number(r.heat))||heats.find(h=>Number(h.event_number)===Number(r.event_number)&&Number(h.heat)===Number(r.heat));
    return hit?[hit.session_id,r.event_number||0,r.heat||0].join('|'):(M.state?.meetProgramBA?.nowKey||'');
  }

  function openCaptureFor(r){
    if(!r)return false;
    M.meetOpsEngine?.openCapture?.(r);
    return true;
  }

  function openVideoFor(r){
    if(!openCaptureFor(r))return false;
    const input=document.querySelector('[data-mo-video]');
    if(input){input.click();return true}
    return false;
  }

  function startCommentary(){
    const hk=selectedHeatKey();
    if(!hk)return M.toast?.('Select an AquaGym race first');
    M.meetProgramBA?.startTalk?.(hk);
  }

  function ensureStyle(){
    if(document.getElementById('meet-program-ops-priority-style'))return;
    const s=document.createElement('style');
    s.id='meet-program-ops-priority-style';
    s.textContent=`
      [data-meet-program-working-card="1"] .mo-card.primary{display:grid;gap:.4rem}
      [data-meet-program-working-card="1"] .mo-manual{margin:.25rem 0 .1rem}
      [data-meet-program-working-card="1"] .mo-manual input{font-size:1.08rem;min-height:46px;font-variant-numeric:tabular-nums}
      [data-meet-program-working-card="1"] .mo-quick-note{margin:.1rem 0}
      [data-meet-program-working-card="1"] .mo-quick-note textarea{min-height:66px}
      [data-meet-program-working-card="1"] .mpo-primary-actions{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:.35rem;margin:.15rem 0 .25rem}
      [data-meet-program-working-card="1"] .mpo-primary-actions button{min-height:48px;font-weight:800}
      [data-meet-program-working-card="1"] details.mpo-backup-timer{border:1px solid rgba(13,69,102,.14);border-radius:10px;padding:.35rem .45rem;margin:.1rem 0}
      [data-meet-program-working-card="1"] details.mpo-backup-timer>summary{cursor:pointer;font-size:.84rem;font-weight:750}
      [data-meet-program-working-card="1"] details.mpo-backup-timer .mo-timer{margin-top:.4rem;border-width:1px;padding:.45rem}
      [data-meet-program-working-card="1"] details.mpo-backup-timer .mo-timer>[data-mo-clock-key]{font-size:1.5rem}
      [data-meet-program-working-card="1"] details.mpo-backup-timer .mo-timer button{min-height:42px}
      [data-meet-program-working-card="1"] .mo-actions{opacity:.9}
      @media(max-width:620px){[data-meet-program-working-card="1"] .mpo-primary-actions{grid-template-columns:1fr 1fr}[data-meet-program-working-card="1"] .mpo-primary-actions [data-mpo-commentary]{grid-column:1/-1}}
    `;
    document.head.appendChild(s);
  }

  function collapseTimers(ops){
    for(const card of ops.querySelectorAll('.mo-card')){
      const timer=card.querySelector('.mo-timer');
      if(!timer||timer.closest('[data-meet-backup-timer]'))continue;
      const d=document.createElement('details');
      d.className='mpo-backup-timer';
      d.dataset.meetBackupTimer='1';
      const summary=document.createElement('summary');
      summary.textContent='Backup stopwatch';
      d.appendChild(summary);
      timer.before(d);
      d.appendChild(timer);
      const k=card.dataset.moCard||'';
      if(M.state?.meetOps?.races?.[k]?.timer_running)d.open=true;
    }
    for(const d of ops.querySelectorAll('[data-meet-backup-timer]')){
      const card=d.closest('.mo-card'),k=card?.dataset.moCard||'';
      if(M.state?.meetOps?.races?.[k]?.timer_running)d.open=true;
    }
  }

  function primaryActions(ops){
    const card=ops.querySelector('.mo-card.primary');
    if(!card)return;
    card.dataset.meetPriorityCard='1';
    const manual=card.querySelector('.mo-manual'),note=card.querySelector('.mo-quick-note');
    const label=manual?.querySelector('label');
    if(label?.firstChild?.nodeType===Node.TEXT_NODE)label.firstChild.nodeValue='Type race time';
    const quickVoice=note?.querySelector('[data-mo-quick-voice]');
    if(quickVoice&&!/Stop voice/i.test(quickVoice.textContent||''))quickVoice.textContent='Race voice note';
    let actions=card.querySelector('[data-meet-priority-actions]');
    if(!actions){
      actions=document.createElement('div');
      actions.className='mpo-primary-actions';
      actions.dataset.meetPriorityActions='1';
      actions.innerHTML='<button data-mpo-commentary>Live commentary</button><button data-mpo-video>Video</button><button data-mpo-more>Photo / more</button>';
      (note||manual||card.querySelector('.mo-metrics'))?.after(actions);
      actions.querySelector('[data-mpo-commentary]').onclick=startCommentary;
      actions.querySelector('[data-mpo-video]').onclick=()=>openVideoFor(selectedRace());
      actions.querySelector('[data-mpo-more]').onclick=()=>openCaptureFor(selectedRace());
    }
    const talk=actions.querySelector('[data-mpo-commentary]');
    if(talk)talk.textContent=document.querySelector('[data-ba-talkbar]')?'Stop commentary':'Live commentary';
    const timer=card.querySelector('[data-meet-backup-timer]');
    if(timer&&actions.nextElementSibling!==timer)actions.after(timer);
  }

  function prioritiseDeckTools(ops){
    ensureStyle();
    collapseTimers(ops);
    primaryActions(ops);
    const running=Object.values(M.state?.meetOps?.races||{}).some(x=>x?.timer_running);
    const heatHead=ops.querySelector('.mo-heat-head');
    if(heatHead&&heatHead.hidden===running)heatHead.hidden=!running;
  }

  function hasExplicitRace(p=programme()){
    return !!p?.querySelector('.ba-row.expanded');
  }

  function hideWorking(){
    const ops=workingCard();
    if(ops?.isConnected&&!ops.hidden)ops.hidden=true;
    return false;
  }

  function mount(){
    mountQueued=false;
    const h=meetHost(),p=programme();
    if(!h||!p||M.state?.settings?.view!=='meet')return false;
    if(browseMode||!hasExplicitRace(p))return hideWorking();
    enableWorkingControls();
    const ops=h.querySelector('[data-meet-ops-av]')||retainedOps;
    if(!ops)return false;
    retainedOps=ops;
    if(ops.hidden)ops.hidden=false;
    ops.dataset.meetProgramWorkingCard='1';
    for(const card of ops.querySelectorAll('.mo-card'))if(card.hidden)card.hidden=false;
    const sticky=p.querySelector('.ba-sticky');
    if(sticky&&ops.previousElementSibling!==sticky)sticky.after(ops);
    prioritiseDeckTools(ops);
    return true;
  }

  function queueMount(){
    if(mountQueued)return;
    mountQueued=true;
    queueMicrotask(mount);
  }

  function scrollWorkingCard(){
    requestAnimationFrame(()=>workingCard()?.scrollIntoView?.({block:'start',behavior:'smooth'}));
  }

  function syncSelected({scroll=false}={}){
    enableWorkingControls();
    const key=M.state?.meetProgramBA?.selectedKey||M.state?.meetOps?.selectedRaceKey||'';
    if(!key){mount();return false}
    if(M.meetOpsEngine?.selectKey){
      M.meetOpsEngine.selectKey(key,{scroll:false});
      queueMicrotask(()=>{
        mount();
        if(scroll)scrollWorkingCard();
      });
      return true;
    }
    mount();
    if(scroll)scrollWorkingCard();
    return false;
  }

  function scheduleSync(scroll=false){
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>syncSelected({scroll}),0);
  }

  function onProgrammeClick(e){
    if(!e.target?.closest)return;
    if(e.target.closest('[data-ba-row].aqua,[data-ba-jump-race],[data-ba-athlete]')){
      browseMode=false;
      scheduleSync(true);
      return;
    }
    if(e.target.closest('[data-ba-event],[data-ba-source],[data-ba-prev],[data-ba-next],[data-ba-add-session],[data-ba-jump-now]')){
      browseMode=true;
      setTimeout(hideWorking,0);
    }
  }

  function observe(){
    const h=meetHost();
    if(!h||observer)return;
    observer=new MutationObserver(queueMount);
    observer.observe(h,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  }

  function boot(){
    observe();
    setTimeout(()=>{
      mount();
      if(M.state?.meetProgramBA?.selectedKey&&hasExplicitRace())syncSelected({scroll:false});
    },0);
  }

  document.addEventListener('click',onProgrammeClick,false);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&M.state?.settings?.view==='meet')setTimeout(mount,0)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

  M.meetProgramOpsBridge={build:BUILD,mount,syncSelected,workingCard,prioritiseDeckTools};
})(globalThis);
