const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

globalThis.MSOS4={state:{adaptationOverrides:[]}};
globalThis.MSOSEngines={Modification:{
  adaptItem(item,ath,state,session){
    const out=JSON.parse(JSON.stringify(item));
    const ov=(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false);
    if(ov?.patch)Object.assign(out,ov.patch);
    return out;
  },
  profile(ath){
    if(/mckenzie|mackenzie/i.test(ath.full_name))return{ratio:2/3};
    if(/charlotte/i.test(ath.full_name))return{ratio:.5};
    return{ratio:.75};
  }
}};
vm.runInThisContext(fs.readFileSync('engines/training-mod-integrity.js','utf8'),{filename:'engines/training-mod-integrity.js'});
const adapt=globalThis.MSOSEngines.Modification.adaptItem;
const session={id:'s1'};
const kick={id:'kick',kind:'set',raw:'5 x 50 Kick Build @ 1:00',text:'5 x 50 Kick Build @ 1:00',reps:5,distance:50,cycleSeconds:60,cues:[]};
let out=adapt(kick,{id:'md',full_name:'McKenzie Drage'},globalThis.MSOS4.state,session);
assert.equal(out.cycleSeconds,90,'McKenzie 50 kick must not stay on 1:00');
assert.match(out.raw,/@ 1:30/,'McKenzie displayed cycle must become 1:30');
out=adapt(kick,{id:'cm',full_name:'Charlotte Murphy'},globalThis.MSOS4.state,session);
assert.equal(out.cycleSeconds,135,'Charlotte 50 kick baseline must remain 2:15');
const timed={id:'t1',kind:'set',raw:'4 x 100 Freestyle @ 1:00',text:'4 x 100 Freestyle @ 1:00',reps:4,distance:100,cycleSeconds:60,targetSeconds:62,restSeconds:10,cues:[]};
out=adapt(timed,{id:'x',full_name:'Modified Swimmer'},globalThis.MSOS4.state,session);
assert.equal(out.cycleSeconds,75,'send-off must be slower than target and preserve minimum rest');
globalThis.MSOS4.state.adaptationOverrides=[{sessionId:'s1',itemId:'kick',athleteId:'md',active:true,patch:{cycleSeconds:100}}];
out=adapt(kick,{id:'md',full_name:'McKenzie Drage'},globalThis.MSOS4.state,session);
assert.equal(out.cycleSeconds,100,'explicit coach timing override must win');
console.log('TRAINING_MOD_INTEGRITY_PASS McKenzie=1:30 Charlotte=2:15 timing-gate=1:15 override=1:40');
