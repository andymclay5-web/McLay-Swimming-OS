'use strict';
(function(root,factory){
  const deps=typeof module==='object'&&module.exports?{
    Context:require('./context-core'),Interaction:require('./interaction-core'),Evidence:require('./evidence-core'),Events:require('./event-core'),Delivery:require('./delivery-core'),Reporting:require('./report-core'),AI:require('./ai-orchestrator-core')
  }:root.MSOSArchitecture||{};
  const api=factory(deps);
  if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.PoolsideRuntime=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(A){
  const VERSION='1.0.0-aw';
  class PoolsideRuntime{
    constructor({session=null,athletes=[],adapters={},clock=()=>Date.now(),contextOptions={}}={}){
      this.session=session;this.athletes=athletes;this.adapters=adapters;this.clock=clock;
      this.events=new A.Events.EventLedger();this.evidence=A.Evidence.createLedger();
      this.context=new A.Context.ContextTracker({session,now:clock,...contextOptions});this.aiJobs=[];this.lastResponse=null;
    }
    frame(){return this.context.frame(this.clock());}
    setSession(session,options={}){this.session=session;this.context.setSession(session,options);return this;}
    anchor({itemId=null,blockId=null,rep=null,round=null,note='',source='coach'}={}){const at=this.clock(),a=this.context.anchor({at,itemId,blockId,rep,round,note,source});this.events.append({type:'context_anchor',occurredAt:at,sessionId:this.session?.id||null,itemId:a.itemId,blockId:a.blockId,payload:{rep:a.rep,round:a.round,note:a.note},source:source==='coach'?'coach_touch':source});return a;}
    saveEvidence(parsed){const at=this.clock(),ctx=this.frame(),metrics=parsed.payload?.metrics||{};const row=A.Evidence.appendRaw(this.evidence,{createdAt:at,authorId:'coach',source:'coach_voice',type:parsed.intent==='capture_metric_note'?'voice':'note',athleteIds:parsed.athlete?.id?[parsed.athlete.id]:[],context:ctx,raw:{text:parsed.payload?.note||parsed.raw},metrics});this.events.append({type:'evidence_captured',occurredAt:at,sessionId:this.session?.id||null,blockId:ctx.blockId,itemId:ctx.itemId,athleteIds:row.athleteIds,payload:{evidenceId:row.id,metrics},source:'coach_voice'});if(metrics.rep&&!ctx.rep)this.anchor({itemId:ctx.itemId,blockId:ctx.blockId,rep:metrics.rep,note:'voice rep evidence',source:'evidence'});return row;}
    async execute(parsed){
      const ctx=this.frame(),ath=parsed.athlete;
      switch(parsed.intent){
        case'context_anchor':{const resolver=this.adapters.resolveContextLabel;const resolved=resolver?await resolver(parsed.payload?.label,{session:this.session,context:ctx}):{};const a=this.anchor({itemId:resolved?.itemId||ctx.itemId,blockId:resolved?.blockId||ctx.blockId,rep:resolved?.rep||null,note:parsed.payload?.label||'',source:'coach'});return{ok:true,destination:'private_earbud',speak:'Context updated.',data:a};}
        case'context_advance':{const next=this.adapters.nextContext?await this.adapters.nextContext(ctx,{session:this.session}):null;if(next)this.anchor({...next,note:'next',source:'action'});return{ok:!!next,destination:'private_earbud',speak:next?'Next set.':'I cannot identify the next set yet.',data:next};}
        case'capture_metric_note':case'capture_note':{const e=this.saveEvidence(parsed);return{ok:true,destination:'private_earbud',speak:`Saved${ath?.full_name?` for ${ath.full_name}`:''}.`,data:e};}
        case'query_pb':return this.queryAdapter('queryPB',parsed,'PB unavailable');
        case'query_current_targets':return this.queryAdapter('queryTargets',parsed,'Target unavailable');
        case'query_pathway':return this.queryAdapter('queryPathway',parsed,'Pathway unavailable');
        case'query_media':return this.queryAdapter('queryMedia',parsed,'Media unavailable');
        case'capture_video':{const result=await this.adapters.openVideo?.({athlete:ath,context:ctx});return{ok:!!result,destination:'private_phone',speak:result?'Video ready.':'Video capture unavailable.',data:result||null};}
        case'athlete_message':{const msg=A.Delivery.message({createdAt:this.clock(),athleteIds:ath?.id?[ath.id]:[],text:parsed.payload?.text||parsed.raw});const result=await this.adapters.deliverAthlete?.(msg,{athlete:ath,context:ctx});this.events.append({type:'swimmer_message_sent',sessionId:this.session?.id||null,athleteIds:msg.athleteIds,payload:{messageId:msg.id},source:'coach_voice'});return{ok:result!==false,destination:'private_earbud',speak:result===false?'Message not delivered.':'Message saved.',data:msg};}
        case'unknown':{if(A.AI.shouldEscalate(parsed)){const j=A.AI.job({createdAt:this.clock(),sessionId:this.session?.id||null,athleteIds:ath?.id?[ath.id]:[],input:{transcript:parsed.raw,context:ctx}});this.aiJobs.push(j);return{ok:false,destination:'private_earbud',speak:'That needs the intelligence layer.',needsAI:true,data:j};}return{ok:false,destination:'private_earbud',speak:'I did not understand that.',data:null};}
        default:return{ok:false,destination:'private_earbud',speak:'That action is not wired yet.',data:null};
      }
    }
    async queryAdapter(name,parsed,fallback){const fn=this.adapters[name],ctx=this.frame();if(!fn)return{ok:false,destination:parsed.destination||'private_earbud',speak:fallback,data:null};const data=await fn({athlete:parsed.athlete,event:parsed.payload?.event,context:ctx,session:this.session});const speak=typeof data==='string'?data:data?.speak||fallback;const result={ok:!!data,destination:parsed.destination||'private_earbud',speak,data};if(result.destination==='tv'){const auth=A.Delivery.authorizeDestination(result,{explicitPublic:A.Interaction.wantsPublic(parsed.raw),role:'coach'});if(!auth.ok)return{...result,ok:false,destination:auth.destination,speak:auth.reason};await this.adapters.publishTV?.(data,{context:ctx,athlete:parsed.athlete});}return result;}
    async handleTranscript(transcript){const parsed=A.Interaction.parseDeterministic(transcript,{athletes:this.athletes,context:this.frame()});const action=A.Interaction.actionEnvelope(parsed,{at:this.clock()});const result=await this.execute(parsed);this.lastResponse={parsed,action,result};return this.lastResponse;}
    finish(){const at=this.clock();this.events.append({type:'session_finished',occurredAt:at,sessionId:this.session?.id||null,payload:{},source:'coach_touch'});return A.Reporting.sessionReport({session:this.session,events:this.events.forSession(this.session?.id),ledger:this.evidence});}
  }
  return{VERSION,PoolsideRuntime};
});
