'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOSAssemblyStorage=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').trim();
  class JsonStorageAdapter{
    constructor({storage,key}={}){if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')throw new Error('JsonStorageAdapter requires Web Storage contract');this.storage=storage;this.key=text(key);if(!this.key)throw new Error('JsonStorageAdapter requires key');this.lastError=null}
    load(){this.lastError=null;const raw=this.storage.getItem(this.key);if(raw==null||raw==='')return null;try{return clone(JSON.parse(raw))}catch(error){this.lastError={operation:'load',key:this.key,message:error.message};throw new Error(`Stored MSOS state is unreadable for ${this.key}: ${error.message}`)}}
    save(value){this.lastError=null;try{this.storage.setItem(this.key,JSON.stringify(value));return true}catch(error){this.lastError={operation:'save',key:this.key,message:error.message};throw new Error(`MSOS local save failed for ${this.key}: ${error.message}`)}}
    clear(){this.lastError=null;try{this.storage.removeItem(this.key);return true}catch(error){this.lastError={operation:'clear',key:this.key,message:error.message};throw new Error(`MSOS local clear failed for ${this.key}: ${error.message}`)}}
    status(){return{key:this.key,ok:!this.lastError,error:clone(this.lastError)}}
  }
  class ResourceCache{
    constructor({storage,key='msos.assembly.resources.v1'}={}){this.adapter=new JsonStorageAdapter({storage,key})}
    get(name){const state=this.adapter.load()||{resources:{}};return clone(state.resources?.[text(name)]||null)}
    put(name,value,{source='',savedAt=new Date().toISOString()}={}){const state=this.adapter.load()||{schema:'msos.resource-cache.v1',resources:{}};state.resources=state.resources||{};state.resources[text(name)]={value:clone(value),source:text(source),savedAt:text(savedAt)};this.adapter.save(state);return this.get(name)}
    status(){return this.adapter.status()}
  }
  function keys(prefix='msos.assembly.v1'){const p=text(prefix)||'msos.assembly.v1';return Object.freeze({schedule:`${p}.schedule`,lifecycle:`${p}.lifecycle`,attendance:`${p}.attendance`,capture:`${p}.capture`,delivery:`${p}.delivery`,navigation:`${p}.navigation`,resources:`${p}.resources`})}
  return{VERSION,JsonStorageAdapter,ResourceCache,keys};
});
