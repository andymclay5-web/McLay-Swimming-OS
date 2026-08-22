'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines,A=g.MSOSArchitecture;
  if(!M||!E||!A?.Context||!A?.Projection||!A?.BoardProjection||!A?.V4Adapter||!A?.Performance||!A?.SwimmerDeck)return;
  const X=M.eyesUpPilotBM={build:'v4-swimmer-tv-pilot-20260822bm'};
  const adapter=A.V4Adapter.create({M,E,Performance:A.Performance,SwimmerDeck:A.SwimmerDeck});
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const current=()=>M.currentSession?.()||null;
  function flatten(session){const out=[];const walk=(items,block)=>{for(const i of items||[]){if(i?.kind==='group')walk(i.items||[],block);else if(i?.kind==='set')out.push({block,item:i});}};for(const b of session?.blocks||[])walk(b.items,b);return out;}
  function selectedContext(session){
    const selected=M.state?.settings?.boardBlockBySession?.[session.id];
    const rows=flatten(session);let ix=-1;
    if(selected)ix=rows.findIndex(x=>x.block?.id===selected);
    if(ix<0){const finished=session?.finish?.throughItemId;ix=finished?rows.findIndex(x=>x.item?.id===finished)+1:0;if(ix>=rows.length)ix=rows.length-1;}
    const row=rows[Math.max(0,ix)]||null;
    return row?{status:'active',sessionId:session.id,blockId:row.block?.id||null,blockLabel:row.block?.title||'',itemId:row.item?.id||null,itemLabel:text(row.item?.raw||row.item?.text||''),source:selected?'board_action':'session_progress',confidence:selected?.94:.72}:null;
  }
  function contextFrame(){const s=current();if(!s)return{status:'idle',source:'none',confidence:0};return selectedContext(s)||new A.Context.ContextTracker({session:s}).frame();}
  function findItem(session,id){return flatten(session).find(x=>x.item?.id===id)?.item||null;}
  function presentAthletes(){return M.ui?.presentAthletes?.()||adapter.athletes();}
  function boardModel(){
    const session=current(),context=contextFrame();if(!session||context.status!=='active')return{status:'idle',context};
    const item=findItem(session,context.itemId);if(!item)return{status:'context_only',context};
    const prescriptions=adapter.currentPrescriptions(session,item,presentAthletes()),timeline=A.Context.plannedTimeline(session),model=A.BoardProjection.projectCurrent({context,timeline,prescriptions});
    return{status:'active',sessionId:session.id,itemId:item.id,item,context,prescriptions,...model};
  }
  X.adapter=adapter;X.flatten=flatten;X.contextFrame=contextFrame;X.boardModel=boardModel;X.presentAthletes=presentAthletes;
})(globalThis);
