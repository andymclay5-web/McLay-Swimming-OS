'use strict';
// Meet results inbox (19 Oct 2026). Andy: "build the automated way and scrape for historical data of current swimmers to
// update msos and automate future updates as well as have ability to load manually or later integrate with swimify and
// meet mobile".
//
// Owner of one screen: what the results sync (supabase/functions/msos-results-sync) has found, for the head coach to
// approve. It shows each meet with swims waiting, flags PBs, lets the coach add or skip swims, confirms "possible match"
// swimmers (same name, different date of birth in the meet file), uploads a results file by hand and asks SwimInfo for
// new results now. It never writes results itself: approving goes through msos_results_review (owner only, in the
// database); the PB board, pathway and race-pace targets read approved results only. Lives at the top of Input data.
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const X=M.resultsInbox={build:'v4-results-inbox-20261019'};
  const esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const org=()=>M.state.settings?.organisationId||'';
  const f=(path,body)=>(M.cloud?.fetch||M.cloudSessionEngine?.fetch)(path,{method:'POST',body:JSON.stringify(body)});
  const owner=()=>(M.access?.role?.()||'owner')==='owner';
  const day=d=>{if(!d)return'';const t=new Date(`${String(d).slice(0,10)}T12:00:00Z`);return t.toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});};
  const STROKE={Freestyle:'Free',Backstroke:'Back',Breaststroke:'Breast',Butterfly:'Fly',IM:'IM'};
  let st={data:null,loading:false,busy:'',msg:'',open:{},unchecked:{},host:null};
  X.state=()=>st;

  async function load(){if(!org()||!M.cloud?.ready?.()){st.msg='Sign in to the cloud to see meet results.';paint();return;}
    st.loading=true;paint();try{st.data=await f('/rest/v1/rpc/msos_results_inbox',{p_org:org()});st.msg='';}catch(e){st.msg=`Couldn't load meet results: ${e.message}`;}st.loading=false;paint();}
  X.load=load;
  function pendingBySource(){const m=new Map();for(const r of st.data?.pending||[])(m.get(r.source_id)||m.set(r.source_id,[]).get(r.source_id)).push(r);return m;}
  // swimmers in the files who share a name with an MSOS swimmer but not their date of birth -- one line per person
  function possible(){const seen=new Map();for(const s of st.data?.sources||[])for(const u of s.unmatched||[]){if(!u.suggest||!u.dob)continue;const k=`${u.suggest.athlete_id}|${u.dob}`;const e=seen.get(k)||seen.set(k,{...u,meets:0,swims:0}).get(k);e.meets++;e.swims+=u.swims||0;}return[...seen.values()];}
  function others(){const seen=new Map();for(const s of st.data?.sources||[])for(const u of s.unmatched||[]){if(u.suggest)continue;const k=`${u.name}|${u.dob}`;if(!seen.has(k))seen.set(k,u);}return[...seen.values()];}
  function rowHtml(r){const off=!!st.unchecked[r.id];return`<label class="ri-row${off?' off':''}"><input type="checkbox" data-ri-pick="${esc(r.id)}"${off?'':' checked'}><span class="ri-who">${esc(r.name||r.raw_name)}</span><span class="ri-ev">${esc(r.distance)} ${esc(STROKE[r.stroke]||r.stroke)} <small>${esc(r.course||'')}${r.round?` · ${esc(r.round)}`:''}</small></span><b class="ri-time">${esc(r.time)}${r.pb?' <i class="ri-pb">PB</i>':''}</b>${r.confidence==='name_only'?'<small class="ri-warn" title="Matched by name only — no date of birth to check">name only</small>':''}</label>`;}
  function meetHtml(s,rows){const open=!!st.open[s.id],pbs=rows.filter(r=>r.pb).length,swimmers=new Set(rows.map(r=>r.athlete_id)).size;
    return`<article class="ri-meet" data-ri-meet="${esc(s.id)}"><header><div><b>${esc(s.meet_name||'Meet')}</b><small>${esc([day(s.meet_start),s.course,s.source==='upload'?'uploaded file':'SwimInfo'].filter(Boolean).join(' · '))}</small></div>
      <span class="ri-count">${rows.length} swim${rows.length===1?'':'s'} · ${swimmers} swimmer${swimmers===1?'':'s'}${pbs?` · <b>${pbs} PB${pbs===1?'':'s'}</b>`:''}</span></header>
      <div class="hub-actions"><button type="button" data-ri-approve="${esc(s.id)}"${st.busy?' disabled':''}>${open&&rows.some(r=>st.unchecked[r.id])?`Add ${rows.filter(r=>!st.unchecked[r.id]).length} ticked`:'Add all'}</button><button type="button" data-ri-toggle="${esc(s.id)}">${open?'Hide swims':'Review swims'}</button><button type="button" class="danger" data-ri-skip="${esc(s.id)}"${st.busy?' disabled':''}>Skip meet</button></div>
      ${open?`<div class="ri-rows">${rows.map(rowHtml).join('')}</div>`:''}</article>`;}
  function html(){if(!owner())return'';const by=pendingBySource(),sources=(st.data?.sources||[]).filter(s=>by.has(s.id)),poss=possible(),oth=others();
    const imported=(st.data?.sources||[]).filter(s=>s.status==='imported'&&s.source!=='swiminfo-page');
    return`<section class="page-card ri" data-results-inbox-card><div class="eyebrow">MEET RESULTS</div><h2>Results from meets</h2>
      <p class="muted">MSOS checks SwimInfo NZ every morning for new results files and picks out your swimmers. Nothing changes their PBs, pathway or targets until you add it here.</p>
      <div class="hub-actions"><button type="button" data-ri-scan${st.busy?' disabled':''}>${st.busy==='scan'?'Checking SwimInfo…':'Check SwimInfo now'}</button><button type="button" data-ri-upload${st.busy?' disabled':''}>${st.busy==='upload'?'Reading file…':'Upload a results file'}</button><input type="file" accept=".zip,.hy3,.ZIP,.HY3" data-ri-file hidden></div>
      ${st.msg?`<p class="ri-msg" data-ri-msg>${esc(st.msg)}</p>`:''}
      ${st.loading&&!st.data?'<p class="muted">Loading…</p>':''}
      ${poss.length?`<div class="ri-possible"><h3>Is this your swimmer?</h3>${poss.map(u=>`<div class="ri-poss"><span><b>${esc(u.name)}</b> <small>${esc(u.club||'')} · ${u.meets} meet${u.meets===1?'':'s'} · ${u.swims} swim${u.swims===1?'':'s'}</small><small>Meet files: born ${esc(day(u.dob))} · MSOS: ${u.suggest.msos_dob?`born ${esc(day(u.suggest.msos_dob))}`:'no date of birth'}</small></span><button type="button" data-ri-link="${esc(u.suggest.athlete_id)}" data-ri-name="${esc(u.name)}" data-ri-dob="${esc(u.dob)}"${st.busy?' disabled':''}>Yes, ${esc(u.suggest.athlete_name.split(' ')[0])}</button></div>`).join('')}</div>`:''}
      ${sources.length?`<h3>Waiting for you</h3>${sources.map(s=>meetHtml(s,by.get(s.id))).join('')}`:(st.data?'<p class="good-text">Nothing waiting — every result found so far has been added or skipped.</p>':'')}
      ${oth.length?`<details class="ri-others"><summary>${oth.length} swimmer${oth.length===1?'':'s'} from your clubs in these files aren't in MSOS</summary><p class="muted">Their results are left out. Add them as swimmers (Coach Hub → Swimmers) and the next check picks them up.</p>${oth.slice(0,40).map(u=>`<div class="ri-other">${esc(u.name)} <small>${esc(u.club||'')}${u.dob?` · born ${esc(day(u.dob))}`:''}</small></div>`).join('')}</details>`:''}
      ${imported.length?`<details class="ri-history"><summary>${imported.length} meet${imported.length===1?'':'s'} read</summary>${imported.slice(0,60).map(s=>`<div class="ri-other">${esc(s.meet_name||s.page_title||'')} <small>${esc(day(s.meet_start))} · ${s.swims_ours||0} of your swims</small></div>`).join('')}</details>`:''}
    </section>`;}
  function paint(){const h=st.host;if(!h||!h.isConnected)return;h.innerHTML=html();bind(h);}
  async function act(kind,fn){st.busy=kind;st.msg='';paint();try{await fn();}catch(e){st.msg=e.message||String(e);}st.busy='';await load();}
  async function refreshEvidence(){try{const p=await M.cloud.pullEvidence();if(Object.keys(p?.tables||{}).length){M.cloud.applyEvidence(p);for(const k of ['results_pb_board','results_event_history'])if(Array.isArray(p.tables[k]))M.refs?.merge?.(k,p.tables[k]);}}catch{}
    try{g.MSOSEvidenceIndex?.invalidate?.(M.state);g.MSOSEngines?.Coordinator?.clearCache?.();}catch{}}
  async function review(approve,reject){const r=await f('/rest/v1/rpc/msos_results_review',{p_org:org(),p_approve:approve,p_reject:reject});
    st.msg=[r?.approved?`Added ${r.approved} swim${r.approved===1?'':'s'} — PBs and pathway updated.`:'',r?.skipped?`Skipped ${r.skipped}.`:''].filter(Boolean).join(' ');if(r?.approved)await refreshEvidence();const m=st.msg;return m;}
  X.review=review;
  function bind(h){
    h.querySelector('[data-ri-scan]')?.addEventListener('click',()=>act('scan',async()=>{const r=await f('/functions/v1/msos-results-sync',{action:'scan',organisation_id:org()});const added=(r.results||[]).flatMap(x=>x.results||[]).reduce((n,x)=>n+(x.swims_added||0),0);
      st.msg=r.error?r.error:added?`Found ${added} new swim${added===1?'':'s'} for your swimmers.`:`Checked ${r.checked||0} recent meet${r.checked===1?'':'s'} — nothing new.`;const keep=st.msg;await load();st.msg=keep;}));
    h.querySelector('[data-ri-upload]')?.addEventListener('click',()=>h.querySelector('[data-ri-file]')?.click());
    h.querySelector('[data-ri-file]')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;act('upload',async()=>{if(file.size>12e6)throw new Error('That file is too big for a results file.');
      const buf=new Uint8Array(await file.arrayBuffer());try{await M.resultsFile?.read?.(buf,file.name);}catch(err){throw new Error(`That isn't a results file MSOS can read: ${err.message}`);}
      let b64='';for(let i=0;i<buf.length;i+=0x8000)b64+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));b64=btoa(b64);
      const r=await f('/functions/v1/msos-results-sync',{action:'upload',organisation_id:org(),name:file.name,file_b64:b64});if(r.error)throw new Error(r.error);
      st.msg=r.skipped?'That file was already read.':`${r.meet}: ${r.swims_added} swim${r.swims_added===1?'':'s'} for ${r.swimmers_ours} of your swimmers.`;const keep=st.msg;await load();st.msg=keep;});});
    h.querySelectorAll('[data-ri-toggle]').forEach(b=>b.onclick=()=>{st.open[b.dataset.riToggle]=!st.open[b.dataset.riToggle];paint();});
    h.querySelectorAll('[data-ri-pick]').forEach(c=>c.onchange=()=>{if(c.checked)delete st.unchecked[c.dataset.riPick];else st.unchecked[c.dataset.riPick]=true;paint();});
    h.querySelectorAll('[data-ri-approve]').forEach(b=>b.onclick=()=>{const rows=pendingBySource().get(b.dataset.riApprove)||[];const ok=rows.filter(r=>!st.unchecked[r.id]).map(r=>r.id),no=rows.filter(r=>st.unchecked[r.id]).map(r=>r.id);act('review',async()=>{const m=await review(ok,no);st.msg=m;});});
    h.querySelectorAll('[data-ri-skip]').forEach(b=>b.onclick=()=>{const rows=pendingBySource().get(b.dataset.riSkip)||[];if(!confirm(`Skip all ${rows.length} swims from this meet? They won't be added.`))return;act('review',async()=>{const m=await review([],rows.map(r=>r.id));st.msg=m;});});
    h.querySelectorAll('[data-ri-link]').forEach(b=>b.onclick=()=>act('link',async()=>{const r=await f('/functions/v1/msos-results-sync',{action:'link',organisation_id:org(),athlete_id:b.dataset.riLink,name:b.dataset.riName,dob:b.dataset.riDob});if(r.error)throw new Error(r.error);
      const added=(r.redone||[]).reduce((n,x)=>n+(x.swims_added||0),0);st.msg=`Linked to ${r.athlete}. ${added} swim${added===1?'':'s'} from ${r.files} meet${r.files===1?'':'s'} are now waiting below.`;const keep=st.msg;await load();st.msg=keep;}));
  }
  X.render=host=>{if(!host)return;st.host=host;if(!owner()){host.innerHTML='';return;}paint();if(!st.loading)load();};
  X.html=html;
})(globalThis);
