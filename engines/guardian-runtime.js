'use strict';
(function(g){
  const M=g.MSOS4,G=M?.guardian;if(!M||!G?.run||!M.store?.save)return;
  const fullRun=G.run.bind(G),baseSave=M.store.save.bind(M.store),R=M.guardianRuntime={build:'v4-guardian-runtime-20260822bj',fullRun,running:false};
  const latestReal=()=>[...(M.state?.guardian?.runs||[])].reverse().find(x=>Array.isArray(x?.tests)&&x.tests.length&&!x.deferred)||null;
  // Suppress only the automatic startup call. Explicit Guardian always uses R.fullRun.
  G.run=()=>({ok:false,tests:[],passed:0,total:0,at:new Date().toISOString(),build:M.BUILD,deferred:true,startupSuppressed:true});
  M.store.save=state=>{const runs=state?.guardian?.runs,last=runs?.at?.(-1);if(state===M.state&&last?.deferred&&last?.startupSuppressed){runs.pop();R.startupRunSuppressed=true;M.storageEngine?.saveUi?.(state);return state;}return baseSave(state);};

  function renderRunning(){const h=document.querySelector('#guardianView');if(!h)return;h.innerHTML=`<section class="page-card"><div class="eyebrow">GUARDIAN · FULL CURRENT BUILD</div><h1>Running full Guardian…</h1><p><b>${M.util?.escape?.(M.BUILD)||M.BUILD}</b></p><p class="muted">Checking the complete runtime regression chain plus live device state. The page is painted first so the phone never appears blank while the check starts.</p></section>`;}
  G.runAndRender=()=>{
    if(R.running)return{deferred:true,running:true,build:M.BUILD};
    R.running=true;renderRunning();
    const run=()=>{let r;try{r=R.fullRun()}catch(e){r={ok:false,tests:[{name:'Guardian execution',ok:false,detail:e?.message||String(e)}],passed:0,total:1,at:new Date().toISOString(),build:M.BUILD}};M.state.guardian=M.state.guardian||{runs:[]};M.state.guardian.runs.push(r);M.state.guardian.runs=M.state.guardian.runs.slice(-20);baseSave(M.state);R.running=false;M.ui?.renderGuardian?.(r);M.toast?.(`Guardian ${r.ok?'PASS':'FAIL'} · ${r.passed}/${r.total}`);return r;};
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>setTimeout(run,0));else setTimeout(run,0);
    return{deferred:true,running:true,build:M.BUILD};
  };

  const oldRender=M.ui?.renderGuardian?.bind(M.ui);if(oldRender)M.ui.renderGuardian=r=>{
    if(R.running&&!r){renderRunning();return;}
    r=r||latestReal();
    if(r){oldRender(r);const h=document.querySelector('#guardianView');if(r.build&&r.build!==M.BUILD){h?.insertAdjacentHTML('afterbegin',`<section class="page-card warning"><div class="eyebrow">GUARDIAN RUN IS FROM AN OLDER BUILD</div><h2>Current runtime: ${M.util?.escape?.(M.BUILD)||M.BUILD}</h2><p>Displayed regression result: ${M.util?.escape?.(r.build)||r.build}. It cannot approve this package.</p><button id="rerunCurrentGuardian">Run full current Guardian</button></section>`);h?.querySelector('#rerunCurrentGuardian')?.addEventListener('click',()=>G.runAndRender());}else{h?.insertAdjacentHTML('afterbegin',`<section class="page-card ${r.ok?'ok':'warning'}"><div class="eyebrow">FULL CURRENT-BUILD GUARDIAN</div><h2>${r.ok?'PASS':'FAIL'} · ${r.passed}/${r.total}</h2><p>${M.util?.escape?.(r.build)||r.build}</p><button id="rerunCurrentGuardian">Run full Guardian again</button></section>`);h?.querySelector('#rerunCurrentGuardian')?.addEventListener('click',()=>G.runAndRender());}return;}
    const h=document.querySelector('#guardianView');if(h)h.innerHTML='<section class="page-card"><div class="eyebrow">GUARDIAN · FULL CURRENT BUILD</div><h1>Not run on this device yet</h1><p>The complete Guardian runs automatically in CI on every v4 candidate upload. This button also runs the current runtime chain plus device-state checks against this phone.</p><button id="rerunGuardian">Run full Guardian</button></section>';h?.querySelector('#rerunGuardian')?.addEventListener('click',()=>G.runAndRender());
  };
  R.latestReal=latestReal;
})(globalThis);
