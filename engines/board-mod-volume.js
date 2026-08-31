'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Modification)return;
  const BUILD='v4-board-mod-volume-20260831a',text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const dist=n=>n?.kind==='set'?Math.max(1,Number(n.reps)||1)*(Number(n.distance)||0):n?.kind==='group'?Math.max(1,Number(n.rounds)||1)*(n.items||[]).reduce((s,x)=>s+dist(x),0):0;
  function adaptedNode(n,a,s){if(n?.kind==='set')return E.Modification.adaptItem(n,a,M.state,s);if(n?.kind==='group')return{...n,items:(n.items||[]).map(x=>adaptedNode(x,a,s))};return n;}
  function blockVolume(b,a,s){return(b?.items||[]).reduce((sum,n)=>sum+dist(adaptedNode(n,a,s)),0);}
  function modifiedAthletes(){const present=M.ui?.presentAthletes?.()||[],explicit=M.ui?.modifiedAthletes?.();return Array.isArray(explicit)&&explicit.length?explicit:present.filter(a=>Number(E.Modification.profile(a,M.state).ratio)<.98||text(a.modifications));}
  function paint(){if(typeof document==='undefined')return;const s=M.currentSession?.();if(!s)return;const mods=modifiedAthletes();for(const el of document.querySelectorAll('.msos-board-block[data-block]')){el.querySelector('[data-msos-mod-volume]')?.remove();const b=(s.blocks||[]).find(x=>String(x.id)===String(el.dataset.block));if(!b||!mods.length)continue;const tag=document.createElement('small');tag.dataset.msosModVolume='1';tag.className='msos-mod-volume';tag.textContent=mods.map(a=>`${M.boardEngine?.name?.(a,mods)||text(a.full_name).split(' ')[0]} ${blockVolume(b,a,s).toLocaleString()}m`).join(' · ');el.querySelector('header')?.appendChild(tag);}}
  function observe(){if(typeof MutationObserver==='undefined'||typeof document==='undefined')return;const host=document.querySelector('#boardView');if(!host)return;new MutationObserver(()=>requestAnimationFrame(paint)).observe(host,{childList:true,subtree:true});requestAnimationFrame(paint);}
  M.boardModVolume={build:BUILD,paint,blockVolume};
  if(typeof document!=='undefined'){const style=document.createElement('style');style.textContent='.msos-mod-volume{font-size:10px;line-height:1.1;opacity:.72;white-space:nowrap;grid-column:1/-1;margin-top:-2px}';document.head.appendChild(style);document.addEventListener('DOMContentLoaded',observe);}
})(globalThis);
