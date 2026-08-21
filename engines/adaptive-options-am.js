'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines,UI=M?.ui;if(!M||!E?.Modification||!UI)return;
  const A=M.adaptiveDelivery={build:'v4-adaptive-guardian-20260821an'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const key=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
  const esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??'');
  const clock=s=>M.util?.clock?M.util.clock(Number(s)):String(s??'');
  const ceil5=n=>Math.ceil(Number(n||0)/5)*5;
  const poolLength=s=>/LCM/i.test(text(s?.identity?.course))?50:25;
  const current=()=>M.currentSession?.()||null;
  const activeOverride=(session,item,ath,state=M.state)=>(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;
  const shapeOverride=ov=>{const p=ov?.patch||{};return !!ov&&['reps','distance','cycleSeconds','restSeconds','equipment','raw','text'].some(k=>Object.prototype.hasOwnProperty.call(p,k));};
  const deterministic=(item,n)=>{const s=String(item?.id||item?.raw||'');let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return n?h%n:0;};

  const AMBER_MODES=Object.freeze([
    {id:'Pull',label:'Pull'},
    {id:'Swim',label:'Swim'},
    {id:'Paddles',label:'Paddles'},
    {id:'Drill',label:'Drill'},
    {id:'Scull',label:'Scull',scullCyclePer50:120,note:'Very slow · allow up to 2:00 per 50'},
    {id:'Body alignment',label:'Body alignment'}
  ]);
  const AMBER_STROKES=Object.freeze(['Freestyle','Backstroke','Breaststroke','Butterfly','IM','Choice']);
  const CONOR_MODES=Object.freeze([
    {id:'Choice non-Breaststroke',label:'Choice non-Breaststroke'},
    {id:'Freestyle',label:'Freestyle'},
    {id:'Backstroke',label:'Backstroke'},
    {id:'Butterfly',label:'Butterfly'}
  ]);
  function rewrite(out,label){
    const reps=Math.max(1,Number(out?.reps)||1),d=Number(out?.distance)||0,cycle=Number(out?.cycleSeconds)||0;
    out.raw=`${reps} × ${d} ${label}${cycle?` @ ${clock(cycle)}`:''}`;out.text=out.raw;return out;
  }
  function reshape(out,reps,distance){
    reps=Math.max(1,Number(reps)||1);distance=Number(distance)||0;const raw=text(out?.raw||out?.text),lead=`${reps} × ${distance}`;
    out.reps=reps;out.distance=distance;
    if(/^\d+\s*[x×]\s*\d+(?:\.5)?/i.test(raw))out.raw=raw.replace(/^\d+\s*[x×]\s*\d+(?:\.5)?/i,lead);
    else if(/^\d+(?:\.5)?\b/.test(raw))out.raw=raw.replace(/^\d+(?:\.5)?\b/,lead);
    else out.raw=`${lead}${raw?` · ${raw}`:''}`;
    out.text=out.raw;return out;
  }
  function amberMode(out,item,ath,state,session){
    const raw=text([item?.raw,item?.text,...(item?.cues||[])].filter(Boolean).join(' '));
    const constrained=/\b(?:kick|fins?|underwater|dive|start)\b/i.test(raw)||/upper-body/i.test(text(out?.raw||out?.text));
    if(!constrained)return out;
    const ov=activeOverride(session,item,ath,state),requested=text(ov?.patch?.adaptiveMode),available=AMBER_MODES.map(x=>x.id),fallback=available[deterministic(item,available.length)],mode=available.includes(requested)?requested:fallback,stroke=E.Evidence?.stroke?.(ov?.patch?.stroke||'Choice')||'Choice',meta=AMBER_MODES.find(x=>x.id===mode)||AMBER_MODES[0];
    out.adaptiveOptions=AMBER_MODES.map(x=>({...x}));out.adaptiveMode=mode;out.adaptiveStrokeChoices=[...AMBER_STROKES];out.adaptiveRuleStatus='coach-confirmed';out.adaptiveNote='Upper-body variation · all strokes available · Scull very slow, up to 2:00 per 50';
    out.equipment=[...(out.equipment||[])].filter(x=>!/\b(?:Fins?|Kick)\b/i.test(String(x)));
    let label='';
    if(mode==='Pull')label=`Upper-body ${stroke} Pull`;
    else if(mode==='Paddles'){label=`Upper-body ${stroke} Paddles`;if(!out.equipment.some(x=>/paddles/i.test(String(x))))out.equipment.push('Paddles');}
    else if(mode==='Swim')label=`Upper-body ${stroke} Swim`;
    else if(mode==='Drill')label=`Upper-body ${stroke} Drill`;
    else if(mode==='Scull'){label=`Upper-body ${stroke} Scull`;const min=ceil5((Number(out.distance)||50)/50*Number(meta.scullCyclePer50||120));if(Number(out.cycleSeconds||0)<min)out.cycleSeconds=min;}
    else label='Upper-body · Body alignment';
    rewrite(out,label);out.adaptationReason=`Amber adaptive upper-body · ${mode}`;
    out.cues=[...(out.cues||[]).filter(x=>!/^Adaptive options:/i.test(text(x))),`Adaptive options: Pull / Swim / Paddles / Drill / Scull / Alignment`];
    return out;
  }
  function conorMode(out,item,ath,state,session){
    const raw=text([item?.raw,item?.text].join(' '));if(!/\b(?:breaststroke|breast|br)\b/i.test(raw)||!/\bfins?\b/i.test(raw))return out;
    const ov=activeOverride(session,item,ath,state),requested=text(ov?.patch?.adaptiveMode),available=CONOR_MODES.map(x=>x.id),mode=available.includes(requested)?requested:'Choice non-Breaststroke';
    out.adaptiveOptions=CONOR_MODES.map(x=>({...x}));out.adaptiveMode=mode;out.adaptiveStrokeChoices=['Freestyle','Backstroke','Butterfly','Choice'];out.adaptiveRuleStatus='starter';out.adaptiveNote='Current confirmed rule: no Breaststroke kick with fins. Add further Conor-specific options only when coach-confirmed.';
    out.stroke=mode==='Choice non-Breaststroke'?'Choice':mode;rewrite(out,`${mode} with Fins`);out.adaptationReason='No Breaststroke kick with fins';
    out.cues=[...(out.cues||[]).filter(x=>!/^Adaptive options:/i.test(text(x))),`Adaptive options: Choice non-Br / Free / Back / Fly`];return out;
  }
  const priorAdapt=E.Modification.adaptItem.bind(E.Modification);
  const adapt=(item,ath,state=M.state,session=current())=>{
    let out=priorAdapt(item,ath,state,session);if(!out||item?.kind!=='set')return out;const k=key(ath),ov=activeOverride(session,item,ath,state);
    if(k==='amberproudfoot'){
      const raw=text([item?.raw,item?.text,...(item?.cues||[])].filter(Boolean).join(' ')),p=E.Modification.profile?.(ath,state)||M.adapt?.profile?.(ath,state)||{ratio:1},ratio=Math.max(.25,Math.min(1,Number(p?.ratio)||1)),reps=Math.max(1,Number(item.reps)||1),distance=Number(item.distance)||0,constrained=/\b(?:kick|fins?|underwater|dive|start)\b/i.test(raw),mixedAerobic=ratio<.98&&reps<=4&&distance>=200&&Array.isArray(item.repPattern)&&item.repPattern.length>=reps;
      if(!constrained&&!shapeOverride(ov)&&mixedAerobic){const pool=poolLength(session),desired=Math.max(pool,Math.min(distance,Math.floor((distance*ratio+1e-9)/pool)*pool));reshape(out,reps,desired);out.repPattern=JSON.parse(JSON.stringify(item.repPattern||[]));out.repInstructions=JSON.parse(JSON.stringify(item.repInstructions||[]));out.adaptationReason=`${Math.round(ratio*100)}% profile · every authored phase retained`;}
      out=amberMode(out,item,ath,state,session);
    }else if(k==='conorfischer')out=conorMode(out,item,ath,state,session);
    return out;
  };
  E.Modification.adaptItem=adapt;if(M.adapt)M.adapt.item=adapt;A.adaptItem=adapt;A.AMBER_MODES=AMBER_MODES;A.CONOR_MODES=CONOR_MODES;

  function invalidate(session){E.Coordinator?.clearCache?.();E.RacePace?.invalidate?.(M.state);M.performanceEngine?.invalidate?.(M.state);M.store?.save?.(M.state);M.cloud?.stageAdaptationsForSession?.(session);UI.renderBoard?.();}
  function saveAdaptive(session,item,ath,mode,stroke){M.state.adaptationOverrides=M.state.adaptationOverrides||[];let row=activeOverride(session,item,ath,M.state);if(!row){row={id:M.util?.uid?.('mod')||`mod-${Date.now()}`,sessionId:session.id,itemId:item.id,athleteId:ath.id,patch:{},active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};M.state.adaptationOverrides.push(row);}row.active=true;row.patch={...(row.patch||{}),adaptiveMode:mode};if(stroke&&stroke!=='AUTO')row.patch.stroke=stroke;else delete row.patch.stroke;row.updatedAt=new Date().toISOString();invalidate(session);}
  function openAdaptive(itemId,athId){const session=current(),item=M.boardEngine?.findItem?.(session,itemId),ath=(M.state?.athletes||[]).find(a=>a.id===athId);if(!session||!item||!ath)return;const actual=adapt(item,ath,M.state,session),opts=actual.adaptiveOptions||[];if(!opts.length)return;const host=document.querySelector('#modalHost');if(!host)return;const strokes=actual.adaptiveStrokeChoices||['Choice'];host.innerHTML=`<div class="modal-backdrop" data-adaptive-close><section class="modal" role="dialog" aria-modal="true"><header><div><small>ADAPTIVE OPTION · LIVE BOARD</small><h2>${esc(ath.full_name)}</h2></div><button data-adaptive-close>×</button></header><div class="modal-body"><div class="context-note"><b>Current:</b> ${esc(actual.adaptiveMode||'Automatic')}<br>${esc(actual.adaptiveNote||'')}</div><label>Adaptive option<select id="adaptiveMode">${opts.map(x=>`<option value="${esc(x.id)}" ${x.id===actual.adaptiveMode?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label><label>Stroke<select id="adaptiveStroke"><option value="AUTO">Automatic / Choice</option>${strokes.filter(x=>x!=='Choice').map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}<option value="Choice">Choice</option></select></label><p class="muted">This changes only this swimmer on this set. The squad prescription stays untouched.</p></div><footer><button data-adaptive-cancel>Cancel</button><button class="primary" data-adaptive-save>Use option</button></footer></section></div>`;const close=()=>host.innerHTML='';host.querySelectorAll('[data-adaptive-close],[data-adaptive-cancel]').forEach(b=>b.onclick=close);host.querySelector('[data-adaptive-save]').onclick=()=>{saveAdaptive(session,item,ath,host.querySelector('#adaptiveMode').value,host.querySelector('#adaptiveStroke').value);close();};}
  function decorate(){const session=current();if(!session)return;document.querySelectorAll('.msos-mod-row[data-msos-mod-row]').forEach(row=>{if(row.querySelector('[data-adaptive-option]'))return;const [itemId,athId]=String(row.dataset.msosModRow||'').split(':'),item=M.boardEngine?.findItem?.(session,itemId),ath=(M.state?.athletes||[]).find(a=>a.id===athId);if(!item||!ath)return;const actual=adapt(item,ath,M.state,session);if((actual.adaptiveOptions||[]).length<2)return;const edit=row.querySelector('.msos-mod-edit'),b=document.createElement('button');b.type='button';b.dataset.adaptiveOption=`${itemId}:${athId}`;b.className='msos-mod-edit';b.textContent=`Option · ${actual.adaptiveMode||'Choose'}`;edit?.insertAdjacentElement('afterend',b);});}
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
  A.checks=()=>({amberModes:AMBER_MODES.map(x=>x.id),amberStrokes:[...AMBER_STROKES],conorModes:CONOR_MODES.map(x=>x.id),pastBlankHidden:true,calendarStatuses:['planned','authored','delivered','not_logged']});
})(globalThis);
