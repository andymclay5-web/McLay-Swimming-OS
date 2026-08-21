'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.AthleteSession=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-bd';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const roundsOf=g=>Math.max(1,Number(g?.rounds)||1);
  function executionRows(session){
    const out=[];
    const walk=(items,block,path=[])=>{for(const item of items||[]){if(item?.kind==='group'){const n=roundsOf(item);for(let round=1;round<=n;round++)walk(item.items||[],block,[...path,{groupId:item.id,round,rounds:n,label:text(item.text||item.raw||`${n} rounds`)}]);}else if(item?.kind==='set')out.push({index:out.length,block,item,roundPath:clone(path)});}};
    for(const block of session?.blocks||[])walk(block.items||[],block,[]);return out;
  }
  function roundMatches(row,boundary){const wanted=boundary?.roundByGroup||{};for(const p of row?.roundPath||[]){if(p.rounds<=1)continue;if(wanted[p.groupId]!=null&&Number(wanted[p.groupId])!==Number(p.round))return false;if(wanted[p.groupId]==null)return false;}return true;}
  function boundaryIndex(rows,boundary){if(!boundary)return null;if(boundary.full===true)return rows.length-1;if(boundary.itemId){for(let i=0;i<rows.length;i++)if(rows[i]?.item?.id===boundary.itemId&&roundMatches(rows[i],boundary))return i;return null;}if(boundary.blockId){let ix=null;for(let i=0;i<rows.length;i++)if(rows[i]?.block?.id===boundary.blockId)ix=i;return ix;}return null;}
  function sessionFinishBoundary(session){const f=session?.finish;if(!f)return null;if(f.throughItemId)return{kind:'squad_finish',itemId:f.throughItemId,blockId:f.throughBlockId||'',roundByGroup:clone(f.roundByGroup||{}),at:f.finishedAt||f.finished_at||''};if(f.throughBlockId)return{kind:'squad_finish',blockId:f.throughBlockId,roundByGroup:clone(f.roundByGroup||{}),at:f.finishedAt||f.finished_at||''};return{kind:'squad_finish',full:true,at:f.finishedAt||f.finished_at||''};}
  function embeddedBoundary(session,athleteId){return clone(session?.metadata?.athleteSessionBoundaries?.[athleteId]||null);}
  function suppliedBoundary(boundaries,sessionId,athleteId){if(!boundaries)return null;if(Array.isArray(boundaries)){const rows=boundaries.filter(x=>x?.session_id===sessionId&&x?.athlete_id===athleteId);return clone(rows.sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')))[0]||null);}const direct=boundaries?.[sessionId]?.[athleteId]||boundaries?.[`${sessionId}|${athleteId}`];return clone(direct||null);}
  function athleteBoundary({session,athleteId,boundaries=null}={}){return suppliedBoundary(boundaries,session?.id,athleteId)||embeddedBoundary(session,athleteId)||null;}
  function canonicalBoundary(boundary,kind='athlete_end'){if(!boundary)return null;const src=boundary.end||boundary;return{kind,itemId:src.itemId||src.item_id||'',blockId:src.blockId||src.block_id||'',roundByGroup:clone(src.roundByGroup||src.round_by_group||{}),at:src.at||boundary.updated_at||'',label:text(src.label||'')};}
  function deliveryWindow({session,athleteId,boundaries=null}={}){
    const rows=executionRows(session),ath=athleteBoundary({session,athleteId,boundaries}),squad=sessionFinishBoundary(session),start=ath?.start?canonicalBoundary(ath.start,'athlete_start'):null,end=ath?.end?canonicalBoundary(ath.end,'athlete_end'):null;
    const squadIx=boundaryIndex(rows,squad),startIx=start?boundaryIndex(rows,start):null,endIx=end?boundaryIndex(rows,end):null;
    let from=startIx==null?0:Math.max(0,startIx),to=rows.length-1,endSource='planned';
    if(squadIx!=null){to=squadIx;endSource='squad_finish';}
    if(endIx!=null&&(squadIx==null||endIx<squadIx)){to=endIx;endSource='athlete_end';}
    if(to<from)return{rows:[],allRows:rows,from,to,squadBoundary:squad,athleteBoundary:ath,endSource,endedEarly:endSource==='athlete_end',startSource:start?'athlete_start':'session_start'};
    return{rows:rows.slice(from,to+1),allRows:rows,from,to,squadBoundary:squad,athleteBoundary:ath,endSource,endedEarly:endSource==='athlete_end',startSource:start?'athlete_start':'session_start'};
  }
  function boundaryLabel(session,boundary){if(!boundary)return'';const rows=executionRows(session),ix=boundaryIndex(rows,canonicalBoundary(boundary));if(ix==null)return text(boundary?.label||boundary?.end?.label||'');const r=rows[ix];return text(r?.item?.raw||r?.item?.text||r?.block?.title||'');}
  function makeEnd({session,athleteId,itemId,blockId='',roundByGroup={},at=new Date().toISOString(),label=''}={}){return{session_id:session?.id||'',athlete_id:athleteId||'',start:null,end:{itemId:itemId||'',blockId:blockId||'',roundByGroup:clone(roundByGroup||{}),at,label:text(label)},status:'ended_early',updated_at:at};}
  function makeStart({session,athleteId,itemId,blockId='',roundByGroup={},at=new Date().toISOString(),label=''}={}){return{session_id:session?.id||'',athlete_id:athleteId||'',start:{itemId:itemId||'',blockId:blockId||'',roundByGroup:clone(roundByGroup||{}),at,label:text(label)},end:null,status:'started_late',updated_at:at};}
  return{VERSION,text,clone,executionRows,boundaryIndex,sessionFinishBoundary,athleteBoundary,canonicalBoundary,deliveryWindow,boundaryLabel,makeEnd,makeStart};
});
