'use strict';
(function(g){
  const M=g.MSOS4,G=M?.guardian;if(!M||!G?.run||!M.store?.save)return;
  const R=M.guardianRuntime={build:'v4-guardian-runtime-20260822bh'},fullRun=G.run.bind(G),baseSave=M.store.save.bind(M.store);
  const clone=v=>M.util?.clone?M.util.clone(v):JSON.parse(JSON.stringify(v));
  const latestReal=()=>[...(M.state?.guardian?.runs||[])].reverse().find(x=>Array.isArray(x?.tests)&&x.tests.length&&!x.deferred)||null;
  const restoreInPlace=(target,snapshot)=>{for(const k of Object.keys(target||{}))delete target[k];Object.assign(target,clone(snapshot));return target;};
  const sandboxRun=()=>{
    const stateRef=M.state,snapshot=clone(stateRef),saveBefore=M.store.save,liveBefore=M.live?.suppress;
    if(M.live)M.live.suppress=true;
    // Guardian regressions are allowed to mutate in-memory fixtures, but they must never
    // persist or broadcast those temporary roles/athletes/sessions. This prevents fixture
    // identities such as "Swimmer A" leaking into the live coaching/swimmer surface if a
    // phone stalls, reloads or kills the JS process mid-run.
    M.store.save=state=>state;
    try{return fullRun();}
    finally{
      restoreInPlace(stateRef,snapshot);M.state=stateRef;M.store.save=saveBefore;if(M.live)M.live.suppress=liveBefore;
    }
  };
  G.run=()=>({ok:false,tests:[],passed:0,total:0,at:new Date().toISOString(),build:M.BUILD,deferred:true});
  M.store.save=state=>{const runs=state?.guardian?.runs,last=runs?.at?.(-1);if(state===M.state&&last?.deferred){runs.pop();R.startupRunSuppressed=true;M.storageEngine?.saveUi?.(state);return state;}return baseSave(state);};
  G.runAndRender=()=>{
    let r;
    try{r=sandboxRun();}
    catch(error){r={ok:false,tests:[{name:'Guardian runtime completed without uncaught error',ok:false,detail:error?.message||String(error)}],passed:0,total:1,at:new Date().toISOString(),build:M.BUILD,guardianRuntimeError:true};}
    M.state.guardian=M.state.guardian||{runs:[]};M.state.guardian.runs.push(r);M.state.guardian.runs=M.state.guardian.runs.slice(-20);baseSave(M.state);M.ui?.renderGuardian?.(r);M.ui?.configureRoleChrome?.();M.toast?.(`Guardian ${r.ok?'PASS':'FAIL'} · ${r.passed}/${r.total}`);return r;
  };
  const oldRender=M.ui?.renderGuardian?.bind(M.ui);if(oldRender)M.ui.renderGuardian=r=>{r=r||latestReal();if(r){oldRender(r);if(r.build&&r.build!==M.BUILD){const h=document.querySelector('#guardianView');h?.insertAdjacentHTML('afterbegin',`<section class="page-card warning"><div class="eyebrow">GUARDIAN RUN IS FROM AN OLDER BUILD</div><h2>Current runtime: ${M.util?.escape?.(M.BUILD)||M.BUILD}</h2><p>Displayed regression result: ${M.util?.escape?.(r.build)||r.build}. Run Guardian again before using these results to judge the current package.</p><button id="rerunCurrentGuardian">Run current Guardian</button></section>`);h?.querySelector('#rerunCurrentGuardian')?.addEventListener('click',()=>G.runAndRender());}return;}const h=document.querySelector('#guardianView');if(h)h.innerHTML='<section class="page-card"><div class="eyebrow">GUARDIAN</div><h1>Full suite not run yet</h1><p>Guardian is deliberately excluded from the live poolside startup path. Run it explicitly when testing the build.</p><button id="rerunGuardian">Run Guardian</button></section>';h?.querySelector('#rerunGuardian')?.addEventListener('click',()=>G.runAndRender());};
  R.latestReal=latestReal;R.sandboxRun=sandboxRun;
})(globalThis);
