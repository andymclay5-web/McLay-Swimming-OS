'use strict';
(function(g){
  const M=g.MSOS4,Q=M?.amberAlignmentAS;if(!M?.guardian?.run||!Q)return;
  const BUILD='v4-para-mqs-stable-20260821as',G=M.guardian,baseRun=G.run.bind(G),text=v=>String(v??'').replace(/\s+/g,' ').trim();
  M.BUILD=BUILD;M.CORE='20260821-para-mqs-stable-as';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:BUILD,softwareReady:false,generatedAt:new Date().toISOString(),note:'Para MQS pathway + Amber pool-end stabilisation. Guardian and physical Android acceptance required.'});
  const retired=new Set(['Guardian is running the current candidate build','Candidate attestation is locked until Guardian and phone acceptance']);
  const test=(name,fn)=>{try{const detail=fn();return{name,ok:true,detail:detail==null?'':String(detail)}}catch(e){return{name,ok:false,detail:e?.message||String(e)}}};
  const assert=(c,m)=>{if(!c)throw new Error(m||'assertion failed')};
  function tests(){const out=[],ath={id:'amber-as',full_name:'Amber Proudfoot'},session={id:'as-session',identity:{course:'SCM'}},state={adaptationProfiles:[],adaptationOverrides:[]};
    out.push(test('Guardian is running the current candidate build',()=>{assert(M.BUILD===BUILD,`runtime ${M.BUILD}`);return BUILD;}));
    out.push(test('Candidate attestation is locked until Guardian and phone acceptance',()=>{assert(M.RELEASE_ATTESTATION?.build===BUILD,'attestation build mismatch');assert(M.RELEASE_ATTESTATION?.softwareReady===false,'candidate claimed ready early');return BUILD;}));
    out.push(test('Amber odd-length 75s preserve two-thirds profile and return to starting end',()=>{const item={id:'as75',kind:'set',reps:8,distance:75,stroke:'Choice',raw:'8 x 75 with Fins 50 technique / 25 fast',text:'8 x 75 with Fins 50 technique / 25 fast',cues:[],pattern:[],repPattern:[],repInstructions:[],equipment:['Fins'],composition:[],restSeconds:10,cycleSeconds:null},x=Q.adaptItem(item,ath,state,session);assert(x.reps===6,`reps ${x.reps}`);assert(((x.reps*x.distance/25)%2)===0,'not back at starting end');return `${x.reps}×${x.distance} · ${x.reps*x.distance}m · return-to-start`; }));
    return out;
  }
  G.run=()=>{const base=baseRun()||{},kept=(base.tests||[]).filter(t=>!retired.has(text(t.name))),all=[...kept,...tests()],passed=all.filter(x=>x.ok===true).length;return{...base,build:BUILD,tests:all,passed,total:all.length,ok:all.length>0&&passed===all.length,contract:'20260821as',retiredTests:[...new Set([...(base.retiredTests||[]),...retired])]};};
  M.release=M.release||{};M.release.guardianGate=()=>{const runs=M.state?.guardian?.runs||[],r=[...runs].reverse().find(x=>x?.build===BUILD&&!x.deferred);return{build:BUILD,ok:!!r?.ok,passed:r?.passed||0,total:r?.total||0,ranAt:r?.at||null};};M.release.canCutover=()=>M.release.guardianGate().ok&&M.RELEASE_ATTESTATION?.softwareReady===true;
})(globalThis);
