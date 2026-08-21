'use strict';
const assert=require('assert');
const Learn=require('./timeline-learning-core');
const Rep=require('./replication-core');
const Consent=require('./consent-core');
const items={a:{id:'a',raw:'3 x 200 Development',zone:'Development'},b:{id:'b',raw:'4 x 25 Max',raceIntent:{distance:100}}};const events=[{type:'item_started',itemId:'a',occurredAt:1000},{type:'item_completed',itemId:'a',occurredAt:301000,payload:{plannedDurationSeconds:240}},{type:'item_started',itemId:'b',occurredAt:331000},{type:'item_completed',itemId:'b',occurredAt:391000,payload:{plannedDurationSeconds:50}}];const samples=Learn.samplesFromEvents({itemsById:items,events});const prof=Learn.learn(samples);assert(prof.durationFactor.aerobic>1);assert.equal(prof.transitionSeconds.change_mode,30);
const out=Rep.createOutbox(),row=Rep.enqueue(out,{id:'e1'});assert.equal(Rep.pending(out).length,1);Rep.markSynced(out,row.id);assert.equal(Rep.pending(out).length,0);assert.equal(Rep.liveBoardPullPolicy({view:'board'}).allow,false);assert.equal(Rep.mergeAppendOnly([{id:'a',createdAt:1}],[{id:'a',createdAt:1},{id:'b',createdAt:2}]).length,2);
const c=Consent.profile({audioAllowed:true,videoAllowed:true,teamDisplay:false,externalProcessing:false});assert.equal(Consent.canCapture(c,'conversation').ok,true);assert.equal(Consent.canRoute(c,'tv').ok,false);assert.equal(Consent.canRoute(c,'cloud_ai').ok,false);
console.log('learning-sync-ax: timeline learning, replication and consent contracts passed');
