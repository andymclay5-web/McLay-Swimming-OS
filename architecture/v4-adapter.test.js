'use strict';
const assert=require('assert');
const Performance=require('./performance-core');
const SwimmerDeck=require('./swimmer-deck-core');
const V4=require('./v4-adapter-core');
const athlete={id:'seth',full_name:'Seth Doe'};const session={id:'s',identity:{course:'SCM'},blocks:[{id:'b',title:'Main Set',items:[{id:'i',kind:'set',reps:3,distance:50,raceIntent:{distance:200},raw:'3 x 50 Fly @ 200 Pace'}]}]};
const M={state:{athletes:[athlete],settings:{}},currentSession:()=>session,util:{clock:s=>s===61?'1:01':String(s)},actions:{openCapture:x=>{M.opened=x}}};
const E={Evidence:{pbRows:()=>[{course:'SCM',distance:100,stroke:'Butterfly',seconds:61,points:650},{course:'SCM',distance:100,stroke:'Butterfly',seconds:61,points:650}]},Coordinator:{prescription:(_s,item)=>({item,target:{status:'ok',seconds:30.5,sendOff:60}})}};
const a=V4.create({M,E,Performance,SwimmerDeck});assert.equal(a.dedupedPBs(athlete).length,1);assert.equal(a.queryPB({athlete,event:{distance:100,stroke:'Butterfly'}}).pb.seconds,61);assert(a.queryTargets({athlete,context:{itemId:'i'}}).speak.includes('Target'));assert.equal(a.resolveContextLabel('starting Main Set').blockId,'b');a.openVideo({athlete,context:{blockId:'b',itemId:'i'}});assert.equal(M.opened.athleteId,'seth');console.log('v4-adapter-ax: current v4 adapter contracts passed');
