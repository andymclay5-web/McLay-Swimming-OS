'use strict';
// 25 Nov 2026 (Andy on the PC: the emailed link wouldn't take, then Supabase refused more emails -- "just set me up with
// a password"). Proves Coach Hub > Coaches & devices signs in with email + password (no email needed), a wrong password
// says so plainly, and a signed-in coach can change the password.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  const seen=[];
  await ctx.route(/\/auth\/v1\/token\?grant_type=password/,r=>{const d=JSON.parse(r.request().postData());seen.push(['token',d.email]);return d.password==='right-pass-1'?r.fulfill({json:{access_token:'tokA',refresh_token:'refA',expires_in:3600,user:{id:'048dd1ac-0fea-4b7b-b5bc-eeec00abcb8b',email:d.email}}}):r.fulfill({status:400,json:{error_description:'Invalid login credentials'}})});
  await ctx.route(/\/auth\/v1\/user/,r=>{if(r.request().method()==='PUT'){seen.push(['put',JSON.parse(r.request().postData()).password,r.request().headers().authorization]);return r.fulfill({json:{id:'x'}})}return r.fulfill({json:{id:'048dd1ac-0fea-4b7b-b5bc-eeec00abcb8b',email:'andymclay5@gmail.com'}})});
  await ctx.route(/\/rest\/v1\//,r=>r.fulfill({json:[]}));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.teamAccess?.signInWithPassword,{timeout:30000});
  await p.evaluate(()=>window.MSOS4.navigationEngine?.go?.('connection')||window.MSOS4.nav?.show?.('connection'));await p.waitForSelector('#teamPasswordSignInBtn',{timeout:10000});
  await p.fill('#teamSignInEmail','AndyMcLay5@gmail.com');await p.fill('#teamSignInPassword','wrong');await p.click('#teamPasswordSignInBtn');
  await p.waitForFunction(()=>/don't match/.test(document.querySelector('#teamAuthStatus')?.textContent||''),null,{timeout:5000});
  assert.equal(await p.evaluate(()=>window.MSOS4.store.auth()?.access_token||''),'','a wrong password signs nothing in');
  await p.fill('#teamSignInPassword','right-pass-1');await p.click('#teamPasswordSignInBtn');
  await p.waitForFunction(()=>window.MSOS4.store.auth()?.access_token==='tokA',null,{timeout:5000});
  assert.deepEqual(seen.filter(x=>x[0]==='token').map(x=>x[1]),['andymclay5@gmail.com','andymclay5@gmail.com'],'email lower-cased');
  await p.waitForSelector('#teamChangePasswordBtn',{timeout:5000});await p.fill('#teamNewPassword','short');await p.click('#teamChangePasswordBtn');
  await p.waitForFunction(()=>/8 characters/.test(document.querySelector('#teamAuthStatus')?.textContent||''),null,{timeout:5000});
  await p.fill('#teamNewPassword','a-new-pass-9');await p.click('#teamChangePasswordBtn');await p.waitForFunction(()=>/Password changed/.test(document.querySelector('#teamAuthStatus')?.textContent||''),null,{timeout:5000});
  const put=seen.find(x=>x[0]==='put');assert.deepEqual(put,['put','a-new-pass-9','Bearer tokA']);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('PASSWORD_SIGN_IN_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
