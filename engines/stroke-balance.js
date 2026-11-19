'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Evidence||!E?.Modification)return;
  const B=M.strokeBalance={build:'v4-stroke-balance-20260820q'};
  const STROKES=['Freestyle','Backstroke','Breaststroke','Butterfly'];
  // 19 Nov 2026 (Andy + Mike): swimmer stroke volumes show five lines. IM work counts as IM AND a quarter to each of
  // Fly / Back / Breast / Free ("if he is looking at how much butterfly he's done, the IM fly component should also
  // count"). Totals and shares stay on the four strokes, so IM is never counted twice in a total. Work with no stroke
  // named ("Choice") counts as Freestyle.
  const REPORT_STROKES=[...STROKES,'IM'];
  const WEIGHTS=Object.freeze({easy:.25,regeneration:.25,development:.45,overload:.70,threshold:.85,clearance:1,race:1,sprint:1.10,technical:.70,default:.35,incidentalFree:.20});
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const dayMs=86400000;
  const dateOf=s=>Date.parse(`${s?.identity?.date||''}T12:00:00`)||0;
  // Real coaching failure this fixes: performance.js's selectStrokeForContext used to skip this medley
  // "which stroke needs work" logic entirely on the Board/TV view ('deckFast' mode) because summary()'s
  // 7-day session/block/item walk was uncached and too expensive to redo per stroke pill per swimmer on a
  // roster of 20-30 -- so on the one screen Andy actually coaches from every day, a medley swimmer's #1-stroke
  // pill silently fell back to a plain highest-ranked single-stroke PB (or nothing at all -- "Auto" -- for a
  // swimmer whose only strong ranked PB was Freestyle), never the real training-volume-based recommendation.
  // Caching summary()/weeklyEmphasis() per athlete+day+state-revision (same WeakMap+revision pattern
  // performance.js already uses for its own caches) makes repeat calls across many pills on the same render
  // pass free after the first, so the deckFast bypass is no longer needed for performance and can be removed.
  const summaryCache=new WeakMap(),emphasisCache=new WeakMap();
  const mapFor=(cache,state)=>{let m=cache.get(state);if(!m){m=new Map();cache.set(state,m);}return m;};
  function attendance(session,ath,state){const rows=(state?.attendance||[]).filter(x=>x.session_id===session?.id||x.sessionId===session?.id);if(rows.length){const r=rows.find(x=>(x.athlete_id||x.athleteId)===ath?.id);return{included:!!r&&['present','modified','late'].includes(String(r.status||'').toLowerCase()),source:'attendance',status:r?.status||'absent'};}const squads=session?.identity?.squads||[];return{included:!!ath?.squad&&squads.includes(ath.squad),source:'squad_assumption',status:'assumed'};}
  function weight(item){const raw=text([item?.zone,item?.raw,item?.text,...(item?.cues||[]),...(item?.repInstructions||[]).map(x=>x.label||'')].join(' ')).toLowerCase();if(/\b(?:max|sprint)\b/.test(raw))return WEIGHTS.sprint;if(/race\s*(?:pace|quality)|\b(?:50|100|200|400|800|1500)\s*(?:m\s*)?(?:race\s*)?pace\b/.test(raw))return WEIGHTS.race;if(/clearance|\bcl\b/.test(raw))return WEIGHTS.clearance;if(/threshold|\bthr\b|\bat\b/.test(raw))return WEIGHTS.threshold;if(/overload|\bol\b/.test(raw))return WEIGHTS.overload;if(/development|\bdev\b/.test(raw))return WEIGHTS.development;if(/regeneration|\bregen\b|\breg\b|\beasy\b|recovery|reset|warm.?down|cool.?down/.test(raw))return WEIGHTS.easy;if(/drill|scull|technique|skill|stroke count/.test(raw))return WEIGHTS.technical;const st=E.Evidence.stroke(item?.stroke||'');if(st==='Freestyle')return WEIGHTS.incidentalFree;return WEIGHTS.default;}
  function strokeInText(value){const s=text(value),exact=E.Evidence.stroke(s);if(STROKES.includes(exact)||exact==='IM')return exact;if(/\b(?:free|freestyle|fr)\b/i.test(s))return'Freestyle';if(/\b(?:back|backstroke|bk)\b/i.test(s))return'Backstroke';if(/\b(?:breast|breaststroke|br)\b/i.test(s))return'Breaststroke';if(/\b(?:fly|butterfly)\b/i.test(s))return'Butterfly';if(/\bIM\b|individual medley/i.test(s))return'IM';return'';}
  const imPart=(metres)=>({stroke:'IM',metres,imOnly:true}),ONE_STROKE=/#\s*\d\s*stroke\b/i;
  function splitStroke(item,total){const out=[];const comp=item?.composition||[];if(comp.length){for(const c of comp){const st=strokeInText(c?.stroke||c?.text||'');if(STROKES.includes(st))out.push({stroke:st,metres:Number(c.distance)||0});else if(st==='IM'){for(const s of STROKES)out.push({stroke:s,metres:(Number(c.distance)||0)/4});out.push(imPart(Number(c.distance)||0));}else out.push({stroke:'Freestyle',metres:Number(c.distance)||0});}const sum=out.filter(x=>!x.imOnly).reduce((n,x)=>n+x.metres,0);if(sum>0){const scale=total/sum;return out.map(x=>({...x,metres:x.metres*scale}));}}
    const st=strokeInText(item?.stroke||item?.raw||item?.text||'');if(st==='IM')return[...STROKES.map(s=>({stroke:s,metres:total/4})),imPart(total)];if(STROKES.includes(st))return[{stroke:st,metres:total}];if(ONE_STROKE.test(text(item?.raw||item?.text)))return[];/* #1 Stroke not resolved for this swimmer: unknown, not Free */return[{stroke:'Freestyle',metres:total}];
  }
  // 19 Nov 2026 (Andy + Mike): swim / kick / pull / drill / scull / underwater / skills, each with its stroke ("the stroke
  // of the kick"). What kind of work a line is comes from the one owner, dosage.js componentFrom; the stroke split
  // follows the same rule as above (IM shown as IM and a quarter in each stroke; nothing named = Freestyle).
  const COMPONENTS=['Swim','Kick','Pull','Drill','Scull','Underwater','Skills'];
  const componentOf=x=>{try{return M.dosageEngine?.componentFrom?.(x)||'Swim';}catch{return'Swim';}};
  function componentSplit(item,total){
    const parent=componentOf(item),comp=item?.composition||[];
    const strokesOf=(value,metres,fallback)=>{const st=strokeInText(value);if(st==='IM')return[...STROKES.map(s=>({stroke:s,metres:metres/4})),imPart(metres)];if(STROKES.includes(st))return[{stroke:st,metres}];return fallback(metres);};
    const whole=m=>splitStroke(item,m);
    if(comp.length){const parts=[];for(const c of comp){const d=Number(c?.distance)||0;if(!d)continue;const own=componentOf({raw:c?.text||'',stroke:c?.stroke||''}),k=own==='Swim'?parent:own;for(const x of strokesOf(c?.stroke||c?.text||'',d,m=>strokesOf(item?.stroke||item?.raw||item?.text||'',m,mm=>ONE_STROKE.test(text(item?.raw||item?.text))?[]:[{stroke:'Freestyle',metres:mm}])))parts.push({...x,component:k});}
      const sum=parts.filter(x=>!x.imOnly).reduce((n,x)=>n+x.metres,0);if(sum>0){const scale=total/sum;return parts.map(x=>({...x,metres:x.metres*scale}));}}
    return whole(total).map(x=>({...x,component:parent}));
  }
  const blankComponents=()=>Object.fromEntries(COMPONENTS.map(k=>[k,{total:0,...Object.fromEntries(REPORT_STROKES.map(s=>[s,0]))}]));
  function walk(items,mult,fn){for(const n of items||[]){if(n?.kind==='group'){walk(n.items||[],mult*Math.max(1,Number(n.rounds)||1),fn);continue;}if(n?.kind==='set')fn(n,mult);}}
  function sessionDose(session,ath,state=M.state){const att=attendance(session,ath,state),raw=Object.fromEntries(REPORT_STROKES.map(s=>[s,0])),weighted=Object.fromEntries(REPORT_STROKES.map(s=>[s,0]));const components=blankComponents();if(!att.included)return{included:false,raw,weighted,components,totalRaw:0,totalWeighted:0,attendance:att};for(const block of session?.blocks||[])walk(block.items||[],1,(item,mult)=>{let actual=item;try{actual=E.Modification.adaptItem(item,ath,state,session)||item}catch{}const metres=Math.max(1,Number(actual.reps)||1)*Math.max(0,Number(actual.distance)||0)*mult,w=weight(actual);for(const x of splitStroke(actual,metres)){raw[x.stroke]+=x.metres;weighted[x.stroke]+=x.metres*w;}for(const x of componentSplit(actual,metres)){const c=components[x.component]||components.Swim;c[x.stroke]+=x.metres;if(!x.imOnly)c.total+=x.metres;}});return{included:true,raw,weighted,components,totalRaw:STROKES.reduce((a,s)=>a+raw[s],0),totalWeighted:STROKES.reduce((a,s)=>a+weighted[s],0),attendance:att};}
  function rangeSessions(state,days=7,anchorDate=''){const all=Object.values(state?.canonicalSessions||{}),anchor=anchorDate?Date.parse(`${anchorDate}T23:59:59`):Date.now();if(!days)return all.filter(s=>{const d=dateOf(s);return d&&d<=anchor;});const cut=anchor-days*dayMs;return all.filter(s=>{const d=dateOf(s);return d&&d<=anchor&&d>cut;});}
  function summary(ath,state=M.state,{days=7,anchorDate=''}={}){
    const key=`${Number(state?.settings?.storageRevision||0)}|${ath?.id||''}|${days}|${anchorDate}`,cache=mapFor(summaryCache,state);
    if(cache.has(key))return cache.get(key);
    const raw=Object.fromEntries(REPORT_STROKES.map(s=>[s,0])),weighted=Object.fromEntries(REPORT_STROKES.map(s=>[s,0]));const components=blankComponents();let sessions=0,assumedSessions=0;for(const s of rangeSessions(state,days,anchorDate)){const d=sessionDose(s,ath,state);if(!d.included)continue;sessions++;if(d.attendance.source==='squad_assumption')assumedSessions++;for(const st of REPORT_STROKES){raw[st]+=d.raw[st]||0;weighted[st]+=d.weighted[st]||0;}for(const k of COMPONENTS)for(const f of Object.keys(components[k]))components[k][f]+=d.components?.[k]?.[f]||0;}const tr=STROKES.reduce((a,s)=>a+raw[s],0),tw=STROKES.reduce((a,s)=>a+weighted[s],0),share=Object.fromEntries(REPORT_STROKES.map(s=>[s,tw?weighted[s]/tw*100:0]));
    const out={athleteId:ath?.id,days,sessions,assumedSessions,raw,weighted,share,components,totalRaw:tr,totalWeighted:tw,weights:WEIGHTS};
    cache.set(key,out);if(cache.size>500)cache.delete(cache.keys().next().value);return out;
  }
  function weeklyEmphasis(state=M.state,anchorDate=''){
    const key=`${Number(state?.settings?.storageRevision||0)}|${anchorDate}`,cache=mapFor(emphasisCache,state);
    if(cache.has(key))return cache.get(key);
    const scores=new Map(),sessions=rangeSessions(state,7,anchorDate).sort((a,b)=>dateOf(b)-dateOf(a));for(const s of sessions){const meta=text([s?.metadata?.technicalFocus,s?.metadata?.planCue,s?.metadata?.primarySystem,s?.metadata?.strokeEmphasis,s?.identity?.title].join(' '));for(const st of STROKES){const re=st==='Freestyle'?/\b(?:free|freestyle)\b/i:st==='Backstroke'?/\bback/i:st==='Breaststroke'?/\bbreast/i:/\b(?:fly|butterfly)\b/i;if(re.test(meta))scores.set(st,(scores.get(st)||0)+1);}}
    const out=[...scores].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    cache.set(key,out);if(cache.size>500)cache.delete(cache.keys().next().value);return out;
  }
  function recommendStroke(ath,state=M.state,session=null,{formOnly=false}={}){const perf=M.performanceEngine,course=session?.identity?.course||'',event=perf?.bestEvent?.(ath,state,course),ranked=perf?.rankedEvents?.(ath,state,course)||[],rankedAllowed=(formOnly?['Backstroke','Breaststroke','Butterfly']:STROKES).filter(st=>ranked.some(r=>r.stroke===st));if(!event)return{stroke:'',source:'No ranked PB evidence for #1 event',confidence:'none'};if(event.stroke!=='IM'){if(!rankedAllowed.length)return{stroke:'',source:'No ranked PB evidence for an applicable stroke',confidence:'none'};const best=ranked.find(r=>rankedAllowed.includes(r.stroke));return best?{stroke:best.stroke,source:'Highest ranked stroke PB',confidence:'high',bestEvent:event}:null;}
    const allowed=formOnly?['Backstroke','Breaststroke','Butterfly']:STROKES;
    const emphasis=weeklyEmphasis(state,session?.identity?.date||'');if(emphasis&&allowed.includes(emphasis))return{stroke:emphasis,source:`IM balance · weekly ${emphasis} emphasis`,confidence:'high',bestEvent:event};
    const coach=perf?.selectedCoachStroke?.(ath,state,14);if(coach&&allowed.includes(coach))return{stroke:coach,source:`IM balance · recent coach ${coach} selections`,confidence:'medium',bestEvent:event};
    const bal=summary(ath,state,{days:7,anchorDate:session?.identity?.date||''}),ordered=allowed.map(st=>({stroke:st,share:bal.share[st]||0,ranked:ranked.some(r=>r.stroke===st)})).sort((a,b)=>a.share-b.share||Number(b.ranked)-Number(a.ranked));return{stroke:ordered[0].stroke,source:`IM balance · lowest 7-day weighted exposure (${ordered[0].share.toFixed(0)}%)`,confidence:bal.sessions>=2?'medium':'low',bestEvent:event,balance:bal};
  }
  // Real coaching failure this fixes (Andy's own voice-memo spec, build-list item 8): a swimmer training alone
  // ("Matthew will be doing his sessions when I'm not thinking about swimming") needs an evidence-checked
  // answer to a stroke challenge instantly, on their own device -- not only later when Andy opens his feedback
  // inbox. Neither the swimmer portal nor a Supabase function has access to the live coach-app engines, so the
  // ONE safe way to give an instant answer without duplicating this logic a second time (the constitution's own
  // "no competing sources of truth" rule) is to publish the RAW EVIDENCE this function already computes
  // (engines/swimmer-invite-bn.js does this at QR-publish time) and let a small, dumb comparison run wherever
  // the instant answer is needed. This is that shared evidence computation -- the single owner for "what does
  // the evidence say a swimmer's #1 stroke should be" -- used by both engines/swimmer-feedback-cu.js's coach-
  // side review (evaluateStrokeChallenge) and swimmer-invite-bn.js's publish-time snapshot.
  function challengeEvidence(ath,state=M.state,session=null){
    const perf=M.performanceEngine,course=session?.identity?.course||'',event=perf?.bestEvent?.(ath,state,course);
    if(!event)return{hasEvidence:false,isMedley:false,needsWorkStrokes:[],shares:{},topStroke:'',rankedPoints:{}};
    if(event.stroke==='IM'){
      const sum=summary(ath,state,{days:7,anchorDate:session?.identity?.date||''});
      const ordered=STROKES.map(s=>({stroke:s,share:sum.share?.[s]||0})).sort((a,b)=>a.share-b.share);
      return{hasEvidence:true,isMedley:true,needsWorkStrokes:ordered.slice(0,2).map(x=>x.stroke),shares:Object.fromEntries(ordered.map(x=>[x.stroke,Math.round(x.share*10)/10])),topStroke:'',rankedPoints:{}};
    }
    const ranked=perf?.rankedEvents?.(ath,state,course)||[],top=ranked[0]||null;
    const rankedPoints=Object.fromEntries(ranked.filter(r=>STROKES.includes(r.stroke)).map(r=>[r.stroke,Math.round(r.points||0)]));
    return{hasEvidence:!!top,isMedley:false,needsWorkStrokes:[],shares:{},topStroke:top?.stroke||'',rankedPoints};
  }
  // One table for every screen that shows components (swimmer page, reports): rows Swim / Kick / Pull / ..., one column
  // per window, each cell the metres and its stroke breakdown. Rows with no metres in any window are left out.
  function componentsHtml(cols){
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const n=v=>Math.round(v).toLocaleString(),sh=s=>({Freestyle:'Fr',Backstroke:'Bk',Breaststroke:'Br',Butterfly:'Fly',IM:'IM'}[s]||s);
    const rows=COMPONENTS.filter(k=>cols.some(c=>(c.summary?.components?.[k]?.total||0)>=1));
    if(!rows.length)return'<p class="muted">No training logged in this window.</p>';
    return`<div class="sb-comp" data-sb-components><div class="sb-comp-row sb-comp-head"><span></span>${cols.map(c=>`<b>${esc(c.label)}</b>`).join('')}</div>${rows.map(k=>`<div class="sb-comp-row" data-sb-component="${k}"><span><b>${k}</b></span>${cols.map(c=>{const r=c.summary?.components?.[k]||{};const parts=REPORT_STROKES.filter(s=>(r[s]||0)>=1).map(s=>`${sh(s)} ${n(r[s])}`);return`<span><b>${r.total>=1?`${n(r.total)}m`:'—'}</b>${parts.length?`<small>${parts.join(' · ')}</small>`:''}</span>`;}).join('')}</div>`).join('')}</div><style>.sb-comp{display:grid;gap:6px}.sb-comp-row{display:grid;grid-template-columns:minmax(80px,1fr) repeat(${cols.length},minmax(0,1.6fr));gap:8px;align-items:start;border-bottom:1px solid rgba(127,127,127,.18);padding:4px 0}.sb-comp-row small{display:block;opacity:.75;font-size:.82em}.sb-comp-head b{font-size:.85em;opacity:.8}</style>`;
  }
  B.componentsHtml=componentsHtml;
  B.STROKES=STROKES;B.REPORT_STROKES=REPORT_STROKES;B.COMPONENTS=COMPONENTS;B.componentSplit=componentSplit;B.WEIGHTS=WEIGHTS;B.weight=weight;B.strokeInText=strokeInText;B.sessionDose=sessionDose;B.summary=summary;B.weeklyEmphasis=weeklyEmphasis;B.recommendStroke=recommendStroke;B.rangeSessions=rangeSessions;B.challengeEvidence=challengeEvidence;
})(globalThis);
