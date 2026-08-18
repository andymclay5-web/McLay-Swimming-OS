'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.Methodology=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const SCHEMA='msos.methodology.v1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const lower=v=>text(v).toLowerCase();
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(text(v))?text(v):'';
  const active=row=>row?.active!==false&&!['inactive','archived','superseded','draft'].includes(lower(row?.status||row?.version_status));
  const inRange=(d,start,end)=>!d||((!start||d>=start)&&(!end||d<=end));
  const isPlain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  function deepMerge(base,overlay){
    const out=clone(base)||{};for(const [k,v] of Object.entries(overlay||{})){if(['id','scope','club_id','clubId','coach_id','coachId','squad_id','squadId','athlete_id','athleteId','start_date','start','end_date','end','active','status','version_status','updated_at','updatedAt','name','label'].includes(k))continue;if(isPlain(v)&&isPlain(out[k]))out[k]=deepMerge(out[k],v);else out[k]=clone(v)}return out;
  }
  function scopeOf(row){const s=lower(row?.scope);if(s)return s;if(text(row?.athlete_id||row?.athleteId))return'athlete';if(text(row?.coach_id||row?.coachId))return'coach';if(text(row?.squad_id||row?.squadId))return'squad';if(text(row?.club_id||row?.clubId))return'club';return'programme'}
  const ORDER={programme:0,club:1,squad:2,coach:3,athlete:4};
  function rowMatches(row,ctx){if(!active(row))return false;const asOf=date(ctx.asOfDate),start=date(row.start_date||row.start),end=date(row.end_date||row.end);if(!inRange(asOf,start,end))return false;const scope=scopeOf(row);if(scope==='club'&&text(row.club_id||row.clubId)!==text(ctx.clubId))return false;if(scope==='squad'&&text(row.squad_id||row.squadId)!==text(ctx.squadId))return false;if(scope==='coach'&&text(row.coach_id||row.coachId)!==text(ctx.coachId))return false;if(scope==='athlete'&&text(row.athlete_id||row.athleteId)!==text(ctx.athleteId))return false;return true}
  function zoneKey(v){return lower(v).replace(/[^a-z0-9]+/g,'_')}

  class Methodology{
    constructor({models=[],entities=null}={}){this.models=clone(models||[]);this.entities=entities||null}
    context(input={}){
      const ctx={clubId:text(input.clubId),coachId:text(input.coachId),squadId:text(input.squadId),athleteId:text(input.athleteId),asOfDate:date(input.asOfDate)};
      if(this.entities&&ctx.athleteId){const dims=this.entities.dimensions?.(ctx.athleteId,{asOfDate:ctx.asOfDate});if(dims){if(!ctx.clubId)ctx.clubId=text(dims.clubId);if(!ctx.squadId&&dims.squadIds?.length===1)ctx.squadId=text(dims.squadIds[0])}}
      return ctx;
    }
    overlays(input={}){const ctx=this.context(input);return clone(this.models.filter(r=>rowMatches(r,ctx)).sort((a,b)=>(ORDER[scopeOf(a)]??99)-(ORDER[scopeOf(b)]??99)||text(a.updated_at||a.updatedAt).localeCompare(text(b.updated_at||b.updatedAt))))}
    resolve(input={}){
      const context=this.context(input),rows=this.overlays(context);let model={};for(const row of rows)model=deepMerge(model,row);
      return{schema:SCHEMA,version:VERSION,status:rows.length?'ok':'missing',context,model,applied:rows.map(r=>({id:text(r.id),name:text(r.name||r.label),scope:scopeOf(r),updatedAt:text(r.updated_at||r.updatedAt)})),sourceIds:rows.map(r=>text(r.id)).filter(Boolean)};
    }
    section(name,input={}){const r=this.resolve(input);return{status:r.status,context:r.context,value:clone(r.model?.[name]??null),applied:r.applied}}
    zone(name,input={}){const r=this.resolve(input),zones=r.model?.zones||{},wanted=zoneKey(name);let found=null;for(const [k,v] of Object.entries(zones))if(zoneKey(k)===wanted||zoneKey(v?.name)===wanted){found=v;break}return found?{status:'ok',zone:clone(found),context:r.context,applied:r.applied}:{status:'missing',zone:null,context:r.context,message:`Methodology zone not loaded: ${text(name)}`}}
    doseRules(input={}){return this.section('dose',input)}
    adaptationPrinciples(input={}){return this.section('adaptation',input)}
    raceModelPreferences(input={}){return this.section('raceModel',input)}
    sessionDesignPrinciples(input={}){return this.section('sessionDesign',input)}
    snapshot(){return{schema:SCHEMA,version:VERSION,models:clone(this.models)}}
  }
  const create=options=>new Methodology(options);
  return{VERSION,SCHEMA,ORDER,create,Methodology,deepMerge,scopeOf,rowMatches,zoneKey};
});
