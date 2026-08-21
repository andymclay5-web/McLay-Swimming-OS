'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.guardian?.run)return;
  const BUILD='v4-adaptive-calendar-20260821am',G=M.guardian,S=M.swimmerTabsUI,A=M.adaptiveDelivery;
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const baseRun=G.run.bind(G);
  M.BUILD=BUILD;M.CORE='20260821-adaptive-calendar-am';
  M.RELEASE_ATTESTATION=Object.freeze({
    ...(M.RELEASE_ATTESTATION||{}),build:BUILD,softwareReady:false,
    generatedAt:new Date().toISOString(),
    note:'Candidate build. Guardian is the software release gate; physical Android acceptance remains separate.'
  });
  const retired=new Set([
    'Elsie controlled pathway ranks SCM 200 Breast closest and keeps 25-point steps',
    'Conor Breaststroke + fins constraint is semantic',
    'Final shipping build owns the software attestation',
    'Poolside swimmer answer links pathway steps to recent training area'
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
    out.push(test('Amber adaptive engine offers coach-confirmed upper-body variation',()=>{
      const c=A?.checks?.()||{},modes=c.amberModes||[],strokes=c.amberStrokes||[];
      assert(['Pull','Swim','Paddles','Drill','Scull','Body alignment'].every(x=>modes.includes(x)),modes.join(' | '));
      assert(['Freestyle','Backstroke','Breaststroke','Butterfly','IM','Choice'].every(x=>strokes.includes(x)),strokes.join(' | '));
      const item={id:'amber-guardian',kind:'set',reps:8,distance:75,stroke:'Choice',raw:'8 x 75 with Fins 50 technique / 25 fast',text:'8 x 75 with Fins 50 technique / 25 fast',cues:[],pattern:[],repPattern:[],repInstructions:[],equipment:['Fins'],composition:[],restSeconds:10,cycleSeconds:90},ath={id:'amber-guardian-ath',full_name:'Amber Proudfoot'},state={adaptationProfiles:[],adaptationOverrides:[]},session={id:'amber-guardian-session',identity:{course:'SCM'}};
      const x=A.adaptItem(item,ath,state,session);assert((x.adaptiveOptions||[]).length===6,'adaptive choices missing');assert(/Adaptive options:/i.test((x.cues||[]).join(' ')),'Board option cue missing');return `${x.adaptiveMode} · ${x.reps}×${x.distance}`;
    }));
    out.push(test('Amber Scull option protects slow 2:00-per-50 timing',()=>{
      const item={id:'amber-scull',kind:'set',reps:4,distance:50,stroke:'Choice',raw:'4 x 50 Kick with Fins @ 1:00',text:'4 x 50 Kick with Fins @ 1:00',cues:[],pattern:[],repPattern:[],repInstructions:[],equipment:['Fins'],composition:[],restSeconds:10,cycleSeconds:60},ath={id:'amber-scull-ath',full_name:'Amber Proudfoot'},state={adaptationProfiles:[],adaptationOverrides:[{sessionId:'amber-scull-session',itemId:'amber-scull',athleteId:'amber-scull-ath',active:true,patch:{adaptiveMode:'Scull'}}]},session={id:'amber-scull-session',identity:{course:'SCM'}};
      const x=A.adaptItem(item,ath,state,session);assert(x.adaptiveMode==='Scull','Scull override not selected');assert(Number(x.cycleSeconds)>=120,`cycle ${x.cycleSeconds}`);return `50 Scull @ ${M.util?.clock?.(x.cycleSeconds)||x.cycleSeconds}`;
    }));
    out.push(test('Conor adaptive framework keeps Breaststroke kick out of fins work',()=>{
      const item={id:'conor-guardian',kind:'set',reps:4,distance:50,stroke:'Breaststroke',raw:'4 x 50 Breaststroke with Fins',text:'4 x 50 Breaststroke with Fins',cues:[],pattern:[],repPattern:[],repInstructions:[],equipment:['Fins'],composition:[],restSeconds:10,cycleSeconds:null},ath={id:'conor-guardian-ath',full_name:'Conor Fischer'},state={adaptationProfiles:[],adaptationOverrides:[]},session={id:'conor-guardian-session',identity:{course:'SCM'}};
      const x=A.adaptItem(item,ath,state,session);assert(!(x.adaptiveStrokeChoices||[]).includes('Breaststroke'),'Breaststroke leaked into fins options');assert(/non-Breaststroke/i.test(x.raw),'known constraint not visible');return (x.adaptiveOptions||[]).map(o=>o.label).join(' / ');
    }));
    out.push(test('Past blank sessions are hidden while logged history remains visible',()=>{
      assert(typeof A?.hidePastBlank==='function','session visibility engine missing');const today='2026-08-21',blank={id:'blank',identity:{date:'2026-08-01'},blocks:[],currentSource:{text:''},changes:[]},logged={id:'logged',identity:{date:'2026-08-01'},blocks:[],currentSource:{text:''},changes:[],finish:{finishedAt:'2026-08-01T08:00:00Z'}};
      const oldNow=Date.now;assert(A.hidePastBlank(blank)===true,'past blank session remained visible');assert(A.hidePastBlank(logged)===false,'logged past session was hidden');return 'blank past hidden · delivered past retained';
    }));
    out.push(test('Calendar distinguishes planned, authored, delivered and not-logged slots',()=>{const c=A?.checks?.()||{};assert((c.calendarStatuses||[]).join('|')==='planned|authored|delivered|not_logged',(c.calendarStatuses||[]).join('|'));return 'planned → authored → delivered / not_logged';}));
    return out;
  }
  G.run=()=>{
    const base=baseRun()||{},retained=(base.tests||[]).filter(t=>!retired.has(text(t.name))),engine=[];
    if(M.engineAcceptance?.results?.length){for(const r of M.engineAcceptance.results)engine.push({name:`Engine · ${r.name}`,ok:r.ok===true,detail:r.detail||''});}
    else engine.push({name:'Engine acceptance suite executed',ok:false,detail:'engines/acceptance.js did not produce results'});
    const tests=[...retained,...engine,...currentContractTests()],passed=tests.filter(t=>t.ok===true).length;
    return {...base,build:BUILD,tests,passed,total:tests.length,ok:tests.length>0&&passed===tests.length,retiredTests:[...retired],contract:'20260821am'};
  };
  M.release=M.release||{};
  M.release.guardianGate=()=>{const runs=M.state?.guardian?.runs||[],r=[...runs].reverse().find(x=>x?.build===BUILD&&!x.deferred);return{build:BUILD,ok:!!r?.ok,passed:r?.passed||0,total:r?.total||0,ranAt:r?.at||null};};
  M.release.canCutover=()=>M.release.guardianGate().ok&&M.RELEASE_ATTESTATION?.softwareReady===true;
})(globalThis);
