'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.Reporting=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-aw';
  function sessionReport({session=null,events=[],ledger=null}={}){
    const raw=ledger?.raw||[],transcripts=ledger?.transcripts||[],interpretations=ledger?.interpretations||[],sid=session?.id||null,sessionEvidence=raw.filter(e=>!sid||e.context?.sessionId===sid),byAthlete={};
    for(const e of sessionEvidence)for(const id of e.athleteIds||[]){byAthlete[id]=byAthlete[id]||{evidence:0,video:0,audio:0,notes:0,metrics:[]};const x=byAthlete[id];x.evidence++;if(e.type==='video')x.video++;else if(e.type==='voice'||e.type==='conversation')x.audio++;else x.notes++;if(e.metrics&&Object.keys(e.metrics).length)x.metrics.push(e.metrics);}
    const anchors=events.filter(e=>(!sid||e.sessionId===sid)&&e.type==='context_anchor');
    const delivered=events.filter(e=>(!sid||e.sessionId===sid)&&e.type==='delivered_item');
    const currentInterpretations=interpretations.filter(i=>!(interpretations||[]).some(j=>j.supersedes===i.id));
    return{schemaVersion:1,sessionId:sid,generatedAt:Date.now(),evidenceCount:sessionEvidence.length,transcriptCount:transcripts.filter(t=>sessionEvidence.some(e=>e.id===t.evidenceId)).length,athletes:byAthlete,anchors:anchors.length,deliveredItems:delivered.length,derivedClaims:currentInterpretations.flatMap(i=>(i.claims||[]).map(c=>({...c,interpretationId:i.id}))),carryForward:currentInterpretations.flatMap(i=>i.carryForward||[]),warning:currentInterpretations.length?'':'No interpretation layer supplied; report contains factual capture rollup only.'};
  }
  function rollUp(reports=[],scope='week'){
    const out={scope,reports:reports.length,evidenceCount:0,transcriptCount:0,athletes:{},carryForward:[]};for(const r of reports){out.evidenceCount+=Number(r.evidenceCount)||0;out.transcriptCount+=Number(r.transcriptCount)||0;for(const [id,x] of Object.entries(r.athletes||{})){const y=out.athletes[id]=out.athletes[id]||{evidence:0,video:0,audio:0,notes:0};for(const k of ['evidence','video','audio','notes'])y[k]+=Number(x[k])||0;}out.carryForward.push(...(r.carryForward||[]).map(x=>({reportId:r.sessionId,...x})));}return out;
  }
  function evidenceSummary(report,athleteNameById={}){const lines=[];for(const [id,x] of Object.entries(report?.athletes||{}))lines.push(`${athleteNameById[id]||id}: ${x.evidence} evidence · ${x.video} video · ${x.audio} audio`);return lines.join('\n');}
  return{VERSION,sessionReport,rollUp,evidenceSummary};
});
