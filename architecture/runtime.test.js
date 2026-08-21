'use strict';
const assert=require('assert');
const Perf=require('./performance-core');
const {PoolsideRuntime}=require('./poolside-runtime');
(async()=>{
  const rows=[{course:'SCM',distance:400,stroke:'Freestyle',seconds:240,points:600,source:'a'},{course:'SCM',distance:400,stroke:'Freestyle',seconds:240,points:600,source:'b'},{course:'SCM',distance:100,stroke:'Butterfly',seconds:61,points:650}];
  const pbs=Perf.dedupePBs(rows);assert.equal(pbs.length,2);assert.equal(pbs.find(x=>x.distance===400).provenance.length,2);assert.equal(Perf.rankedEvents(pbs)[0].pb.distance,100);
  const session={id:'s',identity:{date:'2026-08-22',time:'05:30'},blocks:[{id:'b',title:'Main Set',items:[{id:'i',kind:'set',reps:4,distance:100,cycleSeconds:90,raw:'4 x 100'}]}]};
  const r=new PoolsideRuntime({session,athletes:[{id:'h',full_name:'Henry Crump'}],clock:()=>1000000,adapters:{queryPB:({athlete,event})=>({speak:`${athlete.full_name} ${event.distance} ${event.stroke} 1:01.0`}),queryTargets:({athlete})=>({speak:`${athlete.full_name} target 1:20`}),queryMedia:()=>({speak:'video',id:'v1'}),publishTV:()=>true}});
  let x=await r.handleTranscript('Henry 100 fly PB');assert.equal(x.result.ok,true);assert.equal(x.result.destination,'private_earbud');
  x=await r.handleTranscript('Henry fourth 50 34.2 stroke rate 56');assert.equal(r.evidence.raw.length,1);assert.equal(r.evidence.raw[0].metrics.strokeRate,56);
  x=await r.handleTranscript('TV Henry last freestyle video');assert.equal(x.result.destination,'tv');
  const report=r.finish();assert.equal(report.evidenceCount,1);assert(r.events.forSession('s').some(e=>e.type==='session_finished'));
  console.log('runtime-aw: performance dedupe and end-to-end voice/context/evidence flow passed');
})().catch(e=>{console.error(e);process.exit(1);});
