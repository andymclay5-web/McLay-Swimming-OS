'use strict';
// Andy, Thu 12 Nov 2026: "How come I'm not seeing results from nzsc champs show up on swimmers info". The 104 NZ Short
// Course Champs swims were in the cloud (imported 19 Oct), but results_event_history has 3,216 rows and the cloud returns at
// most 1,000 per request (Content-Range 0-999), so the phone only ever saw an arbitrary third. Evidence is read in pages, in a
// fixed order, newest first.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));const asked=[];
  const history=Array.from({length:3216},(_,i)=>({result_id:`r${String(i).padStart(5,'0')}`,organisation_id:ORG,athlete_id:i<100?'charlotte':'a'+(i%60),full_name:'x',result_date:i<100?'2026-09-28':'2024-01-01',meet_name:i<100?'2026 New Zealand Short Course Championships':'Old meet',course:'SCM',distance:100,stroke:'Backstroke',result_time_seconds:120+i/100,result_time_text:'2:00.00'}));
  // stored oldest first, so an unpaged read never reaches the NZ Champs rows
  const stored=[...history].reverse();
  await p.route(/\/rest\/v1\//,route=>{const u=new URL(route.request().url());if(!/results_event_history|results_pb_board|coach_results/.test(u.pathname))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    asked.push(u.pathname+u.search);let rows=/results_event_history/.test(u.pathname)?stored:[];
    if(u.searchParams.get('order')?.startsWith('result_date.desc'))rows=[...rows].sort((x,y)=>y.result_date.localeCompare(x.result_date)||x.result_id.localeCompare(y.result_id));
    const off=+(u.searchParams.get('offset')||0),lim=Math.min(1000,+(u.searchParams.get('limit')||1000));
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rows.slice(off,off+lim))});});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.cloud?.pullEvidence,{timeout:30000});await p.waitForTimeout(400);
  const r=await p.evaluate(async ORG=>{const M=window.MSOS4;M.store.saveAuth({access_token:'t',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-andy'}});M.state.settings.organisationId=ORG;
    const out=await M.cloud.pullEvidence();const h=out.tables.results_event_history||[];
    return{n:h.length,nzsc:h.filter(x=>/New Zealand Short Course/.test(x.meet_name)).length,first:h[0]?.result_date,errors:out.errors};},ORG);
  assert.equal(r.n,3216,`every row, not the first 1,000: ${JSON.stringify(r)}`);assert.equal(r.nzsc,100);assert.equal(r.first,'2026-09-28','newest first');assert.deepEqual(r.errors,{});
  assert.ok(asked.some(x=>/results_event_history.*offset=3000/.test(x)),'read in pages');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('EVIDENCE_PAGES_PAST_1000_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
