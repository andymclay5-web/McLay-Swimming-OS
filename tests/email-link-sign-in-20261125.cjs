'use strict';
// 25 Nov 2026 (Andy signing in on the PC: the email held a "Sign in" link, which opened andymclay5-web.github.io -- a
// 404 -- because the app never said where to come back to, and the app only understood a typed code). Proves:
//  - "Send sign-in code" asks Supabase to send the link back to this page;
//  - opening the app with the link's #access_token signs this copy in (saved like a typed code) and clears the address;
//  - an expired link says so and signs nothing in.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const ctx=await b.newContext({serviceWorkers:'block'});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  const otp=[];let userOk=true;
  await ctx.route(/\/auth\/v1\/otp/,r=>{otp.push(r.request().url());return r.fulfill({json:{}})});
  await ctx.route(/\/auth\/v1\/user/,r=>userOk?r.fulfill({json:{id:'048dd1ac-0fea-4b7b-b5bc-eeec00abcb8b',email:'andy@example.com'}}):r.fulfill({status:401,json:{msg:'expired'}}));
  await ctx.route(/\/rest\/v1\//,r=>r.fulfill({json:[]}));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.teamAccess?.sendSignInCode&&window.MSOS4?.storageEngine?.ready,{timeout:30000});
  await p.evaluate(()=>window.MSOS4.teamAccess.sendSignInCode('andy@example.com'));
  assert.equal(otp.length,1);assert.equal(new URL(otp[0]).searchParams.get('redirect_to'),new URL(BASE).origin+new URL(BASE).pathname,'the link comes back to this page: '+otp[0]);
  // the link opens a fresh page (as it does from the email)
  const p2=await ctx.newPage();p2.on('pageerror',e=>errors.push(e.message));
  await p2.goto(BASE+'#access_token=tok123&expires_in=3600&refresh_token=ref456&token_type=bearer&type=magiclink');
  await p2.waitForFunction(()=>window.MSOS4?.store?.auth?.()?.access_token==='tok123',null,{timeout:15000});
  const a=await p2.evaluate(()=>({auth:window.MSOS4.store.auth(),hash:location.hash}));
  assert.equal(a.auth.refresh_token,'ref456');assert.equal(a.auth.user.email,'andy@example.com');assert.ok(a.auth.expires_at>Date.now()/1000);
  assert.doesNotMatch(a.hash,/access_token/,'the token is cleared from the address bar: '+a.hash);
  // expired link
  await p2.evaluate(()=>window.MSOS4.store.saveAuth(null));userOk=false;await p2.close();
  const p3=await ctx.newPage();await p3.goto(BASE+'#access_token=old&expires_in=3600&refresh_token=x');await p3.waitForFunction(()=>window.MSOS4?.storageEngine?.ready,{timeout:30000});await p3.waitForTimeout(2500);
  assert.equal(await p3.evaluate(()=>window.MSOS4.store.auth()?.access_token||''),'','an expired link signs nothing in');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('EMAIL_LINK_SIGN_IN_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
