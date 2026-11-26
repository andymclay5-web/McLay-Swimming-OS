'use strict';
// 27 Nov 2026 (Andy, 5:21 am, photo: "Not sent to the cloud · 34 waiting · 12 min"). His password change on the PC had
// signed the phone out; every cloud call retried the dead sign-in -- 30+ renewals a second, then Supabase rate-limited
// the phone. Proves: many callers at once make one renewal; a sign-in the cloud has ended is not retried; the phone says
// "Signed out" and the tap opens sign-in; signing in again clears it. Nothing waiting is dropped.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  const renewals=[];
  await ctx.route(/\/auth\/v1\/token\?grant_type=refresh_token/,r=>{renewals.push(JSON.parse(r.request().postData()).refresh_token);return r.fulfill({status:400,json:{code:400,error_code:'refresh_token_not_found',msg:'Invalid Refresh Token: Refresh Token Not Found'}})});
  await ctx.route(/\/auth\/v1\/token\?grant_type=password/,r=>r.fulfill({json:{access_token:'newA',refresh_token:'newR',expires_in:3600,user:{id:'048dd1ac-0fea-4b7b-b5bc-eeec00abcb8b',email:'andymclay5@gmail.com'}}}));
  await ctx.route(/\/auth\/v1\/user/,r=>r.fulfill({json:{id:'048dd1ac-0fea-4b7b-b5bc-eeec00abcb8b',email:'andymclay5@gmail.com'}}));
  await ctx.route(/\/rest\/v1\//,r=>r.fulfill({status:401,json:{message:'JWT expired'}}));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.cloudSessionEngine?.isSignedOut&&window.MSOS4?.teamAccess?.signInWithPassword,{timeout:30000});await p.waitForTimeout(800);
  const r=await p.evaluate(async()=>{const M=window.MSOS4,S=M.cloudSessionEngine;
    M.store.saveAuth({access_token:'old.eyJleHAiOjF9.x',refresh_token:'deadR',expires_at:1,user:{id:'048dd1ac-0fea-4b7b-b5bc-eeec00abcb8b'}});
    const cfg=M.store.config();if(!cfg.supabaseUrl)throw new Error('no cloud config in this build');
    M.state.pending=Array.from({length:34},(_,i)=>({id:'pq'+i,table:'session_notes',op:'upsert',record:{id:'n'+i},at:new Date().toISOString()}));
    const all=await Promise.allSettled(Array.from({length:25},()=>S.ensureFresh()));
    const later=await Promise.allSettled([S.ensureFresh(),S.ensureFresh({force:true})]);
    M.cloud.renderSyncWarn();
    return{rejected:all.filter(x=>x.status==='rejected').length,laterCodes:later.map(x=>x.reason?.code),out:S.isSignedOut(),pending:M.state.pending.length,warn:document.getElementById('cloudSyncWarn')?.textContent||''};});
  assert.equal(renewals.length,1,'25 callers at once -> one renewal: '+renewals.length);
  assert.equal(r.rejected,25);assert.deepEqual(r.laterCodes,['signed_out','signed_out'],'an ended sign-in is not retried');
  assert.equal(renewals.length,1,'still one renewal');
  assert.ok(r.out);assert.equal(r.pending,34,'nothing waiting is dropped');
  assert.match(r.warn,/Signed out on this phone · 34/,r.warn);
  await p.click('#cloudSyncWarn');await p.waitForSelector('#teamSignInPassword',{state:'visible',timeout:8000});
  await p.fill('#teamSignInEmail','andymclay5@gmail.com');await p.fill('#teamSignInPassword','new-pass-1');await p.click('#teamPasswordSignInBtn');
  await p.waitForFunction(()=>window.MSOS4.store.auth()?.refresh_token==='newR',null,{timeout:8000});
  assert.equal(await p.evaluate(()=>window.MSOS4.cloudSessionEngine.isSignedOut()),false,'signing in again clears it');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('SIGNED_OUT_NO_RENEWAL_STORM_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
