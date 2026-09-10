'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M?.state)return;
  const X=M.swimmerFeedbackCU={build:'v4-swimmer-feedback-20260826a'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim(),esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??'');
  const selected=()=>{const id=M.state?.settings?.selectedAthleteId;return(M.state?.athletes||[]).find(a=>a.id===id)||null;};
  // Real coaching failure this fixes: this panel only ever asked for feedback on M.currentSession() -- whatever
  // session happens to be open on Andy's OWN device right now. Since the swimmer portal's calendar session
  // picker (engines/swimmer-training-bd.js's candidateSessionsFor) lets a swimmer submit Challenge/Edit/Finish
  // feedback against ANY of their own sessions -- not just today's -- feedback tied to a different day than
  // whatever Andy happened to have open would silently never show up here at all. This is exactly Andy's own
  // framing: feedback must "carry to his record", not be scoped to whichever session he's currently staring
  // at. Fetching with no session filter (sessionActionsFor's existing p_session_id=null path, already
  // supported server-side by msos_owner_swimmer_session_actions) returns the athlete's whole feedback record.
  function sessionLabel(sessionId){const s=M.state?.canonicalSessions?.[sessionId];if(!s)return sessionId||'Session';return [s.identity?.date,s.identity?.dayPart,s.identity?.title].filter(Boolean).join(' · ')||sessionId;}
  const isStrokeChallenge=a=>a.action_type==='challenge'&&a.payload?.kind==='stroke'&&!!text(a.payload?.proposedStroke);
  function label(a){if(a.action_type==='finish')return'Session finish';if(isStrokeChallenge(a))return'#1 stroke challenge';if(a.action_type==='challenge')return'Challenge';return'Edit request';}
  function detail(a){const p=a.payload||{};if(a.action_type==='finish')return [p.stoppedAtLabel?`Stopped at: ${p.stoppedAtLabel}`:p.completion,p.feeling,p.rpe?`RPE ${p.rpe}`:'',p.best?`Best: ${p.best}`:'',p.hardest?`Hardest: ${p.hardest}`:'',p.note].filter(Boolean).join(' · ');if(isStrokeChallenge(a))return[`${p.currentStroke||'Unset'} → ${p.proposedStroke}`,p.reason].filter(Boolean).join(' · ');if(a.action_type==='challenge')return[p.reason,p.message].filter(Boolean).join(' · ');return[p.change,p.reason].filter(Boolean).join(' · ');}
  // Real coaching failure this fixes (Andy's own voice-memo spec): a swimmer's stroke challenge needs to be
  // checked against the same evidence Andy would use poolside -- for a medley swimmer, which stroke the
  // training-volume "needs work" logic actually points at (stroke-balance.js's weighted 7-day share); for a
  // non-medley swimmer, whether the proposed stroke is genuinely their highest World Aquatics points stroke
  // (the same "#1 by points" definition performance.js already uses). This can only run here, coach-side --
  // swimmer-portal.js is a standalone static page with no access to M.performanceEngine/M.strokeBalance, and
  // per Andy's own stated principle the system must never silently decide what the coach meant, so this is
  // evidence shown to Andy to approve or override, never an auto-apply.
  function strokeChallengeContext(a){const session=M.state?.canonicalSessions?.[a.session_id];if(!session)return null;const item=M.boardEngine?.findItem?.(session,a.item_id);if(!item)return null;return{session,item};}
  // evaluateStrokeChallenge no longer computes its own evidence -- it consumes M.strokeBalance.challengeEvidence,
  // the single shared owner of "what does the evidence say" (see stroke-balance.js's own comment). This is the
  // exact same evidence engines/swimmer-invite-bn.js publishes to the swimmer's own device so a Supabase RPC can
  // give an instant answer there, and Supabase's msos_swimmer_submit_stroke_challenge applies the identical
  // approve rule server-side -- one evidence computation, one approve rule, reused in three places.
  function evaluateStrokeChallenge(ath,session,proposedStroke){
    const bal=M.strokeBalance;
    if(!bal?.challengeEvidence)return{approved:false,reason:'Stroke evidence is not available — check with Andy.'};
    const ev=bal.challengeEvidence(ath,M.state,session);
    if(!ev.hasEvidence)return{approved:false,reason:'No ranked performance evidence to check this against — check with Andy.'};
    if(ev.isMedley){
      const approved=ev.needsWorkStrokes.includes(proposedStroke),share=ev.shares[proposedStroke]||0;
      return{approved,reason:approved?`IM training-volume logic agrees: ${proposedStroke} is under-trained this week (${share}% of weighted 7-day volume).`:`IM training-volume logic: ${proposedStroke} already gets ${share}% of weighted 7-day volume — that doesn't match the "needs work" logic. Check with Andy.`};
    }
    const approved=!!ev.topStroke&&proposedStroke===ev.topStroke,proposedPoints=ev.rankedPoints[proposedStroke];
    return{approved,reason:approved?`Ranked evidence agrees: ${proposedStroke} is the highest World Aquatics points stroke.`:proposedPoints!=null?`Ranked evidence: ${ev.topStroke} (${ev.rankedPoints[ev.topStroke]} pts) outranks ${proposedStroke} (${proposedPoints} pts) — that doesn't match the #1-by-points logic. Check with Andy.`:`No ranked World Aquatics evidence for ${proposedStroke} — check with Andy.`};
  }
  // Real coaching failure this fixes: once a swimmer's own device can get an instant, evidence-approved answer
  // (msos_swimmer_submit_stroke_challenge writes the override to the cloud straight away -- see
  // supabase/20260910_swimmer_stroke_challenge_rpc.sql -- and app.js's pullSessionAdaptations reconciles it back
  // into M.state.adaptationOverrides), Andy's feedback inbox must recognise that and stop asking him to
  // re-approve something already live, or re-run evidence that may have moved on since the swimmer's device
  // checked it (which would just be confusing, not more correct -- the swimmer was told the truth AT THE TIME).
  function strokeAlreadyApplied(session,item,ath,proposedStroke){const row=(M.state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false);return!!row&&row.patch?.stroke===proposedStroke;}
  function strokeVerdictHtml(a,ath){
    if(!isStrokeChallenge(a))return'';
    const auto=a.payload?.autoVerdict;
    if(auto)return `<p class="cu-stroke-verdict ${auto.approved?'ok':'hold'}">${esc(auto.reason||'')}${auto.approved?' · applied automatically on their device.':''}</p>`;
    const ctx=strokeChallengeContext(a);if(!ctx)return'<p class="cu-stroke-verdict muted">This session or set is no longer available to check.</p>';
    const verdict=evaluateStrokeChallenge(ath,ctx.session,text(a.payload.proposedStroke));
    return `<p class="cu-stroke-verdict ${verdict.approved?'ok':'hold'}">${esc(verdict.reason)}</p>`;
  }
  function canApplyStroke(a){if(!isStrokeChallenge(a))return false;const ctx=strokeChallengeContext(a);if(!ctx)return false;const ath=selected();if(!ath)return false;return!strokeAlreadyApplied(ctx.session,ctx.item,ath,text(a.payload.proposedStroke));}
  async function applyStrokeOverride(a){
    const ctx=strokeChallengeContext(a),ath=selected();if(!ctx||!ath)return;
    const{session,item}=ctx,proposed=text(a.payload?.proposedStroke||'');if(!proposed)return;
    M.state.adaptationOverrides=M.state.adaptationOverrides||[];
    let row=M.state.adaptationOverrides.find(x=>x.sessionId===session.id&&x.itemId===item.id&&x.athleteId===ath.id&&x.active!==false);
    if(!row){row={id:M.util?.uid?.('mod')||`mod-${Date.now()}`,sessionId:session.id,itemId:item.id,athleteId:ath.id,patch:{},active:true,createdAt:new Date().toISOString()};M.state.adaptationOverrides.push(row);}
    row.active=true;row.patch={...(row.patch||{}),stroke:proposed};row.updatedAt=new Date().toISOString();
    E?.Coordinator?.clearCache?.();E?.RacePace?.invalidate?.(M.state);M.performanceEngine?.invalidate?.(M.state);M.store?.save?.(M.state);M.cloud?.stageAdaptationsForSession?.(session);
    try{await M.swimmerInviteBN?.acknowledgeSessionAction?.(a.id)}catch{}
    M.ui.renderCurrent?.();M.toast?.(`${ath.full_name||'Swimmer'} · #1 stroke set to ${proposed}`);
  }
  // Real coaching failure this fixes: "Finish session" used to just be a generic feedback form -- Andy had no
  // way to know WHICH line a swimmer actually reached, only a vague "Stopped early" label, so turning that into
  // a real training-record boundary meant re-reading the swimmer's note and re-finding the same line by hand on
  // the board. Now that the swimmer's finish action carries the session's own real item_id/block_id (the exact
  // ids engines/athlete-session-bd.js's own "End swimmer's session here" picker uses), Andy can apply it as a
  // real boundary in one tap -- the same endAtItem() the board uses, so the training record actually truncates
  // at that line instead of just having a note attached.
  function canApplyBoundary(a){return a.action_type==='finish'&&a.item_id&&M.athleteSessionBE?.endAtItem&&M.state?.canonicalSessions?.[a.session_id];}
  async function applyBoundary(a){const session=M.state.canonicalSessions[a.session_id],ath=selected();if(!session||!ath)return;M.athleteSessionBE.endAtItem(session,ath.id,a.item_id,{});try{await M.swimmerInviteBN?.acknowledgeSessionAction?.(a.id)}catch{}M.ui.renderCurrent?.();M.toast?.(`${ath.full_name||'Swimmer'} · session boundary applied`);}
  function annotatePerformance(){
    const root=document.querySelector('#athletesView');if(!root)return;
    root.querySelectorAll('.cn-event>summary').forEach(summary=>{
      const pb=summary.querySelector('strong');if(pb&&!/^PB\b/i.test(text(pb.textContent)))pb.textContent=`PB ${text(pb.textContent)}`;
      const next=summary.querySelector('[data-cn-next]');if(next&&!/pathway/i.test(text(next.textContent)))next.textContent=`Pathway · ${text(next.textContent)||'next step'}`;
    });
  }
  async function render(){
    const ath=selected(),panel=document.querySelector('#athletesView [data-cn-panel]');if(!ath||!panel||M.state?.settings?.loopAthleteTab!=='training')return;
    panel.querySelector('[data-cu-feedback]')?.remove();
    const box=document.createElement('section');box.className='page-card';box.dataset.cuFeedback='1';box.innerHTML='<div class="eyebrow">SWIMMER FEEDBACK</div><h2>Their record</h2><p class="muted">Loading swimmer edits, challenges and finish log, across every session…</p>';panel.append(box);
    const rows=await M.swimmerInviteBN?.sessionActionsFor?.(ath)||[];if(!box.isConnected)return;
    if(!rows.length){box.innerHTML='<div class="eyebrow">SWIMMER FEEDBACK</div><h2>Their record</h2><p class="muted">No swimmer edits, challenges or finish log yet, across any session.</p>';return;}
    // Pulls any evidence-approved stroke challenge (written straight to session_adaptations by the swimmer's
    // own device, possibly for a session that isn't the one currently open on Andy's Board) into
    // M.state.adaptationOverrides before rendering, so canApplyStroke/strokeAlreadyApplied below reflect the
    // truth the moment Andy actually opens this panel to look -- not just at the next full app boot.
    const strokeSessionIds=[...new Set(rows.filter(isStrokeChallenge).map(a=>a.session_id).filter(Boolean))];
    if(strokeSessionIds.length)try{await Promise.all(strokeSessionIds.map(sid=>M.cloud?.pullSessionAdaptations?.(sid)?.catch?.(()=>{})))}catch{}
    const sorted=[...rows].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))),unseen=rows.filter(a=>!a.acknowledged_at).length;
    box.innerHTML=`<div class="eyebrow">SWIMMER FEEDBACK${unseen?` · ${unseen} new`:''}</div><h2>${esc(ath.full_name)} · their record</h2><p class="muted">Across every session, most recent first.</p>${sorted.map(a=>`<article class="cu-feedback-row"><div><b>${esc(label(a))}</b><span>${esc(detail(a)||'No note')}</span>${strokeVerdictHtml(a,ath)}<small>${esc(sessionLabel(a.session_id))} · ${esc(String(a.created_at||'').replace('T',' ').slice(0,16))}${a.acknowledged_at?' · reviewed':''}</small></div><div class="cu-feedback-actions">${[canApplyBoundary(a)?`<button data-cu-apply-boundary="${esc(a.id)}">Apply as session boundary</button>`:'',canApplyStroke(a)?`<button data-cu-apply-stroke="${esc(a.id)}">Approve &amp; apply #1 stroke</button>`:'',a.acknowledged_at?'':`<button data-cu-ack="${esc(a.id)}">Mark reviewed</button>`].filter(Boolean).join('')}</div></article>`).join('')}`;
    box.querySelectorAll('[data-cu-ack]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await M.swimmerInviteBN?.acknowledgeSessionAction?.(b.dataset.cuAck);await render();}catch{b.disabled=false;}});
    box.querySelectorAll('[data-cu-apply-boundary]').forEach(b=>b.onclick=async()=>{const a=sorted.find(x=>x.id===b.dataset.cuApplyBoundary);if(!a)return;b.disabled=true;try{await applyBoundary(a);await render();}catch(e){b.disabled=false;M.toast?.(e?.message||String(e));}});
    box.querySelectorAll('[data-cu-apply-stroke]').forEach(b=>b.onclick=async()=>{const a=sorted.find(x=>x.id===b.dataset.cuApplyStroke);if(!a)return;b.disabled=true;try{await applyStrokeOverride(a);await render();}catch(e){b.disabled=false;M.toast?.(e?.message||String(e));}});
  }
  function install(){
    const athleteRoot=document.querySelector('#athletesView');
    athleteRoot?.addEventListener('click',e=>{if(e.target.closest?.('[data-cn-tab="training"]'))setTimeout(render,0);});
    if(athleteRoot){const observer=new MutationObserver(annotatePerformance);observer.observe(athleteRoot,{subtree:true,childList:true,characterData:true});annotatePerformance();}
    if(M.state?.settings?.view==='athletes'&&M.state?.settings?.loopAthleteTab==='training')setTimeout(render,0);
    const s=document.createElement('style');s.textContent='.cu-feedback-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:9px 0;border-top:1px solid #e4edf1;align-items:center}.cu-feedback-row>div{display:grid;gap:2px}.cu-feedback-row span{font-size:12px}.cu-feedback-row small{font-size:10px;color:#647a86}.cu-feedback-row button{font-size:11px}.cu-feedback-actions{display:flex;flex-direction:column;gap:4px;align-items:stretch}.cu-stroke-verdict{font-size:11px;font-weight:700;margin:2px 0;padding:5px 7px;border-radius:8px;background:#eef6f0;color:#1b6b50}.cu-stroke-verdict.hold{background:#fdf3e4;color:#8a5a12}';document.head.append(s);
  }
  if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
  X.render=render;X.annotatePerformance=annotatePerformance;X.evaluateStrokeChallenge=evaluateStrokeChallenge;X.applyStrokeOverride=applyStrokeOverride;X.canApplyStroke=canApplyStroke;X.strokeChallengeContext=strokeChallengeContext;X.strokeAlreadyApplied=strokeAlreadyApplied;
})(globalThis);
