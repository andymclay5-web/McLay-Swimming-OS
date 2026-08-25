'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const hooks=new Map(),pending=new Set(),running=new Set();
  const B=M.surfaceBridge={build:'v4-surface-bridge-20260826',hooks};
  const list=surface=>{if(!hooks.has(surface))hooks.set(surface,new Map());return hooks.get(surface)};
  B.register=(surface,id,fn)=>{if(!surface||!id||typeof fn!=='function')throw new Error('surfaceBridge.register requires surface, id, fn');list(surface).set(id,fn);return()=>list(surface).delete(id)};
  B.after=(surface,ctx={})=>{if(!surface||running.has(surface))return;running.add(surface);try{for(const [id,fn] of list(surface)){try{fn(ctx)}catch(e){console.warn(`[MSOS bridge:${surface}:${id}]`,e)}}}finally{running.delete(surface)}};
  const schedule=(surface,ctx={})=>{if(!surface||pending.has(surface))return;pending.add(surface);const run=()=>{pending.delete(surface);B.after(surface,ctx)};(g.requestAnimationFrame||((fn)=>setTimeout(fn,0)))(run)};
  B.schedule=schedule;
  const surfaceFor=node=>{const el=node?.nodeType===1?node:node?.parentElement;if(!el)return'';const host=el.closest?.('#boardView,#tvView,#hubView,#swimmerView,#meetView,#athletesView,#rollView,#timesView,#connectionView,#guardianView,#modalHost');if(!host)return'';if(host.id==='modalHost')return'modal';return host.id.replace(/View$/,'');};
  B.install=()=>{if(B.installed||typeof document==='undefined')return;B.installed=true;const observer=new MutationObserver(records=>{for(const r of records){const s=surfaceFor(r.target);if(s)schedule(s,{host:s==='modal'?document.querySelector('#modalHost .modal'):document.querySelector(`#${s}View`),source:'mutation'});}});observer.observe(document.body,{subtree:true,childList:true});B.observer=observer;for(const s of ['board','tv','hub','swimmer','meet','athletes','roll','times']){const h=document.querySelector(`#${s}View`);if(h?.classList.contains('active')||h?.childElementCount)schedule(s,{host:h,source:'install'});}const modal=document.querySelector('#modalHost .modal');if(modal)schedule('modal',{host:modal,source:'install'});};
  if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',B.install,{once:true});else B.install();}
})(globalThis);
