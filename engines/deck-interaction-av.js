'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M?.actions?.openCapture||!M?.ui)return;
  const BUILD='v4-context-voice-foundation-20260822av',D=M.deckInteractionAV={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const current=()=>M.currentSession?.()||null;
  function selectionContext(ctx={}){
    if(ctx.athleteId||ctx.athleteIds?.length)return ctx;
    const selected=M.state?.settings?.selectedAthleteId;if(selected&&(M.state?.settings?.view==='athletes'||M.state?.settings?.view==='swimmer'))return{...ctx,athleteId:selected};
    return ctx;
  }
  const priorOpen=M.actions.openCapture.bind(M.actions);
  M.actions.openCapture=(ctx={})=>{
    ctx=selectionContext(ctx);const result=priorOpen(ctx),modal=document.querySelector('#modalHost .modal');if(!modal)return result;
    const explicit=new Set(Array.isArray(ctx.athleteIds)?ctx.athleteIds:(ctx.athleteId?[ctx.athleteId]:[])),checks=[...modal.querySelectorAll('[data-capture-athlete]')];
    if(explicit.size){for(const c of checks)c.checked=explicit.has(c.dataset.captureAthlete);}
    else{for(const c of checks)c.checked=false;}
    const label=modal.querySelector('#captureSelectionLabel');if(label)label.textContent=`${checks.filter(x=>x.checked).length} selected`;
    const head=modal.querySelector('.capture-athlete-head b');if(head&&!explicit.size)head.textContent='Choose swimmer';
    return result;
  };
  function athleteEventRows(ath,state=M.state,course=''){
    const rows=E?.Evidence?.pbRows?.(ath,state)||[],c=text(course).toUpperCase(),best=new Map();for(const r of rows){const crs=text(E.Evidence.course?.(r)||r.course).toUpperCase(),d=Number(E.Evidence.distance?.(r)||r.distance),st=E.Evidence.rowStroke?.(r)||r.stroke,sec=Number(E.Evidence.seconds?.(r)||r.result_seconds||r.seconds);if(!d||!st||!sec)continue;if(c&&crs&&crs!==c)continue;const k=`${crs||c||'UNK'}|${d}|${st}`,old=best.get(k);if(!old||sec<old.seconds)best.set(k,{course:crs||c,distance:d,stroke:st,seconds:sec,row:r});}return[...best.values()].sort((a,b)=>a.stroke.localeCompare(b.stroke)||a.distance-b.distance);}
  D.athleteEventRows=athleteEventRows;
  D.selectionContext=selectionContext;
  function addPbAllButton(){const host=document.querySelector('#athletesView'),ath=(M.state?.athletes||[]).find(a=>a.id===M.state?.settings?.selectedAthleteId);if(!host||!ath||host.querySelector('[data-av-all-pbs]'))return;const panel=host.querySelector('[data-msos-ath-panel="performance"]')||host.querySelector('[data-loop-athlete-today]');if(!panel)return;const course=M.state?.settings?.pathwayCourse||current()?.identity?.course||'SCM',rows=athleteEventRows(ath,M.state,course),wrap=document.createElement('section');wrap.dataset.avAllPbs='1';wrap.className='page-card av-all-pbs';wrap.innerHTML=`<details><summary><b>All PBs · ${rows.length}</b><span>${text(course).toUpperCase()}</span></summary><div class="av-pb-grid">${rows.map(r=>`<div><span>${r.distance} ${r.stroke}</span><strong>${M.util?.clock?M.util.clock(r.seconds):r.seconds}</strong></div>`).join('')||'<p>No PB evidence loaded.</p>'}</div></details>`;panel.appendChild(wrap);}
  const priorRender=M.ui.renderAthletes?.bind(M.ui);if(priorRender)M.ui.renderAthletes=()=>{priorRender();requestAnimationFrame(addPbAllButton);};
  if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(addPbAllButton),{once:true});
})(globalThis);
