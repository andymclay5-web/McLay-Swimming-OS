'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.ResultsPathway=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>text(v).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const seconds=row=>{for(const k of ['pb_seconds','result_seconds','result_time_seconds','best_time_seconds','qualifying_seconds','target_seconds','record_seconds']){const n=num(row?.[k]);if(n!==null&&n>0)return n}return null};
  function course(v){const n=norm(v);return /short|scm|25m/.test(n)?'SCM':/long|lcm|50m/.test(n)?'LCM':/both|all/.test(n)?'BOTH':text(v).toUpperCase()}
  function stroke(v){const n=norm(v);if(/free/.test(n))return'Freestyle';if(/back/.test(n))return'Backstroke';if(/breast|\bbr\b/.test(n))return'Breaststroke';if(/butter|fly/.test(n))return'Butterfly';if(/\bim\b|individual medley/.test(n))return'IM';return text(v)}
  function sex(v){const n=norm(v);if(['m','male','boy','boys','men'].includes(n))return'M';if(['f','female','girl','girls','women'].includes(n))return'F';if(/open|mixed|all/.test(n))return'OPEN';return text(v).toUpperCase()}
  function kind(row){const n=norm(`${row?.standard_kind||row?.kind||''} ${row?.programme||row?.record_scope||''}`);if(/record/.test(n))return'record';if(/target 2028|target 2032|squad|pathway target/.test(n))return'squad';if(/finalist|final|medal|winner|placing|8th|3rd|1st/.test(n))return'benchmark';if(/qualif|champ|nags|nzsc|division/.test(n))return'qualifying';return'performance'}
  function active(row){return row?.active!==false&&!['inactive','rolled back','superseded','draft','archived'].includes(norm(row?.version_status||row?.status))}
  function age(ath,date){if(!ath?.date_of_birth||!date)return null;const d=new Date(`${ath.date_of_birth}T00:00:00Z`),at=new Date(`${date}T00:00:00Z`);if(Number.isNaN(d.getTime())||Number.isNaN(at.getTime()))return null;let y=at.getUTCFullYear()-d.getUTCFullYear();if(at.getUTCMonth()<d.getUTCMonth()||(at.getUTCMonth()===d.getUTCMonth()&&at.getUTCDate()<d.getUTCDate()))y--;return y}
  function ageBounds(row){let min=Number.isFinite(Number(row?.age_min))?Number(row.age_min):null,max=Number.isFinite(Number(row?.age_max))?Number(row.age_max):null;const t=norm(row?.age_group||row?.age);if(min==null&&max==null&&t&&!/open|all ages|senior/.test(t)){let m=t.match(/^(\d+)$/);if(m)min=max=Number(m[1]);else if((m=t.match(/(\d+)\s*(?:-|to)\s*(\d+)/))){min=Number(m[1]);max=Number(m[2])}else if((m=t.match(/(?:under|u)\s*(\d+)|(\d+)\s*(?:and )?under/)))max=Number(m[1]||m[2]);else if((m=t.match(/(?:over)\s*(\d+)|(\d+)\s*(?:and )?over/)))min=Number(m[1]||m[2])}return{min,max}}
  function paraClass(ath,eventStroke){const s=stroke(eventStroke);return s==='Breaststroke'?text(ath?.current_sb_class):s==='IM'?text(ath?.current_sm_class):text(ath?.current_s_class)}
  function isPara(ath){return!!(ath?.current_s_class||ath?.current_sb_class||ath?.current_sm_class||/para|\bs\d|\bsb\d|\bsm\d/i.test(text(ath?.modifications)))}
  function classMatches(required,actual){const r=text(required).toUpperCase().replace(/\s/g,''),a=text(actual).toUpperCase().replace(/\s/g,'');if(!r)return!a;const m=r.match(/^(S|SB|SM)(\d+)(?:-(\d+))?$/),n=a.match(/^(S|SB|SM)(\d+)$/);return!!(m&&n&&m[1]===n[1]&&Number(n[2])>=Number(m[2])&&Number(n[2])<=Number(m[3]||m[2]))}
  const eventOf=row=>({course:course(row?.course||row?.pool_course),distance:num(row?.distance??row?.event_distance),stroke:stroke(row?.stroke||row?.event_stroke)});
  const gap=(pb,target)=>({seconds:Math.max(0,pb-target),percentage:target>0?Math.max(0,(pb-target)/target*100):0,achieved:pb<=target});
  const standardLabel=row=>text(row?.programme||row?.standard_name||row?.record_scope||row?.name||'Loaded target');
  function defaultStandard(row){const k=kind(row),label=norm(standardLabel(row));return k==='qualifying'&&!/final|medal|winner|record|1st|3rd|8th/.test(label)}
  function nationalLabel(row){return/nzsc|new zealand|nz champs|national|nags/i.test(standardLabel(row))}

  class Pathway{
    constructor({evidence,standards=[],baseTimes=[],today=()=>new Date().toISOString().slice(0,10)}={}){
      if(!evidence||typeof evidence.resolveAthlete!=='function'||typeof evidence.results!=='function')throw new Error('ResultsPathway requires Evidence Retrieval');
      this.evidence=evidence;this.standards=clone(standards||[]);this.baseTimes=clone(baseTimes||[]);this.today=today;
    }
    athlete(ref){return this.evidence.resolveAthlete(ref)}
    pbRows(athleteRef,{course:courseWanted=''}={}){
      const ath=this.athlete(athleteRef);if(!ath)return[];const wanted=course(courseWanted),rows=this.evidence.results(ath.id,{}).filter(x=>x.excluded_from_pb!==true),best=new Map();
      for(const raw of rows){const e=eventOf(raw),sec=seconds(raw);if(!e.course||e.course==='BOTH'||!e.distance||!e.stroke||sec===null)continue;if(wanted&&e.course!==wanted)continue;const k=`${e.course}|${e.distance}|${e.stroke}`,row={...clone(raw),...e,result_seconds:sec};if(!best.has(k)||sec<best.get(k).result_seconds)best.set(k,row)}
      return[...best.values()].sort((a,b)=>a.course.localeCompare(b.course)||a.distance-b.distance||a.stroke.localeCompare(b.stroke));
    }
    standardMatches(row,ath,pb,{asOfDate=''}={}){
      if(!active(row))return false;const e=eventOf(row);if(e.distance!==pb.distance||e.stroke!==pb.stroke)return false;if(e.course&&e.course!=='BOTH'&&e.course!==pb.course)return false;
      const reqSex=sex(row.sex),actualSex=sex(ath.sex);if(reqSex&&reqSex!=='OPEN'&&reqSex!==actualSex)return false;
      const required=text(row.para_class||row.classification),actualClass=paraClass(ath,pb.stroke);
      if(isPara(ath)){if(!actualClass||!required||!classMatches(required,actualClass))return false}else if(required)return false;
      const {min,max}=ageBounds(row),atDate=row.age_date||row.meet_date||asOfDate||this.today(),a=age(ath,atDate);if((min!=null||max!=null)&&a==null)return false;if(a!=null&&((min!=null&&a<min)||(max!=null&&a>max)))return false;return true;
    }
    standardsFor(ath,pb,opts={}){return this.standards.filter(r=>this.standardMatches(r,ath,pb,opts)).map(r=>({...clone(r),_seconds:seconds(r),_kind:kind(r),_label:standardLabel(r)})).filter(r=>r._seconds!==null)}
    baseTime(ath,pb){return clone(this.baseTimes.find(r=>active(r)&&course(r.course)===pb.course&&num(r.distance)===pb.distance&&stroke(r.stroke)===pb.stroke&&(!sex(r.sex)||sex(r.sex)==='OPEN'||sex(r.sex)===sex(ath.sex)))||null)}
    points(ath,pb){
      const para=num(pb.world_para_points??pb.para_points);if(para!==null&&para>0)return{value:Math.trunc(para),label:'World Para',source:'result'};
      const explicit=num(pb.wa_points??pb.world_aquatics_points??pb.fina_points);if(explicit!==null&&explicit>0)return{value:Math.trunc(explicit),label:'WA',source:'result'};
      if(isPara(ath))return{value:null,label:'World Para',source:'classification-specific point model required'};
      const base=this.baseTime(ath,pb),b=num(base?.base_seconds);if(b===null||!pb.result_seconds)return{value:null,label:'WA',source:'base time not loaded'};
      return{value:Math.trunc(1000*Math.pow(b/pb.result_seconds,3)),label:'WA',source:'loaded WA base time',baseSeconds:b};
    }
    pointSteps(ath,pb,count=2){const pt=this.points(ath,pb);if(pt.label!=='WA'||!pt.value)return[];const base=pt.baseSeconds||num(this.baseTime(ath,pb)?.base_seconds);if(base===null)return[];const first=Math.ceil((pt.value+1)/25)*25,steps=[];for(let i=0;i<count;i++){const points=first+i*25,sec=base/Math.cbrt(points/1000);steps.push({points,seconds:sec})}return steps}
    trend(ath,pb){
      const rows=this.evidence.results(ath.id,{distance:pb.distance,stroke:pb.stroke,course:pb.course}).filter(r=>seconds(r)!==null).sort((a,b)=>text(a.result_date||a.date).localeCompare(text(b.result_date||b.date)));
      if(!rows.length)return{count:0,first:null,latest:null,pb:pb.result_seconds,improvementToPb:null,latestVsPb:null};const first=seconds(rows[0]),latest=seconds(rows.at(-1));return{count:rows.length,first,latest,pb:pb.result_seconds,improvementToPb:first-pb.result_seconds,latestVsPb:latest-pb.result_seconds,firstDate:text(rows[0].result_date||rows[0].date),latestDate:text(rows.at(-1).result_date||rows.at(-1).date)};
    }
    event(ath,pb,opts={}){
      const standards=this.standardsFor(ath,pb,opts),nationals=standards.filter(r=>defaultStandard(r)&&nationalLabel(r)),unachieved=nationals.filter(x=>pb.result_seconds>x._seconds).sort((a,b)=>gap(pb.result_seconds,a._seconds).percentage-gap(pb.result_seconds,b._seconds).percentage),next=unachieved[0]||null;
      const qualifying=standards.filter(defaultStandard).sort((a,b)=>(Number(a.progression_order)||999)-(Number(b.progression_order)||999)||b._seconds-a._seconds),deeper=standards.filter(x=>!defaultStandard(x));
      return{pb:clone(pb),points:this.points(ath,pb),pointSteps:this.pointSteps(ath,pb),trend:this.trend(ath,pb),nextNational:next?{row:clone(next),gap:gap(pb.result_seconds,next._seconds)}:null,qualifying,deeper,achievedNational:nationals.filter(x=>pb.result_seconds<=x._seconds).map(x=>({...clone(x),gap:gap(pb.result_seconds,x._seconds)}))};
    }
    profile(athleteRef,{course:courseWanted='',asOfDate=''}={}){
      const ath=this.athlete(athleteRef);if(!ath)return{status:'missing_athlete',athlete:null,course:course(courseWanted),pbs:[],events:[],closest:null,furthest:null,classificationNeeded:false};
      const wanted=course(courseWanted);if(isPara(ath)&&!paraClass(ath,'Freestyle')&&!paraClass(ath,'Breaststroke')&&!paraClass(ath,'IM'))return{status:'classification_needed',athlete:clone(ath),course:wanted,classificationNeeded:true,pbs:[],events:[],closest:null,furthest:null};
      const pbs=this.pbRows(ath.id,{course:wanted}),events=pbs.map(pb=>this.event(ath,pb,{asOfDate})),withNext=events.filter(x=>x.nextNational),closest=withNext.slice().sort((a,b)=>a.nextNational.gap.percentage-b.nextNational.gap.percentage)[0]||null,furthest=withNext.slice().sort((a,b)=>b.nextNational.gap.percentage-a.nextNational.gap.percentage)[0]||null;
      return{status:'ok',athlete:clone(ath),course:wanted,classificationNeeded:false,pbs,events,closest,furthest,summary:{pbEvents:pbs.length,matchedNationalTargets:withNext.length,closestEvent:closest?`${closest.pb.course} ${closest.pb.distance} ${closest.pb.stroke}`:null,furthestEvent:furthest?`${furthest.pb.course} ${furthest.pb.distance} ${furthest.pb.stroke}`:null}};
    }
    eventAnswer(athleteRef,{course:poolCourse,distance:eventDistance,stroke:eventStroke,asOfDate=''}={}){const p=this.profile(athleteRef,{course:poolCourse,asOfDate});if(p.status!=='ok')return{status:p.status,event:null};const ev=p.events.find(x=>x.pb.distance===num(eventDistance)&&x.pb.stroke===stroke(eventStroke));return ev?{status:'ok',event:ev}:{status:'missing_event',event:null}}
  }
  const create=options=>new Pathway(options);
  return{VERSION,create,Pathway,course,stroke,sex,kind,active,age,ageBounds,paraClass,isPara,classMatches,eventOf,gap,defaultStandard,nationalLabel};
});
