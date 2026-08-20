'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines?.Evidence,P=M?.performanceEngine;if(!M||!E||!P)return;
  const D=M.developmentEngine={build:'v4-development-20260820ab'};
  const PURE=['Freestyle','Backstroke','Breaststroke','Butterfly'];
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const dateOfBirth=a=>a?.date_of_birth||a?.dob||a?.birth_date||a?.dateOfBirth||'';
  function ageAt(ath,date=new Date()){const raw=dateOfBirth(ath);if(!raw)return null;const d=new Date(raw);if(Number.isNaN(d.getTime()))return null;const now=date instanceof Date?date:new Date(date),y=now.getFullYear()-d.getFullYear(),before=now.getMonth()<d.getMonth()||(now.getMonth()===d.getMonth()&&now.getDate()<d.getDate());return y-(before?1:0);}
  const eventKey=(distance,stroke)=>`${Number(distance)}|${E.stroke(stroke)}`;
  function profile(ath,state=M.state,course='SCM'){
    const rows=P.rows(ath,state,course),byKey=new Map(),byStroke=Object.fromEntries([...PURE,'IM'].map(s=>[s,[]]));
    for(const r of rows){const st=E.stroke(r.stroke),d=Number(r.distance);if(!d||!st)continue;const k=eventKey(d,st),old=byKey.get(k);if(!old||Number(r.seconds)<Number(old.seconds))byKey.set(k,r);if(byStroke[st]&&!byStroke[st].includes(d))byStroke[st].push(d);}
    for(const s of Object.keys(byStroke))byStroke[s].sort((a,b)=>a-b);
    const has=(stroke,distance)=>byKey.has(eventKey(distance,stroke)),opps=[],seen=new Set();
    function add(distance,stroke,label,reason,{priority=5,category='coverage'}={}){const st=E.stroke(stroke),id=eventKey(distance,st);if(seen.has(id)||has(st,distance))return;seen.add(id);let model=null;try{if(PURE.includes(st))model=P.modeledEvent?.(ath,state,{course,distance,stroke:st})||null;}catch{}opps.push({id,label:label||`Try ${distance} ${st}`,distance,stroke:st,reason,priority,category,modelSeconds:model?.seconds||null,modelPoints:model?.points||null,modelSource:model?.source||'',modelConfidence:model?.confidence||''});}
    for(const st of PURE){const ds=byStroke[st];if(!ds.length)continue;if(!has(st,100)&&(has(st,50)||has(st,200)))add(100,st,`Race 100 ${st}`,`Extends existing ${st} evidence to the central race distance`,{priority:2});if(!has(st,200)&&has(st,100))add(200,st,`Develop 200 ${st}`,`Adds endurance/race-shape evidence beside the 100 ${st}`,{priority:3});if(!has(st,50)&&has(st,100))add(50,st,`Race 50 ${st}`,`Adds speed evidence beside the 100 ${st}`,{priority:4});}
    if(byStroke.Freestyle.length&&!has('Freestyle',400)&&(has('Freestyle',100)||has('Freestyle',200)))add(400,'Freestyle','Experience 400 Freestyle','Adds middle-distance Free evidence rather than relying only on sprint Free',{priority:3,category:'distance_free'});
    const represented=PURE.filter(s=>byStroke[s].length).length;if(!byStroke.IM.length&&represented>=3)add(course==='SCM'?100:200,'IM',`Try ${course==='SCM'?100:200} IM`,'Broad stroke evidence is present but there is no IM race evidence yet',{priority:2,category:'medley'});
    const today=new Date(),age=ageAt(ath,today),juniorHint=/\b(?:junior|novice)\b/i.test(text(ath?.squad)),xlr8Eligible=age!=null?age<=12:juniorHint;
    const distanceFree=[...byKey.values()].find(r=>E.stroke(r.stroke)==='Freestyle'&&Number(r.distance)>=400)||null,im=[...byKey.values()].find(r=>E.stroke(r.stroke)==='IM')||null,form200=[...byKey.values()].filter(r=>Number(r.distance)===200&&['Backstroke','Breaststroke','Butterfly'].includes(E.stroke(r.stroke))).sort((a,b)=>(Number(b.points)||0)-(Number(a.points)||0))[0]||null,breadth=byKey.size>=4;
    const categories=[
      {id:'distance_free',label:'Distance Free',complete:!!distanceFree,evidence:distanceFree?`${distanceFree.distance} Freestyle`:''},
      {id:'im',label:'IM',complete:!!im,evidence:im?`${im.distance} IM`:''},
      {id:'form_200',label:'200 form stroke',complete:!!form200,evidence:form200?`${form200.distance} ${form200.stroke}`:''},
      {id:'breadth',label:'Fourth-event breadth',complete:breadth,evidence:breadth?`${byKey.size} distinct PB events`:''}
    ];
    if(xlr8Eligible){if(!distanceFree)add(400,'Freestyle','XLR8 · add distance Free','Junior event breadth is missing a distance-Freestyle result',{priority:1,category:'xlr8'});if(!im)add(course==='SCM'?100:200,'IM','XLR8 · add IM','Junior event breadth is missing an IM result',{priority:1,category:'xlr8'});if(!form200){const bestForm=P.bestFormStroke?.(ath,state,course)?.stroke||'Backstroke';add(200,bestForm,`XLR8 · try 200 ${bestForm}`,'Junior event breadth is missing a 200 form-stroke result',{priority:1,category:'xlr8'});}}
    opps.sort((a,b)=>a.priority-b.priority||a.label.localeCompare(b.label));
    const missingXlr8=categories.filter(x=>!x.complete),xlr8={monitored:xlr8Eligible,eligible:age!=null?age<=12:null,age,ageKnown:age!=null,juniorHint,categories,complete:xlr8Eligible&&!missingXlr8.length,missing:missingXlr8.map(x=>x.id),status:!xlr8Eligible?'not_monitored':missingXlr8.length?'development':'coverage_ready',pointsStatus:'coverage_only',note:'XLR8 coverage monitor only; annual official scoring/base tables must be loaded before points are calculated.'};
    return{athlete:ath,course,pbEvents:byKey.size,byStroke,representedStrokes:represented,opportunities:opps,xlr8};
  }
  function squad(state=M.state,{course='SCM',athletes=null}={}){const list=(athletes||state?.athletes||[]).filter(a=>a.active!==false),rows=list.map(a=>profile(a,state,course));return{rows,summary:{athletes:rows.length,withPb:rows.filter(r=>r.pbEvents>0).length,noPb:rows.filter(r=>!r.pbEvents).length,withOpportunities:rows.filter(r=>r.opportunities.length).length,xlr8Monitored:rows.filter(r=>r.xlr8.monitored).length,xlr8CoverageReady:rows.filter(r=>r.xlr8.complete).length}};}
  D.ageAt=ageAt;D.profile=profile;D.squad=squad;D.eventKey=eventKey;
})(globalThis);
