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
  function current(){return M.currentSession?.()||null;}
  function athlete(id){return(M.state?.athletes||[]).find(a=>a.id===id)||null;}
  function item(session,id){return M.boardEngine?.findItem?.(session,id)||null;}
  function override(session,item,ath){return(M.state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;}
  function automatic(session,item,ath){const filtered=(M.state?.adaptationOverrides||[]).filter(x=>!(x.sessionId===session.id&&x.itemId===item.id&&x.athleteId===ath.id&&x.active!==false)),state={...M.state,adaptationOverrides:filtered};return E.Modification.adaptItem(item,ath,state,session);}
  function close(){const h=document.querySelector('#modalHost');if(h)h.innerHTML='';}
  function invalidate(){E.Coordinator?.clearCache?.();E.RacePace?.invalidate?.(M.state);M.performanceEngine?.invalidate?.(M.state);}
  function persist(session,y){invalidate();M.store?.save?.(M.state);M.cloud?.stageAdaptationsForSession?.(session);M.ui?.renderBoard?.();requestAnimationFrame(()=>window.scrollTo(0,y));}
  function upsert(session,item,ath,patch){M.state.adaptationOverrides=M.state.adaptationOverrides||[];let row=override(session,item,ath);if(!Object.keys(patch).length){if(row){row.active=false;row.updatedAt=new Date().toISOString();}return null;}if(!row){row={id:U.uid?.('mod')||`mod-${Date.now()}`,sessionId:session.id,itemId:item.id,athleteId:ath.id,patch:{},active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};M.state.adaptationOverrides.push(row);}row.active=true;row.patch=patch;delete row.raw;row.updatedAt=new Date().toISOString();return row;}
  function formValue(id){return document.querySelector(`#${id}`)?.value??'';}
  function save(session,item,ath,auto,y){const reps=Math.max(1,Math.round(Number(formValue('modEditReps'))||1)),distance=Math.max(0,Number(formValue('modEditDistance'))||0),stroke=formValue('modEditStroke'),cycle=Math.max(0,sec(formValue('modEditCycle'))),rest=Math.max(0,sec(formValue('modEditRest'))),equipment=eq(formValue('modEditEquipment')),cues=String(formValue('modEditCues')||'').split(/\n+/).map(text).filter(Boolean),patch={};
    if(reps!==Math.max(1,Number(auto.reps)||1))patch.reps=reps;
    if(distance!==Number(auto.distance||0))patch.distance=distance;
    const resolvedStroke=stroke==='AUTO'?E.Evidence.stroke(auto.stroke||''):E.Evidence.stroke(stroke||'');if(resolvedStroke!==E.Evidence.stroke(auto.stroke||''))patch.stroke=resolvedStroke;
    if(Math.abs(cycle-Number(auto.cycleSeconds||0))>.001)patch.cycleSeconds=cycle;
    if(Math.abs(rest-Number(auto.restSeconds||0))>.001)patch.restSeconds=rest;
    if(!jsonSame(equipment,auto.equipment||[]))patch.equipment=equipment;
    if(!jsonSame(cues,auto.cues||[]))patch.cues=cues;
    upsert(session,item,ath,patch);close();persist(session,y);M.toast?.(Object.keys(patch).length?`${ath.full_name} modification updated`:`${ath.full_name} back to automatic`);
  }
  function reset(session,item,ath,y){const row=override(session,item,ath);if(row){row.active=false;row.updatedAt=new Date().toISOString();}close();persist(session,y);M.toast?.(`${ath.full_name} back to automatic modification`);}
  function open(itemId,athId){const session=current(),ath=athlete(athId),it=item(session,itemId);if(!session||!ath||!it)return;const auto=automatic(session,it,ath),actual=E.Modification.adaptItem(it,ath,M.state,session),row=override(session,it,ath),y=window.scrollY||0,host=document.querySelector('#modalHost');if(!host)return;const stroke=E.Evidence.stroke(actual.stroke||auto.stroke||'Choice')||'Choice',options=[['AUTO',`Automatic (${short(E.Evidence.stroke(auto.stroke||'Choice')||'Choice')})`],['Freestyle','Freestyle'],['Backstroke','Backstroke'],['Breaststroke','Breaststroke'],['Butterfly','Butterfly'],['IM','IM'],['Choice','Choice']];
    host.innerHTML=`<div class="modal-backdrop" data-mod-edit-close><section class="modal msos-mod-editor" role="dialog" aria-modal="true"><header><div><small>MODIFIED SWIMMER · LIVE BOARD</small><h2>${esc(ath.full_name)}</h2></div><button type="button" data-mod-edit-close aria-label="Close">×</button></header><div class="modal-body"><div class="context-note"><b>Squad set:</b> ${esc(M.boardEngine.workLabel?.(it)||it.raw||'')}<br><b>Automatic adaptation:</b> ${esc(M.boardEngine.workLabel?.(auto)||auto.raw||'')}${row?'<br><b>Coach override active.</b> Saving below replaces the structured override for this line.':''}</div><div class="msos-mod-form"><label>Reps<input id="modEditReps" type="number" min="1" step="1" value="${esc(actual.reps||1)}"></label><label>Distance<input id="modEditDistance" type="number" min="0" step="12.5" value="${esc(actual.distance||0)}"></label><label>Stroke<select id="modEditStroke">${options.map(([v,l])=>`<option value="${esc(v)}" ${v===stroke?'selected':''}>${esc(l)}</option>`).join('')}</select></label><label>Cycle / send-off<input id="modEditCycle" inputmode="numeric" placeholder="1:40" value="${esc(clock(actual.cycleSeconds))}"></label><label>Rest<input id="modEditRest" inputmode="numeric" placeholder="0:10" value="${esc(clock(actual.restSeconds))}"></label><label>Equipment<input id="modEditEquipment" value="${esc((actual.equipment||[]).join(', '))}"></label></div><label>Cues / breakdown<textarea id="modEditCues">${esc((actual.cues||[]).join('\n'))}</textarea></label><p class="muted">This is a swimmer-specific prescription override for this set only. It changes the Board immediately and target calculations are rebuilt from the edited prescription.</p></div><footer><button type="button" class="danger" data-mod-edit-auto>Use automatic</button><button type="button" data-mod-edit-cancel>Cancel</button><button type="button" class="primary" data-mod-edit-save>Save modification</button></footer></section></div>`;
    const backdrop=host.querySelector('.modal-backdrop');host.querySelectorAll('[data-mod-edit-close],[data-mod-edit-cancel]').forEach(b=>b.addEventListener('click',e=>{if(e.target===b||b.hasAttribute('data-mod-edit-cancel'))close();}));backdrop?.addEventListener('click',e=>{if(e.target===backdrop)close();});host.querySelector('[data-mod-edit-save]')?.addEventListener('click',()=>save(session,it,ath,auto,y));host.querySelector('[data-mod-edit-auto]')?.addEventListener('click',()=>reset(session,it,ath,y));
  }
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-msos-mod-edit]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();const [itemId,athId]=String(b.dataset.msosModEdit||'').split(':');open(itemId,athId);},true);
  X.open=open;X.automatic=automatic;X.reset=reset;
})(globalThis);
