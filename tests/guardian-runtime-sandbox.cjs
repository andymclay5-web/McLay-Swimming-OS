'use strict';
const assert=require('node:assert/strict');

const persisted=[];
globalThis.MSOS4={
  BUILD:'fixture-build',
  util:{clone:v=>JSON.parse(JSON.stringify(v))},
  state:{
    schema:4,
    settings:{activeRole:'owner',activeUserAthleteId:'',view:'guardian'},
    athletes:[{id:'real',full_name:'Real Athlete'}],
    guardian:{runs:[]}
  },
  live:{suppress:false},
  store:{save(state){persisted.push(JSON.parse(JSON.stringify(state)));return state;}},
  ui:{},
  toast:()=>{},
  guardian:{
    run(){
      // Model the exact dangerous Guardian fixture pattern: switch to a fake swimmer,
      // replace the athlete list, then save while the test is in that temporary state.
      globalThis.MSOS4.state.settings.activeRole='swimmer';
      globalThis.MSOS4.state.settings.activeUserAthleteId='sa';
      globalThis.MSOS4.state.athletes=[{id:'sa',full_name:'Swimmer A'},{id:'sb',full_name:'Swimmer B'}];
      globalThis.MSOS4.store.save(globalThis.MSOS4.state);
      return {ok:true,tests:[{name:'fixture',ok:true,detail:''}],passed:1,total:1,at:'2026-08-22T03:45:00Z',build:'fixture-build'};
    }
  }
};

require('../engines/guardian-runtime.js');
const M=globalThis.MSOS4;
const result=M.guardian.runAndRender();

assert.equal(result.ok,true);
assert.equal(M.state.settings.activeRole,'owner','Guardian leaked swimmer role into live state');
assert.equal(M.state.settings.activeUserAthleteId,'','Guardian leaked dummy swimmer id');
assert.deepEqual(M.state.athletes,[{id:'real',full_name:'Real Athlete'}],'Guardian leaked fixture athlete roster');
assert.equal(M.live.suppress,false,'live suppression was not restored');
assert.equal(M.state.guardian.runs.length,1,'real Guardian result was not retained after sandbox restore');
assert.equal(persisted.length,1,'temporary Guardian fixture state reached persistent storage');
assert.equal(persisted[0].settings.activeRole,'owner','persisted snapshot contains swimmer fixture role');
assert.equal(persisted[0].athletes[0].full_name,'Real Athlete','persisted snapshot contains Swimmer A fixture');
console.log('PASS Guardian runtime fixtures cannot persist or broadcast into live swimmer state');
