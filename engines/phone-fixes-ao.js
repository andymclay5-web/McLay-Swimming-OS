'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines,UI=M?.ui,U=M?.util;
  if(!M||!E?.Modification||!UI||!U)return;
  const BUILD='v4-phone-acceptance-20260821ao';
  const P=M.phoneAcceptanceAO={build:BUILD,performanceLinkPolicy:'best-event + next-real-milestone'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>U.escape?U.escape(String(v??'')):String(v??'');
  const clock=v=>U.clock?U.clock(Number(v)):String(v??'—');
  const current=()=>M.currentSession?.()||null;
  const activeOverride=(session,item,ath,state=M.state)=>(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;
  const explicitMode=(session,item,ath,state=M.state)=>text(activeOverride(session,item,ath,state)?.patch?.adaptiveMode);
  const adapt=(item,ath,state=M.state,session=current())=>E.Modification.adaptItem(item,ath,state,session);
  P.adaptItem=adapt;

  function parseCycle(line){const m=text(line).match(/(?:@|\bon\b)\s*(\d{1,2})[.:]([0-5]\d)\b/i);return m?Number(m[1])*60+Number(m[2]):null;}
  function setLead(line){const m=text(line).match(/^(\d{1,3})\s*[x×]\s*(\d{1,4}(?:\.5)?)\b/i);return m?{reps:Number(m[1]),distance:Number(m[2])}:null;}
  function isBlockHeading(line){return /^(?:warm\s*up|pre\s*set|main\s*set|post\s*set|warm\s*down|cool\s*down|test|aerobic\s+reset)\b/i.test(text(line));}
  function setsInOrder(session){const out=[];const walk=(items,block)=>{for(const x of items||[]){if(x?.kind==='group')walk(x.items||[],block);else if(x?.kind==='set')out.push({item:x,blockId:block?.id||''});}};for(const b of session?.blocks||[])walk(b.items||[],b);return out;}
  function repairAuthoredCycles(session){
    const source=String(session?.currentSource?.text||session?.originalPlan?.text||'');if(!source)return 0;const lines=source.replace(/\r/g,'').split('\n'),sets=setsInOrder(session);let cursor=0,changed=0;
    for(let i=0;i<lines.length;i++){
      const lead=setLead(lines[i]);if(!lead)continue;let hit=-1;for(let k=cursor;k<sets.length;k++){const x=sets[k].item;if(Number(x.reps||1)===lead.reps&&Number(x.distance||0)===lead.distance){hit=k;break;}}
      if(hit<0)continue;cursor=hit+1;let cycle=parseCycle(lines[i]);
      if(!cycle){for(let j=i+1;j<Math.min(lines.length,i+5);j++){if(!text(lines[j]))continue;if(setLead(lines[j])||isBlockHeading(lines[j])||/^\d{1,2}\s+Rounds?\b/i.test(text(lines[j])))break;cycle=parseCycle(lines[j]);if(cycle)break;}}
      if(cycle&&Number(sets[hit].item.cycleSeconds)!==cycle){sets[hit].item.cycleSeconds=cycle;changed++;}
    }
    if(changed){session.metadata=session.metadata||{};session.metadata.authoredCycleRepair={build:BUILD,count:changed,at:new Date().toISOString()};}
    return changed;
  }
  P.repairAuthoredCycles=repairAuthoredCycles;
  if(M.parser?.parse){const priorParse=M.parser.parse.bind(M.parser);M.parser.parse=(source,identity={})=>{const s=priorParse(source,identity);repairAuthoredCycles(s);return s;};}

  function itemDistance(n,mult=1){if(!n)return 0;if(n.kind==='set')return mult*Math.max(1,Number(n.reps)||1)*(Number(n.distance)||0);if(n.kind==='group')return (n.items||[]).reduce((sum,x)=>sum+itemDistance(x,mult*Math.max(1,Number(n.rounds)||1)),0);return 0;}
  function orderedSets(session){const out=[];for(const b of session?.blocks||[]){const walk=(items,mult=1)=>{for(const x of items||[]){if(x?.kind==='group')walk(x.items||[],mult*Math.max(1,Number(x.rounds)||1));else if(x?.kind==='set')out.push({id:x.id,blockId:b.id,item:x,distance:itemDistance(x,mult)});}};walk(b.items||[]);}return out;}
  function finishPlan(session){
    const rows=orderedSets(session),f=session?.finish;if(!f)return{finished:false,rows,boundary:-1,incompleteIds:[],incompleteBlockIds:[]};let boundary=-1;
    if(f.throughItemId)boundary=rows.findIndex(x=>x.id===f.throughItemId);
    if(boundary<0&&f.throughBlockId){for(let i=0;i<rows.length;i++)if(rows[i].blockId===f.throughBlockId)boundary=i;}
    if(boundary<0&&Number.isFinite(Number(f.actualDistance))){let sum=0;for(let i=0;i<rows.length;i++){sum+=rows[i].distance;if(sum<=Number(f.actualDistance)+.01)boundary=i;else break;}}
    const incomplete=boundary>=0?rows.slice(boundary+1):[],ids=incomplete.map(x=>x.id),blocks=[...new Set(incomplete.map(x=>x.blockId).filter(Boolean))];return{finished:true,rows,boundary,incompleteIds:ids,incompleteBlockIds:blocks,through:boundary>=0?rows[boundary]:null};
  }
  P.finishPlan=finishPlan;

  function boardWho(c){const ids=[...(c?.athlete_ids||[])];if(c?.athlete_id&&!ids.includes(c.athlete_id))ids.push(c.athlete_id);if(!ids.length)return'GROUP';if(ids.length>1)return`${ids.length} swimmers`;const a=(M.state?.athletes||[]).find(x=>x.id===ids[0]);return a?(M.boardEngine?.name?.(a,UI.presentAthletes?.()||[])||text(a.full_name).split(' ')[0]):'Swimmer';}
  function noteLabel(c){const title=text(c?.title||c?.capture_title||c?.label);return[boardWho(c),title||'Note'].filter(Boolean).join(' · ');}
  P.noteLabel=noteLabel;
  function compactBoardNotes(){document.querySelectorAll('#boardView .msos-evidence-thumb.note[data-msos-capture]').forEach(b=>{const c=(M.state?.captures||[]).find(x=>x.id===b.dataset.msosCapture);const small=b.querySelector('small');if(small)small.textContent=c?noteLabel(c):'Note';b.title='Open note';b.setAttribute('aria-label','Open note capture');});}

  function findItem(session,id){return orderedSets(session).find(x=>x.id===id)?.item||null;}
  function applyFinishState(){
    const board=document.querySelector('#boardView'),s=current();if(!board||!s)return;board.querySelector('[data-ao-finish-banner]')?.remove();board.classList.remove('ao-show-uncompleted');board.querySelectorAll('[data-ao-not-completed],[data-ao-block-uncompleted],[data-ao-block-partial]').forEach(el=>{el.removeAttribute('data-ao-not-completed');el.removeAttribute('data-ao-block-uncompleted');el.removeAttribute('data-ao-block-partial');});
    const plan=finishPlan(s);if(!plan.finished)return;const ids=new Set(plan.incompleteIds);for(const row of board.querySelectorAll('.msos-work-row[data-item]'))if(ids.has(row.dataset.item))row.dataset.aoNotCompleted='1';
    for(const block of board.querySelectorAll('.msos-board-block[data-block]')){const rows=[...block.querySelectorAll('.msos-work-row[data-item]')];if(rows.length&&rows.every(r=>r.dataset.aoNotCompleted==='1'))block.dataset.aoBlockUncompleted='1';else if(rows.some(r=>r.dataset.aoNotCompleted==='1'))block.dataset.aoBlockPartial='1';}
    const planned=Number(M.session?.total?.(s)||0),actual=Number(s.finish?.actualDistance)||0,through=plan.through?.item,hasIncomplete=plan.incompleteIds.length>0,banner=document.createElement('section');banner.dataset.aoFinishBanner='1';banner.className='ao-finish-banner';banner.innerHTML=`<div><b>FINISHED</b><span>${actual.toLocaleString()}m delivered${planned?` of ${planned.toLocaleString()}m planned`:''}${through?` · stopped after ${esc(M.boardEngine?.workLabel?.(through)||through.raw||through.text||'last delivered line')}`:''}</span></div>${hasIncomplete?'<button type="button" data-ao-toggle-uncompleted>Show not completed</button>':''}`;
    const anchor=board.querySelector('.msos-board-block')||board.firstElementChild;if(anchor)anchor.insertAdjacentElement('beforebegin',banner);else board.prepend(banner);
    banner.querySelector('[data-ao-toggle-uncompleted]')?.addEventListener('click',e=>{const on=board.classList.toggle('ao-show-uncompleted');e.currentTarget.textContent=on?'Hide not completed':'Show not completed';});
  }

  function saveAdaptive(session,item,ath,mode,stroke){
    if(!mode)return false;M.state.adaptationOverrides=M.state.adaptationOverrides||[];let row=activeOverride(session,item,ath,M.state);if(!row){row={id:U.uid?.('mod')||`mod-${Date.now()}`,sessionId:session.id,itemId:item.id,athleteId:ath.id,patch:{},active:true,createdAt:new Date().toISOString()};M.state.adaptationOverrides.push(row);}row.active=true;row.patch={...(row.patch||{}),adaptiveMode:mode};if(stroke&&stroke!=='AUTO')row.patch.stroke=stroke;else delete row.patch.stroke;row.updatedAt=new Date().toISOString();E.Coordinator?.clearCache?.();E.RacePace?.invalidate?.(M.state);M.performanceEngine?.invalidate?.(M.state);M.store?.save?.(M.state);M.cloud?.stageAdaptationsForSession?.(session);UI.renderBoard?.();return true;
  }
  function openAdaptive(itemId,athId){
    const session=current(),item=findItem(session,itemId),ath=(M.state?.athletes||[]).find(a=>a.id===athId);if(!session||!item||!ath)return;const actual=adapt(item,ath,M.state,session),opts=actual.adaptiveOptions||M.adaptiveDelivery?.AMBER_MODES||[];if(!opts.length)return;const host=document.querySelector('#modalHost');if(!host)return;const selected=explicitMode(session,item,ath,M.state),strokes=actual.adaptiveStrokeChoices||['Choice'];host.innerHTML=`<div class="modal-backdrop" data-ao-adaptive-close><section class="modal" role="dialog" aria-modal="true"><header><div><small>ADAPTIVE OPTION · THIS SET</small><h2>${esc(ath.full_name)}</h2></div><button data-ao-adaptive-close>×</button></header><div class="modal-body"><div class="context-note">${selected?`<b>Selected:</b> ${esc(selected)}`:'<b>No option selected yet.</b> Choose the most useful upper-body variation for this set.'}${actual.adaptiveNote?`<br>${esc(actual.adaptiveNote)}`:''}</div><label>Option<select id="aoAdaptiveMode"><option value="">Choose option…</option>${opts.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label><label>Stroke<select id="aoAdaptiveStroke"><option value="AUTO">Automatic / Choice</option>${strokes.filter(x=>x!=='Choice').map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}<option value="Choice">Choice</option></select></label><p class="muted">The Board shows only the option you choose. The squad set stays unchanged.</p></div><footer><button data-ao-adaptive-close>Cancel</button><button class="primary" data-ao-adaptive-save ${selected?'':'disabled'}>Use option</button></footer></section></div>`;const mode=host.querySelector('#aoAdaptiveMode'),save=host.querySelector('[data-ao-adaptive-save]'),close=()=>host.innerHTML='';mode.onchange=()=>save.disabled=!mode.value;host.querySelectorAll('[data-ao-adaptive-close]').forEach(b=>b.onclick=close);save.onclick=()=>{if(saveAdaptive(session,item,ath,mode.value,host.querySelector('#aoAdaptiveStroke').value))close();};
  }
  function fixAdaptiveButtons(){document.querySelectorAll('#boardView [data-adaptive-option]').forEach(b=>{const token=String(b.dataset.adaptiveOption||'');b.removeAttribute('data-adaptive-option');b.dataset.aoAdaptiveOption=token;const [itemId,athId]=token.split(':'),session=current(),item=findItem(session,itemId),ath=(M.state?.athletes||[]).find(a=>a.id===athId),mode=item&&ath?explicitMode(session,item,ath,M.state):'';b.textContent=mode?'Change option':'Choose option';b.title=mode?`Selected: ${mode}`:'Choose adaptive option';b.onclick=e=>{e.preventDefault();e.stopPropagation();openAdaptive(itemId,athId);};});}

  function nextMilestone(ath,course){const events=M.swimmerTabsUI?.pathwayEvents?.(ath,course)||[];for(const event of events){const next=(M.swimmerTabsUI?.realMilestones?.(event)||[]).find(x=>!x.achieved);if(next)return{event,next};}return null;}
  function performanceSnapshot(ath,course){let profile=null;try{profile=M.performanceEngine?.profile?.(ath,M.state,course)||null}catch{}const best=profile?.bestEvent||null,next=nextMilestone(ath,course);return{best,pbCount:Number(profile?.pbs?.length||0),next,course};}
  P.performanceSnapshot=performanceSnapshot;
  function snapshotHtml(ath,course){const x=performanceSnapshot(ath,course),best=x.best,next=x.next,items=[];if(best)items.push(`<span><small>#1 event</small><b>${esc(`${best.distance} ${best.stroke}`)}</b><em>${clock(best.seconds||best.result_seconds)}${Number.isFinite(Number(best.points))?` · ${Math.floor(best.points)} WA`:''}</em></span>`);items.push(`<span><small>PB events</small><b>${x.pbCount}</b><em>${esc(course)}</em></span>`);if(next){const pb=next.event.pb,gap=next.next.gapSeconds;items.push(`<span><small>Next milestone</small><b>${esc(`${pb.distance} ${pb.stroke}`)}</b><em>${esc(next.next._label)} · ${gap.toFixed(2)}s</em></span>`);}return `<section class="ao-performance-snapshot" data-ao-performance-snapshot><h3>Performance snapshot</h3><div>${items.join('')}</div></section>`;}
  function compactAthleteNotes(card){card.querySelectorAll('[data-loop-open-cap]').forEach(b=>{const c=(M.state?.captures||[]).find(x=>x.id===b.dataset.loopOpenCap);if(text(c?.capture_type).toLowerCase()!=='note')return;const strong=b.querySelector('b'),small=b.querySelector('small');if(strong){const label=text(c?.title||c?.capture_title)||'Note';if(text(strong.textContent)!==label)strong.textContent=label;}small?.remove();});}
  function collapseCard(card,label){if(!card||card.dataset.aoCollapsed)return;card.dataset.aoCollapsed='1';const children=[...card.children],details=document.createElement('details'),summary=document.createElement('summary');summary.innerHTML=`<b>${esc(label)}</b><span>Open</span>`;details.append(summary);for(const n of children)details.append(n);card.append(details);}
  function enhanceAthlete(){
    const h=document.querySelector('#athletesView'),ath=(M.state?.athletes||[]).find(a=>a.id===M.state?.settings?.selectedAthleteId);if(!h||!ath)return;const today=h.querySelector('[data-loop-athlete-today]');if(today){compactAthleteNotes(today);const heads=[...today.querySelectorAll('h3')],ph=heads.find(x=>/performance links/i.test(text(x.textContent)));if(ph){const next=ph.nextElementSibling;if(next?.classList.contains('loop-chip-row'))next.remove();ph.remove();}if(!today.querySelector('[data-ao-performance-snapshot]'))today.insertAdjacentHTML('beforeend',snapshotHtml(ath,M.state?.settings?.pathwayCourse||current()?.identity?.course||'SCM'));}
    const panel=h.querySelector('[data-msos-ath-panel="performance"]');if(panel){panel.querySelectorAll('.perf-rank strong').forEach(el=>{const m=text(el.textContent).match(/^(\d+)\s+WA\b/i);if(m){const next=`${m[1]} WA`;if(text(el.textContent)!==next)el.textContent=next;}});const cards=[...panel.querySelectorAll(':scope > .page-card')],coverage=cards.find(c=>/Event coverage\s*\/\s*development/i.test(text(c.querySelector('h2')?.textContent)));collapseCard(coverage,'Development opportunities');}
  }
  let athleteQueued=false;function queueAthlete(){if(athleteQueued)return;athleteQueued=true;queueMicrotask(()=>{athleteQueued=false;enhanceAthlete();});}

  const priorBoard=UI.renderBoard?.bind(UI);if(priorBoard)UI.renderBoard=()=>{const s=current();if(s&&repairAuthoredCycles(s)){try{M.store?.save?.(M.state)}catch{}}priorBoard();compactBoardNotes();applyFinishState();fixAdaptiveButtons();};
  const priorAthletes=UI.renderAthletes?.bind(UI);if(priorAthletes)UI.renderAthletes=()=>{priorAthletes();queueAthlete();requestAnimationFrame(queueAthlete);};
  if(M.performanceUI)M.performanceUI.render=UI.renderAthletes;
  const athHost=document.querySelector('#athletesView');if(athHost)new MutationObserver(queueAthlete).observe(athHost,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>{if(M.state?.settings?.view==='board')requestAnimationFrame(()=>{compactBoardNotes();applyFinishState();fixAdaptiveButtons();});queueAthlete();},{once:true});

  P.checks=()=>({amberStartIndependent:true,amberPendingChoice:true,notesCompact:true,finishedRemainderHidden:true,performanceLinkPolicy:P.performanceLinkPolicy,kickCueCycleRecovery:true,modificationPolicyOwner:E.Modification.VERSION});
})(globalThis);
