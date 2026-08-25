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

  const KNOWN_SATURDAY_BEFORE='1700,850,2940,600';
  const KNOWN_SATURDAY_AFTER='1100,850,2900,600';
  function restArtifact(item){
    if(item?.kind!=='set'||Math.max(1,Number(item.reps)||1)!==1)return false;
    const raw=txt(item.raw||item.text);
    const m=raw.match(/^(\d{1,3})\s*(?:s|sec|seconds?)\s*(?:r|rest)$/i);
    return !!(m&&Number(m[1])===Number(item.distance));
  }
  function foldDuplicateBreakdown(items,audit){
    for(let i=0;i<(items||[]).length;i++){
      const parent=items[i],group=items[i+1];
      if(parent?.kind!=='set'||group?.kind!=='group'||Number(group.rounds)<2)continue;
      const children=group.items||[];
      if(!children.length||children.some(x=>x.kind!=='set'||Number(x.distance)!==Number(parent.distance)))continue;
      const oneRoundReps=children.reduce((n,x)=>n+Math.max(1,Number(x.reps)||1),0);
      if(Number(group.rounds)*oneRoundReps!==Math.max(1,Number(parent.reps)||1))continue;
      if(S.itemDistance(group)!==S.itemDistance(parent))continue;
      parent.pattern=parent.pattern||[];
      for(const child of children){
        const work=strippedWork(child)||txt(child.raw||child.text)||'Choice';
        if(!parent.pattern.some(x=>Number(x.count)===Math.max(1,Number(child.reps)||1)&&txt(x.text)===work))parent.pattern.push({count:Math.max(1,Number(child.reps)||1),text:work});
        for(const cue of child.cues||[])if(!parent.cues?.includes(cue))(parent.cues=parent.cues||[]).push(cue);
      }
      audit.folded.push(group.id||`group-${i+1}`);
      items.splice(i+1,1);
    }
  }
  function removeRestArtifacts(items,audit){
    for(let i=(items||[]).length-1;i>=0;i--){
      const item=items[i];
      if(item?.kind==='group')removeRestArtifacts(item.items||[],audit);
      if(!restArtifact(item))continue;
      audit.removed.push({id:item.id||'',raw:txt(item.raw||item.text),distance:Number(item.distance)||0});
      items.splice(i,1);
    }
  }
  function recalcFinish(session){
    const f=session?.finish;if(!f)return;
    try{
      let calc=null;
      if(f.throughItemId)calc=S.distanceThroughItem(session,f.throughItemId,{roundByGroup:f.roundByGroup||{}});
      else if(f.throughBlockId)calc=S.finishThroughBlock(session,f.throughBlockId);
      if(calc?.found){f.actualDistance=calc.total;if(f.review){if(Number(f.review.plannedDistance)===6090)f.review.plannedDistance=5450;f.review.actualDistance=calc.total}}
    }catch{}
  }
  function repairKnownSessionTruth(session){
    const squads=(session?.identity?.squads||[]).map(x=>txt(x).toLowerCase());
    const before=(session?.blocks||[]).map(S.blockDistance).join(',');
    if(session?.identity?.date!=='2026-08-15'||txt(session.identity.dayPart).toUpperCase()!=='AM'||!squads.includes('national')||S.total(session)!==6090||before!==KNOWN_SATURDAY_BEFORE)return null;
    const next=U.clone(session),audit={folded:[],removed:[]},finishBefore=U.clone(next.finish||null);
    for(const block of next.blocks||[]){foldDuplicateBreakdown(block.items||[],audit);removeRestArtifacts(block.items||[],audit)}
    const after=(next.blocks||[]).map(S.blockDistance).join(',');
    if(S.total(next)!==5450||after!==KNOWN_SATURDAY_AFTER||audit.folded.length!==1||audit.removed.reduce((n,x)=>n+x.distance,0)!==40)return null;
    recalcFinish(next);
    next.metadata=next.metadata||{};
    next.metadata.parsedTotal=5450;
    next.metadata.totalMatches=Number(next.metadata.explicitTotal)?Number(next.metadata.explicitTotal)===5450:true;
    next.metadata.canonicalRepairs=[...(next.metadata.canonicalRepairs||[]),{build:BUILD,reason:'known_2026-08-15_duplicate_breakdown_and_rest_distance',beforeTotal:6090,afterTotal:5450,beforeBlocks:KNOWN_SATURDAY_BEFORE,afterBlocks:KNOWN_SATURDAY_AFTER,foldedGroupIds:audit.folded,removedRestArtifacts:audit.removed,finishBefore,finishAfter:U.clone(next.finish||null),at:U.now()}];
    next.updatedAt=U.now();
    return next;
  }

  function repairKnownSavedSessions(){
    if(!M.state?.canonicalSessions)return 0;
    const selected=M.state.settings?.selectedSessionId||'';let repaired=0;
    for(const [id,session] of Object.entries(M.state.canonicalSessions)){
      const truth=repairKnownSessionTruth(session),next=truth||U.clone(session),semantic=enhanceTargetSemantics(next);
      if(!truth&&!semantic)continue;
      if(semantic){next.metadata=next.metadata||{};next.metadata.targetSemanticRepair={build:BUILD,at:U.now()}}
      M.state.canonicalSessions[id]=next;repaired++;
      if(truth)M.cloud?.stageSession?.(next);
    }
    if(repaired){M.state.settings.selectedSessionId=selected;M.store.save(M.state)}
    return repaired;
  }

  M.parser.parse=(source,identity={})=>compactSession(BASE_PARSE(normaliseText(source),identity));
  M.poolsideCore={BUILD,normaliseText,compactSession,enhanceTargetSemantics,repairKnownSessionTruth,repairKnownSavedSessions};

  function attendanceTime(row){return Date.parse(row?.updated_at||row?.updatedAt||row?.created_at||row?.createdAt||0)||0}
  UI.currentAthletes=()=>{const s=M.currentSession();if(!s)return[];const squads=new Set((s.identity?.squads||[]).map(x=>txt(x).toLowerCase()));return (M.state.athletes||[]).filter(a=>a.active!==false&&(!squads.size||squads.has(txt(a.squad).toLowerCase())))};
  UI.attendanceFor=id=>{const s=M.currentSession();if(!s)return null;const row=(M.state.attendance||[]).find(a=>a.session_id===s.id&&a.athlete_id===id);const epoch=Date.parse(s.metadata?.rollEpoch||0)||0;return row&&(!epoch||attendanceTime(row)>=epoch)?row:null};
  UI.presentAthletes=()=>UI.currentAthletes().filter(a=>['present','modified','late'].includes(txt(UI.attendanceFor(a.id)?.status).toLowerCase()));
  UI.initials=ath=>UI.identifier?UI.identifier(ath,UI.presentAthletes()):txt(ath?.full_name).split(/\s+/).map(x=>x[0]).join('').slice(0,3).toUpperCase();

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
      check('Saturday range cues preserve aerobic and race-pace semantics',()=>{
        const s=M.parser.parse('MAIN SET\n2 x 400 Freestyle\n#1 Regeneration\n#2 Development\n#3 Development\n6 x 25\n@ 45\n#1 Build\n#2-6 @ 100m Race Pace\n8 x 100 Freestyle\n#1-4 Overload\n#5-8 Threshold\n1 x 100\nTarget: Second 100 of 200 Race',{id:'sat-target-cues',course:'SCM'}),items=s.blocks[0].items,pace25=items.find(x=>Number(x.reps)===6),aerobic100=items.find(x=>Number(x.reps)===8),second100=items.at(-1);
        if(items[0].repPattern.map(x=>x.zone).join(',')!=='Regeneration,Development')throw new Error('2 x 400 authored phases were not normalized');
        if(pace25.cycleSeconds!==45||pace25.repInstructions.filter(x=>x.raceIntent).length!==5)throw new Error('25 race-pace range was not resolved');
        if(aerobic100.repPattern.length!==8||aerobic100.repPattern[0].zone!=='Overload'||aerobic100.repPattern[7].zone!=='Threshold')throw new Error('8 x 100 zones were not resolved');
        if(second100.raceIntent?.distance!==200)throw new Error('second 100 race intent is absent');
        if(enhanceTargetSemantics(s)!==0||pace25.raceIntent)throw new Error('target enrichment is not stable or leaked a rep range onto the whole set');
        return '2 aerobic phases · #2–6 race pace · #1–4/#5–8 zones · second 100 target check';
      });
      check('Modified mixed-zone aerobic work retains every phase with individual distances',()=>{
        const s=M.parser.parse('MAIN SET\n2 x 400 Freestyle\n#1 Regeneration\n#2 Development',{id:'modified-phases',course:'SCM'}),item=s.blocks[0].items[0],cm={id:'cm-phase',full_name:'Charlotte Murphy'},md={id:'md-phase',full_name:'McKenzie Drage'},state={adaptationProfiles:[],adaptationOverrides:[],trainingTestTypes:[{id:'phase-t400',test_key:'t400_freestyle'}],trainingTestResults:[{athlete_id:'cm-phase',test_type_id:'phase-t400',result_seconds:300,pool_course:'SCM',valid_for_anchor:true},{athlete_id:'md-phase',test_type_id:'phase-t400',result_seconds:300,pool_course:'SCM',valid_for_anchor:true}]},a=M.adapt.item(item,cm,state,s),b=M.adapt.item(item,md,state,s),ta=T.forItem(s,a,cm,state),tb=T.forItem(s,b,md,state);
        if(a.reps!==2||a.distance!==200||b.reps!==2||b.distance!==275)throw new Error(`modified shapes ${a.reps}x${a.distance} / ${b.reps}x${b.distance}`);
        if(ta.status!=='pattern'||tb.status!=='pattern'||ta.rows.length!==2||tb.rows.length!==2)throw new Error('individual phase targets were not retained');
        return `CM ${a.reps} × ${a.distance} · MD ${b.reps} × ${b.distance} · Reg + Dev retained`;
      });
      check('Saved Saturday 6,090m corruption repairs non-destructively to 5,450m',()=>{
        const s=M.parser.parse(M.guardian.SATURDAY_SOURCE,{id:'saved-sat',date:'2026-08-15',dayPart:'AM',squads:['National','Development','Fitness']});
        const warm=s.blocks[0],parent=warm.items.find(x=>x.kind==='set'&&Number(x.reps)===12&&Number(x.distance)===50);
        warm.items.splice(warm.items.indexOf(parent)+1,0,{id:'phantom-breakdown',kind:'group',rounds:4,text:'4 ROUNDS',items:[{id:'p1',kind:'set',reps:1,distance:50,raw:'1 x 50 Scull'},{id:'p2',kind:'set',reps:1,distance:50,raw:'1 x 50 Drill'},{id:'p3',kind:'set',reps:1,distance:50,raw:'1 x 50 Swim Perfect Technique'}]});
        const main=s.blocks[2];main.items.splice(1,0,{id:'phantom-rest-10',kind:'set',reps:1,distance:10,raw:'10s rest',text:'10s rest'});main.items.push({id:'phantom-rest-30',kind:'set',reps:1,distance:30,raw:'30s rest',text:'30s rest'});
        if(S.total(s)!==6090||s.blocks.map(S.blockDistance).join(',')!==KNOWN_SATURDAY_BEFORE)throw new Error('fixture did not reproduce phone state');
        s.capturesSentinel='preserve';const repaired=repairKnownSessionTruth(s);
        if(!repaired||S.total(repaired)!==5450||repaired.blocks.map(S.blockDistance).join(',')!==KNOWN_SATURDAY_AFTER)throw new Error('known corruption was not repaired');
        if(repaired.capturesSentinel!=='preserve'||S.total(s)!==6090)throw new Error('repair mutated original/evidence');
        return KNOWN_SATURDAY_AFTER;
      });
      const passed=tests.filter(x=>x.ok===true).length;
      return {...result,build:M.BUILD,tests,passed,total:tests.length,ok:tests.length>0&&passed===tests.length};
    };
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{const known=repairKnownSavedSessions(),repaired=repairSelected();if(known||repaired||M.state?.settings?.view==='board')UI.renderCurrent()},0),{once:true});
})(globalThis);
