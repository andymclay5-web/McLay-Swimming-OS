'use strict';
const assert=require('node:assert/strict');
const I=require('./interaction-core');
const O=require('./athlete-observation-core');
const R=require('./athlete-report-core');

const amber={id:'amber',full_name:'Amber Proudfoot',squad:'Development'};
const session={id:'sat',identity:{date:'2026-08-22',title:'Saturday AM',squads:['Development'],course:'SCM'},blocks:[{id:'main',title:'Main Set',items:[{id:'f50',kind:'set',reps:6,distance:50,stroke:'Freestyle',raceIntent:{distance:200},raw:'6 x 50 @ 200 Pace'}]}],finish:{throughItemId:'f50',throughBlockId:'main'}};
const context={sessionId:'sat',blockId:'main',itemId:'f50'};

const parsed=I.parseDeterministic('Amber sr 32 45.3',{athletes:[amber],context});
assert.equal(parsed.intent,'capture_metric_note');
assert.equal(parsed.athlete.id,'amber');
assert.equal(parsed.payload.metrics.strokeRate,32);
assert.equal(parsed.payload.metrics.timeSeconds,45.3);
assert.equal(parsed.context.itemId,'f50');
const spoken=I.metrics('sr 31 44 point 8 rpe 7');
assert.equal(spoken.strokeRate,31);
assert.equal(spoken.timeSeconds,44.8);
assert.equal(spoken.rpe,7);

const coachVoice={id:'coach-v1',createdAt:1,authorId:'coach',source:'coach_voice',type:'voice',athleteIds:['amber'],context,raw:{text:'Amber sr 32 45.3'},metrics:{strokeRate:32,timeSeconds:45.3}};
const self=O.athleteSelfEvidence({id:'self-1',athleteId:'amber',sessionId:'sat',blockId:'main',itemId:'f50',timesSeconds:[45.1,44.9],rpe:7,feeling:'Strong but last one hurt',comment:'Held body line better',createdAt:100,observedAt:50});
const laterCoachNote={id:'later-note',createdAt:200,authorId:'coach',source:'coach_note',type:'note',athleteIds:['amber'],context:{},raw:{text:'Keep building pressure through the back of the stroke'},metrics:{}};
const attendance=[{session_id:'sat',athlete_id:'amber',status:'modified'}];
const prescribe=(s,item,a)=>({item:{...item,reps:4,raw:'4 x 50 Upper-body choice @ 200 Pace'},target:{status:'rep_race',rows:[{rep:1,status:'ok',seconds:45},{rep:2,status:'ok',seconds:45},{rep:3,status:'ok',seconds:45},{rep:4,status:'ok',seconds:45}]}});
const projection=R.athleteSessionProjection({session,athlete:amber,attendance,prescribe,captures:[coachVoice,self,laterCoachNote]});
const line=projection.blocks[0].items[0];
assert.match(line.label,/Upper-body choice/);
assert.equal(line.observations.length,2,'coach voice + swimmer self-report should nest under this set');
assert.equal(line.observations[0].source,'coach_voice');
assert.equal(line.observations[1].source,'athlete_self');
assert.equal(line.performanceSummary.entries,2);
assert.equal(line.performanceSummary.time.values.length,3,'one coach observation plus two athlete-entered times');
assert.equal(line.performanceSummary.time.best,44.9);
assert.equal(line.performanceSummary.strokeRate.values[0],32);
assert.equal(line.performanceSummary.rpe.values[0],7);
assert.equal(line.performanceSummary.completeness,'partial','partial observations must not claim whole-set performance');
assert(line.performanceSummary.feelings.includes('Strong but last one hurt'));
assert(line.performanceSummary.notes.some(x=>/Held body line/.test(x)));

const report=R.athleteReport({athlete:amber,sessions:[session],attendance,prescribe,captures:[coachVoice,self,laterCoachNote],asOf:new Date('2026-08-22T12:00:00Z')});
assert.equal(report.profileEvidence.length,1,'coach notes added outside a session stay on the athlete timeline');
assert.equal(report.profileEvidence[0].id,'later-note');
assert.equal(report.evidenceCount,3);
assert.equal(report.projections[0].blocks[0].items[0].observations.length,2);
assert.equal(R.captureContext(coachVoice).itemId,'f50','nested architecture context must be respected');
console.log('athlete-observation-bf: 24 assertions passed');
