'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSUI=root.MSOSUI||{};root.MSOSUI.BoardScreen=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const text=v=>String(v??'').trim();
  class BoardScreen{
    constructor({root,runtime,renderer,controllerFactory,commands={},onError=null,getScroll=()=>0,setScroll=()=>{}}={}){
      if(!root)throw new Error('Board Screen requires root');
      if(!runtime||typeof runtime.boardModel!=='function')throw new Error('Board Screen requires runtime.boardModel');
      if(!renderer||typeof renderer.renderBoard!=='function')throw new Error('Board Screen requires renderer');
      if(!controllerFactory||typeof controllerFactory.create!=='function')throw new Error('Board Screen requires controller factory');
      this.root=root;this.runtime=runtime;this.renderer=renderer;this.controllerFactory=controllerFactory;this.commands=commands;this.onError=onError;this.getScroll=getScroll;this.setScroll=setScroll;
      this.controller=null;this.lockedSessionId='';this.lastModel=null;this.mounted=false;
    }
    mount(){
      if(!this.controller)this.controller=this.controllerFactory.create({root:this.root,commands:this.commands,onError:this.onError});
      this.controller.bind();this.mounted=true;return this.render({preserveScroll:false,allowSessionChange:true});
    }
    render({preserveScroll=true,allowSessionChange=false}={}){
      const scroll=preserveScroll?this.getScroll():null,model=this.runtime.boardModel();
      if(!model)throw new Error('Board Screen cannot render without selected session');
      const next=text(model.sessionId);if(!next)throw new Error('Board Screen projection missing sessionId');
      if(this.lockedSessionId&&next!==this.lockedSessionId&&!allowSessionChange)throw new Error(`Board session takeover blocked: ${this.lockedSessionId} -> ${next}`);
      const html=this.renderer.renderBoard(model);
      this.root.innerHTML=html;
      if(!this.lockedSessionId||allowSessionChange)this.lockedSessionId=next;
      this.lastModel=model;
      if(preserveScroll)this.setScroll(scroll);
      return model;
    }
    openSelectedSession({preserveScroll=false}={}){return this.render({preserveScroll,allowSessionChange:true})}
    snapshot(){return{mounted:this.mounted,sessionId:this.lockedSessionId,model:this.lastModel}}
    unmount(){this.controller?.unbind?.();this.mounted=false;return this}
  }
  const create=options=>new BoardScreen(options);
  return{VERSION,create,BoardScreen};
});
