'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSUI=root.MSOSUI||{};root.MSOSUI.BoardController=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.1.0';
  const text=v=>String(v??'').trim();
  const CAPTURE_ACTIONS=new Set(['capture','note','voice','photo','video']);
  const KNOWN_ACTIONS=new Set(['roll','times','capture','note','voice','photo','video','finish','edit','edit-block','evidence']);

  function contextFromDataset(dataset={}){
    const sessionId=text(dataset.sessionId),blockId=text(dataset.blockId),itemId=text(dataset.itemId);
    return{sessionId,blockId:blockId||null,itemId:itemId||null};
  }
  function commandFor(action,context={}){
    const a=text(action);if(!KNOWN_ACTIONS.has(a))return null;
    const ctx={sessionId:text(context.sessionId),blockId:text(context.blockId)||null,itemId:text(context.itemId)||null};
    if(!ctx.sessionId)throw new Error(`Board action ${a} requires sessionId`);
    if(a==='roll')return{type:'roll',context:ctx};
    if(a==='times')return{type:'openTimes',context:ctx};
    if(a==='finish')return{type:'finish',context:ctx};
    if(a==='edit'){if(!ctx.blockId||!ctx.itemId)throw new Error('Board edit requires blockId + itemId');return{type:'editSet',context:ctx}}
    if(a==='edit-block'){if(!ctx.blockId)throw new Error('Board block edit requires blockId');return{type:'editBlock',context:ctx}}
    if(a==='evidence')return{type:'openEvidence',context:ctx};
    if(CAPTURE_ACTIONS.has(a))return{type:'capture',mode:a==='capture'?'choose':a,context:ctx};
    return null;
  }
  function resolveActionElement(start){
    if(!start)return null;
    if(typeof start.closest==='function')return start.closest('[data-board-action]');
    return start.dataset?.boardAction?start:null;
  }
  function dispatch(commands,command,event){
    if(!command)return undefined;
    const handler=commands?.[command.type];
    if(typeof handler!=='function')throw new Error(`Board command owner missing: ${command.type}`);
    return handler({...command,event});
  }
  class BoardController{
    constructor({root,commands={},onError=null}={}){
      if(!root||typeof root.addEventListener!=='function')throw new Error('Board Controller requires event root');
      this.root=root;this.commands=commands;this.onError=onError;this.bound=false;this.handleClick=this.handleClick.bind(this);
    }
    handleClick(event){
      const el=resolveActionElement(event?.target);if(!el)return;
      const action=text(el.dataset?.boardAction);if(!KNOWN_ACTIONS.has(action))return;
      event?.preventDefault?.();
      try{return dispatch(this.commands,commandFor(action,contextFromDataset(el.dataset)),event)}
      catch(error){if(typeof this.onError==='function')return this.onError(error,{action,element:el,event});throw error}
    }
    bind(){if(!this.bound){this.root.addEventListener('click',this.handleClick);this.bound=true}return this}
    unbind(){if(this.bound){this.root.removeEventListener?.('click',this.handleClick);this.bound=false}return this}
  }
  const create=options=>new BoardController(options);
  return{VERSION,create,BoardController,KNOWN_ACTIONS,CAPTURE_ACTIONS,contextFromDataset,commandFor,resolveActionElement,dispatch};
});
