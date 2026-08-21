'use strict';
(function(g){
  const M=g.MSOS4,A=M?.amberRatioAP;if(!M?.guardian?.run||!A)return;
  const BUILD='v4-amber-ratio-20260821ap',G=M.guardian,baseRun=G.run.bind(G);
  M.BUILD=BUILD;M.CORE='20260821-amber-ratio-ap';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:BUILD,softwareReady:false,generatedAt:new Date().toISOString(),note:'Phone acceptance candidate with Amber volume/time correction. Guardian and physical Android acceptance required.'});
  const test=(name,fn)=>{try{const detail=fn();return{name,ok:true,detail:detail==null?'':String(detail)}}catch(e){return{name,ok:false,detail:e?.message||String(e)}}};
  const assert=(c,m)=>{if(!c)throw new Error(m||'assertion failed')};
  function item(id,mode=''){return{id,kind:'set',reps:5,distance:50,stroke:'Choice',raw:'5 x 50 Kick @ 1:00',text:'5 x 50 Kick @ 1:00',cues:['Kick Build @ 1:00'],pattern:[],repPattern:[],repInstructions:[],equipment:[],composition:[],restSeconds:0,cycleSeconds:60,_mode:mode};}
  function stateFor(id,mode){return{adaptationProfiles:[],adaptationOverrides:mode?[{sessionId:'ap-session',itemId:id,athleteId:'amber-ap',active:true,patch:{adaptiveMode:mode}}]:[]};}
  function tests(){const out=[],ath={id:'amber-ap',full_name:'Amber Proudfoot'},session={id:'ap-session',identity:{course:'SCM'}};
    out.push(test('Amber non-target upper-body options keep the 2/3 volume profile',()=>{const x=A.adaptItem(item('ap-paddles'),ath,stateFor('ap-paddles','Paddles'),session);assert(x.reps===3,`reps ${x.reps}`);assert(Number(x.cycleSeconds)===100,`cycle ${x.cycleSeconds}`);return `5×50 @1:00 → ${x.reps}×50 @${M.util.clock(x.cycleSeconds)}`;}));
    out.push(test('Amber Scull keeps 2/3 volume and only then applies the 2:00 minimum',()=>{const x=A.adaptItem(item('ap-scull'),ath,stateFor('ap-scull','Scull'),session);assert(x.reps===3,`reps ${x.reps}`);assert(Number(x.cycleSeconds)===120,`cycle ${x.cycleSeconds}`);const base=5*60,actual=x.reps*x.cycleSeconds;assert(actual-base===60,`block drift ${actual-base}s`);return `3×50 Scull @2:00 · +1:00 block drift, not +5:00`;}));
    out.push(test('Amber start turn finish remains full team skill work',()=>{const s={...item('ap-skill'),reps:1,distance:50,raw:'50 · 15m Start @ 0:30 · 20m Turn @ 0:40 · 15m Finish',text:'50 · 15m Start @ 0:30 · 20m Turn @ 0:40 · 15m Finish',cycleSeconds:null,cues:[]},x=A.adaptItem(s,ath,stateFor('ap-skill',''),session);assert(x.reps===1&&x.distance===50,`${x.reps}×${x.distance}`);return '50m full team skill retained';}));
    out.push(test('Amber T400/PB-driven work is recognised as target-engine work',()=>{const aerobic={...item('ap-t400'),reps:2,distance:400,raw:'2 x 400 Fr · 10sr',text:'2 x 400 Fr · 10sr',zone:'Development',repPattern:[{rep:1,zone:'Regeneration'},{rep:2,zone:'Development'}]},race={...item('ap-pb'),reps:4,distance:50,raw:'4 x 50 100 Fly race pace',text:'4 x 50 100 Fly race pace',raceIntent:{distance:100,eventStroke:'Butterfly'}};assert(A.evidenceMeasured(aerobic),'T400 work not recognised');assert(A.evidenceMeasured(race),'PB race-pace work not recognised');return 'T400 aerobic + PB race pace routed to target engines';}));
    return out;}
  G.run=()=>{const base=baseRun()||{},all=[...(base.tests||[]),...tests()],passed=all.filter(x=>x.ok===true).length;return{...base,build:BUILD,tests:all,passed,total:all.length,ok:all.length>0&&passed===all.length,contract:'20260821ap'};};
  M.release=M.release||{};M.release.guardianGate=()=>{const runs=M.state?.guardian?.runs||[],r=[...runs].reverse().find(x=>x?.build===BUILD&&!x.deferred);return{build:BUILD,ok:!!r?.ok,passed:r?.passed||0,total:r?.total||0,ranAt:r?.at||null};};M.release.canCutover=()=>M.release.guardianGate().ok&&M.RELEASE_ATTESTATION?.softwareReady===true;
})(globalThis);
