'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOSEnginePortal=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.1.1';
  const SCHEMA='msos.engine-portal.v1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').trim();
  const nowDefault=()=>new Date().toISOString();
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(x=>text(x).toLowerCase()).join('|'))}`;

  class PortalError extends Error{
    constructor(code,message,details={}){super(message);this.name='PortalError';this.code=code;this.details=clone(details)}
  }

  function fail(code,message,details={}){throw new PortalError(code,message,details)}
  function list(v){return Array.isArray(v)?v.map(text).filter(Boolean):v==='*'?['*']:[]}
  function normalizeCalls(raw={}){
    const out={query:{},command:{}};
    for(const kind of ['query','command'])for(const [target,ops] of Object.entries(raw?.[kind]||{}))out[kind][text(target)]=list(ops);
    return out;
  }
  function normalizeOperation(spec,name){
    if(typeof spec==='function')return{handler:spec,validateInput:null,validateOutput:null,description:''};
    if(!spec||typeof spec.handler!=='function')fail('INVALID_OPERATION',`Operation ${name} requires a handler`);
    return{handler:spec.handler,validateInput:spec.validateInput||null,validateOutput:spec.validateOutput||null,description:text(spec.description)};
  }
  function normalizeOperations(raw={}){const out={};for(const [name,spec] of Object.entries(raw||{})){const n=text(name);if(!n)fail('INVALID_OPERATION','Operation name is required');out[n]=normalizeOperation(spec,n)}return out}
  function validateWith(rule,value,label){
    if(!rule)return;
    let result;
    try{result=rule(value)}catch(error){fail('CONTRACT_VALIDATION',`${label} validator threw: ${error.message}`)}
    if(result===true||result===undefined||result==='')return;
    if(result===false)fail('CONTRACT_VALIDATION',`${label} failed contract validation`);
    if(typeof result==='string')fail('CONTRACT_VALIDATION',`${label} failed contract validation: ${result}`);
    if(result&&typeof result==='object'&&result.ok===false)fail('CONTRACT_VALIDATION',`${label} failed contract validation: ${text(result.message)||'invalid value'}`,result);
  }
  function sanitizeManifest(row){
    return{id:row.id,version:row.version,purpose:row.purpose,owner:row.owner,kind:row.kind,calls:clone(row.calls),queries:Object.fromEntries(Object.entries(row.queries).map(([k,v])=>[k,{description:v.description}])),commands:Object.fromEntries(Object.entries(row.commands).map(([k,v])=>[k,{description:v.description}]))};
  }
  function opAllowed(ops,name){return Array.isArray(ops)&&(ops.includes('*')||ops.includes(name))}

  class EnginePortal{
    constructor({clock=nowDefault,maxDepth=24,auditLimit=1000}={}){
      this.clock=clock;this.maxDepth=Math.max(4,Number(maxDepth)||24);this.auditLimit=Math.max(50,Number(auditLimit)||1000);this.services=new Map();this.audit=[];this.sealed=false;this.sequence=0;this.activeStacks=new Map();
    }
    register(spec={}){
      if(this.sealed)fail('PORTAL_SEALED','Engine portal is sealed; registration is closed');
      const id=text(spec.id),version=text(spec.version)||'0.0.0';if(!id)fail('INVALID_SERVICE','Service id is required');if(this.services.has(id))fail('DUPLICATE_SERVICE',`Service already registered: ${id}`);
      const row={id,version,purpose:text(spec.purpose),owner:text(spec.owner),kind:text(spec.kind)||'engine',calls:normalizeCalls(spec.calls),queries:normalizeOperations(spec.queries),commands:normalizeOperations(spec.commands)};
      this.services.set(id,row);return sanitizeManifest(row);
    }
    describe(id){const row=this.services.get(text(id));return row?sanitizeManifest(row):null}
    catalog(){return [...this.services.values()].map(sanitizeManifest).sort((a,b)=>a.id.localeCompare(b.id))}
    graph(){return this.catalog().map(x=>({id:x.id,calls:clone(x.calls)}))}
    validateGraph(){
      const errors=[];
      for(const caller of this.services.values())for(const kind of ['query','command'])for(const [targetId,ops] of Object.entries(caller.calls[kind])){
        const target=this.services.get(targetId);if(!target){errors.push(`${caller.id} ${kind} dependency missing: ${targetId}`);continue}
        if(ops.includes('*'))continue;const table=kind==='query'?target.queries:target.commands;for(const op of ops)if(!table?.[op])errors.push(`${caller.id} may ${kind} ${targetId}.${op}, but operation is not registered`);
      }
      return{ok:errors.length===0,errors};
    }
    seal(){const check=this.validateGraph();if(!check.ok)fail('INVALID_GRAPH','Engine communication graph is invalid',{errors:check.errors});this.sealed=true;return{schema:SCHEMA,version:VERSION,sealed:true,services:this.catalog()}}
    client(callerId){
      const caller=text(callerId);if(!this.services.has(caller))fail('UNKNOWN_CALLER',`Portal client requires registered caller: ${caller}`);
      return Object.freeze({
        query:(target,operation,input={},context={})=>this._invoke('query',caller,target,operation,input,context,this.activeStacks.get(caller)||[]),
        command:(target,operation,input={},context={})=>this._invoke('command',caller,target,operation,input,context,this.activeStacks.get(caller)||[]),
        describe:target=>this.describe(target)
      });
    }
    _permission(caller,target,kind,operation){
      const callerRow=this.services.get(caller);if(!callerRow)fail('UNKNOWN_CALLER',`Unknown caller: ${caller}`);const allowed=callerRow.calls?.[kind]?.[target];if(!opAllowed(allowed,operation))fail('CALL_NOT_ALLOWED',`${caller} may not ${kind} ${target}.${operation}`,{caller,target,kind,operation});
    }
    _requestMeta(kind,caller,target,operation,context,parentStack){
      const parent=parentStack.at(-1)||null,seq=++this.sequence,at=this.clock(),requestId=text(context?.requestId)||stable('req',seq,at,caller,target,operation),causeId=text(context?.causeId)||parent?.causeId||parent?.requestId||requestId;
      return{schema:SCHEMA,portalVersion:VERSION,requestId,causeId,kind,caller,target,operation,at,depth:parentStack.length,context:clone(context||{})};
    }
    _record(meta,status,error=null){
      this.audit.push({requestId:meta.requestId,causeId:meta.causeId,kind:meta.kind,caller:meta.caller,target:meta.target,operation:meta.operation,at:meta.at,depth:meta.depth,status,errorCode:error?.code||null,errorMessage:error?text(error.message):null,context:clone(meta.context||{})});if(this.audit.length>this.auditLimit)this.audit.splice(0,this.audit.length-this.auditLimit);
    }
    _invoke(kind,caller,targetId,operationName,input={},context={},parentStack=[]){
      const target=text(targetId),operation=text(operationName);if(parentStack.length>=this.maxDepth)fail('MAX_DEPTH','Engine portal maximum call depth exceeded',{caller,target,operation});this._permission(caller,target,kind,operation);
      const service=this.services.get(target);if(!service)fail('UNKNOWN_TARGET',`Unknown target engine: ${target}`);const op=service[`${kind}s`]?.[operation]||(kind==='query'?service.queries?.[operation]:service.commands?.[operation]);if(!op)fail('UNKNOWN_OPERATION',`${target} does not expose ${kind} ${operation}`);
      const meta=this._requestMeta(kind,caller,target,operation,context,parentStack),stack=[...parentStack,meta],serviceClient=Object.freeze({
        query:(nextTarget,nextOperation,nextInput={},nextContext={})=>this._invoke('query',target,nextTarget,nextOperation,nextInput,{...clone(meta.context),...clone(nextContext),causeId:meta.causeId},stack),
        command:(nextTarget,nextOperation,nextInput={},nextContext={})=>this._invoke('command',target,nextTarget,nextOperation,nextInput,{...clone(meta.context),...clone(nextContext),causeId:meta.causeId},stack),
        describe:id=>this.describe(id)
      }),previousStack=this.activeStacks.get(target);
      const safeInput=clone(input);this.activeStacks.set(target,stack);
      try{
        validateWith(op.validateInput,safeInput,`${target}.${operation} input`);
        const result=op.handler(safeInput,Object.freeze({request:Object.freeze(clone(meta)),client:serviceClient}));
        if(result&&typeof result.then==='function')fail('ASYNC_NOT_SUPPORTED','Engine Portal v1 handlers must be synchronous/local-first; wrap remote work behind a separate async adapter');
        validateWith(op.validateOutput,result,`${target}.${operation} output`);this._record(meta,'ok');return clone(result);
      }catch(error){const wrapped=error instanceof PortalError?error:new PortalError('ENGINE_OPERATION_FAILED',`${target}.${operation} failed: ${error.message}`,{target,operation});this._record(meta,'error',wrapped);throw wrapped}
      finally{if(previousStack)this.activeStacks.set(target,previousStack);else this.activeStacks.delete(target)}
    }
    auditTrail({causeId='',caller='',target='',kind='',status=''}={}){return clone(this.audit.filter(x=>!causeId||x.causeId===causeId).filter(x=>!caller||x.caller===caller).filter(x=>!target||x.target===target).filter(x=>!kind||x.kind===kind).filter(x=>!status||x.status===status))}
    snapshot(){return{schema:SCHEMA,version:VERSION,sealed:this.sealed,services:this.catalog(),graph:this.graph(),audit:this.auditTrail()}}
  }
  const create=options=>new EnginePortal(options);
  return{VERSION,SCHEMA,create,EnginePortal,PortalError,normalizeCalls,validateWith};
});