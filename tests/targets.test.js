'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Evidence=require('../engines/evidence-retrieval.js');
const Targets=require('../engines/targets.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const sessionId={id:'target-session',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National','Development'],venue:'AquaGym'};

function evidence(){return Evidence.create({sources:[
 {id:'verified',priority:100,trust:'verified',data:{
  athletes:[
   {id:'molly',full_name:'Molly McKernan',sex:'F'},
   {id:'male',full_name:'Male Swimmer',sex:'M'},
   {id:'no-t400',full_name:'No T400',sex:'F'},
   {id:'lcm-only',full_name:'LCM Only',sex:'F'}
  ],
  training_test_types:[{id:'t400-free',test_key:'t400_freestyle'}],
  training_test_results:[
   {id:'molly-old-fast',athlete_id:'molly',test_type_id:'t400-free',result_seconds:310,result_date:'2026-01-01',pool_course:'SCM',valid_for_anchor:true},
   {id:'molly-current',athlete_id:'molly',test_type_id:'t400-free',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true},
   {id:'molly-invalid-new',athlete_id:'molly',test_type_id:'t400-free',result_seconds:300,result_date:'2026-08-17',pool_course:'SCM',valid_for_anchor:false}
  ],
  coach_results:[
   {id:'molly100',athlete_id:'molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:60,result_date:'2026-07-01'},
   {id:'molly200',athlete_id:'molly',distance:200,stroke:'Freestyle',pool_course:'SCM',result_seconds:132,result_date:'2026-07-01'},
   {id:'male100',athlete_id:'male',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:52,result_date:'2026-07-01'},
   {id:'lcm100',athlete_id:'lcm-only',distance:100,stroke:'Freestyle',pool_course:'LCM',result_seconds:62,result_date:'2026-07-01'}
  ],
  course_conversions:[{id:'c100',from:'SCM',to:'LCM',distance:100,stroke:'Freestyle',seconds:1.7,source:'Swimming NZ official conversion table'}]
 }}
]})}
const t=()=>Targets.create({evidence:evidence()});

function firstSet(src,id=sessionId){return Truth.parse(src,id).blocks[0].items[0]}

test('current aerobic anchor is latest valid T400, not fastest historical T400',()=>{
 const r=t().t400('molly',{course:'SCM',stroke:'Freestyle'});assert.equal(r.status,'ok');assert.equal(r.seconds,324.6);assert.equal(r.date,'2026-08-12');assert.equal(r.row.id,'molly-current');
});

test('100 Threshold 10s uses current T400 coefficient and returns target plus practical deck cycle',()=>{
 const engine=t(),session=Truth.parse('Main set\n5 x 100 Free Threshold 10 sr',sessionId),item=session.blocks[0].items[0],r=engine.forItem(session,item,'molly');assert.equal(r.status,'ok');assert.equal(r.kind,'aerobic');assert(Math.abs(r.seconds-83.0976)<1e-9);assert.equal(r.sendOff,95);assert.equal(r.anchorSeconds,324.6);assert.equal(r.modelRest,10);assert(/Latest valid Freestyle T400/.test(r.source));
});

test('authored 30s rest selects 30-second aerobic coefficient rather than 10-second coefficient',()=>{
 const engine=t(),session=Truth.parse('Main set\n3 x 200 Free Development 30 sr',sessionId),item=session.blocks[0].items[0],r=engine.forItem(session,item,'molly'),expected=(324.6/2)*1.081;assert.equal(r.status,'ok');assert(Math.abs(r.seconds-expected)<1e-9);assert.equal(r.modelRest,30);assert.equal(r.authoredRest,30);
});

test('missing T400 is explicit and never replaced by a PB or fabricated target',()=>{
 const engine=t(),session=Truth.parse('Main set\n6 x 100 Free Development 10 sr',sessionId),r=engine.forItem(session,session.blocks[0].items[0],'no-t400');assert.equal(r.status,'missing');assert.equal(r.kind,'aerobic');assert(/No current Freestyle T400/.test(r.message));
});

test('Choice aerobic work suppresses automatic pace rather than guessing a stroke',()=>{
 const engine=t(),session=Truth.parse('Main set\n6 x 100 Choice Development 10 sr',sessionId),r=engine.forItem(session,session.blocks[0].items[0],'molly');assert.equal(r.status,'none');assert(/Choice/.test(r.reason));
});

test('coach target outranks all inferred target logic',()=>{
 const engine=t(),session=Truth.parse('Main set\n4 x 100 Free Threshold 10 sr',sessionId),item=session.blocks[0].items[0];item.targetSeconds=72.5;item.cycleSeconds=90;const r=engine.forItem(session,item,'molly');assert.deepEqual(r,{status:'ok',kind:'coach',seconds:72.5,sendOff:90,source:'Coach target'});
});

test('generic 25 at 100 pace derives from exact same-course PB',()=>{
 const engine=t(),session=Truth.parse('Main set\n4 x 25 Free @ 100 Pace',sessionId),r=engine.forItem(session,session.blocks[0].items[0],'molly');assert.equal(r.status,'ok');assert.equal(r.kind,'race');assert.equal(r.seconds,15);assert(/SCM 100 Freestyle PB/.test(r.source));
});

test('generic 50 at 200 pace derives from 200 PB, not 100 PB',()=>{
 const engine=t(),session=Truth.parse('Pre set\n3 x 50 Free\n2 Drill\n1 @ 200 Pace',sessionId),item=session.blocks[0].items[0],r=engine.forItem(session,item,'molly');assert.equal(r.status,'rep_race');assert.equal(r.rows.length,1);assert.equal(r.rows[0].rep,3);assert.equal(r.rows[0].status,'ok');assert.equal(r.rows[0].seconds,33);
});

test('#4 + #8 @100 pace in a child phase returns only those numbered targets',()=>{
 const engine=t(),session=Truth.parse(`Post set\n16 x 50 @ 1:15\n8 x 50 Bands Only\n4 Build\n4 Descend 1-4\n8 x 50 Swim\nDescend 1-4 twice\n#4 + #8 @ 100 Pace`,sessionId),parent=session.blocks[0].items[0],phase=parent.phases[1],r=engine.forPhase(session,parent,phase,'molly');assert.equal(r.status,'rep_race');assert.deepEqual(r.rows.map(x=>x.rep),[4,8]);assert.deepEqual(r.rows.map(x=>x.seconds),[30,30]);
});

test('aerobic rep-zone pattern produces one deterministic target row per rep',()=>{
 const engine=t(),session=Truth.parse('Main set\n6 x 100 Free 10 sr\n1 Reg / 1 Dev / 1 OL',sessionId),item=session.blocks[0].items[0],r=engine.forItem(session,item,'molly');assert.equal(r.status,'pattern');assert.equal(r.rows.length,6);assert.deepEqual(r.rows.map(x=>x.zone),['Regeneration','Development','Overload','Regeneration','Development','Overload']);assert(r.rows.every(x=>x.status==='ok'));
});

test('Male 100 Free first-50 John Pike segment model is retained',()=>{
 const engine=t(),session=Truth.parse('Main set\n1 x 50 Free @ 100 Pace First 50',sessionId),r=engine.forItem(session,session.blocks[0].items[0],'male');assert.equal(r.status,'ok');assert(Math.abs(r.seconds-(52*.4754))<1e-9);assert(/John Pike/.test(r.source));
});

test('Male 100 Free second-50 John Pike segment model is retained',()=>{
 const engine=t(),session=Truth.parse('Main set\n1 x 50 Free @ 100 Pace Second 50',sessionId),r=engine.forItem(session,session.blocks[0].items[0],'male');assert.equal(r.status,'ok');assert(Math.abs(r.seconds-(52*.5246))<1e-9);assert(/John Pike/.test(r.source));
});

test('unsupported named race segment returns target-needed instead of generic average',()=>{
 const engine=t(),session=Truth.parse('Main set\n1 x 50 Free @ 100 Pace First 50',sessionId),r=engine.forItem(session,session.blocks[0].items[0],'molly');assert.equal(r.status,'missing');assert(/Exact race-model segment not loaded/.test(r.message));
});

test('SCM PB converts to LCM race target only through loaded course-conversion evidence',()=>{
 const engine=t(),session=Truth.parse('Main set\n4 x 25 Free @ 100 Pace',{...sessionId,id:'lcm-session',course:'LCM'}),r=engine.forItem(session,session.blocks[0].items[0],'molly');assert.equal(r.status,'ok');assert(Math.abs(r.seconds-15.425)<1e-9);assert(/SCM PB → LCM/.test(r.source));
});

test('LCM-only PB can be converted back to SCM using inverse of the loaded SCM-to-LCM conversion',()=>{
 const engine=t(),session=Truth.parse('Main set\n4 x 25 Free @ 100 Pace',sessionId),r=engine.forItem(session,session.blocks[0].items[0],'lcm-only');assert.equal(r.status,'ok');assert(Math.abs(r.seconds-15.075)<1e-9);assert(/LCM PB → SCM/.test(r.source));
});

test('easy/reset work remains target-free',()=>{
 const engine=t(),session=Truth.parse('Main set\n400 Easy Reset',sessionId),r=engine.forItem(session,session.blocks[0].items[0],'molly');assert.equal(r.status,'none');assert(/Non-target/.test(r.reason));
});

test('Target Engine does not mutate canonical Session Truth or Evidence Retrieval',()=>{
 const ev=evidence(),engine=Targets.create({evidence:ev}),session=Truth.parse('Main set\n5 x 100 Free Threshold 10 sr',sessionId),beforeSession=JSON.stringify(session),beforeEvidence=JSON.stringify(ev.results('molly',{}));engine.forItem(session,session.blocks[0].items[0],'molly');assert.equal(JSON.stringify(session),beforeSession);assert.equal(JSON.stringify(ev.results('molly',{})),beforeEvidence);
});

if(fails){console.error(`\n${fails} Target Engine regression(s) failed`);process.exit(1)}
console.log('\nALL TARGET ENGINE REGRESSIONS PASS');
