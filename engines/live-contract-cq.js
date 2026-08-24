'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;
  if(!M||!E?.Modification)return;
  const X=M.liveContractCQ={build:'v4-live-contract-20260824cq'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const cycleCourse=s=>String(s?.identity?.course||'').toUpperCase();

  // Preserve authored repeating descent patterns when a modified swimmer receives fewer reps.
  // Example: 12 x 50 with Desc 1-3 -> 8 x 50 still means repeating Desc 1-3, not Desc 1-8.
  const priorAdapt=E.Modification.adaptItem.bind(E.Modification);
  function repeatingDescCues(item){
    const base=Math.max(1,Number(item?.reps)||1),src=[...(item?.cues||[]),item?.raw,item?.text].filter(Boolean),out=[];
    for(const s of src){
      const m=text(s).match(/\bDesc(?:end|ending)?\s+1\s*[-–—]\s*(\d+)\b/i);
      if(!m)continue;const n=Number(m[1]);if(n>1&&n<base&&base%n===0)out.push(text(s));
    }
    return [...new Set(out)];
  }
  function preserveRepeatingDesc(out,item){
    const keep=repeatingDescCues(item);if(!keep.length||!out)return out;
    const delivered=Math.max(1,Number(out.reps)||1),generated=new RegExp(`\\bDesc(?:end|ending)?\\s+1\\s*[-–—]\\s*${delivered}\\b`,'i');
    out.cues=[...(out.cues||[])].filter(c=>!generated.test(text(c)));
    for(const cue of keep)if(!out.cues.some(c=>text(c)===cue))out.cues.push(cue);
    // If an adaptation rewrote the authored cue into the headline, restore the authored pattern there too.
    if(generated.test(text(out.raw||out.text))){const replacement=keep[0].match(/Desc(?:end|ending)?\s+1\s*[-–—]\s*\d+/i)?.[0]||'Desc 1-3';out.raw=text(out.raw||out.text).replace(generated,replacement);out.text=out.raw;}
    out.authoredPatternPreserved=true;return out;
  }
  E.Modification.adaptItem=(item,ath,state,session)=>preserveRepeatingDesc(priorAdapt(item,ath,state,session),item);
  if(M.phoneAcceptanceAO)M.phoneAcceptanceAO.adaptItem=(item,ath,state,session)=>E.Modification.adaptItem(item,ath,state,session);

  // A line that explicitly asks for an aerobic training zone must never receive a pace target
  // when the swimmer has no valid evidence anchor. Missing evidence is surfaced as missing.
  if(M.targets?.forItem){
    const priorTarget=M.targets.forItem.bind(M.targets);
    const zoneIntent=item=>/\b(?:Regeneration|Development|Overload|Threshold|Clearance|Aerobic|VO2)\b/i.test(text([item?.raw,item?.text,...(item?.cues||[])].join(' ')));
    M.targets.forItem=(session,item,ath,state)=>{
      if(zoneIntent(item)&&!item?.targetSeconds&&!item?.raceIntent){
        const course=cycleCourse(session),stroke=E.Evidence?.stroke?.(item?.stroke)||item?.stroke||'Freestyle';
        const wanted=/^(?:Freestyle|Backstroke|Breaststroke|Butterfly|IM)$/i.test(text(stroke))?stroke:'Freestyle';
        const anchor=M.targets.t400?.(ath,state,course,wanted);
        if(!anchor)return{status:'missing',message:`No ${wanted} T400 target loaded`};
      }
      return priorTarget(session,item,ath,state);
    };
  }

  X.repeatingDescCues=repeatingDescCues;
})(globalThis);
