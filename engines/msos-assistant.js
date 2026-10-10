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
  const A=M.assistant={build:'v4-msos-assistant-20261010'};
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
    try{const season=M.dataAdminUI?.activeSeason?.();if(season){const meet=(season.meets||[])[0]||{};lines.push(`Season: ${[season.name,season.start_date&&`starts ${season.start_date}`,meet.name&&`target meet ${meet.name}${meet.date?` on ${meet.date}`:''}`,season.overarching_goal&&`phases ${season.overarching_goal}`].filter(Boolean).join(' · ')}`);}}catch{}
    return lines.join('\n\n');
  };

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
