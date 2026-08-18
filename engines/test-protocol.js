'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.TestProtocol=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const SCHEMA='msos.test-protocol.v1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const lower=v=>text(v).toLowerCase();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const nowDefault=()=>new Date().toISOString();
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(x=>text(x).toLowerCase()).join('|'))}`;
  function stroke(v){const s=lower(v);if(!s)return'';if(/^(free|freestyle|fr)$/.test(s))return'Freestyle';if(/^(back|backstroke|bk)$/.test(s))return'Backstroke';if(/^(breast|breaststroke|br)$/.test(s))return'Breaststroke';if(/^(fly|butterfly)$/.test(s))return'Butterfly';if(/^(im|medley|individual medley)$/.test(s))return'IM';return text(v)}
  const DEFAULT_T400=Object.freeze({id:'protocol-t400-freestyle',test_key:'t400_freestyle',name:'T400 Freestyle',discipline:'pool_swimming',distance_m:400,stroke:'Freestyle',allowed_courses:['SCM','LCM'],pool_lengths_by_course:{SCM:25,LCM:50},required_fields:['elapsed_seconds','course'],optional_fields:['splits','notes'],downstream_roles:['training_target_anchor'],active:true,protocol_version:1});
  function blankState(protocols=[]){return{schema:SCHEMA,protocols:[clone(DEFAULT_T400),...clone(protocols||[]).filter(x=>text(x?.id)!==DEFAULT_T400.id)],journal:[],updatedAt:null}}
  function normalizeState(raw,protocols=[]){const s=raw&&typeof raw==='object'?clone(raw):blankState(protocols);s.schema=SCHEMA;if(!Array.isArray(s.protocols))s.protocols=blankState(protocols).protocols;if(!Array.isArray(s.journal))s.journal=[];if(!s.protocols.some(x=>x.id===DEFAULT_T400.id))s.protocols.unshift(clone(DEFAULT_T400));return s}
  class MemoryStorage{constructor(initial=null){this.value=initial==null?null:clone(initial);this.reads=0;this.writes=0}load(){this.reads++;return clone(this.value)}save(v){this.writes++;this.value=clone(v);return true}}
  function normalizeProtocol(row={},before=null){
    const id=text(row.id||before?.id),key=text(row.test_key||row.testKey||before?.test_key);if(!id)throw new Error('Test protocol requires id');if(!key)throw new Error('Test protocol requires test_key');const d=num(row.distance_m??row.distance??before?.distance_m);if(d===null||d<=0)throw new Error('Test protocol requires positive distance_m');const st=stroke(row.stroke??before?.stroke);if(!st)throw new Error('Test protocol requires stroke');const courses=[...(row.allowed_courses??row.allowedCourses??before?.allowed_courses??[])].map(x=>text(x).toUpperCase()).filter(Boolean);if(!courses.length)throw new Error('Test protocol requires at least one allowed course');
    return{id,test_key:key,name:text(row.name||before?.name||key),discipline:text(row.discipline||before?.discipline||'pool_swimming'),distance_m:d,stroke:st,allowed_courses:[...new Set(courses)],pool_lengths_by_course:clone(row.pool_lengths_by_course??row.poolLengthsByCourse??before?.pool_lengths_by_course??{}),required_fields:clone(row.required_fields??row.requiredFields??before?.required_fields??['elapsed_seconds','course']),optional_fields:clone(row.optional_fields??row.optionalFields??before?.optional_fields??[]),downstream_roles:clone(row.downstream_roles??row.downstreamRoles??before?.downstream_roles??[]),notes:text(row.notes??before?.notes),active:row.active===undefined?(before?.active!==false):row.active!==false,protocol_version:Number(row.protocol_version??row.protocolVersion??before?.protocol_version??1)||1};
  }
  function normalizeSplits(raw=[]){return(raw||[]).map((x,i)=>({index:Number(x.index)||i+1,distance_m:num(x.distance_m??x.distance),elapsed_seconds:num(x.elapsed_seconds??x.elapsedSeconds),source:text(x.source)}))}

  class TestProtocolEngine{
    constructor({storage,protocols=[],clock=nowDefault}={}){if(!storage||typeof storage.load!=='function'||typeof storage.save!=='function')throw new Error('Test Protocol Engine requires storage adapter');this.storage=storage;this.clock=clock;this.state=normalizeState(storage.load(),protocols)}
    snapshot(){return clone(this.state)}
    persist(){this.state.updatedAt=this.clock();this.storage.save(this.state);return this.snapshot()}
    list({activeOnly=true}={}){return clone(this.state.protocols.filter(x=>!activeOnly||x.active!==false).sort((a,b)=>text(a.name).localeCompare(text(b.name))))}
    resolve(ref){const key=lower(typeof ref==='object'?(ref.id||ref.test_key||ref.testKey):ref);if(!key)return null;return clone(this.state.protocols.find(x=>lower(x.id)===key||lower(x.test_key)===key)||null)}
    requirements(ref){const p=this.resolve(ref);if(!p)return{status:'missing',protocol:null,message:'Test protocol not found'};return{status:p.active===false?'inactive':'ok',protocol:p,requiredFields:clone(p.required_fields||[]),optionalFields:clone(p.optional_fields||[]),distance:p.distance_m,stroke:p.stroke,allowedCourses:clone(p.allowed_courses||[]),poolLengthsByCourse:clone(p.pool_lengths_by_course||{}),downstreamRoles:clone(p.downstream_roles||[])}}
    validateObservation(ref,observation={}){
      const p=this.resolve(ref);if(!p)return{ok:false,status:'missing_protocol',protocol:null,reasons:['Test protocol not found'],normalized:null};const reasons=[];if(p.active===false)reasons.push('Protocol is inactive');const elapsed=num(observation.elapsed_seconds??observation.elapsedSeconds??observation.result_seconds),distance=num(observation.distance_m??observation.distance),course=text(observation.course||observation.pool_course).toUpperCase(),st=stroke(observation.stroke||p.stroke),poolLength=num(observation.pool_length_m??observation.poolLength),splits=normalizeSplits(observation.splits||[]);
      if(elapsed===null||elapsed<=0)reasons.push('Positive elapsed_seconds is required');if(distance===null)reasons.push('distance_m is required');else if(distance!==p.distance_m)reasons.push(`Distance must be ${p.distance_m}m`);if(!course)reasons.push('course is required');else if(!(p.allowed_courses||[]).includes(course))reasons.push(`Course ${course} is not allowed`);if(st!==p.stroke)reasons.push(`Stroke must be ${p.stroke}`);const expectedPool=num(p.pool_lengths_by_course?.[course]);if(poolLength!==null&&expectedPool!==null&&poolLength!==expectedPool)reasons.push(`Pool length for ${course} must be ${expectedPool}m`);
      let priorD=0,priorE=0;for(const s of splits){if(s.distance_m===null||s.distance_m<=priorD){reasons.push('Split distances must increase');break}if(s.elapsed_seconds===null||s.elapsed_seconds<=priorE){reasons.push('Split elapsed times must increase');break}if(distance!==null&&s.distance_m>distance){reasons.push('Split distance exceeds result distance');break}if(elapsed!==null&&s.elapsed_seconds>elapsed){reasons.push('Split elapsed time exceeds result time');break}priorD=s.distance_m;priorE=s.elapsed_seconds}
      return{ok:reasons.length===0,status:reasons.length?'invalid':'ok',protocol:p,reasons,normalized:{protocol_id:p.id,protocol_version:p.protocol_version,test_key:p.test_key,distance_m:distance,stroke:st,course,pool_length_m:poolLength,elapsed_seconds:elapsed,splits,notes:text(observation.notes||observation.note)}};
    }
    upsert(row,{coachId='',note=''}={}){const id=text(row?.id);if(!id)throw new Error('Test protocol requires id');const i=this.state.protocols.findIndex(x=>x.id===id),before=i>=0?clone(this.state.protocols[i]):null,next=normalizeProtocol(row,before),at=this.clock();if(before&&JSON.stringify({...before,protocol_version:undefined})!==JSON.stringify({...next,protocol_version:undefined})&&row.protocol_version===undefined&&row.protocolVersion===undefined)next.protocol_version=(Number(before.protocol_version)||1)+1;if(i>=0)this.state.protocols[i]=next;else this.state.protocols.push(next);this.state.journal.push({id:stable('protocol-event',id,i>=0?'update':'create',at),protocol_id:id,action:i>=0?'update':'create',at,coach_id:text(coachId),note:text(note),before,after:clone(next)});this.persist();return clone(next)}
    retire(ref,{coachId='',note=''}={}){const p=this.resolve(ref);if(!p)throw new Error(`Test protocol not found: ${ref}`);return this.upsert({...p,active:false},{coachId,note:note||'Retired'})}
    history(ref){const p=this.resolve(ref),id=p?.id||text(ref);return clone(this.state.journal.filter(x=>x.protocol_id===id).sort((a,b)=>text(a.at).localeCompare(text(b.at))))}
  }
  const create=options=>new TestProtocolEngine(options);
  return{VERSION,SCHEMA,DEFAULT_T400,create,TestProtocolEngine,MemoryStorage,blankState,normalizeState,normalizeProtocol,normalizeSplits,stroke};
});
