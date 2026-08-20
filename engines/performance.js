'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Evidence||!E?.RacePace)return;
  const P=M.performanceEngine={build:'v4-performance-20260820q'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const STROKES=['Freestyle','Backstroke','Breaststroke','Butterfly'];
  const FORMS=['Backstroke','Breaststroke','Butterfly'];
  const courseOf=r=>E.Evidence.course(r)||text(r?.course||r?.pool_course).toUpperCase();
  function pointValue(ath,row){
    let p=E.Evidence.points(row);if(Number.isFinite(p)&&p>0)return p;
    try{const ev=M.pathway?.event?.(ath,{...row,course:courseOf(row),distance:E.Evidence.distance(row),stroke:E.Evidence.rowStroke(row),result_seconds:E.Evidence.seconds(row)});p=Number(ev?.points?.value);if(Number.isFinite(p)&&p>0)return p;}catch{}
    return NaN;
  }
  function rows(ath,state=M.state,course=''){
    let src=[];try{src=M.pathway?.pbRows?.(ath,state)||[]}catch{}
    if(!src.length)src=E.Evidence.pbRows(ath,state);
    const wanted=text(course).toUpperCase();return src.map(r=>({raw:r,distance:E.Evidence.distance(r),stroke:E.Evidence.rowStroke(r),course:courseOf(r),seconds:E.Evidence.seconds(r),points:pointValue(ath,r)})).filter(r=>r.distance&&r.stroke&&Number.isFinite(r.seconds)&&r.seconds>0&&(!wanted||!r.course||r.course===wanted));
  }
  function rankedEvents(ath,state=M.state,course=''){return rows(ath,state,course).filter(r=>Number.isFinite(r.points)&&r.points>0).sort((a,b)=>b.points-a.points||a.seconds-b.seconds);}
  function bestEvent(ath,state=M.state,course=''){return rankedEvents(ath,state,course)[0]||null;}
  function bestStroke(ath,state=M.state,course='',nonFree=false){const allowed=nonFree?FORMS:STROKES;return rankedEvents(ath,state,course).find(r=>allowed.includes(r.stroke))||null;}
  function bestFormStroke(ath,state=M.state,course=''){return bestStroke(ath,state,course,true);}
  function t400s(ath,state=M.state){const out={};for(const s of [...STROKES,'IM']){const r=E.Evidence.t400Rows?.(ath,state,s)?.[0];if(r)out[s]={stroke:s,seconds:E.Evidence.seconds(r),row:r};}return out;}
  function timed(ath,state=M.state,limit=12){return(state?.timedSets||[]).filter(x=>x.athlete_id===ath?.id).slice(-limit).reverse();}
  function selectedCoachStroke(ath,state=M.state,days=14){const now=Date.now(),cut=now-days*86400000,counts=new Map();for(const o of state?.adaptationOverrides||[]){if(o?.athleteId!==ath?.id||o?.active===false||!o?.patch?.stroke)continue;const ts=Date.parse(o.updatedAt||o.createdAt||'');if(Number.isFinite(ts)&&ts<cut)continue;const s=E.Evidence.stroke(o.patch.stroke);if(!STROKES.includes(s))continue;counts.set(s,(counts.get(s)||0)+1);}return[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';}
  function selectStrokeForContext(ath,item,state=M.state,session=null,{formOnly=false}={}){
    const course=session?.identity?.course||'',event=bestEvent(ath,state,course);if(!event)return{stroke:'',source:'No ranked PB evidence',confidence:'none'};
    if(event.stroke==='IM'&&M.strokeBalance?.recommendStroke){const r=M.strokeBalance.recommendStroke(ath,state,session,{formOnly});if(r?.stroke)return r;}
    const ranked=bestStroke(ath,state,course,formOnly);if(!ranked)return{stroke:'',source:'No ranked stroke PB evidence',confidence:'none',bestEvent:event};
    const coach=selectedCoachStroke(ath,state);if(coach&&(!formOnly||coach!=='Freestyle'))return{stroke:coach,source:'Recent coach stroke selections',confidence:'medium',bestEvent:event};
    return{stroke:ranked.stroke,source:'Highest ranked stroke PB',confidence:'high',bestEvent:event,event:ranked};
  }
  function profile(ath,state=M.state,course=''){
    const ev=bestEvent(ath,state,course),st=bestStroke(ath,state,course,false),form=bestFormStroke(ath,state,course),all=rows(ath,state,course),tests=t400s(ath,state),recent=timed(ath,state);
    const medley=ev?.stroke==='IM',context=medley?selectStrokeForContext(ath,null,state,{identity:{course}},{}):null;
    return{athlete:ath,course,bestEvent:ev,bestStroke:st,bestFormStroke:form,medleyPrimary:medley,contextStroke:context,pbs:all,t400:tests,timedSets:recent,hasRankedEvidence:!!ev};
  }
  P.rows=rows;P.rankedEvents=rankedEvents;P.bestEvent=bestEvent;P.bestStroke=bestStroke;P.bestFormStroke=bestFormStroke;P.t400s=t400s;P.timed=timed;P.selectStrokeForContext=selectStrokeForContext;P.profile=profile;P.selectedCoachStroke=selectedCoachStroke;
})(globalThis);
