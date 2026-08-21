'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines,A=g.MSOSArchitecture;
  if(!M||!E||!A?.Context||!A?.Interaction||!A?.Performance||!A?.Projection||!A?.BoardProjection||!A?.SwimmerDeck||!A?.V4Adapter)return;
  const BUILD='v4-eyes-up-architecture-20260822ay';
  const X=M.eyesUpAY={build:BUILD};
  const adapter=A.V4Adapter.create({M,E,Performance:A.Performance,SwimmerDeck:A.SwimmerDeck});
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const current=()=>M.currentSession?.()||null;
  const findItem=(session,id)=>{let hit=null;const walk=items=>{for(const x of items||[]){if(x?.id===id){hit=x;return;}if(x?.kind==='group')walk(x.items||[]);if(hit)return;}};for(const b of session?.blocks||[]){walk(b.items||[]);if(hit)break;}return hit;};
  function contextFrame(){
    const session=current();if(!session)return{status:'idle',confidence:0,source:'none'};
    const live=M.contextEngineAV?.now?.(session);if(live?.status==='active')return{status:'active',sessionId:session.id,blockId:live.blockId||null,blockLabel:live.blockLabel||'',itemId:live.itemId||null,itemLabel:live.itemLabel||'',rep:live.rep||null,round:live.round||null,source:live.source||'live_context',confidence:Number(live.confidence)||.5,driftSeconds:Number(live.driftSeconds)||0};
    const selected=M.state?.settings?.boardBlockBySession?.[session.id],block=(session.blocks||[]).find(b=>b.id===selected)||null,item=block?.items?.find?.(x=>x?.kind==='set')||null;
    if(block)return{status:'active',sessionId:session.id,blockId:block.id,blockLabel:block.title||block.label||block.type||'',itemId:item?.id||null,itemLabel:text(item?.raw||item?.text||''),rep:null,round:null,source:'board_action',confidence:.94,driftSeconds:0};
    const tracker=new A.Context.ContextTracker({session});return tracker.frame();
  }
  function presentAthletes(){return M.ui?.presentAthletes?.()||adapter.athletes();}
  function boardModel({roster=presentAthletes()}={}){
    const session=current(),ctx=contextFrame();if(!session||ctx.status!=='active')return{status:'idle',context:ctx};
    const item=findItem(session,ctx.itemId);if(!item)return{status:'context_only',context:ctx};
    const prescriptions=adapter.currentPrescriptions(session,item,roster),timeline=A.Context.plannedTimeline(session),model=A.BoardProjection.projectCurrent({context:ctx,timeline,prescriptions});
    return{status:'active',sessionId:session.id,itemId:item.id,context:ctx,item,prescriptions,...model};
  }
  function quickView(athlete,{milestones=[],pointsFor=null,course='',opportunities=[]}={}){return adapter.buildDeck(athlete,{milestones,pointsFor,course,opportunities});}
  function quickViewById(id,options={}){const a=adapter.athletes().find(x=>x.id===id);return a?quickView(a,options):null;}
  function voicePlan(transcript){const parsed=A.Interaction.parseDeterministic(transcript,{athletes:presentAthletes(),context:contextFrame()}),action=A.Interaction.actionEnvelope(parsed);const publicAuth=A.Delivery?.authorizeDestination?.(action,{explicitPublic:A.Interaction.wantsPublic(transcript),role:M.state?.settings?.role||'coach'})||{ok:true,destination:action.destination};return{parsed,action,authorized:publicAuth};}
  function remoteProjection(athlete){const session=current();if(!session||!athlete)return null;return A.Projection.projectAthleteSession(session,athlete,(s,item,a)=>E.Coordinator?.prescription?.(s,item,a,M.state)||{item,target:{status:'none'}});}
  function allPBs(athlete){return adapter.dedupedPBs(athlete);}
  X.adapter=adapter;X.contextFrame=contextFrame;X.boardModel=boardModel;X.quickView=quickView;X.quickViewById=quickViewById;X.voicePlan=voicePlan;X.remoteProjection=remoteProjection;X.allPBs=allPBs;X.findItem=findItem;
})(globalThis);
