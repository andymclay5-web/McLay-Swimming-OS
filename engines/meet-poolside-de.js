'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M?.ui)return;
  const BUILD='v4-meet-poolside-20260827de';
  const U=M.util||{};
  const txt=v=>U.text?U.text(v):String(v??'').replace(/\s+/g,' ').trim();
  const now=()=>U.now?U.now():new Date().toISOString();
  const clone=v=>{try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v))}catch{return v}}};
  let switching=false,observer=null;

  function programmeState(){
    if(!M.state.meetProgramBA||typeof M.state.meetProgramBA!=='object')M.state.meetProgramBA={};
    const p=M.state.meetProgramBA;
    if(!p.meetWorkspaces||typeof p.meetWorkspaces!=='object')p.meetWorkspaces={};
    if(!Array.isArray(p.sources))p.sources=[];
    if(!Array.isArray(p.commentaries))p.commentaries=[];
    return p;
  }
  function blankOps(){return{races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''}}
  function currentId(){return M.state?.settings?.currentMeetId||''}
  function meetById(id){return(M.state?.meets||[]).find(m=>m.id===id)||null}
  function saveOnce(){
    try{M.store?.save?.(M.state)}catch{}
    try{M.storageEngine?.saveUi?.(M.state)}catch{}
  }
  function emptyDeck(id,title){return{meet_id:id,source_id:'',title:title||'Swim meet',session:'',date_range:'',races:[],swimmers:[],explicit_empty:true,created_at:now()}}

  function snapshotCurrent(){
    const id=currentId(),m=meetById(id);if(!id||!m)return;
    const p=programmeState(),ws=p.meetWorkspaces;
    const d=M.state.meetFieldDeck;
    ws[id]={
      meet_id:id,title:m.title||'Swim meet',saved_at:now(),
      deck:d?.explicit_empty?null:clone(d||null),
      program:{sources:clone(p.sources||[]),commentaries:clone(p.commentaries||[]),nowKey:p.nowKey||'',selectedKey:p.selectedKey||'',selectedAthleteId:p.selectedAthleteId||'',expandedKey:p.expandedKey||'',selectedSourceId:p.selectedSourceId||'',selectedEventNumber:Number(p.selectedEventNumber)||0},
      ops:clone(M.state.meetOps||blankOps())
    };
  }

  function importForMeet(id){
    const rows=(M.state.meetImports||[]).filter(x=>x?.meet_id===id&&x?.text);
    return rows.at(-1)||null;
  }
  function recoverDeck(id){
    const p=programmeState(),ws=p.meetWorkspaces[id];
    if(ws?.deck?.races?.length)return clone(ws.deck);
    const imp=importForMeet(id);if(!imp?.text||!M.meetFieldPatch?.parseHytekProgramme)return null;
    try{
      const parsed=M.meetFieldPatch.parseHytekProgramme(imp.text);
      if(!parsed?.races?.length)return null;
      const d={source_id:imp.id,meet_id:id,title:parsed.title,session:parsed.session,date_range:parsed.date_range,races:parsed.races,swimmers:parsed.swimmers,created_at:now()};
      if(ws)ws.deck=clone(d);
      return d;
    }catch{return null}
  }
  function applyProgram(ws,id){
    const p=programmeState(),keep=p.meetWorkspaces,src=ws?.program||{};
    p.sources=clone(src.sources||[]);
    p.commentaries=clone(src.commentaries||[]);
    p.nowKey=src.nowKey||'';p.selectedKey=src.selectedKey||'';p.selectedAthleteId=src.selectedAthleteId||'';p.expandedKey=src.expandedKey||'';p.selectedSourceId=src.selectedSourceId||'';p.selectedEventNumber=Number(src.selectedEventNumber)||0;
    p.meetWorkspaces=keep;
    if(!p.sources.length){
      const imp=importForMeet(id);
      if(imp?.text)p.sources.push({source_id:imp.id,meet_id:id,added_at:imp.created_at||now(),raw:String(imp.text)});
    }
  }
  function safeSwitch(id){
    if(switching||!id||id===currentId())return;
    const p=programmeState(),ws=p.meetWorkspaces[id],m=meetById(id);if(!ws||!m)return;
    switching=true;
    try{
      snapshotCurrent();
      try{M.meet?.setCurrent?.(id)}catch{M.state.settings=M.state.settings||{};M.state.settings.currentMeetId=id}
      M.state.meetOps=clone(ws.ops||blankOps());
      applyProgram(ws,id);
      const recovered=recoverDeck(id);
      M.state.meetFieldDeck=recovered||emptyDeck(id,m.title||ws.title);
      if(recovered)ws.deck=clone(recovered);
      saveOnce();
      M.ui.renderMeet?.();
      requestAnimationFrame(()=>{pinMeetSwitcher();enhanceVideo();window.scrollTo?.({top:0,behavior:'auto'});});
    }finally{setTimeout(()=>{switching=false},80)}
  }

  function pinMeetSwitcher(){
    const h=document.querySelector('#meetView'),box=h?.querySelector('[data-meet-workspace-cy]');
    if(!h||!box)return;
    if(h.firstElementChild!==box)h.insertBefore(box,h.firstElementChild);
    box.classList.add('meet-poolside-top');
  }
  function raceForCaptureButton(btn){
    const k=btn?.dataset?.baCapture||'';
    const rows=M.state?.meetFieldDeck?.races||[];
    return rows.find(r=>M.meetOpsEngine?.keyFor?.(r)===k)||null;
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
  function style(){
    if(document.getElementById('meet-poolside-de-style'))return;
    const s=document.createElement('style');s.id='meet-poolside-de-style';
    s.textContent=`
      #meetView>[data-meet-workspace-cy].meet-poolside-top{position:sticky;top:0;z-index:80;margin:0 0 .45rem;background:var(--surface,#fff);box-shadow:0 2px 8px rgba(0,0,0,.08)}
      [data-meet-program-ba] .ba-intel .ba-actions>[data-mpo-video]{min-height:48px;font-weight:800}
      @media(max-width:620px){[data-meet-program-ba] .ba-intel .ba-actions{grid-template-columns:repeat(3,1fr)!important}}
    `;document.head.appendChild(s);
  }
  function install(){
    style();pinMeetSwitcher();enhanceVideo();
    document.addEventListener('click',e=>{
      const b=e.target?.closest?.('[data-mwm-meet]');if(!b)return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();safeSwitch(b.dataset.mwmMeet||'');
    },true);
    const h=document.querySelector('#meetView');
    if(h&&!observer){observer=new MutationObserver(()=>{if(M.state?.settings?.view==='meet'){pinMeetSwitcher();enhanceVideo()}});observer.observe(h,{childList:true,subtree:true})}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&M.state?.settings?.view==='meet'){pinMeetSwitcher();enhanceVideo()}});
  M.meetPoolsideRepair={build:BUILD,safeSwitch,recoverDeck,pinMeetSwitcher,enhanceVideo};
})(globalThis);
