'use strict';
(function(g){
  const M=g.MSOS4,D=M?.dataRegistry,U=M?.util;if(!M||!D||!U)return;
  const A=M.dataAdminUI={build:'v4-data-admin-ui-20261005-plan-next-season'};let preview=null,lastRaw='',lastFilename='',genPreview=null,planMode=false,planDraft=null,planResult=null;
  const esc=v=>U.escape(String(v??'')),canManage=()=>((M.access?.role?.()||'owner')==='owner');
  const F={
    wa_points:[['course','Course (SCM/LCM)'],['sex','Sex (M/F)'],['distance','Distance'],['stroke','Stroke'],['base_seconds','Base time']],
    results:[['athlete_name','Swimmer'],['date','Result date'],['course','Course'],['distance','Distance'],['stroke','Stroke'],['time','Time'],['meet_name','Meet']],
    tm_results:[['athlete_name','Swimmer'],['date','Result date'],['course','Course'],['distance','Distance'],['stroke','Stroke'],['time','Time'],['meet_name','Meet']],
    swimmers:[['name','Full name'],['squad','Squad'],['sex','Sex'],['dob','Date of birth'],['classification','Para classification']],
    test_sets:[['name','Test name'],['test_key','Test key'],['distance','Distance'],['stroke','Stroke']],
    test_results:[['athlete_name','Swimmer'],['test_key','Test'],['date','Date'],['distance','Distance'],['stroke','Stroke'],['time','Result']],
    national_standards:[['standard_name','Standard / programme'],['course','Course'],['sex','Sex'],['age_group','Age group'],['distance','Distance'],['stroke','Stroke'],['time','Qualifying time']],
    meet_qualifying:[['meet_name','Meet'],['course','Course'],['sex','Sex'],['age_group','Age group'],['distance','Distance'],['stroke','Stroke'],['time','Qualifying time']],
    calendar:[['date','Date'],['status','Status']],
    season_plan:[['name','Season / plan name'],['effective_from','Starts'],['focus','Primary focus'],['plan','Plan / notes']],
    weekly_plan:[['week','Week / week start'],['stroke_focus','Stroke emphasis'],['focus','Focus / purpose']],
    meet_schedule:[['meet','Meet name'],['date','Start date'],['end_date','End date'],['venue','Venue'],['course','Course']],
    meet_entries:[['meet_name','Meet'],['athlete_name','Swimmer'],['event_number','Event #'],['event','Event'],['distance','Distance'],['stroke','Stroke'],['heat','Heat'],['lane','Lane']],
    live_meet_results:[['meet_name','Meet'],['athlete_name','Swimmer'],['date','Date'],['event','Event'],['distance','Distance'],['stroke','Stroke'],['time','Result'],['place','Place']]
  };
  function go(view){if(M.navigationEngine?.go)return M.navigationEngine.go(view,{restore:false});return M.nav?.show?.(view,{restoreScroll:false});}
  function options(selected=''){return`<option value="">Auto-detect</option>${D.TYPE_ORDER.map(id=>`<option value="${id}" ${id===selected?'selected':''}>${esc(D.TYPES[id].label)}</option>`).join('')}`;}
  function sourceCards(){return D.catalog().map(x=>`<div class="data-source-card"><b>${esc(x.label)}</b><span>${x.active?`${esc(x.active.version||'active')} · ${x.rows} rows`:`${x.rows} active rows`}</span><small>${esc(x.owner)}</small><small>${(x.impact||[]).map(i=>`<i class="data-route">${esc(i)}</i>`).join('')}</small>${x.active?`<small class="good-text">Active · ${esc(x.active.source||'MSOS')}</small>`:'<small>No version activated in registry yet</small>'}</div>`).join('');}
  function histories(){const rows=[...(M.state.dataRegistry?.versions||[])].sort((a,b)=>String(b.importedAt||'').localeCompare(String(a.importedAt||''))).slice(0,40);return rows.length?rows.map(v=>`<div class="data-history-row"><div><b>${esc(D.TYPES[v.type]?.label||v.type)} · ${esc(v.version||'version')}</b><small>${v.rowCount} rows · ${esc(v.source||'')} · ${esc(v.importedAt||'')}</small><small>${esc(v.status||'')}</small></div><button data-data-activate="${esc(v.id)}" ${v.status==='active'?'disabled':''}>${v.status==='active'?'Active':'Activate'}</button></div>`).join(''):'<p class="muted">No versioned imports committed yet.</p>';}
  function previewHtml(p){if(!p)return'<p class="muted">Choose a file, use Quick add, or paste data, then Preview. MSOS identifies the owning engine before anything is committed.</p>';const ok=p.errors.length===0&&p.rowCount>0;return`<div class="check-card ${ok?'ok':'bad'}"><b>${esc(p.def.label)} → ${esc(p.def.owner)}</b><br>${p.rowCount} row${p.rowCount===1?'':'s'} · ${p.validCount} valid${p.duplicates.length?` · ${p.duplicates.length} duplicate key${p.duplicates.length===1?'':'s'}`:''}${p.errors.length?` · ${p.errors.length} need attention`:''}<br><small>Mode: ${p.def.mode==='replace'?'new active version replaces old active reference rows':'upsert into canonical operational evidence'} · impacts ${(p.def.impact||[]).join(', ')}</small></div>${p.errors.length?`<div class="data-errors">${p.errors.slice(0,25).map(e=>`<div class="perf-evidence"><b>Row ${e.row}</b><span>Missing ${esc(e.missing.join(', '))}</span></div>`).join('')}</div>`:''}${ok?'<button id="commitDataPreview">Commit & activate</button>':''}`;}
  function quickHtml(type){if(!type)return'<p class="muted">Select a data type above to create a row inside MSOS.</p>';const fields=F[type]||[];return`<h3>Quick add · ${esc(D.TYPES[type]?.label||type)}</h3><div class="data-meta">${fields.map(([k,l])=>`<label>${esc(l)}<input data-quick-key="${esc(k)}"></label>`).join('')}</div><button id="dataQuickAdd">Add row to preview area</button><p class="muted">Quick add uses the same validation, routing and version activation as a file import.</p>`;}
  function appendQuick(h,type){const row={};h.querySelectorAll('[data-quick-key]').forEach(x=>{const v=x.value.trim();if(v!=='')row[x.dataset.quickKey]=v;});if(!Object.keys(row).length)return M.toast?.('Enter at least one field');const ta=h.querySelector('#dataPaste'),cur=ta.value.trim();let rows=[];if(cur){try{const parsed=JSON.parse(cur);rows=Array.isArray(parsed)?parsed:[parsed];}catch{return M.toast?.('Quick add works with an empty or JSON preview area. Preview/clear the existing CSV first.');}}rows.push(row);ta.value=JSON.stringify(rows,null,2);lastRaw=ta.value;lastFilename='';h.querySelectorAll('[data-quick-key]').forEach(x=>x.value='');M.toast?.('Row added · Preview & route before commit');}
  function bindQuick(h){h.querySelector('#dataQuickAdd')?.addEventListener('click',()=>appendQuick(h,h.querySelector('#dataType').value));}
  function bind(h){const file=h.querySelector('#dataFile'),raw=h.querySelector('#dataPaste'),type=h.querySelector('#dataType'),quick=h.querySelector('#dataQuick');file?.addEventListener('change',async()=>{const f=file.files?.[0];if(!f)return;lastFilename=f.name;lastRaw=await f.text();raw.value=lastRaw;});type?.addEventListener('change',()=>{quick.innerHTML=quickHtml(type.value);bindQuick(h);});h.querySelector('#previewData')?.addEventListener('click',()=>{try{if(!canManage())throw new Error('Owner permission required');lastRaw=raw.value;const parsed=D.parseText(lastRaw,lastFilename),detected=type.value||D.detect(parsed);if(!detected)throw new Error('MSOS could not safely identify this data type. Choose the type manually.');if(!type.value){type.value=detected;quick.innerHTML=quickHtml(detected);bindQuick(h);}const meta={version:h.querySelector('#dataVersion').value,effectiveFrom:h.querySelector('#dataEffective').value,source:h.querySelector('#dataSource').value||lastFilename||'Manual'};preview=D.preview(detected,parsed,meta);h.querySelector('#dataPreview').innerHTML=previewHtml(preview);bindCommit(h);}catch(e){preview=null;h.querySelector('#dataPreview').innerHTML=`<div class="check-card bad">${esc(e.message||e)}</div>`;}});h.querySelector('#dataClear')?.addEventListener('click',()=>{preview=null;lastRaw='';lastFilename='';raw.value='';file.value='';h.querySelector('#dataPreview').innerHTML=previewHtml(null);});h.querySelectorAll('[data-data-activate]').forEach(b=>b.onclick=async()=>{if(!canManage())return;b.disabled=true;try{await D.activate(b.dataset.dataActivate);M.toast?.('Reference version activated · dependent engines invalidated');render();}catch(e){b.disabled=false;M.toast?.(e.message||String(e));}});h.querySelector('#dataBackReports')?.addEventListener('click',()=>go('reports'));h.querySelector('#dataBackPerformance')?.addEventListener('click',()=>go('athletes'));bindQuick(h);}
  function bindCommit(h){h.querySelector('#commitDataPreview')?.addEventListener('click',async()=>{if(!canManage())return M.toast?.('Owner permission required');const b=h.querySelector('#commitDataPreview');b.disabled=true;b.textContent='Committing…';try{const meta=await D.commit(preview);preview=null;M.toast?.(`${D.TYPES[meta.type].label} activated · ${meta.rowCount} rows`);render();}catch(e){b.disabled=false;b.textContent='Commit & activate';M.toast?.(e.message||String(e));}});}
  function render(){const h=document.querySelector('#dataView');if(!h)return;if(!canManage()){h.innerHTML='<section class="empty-card"><h2>Data & References is owner-only</h2><p>Reference activation and organisation-wide imports are administrative actions.</p></section>';return;}D.ensureState();if(planMode)return renderPlanner(h);h.innerHTML=`<section class="page-card"><div class="eyebrow">DATA & REFERENCES</div><h1>Data intake</h1><p>One controlled entry point for changing information MSOS relies on. Preview identifies the owner engine. Versioned references replace only the active reference set; previous versions stay recoverable.</p><div class="hub-actions"><button id="dataBackPerformance">Swimmer performance</button><button id="dataBackReports">Reports</button></div></section><section class="page-card"><h2>Current data health</h2><div class="data-grid">${sourceCards()}</div></section><section class="page-card"><h2>Manage swimmers</h2><p class="muted">Edit a swimmer's name, squad or active status directly -- no CSV re-import needed. Turn Active off for a swimmer who has left; it's the same flag a swimmers import already respects, so it won't silently come back on the next routine import. Adding a brand-new swimmer still goes through the import below.</p>${rosterRows()}</section><section class="page-card" data-tt-section><h2>Standard pool timetable</h2>${timetableRows()}</section><section class="page-card"><h2>Season planner</h2><p class="muted">The standing weekly pattern below stays as-is every week unless you change it here. Generate a season plan by counting back from a target meet through the base → underwater → turns → finish → taper cycle; it's committed the same way a CSV import is, and only replaces the squads you actually generate for.</p><h3>Standing weekly template (per squad)</h3>${weeklyTemplateRows()}<h3>Season phase cycle</h3>${phaseTemplateRows()}<h3>Generate a season</h3>${seasonGeneratorHtml()}<h3>This season's active weeks</h3><p class="muted">Quick edits here apply immediately; generating or re-importing replaces them.</p>${activeWeeklyPlanRows()}</section><section class="page-card data-import"><h2>Add / update information</h2><p class="muted">Create a row here, or use CSV/JSON. Every route uses the same preview and validation before anything becomes active.</p><div class="data-meta"><label>Type<select id="dataType">${options(preview?.type||'')}</select></label><label>Version / season<input id="dataVersion" placeholder="e.g. WA 2027 / NAGS 2027" value="${esc(preview?.meta?.version||'')}"></label><label>Effective from<input id="dataEffective" type="date" value="${esc(preview?.meta?.effectiveFrom||'')}"></label><label>Source<input id="dataSource" placeholder="World Aquatics / Swimming NZ / TM" value="${esc(preview?.meta?.source||'')}"></label></div><div id="dataQuick">${quickHtml(preview?.type||'')}</div><label>File<input id="dataFile" type="file" accept=".csv,.json,.txt,.tsv,text/csv,application/json,text/plain"></label><label>Paste data / preview area<textarea id="dataPaste" placeholder='CSV with headers, or JSON. Example: {"course":"SCM","sex":"F","distance":100,"stroke":"Freestyle","base_seconds":51.71}'>${esc(lastRaw)}</textarea></label><div class="hub-actions"><button id="previewData">Preview & route</button><button id="dataClear">Clear</button></div><div id="dataPreview" class="data-preview">${previewHtml(preview)}</div></section><section class="page-card"><h2>Version history</h2><p class="muted">Activating an older reference version changes the active calculations again without deleting the newer dataset.</p>${histories()}</section>`;bind(h);bindRoster(h);bindTimetable(h);bindWeeklyTemplates(h);bindPhaseTemplate(h);bindGenerator(h);bindActiveWeeklyEdit(h);if(preview)bindCommit(h);}
  // Editing a swimmer's squad or active status directly. Until now the only way to change either was a
  // full CSV/JSON re-import (matched to the existing athlete by a hash of their name), so a coach with no
  // "active" column in their source file, or a name that didn't hash to the same id as before, had no way
  // to correct a swimmer's squad short of editing the app's stored data by hand outside the app. This is a
  // small, direct edit instead: pick the swimmer, change name/squad/active, save.
  function rosterRows(){
    const rows=[...(M.state.athletes||[])].sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||'')));
    if(!rows.length)return'<p class="muted">No swimmers loaded yet — import a swimmers CSV/JSON below.</p>';
    return `<div class="roster-edit-list">${rows.map(a=>`<div class="roster-edit-row" data-roster-id="${esc(a.id)}">
      <input data-roster-name value="${esc(a.full_name||'')}" placeholder="Full name">
      <input data-roster-squad value="${esc(a.squad||'')}" placeholder="Squad">
      <label class="roster-active-toggle"><input type="checkbox" data-roster-active ${a.active!==false?'checked':''}> Active</label>
      <button data-roster-save>Save</button>
    </div>`).join('')}</div>`;
  }
  function bindRoster(h){
    h.querySelectorAll('[data-roster-save]').forEach(b=>b.onclick=()=>{
      if(!canManage())return M.toast?.('Owner permission required');
      const row=b.closest('[data-roster-id]'),id=row.dataset.rosterId;
      const a=(M.state.athletes||[]).find(x=>x.id===id);if(!a)return;
      const name=row.querySelector('[data-roster-name]').value.trim();
      if(!name)return M.toast?.('Full name cannot be empty');
      a.full_name=name;
      a.squad=row.querySelector('[data-roster-squad]').value.trim();
      a.active=row.querySelector('[data-roster-active]').checked;
      // Clears any stale Timing/T400 roster references left over now the active flag has changed --
      // the same cleanup a normal state load already runs, just triggered immediately after an edit.
      M.correct?.enforceRoster?.();
      try{M.store.save(M.state)}catch{}
      M.toast?.(`${a.full_name} saved`);
      render();
    });
  }
  // 4 Oct 2026 (Andy, verbatim, on why the season plan loaded in MSOS dead-ends after Nationals): "the
  // weekly plan just needs to be a standard that can be adjusted as suits within the app... stays as is
  // unless specifically changed, edited within the app" and "season plan... we just kind of count back
  // through cycling through the energy systems... I feel like there's got to be a better way to actually
  // have it already in the app, but editable and changeable and evolvable." engines/season-planner.js owns
  // the data model (M.state.weeklyTemplates per squad + M.state.seasonPhaseTemplate's five-phase cycle) and
  // the generateSeason() backward-from-target-meet math; everything below is just the editor for it, living
  // here because Data & References is already "the one controlled entry point for changing information
  // MSOS relies on." Generated rows are committed through the SAME D.preview()/D.commit() pipeline a manual
  // CSV import already uses -- versioned, recoverable, nothing duplicated -- merged with whichever OTHER
  // squads' already-active season/weekly rows this generation didn't touch, so generating National's new
  // season never silently wipes Junior's (season_plan/weekly_plan are both single "replace the whole active
  // set" types in data-registry.js, which would otherwise be a real footgun here).
  // Standard pool timetable (6 Oct 2026, Andy: "The base schedule hasn't changed, but should remain
  // default unless modified like the season plans and weekly plans."). engines/standard-timetable.js owns
  // the data; this is only its editor. One row per session: day, AM/PM, start, end, squads, venue.
  function timetableRows(){
    const T=M.standardTimetable;if(!T)return'<p class="muted">Timetable engine not loaded.</p>';
    const rows=T.get();const meta=M.state.standardTimetableMeta||{};
    if(!rows)return'<p class="muted">No standard timetable yet — it is copied from the published calendar the first time the calendar loads.</p>';
    const flat=[];rows.forEach(r=>(r.sessions||[]).forEach(x=>flat.push({day:r.day,...x})));
    const dayOpts=sel=>T.DAYS.slice(1).concat('Sunday').map(d=>`<option ${d===sel?'selected':''}>${d}</option>`).join('');
    return `<p class="muted">Every week after the published calendar uses this timetable${meta.source?` (${esc(meta.source)}${meta.editedAt?', edited':''})`:''}. Change it here and every future week follows.</p>
      <div class="tt-rows">${flat.map((x,i)=>`<div class="tt-row" data-tt-row="${i}">
        <select data-tt="day">${dayOpts(x.day)}</select>
        <select data-tt="day_part"><option ${x.day_part==='AM'?'selected':''}>AM</option><option ${x.day_part==='PM'?'selected':''}>PM</option></select>
        <input data-tt="start_time" value="${esc(x.start_time)}" placeholder="05:30">
        <input data-tt="end_time" value="${esc(x.end_time)}" placeholder="07:15">
        <input data-tt="squads" value="${esc((x.squads||[]).join(' + '))}" placeholder="National + Development">
        <input data-tt="venue" value="${esc(x.venue)}" placeholder="AquaGym">
        <button type="button" data-tt-remove title="Remove session">✕</button></div>`).join('')}</div>
      <div class="hub-actions"><button type="button" id="ttAdd">+ Add session</button><button type="button" id="ttSave">Save timetable</button></div>`;
  }
  function readTimetable(h){return[...h.querySelectorAll('[data-tt-row]')].map(r=>({day:r.querySelector('[data-tt="day"]').value,day_part:r.querySelector('[data-tt="day_part"]').value,start_time:r.querySelector('[data-tt="start_time"]').value.trim(),end_time:r.querySelector('[data-tt="end_time"]').value.trim(),squads:r.querySelector('[data-tt="squads"]').value.split(/\s*[+,]\s*/).map(x=>x.trim()).filter(Boolean),venue:r.querySelector('[data-tt="venue"]').value.trim()}));}
  function groupTimetable(flat){const T=M.standardTimetable;return T.DAYS.map(day=>({day,sessions:flat.filter(x=>x.day===day).sort((a,b)=>(a.day_part+a.start_time).localeCompare(b.day_part+b.start_time)).map(({day,...x})=>x)}));}
  function bindTimetable(h){
    const T=M.standardTimetable;if(!T)return;
    h.querySelectorAll('[data-tt-remove]').forEach(b=>b.addEventListener('click',()=>{b.closest('[data-tt-row]').remove();}));
    h.querySelector('#ttAdd')?.addEventListener('click',()=>{if(!canManage())return M.toast?.('Owner permission required');const list=h.querySelector('.tt-rows'),proto=list?.querySelector('[data-tt-row]');if(!list)return;const row=proto?proto.cloneNode(true):null;if(!row)return;row.dataset.ttRow=String(list.children.length);row.querySelectorAll('input').forEach(x=>x.value=x.dataset.tt==='venue'?'AquaGym':'');row.querySelector('[data-tt="day"]').value='Monday';row.querySelector('[data-tt="day_part"]').value='PM';row.querySelector('[data-tt-remove]').addEventListener('click',()=>row.remove());list.appendChild(row);row.querySelector('[data-tt="start_time"]').focus?.();});
    h.querySelector('#ttSave')?.addEventListener('click',()=>{if(!canManage())return M.toast?.('Owner permission required');const flat=readTimetable(h),bad=flat.filter(x=>!x.squads.length||!x.start_time);if(bad.length)return M.toast?.('Each session needs a start time and at least one squad');T.set(groupTimetable(flat));M.toast?.('Standard timetable saved · every future week updated');render();});
  }
  function timetableSummaryHtml(){const T=M.standardTimetable,rows=T?.get?.();if(!rows)return'';return`<div class="pn-week"><b>Pool timetable</b>${rows.filter(r=>r.sessions.length).map(r=>`<div class="pn-day"><span>${esc(r.day)}</span><span>${r.sessions.map(x=>`${esc(x.day_part)} ${esc(x.start_time)} ${esc(x.squads.join('+'))}`).join(' · ')}</span></div>`).join('')}</div>`;}
  function weeklyTemplateRows(){
    const SP=M.seasonPlanner;if(!SP)return'<p class="muted">Season planner engine not loaded.</p>';
    SP.ensureSeeds();
    const templates=M.state.weeklyTemplates||[];
    const cards=templates.map(t=>`<div class="wt-card" data-wt-squad="${esc(t.squad)}">
      <div class="wt-head"><b>${esc(t.squad)}</b><span class="hub-actions"><button type="button" data-wt-add-day>+ Add day</button><button type="button" data-wt-remove-squad>Remove squad</button></span></div>
      <div class="wt-days">${(t.days||[]).map((d,i)=>`<div class="wt-day-row" data-wt-day-index="${i}">
        <input data-wt-field="day" value="${esc(d.day)}" placeholder="Day">
        <input data-wt-field="dayPart" value="${esc(d.dayPart)}" placeholder="AM/PM">
        <input data-wt-field="session_focus" value="${esc(d.session_focus)}" placeholder="Session focus">
        <input data-wt-field="technical_focus" value="${esc(d.technical_focus)}" placeholder="Technical focus">
        <input data-wt-field="primary_system" value="${esc(d.primary_system)}" placeholder="Energy system">
        <button type="button" data-wt-remove-day title="Remove day">✕</button>
      </div>`).join('')||'<p class="muted">No days yet — Add day.</p>'}</div>
      <button type="button" data-wt-save>Save ${esc(t.squad)} standing template</button>
    </div>`).join('');
    return `${cards||'<p class="muted">No standing weekly templates yet — add a squad below.</p>'}<div class="wt-new"><input id="wtNewSquad" placeholder="New squad name"><button type="button" id="wtAddSquad">Add squad template</button></div>`;
  }
  function bindWeeklyTemplates(h){
    const SP=M.seasonPlanner;if(!SP)return;
    h.querySelectorAll('[data-wt-squad]').forEach(card=>{
      const squad=card.dataset.wtSquad;
      card.querySelector('[data-wt-add-day]')?.addEventListener('click',()=>{
        const t=(M.state.weeklyTemplates||[]).find(x=>x.squad===squad);if(!t)return;
        t.days=t.days||[];t.days.push({day:'',dayPart:'',session_focus:'',technical_focus:'',primary_system:''});
        render();
      });
      card.querySelector('[data-wt-remove-squad]')?.addEventListener('click',()=>{
        if(!canManage())return;
        M.state.weeklyTemplates=(M.state.weeklyTemplates||[]).filter(x=>x.squad!==squad);
        try{M.store.save(M.state)}catch{}
        M.toast?.(`${squad} standing template removed`);render();
      });
      card.querySelectorAll('[data-wt-remove-day]').forEach(btn=>btn.addEventListener('click',()=>{
        const row=btn.closest('[data-wt-day-index]'),idx=Number(row.dataset.wtDayIndex);
        const t=(M.state.weeklyTemplates||[]).find(x=>x.squad===squad);if(!t)return;
        t.days.splice(idx,1);render();
      }));
      card.querySelector('[data-wt-save]')?.addEventListener('click',()=>{
        if(!canManage())return M.toast?.('Owner permission required');
        const t=(M.state.weeklyTemplates||[]).find(x=>x.squad===squad);if(!t)return;
        t.days=[...card.querySelectorAll('[data-wt-day-index]')].map(row=>({
          day:row.querySelector('[data-wt-field="day"]').value.trim(),
          dayPart:row.querySelector('[data-wt-field="dayPart"]').value.trim(),
          session_focus:row.querySelector('[data-wt-field="session_focus"]').value.trim(),
          technical_focus:row.querySelector('[data-wt-field="technical_focus"]').value.trim(),
          primary_system:row.querySelector('[data-wt-field="primary_system"]').value.trim(),
        }));
        try{M.store.save(M.state)}catch{}
        M.toast?.(`${squad} standing weekly template saved`);
        render();
      });
    });
    h.querySelector('#wtAddSquad')?.addEventListener('click',()=>{
      if(!canManage())return M.toast?.('Owner permission required');
      const input=h.querySelector('#wtNewSquad'),name=input.value.trim();if(!name)return M.toast?.('Enter a squad name');
      M.state.weeklyTemplates=M.state.weeklyTemplates||[];
      if(M.state.weeklyTemplates.some(x=>x.squad===name))return M.toast?.('That squad already has a standing template');
      M.state.weeklyTemplates.push({squad:name,days:[]});
      try{M.store.save(M.state)}catch{}
      render();
    });
  }
  function phaseTemplateRows(){
    const SP=M.seasonPlanner;if(!SP)return'';
    SP.ensureSeeds();
    const phases=M.state.seasonPhaseTemplate||[];
    return phases.map((p,i)=>`<div class="phase-row" data-phase-index="${i}">
      <b>${esc(p.label)}</b>
      <label>Weeks${p.key==='taper'?' (minimum)':''}<input type="number" min="1" data-phase-field="weeks" value="${esc(p.weeks)}"></label>
      <label>Energy system<input data-phase-field="primary_system" value="${esc(p.primary_system||'')}" ${p.key==='taper'?'disabled title="Taper handles its own system (Individual/Race) automatically"':''}></label>
      <label>Technical focus<input data-phase-field="technical" value="${esc(p.technical)}"></label>
      <label>Mental focus<input data-phase-field="mental" value="${esc(p.mental)}"></label>
    </div>`).join('')+'<button type="button" id="phaseTemplateSave">Save phase cycle</button>';
  }
  function bindPhaseTemplate(h){
    h.querySelector('#phaseTemplateSave')?.addEventListener('click',()=>{
      if(!canManage())return M.toast?.('Owner permission required');
      const phases=M.state.seasonPhaseTemplate||[];
      h.querySelectorAll('[data-phase-index]').forEach(row=>{
        const i=Number(row.dataset.phaseIndex),p=phases[i];if(!p)return;
        p.weeks=Math.max(1,Number(row.querySelector('[data-phase-field="weeks"]').value)||p.weeks);
        const sysInput=row.querySelector('[data-phase-field="primary_system"]');
        if(sysInput&&!sysInput.disabled)p.primary_system=sysInput.value.trim();
        p.technical=row.querySelector('[data-phase-field="technical"]').value.trim();
        p.mental=row.querySelector('[data-phase-field="mental"]').value.trim();
      });
      try{M.store.save(M.state)}catch{}
      M.toast?.('Season phase cycle saved');
      render();
    });
  }
  function squadChoicesHtml(){
    const squads=(M.state.weeklyTemplates||[]).map(t=>t.squad);
    if(!squads.length)return'<p class="muted">Add a standing weekly template for at least one squad above first.</p>';
    return squads.map(s=>`<label class="sg-squad-choice"><input type="checkbox" data-sg-squad value="${esc(s)}"> ${esc(s)}</label>`).join('');
  }
  function genPreviewHtml(){
    if(!genPreview)return'<p class="muted">Fill in the season start and target meet, pick squads, then Generate preview.</p>';
    if(genPreview.error)return`<div class="check-card bad">${esc(genPreview.error)}</div>`;
    const r=genPreview,allocHtml=r.allocation.map(a=>`<span class="sg-phase-chip">${esc(a.key)} · ${a.weeks}w</span>`).join('');
    const warn=r.warnings.length?`<div class="check-card bad">${r.warnings.map(esc).join('<br>')}</div>`:'';
    return `<div class="check-card ok"><b>${r.totalWeeks} weeks</b> · ${allocHtml}</div>${warn}<details class="sg-weeks"><summary>${r.weeklyRows.length} week-rows across ${r.seasonRow.squads.length} squad(s) — expand to check before committing</summary>${r.weeklyRows.map(w=>`<div class="sg-week-row"><b>${esc(w.squad)}</b> ${esc(w.week_start)} — ${esc(w.phase)} · ${esc(w.stroke)}${w.meet?` · <i>${esc(w.meet)}</i>`:''}</div>`).join('')}</details>`;
  }
  function seasonGeneratorHtml(){
    const SP=M.seasonPlanner;if(!SP)return'<p class="muted">Season planner engine not loaded.</p>';
    return `<div class="data-meta">
      <label>Season name<input id="sgName" placeholder="e.g. Summer 2026/27 · National / Development"></label>
      <label>Course<select id="sgCourse"><option value="SCM">Short course (SCM)</option><option value="LCM">Long course (LCM)</option></select></label>
      <label>Season start<input id="sgStart" type="date"></label>
      <label>Target meet name<input id="sgMeetName" placeholder="e.g. NZSC Champs / NAG &amp; Opens"></label>
      <label>Target meet date<input id="sgMeetDate" type="date"></label>
    </div>
    <div class="sg-squads">${squadChoicesHtml()}</div>
    <div class="hub-actions"><button type="button" id="sgPreview">Generate preview</button>${genPreview&&!genPreview.error?'<button type="button" id="sgCommit">Commit & activate</button>':''}</div>
    <div id="sgPreviewArea">${genPreviewHtml()}</div>`;
  }
  // Merges newly generated rows with whichever OTHER squads' already-active rows this generation did not
  // touch, so a commit here only replaces the squads actually being (re)generated -- season_plan/weekly_plan
  // are both data-registry "replace the whole active set" types, and without this a generate-for-National
  // run would silently drop Junior/Intermediate's still-current plan out of being active.
  async function commitSeasonPlannerType(type,newRawRows,touchedSquads,meta){
    const existing=D.activeRowsSync(type);
    const keep=existing.filter(r=>{
      const rowSquads=type==='season_plan'?(Array.isArray(r.squads)?r.squads:[]):[r.squad];
      return !rowSquads.some(s=>touchedSquads.includes(s));
    });
    const pre=D.preview(type,{rows:newRawRows},meta);
    if(pre.errors.length)throw new Error(`${D.TYPES[type].label}: ${pre.errors.length} row(s) need attention`);
    return D.commit({...pre,rows:[...keep,...pre.rows],rowCount:keep.length+pre.rowCount,validCount:keep.length+pre.validCount});
  }
  function bindGenerator(h){
    const SP=M.seasonPlanner;if(!SP)return;
    h.querySelector('#sgPreview')?.addEventListener('click',()=>{
      if(!canManage())return M.toast?.('Owner permission required');
      const squads=[...h.querySelectorAll('[data-sg-squad]:checked')].map(x=>x.value);
      try{genPreview=SP.generateSeason({name:h.querySelector('#sgName').value.trim(),course:h.querySelector('#sgCourse').value,seasonStart:h.querySelector('#sgStart').value,targetMeetName:h.querySelector('#sgMeetName').value.trim(),targetMeetDate:h.querySelector('#sgMeetDate').value,squads});}
      catch(e){genPreview={error:e.message||String(e)};}
      render();
    });
    h.querySelector('#sgCommit')?.addEventListener('click',async()=>{
      if(!canManage())return M.toast?.('Owner permission required');
      if(!genPreview||genPreview.error)return;
      const b=h.querySelector('#sgCommit');b.disabled=true;b.textContent='Committing…';
      try{
        const touched=genPreview.seasonRow.squads,meta={version:genPreview.seasonRow.version,effectiveFrom:genPreview.seasonRow.start_date,source:genPreview.seasonRow.source};
        await commitSeasonPlannerType('season_plan',[genPreview.seasonRow],touched,meta);
        await commitSeasonPlannerType('weekly_plan',genPreview.weeklyRows,touched,meta);
        M.toast?.(`Season plan generated · ${genPreview.weeklyRows.length} weekly rows activated`);
        genPreview=null;
        render();
      }catch(e){b.disabled=false;b.textContent='Commit & activate';M.toast?.(e.message||String(e));}
    });
  }
  // A quick, direct tweak to one already-active week -- "adjusted as suits within the app" -- without
  // re-running the whole generator or a full CSV re-import for a single change. Same direct-mutate-and-save
  // precedent as the swimmer roster edit below; a future regenerate/re-import still fully replaces this
  // (data-registry's season_plan/weekly_plan are both "replace" types), same as any other import.
  function activeWeeklyPlanRows(){
    const rows=[...(M.state.weeklyPlans||[])].sort((a,b)=>String(a.week_start||'').localeCompare(String(b.week_start||''))||String(a.squad||'').localeCompare(String(b.squad||'')));
    if(!rows.length)return'<p class="muted">No active weekly plan yet — generate one above, or import one in Add / update information below.</p>';
    return rows.map(w=>`<div class="awp-row" data-awp-id="${esc(w.id)}">
      <b>${esc(w.squad)} · ${esc(w.week_start)}</b>
      <input data-awp-field="objective" value="${esc(w.objective||'')}" placeholder="Objective">
      <input data-awp-field="technical_focus" value="${esc(w.technical_focus||'')}" placeholder="Technical focus">
      <input data-awp-field="primary_system" value="${esc(w.primary_system||'')}" placeholder="Energy system">
      <input data-awp-field="psychological_focus" value="${esc(w.psychological_focus||'')}" placeholder="Psychological focus">
      <button type="button" data-awp-save>Save</button>
    </div>`).join('');
  }
  function bindActiveWeeklyEdit(h){
    h.querySelectorAll('[data-awp-save]').forEach(btn=>btn.addEventListener('click',()=>{
      if(!canManage())return M.toast?.('Owner permission required');
      const row=btn.closest('[data-awp-id]'),id=row.dataset.awpId;
      const w=(M.state.weeklyPlans||[]).find(x=>x.id===id);if(!w)return;
      w.objective=row.querySelector('[data-awp-field="objective"]').value.trim();
      w.technical_focus=row.querySelector('[data-awp-field="technical_focus"]').value.trim();
      w.primary_system=row.querySelector('[data-awp-field="primary_system"]').value.trim();
      w.physiological_focus=w.primary_system;
      w.psychological_focus=row.querySelector('[data-awp-field="psychological_focus"]').value.trim();
      try{M.store.save(M.state)}catch{}
      M.toast?.('Week updated');
      render();
    }));
  }
  // ---------------------------------------------------------------------------
  // Plan next season -- a guided, four-step front door to the season planner (5 Oct 2026, Andy: "I still
  // need to see clear how to enter the season plan ... at the moment I'm showing all last season's data.
  // But now we need to be able to move on to the planning phase. And that needs to be clear and direct and
  // easy to follow."). No new planning logic or storage: it drives the SAME engines/season-planner.js
  // generateSeason() and the SAME squad-aware commitSeasonPlannerType() path as the full editor above, and
  // reuses the same standing-week and phase-cycle editors. Nothing is saved until "Create season plan".
  // ---------------------------------------------------------------------------
  const iso=d=>d.toISOString().slice(0,10);
  function nextMonday(){const d=new Date();d.setHours(12,0,0,0);const add=((8-d.getDay())%7)||7;d.setDate(d.getDate()+add);return iso(d);}
  function niceDate(v){const t=Date.parse(`${String(v||'').slice(0,10)}T12:00:00`);return Number.isFinite(t)?new Date(t).toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'}):String(v||'');}
  function seasonRowsAll(){const out=[];const seen=new Set();for(const r of [...(M.state.seasonPlans||[]),...(D.activeRowsSync?.('season_plan')||[])]){const k=r?.id||JSON.stringify([r?.name,r?.start_date]);if(!r||seen.has(k))continue;seen.add(k);out.push(r);}return out;}
  const rowStart=r=>String(r?.start_date||r?.startDate||r?.effective_from||'').slice(0,10),rowEnd=r=>String(r?.end_date||r?.endDate||'').slice(0,10);
  function planContextLine(){const today=iso(new Date()),rows=seasonRowsAll(),current=rows.find(r=>rowStart(r)<=today&&(!rowEnd(r)||rowEnd(r)>=today)),upcoming=rows.filter(r=>rowStart(r)>today).sort((a,b)=>rowStart(a).localeCompare(rowStart(b)))[0],last=rows.filter(r=>rowEnd(r)&&rowEnd(r)<today).sort((a,b)=>rowEnd(b).localeCompare(rowEnd(a)))[0];
    if(upcoming)return`Already planned: <b>${esc(upcoming.name||'Next season')}</b> starts ${esc(niceDate(rowStart(upcoming)))}. Creating another season for the same squads replaces it.`;
    if(current)return`Current season: <b>${esc(current.name||'Season')}</b> (${esc(niceDate(rowStart(current)))} – ${esc(niceDate(rowEnd(current)))}).`;
    if(last)return`<b>${esc(last.name||'Last season')}</b> finished ${esc(niceDate(rowEnd(last)))}. Nothing is planned yet for next season.`;
    return'No season plan loaded yet.';}
  function draft(){if(!planDraft){const squads=(M.state.weeklyTemplates||[]).map(t=>t.squad).filter(s=>/national|development/i.test(s));planDraft={step:1,name:'',course:'SCM',start:nextMonday(),meetName:'',meetDate:'',squads:squads.length?squads:(M.state.weeklyTemplates||[]).map(t=>t.squad).slice(0,1)};}return planDraft;}
  function planPreview(){const d=draft();try{return M.seasonPlanner.generateSeason({name:d.name||'Next season',course:d.course,seasonStart:d.start,targetMeetName:d.meetName,targetMeetDate:d.meetDate,squads:d.squads});}catch(e){return{error:e.message||String(e)};}}
  function stepHead(n,title,d){const state=d.step>n?'done':d.step===n?'open':'later';return`<div class="pn-step-head pn-${state}"><span class="pn-num">${d.step>n?'✓':n}</span><b>${esc(title)}</b>${d.step>n?`<button type="button" class="pn-edit" data-pn-goto="${n}">Change</button>`:''}</div>`;}
  function step1Html(d){const squads=(M.state.weeklyTemplates||[]).map(t=>t.squad);
    if(d.step!==1)return`<p class="pn-summary">${esc(d.name||'Next season')} · ${esc(d.squads.join(' + '))} · ${esc(d.course)} · ${esc(niceDate(d.start))} → <b>${esc(d.meetName||'Target meet')}</b> ${esc(niceDate(d.meetDate))}</p>`;
    return`<div class="pn-body"><p class="muted">The season counts back from the meet you are peaking for.</p>
      <label>Season name<input id="pnName" value="${esc(d.name)}" placeholder="e.g. Summer 2026/27"></label>
      <div class="pn-label">Squads</div><div class="sg-squads">${squads.map(s=>`<label class="sg-squad-choice"><input type="checkbox" data-pn-squad value="${esc(s)}" ${d.squads.includes(s)?'checked':''}> ${esc(s)}</label>`).join('')||'<span class="muted">No squads set up yet.</span>'}</div>
      <div class="data-meta"><label>First week (Monday)<input id="pnStart" type="date" value="${esc(d.start)}"></label><label>Course<select id="pnCourse"><option value="SCM" ${d.course==='SCM'?'selected':''}>Short course</option><option value="LCM" ${d.course==='LCM'?'selected':''}>Long course</option></select></label></div>
      <div class="data-meta"><label>Target meet<input id="pnMeetName" value="${esc(d.meetName)}" placeholder="e.g. NZ Age Group Champs"></label><label>Meet date<input id="pnMeetDate" type="date" value="${esc(d.meetDate)}"></label></div>
      <div class="pn-actions"><button type="button" class="pn-primary" data-pn-next="1">Next · standard week</button></div></div>`;}
  function step2Html(d){if(d.step<2)return'';const list=(M.state.weeklyTemplates||[]).filter(t=>d.squads.includes(t.squad));
    if(d.step>2)return`<p class="pn-summary">${list.map(t=>`${esc(t.squad)}: ${(t.days||[]).length} sessions a week`).join(' · ')}</p>`;
    return`<div class="pn-body"><p class="muted">This is the normal week every week repeats. It stays the same all season unless you change it.</p>${list.map(t=>`<div class="pn-week"><b>${esc(t.squad)}</b>${(t.days||[]).map(x=>`<div class="pn-day"><span>${esc(x.day)} ${esc(x.dayPart)}</span><span>${esc(x.session_focus)}</span></div>`).join('')||'<p class="muted">No sessions set — use Change standard week.</p>'}</div>`).join('')}
      <details class="pn-more"><summary>Change standard week</summary>${weeklyTemplateRows()}</details>${timetableSummaryHtml()}<details class="pn-more"><summary>Change pool timetable</summary>${timetableRows()}</details>
      <div class="pn-actions"><button type="button" class="pn-primary" data-pn-next="2">Looks right · next</button></div></div>`;}
  function phaseSpans(pv){const first=pv.weeklyRows.filter(w=>w.squad===pv.seasonRow.squads[0]),out=[];for(const w of first){const last=out[out.length-1];if(last&&last.phase===w.phase){last.weeks++;last.end=w.week_start;}else out.push({phase:w.phase,start:w.week_start,end:w.week_start,weeks:1,system:w.primary_system,technical:w.technical_focus});}return out;}
  function step3Html(d,pv){if(d.step<3)return'';if(pv.error)return`<div class="pn-body"><div class="check-card bad">${esc(pv.error)}</div><div class="pn-actions"><button type="button" data-pn-goto="1">Back to step 1</button></div></div>`;
    const spans=phaseSpans(pv);
    if(d.step>3)return`<p class="pn-summary">${pv.totalWeeks} weeks · ${spans.map(x=>`${esc(x.phase)} ${x.weeks}w`).join(' → ')}</p>`;
    return`<div class="pn-body"><p class="muted">${pv.totalWeeks} weeks from ${esc(niceDate(d.start))} to ${esc(d.meetName||'the meet')}. Taper takes whatever is left at the end.</p>${spans.map(x=>`<div class="pn-phase"><div><b>${esc(x.phase)}</b><small>${esc(niceDate(x.start))} · ${x.weeks} week${x.weeks===1?'':'s'}</small></div><span>${esc(x.system||'')}</span></div>`).join('')}
      <details class="pn-more"><summary>Change phase lengths / focus</summary>${phaseTemplateRows()}</details>
      ${pv.warnings.length?`<div class="check-card bad">${pv.warnings.map(esc).join('<br>')}</div>`:''}
      <div class="pn-actions"><button type="button" class="pn-primary" data-pn-next="3">Next · check & create</button></div></div>`;}
  function step4Html(d,pv){if(d.step<4||pv.error)return'';const bySquad=pv.seasonRow.squads.map(sq=>({sq,rows:pv.weeklyRows.filter(w=>w.squad===sq)}));
    return`<div class="pn-body"><p class="muted">Every week below becomes the weekly focus Coach Hub and the session check use. You can still adjust any single week later.</p>${bySquad.map(({sq,rows})=>`<details class="pn-more" ${bySquad.length===1?'open':''}><summary>${esc(sq)} · ${rows.length} weeks</summary>${rows.map(w=>`<div class="pn-day"><span>${esc(niceDate(w.week_start))}</span><span>${esc(w.objective)}</span></div>`).join('')}</details>`).join('')}
      <div class="pn-actions"><button type="button" class="pn-primary" id="pnCreate">Create season plan</button></div></div>`;}
  function renderPlanner(h){
    if(!M.seasonPlanner||!M.standardTimetable){
      h.innerHTML='<section class="empty-card" data-pn-loading><b>Loading the season planner…</b></section>';
      Promise.all([ensureEngine('engines/season-planner.js',()=>!!M.seasonPlanner),ensureEngine('engines/standard-timetable.js',()=>!!M.standardTimetable)]).then(([sp])=>{
        if(!planMode)return;if(sp){M.calendar?.reset?.();render();return;}
        h.innerHTML=`<section class="empty-card"><h2>The season planner didn't load on this device</h2><p>Close the app fully and open it again. If this still shows, send a screenshot of this box.</p><p class="muted" style="font-size:13px">${esc(engineDiag('engines/season-planner.js'))}<br>${esc(engineDiag('engines/standard-timetable.js'))}</p><div class="hub-actions"><button type="button" onclick="location.reload()">Reload app</button></div></section>`;
      });
      return;
    }
    M.seasonPlanner.ensureSeeds();const d=draft();
    if(planResult){h.innerHTML=`<section class="page-card pn-wrap"><div class="eyebrow">PLAN NEXT SEASON</div><h1>✓ ${esc(planResult.name)} is set</h1><p>${esc(planResult.squads.join(' + '))} · ${planResult.weeks} weeks · ${esc(niceDate(planResult.start))} → ${esc(planResult.meet)} ${esc(niceDate(planResult.end))}</p><p class="muted">Coach Hub shows this season from its first week. Single weeks can be adjusted any time under Data & References → Active weekly plan.</p><div class="pn-actions"><button type="button" class="pn-primary" data-pn-exit="hub">Back to Coach Hub</button><button type="button" data-pn-again>Plan another squad</button></div></section>`;bindPlanner(h);return;}
    const pv=d.step>=3?planPreview():null;
    h.innerHTML=`<section class="page-card pn-wrap"><div class="eyebrow">PLAN NEXT SEASON</div><h1>Plan next season</h1><p>${planContextLine()}</p><p class="muted">Four steps. Nothing changes until you press <b>Create season plan</b>.</p></section>
      <section class="page-card pn-card">${stepHead(1,'Season & target meet',d)}${step1Html(d)}</section>
      <section class="page-card pn-card">${stepHead(2,'Standard week',d)}${step2Html(d)}</section>
      <section class="page-card pn-card">${stepHead(3,'Phases',d)}${pv?step3Html(d,pv):''}</section>
      <section class="page-card pn-card">${stepHead(4,'Check & create',d)}${pv?step4Html(d,pv):''}</section>
      <section class="page-card pn-foot"><button type="button" data-pn-exit="hub">Back to Coach Hub</button><button type="button" data-pn-exit="data">All data & references</button></section>`;
    bindPlanner(h);bindWeeklyTemplates(h);bindPhaseTemplate(h);bindTimetable(h);
  }
  function readStep1(h){const d=draft();const q=s=>h.querySelector(s);if(!q('#pnName'))return;d.name=q('#pnName').value.trim();d.start=q('#pnStart').value;d.course=q('#pnCourse').value;d.meetName=q('#pnMeetName').value.trim();d.meetDate=q('#pnMeetDate').value;d.squads=[...h.querySelectorAll('[data-pn-squad]:checked')].map(x=>x.value);}
  function bindPlanner(h){
    h.querySelectorAll('[data-pn-next]').forEach(b=>b.addEventListener('click',()=>{const d=draft(),n=Number(b.dataset.pnNext);if(n===1){readStep1(h);
      const miss=[!d.squads.length&&'pick at least one squad',!d.start&&'set the first week',!d.meetDate&&'set the target meet date'].filter(Boolean);if(miss.length)return M.toast?.(`To continue: ${miss.join(', ')}`);
      if(d.meetDate<=d.start)return M.toast?.('The meet date must be after the first week');if(!d.name)d.name=`${d.meetName||'Next season'} · ${d.squads.join(' / ')}`;}
      d.step=n+1;render();h.querySelectorAll('.pn-card')[d.step-1]?.scrollIntoView?.({block:'start'});}));
    h.querySelectorAll('[data-pn-goto]').forEach(b=>b.addEventListener('click',()=>{draft().step=Number(b.dataset.pnGoto);render();}));
    h.querySelectorAll('[data-pn-exit]').forEach(b=>b.addEventListener('click',()=>{const to=b.dataset.pnExit;planMode=false;planResult=null;if(to==='data')render();else go(to);}));
    h.querySelector('[data-pn-again]')?.addEventListener('click',()=>{planResult=null;planDraft=null;render();});
    h.querySelector('#pnCreate')?.addEventListener('click',async()=>{if(!canManage())return M.toast?.('Owner permission required');const pv=planPreview();if(pv.error)return M.toast?.(pv.error);const b=h.querySelector('#pnCreate');b.disabled=true;b.textContent='Creating…';
      try{const touched=pv.seasonRow.squads,meta={version:pv.seasonRow.version,effectiveFrom:pv.seasonRow.start_date,source:pv.seasonRow.source};await commitSeasonPlannerType('season_plan',[pv.seasonRow],touched,meta);await commitSeasonPlannerType('weekly_plan',pv.weeklyRows,touched,meta);
        planResult={name:pv.seasonRow.name,squads:touched,weeks:pv.totalWeeks,start:pv.seasonRow.start_date,end:pv.seasonRow.end_date,meet:pv.seasonRow.meets?.[0]?.name||'target meet'};planDraft=null;M.toast?.('Season plan created');render();}
      catch(e){b.disabled=false;b.textContent='Create season plan';M.toast?.(e.message||String(e));}});
  }
  function openPlanner(){if(!canManage())return M.toast?.('Owner permission required');planMode=true;planResult=null;const mh=document.querySelector('#modalHost');if(mh&&mh.innerHTML){mh.innerHTML='';try{M.nav?.clearTransient?.()}catch{}}go('data');if(M.state?.settings?.view==='data')render();}
  A.openPlanner=openPlanner;A.planContextLine=planContextLine;A.isPlanMode=()=>planMode;
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-msos-plan-season]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();openPlanner();},true);
  // Leaving through the bottom nav or the other Data shortcuts returns Data & References to its normal page.
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-nav],[data-msos-data],[data-loop-data]'))planMode=false;},true);
  // ---------------------------------------------------------------------------
  // Engine self-heal (10 Oct 2026). Andy's phone showed "Season planner engine not loaded" on the Plan
  // screen while the same build loads both engines fine in a clean browser -- the season-planner (and,
  // judging by his empty October calendar, standard-timetable) script did not run on that device's page
  // load. These two engines only build plain helpers on M, so loading the script again is safe. Re-fetch it
  // once (cache-busted), then report exactly what the browser saw if it still isn't there, instead of a
  // dead-end message.
  // ---------------------------------------------------------------------------
  const engineLoads={};
  function scriptFor(path){return [...document.querySelectorAll('script[src]')].find(s=>s.getAttribute('src').split('?')[0].replace(/^\.\//,'')===path)||null;}
  function engineDiag(path){
    const tag=scriptFor(path),src=tag?.src||'';let ent=null;try{ent=src?performance.getEntriesByName(src)[0]:null;}catch{}
    const status=ent?(ent.responseStatus||(ent.transferSize===0&&ent.decodedBodySize>0?'cache':ent.decodedBodySize?'ok':'empty')):'no request seen';
    const sw=navigator.serviceWorker?.controller?.scriptURL?.split('/').pop()||'none';
    return`${path.split('/').pop()}: ${tag?`in page (${String(tag.getAttribute('src')).split('?v=')[1]||'no version'})`:'not in page'} · ${status} · build ${M.BUILD||'?'} · sw ${sw}${engineLoads[path]?.error?` · retry: ${engineLoads[path].error}`:''}`;
  }
  function ensureEngine(path,isReady){
    if(isReady())return Promise.resolve(true);
    if(engineLoads[path]?.promise)return engineLoads[path].promise;
    const tag=scriptFor(path),base=tag?tag.getAttribute('src'):`${path}?v=${encodeURIComponent(M.BUILD||'retry')}`;
    const rec=engineLoads[path]={};
    rec.promise=new Promise(resolve=>{const el=document.createElement('script');el.src=`${base}${base.includes('?')?'&':'?'}reload=${Date.now()}`;el.onload=()=>{rec.error=isReady()?'':'loaded but did not start';resolve(isReady());};el.onerror=()=>{rec.error='could not download';resolve(false);};document.head.appendChild(el);});
    return rec.promise;
  }
  A.ensureEngine=ensureEngine;A.engineDiag=engineDiag;
  function ensureShortcut(view){if(!canManage())return;if(view==='hub'){const host=document.querySelector('#hubView');if(host&&!host.querySelector('[data-msos-data]'))host.insertAdjacentHTML('afterbegin','<section class="page-card"><div class="eyebrow">DATA HEALTH</div><div class="hub-actions"><button data-msos-data>Data & References · imports / standards / points</button></div></section>');}if(view==='athletes'){const host=document.querySelector('#athletesView .perf-head .hub-actions');if(host&&!host.querySelector('[data-msos-data]'))host.insertAdjacentHTML('beforeend','<button data-msos-data>Data & References</button>');}if(view==='reports'){const host=document.querySelector('#reportsView .hub-actions');if(host&&!host.querySelector('[data-msos-data]'))host.insertAdjacentHTML('beforeend','<button data-msos-data>Data & References</button>');}}
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-msos-data]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(!canManage())return M.toast?.('Owner permission required');go('data');},true);
  g.addEventListener?.('msos:data-updated',()=>{if(M.state?.settings?.view==='data')render();});
  A.render=render;A.ensureShortcut=ensureShortcut;A.canManage=canManage;
  const boot=()=>{ensureShortcut(M.state?.settings?.view||'board');if(M.state?.settings?.view==='data')render();};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
})(globalThis);
