'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.CaptureEvidence=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.1';
  const SCHEMA='msos.capture.v1';
  const TYPES=new Set(['note','voice','photo','video','timing','observation']);
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const nowDefault=()=>new Date().toISOString();
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(x=>text(x).toLowerCase()).join('|'))}`;
  function blankState(){return{schema:SCHEMA,captures:[],journal:[],updatedAt:null}}
  function normalizeState(raw){const s=raw&&typeof raw==='object'?clone(raw):blankState();s.schema=SCHEMA;if(!Array.isArray(s.captures))s.captures=[];if(!Array.isArray(s.journal))s.journal=[];return s}
  function findNode(session,id){for(const block of (session?.blocks||[])){if(block.id===id)return{kind:'block',node:block,block};const stack=[...(block.items||[])];while(stack.length){const n=stack.shift();if(n?.id===id)return{kind:n.kind||'item',node:n,block};if(n?.kind==='group')stack.unshift(...(n.items||[]))}}return null}
  function context(session,{blockId=null,itemId=null}={}){
    if(!session?.id)throw new Error('Capture requires exact canonical session');
    let block=null,item=null;
    if(blockId){const found=findNode(session,blockId);if(!found||found.kind!=='block')throw new Error(`Block not found in session: ${blockId}`);block=found.block}
    if(itemId){const found=findNode(session,itemId);if(!found||found.kind==='block')throw new Error(`Item not found in session: ${itemId}`);item=found.node;if(block&&found.block.id!==block.id)throw new Error('Item does not belong to supplied block');block=found.block}
    return{sessionId:session.id,blockId:block?.id||null,itemId:item?.id||null};
  }
  function normalizeType(type){const t=text(type).toLowerCase();if(!TYPES.has(t))throw new Error(`Unsupported capture type: ${type}`);return t}
  class MemoryStorage{constructor(initial=null){this.value=initial==null?null:clone(initial);this.reads=0;this.writes=0}load(){this.reads++;return clone(this.value)}save(value){this.writes++;this.value=clone(value);return true}}

  class CaptureEvidence{
    constructor({storage,evidence=null,clock=nowDefault}={}){
      if(!storage||typeof storage.load!=='function'||typeof storage.save!=='function')throw new Error('Capture Evidence requires a storage adapter');this.storage=storage;this.evidence=evidence;this.clock=clock;
      this.state=normalizeState(storage.load());
    }
    snapshot(){return clone(this.state)}
    persist(){this.state.updatedAt=this.clock();this.storage.save(this.state);return this.snapshot()}
    normalizeAthletes(refs=[]){
      const out=[];for(const ref of refs||[]){if(!ref)continue;if(this.evidence){const a=this.evidence.resolveAthlete(ref);if(!a)throw new Error(`Athlete not found: ${ref}`);out.push(a.id)}else out.push(typeof ref==='string'?ref:ref.id)}return[...new Set(out.filter(Boolean))];
    }
    create(session,{type,blockId=null,itemId=null,athleteIds=[],coachId='',text:body='',mediaRef=null,data=null,visibility='coach',id=null}={}){
      const t=normalizeType(type),ctx=context(session,{blockId,itemId}),athletes=this.normalizeAthletes(athleteIds),at=this.clock();
      if(['voice','photo','video'].includes(t)&&!mediaRef)throw new Error(`${t} capture requires mediaRef`);
      if(t==='note'&&!text(body)&&data==null)throw new Error('Note capture requires text or data');
      const captureId=id||stable('capture',ctx.sessionId,ctx.blockId||'',ctx.itemId||'',athletes.join('+'),coachId,t,at);
      if(this.state.captures.some(x=>x.id===captureId))throw new Error(`Capture already exists: ${captureId}`);
      const row={id:captureId,type:t,session_id:ctx.sessionId,block_id:ctx.blockId,item_id:ctx.itemId,athlete_ids:athletes,coach_id:text(coachId),text:String(body??''),media_ref:mediaRef?clone(mediaRef):null,data:data==null?null:clone(data),visibility:text(visibility)||'coach',created_at:at,updated_at:at,status:'active',revision:1};
      this.state.captures.push(row);this.state.journal.push({id:stable('capture-event',captureId,'create',at),capture_id:captureId,action:'create',at,revision:1});this.persist();return clone(row);
    }
    get(id){return clone(this.state.captures.find(x=>x.id===id)||null)}
    amend(id,{text:body,mediaRef,data,visibility,note=''}={}){
      const i=this.state.captures.findIndex(x=>x.id===id);if(i<0)throw new Error(`Capture not found: ${id}`);const row=this.state.captures[i];if(row.status!=='active')throw new Error('Only active evidence can be amended');const at=this.clock(),before={text:row.text,media_ref:clone(row.media_ref),data:clone(row.data),visibility:row.visibility};
      if(body!==undefined)row.text=String(body??'');if(mediaRef!==undefined)row.media_ref=mediaRef?clone(mediaRef):null;if(data!==undefined)row.data=data==null?null:clone(data);if(visibility!==undefined)row.visibility=text(visibility)||row.visibility;row.revision=(Number(row.revision)||1)+1;row.updated_at=at;
      this.state.journal.push({id:stable('capture-event',id,'amend',at),capture_id:id,action:'amend',at,revision:row.revision,note:text(note),before,after:{text:row.text,media_ref:clone(row.media_ref),data:clone(row.data),visibility:row.visibility}});this.persist();return clone(row);
    }
    retire(id,{note=''}={}){
      const i=this.state.captures.findIndex(x=>x.id===id);if(i<0)throw new Error(`Capture not found: ${id}`);const row=this.state.captures[i];if(row.status==='retired')return clone(row);const at=this.clock();row.status='retired';row.revision=(Number(row.revision)||1)+1;row.updated_at=at;this.state.journal.push({id:stable('capture-event',id,'retire',at),capture_id:id,action:'retire',at,revision:row.revision,note:text(note)});this.persist();return clone(row);
    }
    query({sessionId='',blockId='',itemId='',athleteId='',type='',status='active',visibility=''}={}){
      return clone(this.state.captures.filter(x=>!sessionId||x.session_id===sessionId).filter(x=>!blockId||x.block_id===blockId).filter(x=>!itemId||x.item_id===itemId).filter(x=>!athleteId||(x.athlete_ids||[]).includes(athleteId)).filter(x=>!type||x.type===text(type).toLowerCase()).filter(x=>!status||x.status===status).filter(x=>!visibility||x.visibility===visibility).sort((a,b)=>text(a.created_at).localeCompare(text(b.created_at))));
    }
    atBoardPoint(session,{blockId=null,itemId=null,athleteId=''}={}){const ctx=context(session,{blockId,itemId});return this.query({sessionId:ctx.sessionId,blockId:ctx.blockId||'',itemId:ctx.itemId||'',athleteId})}
    history(id){return clone(this.state.journal.filter(x=>x.capture_id===id).sort((a,b)=>text(a.at).localeCompare(text(b.at))))}
  }
  const create=options=>new CaptureEvidence(options);
  return{VERSION,SCHEMA,TYPES,create,CaptureEvidence,MemoryStorage,blankState,normalizeState,findNode,context,normalizeType};
});
