'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M?.ui)return;
  const BUILD='v4-meet-poolside-20260828de10';
  const U=M.util||{};
  const now=()=>U.now?U.now():new Date().toISOString();
  const clone=v=>{try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v))}catch{return v}}};
  const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const meetTitleKey=v=>norm(v).split(' ').filter(x=>x&&!/^20\d\d$/.test(x)&&!['scm','sc','championship','championships','champs'].includes(x)).join(' ');
  let observer=null,repairing=false,maintainQueued=false,programmeRenderQueued=false,explicitOpen=null;

  function programmeState(){
    if(!M.state.meetProgramBA||typeof M.state.meetProgramBA!=='object')M.state.meetProgramBA={};
    const p=M.state.meetProgramBA;
    if(!p.meetWorkspaces||typeof p.meetWorkspaces!=='object')p.meetWorkspaces={};
    if(!Array.isArray(p.sources))p.sources=[];
    return p;
  }
  const hasSiscSource=()=>programmeState().sources.some(src=>/AQGCB/i.test(String(src?.raw||'')));
  function currentDeckOwned(){
    const id=M.state?.settings?.currentMeetId||'',d=M.state?.meetFieldDeck,p=programmeState();
    if(!id||!d?.races?.length)return false;
    if(d.meet_id)return d.meet_id===id;
    const ws=p.meetWorkspaces?.[id],wd=ws?.deck;
    if(wd?.races?.length){
      if(wd.source_id&&d.source_id)return wd.source_id===d.source_id;
      if(wd.title&&d.title&&meetTitleKey(wd.title)===meetTitleKey(d.title))return true;
    }
    const imp=(M.state.meetImports||[]).find(x=>x?.meet_id===id&&x?.id&&x.id===d.source_id);
    if(imp)return true;
    let cur=null;try{cur=M.meet?.current?.()}catch{}
    const curTitle=cur?.title||cur?.name||'';
    return !!(curTitle&&d.title&&meetTitleKey(curTitle)&&meetTitleKey(curTitle)===meetTitleKey(d.title));
  }
  function explicitOpenActive(){return !!(explicitOpen&&explicitOpen.meetId===(M.state?.settings?.currentMeetId||'')&&hasSiscSource())}
  function saveOnce(){
    try{M.store?.save?.(M.state)}catch{}
    try{M.storageEngine?.saveUi?.(M.state)}catch{}
  }
  function importForMeet(id){
    return(M.state.meetImports||[]).filter(x=>x?.meet_id===id&&x?.text).at(-1)||null;
  }
  function parsedDeckForImport(id,imp){
    if(!imp?.text||!M.meetFieldPatch?.parseHytekProgramme)return null;
    try{
      const parsed=M.meetFieldPatch.parseHytekProgramme(imp.text);
      if(!parsed?.races?.length)return null;
      return{source_id:imp.id,meet_id:id,title:parsed.title,session:parsed.session,date_range:parsed.date_range,races:parsed.races,swimmers:parsed.swimmers,created_at:now()};
    }catch{return null}
  }
  function repairManagedDecks(){
    if(repairing)return false;
    repairing=true;
    let changed=false;
    try{
      const p=programmeState();
      for(const [id,ws] of Object.entries(p.meetWorkspaces||{})){
        if(ws?.deck?.races?.length)continue;
        const imp=importForMeet(id),deck=parsedDeckForImport(id,imp);
        if(!deck)continue;
        ws.deck=clone(deck);
        ws.program=ws.program||{};
        if(!Array.isArray(ws.program.sources))ws.program.sources=[];
        if(!ws.program.sources.some(s=>s?.source_id===imp.id))ws.program.sources.push({source_id:imp.id,meet_id:id,added_at:imp.created_at||now(),raw:String(imp.text)});
        changed=true;
      }
      if(changed)saveOnce();
      return changed;
    }finally{repairing=false}
  }
  function repairSiscSources(){
    const p=programmeState();let invalid=false;
    for(const src of p.sources||[]){
      if(!/AQGCB/i.test(String(src?.raw||'')))continue;
      const aq=(src?.parsed?.heats||[]).flatMap(h=>h.rows||[]).filter(r=>r?.is_aquagym).length;
      if(!aq){delete src._sisc_format_build;delete src._sisc_raw_sig;invalid=true}
    }
    if(!invalid)return false;
    try{M.meetSiscFormat?.repair?.()}catch{}
    return true;
  }
  function pinMeetSwitcher(){
    const h=document.querySelector('#meetView'),box=h?.querySelector('[data-meet-workspace-cy]');
    if(!h||!box)return;
    if(h.firstElementChild!==box)h.insertBefore(box,h.firstElementChild);
    box.classList.add('meet-poolside-top');
  }
  function renderProgrammeSoon(force=false){
    if(programmeRenderQueued)return;
    programmeRenderQueued=true;
    requestAnimationFrame(()=>{
      programmeRenderQueued=false;
      if(M.state?.settings?.view!=='meet'||(!force&&!currentDeckOwned()))return;
      if(hasSiscSource())try{M.meetSiscFormat?.repair?.()}catch{}
      try{M.meetProgramBA?.render?.()}catch{}
      pinMeetSwitcher();enhanceVideo();suppressLegacyWhenProgramme();
    });
  }
  function ensureProgrammeVisible(){
    const h=document.querySelector('#meetView');
    if(!h||M.state?.settings?.view!=='meet'||!currentDeckOwned())return;
    if(h.querySelector('[data-meet-program-ba]'))return;
    renderProgrammeSoon(false);
  }
  function sourceId(src){return src?.source_id||src?.parsed?.id||''}
  function findOpenForAthlete(id){
    const p=programmeState(),deck=M.state?.meetFieldDeck,rs=deck?.races||[];
    for(const src of p.sources||[]){
      if(!/AQGCB/i.test(String(src?.raw||'')))continue;
      for(const h of src?.parsed?.heats||[]){
        for(const row of h.rows||[]){
          if(!row?.is_aquagym)continue;
          const r=rs.find(x=>!x.relay&&x.event_number===h.event_number&&(x.heat||0)===(h.heat||0)&&(x.lane||0)===(row.lane||0)&&x.athlete_id===id);
          if(!r)continue;
          return{meetId:M.state?.settings?.currentMeetId||'',athleteId:id,expandedKey:[h.session_id,h.event_number,h.heat,row.lane||0,norm(row.name)].join('|'),selectedKey:[deck?.source_id||'field',r.event_number||0,r.heat||0,r.lane||0,r.athlete_id||r.athlete_name||''].join('|'),selectedSourceId:sourceId(src),selectedEventNumber:Number(h.event_number)||0};
        }
      }
    }
    return null;
  }
  function applyExplicitOpen(){
    if(!explicitOpenActive())return false;
    const p=programmeState();let changed=false;
    for(const [k,v] of [['selectedAthleteId',explicitOpen.athleteId],['expandedKey',explicitOpen.expandedKey],['selectedKey',explicitOpen.selectedKey],['selectedSourceId',explicitOpen.selectedSourceId]])if(v&&p[k]!==v){p[k]=v;changed=true}
    if(explicitOpen.selectedEventNumber&&Number(p.selectedEventNumber)!==explicitOpen.selectedEventNumber){p.selectedEventNumber=explicitOpen.selectedEventNumber;changed=true}
    return changed;
  }
  function openAthlete(id){
    if(!id||!hasSiscSource())return;
    repairSiscSources();
    const lock=findOpenForAthlete(id);if(!lock)return;
    explicitOpen=lock;applyExplicitOpen();saveOnce();renderProgrammeSoon(true);
  }
  function raceForCaptureButton(btn){
    const k=btn?.dataset?.baCapture||'';
    return(M.state?.meetFieldDeck?.races||[]).find(r=>M.meetOpsEngine?.keyFor?.(r)===k)||null;
  }
  function openDirectVideo(btn){
    const r=raceForCaptureButton(btn);if(!r)return M.toast?.('Select an AquaGym race first');
    M.meetOpsEngine?.openCapture?.(r);
    requestAnimationFrame(()=>document.querySelector('#modalHost [data-mo-video]')?.click());
  }
  function enhanceVideo(){
    const root=document.querySelector('#meetView [data-meet-program-ba]');if(!root)return;
    for(const cap of root.querySelectorAll('[data-ba-capture]')){
      const actions=cap.closest('.ba-actions');if(!actions||actions.querySelector('[data-mpo-video]'))continue;
      const b=document.createElement('button');b.type='button';b.dataset.mpoVideo='1';b.dataset.baCapture=cap.dataset.baCapture||'';b.textContent='Video';
      b.onclick=e=>{e.preventDefault();e.stopPropagation();openDirectVideo(b)};
      actions.appendChild(b);
    }
  }
  function suppressLegacyWhenProgramme(){
    const h=document.querySelector('#meetView');if(!h)return;
    const hasProgramme=!!h.querySelector('[data-meet-program-ba]')&&(currentDeckOwned()||explicitOpenActive());
    document.body.classList.toggle('meet-program-authority-active',hasProgramme);
    for(const sel of ['[data-meet-ops-av]','[data-meet-board-ay]','[data-meet-board-az]','[data-meet-field-deck-au]'])for(const n of h.querySelectorAll(sel))n.hidden=hasProgramme;
  }
  function maintain(){
    maintainQueued=false;
    if(M.state?.settings?.view!=='meet')return;
    repairManagedDecks();
    const owned=currentDeckOwned(),sisc=(owned||explicitOpenActive())&&hasSiscSource();
    const sourceChanged=sisc?repairSiscSources():false,selectionChanged=sisc?applyExplicitOpen():false;
    if(sourceChanged||selectionChanged)renderProgrammeSoon(explicitOpenActive());else if(owned)ensureProgrammeVisible();
    pinMeetSwitcher();enhanceVideo();suppressLegacyWhenProgramme();
  }
  function queueMaintain(){if(maintainQueued)return;maintainQueued=true;requestAnimationFrame(maintain)}
  function style(){
    if(document.getElementById('meet-poolside-de-style'))return;
    const s=document.createElement('style');s.id='meet-poolside-de-style';
    s.textContent=`
      #meetView>[data-meet-workspace-cy]{position:sticky;top:0;z-index:80;margin:0 0 .45rem;background:var(--surface,#fff);box-shadow:0 2px 8px rgba(0,0,0,.08)}
      [data-meet-program-ba] .ba-intel .ba-actions>[data-mpo-video]{min-height:48px;font-weight:800}
      body.meet-program-authority-active #meetView [data-meet-ops-av],
      body.meet-program-authority-active #meetView [data-meet-board-ay],
      body.meet-program-authority-active #meetView [data-meet-board-az],
      body.meet-program-authority-active #meetView [data-meet-field-deck-au]{display:none!important}
      @media(max-width:620px){[data-meet-program-ba] .ba-intel .ba-actions{grid-template-columns:repeat(3,1fr)!important}}
    `;document.head.appendChild(s);
  }
  function install(){
    style();repairManagedDecks();queueMaintain();
    document.addEventListener('click',e=>{
      const meetBtn=e.target?.closest?.('[data-mwm-meet]');if(meetBtn&&meetBtn.dataset.mwmMeet!==(M.state?.settings?.currentMeetId||''))explicitOpen=null;
      if(e.target?.closest?.('[data-ba-collapse],[data-ba-close-athlete]'))explicitOpen=null;
      const athleteBtn=e.target?.closest?.('[data-ba-athlete]');if(athleteBtn&&hasSiscSource())queueMicrotask(()=>openAthlete(athleteBtn.dataset.baAthlete));
      const row=e.target?.closest?.('[data-ba-row].aqua');if(row&&hasSiscSource()&&!e.target?.closest?.('button,details,summary,input,textarea'))queueMicrotask(()=>{
        const p=programmeState();if(!p.expandedKey){explicitOpen=null;return}
        explicitOpen={meetId:M.state?.settings?.currentMeetId||'',athleteId:p.selectedAthleteId||'',expandedKey:p.expandedKey,selectedKey:p.selectedKey||'',selectedSourceId:p.selectedSourceId||'',selectedEventNumber:Number(p.selectedEventNumber)||0};
      });
      if(!e.target?.closest?.('[data-mfa-use]'))return;
      setTimeout(()=>{try{M.meetWorkspaceEngine?.snapshotCurrent?.({persist:true})}catch{}repairManagedDecks();queueMaintain()},80);
    },false);
    const h=document.querySelector('#meetView');
    if(h&&!observer){observer=new MutationObserver(queueMaintain);observer.observe(h,{childList:true,subtree:false})}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queueMaintain()});
  M.meetPoolsideRepair={build:BUILD,repairManagedDecks,repairSiscSources,currentDeckOwned,pinMeetSwitcher,enhanceVideo,ensureProgrammeVisible,maintain,queueMaintain,openAthlete};
})(globalThis);
