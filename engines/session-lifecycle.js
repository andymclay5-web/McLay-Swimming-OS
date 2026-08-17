'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.SessionLifecycle=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const SCHEMA='msos.lifecycle.v1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const nowDefault=()=>new Date().toISOString();
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(x=>text(x).toLowerCase()).join('|'))}`;
  const identityFields=['date','dayPart','start','end','venue','course'];

  function blankState(){return{schema:SCHEMA,sessions:[],drafts:[],selectedSessionId:null,updatedAt:null}}
  function normalizeState(raw){
    const s=raw&&typeof raw==='object'?clone(raw):blankState();
    s.schema=SCHEMA;
    if(!Array.isArray(s.sessions))s.sessions=[];
    if(!Array.isArray(s.drafts))s.drafts=[];
    if(typeof s.selectedSessionId!=='string'&&s.selectedSessionId!==null)s.selectedSessionId=null;
    if(s.selectedSessionId&&!s.sessions.some(x=>x.id===s.selectedSessionId))s.selectedSessionId=null;
    return s;
  }
  function identityKey(identity={}){
    const squads=[...(identity.squads||[])].map(text).filter(Boolean).sort().join('+');
    return identityFields.map(k=>text(identity[k])).join('|')+'|'+squads;
  }
  function sameIdentity(a={},b={}){return identityKey(a)===identityKey(b)}
  function assertCanonical(session){
    if(!session||typeof session!=='object')throw new Error('Canonical session required');
    if(!text(session.id))throw new Error('Canonical session id required');
    if(!session.identity||typeof session.identity!=='object')throw new Error('Canonical session identity required');
    if(!Array.isArray(session.blocks))throw new Error('Canonical session blocks required');
    return session;
  }
  function recordId(canonical){return text(canonical.id)}
  function journalEntry(type,at,details={}){return{id:stable('life-event',type,at,JSON.stringify(details)),type,at,...clone(details)}}

  class MemoryStorage{
    constructor(initial=null){this.value=initial==null?null:clone(initial);this.reads=0;this.writes=0;}
    load(){this.reads++;return clone(this.value)}
    save(value){this.writes++;this.value=clone(value);return true}
  }

  class Lifecycle{
    constructor({storage,clock=nowDefault}={}){
      if(!storage||typeof storage.load!=='function'||typeof storage.save!=='function')throw new Error('SessionLifecycle requires a storage adapter');
      this.storage=storage;this.clock=clock;
      // Boot is read-only. Loading the engine must never mutate persisted state.
      this.state=normalizeState(storage.load());
    }
    snapshot(){return clone(this.state)}
    selectedId(){return this.state.selectedSessionId||null}
    selected(){return clone(this.state.sessions.find(x=>x.id===this.state.selectedSessionId)||null)}
    getSession(id){return clone(this.state.sessions.find(x=>x.id===id)||null)}
    getDraft(id){return clone(this.state.drafts.find(x=>x.id===id)||null)}
    listSessions(){return clone(this.state.sessions)}
    listDrafts(){return clone(this.state.drafts)}
    persist(){this.state.updatedAt=this.clock();this.storage.save(this.state);return this.snapshot()}

    createDraft({id=null,identity={},source='',slotKey='',inputMode='text'}={}){
      const at=this.clock(),draftId=id||stable('draft',identityKey(identity),slotKey,at);
      if(this.state.drafts.some(x=>x.id===draftId))throw new Error(`Draft already exists: ${draftId}`);
      const draft={id:draftId,identity:clone(identity),source:String(source??''),slotKey:text(slotKey),inputMode:text(inputMode)||'text',createdAt:at,updatedAt:at};
      this.state.drafts.push(draft);this.persist();return clone(draft);
    }
    updateDraft(id,patch={}){
      const i=this.state.drafts.findIndex(x=>x.id===id);if(i<0)throw new Error(`Draft not found: ${id}`);
      const d=this.state.drafts[i];
      if(Object.prototype.hasOwnProperty.call(patch,'source'))d.source=String(patch.source??'');
      if(Object.prototype.hasOwnProperty.call(patch,'identity'))d.identity=clone(patch.identity||{});
      if(Object.prototype.hasOwnProperty.call(patch,'slotKey'))d.slotKey=text(patch.slotKey);
      if(Object.prototype.hasOwnProperty.call(patch,'inputMode'))d.inputMode=text(patch.inputMode)||d.inputMode;
      d.updatedAt=this.clock();this.persist();return clone(d);
    }
    discardDraft(id){
      const i=this.state.drafts.findIndex(x=>x.id===id);if(i<0)return false;
      this.state.drafts.splice(i,1);this.persist();return true;
    }

    createSession(canonical,{draftId=null,select=true,sourceType='text'}={}){
      assertCanonical(canonical);const id=recordId(canonical);
      if(this.state.sessions.some(x=>x.id===id))throw new Error(`Session already exists: ${id}. Explicit replacement required.`);
      const at=this.clock(),plan=clone(canonical);
      const rec={id,identity:clone(canonical.identity),originalPlan:plan,current:clone(canonical),revision:1,status:'active',createdAt:at,updatedAt:at,journal:[journalEntry('create',at,{sourceType:text(sourceType)||'text',draftId:draftId||null})]};
      this.state.sessions.push(rec);
      if(draftId){const di=this.state.drafts.findIndex(x=>x.id===draftId);if(di>=0)this.state.drafts.splice(di,1)}
      if(select)this.state.selectedSessionId=id;
      this.persist();return clone(rec);
    }
    createFromDraft(draftId,canonical,{select=true}={}){
      const draft=this.state.drafts.find(x=>x.id===draftId);if(!draft)throw new Error(`Draft not found: ${draftId}`);
      assertCanonical(canonical);
      if(!sameIdentity(draft.identity,canonical.identity))throw new Error('Draft identity does not match canonical session identity');
      return this.createSession(canonical,{draftId,select,sourceType:draft.inputMode});
    }
    selectSession(id){
      if(!this.state.sessions.some(x=>x.id===id))throw new Error(`Session not found: ${id}`);
      if(this.state.selectedSessionId===id)return this.selected();
      this.state.selectedSessionId=id;this.persist();return this.selected();
    }

    applyEdit(id,nextCanonical,{action='edit',note=''}={}){
      assertCanonical(nextCanonical);const i=this.state.sessions.findIndex(x=>x.id===id);if(i<0)throw new Error(`Session not found: ${id}`);
      const rec=this.state.sessions[i];
      if(recordId(nextCanonical)!==id)throw new Error('Canonical session id cannot change during an edit');
      if(!sameIdentity(rec.identity,nextCanonical.identity))throw new Error('Session identity cannot change during an edit; use changeIdentity explicitly');
      const at=this.clock();rec.current=clone(nextCanonical);rec.revision=(Number(rec.revision)||1)+1;rec.updatedAt=at;
      rec.journal.push(journalEntry(text(action)||'edit',at,{revision:rec.revision,note:text(note)}));
      this.persist();return clone(rec);
    }
    replaceSession(id,replacement,{note=''}={}){
      // Replacement is explicit but still preserves the first accepted originalPlan.
      return this.applyEdit(id,replacement,{action:'replace',note});
    }
    changeIdentity(id,nextIdentity,{note=''}={}){
      const i=this.state.sessions.findIndex(x=>x.id===id);if(i<0)throw new Error(`Session not found: ${id}`);
      const rec=this.state.sessions[i],at=this.clock(),before=clone(rec.identity),after=clone(nextIdentity||{});
      rec.identity=after;rec.current.identity=clone(after);rec.revision=(Number(rec.revision)||1)+1;rec.updatedAt=at;
      rec.journal.push(journalEntry('identity_change',at,{revision:rec.revision,before,after:clone(after),note:text(note)}));
      this.persist();return clone(rec);
    }
    markSuperseded(id,{bySessionId=null,note=''}={}){
      const i=this.state.sessions.findIndex(x=>x.id===id);if(i<0)throw new Error(`Session not found: ${id}`);
      const rec=this.state.sessions[i],at=this.clock();rec.status='superseded';rec.updatedAt=at;rec.journal.push(journalEntry('supersede',at,{bySessionId,note:text(note)}));
      if(this.state.selectedSessionId===id&&bySessionId&&this.state.sessions.some(x=>x.id===bySessionId))this.state.selectedSessionId=bySessionId;
      this.persist();return clone(rec);
    }
  }

  function create(options){return new Lifecycle(options)}
  return{VERSION,SCHEMA,create,Lifecycle,MemoryStorage,blankState,normalizeState,identityKey,sameIdentity};
});
