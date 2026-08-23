'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Modification)return;
  const BUILD='v4-amber-ratio-20260821ap',A=M.amberRatioAP={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const rawOf=item=>text([item?.raw,item?.text,...(item?.cues||[])].filter(Boolean).join(' '));
  A.independentSkill=item=>E.Modification.independentSkill?.(item)??(/\b(?:dive|start|turn|finish)\b/i.test(rawOf(item))&&!/\b(?:kick|fins?|underwater)\b/i.test(rawOf(item)));
  A.evidenceMeasured=item=>E.Modification.targetDriven?.(item)===true;
  A.adaptItem=(item,ath,state=M.state,session=M.currentSession?.())=>E.Modification.adaptItem(item,ath,state,session);
  A.checks=()=>({policy:'Compatibility only · modification policy owned by engines/modification.js',scullMinimumPer50:120,skillException:'start/turn/finish full team work',evidenceException:'target-driven work remains target-engine controlled'});
})(globalThis);
