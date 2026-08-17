'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.Timing=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const SCHEMA='msos.timing.v1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const nowIso=()=>new Date().toISOString();
  const nowMs=()=>Date.now();
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(x=>text(x).toLowerCase()).join('|'))}`;
  function blankState(){return{schema:SCHEMA,heats:[],updatedAt:null}}
  function normalizeState(raw){const s=raw&&typeof raw==='object'?clone(raw):blankState();s.schema=SCHEMA;if(!Array.isArray(s.heats))s.heats=[];return s}
  class MemoryStorage{constructor(initial=null){this.value=initial==null?null:clone(initial);this.reads=0;this.writes=0}load(){this.reads++;return clone(this.value)}save(value){this.writes++;this.value=clone(value);return true}}
  function sessionContext(session,{blockId=null,itemId=null}={}){if(!session?.id)throw new Error('Timing requires exact session id');return{session_id:session.id,block_id:blockId||null,item_id:itemId||null}}
  function elapsed(startMs,endMs){const a=num(startMs),b=num(endMs);if(a===null||b===null||b<a)throw new Error('Invalid stopwatch timestamp');return(b-a)/1000}

  class Timing{
    constructor({storage,evidence,clockIso=nowIso,clockMs=nowMs}={}){if(!storage||typeof storage.load!=='function'||typeof storage.save!=='function')throw new Error('Timing Engine requires storage adapter');if(!evidence||typeof evidence.resolveAthlete!=='function')throw new Error('Timing Engine requires Evidence Retrieval for athlete identity');this.storage=storage;this.evidence=evidence;this.clockIso=clockIso;this.clockMs=clockMs;this.state=normalizeState(storage.load())}
    snapshot(){return clone(this.state)}
    persist(){this.state.updatedAt=this.clockIso();this.storage.save(this.state);return this.snapshot()}
    athlete(ref){return this.evidence.resolveAthlete(ref)}
    heat(id){return clone(this.state.heats.find(x=>x.id===id)||null)}
    begin(session,{blockId=null,itemId=null,athleteIds=[],typeKey='timed_set',distance=null,stroke='',course='',label='',startMs=null,id=null}={}){
      const ctx=sessionContext(session,{blockId,itemId}),athletes=[];for(const ref of athleteIds||[]){const a=this.athlete(ref);if(!a)throw new Error(`Athlete not found: ${ref}`);if(!athletes.some(x=>x.id===a.id))athletes.push(a)}if(!athletes.length)throw new Error('Timing heat requires at least one swimmer');const startedMs=num(startMs)??this.clockMs(),startedAt=this.clockIso(),heatId=id||stable('heat',ctx.session_id,ctx.block_id||'',ctx.item_id||'',typeKey,startedAt,athletes.map(x=>x.id).join('+'));
      if(this.state.heats.some(x=>x.id===heatId))throw new Error(`Timing heat already exists: ${heatId}`);const heat={id:heatId,...ctx,type_key:text(typeKey)||'timed_set',distance:num(distance),stroke:text(stroke),course:text(course||session?.identity?.course).toUpperCase(),label:text(label),started_at:startedAt,started_ms:startedMs,status:'running',athletes:athletes.map(a=>({athlete_id:a.id,status:'running',laps:[],finished_ms:null,finished_at:null,result_seconds:null})),created_at:startedAt,updated_at:startedAt};this.state.heats.push(heat);this.persist();return clone(heat);
    }
    _mutate(heatId,athleteRef,fn){const hi=this.state.heats.findIndex(x=>x.id===heatId);if(hi<0)throw new Error(`Timing heat not found: ${heatId}`);const heat=this.state.heats[hi],ath=this.athlete(athleteRef);if(!ath)throw new Error(`Athlete not found: ${athleteRef}`);const ai=heat.athletes.findIndex(x=>x.athlete_id===ath.id);if(ai<0)throw new Error(`${ath.full_name} is not in timing heat`);fn(heat,heat.athletes[ai],ath);heat.updated_at=this.clockIso();if(heat.athletes.every(x=>x.status==='finished'||x.status==='dns'||x.status==='retired'))heat.status='finished';this.persist();return clone(heat)}
    lap(heatId,athleteRef,{atMs=null,label=''}={}){return this._mutate(heatId,athleteRef,(heat,row)=>{if(row.status!=='running')throw new Error('Cannot add lap after swimmer is finished');const ms=num(atMs)??this.clockMs(),seconds=elapsed(heat.started_ms,ms),previous=row.laps.at(-1)?.elapsed_seconds||0;if(seconds<previous)throw new Error('Lap time cannot go backwards');row.laps.push({index:row.laps.length+1,at_ms:ms,elapsed_seconds:seconds,split_seconds:seconds-previous,label:text(label),at:this.clockIso()})})}
    finish(heatId,athleteRef,{atMs=null}={}){return this._mutate(heatId,athleteRef,(heat,row)=>{if(row.status!=='running')throw new Error('Swimmer is not running');const ms=num(atMs)??this.clockMs(),seconds=elapsed(heat.started_ms,ms),previous=row.laps.at(-1)?.elapsed_seconds||0;row.finished_ms=ms;row.finished_at=this.clockIso();row.result_seconds=seconds;row.status='finished';row.finish_split_seconds=seconds-previous})}
    markDns(heatId,athleteRef,{note=''}={}){return this._mutate(heatId,athleteRef,(_heat,row)=>{if(row.status!=='running')throw new Error('Swimmer is not running');row.status='dns';row.note=text(note)})}
    result(heatId,athleteRef){const heat=this.heat(heatId),ath=this.athlete(athleteRef);if(!heat||!ath)return null;const row=heat.athletes.find(x=>x.athlete_id===ath.id);if(!row)return null;return{heat_id:heat.id,session_id:heat.session_id,block_id:heat.block_id,item_id:heat.item_id,athlete_id:ath.id,type_key:heat.type_key,distance:heat.distance,stroke:heat.stroke,pool_course:heat.course,status:row.status,result_seconds:num(row.result_seconds),laps:clone(row.laps||[]),started_at:heat.started_at,finished_at:row.finished_at||null,label:heat.label}}
    trainingTestResult(heatId,athleteRef){const r=this.result(heatId,athleteRef);if(!r||r.status!=='finished'||!/^t400(?:_|$)/i.test(r.type_key)||r.result_seconds===null)return null;return{id:stable('training-test-result',r.heat_id,r.athlete_id),athlete_id:r.athlete_id,test_key:r.type_key,result_seconds:r.result_seconds,result_date:text(r.finished_at).slice(0,10),pool_course:r.pool_course,valid_for_anchor:true,source:'MSOS Timing Engine',source_heat_id:r.heat_id,source_session_id:r.session_id,source_block_id:r.block_id,source_item_id:r.item_id}}
    results(heatId){const h=this.heat(heatId);if(!h)return[];return h.athletes.map(x=>this.result(heatId,x.athlete_id))}
    active(){return clone(this.state.heats.filter(x=>x.status==='running'))}
  }
  const create=options=>new Timing(options);
  return{VERSION,SCHEMA,create,Timing,MemoryStorage,blankState,normalizeState,sessionContext,elapsed};
});
