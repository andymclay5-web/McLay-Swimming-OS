'use strict';
// 13 Nov 2026 (Andy: "The connection to the races and training needs to be broadened ... if we're doing underwater kick,
// that's specific to a lot of races, needs to show. If we're doing back-end speed work, it needs to show ... dive starts,
// that's helping all of these races. We're doing an endurance set, that's helping your distance races ... the notes that we're
// taking and the captures that we're taking, we can actually pull them back to races." Then: "Keep it broad as a range,
// auto, put things that you see in sessions I have done ... under waters, turns, max kick etc").
//
// One shared list of race elements. Every set (and the cue lines under it), every capture / note, and every race event is
// read against the same list, automatically, from the words Andy actually writes (mined from his 88 cloud sessions,
// 22 Jul - 12 Nov 2026: "15m max", "uw fins", "fob", "dive start", "breakout", "turns", "parachute", "bands only max",
// "MSC", "hypoxic", "clearance", "@100p", "back-end speed", "last 10m max", ...). A race event says how much each element
// matters to it (0-3, by distance / stroke / course). "Training behind this race" = every set the swimmer was at in the
// weeks before, labelled, dosed (sets / efforts / metres) and weighted by what that race needs, plus the captures and notes
// that carry the same labels. Patterns, not proof: the views say so.
(function(g){
  const M=g.MSOS4;if(!M)return;
  const RE=M.raceElements=M.raceElements||{};RE.VERSION='1.3.0-20261114-summary';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const low=v=>text(v).toLowerCase();

  // family, id, label, short chip, matcher
  RE.FAMILIES=[['skills','Race skills'],['speed','Speed'],['race','Race-specific'],['engine','Engine'],['technique','Technique']];
  RE.ELEMENTS=[
    {id:'starts',family:'skills',label:'Starts',chip:'Start',re:/\bdives?\b|dive[- ]?start|\b(?<!push )starts?\b(?! at)|\bblocks?\b|reaction time|\brelay start/},
    {id:'underwater',family:'skills',label:'Underwater kick',chip:'Underwater',re:/under\s*-?\s*waters?\b|\buw\b|under\s*h2o|\bfob\b|fly kick on (?:the )?back|dolphin|kayak kick|streamline (?:kick|uw|build)|kick (?:in )?streamline|max dist(?:ance)? under/},
    {id:'breakout',family:'skills',label:'Breakouts',chip:'Breakout',re:/break\s*-?\s*outs?\b|pull\s*-?\s*outs?\b/},
    {id:'turns',family:'skills',label:'Turns',chip:'Turns',re:/\bturns?\b|off the walls?|through the wall|attack (?:off )?the wall|tight touch|\btransitions?\b|\d+\s*kicks out|start at (?:the )?flags|into (?:the )?turn/},
    {id:'finish',family:'skills',label:'Finishes',chip:'Finish',re:/\bfinish(?:es|ing)?\b(?!\s*\/\s*kick)|last (?:5|10|15|20)\s*m\b|medal finish|into the wall|\btouch(?:es)?\b/},
    {id:'maxSpeed',family:'speed',label:'Max speed',chip:'Max',re:/\bmax\b(?! dist)|\bsprints?\b|\bspeed\b|sharpeners?|\bfast\b|(?<!aerobic )\bpower\b|all[- ]out/},
    {id:'resisted',family:'speed',label:'Resisted / assisted',chip:'Resisted',re:/parachute|resist(?:ed|ance)|assisted|\bcords?\b|bands? only|\btether|\bdrag\b|bucket/},
    {id:'frontEnd',family:'speed',label:'Front-end speed',chip:'Front-end',re:/front[- ]end|first (?:10|15|20|25)\s*m?\b|fast first|out fast|first 25/},
    {id:'backEnd',family:'speed',label:'Back-end speed',chip:'Back-end',re:/back[- ]end|back half|second (?:half|100|50)|last (?:25|50)\b|neg(?:ative)?[- ]split|closing speed|last turn|strong home|home strong|final (?:25|50)\b/},
    // race pace is Andy's anaerobic power (race pace / lactate tolerance, as in his dosage model) -- one element, not two
    {id:'racePace',family:'race',label:'Race pace / anaerobic power',chip:'Race pace',re:/anaerobic|lactate|tolerance|max effort|\bhvo\b|race[- ]?pace|@\s*\d{2,4}\s*p(?:ace)?\b|\b\d{2,4}\s*p\b|\b\d{2,4}\s*pace\b|\brp\b|race (?:simulation|quality|skills|specific|tempo|intensity|speed|feel)|broken (?:50|100|200|400)|goal pace|of \d{2,4} race/},
    {id:'pacing',family:'race',label:'Pacing control',chip:'Pacing',re:/\bdesc(?:end(?:ing)?)?\b|even pac|hold (?:pace|time|speed|fastest)|\bpacing\b|heart[- ]?rate range|\bhr gauge|negative split/},
    // Andy's four-zone focus (reference library, 15 Oct): Aerobic Capacity / Aerobic Power / Anaerobic Power (race pace,
    // lactate) / Anaerobic Capacity (top-end speed) -- aerobic is split so distance work and threshold work read apart.
    {id:'aerobic',family:'engine',label:'Aerobic capacity',chip:'Aerobic cap',re:/(?<!an)aerobic(?! power)|regen(?:eration)?|\bdevelopment\b|\bdev\b|\breg\b|\bsteady\b|(?<!anaerobic )capacity/},
    {id:'aerobicPower',family:'engine',label:'Aerobic power',chip:'Aerobic pwr',re:/aerobic power|threshold|\boverload\b|\bthr\b|\bol\b|clearance|\bcl\b|vo2|heart[- ]?rate|\bhr\b(?! gauge)|\bhr gauge/},
    {id:'kick',family:'engine',label:'Kick',chip:'Kick',re:/\bkick(?:s|ing)?\b/},
    {id:'pull',family:'engine',label:'Pull / upper-body',chip:'Pull',re:/\bpull\b|paddles?|\bpads\b|\bbuoy\b/},
    {id:'efficiency',family:'technique',label:'Stroke efficiency',chip:'Efficiency',re:/stroke count|\bmsc\b|\bmsl\b|distance per stroke|\bdps\b|stroke length|hold (?:the )?count|\b\d?msc\b|efficien/},
    {id:'technique',family:'technique',label:'Technique / drill',chip:'Technique',re:/\bdrills?\b|\bscull(?:ing)?\b|body ?line|\bposture\b|\brotation\b|\btiming\b|\bcatch\b|technique|\bhbs\b|hands by side|alignment|\bhips\b|perfect\b|\bclean\b/},
    {id:'breathing',family:'technique',label:'Breathing control',chip:'Breathing',re:/hypoxic|\bhyp\s*\d|breath(?:e|ing)?|\b\d\s*hr\b|\bbr\s*\d\b/},
    {id:'relay',family:'skills',label:'Relay takeovers',chip:'Relay',re:/\brelays?\b|takeovers?|changeovers?/}
  ];
  RE.byId=Object.fromEntries(RE.ELEMENTS.map(e=>[e.id,e]));
  const ZONE_ELEMENTS={regeneration:'aerobic',development:'aerobic',overload:'aerobicPower',threshold:'aerobicPower',clearance:'aerobicPower','race pace':'racePace',sprint:'maxSpeed'};

  RE.tagText=(raw,{zone=''}={})=>{const t=low(raw).replace(/[—–]/g,' - ');const out=[];if(!t&&!zone)return out;for(const e of RE.ELEMENTS)if(e.re.test(t))out.push(e.id);const z=ZONE_ELEMENTS[low(zone)];if(z&&!out.includes(z))out.push(z);return out;};

  // ---- what each race event needs (0-3) ----
  const band=d=>d<=50?50:d<=100?100:d<=200?200:d<=400?400:800;
  const W={
    starts:{50:3,100:2,200:1,400:1,800:0},underwater:{50:3,100:3,200:2,400:1,800:1},breakout:{50:3,100:3,200:2,400:1,800:1},
    turns:{50:1,100:2,200:3,400:3,800:3},finish:{50:3,100:3,200:2,400:1,800:1},
    maxSpeed:{50:3,100:2,200:1,400:0,800:0},resisted:{50:3,100:2,200:1,400:0,800:0},frontEnd:{50:3,100:2,200:1,400:1,800:0},backEnd:{50:1,100:3,200:3,400:2,800:1},
    racePace:{50:2,100:3,200:3,400:3,800:2},pacing:{50:0,100:1,200:2,400:3,800:3},
    aerobic:{50:0,100:1,200:2,400:3,800:3},aerobicPower:{50:0,100:2,200:3,400:3,800:2},kick:{50:2,100:2,200:2,400:1,800:1},pull:{50:1,100:1,200:2,400:2,800:2},
    efficiency:{50:1,100:2,200:2,400:3,800:3},technique:{50:1,100:1,200:1,400:1,800:1},breathing:{50:2,100:1,200:1,400:1,800:1},relay:{50:1,100:1,200:0,400:0,800:0}
  };
  RE.strokeOf=v=>{const t=low(v);if(/\bim\b|medley/.test(t))return'IM';if(/back|\bbk\b/.test(t))return'Backstroke';if(/breast|\bbr\b(?!\s*\d)/.test(t))return'Breaststroke';if(/\bfly\b|butter/.test(t))return'Butterfly';if(/free|\bfr\b/.test(t))return'Freestyle';return'';};
  RE.weight=(id,{distance,stroke,course='SCM'}={})=>{const row=W[id];if(!row)return 0;let w=row[band(Number(distance)||100)]??0;const s=RE.strokeOf(stroke),c=String(course||'').toUpperCase();
    if((id==='turns'||id==='underwater'||id==='breakout')&&c==='SCM'&&w>0&&w<3)w+=id==='turns'&&Number(distance)<=50?1:0.5;
    if(id==='turns'&&Number(distance)<=50&&c==='LCM')w=0;
    if(id==='kick'&&/Butterfly|Backstroke|Breaststroke/.test(s))w=Math.min(3,w+1);
    if(id==='underwater'&&s==='Breaststroke')w=Math.max(0,w-1);
    if(id==='breakout'&&s==='Breaststroke')w=Math.min(3,w+0.5);
    if(id==='turns'&&s==='IM')w=Math.min(3,w+0.5);
    if(id==='breathing'&&s==='Breaststroke')w=Math.max(0,w-1);
    return Math.min(3,w);};
  RE.needs=event=>RE.ELEMENTS.map(e=>({id:e.id,label:e.label,weight:RE.weight(e.id,event)})).filter(x=>x.weight>=1).sort((a,b)=>b.weight-a.weight);

  // ---- sets in a session, labelled and dosed ----
  const repsInCue=t=>{const m=String(t||'').match(/^\s*(\d{1,2})\s*[x×]\s*(?!\d)/i);return m?Number(m[1]):1;};
  RE.sessionSets=session=>{if(!session)return[];if(session.__reSets&&session.__reSetsRev===session.updated_at)return session.__reSets;const out=[];
    for(const bl of session.blocks||[]){const blockFocus=[];const pending=[];
      const items=bl.items||[];for(const it of items)if(it?.kind==='cue'&&/^\s*(focus|target|goal)\b/i.test(it.raw||it.text||''))blockFocus.push(it.raw||it.text);
      const walk=(xs,rounds)=>{let last=null;for(const it of xs||[]){
        if(it?.kind==='group'){walk(it.items,(rounds||1)*(Number(it.rounds)||1));last=null;continue;}
        if(it?.kind==='cue'){const raw=text(it.raw||it.text);if(!raw||/^\s*(focus|target|goal)\b/i.test(raw))continue;
          // a cue under a set adds to that set ("15m max" under "8 x 25"); a cue with its own "4 x ..." is its own effort ("4 x dive start")
          if(last&&!/^\s*\d{1,2}\s*[x×]/i.test(raw)){last.text+=' · '+raw;continue;}
          const row={id:it.id||'',session,block:bl.type,item:it,label:raw,text:raw,stroke:RE.strokeOf(raw),reps:repsInCue(raw)*(rounds||1),metres:0,cueOnly:true};out.push(row);last=row;continue;}
        if(it?.kind!=='set')continue;
        const raw=text(it.raw||it.text),reps=(Number(it.reps)||1)*(rounds||1),d=Number(it.distance)||0;
        // a "6 x Turn" / "6 x 15m Finish" line the parser keeps under a set is its own effort, not part of that set
        const own=[],extra=[];let cur=own;for(const pt of [...(it.pattern||[]).map(p=>p?.text),...(it.cues||[]).map(c=>typeof c==='string'?c:c?.text)].filter(Boolean)){if(/^\s*\d{1,2}\s*[x×]\s*(?!\d)/i.test(pt)){cur=[pt];extra.push(cur);}else cur.push(pt);}
        const row={id:it.id||'',session,block:bl.type,item:it,label:raw,text:[raw,...own].filter(Boolean).join(' · '),stroke:RE.strokeOf(it.stroke)||RE.strokeOf(raw),zone:it.zone||'',reps,metres:reps*d};out.push(row);last=row;
        for(const e of extra){const er={id:'',session,block:bl.type,item:it,label:text(e[0]),text:e.join(' · '),stroke:RE.strokeOf(e[0]),reps:repsInCue(e[0])*(rounds||1),metres:0,cueOnly:true};out.push(er);last=er;}}};
      walk(items,1);
      for(const r of out.filter(x=>x.block===bl.type&&!x.tagged)){r.tags=RE.tagText(r.text,{zone:r.zone});/* 14 Nov 2026: a library set's focus is the purpose of the SESSION it came from, so it only fills in a line whose own words say nothing ("12 x 50 Scull / Drill / Swim Perfect Technique" had picked up race pace from a race-pace session) */const own=[...r.tags];const ref=RE.refFor(r.label);if(ref){r.ref=ref;if(!own.length)for(const t of ref.tags)if(!r.tags.includes(t))r.tags.push(t);}/* 13 Nov 2026 (Andy: "most repeated race pace effort sets are working back end speed in some way"): race pace repeated 3+ times, in the set's own words */if(own.includes('racePace')&&r.reps>=3&&!r.tags.includes('backEnd')){r.tags.push('backEnd');r.backEndWhy='repeated race pace';}if(blockFocus.length)for(const t of RE.tagText(blockFocus.join(' ')))if(!r.tags.includes(t))r.tags.push(t);r.tagged=true;}
      void pending;}
    try{Object.defineProperty(session,'__reSets',{value:out,configurable:true,writable:true,enumerable:false});Object.defineProperty(session,'__reSetsRev',{value:session.updated_at,configurable:true,writable:true,enumerable:false});}catch{}
    return out;};
  // ---- Andy's reference library (engines/session-methodology.js SM.REFLIB, built with ChatGPT 15 Oct from his sessions,
  // and his own built-in sets SM.LIB): a session line that is one of those sets takes that set's focus as well ----
  const FOCUS={aerobic:['aerobic'],threshold:['aerobicPower'],race:['racePace'],speed:['maxSpeed'],skill:['technique'],acanc:['maxSpeed']};
  // a line shared by several library sets, or a plain easy / choice / free line, says nothing about purpose on its own
  const GENERIC=/^(?:\d+\s*x\s*)?\d+(?:\.\d)?\s*(?:easy|choice|free(?:style)?|swim|scull|drill|im|kick|pull|back|breast|fly|#1)?\s*(?:\d+\s*s\s*r)?$/;
  const normLine=v=>low(v).replace(/[×]/g,'x').replace(/[—–]/g,'-').replace(/\s*([@:/-])\s*/g,'$1').replace(/\s+/g,' ').trim();
  let refIdx=null;RE.refIndex=()=>{if(refIdx)return refIdx;const SM=M.sessionMethodology;/* main and pre sets only: a warm-up / post-set / warm-down line's library focus is the day's purpose, not its own */const lib=[...(SM?.REFLIB||[]),...((SM?.LIB||[]).filter(x=>!x.ref))].filter(x=>/^(?:MAIN|PRE)/i.test(String(x.section||'')));if(!lib.length)return new Map();refIdx=new Map();
    for(const x of lib){const focus=[...(x.focus||[]),...(x.for||[]),...(x.fits||[]).map(f=>low(f).includes('speed')||low(f).includes('max')?'speed':low(f).includes('threshold')?'threshold':low(f).includes('aerobic')?'aerobic':'')].filter(Boolean);
      const tags=[...new Set(focus.flatMap(f=>FOCUS[f]||[]))];const lines=String(x.text||'').split('\n').map(normLine).filter(l=>/\d/.test(l)&&l.length>=8);
      for(const l of lines){if(GENERIC.test(l))continue;if(refIdx.has(l)){if(refIdx.get(l).code!==(x.code||x.id))refIdx.get(l).shared=true;continue;}refIdx.set(l,{code:x.code||x.id,label:x.label,tags,use:x.use||''});}}
    for(const[k,v]of refIdx)if(v.shared)refIdx.delete(k);return refIdx;};
  RE.refFor=label=>RE.refIndex().get(normLine(label))||null;
  RE.tagsForItem=(session,itemId)=>RE.sessionSets(session).find(r=>r.id===itemId)?.tags||[];

  // ---- which sessions a swimmer was at ----
  const dateOf=s=>String(s?.identity?.date||s?.session_date||s?.date||'').slice(0,10);
  RE.sessionsFor=(ath,from,to,state=M.state)=>{const all=Object.values(state?.canonicalSessions||{}).filter(s=>{const d=dateOf(s);return d&&d>=from&&d<to;});
    const att=state?.attendance||[];const bySession=new Map();for(const a of att){if(!bySession.has(a.session_id))bySession.set(a.session_id,[]);bySession.get(a.session_id).push(a);}
    const out=[];for(const s of all){const rows=bySession.get(s.id);if(rows?.length){const mine=rows.find(r=>r.athlete_id===ath.id);if(mine&&['present','modified'].includes(mine.status))out.push({session:s,how:'present'});continue;}
      const squads=s.identity?.squads||s.squads||[];if(ath.squad&&squads.includes(ath.squad))out.push({session:s,how:'squad'});}
    return out.sort((a,b)=>dateOf(a.session).localeCompare(dateOf(b.session)));};

  const strokeFits=(setStroke,event)=>{const e=RE.strokeOf(event.stroke);if(!setStroke||e==='IM'||setStroke==='IM')return 1;return setStroke===e?1:0.5;};
  const iso=d=>d.toISOString().slice(0,10);
  const minusDays=(day,n)=>{const d=new Date(`${day}T12:00:00`);d.setDate(d.getDate()-n);return iso(d);};

  // ---- captures / notes for a swimmer, labelled ----
  RE.capturesFor=(ath,sessions,state=M.state)=>{const ids=new Set(sessions.map(x=>x.session.id));const out=[];
    for(const c of state?.captures||[]){if(!ids.has(c.session_id))continue;const who=[...(c.athlete_ids||[]),c.athlete_id].filter(Boolean);if(who.length&&!who.includes(ath.id))continue;
      const sess=sessions.find(x=>x.session.id===c.session_id)?.session;const itemTags=c.item_id?RE.tagsForItem(sess,c.item_id):[];const note=text([c.capture_note,c.metadata?.capture_note,c.note,c.text_content].filter(Boolean).join(' · '));
      const tags=[...new Set([...RE.tagText(note),...itemTags])];if(!tags.length&&!note)continue;
      out.push({capture:c,date:dateOf(sess),tags,note,type:String(c.capture_type||'text'),group:!who.length,setLabel:c.item_id?RE.sessionSets(sess).find(r=>r.id===c.item_id)?.label||'':''});}
    return out.sort((a,b)=>String(b.date).localeCompare(String(a.date)));};

  // ---- training behind a race (or behind an event right now) ----
  RE.behind=(ath,event,{weeks=8,before='',state=M.state}={})=>{const to=before||iso(new Date(Date.now()+864e5)),from=minusDays(to,weeks*7);
    const sessions=RE.sessionsFor(ath,from,to,state);const acc=new Map();
    for(const{session,how}of sessions){for(const r of RE.sessionSets(session)){for(const id of r.tags||[]){const w=RE.weight(id,event);if(w<1)continue;const fit=strokeFits(r.stroke,event);
      const a=acc.get(id)||{id,label:RE.byId[id].label,weight:w,sets:0,efforts:0,metres:0,sessions:new Set(),examples:[]};a.sets+=fit;a.efforts+=r.reps*fit;a.metres+=r.metres*fit;a.sessions.add(session.id);
      if(a.examples.length<4&&!a.examples.some(x=>x.label===r.label))a.examples.push({date:dateOf(session),label:r.label,how});acc.set(id,a);}}}
    const elements=[...acc.values()].map(a=>({...a,sessions:a.sessions.size,score:a.weight*a.sets})).sort((x,y)=>y.score-x.score);
    const caps=RE.capturesFor(ath,sessions,state).filter(c=>c.tags.some(t=>RE.weight(t,event)>=2));
    const missing=RE.needs(event).filter(n=>n.weight>=2&&!acc.has(n.id));
    return{from,to,weeks,sessions:sessions.length,attended:sessions.filter(s=>s.how==='present').length,elements,captures:caps,missing};};

  // ---- whole-swimmer mix: what each element got, and which of their events it feeds ----
  RE.mix=(ath,{weeks=8,state=M.state,events=[]}={})=>{const to=iso(new Date(Date.now()+864e5)),from=minusDays(to,weeks*7),sessions=RE.sessionsFor(ath,from,to,state);const acc=new Map();
    for(const{session}of sessions)for(const r of RE.sessionSets(session))for(const id of r.tags||[]){const a=acc.get(id)||{id,label:RE.byId[id].label,family:RE.byId[id].family,sets:0,efforts:0,metres:0,sessions:new Set()};a.sets++;a.efforts+=r.reps;a.metres+=r.metres;a.sessions.add(session.id);acc.set(id,a);}
    const rows=[...acc.values()].map(a=>({...a,sessions:a.sessions.size,feeds:events.filter(ev=>RE.weight(a.id,ev)>=2).map(ev=>ev)}));
    return{from,to,weeks,sessions:sessions.length,rows};};

  // ---- races in a window, with the change against the swimmer's previous best in that event ----
  RE.results=(ath,state=M.state)=>{const pools=[...(state?.resultsEventHistory||state?.results_event_history||[]),...(state?.coachResults||state?.coach_results||[]),...((state?._refs||{}).results_event_history||[])];const seen=new Set(),rows=[];
    for(const r of pools){if(r?.athlete_id!==ath.id)continue;const sec=Number(r.result_time_seconds??r.result_seconds);const d=String(r.result_date||'').slice(0,10);const stroke=RE.strokeOf(r.stroke||r.event_stroke),dist=Number(r.distance||r.event_distance),course=String(r.course||r.pool_course||'').toUpperCase().replace(/^SC$/,'SCM').replace(/^LC$/,'LCM');
      if(!(sec>0)||!d||!stroke||!dist)continue;const k=`${d}|${dist}|${stroke}|${course}|${sec.toFixed(2)}`;if(seen.has(k))continue;seen.add(k);rows.push({date:d,distance:dist,stroke,course,seconds:sec,meet:r.meet_name||'',round:r.round||''});}
    return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.seconds-b.seconds);};
  RE.recentRaces=(ath,{weeks=12,state=M.state}={})=>{const all=RE.results(ath,state),from=minusDays(iso(new Date()),weeks*7),out=[];const best=new Map();
    for(const r of all){const k=`${r.distance}|${r.stroke}|${r.course}`;const prev=best.get(k);if(r.date>=from){const day=out.find(x=>x.key===k&&x.date===r.date);if(!day||r.seconds<day.seconds){if(day)out.splice(out.indexOf(day),1);out.push({...r,key:k,prevBest:prev??null,change:prev!=null?r.seconds-prev:null});}}
      if(prev==null||r.seconds<prev)best.set(k,r.seconds);}
    return out.sort((a,b)=>b.date.localeCompare(a.date));};

  // ---- patterns: an element's dose before races in the events it matters to, and how those races went ----
  RE.patterns=(ath,{weeks=12,state=M.state}={})=>{const races=RE.recentRaces(ath,{weeks,state}).filter(r=>r.change!=null);const out=[];
    for(const e of RE.ELEMENTS){const rel=races.filter(r=>RE.weight(e.id,r)>=2);if(!rel.length)continue;let sets=0;const lines=[];
      for(const r of rel){const b=RE.behind(ath,r,{weeks:6,before:r.date,state});const hit=b.elements.find(x=>x.id===e.id);sets+=hit?.sets||0;lines.push({race:r,sets:hit?.sets||0});}
      if(!sets)continue;const faster=lines.filter(l=>l.sets>0&&l.race.change<0).length,withWork=lines.filter(l=>l.sets>0).length;out.push({id:e.id,label:e.label,sets:Math.round(sets),races:lines,faster,withWork});}
    return out.sort((a,b)=>b.sets-a.sets);};

  // ---- back-end speed from race splits (race_results.splits, cumulative times). Short-course imports label every 25 m
  // lap as 50 m (a 200 IM's markers run to 400), so markers are rescaled to the race distance before halves are taken. ----
  RE.splitsOf=row=>{let sp=row?.splits;if(typeof sp==='string'){try{sp=JSON.parse(sp);}catch{sp=null;}}if(!Array.isArray(sp)||!sp.length)return[];
    const pts=sp.map(x=>({m:Number(x?.metres??x?.distance??x?.m),t:Number(x?.cumulative??x?.time??x?.seconds)})).filter(x=>x.m>0&&x.t>0).sort((a,b)=>a.m-b.m);if(!pts.length)return[];
    const dist=Number(row.distance),last=pts[pts.length-1].m,k=dist>0&&last!==dist&&Math.abs(last/dist-Math.round(last/dist))<1e-6&&Math.round(last/dist)>=2?dist/last:1;
    return pts.map(x=>({m:Math.round(x.m*k*10)/10,t:x.t}));};
  RE.backEndOf=row=>{const pts=RE.splitsOf(row),D=Number(row.distance),total=Number(row.result_time_seconds??row.seconds)||pts[pts.length-1]?.t;if(!pts.length||!(D>0)||!(total>0))return null;
    const at=m=>pts.find(x=>Math.abs(x.m-m)<0.01)?.t;const half=at(D/2);if(!(half>0))return null;const front=half,back=total-half;
    const q3=at(D*3/4),close=q3>0?total-q3:null;return{front,back,diff:back-front,pct:(back-front)/front*100,close,closeOf:q3>0?D/4:null,total};};
  RE.splitRows=ath=>M.state?.raceSplits?.[ath?.id]?.rows||[];
  RE.loadSplits=async(ath,{force=false}={})=>{const C=M.cloud;if(!ath?.id||!C?.ready?.()||!C.fetchPages)return null;const st=M.state.raceSplits=M.state.raceSplits||{},have=st[ath.id];
    if(have&&!force&&Date.now()-Date.parse(have.at||0)<6*36e5)return have.rows;
    const rows=await C.fetchPages(`/rest/v1/race_results?select=id,result_date,distance,stroke,course,round,result_time_seconds,result_time_text,splits,meet_id&athlete_id=eq.${encodeURIComponent(ath.id)}&approved=eq.true&splits=not.is.null&order=result_date.desc,id.asc`,1000,5000);
    st[ath.id]={at:new Date().toISOString(),rows:(rows||[]).filter(r=>RE.splitsOf(r).length)};try{M.store?.save?.(M.state);}catch{}return st[ath.id].rows;};
  // per event: each swim's back half against front half, newest first, and whether the latest closes better than before
  RE.backEndHistory=(ath,event)=>{const s=RE.strokeOf(event.stroke),c=String(event.course||'').toUpperCase();const rows=RE.splitRows(ath).filter(r=>Number(r.distance)===Number(event.distance)&&RE.strokeOf(r.stroke)===s&&(!c||String(r.course||'').toUpperCase().replace(/^SC$/,'SCM').replace(/^LC$/,'LCM')===c))
      .map(r=>({date:String(r.result_date||'').slice(0,10),round:r.round||'',seconds:Number(r.result_time_seconds),...RE.backEndOf(r)})).filter(x=>x.front>0).sort((a,b)=>b.date.localeCompare(a.date)||a.seconds-b.seconds);
    if(!rows.length)return null;const latest=rows[0],earlier=rows.slice(1);const avg=earlier.length?earlier.reduce((t,x)=>t+x.diff,0)/earlier.length:null;
    return{rows,latest,earlierAvg:avg,better:avg!=null?latest.diff<avg:null,change:avg!=null?latest.diff-avg:null};};
  // ---- plain-language summary (Andy, 14 Nov: "a brief summary tied to training and each event ... what is lacking and
  // what is being done ... anyone swimmer coach parent can see straight up what's happening and what needs to be worked
  // on"). Per event: each element the race leans on (2-3 dots) is done / light / missing by sessions in the last 8 weeks
  // (a 3-dot element wants 4+ sessions, a 2-dot one 2+); race splits add whether the back half is fading; the next focus
  // is the race evidence first, then the biggest gaps, each with a set from Andy's reference library to try. ----
  const enough=w=>w>=3?4:2;
  let sugg=null;RE.suggestFor=(id,used=null)=>{if(!sugg){sugg=new Map();const SM=M.sessionMethodology;const lib=(SM?.REFLIB||[]).filter(x=>/^(?:MAIN|PRE)/i.test(x.section||'')).sort((a,b)=>(/^MAIN/i.test(a.section)?0:1)-(/^MAIN/i.test(b.section)?0:1));
      for(const x of lib){const tg=RE.tagText(x.text);if(tg.includes('racePace')&&/\b(?:[3-9]|1\d)\s*(?:x|rounds?)\b/i.test(x.text))tg.push('backEnd');for(const t of tg){if(!sugg.has(t))sugg.set(t,[]);const fit=(x.focus||[]).flatMap(f=>FOCUS[f]||[]).includes(t==='backEnd'?'racePace':t)?1:0;sugg.get(t).push({fit,code:x.code||x.id,label:x.label,text:String(x.text||'').split('\n').map(text).filter(Boolean).join(' / '),use:x.use||''});}}}
    const opts=[...(sugg.get(id)||[])].sort((p,q)=>q.fit-p.fit);const pick=opts.find(o=>!used?.has(o.code))||null;if(pick&&used)used.add(pick.code);return pick;};
  RE.summary=(ath,event,{weeks=8,state=M.state}={})=>{const b=RE.behind(ath,event,{weeks,state});const byId=new Map(b.elements.map(e=>[e.id,e]));const need=RE.needs(event).filter(n=>n.weight>=2);
    const done=[],light=[],missing=[];for(const n of need){const e=byId.get(n.id),ses=e?.sessions||0,row={id:n.id,label:n.label,weight:n.weight,sessions:ses,sets:Math.round(e?.sets||0)};(ses>=enough(n.weight)?done:ses>0?light:missing).push(row);}
    const h=RE.backEndHistory(ath,event);let race=null;if(h){const l=h.latest,fading=h.better===false||(h.earlierAvg==null&&l.pct>8);race={date:l.date,diff:l.diff,pct:l.pct,trend:h.earlierAvg==null?null:h.better?'better':'worse',change:h.change,fading,swims:h.rows.length};}
    const res=RE.results(ath,state).filter(r=>r.distance===Number(event.distance)&&r.stroke===RE.strokeOf(event.stroke)&&(!event.course||r.course===event.course));const lastRace=res.length?res[res.length-1]:null;
    const focus=[],used=new Set();const add=(id,why)=>{if(focus.length>=2||focus.some(f=>f.id===id))return;focus.push({id,label:RE.byId[id].label,why,suggest:RE.suggestFor(id,used)});};
    if(race?.fading)add('backEnd',race.trend==='worse'?'back half fading more than before in races':'back half much slower than the front in races');
    for(const g of [...missing.filter(x=>x.weight>=3),...light.filter(x=>x.weight>=3),...missing,...light])add(g.id,g.sessions?`only ${g.sessions} session${g.sessions===1?'':'s'} in ${weeks} weeks`:`none in ${weeks} weeks`);
    return{event,weeks,sessions:b.sessions,attended:b.attended,done,light,missing,race,focus,lastRace,captures:b.captures.length};};
  // whole swimmer: across the events they race most, what is strong, what keeps coming up short, and the top priorities
  RE.overview=(ath,{course='SCM',weeks=8,state=M.state}={})=>{const yearAgo=new Date(Date.now()-365*864e5).toISOString().slice(0,10);const count=new Map();
    for(const r of RE.results(ath,state))if(r.date>=yearAgo&&r.course===course){const k=`${r.distance}|${r.stroke}`;count.set(k,(count.get(k)||0)+1);}
    const events=[...count.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k])=>{const[d,st]=k.split('|');return{distance:Number(d),stroke:st,course};});
    const sums=events.map(ev=>RE.summary(ath,ev,{weeks,state}));const tally=new Map();
    for(const s of sums){for(const[k,list]of [['done',s.done],['light',s.light],['missing',s.missing]])for(const x of list){const t=tally.get(x.id)||{id:x.id,label:x.label,done:[],light:[],missing:[],sessions:x.sessions,weight:0};t[k].push(s.event);t.weight=Math.max(t.weight,x.weight);tally.set(x.id,t);}}
    const all=[...tally.values()];const strong=all.filter(t=>t.done.length&&t.done.length>=t.light.length+t.missing.length).sort((a,b)=>b.sessions-a.sessions);
    const gaps=all.filter(t=>t.light.length+t.missing.length>=Math.max(1,Math.ceil(events.length/2))).sort((a,b)=>(b.missing.length*2+b.light.length)*b.weight-(a.missing.length*2+a.light.length)*a.weight);
    const fading=sums.filter(s=>s.race?.fading).map(s=>s);const priorities=[],used=new Set();const add=(id,why)=>{if(priorities.length>=3||priorities.some(p=>p.id===id))return;priorities.push({id,label:RE.byId[id].label,why,suggest:RE.suggestFor(id,used)});};
    if(fading.length)add('backEnd',`back half fading in ${fading.map(s=>`${s.event.distance} ${s.event.stroke}`).join(', ')}`);for(const g of gaps)add(g.id,g.sessions?`light — ${g.sessions} session${g.sessions===1?'':'s'} in ${weeks} weeks`:`none in ${weeks} weeks`);
    return{events,sums,strong,gaps,fading,priorities,weeks,sessions:sums[0]?.sessions??RE.sessionsFor(ath,new Date(Date.now()-weeks*7*864e5).toISOString().slice(0,10),new Date(Date.now()+864e5).toISOString().slice(0,10),state).length};};
  RE.chips=(tags,max=4)=>(tags||[]).slice(0,max).map(id=>RE.byId[id]?.chip).filter(Boolean);
})(globalThis);
