'use strict';
/* McLay Swimming OS — Thursday deck-fit pass · 20 Aug 2026
   Poolside-only correction layer:
   - stroke-only overrides preserve the swimmer's automatic modification shape
   - IM remains a complete IM unit; reduce reps / extend cycle instead of inventing 50/75 IM
   - generated modified work finishes at the starting end where practical
   - Board defaults to one compact current-set view with every modified swimmer visible
   - TV Board shows the same current set in a projection-first layout
*/
(function(g){
  const M=g.MSOS4;
  if(!M?.targets||!M?.adapt||!M?.session||!M?.ui)return;
  const U=M.util,T=M.targets,A=M.adapt,S=M.session,UI=M.ui;
  const D=M.teamDisplay;
  const F=M.thursdayDeckFit={build:'v4-thursday-deckfit-20260820d'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>U?.escape?U.escape(v):String(v??'');
  const clock=v=>U?.clock?U.clock(Number(v)):String(v??'—');
  const now=()=>U?.now?.()||new Date().toISOString();
  const normStroke=v=>{const s=text(v).toLowerCase();if(/^(free|freestyle|fr)$/.test(s))return'Freestyle';if(/^(back|backstroke|bk)$/.test(s))return'Backstroke';if(/^(breast|breaststroke|br)$/.test(s))return'Breaststroke';if(/^(fly|butterfly)$/.test(s))return'Butterfly';if(/^(im|medley|individual medley)$/.test(s))return'IM';if(/^choice$/.test(s))return'Choice';return text(v)};
  const key=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const poolLength=s=>/LCM/i.test(text(s?.identity?.course))?50:25;
  const ceil5=n=>Math.ceil(Number(n||0)/5)*5;
  const save=()=>{try{M.store?.save?.(M.state)}catch{}};

  M.BUILD=F.build;M.CORE='20260820-thursday-deckfit';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:F.build,softwareReady:false,note:'Deck-fit Thursday pass loaded; live Android acceptance still required'});

  // -----------------------------------------------------------------------
  // 1. EXACT KNOWN T400 EVIDENCE FALLBACKS
  // -----------------------------------------------------------------------
  // These are coach-confirmed values already established in the coaching record.
  // They are only used if the wider local/reference evidence bridge still cannot
  // return a matching-stroke T400.
  const priorT400=T.t400?.bind(T);
  const protectedT400={
    'alexauer|Freestyle':323.0,
    'charlottemurphy|Backstroke':562.8,
    'conorfischer|Breaststroke':545.2
  };
  if(priorT400)T.t400=(ath,state=M.state,course='',stroke='Freestyle')=>{
    const wanted=normStroke(stroke||'Freestyle'),hit=priorT400(ath,state,course,wanted);
    if(hit)return hit;
    const seconds=protectedT400[`${key(ath)}|${wanted}`];
    return Number.isFinite(seconds)?{id:`protected-${key(ath)}-${wanted.toLowerCase()}`,athlete_id:ath?.id,result_seconds:seconds,stroke:wanted,valid_for_anchor:true,source_label:'Coach-confirmed T400 evidence'}:null;
  };

  // -----------------------------------------------------------------------
  // 2. MODIFICATION SHAPE — STROKE OVERRIDE MUST NOT ERASE AUTO ADAPTATION
  // -----------------------------------------------------------------------
  const priorAdapt=A.item.bind(A);
  const activeOverride=(item,ath,state,session)=>(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;
  const shapeOverride=ov=>!!(ov&&(ov.raw||['reps','distance','cycleSeconds','restSeconds'].some(k=>Object.prototype.hasOwnProperty.call(ov.patch||{},k))));
  const strokeOnly=ov=>{if(!ov||ov.raw)return false;const ks=Object.keys(ov.patch||{}).filter(k=>(ov.patch||{})[k]!==undefined);return ks.length===1&&ks[0]==='stroke'};
  function withoutOverride(state,ov){if(!ov)return state;return{...state,adaptationOverrides:(state?.adaptationOverrides||[]).map(x=>x===ov?{...x,active:false}:x)}}
  function replaceStroke(raw,stroke){
    const full=normStroke(stroke),s=text(raw);
    if(!s)return s;
    const re=/\b(?:Freestyle|Free|Backstroke|Back|Breaststroke|Breast|Butterfly|Fly|IM)\b/i;
    return re.test(s)?s.replace(re,full):`${s} · ${full}`;
  }
  function rewriteLead(out,reps,distance){
    const raw=text(out?.raw||out?.text),lead=`${Math.max(1,Number(reps)||1)} × ${Number(distance)||0}`;
    out.reps=Math.max(1,Number(reps)||1);out.distance=Number(distance)||0;
    out.raw=/^\d+\s*[x×]\s*\d+(?:\.5)?/i.test(raw)?raw.replace(/^\d+\s*[x×]\s*\d+(?:\.5)?/i,lead):`${lead}${raw?` · ${raw}`:''}`;
    out.text=out.raw;
  }
  function rewriteCueCounts(out,fromReps,toReps,fromCycle,toCycle){
    out.cues=(out.cues||[]).map(c=>{
      let s=text(c);
      if(Number(fromReps)!==Number(toReps))s=s.replace(new RegExp(`Descend\\s+1\\s*[—-]\\s*${Number(fromReps)}\\b`,'i'),`Descend 1—${Number(toReps)}`);
      if(Number(fromCycle)>0&&Number(toCycle)>0&&Number(fromCycle)!==Number(toCycle)){
        const old=clock(fromCycle).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');s=s.replace(new RegExp(`@\\s*${old}\\b`,'i'),`@ ${clock(toCycle)}`);
      }
      return s;
    });
  }
  function isIM(item){return normStroke(item?.stroke)==='IM'||/\bIM\b|individual\s+medley/i.test(text(item?.raw||item?.text))}
  function profileRatio(ath,state){const p=A.profile?.(ath,state);return{...(p||{}),ratio:Number(p?.ratio)||1}}
  function imSafe(out,item,ath,state,session,ov){
    if(!item||item.kind!=='set'||!isIM(item)||shapeOverride(ov))return out;
    const profile=profileRatio(ath,state);if(profile.ratio>=.98)return out;
    const reps=Math.max(1,Number(item.reps)||1),distance=Number(item.distance)||0;
    if(distance<100)return out; // never invent a shortened IM unit.
    const modReps=Math.max(1,Math.min(reps,Math.round(reps*profile.ratio)));
    rewriteLead(out,modReps,distance);out.stroke='IM';
    const originalCycle=Number(item.cycleSeconds)||0;
    if(originalCycle&&modReps<reps){
      const sameWindow=ceil5((reps*originalCycle)/modReps);
      const pb=T.pb?.(ath,state,{distance,stroke:'IM',course:session?.identity?.course||''});
      const evidenceCycle=pb?ceil5(Number(pb._anchor_seconds)+10):0;
      out.cycleSeconds=Math.max(sameWindow,evidenceCycle||0);
      rewriteCueCounts(out,reps,modReps,originalCycle,out.cycleSeconds);
    }else rewriteCueCounts(out,reps,modReps,0,0);
    out.adaptationReason='';
    return out;
  }
  function returnToStart(out,item,ath,state,session,ov){
    if(!item||item.kind!=='set'||shapeOverride(ov))return out;
    const profile=profileRatio(ath,state);if(profile.ratio>=.98)return out;
    const changed=Number(out.reps)!==Number(item.reps)||Number(out.distance)!==Number(item.distance);if(!changed)return out;
    const pool=poolLength(session),distance=Number(out.distance)||0,reps=Number(out.reps)||1;if(!pool||!distance)return out;
    const lengths=(reps*distance)/pool;if(Math.abs(lengths-Math.round(lengths))<.001&&Math.round(lengths)%2===0)return out;
    const target=(Number(item.reps)||1)*(Number(item.distance)||0)*profile.ratio,maxReps=Math.max(1,Number(item.reps)||1),candidates=[];
    for(let r=1;r<=maxReps;r++){
      const n=(r*distance)/pool;if(Math.abs(n-Math.round(n))>.001||Math.round(n)%2)continue;
      candidates.push({reps:r,metres:r*distance,delta:Math.abs(r*distance-target)});
    }
    if(!candidates.length)return out;
    candidates.sort((a,b)=>a.delta-b.delta||a.metres-b.metres);const best=candidates[0];
    if(best.reps!==reps){rewriteLead(out,best.reps,distance);rewriteCueCounts(out,reps,best.reps,0,0)}
    out.adaptationReason='';return out;
  }
  A.item=(item,ath,state=M.state,session=null)=>{
    const ov=activeOverride(item,ath,state,session);let out;
    if(strokeOnly(ov)){
      out=priorAdapt(item,ath,withoutOverride(state,ov),session);
      out.stroke=normStroke(ov.patch.stroke);out.raw=replaceStroke(out.raw||out.text,out.stroke);out.text=out.raw;
    }else out=priorAdapt(item,ath,state,session);
    out=imSafe(out,item,ath,state,session,ov);
    out=returnToStart(out,item,ath,state,session,ov);
    return out;
  };

  // -----------------------------------------------------------------------
  // 3. COMPACT DISPLAY LANGUAGE
  // -----------------------------------------------------------------------
  function shortText(v){return text(v)
    .replace(/\bFreestyle\b/gi,'Fr').replace(/\bBackstroke\b/gi,'Bk').replace(/\bBreaststroke\b/gi,'Br').replace(/\bButterfly\b/gi,'Fly')
    .replace(/\bRegeneration\b/gi,'REG').replace(/\bDevelopment\b/gi,'DEV').replace(/\bThreshold\b/gi,'THR').replace(/\bOverload\b/gi,'OL').replace(/\bClearance\b/gi,'CL')
    .replace(/\s+×\s+/g,'×').replace(/\s+@\s+/g,' @ ').replace(/\s+·\s+/g,' · ')}
  function preferred(a){return text(a?.board_name||a?.boardName||a?.nickname||a?.preferred_name||a?.preferredName)}
  function boardName(a,pool=[],crowded=false){
    if(!a)return'?';const nick=preferred(a);if(nick)return nick;
    const parts=text(a.full_name).split(/\s+/).filter(Boolean),first=parts[0]||'?',last=parts.at(-1)||'';
    const sameFirst=(pool||[]).filter(x=>x?.id!==a.id&&text(x.full_name).split(/\s+/)[0]?.toLowerCase()===first.toLowerCase());
    if(sameFirst.length)return last.slice(0,3).toUpperCase()||first;
    if(crowded&&parts.length>1)return `${parts[0][0]||''}${last[0]||''}`.toUpperCase();
    return first;
  }
  F.shortText=shortText;F.boardName=boardName;

  // -----------------------------------------------------------------------
  // 4. CURRENT-SET PHONE BOARD
  // -----------------------------------------------------------------------
  function focusBlock(session){
    M.state.settings=M.state.settings||{};M.state.settings.boardBlockBySession=M.state.settings.boardBlockBySession||{};
    let id=M.state.settings.boardBlockBySession[session.id],b=(session.blocks||[]).find(x=>x.id===id);
    if(!b)b=(session.blocks||[]).find(x=>x.type==='main_set')||(session.blocks||[])[0]||null;
    if(b&&!id)M.state.settings.boardBlockBySession[session.id]=b.id;return b;
  }
  function blockCode(b){const t=text(b?.type||b?.title).toLowerCase();if(/warm.?up/.test(t))return'WU';if(/pre/.test(t))return'PRE';if(/main/.test(t))return'MAIN';if(/post/.test(t))return'POST';if(/warm.?down|cool/.test(t))return'WD';return text(b?.title).slice(0,4).toUpperCase()}
  const baseBoard=UI.renderBoard.bind(UI);
  function deckFitBoard(){
    const host=document.querySelector('#boardView'),s=M.currentSession?.();if(!host||!s)return;
    const mode=M.state.settings.boardFocusMode!==false,fb=focusBlock(s),mods=UI.modifiedAthletes?.()||[],athletes=UI.presentAthletes?.()||[];
    host.classList.toggle('thu4-set-view',mode);host.classList.toggle('thu4-whole-view',!mode);
    const quick=host.querySelector('.thu2-quick');if(quick&&!host.querySelector('.thu4-controls')){
      const nav=document.createElement('div');nav.className='thu4-controls';
      nav.innerHTML=`<button data-thu4-mode>${mode?'WHOLE':'SET'}</button><div>${(s.blocks||[]).map(b=>`<button data-thu4-block="${esc(b.id)}" class="${b.id===fb?.id?'active':''}">${esc(blockCode(b))}</button>`).join('')}</div>`;
      quick.insertAdjacentElement('afterend',nav);
      nav.querySelector('[data-thu4-mode]').onclick=()=>{M.state.settings.boardFocusMode=!mode;save();UI.renderBoard()};
      nav.querySelectorAll('[data-thu4-block]').forEach(b=>b.onclick=()=>{M.state.settings.boardFocusMode=true;M.state.settings.boardBlockBySession[s.id]=b.dataset.thu4Block;save();UI.renderBoard()});
    }
    host.querySelectorAll('.thu2-block').forEach(el=>{const active=!mode||el.dataset.blockId===fb?.id;el.hidden=!active});
    const selector=host.querySelector('.thu2-mod-selector');if(selector)selector.innerHTML=`<span>MOD</span><b>${mods.length}</b>`;
    host.querySelectorAll('.thu2-line-head strong,.thu2-line-head small,.thu3-mod-ath b,.thu3-mod-ath em,.thu2-cue').forEach(el=>el.textContent=shortText(el.textContent));
    host.querySelectorAll('.thu2-line-head em').forEach(el=>{const t=text(el.textContent);el.textContent=/Targets/i.test(t)?'T›':/Close/i.test(t)?'×':'›'});
    host.querySelectorAll('.thu3-mod-ath').forEach(card=>{const btn=card.querySelector('[data-thu3-mod]'),id=btn?.dataset.thu3Mod?.split(':')[0],ath=mods.find(a=>a.id===id);const n=card.querySelector('header strong');if(n&&ath)n.textContent=boardName(ath,mods,mods.length>=4)});
    host.querySelectorAll('.thu2-target-row').forEach(row=>{const sel=row.querySelector('[data-thu2-stroke]'),id=sel?.dataset.thu2Stroke?.split(':')[0],ath=athletes.find(a=>a.id===id),n=row.querySelector('b');if(n&&ath)n.textContent=boardName(ath,athletes,false);row.querySelector('span')&&(row.querySelector('span').textContent=shortText(row.querySelector('span').textContent));if(sel){for(const o of sel.options){const x=normStroke(o.value);o.textContent=o.value==='AUTO'?'A':x==='Freestyle'?'Fr':x==='Backstroke'?'Bk':x==='Breaststroke'?'Br':x==='Butterfly'?'Fly':x==='IM'?'IM':o.textContent}}});
  }
  UI.renderBoard=()=>{baseBoard();deckFitBoard()};

  // -----------------------------------------------------------------------
  // 5. TV = CURRENT SET, ALL SWIMMERS, NO EXPLANATION TEXT
  // -----------------------------------------------------------------------
  function targetLabel(t){if(!t||t.kind==='none')return'';if(t.kind==='missing')return shortText(t.label||'—');return[shortText(t.label||''),t.sendOff?`on ${shortText(t.sendOff)}`:''].filter(Boolean).join(' · ')}
  function tvNames(group,modelAthletes){if(group.athletes.length===modelAthletes.length)return'GROUP';const pool=(M.state.athletes||[]).filter(a=>modelAthletes.some(x=>x.id===a.id));return group.athletes.map(x=>boardName((M.state.athletes||[]).find(a=>a.id===x.id)||x,pool,pool.length>=9)).join(' · ')}
  function tvNode(node,total,modelAthletes){
    if(node.kind==='cue')return`<div class="thu4-tv-cue">${esc(shortText(node.text))}</div>`;
    if(node.kind==='group')return`<section class="thu4-tv-group"><header><b>${Number(node.rounds)||1}×</b><span>${esc(shortText(node.text||''))}</span></header>${(node.items||[]).map(x=>tvNode(x,total,modelAthletes)).join('')}</section>`;
    return`<section class="thu4-tv-line"><h3>${esc(shortText(node.sourceWork))}</h3><div class="thu4-tv-groups">${(node.groups||[]).map(group=>`<article class="thu4-tv-card"><strong>${esc(tvNames(group,modelAthletes))}</strong><b>${esc(shortText(group.work))}</b>${targetLabel(group.target)?`<em>${esc(targetLabel(group.target))}</em>`:''}${group.cue?`<small>${esc(shortText(group.cue))}</small>`:''}</article>`).join('')}</div></section>`;
  }
  if(D?.model){UI.renderTV=()=>{
    const h=document.querySelector('#tvView');if(!h)return;if(!M.access?.can?.('display.tv')){h.innerHTML='<section class="empty-card"><h2>TV Board unavailable</h2></section>';return}
    const model=D.model(),s=M.currentSession?.();if(!model||!s){h.innerHTML='<section class="empty-card"><h2>No session selected</h2></section>';return}
    const fb=focusBlock(s),block=(model.blocks||[]).find(b=>b.id===fb?.id)||(model.blocks||[])[0],total=model.athletes.length;
    h.innerHTML=`<section class="thu4-tv-hero"><div><span>CURRENT SET</span><h1>${esc(shortText(block?.title||model.title))}</h1></div><strong>${Number(block?.distance||0).toLocaleString()}m</strong><button id="exitTvBtn">Coach</button></section><div class="thu4-tv-blocks">${(s.blocks||[]).map(b=>`<button data-thu4-tv-block="${esc(b.id)}" class="${b.id===block?.id?'active':''}">${esc(blockCode(b))}</button>`).join('')}</div><main class="thu4-tv-set">${(block?.items||[]).map(x=>tvNode(x,total,model.athletes)).join('')}</main>`;
    h.querySelector('#exitTvBtn').onclick=()=>M.nav.show('board',{restoreScroll:false});h.querySelectorAll('[data-thu4-tv-block]').forEach(b=>b.onclick=()=>{M.state.settings.boardBlockBySession[s.id]=b.dataset.thu4TvBlock;save();UI.renderTV()});
  }}

  F.contract=()=>({build:F.build,strokeOverridePreservesAdaptation:true,imProtected:true,returnToStart:true,currentSetBoard:true,currentSetTV:true,compactNames:true,compactStrokeLabels:true,reasonTextHidden:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>UI.renderCurrent?.(),0),{once:true});else setTimeout(()=>UI.renderCurrent?.(),0);
})(globalThis);
