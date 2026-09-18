'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.session||!M?.util)return;
  const U=M.util,S=M.session,E=g.MSOSEngines||{};
  const D=M.dosageEngine={build:'v4-dosage-20260825a'};
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
  // Two gaps NOT fixed here, deliberately, since they need Andy's own input rather than a guess: (1) plain
  // HR-range text ("HR 170-180", "Heart Rate 170—180") still isn't recognised at all -- the Rushton Cone
  // HR/SR reference (engines/aerobic.js's RUSHTON table) exists but currently only runs forward (an
  // already-assigned zone -> HR/SR guidance to aim for), not in reverse (an authored HR figure -> which
  // zone that implies), and the exact boundary rules for that reverse mapping are a coaching call, not a
  // code one; (2) a descending set ("Desc 1-3") genuinely spans a RANGE of zones by its own nature, and a
  // single classification for the whole item is inherently wrong for it -- proper handling needs per-rep
  // zone data (dosage.js's addSet/repSystem already supports this via item.repPattern, if the parser
  // populates it for descending sets) rather than a single system-wide label.
  function systemFrom(value,item={}){
    const v=txt(value),raw=txt(item.raw||item.text||v);
    const either=re=>re.test(v)||re.test(raw);
    if(either(/\b(?:regeneration|regen|\breg\b|easy|recovery|loosen|warm.?down|cool.?down)\b/i))return'Regeneration';
    if(either(/\b(?:development|\bdev\b)\b/i))return'Development';
    if(either(/\b(?:overload|\bol\b)\b/i))return'Overload';
    if(either(/\b(?:threshold|\bthr\b)\b/i))return'Threshold';
    if(either(/\b(?:clearance|\bcl\b)\b/i))return'Clearance';
    if(item?.raceIntent||either(/\b(?:race\s*pace|\bRP\s*\d|\d+\s*pace)\b/i))return'Race pace';
    if(either(/\b(?:sprint|max(?:imal)?|speed|alactic|neural)\b/i))return'Speed / Max';
    if(either(/\b(?:drill|scull|skill|techni|underwater|breakout|streamline)\b/i))return'Skill / Technical';
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
