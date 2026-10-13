'use strict';
// Andy, 12 Oct 2026: "Tried to get Jordan set up -- didn't work." Live logs showed Jordan's phone never reached
// Supabase sign-in: the old path needed the Connection screen, an emailed code and a pasted 48-character code.
// Proves in a real browser (Supabase calls answered by route stubs -- this sandbox cannot reach it):
//  A. Creating an invite gives Andy a join LINK (copy / share), not a code to paste.
//  B. Opening the link on a fresh phone shows "Join McLay Swimming"; one tap signs in through the msos-coach-join
//     function (no email), accepts the invite with the existing RPC, and switches the phone to Assistant coach for
//     the invited squads. The link is removed from the address bar afterwards.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const TOKEN='d85abdd1759a4c2838b1c1d759d2a29a0bd07b42935eaad1';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    // A: owner creates the invite.
    {const ctx=await browser.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await ctx.route('**/*.supabase.co/**',r=>{const u=r.request().url();if(/rpc\/mclay_create_assistant_invite/.test(u))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{invite_token:TOKEN}])});return r.fulfill({status:200,contentType:'application/json',body:'[]'});});
      await page.goto(BASE);await page.waitForFunction(()=>window.MSOS4?.teamAccess?.joinLink&&window.MSOS4?.storageEngine?.ready,{timeout:20000});await page.waitForTimeout(500);
      const out=await page.evaluate(async t=>{const M=window.MSOS4;M.state.settings.organisationId='org-1';M.cloud.org=()=>'org-1';M.store.saveAuth({access_token:'owner',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'andy',email:'andymclay5@gmail.com'}});
        const row=await M.teamAccess.createInvite({email:'jordan1153@outlook.com',displayName:'Jordan',squads:['National']});return{token:row.invite_token,link:M.teamAccess.joinLink(row.invite_token)};},TOKEN);
      assert.equal(out.token,TOKEN);assert.match(out.link,new RegExp(`^http://127\\.0\\.0\\.1:8765/\\?coach_invite=${TOKEN}$`));
      assert.deepEqual(errors,[]);await ctx.close();}
    // B: Jordan opens the link on a fresh phone.
    {const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const calls=[];
      await ctx.route('**/*.supabase.co/**',r=>{const u=r.request().url(),body=r.request().postData()||'';calls.push(u.replace(/^https:\/\/[^/]+/,''));
        if(/functions\/v1\/msos-coach-join/.test(u)){assert.equal(JSON.parse(body).token,TOKEN);return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({email:'jordan1153@outlook.com',token_hash:'hash-1',display_name:'Jordan',assigned_squads:['National']})});}
        if(/auth\/v1\/verify/.test(u)){const b=JSON.parse(body);assert.equal(b.token_hash,'hash-1');return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'jordan-jwt',refresh_token:'jr',expires_in:3600,user:{id:'jordan-uid',email:'jordan1153@outlook.com'}})});}
        if(/rpc\/mclay_accept_assistant_invite/.test(u))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{organisation_id:'9d40beff-e632-414d-9daa-7ee78104ad2a',role:'assistant_coach',display_name:'Jordan',assigned_squads:['National'],permissions:{}}])});
        return r.fulfill({status:200,contentType:'application/json',body:'[]'});});
      await page.goto(`${BASE}?coach_invite=${TOKEN}`);
      await page.waitForSelector('[data-coach-join]',{timeout:20000});
      assert.match(await page.textContent('[data-coach-join]'),/Join McLay Swimming[\s\S]*assistant coach/);
      await page.tap('[data-coach-join-go]');
      await page.waitForFunction(()=>/Done — you're an assistant coach for National/.test(document.querySelector('[data-coach-join-status]')?.textContent||''),{timeout:15000});
      const st=await page.evaluate(()=>{const M=window.MSOS4;return{role:M.access.role(),squads:M.state.settings.assistantSquads,email:M.store.auth()?.user?.email,org:M.state.settings.organisationId,url:location.search};});
      assert.equal(st.role,'assistant');assert.deepEqual([...st.squads],['National']);assert.equal(st.email,'jordan1153@outlook.com');assert.equal(st.org,'9d40beff-e632-414d-9daa-7ee78104ad2a');
      assert.equal(st.url,'','the join link is cleared from the address bar');
      assert.ok(calls.some(c=>/functions\/v1\/msos-coach-join/.test(c))&&calls.some(c=>/auth\/v1\/verify/.test(c))&&calls.some(c=>/mclay_accept_assistant_invite/.test(c)),'no emailed code was needed');
      assert.ok(!calls.some(c=>/auth\/v1\/otp/.test(c)),'no email is sent');
      await page.tap('[data-coach-join-go]');await page.waitForTimeout(400);
      assert.equal(await page.evaluate(()=>window.MSOS4.state.settings.view),'board');
      assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.bottom-nav button')].some(b=>/Coach Hub/.test(b.textContent))),'Jordan has his Coach Hub');
      assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);await ctx.close();}
    console.log('COACH_JOIN_LINK_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
