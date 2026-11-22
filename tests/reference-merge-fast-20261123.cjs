'use strict';
// 23 Nov 2026 (freeze recorder, Andy's phone, 06:16 and 06:23: 34 seconds stuck on the Swimmers page, all of it in
// Matthew's performance page): engines/reference-authority.js compared every phone result row with every reference row
// (thousands x thousands, each looking up the roster) on every call, and the pathway asks for results many times.
// Proves the same rule (a phone row for a swimmer the reference data already has is left out; other swimmers' phone rows
// are kept) is worked out per swimmer identity, and the merged list is reused until a list changes.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({serviceWorkers:'block'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.refs?.sameAthleteReference,{timeout:30000});await p.waitForTimeout(500);
  const r=await p.evaluate(()=>{const M=window.MSOS4,E=window.MSOSEngines.Evidence;
    const ath=[];for(let i=0;i<75;i++)ath.push({id:'a'+i,full_name:`Swimmer${i} Family${i}`,squad:'National',active:true});M.state.athletes=ath;
    const heavy=[],local=[];for(let k=0;k<3000;k++){const x=ath[k%70];heavy.push({id:'h'+k,athlete_id:x.id,athlete_name:x.full_name,distance:[50,100,200,400][k%4],stroke:['Freestyle','Butterfly','Backstroke','Breaststroke','IM'][k%5],course:k%2?'SCM':'LCM',result_time_seconds:30+k%50})}
    for(let k=0;k<3000;k++){const x=ath[k%75];local.push({id:'l'+k,athlete_id:x.id,athlete_name:x.full_name,distance:[50,100,200,400][(k+1)%4],stroke:['Freestyle','Butterfly','Backstroke','Breaststroke','IM'][(k+2)%5],course:k%2?'LCM':'SCM',result_time_seconds:31+k%50})}
    M.refs.data.results_event_history=heavy;M.state.resultsEventHistory=local;
    let n=0;const orig=E.sameName;E.sameName=(...a)=>{n++;return orig(...a)};
    const t0=performance.now();const rows=M.refs.get('results_event_history');const ms=performance.now()-t0;const calls1=n;
    const again=M.refs.get('results_event_history');const calls2=n-calls1;
    M.state.resultsEventHistory=local.concat([{id:'new',athlete_id:'a74',athlete_name:ath[74].full_name,distance:1500,stroke:'Freestyle',course:'LCM',result_time_seconds:1000}]);const third=M.refs.get('results_event_history');
    E.sameName=orig;
    const by=id=>rows.filter(x=>x.athlete_id===id).map(x=>String(x.id)[0]);
    return{ms:Math.round(ms),calls1,calls2,same:again===rows,third:third.length-rows.length,a0:[...new Set(by('a0'))],a72:[...new Set(by('a72'))]};});
  assert.deepEqual(r.a0,['h'],'a swimmer in the reference data keeps only the reference rows: '+JSON.stringify(r));
  assert.deepEqual(r.a72,['l'],'a swimmer only on the phone keeps the phone rows');
  assert.ok(r.calls1<20000,'name comparisons are per swimmer, not per row pair: '+r.calls1);
  assert.equal(r.same,true,'the merged list is reused');assert.equal(r.calls2,0);
  assert.equal(r.third,1,'a new phone row is picked up when the list changes');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('REFERENCE_MERGE_FAST_PASS',JSON.stringify({ms:r.ms,calls:r.calls1}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
