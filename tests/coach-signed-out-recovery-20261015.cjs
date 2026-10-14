'use strict';
// Andy, 15 Oct 2026, 7:05am: "the session that I've written this morning did not make it to Jordan's phone ... even
// last night's session wasn't there. It just said no sessions here up on the top banner."
// Live cloud checked: this morning's session (and last night's) were saved and readable by Jordan's account, but his
// iPhone made NO request at all this morning -- the copy of MSOS he opened was not signed in and held none of his
// data (iPhone: Safari, the home-screen icon and a messaging app's built-in browser each keep their own sign-in).
// Jordan had already needed a new join link twice; the emailed code can't reach assistant coaches.
// Proves, in the real app:
//  1. a signed-out phone with no sessions says "Not signed in · tap to sign in" (not "No sessions yet");
//  2. tapping it opens a sign-in screen that works inside this copy of the app by pasting the join link;
//  3. a pasted link signs in, joins, and brings the squad's sessions straight in;
//  4. text that isn't a join link gets plain guidance, not an error;
//  5. a join link opened inside a messaging app's browser warns that the sign-in may not last;
//  6. a signed-in phone that has no sessions fetches them straight away.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
async function boot(browser,ua){const ctx=await browser.newContext({viewport:{width:390,height:844},...(ua?{userAgent:ua}:{})});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE,{waitUntil:'load'});await page.waitForFunction(()=>window.MSOS4?.teamAccess?.signInScreen&&window.MSOS4?.storageEngine?.ready&&document.querySelector('#sessionSelect'),{timeout:25000});await page.waitForTimeout(600);return{ctx,page,errors};}
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    // ---------- 1-4: Jordan's phone this morning: a fresh, signed-out copy ----------
    const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
    let{ctx,page,errors}=await boot(browser,IPHONE);
    const head=await page.evaluate(()=>{const M=window.MSOS4;M.store.saveAuth({});M.state.canonicalSessions={};M.state.settings.selectedSessionId='';M.ui.renderHeader();const p=document.querySelector('#sessionSelect');return{text:p.textContent,disabled:p.disabled};});
    assert.equal(head.text,'Not signed in · tap to sign in','a signed-out phone says so instead of "No sessions yet"');
    assert.equal(head.disabled,false,'and it can be tapped');
    await page.click('#sessionSelect');await page.waitForSelector('[data-coach-signin]');
    const screen=await page.textContent('[data-coach-signin]');
    assert.match(screen,/isn't signed in, so it can't get your squads' sessions/);
    assert.match(screen,/You're in Safari/,'tells the coach which copy of the app this is');
    // 4. not a link
    await page.fill('[data-coach-signin-link]','hello');await page.click('[data-coach-signin-go]');
    assert.match(await page.textContent('[data-coach-signin-status]'),/doesn't look like a join link[\s\S]*Copy/);
    // 3. paste the real link: the existing join function signs in, the invite is accepted, sessions arrive.
    const calls=await page.evaluate(()=>{const M=window.MSOS4,T=M.teamAccess,log=[];window.__calls=log;
      const realFetch=window.fetch;window.fetch=async(url,opts={})=>{const u=String(url);log.push(u.replace(/^https?:\/\/[^/]+/,''));
        const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json'}});
        if(/\/functions\/v1\/msos-coach-join/.test(u))return J({email:'jordan1153@outlook.com',token_hash:'h1',assigned_squads:['National']});
        if(/\/auth\/v1\/verify/.test(u))return J({access_token:'tok-j',refresh_token:'r-j',expires_in:3600,user:{id:'c17493ac',email:'jordan1153@outlook.com'}});
        if(/rpc\/mclay_accept_assistant_invite/.test(u))return J([{organisation_id:'9d40beff-e632-414d-9daa-7ee78104ad2a',role:'assistant_coach',display_name:'Jordan',assigned_squads:['National'],active:true}]);
        return realFetch(url,opts);};
      M.cloud.turnOnSync=async()=>({ok:true});M.cloud.pullTeamRoster=async()=>({athletes:0});
      M.cloud.pullTeamSessions=async()=>{const s=M.parser.parse('WARM UP\n400 Free\nMAIN SET\n8 x 100 Threshold 15sR',{id:'session-1mf9wif',date:'2026-10-15',dayPart:'AM',squads:['National','Development']});s.id='session-1mf9wif';s.identity={...s.identity,date:'2026-10-15',dayPart:'AM',squads:['National','Development']};M.state.canonicalSessions[s.id]=s;return{added:1,updated:0};};
      return true;});
    assert.ok(calls);
    await page.fill('[data-coach-signin-link]','Hi Jordan, here is your link https://andymclay5-web.github.io/McLay-Swimming-OS/?coach_invite=0123456789abcdef0123456789abcdef');
    await page.click('[data-coach-signin-go]');
    await page.waitForFunction(()=>/Done — signed in as jordan1153@outlook.com/.test(document.querySelector('[data-coach-signin-status]')?.textContent||''),{timeout:8000});
    const after=await page.evaluate(()=>{const M=window.MSOS4;return{signedIn:M.teamAccess.isSignedIn(),role:M.access.role(),squads:M.state.settings.assistantSquads,joinCalled:window.__calls.some(c=>/msos-coach-join/.test(c)),status:document.querySelector('[data-coach-signin-status]').textContent};});
    assert.equal(after.signedIn,true,'pasting the link signs this copy in');
    assert.equal(after.role,'assistant');assert.deepEqual(after.squads,['National']);
    assert.ok(after.joinCalled,'uses the same join function as the link');
    assert.match(after.status,/Keep opening MSOS from Safari/,'tells the coach to keep opening MSOS the same way');
    await page.click('[data-coach-signin-go]');await page.waitForTimeout(300);
    const h2=await page.evaluate(()=>{const M=window.MSOS4;M.ui.renderHeader();return{text:document.querySelector('#sessionSelect').textContent,allowed:Object.values(M.state.canonicalSessions).filter(x=>M.access.sessionAllowed(x)).map(x=>x.id)};});
    assert.deepEqual(h2.allowed,['session-1mf9wif'],"this morning's session is on the phone and Jordan can see it");
    assert.equal(h2.text,'Select session','ready to pick from the calendar (the app never picks a session on its own)');
    assert.deepEqual(errors,[],errors.join('\n'));await ctx.close();

    // ---------- 5: join link opened inside a messaging app's browser ----------
    ({ctx,page,errors}=await boot(browser,IPHONE.replace('Safari/604.1','[FBAN/MessengerForiOS;FBAV/450.0]')));
    await page.evaluate(()=>window.MSOS4.teamAccess.joinScreen('0123456789abcdef0123456789abcdef'));
    assert.match(await page.textContent('[data-coach-join]'),/opened inside[\s\S]*may not last[\s\S]*Open in Safari/,'warns that an in-app browser sign-in may not last');
    await ctx.close();

    // ---------- 6: signed in but nothing on the phone yet -> fetch now ----------
    ({ctx,page,errors}=await boot(browser));
    const pulled=await page.evaluate(async()=>{const M=window.MSOS4;M.store.saveAuth({access_token:'t',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600});M.state.canonicalSessions={};M.state.settings.selectedSessionId='';
      let n=0;M.cloud.ready=()=>true;M.cloud.pullTeamRoster=async()=>({});M.cloud.pullTeamSessions=async()=>{n++;return{added:0};};M._emptyPullAt=0;M.ui.renderHeader();await new Promise(r=>setTimeout(r,200));M.ui.renderHeader();await new Promise(r=>setTimeout(r,200));
      return{n,text:document.querySelector('#sessionSelect').textContent};});
    assert.equal(pulled.n,1,'a signed-in phone with no sessions fetches them straight away (once, not on every redraw)');
    assert.equal(pulled.text,'No sessions yet');
    await ctx.close();
    console.log('COACH_SIGNED_OUT_RECOVERY_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
