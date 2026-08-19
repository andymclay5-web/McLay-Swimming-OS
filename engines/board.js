'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M?.ui||!E?.Coordinator||!E?.Modification||!E?.Evidence)return;
  const UI=M.ui,U=M.util,B=M.boardEngine={build:'v4-board-whiteboard-20260820h'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim(),esc=v=>U?.escape?U.escape(v):text(v),clock=s=>U?.clock?U.clock(Number(s)):text(s);
  const short=v=>text(v).replace(/\bFreestyle\b/gi,'Fr').replace(/\bBackstroke\b/gi,'Bk').replace(/\bBreaststroke\b/gi,'Br').replace(/\bButterfly\b/gi,'Fly').replace(/\bRegeneration\b/gi,'REG').replace(/\bDevelopment\b/gi,'DEV').replace(/\bOverload\b/gi,'OL').replace(/\bThreshold\b/gi,'THR').replace(/\bClearance\b/gi,'CL').replace(/\bRace Pace\b/gi,'RP');
  const preferred=a=>text(a?.board_name||a?.boardName||a?.nickname||a?.preferred_name||a?.preferredName);
  function name(a,pool=[]){if(!a)return'?';const nick=preferred(a);if(nick)return nick;const parts=text(a.full_name).split(/\s+/).filter(Boolean),first=parts[0]||'?',same=pool.filter(x=>x?.id!==a.id&&!preferred(x)&&text(x.full_name).split(/\s+/)[0]?.toLowerCase()===first.toLowerCase());return same.length?`${first} ${(parts.at(-1)||'').slice(0,3).toUpperCase()}`:first;}
  B.name=name;
  const zoneShort=z=>({Regeneration:'REG',Development:'DEV',Overload:'OL',Threshold:'THR',Clearance:'CL'})[z]||short(z);
  function itemDistance(n){if(!n)return 0;if(n.kind==='set')return(Math.max(1,Number(n.reps)||1))*(Number(n.distance)||0);if(n.kind==='group')return Math.max(1,Number(n.rounds)||1)*(n.items||[]).reduce((s,x)=>s+itemDistance(x),0);return 0;}
  const blockDistance=b=>(b?.items||[]).reduce((s,x)=>s+itemDistance(x),0),sessionDistance=s=>(s?.blocks||[]).reduce((n,b)=>n+blockDistance(b),0);
  function compactPattern(item){const p=item?.repPattern||[];if(!p.length)return'';const groups=[];for(const x of p){const z=zoneShort(x.zone);const last=groups.at(-1);if(last&&last.z===z)last.n++;else groups.push({z,n:1});}if(groups.length===1)return groups[0].n>1?`${groups[0].n} ${groups[0].z}`:groups[0].z;return groups.map(x=>`${x.n>1?x.n+' ':''}${x.z}`).join(' / ');}
  function compactRace(item){const rows=item?.repInstructions||[];if(!rows.some(x=>x.raceIntent))return'';const non=rows.filter(x=>!x.raceIntent),race=rows.filter(x=>x.raceIntent),bits=[];if(non.length){if(non.length===1)bits.push(`#${non[0].rep} ${short(non[0].label||'Build')}`);else bits.push(`#${non[0].rep}-${non.at(-1).rep} ${short(non[0].label||'Build')}`);}if(race.length){const d=race[0].raceIntent?.distance||item?.raceIntent?.distance||'';bits.push(`#${race[0].rep}${race.length>1?`-${race.at(-1).rep}`:''} RP${d}`);}return bits.join(' · ');}
  function composition(item){const c=item?.composition||[];return c.length?c.map(x=>`${x.distance} ${short(x.text)}`).join(' / '):'';}
  function cueText(item){
    const structured=compactPattern(item)||compactRace(item)||composition(item);if(structured)return structured;
    const cues=(item?.cues||[]).map(short).filter(Boolean);if(!cues.length){const raw=short(item?.raw||item?.text).replace(/^\d+\s*[x×]\s*\d+(?:\.5)?\s*/i,'');return raw.replace(/^(Fr|Bk|Br|Fly|IM)\b\s*/,'');}
    let s=cues.join(' · ').replace(/#1\s+OL\s*·\s*#2\s+OL\s*·\s*#3\s+OL\s*·\s*#4\s+OL\s*·\s*#5\s+THR\s*·\s*#6\s+THR\s*·\s*#7\s+THR\s*·\s*#8\s+THR/i,'4 OL / 4 THR');
    s=s.replace(/Build through each \d+/i,'Build').replace(/Strong final 25 Fr/i,'Last 25 strong').replace(/Attack last turn and underwater · Hold the line and finish strong/i,'Race-quality finish');return s;
  }
  function workLabel(item){
    const reps=Math.max(1,Number(item?.reps)||1),d=Number(item?.distance)||0,raw=short(item?.raw||item?.text),st=short(E.Evidence.stroke(item?.stroke||'')),eq=(item?.equipment||[]).map(short).join('+');
    if(/Upper-body equivalent/i.test(raw))return`${reps}×${d} Upper-body`;
    let label=`${reps>1?reps+'×':''}${d}`;if(st&&st!=='Choice')label+=` ${st}`;if(eq&&!new RegExp(`\\b${eq}\\b`,'i').test(label))label+=` ${eq}`;if(/\bMAX\b/i.test(raw)&&!/MAX/i.test(label))label+=' MAX';return label;
  }
  function targetIntent(item){return !!(item?.targetSeconds||item?.zone||(item?.repPattern||[]).length||item?.raceIntent||(item?.repInstructions||[]).some(x=>x.raceIntent));}
  function targetAtom(seconds,sendOff){const a=clock(seconds);return sendOff?`${a}/${clock(sendOff)}`:a;}
  function targetSummary(r){
    if(!r||r.status==='none')return'';
    if(r.status==='ok')return targetAtom(r.seconds,r.sendOff);
    if(r.status==='fallback')return[`HR ${r.hr||''}`,r.sr?`SR ${r.sr}`:''].filter(Boolean).join(' · ');
    if(r.status==='missing')return short(r.message||'Target needed');
    if(r.status==='pattern'){
      const seen=new Map();for(const x of r.rows||[]){const k=zoneShort(x.zone),v=targetAtom(x.seconds,x.sendOff);if(!seen.has(k))seen.set(k,v);}return[...seen].map(([k,v])=>`${k} ${v}`).join(' · ');
    }
    if(r.status==='pattern_fallback'){
      const seen=new Map();for(const x of r.rows||[]){const k=zoneShort(x.zone),v=[x.hr?`HR ${x.hr}`:'',x.sr?`SR ${x.sr}`:''].filter(Boolean).join(' ');if(!seen.has(k))seen.set(k,v);}return[...seen].map(([k,v])=>`${k} ${v}`).join(' · ');
    }
    if(r.status==='rep_race'){
      const rows=r.rows||[],bits=[];const non=rows.filter(x=>x.status==='none');if(non.length)bits.push(non.length===1?`#${non[0].rep} ${short(non[0].label||'Build')}`:`#${non[0].rep}-${non.at(-1).rep} Build`);
      const ok=rows.filter(x=>x.status==='ok'),missing=rows.filter(x=>x.status==='missing');if(ok.length){const groups=[];for(const x of ok){const v=targetAtom(x.seconds,x.sendOff),last=groups.at(-1);if(last&&last.v===v)last.end=x.rep;else groups.push({start:x.rep,end:x.rep,v});}for(const x of groups)bits.push(`#${x.start}${x.end>x.start?'-'+x.end:''} ${x.v}`);}if(missing.length){const unique=[...new Set(missing.map(x=>short(x.message||'PB needed')))];bits.push(unique.join(' / '));}return bits.join(' · ');
    }
    return'';
  }
  function present(){return UI.presentAthletes?.()||[];}
  function modified(){const p=present(),m=UI.modifiedAthletes?.();if(Array.isArray(m)&&m.length)return m;return p.filter(a=>Number(E.Modification.profile(a,M.state).ratio)<.98||text(a.modifications));}
  function setStroke(session,item,ath,value){
    const rows=M.state.adaptationOverrides=M.state.adaptationOverrides||[],x=rows.find(r=>r.sessionId===session.id&&r.itemId===item.id&&r.athleteId===ath.id&&r.active!==false),stroke=value==='AUTO'?'':E.Evidence.stroke(value);
    if(stroke){if(x){x.patch=x.patch||{};x.patch.stroke=stroke;x.active=true;x.updatedAt=new Date().toISOString();}else rows.push({id:U.uid?.('mod')||`mod-${Date.now()}`,sessionId:session.id,itemId:item.id,athleteId:ath.id,patch:{stroke},active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}
    else if(x){x.patch=x.patch||{};delete x.patch.stroke;if(!Object.keys(x.patch).length)x.active=false;x.updatedAt=new Date().toISOString();}
    M.store?.save?.(M.state);UI.renderBoard?.();
  }
  function selectedStroke(session,item,ath){const ov=(M.state?.adaptationOverrides||[]).find(r=>r.sessionId===session.id&&r.itemId===item.id&&r.athleteId===ath.id&&r.active!==false);return ov?.patch?.stroke||'AUTO';}
  function athleteLink(a,pool){return`<button class="msos-name" data-msos-ath="${esc(a.id)}">${esc(name(a,pool))}</button>`;}
  function strokePill(session,item,a){const v=selectedStroke(session,item,a),lab=v==='AUTO'?'Auto':short(v);return`<button class="msos-stroke-pill" data-msos-stroke="${esc(item.id)}:${esc(a.id)}" aria-label="Change stroke for ${esc(name(a,present()))}">${esc(lab)}</button>`;}
  function targetCard(session,item,a){const r=E.Coordinator.targetForItem(session,item,a,M.state);return`<div class="msos-target-card"> <div>${athleteLink(a,present())}${strokePill(session,item,a)}</div><span>${esc(targetSummary(r)||'—')}</span></div>`;}
  function modCell(session,item,mods){
    if(!mods.length)return'';const rows=[];
    for(const a of mods){const actual=E.Modification.adaptItem(item,a,M.state,session),changed=!E.Modification.samePrescription(item,actual),r=targetIntent(item)?E.Coordinator.targetForItem(session,actual,a,M.state):{status:'none'},target=targetSummary(r);if(!changed&&!target)continue;const work=changed?workLabel(actual):'',cue=changed?cueText(actual):'';rows.push(`<div class="msos-mod-row"><div class="msos-mod-top">${athleteLink(a,mods)}${targetIntent(item)?strokePill(session,item,a):''}</div>${work?`<b>${esc(work)}</b>`:''}${cue&&cue!==work?`<small>${esc(cue)}</small>`:''}${target?`<span>${esc(target)}</span>`:''}</div>`);}return rows.join('');
  }
  function setRow(session,item,groupAth,mods){const intent=targetIntent(item),id=esc(item.id);return`<div class="msos-work-row" data-item="${id}"><div class="msos-group-cell"><div class="msos-work-head"><b>${esc(workLabel(item))}</b>${intent?`<button class="msos-times-btn" data-msos-times="${id}">Times</button>`:''}</div>${cueText(item)?`<small>${esc(cueText(item))}</small>`:''}</div><div class="msos-mod-cell">${modCell(session,item,mods)}</div><div class="msos-target-panel" data-msos-panel="${id}" hidden>${groupAth.length?groupAth.map(a=>targetCard(session,item,a)).join(''):'<span class="msos-none">Group swimmers use modified side</span>'}</div></div>`;}
  function nodeRows(session,node,groupAth,mods){if(node?.kind==='set')return setRow(session,node,groupAth,mods);if(node?.kind==='group')return`<div class="msos-rounds"><div class="msos-round-label">${Math.max(1,Number(node.rounds)||1)} ROUNDS${node.label?` · ${esc(short(node.label))}`:''}</div>${(node.items||[]).map(x=>nodeRows(session,x,groupAth,mods)).join('')}</div>`;if(node?.kind==='cue')return`<div class="msos-board-cue">${esc(short(node.text||node.raw))}</div>`;return'';}
  function blockCode(b){const t=text(b?.type||b?.title).toLowerCase();if(/warm.?up/.test(t))return'WU';if(/pre/.test(t))return'PRE';if(/main/.test(t))return'MAIN';if(/post/.test(t))return'POST';if(/warm.?down|cool/.test(t))return'WD';return text(b?.title).slice(0,4).toUpperCase();}
  function blockHtml(session,b,groupAth,mods){return`<section class="msos-board-block" data-block="${esc(b.id)}"><header><div><small>${esc(blockCode(b))}</small><h2>${esc(b.title||'Set')}</h2></div><b>${blockDistance(b).toLocaleString()}m</b><span>${mods.length?`MOD ${mods.length}`:''}</span></header><div class="msos-board-grid">${(b.items||[]).map(x=>nodeRows(session,x,groupAth,mods)).join('')}</div></section>`;}
  function route(view){M.state.settings=M.state.settings||{};M.state.settings.view=view;M.store?.save?.(M.state);UI.renderCurrent?.();}
  function bind(host,session,mods){
    host.querySelectorAll('[data-msos-times]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.msosTimes,p=host.querySelector(`[data-msos-panel="${CSS.escape(id)}"]`),open=!p.hidden;host.querySelectorAll('.msos-target-panel').forEach(x=>x.hidden=true);host.querySelectorAll('.msos-times-btn').forEach(x=>x.textContent='Times');p.hidden=open;btn.textContent=open?'Times':'Close';});
    host.querySelectorAll('[data-msos-ath]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();M.state.settings=M.state.settings||{};M.state.settings.selectedAthleteId=btn.dataset.msosAth;M.state.settings.selectedSwimmerId=btn.dataset.msosAth;route('swimmer');});
    host.querySelectorAll('[data-msos-stroke]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const [itemId,athId]=btn.dataset.msosStroke.split(':'),item=findItem(session,itemId),ath=present().find(a=>a.id===athId);if(!item||!ath)return;const menu=document.createElement('div');menu.className='msos-stroke-menu';for(const [v,l] of [['AUTO','Auto'],['Freestyle','Fr'],['Backstroke','Bk'],['Breaststroke','Br'],['Butterfly','Fly'],['IM','IM']]){const b=document.createElement('button');b.textContent=l;b.onclick=ev=>{ev.stopPropagation();setStroke(session,item,ath,v)};menu.appendChild(b);}btn.parentElement.appendChild(menu);setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),0);});
    host.querySelector('[data-msos-mode]')?.addEventListener('click',()=>{M.state.settings.boardFocusMode=M.state.settings.boardFocusMode===false;M.store?.save?.(M.state);UI.renderBoard();});
    host.querySelectorAll('[data-msos-block]').forEach(btn=>btn.onclick=()=>{M.state.settings.boardFocusMode=true;M.state.settings.boardBlockBySession=M.state.settings.boardBlockBySession||{};M.state.settings.boardBlockBySession[session.id]=btn.dataset.msosBlock;M.store?.save?.(M.state);UI.renderBoard();});
    host.querySelector('[data-msos-roll]')?.addEventListener('click',()=>route('roll'));host.querySelector('[data-msos-t400]')?.addEventListener('click',()=>route('times'));host.querySelector('[data-msos-swimmers]')?.addEventListener('click',()=>route('swimmer'));
  }
  function findItem(session,id){let hit=null;const walk=items=>{for(const n of items||[]){if(n?.id===id){hit=n;return;}if(n?.kind==='group')walk(n.items);if(hit)return;}};for(const b of session?.blocks||[]){walk(b.items);if(hit)break;}return hit;}
  function render(){
    const host=document.querySelector('#boardView'),session=M.currentSession?.();if(!host)return;if(!session){host.innerHTML='<div class="empty">No session selected.</div>';return;}
    const athletes=present(),mods=modified(),modIds=new Set(mods.map(a=>a.id)),groupAth=athletes.filter(a=>!modIds.has(a.id));M.state.settings=M.state.settings||{};M.state.settings.boardBlockBySession=M.state.settings.boardBlockBySession||{};
    const focus=M.state.settings.boardFocusMode!==false;let active=(session.blocks||[]).find(b=>b.id===M.state.settings.boardBlockBySession[session.id]);if(!active)active=(session.blocks||[]).find(b=>b.type==='main_set')||(session.blocks||[])[0];if(active)M.state.settings.boardBlockBySession[session.id]=active.id;
    const blocks=focus&&active?[active]:(session.blocks||[]),title=session.identity?.title||`${session.identity?.dayPart||''} · ${(session.identity?.squads||[]).join(' + ')}`||'Session';
    host.className='view active msos-whiteboard-engine';host.innerHTML=`<div class="msos-board-top"><div><small>${focus?'CURRENT SET':'WHOLE SESSION'}</small><h1>${esc(title)}</h1></div><b>${sessionDistance(session).toLocaleString()}m</b></div><div class="msos-board-quick"><button data-msos-roll>Roll · ${athletes.length}</button><button data-msos-t400>T400 / Times</button><button data-msos-swimmers>Swimmers</button></div><div class="msos-board-nav"><button data-msos-mode>${focus?'WHOLE':'SET'}</button>${(session.blocks||[]).map(b=>`<button data-msos-block="${esc(b.id)}" class="${focus&&b.id===active?.id?'active':''}">${esc(blockCode(b))}</button>`).join('')}</div>${blocks.map(b=>blockHtml(session,b,groupAth,mods)).join('')}`;bind(host,session,mods);
  }
  UI.renderBoard=render;B.render=render;B.targetSummary=targetSummary;B.workLabel=workLabel;B.cueText=cueText;
})(globalThis);