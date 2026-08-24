'use strict';
const assert=require('node:assert/strict');
const ath={id:'a1',full_name:'A One'};
global.MSOS4={state:{settings:{selectedAthleteId:'a1',pathwayCourse:'SCM'},athletes:[ath]},util:{text:v=>String(v??''),escape:v=>String(v??''),clock:v=>String(v??'')},performanceEngine:{rankedEvents:()=>[
  {course:'SCM',distance:400,stroke:'Freestyle',seconds:275.99,points:454},
  {course:'SCM',distance:400,stroke:'Freestyle',seconds:275.99,points:454},
  {course:'SCM',distance:400,stroke:'IM',seconds:313.58,points:419},
  {course:'SCM',distance:400,stroke:'IM',seconds:314.00,points:410}
],rows:()=>[
  {course:'SCM',distance:400,stroke:'Freestyle',seconds:275.99},
  {course:'SCM',distance:400,stroke:'Freestyle',seconds:276.40},
  {course:'SCM',distance:400,stroke:'IM',seconds:313.58}
],t400s:()=>({Freestyle:{stroke:'Freestyle',seconds:287.2,row:{course:'SCM'}}}),timed:()=>[]}};
require('../engines/swimmer-experience-cl.js');
const P=global.MSOS4.performanceEngine;
assert.equal(P.rankedEvents(ath,global.MSOS4.state,'SCM').length,2,'duplicate source rows must not duplicate performance ranking');
assert.equal(P.rows(ath,global.MSOS4.state,'SCM').length,2,'PB event count must mean unique events');
assert.equal(P.rows(ath,global.MSOS4.state,'SCM')[0].seconds,275.99,'fastest event evidence must survive dedupe');
assert.equal(global.MSOS4.swimmerExperienceCL.build,'v4-swimmer-context-unified-20260824cl');
console.log('SWIMMER_EXPERIENCE_CL_PASS');
