'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines,U=M?.util;if(!M?.boardEngine||!E?.Modification||!U)return;
  const X=M.modificationEditUI={build:'v4-modification-edit-20260820ab'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim(),esc=v=>U.escape(String(v??''));
  const short=v=>text(v).replace('Freestyle','Fr').replace('Backstroke','Bk').replace('Breaststroke','Br').replace('Butterfly','Fly');
  const clock=s=>{s=Number(s)||0;if(!s)return'';const m=Math.floor(s/60),sec=Math.round((s-m*60)*100)/100;return m?`${m}:${String(sec).padStart(2,'0')}`:String(sec);};
  const sec=v=>{if(v===''||v==null)return 0;const n=U.seconds?.(v);return Number.isFinite(Number(n))?Number(n):Number(v)||0;};
  const eq=v=>String(v||'').split(/[,;]+/).map(text).filter(Boolean);
  const jsonSame=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
  function actor(){return M.teamAccess?.actor?.()||{role:'owner',name:'Owner'};}
  // Real coaching failure this fixes (Andy's own words, 10 Sept 2026 Phase 3): "For strokes specifically, I'd
  // reuse the exact 'check the evidence, approve instantly if it lines up, otherwise flag it for you' pattern
  // I just built for swimmers." Jordan (the assistant coach) now has real write access to this exact
  // individual-swimmer modification editor (session.edit was extended to the assistant caps set in Phase 1) --
  // without a gate, a coach-side stroke override he makes here would apply to the live Board instantly and
  // silently, exactly like any other field. This reuses the identical evidence computation and approve rule
  // already proven for the swimmer's own stroke challenge (engines/stroke-balance.js's challengeEvidence, via
  // engines/swimmer-feedback-cu.js's evaluateStrokeChallenge) -- one evidence computation, one approve rule,
  // now reused a fourth place rather than re-derived here. Andy's own edits are never gated by this -- see
  // resolveStrokeGate below, which short-circuits immediately for any non-assistant actor.
  function evaluateStroke(ath,session,proposedStroke){
    const fn=M.swimmerFeedbackCU?.evaluateStrokeChallenge;
    if(!fn)return{approved:false,reason:'Stroke evidence is not available — check with Andy.'};
    return fn(ath,session,proposedStroke);
  }
  // Decides what stroke (if any) actually gets written into the applied override patch, and what -- if
  // anything -- gets held back as a pending proposal for Andy. Owner edits, and any save that isn't actually
  // proposing a NEW stroke (unchanged from whatever this row already carries -- including a stroke Andy
  // himself set, or one Jordan already had approved earlier), apply immediately exactly as before this gate
  // existed: `priorStroke` is compared, not just the automatic baseline, so re-saving other fields (reps,
  // rest, equipment) on a line that already carries an approved override never re-triggers a check or drops
  // the existing approved stroke. Only a genuinely new assistant-proposed stroke is evidence-checked; if it
  // isn't approved, the row keeps whatever stroke it already had (never silently applied, never silently
  // reverted to automatic out from under an existing approved override).
  function resolveStrokeGate(who,ath,session,resolvedStroke,priorStroke){
    if(who.role!=='assistant'||resolvedStroke===priorStroke)return{stroke:resolvedStroke,pending:null};
    const verdict=evaluateStroke(ath,session,resolvedStroke);
    if(verdict.approved)return{stroke:resolvedStroke,pending:null,verdict};
    return{stroke:priorStroke||null,pending:{stroke:resolvedStroke,reason:verdict.reason,proposedBy:who,proposedAt:new Date().toISOString()},verdict};
  }
  // Phase 5 (10 Sept 2026, "add alerts, not just a view"): the one place a stroke proposal resolveStrokeGate
  // held back for Andy actually reaches him off the Board itself -- before this, the only way he'd know was
  // reopening this exact swimmer's editor or noticing the small red ⚑ on the Board. Fire-and-forget on
  // purpose: a coach-side save must never wait on, or fail because of, a notification round trip.
  // engines/push-alerts.js's sendCoachAlert already swallows its own network/permission errors and returns
  // null when cloud/push isn't configured on this device; the try/catch here is only for the case
  // push-alerts.js itself isn't loaded (M.pushAlerts undefined) or throws synchronously building the call.
  function notifyPendingStroke(session,ath,pending){
    try{
      M.pushAlerts?.sendCoachAlert?.({
        sessionId:session.id,
        athleteId:ath.id,
        kind:'stroke_proposal',
        title:`${ath.full_name} · stroke change flagged`,
        body:`${pending.proposedBy?.name||'Assistant coach'} proposed ${pending.stroke} — ${pending.reason}`,
      })?.catch?.(()=>{});
    }catch{/* best-effort, never blocks the save */}
  }
  function current(){return M.currentSession?.()||null;}
  function athlete(id){return(M.state?.athletes||[]).find(a=>a.id===id)||null;}
  function item(session,id){return M.boardEngine?.findItem?.(session,id)||null;}
  function override(session,item,ath){return(M.state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;}
  function automatic(session,item,ath){const filtered=(M.state?.adaptationOverrides||[]).filter(x=>!(x.sessionId===session.id&&x.itemId===item.id&&x.athleteId===ath.id&&x.active!==false)),state={...M.state,adaptationOverrides:filtered};return E.Modification.adaptItem(item,ath,state,session);}
  function close(){const h=document.querySelector('#modalHost');if(h)h.innerHTML='';}
  function invalidate(){E.Coordinator?.clearCache?.();E.RacePace?.invalidate?.(M.state);M.performanceEngine?.invalidate?.(M.state);}
  function persist(session,y){invalidate();M.store?.save?.(M.state);M.cloud?.stageAdaptationsForSession?.(session);M.ui?.renderBoard?.();requestAnimationFrame(()=>window.scrollTo(0,y));}
  function upsert(session,item,ath,patch,pendingStroke){M.state.adaptationOverrides=M.state.adaptationOverrides||[];let row=override(session,item,ath);const hasPatch=!!Object.keys(patch).length,hasPending=!!pendingStroke;if(!hasPatch&&!hasPending){if(row){row.active=false;row.updatedAt=new Date().toISOString();row.pendingStrokeProposal=null;}return null;}if(!row){row={id:U.uid?.('mod')||`mod-${Date.now()}`,sessionId:session.id,itemId:item.id,athleteId:ath.id,patch:{},active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};M.state.adaptationOverrides.push(row);}row.active=true;row.patch=patch;delete row.raw;row.updatedAt=new Date().toISOString();row.pendingStrokeProposal=pendingStroke||null;return row;}
  function formValue(id){return document.querySelector(`#${id}`)?.value??'';}
  function save(session,item,ath,auto,y){const existingRow=override(session,item,ath),reps=Math.max(1,Math.round(Number(formValue('modEditReps'))||1)),distance=Math.max(0,Number(formValue('modEditDistance'))||0),stroke=formValue('modEditStroke'),cycle=Math.max(0,sec(formValue('modEditCycle'))),rest=Math.max(0,sec(formValue('modEditRest'))),equipment=eq(formValue('modEditEquipment')),cues=String(formValue('modEditCues')||'').split(/\n+/).map(text).filter(Boolean),patch={};
    if(reps!==Math.max(1,Number(auto.reps)||1))patch.reps=reps;
    if(distance!==Number(auto.distance||0))patch.distance=distance;
    const resolvedStroke=stroke==='AUTO'?E.Evidence.stroke(auto.stroke||''):E.Evidence.stroke(stroke||''),autoStroke=E.Evidence.stroke(auto.stroke||'');let pending=null;
    if(resolvedStroke!==autoStroke){const gate=resolveStrokeGate(actor(),ath,session,resolvedStroke,existingRow?.patch?.stroke??null);if(gate.stroke)patch.stroke=gate.stroke;pending=gate.pending;}
    if(Math.abs(cycle-Number(auto.cycleSeconds||0))>.001)patch.cycleSeconds=cycle;
    if(Math.abs(rest-Number(auto.restSeconds||0))>.001)patch.restSeconds=rest;
    if(!jsonSame(equipment,auto.equipment||[]))patch.equipment=equipment;
    if(!jsonSame(cues,auto.cues||[]))patch.cues=cues;
    upsert(session,item,ath,patch,pending);if(pending)notifyPendingStroke(session,ath,pending);close();persist(session,y);
    M.toast?.(pending?`${ath.full_name} modification updated · stroke change flagged for Andy (${pending.reason})`:Object.keys(patch).length?`${ath.full_name} modification updated`:`${ath.full_name} back to automatic`);
  }
  function reset(session,item,ath,y){const row=override(session,item,ath);if(row){row.active=false;row.updatedAt=new Date().toISOString();}close();persist(session,y);M.toast?.(`${ath.full_name} back to automatic modification`);}
  // Owner-only (see the data-mod-pending-approve/-dismiss gating in open() below): resolves a stroke change
  // Jordan proposed that didn't line up with the evidence. Approve applies exactly the stroke he proposed --
  // Andy is the one questioning it, per Andy's own "a little bit of questioning around that", not the system
  // silently deciding either way. Dismiss leaves the row exactly as it was before the proposal (whatever
  // stroke -- automatic or a prior approved override -- was already in effect keeps applying).
  function approvePending(session,item,ath,y){const row=override(session,item,ath),p=row?.pendingStrokeProposal;if(!row||!p)return;row.patch={...row.patch,stroke:p.stroke};row.pendingStrokeProposal=null;row.updatedAt=new Date().toISOString();close();persist(session,y);M.toast?.(`${ath.full_name} · ${p.stroke} approved`);}
  function dismissPending(session,item,ath,y){const row=override(session,item,ath);if(!row?.pendingStrokeProposal)return;row.pendingStrokeProposal=null;row.updatedAt=new Date().toISOString();close();persist(session,y);M.toast?.(`${ath.full_name} · flagged stroke change dismissed`);}
  function open(itemId,athId){const session=current(),ath=athlete(athId),it=item(session,itemId);if(!session||!ath||!it)return;const auto=automatic(session,it,ath),actual=E.Modification.adaptItem(it,ath,M.state,session),row=override(session,it,ath),y=window.scrollY||0,host=document.querySelector('#modalHost');if(!host)return;const stroke=E.Evidence.stroke(actual.stroke||auto.stroke||'Choice')||'Choice',options=[['AUTO',`Automatic (${short(E.Evidence.stroke(auto.stroke||'Choice')||'Choice')})`],['Freestyle','Freestyle'],['Backstroke','Backstroke'],['Breaststroke','Breaststroke'],['Butterfly','Butterfly'],['IM','IM'],['Choice','Choice']];
    // A pending stroke proposal (Jordan proposed a stroke that didn't match the evidence) is only ever
    // resolvable by the owner -- Jordan can see it's flagged (the context note below shows it to whoever
    // opens this modal), but only Andy gets Approve/Dismiss, matching "flag it for you", never self-approval.
    const pending=row?.pendingStrokeProposal||null,canResolvePending=pending&&actor().role==='owner';
    const pendingNote=pending?`<div class="context-note msos-pending-stroke"><b>⚑ Flagged stroke change:</b> ${esc(pending.proposedBy?.name||'Assistant coach')} proposed <b>${esc(pending.stroke)}</b> — ${esc(pending.reason)}${canResolvePending?'':' Only Andy can approve or dismiss this.'}</div>`:'';
    host.innerHTML=`<div class="modal-backdrop" data-mod-edit-close><section class="modal msos-mod-editor" role="dialog" aria-modal="true"><header><div><small>MODIFIED SWIMMER · LIVE BOARD</small><h2>${esc(ath.full_name)}</h2></div><button type="button" data-mod-edit-close aria-label="Close">×</button></header><div class="modal-body">${pendingNote}<div class="context-note"><b>Squad set:</b> ${esc(M.boardEngine.workLabel?.(it)||it.raw||'')}<br><b>Automatic adaptation:</b> ${esc(M.boardEngine.workLabel?.(auto)||auto.raw||'')}${row?'<br><b>Coach override active.</b> Saving below replaces the structured override for this line.':''}</div><div class="msos-mod-form"><label>Reps<input id="modEditReps" type="number" min="1" step="1" value="${esc(actual.reps||1)}"></label><label>Distance<input id="modEditDistance" type="number" min="0" step="12.5" value="${esc(actual.distance||0)}"></label><label>Stroke<select id="modEditStroke">${options.map(([v,l])=>`<option value="${esc(v)}" ${v===stroke?'selected':''}>${esc(l)}</option>`).join('')}</select></label><label>Cycle / send-off<input id="modEditCycle" inputmode="numeric" placeholder="1:40" value="${esc(clock(actual.cycleSeconds))}"></label><label>Rest<input id="modEditRest" inputmode="numeric" placeholder="0:10" value="${esc(clock(actual.restSeconds))}"></label><label>Equipment<input id="modEditEquipment" value="${esc((actual.equipment||[]).join(', '))}"></label></div><label>Cues / breakdown<textarea id="modEditCues">${esc((actual.cues||[]).join('\n'))}</textarea></label><p class="muted">This is a swimmer-specific prescription override for this set only. It changes the Board immediately and target calculations are rebuilt from the edited prescription.</p></div><footer>${canResolvePending?`<button type="button" class="danger" data-mod-pending-dismiss>Dismiss flagged change</button><button type="button" class="primary" data-mod-pending-approve>Approve ${esc(pending.stroke)}</button>`:''}<button type="button" class="danger" data-mod-edit-auto>Use automatic</button><button type="button" data-mod-edit-cancel>Cancel</button><button type="button" class="primary" data-mod-edit-save>Save modification</button></footer></section></div>`;
    const backdrop=host.querySelector('.modal-backdrop');host.querySelectorAll('[data-mod-edit-close],[data-mod-edit-cancel]').forEach(b=>b.addEventListener('click',e=>{if(e.target===b||b.hasAttribute('data-mod-edit-cancel'))close();}));backdrop?.addEventListener('click',e=>{if(e.target===backdrop)close();});host.querySelector('[data-mod-edit-save]')?.addEventListener('click',()=>save(session,it,ath,auto,y));host.querySelector('[data-mod-edit-auto]')?.addEventListener('click',()=>reset(session,it,ath,y));host.querySelector('[data-mod-pending-approve]')?.addEventListener('click',()=>approvePending(session,it,ath,y));host.querySelector('[data-mod-pending-dismiss]')?.addEventListener('click',()=>dismissPending(session,it,ath,y));
  }
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-msos-mod-edit]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();const [itemId,athId]=String(b.dataset.msosModEdit||'').split(':');open(itemId,athId);},true);
  X.open=open;X.automatic=automatic;X.reset=reset;X.resolveStrokeGate=resolveStrokeGate;X.approvePending=approvePending;X.dismissPending=dismissPending;X.notifyPendingStroke=notifyPendingStroke;
})(globalThis);
