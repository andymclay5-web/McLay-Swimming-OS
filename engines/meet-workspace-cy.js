'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M?.ui||!M?.meet)return;
  const U=M.util||{},BUILD='v4-meet-workspace-20260827cy';
  const txt=v=>U.text?U.text(v):String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>U.escape?U.escape(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const clone=v=>{try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v))}catch{return v}}};
  const now=()=>U.now?U.now():new Date().toISOString();
  const norm=v=>txt(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const host=()=>document.querySelector('#meetView');

  function program(){
    if(!M.state.meetProgramBA||typeof M.state.meetProgramBA!=='object')M.state.meetProgramBA={};
    const p=M.state.meetProgramBA;
    if(!p.meetWorkspaces||typeof p.meetWorkspaces!=='object')p.meetWorkspaces={};
    return p;
  }
  const workspaces=()=>program().meetWorkspaces;
  const meets=()=>{M.meet.ensureState?.();return M.state.meets||[]};
  const currentId=()=>M.state?.settings?.currentMeetId||'';
  const currentMeet=()=>meets().find(x=>x.id===currentId())||null;

  function snapshotProgram(){
    const p=program();
    return{
      sources:(p.sources||[]).map(s=>({source_id:s?.source_id||'',meet_id:s?.meet_id||currentId(),added_at:s?.added_at||'',raw:String(s?.raw||'')})),
      commentaries:clone(p.commentaries||[]),
      nowKey:p.nowKey||'',selectedKey:p.selectedKey||'',selectedAthleteId:p.selectedAthleteId||'',expandedKey:p.expandedKey||'',selectedSourceId:p.selectedSourceId||'',selectedEventNumber:Number(p.selectedEventNumber)||0
    };
  }
  function applyProgram(snap){
    const p=program(),ws=p.meetWorkspaces;
    p.sources=clone(snap?.sources||[]);
    p.commentaries=clone(snap?.commentaries||[]);
    p.nowKey=snap?.nowKey||'';p.selectedKey=snap?.selectedKey||'';p.selectedAthleteId=snap?.selectedAthleteId||'';p.expandedKey=snap?.expandedKey||'';p.selectedSourceId=snap?.selectedSourceId||'';p.selectedEventNumber=Number(snap?.selectedEventNumber)||0;
    p.meetWorkspaces=ws;
  }
  function blankOps(){return{races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''}}
  function snapshotCurrent({persist=false}={}){
    const id=currentId();if(!id)return null;
    const m=currentMeet();if(!m)return null;
    const ws=workspaces();
    ws[id]={meet_id:id,title:m.title||'Swim meet',saved_at:now(),deck:clone(M.state.meetFieldDeck||null),program:snapshotProgram(),ops:clone(M.state.meetOps||blankOps())};
    if(persist)save();
    return ws[id];
  }
  function save(){try{M.store?.save?.(M.state)}catch{}try{M.storageEngine?.saveUi?.(M.state)}catch{}}

  function tagActiveMeet(id){
    const d=M.state.meetFieldDeck;if(d)d.meet_id=id;
    for(const r of M.state.meetImports||[])if(!r.meet_id||r.id===d?.source_id)r.meet_id=id;
    for(const s of program().sources||[])s.meet_id=id;
  }
  function adoptLoadedProgramme(){
    const d=M.state?.meetFieldDeck;if(!d?.races?.length)return currentMeet();
    const title=txt(d.title)||'Swim meet',key=norm(title),rows=meets();
    let m=rows.find(x=>x.id===d.meet_id&&norm(x.title)===key)||rows.find(x=>norm(x.title)===key&&workspaces()[x.id]);
    if(!m)m=rows.find(x=>norm(x.title)===key);
    if(!m){
      try{m=M.meet.create({title,date:d.date_range||'',course:d.course||''})}catch{return currentMeet()}
    }else if(currentId()!==m.id){try{M.meet.setCurrent(m.id)}catch{M.state.settings.currentMeetId=m.id}}
    tagActiveMeet(m.id);
    if(!workspaces()[m.id])snapshotCurrent();
    return m;
  }

  function managedRows(){
    const ws=workspaces();
    return meets().filter(m=>ws[m.id]).sort((a,b)=>(Date.parse(a.date||'')||0)-(Date.parse(b.date||'')||0)||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  }
  function restoreMeet(id){
    if(!id||id===currentId())return;
    snapshotCurrent();
    const ws=workspaces()[id];if(!ws)return;
    try{M.meet.setCurrent(id)}catch{M.state.settings.currentMeetId=id}
    M.state.meetFieldDeck=clone(ws.deck||null);
    M.state.meetOps=clone(ws.ops||blankOps());
    applyProgram(ws.program||{});
    tagActiveMeet(id);
    save();
    M.ui.renderMeet?.();
  }

  function closeModal(){const h=document.querySelector('#modalHost');if(h)h.innerHTML='';M.nav?.dismissLayer?.()}
  function newMeetModal(){
    snapshotCurrent({persist:true});
    const h=document.querySelector('#modalHost');if(!h)return;
    h.innerHTML=`<div class="modal-backdrop"><section class="modal"><header><h2>Add new meet</h2><button data-mwm-close>×</button></header><div class="modal-body"><p class="muted">Create a separate meet. Sessions, programme, results, notes and captures from the current meet stay untouched.</p><label>Meet name<input data-mwm-title placeholder="South Island Championships"></label><label>Start date<input data-mwm-date type="date"></label><label>Venue<input data-mwm-venue placeholder="Venue"></label><label>Course<select data-mwm-course><option value="SCM">SCM</option><option value="LCM">LCM</option></select></label></div><footer><button data-mwm-create>Create meet</button><button data-mwm-close>Cancel</button></footer></section></div>`;
    M.nav?.openLayer?.('modal');
    h.querySelectorAll('[data-mwm-close]').forEach(b=>b.onclick=closeModal);
    h.querySelector('[data-mwm-create]').onclick=()=>{
      const title=txt(h.querySelector('[data-mwm-title]')?.value);if(!title)return M.toast?.('Enter the meet name');
      const date=h.querySelector('[data-mwm-date]')?.value||'',venue=txt(h.querySelector('[data-mwm-venue]')?.value),course=h.querySelector('[data-mwm-course]')?.value||'SCM';
      let m=null;try{m=M.meet.create({title,date,venue,course,sessions:[]})}catch(e){return M.toast?.(e?.message||String(e))}
      workspaces()[m.id]={meet_id:m.id,title:m.title,saved_at:now(),deck:null,program:{sources:[],commentaries:[],nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'',selectedEventNumber:0},ops:blankOps()};
      M.state.meetFieldDeck=null;M.state.meetOps=blankOps();applyProgram(workspaces()[m.id].program);save();closeModal();M.ui.renderMeet?.();M.toast?.(`${m.title} ready · add Session 1 programme`);
    };
  }

  function renderSwitcher(){
    const h=host();if(!h||M.state?.settings?.view!=='meet')return;
    adoptLoadedProgramme();
    h.querySelector('[data-meet-workspace-cy]')?.remove();
    const rows=managedRows(),cur=currentId(),box=document.createElement('section');
    box.dataset.meetWorkspaceCy='1';box.className='meet-workspace-cy';
    box.innerHTML=`<div class="mwm-tabs">${rows.map(m=>`<button data-mwm-meet="${esc(m.id)}" class="${m.id===cur?'active':''}"><b>${esc(m.title||'Meet')}</b>${m.date?`<small>${esc(m.date)}</small>`:''}</button>`).join('')}<button data-mwm-new class="mwm-new"><b>＋ New meet</b><small>Separate competition</small></button></div>`;
    h.prepend(box);
    box.querySelectorAll('[data-mwm-meet]').forEach(b=>b.onclick=()=>restoreMeet(b.dataset.mwmMeet));
    box.querySelector('[data-mwm-new]').onclick=newMeetModal;
  }
  function style(){if(document.getElementById('meet-workspace-cy-style'))return;const s=document.createElement('style');s.id='meet-workspace-cy-style';s.textContent=`.meet-workspace-cy{position:relative;z-index:20;background:var(--surface,#fff);border-bottom:1px solid rgba(13,69,102,.14);padding:.25rem 0 .35rem}.mwm-tabs{display:flex;gap:.3rem;overflow-x:auto;scrollbar-width:thin}.mwm-tabs button{flex:0 0 auto;display:grid;text-align:left;min-width:118px;border-radius:10px;padding:.38rem .5rem}.mwm-tabs button small{font-size:.68rem;opacity:.7}.mwm-tabs button.active{outline:2px solid currentColor}.mwm-tabs .mwm-new{min-width:132px}`;document.head.appendChild(s)}

  style();
  const previous=M.ui.renderMeet?.bind(M.ui);
  if(previous)M.ui.renderMeet=()=>{const x=previous();queueMicrotask(renderSwitcher);return x};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{if(M.state?.settings?.view==='meet')renderSwitcher()},0),{once:true});else setTimeout(()=>{if(M.state?.settings?.view==='meet')renderSwitcher()},0);
  M.meetWorkspaceEngine={build:BUILD,render:renderSwitcher,snapshotCurrent,restoreMeet,newMeetModal,managedRows,adoptLoadedProgramme};
})(globalThis);
