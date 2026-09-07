'use strict';
const assert=require('node:assert/strict');
const calls=[];
global.MSOSEngines={
  RaceTargetIntent:{resolve:item=>item},
  Evidence:{stroke:s=>s},
  RacePace:{forItem:(session,item,athlete)=>{calls.push({session,item,athlete});return{status:'ok',seconds:Number(item.distance)/2,sendOff:item.cycleSeconds||null,source:`${athlete.id} race evidence`,stroke:'Butterfly',raceModel:true};}},
  Aerobic:{forItem:()=>({status:'none'})},
  Modification:{
    profile:ath=>({ratio:ath.id==='charlotte'?0.5:1}),
    adaptItem:(item,ath)=>ath.id==='charlotte'?{...item,distance:25,raw:'4x25 #1 @100p @1:30',text:'4x25 #1 @100p @1:30'}:{...item}
  },
  TrainingPolicy:{safeCycle:()=>null}
};
global.MSOS4={state:{settings:{view:'board'}}};
const Coordinator=require('../engines/coordinator.js');
const Policy=require('../engines/training-prescription-policy.js');
const session={id:'s1',identity:{course:'SCM'}};
const item={id:'i1',kind:'set',reps:4,distance:50,raw:'4x50 #1 @100p @1:30',text:'4x50 #1 @100p @1:30',cycleSeconds:90,raceIntent:{distance:100},repInstructions:[],repPattern:[],cues:[]};
const main={id:'mainstream',full_name:'Main Stream'};
const charlotte={id:'charlotte',full_name:'Charlotte Murphy'};

const mainRx=Coordinator.prescription(session,item,main,{settings:{storageRevision:1},adaptationOverrides:[]});
const modRx=Coordinator.prescription(session,item,charlotte,{settings:{storageRevision:1},adaptationOverrides:[]});
assert.equal(calls[0].athlete.id,'mainstream','mainstream race target must use that swimmer evidence');
assert.equal(calls[0].item.distance,50,'mainstream target uses canonical repeat distance');
assert.equal(calls[1].athlete.id,'charlotte','modified race target must still use that swimmer evidence');
assert.equal(calls[1].item.distance,25,'race target must recalculate from the modified repeat distance');
assert.deepEqual(calls[1].item.raceIntent,{distance:100},'modification must retain race-event intent');
assert.equal(mainRx.target.seconds,25);
assert.equal(modRx.target.seconds,12.5);

const policyItem={kind:'set',distance:50,cycleSeconds:90,raceIntent:{distance:100},raw:'4x50 @100p @1:30'};
const full=Policy.safeCycle({item:policyItem,targetSeconds:30,referenceWorkSeconds:30,athlete:main,volumeRatio:1});
const reduced=Policy.safeCycle({item:policyItem,targetSeconds:30,referenceWorkSeconds:30,athlete:charlotte,volumeRatio:0.5});
assert.equal(reduced.cycleSeconds,full.cycleSeconds,'volume ratio must not create a different race-pace speed/send-off by itself');
assert.equal(reduced.restSeconds,full.restSeconds,'volume ratio must not scale race-pace recovery by itself');
console.log('MODIFIED_RACE_PACE_WIRING_20260907_PASS');
