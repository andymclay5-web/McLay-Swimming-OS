'use strict';
const assert=require('node:assert/strict');
const A=require('./adaptation-evidence-core.js');

const f=A.speedFactor(201,158);
assert.ok(Math.abs(f-(158/201))<1e-12);
assert.ok(Math.abs(f-0.7860696517)<1e-6);

let x=A.nearestPracticalDistance({baseDistance:200,factor:f,poolLength:25,reps:1,returnToStart:false});
assert.equal(x.distance,150);
x=A.nearestPracticalDistance({baseDistance:100,factor:f,poolLength:25,reps:2,returnToStart:true});
assert.equal(x.distance,75);

const ref=A.workRest(79,95);
assert.equal(ref.restSeconds,16);
assert.ok(ref.workRestRatio>4.9&&ref.workRestRatio<5.0);

const matched=A.cycleForWorkRest(75.4,79,95);
assert.equal(matched,90);
const mod=A.workRest(75.4,matched);
assert.ok(Math.abs(mod.workRestRatio-ref.workRestRatio)<0.3);

const plan=A.planLine({
  baseDistance:100,
  baseReps:6,
  baseCycleSeconds:95,
  poolLength:25,
  returnToStart:false,
  referenceTargetSeconds:79,
  athleteTargets:{25:25.1,50:50.3,75:75.4,100:100.5},
  athleteAnchorSeconds:201,
  referenceAnchorSeconds:158,
  evidenceSource:'SCM 200 Free PB comparison',
  targetSource:'Race pace model'
});
assert.equal(plan.mode,'evidence');
assert.equal(plan.distance,75);
assert.equal(plan.reps,6);
assert.equal(plan.targetSeconds,75.4);
assert.equal(plan.cycleSeconds,90);
assert.equal(plan.cycleSource,'matched-work-rest');
assert.ok(Math.abs(plan.speedFactor-f)<1e-12);
assert.equal(plan.targetSource,'Race pace model');
assert.doesNotMatch(plan.targetSource,/John Pike/i);

const fallback=A.planLine({baseDistance:100,baseReps:6,baseCycleSeconds:95,fallbackLoadRatio:2/3,targetDriven:true});
assert.equal(fallback.mode,'fallback-load');
assert.equal(fallback.distance,100);
assert.equal(fallback.cycleSeconds,95);
assert.equal(fallback.targetSeconds,null);
assert.equal(fallback.targetRequired,true);

const record=A.decisionRecord({sessionId:'s1',itemId:'i1',athleteId:'mckenzie',plan,evidenceIds:['pb:mck:200fr','group:200fr'],createdAt:'2026-08-23T09:14:00+12:00'});
assert.equal(record.historicalImmutable,true);
assert.equal(record.recalculateFutureFromLatestEvidence,true);
assert.deepEqual(record.evidenceIds,['pb:mck:200fr','group:200fr']);
assert.equal(record.plan.distance,75);

console.log('adaptation-evidence-bf: 25 assertions passed');
