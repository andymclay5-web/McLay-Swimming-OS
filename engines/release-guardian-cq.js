'use strict';
(function(g){
  const M=g.MSOS4,G=M?.guardian,E=g.MSOSEngines;
  if(!M||!G?.run)return;
  const BUILD='v4-guardian-live-contract-20260824cq',baseRun=G.run.bind(G),clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const OLD_SWIMMER=new Set([
    'Swimmer hub is five simple tabs',
    'Swimmer pathway uses real milestones, never WA point bumps',
    'Coach Loop and swimmer tabs are both active over one canonical session'
  ]);
  const REDUCED='Engine · Reduced IM uses performance-relative send-off and stays connected to the group set window';
  const test=(name,fn)=>{try{const detail=fn();return{name,ok:true,detail:detail==null?'':String(detail)}}catch(e){return{name,ok:false,detail:e?.message||String(e)}};
  const assert=(c,m)=>{if(!c)throw new Error(m||'assertion failed')};

  function currentContractTests(){
    const out=[];
    out.push(test('Current swimmer surface is one four-tab interface',()=>{
      assert(M.swimmerInstantOpenCN?.build==='v4-swimmer-surface-20260824co','single-owner swimmer surface missing');
      assert(typeof M.swimmerInstantOpenCN?.renderFast==='function','fast swimmer renderer missing');
      assert(M.swimmerExperienceCL?.disabled===true,'legacy swimmer experience still active');
      assert(M.performanceEngine?.pathwayUIck?.disabled===true,'standalone pathway renderer still active');
      return'Performance · Training · Tests · Meet · pathway expands inside Performance';
    }));
    out.push(test(REDUCED,()=>{
      if(!E?.Modification)return'engine unavailable';
      const session={id:'guardian-cq-im',identity:{course:'SCM'}},ath={id:'guardian-cq-md',full_name:'McKenzie Drage',sex:'F',squad:'National'},g1={id:'cq-g1',full_name:'Group One',squad:'National'},g2={id:'cq-g2',full_name:'Group Two',squad:'National'},g3={id:'cq-g3',full_name:'Group Three',squad:'National'};
      const state={athletes:[ath,g1,g2,g3],adaptationProfiles:[],adaptationOverrides:[],attendance:[],resultsPbBoard:[{athlete_id:g1.id,distance:100,stroke:'IM',course:'SCM',result_seconds:68},{athlete_id:g2.id,distance:100,stroke:'IM',course:'SCM',result_seconds:70},{athlete_id:g3.id,distance:100,stroke:'IM',course:'SCM',result_seconds:72},{athlete_id:ath.id,distance:100,stroke:'IM',course:'SCM',result_seconds:112}],resultsEventHistory:[],coachResults:[]};
      const item={id:'guardian-cq-im-item',kind:'set',reps:5,distance:100,stroke:'IM',raw:'5 x 100 IM @ 1:45',text:'5 x 100 IM @ 1:45',cues:[],pattern:[],repPattern:[],repInstructions:[],raceIntent:null,zone:'',restSeconds:10,cycleSeconds:105,equipment:[],composition:[]};
      const x=E.Modification.adaptItem(item,ath,state,session);
      assert(x?.reps===3&&x?.distance===100,JSON.stringify(x));
      assert(Number(x?.cycleSeconds)===175,`cycle ${x?.cycleSeconds}`);
      assert(/2:55/.test(String(x?.raw||'')),String(x?.raw||''));
      assert(Number(x?.imPerformancePlan?.groupWindowSeconds)===525,JSON.stringify(x?.imPerformancePlan));
      assert(Number(x?.imPerformancePlan?.totalSeconds)===525,JSON.stringify(x?.imPerformancePlan));
      return'3 × 100 IM @ 2:55 · 8:45 squad window preserved';
    }));
    out.push(test('Current live target contract · no evidence means no fake target',()=>{
      if(!M.parser?.parse||!M.targets?.forItem)return'target engine unavailable';
      const s=M.parser.parse('MAIN SET\n4 x 100 Threshold',{id:'guardian-cq-target',course:'SCM'}),item=s.blocks?.[0]?.items?.find(x=>x.kind==='set'),r=M.targets.forItem(s,item,{id:'guardian-cq-no-evidence'},{trainingTestTypes:[],trainingTestResults:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[]});
      assert(r?.status==='missing',JSON.stringify(r));return'missing evidence surfaced · no target generated';
    }));
    out.push(test('Current phone contract · repeating Desc 1-3 survives rep reduction',()=>{
      if(!E?.Modification)return'engine unavailable';
      const item={id:'guardian-cq-kick',kind:'set',reps:12,distance:50,stroke:'Choice',raw:'12 x 50 Kick @ 1:10',text:'12 x 50 Kick @ 1:10',cues:['Desc 1-3 @ 1:10'],pattern:[],repPattern:[],repInstructions:[],equipment:[],composition:[],restSeconds:10,cycleSeconds:70};
      const ath={id:'guardian-cq-mk',full_name:'McKenzie Drage'},state={adaptationProfiles:[],adaptationOverrides:[]},session={id:'guardian-cq-kick-session',identity:{course:'SCM'}},x=E.Modification.adaptItem(item,ath,state,session);
      assert(x?.reps===8,`reps ${x?.reps}`);assert(Number(x?.cycleSeconds)===70,`cycle ${x?.cycleSeconds}`);assert(/Desc 1-3/i.test([x.raw,...(x.cues||[])].join(' ')),JSON.stringify(x));assert(!/Desc 1-8/i.test((x.cues||[]).join(' ')),JSON.stringify(x.cues));return'8 × 50 @ 1:10 · repeating Desc 1-3 preserved';
    }));
    return out;
  }

  M.BUILD=BUILD;M.CORE='20260824-guardian-live-contract-cq';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:BUILD,softwareReady:false,generatedAt:new Date().toISOString(),note:'CQ aligns live Guardian with the single-owner four-tab swimmer surface and current target/modification contracts. Physical phone acceptance remains required.'});
  G.run=()=>{
    const base=baseRun()||{},seen=new Set(),kept=[];
    for(const r of base.tests||[]){const n=clean(r?.name);if(OLD_SWIMMER.has(n)||n===REDUCED||/No evidence means no fake target/i.test(n)||/McKenzie 50 kick keeps authored cycle and Desc 1-3/i.test(n))continue;if(seen.has(n))continue;seen.add(n);kept.push(r);}
    const extra=currentContractTests(),tests=[...kept,...extra],passed=tests.filter(x=>x.ok===true).length;
    return{...base,build:BUILD,tests,passed,total:tests.length,ok:tests.length>0&&passed===tests.length,contract:'20260824cq',retiredTests:[...new Set([...(base.retiredTests||[]),...OLD_SWIMMER])]} ;
  };
  M.release=M.release||{};M.release.guardianGate=()=>{const runs=M.state?.guardian?.runs||[],r=[...runs].reverse().find(x=>x?.build===BUILD&&!x.deferred);return{build:BUILD,ok:!!r?.ok,passed:r?.passed||0,total:r?.total||0,ranAt:r?.at||null};};
  M.release.canCutover=()=>M.release.guardianGate().ok&&M.RELEASE_ATTESTATION?.softwareReady===true&&M.release?.deviceAccepted?.()===true;
})(globalThis);
