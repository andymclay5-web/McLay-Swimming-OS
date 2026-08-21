'use strict';
(function(g){
  const M=g.MSOS4,T=M?.eyesUpTVAZ;if(!M?.guardian?.run||!T)return;
  const BUILD='v4-eyes-up-tv-20260822az',G=M.guardian,baseRun=G.run.bind(G),text=v=>String(v??'').replace(/\s+/g,' ').trim();
  M.BUILD=BUILD;M.CORE='20260822-eyes-up-tv-az';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:BUILD,softwareReady:false,generatedAt:new Date().toISOString(),note:'Eyes-up architecture plus swimmer-facing TV projection prototype. Guardian and physical poolside/Android acceptance required.'});
  const retired=new Set(['Eyes-up current candidate build is AY and remains unapproved','Guardian is running the current candidate build','Candidate attestation is locked until Guardian and phone acceptance']);
  const test=(name,fn)=>{try{const detail=fn();return{name,ok:true,detail:detail==null?'':String(detail)}}catch(e){return{name,ok:false,detail:e?.message||String(e)}}};
  const assert=(c,m)=>{if(!c)throw new Error(m||'assertion failed')};
  function tests(){const out=[];
    out.push(test('Eyes-up TV projection renders compact target bands',()=>{const html=T.targetHtml({targetBands:[{target:{kind:'pace',label:'1:43–1:47',sendOff:115},athletes:[{id:'a',full_name:'Henry Crump'}]}]});assert(/1:43–1:47/.test(html),'target range missing');assert(/Henry/.test(html),'athlete missing');return'target range + athlete';}));
    out.push(test('Eyes-up TV candidate remains release-blocked pending physical acceptance',()=>{assert(M.BUILD===BUILD,`runtime ${M.BUILD}`);assert(M.RELEASE_ATTESTATION?.build===BUILD,'attestation mismatch');assert(M.RELEASE_ATTESTATION?.softwareReady===false,'claimed ready early');return BUILD;}));
    return out;
  }
  G.run=()=>{const base=baseRun()||{},kept=(base.tests||[]).filter(t=>!retired.has(text(t.name))),all=[...kept,...tests()],passed=all.filter(x=>x.ok===true).length;return{...base,build:BUILD,tests:all,passed,total:all.length,ok:all.length>0&&passed===all.length,contract:'20260822az',retiredTests:[...new Set([...(base.retiredTests||[]),...retired])]};};
  M.release=M.release||{};M.release.guardianGate=()=>{const runs=M.state?.guardian?.runs||[],r=[...runs].reverse().find(x=>x?.build===BUILD&&!x.deferred);return{build:BUILD,ok:!!r?.ok,passed:r?.passed||0,total:r?.total||0,ranAt:r?.at||null};};M.release.canCutover=()=>M.release.guardianGate().ok&&M.RELEASE_ATTESTATION?.softwareReady===true;
})(globalThis);
