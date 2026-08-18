'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports){
    module.exports=factory({
      Renderer:require('../ui/board-renderer.js'),
      Controller:require('../ui/board-controller.js'),
      Screen:require('../ui/board-screen.js'),
      CommandOwners:require('./board-command-owners.js'),
      PoolsideActions:require('./poolside-actions.js')
    });
  }else root.MSOSBoardApp=factory({
    Renderer:root.MSOSUI?.BoardRenderer,
    Controller:root.MSOSUI?.BoardController,
    Screen:root.MSOSUI?.BoardScreen,
    CommandOwners:root.MSOSBoardCommandOwners,
    PoolsideActions:root.MSOSPoolsideActions
  });
})(typeof globalThis!=='undefined'?globalThis:this,function(D){
  const VERSION='1.1.0';
  function assertDeps(){for(const [name,value] of Object.entries(D))if(!value)throw new Error(`Board App missing dependency: ${name}`)}
  class BoardApp{
    constructor({root,runtime,openers={},present=null,getScroll=()=>0,setScroll=()=>{},onError=null}={}){
      assertDeps();if(!root)throw new Error('Board App requires mount root');if(!runtime)throw new Error('Board App requires rebuild Runtime');
      this.root=root;this.runtime=runtime;this.screen=null;
      this.actions=D.PoolsideActions.create({runtime,onChange:()=>this.screen?.render?.(),present});
      const resolvedOpeners={...this.actions.openers(),...(openers||{})};
      this.owners=D.CommandOwners.create({runtime,openers:resolvedOpeners});
      this.screen=D.Screen.create({root,runtime,renderer:D.Renderer,controllerFactory:D.Controller,commands:this.owners.commands(),getScroll,setScroll,onError});
    }
    mount(){return this.screen.mount()}
    refresh(){return this.screen.render()}
    openSelectedSession(options={}){return this.screen.openSelectedSession(options)}
    unmount(){this.screen.unmount();return this}
    snapshot(){return this.screen.snapshot()}
  }
  const create=options=>new BoardApp(options);
  return{VERSION,create,BoardApp};
});
