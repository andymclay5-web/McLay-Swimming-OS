'use strict';
const assert=require('node:assert/strict');
const E=require('../engines/evidence.js');
global.MSOSEngines={Evidence:E};
const A=require('../engines/aerobic.js');

// SCM and LCM T400 results are not directly comparable (different turn frequency, different
// pacing). Regression for writer-map fix #8: evidence.js -> aerobic.js -> bridge.js previously had
// no course parameter anywhere in the T400 anchor chain, so a newer LCM test could silently
// outrank an older, more relevant SCM anchor for a normal SCM training session (or vice versa).
const ath={id:'sw',full_name:'Test Swimmer'};
const state={
  athletes:[ath],
  trainingTestTypes:[{id:'t400',test_key:'T400 Freestyle'}],
  trainingTestResults:[
    {id:'lcm-newer-slower',athlete_id:'sw',test_type_id:'t400',result_seconds:500,result_date:'2026-08-25',stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test',pool_course:'LCM'},
    {id:'scm-older',athlete_id:'sw',test_type_id:'t400',result_seconds:450,result_date:'2026-06-01',stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test',pool_course:'SCM'}
  ]
};

// Legacy callers that pass no course still get the pre-fix "newest across both courses" behaviour
// (no context to filter on) -- this must keep working exactly as before.
let rows=E.t400Rows(ath,state,'Freestyle');
assert.equal(rows[0].id,'lcm-newer-slower','no course context: newest valid test across all courses still wins');

// A caller that supplies a course must never see the other course's evidence pooled in.
rows=E.t400Rows(ath,state,'Freestyle','SCM');
assert.equal(rows[0].id,'scm-older','SCM anchor must resolve from SCM evidence only, not a newer LCM test');
rows=E.t400Rows(ath,state,'Freestyle','LCM');
assert.equal(rows[0].id,'lcm-newer-slower','LCM anchor must resolve from LCM evidence only');

// A course-less legacy row defaults to SCM (the normal training pool), matching the existing
// convention already used by v4-correct.js's own T400 selector.
const legacyState={...state,trainingTestResults:[{id:'no-course',athlete_id:'sw',test_type_id:'t400',result_seconds:470,result_date:'2026-08-01',stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test'}]};
rows=E.t400Rows(ath,legacyState,'Freestyle','SCM');
assert.equal(rows[0]?.id,'no-course','a course-less legacy T400 row must default to SCM, not disappear from the SCM anchor');
rows=E.t400Rows(ath,legacyState,'Freestyle','LCM');
assert.equal(rows.length,0,'a course-less legacy row must not also satisfy an LCM request');

// End-to-end through aerobic.js: session.identity.course must actually reach the T400 selector.
const sessionSCM={id:'s1',identity:{course:'SCM'}},sessionLCM={id:'s2',identity:{course:'LCM'}};
const item={id:'aer',kind:'set',reps:1,distance:200,stroke:'Freestyle',zone:'Regeneration',restSeconds:10,raw:'1 x 200 Freestyle Regeneration'};
let out=A.forItem(sessionSCM,item,ath,state,'');
assert.match(out.source,/7:30/,'SCM session must drive the Regeneration target from the SCM 7:30 anchor');
out=A.forItem(sessionLCM,item,ath,state,'');
assert.match(out.source,/8:20/,'LCM session must drive the Regeneration target from the LCM 8:20 anchor');

console.log('T400_COURSE_ISOLATION_PASS SCM/LCM T400 evidence no longer silently pooled together');
