'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOSBoardCommandOwners=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.2.0';
  const text=v=>String(v??'').trim();
  function findBlock(session,id){return(session?.blocks||[]).find(b=>b.id===id)||null}
  function findNodeInBlock(block,id){const stack=[...(block?.items||[])];while(stack.length){const n=stack.shift();if(n?.id===id)return n;if(n?.kind==='group')stack.unshift(...(n.items||[]))}return null}
  function findNode(session,id){for(const block of session?.blocks||[]){const node=findNodeInBlock(block,id);if(node)return node}return null}
  class BoardCommandOwners{
    constructor({runtime,openers={}}={}){
      if(!runtime||typeof runtime.selectedSession!=='function'||typeof runtime.roll!=='function')throw new Error('Board command owners require rebuild Runtime');
      this.runtime=runtime;this.openers=openers;
    }
    sessionFor(context={}){
      const expected=text(context.sessionId);if(!expected)throw new Error('Board command missing sessionId');
      const session=this.runtime.selectedSession();if(!session)throw new Error('Board command has no selected session');
      if(text(session.id)!==expected)throw new Error(`Board command session mismatch: displayed ${expected}, selected ${text(session.id)}`);
      return session;
    }
    opener(name){const fn=this.openers?.[name];if(typeof fn!=='function')throw new Error(`Board UI owner missing: ${name}`);return fn}
    roll=({context,event}={})=>{const session=this.sessionFor(context),data=this.runtime.roll();return this.opener('roll')({context,session,data,event})}
    openTimes=({context,event}={})=>{const session=this.sessionFor(context);return this.opener('times')({context,session,event})}
    capture=({context,mode='choose',event}={})=>{const session=this.sessionFor(context),roll=this.runtime.roll();return this.opener('capture')({context,mode,session,roll,event})}
    editSet=({context,event}={})=>{const session=this.sessionFor(context);if(!context.blockId||!context.itemId)throw new Error('Board editSet missing blockId/itemId');const block=findBlock(session,context.blockId),item=findNodeInBlock(block,context.itemId);if(!block||!item)throw new Error('Board editSet context no longer exists in canonical block');return this.opener('editSet')({context,session,block,item,event})}
    editAthleteSet=({context,event}={})=>{const session=this.sessionFor(context);if(!context.blockId||!context.itemId||!context.athleteId)throw new Error('Board editAthleteSet missing blockId/itemId/athleteId');const block=findBlock(session,context.blockId),item=findNodeInBlock(block,context.itemId);if(!block||!item)throw new Error('Board editAthleteSet context no longer exists in canonical block');const roll=this.runtime.roll(),athlete=(roll.here||[]).find(a=>text(a?.id)===text(context.athleteId));if(!athlete)throw new Error('Board editAthleteSet athlete is no longer here in this session');return this.opener('editAthleteSet')({context,session,block,item,athlete,event})}
    editBlock=({context,event}={})=>{const session=this.sessionFor(context);if(!context.blockId)throw new Error('Board editBlock missing blockId');const block=findBlock(session,context.blockId);if(!block)throw new Error('Board editBlock context no longer exists in canonical session');return this.opener('editBlock')({context,session,block,event})}
    openEvidence=({context,event}={})=>{const session=this.sessionFor(context),items=typeof this.runtime.evidenceAt==='function'?this.runtime.evidenceAt(context):[];return this.opener('evidence')({context,session,items,event})}
    finish=({context,event}={})=>{const session=this.sessionFor(context);return this.opener('finish')({context,session,event})}
    commands(){return{roll:this.roll,openTimes:this.openTimes,capture:this.capture,editSet:this.editSet,editAthleteSet:this.editAthleteSet,editBlock:this.editBlock,openEvidence:this.openEvidence,finish:this.finish}}
  }
  const create=options=>new BoardCommandOwners(options);
  return{VERSION,create,BoardCommandOwners,findBlock,findNodeInBlock,findNode};
});
