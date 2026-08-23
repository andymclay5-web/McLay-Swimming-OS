'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines,UI=M?.ui;if(!M||!E?.Modification||!UI)return;
  const A=M.adaptiveDelivery={build:'v4-adaptive-guardian-20260821an'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??'');
  const current=()=>M.currentSession?.()||null;
  const AMBER_MODES=E.Modification.AMBER_MODES||[];
  const AMBER_STROKES=E.Modification.AMBER_STROKES||['Freestyle','Backstroke','Breaststroke','Butterfly','IM','Choice'];
  const CONOR_MODES=E.Modification.CONOR_MODES||[];
  const activeOverride=(session,item,ath,state=M.state)=>(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;
  const adapt=(item,ath,state=M.state,session=current())=>E.Modification.adaptItem(item,ath,state,session);
  A.adaptItem=adapt;A.AMBER_MODES=AMBER_MODES;A.AMBER_STROKES=AMBER_STROKES;A.CONOR_MODES=CONOR_MODES;

  function invalidate(session){E.Coordinator?.clearCache?.();E.RacePace?.invalidate?.(M.state);M.performanceEngine?.invalidate?.(M.state);M.store?.save?.(M.state);M.cloud?.stageAdaptationsForSession?.(session);UI.renderBoard?.();}
  function saveAdaptive(session,item,ath,mode,stroke){
    M.state.adaptationOverrides=M.state.adaptationOverrides||[];let row=activeOverride(session,item,ath,M.state);
    if(!row){row={id:M.util?.uid?.('mod')||`mod-${Date.now()}`,sessionId:session.id,itemId:item.id,athleteId:ath.id,patch:{},active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};M.state.adaptationOverrides.push(row);}
    row.active=true;row.patch={...(row.patch||{}),adaptiveMode:mode};if(stroke&&stroke!=='AUTO')row.patch.stroke=stroke;else delete row.patch.stroke;row.updatedAt=new Date().toISOString();invalidate(session);
  }
  function openAdaptive(itemId,athId){
    const session=current(),item=M.boardEngine?.findItem?.(session,itemId),ath=(M.state?.athletes||[]).find(a=>a.id===athId);if(!session||!item||!ath)return;
    const actual=adapt(item,ath,M.state,session),opts=actual.adaptiveOptions||[];if(!opts.length)return;const host=document.querySelector('#modalHost');if(!host)return;
    const strokes=actual.adaptiveStrokeChoices||['Choice'];host.innerHTML=`<div class="modal-backdrop" data-adaptive-close><section class="modal" role="dialog" aria-modal="true"><header><div><small>ADAPTIVE OPTION · LIVE BOARD</small><h2>${esc(ath.full_name)}</h2></div><button data-adaptive-close>×</button></header><div class="modal-body"><div class="context-note"><b>Current:</b> ${esc(actual.adaptiveMode||'Automatic')}<br>${esc(actual.adaptiveNote||'')}</div><label>Adaptive option<select id="adaptiveMode">${opts.map(x=>`<option value="${esc(x.id)}" ${x.id===actual.adaptiveMode?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label><label>Stroke<select id="adaptiveStroke"><option value="AUTO">Automatic / Choice</option>${strokes.filter(x=>x!=='Choice').map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}<option value="Choice">Choice</option></select></label><p class="muted">This changes only this swimmer on this set. The squad prescription stays untouched.</p></div><footer><button data-adaptive-cancel>Cancel</button><button class="primary" data-adaptive-save>Use option</button></footer></section></div>`;
    const close=()=>host.innerHTML='';host.querySelectorAll('[data-adaptive-close],[data-adaptive-cancel]').forEach(b=>b.onclick=close);host.querySelector('[data-adaptive-save]').onclick=()=>{saveAdaptive(session,item,ath,host.querySelector('#adaptiveMode').value,host.querySelector('#adaptiveStroke').value);close();};
  }
  function decorate(){
    const session=current();if(!session)return;document.querySelectorAll('.msos-mod-row[data-msos-mod-row]').forEach(row=>{if(row.querySelector('[data-adaptive-option]'))return;const [itemId,athId]=String(row.dataset.msosModRow||'').split(':'),item=M.boardEngine?.findItem?.(session,itemId),ath=(M.state?.athletes||[]).find(a=>a.id===athId);if(!item||!ath)return;const actual=adapt(item,ath,M.state,session);if((actual.adaptiveOptions||[]).length<2)return;const edit=row.querySelector('.msos-mod-edit'),b=document.createElement('button');b.type='button';b.dataset.adaptiveOption=`${itemId}:${athId}`;b.className='msos-mod-edit';b.textContent=`Option · ${actual.adaptiveMode||'Choose'}`;edit?.insertAdjacentElement('afterend',b);});
  }
  const priorBoard=UI.renderBoard?.bind(UI);if(priorBoard)UI.renderBoard=()=>{priorBoard();decorate();};
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-adaptive-option]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();const [itemId,athId]=String(b.dataset.adaptiveOption||'').split(':');openAdaptive(itemId,athId);},true);

  const nzToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const sessionEvidence=session=>{const sid=session?.id;if(!sid)return false;if(session.finish)return true;if((session.changes||[]).some(x=>/finish|branch|edit|add|remove/i.test(text(x.type))))return true;if((M.state?.attendance||[]).some(x=>x.session_id===sid&&['present','modified','late'].includes(text(x.status).toLowerCase())))return true;if((M.state?.captures||[]).some(x=>x.session_id===sid))return true;if((M.state?.timedSets||[]).some(x=>x.session_id===sid))return true;return false;};
  const sourceText=session=>text(session?.currentSource?.text||session?.originalPlan?.text||'');
  const status=session=>{if(!session)return'none';if(sessionEvidence(session))return'delivered';if(Number(M.session?.total?.(session)||0)>0||sourceText(session))return'authored';return'blank';};
  const hidePastBlank=session=>{const d=text(session?.identity?.date);return !!(d&&d<nzToday()&&status(session)==='blank');};
  A.sessionStatus=status;A.hidePastBlank=hidePastBlank;A.sessionEvidence=sessionEvidence;
  M.calendar=M.calendar||{};M.calendar.sessionStatus=status;M.calendar.sessionForSlot=slot=>Object.values(M.state?.canonicalSessions||{}).find(s=>M.calendar?.matches?.(s,slot))||null;M.calendar.statusForSlot=slot=>{const s=M.calendar.sessionForSlot(slot);if(s)return status(s);return text(slot?.date)<nzToday()?'not_logged':'planned';};
  const priorHeader=UI.renderHeader?.bind(UI);if(priorHeader)UI.renderHeader=()=>{let allowed=Object.values(M.state?.canonicalSessions||{}).filter(x=>M.access?.sessionAllowed?.(x)!==false&&!hidePastBlank(x)).sort((a,b)=>`${b.identity?.date||''}-${b.identity?.dayPart||''}`.localeCompare(`${a.identity?.date||''}-${a.identity?.dayPart||''}`)),cur=current();if(cur&&hidePastBlank(cur)){M.state.settings.selectedSessionId=allowed[0]?.id||'';cur=current();}priorHeader();const pick=document.querySelector('#sessionSelect');if(!pick)return;pick.innerHTML=allowed.map(x=>`<option value="${esc(x.id)}" ${x.id===cur?.id?'selected':''}>${esc(`${x.identity?.dayPart||''} · ${x.identity?.date||''} · ${(x.identity?.squads||[]).join('+')||x.identity?.title||''}`)}</option>`).join('');pick.disabled=!allowed.length;pick.onchange=()=>{M.selectSession?.(pick.value);UI.renderCurrent?.();};};
  A.checks=()=>({amberModes:AMBER_MODES.map(x=>x.id),amberStrokes:[...AMBER_STROKES],conorModes:CONOR_MODES.map(x=>x.id),policyOwner:E.Modification.VERSION,pastBlankHidden:true,calendarStatuses:['planned','authored','delivered','not_logged']});
})(globalThis);
