'use strict';
(function(g){
  const M=g.MSOS4,G=M?.guardian,D=M?.guardianDeviceStateBJ;if(!M||!G)return;
  const BUILD='v4-guardian-full-gate-20260822bj';
  const priorFull=M.guardianRuntime?.fullRun||G.run?.bind(G);if(typeof priorFull!=='function')return;
  M.BUILD=BUILD;M.CORE='20260822-guardian-full-gate-bj';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:BUILD,softwareReady:false,generatedAt:new Date().toISOString(),note:'BJ candidate. Full Guardian must pass in CI on these exact bytes. Physical Android acceptance remains separate.'});
  const full=()=>{
    const base=priorFull()||{},device=D?.scan?.()||{ok:true,passed:0,total:0,tests:[]},tests=[...(base.tests||[]),...(device.tests||[]).map(t=>({name:`Device · ${t.name}`,ok:t.ok===true,detail:t.detail||''}))],passed=tests.filter(t=>t.ok===true).length;
    return{...base,build:BUILD,tests,passed,total:tests.length,ok:tests.length>0&&passed===tests.length,deviceState:device,contract:'20260822bj'};
  };
  if(M.guardianRuntime)M.guardianRuntime.fullRun=full;else G.run=full;
  M.release=M.release||{};
  M.release.guardianGate=()=>{const runs=M.state?.guardian?.runs||[],r=[...runs].reverse().find(x=>x?.build===BUILD&&!x.deferred);return{build:BUILD,ok:!!r?.ok,passed:r?.passed||0,total:r?.total||0,ranAt:r?.at||null};};
  M.release.canCutover=()=>M.release.guardianGate().ok&&M.RELEASE_ATTESTATION?.softwareReady===true&&M.release?.deviceAccepted?.()===true;
})(globalThis);
