'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOSAssemblyDataLoader=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').trim();
  async function fetchJson(fetchImpl,url){if(typeof fetchImpl!=='function')throw new Error('Data loader requires fetch implementation');const response=await fetchImpl(url,{cache:'no-cache'});if(!response||!response.ok)throw new Error(`Resource request failed ${response?.status||''} ${text(url)}`.trim());return response.json()}
  async function loadCalendar({fetchImpl,cache,url='../monthly_calendar.json',cacheName='monthly_calendar'}={}){
    let networkError=null;
    try{
      const value=await fetchJson(fetchImpl,url);if(!value||!Array.isArray(value.dates))throw new Error('Calendar resource is missing dates array');const saved=cache?.put?cache.put(cacheName,value,{source:url}):null;return{value:clone(value),source:'network',cachedAt:saved?.savedAt||null,warning:null};
    }catch(error){networkError=error}
    const cached=cache?.get?cache.get(cacheName):null;if(cached?.value&&Array.isArray(cached.value.dates))return{value:clone(cached.value),source:'cache',cachedAt:cached.savedAt||null,warning:`Using cached calendar: ${networkError.message}`};
    throw new Error(`Calendar unavailable and no safe cached copy exists: ${networkError?.message||'unknown error'}`)
  }
  return{VERSION,fetchJson,loadCalendar};
});
