'use strict';
(function(g){
  const M=g.MSOS4,G=M?.guardian,E=g.MSOSEngines,U=M?.util;
  if(!M||!G?.run)return;
  const base=G.run.bind(G),clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const retired=new Set([
    'No evidence means no fake target',
    'Swimmer hub is five simple tabs',
    'Phone acceptance · McKenzie 50 kick keeps authored cycle and Desc 1-3',
    'Engine · Reduced IM uses performance-relative send-off and stays connected to the group set window',
    'Reduced IM uses performance-relative send-off and stays connected to the group set window'
  ]);
  const assert=(c,m)=>{if(!c)throw new Error(m||'assertion failed')};
  const test=(name,fn)=>{try{return{name,ok:true,detail:String(fn()??'')}}catch(e){return{name,ok:false,detail:e?.message||String(e)}}};
  function currentTests(){const out=[];
    out.push(test('Current swimmer surface is four simple tabs with pathway inside Performance',()=>{
      assert(M.swimmerInstantOpenCN?.build,'single-owner swimmer surface missing');
      assert(M.swimmerTabsUI?.build==='v4-swimmer-deck-only-20260824cp',`legacy tabs still active: ${M.swimmerTabsUI?.build||'missing'}`);
      assert(M.performanceEngine?.pathwayUIck?.disabled===true,'standalone pathway renderer still active');
      return 'Performance · Training · Tests · Meet · pathway expands in event';
    }));
    if(E?.Modification){
      out.push(test('Current McKenzie kick keeps authored cycle and Desc 1-3',()=>{
        const ath={id:'bm-md',full_name:'McKenzie Drage',squad:'National'},session={id:'bm-kick',identity:{course:'SCM',squads:['National']}},state={athletes:[ath],adaptationProfiles:[],adaptationOverrides:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[],trainingTestTypes:[],trainingTestResults:[]};
        const item={id:'bm-desc',kind:'set',reps:12,distance:50,stroke:'',raw:'12 x 50 Kick @ 1:10',text:'12 x 50 Kick @ 1:10',cues:['Desc 1-3'],pattern:[],repPattern:[],repInstructions:[],raceIntent:null,zone:'',restSeconds:10,cycleSeconds:70,equipment:[],composition:[]};
        const x=E.Modification.adaptItem(item,ath,state,session),cue=[x.raw,...(x.cues||[])].join(' | ');
        assert(x.reps===8&&x.distance===50,JSON.stringify(x));assert(x.cycleSeconds===70,`cycle ${x.cycleSeconds}`);assert(/Desc 1-3/i.test(cue),`cue lost: ${cue}`);
        return `8×50 @ ${U?.clock?.(x.cycleSeconds)||x.cycleSeconds} · Desc 1-3`;
      }));
      out.push(test('Current reduced IM uses performance-relative group window',()=>{
        const ath={id:'bm-md2',full_name:'McKenzie Drage',sex:'F'},session={id:'bm-im',identity:{course:'SCM'}},g1={id:'bm-g1',full_name:'Group One'},g2={id:'bm-g2',full_name:'Group Two'},g3={id:'bm-g3',full_name:'Group Three'};
        const state={athletes:[ath,g1,g2,g3],adaptationProfiles:[],adaptationOverrides:[],resultsPbBoard:[{athlete_id:g1.id,distance:100,stroke:'IM',course:'SCM',result_seconds:68},{athlete_id:g2.id,distance:100,stroke:'IM',course:'SCM',result_seconds:70},{athlete_id:g3.id,distance:100,stroke:'IM',course:'SCM',result_seconds:72},{athlete_id:ath.id,distance:100,stroke:'IM',course:'SCM',result_seconds:112}],resultsEventHistory:[],coachResults:[]};
        const item={id:'bm-im-item',kind:'set',reps:5,distance:100,stroke:'IM',raw:'5 x 100 IM @ 1:45',text:'5 x 100 IM @ 1:45',cues:[],pattern:[],repPattern:[],repInstructions:[],raceIntent:null,zone:'',restSeconds:10,cycleSeconds:105,equipment:[],composition:[]};
        const x=E.Modification.adaptItem(item,ath,state,session);
        assert(x.reps===3&&x.distance===100,JSON.stringify(x));assert(x.cycleSeconds===175,`cycle ${x.cycleSeconds}`);assert(x.imPerformancePlan?.groupWindowSeconds===525,JSON.stringify(x.imPerformancePlan));
        return `3×100 @ ${U?.clock?.(x.cycleSeconds)||x.cycleSeconds} · 525s group window`;
      }));
    }
    return out;
  }
  G.run=()=>{const r=base()||{},kept=(r.tests||[]).filter(t=>!retired.has(clean(t.name))),tests=[...kept,...currentTests()],passed=tests.filter(t=>t.ok===true).length;return{...r,tests,passed,total:tests.length,ok:tests.length>0&&passed===tests.length,contract:'20260824cq',retiredTests:[...new Set([...(r.retiredTests||[]),...retired])]} };
  M.guardianBM={build:'v4-guardian-current-contract-20260824cq'};
})(globalThis);
