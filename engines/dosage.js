'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.session||!M?.util)return;
  const U=M.util,S=M.session,E=g.MSOSEngines||{};
  const D=M.dosageEngine={build:'v4-dosage-20260918b'};
  const WEIGHTS=Object.freeze({
    'Regeneration':0.25,
    'Development':0.45,
    'Overload':0.70,
    'Threshold':0.85,
    'Clearance':1.00,
    'Race pace':1.00,
    'Speed / Max':1.10,
    'Skill / Technical':0.70,
    'Unclassified':0.35
  });
  const SYSTEMS=Object.freeze(Object.keys(WEIGHTS));
  const STROKES=Object.freeze(['Freestyle','Backstroke','Breaststroke','Butterfly','IM','Choice / unspecified']);
  const txt=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clone=v=>U.clone?U.clone(v):JSON.parse(JSON.stringify(v));
  const nowDate=()=>new Date();
  // 23 Sept 2026 (Andy, live, correcting an assumption in systemFrom()'s own 21 Sept "correction #2" comment
  // below, which said the reverse HR->zone mapping wasn't built yet "since Andy hasn't given the exact
  // boundary numbers for it"): he had already spent hours wiring Clive Rushton's Swim Ontario heart-rate/
  // stroke-rate cone into this app -- it's engines/aerobic.js's own RUSHTON table (Regeneration/Development
  // <140bpm, Overload ~150bpm, Threshold 160-165bpm, Clearance 165-185bpm), used there to show an HR/SR guide
  // when no T400 evidence exists for a zone. "It should already be there" -- it was, just never read in
  // REVERSE (an authored HR figure in a set's own text -> which zone that implies) for systemFrom()
  // specifically, which is exactly the gap the 17 Sept and 21 Sept comments below both flagged. These
  // boundaries are the same numbers as engines/aerobic.js's RUSHTON table, kept in sync by this file's own
  // drift-guard test (tests/dosage-rushton-hr-zone-20260923.cjs) rather than parsed from that table at
  // runtime, since the table's string format ("<140", "~150", "160–165") is written for display, not for
  // arithmetic. Matches the same "HR <number>" / "Heart Rate <number>" phrasing engines/context-engine-av.js
  // already recognises for voice-captured HR observations, extended here to also accept an authored range
  // ("HR 160-165"), using its midpoint. Below 140bpm intentionally resolves to Development, not Regeneration:
  // the table gives both zones the identical "<140" HR band (they're only distinguished by stroke rate, which
  // authored session text does not reliably carry), so this keeps the same "neutral middle" default already
  // used elsewhere in systemFrom() for genuinely easy work -- Andy can ask for a stroke-rate-based split later
  // if it turns out to matter in practice.
  function hrZone(raw){
    const m=raw.match(/(?:heart\s*rate|\bhr)\b\s*:?\s*(\d{2,3})(?:\s*(?:[-–—]|to)\s*(\d{2,3}))?/i);
    if(!m)return null;
    const lo=Number(m[1]),hi=m[2]!=null?Number(m[2]):lo,mid=(lo+hi)/2;
    if(mid>=165)return'Clearance';
    if(mid>=160)return'Threshold';
    if(mid>=140)return'Overload';
    return'Development';
  }
  // Real coaching failure this fixes (Andy, 17 Sept 2026, looking at a real session's dosage/methodology
  // report showing 93-95% "Unclassified"): every check below used to test `v||raw` -- a single string
  // picked by which of the two was non-empty, NOT both. `v` is the item's own `zone` field; `raw` is its
  // authored text. Whenever an item had ANY non-empty zone value that didn't happen to match one of these
  // keywords exactly (a squad-authored zone tag spelled differently, a stray default, "Technical" as a
  // zone label rather than a recognised keyword, an HR-range string, etc.), `v||raw` picked that zone value
  // and `raw` -- the coach's own actual description, e.g. "150 Easy" or "4 x dive 15 max" -- was never even
  // looked at, silently discarding real classification signal that was sitting right there in the item's
  // own text. Now both `v` and `raw` are checked independently, so a real keyword in either one is enough --
  // fixing this alone should recover a meaningful share of what's currently showing as "Unclassified" for
  // items that already say "Easy"/"Max"/etc. in their own text but carry an unrecognised zone value.
  // One gap NOT fixed here at the time, deliberately, since it needed Andy's own input rather than a guess:
  // plain HR-range text ("HR 170-180", "Heart Rate 170—180") wasn't recognised at all -- the Rushton Cone
  // HR/SR reference (engines/aerobic.js's RUSHTON table) existed but only ran forward (an already-assigned
  // zone -> HR/SR guidance to aim for), not in reverse (an authored HR figure -> which zone that implies).
  // Fixed 23 Sept 2026 -- see hrZone() and its call site below for the reverse mapping, now built using that
  // same table's own boundaries. A second gap remains open: a descending set ("Desc 1-3") genuinely spans a
  // RANGE of zones by its own nature, and a
  // single classification for the whole item is inherently wrong for it -- proper handling needs per-rep
  // zone data (dosage.js's addSet/repSystem already supports this via item.repPattern, if the parser
  // populates it for descending sets) rather than a single system-wide label.
  function systemFrom(value,item={}){
    const v=txt(value),base=item.raw||item.text||'';
    // 18 Sept 2026 (Andy, real session, "I don't see this as 72% unclassified do you?"): a genuine chunk of
    // that 72% was a coach line like "4 x 25 Small Parachute" with its own real intensity word -- "15m MAX" --
    // written as the very next line, which the parser correctly keeps as the item's own cue (item.cues), not
    // as part of item.raw/item.text. systemFrom() never looked at cues at all, so "MAX" sitting one line down
    // was invisible to the classifier even though it's unambiguously part of what that line means. Same root
    // pattern as the 17 Sept zone/raw fix (real signal in a field the checker didn't look at) -- extended here
    // to also check the item's authored cue text, not just its own raw/text.
    const raw=txt([base,...(item?.cues||[])].filter(Boolean).join(' ')||v);
    const either=re=>re.test(v)||re.test(raw);
    if(either(/\b(?:regeneration|regen|\breg\b|easy|recovery|loosen|warm.?down|cool.?down)\b/i))return'Regeneration';
    if(either(/\b(?:development|\bdev\b)\b/i))return'Development';
    if(either(/\b(?:overload|\bol\b)\b/i))return'Overload';
    if(either(/\b(?:threshold|\bthr\b)\b/i))return'Threshold';
    if(either(/\b(?:clearance|\bcl\b)\b/i))return'Clearance';
    if(item?.raceIntent||either(/\b(?:race\s*pace|\bRP\s*\d|\d+\s*pace)\b/i))return'Race pace';
    if(either(/\b(?:sprint|max(?:imal)?|speed|alactic|neural)\b/i))return'Speed / Max';
    if(either(/\b(?:drill|scull|skill|techni|underwater|breakout|streamline)\b/i))return'Skill / Technical';
    // 23 Sept 2026: an authored heart-rate figure/range is as strong an explicit signal as any keyword above
    // it, and is checked here on the same footing -- after every keyword (a coach's own word for the zone
    // always wins over a derived HR reading), before the historical/structural notes and Development default
    // below. See hrZone()'s own comment above for the Rushton Cone sourcing and boundary reasoning.
    const hr=hrZone(raw);if(hr)return hr;
    // 18 Sept 2026 (Andy, answering the "should untagged sets get a default" question raised alongside the
    // cues fix above): his own stated logic -- "all easy swimming would fit into Aerobic Capicity and/or
    // aerobic development or regentration... a hard 400 prob is threashold, a hard 200 is prob cl, a hard 100
    // is prob 400 to 200p... max is max, atp cp for short dist... through the other anaerobic zones based on
    // dist and rest" -- and he originally asked for this inferred from STRUCTURE (distance + rest) alone, no
    // keyword required. A first pass (same day) built a distance+rest ladder on that basis (400+->Threshold,
    // 200-399->Clearance, 100-199->[race pace, later removed], <100->Speed/Max whenever a real authored rest
    // was present). Both later corrected below -- superseded, kept only as history.
    //
    // 21 Sept 2026, correction #1 (Andy, live: "There is no world those aerobic 100s should and could be race
    // pace, race pace is only race pace is it is specified @ ... pace"): removed "Race pace" from the
    // distance+rest ladder; folded that band into "Clearance" instead. Itself superseded minutes later by
    // correction #2 below -- kept only as history.
    //
    // 21 Sept 2026, correction #2 (Andy, live, immediately after seeing correction #1's Clearance result --
    // his full instruction, verbatim): "Those one hundreds definitely wouldn't be clearance... The low key
    // hundreds with no intensity gauge. They're always going to fit into regeneration or development. No, not
    // clearance. Clearance is like high intensity aerobic. That's only ever going to happen if it's specified,
    // with a heart rate or the word clearance. If it's a descending set... descending one to three, we might
    // have an incorporation of up to clearance or threshold in there. But again, I said it's common sense
    // around this -- you understand physiology, you should be able to use a little bit more logic for this. If
    // it's got no intensity, it's going to be easy, so that's going to fit into regeneration [or development]."
    //
    // This is a full retraction of the distance+rest STRUCTURAL ladder, not just its Race-pace rung: an
    // authored rest interval alone was never a reliable "worked/hard" signal -- a rest-bearing 400, 200 or 100
    // is just as often an easy set broken into reps with a short recovery as it is a genuinely hard one, and
    // guessing "hard" from rest+distance shape produced the exact same category of wrong answer for every rung
    // of the ladder, not only the 100-199m one. So: Threshold, Clearance and Speed/Max are no longer reachable
    // from distance+rest structure AT ALL -- only from an explicit signal (a real keyword, already checked
    // above this point, e.g. "threshold"/"clearance"/"max"; an authored heart-rate figure/range, via hrZone()
    // above, reading engines/aerobic.js's own RUSHTON Cone boundaries -- see hrZone()'s comment, added 23
    // Sept once it turned out this table already existed; or item.raceIntent for Race pace, unaffected by
    // this correction). Any real,
    // distance-bearing item with no explicit signal anywhere is "got no intensity, it's going to be easy" --
    // Regeneration or Development, matching Andy's own latitude for continuous/easy swimming from 18 Sept
    // (picking the same neutral middle default, Development, for consistency with that existing choice; rest
    // presence no longer distinguishes anything here). Deliberately NOT built here: descending-set escalation
    // ("descending one to three... incorporation of up to clearance or threshold") -- Andy floated this as a
    // "maybe", not a concrete rule, and a single whole-item classification is inherently wrong for a set that
    // by its own nature spans a range of zones across its reps (needs per-rep zone data via item.repPattern,
    // already flagged as a real, deliberately-deferred gap in the 17 Sept comment above). Items with no real
    // distance at all (bare/synthetic fixtures, a genuinely non-distance line) keep returning Unclassified
    // exactly as before. See tests/dosage-no-intensity-defaults-to-development-20260921.cjs.
    if(Number(item?.distance)>0)return'Development';
    return'Unclassified';
  }
  function strokeFrom(item){
    const direct=E.Evidence?.stroke?.(item?.stroke||'')||txt(item?.stroke||'');
    if(['Freestyle','Backstroke','Breaststroke','Butterfly','IM'].includes(direct))return direct;
    const raw=txt(item?.raw||item?.text);
    if(/\b(?:freestyle|free|\bfr\b)\b/i.test(raw))return'Freestyle';
    if(/\b(?:backstroke|back|\bbk\b)\b/i.test(raw))return'Backstroke';
    if(/\b(?:breaststroke|breast|\bbr\b)\b/i.test(raw))return'Breaststroke';
    if(/\b(?:butterfly|fly)\b/i.test(raw))return'Butterfly';
    if(/\b(?:individual medley|\bIM\b)\b/i.test(raw))return'IM';
    return'Choice / unspecified';
  }
  function blank(){
    return{
      rawMetres:0,stimulusUnits:0,
      systems:Object.fromEntries(SYSTEMS.map(k=>[k,{metres:0,units:0,pctMetres:0,pctDose:0}])),
      strokes:Object.fromEntries(STROKES.map(k=>[k,{metres:0,units:0,pctMetres:0,pctDose:0}])),
      unclassifiedMetres:0,
      method:'Distance-based dosage · metres × training-intent weighting',
      provisional:true
    };
  }
  function add(out,system,stroke,metres,weight){
    const m=Math.max(0,Number(metres)||0),w=Number.isFinite(Number(weight))?Number(weight):(WEIGHTS[system]??WEIGHTS.Unclassified),u=m*w;
    system=SYSTEMS.includes(system)?system:'Unclassified';stroke=STROKES.includes(stroke)?stroke:'Choice / unspecified';
    out.rawMetres+=m;out.stimulusUnits+=u;out.systems[system].metres+=m;out.systems[system].units+=u;out.strokes[stroke].metres+=m;out.strokes[stroke].units+=u;if(system==='Unclassified')out.unclassifiedMetres+=m;
  }
  function finish(out){
    const rm=out.rawMetres,du=out.stimulusUnits;
    for(const row of Object.values(out.systems)){row.pctMetres=rm?row.metres/rm*100:0;row.pctDose=du?row.units/du*100:0;}
    for(const row of Object.values(out.strokes)){row.pctMetres=rm?row.metres/rm*100:0;row.pctDose=du?row.units/du*100:0;}
    out.rawMetres=Math.round(out.rawMetres*100)/100;out.stimulusUnits=Math.round(out.stimulusUnits*100)/100;return out;
  }
  function merge(rows=[]){const out=blank();for(const r of rows){if(!r)continue;out.rawMetres+=Number(r.rawMetres)||0;out.stimulusUnits+=Number(r.stimulusUnits)||0;out.unclassifiedMetres+=Number(r.unclassifiedMetres)||0;for(const k of SYSTEMS){out.systems[k].metres+=Number(r.systems?.[k]?.metres)||0;out.systems[k].units+=Number(r.systems?.[k]?.units)||0;}for(const k of STROKES){out.strokes[k].metres+=Number(r.strokes?.[k]?.metres)||0;out.strokes[k].units+=Number(r.strokes?.[k]?.units)||0;}}return finish(out);}
  function repSystem(item,rep){
    const p=(item?.repPattern||[]).find(x=>Number(x?.rep)===rep)||(item?.repPattern||[])[rep-1];
    if(p?.zone)return systemFrom(p.zone,{...item,raw:p.text||item.raw});
    const ri=(item?.repInstructions||[]).find(x=>Number(x?.rep)===rep)||(item?.repInstructions||[])[rep-1];
    if(ri?.raceIntent)return'Race pace';if(ri?.drill||/\bdrill\b/i.test(txt(ri?.label)))return'Skill / Technical';
    if(item?.zone)return systemFrom(item.zone,item);
    return systemFrom('',item);
  }
  function actualItem(session,item,athlete,state){
    if(!athlete)return item;
    try{const p=E.Coordinator?.prescription?.(session,item,athlete,state);if(p?.item)return p.item;}catch{}
    try{const a=E.Modification?.adaptItem?.(item,athlete,state,session);if(a)return a;}catch{}
    return item;
  }
  function addSet(out,session,item,athlete,state,mult=1){
    const actual=actualItem(session,item,athlete,state),reps=Math.max(1,Number(actual?.reps)||1),dist=Math.max(0,Number(actual?.distance)||0),stroke=strokeFrom(actual);
    for(let rep=1;rep<=reps;rep++){const sys=repSystem(actual,rep),weight=WEIGHTS[sys]??WEIGHTS.Unclassified;add(out,sys,stroke,dist*mult,weight);}
  }
  function walk(out,session,node,athlete,state,mult=1){
    if(!node)return;if(node.kind==='set'){addSet(out,session,node,athlete,state,mult);return;}if(node.kind==='group'){const rounds=Math.max(1,Number(node.rounds)||1);for(const x of node.items||[])walk(out,session,x,athlete,state,mult*rounds);}
  }
  function deliveredProjection(session){
    if(!session)return null;if(!session.finish)return session;
    if(session.finish.throughItemId&&typeof S.prefixThroughItem==='function'){
      try{const p=S.prefixThroughItem(session,session.finish.throughItemId,{roundByGroup:session.finish.roundByGroup||{}});if(p?.found)return{...clone(session),blocks:clone(p.blocks||[])};}catch{}
    }
    if(session.finish.throughBlockId){const i=(session.blocks||[]).findIndex(b=>b.id===session.finish.throughBlockId);if(i>=0)return{...clone(session),blocks:clone(session.blocks.slice(0,i+1))};}
    return session;
  }
  function sessionDose(session,state=M.state,{athlete=null,delivered=true}={}){
    const src=delivered?deliveredProjection(session):session,out=blank();if(!src)return finish(out);for(const b of src.blocks||[])for(const n of b.items||[])walk(out,src,n,athlete,state,1);out.sessionId=session?.id||'';out.athleteId=athlete?.id||'';out.delivery=delivered&&session?.finish?'delivered':'prescribed';out.actualDistance=Number(session?.finish?.actualDistance)||null;return finish(out);
  }
  function attendanceStatus(sessionId,athleteId,state=M.state){return(state?.attendance||[]).find(x=>String(x.session_id||x.sessionId)===String(sessionId)&&String(x.athlete_id||x.athleteId)===String(athleteId))?.status||'';}
  function isHere(status){return /^(?:present|here|modified|late|partial)$/i.test(txt(status));}
  function athletesForSession(session,state=M.state){
    const rows=(state?.athletes||[]).filter(a=>a.active!==false),marked=rows.filter(a=>isHere(attendanceStatus(session?.id,a.id,state)));if(marked.length)return marked;return[];
  }
  function scopeSummary(session,state=M.state,{delivered=true}={}){
    const athletes=athletesForSession(session,state),individual=athletes.map(a=>({athleteId:a.id,name:a.full_name||'',squad:a.squad||'',status:attendanceStatus(session.id,a.id,state),dose:sessionDose(session,state,{athlete:a,delivered})}));
    const squads={};for(const r of individual)(squads[r.squad||'Unassigned']??=[]).push(r);
    const squad=Object.fromEntries(Object.entries(squads).map(([k,v])=>[k,{swimmers:v.length,dose:merge(v.map(x=>x.dose))}]));
    return{sessionId:session?.id||'',delivery:delivered&&session?.finish?'delivered':'prescribed',session:sessionDose(session,state,{delivered}),individual,squad,team:{swimmers:individual.length,dose:merge(individual.map(x=>x.dose))}};
  }
  function sessionDate(s){const d=s?.finish?.finishedAt||s?.identity?.date||s?.updatedAt||'';const n=Date.parse(d);return Number.isFinite(n)?n:0;}
  function relevant(session,athlete,state){const st=attendanceStatus(session.id,athlete.id,state);if(st)return isHere(st);return false;}
  function athleteWindow(athlete,state=M.state,days=7){
    const cut=days?nowDate().getTime()-Number(days)*86400000:0,rows=[];for(const s of Object.values(state?.canonicalSessions||{})){if(!s?.finish&&!/finished|complete/i.test(txt(s?.status)))continue;const t=sessionDate(s);if(cut&&t&&t<cut)continue;if(!relevant(s,athlete,state))continue;rows.push(sessionDose(s,state,{athlete,delivered:true}));}const dose=merge(rows);dose.sessions=rows.length;dose.days=Number(days)||0;dose.athleteId=athlete?.id||'';return dose;
  }
  function top(map={},field='pctDose',n=4){return Object.entries(map).filter(([,v])=>Number(v?.[field])>0).sort((a,b)=>Number(b[1][field])-Number(a[1][field])).slice(0,n).map(([label,v])=>({label,...v}));}
  D.WEIGHTS=WEIGHTS;D.SYSTEMS=SYSTEMS;D.STROKES=STROKES;D.systemFrom=systemFrom;D.strokeFrom=strokeFrom;D.deliveredProjection=deliveredProjection;D.session=sessionDose;D.scopeSummary=scopeSummary;D.athleteWindow=athleteWindow;D.merge=merge;D.top=top;
  if(M.reportingEngine?.registerProvider){
    M.reportingEngine.registerProvider('dosage',({athlete,state,days})=>athleteWindow(athlete,state,days),{
      metric:{id:'dosage',label:'Energy-system / dosage',source:'Dosage + delivered session truth'},
      fields:[
        {id:'stimulus_units',label:'Weighted stimulus units',source:'Dosage'},
        {id:'energy_system_mix',label:'Energy-system stimulus mix',source:'Dosage'},
        {id:'stroke_dose',label:'Weighted stroke focus',source:'Dosage + Stroke Balance'}
      ]
    });
  }
})(globalThis);
