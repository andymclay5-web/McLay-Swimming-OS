'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M?.ui||!E?.Modification)return;
  const BUILD='v4-board-mod-volume-20260831a',text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const dist=n=>n?.kind==='set'?Math.max(1,Number(n.reps)||1)*(Number(n.distance)||0):n?.kind==='group'?Math.max(1,Number(n.rounds)||1)*(n.items||[]).reduce((s,x)=>s+dist(x),0):0;
  function blockFor(b,a,s){return(b?.items||[]).reduce((sum,n)=>{if(n?.kind==='group'){const copy={...n,items:(n.items||[]).map(x=>x?.kind==='set'?E.Modification.adaptItem(x,a,M.state,s):x)};return sum+dist(copy);}return sum+dist(n?.kind==='set'?E.Modification.adaptItem(n,a,M.state,s):n);},0);}
  function mods(){const p=M.ui.presentAthletes?.()||[],explicit=M.ui.modifiedAthletes?.();return(Array.isArray(explicit)&&explicit.length?explicit:p.filter(a=>Number(E.Modification.profile(a,M.state).ratio)<.98||text(a.modifications)));}
  function paint(){const s=M.currentSession?.();if(!s)return;const athletes=mods();document.querySelectorAll('.msos-board-block[data-block]').forEach(el=>{el.querySelector('[data-msos-mod-volume]')?.remove();const b=(s.blocks||[]).find(x=>String(x.id)===String(el.dataset.block));if(!b||!athletes.length)return;const rows=athletes.map(a=>`${M.boardEngine?.name?.(a,athletes)||text(a.full_name).split(' ')[0]} ${blockFor(b,a,s).toLocaleString()}m`);const tag=document.createElement('small');tag.dataset.msosModVolume='1';tag.className='msos-mod-volume';tag.textContent=rows.join(' · ');const h=el.querySelector('header');if(h)h.appendChild(tag);});}
  const base=M.ui.renderBoard?.bind(M.ui);if(base)M.ui.renderBoard=function(){const r=base();requestAnimationFrame(paint);return r;};
  const tv=M.ui.renderTV?.bind(M.ui);if(tv)M.ui.renderTV=function(){const r=tv();requestAnimationFrame(paint);return r;};
  const style=document.createElement('style');style.textContent='.msos-mod-volume{font-size:10px;line-height:1.1;opacity:.72;white-space:nowrap;grid-column:1/-1;margin-top:-2px}';document.head.appendChild(style);
  M.boardModVolume={build:BUILD,paint,blockFor};requestAnimationFrame(paint);
})(globalThis);
