'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.RaceTargetIntent=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-20260831';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  function explicitSegment(item){
    const parts=[item?.raw,item?.text,item?.instruction,...(item?.cues||[])].map(text).filter(Boolean);
    for(const line of parts){
      let m=line.match(/\b(second|2nd|last|final)\s+(25|50|100|200)\s*(?:m\s*)?\s+of\s+(50|100|200|400)\s*(?:m\s*)?\s+race\b/i);
      if(m)return{segment:'second',workDistance:Number(m[2]),eventDistance:Number(m[3]),cue:line};
      m=line.match(/\b(first|1st)\s+(25|50|100|200)\s*(?:m\s*)?\s+of\s+(50|100|200|400)\s*(?:m\s*)?\s+race\b/i);
      if(m)return{segment:'first',workDistance:Number(m[2]),eventDistance:Number(m[3]),cue:line};
    }
    return null;
  }
  function resolve(item){
    if(!item||item.kind&&item.kind!=='set')return item;const seg=explicitSegment(item);if(!seg)return item;
    const delivered=Number(item.distance)||0;if(delivered&&seg.workDistance&&delivered!==seg.workDistance)return item;
    const raw=text(item.raw||item.text),cue=text(seg.cue),hasCue=raw.toLowerCase().includes(cue.toLowerCase());
    return{...item,raw:hasCue?raw:`${raw}${raw?' · ':''}${cue}`,text:hasCue?text(item.text||raw):`${text(item.text||raw)}${text(item.text||raw)?' · ':''}${cue}`,raceIntent:{...(item.raceIntent||{}),distance:seg.eventDistance},raceTargetIntent:{...seg,source:'Explicit coach race-target cue'}};
  }
  return{VERSION,explicitSegment,resolve};
});
