'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSUI=root.MSOSUI||{};root.MSOSUI.BoardRenderer=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.4.0';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attr=v=>esc(text(v));
  function fmtSeconds(value){const n=Number(value);if(!Number.isFinite(n))return'';const m=Math.floor(n/60),s=n-m*60;return m?`${m}:${s.toFixed(s%1?1:0).padStart(s%1?4:2,'0')}`:s.toFixed(s%1?1:0)}
  function fmtDistance(v){const n=Number(v);return Number.isFinite(n)?`${n.toLocaleString('en-NZ')}m`:''}
  function actionAttrs(context={}){const athlete=context.athleteId?` data-athlete-id="${attr(context.athleteId)}"`:'';return`data-session-id="${attr(context.sessionId)}" data-block-id="${attr(context.blockId)}" data-item-id="${attr(context.itemId||context.setId||context.cueId)}"${athlete}`}
  function actionButton(action,label,context,cls=''){return`<button type="button" class="msos-board-action ${cls}" data-board-action="${attr(action)}" ${actionAttrs(context)}>${esc(label)}</button>`}
  const blockAnchor=block=>`msos-board-block-${String(block?.id||'').replace(/[^A-Za-z0-9_-]/g,'-')}`;

  function nameParts(value){const parts=text(value).split(/\s+/).filter(Boolean);return{first:parts[0]||'',last:parts.length>1?parts.at(-1):'',full:parts.join(' ')}}
  function compactNames(athletes=[]){
    const rows=(athletes||[]).map(a=>({id:a.id,name:text(a.name||a.full_name),...nameParts(a.name||a.full_name)})),out=new Map(),groups=new Map();
    for(const row of rows){const key=(row.first||row.name||row.id||'').toLowerCase();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
    for(const list of groups.values()){
      if(list.length===1){const row=list[0];out.set(row.id,row.first||row.name||text(row.id));continue}
      const unresolved=new Set(list.map(r=>r.id)),maxSurname=Math.max(...list.map(r=>r.last.length),1);
      for(let width=1;width<=maxSurname&&unresolved.size;width++){
        const buckets=new Map();
        for(const row of list.filter(r=>unresolved.has(r.id))){const suffix=row.last?row.last.slice(0,width):text(row.id).slice(0,width),label=`${row.first||row.name} ${suffix}`.trim(),key=label.toLowerCase();if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({row,label})}
        for(const bucket of buckets.values())if(bucket.length===1){out.set(bucket[0].row.id,bucket[0].label);unresolved.delete(bucket[0].row.id)}
      }
      for(const row of list.filter(r=>unresolved.has(r.id))){const base=row.full||row.name||row.first||'Swimmer';out.set(row.id,`${base} ${text(row.id).slice(-3)}`.trim())}
    }
    return out;
  }
  function applyDisplayNames(model={}){
    const view=clone(model),athletes=view.attendance?.athletes||[],names=compactNames(athletes);
    for(const athlete of athletes)athlete.label=names.get(athlete.id)||athlete.name||athlete.label;
    const labelRows=rows=>{for(const row of rows||[])if(row?.athleteId)row.label=names.get(row.athleteId)||row.athleteName||row.label};
    const walk=nodes=>{for(const node of nodes||[]){if(node?.kind==='group'){walk(node.items);continue}if(node?.kind!=='set')continue;labelRows(node.targets);labelRows(node.modifications);for(const phase of node.phases||[])labelRows(phase.targets)}};
    for(const block of view.blocks||[])walk(block.items);
    return view;
  }

  function canonicalRaw(w={}){
    const raw=text(w.raw);if(!raw)return'';
    const reps=Math.max(1,Number(w.reps)||1),distance=Number(w.distance)||0;
    let m=raw.match(/^(\d{1,3})\s*[x×✕]\s*(\d{1,4}(?:\.5)?)(?:\s*m\b)?\s*(.*)$/i);
    if(m){const rr=Number(m[1]),dd=Number(m[2]);if(rr===reps&&dd===distance)return raw;return`${reps} × ${distance}${text(m[3])?` ${text(m[3])}`:''}`}
    m=raw.match(/^(\d{1,4}(?:\.5)?)(?:\s*m\b)?\s+(.+)$/i);
    if(m&&reps===1){const dd=Number(m[1]);if(dd===distance)return raw;return`${distance} ${text(m[2])}`}
    return raw;
  }
  function workLabel(w={}){
    const raw=canonicalRaw(w);if(raw)return raw;
    const reps=Math.max(1,Number(w.reps)||1),distance=Number(w.distance)||0,parts=[];
    if(distance)parts.push(reps>1?`${reps} × ${distance}`:`${distance}`);
    if(text(w.stroke))parts.push(text(w.stroke));if(text(w.zone))parts.push(text(w.zone));
    return parts.join(' · ')||'Work';
  }
  function workMeta(w={}){
    const raw=text(w.raw),parts=[];
    if(!/(?:@|\bon\b)/i.test(raw)){
      if(Number.isFinite(Number(w.cycleSeconds)))parts.push(`@ ${fmtSeconds(w.cycleSeconds)}`);
      else if(Array.isArray(w.cycleOptions)&&w.cycleOptions.length)parts.push(`@ ${w.cycleOptions.map(fmtSeconds).filter(Boolean).join(' / ')}`);
    }
    if(Number.isFinite(Number(w.restSeconds))&&!/\b\d{1,3}\s*(?:sr|s\s*r|s\s*rest|sec(?:onds?)?\s*rest|seconds?\s*rest|rest)\b/i.test(raw))parts.push(`${Number(w.restSeconds)}s rest`);
    const extra=(w.equipment||[]).filter(x=>!raw.toLowerCase().includes(String(x).toLowerCase()));if(extra.length)parts.push(extra.join(' + '));
    return parts.join(' · ');
  }
  function detailRows(w={}){
    const rows=[];
    if((w.composition||[]).length){const repeat=Number(w.compositionRepeats)>1?` × ${w.compositionRepeats}`:'';rows.push(`<div class="msos-work-detail"><span class="msos-detail-label">MAKEUP${esc(repeat)}</span>${(w.composition||[]).map(x=>`<span>${esc(`${x.distance} ${text(x.text||x.raw)}`)}</span>`).join('')}</div>`)}
    if((w.pattern||[]).length)rows.push(`<div class="msos-work-detail"><span class="msos-detail-label">PATTERN</span>${(w.pattern||[]).map(x=>`<span>${esc(`${x.count} ${text(x.text)}`)}</span>`).join('')}</div>`);
    const explicitReps=(w.repInstructions||[]).filter(x=>text(x.label)&&x.source!=='pattern');
    if(explicitReps.length)rows.push(`<div class="msos-work-detail"><span class="msos-detail-label">REPS</span>${explicitReps.map(x=>`<span>#${esc(x.rep)} ${esc(x.label)}</span>`).join('')}</div>`);
    if((w.cues||[]).length)rows.push(`<div class="msos-work-detail msos-cues"><span class="msos-detail-label">CUE</span>${(w.cues||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div>`);
    return rows.join('');
  }
  function sourceBadge(source){const s=text(source);if(!s)return'';if(/T400/i.test(s))return'T400';if(/\bPB\b|personal best/i.test(s))return'PB';if(/race/i.test(s))return'Race';if(/pathway|qualif|\bQT\b/i.test(s))return'Pathway';if(/coach/i.test(s))return'Coach';if(/HR|heart rate/i.test(s))return'HR';return s.length>14?`${s.slice(0,13)}…`:s}
  function targetText(t={}){if(t.status==='ok')return[fmtSeconds(t.seconds),t.sendOff!=null?`@ ${fmtSeconds(t.sendOff)}`:'',sourceBadge(t.source)].filter(Boolean).join(' · ');if(t.status==='missing'||t.status==='error')return text(t.message)||'Target unavailable';return text(t.message||t.reason)}
  function renderTarget(t={}){
    const label=esc(t.label||t.athleteName),title=attr(t.source||t.message||t.reason||'');
    if(t.status==='pattern'||t.status==='rep_race'){
      const rows=(t.rows||[]).map(r=>`<span>#${esc(r.rep)} ${esc(r.zone||r.label)} ${esc(r.status==='ok'?fmtSeconds(r.seconds):text(r.message)||'—')}${r.sendOff!=null?` @${esc(fmtSeconds(r.sendOff))}`:''}</span>`).join(' · '),badge=sourceBadge(t.source);
      return`<div class="msos-target-row is-pattern ${t.status==='rep_race'?'is-race':''}" title="${title}"><strong>${label}</strong><span class="msos-target-value">${rows}</span>${badge?`<small>${esc(badge)}</small>`:''}</div>`;
    }
    if(t.status==='ok'){
      const badge=sourceBadge(t.source),send=t.sendOff!=null?`@${fmtSeconds(t.sendOff)}`:'';
      return`<div class="msos-target-row" title="${title}"><strong>${label}</strong><span class="msos-target-value">${esc(fmtSeconds(t.seconds))}</span>${send?`<small>${esc(send)}</small>`:''}${badge?`<small class="msos-target-source">${esc(badge)}</small>`:''}</div>`;
    }
    return`<div class="msos-target-row is-missing" title="${title}"><strong>${label}</strong><span class="msos-target-value">${esc(targetText(t)||'—')}</span></div>`;
  }
  function renderTargets(targets=[]){return targets.length?`<div class="msos-targets">${targets.map(renderTarget).join('')}</div>`:''}
  function renderModifiedPhaseTargets(rows=[]){if(!rows.length)return'';return`<div class="msos-mod-phase-targets">${rows.map(t=>renderTarget({...t,label:`P${t.phaseIndex}`})).join('')}</div>`}
  function renderModification(m={},parentContext={}){
    const meta=workMeta(m.work),target=m.target&&m.target.status!=='none'?`<div class="msos-mod-target">${renderTarget({...m.target,label:'Target'})}</div>`:'',phaseTargets=renderModifiedPhaseTargets(m.phaseTargets||[]),ctx={...parentContext,athleteId:m.athleteId};
    return`<div class="msos-mod-card ${m.status==='error'?'is-error':''}" data-athlete-id="${attr(m.athleteId)}"><div class="msos-mod-head"><strong>${esc(m.label||m.athleteName)}</strong>${actionButton('edit-athlete','Edit',ctx,'is-mini')}</div><div class="msos-mod-work">${esc(workLabel(m.work))}</div>${meta?`<div class="msos-work-meta">${esc(meta)}</div>`:''}${text(m.reason)?`<div class="msos-mod-reason">${esc(m.reason)}</div>`:''}${target}${phaseTargets}</div>`;
  }
  function renderCaptures(captures={},context={}){if(!Number(captures.count))return'';const bits=Object.entries(captures.byType||{}).map(([k,n])=>`${n} ${k}`).join(' · ');return`<button type="button" class="msos-capture-marker" data-board-action="evidence" ${actionAttrs(context)}>${esc(bits||`${captures.count} capture${captures.count===1?'':'s'}`)}</button>`}
  function renderPhase(phase={}){const meta=workMeta(phase.work);return`<div class="msos-phase" data-phase-index="${attr(phase.index)}"><div><strong>${esc(`Phase ${phase.index}`)}</strong> ${esc(workLabel(phase.work))}</div>${meta?`<div class="msos-work-meta">${esc(meta)}</div>`:''}${detailRows(phase.work)}${renderTargets(phase.targets||[])}</div>`}
  function renderSet(set={}){
    const w=set.groupWork||{},meta=workMeta(w),mods=set.modifications||[],context=set.context||{};
    return`<article class="msos-set-row" data-set-id="${attr(set.id)}" ${actionAttrs(context)}><div class="msos-set-main"><div class="msos-set-top"><div class="msos-set-title">${esc(workLabel(w))}</div><div class="msos-set-actions">${actionButton('edit','Edit',context)}${actionButton('note','Note',context)}</div></div>${meta?`<div class="msos-work-meta">${esc(meta)}</div>`:''}${detailRows(w)}${(set.phases||[]).length?`<div class="msos-phases">${set.phases.map(renderPhase).join('')}</div>`:''}${renderTargets(set.targets||[])}${renderCaptures(set.captures,context)}</div>${mods.length?`<aside class="msos-mod-rail">${mods.map(m=>renderModification(m,context)).join('')}</aside>`:''}</article>`;
  }
  function renderCue(cue={}){return`<div class="msos-board-cue ${cue.role==='summary'?'is-summary':''}" ${actionAttrs(cue.context||{})}><span>${esc(cue.text)}</span>${cue.summaryMetres!=null?`<strong>${esc(fmtDistance(cue.summaryMetres))}</strong>`:''}${renderCaptures(cue.captures,cue.context||{})}</div>`}
  function renderGroup(group={}){const title=group.scope==='authored_round'&&group.roundNumber?`ROUND ${group.roundNumber}`:group.rounds>1?`${group.rounds} ROUNDS`:text(group.label)||'GROUP';return`<section class="msos-round-group" data-group-id="${attr(group.id)}" data-group-scope="${attr(group.scope)}"><header><strong>${esc(title)}</strong><span>${esc(fmtDistance(group.distance))}</span></header><div class="msos-group-items">${(group.items||[]).map(renderNode).join('')}</div></section>`}
  function renderNode(node={}){if(node.kind==='group')return renderGroup(node);if(node.kind==='cue')return renderCue(node);return renderSet(node)}
  function renderBlock(block={}){const context=block.context||{};return`<section id="${attr(blockAnchor(block))}" class="msos-board-block" data-block-id="${attr(block.id)}"><header class="msos-block-head"><div><h2>${esc(block.title)}</h2><span>${esc(fmtDistance(block.distance))}</span></div><div class="msos-block-actions">${actionButton('capture','Capture',context)}${actionButton('edit-block','Edit block',context)}</div></header>${renderCaptures(block.captures,context)}<div class="msos-block-items">${(block.items||[]).map(renderNode).join('')}</div></section>`}
  function renderAttendance(a={}){return`<div class="msos-board-attendance"><strong>${esc(`${Number(a.here)||0} here`)}</strong>${(a.athletes||[]).map(x=>{const status=text(x.status),badge=status&&status!=='present'?`<small>${esc(status)}</small>`:'';return`<span class="msos-athlete-chip status-${attr(status)}" data-athlete-id="${attr(x.id)}">${esc(x.label)}${badge}</span>`}).join('')}</div>`}
  function renderBlockNav(blocks=[]){return`<nav class="msos-board-block-nav" aria-label="Session blocks">${blocks.map(b=>`<a href="#${attr(blockAnchor(b))}">${esc(b.title)}<small>${esc(fmtDistance(b.distance))}</small></a>`).join('')}</nav>`}
  function renderBoard(model={}){
    if(model.schema!=='msos.board.v2')throw new Error('Board Renderer requires msos.board.v2 projection');
    const view=applyDisplayNames(model),i=view.identity||{},sessionContext={sessionId:view.sessionId,blockId:'',itemId:''},warning=view.validation?.totalMatches===false?`<div class="msos-board-warning">${esc((view.validation.warnings||[]).join(' · ')||'Session total needs checking')}</div>`:'',here=Number(view.attendance?.here)||0;
    const sticky=`<div class="msos-board-sticky-shell"><nav class="msos-board-sticky-actions" aria-label="Poolside actions">${actionButton('roll',`Roll · ${here}`,sessionContext)}${actionButton('times','T400 / Times',sessionContext)}${actionButton('capture','Capture',sessionContext)}${actionButton('voice','Voice',sessionContext)}${actionButton('photo','Photo',sessionContext)}${actionButton('video','Video',sessionContext)}${actionButton('finish','Finish',sessionContext,'is-primary')}</nav>${renderBlockNav(view.blocks||[])}</div>`;
    return`<main class="msos-board" data-session-id="${attr(view.sessionId)}"><header class="msos-board-hero"><div><span class="msos-board-kicker">${esc([i.date,i.dayPart].filter(Boolean).join(' · '))}</span><h1>${esc(i.title||'Session Board')}</h1><p>${esc([...(i.squads||[]),i.venue,i.course].filter(Boolean).join(' · '))}</p></div><strong class="msos-board-total">${esc(fmtDistance(view.totalDistance))}</strong></header>${sticky}${warning}${renderAttendance(view.attendance||{})}<div class="msos-board-blocks">${(view.blocks||[]).map(renderBlock).join('')}</div></main>`;
  }
  return{VERSION,renderBoard,renderBlock,renderBlockNav,renderNode,renderSet,renderGroup,renderModification,compactNames,applyDisplayNames,blockAnchor,canonicalRaw,workLabel,workMeta,sourceBadge,targetText,fmtSeconds,fmtDistance,esc};
});
