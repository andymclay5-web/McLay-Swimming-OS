'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M) throw new Error('MSOS4 missing');
  const U=M.util,S=M.session,A=M.adapt,T=M.targets,UI=M.ui=M.ui||{};
  const BUILD='v4-poolside-core-20260819f-targettruth';
  M.BUILD=BUILD; M.CORE='20260819-v4-poolside-core-targettruth';
  M.RELEASE_ATTESTATION=Object.freeze({
    ...(M.RELEASE_ATTESTATION||{}),
    build:BUILD,
    softwareReady:M.RELEASE_ATTESTATION?.softwareReady===true&&M.correct?.baseBuild?.match===true,
    generatedAt:'2026-08-19T16:30:00+12:00',
    suiteDigest:'v4-contract-20260819f-targettruth',
    packageDigest:'SHA256SUMS.txt'
  });
  const BASE_PARSE=M.parser.parse.bind(M.parser);
  const DRAFT_KEY='mclay_swimming_os_v4_poolside_draft_e';
  const txt=v=>U.text(v), esc=v=>U.escape(v);
  const nzToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});
  const safeJson=(s,f=null)=>{try{return JSON.parse(s||'')||f}catch{return f}};

  function isHeading(s){return /^(?:warm\s*up|pre\s*set|main\s*set|post\s*set|warm\s*down|cool\s*down|test)\b/i.test(String(s||'').trim())}
  function normaliseCycle(line){
    return String(line||'')
      .replace(/\bon\s+(\d{2,3})\s*$/i,(_,n)=>{n=Number(n);return n>=20&&n<=599?`@ ${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`:_})
      .replace(/\bon\s+(\d{1,2})[.:]([0-5]\d)\s*$/i,'@ $1:$2');
  }
  function headingRounds(line){
    const m=String(line||'').trim().match(/^(warm\s*up|pre\s*set|main\s*set|post\s*set|warm\s*down|cool\s*down|test)\s*(?:[-—–:·]\s*)?(\d{1,2})\s*rounds?\s*:?(.*)$/i);
    return m?{heading:m[1],rounds:Number(m[2]),tail:String(m[3]||'').trim()}:null;
  }
  function repeatLine(s){const m=String(s||'').trim().match(/^(\d{1,3})\s*[x×]\s*(\d{1,4}(?:\.5)?)\b\s*(.*)$/i);return m?{reps:Number(m[1]),distance:Number(m[2]),tail:String(m[3]||'').trim()}:null}
  function singleLine(s){const m=String(s||'').trim().match(/^(\d{1,4}(?:\.5)?)\s+(.+)$/);return m?{distance:Number(m[1]),tail:String(m[2]||'').trim()}:null}
  function targetCueLines(item){
    return [...new Set([
      item?.raw,item?.text,
      ...(item?.cues||[]),
      ...(item?.repPattern||[]).map(x=>x.text),
      ...(item?.repInstructions||[]).map(x=>x.label)
    ].map(txt).filter(Boolean))];
  }
  function authoredCueLines(item){
    return [...new Set([item?.raw,item?.text,...(item?.cues||[]),...(item?.repPattern||[]).map(x=>x.text)].map(txt).filter(Boolean))];
  }
  function hashRange(line,reps){
    const m=txt(line).match(/^#\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?\s*(.*)$/i);
    if(!m)return null;
    const start=Math.max(1,Number(m[1])||1),end=Math.max(start,Math.min(Math.max(1,Number(reps)||1),Number(m[2]||m[1])||start));
    return start>Math.max(1,Number(reps)||1)?null:{start,end,label:txt(m[3])};
  }
  function zoneValue(v){const k=txt(v).toLowerCase();if(/^reg/.test(k))return'Regeneration';if(/^dev/.test(k))return'Development';if(/^(?:over|ol)/.test(k))return'Overload';if(/^(?:thr|threshold)/.test(k))return'Threshold';if(/^(?:cl|clearance)/.test(k))return'Clearance';return'';}
  function cueZone(line){const m=txt(line).match(/\b(Regeneration|Regen|Reg|Development|Dev|Overload|OL|Threshold|Thr|Clearance|CL)\b/i);return m?zoneValue(m[1]):'';}
  function zoneProgression(line){const m=txt(line).match(/\b(Regeneration|Regen|Reg|Development|Dev|Overload|OL|Threshold|Thr|Clearance|CL)\b\s*(?:to|→|->)\s*\b(Regeneration|Regen|Reg|Development|Dev|Overload|OL|Threshold|Thr|Clearance|CL)\b/i);if(!m)return null;const from=zoneValue(m[1]),to=zoneValue(m[2]);return from&&to&&from!==to?{from,to,text:txt(line)}:null;}
  function cueStroke(line){
    const t=txt(line);if(/\b(?:individual\s+medley|medley|IM)\b/i.test(t))return'IM';if(/\b(?:freestyle|free)\b/i.test(t))return'Freestyle';if(/\b(?:backstroke|back)\b/i.test(t))return'Backstroke';if(/\b(?:breaststroke|breast|br)\b/i.test(t))return'Breaststroke';if(/\b(?:butterfly|fly)\b/i.test(t))return'Butterfly';return'';
  }
  function cueRaceIntent(line){
    const raw=txt(line),normal=raw.replace(/\b(50|100|200|400|800|1500)\s*m\b/gi,'$1');
    const direct=M.parser.raceIntent?.(normal);if(direct)return direct;
    const segment=normal.match(/\b(first|1st|second|2nd|last|final)\s+(\d{2,4})\s+(?:of\s+(?:the\s+)?)?(\d{2,4})\s*(?:race|event|pace)\b/i);
    return segment?{distance:Number(segment[3]),eventStroke:cueStroke(normal)||null,workingStroke:cueStroke(normal)||null,segmentDistance:Number(segment[2]),segmentPosition:segment[1].toLowerCase()}:null;
  }
  function cueCycle(line){
    const m=txt(line).match(/^@\s*(\d{1,3})(?::([0-5]\d(?:\.\d+)?))?$/);
    if(!m)return null;return m[2]==null?Number(m[1]):Number(m[1])*60+Number(m[2]);
  }
  function inlineCycle(line){const m=txt(line).match(/(?:@|on)\s*(\d{1,3})(?::|\.)([0-5]\d(?:\.\d+)?)\b/i);return m?Number(m[1])*60+Number(m[2]):null;}
  function sameJson(a,b){return JSON.stringify(a??null)===JSON.stringify(b??null)}
  function enhanceSetTargets(item){
    if(item?.kind!=='set')return 0;
    const reps=Math.max(1,Number(item.reps)||1),lines=authoredCueLines(item);let changed=0;
    if(!Number(item.cycleSeconds)){
      const cycle=lines.map(cueCycle).find(Number.isFinite);if(cycle){item.cycleSeconds=cycle;changed++}
    }
    const zones=new Map();
    for(const line of lines){const range=hashRange(line,reps),zone=cueZone(line);if(!range||!zone)continue;for(let n=range.start;n<=range.end;n++)zones.set(n,{rep:n,zone,text:line})}
    if(zones.size){const next=[...zones.values()].sort((a,b)=>a.rep-b.rep);if(!sameJson(item.repPattern,next)){item.repPattern=next;changed++}}
    else{
      const progression=lines.map(zoneProgression).find(Boolean);
      if(progression&&reps>1){const firstCount=Math.max(1,Math.floor(reps/2)),next=Array.from({length:reps},(_,i)=>({rep:i+1,zone:i<firstCount?progression.from:progression.to,text:progression.text}));if(!sameJson(item.repPattern,next)){item.repPattern=next;changed++}}
    }
    const instructions=new Map();let hasRace=false;
    for(const line of lines){const range=hashRange(line,reps);if(!range)continue;const race=cueRaceIntent(line);if(race)hasRace=true;for(let n=range.start;n<=range.end;n++)instructions.set(n,{rep:n,label:range.label||`#${n}`,raceIntent:race,drill:/\bdrill\b/i.test(range.label)})}
    if(hasRace){
      const next=Array.from({length:reps},(_,i)=>instructions.get(i+1)||{rep:i+1,label:`#${i+1}`,raceIntent:null,drill:false});
      if(!sameJson(item.repInstructions,next)){item.repInstructions=next;changed++}
    }
    if(!item.raceIntent){
      const whole=lines.filter(line=>!hashRange(line,reps)).map(cueRaceIntent).find(Boolean);
      if(whole){item.raceIntent=whole;changed++}
    }
    return changed;
  }
  function enhanceTargetSemantics(session){let changed=0;S.walkSets(session,item=>{changed+=enhanceSetTargets(item)});return changed}

  function normaliseText(source){
    const input=String(source??'').replace(/\r/g,'').split('\n');
    const stage=[];
    for(let line of input){
      line=line.replace(/\b(\d{1,2})\s*x\s*10p\s+i[’']?m\b/gi,'$1 x 100 IM');
      const hr=headingRounds(line);
      if(hr){stage.push(hr.heading,`${hr.rounds} Rounds:`);if(hr.tail)stage.push(hr.tail);continue}
      stage.push(normaliseCycle(line));
    }
    const out=[];
    for(let i=0;i<stage.length;i++){
      const line=stage[i],parent=repeatLine(line);
      out.push(line);
      if(!parent||parent.reps<2)continue;
      const kids=[];let j=i+1,sumReps=0;
      while(j<stage.length&&kids.length<12){
        const s=String(stage[j]||'').trim();if(!s||isHeading(s)||/^\d{1,2}\s+Rounds?\b/i.test(s))break;
        const c=repeatLine(s);if(!c||c.distance!==parent.distance||c.reps>=parent.reps)break;
        kids.push(c);sumReps+=c.reps;j++;
      }
      if(kids.length>=2&&sumReps>0&&parent.reps%sumReps===0){
        for(const c of kids)out.push(`${c.reps} ${c.tail||'Choice'}`);
        i=j-1;continue;
      }
      const parts=[];let k=i+1,sum=0;
      while(k<stage.length&&parts.length<8){
        const s=String(stage[k]||'').trim();if(!s||isHeading(s)||/^\d{1,2}\s+Rounds?\b/i.test(s))break;
        const c=singleLine(s);if(!c||c.distance<=0||c.distance>=parent.distance)break;
        parts.push(c);sum+=c.distance;k++;if(sum>=parent.distance)break;
      }
      if(parts.length>=2&&Math.abs(sum-parent.distance)<.001){
        out.push(`Makeup: ${parts.map(c=>`${c.distance} ${c.tail}`).join(' / ')}`);
        i=k-1;
      }
    }
    for(let i=out.length-1;i>=0;i--){
      const s=String(out[i]||'').trim();if(!s)continue;
      const m=s.match(/^([\d,]{3,6})\s*m$/i);if(m)out[i]=`TOTAL ${m[1]}m`;break;
    }
    return out.join('\n');
  }

  function strippedWork(set){return txt(set?.raw||set?.text).replace(/^\d{1,3}\s*[x×]\s*\d{1,4}(?:\.5)?\s*/i,'')}
  function promoteExplicitCycleComponent(item){
    if(item?.kind!=='component')return item;
    const raw=txt(item.raw||item.text),cycle=inlineCycle(raw);if(!cycle)return item;
    return {...item,kind:'set',reps:1,stroke:cueStroke(raw),zone:cueZone(raw),restSeconds:null,cycleSeconds:cycle,equipment:[],raw,text:raw,composition:[],pattern:[],repPattern:[],cues:[],repInstructions:[],raceIntent:cueRaceIntent(raw),targetSeconds:null,unclassifiedTerms:[]};
  }
  function compactItems(items){
    const a=(items||[]).map(x=>{let c=U.clone(x);if(c.kind==='group')c.items=compactItems(c.items||[]);c=promoteExplicitCycleComponent(c);return c});
    for(let i=0;i<a.length;i++){
      const p=a[i];if(p?.kind!=='set'||Number(p.reps)<2)continue;
      let j=i+1,kids=[],sumReps=0;
      while(j<a.length){const c=a[j];if(c?.kind!=='set'||Number(c.distance)!==Number(p.distance)||Number(c.reps)>=Number(p.reps))break;kids.push(c);sumReps+=Number(c.reps)||1;j++}
      if(kids.length>=2&&sumReps>0&&Number(p.reps)%sumReps===0){p.pattern=p.pattern||[];for(const c of kids)p.pattern.push({count:Number(c.reps)||1,text:strippedWork(c)});a.splice(i+1,kids.length);continue}
      j=i+1;let parts=[],sum=0;
      while(j<a.length){const c=a[j];if(c?.kind!=='set'||Number(c.reps)!==1||Number(c.distance)<=0||Number(c.distance)>=Number(p.distance))break;parts.push(c);sum+=Number(c.distance);j++;if(sum>=Number(p.distance))break}
      if(parts.length>=2&&Math.abs(sum-Number(p.distance))<.001){p.composition=p.composition||[];for(const c of parts)p.composition.push({distance:Number(c.distance),text:strippedWork(c)});a.splice(i+1,parts.length)}
    }
    return a;
  }
  function compactSession(s){for(const b of s?.blocks||[])b.items=compactItems(b.items||[]);enhanceTargetSemantics(s);s.metadata=s.metadata||{};s.metadata.parsedTotal=S.total(s);return s}

  function repairKnownSavedSessions(){
    if(!M.state?.canonicalSessions)return 0;
    const selected=M.state.settings?.selectedSessionId||'';let repaired=0;
    for(const [id,session] of Object.entries(M.state.canonicalSessions)){
      const next=U.clone(session),semantic=enhanceTargetSemantics(next);
      if(!semantic)continue;
      next.metadata=next.metadata||{};next.metadata.targetSemanticRepair={build:BUILD,at:U.now()};
      M.state.canonicalSessions[id]=next;repaired++;
    }
    if(repaired){M.state.settings.selectedSessionId=selected;M.store.save(M.state)}
    return repaired;
  }

  M.parser.parse=(source,identity={})=>compactSession(BASE_PARSE(normaliseText(source),identity));
  M.poolsideCore={BUILD,normaliseText,compactSession,enhanceTargetSemantics,repairKnownSavedSessions,renderNode,targetDetails,quickActions};

  function attendanceTime(row){return Date.parse(row?.updated_at||row?.updatedAt||row?.created_at||row?.createdAt||0)||0}
  UI.currentAthletes=()=>{const s=M.currentSession();if(!s)return[];const squads=new Set((s.identity?.squads||[]).map(x=>txt(x).toLowerCase()));return (M.state.athletes||[]).filter(a=>a.active!==false&&(!squads.size||squads.has(txt(a.squad).toLowerCase())))};
  UI.attendanceFor=id=>{const s=M.currentSession();if(!s)return null;const row=(M.state.attendance||[]).find(a=>a.session_id===s.id&&a.athlete_id===id);const epoch=Date.parse(s.metadata?.rollEpoch||0)||0;return row&&(!epoch||attendanceTime(row)>=epoch)?row:null};
  UI.presentAthletes=()=>UI.currentAthletes().filter(a=>['present','modified','late'].includes(txt(UI.attendanceFor(a.id)?.status).toLowerCase()));
  UI.initials=ath=>UI.identifier?UI.identifier(ath,UI.presentAthletes()):txt(ath?.full_name).split(/\s+/).map(x=>x[0]).join('').slice(0,3).toUpperCase();

  function sameWork(a,b){
    const eq=x=>(x||[]).map(txt).sort().join('|').toLowerCase();
    return Number(a?.reps||1)===Number(b?.reps||1)&&Number(a?.distance||0)===Number(b?.distance||0)&&txt(a?.stroke).toLowerCase()===txt(b?.stroke).toLowerCase()&&Number(a?.restSeconds||0)===Number(b?.restSeconds||0)&&Number(a?.cycleSeconds||0)===Number(b?.cycleSeconds||0)&&eq(a?.equipment)===eq(b?.equipment);
  }
  function modifiedFor(item,s){return UI.presentAthletes().map(ath=>({ath,actual:A.item(item,ath,M.state,s)})).filter(x=>!sameWork(item,x.actual))}
  function workHead(i){return `${Math.max(1,Number(i.reps)||1)} × ${Number(i.distance)||0}${i.stroke?` ${i.stroke}`:''}${i.equipment?.length?` · ${i.equipment.join(' + ')}`:''}`}
  function meta(i){const b=[];if(i.zone)b.push(i.zone);if(i.restSeconds)b.push(`${i.restSeconds}s rest`);if(i.cycleSeconds)b.push(`@ ${U.clock(i.cycleSeconds)}`);if(i.composition?.length)b.push(i.composition.map(x=>`${x.distance} ${x.text}`.trim()).join(' / '));if(i.pattern?.length)b.push(i.pattern.map(x=>`${x.count} ${x.text}`).join(' · '));if(i.repPattern?.length)b.push(i.repPattern.map(x=>`#${x.rep} ${x.zone}`).join(' · '));if(i.cues?.length)b.push(i.cues.join(' · '));return [...new Set(b.filter(Boolean))].join(' · ')}
  function targetDriven(i){return !!(i.targetSeconds||i.zone||i.raceIntent||i.repPattern?.length||i.repInstructions?.some(x=>x.raceIntent)||targetCueLines(i).some(x=>cueRaceIntent(x)||(hashRange(x,i.reps)&&cueZone(x))))}
  function repRange(a,b){return a===b?`#${a}`:`#${a}–${b}`}
  function groupedRows(rows,key){
    const out=[];for(const row of rows||[]){const k=key(row),last=out.at(-1);if(last&&last.key===k&&Number(row.rep)===last.end+1){last.end=Number(row.rep);continue}out.push({key:k,start:Number(row.rep)||1,end:Number(row.rep)||1,row})}return out;
  }
  function patternTargetBody(rows){
    return groupedRows(rows,x=>`${x.zone}|${Number(x.seconds)}|${Number(x.sendOff)}`).map(g=>`<span><strong>${repRange(g.start,g.end)} ${esc((g.row.zone||'').slice(0,3))} ${U.clock(g.row.seconds)}</strong><small>on ${U.clock(g.row.sendOff)}</small></span>`).join('');
  }
  function raceTargetBody(rows){
    return groupedRows(rows,x=>x.status==='ok'?`ok|${Number(x.seconds)}|${Number(x.sendOff)}`:`${x.status}|${x.label||x.message||'No pace'}`).map(g=>g.row.status==='ok'?`<span><strong>${repRange(g.start,g.end)} ${U.clock(g.row.seconds)}</strong>${g.row.sendOff?`<small>on ${U.clock(g.row.sendOff)}</small>`:''}</span>`:`<span>${repRange(g.start,g.end)} ${esc(g.row.label||g.row.message||'No pace')}</span>`).join('');
  }
  function targetRows(s,item){
    const swimmers=UI.presentAthletes();if(!swimmers.length)return '<div class="pool-target-empty">Mark swimmers Here in Roll to load targets.</div>';
    const rows=[];
    for(const ath of swimmers){
      const actual=A.item(item,ath,M.state,s),r=T.forItem(s,actual,ath,M.state);
      let sort=99999,body='';
      if(r.status==='ok'){sort=Number(r.seconds)||99999;body=`<strong>${U.clock(r.seconds)}</strong>${r.sendOff?` <small>on ${U.clock(r.sendOff)}</small>`:''}<em>${esc(r.source||'')}</em>`}
      else if(r.status==='pattern'){const good=(r.rows||[]).filter(x=>Number.isFinite(Number(x.seconds)));sort=Number(good[0]?.seconds)||99999;body=patternTargetBody(r.rows)+`<em>${esc(r.source||'')}</em>`}
      else if(r.status==='rep_race'){const good=(r.rows||[]).filter(x=>x.status==='ok');sort=Number(good[0]?.seconds)||99999;body=raceTargetBody(r.rows)}
      else if(r.status==='missing')body=`<span class="missing">${esc(r.message||'Target needed')}</span>`;else continue;
      rows.push({sort,html:`<div class="pool-target-row"><b>${esc(UI.initials(ath))}</b><span>${body}</span></div>`});
    }
    rows.sort((a,b)=>a.sort-b.sort);return rows.map(x=>x.html).join('')||'<div class="pool-target-empty">No target needed for this set.</div>';
  }
  function targetLeaves(item){
    if(item?.kind==='set')return targetDriven(item)?[item]:[];
    if(item?.kind==='group')return (item.items||[]).flatMap(targetLeaves);
    return [];
  }
  function targetDetails(s,items,label=''){
    const sets=(items||[]).filter(targetDriven);if(!sets.length)return'';
    return `<details class="pool-targets"><summary>Targets${sets.length>1?` · ${sets.length} sets`:''}</summary><div class="pool-target-body">${label?`<div class="pool-target-parent">${esc(label)}</div>`:''}${sets.map(item=>{const m=meta(item);return `<section class="pool-target-set" data-target-item="${esc(item.id)}"><header><strong>${esc(workHead(item))}</strong>${m?`<small>${esc(m)}</small>`:''}</header><div class="pool-target-rows">${targetRows(s,item)}</div></section>`}).join('')}</div></details>`;
  }
  function bindTargetDetails(host,s){
    host.querySelectorAll('details.pool-targets').forEach(details=>details.addEventListener('toggle',()=>{if(!details.open)return;for(const section of details.querySelectorAll('[data-target-item]')){const item=S.findItem(s,section.dataset.targetItem)?.item,rows=section.querySelector('.pool-target-rows');if(item&&rows)rows.innerHTML=targetRows(s,item)}}));
  }
  function renderNode(s,b,item,suppressTargets=false){
    if(item.kind==='cue')return `<div class="cue-line">${esc(item.text)}</div>`;
    if(item.kind==='group'){
      const leaves=targetLeaves(item),label=`${Number(item.rounds)||1} rounds · ${S.itemDistance(item).toLocaleString()}m`;
      return `<section class="pool-group"><header><b>${Number(item.rounds)||1} ROUNDS</b><strong>${S.itemDistance(item).toLocaleString()}m</strong></header>${(item.items||[]).map(x=>renderNode(s,b,x,true)).join('')}${!suppressTargets?targetDetails(s,leaves,label):''}</section>`;
    }
    const m=meta(item),mods=modifiedFor(item,s),targets=targetDriven(item);
    return `<article class="pool-line" data-item-id="${esc(item.id)}"><div class="pool-work"><div class="pool-work-head"><strong>${esc(workHead(item))}</strong>${M.access?.can?.('session.edit')?`<button data-pool-edit="${esc(item.id)}">Edit</button>`:''}</div>${m?`<div class="pool-meta">${esc(m)}</div>`:''}</div>${mods.length?`<div class="pool-mods">${mods.map(x=>`<div class="pool-mod"><b>${esc(UI.initials(x.ath))}</b><span>${esc(workHead(x.actual))}${meta(x.actual)?` · ${esc(meta(x.actual))}`:''}</span></div>`).join('')}</div>`:''}${targets&&!suppressTargets?targetDetails(s,[item]):''}</article>`;
  }
  function quickActions(here){
    const swimmers=M.access?.can?.('pathway.read_all')?'<button data-pool-swimmers>Swimmers / Pathway</button>':'';
    return `<button data-pool-roll>Roll · ${here} here</button><button data-pool-times>T400 / Times</button>${swimmers}`;
  }

  UI.renderBoard=()=>{
    const h=document.querySelector('#boardView'),s=M.currentSession();if(!h)return;
    if(!s){h.innerHTML='<section class="empty-card"><h2>No session selected</h2></section>';return}
    const here=UI.presentAthletes().length,total=S.total(s);
    h.innerHTML=`<section class="session-summary pool-summary"><div><span>WHOLE SESSION · ${esc(s.identity.date)} ${esc(s.identity.dayPart)}</span><h1>${esc(s.identity.title||'Session')}</h1><div class="pool-quick">${quickActions(here)}</div></div><strong>${total.toLocaleString()}m</strong></section>${(s.blocks||[]).map((b,i)=>`<section class="block-card pool-block" data-block-id="${esc(b.id)}"><header><div><small>${i+1}. ${esc(b.title.toUpperCase())}</small><h2>${esc(b.title)}</h2></div><strong>${S.blockDistance(b).toLocaleString()}m</strong></header><div class="block-items">${(b.items||[]).map(x=>renderNode(s,b,x)).join('')}</div>${M.access?.can?.('session.finish')?`<footer><button class="finish-here" data-pool-finish="${esc(b.id)}">Finish here — after ${esc(b.title)}</button></footer>`:''}</section>`).join('')}`;
    h.querySelector('[data-pool-roll]')?.addEventListener('click',()=>M.nav.show('roll',{restoreScroll:false}));
    h.querySelector('[data-pool-times]')?.addEventListener('click',()=>M.nav.show('times',{restoreScroll:false}));
    h.querySelector('[data-pool-swimmers]')?.addEventListener('click',()=>M.nav.show('athletes',{restoreScroll:false}));
    bindTargetDetails(h,s);
    h.querySelectorAll('[data-pool-edit]').forEach(x=>x.onclick=()=>M.actions.openEdit(x.dataset.poolEdit));
    h.querySelectorAll('[data-pool-finish]').forEach(x=>x.onclick=()=>M.actions.finishBlock(x.dataset.poolFinish));
  };

  function structuredSession(tr,identity){
    if(!Array.isArray(tr?.structuredBlocks)||!tr.structuredBlocks.length)return null;
    const s=S.empty(identity,tr.rawText||'');s.blocks=[];
    const typeMap={warmup:'warm_up',warm_up:'warm_up',preset:'pre_set',pre_set:'pre_set',main:'main_set',main_set:'main_set',postset:'post_set',post_set:'post_set',warmdown:'warm_down',warm_down:'warm_down',test:'test'};
    for(let bi=0;bi<tr.structuredBlocks.length;bi++){
      const b=tr.structuredBlocks[bi],type=typeMap[txt(b.block_type||b.type).toLowerCase()]||U.blockType(b.block_type||b.type),children=[];let order=0;
      for(const x of b.items||[]){
        const raw=txt(x.raw||x.text||x.instruction||x.cue);if(!raw)continue;
        const counted=x.counts_distance!==false&&txt(x.kind).toLowerCase()!=='cue'&&Number(x.distance)>0;
        if(counted)children.push({id:U.stableId('item',s.id,type,order,raw),kind:'set',order:++order,reps:Math.max(1,Number(x.reps)||1),distance:Number(x.distance)||0,stroke:txt(x.stroke),zone:txt(x.zone),restSeconds:Number(x.rest_seconds||b.common_rest_seconds)||null,cycleSeconds:U.seconds(txt(x.cycle).replace(/^@\s*/,'')),equipment:Array.isArray(x.equipment)?x.equipment.map(txt).filter(Boolean):[],raw,text:raw,composition:[],pattern:[],repPattern:(x.rep_pattern||[]).map(p=>({rep:Number(p.rep)||1,zone:txt(p.zone),text:txt(p.instruction)})),cues:[],repInstructions:[],raceIntent:M.parser.raceIntent?.(raw)||null,targetSeconds:null});
        else if(children.length){const p=children.at(-1);p.cues=p.cues||[];p.cues.push(raw)}else children.push({id:U.stableId('cue',s.id,type,order,raw),kind:'cue',order:++order,text:raw,raw});
      }
      const rounds=Math.max(1,Number(b.repeat_count)||1),items=rounds>1?[{id:U.stableId('group',s.id,type,bi,rounds),kind:'group',order:1,rounds,text:`${rounds} Rounds`,items:children}]:children;
      s.blocks.push({id:U.stableId('block',s.id,type,bi),type,title:txt(b.title)||U.blockTitle(type),order:bi+1,items});
    }
    s.metadata={...s.metadata,primarySystem:txt(tr.structuredData?.primary_system),technicalFocus:txt(tr.structuredData?.technical_focus),sourceAuthority:'structured_transcript'};
    return compactSession(s);
  }
  async function refreshAuth(){
    const c=M.store.config(),old=M.store.auth()||safeJson(localStorage.getItem(M.AUTH_KEY),{});
    if(!old?.refresh_token)throw new Error('Transcription sign-in expired — open Connection and sign in once');
    const r=await fetch(`${String(c.supabaseUrl||'').replace(/\/$/,'')}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:c.supabaseAnonKey||'','Content-Type':'application/json'},body:JSON.stringify({refresh_token:old.refresh_token})});
    const data=await r.json().catch(()=>({}));if(!r.ok||!data.access_token)throw new Error(data.error_description||data.msg||data.error||`Auth refresh failed (${r.status})`);localStorage.setItem(M.AUTH_KEY,JSON.stringify({...old,...data}));
  }
  async function transcribe(blob,type){try{return await M.intake.transcribe(blob,type)}catch(e){if(!/\b401\b|jwt|unauthori[sz]ed|access.?token/i.test(String(e?.message||e)))throw e;await refreshAuth();return M.intake.transcribe(blob,type)}}

  function modalHtml(){return `<div class="modal-backdrop"><section class="modal wide"><header><h2>Add session</h2><button data-core-close>×</button></header><div class="modal-body"><label>Published session<select id="coreSlot"></select></label><div id="coreTruth" class="check-card"></div><div class="intake-tabs"><button data-core-tab="text" class="active">Paste / Type</button><button data-core-tab="voice">Voice</button><button data-core-tab="photo">Photo</button></div><div id="coreText"><label>Session<textarea id="coreRaw" class="session-editor"></textarea></label></div><div id="coreVoice" hidden><button id="coreStart">Start full session dictation</button><button id="coreStop" disabled>Stop & transcribe</button><audio id="coreAudio" controls hidden></audio></div><div id="corePhoto" hidden><label class="buttonlike">Take / choose session photo<input id="coreFile" type="file" accept="image/*" capture="environment" hidden></label></div><div id="coreStatus" class="muted">Poolside core · draft saves locally.</div><div id="corePreview" class="check-card"></div></div><footer><button id="coreCreate" disabled>Create & use now</button></footer></section></div>`}
  const slotId=(id)=>U.stableId('session',id.date,id.dayPart,id.start,id.end,(id.squads||[]).join('+'),id.venue);
  M.actions.openNewSession=async()=>{
    M.access?.assert?.('session.create');await M.calendar.load();
    const host=document.querySelector('#modalHost'),today=nzToday(),slots=M.calendar.slots(today),hour=Number(new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',hour:'2-digit',hour12:false}).format(new Date()));host.innerHTML=modalHtml();M.nav.openLayer('modal');
    const q=s=>host.querySelector(s),slot=q('#coreSlot'),truth=q('#coreTruth'),raw=q('#coreRaw'),status=q('#coreStatus'),preview=q('#corePreview'),create=q('#coreCreate'),part=hour>=12?'PM':'AM';
    slot.innerHTML=slots.map(x=>`<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('');const preferred=slots.find(x=>x.dayPart===part&&(x.squads||[]).some(s=>/National/i.test(s))&&(x.squads||[]).some(s=>/Development/i.test(s)))||slots.find(x=>x.dayPart===part)||slots[0];if(preferred)slot.value=preferred.id;
    const draft=safeJson(localStorage.getItem(DRAFT_KEY),null);if(draft?.date===today&&draft.text){raw.value=draft.text;if(draft.slotId&&[...slot.options].some(o=>o.value===draft.slotId))slot.value=draft.slotId;status.textContent='Poolside core · draft restored locally.'}
    const saveDraft=()=>localStorage.setItem(DRAFT_KEY,JSON.stringify({date:today,slotId:slot.value,text:raw.value,at:U.now()}));
    let candidate=null,tr=null,mediaId=null,sourceType='text';const selected=()=>slots.find(x=>x.id===slot.value)||null;const identity=()=>{const x=selected();return x?M.calendar.identityFromSlot(x,`${x.dayPart} · ${(x.squads?.length?x.squads:[x.squad]).join(' + ')}`):{date:today,dayPart:part,title:`${part} session`,squads:['National','Development'],venue:'AquaGym',course:'SCM',start:'',end:''}};
    const build=()=>{try{const id=identity();id.id=slotId(id);candidate=tr?.structuredBlocks?.length?structuredSession(tr,id):M.parser.parse(raw.value,id);candidate.identity={...candidate.identity,...id};const total=S.total(candidate),written=Number(candidate.metadata?.explicitTotal)||null,match=!written||Math.abs(written-total)<=1,ok=S.validate(candidate).ok&&total>0&&match;preview.className=`check-card ${ok?'ok':'bad'}`;preview.textContent=match?`${total.toLocaleString()}m${written?` · written ${written.toLocaleString()}m ✓`:''}`:`CALCULATED ${total.toLocaleString()}m · WRITTEN ${written.toLocaleString()}m`;create.disabled=!ok;return ok}catch(e){candidate=null;create.disabled=true;preview.className='check-card bad';preview.textContent=e.message||String(e);return false}};
    const paint=()=>{const x=selected();truth.className=`check-card ${x?'ok':'bad'}`;truth.textContent=x?`${x.date} ${x.dayPart} · ${(x.squads||[x.squad]).join(' + ')} · ${x.start}-${x.end} · ${x.venue}`:'No published session';build()};
    raw.oninput=()=>{tr=null;sourceType='text';saveDraft();build()};slot.onchange=()=>{saveDraft();paint()};q('[data-core-close]').onclick=()=>{saveDraft();host.innerHTML='';M.nav.clearTransient?.()};host.querySelectorAll('[data-core-tab]').forEach(b=>b.onclick=()=>{host.querySelectorAll('[data-core-tab]').forEach(x=>x.classList.toggle('active',x===b));for(const t of ['text','voice','photo'])q(`#core${t[0].toUpperCase()+t.slice(1)}`).hidden=t!==b.dataset.coreTab});
    let rec=null,chunks=[];q('#coreStart').onclick=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];rec=new MediaRecorder(stream);rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:rec.mimeType||'audio/webm'});mediaId=await M.media.save(blob,{type:'planned_session_voice'});sourceType='voice';q('#coreAudio').src=URL.createObjectURL(blob);q('#coreAudio').hidden=false;status.textContent='Recording saved locally · transcribing…';try{tr=await transcribe(blob,'voice');raw.value=tr.rawText||'';saveDraft();build();status.textContent=`Transcribed · ${candidate?S.total(candidate).toLocaleString()+'m':'check session'}`}catch(e){status.textContent=`${e.message||e} · recording still saved locally`}};rec.start(1000);q('#coreStart').disabled=true;q('#coreStop').disabled=false;status.textContent='Recording full session…'}catch(e){status.textContent=e.message||String(e)}};q('#coreStop').onclick=()=>{if(rec&&rec.state!=='inactive')rec.stop();q('#coreStart').disabled=false;q('#coreStop').disabled=true};
    q('#coreFile').onchange=async e=>{const blob=e.target.files?.[0];if(!blob)return;mediaId=await M.media.save(blob,{type:'planned_session_photo'});sourceType='photo';status.textContent='Photo saved locally · transcribing…';try{tr=await transcribe(blob,'photo');raw.value=tr.rawText||'';saveDraft();build();status.textContent=`Photo structured · ${candidate?S.total(candidate).toLocaleString()+'m':'check session'}`}catch(err){status.textContent=`${err.message||err} · photo still saved locally`}};
    create.onclick=()=>{if(!candidate||!build())return;candidate.metadata={...candidate.metadata,intakeSource:sourceType,intakeMediaId:mediaId||null,rollEpoch:U.now(),poolsideCoreBuild:BUILD};candidate.updatedAt=U.now();M.state.attendance=(M.state.attendance||[]).filter(x=>x.session_id!==candidate.id);const saved=M.store.putSession(M.state,candidate);M.state.settings.selectedSessionId=saved.id;M.state.settings.view='board';M.store.save(M.state);localStorage.removeItem(DRAFT_KEY);host.innerHTML='';M.nav.clearTransient?.();M.nav.activateView?.('board');history.replaceState(M.nav.state('board'),'','#board');UI.renderCurrent();scrollTo(0,0);M.toast(`Session ready · ${S.total(saved).toLocaleString()}m · Roll is clean`)};paint();
  };

  function repairSelected(){
    const s=M.currentSession?.();if(!s||s.identity?.date!==nzToday())return false;const source=s.originalPlan?.text||s.currentSource?.text||'';if(!source)return false;
    try{const repaired=M.parser.parse(source,{...s.identity,id:s.id}),written=Number(repaired.metadata?.explicitTotal)||null,total=S.total(repaired),current=S.total(s);if((written&&Math.abs(total-written)>1)||total===current)return false;repaired.originalPlan=s.originalPlan;repaired.changes=s.changes||[];repaired.metadata={...s.metadata,...repaired.metadata,rollEpoch:U.now(),poolsideRepair:BUILD};repaired.finish=s.finish||null;repaired.updatedAt=U.now();M.state.attendance=(M.state.attendance||[]).filter(x=>x.session_id!==s.id);M.store.putSession(M.state,repaired);M.state.settings.selectedSessionId=repaired.id;M.store.save(M.state);return true}catch{return false}
  }

  M.poolsideCore.selfTest=()=>{
    const a=M.parser.parse(`WARM-UP\n12 x 50 #1 @ 1:10\n1 x 50 Scull\n1 x 50 Drill\n1 x 50 Swim Perfect Technique`,{id:'pattern',date:'2026-08-17'});
    const b=M.parser.parse(`Warm up\n200 fr\n200 IM\n4x50 hbs\n10sr\n\nPre set\n5x50#1 build on 60\n5x10p I'm desc 1-5 on 1.45\n\nMain set 3 rounds\n5x100 free threshold 10 sr\n400 easy\n\nPost set\n8x75\n25 Easy\n25 Build\n25 Fast\n\n4650m`,{id:'live',date:'2026-08-17'});
    return{ok:S.total(a)===600&&S.total(b)===4650&&Number(b.metadata.explicitTotal)===4650,pattern:S.total(a),live:S.total(b),liveWritten:b.metadata.explicitTotal};
  };
  const test=M.poolsideCore.selfTest();if(!test.ok)console.error('[MSOS poolside core] FAIL',test);else console.info('[MSOS poolside core] PASS',test);
  const priorGuardianRun=M.guardian?.run?.bind(M.guardian);
  if(priorGuardianRun){
    M.guardian.run=()=>{
      const result=priorGuardianRun(),tests=[...(result.tests||[])];
      const check=(name,fn)=>{try{const detail=fn();tests.push({name,ok:true,detail:detail==null?'':String(detail)})}catch(e){tests.push({name,ok:false,detail:e.message||String(e)})}};
      check('Standalone rest lines never add phantom metres',()=>{const s=M.parser.parse('MAIN SET\n10s rest\n8 x 100 Freestyle\n30s rest\n4 x 50 Choice',{id:'rest-gate'});if(S.total(s)!==1000)throw new Error(`got ${S.total(s)}`);return '800 + 200 · rest 0m'});
      check('Board targets stay inside a compact parent-set dropdown',()=>{const s=M.parser.parse('MAIN SET\n2 x 400 Freestyle\n#1 Regeneration\n#2 Development',{id:'target-dropdown',course:'SCM'}),item=s.blocks[0].items[0],html=renderNode(s,s.blocks[0],item);if(!/<details class="pool-targets"><summary>Targets/.test(html)||!/2 × 400 Freestyle/.test(html)||/pool-target-title/.test(html))throw new Error('target detail is not parent-set dropdown markup');return 'set remains visible · targets collapsed'});
      check('Saturday range cues expose aerobic and race-pace target dropdowns',()=>{
        const s=M.parser.parse('MAIN SET\n2 x 400 Freestyle\n#1 Regeneration\n#2 Development\n#3 Development\n6 x 25\n@ 45\n#1 Build\n#2-6 @ 100m Race Pace\n8 x 100 Freestyle\n#1-4 Overload\n#5-8 Threshold\n1 x 100\nTarget: Second 100 of 200 Race',{id:'sat-target-cues',course:'SCM'}),items=s.blocks[0].items,pace25=items.find(x=>Number(x.reps)===6),aerobic100=items.find(x=>Number(x.reps)===8),second100=items.at(-1),html=items.map(x=>renderNode(s,s.blocks[0],x)).join('');
        if(items[0].repPattern.map(x=>x.zone).join(',')!=='Regeneration,Development')throw new Error('2 x 400 authored phases were not normalized');
        if(pace25.cycleSeconds!==45||pace25.repInstructions.filter(x=>x.raceIntent).length!==5)throw new Error('25 race-pace range was not resolved');
        if(aerobic100.repPattern.length!==8||aerobic100.repPattern[0].zone!=='Overload'||aerobic100.repPattern[7].zone!=='Threshold')throw new Error('8 x 100 zones were not resolved');
        if(second100.raceIntent?.distance!==200||!/pool-targets/.test(html))throw new Error('race target-needed dropdown is absent');
        if(enhanceTargetSemantics(s)!==0||pace25.raceIntent)throw new Error('target enrichment is not stable or leaked a rep range onto the whole set');
        return '2 aerobic phases · #2–6 race pace · #1–4/#5–8 zones · second 100 target check';
      });
      check('Modified mixed-zone aerobic work retains every phase with individual distances',()=>{
        const s=M.parser.parse('MAIN SET\n2 x 400 Freestyle\n#1 Regeneration\n#2 Development',{id:'modified-phases',course:'SCM'}),item=s.blocks[0].items[0],cm={id:'cm-phase',full_name:'Charlotte Murphy'},md={id:'md-phase',full_name:'McKenzie Drage'},state={adaptationProfiles:[],adaptationOverrides:[],trainingTestTypes:[{id:'phase-t400',test_key:'t400_freestyle'}],trainingTestResults:[{athlete_id:'cm-phase',test_type_id:'phase-t400',result_seconds:300,pool_course:'SCM',valid_for_anchor:true},{athlete_id:'md-phase',test_type_id:'phase-t400',result_seconds:300,pool_course:'SCM',valid_for_anchor:true}]},a=M.adapt.item(item,cm,state,s),b=M.adapt.item(item,md,state,s),ta=T.forItem(s,a,cm,state),tb=T.forItem(s,b,md,state);
        if(a.reps!==2||a.distance!==200||b.reps!==2||b.distance!==275)throw new Error(`modified shapes ${a.reps}x${a.distance} / ${b.reps}x${b.distance}`);
        if(ta.status!=='pattern'||tb.status!=='pattern'||ta.rows.length!==2||tb.rows.length!==2)throw new Error('individual phase targets were not retained');
        return `CM ${a.reps} × ${a.distance} · MD ${b.reps} × ${b.distance} · Reg + Dev retained`;
      });
      check('Board exposes direct Swimmers and Performance Pathway access',()=>{const html=quickActions(1);if(!/data-pool-swimmers/.test(html)||!/Swimmers \/ Pathway/.test(html))throw new Error('direct poolside swimmer route missing');return 'Board → Swimmers / Pathway'});
      const passed=tests.filter(x=>x.ok===true).length;
      return {...result,build:M.BUILD,tests,passed,total:tests.length,ok:tests.length>0&&passed===tests.length};
    };
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{const known=repairKnownSavedSessions(),repaired=repairSelected();if(known||repaired||M.state?.settings?.view==='board')UI.renderCurrent()},0),{once:true});
})(globalThis);
