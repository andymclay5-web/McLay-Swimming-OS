'use strict';
const assert=require('node:assert/strict');
const Evidence=require('../engines/evidence.js');
global.MSOSEngines={Evidence};
const Modification=require('../engines/modification.js');
global.MSOSEngines.Modification=Modification;

global.MSOS4={
  state:{settings:{},guardian:{runs:[]}},
  guardian:{run:()=>({build:'old',tests:[
    {name:'No evidence means no fake target',ok:false,detail:'fake target produced'},
    {name:'Swimmer hub is five simple tabs',ok:true,detail:'old'},
    {name:'Engine · Reduced IM uses performance-relative send-off and stays connected to the group set window',ok:false,detail:'old'},
    {name:'Engine · Reduced IM uses performance-relative send-off and stays connected to the group set window',ok:false,detail:'duplicate'},
    {name:'Phone acceptance · McKenzie 50 kick keeps authored cycle and Desc 1-3',ok:false,detail:'lost'},
    {name:'Unaffected contract',ok:true,detail:'kept'}
  ],passed:2,total:6,ok:false})},
  store:{save:s=>s},storageEngine:{saveUi:()=>{}},
  targets:{t400:()=>null,forItem:()=>({status:'ok',seconds:72,source:'fake fallback'})},
  parser:{parse:()=>({identity:{course:'SCM'},blocks:[{items:[{kind:'set',reps:4,distance:100,stroke:'Freestyle',raw:'4 x 100 Threshold',text:'4 x 100 Threshold',cues:[]}]}]})},
  swimmerInstantOpenCN:{build:'v4-swimmer-surface-20260824co',renderFast:()=>true},
  swimmerTabsUI:{build:'v4-swimmer-deck-only-20260824cp'},
  swimmerExperienceCL:{disabled:true},performanceEngine:{pathwayUIck:{disabled:true}},
  util:{escape:String,clock:n=>String(n)},release:{deviceAccepted:()=>false}
};
require('../engines/guardian-runtime.js');
const M=global.MSOS4,E=global.MSOSEngines;

const kick={id:'kick',kind:'set',reps:12,distance:50,stroke:'Choice',raw:'12 x 50 Kick @ 1:10',text:'12 x 50 Kick @ 1:10',cues:['Desc 1-3 @ 1:10'],pattern:[],repPattern:[],repInstructions:[],equipment:[],composition:[],restSeconds:10,cycleSeconds:70};
const k=E.Modification.adaptItem(kick,{id:'mk',full_name:'McKenzie Drage'},{adaptationProfiles:[],adaptationOverrides:[]},{id:'s',identity:{course:'SCM'}});
assert.equal(k.reps,8);assert.equal(k.cycleSeconds,70);assert.match([k.raw,...(k.cues||[])].join(' | '),/Desc 1-3/i);assert.doesNotMatch((k.cues||[]).join(' | '),/Desc 1-8/i);
const target=M.targets.forItem({identity:{course:'SCM'}},{kind:'set',reps:4,distance:100,stroke:'Freestyle',raw:'4 x 100 Threshold',text:'4 x 100 Threshold',cues:[]},{id:'none'},{trainingTestTypes:[],trainingTestResults:[]});
assert.equal(target.status,'missing');
const run=M.guardianRuntime.fullRun();
assert.equal(run.build,'v4-guardian-live-contract-20260824cr');
assert.equal(run.tests.some(x=>x.name==='Swimmer hub is five simple tabs'),false);
assert.equal(run.tests.filter(x=>x.name==='Current reduced IM uses performance-relative send-off and stays connected to the group set window').length,1);
assert.equal(run.tests.find(x=>x.name==='Current live target contract · no evidence means no fake target')?.ok,true);
assert.equal(run.tests.find(x=>x.name==='Current phone contract · McKenzie 50 kick keeps authored cycle and repeating Desc 1-3')?.ok,true);
assert.equal(run.tests.find(x=>x.name==='Current reduced IM uses performance-relative send-off and stays connected to the group set window')?.ok,true);
console.log('LIVE_CONTRACT_CR_PASS',run.passed+'/'+run.total);
