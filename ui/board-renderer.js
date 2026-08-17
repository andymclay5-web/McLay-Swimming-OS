'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSUI=root.MSOSUI||{};root.MSOSUI.BoardRenderer=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attr=v=>esc(text(v));
  function fmtSeconds(value){const n=Number(value);if(!Number.isFinite(n))return'';const m=Math.floor(n/60),s=n-m*60;return m?`${m}:${s.toFixed(s%1?1:0).padStart(s%1?4:2,'0')}`:s.toFixed(s%1?1:0)}
  function fmtDistance(v){const n=Number(v);return Number.isFinite(n)?`${n.toLocaleString('en-NZ')}m`:''}
  function actionAttrs(context={}){return`data-session-id="${attr(context.sessionId)}" data-block-id="${attr(context.blockId)}" data-item-id="${attr(context.itemId||context.setId||context.cueId)}"`}
  function actionButton(action,label,context,cls=''){return`<button type="button" class="msos-board-action ${cls}" data-board-action="${attr(action)}" ${actionAttrs(context)}>${esc(label)}</button>`}

  function workLabel(w={}){
    if(text(w.raw))return text(w.raw);
    const reps=Math.max(1,Number(w.reps)||1),distance=Number(w.distance)||0,parts=[];
    if(distance)parts.push(reps>1?`${reps} × ${distance}`:`${distance}`);
    if(text(w.stroke))parts.push(text(w.stroke));if(text(w.zone))parts.push(text(w.zone));
    return parts.join(' · ')||'Work';
  }
  function workMeta(w={}){
    const parts=[];
    if(Number.isFinite(Number(w.cycleSeconds)))parts.push(`@ ${fmtSeconds(w.cycleSeconds)}`);
    else if(Array.isArray(w.cycleOptions)&&w.cycleOptions.length)parts.push(`@ ${w.cycleOptions.map(fmtSeconds).filter(Boolean).join(' / ')}`);
    if(Number.isFinite(Number(w.restSeconds)))parts.push(`${Number(w.restSeconds)}s rest`);
    if(Array.isArray(w.equipment)&&w.equipment.length)parts.push(w.equipment.join(' + '));
    return parts.join(' · ');
  }
  function detailRows(w={}){
    const rows=[];
    if((w.composition||[]).length){const repeat=Number(w.compositionRepeats)>1?` × ${w.compositionRepeats}`:'';rows.push(`<div class="msos-work-detail"><span class="msos-detail-label">MAKEUP${esc(repeat)}</span>${(w.composition||[]).map(x=>`<span>${esc(`${x.distance} ${text(x.text||x.raw)}`)}</span>`).join('')}</div>`)}
    if((w.pattern||[]).length)rows.push(`<div class="msos-work-detail"><span class="msos-detail-label">PATTERN</span>${(w.pattern||[]).map(x=>`<span>${esc(`${x.count} ${text(x.text)}`)}</span>`).join('')}</div>`);
    if((w.repInstructions||[]).length){const meaningful=(w.repInstructions||[]).filter(x=>text(x.label));if(meaningful.length)rows.push(`<div class="msos-work-detail"><span class="msos-detail-label">REPS</span>${meaningful.map(x=>`<span>#${esc(x.rep)} ${esc(x.label)}</span>`).join('')}</div>`)}
    if((w.cues||[]).length)rows.push(`<div class="msos-work-detail msos-cues"><span class="msos-detail-label">CUE</span>${(w.cues||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div>`);
    return rows.join('');
  }
  function targetText(t={}){
    if(t.status==='ok'){const bits=[fmtSeconds(t.seconds),t.sendOff!=null?`@ ${fmtSeconds(t.sendOff)}`:'',text(t.source)].filter(Boolean);return bits.join(' · ')}
    if(t.status==='missing'||t.status==='error')return text(t.message)||'Target unavailable';
    return text(t.message||t.reason);
  }
  function renderTarget(t={}){
    if(t.status==='pattern'||t.status==='rep_race'){
      return`<div class="msos-target-row ${t.status==='rep_race'?'is-race':''}"><strong>${esc(t.label||t.athleteName)}</strong><div class="msos-target-pattern">${(t.rows||[]).map(r=>`<span>#${esc(r.rep)} ${esc(r.zone||r.label)} · ${esc(r.status==='ok'?fmtSeconds(r.seconds):text(r.message)||'—')}${r.sendOff!=null?` @ ${esc(fmtSeconds(r.sendOff))}`:''}</span>`).join('')}</div></div>`;
    }
    return`<div class="msos-target-row ${t.status==='missing'||t.status==='error'?'is-missing':''}"><strong>${esc(t.label||t.athleteName)}</strong><span>${esc(targetText(t))}</span></div>`;
  }
  function renderTargets(targets=[]){return targets.length?`<div class="msos-targets">${targets.map(renderTarget).join('')}</div>`:''}
  function renderModification(m={}){
    const meta=workMeta(m.work),target=m.target&&m.target.status!=='none'?`<div class="msos-mod-target">${esc(targetText(m.target))}</div>`:'';
    return`<div class="msos-mod-card ${m.status==='error'?'is-error':''}" data-athlete-id="${attr(m.athleteId)}"><div class="msos-mod-head"><strong>${esc(m.label||m.athleteName)}</strong><span>${esc(m.attendanceStatus)}</span></div><div class="msos-mod-work">${esc(workLabel(m.work))}</div>${meta?`<div class="msos-work-meta">${esc(meta)}</div>`:''}${text(m.reason)?`<div class="msos-mod-reason">${esc(m.reason)}</div>`:''}${target}</div>`;
  }
  function renderCaptures(captures={},context={}){
    if(!Number(captures.count))return'';
    const bits=Object.entries(captures.byType||{}).map(([k,n])=>`${n} ${k}`).join(' · ');
    return`<button type="button" class="msos-capture-marker" data-board-action="evidence" ${actionAttrs(context)}>${esc(bits||`${captures.count} capture${captures.count===1?'':'s'}`)}</button>`;
  }
  function renderPhase(phase={}){
    const meta=workMeta(phase.work);
    return`<div class="msos-phase" data-phase-index="${attr(phase.index)}"><div><strong>${esc(`Phase ${phase.index}`)}</strong> ${esc(workLabel(phase.work))}</div>${meta?`<div class="msos-work-meta">${esc(meta)}</div>`:''}${detailRows(phase.work)}${renderTargets(phase.targets||[])}</div>`;
  }
  function renderSet(set={}){
    const w=set.groupWork||{},meta=workMeta(w),mods=set.modifications||[],context=set.context||{};
    return`<article class="msos-set-row" data-set-id="${attr(set.id)}" ${actionAttrs(context)}><div class="msos-set-main"><div class="msos-set-top"><div class="msos-set-title">${esc(workLabel(w))}</div><div class="msos-set-actions">${actionButton('edit','Edit',context)}${actionButton('note','Note',context)}</div></div>${meta?`<div class="msos-work-meta">${esc(meta)}</div>`:''}${detailRows(w)}${(set.phases||[]).length?`<div class="msos-phases">${set.phases.map(renderPhase).join('')}</div>`:''}${renderTargets(set.targets||[])}${renderCaptures(set.captures,context)}</div>${mods.length?`<aside class="msos-mod-rail">${mods.map(renderModification).join('')}</aside>`:''}</article>`;
  }
  function renderCue(cue={}){return`<div class="msos-board-cue ${cue.role==='summary'?'is-summary':''}" ${actionAttrs(cue.context||{})}><span>${esc(cue.text)}</span>${cue.summaryMetres!=null?`<strong>${esc(fmtDistance(cue.summaryMetres))}</strong>`:''}${renderCaptures(cue.captures,cue.context||{})}</div>`}
  function renderGroup(group={}){
    const title=group.scope==='authored_round'&&group.roundNumber?`ROUND ${group.roundNumber}`:group.rounds>1?`${group.rounds} ROUNDS`:text(group.label)||'GROUP';
    return`<section class="msos-round-group" data-group-id="${attr(group.id)}" data-group-scope="${attr(group.scope)}"><header><strong>${esc(title)}</strong><span>${esc(fmtDistance(group.distance))}</span></header><div class="msos-group-items">${(group.items||[]).map(renderNode).join('')}</div></section>`;
  }
  function renderNode(node={}){if(node.kind==='group')return renderGroup(node);if(node.kind==='cue')return renderCue(node);return renderSet(node)}
  function renderBlock(block={}){
    const context=block.context||{};
    return`<section class="msos-board-block" data-block-id="${attr(block.id)}"><header class="msos-block-head"><div><h2>${esc(block.title)}</h2><span>${esc(fmtDistance(block.distance))}</span></div><div class="msos-block-actions">${actionButton('capture','Capture',context)}${actionButton('edit-block','Edit block',context)}</div></header>${renderCaptures(block.captures,context)}<div class="msos-block-items">${(block.items||[]).map(renderNode).join('')}</div></section>`;
  }
  function renderAttendance(a={}){return`<div class="msos-board-attendance"><strong>${esc(`${Number(a.here)||0} here`)}</strong>${(a.athletes||[]).map(x=>`<span class="msos-athlete-chip status-${attr(x.status)}" data-athlete-id="${attr(x.id)}">${esc(x.label)}<small>${esc(x.status)}</small></span>`).join('')}</div>`}
  function renderBoard(model={}){
    if(model.schema!=='msos.board.v2')throw new Error('Board Renderer requires msos.board.v2 projection');
    const i=model.identity||{},sessionContext={sessionId:model.sessionId,blockId:'',itemId:''},warning=model.validation?.totalMatches===false?`<div class="msos-board-warning">${esc((model.validation.warnings||[]).join(' · ')||'Session total needs checking')}</div>`:'';
    return`<main class="msos-board" data-session-id="${attr(model.sessionId)}"><header class="msos-board-hero"><div><span class="msos-board-kicker">${esc([i.date,i.dayPart].filter(Boolean).join(' · '))}</span><h1>${esc(i.title||'Session Board')}</h1><p>${esc([...(i.squads||[]),i.venue,i.course].filter(Boolean).join(' · '))}</p></div><strong class="msos-board-total">${esc(fmtDistance(model.totalDistance))}</strong></header><nav class="msos-board-sticky-actions" aria-label="Poolside actions">${actionButton('roll','Roll',sessionContext)}${actionButton('capture','Capture',sessionContext)}${actionButton('voice','Voice',sessionContext)}${actionButton('photo','Photo',sessionContext)}${actionButton('video','Video',sessionContext)}${actionButton('finish','Finish',sessionContext,'is-primary')}</nav>${warning}${renderAttendance(model.attendance||{})}<div class="msos-board-blocks">${(model.blocks||[]).map(renderBlock).join('')}</div></main>`;
  }
  return{VERSION,renderBoard,renderBlock,renderNode,renderSet,renderGroup,workLabel,workMeta,fmtSeconds,fmtDistance,esc};
});
