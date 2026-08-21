'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.Evidence=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-aw';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function deepFreeze(v){if(!v||typeof v!=='object'||Object.isFrozen(v))return v;Object.freeze(v);for(const x of Object.values(v))deepFreeze(x);return v;}
  function id(prefix='ev'){return`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;}
  function rawEvidence(input={}){
    const row={id:input.id||id('evidence'),schemaVersion:1,createdAt:Number(input.createdAt)||Date.now(),authorId:input.authorId||'coach',source:input.source||'coach',type:input.type||'note',athleteIds:[...new Set(input.athleteIds||[])],context:clone(input.context||{}),raw:clone(input.raw||{}),metrics:clone(input.metrics||{}),audience:clone(input.audience||{coach:true,athleteIds:[],groupIds:[],tv:false}),consent:clone(input.consent||{recording:'not_applicable'}),integrity:{immutable:true,originalId:input.id||null}};
    return deepFreeze(row);
  }
  function transcript(input={}){return deepFreeze({id:input.id||id('transcript'),schemaVersion:1,evidenceId:input.evidenceId,createdAt:Number(input.createdAt)||Date.now(),engine:input.engine||'device',language:input.language||'en-NZ',text:String(input.text||''),confidence:Number.isFinite(Number(input.confidence))?Number(input.confidence):null,segments:clone(input.segments||[]),derived:true});}
  function interpretation(input={}){return deepFreeze({id:input.id||id('interpretation'),schemaVersion:1,evidenceIds:[...new Set(input.evidenceIds||[])],createdAt:Number(input.createdAt)||Date.now(),engine:input.engine||'rules',kind:input.kind||'coaching_summary',claims:clone(input.claims||[]),carryForward:clone(input.carryForward||[]),confidence:Number.isFinite(Number(input.confidence))?Number(input.confidence):null,derived:true,supersedes:input.supersedes||null});}
  function createLedger(seed={}){return{raw:[...(seed.raw||[])],transcripts:[...(seed.transcripts||[])],interpretations:[...(seed.interpretations||[])]};}
  function appendUnique(arr,row){if(arr.some(x=>x.id===row.id))return false;arr.push(row);return true;}
  function appendRaw(ledger,row){const frozen=Object.isFrozen(row)?row:rawEvidence(row);appendUnique(ledger.raw,frozen);return frozen;}
  function appendTranscript(ledger,row){if(!ledger.raw.some(x=>x.id===row.evidenceId))throw new Error(`Unknown evidence ${row.evidenceId}`);const frozen=Object.isFrozen(row)?row:transcript(row);appendUnique(ledger.transcripts,frozen);return frozen;}
  function appendInterpretation(ledger,row){for(const e of row.evidenceIds||[])if(!ledger.raw.some(x=>x.id===e))throw new Error(`Unknown evidence ${e}`);const frozen=Object.isFrozen(row)?row:interpretation(row);appendUnique(ledger.interpretations,frozen);return frozen;}
  function latestInterpretations(ledger){const superseded=new Set((ledger.interpretations||[]).map(x=>x.supersedes).filter(Boolean));return(ledger.interpretations||[]).filter(x=>!superseded.has(x.id));}
  function evidencePackage(ledger,evidenceId){const raw=(ledger.raw||[]).find(x=>x.id===evidenceId)||null;if(!raw)return null;return{raw,transcripts:(ledger.transcripts||[]).filter(x=>x.evidenceId===evidenceId),interpretations:latestInterpretations(ledger).filter(x=>(x.evidenceIds||[]).includes(evidenceId))};}
  return{VERSION,deepFreeze,rawEvidence,transcript,interpretation,createLedger,appendRaw,appendTranscript,appendInterpretation,latestInterpretations,evidencePackage};
});
