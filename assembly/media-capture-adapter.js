'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOSAssemblyMediaCapture=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const TYPES=new Set(['voice','photo','video']);
  const text=v=>String(v??'').trim();
  const cloneMeta=row=>row?{id:row.id,type:row.type,name:row.name,mime:row.mime,size:row.size,createdAt:row.createdAt,context:row.context||null}:null;
  const nowDefault=()=>new Date().toISOString();
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const idFor=(type,file,at)=>`media-${hash([type,text(file?.name),Number(file?.size)||0,at,Math.random()].join('|'))}`;
  function normalizeType(type){const t=text(type).toLowerCase();if(!TYPES.has(t))throw new Error(`Unsupported media capture type: ${type}`);return t}
  function validateFile(file,type){if(!file||typeof file!=='object')throw new Error(`${type} capture requires a media file`);const size=Number(file.size);if(!Number.isFinite(size)||size<=0)throw new Error(`${type} capture file is empty`);const mime=text(file.type).toLowerCase();if(type==='photo'&&mime&&!mime.startsWith('image/'))throw new Error('Photo capture requires an image file');if(type==='video'&&mime&&!mime.startsWith('video/'))throw new Error('Video capture requires a video file');if(type==='voice'&&mime&&!mime.startsWith('audio/'))throw new Error('Voice capture requires an audio file');return{size,mime}}

  class MemoryMediaStore{
    constructor(){this.rows=new Map()}
    async put(row){this.rows.set(row.id,{...row});return cloneMeta(row)}
    async get(id){return this.rows.get(text(id))||null}
    async remove(id){return this.rows.delete(text(id))}
    async list(){return[...this.rows.values()].map(cloneMeta)}
  }

  class IndexedDbMediaStore{
    constructor({indexedDB,name='msos-assembly-media-v1',storeName='media'}={}){if(!indexedDB||typeof indexedDB.open!=='function')throw new Error('IndexedDB media store is unavailable');this.indexedDB=indexedDB;this.name=text(name)||'msos-assembly-media-v1';this.storeName=text(storeName)||'media';this.dbPromise=null}
    open(){if(this.dbPromise)return this.dbPromise;this.dbPromise=new Promise((resolve,reject)=>{const req=this.indexedDB.open(this.name,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(this.storeName))db.createObjectStore(this.storeName,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB media open failed'))});return this.dbPromise}
    async tx(mode,fn){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(this.storeName,mode),store=tx.objectStore(this.storeName);let value;try{value=fn(store,resolve,reject)}catch(error){reject(error);return}tx.onerror=()=>reject(tx.error||new Error('IndexedDB media transaction failed'));if(value!==undefined&&typeof value?.then==='function')value.catch(reject)})}
    async put(row){return this.tx('readwrite',(store,resolve,reject)=>{const req=store.put(row);req.onsuccess=()=>resolve(cloneMeta(row));req.onerror=()=>reject(req.error||new Error('IndexedDB media save failed'))})}
    async get(id){return this.tx('readonly',(store,resolve,reject)=>{const req=store.get(text(id));req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error('IndexedDB media read failed'))})}
    async remove(id){return this.tx('readwrite',(store,resolve,reject)=>{const req=store.delete(text(id));req.onsuccess=()=>resolve(true);req.onerror=()=>reject(req.error||new Error('IndexedDB media delete failed'))})}
    async list(){return this.tx('readonly',(store,resolve,reject)=>{const req=store.getAll();req.onsuccess=()=>resolve((req.result||[]).map(cloneMeta));req.onerror=()=>reject(req.error||new Error('IndexedDB media list failed'))})}
  }

  class MediaCaptureAdapter{
    constructor({store,clock=nowDefault}={}){if(!store||typeof store.put!=='function'||typeof store.get!=='function'||typeof store.remove!=='function')throw new Error('Media Capture requires a media store');this.store=store;this.clock=clock}
    async save(file,{type,context=null}={}){const t=normalizeType(type),meta=validateFile(file,t),at=this.clock(),id=idFor(t,file,at),row={id,type:t,name:text(file.name)||`${t}-${at}`,mime:meta.mime,size:meta.size,createdAt:at,context:context?JSON.parse(JSON.stringify(context)):null,blob:file};await this.store.put(row);return{provider:'indexeddb',store:'msos-assembly-media-v1',id,type:t,name:row.name,mime:row.mime,size:row.size,createdAt:row.createdAt}}
    async get(ref){const id=text(typeof ref==='string'?ref:ref?.id);if(!id)throw new Error('Media reference id required');return this.store.get(id)}
    async remove(ref){const id=text(typeof ref==='string'?ref:ref?.id);if(!id)return false;return this.store.remove(id)}
    async list(){return this.store.list?this.store.list():[]}
  }
  function create({indexedDB,store,clock}={}){return new MediaCaptureAdapter({store:store||new IndexedDbMediaStore({indexedDB}),clock})}
  return{VERSION,TYPES,create,MediaCaptureAdapter,MemoryMediaStore,IndexedDbMediaStore,normalizeType,validateFile};
});
