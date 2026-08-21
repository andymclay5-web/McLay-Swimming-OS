'use strict';
(function(g){
  const M=g.MSOS4,Q=M?.amberAlignmentAQ;if(!M?.guardian?.run||!Q)return;
  const BUILD='v4-amber-alignment-20260821aq',G=M.guardian,baseRun=G.run.bind(G),text=v=>String(v??'').replace(/\s+/g,' ').trim();
  M.BUILD=BUILD;M.CORE='20260821-amber-alignment-aq';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:BUILD,softwareReady:false,generatedAt:new Date().toISOString(),note:'Current candidate. Guardian and physical Android acceptance required.'});
  const retired=new Set(['Guardian is running the current candidate build','Candidate attestation is locked until Guardian and phone acceptance']);
  const test=(name,fn)=>{try{const detail=fn();return{name,ok:true,detail:detail==null?'':String(detail)}}catch(e){return{name,ok:false,detail:e?.message||String(e)}}};
  const assert=(c,m)=>{if(!c)throw new Error(m||'assertion failed')};
  function tests(){const out=[],ath={id:'amber-aq',full_name:'Amber Proudfoot'},session={id:'aq-session',identity:{course:'SCM'}};
    out.push(test('Guardian is running the current candidate build',()=>{assert(M.BUILD===BUILD,`runtime ${M.BUILD}`);return BUILD;}));
    out.push(test('Candidate attestation is locked until Guardian and phone acceptance',()=>{assert(M.RELEASE_ATTESTATION?.build===BUILD,'attestation build mismatch');assert(M.RELEASE_ATTESTATION?.softwareReady===false,'candidate claimed ready early');return BUILD;}));
    out.push(test('Amber upper-body 75s retain two-thirds volume and return to starting end',()=>{const item={id:'aq-75',kind:'set',reps:8,distance:75,stroke:'Choice',raw:'8 x 75 with Fins 50 technique / 25 fast',text:'8 x 75 with Fins 50 technique / 25 fast',cues:[],pattern:[],repPattern:[],repInstructions:[],equipment:['Fins'],composition:[],restSeconds:10,cycleSeconds:null},state={adaptationProfiles:[],adaptationOverrides:[]},x=Q.adaptItem(item,ath,state,session);assert(x.reps===6,`reps ${x.reps}`);assert(((x.reps*x.distance/25)%2)===0,'not back at starting end');assert(/Upper-body/i.test(x.raw),x.raw);return `${x.reps}×${x.distance} · pool-end aligned`;}));
    out.push(test('Amber Scull ratio rule remains intact after pool-end alignment',()=>{const item={id:'aq-scull',kind:'set',reps:5,distance:50,stroke:'Choice',raw:'5 x 50 Kick @ 1:00',text:'5 x 50 Kick @ 1:00',cues:['Kick Build @ 1:00'],pattern:[],repPattern:[],repInstructions:[],equipment:[],composition:[],restSeconds:0,cycleSeconds:60},state={adaptationProfiles:[],adaptationOverrides:[{sessionId:'aq-session',itemId:'aq-scull',athleteId:'amber-aq',active:true,patch:{adaptiveMode:'Scull'}}]},x=Q.adaptItem(item,ath,state,session);assert(x.reps===3,`reps ${x.reps}`);assert(Number(x.cycleSeconds)===120,`cycle ${x.cycleSeconds}`);return '3×50 Scull @2:00';}));
    return out;}
  G.run=()=>{const base=baseRun()||{},kept=(base.tests||[]).filter(t=>!retired.has(text(t.name))),all=[...kept,...tests()],passed=all.filter(x=>x.ok===true).length;return{...base,build:BUILD,tests:all,passed,total:all.length,ok:all.length>0&&passed===all.length,contract:'20260821aq',retiredTests:[...new Set([...(base.retiredTests||[]),...retired])]};};
  M.release=M.release||{};M.release.guardianGate=()=>{const runs=M.state?.guardian?.runs||[],r=[...runs].reverse().find(x=>x?.build===BUILD&&!x.deferred);return{build:BUILD,ok:!!r?.ok,passed:r?.passed||0,total:r?.total||0,ranAt:r?.at||null};};M.release.canCutover=()=>M.release.guardianGate().ok&&M.RELEASE_ATTESTATION?.softwareReady===true;
})(globalThis);
