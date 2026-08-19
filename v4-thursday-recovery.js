'use strict';
/* McLay Swimming OS — Thursday recovery bridge, 20 Aug 2026.
   Additive over v4-correct + v4-poolside-core. Poolside calculations use local
   canonical evidence only; cloud sync stays outside the render/target path. */
(function(g){
  const M=g.MSOS4;
  if(!M?.targets||!M?.adapt||!M?.parser||!M?.ui) throw new Error('MSOS4 poolside core must load before Thursday recovery');
  const U=M.util, T=M.targets, A=M.adapt, UI=M.ui;
  const R=M.thursdayRecovery={build:'v4-thursday-recovery-20260820a'};
  const txt=v=>String(v??'').replace(/\s+/g,' ').trim();
  const normStroke=v=>{const s=txt(v).toLowerCase();if(/^(free|freestyle|fr)$/.test(s))return'Freestyle';if(/^(back|backstroke|bk)$/.test(s))return'Backstroke';if(/^(breast|breaststroke|br)$/.test(s))return'Breaststroke';if(/^(fly|butterfly)$/.test(s))return'Butterfly';if(/^(im|medley|individual medley)$/.test(s))return'IM';if(/^choice$/.test(s))return'Choice';return txt(v)};
  const now=()=>U?.now?.()||new Date().toISOString();
  const save=()=>{try{M.store?.save?.(M.state)}catch{}};

  M.BUILD=R.build;
  M.CORE='20260820-thursday-recovery';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:R.build,softwareReady:false,note:'Thursday recovery loaded; physical Android/PWA acceptance remains required'});

  // 1. LOCAL PERFORMANCE BRIDGE ------------------------------------------------
  // Engines ask one synchronous local resolver. No fetch, cloud pull or hydration
  // is allowed from this path.
  const oldT400=T.t400?.bind(T), oldPb=T.pb?.bind(T);
  const cache={sig:'',t400:new Map(),pb:new Map()};
  const arrSig=a=>Array.isArray(a)?`${a.length}:${a.at(-1)?.updated_at||a.at(-1)?.created_at||a.at(-1)?.id||''}`:'0';
  function signature(state=M.state){const refs=M.refs?.data||{};return[
    arrSig(state?.trainingTestResults||state?.training_test_results),arrSig(state?.coachResults||state?.coach_results),arrSig(state?.resultsEventHistory||state?.results_event_history),arrSig(state?.resultsPbBoard||state?.results_pb_board),arrSig(refs.coach_results),arrSig(refs.results_event_history),arrSig(refs.results_pb_board)
  ].join('|')}
  function ensure(state){const s=signature(state);if(s!==cache.sig){cache.sig=s;cache.t400.clear();cache.pb.clear()}return cache}
  R.invalidatePerformance=()=>{cache.sig='';cache.t400.clear();cache.pb.clear()};
  if(oldT400)T.t400=(ath,state=M.state,course='',stroke='Freestyle')=>{const c=ensure(state),k=[ath?.id,txt(course).toUpperCase(),normStroke(stroke)].join('|');if(!c.t400.has(k))c.t400.set(k,oldT400(ath,state,course,normStroke(stroke)));return c.t400.get(k)};
  if(oldPb)T.pb=(ath,state=M.state,spec={})=>{const c=ensure(state),k=[ath?.id,txt(spec.course).toUpperCase(),Number(spec.distance),normStroke(spec.stroke)].join('|');if(!c.pb.has(k))c.pb.set(k,oldPb(ath,state,{...spec,stroke:normStroke(spec.stroke)}));return c.pb.get(k)};
  M.performanceBridge={ask:(kind,p={})=>kind==='t400'?T.t400(p.athlete,p.state||M.state,p.course,p.stroke):kind==='pb'?T.pb(p.athlete,p.state||M.state,p):null,invalidate:R.invalidatePerformance};

  // 2. ROUND SCOPE REPAIR -------------------------------------------------------
  // Blank formatting lines no longer terminate an authored N Rounds group.
  const oldParse=M.parser.parse.bind(M.parser);
  const topHeading=s=>/^(warm\s*up|pre\s*set|main\s*set|post\s*set|warm\s*down|cool\s*down|test)\b/i.test(txt(s));
  function repairRounds(raw){const lines=String(raw||'').replace(/\r/g,'').split('\n'),out=[];let inRounds=false;for(const line of lines){const t=txt(line);if(topHeading(t)){inRounds=false;out.push(line);continue}if(/^\d{1,2}\s+rounds?\s*:?$/i.test(t)){inRounds=true;out.push(line);continue}if(inRounds&&!t)continue;out.push(line)}return out.join('\n')}
  M.parser.parse=(source,identity={})=>{const original=String(source||''),fixed=repairRounds(original),s=oldParse(fixed,identity);s.currentSource={...(s.currentSource||{}),text:original,updatedAt:now()};s.metadata=s.metadata||{};s.metadata.thursdayRoundRepair=fixed!==original;s.metadata.parsedTotal=M.session?.total?.(s)||0;return s};
  R.repairRounds=repairRounds;

  // 3. RUSHTON NO-T400 FALLBACK ------------------------------------------------
  // Clive Rushton's Cone remains the physiology reference. These are coaching
  // guides, not hard athlete limits, especially for younger swimmers.
  const rushton={
    Regeneration:{hr:'<140',sr:'<30'},
    Development:{hr:'<140',sr:'~30'},
    Overload:{hr:'~150',sr:'31–33'},
    Threshold:{hr:'160–165',sr:'33–35'},
    Clearance:{hr:'165–185',sr:'35–45'}
  };
  R.rushtonGuide=(zone,stroke='Freestyle')=>{const z=rushton[zone];if(!z)return null;const st=normStroke(stroke)||'Freestyle';return`${st} · HR ${z.hr}${st==='Freestyle'?` · SR ${z.sr}`:''} · Rushton`};
  const oldForItem=T.forItem.bind(T);
  T.forItem=(session,item,ath,state=M.state)=>{const r=oldForItem(session,item,ath,state);if(r?.status!=='missing'||!item?.zone)return r;const stroke=normStroke(item.stroke||'Freestyle');if(!/No .*T400 loaded/i.test(txt(r.message)))return r;return{...r,message:R.rushtonGuide(item.zone,stroke)||r.message,source:'Rushton Cone',fallback:'hr_sr'}};

  // 4. MODIFICATION / POOL-END ALIGNMENT --------------------------------------
  // Automatic modification should finish each repeat at the coaching/start end.
  // Explicit coach edits are never rewritten.
  const oldAdapt=A.item.bind(A);
  A.item=(item,ath,state=M.state,session=null)=>{const out=oldAdapt(item,ath,state,session);if(!item||!out||item.kind!=='set')return out;const explicit=(state?.adaptationOverrides||[]).some(x=>x.sessionId===session?.id&&x.itemId===item.id&&x.athleteId===ath?.id&&x.active!==false);if(explicit)return out;const d=Number(out.distance),base=Number(item.distance),pool=/LCM/i.test(txt(session?.identity?.course))?50:25;if(!Number.isFinite(d)||d<100||d===base)return out;const lengths=d/pool;if(Math.abs(lengths-Math.round(lengths))>.001||Math.round(lengths)%2===0)return out;const unit=pool*2,down=Math.max(unit,Math.floor(d/unit)*unit),up=Math.ceil(d/unit)*unit;let fixed=Math.abs(d-down)<=Math.abs(up-d)?down:up;if(fixed>base&&down<=base)fixed=down;if(fixed!==d){out.distance=fixed;const raw=txt(out.raw||out.text);if(/^\d+\s*[x×]\s*\d+(?:\.5)?/i.test(raw))out.raw=raw.replace(/^(\d+\s*[x×]\s*)\d+(?:\.5)?/i,`$1${fixed}`);out.text=out.raw||out.text;out.adaptationReason=[txt(out.adaptationReason),`pool-end ${d}→${fixed}`].filter(Boolean).join(' · ')}return out};

  // 5. COMPACT BOARD NAMES ------------------------------------------------------
  const canonicalInitials=UI.initials?.bind(UI);
  const preferred=a=>txt(a?.board_name||a?.boardName||a?.nickname||a?.preferred_name||a?.preferredName);
  function first(a){return txt(a?.full_name).split(/\s+/)[0]||canonicalInitials?.(a)||'?'}
  R.boardName=(ath,pool=[])=>{if(!ath)return'?';const nick=preferred(ath);if(nick)return nick;const f=first(ath);const collisions=(pool||[]).filter(x=>x?.id!==ath.id&&!preferred(x)&&first(x).toLowerCase()===f.toLowerCase());if(!collisions.length)return f;const parts=txt(ath.full_name).split(/\s+/),surname=parts.at(-1)||'';return `${f} ${surname.slice(0,3).toUpperCase()}`.trim()};
  UI.initials=ath=>R.boardName(ath,UI.presentAthletes?.()||[]);
  R.setBoardName=(id,value)=>{const a=(M.state?.athletes||[]).find(x=>x.id===id);if(!a)return false;a.board_name=txt(value);a.updated_at=now();save();return true};

  // 6. LIVE STROKE OVERRIDE ----------------------------------------------------
  function setStroke(session,item,ath,value){const rows=M.state.adaptationOverrides=M.state.adaptationOverrides||[],x=rows.find(r=>r.sessionId===session.id&&r.itemId===item.id&&r.athleteId===ath.id&&r.active!==false),stroke=value==='AUTO'?'':normStroke(value);if(stroke){if(x){x.patch=x.patch||{};x.patch.stroke=stroke;x.active=true;x.updatedAt=now()}else rows.push({id:U.uid?.('mod')||`mod-${Date.now()}`,sessionId:session.id,itemId:item.id,athleteId:ath.id,patch:{stroke},active:true,createdAt:now(),updatedAt:now()})}else if(x){x.patch=x.patch||{};delete x.patch.stroke;if(!Object.keys(x.patch).length)x.active=false;x.updatedAt=now()}R.invalidatePerformance();save();UI.renderBoard?.();Promise.resolve().then(()=>M.cloud?.stageAdaptationsForSession?.(session)).catch(()=>{})}
  R.setStroke=setStroke;
  function addStrokeControls(host,s){for(const section of host.querySelectorAll('.pool-target-set[data-target-item]')){if(section.querySelector('.thu-stroke-controls'))continue;const item=M.session?.findItem?.(s,section.dataset.targetItem)?.item;if(!item||item.kind!=='set')continue;const athletes=UI.presentAthletes?.()||[];if(!athletes.length)continue;const box=document.createElement('div');box.className='thu-stroke-controls';box.innerHTML=athletes.map(a=>{const actual=A.item(item,a,M.state,s),st=normStroke(actual.stroke||item.stroke||'Freestyle');return`<label><b>${U.escape(R.boardName(a,athletes))}</b><select data-thu-ath="${U.escape(a.id)}"><option value="AUTO">Auto</option>${['Freestyle','Backstroke','Breaststroke','Butterfly','IM'].map(v=>`<option value="${v}" ${st===v?'selected':''}>${v.replace('stroke','')}</option>`).join('')}</select></label>`}).join('');section.prepend(box);box.querySelectorAll('[data-thu-ath]').forEach(sel=>sel.addEventListener('change',()=>{const a=athletes.find(x=>x.id===sel.dataset.thuAth);if(a)setStroke(s,item,a,sel.value)}))}}

  // 7. BOARD LAYOUT + NICKNAME EDIT -------------------------------------------
  const oldBoard=UI.renderBoard.bind(UI);
  UI.renderBoard=()=>{oldBoard();const h=document.querySelector('#boardView'),s=M.currentSession?.();if(!h||!s)return;for(const line of h.querySelectorAll('.pool-line'))if(line.querySelector('.pool-mods'))line.classList.add('thu-has-mods');h.querySelectorAll('details.pool-targets').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)queueMicrotask(()=>addStrokeControls(d,s))}));h.querySelectorAll('details.pool-targets[open]').forEach(d=>addStrokeControls(d,s))};
  const oldAthletes=UI.renderAthletes?.bind(UI);
  if(oldAthletes)UI.renderAthletes=()=>{oldAthletes();const ath=(M.state?.athletes||[]).find(a=>a.id===M.state?.settings?.selectedAthleteId),hero=document.querySelector('#v4SwimmerSnapshot .v4-swimmer-hero');if(!ath||!hero||hero.querySelector('.thu-board-name'))return;const b=document.createElement('button');b.className='thu-board-name';b.textContent=`Board name · ${R.boardName(ath,[ath])}`;b.onclick=()=>{const v=prompt('Preferred Board name / nickname (blank = automatic first name)',preferred(ath));if(v===null)return;R.setBoardName(ath.id,v);UI.renderAthletes()};hero.appendChild(b)};

  // New T400 results immediately invalidate the bridge; existing timing code keeps
  // PB/slower/equal/baseline reporting and fastest-valid anchor behaviour.
  if(M.timing?.saveT400){const oldSave=M.timing.saveT400.bind(M.timing);M.timing.saveT400=function(){const out=oldSave(...arguments);R.invalidatePerformance();return out}}

  R.contract=()=>({build:R.build,localPerformanceBridge:!!M.performanceBridge,roundRepair:true,rushtonFallback:true,poolEndAlignment:true,compactNames:true,liveStrokeOverride:true,cloudCutoverLocked:M.RELEASE_ATTESTATION?.softwareReady!==true});
})(globalThis);
