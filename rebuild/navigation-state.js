'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOSNavigationState=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const SCHEMA='msos.navigation.v1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(text(v))?text(v):'';
  const month=v=>/^\d{4}-\d{2}$/.test(text(v))?text(v):'';
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const nowMonth=()=>new Date().toISOString().slice(0,7);
  const frameTypes=new Set(['calendar','day','board','detail','modal']);
  function blankFrame(){return{type:'calendar',month:nowMonth(),date:'',occurrenceId:'',sessionId:'',detailType:'',detailId:'',modalName:'',scrollY:0,meta:{}}}
  function normalizeFrame(raw={}){
    const type=frameTypes.has(text(raw.type))?text(raw.type):'calendar',out={type,month:month(raw.month)||'',date:date(raw.date)||'',occurrenceId:text(raw.occurrenceId||raw.occurrence_id),sessionId:text(raw.sessionId||raw.session_id),detailType:text(raw.detailType||raw.detail_type),detailId:text(raw.detailId||raw.detail_id),modalName:text(raw.modalName||raw.modal_name),scrollY:Math.max(0,num(raw.scrollY||raw.scroll_y)),meta:clone(raw.meta||{})};
    if(type==='calendar'){out.month=out.month||out.date.slice(0,7)||nowMonth();out.date='';out.occurrenceId='';out.sessionId='';out.detailType='';out.detailId='';out.modalName=''}
    if(type==='day'){if(!out.date)throw new Error('Day navigation requires exact date');out.month=out.month||out.date.slice(0,7);out.occurrenceId='';out.sessionId='';out.detailType='';out.detailId='';out.modalName=''}
    if(type==='board'){if(!out.date)throw new Error('Board navigation requires exact date');if(!out.occurrenceId)throw new Error('Board navigation requires exact occurrence id');if(!out.sessionId)throw new Error('Board navigation requires exact session id');out.month=out.month||out.date.slice(0,7);out.detailType='';out.detailId='';out.modalName=''}
    if(type==='detail'){if(!out.detailType||!out.detailId)throw new Error('Detail navigation requires exact detail type and id');out.month=out.month||out.date.slice(0,7);out.modalName=''}
    if(type==='modal'){if(!out.modalName)throw new Error('Modal navigation requires modal name')}
    return out;
  }
  function frameKey(frame){const f=normalizeFrame(frame);return[f.type,f.month,f.date,f.occurrenceId,f.sessionId,f.detailType,f.detailId,f.modalName].join('|')}
  function blankState({month:initialMonth=''}={}){return{schema:SCHEMA,version:VERSION,stack:[normalizeFrame({type:'calendar',month:initialMonth||nowMonth()})],interactive:false,revision:0,lastAction:'init'}}
  function normalizeState(raw,{month:initialMonth=''}={}){
    if(!raw||typeof raw!=='object')return blankState({month:initialMonth});const stack=Array.isArray(raw.stack)?raw.stack.map(normalizeFrame):[];if(!stack.length||stack[0].type!=='calendar')stack.unshift(normalizeFrame({type:'calendar',month:initialMonth||stack[0]?.month||nowMonth()}));return{schema:SCHEMA,version:VERSION,stack,interactive:raw.interactive===true,revision:Math.max(0,Number(raw.revision)||0),lastAction:text(raw.lastAction)||'restore'}
  }
  function sameCurrent(a,b){try{return frameKey(a)===frameKey(b)}catch{return false}}

  class NavigationState{
    constructor({state=null,month:initialMonth=''}={}){this.state=normalizeState(state,{month:initialMonth})}
    snapshot(){return clone(this.state)}
    current(){return clone(this.state.stack.at(-1))}
    depth(){return this.state.stack.length}
    canBack(){return this.state.stack.length>1}
    _commit(action){this.state.revision++;this.state.lastAction=action;return this.current()}
    markInteractive(){if(!this.state.interactive){this.state.interactive=true;this._commit('interactive')}return this.snapshot()}
    openCalendar({month:targetMonth=''}={}){
      const root=normalizeFrame({type:'calendar',month:targetMonth||this.state.stack[0]?.month||nowMonth()});this.state.stack=[root];return this._commit('open_calendar')
    }
    openDate(dateValue,{month:targetMonth='',replace=false,scrollY=0}={}){
      const frame=normalizeFrame({type:'day',date:dateValue,month:targetMonth||String(dateValue).slice(0,7),scrollY});return this.navigate(frame,{replace,action:'open_date'})
    }
    openBoard({date:dateValue,occurrenceId,sessionId,month:targetMonth='',scrollY=0}={},{replace=false}={}){
      const frame=normalizeFrame({type:'board',date:dateValue,occurrenceId,sessionId,month:targetMonth||String(dateValue||'').slice(0,7),scrollY});const cur=this.current();if(cur.type==='day'&&cur.date!==frame.date)throw new Error('Board date must match selected Day view');return this.navigate(frame,{replace,action:'open_board'})
    }
    openDetail({detailType,detailId,date:dateValue='',occurrenceId='',sessionId='',meta={}}={},{replace=false}={}){
      const cur=this.current(),frame=normalizeFrame({type:'detail',detailType,detailId,date:dateValue||cur.date,occurrenceId:occurrenceId||cur.occurrenceId,sessionId:sessionId||cur.sessionId,month:cur.month,meta});return this.navigate(frame,{replace,action:'open_detail'})
    }
    openModal(modalName,{meta={}}={}){
      const cur=this.current(),frame=normalizeFrame({...cur,type:'modal',modalName,meta:{...clone(cur.meta||{}),...clone(meta)}});return this.navigate(frame,{replace:false,action:'open_modal'})
    }
    navigate(raw,{replace=false,action='navigate'}={}){
      const frame=normalizeFrame(raw);if(replace&&this.state.stack.length)this.state.stack[this.state.stack.length-1]=frame;else if(!sameCurrent(this.current(),frame))this.state.stack.push(frame);return this._commit(action)
    }
    setScroll(scrollY){const y=Math.max(0,num(scrollY));this.state.stack[this.state.stack.length-1].scrollY=y;return this._commit('set_scroll')}
    back(){
      if(this.state.stack.length<=1)return{handled:false,exit:true,frame:this.current(),state:this.snapshot()};const from=this.state.stack.pop(),to=this.current();this._commit('back');return{handled:true,exit:false,from:clone(from),frame:to,state:this.snapshot()}
    }
    closeModal(){const cur=this.current();if(cur.type!=='modal')return{handled:false,frame:cur};return this.back()}
    applyExternalSnapshot(raw,{source='startup'}={}){
      const incoming=normalizeState(raw,{month:this.state.stack[0]?.month||nowMonth()}),kind=text(source).toLowerCase();
      if(this.state.interactive){return{applied:false,reason:'interactive_context_locked',source:kind,current:this.current()}}
      this.state=incoming;this.state.lastAction=`external_${kind||'restore'}`;return{applied:true,reason:'pre_interaction_restore',source:kind,current:this.current(),state:this.snapshot()}
    }
    resume(){return{current:this.current(),state:this.snapshot(),changed:false}}
    route(){const f=this.current();return{type:f.type,month:f.month,date:f.date,occurrenceId:f.occurrenceId,sessionId:f.sessionId,detailType:f.detailType,detailId:f.detailId,modalName:f.modalName,scrollY:f.scrollY}}
  }
  const create=options=>new NavigationState(options);
  return{VERSION,SCHEMA,create,NavigationState,blankState,normalizeState,normalizeFrame,frameKey,sameCurrent};
});
