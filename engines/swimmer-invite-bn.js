'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines?.Evidence,R=g.MSOSArchitecture?.AthleteReport,C=g.MSOSEngines?.Coordinator;if(!M?.ui||!M?.state)return;
  const X=M.swimmerInviteBN={build:'v4-swimmer-history-preview-20260907c'};
  const esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??''),text=v=>String(v??'').replace(/\s+/g,' ').trim(),norm=v=>text(v).toLowerCase();
  const selected=()=>{const id=M.state?.settings?.selectedAthleteId;return(M.state?.athletes||[]).find(a=>a.id===id)||null;};
  const cfg=()=>M.store?.config?.()||g.MCLAY_CONFIG||{},auth=()=>M.store?.auth?.()||{};
  const ownCapture=(c,a)=>{const ids=[c?.athlete_id,c?.athleteId,...(c?.athlete_ids||[]),...(c?.athleteIds||[])].filter(Boolean).map(String);return ids.includes(String(a?.id))&&['shared','swimmer'].includes(String(c?.audience||''));};
  async function rpc(name,body){const c=cfg(),token=auth().access_token;if(!c.supabaseUrl||!c.supabaseAnonKey)throw new Error('Supabase is not configured.');if(!token)throw new Error('Coach sign-in is required before creating swimmer access.');const res=await fetch(`${String(c.supabaseUrl).replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:c.supabaseAnonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body||{})});const raw=await res.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{data=raw}if(!res.ok)throw new Error(data?.message||data?.hint||`Secure access failed (${res.status})`);return data;}
  const sessionDate=s=>s?.identity?.date||s?.date||'',sessionPart=s=>String(s?.identity?.dayPart||s?.identity?.slot||'').toUpperCase();
  const sessionSquads=s=>(s?.identity?.squads||s?.squads||[]).map(String);
  function sessionsFor(a){
    const all=Object.values(M.state?.canonicalSessions||{}).filter(Boolean).filter(s=>!M.access?.sessionAllowed||M.access.sessionAllowed(s));
    const relevant=all.filter(s=>sessionSquads(s).some(x=>norm(x)===norm(a?.squad))||(M.state.attendance||[]).some(x=>String(x.session_id||x.sessionId||'')===String(s.id)&&String(x.athlete_id||x.athleteId||'')===String(a?.id))||(M.state.adaptationOverrides||[]).some(x=>String(x.sessionId||x.session_id||'')===String(s.id)&&String(x.athleteId||x.athlete_id||'')===String(a?.id)));
    const use=relevant.length?relevant:all;
    return use.slice().sort((a,b)=>sessionDate(b).localeCompare(sessionDate(a))||sessionPart(b).localeCompare(sessionPart(a))).slice(0,60);
  }
  const sessionLabel=s=>[sessionDate(s),sessionPart(s),sessionSquads(s).join('+')||s?.title||s?.identity?.title||'Training',s?.identity?.course||''].filter(Boolean).join(' · ');
  function attendanceFor(a,s){
    const rows=(M.state.attendance||[]).filter(x=>String(x.session_id||x.sessionId||'')===String(s?.id)&&String(x.athlete_id||x.athleteId||'')===String(a?.id));
    const row=rows.slice().sort((x,y)=>Number(y.updated_at||0)-Number(x.updated_at||0))[0]||null;
    const status=norm(row?.status);
    return ['present','modified'].includes(status)?{status,at:row?.updated_at||row?.created_at||null}:null;
  }
  function projectionForSession(a,s){
    if(!R?.athleteSessionProjection||!s)return null;
    const prescribe=(session,item,ath)=>C?.prescription?.(session,item,ath,M.state)||{item,target:{status:'none'}};
    const present=!!attendanceFor(a,s);
    try{return R.athleteSessionProjection({session:s,athlete:a,attendance:M.state.attendance||[],attendanceSnapshots:M.state.attendanceSnapshots||{},athleteSessionBoundaries:M.state.athleteSessionBoundaries||[],squadSessionBoundaries:M.state.squadSessionBoundaries||[],presentSessionIds:present?[s.id]:[],prescribe,captures:M.state.captures||[]});}catch{return null;}
  }
  const target=t=>t?{status:t.status||'',seconds:Number.isFinite(Number(t.seconds))?Number(t.seconds):null,sendOff:Number.isFinite(Number(t.sendOff))?Number(t.sendOff):null,hr:t.hr||null,sr:t.sr||null,message:t.message||'',rows:Array.isArray(t.rows)?t.rows.slice(0,16).map(r=>({rep:r.rep,zone:r.zone||'',seconds:Number.isFinite(Number(r.seconds))?Number(r.seconds):null,sendOff:Number.isFinite(Number(r.sendOff))?Number(r.sendOff):null,hr:r.hr||null,sr:r.sr||null,status:r.status||''})):[]}:null;
  function safeSession(a,s=M.currentSession?.()){
    try{
      const p=projectionForSession(a,s);if(!p||!s)return null;
      return{id:String(s.id),date:sessionDate(s)||p.date||'',slot:s.identity?.slot||s.identity?.dayPart||'',squad:p.squad||a.squad||'',course:p.course||s.identity?.course||'',title:p.title||s.title||s.identity?.title||`${s.identity?.slot||''} ${a.squad||''}`.trim(),metres:Number(p.metres?.recorded||p.metres?.current||p.metres?.prescribed||0),delivery:p.delivery||'',zones:p.zones||{},strokes:p.strokes||{},tags:p.tags||{},finished:!!s.finish,blocks:(p.blocks||[]).map(b=>({id:String(b.id||''),label:b.label||b.title||'Block',metres:Number(b.metres)||0,items:(b.items||[]).map(i=>({id:String(i.id||i.canonicalItemId||''),label:i.label||i.text||'Set',metres:Number(i.metres)||0,tags:i.tags||[],target:target(i.target),observations:i.performanceSummary||null}))}))};
    }catch{return null;}
  }
  function safeTraining(a,s){
    try{
      const v=M.swimmerTrainingBG?.viewFor?.(a)||{},p=projectionForSession(a,s);
      const pick=w=>w?{confirmedDeliveredMetres:Number(w.confirmedDeliveredMetres)||0,sessions:Number(w.sessions)||0,strokes:w.strokes||{},tags:w.tags||{},zones:w.zones||{}}:{};
      return{today:p?{title:p.title||'',date:p.date||sessionDate(s),delivery:p.delivery||'',deliveredMetres:Number(p.metres?.recorded)||0,prescribedMetres:Number(p.metres?.prescribed)||0,strokes:p.strokes||{},tags:p.tags||{},zones:p.zones||{}}:null,week:pick(v.week),month:pick(v.month),upcoming:(v.upcoming||[]).slice(0,6).map(x=>({date:x.date||'',title:x.title||'',prescribedMetres:Number(x.prescribedMetres)||0,zones:x.plannedZones||x.zones||{}}))};
    }catch{return{};}
  }
  const mapStep=s=>s?{label:text(s.displayLabel||s.label||'Milestone'),kind:text(s.kind||''),seconds:Number(s.seconds),gapSeconds:Number(s.gapSeconds),gapPercentage:Number(s.gapPercentage),achieved:!!s.achieved,targetSeason:Number.isFinite(Number(s.targetSeason))?Number(s.targetSeason):null,sourceSeason:Number.isFinite(Number(s.sourceSeason))?Number(s.sourceSeason):null,planningProxy:!!s.planningProxy,targetDate:s.targetDate||'',ageAtTarget:Number.isFinite(Number(s.ageAtTarget))?Number(s.ageAtTarget):null,course:s.course||'',officialCourse:s.officialCourse||'',sourceStatus:s.sourceStatus||''}:null;
  function safePerformance(a,s=M.currentSession?.()){
    const c=text(M.state?.settings?.pathwayCourse||s?.identity?.course||'SCM').toUpperCase()||'SCM';let path=null;
    try{path=M.performanceEngine?.pathwaysForAthlete?.(a,{course:c})||null}catch{}
    if(path?.events?.length){
      const events=path.events.map(e=>{const scm=(e.ladder?.tracks?.SCM||[]).map(mapStep).filter(Boolean),lcm=(e.ladder?.tracks?.LCM||[]).map(mapStep).filter(Boolean),main=c==='LCM'?lcm:scm,next=e.ladder?.next?mapStep(e.ladder.next):(main.find(s=>!s.achieved)||null),raw=e.raw||e.pbRow||e.pb||{};return{key:`${String(e.course||c).toUpperCase()}|${Number(e.distance)}|${text(e.stroke)}`,course:e.course||c,distance:Number(e.distance),stroke:e.stroke,seconds:Number(e.seconds),points:Number.isFinite(Number(e.points))?Number(e.points):null,pointSystem:e.pointSystem||'',rank:e.rank||null,next,pathway:{SCM:scm,LCM:lcm},race:{date:raw.result_date||raw.date||'',meet:raw.meet_name||raw.meet||'',splits:raw.splits||raw.split_times||raw.splitTimes||raw.laps||raw.intermediates||null}};});
      const opportunities=events.filter(e=>e.next&&!e.next.achieved).slice().sort((a,b)=>Number(a.next.gapPercentage||Infinity)-Number(b.next.gapPercentage||Infinity)||Number(b.points||0)-Number(a.points||0));
      return{course:c,events,opportunities,hasDualCoursePathway:true};
    }
    const fallback=M.swimmerPerformanceBM?.modelFor?.(a,c);
    const events=(fallback?.events||[]).map(e=>({key:e.key,course:e.course,distance:e.distance,stroke:e.stroke,seconds:Number(e.pbSeconds),points:Number.isFinite(Number(e.points))?Number(e.points):null,pointSystem:e.pointSystem||'',rank:e.rank||null,next:mapStep(e.next),pathway:{SCM:[],LCM:[]},race:{date:e.pbRow?.result_date||'',meet:e.pbRow?.meet_name||'',splits:e.pbRow?.splits||null}}));
    return{course:c,events,opportunities:events.filter(e=>e.next&&!e.next.achieved)};
  }
  function safeTests(a){
    const rows=[];
    if(E)for(const st of ['Freestyle','Backstroke','Breaststroke','Butterfly','IM'])for(const r of E.t400Rows?.(a,M.state,st)||[])rows.push({type:'T400',label:`${st} T400`,seconds:Number(E.seconds(r)),date:r.result_date||r.date||r.result_period||'',course:E.course(r)||'SCM'});
    const ids=new Set(rows.map(x=>`${x.label}|${x.seconds}|${x.date}`));
    for(const r of M.state.trainingTestResults||[]){if(String(r.athlete_id||r.athleteId||'')!==String(a.id))continue;const sec=Number(E?.seconds?.(r)||r.result_seconds);if(!Number.isFinite(sec)||sec<=0)continue;const label=text(r.test_name||r.name||r.source_label||'Test'),k=`${label}|${sec}|${r.result_date||r.date||''}`;if(ids.has(k))continue;ids.add(k);rows.push({type:'test',label,seconds:sec,date:r.result_date||r.date||r.result_period||'',course:E?.course?.(r)||r.pool_course||r.course||''});}
    return rows.sort((x,y)=>String(y.date).localeCompare(String(x.date))).slice(0,30);
  }
  function safeMeet(a){return(M.state.meetEntries||[]).filter(x=>String(x.athlete_id||x.athleteId||'')===String(a.id)).slice(-20).map(x=>({event:x.event_name||x.event||`${x.distance||''} ${x.stroke||''}`,meet:x.meet_name||x.meet||'',date:x.meet_date||x.date||'',seed_seconds:Number(x.seed_seconds||x.seedTimeSeconds)||null,status:x.status||''}));}
  function payloadFor(a,s=M.currentSession?.()){return{schema:'msos-swimmer-portal-v5',publishedAt:new Date().toISOString(),athlete:{id:String(a.id),full_name:a.full_name||'',preferred_name:a.preferred_name||a.nickname||'',squad:a.squad||'',current_s_class:a.current_s_class||'',current_sb_class:a.current_sb_class||'',current_sm_class:a.current_sm_class||''},session:safeSession(a,s),history:[],performance:safePerformance(a,s),training:safeTraining(a,s),tests:safeTests(a),meet:safeMeet(a),sharedEvidence:(M.state.captures||[]).filter(c=>ownCapture(c,a)).slice(-12).reverse().map(c=>({id:c.id||'',title:c.title||c.context_label||'',type:c.type||c.evidence_type||'',text:c.text_content||c.capture_note||c.text||'',created_at:c.created_at||''}))};}
  async function sessionActionsFor(a,sessionId='',strict=false){try{return await rpc('msos_owner_swimmer_session_actions',{p_athlete_id:String(a?.id||''),p_session_id:sessionId||null})}catch(err){if(strict)throw err;return[]}}
  async function buildHistory(a,currentSession,{strict=false}={}){
    const actions=await sessionActionsFor(a,'',strict),finishBySession=new Map();
    for(const row of actions||[]){if(row?.action_type!=='finish')continue;const sid=String(row.session_id||'');if(!sid||finishBySession.has(sid))continue;finishBySession.set(sid,row);}
    const out=[];
    for(const s of sessionsFor(a)){
      if(String(s.id)===String(currentSession?.id||''))continue;
      const attendance=attendanceFor(a,s),finish=finishBySession.get(String(s.id));
      if(!attendance&&!finish)continue;
      const snapshot=safeSession(a,s);if(!snapshot?.blocks?.length)continue;
      const source=attendance&&finish?'both':finish?'remote':'aquagym';
      out.push({session:snapshot,participation:{source,status:attendance?.status||'completed',recordedAt:finish?.created_at||attendance?.at||null,label:source==='remote'?'Completed remotely':source==='both'?'AquaGym + remote finish':'Attended at AquaGym'},finish:finish?{created_at:finish.created_at||'',acknowledged_at:finish.acknowledged_at||null,payload:finish.payload||{}}:null});
      if(out.length>=24)break;
    }
    return out;
  }
  async function portalForPublish(a,s,{strictHistory=true}={}){const portal=payloadFor(a,s);portal.history=await buildHistory(a,s,{strict:strictHistory});return portal;}
  async function verifySessionInteractionLayer(a,sessionId){try{await rpc('msos_owner_swimmer_session_actions',{p_athlete_id:String(a?.id||''),p_session_id:String(sessionId||'')});return true;}catch(err){throw new Error(`Swimmer access held: session Challenge / Edit / Finish logging is not ready. ${err?.message||err}`);}}
  async function acknowledgeSessionAction(id){return rpc('msos_ack_swimmer_session_action',{p_action_id:id});}
  async function loadQr(){if(typeof g.QRCode==='function')return g.QRCode;if(X.qrPromise)return X.qrPromise;X.qrPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/qrcode.min.js?v=20260907a';s.onload=()=>typeof g.QRCode==='function'?resolve(g.QRCode):reject(new Error('Bundled QR renderer did not load'));s.onerror=()=>reject(new Error('Bundled QR renderer could not load'));document.head.appendChild(s)});return X.qrPromise;}
  async function openPreview(a,s,setStatus){
    document.querySelector('[data-bn-preview-shell]')?.remove();
    const portal=await portalForPublish(a,s,{strictHistory:false}),origin=location.origin,scrollX=window.scrollX,scrollY=window.scrollY,selectedSessionBefore=String(M.state?.settings?.selectedSessionId||M.currentSession?.()?.id||''),oldOverflow=document.documentElement.style.overflow;
    const shell=document.createElement('div');shell.dataset.bnPreviewShell='1';shell.style.cssText='position:fixed;inset:0;z-index:100000;background:#eaf3f6;display:grid;grid-template-rows:auto minmax(0,1fr);';
    shell.innerHTML=`<div style="display:flex;gap:10px;align-items:center;padding:10px 12px;background:#0d4566;color:#fff;box-shadow:0 1px 6px #0003"><button data-bn-preview-close style="border:0;border-radius:10px;padding:9px 12px;font-weight:900">← Back to coach</button><div style="min-width:0"><b>${esc(a.preferred_name||a.full_name||'Swimmer')} · preview</b><div style="font-size:11px;opacity:.85">Read-only · same swimmer view · no access issued</div></div></div><iframe data-bn-preview-frame title="Swimmer preview" style="width:100%;height:100%;border:0;background:#eef6f8"></iframe>`;
    document.body.append(shell);document.documentElement.style.overflow='hidden';
    const frame=shell.querySelector('[data-bn-preview-frame]'),url=new URL('swimmer-portal.html',location.href);url.searchParams.set('coachPreview','1');url.searchParams.set('embedded','1');url.searchParams.set('v','20260907c');
    let sent=false,closed=false;
    const cleanup=()=>{if(closed)return;closed=true;removeEventListener('message',handler);shell.remove();document.documentElement.style.overflow=oldOverflow;requestAnimationFrame(()=>window.scrollTo(scrollX,scrollY));const now=String(M.state?.settings?.selectedSessionId||M.currentSession?.()?.id||'');if(selectedSessionBefore&&now!==selectedSessionBefore)setStatus?.(`Preview closed · Training session changed unexpectedly (${selectedSessionBefore} → ${now}). Do not continue until checked.`,'error');};
    const handler=e=>{if(sent||e.origin!==origin||e.source!==frame.contentWindow||e.data?.type!=='msos-swimmer-preview-ready')return;sent=true;frame.contentWindow.postMessage({type:'msos-swimmer-preview-payload',payload:portal},origin);setStatus?.(`Preview open in MSOS · ${sessionLabel(s)} · ${portal.history.length} past session${portal.history.length===1?'':'s'} · Training stays on the same session.`,'ok');};
    addEventListener('message',handler);shell.querySelector('[data-bn-preview-close]').onclick=cleanup;frame.src=url.toString();setTimeout(()=>{if(!sent&&!closed)setStatus?.('Preview did not connect inside MSOS. Close it and try again.','error');},5500);return shell;
  }
  async function preparePortal(a,s,setStatus){
    setStatus?.(`Checking ${sessionLabel(s)}…`);
    const prepared=await M.swimmerPerformanceBM?.prepareAthlete?.(a);
    if(prepared?.completion&&prepared.completion.ok===false)throw new Error(`Could not verify complete swimmer evidence: ${(prepared.completion.errors||[prepared.completion.error]).filter(Boolean).join(' · ')||'connection unavailable'}`);
    const ready=M.swimmerPerformanceBM?.readinessFor?.(a)||{ok:true,issues:[]};if(!ready.ok)throw new Error(`Swimmer access held: ${ready.issues.join(' ')}`);
    await rpc('msos_bootstrap_owner',{});
    const portal=await portalForPublish(a,s,{strictHistory:true});
    if(!portal.performance?.events?.length)throw new Error('Swimmer access held: no verified performance events are available.');
    if(!portal.session?.blocks?.length)throw new Error('Swimmer access held: no individual session is available for the selected Training session.');
    if(portal.session.blocks.some(b=>(b.items||[]).some(i=>!i.id)))throw new Error('Swimmer access held: one or more session lines do not have stable item identity for Challenge / Edit logging.');
    setStatus?.('Checking Challenge / Edit / Finish link…');await verifySessionInteractionLayer(a,portal.session.id);
    return portal;
  }
  async function publishPortal(a,s,setStatus){
    const portal=await preparePortal(a,s,setStatus);
    setStatus?.(`Publishing current session + ${portal.history.length} completed past session${portal.history.length===1?'':'s'}…`);
    await rpc('msos_publish_swimmer_payload',{p_athlete_id:String(a.id),p_payload:portal});
    setStatus?.(`Published · ${sessionDate(s)} ${sessionPart(s)} is current · ${portal.history.length} completed past session${portal.history.length===1?'':'s'} retained.`,'ok');
    return portal;
  }
  function modal(a){
    const sessions=sessionsFor(a);if(!sessions.length){M.toast?.('No Training sessions are available to preview or publish.');return;}
    const currentId=String(M.currentSession?.()?.id||''),defaultSession=sessions.find(s=>String(s.id)===currentId)||sessions[0];
    const host=document.querySelector('#modalHost')||document.body,wrap=document.createElement('div');wrap.className='modal-overlay';wrap.dataset.bnAccess='1';
    wrap.innerHTML=`<div class="bn-access-modal"><div class="eyebrow">SECURE SWIMMER ACCESS</div><h2>${esc(a.full_name)}</h2><p class="muted">QR is onboarding only. Choose the current Training session, preview the exact swimmer view, then publish it. Generate QR only for a new/revoked device. Past Sessions include only AquaGym Roll attendance or a completed remote Finish.</p><label class="bn-session-label">Current session<select data-bn-session>${sessions.map(s=>`<option value="${esc(s.id)}" ${s===defaultSession?'selected':''}>${esc(sessionLabel(s))}</option>`).join('')}</select></label><div class="bn-qr" data-bn-qr><span class="muted">QR appears here only after Generate</span></div><div class="bn-access-url" data-bn-url hidden></div><div class="bn-access-actions"><button data-bn-preview>Preview exactly what swimmer sees</button><button class="primary" data-bn-publish>Publish / update swimmer</button><button data-bn-generate>Generate 15-minute QR</button><button data-bn-copy hidden>Copy link</button><button class="danger" data-bn-revoke>Revoke swimmer devices</button><button data-bn-close>Close</button></div><p class="bn-access-status" data-bn-status></p></div>`;
    host.append(wrap);
    const status=wrap.querySelector('[data-bn-status]'),qr=wrap.querySelector('[data-bn-qr]'),urlBox=wrap.querySelector('[data-bn-url]'),copy=wrap.querySelector('[data-bn-copy]'),sel=wrap.querySelector('[data-bn-session]');
    let activeUrl='';const chosen=()=>sessions.find(s=>String(s.id)===String(sel.value))||defaultSession;const setStatus=(msg,kind='')=>{status.textContent=msg;status.className=`bn-access-status ${kind}`};
    wrap.querySelector('[data-bn-close]').onclick=()=>wrap.remove();
    wrap.querySelector('[data-bn-preview]').onclick=async()=>{try{const s=chosen(),base=payloadFor(a,s);if(!base.session?.blocks?.length)throw new Error('No individual swimmer session can be projected from that Training session.');await openPreview(a,s,setStatus);}catch(err){setStatus(err?.message||String(err),'error')}};
    const pubBtn=wrap.querySelector('[data-bn-publish]');pubBtn.onclick=async()=>{if(pubBtn.disabled)return;pubBtn.disabled=true;try{await publishPortal(a,chosen(),setStatus);}catch(err){setStatus(err?.message||String(err),'error')}finally{pubBtn.disabled=false}};
    const genBtn=wrap.querySelector('[data-bn-generate]');genBtn.onclick=async()=>{if(genBtn.disabled)return;genBtn.disabled=true;try{const s=chosen(),portal=await publishPortal(a,s,setStatus);const inv=await rpc('msos_create_swimmer_invite',{p_athlete_id:String(a.id),p_minutes:15});activeUrl=new URL('swimmer-portal.html',location.href);activeUrl.searchParams.set('invite',inv.invite_token);activeUrl=activeUrl.toString();urlBox.textContent=activeUrl;urlBox.hidden=false;copy.hidden=false;qr.innerHTML='';const Q=await loadQr();new Q(qr,{text:activeUrl,width:240,height:240,correctLevel:Q.CorrectLevel?.M});setStatus(`QR ready · ${sessionDate(s)} ${sessionPart(s)} current · ${portal.history.length} past · one scan claims access · expires ${new Date(inv.expires_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`,'ok');}catch(err){qr.innerHTML='<span class="muted">QR not generated</span>';setStatus(err?.message||String(err),'error')}finally{genBtn.disabled=false}};
    copy.onclick=async()=>{if(!activeUrl)return;try{await navigator.clipboard.writeText(activeUrl);setStatus('Link copied. First person to open it claims the one-time invite.','ok')}catch{setStatus('Copy failed — use the QR code.','error')}};
    const revokeBtn=wrap.querySelector('[data-bn-revoke]');revokeBtn.onclick=async()=>{if(revokeBtn.disabled)return;revokeBtn.disabled=true;try{const n=await rpc('msos_revoke_swimmer_devices',{p_athlete_id:String(a.id)});setStatus(`${Number(n)||0} swimmer device${Number(n)===1?'':'s'} revoked.`,'ok')}catch(err){setStatus(err?.message||String(err),'error')}finally{revokeBtn.disabled=false}};
  }
  function installButton(){if((M.access?.role?.()||'owner')!=='owner')return;const a=selected(),head=document.querySelector('#athletesView .cn-owner-actions')||document.querySelector('#athletesView .perf-head .hub-actions')||document.querySelector('#athletesView .perf-head');if(!a||!head||head.querySelector('[data-bn-access]'))return;const b=document.createElement('button');b.dataset.bnAccess='1';b.className='bn-access-btn';b.textContent='Give swimmer access';b.onclick=()=>modal(a);head.append(b);}
  function install(){requestAnimationFrame(installButton);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  X.payloadFor=payloadFor;X.portalForPublish=portalForPublish;X.buildHistory=buildHistory;X.safeSession=safeSession;X.safePerformance=safePerformance;X.safeTests=safeTests;X.safeMeet=safeMeet;X.sessionsFor=sessionsFor;X.projectionForSession=projectionForSession;X.openPreview=openPreview;X.sessionActionsFor=sessionActionsFor;X.verifySessionInteractionLayer=verifySessionInteractionLayer;X.acknowledgeSessionAction=acknowledgeSessionAction;X.rpc=rpc;X.installButton=installButton;
})(globalThis);
