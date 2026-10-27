'use strict';
// MSOS assistant (10 Oct 2026). Andy: "I like the option to ask ai -- it would need to be where the question is
// asked in msos and the answer is given here, not taken away to an external page. This could be added to the
// chat feature as well. This gives the true ai within the app goal."
//
// Owner of one job: asking the msos-assistant Supabase Edge Function (supabase/functions/msos-assistant) a
// coach's question and showing the answer inside the app. The function holds Andy's methodology document and
// the AI key; this file sends only plan and session text (never swimmer data) and shows the reply. Nothing the
// assistant says changes a session by itself: a suggested session only goes into the writing box when the
// coach taps "Use this", and the normal save still applies.
//
// Used by: engines/session-methodology.js (the session writer and Edit workout call mountWriter) and
// engines/coach-chat-ui.js (the "Ask MSOS" thread calls mountThread). Conversations live in memory for this
// app session only.
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const A=M.assistant={build:'v4-msos-assistant-20261012-recent-sessions'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=v=>String(v??'').trim();
  const FN='/functions/v1/msos-assistant';
  const threads=A.threads={};
  const thread=key=>threads[key]||(threads[key]=[]);

  function sessionSource(s){if(!s)return'';const t=text(s.currentSource?.text);if(t)return t;try{return text(M.session?.serialize?.(s))}catch{return''}}
  function weekdayName(iso){const t=Date.parse(`${iso}T12:00:00Z`);return Number.isFinite(t)?new Date(t).toLocaleDateString('en-NZ',{weekday:'long',timeZone:'UTC'}):'';}
  // Plain-text context for the assistant: the session's slot, the brief, the coach's chosen focus, the app's
  // own checks, the draft, the last same-slot session and the season week. Built from the existing owners
  // (session-methodology brief/evaluate/assess, data-admin season) -- nothing recomputed here.
  A.context=({session=null}={})=>{
    const SM=M.sessionMethodology,lines=[];if(!session)return'No session is open. Answer from the methodology.';
    const id=session.identity||{};
    lines.push(`Session: ${[weekdayName(id.date),id.date,id.dayPart,id.start&&id.end?`${id.start}-${id.end}`:'',(id.squads||[]).join(' + '),id.course,id.venue].filter(Boolean).join(' · ')}`);
    try{const b=SM?.brief?.(session);if(b&&b.source!=='none'){
      if(b.coachFocus)lines.push(`Coach's chosen focus for this session: ${b.coachFocus}${b.briefSystem?` (the plan says: ${b.briefSystem})`:''}`);
      lines.push(`Plan brief (${b.source==='season'?`season plan${b.seasonName?` "${b.seasonName}"`:''}`:b.source==='standard'?'standard week':'coach'}): ${[b.sessionFocus&&`session focus ${b.sessionFocus}`,b.system&&`energy system ${b.system}`,b.technical&&`technical ${b.technical}`,b.weekFocus&&`week focus ${b.weekFocus}`,b.phase&&`phase ${b.phase}`,b.weekStroke&&`stroke of the week ${b.weekStroke}`,b.mental&&`mental ${b.mental}`].filter(Boolean).join('; ')}`);
      const chk=SM.evaluate?.(session)?.plan;if(chk?.checked)lines.push(`App plan check: ${chk.basis} is mostly ${chk.dominantSystem}; planned system ${chk.plannedSystem} = ${chk.plannedMetres}m (${chk.plannedPct}%); ${chk.matches?'on brief':'OFF brief'}. Mix: ${chk.mix.map(x=>`${x.label} ${x.pct}%`).join(', ')}`);
      const rows=SM.assess?.(session,M.state,b,chk)||[];if(rows.length)lines.push(`App session check:\n${rows.map(r=>`- ${r.ok===true?'OK':r.ok===false?'WARN':'IDEA'}: ${r.text}`).join('\n')}`);
    }else lines.push('Plan brief: none covers this session.');}catch{}
    try{const total=M.session?.total?.(session);if(total)lines.push(`Draft total: ${total}m`);}catch{}
    const src=sessionSource(session);lines.push(src?`Draft session text:\n${src}`:'Draft session text: (empty)');
    try{const last=SM?.lastSameSlot?.(id);const lt=sessionSource(last);if(lt)lines.push(`Last session in the same slot (${last.identity?.date}):\n${lt.slice(0,1800)}`);}catch{}
    // 12 Oct 2026, Andy: "the ai assisted session was too short, is that connected to a thread that will learn".
    // It learns from what the coach actually writes: his recent real sessions for these squads go with every
    // question (volume, timing, style), plus the slot length and the app's own time estimate, so a written
    // session is sized like his.
    const mins=t=>{const m=String(t||'').match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null;};
    const slot=mins(id.end)!=null&&mins(id.start)!=null?mins(id.end)-mins(id.start):null;
    const planned=s=>{try{return Math.round((M.contextEngineAV?.plannedTimeline?.(s)?.durationSeconds||0)/60)||null;}catch{return null}};
    try{const recent=A.recentSessions(session,4);if(recent.length){const totals=recent.map(r=>r.total).filter(Boolean),avg=totals.length?Math.round(totals.reduce((a,b)=>a+b,0)/totals.length/50)*50:0;
      lines.push(`The coach's own recent sessions for these squads (his real volume and style${avg?`; typical ${avg}m`:''}):\n${recent.map(r=>`--- ${r.label} · ${r.total}m${r.min?` · about ${r.min} min planned`:''}\n${r.text.slice(0,1400)}`).join('\n')}`);}}catch{}
    // 27 Oct 2026 (Andy: AI sessions "just way too short every time"): the old line told the model to fit the app's
    // planned time to the slot clock, but that estimate runs ~20% long against his real sessions (his 4,400m in a
    // 90-min slot plans at ~112 min), so it cut volume to ~2,700m. The target now comes from his own recent sessions in
    // this slot (session-methodology.js slotTarget) -- their typical metres and their planned minutes.
    if(slot){const p=planned(session);let tg=null;try{tg=M.sessionMethodology?.slotTarget?.(id,M.state)||null;}catch{}
      lines.push(`Slot length: ${slot} min${p?`; this draft is planned at about ${p} min by the app`:''}.${tg?.metres?` His recent ${String(id.dayPart||'').toUpperCase()} sessions for these squads are typically about ${tg.metres.toLocaleString()}m and the app plans them at about ${tg.minutes} min (the app's estimate runs longer than his real sessions, so do not cut a session down just because the estimate passes ${slot} min).`:''} When asked to write or extend a whole session, write a full session of about ${tg?.metres?`${Math.round(tg.metres*0.95/50)*50}–${tg.metres.toLocaleString()}m`:`${slot} min`} in his style, with every section (warm up, pre set, main set, post set, warm down) — never a short sample.`);}
    try{const season=M.dataAdminUI?.activeSeason?.();if(season){const meet=(season.meets||[])[0]||{};lines.push(`Season: ${[season.name,season.start_date&&`starts ${season.start_date}`,meet.name&&`target meet ${meet.name}${meet.date?` on ${meet.date}`:''}`,season.overarching_goal&&`phases ${season.overarching_goal}`].filter(Boolean).join(' · ')}`);}}catch{}
    return lines.join('\n\n');
  };

  A.recentSessions=(session,n=4)=>{const id=session?.identity||{},squads=new Set((id.squads||[]).map(x=>String(x).toLowerCase())),date=id.date||'9999';
    const planned=s=>{try{return Math.round((M.contextEngineAV?.plannedTimeline?.(s)?.durationSeconds||0)/60)||null;}catch{return null}};
    return Object.values(M.state?.canonicalSessions||{}).filter(s=>s&&s.id!==session.id&&s.identity?.date&&s.identity.date<date&&(s.identity.squads||[]).some(q=>squads.has(String(q).toLowerCase())))
      .map(s=>({s,text:sessionSource(s),total:(()=>{try{return M.session?.total?.(s)||0}catch{return 0}})()})).filter(x=>x.text&&x.total>=1000)
      .sort((a,b)=>String(b.s.identity.date+b.s.identity.dayPart).localeCompare(String(a.s.identity.date+a.s.identity.dayPart))).slice(0,n)
      .map(x=>({label:[weekdayName(x.s.identity.date),x.s.identity.date,x.s.identity.dayPart].filter(Boolean).join(' '),text:x.text,total:x.total,min:planned(x.s)}));};
  function fetcher(){return M.cloudSessionEngine?.fetch||M.cloud?.fetch;}
  A.available=()=>{try{return !!(M.store?.config?.()?.supabaseUrl&&(M.store?.auth?.()?.access_token||M.store?.auth?.()?.refresh_token));}catch{return false}};
  A.ask=async(question,{context='',history=[]}={})=>{
    const q=text(question);if(!q)throw new Error('Type a question first.');
    if(typeof navigator!=='undefined'&&navigator.onLine===false)throw new Error('The assistant needs internet. Your session is safe — ask again when you have signal.');
    if(!A.available())throw new Error('Sign in on the Connection screen to use the assistant.');
    const f=fetcher();if(!f)throw new Error('Cloud connection is not ready.');
    const r=await f(FN,{method:'POST',body:JSON.stringify({question:q,context,history:history.slice(-8).map(m=>({role:m.role,content:m.role==='assistant'?[m.answer,m.session_text].filter(Boolean).join('\n\n'):m.content}))})});
    if(r?.error)throw new Error(r.error);
    return{answer:text(r?.answer),session_text:text(r?.session_text),model:r?.model||''};
  };

  // One conversation component, shared by the writer and the chat thread.
  function render(box,key,opts){
    const log=box.querySelector('[data-ask-log]');if(!log)return;
    const msgs=thread(key);
    log.innerHTML=msgs.map((m,i)=>m.role==='user'?`<div class="ask-msg ask-me">${esc(m.content)}</div>`
      :m.pending?`<div class="ask-msg ask-ai ask-pending">Thinking…</div>`
      :m.error?`<div class="ask-msg ask-ai ask-error">${esc(m.error)}</div>`
      :`<div class="ask-msg ask-ai">${m.answer?`<div class="ask-text">${esc(m.answer).replace(/\n/g,'<br>')}</div>`:''}${m.session_text?`<pre class="ask-session">${esc(m.session_text)}</pre><div class="ask-actions">${opts.onUse?`<button type="button" data-ask-use="${i}" data-mode="replace">${esc(opts.useLabel||'Use this session')}</button>`:''}${opts.onAppend?`<button type="button" data-ask-use="${i}" data-mode="append">Add to the end</button>`:''}<button type="button" data-ask-copy="${i}">Copy</button></div>`:''}</div>`).join('')||`<p class="ask-empty">${esc(opts.empty||'Ask anything about this session, the brief or your programme.')}</p>`;
    log.querySelectorAll('[data-ask-use]').forEach(b=>b.onclick=()=>{const m=msgs[Number(b.dataset.askUse)];if(!m?.session_text)return;(b.dataset.mode==='append'?opts.onAppend:opts.onUse)(m.session_text);});
    log.querySelectorAll('[data-ask-copy]').forEach(b=>b.onclick=async()=>{const m=msgs[Number(b.dataset.askCopy)];try{await navigator.clipboard.writeText(m.session_text);M.toast?.('Copied');}catch{M.toast?.('Copy is not available here');}});
    log.scrollTop=log.scrollHeight;
  }
  async function send(box,key,opts,question){
    const q=text(question);if(!q)return;const msgs=thread(key);
    const history=msgs.filter(m=>!m.pending&&!m.error);
    msgs.push({role:'user',content:q});const pending={role:'assistant',pending:true};msgs.push(pending);render(box,key,opts);
    try{const r=await A.ask(q,{context:opts.getContext?.()||'',history});Object.assign(pending,{pending:false,...r});}
    catch(e){Object.assign(pending,{pending:false,error:e?.message||String(e)});}
    render(box,key,opts);
  }
  function mount(host,key,opts){
    const quick=(opts.quick||[]).map(q=>`<button type="button" data-ask-quick="${esc(q)}">${esc(q)}</button>`).join('');
    host.innerHTML=`<div class="msos-ask" data-msos-ask>${opts.title?`<div class="msos-check-title">${esc(opts.title)}</div>`:''}<div class="ask-log" data-ask-log></div>${quick?`<div class="ask-quick">${quick}</div>`:''}<form class="ask-form" data-ask-form><input type="text" data-ask-input maxlength="2000" autocomplete="off" placeholder="${esc(opts.placeholder||'Ask MSOS…')}"><button type="submit">Ask</button></form></div>`;
    const box=host.querySelector('[data-msos-ask]'),input=box.querySelector('[data-ask-input]');
    box.querySelector('[data-ask-form]').onsubmit=e=>{e.preventDefault();const q=input.value;input.value='';send(box,key,opts,q);};
    box.querySelectorAll('[data-ask-quick]').forEach(b=>b.onclick=()=>send(box,key,opts,b.dataset.askQuick));
    render(box,key,opts);return box;
  }
  A.mount=mount;

  // Session writer / Edit workout: sits under the writing box.
  A.mountWriter=(textarea,{getSession}={})=>{
    if(!textarea||!textarea.isConnected)return null;
    const label=textarea.closest('label')||textarea;let host=label.parentElement?.querySelector?.(':scope > [data-msos-ask-host]');
    if(!host){host=document.createElement('details');host.className='msos-ask-wrap';host.dataset.msosAskHost='1';label.insertAdjacentElement('afterend',host);}
    host.innerHTML='<summary>✦ Ask MSOS — AI help with this session</summary><div data-ask-body></div>';
    const key='writer';threads[key]=[];
    const set=v=>{textarea.value=v;textarea.dispatchEvent(new Event('input',{bubbles:true}));};
    mount(host.querySelector('[data-ask-body]'),key,{
      getContext:()=>A.context({session:getSession?.()}),
      quick:['Write this session for the brief','How can I improve this draft?','Make it fit the time','Explain the session check'],
      placeholder:'e.g. add a 200-pace set that fits after the main set',
      onUse:t=>{if(text(textarea.value)&&!window.confirm('Replace what is already in the box with this session?'))return;set(t);M.toast?.('Put in the box — check it, then save as normal');},
      onAppend:t=>{set(text(textarea.value)?`${textarea.value.replace(/\s+$/,'')}\n\n${t}`:t);M.toast?.('Added to the end of the box');}
    });
    return host;
  };

  // Coach chat: the "Ask MSOS" thread. Context = the session open on the Board.
  A.mountThread=host=>mount(host,'chat',{
    getContext:()=>A.context({session:M.currentSession?.()||null}),
    quick:['What should tonight’s session focus on?','Check the session that is open','Give me a race-pace main set for 90 minutes'],
    empty:'Ask MSOS about the session open on the Board, the season plan or your programme. Answers come from your methodology.',
    onUse:t=>{M.coachChatUI?.closePanel?.();Promise.resolve(M.actions?.openNewSession?.({})).then(()=>{const raw=document.querySelector('#coreRaw');if(!raw)return;if(text(raw.value)&&!window.confirm('Replace what is already in the box with this session?'))return;raw.value=t;raw.dispatchEvent(new Event('input',{bubbles:true}));}).catch(e=>M.toast?.(e?.message||'Could not open the session writer'));},
    useLabel:'Start a session with this'
  });
})(globalThis);
