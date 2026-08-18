'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOSAssemblyProgrammeData=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const CACHE_NAME='programme_data';
  const LEGACY_CONTEXT_KEYS=Object.freeze({auth:'mclay_swimming_v1_auth',v4:'mclay_swimming_os_v4',v1:'mclay_swimming_os_v1'});
  const REQUIRED_TABLES=Object.freeze(['athletes','training_test_types','training_test_results']);
  const OPTIONAL_ORG_TABLES=Object.freeze(['athlete_adaptation_profiles','coach_results','results_pb_board','results_event_history']);
  const OPTIONAL_REFERENCE_TABLES=Object.freeze(['pathway_standards','world_aquatics_base_times']);
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').trim();
  const safeJson=raw=>{try{return raw?JSON.parse(raw):null}catch{return null}};
  const networkError=e=>e instanceof TypeError||/failed to fetch|networkerror|network request failed|offline/i.test(text(e?.message));
  function readStored(storage,key){if(!storage||typeof storage.getItem!=='function')return null;return safeJson(storage.getItem(key))}
  function contextFrom({storage,config={}}={}){
    const auth=readStored(storage,LEGACY_CONTEXT_KEYS.auth)||{},v4=readStored(storage,LEGACY_CONTEXT_KEYS.v4)||{},v1=readStored(storage,LEGACY_CONTEXT_KEYS.v1)||{},meta=auth?.user?.user_metadata||{};
    const organisationId=text(v4?.settings?.organisationId||v4?.settings?.organisation_id||v1?.settings?.organisation_id||v1?.settings?.organisationId||meta.organisation_id||meta.organisationId);
    return{url:text(config?.supabaseUrl),anonKey:text(config?.supabaseAnonKey),accessToken:text(auth?.access_token),organisationId};
  }
  function publicContext(ctx={}){return{organisationId:text(ctx.organisationId),authenticated:!!text(ctx.accessToken),configured:!!(text(ctx.url)&&text(ctx.anonKey))}}
  function assertReadContext(ctx){const missing=[];if(!text(ctx?.url))missing.push('Supabase URL');if(!text(ctx?.anonKey))missing.push('Supabase publishable key');if(!text(ctx?.accessToken))missing.push('signed-in access token');if(!text(ctx?.organisationId))missing.push('organisation');if(missing.length)throw new Error(`Programme cloud read unavailable: missing ${missing.join(', ')}`);return ctx}
  function encode(v){return encodeURIComponent(text(v))}
  class SupabaseReadClient{
    constructor({fetchImpl,context,pageSize=1000,maxRows=10000}={}){if(typeof fetchImpl!=='function')throw new Error('Programme data adapter requires fetch implementation');this.fetchImpl=fetchImpl;this.context=assertReadContext(context);this.pageSize=Math.max(1,Number(pageSize)||1000);this.maxRows=Math.max(this.pageSize,Number(maxRows)||10000)}
    headers(){return{apikey:this.context.anonKey,Authorization:`Bearer ${this.context.accessToken}`}}
    async get(path){const url=this.context.url.replace(/\/$/,'')+path,r=await this.fetchImpl(url,{method:'GET',headers:this.headers()});if(!r?.ok){let message='';try{const body=await r.json();message=text(body?.message||body?.error||body?.msg)}catch{}const e=new Error(message||`Programme cloud read failed (${r?.status||'network'})`);e.status=r?.status;throw e}return r.json()}
    async pages(path){const rows=[];for(let offset=0;offset<this.maxRows;offset+=this.pageSize){const sep=path.includes('?')?'&':'?',page=await this.get(`${path}${sep}offset=${offset}&limit=${this.pageSize}`),chunk=Array.isArray(page)?page:[];rows.push(...chunk);if(chunk.length<this.pageSize)return rows}throw new Error(`Programme cloud read exceeded safe row limit ${this.maxRows}`)}
    orgTable(table){return this.pages(`/rest/v1/${table}?select=*&organisation_id=eq.${encode(this.context.organisationId)}`)}
    referenceTable(table){if(table==='pathway_standards')return this.pages('/rest/v1/pathway_standards?select=*&active=eq.true&order=progression_order.asc,id.asc');if(table==='world_aquatics_base_times')return this.pages('/rest/v1/world_aquatics_base_times?select=*&active=eq.true');throw new Error(`Unknown programme reference table: ${table}`)}
  }
  function emptyTables(){const out={};for(const k of [...REQUIRED_TABLES,...OPTIONAL_ORG_TABLES,...OPTIONAL_REFERENCE_TABLES])out[k]=[];return out}
  function validSnapshot(value){return!!value&&typeof value==='object'&&REQUIRED_TABLES.every(k=>Array.isArray(value.tables?.[k]))}
  function snapshotToOutput(value,{source='cache',warning=''}={}){
    const tables=clone(value.tables||{}),evidenceData={athletes:tables.athletes||[],training_test_types:tables.training_test_types||[],training_test_results:tables.training_test_results||[],coach_results:tables.coach_results||[],results_pb_board:tables.results_pb_board||[],results_event_history:tables.results_event_history||[]};
    return{source,warning:text(warning),organisationId:text(value.organisationId),loadedAt:text(value.loadedAt),evidenceSources:[{id:'supabase-programme',priority:100,trust:source==='network'?'current':'verified',data:evidenceData}],profiles:clone(tables.athlete_adaptation_profiles||[]),standards:clone(tables.pathway_standards||[]),baseTimes:clone(tables.world_aquatics_base_times||[]),counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,Array.isArray(v)?v.length:0])),errors:clone(value.errors||{})};
  }
  function cached(cache){try{const row=cache?.get?.(CACHE_NAME);return row&&validSnapshot(row.value)?row:null}catch{return null}}
  async function loadProgrammeData({fetchImpl,cache,storage,config={},clock=()=>new Date().toISOString(),pageSize=1000,maxRows=10000}={}){
    const ctx=contextFrom({storage,config}),cachedRow=cached(cache);
    try{assertReadContext(ctx)}catch(error){if(cachedRow)return snapshotToOutput(cachedRow.value,{source:'cache',warning:`${error.message}. Using cached swimmer/performance data from ${text(cachedRow.savedAt||cachedRow.value.loadedAt)||'an earlier load'}.`});throw new Error(`${error.message}; no safe cached programme data is available`)}
    const client=new SupabaseReadClient({fetchImpl,context:ctx,pageSize,maxRows}),tables=emptyTables(),errors={};
    try{for(const table of REQUIRED_TABLES)tables[table]=await client.orgTable(table)}catch(error){if(cachedRow&&(networkError(error)||Number(error?.status)>=500))return snapshotToOutput(cachedRow.value,{source:'cache',warning:`Programme cloud read failed (${error.message}). Using cached swimmer/performance data.`});throw error}
    for(const table of OPTIONAL_ORG_TABLES){try{tables[table]=await client.orgTable(table)}catch(error){errors[table]=error.message}}
    for(const table of OPTIONAL_REFERENCE_TABLES){try{tables[table]=await client.referenceTable(table)}catch(error){errors[table]=error.message}}
    const value={schema:'msos.assembly.programme-data.v1',organisationId:ctx.organisationId,loadedAt:clock(),tables,errors};
    cache?.put?.(CACHE_NAME,value,{source:'supabase-read-only',savedAt:value.loadedAt});
    const failed=Object.keys(errors),warning=failed.length?`Core swimmer/test data loaded. Optional programme source(s) unavailable: ${failed.join(', ')}.`:'';
    return snapshotToOutput(value,{source:'network',warning});
  }
  return{VERSION,CACHE_NAME,LEGACY_CONTEXT_KEYS,REQUIRED_TABLES,OPTIONAL_ORG_TABLES,OPTIONAL_REFERENCE_TABLES,SupabaseReadClient,contextFrom,publicContext,assertReadContext,validSnapshot,snapshotToOutput,loadProgrammeData,networkError};
});
