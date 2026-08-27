'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M?.ui)return;
  const BUILD='v4-meet-program-phone-priority-20260827c5';
  let queued=false,noteTimer=null,bound=false,active=false;

  const host=()=>document.querySelector('#meetView');
  const programme=()=>host()?.querySelector('[data-meet-program-ba]')||null;
  const stamp=()=>M.util?.now?.()||new Date().toISOString();

  function save(){
    try{M.store?.save?.(M.state)}catch{}
    try{M.storageEngine?.saveUi?.(M.state)}catch{}
  }

  function raceForKey(k){
    const rows=M.state?.meetFieldDeck?.races||[];
    return rows.find(r=>M.meetOpsEngine?.keyFor?.(r)===k)||null;
  }

  function hideLegacyLayers(){
    const h=host(),p=programme();
    if(!h||!p)return;
    for(const sel of ['[data-meet-board-ay]','[data-meet-board-az]','[data-meet-ops-av]','[data-meet-field-deck-au]','[data-meet-intake-au]']){
      for(const n of h.querySelectorAll(sel))n.hidden=true;
    }
  }

  function ensureStyle(){
    if(document.getElementById('meet-program-phone-priority-style'))return;
    const s=document.createElement('style');
    s.id='meet-program-phone-priority-style';
    s.textContent=`
      body.meet-program-ba-active #meetView [data-meet-board-ay],
      body.meet-program-ba-active #meetView [data-meet-board-az],
      body.meet-program-ba-active #meetView [data-meet-ops-av],
      body.meet-program-ba-active #meetView [data-meet-field-deck-au],
      body.meet-program-ba-active #meetView [data-meet-intake-au]{display:none!important}
      [data-meet-program-ba] .ba-row-main .ba-seed{font-variant-numeric:tabular-nums;white-space:nowrap;display:grid;justify-items:end;line-height:1.02}
      [data-meet-program-ba] .ba-row-main .ba-seed::before{content:'Seed';font-size:.58rem;letter-spacing:.03em;text-transform:uppercase;opacity:.68}
      [data-meet-program-ba] .mpo-quick-note{display:grid;gap:.2rem;margin:.15rem 0 .35rem;font-weight:750}
      [data-meet-program-ba] .mpo-quick-note textarea{min-height:64px;width:100%;resize:vertical;font:inherit;padding:.45rem .5rem;border:1px solid rgba(13,69,102,.2);border-radius:9px}
      [data-meet-program-ba] .ba-intel .ba-actions{grid-template-columns:1fr 1fr!important;align-items:stretch}
      [data-meet-program-ba] .ba-intel .ba-actions>[data-ba-talk],
      [data-meet-program-ba] .ba-intel .ba-actions>[data-ba-capture]{min-height:48px;font-weight:800}
      [data-meet-program-ba] details.mpo-backup{grid-column:1/-1;border:1px solid rgba(13,69,102,.14);border-radius:9px;padding:.3rem .4rem}
      [data-meet-program-ba] details.mpo-backup>summary{cursor:pointer;font-size:.8rem;font-weight:750}
      [data-meet-program-ba] details.mpo-backup button{width:100%;min-height:42px;margin-top:.35rem}
      @media(max-width:620px){
        [data-meet-program-ba] .ba-row-main{grid-template-columns:1.6rem minmax(0,1fr) auto!important;column-gap:.35rem!important;row-gap:.12rem!important;overflow:hidden}
        [data-meet-program-ba] .ba-row-main>.lane{grid-column:1;grid-row:1 / span 2;align-self:start}
        [data-meet-program-ba] .ba-row-main>strong{grid-column:2;grid-row:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        [data-meet-program-ba] .ba-row-main>span:not(.club){grid-column:2!important;grid-row:2!important;justify-self:start}
        [data-meet-program-ba] .ba-row-main>.club{grid-column:2 / 4!important;grid-row:3!important;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        [data-meet-program-ba] .ba-row-main>.ba-seed{grid-column:3!important;grid-row:1!important;align-self:start;justify-self:end;min-width:4.25rem;padding:.2rem .34rem;border:1px solid rgba(13,69,102,.16);border-radius:8px;background:var(--surface,#fff)}
        [data-meet-program-ba] .ba-row-main>em{grid-column:3!important;grid-row:2!important;justify-self:end}
      }
    `;
    document.head.appendChild(s);
  }

  function enhanceSeedRows(p){
    for(const row of p.querySelectorAll('.ba-row-main')){
      const seed=row.querySelector(':scope > small');
      if(!seed)continue;
      const value=(seed.textContent||'').trim()||'—';
      seed.classList.add('ba-seed');
      seed.dataset.seedValue=value;
    }
  }

  function enhanceIntel(p){
    for(const intel of p.querySelectorAll('.ba-intel')){
      const capture=intel.querySelector('[data-ba-capture]');
      if(!capture)continue;
      const key=capture.dataset.baCapture||'';
      const actions=capture.closest('.ba-actions');
      const talk=actions?.querySelector('[data-ba-talk]')||intel.querySelector('[data-ba-talk]');
      if(talk)talk.textContent=document.querySelector('[data-ba-talkbar]')?'Stop commentary':'Voice commentary';
      capture.textContent='Capture';

      if(!intel.querySelector('[data-mpo-quick-note]')){
        const label=document.createElement('label');
        label.className='mpo-quick-note';
        const title=document.createElement('span'),area=document.createElement('textarea');
        title.textContent='Quick note';
        area.dataset.mpoQuickNote=key;
        area.rows=2;
        area.placeholder='Type a note while you watch…';
        const r=raceForKey(key),rec=r?M.meetOpsEngine?.recordFor?.(r,false):null;
        area.value=rec?.notes||'';
        label.append(title,area);
        actions?.before(label);
      }

      const backup=actions?.querySelector('[data-ba-backup]');
      if(backup&&!backup.closest('[data-mpo-backup]')){
        const d=document.createElement('details'),summary=document.createElement('summary');
        d.className='mpo-backup';d.dataset.mpoBackup='1';
        summary.textContent='Backup stopwatch';
        backup.before(d);d.append(summary,backup);
        const r=raceForKey(backup.dataset.baBackup||''),rec=r?M.meetOpsEngine?.recordFor?.(r,false):null;
        backup.textContent=rec?.timer_running?'Finish stopwatch':'Start stopwatch';
      }
    }
  }

  function enhance(){
    queued=false;
    const p=programme();
    if(!active||!p||M.state?.settings?.view!=='meet')return false;
    ensureStyle();
    hideLegacyLayers();
    enhanceSeedRows(p);
    enhanceIntel(p);
    return true;
  }

  function queue(){
    if(queued||!active)return;
    queued=true;
    setTimeout(enhance,0);
  }

  function bindEvents(){
    if(bound)return;
    bound=true;
    document.addEventListener('input',e=>{
      const area=e.target?.closest?.('[data-mpo-quick-note]');
      if(!area)return;
      const r=raceForKey(area.dataset.mpoQuickNote||''),rec=r?M.meetOpsEngine?.recordFor?.(r,true):null;
      if(!rec)return;
      rec.notes=area.value;rec.updated_at=stamp();
      clearTimeout(noteTimer);noteTimer=setTimeout(save,220);
    });
    document.addEventListener('change',e=>{
      if(e.target?.matches?.('[data-mpo-quick-note]'))save();
    });
    document.addEventListener('click',e=>{
      if(!active||M.state?.settings?.view!=='meet')return;
      const path=e.composedPath?.()||[];
      if(path.some(n=>n?.id==='meetView'||n?.matches?.('[data-meet-program-ba]')))queue();
    },true);
  }

  function activate(){
    active=true;
    bindEvents();
    ensureStyle();
    queue();
  }

  const priorRenderMeet=M.ui.renderMeet?.bind(M.ui);
  if(priorRenderMeet)M.ui.renderMeet=()=>{
    const result=priorRenderMeet();
    activate();
    return result;
  };

  M.meetProgramOpsBridge={build:BUILD,enhance,activate,raceForKey};
})(globalThis);
