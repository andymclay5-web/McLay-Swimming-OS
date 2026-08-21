'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.AI=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-aw';
  function shouldEscalate(parsed,{allowAmbiguity=true}={}){if(!parsed)return false;if(parsed.intent==='unknown'&&parsed.needsAI)return true;if(allowAmbiguity&&parsed.intent==='clarify_athlete')return false;return false;}
  function job(input={}){return{id:input.id||`ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,createdAt:Number(input.createdAt)||Date.now(),kind:input.kind||'interpret_command',priority:input.priority||'normal',sessionId:input.sessionId||null,athleteIds:[...new Set(input.athleteIds||[])],evidenceIds:[...new Set(input.evidenceIds||[])],input:input.input||{},requiredCapability:input.requiredCapability||'ai_interpretation',privacy:input.privacy||'private_coaching',status:'queued',attempts:0};}
  function canQueue(j,{entitlements,can,budgetRemaining=Infinity}={}){if(can&&entitlements&&!can(entitlements,j.requiredCapability))return{ok:false,reason:'capability_not_enabled'};if(Number(budgetRemaining)<=0)return{ok:false,reason:'budget_exhausted'};return{ok:true,reason:''};}
  function complete(j,result,{provider='',model='',usage=null}={}){return{...j,status:'complete',completedAt:Date.now(),result,provider,model,usage};}
  function fail(j,error,{retryable=true}={}){return{...j,status:retryable?'queued':'failed',attempts:Number(j.attempts||0)+1,lastError:String(error?.message||error||'unknown'),retryable};}
  return{VERSION,shouldEscalate,job,canQueue,complete,fail};
});
