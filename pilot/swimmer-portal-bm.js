'use strict';
(function(g){
  const P=g.MSOSPilotLink;
  if(!P)return;
  const qs=new URLSearchParams(g.location.search),initial=P.norm(qs.get('who')||'matthew-robertson');
  const state={slug:initial,baseSessionAllowed:null,hydrating:false};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clock=(M,v)=>M.util?.clock?M.util.clock(Number(v)):String(v??'—');
  const statusEl=()=>document.querySelector('#pilotStatus');
  const setStatus=t=>{const el=statusEl();if(el)el.textContent=t;};

  async function hydrate(M){
    if(state.hydrating||!M.cloud?.ready?.())return false;
    state.hydrating=true;setStatus('Refreshing from coach cloud…');
    try{const payload=await M.cloud.pullShadow();M.cloud.applyShadow(payload);setStatus('Coach data refreshed');return true;}
    catch(e){setStatus(`Using local pilot copy · ${e.message||'cloud unavailable'}`);return false}
    finally{state.hydrating=false}
  }
  function pilotBar(M){
    let bar=document.querySelector('#pilotBar');if(bar)return bar;
    bar=document.createElement('section');bar.id='pilotBar';bar.className='pilot-bar';
    bar.innerHTML=`<div><b>SWIMMER PORTAL PILOT</b><span id="pilotStatus">Local pilot copy</span></div><label>Test swimmer<select id="pilotWho">${P.PILOTS.map(x=>`<option value="${esc(x.slug)}">${esc(x.name)}${x.confirmed?'':' · Ashburton candidate'}</option>`).join('')}</select></label><button id="pilotRefresh">Refresh</button>`;
    document.body.prepend(bar);
    const pick=bar.querySelector('#pilotWho');pick.value=state.slug;pick.onchange=()=>{const u=new URL(location.href);u.searchParams.set('who',pick.value);location.href=u.toString()};
    bar.querySelector('#pilotRefresh').onclick=async()=>{await hydrate(M);bind(M);};
    return bar;
  }
  function allowPilotSession(M,resolved){
    if(!state.baseSessionAllowed)state.baseSessionAllowed=M.access.sessionAllowed.bind(M.access);
    const athleteId=resolved.athlete?.id||'',sessionId=resolved.session?.id||'',remote=!!resolved.entry?.remote;
    M.access.sessionAllowed=session=>{
      if(M.access.role?.()==='swimmer'&&remote&&session?.id===sessionId&&M.state.settings.activeUserAthleteId===athleteId)return true;
      return state.baseSessionAllowed(session);
    };
  }
  function targetLabel(M,t){
    if(!t)return'';
    if(t.status==='ok')return[`Target ${t.seconds?clock(M,t.seconds):'—'}`,t.sendOff?`leave ${clock(M,t.sendOff)}`:''].filter(Boolean).join(' · ');
    if(t.status==='rep_race')return(t.rows||[]).filter(r=>r.status==='ok'&&r.seconds).map(r=>`#${r.rep} ${clock(M,r.seconds)}${r.sendOff?` / ${clock(M,r.sendOff)}`:''}`).join(' · ');
    if(t.status==='pattern'||t.status==='pattern_fallback')return(t.rows||[]).filter(r=>r.seconds||r.hr).map(r=>r.seconds?`${r.zone||''} ${clock(M,r.seconds)}${r.sendOff?` / ${clock(M,r.sendOff)}`:''}`:`${r.zone||''} HR ${r.hr||'—'}${r.sr?` · SR ${r.sr}`:''}`).join(' · ');
    if(t.status==='hr_sr')return[`HR ${t.hr||'—'}`,t.sr?`SR ${t.sr}`:''].filter(Boolean).join(' · ');
    return text(t.message||'');
  }
  function observationHtml(M,line){
    const s=line.performanceSummary||{};if(!line.observations?.length)return'';
    const parts=[];if(s.time?.values?.length)parts.push(`Time ${s.time.values.map(x=>clock(M,x)).join(' / ')}`);if(s.strokeRate?.values?.length)parts.push(`SR ${s.strokeRate.values.join(' / ')}`);if(s.heartRate?.values?.length)parts.push(`HR ${s.heartRate.values.join(' / ')}`);if(s.rpe?.values?.length)parts.push(`RPE ${s.rpe.values.join(' / ')}`);
    const sources=[...new Set(line.observations.map(o=>o.sourceLabel||o.source).filter(Boolean))];
    return`<div class="pilot-observation"><b>${s.completeness==='full'?'Captured set evidence':'Partial evidence'}</b><span>${esc(parts.join(' · ')||'Observation linked')}</span>${sources.length?`<small>${esc(sources.join(' · '))}</small>`:''}${(s.feelings||[]).slice(0,2).map(x=>`<em>Feeling: ${esc(x)}</em>`).join('')}${(s.notes||[]).slice(0,2).map(x=>`<em>${esc(x)}</em>`).join('')}</div>`;
  }
  function blockHtml(M,b){return`<details class="pilot-block" open><summary><b>${esc(b.label||b.title||'Block')}</b><span>${Number(b.metres||0).toLocaleString()}m</span></summary>${(b.items||[]).map(i=>`<article class="pilot-set"><div><b>${esc(i.label||'Set')}</b><small>${Number(i.metres||0).toLocaleString()}m${i.tags?.length?` · ${esc(i.tags.join(' · '))}`:''}</small>${observationHtml(M,i)}</div><div class="pilot-target">${i.target?esc(targetLabel(M,i.target)):''}</div><button data-add-my-data="${esc(i.canonicalItemId||'')}" data-label="${esc(i.label||'Set')}">Add my data</button></article>`).join('')}</details>`;}
  function windowCard(label,w){return`<article class="pilot-window"><small>${esc(label)}</small><b>${Number(w?.confirmedDeliveredMetres||0).toLocaleString()}m</b><span>${Number(w?.sessions||0)} recorded session${Number(w?.sessions||0)===1?'':'s'}</span>${w?.currentSessions?`<em>${w.currentSessions} in progress</em>`:''}${w?.unknownSessions?`<em>${w.unknownSessions} attendance unconfirmed</em>`:''}</article>`;}
  function statusText(record,resolved){
    if(!record)return resolved.entry?.remote?'Remote prescription available':'No recorded session yet';
    if(record.delivery==='ended-early')return`${Number(record.deliveredMetres||0).toLocaleString()}m recorded · ended early`;
    if(record.delivery==='delivered-prescription')return`${Number(record.deliveredMetres||0).toLocaleString()}m recorded`;
    if(record.delivery==='attended-prescription')return`${Number(record.prescribedMetres||0).toLocaleString()}m current prescription`;
    if(record.delivery==='not-delivered')return'Not attended';
    return`${Number(record.prescribedMetres||0).toLocaleString()}m prescription`;
  }
  function render(M,resolved){
    const host=document.querySelector('#swimmerView');if(!host)return;
    const ath=resolved.athlete,s=M.currentSession?.();if(!ath){host.innerHTML=`<section class="pilot-empty"><h1>${esc(resolved.entry?.name||'Pilot swimmer')}</h1><p>This exact name is not in the current active roster, so MSOS has not invented or linked an athlete record.</p></section>`;return;}
    M.state.settings.selectedAthleteId=ath.id;
    let v=null,p=null;try{v=M.swimmerTrainingBG?.viewFor?.(ath)||null;p=M.swimmerTrainingBG?.projectionFor?.(ath)||null}catch{}
    const today=v?.today,blocks=p?.blocks?.length?p.blocks:(today?.blocks||[]),remote=resolved.entry?.remote&&!resolved.attended;
    host.innerHTML=`<section class="pilot-hero"><div class="eyebrow">MY TRAINING</div><h1>${esc(ath.full_name)}</h1><p>${esc([ath.squad,s?.identity?.date,s?.identity?.dayPart].filter(Boolean).join(' · '))}</p><strong>${esc(statusText(today,resolved))}</strong>${remote?`<div class="pilot-remote">REMOTE COPY · This is your individual prescription. It is not being counted as attendance just because you opened it.</div>`:''}${!resolved.entry?.confirmed?`<div class="pilot-candidate">ASHBURTON PILOT CANDIDATE · exact roster match only</div>`:''}</section>${s?`<section class="pilot-card"><div class="eyebrow">THIS SESSION</div><h2>${esc(s.identity?.title||'Session')}</h2>${blocks.map(b=>blockHtml(M,b)).join('')||'<p>No individual blocks projected.</p>'}</section>`:'<section class="pilot-card"><h2>No matching session loaded</h2></section>'}<section class="pilot-card"><div class="eyebrow">TRAINING HISTORY</div><h2>What I have actually done</h2><div class="pilot-windows">${windowCard('LAST 7 DAYS',v?.week)}${windowCard('LAST 30 DAYS',v?.month)}</div></section><section class="pilot-card"><div class="eyebrow">WHAT'S NEXT</div><h2>Coming up</h2>${(v?.upcoming||[]).slice(0,4).map(x=>`<article class="pilot-next"><b>${esc(`${x.date} · ${x.title}`)}</b><span>${Number(x.prescribedMetres||0).toLocaleString()}m individual prescription</span></article>`).join('')||'<p>No upcoming matching session loaded.</p>'}</section><section class="pilot-card"><small>PILOT SAFETY</small><p>This test surface is privacy-filtered to one swimmer. Production remote access still needs server-side athlete authentication and policy; this pilot does not claim that security gate is finished.</p></section>`;
    host.querySelectorAll('[data-add-my-data]').forEach(btn=>btn.onclick=()=>openEntry(M,ath,s,btn.dataset.addMyData,btn.dataset.label));
  }
  function openEntry(M,ath,session,itemId,label){
    if(!session)return;const host=document.querySelector('#modalHost');
    host.innerHTML=`<div class="modal open pilot-modal"><div class="modal-card"><header><h2>Add my data</h2><button data-close>×</button></header><div class="modal-body"><p><b>${esc(label||'Set')}</b></p><label>Times<input id="pilotTimes" placeholder="e.g. 45.1, 44.9, 45.3"></label><label>Stroke rate<input id="pilotSR" inputmode="numeric" placeholder="e.g. 32"></label><label>Heart rate<input id="pilotHR" inputmode="numeric"></label><label>RPE / 10<input id="pilotRPE" inputmode="numeric"></label><label>How did it feel?<input id="pilotFeeling" placeholder="e.g. Strong, last one hurt"></label><label>Comment<textarea id="pilotComment" placeholder="Anything useful for coach"></textarea></label></div><footer><button data-save>Save to my session</button></footer></div></div>`;
    const close=()=>host.innerHTML='';host.querySelector('[data-close]').onclick=close;host.querySelector('[data-save]').onclick=()=>{
      const times=text(host.querySelector('#pilotTimes').value).split(/[;,/]+/).map(x=>M.util?.seconds?.(text(x))??Number(x)).filter(Number.isFinite),num=id=>{const n=Number(host.querySelector(id).value);return Number.isFinite(n)&&host.querySelector(id).value!==''?n:null},now=Date.now(),iso=new Date(now).toISOString();
      const metrics={};if(times.length)metrics.timesSeconds=times;const sr=num('#pilotSR'),hr=num('#pilotHR'),rpe=num('#pilotRPE');if(sr!=null)metrics.strokeRate=sr;if(hr!=null)metrics.heartRate=hr;if(rpe!=null)metrics.rpe=rpe;
      const cap={id:`pilot-self-${ath.id}-${now}`,schemaVersion:1,createdAt:now,created_at:iso,updated_at:iso,authorId:ath.id,source:'athlete_self_report',type:'self_report',capture_type:'self_report',athleteIds:[ath.id],athlete_ids:[ath.id],athlete_id:ath.id,session_id:session.id,item_id:itemId||null,audience:'shared',context:{sessionId:session.id,itemId:itemId||'',observedAt:null},raw:{comment:text(host.querySelector('#pilotComment').value),feeling:text(host.querySelector('#pilotFeeling').value)},metrics};
      M.state.captures=M.state.captures||[];M.state.captures.push(cap);M.store.save(M.state);close();render(M,P.resolve(M.state,state.slug,{allowRemote:true}));setStatus('Swimmer data saved to isolated pilot state');
    };
  }
  async function bind(M){
    pilotBar(M);let r=P.resolve(M.state,state.slug,{allowRemote:true});
    if((!r.athlete||!r.session)&&M.cloud?.ready?.()){await hydrate(M);r=P.resolve(M.state,state.slug,{allowRemote:true});}
    allowPilotSession(M,r);
    if(!r.athlete){M.state.settings.view='swimmer';M.ui.renderHeader?.();render(M,r);return;}
    M.state.settings.activeRole='swimmer';M.state.settings.activeUserAthleteId=r.athlete.id;M.state.settings.selectedAthleteId=r.athlete.id;M.state.settings.view='swimmer';
    if(r.session){M.state.settings.selectedSessionId=r.session.id;M.state.settings.pilotRemoteSessionId=r.entry?.remote?r.session.id:'';}
    M.store.save(M.state);M.ui.renderHeader?.();render(M,r);M.ui.configureRoleChrome?.();
    setStatus(`${r.entry.confirmed?'Pilot linked':'Candidate matched'} · ${r.session?`${r.session.identity?.date||''} ${r.session.identity?.dayPart||''}`:'no session'}`);
  }
  function ready(){const M=g.MSOS4;if(M?.state&&M?.ui?.renderHeader&&M?.access&&M?.swimmerTrainingBG){bind(M);return}setTimeout(ready,80)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})(globalThis);
