'use strict';
const assert=require('assert');
const Entities=require('../engines/entity-registry.js');
const E=require('../engines/evidence-retrieval.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}

function sources(){return[
 {id:'current-local',priority:100,trust:'current',data:{
   athletes:[
     {id:'ath-mckenzie',full_name:'McKenzie Drage',squad:'National',active:true},
     {id:'ath-alexandra',full_name:'Alexandra Hanson',squad:'Development',active:true},
     {id:'ath-molly',full_name:'Molly McKernan',squad:'Development',active:true},
     {id:'ath-history',full_name:'Historical Swimmer',active:false}
   ],
   training_test_types:[{id:'tt-free',test_key:'t400_freestyle'}],
   training_test_results:[
     {id:'mk-current',athlete_id:'ath-mckenzie',test_type_id:'tt-free',result_seconds:450.1,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true},
     {id:'molly-new',athlete_id:'ath-molly',test_type_id:'tt-free',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true},
     {id:'hist-new',athlete_id:'ath-history',test_type_id:'tt-free',result_seconds:320,result_date:'2026-08-01',pool_course:'SCM',valid_for_anchor:true},
     {id:'hist-invalid',athlete_id:'ath-history',test_type_id:'tt-free',result_seconds:290,result_date:'2026-08-10',pool_course:'SCM',valid_for_anchor:false}
   ],
   coach_results:[
     {id:'molly-100-current',athlete_id:'ath-molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:64.2,result_date:'2026-07-01'},
     {id:'molly-200-current',athlete_id:'ath-molly',distance:200,stroke:'Freestyle',pool_course:'SCM',result_seconds:140.0,result_date:'2026-07-02'}
   ],
   course_conversions:[{from:'SCM',to:'LCM',distance:100,stroke:'Freestyle',seconds:1.7,source:'official table'}]
 }},
 {id:'legacy-cache',priority:20,trust:'legacy',data:{
   athletes:[
     {id:'old-mk',full_name:'McKenzie Drage'},
     {id:'old-alex',full_name:'Alex Hanson'},
     {id:'old-molly',full_name:'Molly McKernan'},
     {id:'old-hist',full_name:'Historical Swimmer'}
   ],
   trainingTestTypes:[{id:'legacy-tt',test_key:'t400_freestyle'}],
   trainingTestResults:[
     {id:'legacy-mk-copy',athlete_id:'old-mk',test_type_id:'legacy-tt',result_seconds:450.1,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true},
     {id:'molly-old',athlete_id:'old-molly',test_type_id:'legacy-tt',result_seconds:330.0,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true},
     {id:'hist-fast-old',athlete_id:'old-hist',test_type_id:'legacy-tt',result_seconds:300,result_date:'2026-01-01',pool_course:'SCM',valid_for_anchor:true},
     {id:'alex-t400',athlete_id:'old-alex',test_type_id:'legacy-tt',result_seconds:351.8,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true}
   ],
   results_event_history:[
     {id:'molly-100-legacy',athlete_id:'old-molly',distance:100,event_stroke:'Free',course:'SCM',result_seconds:63.8,result_date:'2026-03-01'},
     {id:'molly-100-lcm',athlete_id:'old-molly',distance:100,event_stroke:'Freestyle',course:'LCM',result_seconds:66.0,result_date:'2026-03-02'}
   ],
   results_pb_board:[
     {id:'molly-100-pb-copy',athlete_id:'old-molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:63.8,result_date:'2026-03-01'}
   ]
 }},
 {id:'official-conversions',priority:200,trust:'official',data:{courseConversions:[
   {from:'SCM',to:'LCM',distance:100,stroke:'Freestyle',seconds:1.7,source:'Swimming NZ official conversion table'}
 ]}}
]}
const aliases=[{canonicalName:'Alexandra Hanson',aliases:['Alex Hanson']}];
function evidence(src=sources(),aliasRows=aliases){const entities=Entities.create({sources:src,aliases:aliasRows});return E.create({sources:src,entities})}

test('same athlete is unified across source IDs by explicit name/alias identity',()=>{const e=evidence();assert.equal(e.resolveAthlete('McKenzie Drage').id,'ath-mckenzie');assert.equal(e.resolveAthlete('old-mk').id,'ath-mckenzie');assert.equal(e.resolveAthlete('Alex Hanson').id,'ath-alexandra');assert.equal(e.resolveAthlete('old-alex').id,'ath-alexandra')});
test('explicit alias can join Alex Hanson to Alexandra Hanson without fuzzy guessing',()=>{const e=evidence();const r=e.latestTrainingTest('ath-alexandra',{testKey:'t400_freestyle',course:'SCM'});assert(r);assert.equal(r.result_seconds,351.8);const noAlias=evidence(sources(),[]);assert.equal(noAlias.latestTrainingTest('ath-alexandra',{testKey:'t400_freestyle',course:'SCM'}),null)});
test('duplicate T400 fact is deduped while provenance retains both stores',()=>{const e=evidence();const rows=e.trainingTests('ath-mckenzie',{testKey:'t400_freestyle',course:'SCM'});assert.equal(rows.length,1);assert.deepEqual(new Set(rows[0]._evidence.sources),new Set(['current-local','legacy-cache']));assert.equal(rows[0]._evidence.source,'current-local')});
test('latest valid and fastest historical T400 are separate deterministic queries',()=>{const e=evidence();const latest=e.latestTrainingTest('ath-history',{testKey:'t400_freestyle',course:'SCM'}),fastest=e.fastestTrainingTest('ath-history',{testKey:'t400_freestyle',course:'SCM'});assert.equal(latest.result_seconds,320);assert.equal(latest.result_date,'2026-08-01');assert.equal(fastest.result_seconds,300);assert.equal(fastest.result_date,'2026-01-01')});
test('invalid-for-anchor row is excluded by latest/fastest default but remains queryable as evidence',()=>{const e=evidence();assert.equal(e.latestTrainingTest('ath-history',{testKey:'t400_freestyle'}).id,'hist-new');const all=e.trainingTests('ath-history',{testKey:'t400_freestyle',validOnly:false});assert(all.some(x=>x.id==='hist-invalid'));assert.equal(all.find(x=>x.id==='hist-invalid').result_seconds,290)});
test('most recent Molly T400 is returned with provenance',()=>{const e=evidence();const r=e.latestTrainingTestEvidence('Molly McKernan',{testKey:'t400_freestyle',course:'SCM'});assert.equal(r.status,'ok');assert.equal(r.seconds,324.6);assert.equal(r.date,'2026-08-12');assert(r.source.sources.includes('current-local'))});
test('missing training evidence is explicit rather than fabricated',()=>{const e=evidence();const r=e.latestTrainingTestEvidence('McKenzie Drage',{testKey:'t400_backstroke',course:'SCM'});assert.equal(r.status,'missing');assert.equal(r.row,null);assert(/No t400_backstroke/.test(r.message))});
test('PB query merges result stores and returns fastest like-for-like evidence',()=>{const e=evidence();const pb=e.personalBestEvidence('ath-molly',{distance:100,stroke:'Freestyle',course:'SCM'});assert.equal(pb.status,'ok');assert.equal(pb.seconds,63.8);assert.equal(pb.row.result_date,'2026-03-01');assert.deepEqual(new Set(pb.source.sources),new Set(['legacy-cache']))});
test('same PB fact duplicated across event history and PB board is deduped',()=>{const e=evidence();const rows=e.results('ath-molly',{distance:100,stroke:'Freestyle',course:'SCM'}).filter(x=>x.result_seconds===63.8);assert.equal(rows.length,1)});
test('course filter keeps SCM and LCM result evidence separate',()=>{const e=evidence();assert.equal(e.personalBest('ath-molly',{distance:100,stroke:'Freestyle',course:'SCM'}).result_seconds,63.8);assert.equal(e.personalBest('ath-molly',{distance:100,stroke:'Freestyle',course:'LCM'}).result_seconds,66.0)});
test('official conversion source wins duplicate conversion fact by priority and provenance is retained',()=>{const e=evidence();const c=e.conversion({from:'SCM',to:'LCM',distance:100,stroke:'Freestyle'});assert(c);assert.equal(c.seconds,1.7);assert.equal(c._evidence.source,'official-conversions');assert.deepEqual(new Set(c._evidence.sources),new Set(['official-conversions','current-local']))});
test('inactive athlete history remains retrievable because Evidence is not the active-roster owner',()=>{const e=evidence();assert.equal(e.resolveAthlete('Historical Swimmer').active,false);assert.equal(e.latestTrainingTest('Historical Swimmer',{testKey:'t400_freestyle'}).result_seconds,320)});
test('source input is cloned so later caller mutation cannot rewrite indexed evidence',()=>{const src=sources(),e=evidence(src);src[0].data.training_test_results.find(x=>x.id==='molly-new').result_seconds=999;assert.equal(e.latestTrainingTest('Molly McKernan',{testKey:'t400_freestyle'}).result_seconds,324.6)});
test('stats report indexed evidence without interpreting it',()=>{const e=evidence(),s=e.stats();assert.equal(s.sources,3);assert(s.athletes>=4);assert(s.trainingTests>=6);assert(s.raceResults>=4);assert.equal(s.courseConversions,1)});
test('Evidence Retrieval cannot start without an injected identity contract',()=>{assert.throws(()=>E.create({sources:sources()}),/injected Entity Registry/)});
if(fails){console.error(`\n${fails} Evidence Retrieval regression(s) failed`);process.exit(1)}console.log('\nALL EVIDENCE RETRIEVAL REGRESSIONS PASS');
