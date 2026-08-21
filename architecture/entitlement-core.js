'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.Entitlements=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-aw';
  const CAPABILITIES=Object.freeze({CORE_SESSION:'core_session',PATHWAY:'pathway',TV_BOARD:'tv_board',REMOTE_ATHLETE:'remote_athlete',LOCAL_CAPTURE:'local_capture',ON_DEVICE_VOICE:'on_device_voice',EARBUD_BRIDGE:'earbud_bridge',AUDIO_DELIVERY:'audio_delivery',CLOUD_TRANSCRIPTION:'cloud_transcription',AI_INTERPRETATION:'ai_interpretation',AI_REPORTING:'ai_reporting',MEDIA_AI:'media_ai',MULTI_COACH_AI:'multi_coach_ai'});
  const PLANS=Object.freeze({
    core:{caps:[CAPABILITIES.CORE_SESSION,CAPABILITIES.PATHWAY,CAPABILITIES.TV_BOARD,CAPABILITIES.REMOTE_ATHLETE,CAPABILITIES.LOCAL_CAPTURE],budgets:{}},
    voice:{caps:[CAPABILITIES.CORE_SESSION,CAPABILITIES.PATHWAY,CAPABILITIES.TV_BOARD,CAPABILITIES.REMOTE_ATHLETE,CAPABILITIES.LOCAL_CAPTURE,CAPABILITIES.ON_DEVICE_VOICE,CAPABILITIES.EARBUD_BRIDGE,CAPABILITIES.AUDIO_DELIVERY],budgets:{}},
    intelligence:{caps:Object.values(CAPABILITIES).filter(x=>x!==CAPABILITIES.MULTI_COACH_AI),budgets:{cloud_transcription_minutes:600,ai_interpretations:2000,media_ai_minutes:60}},
    club_ai:{caps:Object.values(CAPABILITIES),budgets:{cloud_transcription_minutes:3000,ai_interpretations:10000,media_ai_minutes:300}}
  });
  function plan(name='core',overrides={}){const base=PLANS[name]||PLANS.core;return{name,caps:new Set(overrides.caps||base.caps),budgets:{...base.budgets,...(overrides.budgets||{})}};}
  function can(p,cap){return!!p?.caps?.has?.(cap);}
  function usageLedger(seed=[]){return[...seed];}
  function recordUsage(ledger,{accountId='local',capability,units=1,unit='count',at=Date.now(),metadata={}}){const row={id:`usage_${at}_${Math.random().toString(36).slice(2,8)}`,accountId,capability,units:Number(units)||0,unit,at:Number(at),metadata:{...metadata}};ledger.push(row);return row;}
  function used(ledger,capability,unit){return ledger.filter(x=>x.capability===capability&&(!unit||x.unit===unit)).reduce((n,x)=>n+(Number(x.units)||0),0);}
  function budgetRemaining(p,ledger,budgetKey,{capability=null,unit=null}={}){const limit=Number(p?.budgets?.[budgetKey]);if(!Number.isFinite(limit))return Infinity;return Math.max(0,limit-used(ledger,capability,unit));}
  return{VERSION,CAPABILITIES,PLANS,plan,can,usageLedger,recordUsage,used,budgetRemaining};
});
