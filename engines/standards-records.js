'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.StandardsRecords=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>text(v).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const seconds=row=>{for(const k of ['qualifying_seconds','target_seconds','record_seconds','benchmark_seconds','result_seconds','pb_seconds']){const n=num(row?.[k]);if(n!==null&&n>0)return n}return null};
  function course(v){const n=norm(v);return /short|scm|25m/.test(n)?'SCM':/long|lcm|50m/.test(n)?'LCM':/both|all/.test(n)?'BOTH':text(v).toUpperCase()}
  function stroke(v){const n=norm(v);if(/free/.test(n))return'Freestyle';if(/back/.test(n))return'Backstroke';if(/breast|\bbr\b/.test(n))return'Breaststroke';if(/butter|fly/.test(n))return'Butterfly';if(/\bim\b|individual medley/.test(n))return'IM';return text(v)}
  function sex(v){const n=norm(v);if(['m','male','boy','boys','men'].includes(n))return'M';if(['f','female','girl','girls','women'].includes(n))return'F';if(/open|mixed|all/.test(n))return'OPEN';return text(v).toUpperCase()}
  function kind(row){const n=norm(`${row?.standard_kind||row?.kind||''} ${row?.programme||row?.record_scope||row?.name||''}`);if(/record/.test(n))return'record';if(/finalist|final|medal|winner|placing|8th|3rd|1st/.test(n))return'benchmark';if(/qualif|champ|nags|nzsc|division/.test(n))return'qualifying';if(/target 2028|target 2032|squad|pathway target/.test(n))return'pathway';return'performance'}
  function active(row){return row?.active!==false&&!['inactive','rolled back','superseded','draft','archived'].includes(norm(row?.version_status||row?.status))}
  function age(ath,date){if(!ath?.date_of_birth||!date)return null;const d=new Date(`${ath.date_of_birth}T00:00:00Z`),at=new Date(`${date}T00:00:00Z`);if(Number.isNaN(d.getTime())||Number.isNaN(at.getTime()))return null;let y=at.getUTCFullYear()-d.getUTCFullYear();if(at.getUTCMonth()<d.getUTCMonth()||(at.getUTCMonth()===d.getUTCMonth()&&at.getUTCDate()<d.getUTCDate()))y--;return y}
  function ageBounds(row){let min=Number.isFinite(Number(row?.age_min))?Number(row.age_min):null,max=Number.isFinite(Number(row?.age_max))?Number(row.age_max):null;const t=norm(row?.age_group||row?.age);if(min==null&&max==null&&t&&!/open|all ages|senior/.test(t)){let m=t.match(/^(\d+)$/);if(m)min=max=Number(m[1]);else if((m=t.match(/(\d+)\s*(?:-|to)\s*(\d+)/))){min=Number(m[1]);max=Number(m[2])}else if((m=t.match(/(?:under|u)\s*(\d+)|(\d+)\s*(?:and )?under/)))max=Number(m[1]||m[2]);else if((m=t.match(/(?:over)\s*(\d+)|(\d+)\s*(?:and )?over/)))min=Number(m[1]||m[2])}return{min,max}}
  function paraClass(ath,eventStroke){const s=stroke(eventStroke);return s==='Breaststroke'?text(ath?.current_sb_class):s==='IM'?text(ath?.current_sm_class):text(ath?.current_s_class)}
  function isPara(ath){return!!(ath?.current_s_class||ath?.current_sb_class||ath?.current_sm_class||/para|\bs\d|\bsb\d|\bsm\d/i.test(text(ath?.modifications)))}
  function classMatches(required,actual){const r=text(required).toUpperCase().replace(/\s/g,''),a=text(actual).toUpperCase().replace(/\s/g,'');if(!r)return!a;const m=r.match(/^(S|SB|SM)(\d+)(?:-(\d+))?$/),n=a.match(/^(S|SB|SM)(\d+)$/);return!!(m&&n&&m[1]===n[1]&&Number(n[2])>=Number(m[2])&&Number(n[2])<=Number(m[3]||m[2]))}
  const eventOf=row=>({course:course(row?.course||row?.pool_course),distance:num(row?.distance??row?.event_distance??row?.distance_m),stroke:stroke(row?.stroke||row?.event_stroke)});
  const label=row=>text(row?.programme||row?.standard_name||row?.record_scope||row?.name||'Loaded standard');
  const gap=(result,target)=>({seconds:Math.max(0,result-target),percentage:target>0?Math.max(0,(result-target)/target*100):0,achieved:result<=target});

  class StandardsRecords{
    constructor({standards=[],baseTimes=[],today=()=>new Date().toISOString().slice(0,10)}={}){this.standards=clone(standards||[]);this.baseTimes=clone(baseTimes||[]);this.today=today}
    list({kind:kindWanted='',activeOnly=true}={}){return clone(this.standards.filter(x=>!activeOnly||active(x)).filter(x=>!kindWanted||kind(x)===kindWanted))}
    classificationStatus(athlete,event={}){if(!isPara(athlete))return{status:'not_para',classification:null};const c=paraClass(athlete,event.stroke);return c?{status:'ok',classification:c}:{status:'classification_needed',classification:null}}
    matches(row,athlete,event,{asOfDate=''}={}){
      if(!active(row)||!athlete)return false;const e=eventOf(row),want=eventOf(event);if(e.distance!==want.distance||e.stroke!==want.stroke)return false;if(e.course&&e.course!=='BOTH'&&e.course!==want.course)return false;
      const reqSex=sex(row.sex),actualSex=sex(athlete.sex);if(reqSex&&reqSex!=='OPEN'&&reqSex!==actualSex)return false;
      const required=text(row.para_class||row.classification),actualClass=paraClass(athlete,want.stroke);if(isPara(athlete)){if(!actualClass||!required||!classMatches(required,actualClass))return false}else if(required)return false;
      const {min,max}=ageBounds(row),atDate=row.age_date||row.meet_date||asOfDate||this.today(),a=age(athlete,atDate);if((min!=null||max!=null)&&a==null)return false;if(a!=null&&((min!=null&&a<min)||(max!=null&&a>max)))return false;return true;
    }
    forEvent(athlete,event,opts={}){return this.standards.filter(r=>this.matches(r,athlete,event,opts)).map(r=>({...clone(r),standard_kind:kind(r),label:label(r),standard_seconds:seconds(r)})).filter(r=>r.standard_seconds!==null)}
    baseTime(athlete,event){const e=eventOf(event);return clone(this.baseTimes.find(r=>active(r)&&course(r.course)===e.course&&num(r.distance??r.distance_m)===e.distance&&stroke(r.stroke)===e.stroke&&(!sex(r.sex)||sex(r.sex)==='OPEN'||sex(r.sex)===sex(athlete?.sex)))||null)}
    pointsForTime(athlete,event,timeSeconds,{explicitPoints=null,explicitParaPoints=null}={}){
      const t=num(timeSeconds);if(t===null||t<=0)return{value:null,label:isPara(athlete)?'World Para':'WA',source:'time missing'};
      if(isPara(athlete)){const p=num(explicitParaPoints??explicitPoints);if(p!==null&&p>0)return{value:Math.trunc(p),label:'World Para',source:'explicit result points'};const cls=this.classificationStatus(athlete,event);return{value:null,label:'World Para',source:cls.status==='classification_needed'?'classification required':'classification-specific point model required',classification:cls.classification};}
      const p=num(explicitPoints);if(p!==null&&p>0)return{value:Math.trunc(p),label:'WA',source:'explicit result points'};const base=this.baseTime(athlete,event),b=num(base?.base_seconds);if(b===null||b<=0)return{value:null,label:'WA',source:'base time not loaded'};return{value:Math.trunc(1000*Math.pow(b/t,3)),label:'WA',source:'loaded WA base time',baseSeconds:b};
    }
    points(athlete,event,result={}){return this.pointsForTime(athlete,event,result.result_seconds??result.pb_seconds??result.time_seconds,{explicitPoints:result.wa_points??result.world_aquatics_points??result.fina_points,explicitParaPoints:result.world_para_points??result.para_points})}
    pointSteps(athlete,event,result={},count=2){const pt=this.points(athlete,event,result);if(pt.label!=='WA'||!pt.value)return[];const base=pt.baseSeconds||num(this.baseTime(athlete,event)?.base_seconds);if(base===null)return[];const first=Math.ceil((pt.value+1)/25)*25,steps=[];for(let i=0;i<count;i++){const points=first+i*25,sec=base/Math.cbrt(points/1000);steps.push({points,seconds:sec,label:`${points} WA`})}return steps}
    statusForResult(athlete,event,resultSeconds,opts={}){const t=num(resultSeconds);if(t===null||t<=0)return{status:'missing_time',matched:[],achieved:[],next:null,records:[],qualifying:[],benchmarks:[]};const matched=this.forEvent(athlete,event,opts).map(r=>({...r,gap:gap(t,r.standard_seconds),points:this.pointsForTime(athlete,event,r.standard_seconds,{explicitPoints:r.wa_points??r.world_aquatics_points??r.fina_points,explicitParaPoints:r.world_para_points??r.para_points})}));const achieved=matched.filter(x=>x.gap.achieved),unachieved=matched.filter(x=>!x.gap.achieved).sort((a,b)=>a.gap.percentage-b.gap.percentage||b.standard_seconds-a.standard_seconds);return{status:'ok',matched,achieved,next:unachieved[0]||null,records:matched.filter(x=>x.standard_kind==='record'),qualifying:matched.filter(x=>x.standard_kind==='qualifying'),benchmarks:matched.filter(x=>x.standard_kind==='benchmark'),pathway:matched.filter(x=>x.standard_kind==='pathway')};}
    milestones(athlete,event,result={},opts={}){const t=num(result.result_seconds??result.pb_seconds??result.time_seconds),current=this.points(athlete,event,result),status=this.statusForResult(athlete,event,t,opts);if(status.status!=='ok')return{status:status.status,current,steps:[]};const real=status.matched.map(r=>({type:r.standard_kind,id:r.id,label:r.label,seconds:r.standard_seconds,points:r.points.value,points_label:r.points.label,achieved:r.gap.achieved,gap:r.gap,source:'loaded standard'}));const synthetic=this.pointSteps(athlete,event,result,Number(opts.pointStepCount)||3).map(s=>({type:'points_step',id:`points-${s.points}`,label:s.label,seconds:s.seconds,points:s.points,points_label:'WA',achieved:false,source:'25-point progression'}));const all=[...real,...synthetic];all.sort((a,b)=>{const ap=num(a.points),bp=num(b.points);if(ap!==null&&bp!==null)return ap-bp;if(ap!==null)return-1;if(bp!==null)return 1;return b.seconds-a.seconds});return{status:'ok',current,steps:all};}
    snapshot(){return{version:VERSION,standards:clone(this.standards),baseTimes:clone(this.baseTimes)}}
  }
  const create=options=>new StandardsRecords(options);
  return{VERSION,create,StandardsRecords,course,stroke,sex,kind,active,age,ageBounds,paraClass,isPara,classMatches,eventOf,seconds,label,gap};
});
