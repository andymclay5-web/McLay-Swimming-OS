'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.EvidenceRetrieval=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='2.1.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const TRUST={unknown:0,fallback:1,legacy:2,verified:3,current:3,official:4};
  const trustRank=v=>TRUST[text(v).toLowerCase()]??0;
  const sourceRows=(source,...names)=>{for(const n of names){const x=source?.data?.[n]??source?.[n];if(Array.isArray(x))return x}return[]};
  const resultSeconds=row=>num(row?.result_seconds??row?.time_seconds??row?.seconds??row?.result_time_seconds??row?.pb_seconds??row?.best_time_seconds);
  const resultDate=row=>text(row?.result_date||row?.date||row?.result_at||row?.achieved_at||row?.created_at);
  const course=row=>text(row?.pool_course||row?.course).toUpperCase();
  const distance=row=>num(row?.distance??row?.event_distance);
  function stroke(v){const s=text(v).toLowerCase();if(!s)return'';if(/^(?:free|freestyle|fr)$/.test(s))return'Freestyle';if(/^(?:back|backstroke|bk)$/.test(s))return'Backstroke';if(/^(?:breast|breaststroke|br)$/.test(s))return'Breaststroke';if(/^(?:fly|butterfly)$/.test(s))return'Butterfly';if(/^(?:im|medley|individual medley)$/.test(s))return'IM';return text(v)}
  const rowStroke=row=>stroke(row?.stroke||row?.event_stroke||row?.metadata?.stroke||'');
  const sourceMeta=s=>({id:text(s.id)||'source',priority:Number(s.priority)||0,trust:text(s.trust)||'unknown'});
  function stronger(a,b){if(!a)return b;if(!b)return a;const ap=Number(a._evidence?.priority)||0,bp=Number(b._evidence?.priority)||0;if(bp!==ap)return bp>ap?b:a;const at=trustRank(a._evidence?.trust),bt=trustRank(b._evidence?.trust);return bt>at?b:a}
  function mergeProvenance(winner,loser){const out=clone(winner),sources=new Set([...(winner?._evidence?.sources||[]),...(loser?._evidence?.sources||[])]);out._evidence={...(out._evidence||{}),sources:[...sources]};return out}
  function withEvidence(row,source,canonicalAthleteId=null){const m=sourceMeta(source);return{...clone(row),...(canonicalAthleteId?{athlete_id:canonicalAthleteId}:{}),_evidence:{source:m.id,sources:[m.id],priority:m.priority,trust:m.trust}}}
  function eventKey(row){return`${row.athlete_id}|${distance(row)??''}|${rowStroke(row)}|${course(row)}|${resultDate(row)}|${resultSeconds(row)??''}`}
  function testKeyFor(typeMap,sourceId,row){return text(row?.test_key||typeMap.get(`${sourceId}|${row?.test_type_id}`)||row?.metadata?.test_key)}
  function testFactKey(row){return`${row.athlete_id}|${text(row._testKey)}|${resultDate(row)}|${resultSeconds(row)??''}|${course(row)}|${rowStroke(row)}`}
  function conversionKey(row){return`${text(row.from).toUpperCase()}|${text(row.to).toUpperCase()}|${distance(row)??''}|${stroke(row.stroke)}|${num(row.seconds)??''}`}

  class EvidenceIndex{
    constructor({sources=[],entities}={}){
      if(!entities||typeof entities.resolveAthlete!=='function'||typeof entities.athleteId!=='function'||typeof entities.sourceAthleteId!=='function'||typeof entities.listAthletes!=='function')throw new Error('Evidence Retrieval requires injected Entity Registry contract');
      this.entities=entities;this.sources=[];this.rebuild(sources);
    }
    rebuild(sources=[]){this.sources=(sources||[]).map((s,i)=>({...clone(s),id:text(s.id)||`source-${i+1}`,priority:Number(s.priority)||0,trust:text(s.trust)||'unknown'})).sort((a,b)=>b.priority-a.priority||trustRank(b.trust)-trustRank(a.trust));this._build();return this}
    _build(){
      const resolveRowAthlete=(s,row)=>{const rid=text(row?.athlete_id);if(rid){const bySource=this.entities.sourceAthleteId(s.id,rid);if(bySource)return bySource;const byId=this.entities.athleteId(rid);if(byId)return byId}const name=text(row?.athlete_name||row?.full_name||row?.name);return name?this.entities.athleteId(name):null};
      const typeMap=new Map(),typeRows=new Map();for(const s of this.sources){for(const raw of sourceRows(s,'trainingTestTypes','training_test_types')){if(!raw)continue;const tk=text(raw.test_key||raw.key||raw.name),rid=text(raw.id);if(rid)typeMap.set(`${s.id}|${rid}`,tk);const k=tk||rid;if(!k)continue;const row=withEvidence(raw,s),existing=typeRows.get(k),winner=stronger(existing,row);typeRows.set(k,mergeProvenance(winner,winner===row?existing:row))}}
      this.trainingTestTypes=[...typeRows.values()];this._typeMap=typeMap;
      const testRows=new Map();for(const s of this.sources){for(const raw of sourceRows(s,'trainingTestResults','training_test_results')){if(!raw)continue;const aid=resolveRowAthlete(s,raw);if(!aid)continue;const row=withEvidence(raw,s,aid);row._testKey=testKeyFor(typeMap,s.id,raw);const k=testFactKey(row),existing=testRows.get(k),winner=stronger(existing,row);testRows.set(k,mergeProvenance(winner,winner===row?existing:row))}}this.trainingTestResults=[...testRows.values()];
      const raceRows=new Map();for(const s of this.sources){for(const [kind,names] of [['coach_result',['coachResults','coach_results']],['event_history',['resultsEventHistory','results_event_history']],['pb_board',['resultsPbBoard','results_pb_board']],['timed_result',['timedResults','timed_results']]]){for(const raw of sourceRows(s,...names)){if(!raw)continue;const aid=resolveRowAthlete(s,raw);if(!aid)continue;const row=withEvidence(raw,s,aid);row._resultKind=kind;const k=eventKey(row),existing=raceRows.get(k),winner=stronger(existing,row);raceRows.set(k,mergeProvenance(winner,winner===row?existing:row))}}}this.raceResults=[...raceRows.values()];
      const conv=new Map();for(const s of this.sources){for(const raw of sourceRows(s,'courseConversions','course_conversions')){const row=withEvidence(raw,s),k=conversionKey(row),existing=conv.get(k),winner=stronger(existing,row);conv.set(k,mergeProvenance(winner,winner===row?existing:row))}}this.courseConversions=[...conv.values()];
    }
    resolveAthlete(ref){return this.entities.resolveAthlete(ref)}
    athleteId(ref){return this.entities.athleteId(ref)}
    listAthletes(opts={}){return this.entities.listAthletes(opts)}
    provenance(row){return clone(row?._evidence||null)}
    trainingTests(athleteRef,{testKey='',course:poolCourse='',stroke:strokeWanted='',validOnly=false}={}){const aid=this.athleteId(athleteRef)||text(athleteRef);if(!aid)return[];const tk=text(testKey).toLowerCase(),pc=text(poolCourse).toUpperCase(),st=stroke(strokeWanted);return clone(this.trainingTestResults.filter(r=>r.athlete_id===aid).filter(r=>!tk||text(r._testKey).toLowerCase()===tk).filter(r=>!pc||!course(r)||course(r)===pc).filter(r=>!st||!rowStroke(r)||rowStroke(r)===st).filter(r=>!validOnly||r.valid_for_anchor!==false))}
    latestTrainingTest(athleteRef,opts={}){const rows=this.trainingTests(athleteRef,{...opts,validOnly:opts.validOnly!==false}).filter(r=>resultSeconds(r)!==null);rows.sort((a,b)=>resultDate(b).localeCompare(resultDate(a))||(Number(b._evidence?.priority)||0)-(Number(a._evidence?.priority)||0)||trustRank(b._evidence?.trust)-trustRank(a._evidence?.trust));return rows[0]||null}
    fastestTrainingTest(athleteRef,opts={}){const rows=this.trainingTests(athleteRef,{...opts,validOnly:opts.validOnly!==false}).filter(r=>resultSeconds(r)!==null);rows.sort((a,b)=>resultSeconds(a)-resultSeconds(b)||resultDate(b).localeCompare(resultDate(a)));return rows[0]||null}
    latestTrainingTestEvidence(athleteRef,opts={}){const row=this.latestTrainingTest(athleteRef,opts);return row?{status:'ok',row,seconds:resultSeconds(row),date:resultDate(row),source:clone(row._evidence)}:{status:'missing',row:null,message:`No ${text(opts.testKey)||'matching training test'} evidence`}}
    results(athleteRef,{distance:eventDistance=null,stroke:strokeWanted='',course:poolCourse='',kind=''}={}){const aid=this.athleteId(athleteRef)||text(athleteRef);if(!aid)return[];const d=num(eventDistance),st=stroke(strokeWanted),pc=text(poolCourse).toUpperCase(),rk=text(kind);return clone(this.raceResults.filter(r=>r.athlete_id===aid).filter(r=>d===null||distance(r)===d).filter(r=>!st||!rowStroke(r)||rowStroke(r)===st).filter(r=>!pc||!course(r)||course(r)===pc).filter(r=>!rk||r._resultKind===rk))}
    personalBest(athleteRef,opts={}){const rows=this.results(athleteRef,opts).filter(r=>resultSeconds(r)!==null);rows.sort((a,b)=>resultSeconds(a)-resultSeconds(b)||resultDate(b).localeCompare(resultDate(a))||(Number(b._evidence?.priority)||0)-(Number(a._evidence?.priority)||0));return rows[0]||null}
    personalBestEvidence(athleteRef,opts={}){const row=this.personalBest(athleteRef,opts);return row?{status:'ok',row,seconds:resultSeconds(row),date:resultDate(row),source:clone(row._evidence)}:{status:'missing',row:null,message:'No matching PB evidence'}}
    conversion({from,to,distance:eventDistance,stroke:strokeWanted}={}){const f=text(from).toUpperCase(),t=text(to).toUpperCase(),d=num(eventDistance),st=stroke(strokeWanted);return clone(this.courseConversions.filter(r=>text(r.from).toUpperCase()===f&&text(r.to).toUpperCase()===t&&distance(r)===d&&stroke(r.stroke)===st).sort((a,b)=>(Number(b._evidence?.priority)||0)-(Number(a._evidence?.priority)||0))[0]||null)}
    stats(){return{sources:this.sources.length,athletes:this.entities.listAthletes().length,trainingTests:this.trainingTestResults.length,raceResults:this.raceResults.length,courseConversions:this.courseConversions.length}}
  }
  const create=options=>new EvidenceIndex(options);
  return{VERSION,create,EvidenceIndex,resultSeconds,resultDate,course,distance,stroke,rowStroke};
});
