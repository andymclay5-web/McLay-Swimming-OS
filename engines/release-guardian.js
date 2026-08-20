'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.guardian?.run)return;
  const BUILD='v4-guardian-gate-20260821ak',G=M.guardian,S=M.swimmerTabsUI;
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const baseRun=G.run.bind(G);
  M.BUILD=BUILD;M.CORE='20260821-guardian-gate-ak';
  M.RELEASE_ATTESTATION=Object.freeze({
    ...(M.RELEASE_ATTESTATION||{}),build:BUILD,softwareReady:false,
    generatedAt:new Date().toISOString(),
    note:'Candidate build. Guardian is the software release gate; physical Android acceptance remains separate.'
  });
  const retired=new Set([
    'Elsie controlled pathway ranks SCM 200 Breast closest and keeps 25-point steps',
    'Conor Breaststroke + fins constraint is semantic',
    'Final shipping build owns the software attestation'
  ]);
  const test=(name,fn)=>{try{const detail=fn();return{name,ok:true,detail:detail==null?'':String(detail)}}catch(e){return{name,ok:false,detail:e?.message||String(e)}}};
  const assert=(cond,msg)=>{if(!cond)throw new Error(msg||'assertion failed')};
  function currentContractTests(){
    const out=[];
    out.push(test('Guardian is running the current candidate build',()=>{assert(M.BUILD===BUILD,`runtime ${M.BUILD}`);return BUILD}));
    out.push(test('Candidate attestation is locked until Guardian and phone acceptance',()=>{assert(M.RELEASE_ATTESTATION?.build===BUILD,'attestation build mismatch');assert(M.RELEASE_ATTESTATION?.softwareReady===false,'candidate claimed release-ready early')}));
    out.push(test('Swimmer deck access is a header pill contract',()=>{const c=S?.checks?.();assert(c?.deckPills==='header',JSON.stringify(c));return 'Here-now swimmers · header'}));
    out.push(test('Swimmer hub is five simple tabs',()=>{const tabs=S?.checks?.()?.tabs||[];assert(tabs.join('|')==='today|performance|training|pathway|meet',tabs.join('|'));return tabs.join(' · ')}));
    out.push(test('Swimmer pathway uses real milestones, never WA point bumps',()=>{
      assert(typeof S?.realMilestones==='function','real milestone engine missing');
      const event={pb:{course:'SCM',distance:100,stroke:'Butterfly',result_seconds:65},pointSteps:[{points:400,seconds:63}],qualifying:[{_label:'Regional QT',_kind:'qualifying',_seconds:64},{_label:'National QT',_kind:'qualifying',_seconds:62}],deeper:[{_label:'National Finalist',_kind:'benchmark',_seconds:60},{_label:'National Medal',_kind:'benchmark',_seconds:58},{_label:'NZ Record',_kind:'record',_seconds:54}]};
      const rows=S.realMilestones(event),labels=rows.map(x=>x._label);
      assert(labels.join('|')==='Regional QT|National QT|National Finalist|National Medal|NZ Record',labels.join('|'));
      assert(!rows.some(x=>/\bWA\b|point/i.test(text(x._label))),'point bump leaked into swimmer pathway');
      return labels.join(' → ');
    }));
    out.push(test('Poolside pathway answer is driven by loaded meet/benchmark milestones',()=>{
      const event={pb:{course:'SCM',distance:100,stroke:'Freestyle',result_seconds:60},qualifying:[{_label:'Meet QT',_kind:'qualifying',_seconds:58}],deeper:[{_label:'Finalist',_kind:'benchmark',_seconds:56}]};
      const ans=M.correct?.poolsidePathwayAnswer?.({id:'guardian-ath'},event);
      assert(ans?.milestones?.length===2,'real milestone answer not authoritative');
      assert(!('steps' in (ans||{})),'legacy point-step answer still authoritative');
      return ans.milestones.map(x=>x._label).join(' → ');
    }));
    out.push(test('Coach Loop and swimmer tabs are both active over one canonical session',()=>{assert(!!M.coachLoopUI,'coach loop missing');assert(!!S,'swimmer tabs missing');assert(S?.checks?.()?.preservesCoachLoop===true,'swimmer tabs replaced coach loop')}));
    return out;
  }
  G.run=()=>{
    const base=baseRun()||{},retained=(base.tests||[]).filter(t=>!retired.has(text(t.name))),engine=[];
    if(M.engineAcceptance?.results?.length){
      for(const r of M.engineAcceptance.results)engine.push({name:`Engine · ${r.name}`,ok:r.ok===true,detail:r.detail||''});
    }else engine.push({name:'Engine acceptance suite executed',ok:false,detail:'engines/acceptance.js did not produce results'});
    const tests=[...retained,...engine,...currentContractTests()],passed=tests.filter(t=>t.ok===true).length;
    return {...base,build:BUILD,tests,passed,total:tests.length,ok:tests.length>0&&passed===tests.length,retiredTests:[...retired],contract:'20260821ak'};
  };
  M.release=M.release||{};
  M.release.guardianGate=()=>{
    const runs=M.state?.guardian?.runs||[],r=[...runs].reverse().find(x=>x?.build===BUILD&&!x.deferred);
    return{build:BUILD,ok:!!r?.ok,passed:r?.passed||0,total:r?.total||0,ranAt:r?.at||null};
  };
  M.release.canCutover=()=>M.release.guardianGate().ok&&M.RELEASE_ATTESTATION?.softwareReady===true;
})(globalThis);
